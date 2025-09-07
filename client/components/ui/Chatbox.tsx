"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import { Input } from "./input"
import { Button } from "./button"
import { Send, Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"
import { process_user_requirements } from "../graph/userRequirements"
import type { ChatBoxProps } from "../../types/chat"

const ChatBox: React.FC<ChatBoxProps> = ({ onSubmit, isDisabled = false, onProcessStart }) => {
  const [textInput, setTextInput] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [pastedImages, setPastedImages] = useState<string[]>([]) // Array of data URLs
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

  // Handle paste events to detect images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Check if the item is an image
      if (item.type.startsWith('image/')) {
        e.preventDefault(); // Prevent default paste behavior for images
        
        const file = item.getAsFile();
        if (!file) continue;

        // Convert to base64 data URL
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          if (dataUrl) {
            setPastedImages(prev => [...prev, dataUrl]);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  }, []);

  // Remove an image from the pasted images list
  const removeImage = useCallback((index: number) => {
    setPastedImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleExampleClick = async (example: string) => {
    if (isProcessing || isDisabled) return; // Prevent clicks during processing or when disabled
    
    setTextInput(example);
    setIsProcessing(true);
    
    try {
      // Notify parent that processing is starting
      if (onProcessStart) {
        onProcessStart();
      }
      
      // Store text input globally for reasoning agent
      (window as any).originalChatTextInput = example; // Keep original for chat naming
      (window as any).chatTextInput = example;
      (window as any).selectedImages = [];
      
      console.log('🚀 Chatbox: Processing example:', example);
      console.log('🌍 Global state set:', {
        originalChatTextInput: (window as any).originalChatTextInput,
        chatTextInput: (window as any).chatTextInput,
        selectedImages: (window as any).selectedImages
      });
      
      // Call process_user_requirements to trigger the architecture generation
      process_user_requirements();
      console.log('✅ Chatbox: process_user_requirements called');
      
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
        // Notify parent that processing is starting
        if (onProcessStart) {
          onProcessStart();
        }
        
        // Store text input and images globally for reasoning agent
        (window as any).originalChatTextInput = textInput.trim(); // Keep original for chat naming
        (window as any).chatTextInput = textInput.trim();
        (window as any).selectedImages = pastedImages; // Store pasted images as data URLs
        
        console.log('🚀 Chatbox: Processing user input:', textInput.trim());
        console.log('🌍 Global state set:', {
          originalChatTextInput: (window as any).originalChatTextInput,
          chatTextInput: (window as any).chatTextInput,
          selectedImages: (window as any).selectedImages
        });
        
        // Call process_user_requirements to trigger the architecture generation
        process_user_requirements();
        console.log('✅ Chatbox: process_user_requirements called');
        
        // Clear the input and images after processing starts
        setTextInput("");
        setPastedImages([]);
        
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

      {/* Image previews */}
      {pastedImages.length > 0 && (
        <div className="w-full mb-3">
          <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <span className="text-sm text-gray-600 w-full mb-2">
              📸 {pastedImages.length} image{pastedImages.length > 1 ? 's' : ''} attached:
            </span>
            {pastedImages.map((dataUrl, index) => (
              <div key={index} className="relative group">
                <img
                  src={dataUrl}
                  alt={`Pasted image ${index + 1}`}
                  className="w-16 h-16 object-cover rounded border border-gray-300"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  title="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="w-full">
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 shadow-sm p-3 hover:shadow-md transition-shadow">
          {/* Input field */}
          <Input
            ref={inputRef}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyPress={handleKeyPress}
            onPaste={handlePaste}
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

