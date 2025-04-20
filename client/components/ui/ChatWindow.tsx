"use client"

import React, { useState } from "react"
import { Card, CardContent, CardFooter } from "./card"
import { ScrollArea } from "./scroll-area"
import { User, Bot, ChevronDown, ChevronUp, Info } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "./radio-group"
import { Checkbox } from "./checkbox"
import { Label } from "./label"
import { Button } from "./button"
import { Separator } from "./separator"
import { cn } from "../../lib/utils"

interface Message {
  id: string
  content: string
  sender: "user" | "assistant"
  type?: "text" | "radio-question" | "checkbox-question"
  options?: { id: string; text: string }[]
  question?: string
}

interface ChatWindowProps {
  messages: Message[]
}

// Sample questions with options
const sampleMessages: Message[] = [
  {
    id: "1",
    content: "Hello! How can I help you with the migration?",
    sender: "assistant",
  },
  {
    id: "2",
    content: "I need to migrate my database schema.",
    sender: "user",
  },
  {
    id: "3",
    content: "",
    sender: "assistant",
    type: "radio-question",
    question: "What level of scalability is required for the application?",
    options: [
      { id: "scale-1", text: "Auto-scaling based on demand" },
      { id: "scale-2", text: "Fixed capacity with manual scaling" },
      { id: "scale-3", text: "Minimal scaling with fixed resources" },
    ],
  },
  {
    id: "4",
    content: "",
    sender: "assistant",
    type: "checkbox-question",
    question: "What additional services or features would you like to include in the marketplace platform, if any?",
    options: [
      { id: "feature-1", text: "Messaging between users" },
      { id: "feature-2", text: "Notifications for new job listings" },
      { id: "feature-3", text: "User profile management" },
    ],
  },
  {
    id: "5",
    content: "",
    sender: "assistant",
    type: "radio-question",
    question: "How should user authentication be managed in terms of security measures?",
    options: [
      { id: "auth-1", text: "Multi-factor authentication" },
      { id: "auth-2", text: "Single sign-on" },
      { id: "auth-3", text: "Basic authentication with OAuth" },
    ],
  },
]

const ChatWindow: React.FC<ChatWindowProps> = ({ messages: propMessages }) => {
  const [messages] = useState<Message[]>(sampleMessages)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string | string[]>>({})
  const [isMinimized, setIsMinimized] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

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

  const toggleInfo = () => {
    setShowInfo(!showInfo)
  }

  return (
    <div className="pointer-events-auto">
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
        <Card className="w-96 max-h-[calc(100vh-200px)] rounded-t-none shadow-md flex flex-col">
          <CardContent className="p-0 flex-grow overflow-hidden">
            <ScrollArea className="h-full px-6">
              <div className="flex flex-col gap-4 py-4">
                {messages.map((message) => (
                  <div key={message.id} className="flex items-start gap-3">
                    {message.sender === "user" ? (
                      <User className="w-6 h-6 mt-1 text-black" />
                    ) : (
                      <Bot className="w-6 h-6 mt-1 text-black" />
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
                      <div className="rounded-lg px-4 py-3 bg-white border border-gray-200 max-w-[80%]">
                        <p className="text-sm">{message.content}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>

          {/* Footer Bar */}
          <CardFooter className="border-t p-2 flex justify-end items-center bg-gray-50">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleInfo}>
              <Info className="h-3 w-3 text-gray-500" />
            </Button>

            {/* Info Panel - Shown when info button is clicked */}
            {showInfo && (
              <div className="absolute bottom-12 right-2 bg-white border border-gray-200 rounded-lg shadow-md p-3 w-64">
                <h4 className="text-xs font-medium mb-1">About Infra Agent</h4>
                <p className="text-xs text-gray-500 mb-2">
                  This agent helps you manage and migrate your infrastructure.
                </p>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Version 1.0.0</span>
                  <a href="#" className="text-blue-500 hover:underline">
                    Learn more
                  </a>
                </div>
              </div>
            )}
          </CardFooter>
        </Card>
      )}
    </div>
  )
}

export default ChatWindow
