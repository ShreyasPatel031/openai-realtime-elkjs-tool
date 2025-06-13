"use client"

import React, { useState, useRef, useEffect } from "react"
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
  const autoExpandedRef = useRef(false)

  // Auto-expand when agent is ready
  useEffect(() => {
    if (isAgentReady && !isExpanded && !isTransitioning && !autoExpandedRef.current) {
      console.log('🤖 Agent is ready - auto-expanding chat');
      autoExpandedRef.current = true;
      toggleExpand();
    }
  }, [isAgentReady]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim()) {
      onSubmit(message)
      setMessage("")
    }
  }

  const toggleExpand = () => {
    // Don't toggle if already transitioning
    if (isTransitioning) return;
    
    setIsTransitioning(true);

    if (isExpanded) {
      // Closing animation sequence
      setShowControls(false);
      setTimeout(() => {
        setIsExpanded(false);
        setTimeout(() => {
          setShowMic(true);
          setIsTransitioning(false);
        }, 400); // Wait for closing animation to complete
      }, 100); // Small delay before starting to collapse
    } else {
      // Opening animation sequence
      setShowMic(false);
      setIsExpanded(true);
      // Wait for expansion animation to complete before showing controls
      setTimeout(() => {
        setShowControls(true);
        setTimeout(() => {
          setIsTransitioning(false);
          if (inputRef.current) inputRef.current.focus();
        }, 100); // Short delay after showing controls
      }, 500); // Wait a bit longer for full expansion before showing controls
    }
  };

  const handleMicClick = () => {
    // Start session when mic is clicked if not active and not connecting
    if (!isSessionActive && !isConnecting && onStartSession) {
      onStartSession();
    }
    // Only expand if not already expanded and not transitioning
    if (!isExpanded && !isTransitioning) {
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
        icon: <Mic className="h-3 w-3 text-white" />,
        disabled: false
      };
    } else if (isSessionActive) {
      return {
        color: "#3b82f6", // blue-500
        borderColor: "border-blue-500",
        hoverColor: "hover:bg-blue-600",
        icon: <Mic className="h-3 w-3 text-white" />,
        disabled: true
      };
    } else {
      return {
        color: "#ef4444", // red-500
        borderColor: "border-red-500",
        hoverColor: "hover:bg-red-600",
        icon: <Mic className="h-5 w-5 text-white" />,
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
          transition: "all 400ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        className={cn(
          "flex items-center justify-between bg-white rounded-full border border-gray-200 overflow-hidden",
          isExpanded 
            ? "w-[70vw] p-2" 
            : "w-[140px] h-14 p-0",
        )}
      >
        {isExpanded ? (
          <>
            {(isExpanded && showControls) && (
              <Button
                type="button"
                style={{
                  transition: "opacity 300ms cubic-bezier(0, 0, 0.2, 1)",
                  background: "transparent",
                }}
                className={cn(
                  "h-14 w-14 rounded-full border-2 border-red-500 flex-shrink-0 flex items-center justify-center p-0",
                  "opacity-100",
                  "hover:bg-gray-100"
                )}
                onClick={handleCancelClick}
              >
                <X className="h-6 w-6 text-red-500 hover:text-red-300" />
              </Button>
            )}
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
              transition: "all 400ms cubic-bezier(0.4, 0, 0.2, 1)",
              background: buttonState.color,
            }}
            className={cn(
              "h-14 w-full rounded-full border-2 flex items-center justify-center gap-x-3",
              buttonState.borderColor,
              buttonState.hoverColor,
              showMic ? "opacity-100" : "opacity-0",
              buttonState.disabled && "cursor-not-allowed opacity-75"
            )}
          >
            {buttonState.icon}
            <span className="text-white font-medium">Start</span>
          </Button>
        )}
      </form>
    </div>
  )
}

export default ChatBox
