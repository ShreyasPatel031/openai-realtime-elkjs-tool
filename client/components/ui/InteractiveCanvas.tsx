"use client"

import React, { useState, useEffect } from "react"
import ReactFlow, { Background, Controls, MiniMap, BackgroundVariant } from "reactflow"
import "reactflow/dist/style.css"

// Import types from separate type definition files
interface ChatBoxProps {
  onSubmit: (message: string) => void;
  isSessionActive?: boolean;
  onStartSession?: () => void;
  onStopSession?: () => void;
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
    <div className="w-full h-full flex flex-col overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="flex-1 relative min-h-0 overflow-hidden">
        <div className="absolute top-10 left-4 right-4 z-10 max-h-[calc(100% - 100px)] overflow-visible">
          <ChatWindow messages={messages} />
        </div>
        <div className="absolute inset-0 h-full w-full">
          <ReactFlow 
            nodes={[]} 
            edges={[]} 
            className="w-full h-full"
            defaultEdgeOptions={{
              style: { stroke: '#64748b' },
              animated: true,
            }}
          >
            <Background 
              color="#94a3b8" 
              gap={16} 
              size={1}
              variant={BackgroundVariant.Dots}
            />
            <Controls 
              position="bottom-left" 
              showInteractive={true}
              showZoom={true}
              showFitView={true}
              style={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                borderRadius: '8px',
                padding: '8px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}
            />
            <MiniMap 
              position="bottom-right"
              nodeStrokeWidth={3}
              nodeColor="#64748b"
              maskColor="rgba(255, 255, 255, 0.1)"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                borderRadius: '8px',
                padding: '8px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}
            />
          </ReactFlow>
        </div>
      </div>
      
      {/* ChatBox at the bottom */}
      <div className="flex-none min-h-0 bg-white border-t border-gray-200 shadow-lg">
        <ChatBox 
          onSubmit={handleChatSubmit} 
          isSessionActive={isSessionActive}
          onStartSession={startSession}
          onStopSession={stopSession}
        />
      </div>
      
      {/* Session status indicator */}
      {isSessionActive && (
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-3 z-20 backdrop-blur-sm bg-opacity-80">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-sm font-medium text-gray-700">Connected</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default InteractiveCanvas 