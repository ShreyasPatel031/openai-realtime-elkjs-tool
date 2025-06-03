"use client"

import React, { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardFooter } from "./card"
import { ScrollArea } from "./scroll-area"
import { User, Bot, ChevronDown, ChevronUp, Send, Info } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "./radio-group"
import { Checkbox } from "./checkbox"
import { Label } from "./label"
import { Button } from "./button"
import { Separator } from "./separator"
import { cn } from "../../lib/utils"
import { Message } from "../../types/chat"
import { registerChatVisibility } from "../../utils/chatUtils"

interface ChatWindowProps {
  messages: Message[]
  isMinimized?: boolean
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages: propMessages, isMinimized: propIsMinimized = false }) => {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string | string[]>>({})
  const [isMinimized, setIsMinimized] = useState(propIsMinimized)
  const chatWindowRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Use messages from props instead of sample messages
  const messages = propMessages || [];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && !isMinimized) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isMinimized]);

  // Register chat visibility with chatUtils on mount
  useEffect(() => {
    console.log('🔧 Registering chat visibility setter');
    registerChatVisibility((visible: boolean) => {
      console.log('📺 Setting chat visibility to:', visible);
      setIsMinimized(!visible);
    });
  }, []);

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
                          <Info className="w-6 h-6 mt-1 text-blue-500" />
                        )}

                        {message.type === "radio-question" ? (
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
              type="submit"
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
