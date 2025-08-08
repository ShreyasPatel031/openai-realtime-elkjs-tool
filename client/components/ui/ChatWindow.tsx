"use client"

import React, { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "./card"
import { ScrollArea } from "./scroll-area"
import { User, Bot, ChevronDown, ChevronUp, MoreHorizontal, Brain, Settings, CheckCircle } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "./radio-group"
import { Checkbox } from "./checkbox"
import { Label } from "./label"
import { Separator } from "./separator"
import { cn } from "../../lib/utils"
import { Message } from "../../types/chat"
import { registerChatVisibility } from "../../utils/chatUtils"

interface ChatWindowProps {
  messages: Message[]
  isMinimized?: boolean
}

const MessagePill = ({ 
  type, 
  content, 
  isStreaming = false, 
  isExpanded = false, 
  onToggle,
  functionName
}: { 
  type: 'user' | 'reasoning' | 'function' | 'complete' | 'question';
  content: string;
  isStreaming?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  functionName?: string;
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom right of content when streaming
  useEffect(() => {
    if (isStreaming && isExpanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
      contentRef.current.scrollLeft = contentRef.current.scrollWidth;
    }
  }, [content, isStreaming, isExpanded]);

  const getIcon = () => {
    const iconClass = "w-4 h-4 text-gray-900";
    
    switch (type) {
      case 'user':
        return <User className={iconClass} />;
      case 'reasoning':
        return <Brain className={iconClass} />;
      case 'function':
        return <Settings className={iconClass} />;
      case 'complete':
        return <CheckCircle className={iconClass} />;
      default:
        return <Bot className={iconClass} />;
    }
  };

  const getPillText = () => {
    switch (type) {
      case 'user':
        return 'You';
      case 'reasoning':
        return isStreaming ? 'Thinking...' : 'Reasoning';
      case 'function':
        return isStreaming ? 'Processing...' : functionName || 'Function Call';
      case 'complete':
        return 'Complete';
      default:
        return 'Assistant';
    }
  };

  const canToggle = type === 'reasoning' || type === 'function';

  return (
    <div className="mb-2 w-full"> {/* Fixed width container */}
      <div 
        className={cn(
          "flex items-center justify-between h-12 px-4 bg-gray-100 border border-gray-200 rounded-lg w-full", // Full width pill header
          canToggle && "cursor-pointer hover:bg-gray-200 transition-colors"
        )}
        onClick={canToggle ? onToggle : undefined}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1"> {/* Allow text to truncate */}
          <div className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
            {getIcon()}
          </div>
          <span className="text-sm font-medium text-gray-900 truncate">{getPillText()}</span> {/* Truncate long text */}
          {isStreaming && (
            <div className="flex space-x-1 flex-shrink-0">
              <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></div>
            </div>
          )}
        </div>
        {canToggle && (
          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-600" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-600" />
            )}
          </div>
        )}
      </div>
      
      {/* Content area - only show when expanded and for user/complete messages */}
      {((type === 'user' || type === 'complete') || (canToggle && isExpanded)) && (
        <div className="mt-2 p-4 bg-white border border-gray-200 rounded-lg w-full">
          {type === 'user' || type === 'complete' ? (
            <p className="text-sm text-gray-900 break-words">{content}</p>
          ) : (
            <div 
              ref={contentRef}
              className="h-32 overflow-auto w-full"
            >
              <pre className="whitespace-pre text-xs text-gray-700 font-mono">
                {content || (isStreaming ? "Processing..." : "No content")}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ChatWindow: React.FC<ChatWindowProps> = ({ messages: propMessages, isMinimized: propIsMinimized = false }) => {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string | string[]>>({})
  const [isMinimized, setIsMinimized] = useState(propIsMinimized)
  const [dropdownStates, setDropdownStates] = useState<Record<string, boolean>>({})
  const [streamingMessages, setStreamingMessages] = useState<Record<string, { content: string; isStreaming: boolean; currentFunction?: string }>>({})
  const chatWindowRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Use messages from props instead of sample messages
  const messages = propMessages || [];

  // Auto-scroll to bottom when new messages arrive or when streaming updates
  useEffect(() => {
    if (messagesEndRef.current && !isMinimized) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [messages, streamingMessages, isMinimized]);

  // Additional effect for auto-scrolling during streaming
  useEffect(() => {
    if (!isMinimized) {
      // Scroll to bottom when any streaming message is updated
      const timer = setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 50); // Small delay to allow DOM updates
      
      return () => clearTimeout(timer);
    }
  }, [streamingMessages, isMinimized]);

  // Update isMinimized when prop changes
  useEffect(() => {
    setIsMinimized(propIsMinimized);
  }, [propIsMinimized]);
      
  // Keyboard handler for spacebar to expand
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isWithinChatWindow = chatWindowRef.current && 
        (chatWindowRef.current.contains(activeElement) || activeElement === document.body);
      const isInTextInput = activeElement && activeElement.tagName.toLowerCase() === 'input';
      const shouldHandleSpacebar = event.code === 'Space' && 
        isWithinChatWindow && 
        !isInTextInput

      if (!isWithinChatWindow && isInTextInput) {
        return;
      }
      
      if (shouldHandleSpacebar && isMinimized) {
        event.preventDefault();
        setIsMinimized(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMinimized]);
          
  // Register chat visibility for StreamExecutor
  useEffect(() => {
    registerChatVisibility(() => !isMinimized);
  }, [isMinimized]);

  const toggleMinimized = () => {
    setIsMinimized(!isMinimized)
  }

  const handlePillToggle = (messageId: string) => {
    setDropdownStates(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }))
  }

  const handleOptionChange = (messageId: string, value: string | string[], isMultiSelect: boolean) => {
    setSelectedOptions(prev => ({
          ...prev,
      [messageId]: value
    }))
  }

  // Listen for streaming updates and new messages
  useEffect(() => {
    const handleStreamingUpdate = (event: CustomEvent) => {
      const { messageId, streamedContent, isStreaming, currentFunction } = event.detail;
      
      // Only log important state changes, not every token
      if (!isStreaming && currentFunction) {
        console.log(`✅ Function completed: ${currentFunction}`);
      }
      
      setStreamingMessages(prev => ({
        ...prev,
        [messageId]: { content: streamedContent, isStreaming, currentFunction }
      }));

      // DO NOT auto-expand - pills should only expand when user clicks
      // Pills show headers only by default for better UX
    };

    const handleAddMessage = (event: CustomEvent) => {
      const { message } = event.detail;
      console.log('📨 Chat received new message:', message.type, message.id);
      
      // DO NOT auto-expand new messages - show headers only
      // User must manually click to expand content
    };

    document.addEventListener('updateStreamingMessage', handleStreamingUpdate as EventListener);
    document.addEventListener('addChatMessage', handleAddMessage as EventListener);
    
    return () => {
      document.removeEventListener('updateStreamingMessage', handleStreamingUpdate as EventListener);
      document.removeEventListener('addChatMessage', handleAddMessage as EventListener);
  };
  }, []);

  const getMessageKey = (message: Message) => {
    return `${message.id}-${message.type || 'default'}-${message.sender}`;
  };

  const renderMessage = (message: Message) => {
    const streamingState = streamingMessages[message.id];
    let displayContent = message.content;
    
    if ((message.type === 'reasoning' || message.type === 'function-calling') && streamingState?.content) {
      displayContent = streamingState.content;
    }

    const isExpanded = dropdownStates[message.id];
    const isStreaming = streamingState?.isStreaming || false;

    // Handle different message types
    switch (message.type) {
      case 'reasoning':
        return (
          <MessagePill
            key={getMessageKey(message)}
            type="reasoning"
            content={displayContent}
            isStreaming={isStreaming}
            isExpanded={isExpanded}
            onToggle={() => handlePillToggle(message.id)}
          />
        );

      case 'function-calling':
        return (
          <MessagePill
            key={getMessageKey(message)}
            type="function"
            content={displayContent}
            isStreaming={isStreaming}
            isExpanded={isExpanded}
            onToggle={() => handlePillToggle(message.id)}
            functionName={streamingState?.currentFunction || 'batch_update'}
          />
        );

      case 'process-complete':
        // Only show one completion message, skip if we already have one
        const hasCompletionMessage = messages.some((msg, index, arr) => 
          msg.type === 'process-complete' && 
          index < arr.findIndex(m => m.id === message.id)
        );
        
        if (hasCompletionMessage) {
          return null; // Skip duplicate completion messages
        }
        
        return (
          <MessagePill
            key={getMessageKey(message)}
            type="complete"
            content={displayContent}
          />
        );

      case 'radio-question':
        return (
          <div key={getMessageKey(message)} className="mb-4">
            <MessagePill
              type="question"
              content={message.question || message.content}
              isExpanded={isExpanded}
              onToggle={() => handlePillToggle(message.id)}
            />
            
            {isExpanded && message.options && (
              <div className="mt-2 p-4 bg-white border border-gray-200 rounded-lg">
                <RadioGroup
                  value={selectedOptions[message.id] as string || ""}
                  onValueChange={(value) => handleOptionChange(message.id, value, false)}
                  className="space-y-2"
                >
                  {message.options.map((option, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <RadioGroupItem 
                        value={option.id} 
                        id={`${message.id}-${index}`}
                        className="border-gray-300"
                      />
                      <Label
                        htmlFor={`${message.id}-${index}`}
                        className="text-sm cursor-pointer"
                      >
                        {option.text}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
      </div>
            )}
    </div>
  );

      case 'checkbox-question':
        return (
          <div key={getMessageKey(message)} className="mb-4">
            <MessagePill
              type="question"
              content={message.question || message.content}
              isExpanded={isExpanded}
              onToggle={() => handlePillToggle(message.id)}
            />
            
            {isExpanded && message.options && (
              <div className="mt-2 p-4 bg-white border border-gray-200 rounded-lg">
                <div className="space-y-2">
                  {message.options.map((option, index) => {
                    const currentSelections = (selectedOptions[message.id] as string[]) || [];
                    const isChecked = currentSelections.includes(option.id);
                    
                    return (
                      <div key={index} className="flex items-center space-x-2">
                        <Checkbox
                          id={`${message.id}-${index}`}
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              handleOptionChange(message.id, [...currentSelections, option.id], true)
                            } else {
                              handleOptionChange(message.id, currentSelections.filter(item => item !== option.id), true)
                            }
                          }}
                          className="border-gray-300"
                        />
                        <Label
                          htmlFor={`${message.id}-${index}`}
                          className="text-sm cursor-pointer"
                        >
                          {option.text}
                        </Label>
                      </div>
                    )
                  })}
      </div>
              </div>
            )}
    </div>
  );

      default:
        // User messages and regular assistant messages
        const pillType = message.sender === 'user' ? 'user' : 'question';
        return (
          <MessagePill
            key={getMessageKey(message)}
            type={pillType}
            content={displayContent}
            isExpanded={isExpanded}
            onToggle={() => handlePillToggle(message.id)} // Always make user messages toggleable
          />
        );
    }
  };

  return (
    <div ref={chatWindowRef} className="h-full flex flex-col w-[400px]">
      {/* Chat Header - Always visible when minimized */}
      {isMinimized && (
        <Card className="shadow-lg w-full">
      <div
            className="flex items-center justify-end p-4 border-b bg-gray-50 cursor-pointer"
            onClick={toggleMinimized}
      >
            <button className="p-2 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700">
              <ChevronDown className="w-4 h-4" />
            </button>
      </div>
        </Card>
      )}

      {/* Chat Window */}
      {!isMinimized && (
        <Card className="h-full flex flex-col shadow-lg w-full">
          <div className="flex items-center justify-end p-4 border-b bg-gray-50 cursor-pointer" onClick={toggleMinimized}>
            <button className="p-2 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
          
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[400px] p-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-gray-500">
                  <p className="text-sm">No messages yet. Start by describing your architecture requirements below.</p>
                  </div>
                ) : (
                                <div className="space-y-1">
                    {/* Only show the most recent 3 messages for better UX */}
                    {messages.slice(-3).map(renderMessage)}
                    <div ref={messagesEndRef} />
                  </div>
                )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default ChatWindow
