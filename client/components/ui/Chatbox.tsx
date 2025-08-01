"use client"

import React, { useState, useRef, useEffect } from "react"
import { Input } from "./input"
import { Button } from "./button"
import { Send, Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"
import { process_user_requirements } from "../graph/userRequirements"

interface ChatBoxProps {
  onSubmit?: (message: string) => void; // Keep for compatibility but won't use complex logic
}

const ChatBox: React.FC<ChatBoxProps> = ({ onSubmit }) => {
  const [textInput, setTextInput] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (textInput.trim() && !isProcessing) {
      setIsProcessing(true);
      
      try {
        console.log('🟢 Processing user input:', textInput.trim());
        
        // Store text input globally for reasoning agent (same as ChatWindow does)
        if (textInput.trim()) {
          (window as any).chatTextInput = textInput.trim();
          console.log('📝 Stored text input for reasoning agent:', textInput.trim());
        } else {
          (window as any).chatTextInput = '';
        }
        
        // Clear images (in case any were stored before)
        (window as any).selectedImages = [];
        
        // Call process_user_requirements to trigger the architecture generation
        console.log('🔵 Calling process_user_requirements()...');
        const result = process_user_requirements();
        console.log('✅ process_user_requirements returned:', result);
        
        // Clear the input after processing starts
        setTextInput("");
        
        // Optional: call onSubmit for any parent component compatibility
        if (onSubmit) {
          onSubmit(textInput.trim());
        }
        
      } catch (error) {
        console.error('Failed to process input:', error);
      } finally {
        // Reset processing state after a short delay to show feedback
        setTimeout(() => {
          setIsProcessing(false);
        }, 1000);
      }
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  }

  return (
    <div className="w-full p-4">
      <form onSubmit={handleSubmit} className="w-full">
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 shadow-sm p-3 hover:shadow-md transition-shadow">
          {/* Input field */}
          <Input
            ref={inputRef}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isProcessing ? "Processing..." : "Describe your architecture requirements..."}
            disabled={isProcessing}
            className="flex-grow border-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-base placeholder:text-gray-500"
          />
          
          {/* Clear button (when there's text) */}
          {textInput.trim() && !isProcessing && (
            <button
              type="button"
              onClick={() => setTextInput('')}
              className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              Clear
            </button>
          )}
          
          {/* Submit button */}
          <Button
            type="submit"
            disabled={isProcessing || !textInput.trim()}
            className={cn(
              "h-10 w-10 rounded-lg flex-shrink-0 flex items-center justify-center p-0 transition-all",
              textInput.trim() && !isProcessing
                ? "bg-blue-500 hover:bg-blue-600 text-white" 
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        
        {/* Simple helper text */}
        <div className="mt-2 text-xs text-gray-500 text-center">
          {isProcessing 
            ? "Generating your architecture..." 
            : "Type your requirements and press Enter to generate architecture"
          }
        </div>
      </form>
    </div>
  )
}

export default ChatBox

