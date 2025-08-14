"use client"

import React, { useState, useRef, useEffect } from "react"
import { Input } from "./input"
import { Button } from "./button"
import { Send, Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"
import { process_user_requirements } from "../graph/userRequirements"
import type { ChatBoxProps } from "../../types/chat"

const ChatBox: React.FC<ChatBoxProps> = ({ onSubmit, isDisabled = false }) => {
  const [textInput, setTextInput] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Example use cases
  const exampleUseCases = [
    "GCP microservices with Kubernetes",
    "AWS serverless web application", 
    "Multi-cloud data pipeline"
  ];

  // Auto-focus input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      // Prevent the page from scrolling down to the input on initial load
      inputRef.current.focus({ preventScroll: true });
    }
  }, []);

  const handleExampleClick = async (example: string) => {
    if (isProcessing || isDisabled) return; // Prevent clicks during processing or when disabled
    
    setTextInput(example);
    setIsProcessing(true);
    
    try {

      
      // Store text input globally for reasoning agent
      (window as any).chatTextInput = example;
      (window as any).selectedImages = [];
      
      // Call process_user_requirements to trigger the architecture generation
      process_user_requirements();
      
      // Clear the input after processing starts
      setTextInput("");
      
      // Optional: call onSubmit for any parent component compatibility
      if (onSubmit) {
        onSubmit(example);
      }
      
    } catch (error) {
      console.error('Failed to process example:', error);
    } finally {
      // Reset processing state after a short delay
      setTimeout(() => {
        setIsProcessing(false);
      }, 1000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (textInput.trim() && !isProcessing && !isDisabled) {
      setIsProcessing(true);
      
      try {

        
        // Store text input globally for reasoning agent
        (window as any).chatTextInput = textInput.trim();
        (window as any).selectedImages = [];
        
        // Call process_user_requirements to trigger the architecture generation
        process_user_requirements();
        
        // Clear the input after processing starts
        setTextInput("");
        
        // Optional: call onSubmit for any parent component compatibility
        if (onSubmit) {
          onSubmit(textInput.trim());
        }
        
      } catch (error) {
        console.error('Failed to process input:', error);
      } finally {
        // Reset processing state after a short delay
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
      {/* Example use cases pills - above the input */}
      <div className="mb-3 flex flex-wrap gap-2 justify-center">
        {exampleUseCases.map((example, index) => (
          <button
            key={index}
            onClick={() => handleExampleClick(example)}
            disabled={isProcessing || isDisabled}
            className="text-xs px-4 py-2 rounded-full bg-gradient-to-r from-gray-50 to-gray-100 hover:from-blue-50 hover:to-blue-100 text-gray-700 hover:text-blue-700 border border-gray-200 hover:border-blue-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md transform hover:scale-105 flex items-center"
          >
            {example}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="w-full">
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 shadow-sm p-3 hover:shadow-md transition-shadow">
          {/* Input field */}
          <Input
            ref={inputRef}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Describe your architecture requirements"
            disabled={isProcessing || isDisabled}
            className="flex-grow border-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-base placeholder:text-gray-400"
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
          
          {/* Submit button - Always enabled, black color */}
          <Button
            type="submit"
            className="h-10 w-10 rounded-lg flex-shrink-0 flex items-center justify-center p-0 bg-gray-900 hover:bg-gray-800 text-white transition-all"
            disabled={isProcessing || isDisabled}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default ChatBox

