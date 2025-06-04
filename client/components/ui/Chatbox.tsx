"use client"

import React, { useState, useRef } from "react"
import { Input } from "./input"
import { Button } from "./button"
import { Send, Mic, X, Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"

interface ChatBoxProps {
  onSubmit: (message: string) => void;
  isSessionActive?: boolean;
  isConnecting?: boolean;
  isAgentReady?: boolean;
  onStartSession?: () => void;
  onStopSession?: () => void;
}

const ChatBox: React.FC<ChatBoxProps> = ({ 
  onSubmit, 
  isSessionActive = false,
  isConnecting = false,
  isAgentReady = false,
  onStartSession, 
  onStopSession 
}) => {
  const [message, setMessage] = useState("")
  const [isExpanded, setIsExpanded] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [showMic, setShowMic] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim()) {
      onSubmit(message)
      setMessage("")
    }
  }

  const toggleExpand = () => {
    setIsTransitioning(true)

    if (isExpanded) {
      // Closing animation sequence
      setShowControls(false)
      setTimeout(() => {
        setIsExpanded(false)
        setTimeout(() => {
          setShowMic(true)
          setIsTransitioning(false)
        }, 400) // Wait for closing animation to complete
      }, 400) // Wait before starting to collapse
    } else {
      // Opening animation sequence
      setShowMic(false)
      setIsExpanded(true)
      setTimeout(() => {
        setShowControls(true)
        setTimeout(() => {
          setIsTransitioning(false)
          if (inputRef.current) inputRef.current.focus()
        }, 200) // Wait for controls to fade in
      }, 400) // Wait for expansion before showing controls
    }
  }

  const handleMicClick = () => {
    // Start session when mic is clicked if not active and not connecting
    if (!isSessionActive && !isConnecting && onStartSession) {
      onStartSession();
    }
    // Only expand if agent is ready or session is active
    if (isAgentReady || isSessionActive) {
      toggleExpand();
    }
  }

  const handleCancelClick = () => {
    // Stop session when cancel is clicked if active
    if (isSessionActive && onStopSession) {
      onStopSession();
    }
    // Then collapse the chat input
    toggleExpand();
  }

  // Determine button appearance based on connection state
  const getButtonState = () => {
    if (isConnecting) {
      return {
        color: "#f59e0b", // yellow-500
        borderColor: "border-yellow-500",
        hoverColor: "hover:bg-yellow-600",
        icon: <Loader2 className="h-6 w-6 text-white animate-spin" />,
        disabled: true
      };
    } else if (isAgentReady) {
      return {
        color: "#22c55e", // green-500
        borderColor: "border-green-500",
        hoverColor: "hover:bg-green-600",
        icon: <Mic className="h-6 w-6 text-white" />,
        disabled: false
      };
    } else if (isSessionActive) {
      return {
        color: "#3b82f6", // blue-500
        borderColor: "border-blue-500",
        hoverColor: "hover:bg-blue-600",
        icon: <Mic className="h-6 w-6 text-white" />,
        disabled: true
      };
    } else {
      return {
        color: "#ef4444", // red-500
        borderColor: "border-red-500",
        hoverColor: "hover:bg-red-600",
        icon: <Mic className="h-6 w-6 text-white" />,
        disabled: false
      };
    }
  };

  const buttonState = getButtonState();

  return (
    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50 pointer-events-auto">
      <form
        onSubmit={handleSubmit}
        style={{
          transition: "all 300ms cubic-bezier(0, 0, 0.2, 1)",
        }}
        className={cn(
          "flex items-center justify-between bg-white rounded-full border border-gray-200 overflow-hidden",
          isExpanded ? "w-[70vw] p-2" : "w-14 h-14 p-0",
        )}
      >
        {isExpanded ? (
          <>
            <Button
              type="button"
              style={{
                transition: "opacity 300ms cubic-bezier(0, 0, 0.2, 1)",
                background: "transparent",
              }}
              className={cn(
                "h-14 w-14 rounded-full border-2 border-red-500 flex-shrink-0 flex items-center justify-center p-0",
                showControls ? "opacity-100" : "opacity-0",
                "hover:bg-gray-100"
              )}
              onClick={handleCancelClick}
            >
              <X className="h-6 w-6 text-red-500 hover:text-red-300" />
            </Button>
            <Input
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={isAgentReady ? "Speak or type a message..." : "Type a message..."}
              style={{
                transition: "opacity 300ms cubic-bezier(0, 0, 0.2, 1)",
              }}
              className={cn(
                "flex-grow mx-4 rounded-full border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-center",
                showControls ? "opacity-100" : "opacity-0",
              )}
            />
            <Button
              type="submit"
              style={{
                transition: "opacity 300ms cubic-bezier(0, 0, 0.2, 1)",
                background: "#000",
              }}
              className={cn(
                "h-14 w-14 rounded-full border-2 border-black text-white hover:bg-gray-800 flex-shrink-0 flex items-center justify-center p-0",
                showControls ? "opacity-100" : "opacity-0",
              )}
            >
              <Send className="h-6 w-6" />
            </Button>
          </>
        ) : (
          <Button
            onClick={handleMicClick}
            type="button"
            disabled={buttonState.disabled}
            style={{
              transition: "all 300ms cubic-bezier(0, 0, 0.2, 1)",
              background: buttonState.color,
            }}
            className={cn(
              "h-14 w-14 rounded-full border-2 flex-grow flex items-center justify-center p-0",
              buttonState.borderColor,
              buttonState.hoverColor,
              showMic ? "opacity-100" : "opacity-0",
              buttonState.disabled && "cursor-not-allowed opacity-75"
            )}
          >
            {buttonState.icon}
          </Button>
        )}
      </form>
    </div>
  )
}

export default ChatBox
