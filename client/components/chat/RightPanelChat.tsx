"use client"

import React, { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader } from "../ui/card"
import { ScrollArea } from "../ui/scroll-area"
import { Input } from "../ui/input"
import { Button } from "../ui/button"
import { Separator } from "../ui/separator"
import { 
  Send, 
  Bot, 
  User, 
  Loader2, 
  MessageSquare,
  ChevronDown,
  ChevronUp
} from "lucide-react"
import { cn } from "../../lib/utils"

interface RightPanelChatProps {
  className?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isStreaming?: boolean
}

const RightPanelChat: React.FC<RightPanelChatProps> = ({ className }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    console.log('🔄 Messages changed, attempting to scroll. Messages count:', messages.length, 'isMinimized:', isMinimized)
    if (messagesEndRef.current && !isMinimized) {
      console.log('📜 Scrolling to bottom...')
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    } else {
      console.log('❌ Cannot scroll - messagesEndRef:', !!messagesEndRef.current, 'isMinimized:', isMinimized)
    }
  }, [messages, isMinimized])

  // Auto-focus input when component mounts
  useEffect(() => {
    if (inputRef.current && !isMinimized) {
      inputRef.current.focus({ preventScroll: true })
    }
  }, [isMinimized])

  const callOpenAI = async (userMessage: string) => {
    console.log('🚀 Starting OpenAI call with message:', userMessage)
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            ...messages.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: userMessage }
          ]
        }),
      })

      console.log('📡 Response status:', response.status)
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ HTTP error response:', errorText)
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      console.log('📖 Starting to read stream...')
      const decoder = new TextDecoder()
      let assistantMessage = ''

      // Create streaming message
      const streamingMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true
      }

      setMessages(prev => [...prev, streamingMessage])
      console.log('💬 Added streaming message to chat')

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('✅ Stream completed')
          break
        }

        const chunk = decoder.decode(value)
        console.log('📦 Received chunk:', chunk)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            console.log('📊 Processing data:', data)
            
            if (data === '[DONE]') {
              console.log('🏁 Stream marked as done')
              // Mark streaming as complete
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === streamingMessage.id 
                    ? { ...msg, isStreaming: false }
                    : msg
                )
              )
              return
            }

            try {
              const parsed = JSON.parse(data)
              console.log('🔍 Parsed data:', parsed)
              console.log('🔍 Parsed data type:', parsed.type)
              
              // Handle special diagram creation messages
              if (parsed.type === 'diagram_creation') {
                console.log('🏗️ Diagram creation message received:', parsed.message)
                assistantMessage += `\n\n${parsed.message}`
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === streamingMessage.id 
                      ? { ...msg, content: assistantMessage }
                      : msg
                  )
                )
                continue // Continue processing other messages in the same chunk
              }
              
              // Handle diagram trigger
              if (parsed.type === 'trigger_diagram') {
                console.log('🚀 Triggering diagram creation with:', parsed.requirements)
                console.log('🔍 Full trigger_diagram object:', parsed)
                
                // Set global state (needed for naming and other functions)
                ;(window as any).originalChatTextInput = parsed.requirements
                ;(window as any).chatTextInput = parsed.requirements
                ;(window as any).selectedImages = []
                console.log('✅ Set global state for diagram generation')
                
                // Call the actual working diagram generation function
                console.log('📞 Calling handleChatSubmit from InteractiveCanvas...')
                const handleChatSubmit = (window as any).handleChatSubmit
                if (handleChatSubmit && typeof handleChatSubmit === 'function') {
                  console.log('✅ Found handleChatSubmit function, calling it...')
                  handleChatSubmit(parsed.requirements)
                } else {
                  console.error('❌ handleChatSubmit function not found on window object')
                  // Fallback to the old method
                  import('../../components/graph/userRequirements').then(({ process_user_requirements }) => {
                    console.log('🔄 Falling back to process_user_requirements...')
                    process_user_requirements()
                  }).catch(error => {
                    console.error('❌ Failed to import process_user_requirements:', error)
                  })
                }
                continue // Continue processing other messages in the same chunk
              }
              
              // Handle error messages
              if (parsed.type === 'error') {
                console.log('❌ Error message received:', parsed.message)
                assistantMessage += `\n\nError: ${parsed.message}`
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === streamingMessage.id 
                      ? { ...msg, content: assistantMessage }
                      : msg
                  )
                )
                continue // Continue processing other messages in the same chunk
              }
              
              if (parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content
                assistantMessage += content
                console.log('📝 Adding content:', content, 'Total:', assistantMessage)
                
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === streamingMessage.id 
                      ? { ...msg, content: assistantMessage }
                      : msg
                  )
                )
              }
            } catch (e) {
              console.log('⚠️ Failed to parse chunk:', data, 'Error:', e)
              // Ignore parsing errors for incomplete chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error calling OpenAI:', error)
      
      // Add error message
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('📝 HandleSendMessage called with input:', inputValue)
    
    if (!inputValue.trim() || isLoading) {
      console.log('❌ Cannot send message - empty input or loading:', { inputValue, isLoading })
      return
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    }

    console.log('💬 Adding user message:', userMessage)
    setMessages(prev => [...prev, userMessage])
    const messageText = inputValue.trim()
    setInputValue("")
    setIsLoading(true)

    console.log('🚀 Calling OpenAI with message:', messageText)
    try {
      await callOpenAI(messageText)
    } finally {
      console.log('🏁 OpenAI call completed')
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e as any)
    }
  }

  const getMessageIcon = (role: ChatMessage['role']) => {
    switch (role) {
      case 'user':
        return <User className="w-4 h-4" />
      case 'assistant':
        return <Bot className="w-4 h-4" />
      default:
        return <MessageSquare className="w-4 h-4" />
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className={cn("h-full flex flex-col bg-white", className)}>
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            <h3 className="font-semibold text-gray-800">AI Chat Assistant</h3>
          </div>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="flex items-center justify-center w-8 h-8 rounded-lg shadow-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all duration-200"
            title={isMinimized ? "Expand chat" : "Minimize chat"}
          >
            {isMinimized ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </CardHeader>

      {!isMinimized && (
        <>
          <Separator />
          
          {/* Messages Area */}
          <CardContent className="flex-1 p-0 overflow-hidden">
            <div className="h-full overflow-y-auto p-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Bot className="w-12 h-12 mb-4" />
                  <h4 className="text-lg font-medium text-gray-600 mb-2">
                    AI Chat Assistant
                  </h4>
                  <p className="text-sm text-gray-500 max-w-xs mb-4">
                    Ask me anything! I'm here to help with questions, explanations, and conversations.
                  </p>
                  <div className="text-xs text-gray-400 space-y-1">
                    <p>💡 Try: "Explain quantum computing"</p>
                    <p>💡 Try: "Help me write a poem"</p>
                    <p>💡 Try: "What's the weather like?"</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex gap-3",
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {message.role !== 'user' && (
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          {getMessageIcon(message.role)}
                        </div>
                      )}
                      
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg px-3 py-2",
                          message.role === 'user'
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-900"
                        )}
                      >
                        <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
                        {message.isStreaming && (
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce"></div>
                            <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                        )}
                        <p className={cn(
                          "text-xs mt-1",
                          message.role === 'user' ? "text-blue-100" : "text-gray-500"
                        )}>
                          {formatTime(message.timestamp)}
                        </p>
                      </div>

                      {message.role === 'user' && (
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          {getMessageIcon(message.role)}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="bg-gray-100 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm text-gray-500">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </CardContent>

          <Separator />
          
          {/* Input Area */}
          <div className="p-4">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading}
                className={`flex items-center justify-center px-3 py-2 rounded-lg shadow-lg border border-gray-200 hover:shadow-md transition-all duration-200 ${
                  !inputValue.trim() || isLoading
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                title={isLoading ? "Sending..." : "Send message"}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}

export default RightPanelChat