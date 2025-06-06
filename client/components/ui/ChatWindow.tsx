"use client"

import React, { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardFooter } from "./card"
import { ScrollArea } from "./scroll-area"
import { User, Bot, ChevronDown, ChevronUp, Send, Info, Brain, Settings, CheckCircle } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "./radio-group"
import { Checkbox } from "./checkbox"
import { Label } from "./label"
import { Button } from "./button"
import { Separator } from "./separator"
import { cn } from "../../lib/utils"
import { Message } from "../../types/chat"
import { registerChatVisibility } from "../../utils/chatUtils"
import { process_user_requirements, storeChatData } from "../graph/userRequirements"

interface ChatWindowProps {
  messages: Message[]
  isMinimized?: boolean
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages: propMessages, isMinimized: propIsMinimized = false }) => {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string | string[]>>({})
  const [isMinimized, setIsMinimized] = useState(propIsMinimized)
  const [dropdownStates, setDropdownStates] = useState<Record<string, boolean>>({})
  const [streamingMessages, setStreamingMessages] = useState<Record<string, { content: string; isStreaming: boolean; currentFunction?: string }>>({})
  const chatWindowRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [localMessages, setLocalMessages] = useState<Message[]>(propMessages)

  // Use messages from props instead of sample messages
  const messages = propMessages || [];

  // Auto-scroll to bottom when new messages arrive or when streaming updates
  useEffect(() => {
    if (messagesEndRef.current && !isMinimized) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isMinimized, streamingMessages]);

  // Listen for streaming message updates
  useEffect(() => {
    const handleStreamingUpdate = (event: CustomEvent) => {
      const { messageId, streamedContent, isStreaming, currentFunction } = event.detail;
      setStreamingMessages(prev => ({
        ...prev,
        [messageId]: { content: streamedContent, isStreaming, currentFunction }
      }));
    };

    document.addEventListener('updateStreamingMessage', handleStreamingUpdate as EventListener);
    
    return () => {
      document.removeEventListener('updateStreamingMessage', handleStreamingUpdate as EventListener);
    };
  }, []);

  // Register chat visibility with chatUtils on mount
  useEffect(() => {
    console.log('🔧 Registering chat visibility setter');
    registerChatVisibility((visible: boolean) => {
      console.log('📺 Setting chat visibility to:', visible);
      setIsMinimized(!visible);
    });
  }, []);

  // Add effect to auto-close on process complete
  useEffect(() => {
    const hasProcessComplete = localMessages.some(m => m.type === 'process-complete');
    if (hasProcessComplete) {
      const timer = setTimeout(() => {
        setIsMinimized(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [localMessages]);

  const handleRadioChange = (questionId: string, value: string) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [questionId]: value,
    }))
  }

  const handleCheckboxChange = (questionId: string, optionId: string, checked: boolean) => {
    setSelectedOptions((prev) => {
      const currentSelections = (prev[questionId] as string[]) || []

      if (checked) {
        return {
          ...prev,
          [questionId]: [...currentSelections, optionId],
        }
      } else {
        return {
          ...prev,
          [questionId]: currentSelections.filter((id) => id !== optionId),
        }
      }
    })
  }

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized)
  }

  const handleProcessClick = () => {
    console.log('🔄 Process button clicked - collecting conversation data');
    
    // Send single processing message to real-time agent
    if (window.realtimeAgentSendTextMessage && typeof window.realtimeAgentSendTextMessage === 'function') {
      window.realtimeAgentSendTextMessage("Processing please wait...");
    }
    
    // Store chat data for the StreamExecutor to use
    storeChatData(messages, selectedOptions);
    
    // Collect conversation history for logging
    const conversationHistory = messages.map(message => ({
      id: message.id,
      content: message.content,
      sender: message.sender,
      type: message.type,
      question: message.question,
      timestamp: new Date().toISOString()
    }));
    
    // Collect selected values from questions
    const selectedAnswers = Object.entries(selectedOptions).map(([questionId, answer]) => {
      const question = messages.find(m => m.id === questionId);
      return {
        questionId,
        questionText: question?.question || question?.content,
        selectedAnswer: answer,
        questionType: question?.type
      };
    });
    
    // Prepare data for reasoning agent
    const processingData = {
      conversationHistory,
      selectedAnswers,
      timestamp: new Date().toISOString(),
      totalMessages: messages.length,
      totalQuestions: selectedAnswers.length
    };
    
    console.log('📊 Collected processing data:', processingData);
    
    // Call the actual process_user_requirements function which triggers StreamViewer
    try {
      const result = process_user_requirements();
      console.log('✅ Processing initiated:', result);
      
      // Add a system message to show processing started
      const processingMessage = {
        id: crypto.randomUUID(),
        content: `Processing ${conversationHistory.length} messages and ${selectedAnswers.length} answers via StreamViewer...`,
        sender: 'system' as const
      };
      
      // Dispatch event to add processing message
      const addMessageEvent = new CustomEvent('addChatMessage', {
        detail: { message: processingMessage }
      });
      document.dispatchEvent(addMessageEvent);
      
    } catch (error) {
      console.error('❌ Error processing requirements:', error);
      
      // Add error message to chat
      const errorMessage = {
        id: crypto.randomUUID(),
        content: `Error processing requirements: ${error?.message || 'Unknown error'}`,
        sender: 'system' as const
      };
      
      const addErrorEvent = new CustomEvent('addChatMessage', {
        detail: { message: errorMessage }
      });
      document.dispatchEvent(addErrorEvent);
    }
  };

  // Function to handle process complete action
  const handleProcessComplete = () => {
    console.log('✅ Process complete - closing chat window');
    setIsMinimized(true);
  };

  // Function to toggle dropdown for reasoning/function messages
  const toggleDropdown = (messageId: string) => {
    setDropdownStates(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  // Reasoning animation component
  const ReasoningAnimation = () => (
    <div className="flex items-center gap-2">
      <Brain className="w-4 h-4 text-blue-500 animate-pulse" />
      <div className="flex gap-1">
        <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
        <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
        <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
      </div>
    </div>
  );

  // Function calling animation component
  const FunctionAnimation = () => (
    <div className="flex items-center gap-2">
      <Settings className="w-4 h-4 text-green-500 animate-spin" />
      <div className="flex gap-1">
        <div className="w-1 h-1 bg-green-500 rounded-full animate-ping" style={{ animationDelay: '0ms' }}></div>
        <div className="w-1 h-1 bg-green-500 rounded-full animate-ping" style={{ animationDelay: '200ms' }}></div>
        <div className="w-1 h-1 bg-green-500 rounded-full animate-ping" style={{ animationDelay: '400ms' }}></div>
      </div>
    </div>
  );

  return (
    <div className="pointer-events-auto" ref={chatWindowRef} data-chat-window>
      {/* Chat Header - Always visible */}
      <div
        className={cn(
          "flex items-center justify-between bg-white border border-gray-200 rounded-t-lg px-4 py-2 w-96 cursor-pointer",
          isMinimized && "rounded-b-lg shadow-md",
        )}
        onClick={toggleMinimize}
      >
        <span className="text-sm font-medium">Chat</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          data-minimize-chat
          aria-expanded={!isMinimized}
          onClick={(e) => {
            e.stopPropagation()
            toggleMinimize()
          }}
        >
          {isMinimized ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
      </div>

      {/* Chat Content - Visible only when not minimized */}
      {!isMinimized && (
        <Card className="w-96 max-h-[70vh] rounded-t-none shadow-md flex flex-col">
          <CardContent className="p-0 flex-1 flex flex-col min-h-0">
            <div className="flex-1 px-6 overflow-y-auto" style={{ maxHeight: '50vh' }}>
              <div className="flex flex-col gap-4 py-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-gray-500">
                    <p className="text-sm">No messages yet. Start a conversation!</p>
                  </div>
                ) : (
                  <>
                {messages.map((message) => (
                  <div key={message.id} className="flex items-start gap-3">
                    {message.sender === "user" ? (
                      <User className="w-6 h-6 mt-1 text-black" />
                    ) : message.sender === "assistant" ? (
                      <Bot className="w-6 h-6 mt-1 text-black" />
                    ) : (
                          <User className="w-6 h-6 mt-1 text-blue-500" />
                        )}

                        {message.type === "reasoning" ? (
                          <div className="rounded-lg px-4 py-3 bg-blue-50 border border-blue-200 max-w-[90%] w-full" data-message-id={message.id}>
                            <div 
                              className="flex items-center justify-between cursor-pointer mb-2 sticky top-0 bg-blue-50 py-1 z-10"
                              onClick={() => toggleDropdown(message.id)}
                            >
                              <div className="flex items-center gap-2">
                                <ReasoningAnimation />
                                <span className="text-sm font-medium text-blue-700">
                                  {(streamingMessages[message.id]?.isStreaming ?? message.isStreaming) ? 'Reasoning...' : 'Reasoning Complete'}
                                </span>
                              </div>
                              <ChevronDown className={cn(
                                "h-4 w-4 text-blue-500 transition-transform",
                                (dropdownStates[message.id] ?? message.isDropdownOpen ?? true) ? "rotate-180" : ""
                              )} />
                            </div>
                            {(dropdownStates[message.id] ?? message.isDropdownOpen ?? true) && (
                              <div className="text-xs text-blue-600 font-mono whitespace-pre-wrap overflow-y-auto" style={{ maxHeight: '300px' }}>
                                <div className="space-y-2">
                                  {(streamingMessages[message.id]?.content || message.streamedContent || message.content)
                                    .split('\n\n')
                                    .filter(para => para.trim())
                                    .map((paragraph, idx) => (
                                      <p key={idx} className="leading-relaxed">
                                        {paragraph}
                                      </p>
                                    ))}
                                </div>
                                {(streamingMessages[message.id]?.isStreaming ?? message.isStreaming) && (
                                  <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1"></span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : message.type === "function-calling" ? (
                          <div className="rounded-lg px-4 py-3 bg-green-50 border border-green-200 max-w-[90%] w-full" data-message-id={message.id}>
                            <div 
                              className="flex items-center justify-between cursor-pointer mb-2 sticky top-0 bg-green-50 py-1 z-10"
                              onClick={() => toggleDropdown(message.id)}
                            >
                              <div className="flex items-center gap-2">
                                <FunctionAnimation />
                                <span className="text-sm font-medium text-green-700">
                                  {(streamingMessages[message.id]?.isStreaming ?? message.isStreaming) 
                                    ? `Function: ${streamingMessages[message.id]?.currentFunction || 'calling...'}`
                                    : `Function: ${streamingMessages[message.id]?.currentFunction || 'complete'}`}
                                </span>
                              </div>
                              <ChevronDown className={cn(
                                "h-4 w-4 text-green-500 transition-transform",
                                (dropdownStates[message.id] ?? message.isDropdownOpen ?? false) ? "rotate-180" : ""
                              )} />
                            </div>
                            {(dropdownStates[message.id] ?? message.isDropdownOpen ?? false) && (
                              <div className="text-xs text-green-600 font-mono whitespace-pre-wrap overflow-y-auto" style={{ maxHeight: '300px' }}>
                                <div className="space-y-1">
                                  {(streamingMessages[message.id]?.content || message.streamedContent || message.content)
                                    .split('\n')
                                    .filter(line => line.trim())
                                    .map((line, idx) => (
                                      <div key={idx} className="leading-relaxed">
                                        {line}
                                      </div>
                                    ))}
                                </div>
                                {(streamingMessages[message.id]?.isStreaming ?? message.isStreaming) && (
                                  <span className="inline-block w-2 h-4 bg-green-500 animate-pulse ml-1"></span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : message.type === "process-complete" ? (
                          <div className="rounded-lg px-4 py-3 bg-green-50 border border-green-200 max-w-[90%] w-full">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle className="w-5 h-5 text-green-500" />
                              <span className="text-sm font-medium text-green-700">Architecture Processing Complete!</span>
                            </div>
                            <p className="text-xs text-green-600">
                              Your architecture has been successfully generated. You can now view it in the main canvas.
                            </p>
                          </div>
                        ) : message.type === "radio-question" ? (
                      <div className="rounded-lg px-4 py-3 bg-white border border-gray-200 max-w-[80%] w-full">
                        <p className="text-sm mb-2">{message.question}</p>
                        <Separator className="my-2" />
                        <RadioGroup
                          value={selectedOptions[message.id] as string}
                          onValueChange={(value) => handleRadioChange(message.id, value)}
                          className="mt-3"
                        >
                          {message.options?.map((option) => (
                            <div key={option.id} className="flex items-center space-x-2 mb-2">
                              <RadioGroupItem value={option.id} id={option.id} />
                              <Label htmlFor={option.id} className="text-sm">
                                {option.text}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                    ) : message.type === "checkbox-question" ? (
                      <div className="rounded-lg px-4 py-3 bg-white border border-gray-200 max-w-[80%] w-full">
                        <p className="text-sm mb-2">{message.question}</p>
                        <Separator className="my-2" />
                        <div className="mt-3">
                          {message.options?.map((option) => (
                            <div key={option.id} className="flex items-center space-x-2 mb-2">
                              <Checkbox
                                id={option.id}
                                checked={((selectedOptions[message.id] as string[]) || []).includes(option.id)}
                                onCheckedChange={(checked) =>
                                  handleCheckboxChange(message.id, option.id, checked as boolean)
                                }
                              />
                              <Label htmlFor={option.id} className="text-sm">
                                {option.text}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className={cn(
                        "rounded-lg px-4 py-3 border max-w-[80%]",
                        message.sender === "system" 
                          ? "bg-blue-50 border-blue-200 text-xs font-mono" 
                          : "bg-white border-gray-200"
                      )}>
                        <p className={cn(
                          "text-sm", 
                          message.sender === "system" && "whitespace-pre-wrap"
                        )}>
                          {message.content}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
                    {/* Invisible element to scroll to */}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
            </div>
          </CardContent>

          {/* Footer Bar */}
          <CardFooter className="border-t p-2 bg-gray-50 flex-shrink-0">
            <Button
              onClick={handleProcessClick}
              style={{
                background: "#000",
              }}
              className="w-full h-12 rounded-lg border-2 border-black text-white hover:bg-gray-800 flex items-center justify-center"
            >
              <Send className="h-6 w-6 mr-2" />
              Process
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}

export default ChatWindow
