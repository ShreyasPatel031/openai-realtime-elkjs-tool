"use client"

import React, { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardFooter } from "./card"
import { ScrollArea } from "./scroll-area"
import { User, Bot, ChevronDown, ChevronUp, Send, Info, Brain, Settings, CheckCircle, ImageIcon } from "lucide-react"
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
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [textInput, setTextInput] = useState<string>('')
  const [pasteImageFeedback, setPasteImageFeedback] = useState<string>('')
  const chatWindowRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [localMessages, setLocalMessages] = useState<Message[]>(propMessages)

  // Use messages from props instead of sample messages
  const messages = propMessages || [];

  // Auto-scroll to bottom when new messages arrive or when streaming updates
  useEffect(() => {
    if (messagesEndRef.current && !isMinimized) {
      // Check if any reasoning or function dropdowns are currently open
      const hasOpenDropdowns = Object.values(dropdownStates).some(isOpen => isOpen) ||
        messages.some(msg => (msg.type === 'reasoning' && (msg.isDropdownOpen ?? true)) ||
                            (msg.type === 'function-calling' && (msg.isDropdownOpen ?? false)));
      
      // Only auto-scroll if there are open dropdowns (user wants to see streaming content)
      if (hasOpenDropdowns) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages, isMinimized, streamingMessages, dropdownStates]);

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

  // Add clipboard paste event listener
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      console.log('📋 Paste event detected at', new Date().toISOString());
      
      // Only handle paste if the chat window is visible and not minimized
      if (!chatWindowRef.current || isMinimized) return;
      
      // Check if the paste event is happening within our chat window or if no other input is focused
      const isWithinChatWindow = chatWindowRef.current.contains(event.target as Node);
      const activeElement = document.activeElement;
      const isInTextInput = activeElement && activeElement.tagName.toLowerCase() === 'input';
      
      console.log('🔍 Paste context:', {
        isWithinChatWindow,
        activeElement: activeElement?.tagName,
        isInTextInput
      });
      
      // Always allow image paste within our chat window, regardless of text input focus
      // Only skip if pasting outside our component AND a text input elsewhere is focused
      if (!isWithinChatWindow && isInTextInput) {
        console.log('⏭️ Skipping paste: not within chat window and text input is focused');
        return;
      }
      
      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        console.log('❌ No clipboard data available');
        return;
      }
      
      // Check if clipboard contains image data
      const items = Array.from(clipboardData.items);
      const imageItems = items.filter(item => item.type.startsWith('image/'));
      
      console.log('📋 Clipboard analysis:', {
        totalItems: items.length,
        imageItems: imageItems.length,
        itemTypes: items.map(item => item.type)
      });
      
      // Handle direct image paste
      if (imageItems.length > 0) {
        console.log('📋 Detected image paste, processing...');
        event.preventDefault(); // Prevent default paste behavior
        
        const processedImages: File[] = [];
        
        for (const item of imageItems) {
          try {
            const blob = item.getAsFile();
            if (blob) {
              // Create a File object from the blob
              const timestamp = Date.now();
              const fileName = `pasted-image-${timestamp}.${blob.type.split('/')[1] || 'png'}`;
              const file = new File([blob], fileName, {
                type: blob.type,
                lastModified: timestamp
              });
              
              console.log('📋 Processing pasted image:', fileName, blob.type);
              
              // If it's an SVG, convert it to PNG (though SVG from clipboard is rare)
              if (blob.type === 'image/svg+xml') {
                console.log('🔄 Converting pasted SVG to PNG');
                const pngFile = await convertSvgToPng(file);
                processedImages.push(pngFile);
              } else {
                processedImages.push(file);
              }
            }
          } catch (error) {
            console.error('❌ Failed to process pasted image:', error);
            // Show error feedback to user
            const errorMessage = `Failed to process pasted image: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(errorMessage);
            // You could also show a toast notification here
          }
        }
        
        if (processedImages.length > 0) {
          setSelectedImages(prev => [...prev, ...processedImages]);
          console.log('📋 Added pasted images to selection:', processedImages.length);
          
          // Show feedback that images were pasted
          const feedbackText = `📋 ${processedImages.length} image${processedImages.length > 1 ? 's' : ''} pasted!`;
          setPasteImageFeedback(feedbackText);
          
          // Clear feedback after 2 seconds
          setTimeout(() => {
            setPasteImageFeedback('');
          }, 2000);
        }
      }
    };
    
    // Add event listener to the document (will catch paste events anywhere)
    document.addEventListener('paste', handlePaste);
    
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [isMinimized]);

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

  // Function to convert SVG to PNG
  const convertSvgToPng = (svgFile: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const svgData = e.target?.result as string;
        
        // Create an image element from the SVG data
        const img = new Image();
        img.onload = () => {
          // Create canvas and draw the SVG
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          // Set canvas size (you can adjust this for better quality)
          canvas.width = img.width || 800;
          canvas.height = img.height || 600;
          
          // Draw the SVG image onto the canvas
          ctx.drawImage(img, 0, 0);
          
          // Convert canvas to PNG blob
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Failed to convert canvas to blob'));
              return;
            }
            
            // Create a new File object with PNG type
            const pngFile = new File([blob], svgFile.name.replace('.svg', '.png'), {
              type: 'image/png',
              lastModified: Date.now()
            });
            
            console.log(`📸 Converted SVG to PNG: ${svgFile.name} → ${pngFile.name}`);
            resolve(pngFile);
          }, 'image/png', 0.9); // 90% quality
        };
        
        img.onerror = () => {
          reject(new Error('Failed to load SVG image'));
        };
        
        // Set the SVG data as the image source
        img.src = svgData;
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read SVG file'));
      };
      
      reader.readAsDataURL(svgFile);
    });
  };



  // Function to handle image selection with SVG conversion
  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    // Filter for image files (including SVG)
    const imageFiles = files.filter(file => 
      file.type.startsWith('image/') || file.type === 'image/svg+xml'
    );
    
    if (imageFiles.length > 0) {
      console.log('📸 Processing selected images:', imageFiles.map(f => f.name));
      
      const processedImages: File[] = [];
      
      for (const file of imageFiles) {
        try {
          if (file.type === 'image/svg+xml') {
            // Convert SVG to PNG
            console.log('🔄 Converting SVG to PNG:', file.name);
            const pngFile = await convertSvgToPng(file);
            processedImages.push(pngFile);
          } else {
            // Use the file as-is for supported formats
            processedImages.push(file);
          }
        } catch (error) {
          console.error('❌ Failed to process image:', file.name, error);
          // Show error to user
          alert(`Failed to process image "${file.name}": ${error.message}`);
        }
      }
      
      if (processedImages.length > 0) {
        setSelectedImages(prev => [...prev, ...processedImages]);
        console.log('📸 Selected images for reasoning agent:', processedImages.length);
      }
    }
    
    // Clear the input so the same file can be selected again
    event.target.value = '';
  };

  // Function to remove a selected image
  const removeImage = (indexToRemove: number) => {
    setSelectedImages(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleProcessClick = async () => {
    console.log('🟢 STEP 1: Process button clicked - starting architecture generation flow');
    console.log('📊 Current state:', {
      messagesCount: messages.length,
      selectedOptionsCount: Object.keys(selectedOptions).length,
      textInputLength: textInput.trim().length,
      imagesCount: selectedImages.length
    });
    
    // Send single processing message to real-time agent
    if (window.realtimeAgentSendTextMessage && typeof window.realtimeAgentSendTextMessage === 'function') {
      window.realtimeAgentSendTextMessage("The user selected the process button, you will be notified when the process is complete");
    }
    
    // Store chat data for the StreamExecutor to use
    storeChatData(messages, selectedOptions);
    
    // Store additional text input if provided
    if (textInput.trim()) {
      (window as any).chatTextInput = textInput.trim();
      console.log('📝 Stored text input for reasoning agent:', textInput.trim());
    } else {
      (window as any).chatTextInput = '';
    }
    
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
      textInput: textInput.trim(),
      timestamp: new Date().toISOString(),
      totalMessages: messages.length,
      totalQuestions: selectedAnswers.length
    };
    
    console.log('📊 Collected processing data:', processingData);
    console.log('🟡 STEP 2: About to call process_user_requirements()');
    
    try {
      // If we have images, store them globally for the StreamExecutor to access
      if (selectedImages.length > 0) {
        console.log('📸 Processing with images...');
        // Store images globally so StreamExecutor can access them
        (window as any).selectedImages = selectedImages;
        console.log('📸 Stored images globally for StreamExecutor:', selectedImages.length);
      } else {
        // Clear any previously stored images
        (window as any).selectedImages = [];
      }
      
      // Always call process_user_requirements to trigger StreamViewer
      console.log('🔵 STEP 3: Calling process_user_requirements()...');
      const result = process_user_requirements();
      console.log('✅ STEP 3 Complete: process_user_requirements returned:', result);
      
      // Clear selected images and text input after processing starts
      if (selectedImages.length > 0) {
        setSelectedImages([]);
      }
      if (textInput.trim()) {
        setTextInput('');
      }
      
      // Add a system message to show processing started
      const processingMessage = {
        id: crypto.randomUUID(),
        content: (() => {
          const parts = [];
          if (textInput.trim()) parts.push('text input');
          if (selectedImages.length > 0) parts.push(`${selectedImages.length} image${selectedImages.length > 1 ? 's' : ''}`);
          
          if (parts.length > 0) {
            return `Processing ${parts.join(' and ')}...`;
          } else {
            return "Processing conversation data...";
          }
        })(),
        sender: 'system' as const,
        type: 'function-calling' as const,
        isStreaming: true,
        isDropdownOpen: true,
        animationType: 'function-calling'
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

  // Simple clipboard test function
  const testClipboard = async () => {
    try {
      console.log('🧪 Testing clipboard functionality...');
      
      // Test clipboard write
      await navigator.clipboard.writeText('clipboard test - ' + Date.now());
      console.log('✅ Clipboard write successful');
      
      // Test clipboard read
      const text = await navigator.clipboard.readText();
      console.log('✅ Clipboard read successful:', text);
      
      setPasteImageFeedback('✅ Clipboard working!');
      setTimeout(() => setPasteImageFeedback(''), 2000);
      
    } catch (error) {
      console.error('❌ Clipboard test failed:', error);
      setPasteImageFeedback('❌ Clipboard permission denied');
      setTimeout(() => setPasteImageFeedback(''), 3000);
    }
  };

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
            <div className="w-full flex flex-col gap-2">
              {/* Image upload area */}
              <div className="flex items-center gap-2">
                {/* Hidden file input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*,.svg"
                  multiple
                  onChange={handleImageSelect}
                  style={{ display: 'none' }}
                />
                
                {/* Image upload button */}
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                  title="Click to select images or paste images from clipboard"
                >
                  <ImageIcon className="h-4 w-4" />
                  Add Images
                </Button>
                
                {/* Paste hint */}
                {!pasteImageFeedback && (
                  <span className="text-xs text-gray-500 font-medium">
                    or paste images
                  </span>
                )}
                
                {/* Clipboard test button */}
                <button
                  type="button"
                  onClick={testClipboard}
                  className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-200 rounded hover:bg-blue-50"
                  title="Test clipboard functionality"
                >
                  🧪 Test Clipboard
                </button>
                
                {/* Paste feedback */}
                {pasteImageFeedback && (
                  <span className="text-xs text-green-600 font-medium animate-pulse">
                    {pasteImageFeedback}
                  </span>
                )}
                
                {/* Image count display */}
                {selectedImages.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 rounded-full text-sm">
                    <span className="text-blue-700">
                      {selectedImages.length} image{selectedImages.length > 1 ? 's' : ''} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedImages([])}
                      className="text-blue-500 hover:text-blue-700 text-xs ml-1"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
              
              {/* Text input area */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Add text description or requirements..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleProcessClick();
                    }
                  }}
                />
                {textInput.trim() && (
                  <button
                    type="button"
                    onClick={() => setTextInput('')}
                    className="text-gray-400 hover:text-gray-600 text-xs px-2"
                  >
                    Clear
                  </button>
                )}
              </div>
              
              {/* Process button */}
              <Button
                onClick={handleProcessClick}
                style={{
                  background: "#000",
                }}
                className="w-full h-12 rounded-lg border-2 border-black text-white hover:bg-gray-800 flex items-center justify-center"
              >
                <Send className="h-6 w-6 mr-2" />
                {(() => {
                  const parts = [];
                  if (textInput.trim()) parts.push('text');
                  if (selectedImages.length > 0) parts.push(`${selectedImages.length} image${selectedImages.length > 1 ? 's' : ''}`);
                  
                  if (parts.length > 0) {
                    return `Process with ${parts.join(' + ')}`;
                  } else {
                    return 'Process';
                  }
                })()}
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}

export default ChatWindow
