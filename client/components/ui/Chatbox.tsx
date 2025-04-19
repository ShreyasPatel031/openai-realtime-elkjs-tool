"use client"

import React, { useState, useRef } from "react"
import { Input } from "./input"
import { Button } from "./button"
import { Send, Mic, X } from "lucide-react"
import { cn } from "../../lib/utils"

interface ChatBoxProps {
  onSubmit: (message: string) => void
}

const ChatBox: React.FC<ChatBoxProps> = ({ onSubmit }) => {
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

  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 pointer-events-auto">
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
              size="icon"
              variant="ghost"
              style={{
                transition: "opacity 300ms cubic-bezier(0, 0, 0.2, 1)",
              }}
              className={cn(
                "h-14 w-14 rounded-full border-2 border-red-500 flex-shrink-0",
                showControls ? "opacity-100" : "opacity-0",
              )}
              onClick={toggleExpand}
            >
              <X className="h-6 w-6 text-red-500 hover:text-red-300" />
            </Button>
            <Input
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
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
              size="icon"
              variant="ghost"
              style={{
                transition: "opacity 300ms cubic-bezier(0, 0, 0.2, 1)",
              }}
              className={cn(
                "h-14 w-14 rounded-full border-2 border-black bg-black text-white hover:bg-gray-800 flex-shrink-0",
                showControls ? "opacity-100" : "opacity-0",
              )}
            >
              <Send className="h-6 w-6" />
            </Button>
          </>
        ) : (
          <Button
            onClick={toggleExpand}
            type="button"
            size="icon"
            style={{
              transition: "all 300ms cubic-bezier(0, 0, 0.2, 1)",
            }}
            className={cn(
              "h-14 w-14 rounded-full border-2 border-red-500 flex-grow",
              showMic ? "bg-red-500 hover:bg-red-600 opacity-100" : "bg-white opacity-0",
            )}
          >
            <Mic className="h-6 w-6" />
          </Button>
        )}
      </form>
    </div>
  )
}

export default ChatBox
