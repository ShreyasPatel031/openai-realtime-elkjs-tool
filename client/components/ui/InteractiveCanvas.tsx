"use client"

import React, { useState, useEffect } from "react"
import ReactFlow, { Background, Controls, MiniMap } from "reactflow"
import "reactflow/dist/style.css"

// Import types from separate type definition files
interface ChatBoxProps {
  onSubmit: (message: string) => void
}

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

interface InteractiveCanvasProps {
  isSessionActive?: boolean
  startSession?: () => void
  stopSession?: () => void
  sendTextMessage?: (message: string) => void
  events?: any[] // Add events from the server
}

// Use require for imports to bypass TypeScript path checking
// @ts-ignore
import Chatbox from "./Chatbox"
// @ts-ignore
import ChatWindow from "./ChatWindow"

const ChatBox = Chatbox as React.ComponentType<ChatBoxProps>

const initialMessages: Message[] = [
  { id: "1", content: "Hello! How can I help you with the migration?", sender: "assistant" },
  { id: "2", content: "I need to migrate my database schema.", sender: "user" },
]

const InteractiveCanvas: React.FC<InteractiveCanvasProps> = ({
  isSessionActive = false,
  startSession = () => {},
  stopSession = () => {},
  sendTextMessage = () => {},
  events = [],
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages)

  // Connect with the WebRTC session
  useEffect(() => {
    if (!isSessionActive) {
      // If we're not active, we should show a welcome message
      setMessages([
        { 
          id: "welcome", 
          content: "Welcome to the interactive console. Start a session to begin chatting with the AI.", 
          sender: "assistant" 
        }
      ])
    }
  }, [isSessionActive])

  // Listen for server events
  useEffect(() => {
    // Look for the latest text response from the server
    const latestServerEvent = events
      .filter(event => 
        event.type === 'response.delta' && 
        event.delta?.type === 'message' && 
        event.delta?.content?.[0]?.type === 'text'
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
    if (latestServerEvent) {
      // Extract text from the event
      const text = latestServerEvent.delta.content[0].text;
      
      // Check if we already have this response
      const existingMessage = messages.find(msg => 
        msg.sender === 'assistant' && 
        msg.id === latestServerEvent.event_id
      );
      
      if (existingMessage) {
        // Update existing message
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            msg.id === latestServerEvent.event_id 
              ? { ...msg, content: text } 
              : msg
          )
        );
      } else {
        // Add new message
        setMessages(prevMessages => [
          ...prevMessages, 
          {
            id: latestServerEvent.event_id,
            content: text,
            sender: 'assistant'
          }
        ]);
      }
    }
  }, [events, messages]);

  const handleChatSubmit = (message: string) => {
    // Add the user message to the UI immediately
    const newMessage: Message = {
      id: Date.now().toString(),
      content: message,
      sender: "user",
    }
    
    setMessages((prev) => [...prev, newMessage])
    
    // If there's a session, send the message to the AI
    if (isSessionActive && sendTextMessage) {
      sendTextMessage(message)
    } else {
      // If no session, show a message prompting to start a session
      setTimeout(() => {
        setMessages((prev) => [
          ...prev, 
          { 
            id: `system-${Date.now()}`, 
            content: "Please start a session to chat with the AI.", 
            sender: "assistant" 
          }
        ])
      }, 500)
    }
  }

  return (
    <div className="w-screen h-screen relative">
      <ChatWindow messages={messages} />
      <ChatBox onSubmit={handleChatSubmit} />
      <ReactFlow nodes={[]} edges={[]} className="absolute inset-0 z-0">
        <Background />
        <Controls position="bottom-left" />
        <MiniMap position="bottom-right" />
      </ReactFlow>
      
      {/* Connection control panel */}
      {!isSessionActive ? (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg p-4 z-10">
          <button 
            onClick={startSession}
            className="px-4 py-2 bg-green-500 text-white rounded-md"
          >
            Start Session
          </button>
        </div>
      ) : (
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-2 z-10">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            <span className="text-sm font-medium">Connected</span>
            <button 
              onClick={stopSession}
              className="ml-4 px-3 py-1 bg-red-500 text-white text-sm rounded-md"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default InteractiveCanvas 