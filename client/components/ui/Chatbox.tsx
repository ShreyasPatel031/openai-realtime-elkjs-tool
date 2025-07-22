"use client"

import React, { useState, useRef, useCallback, useEffect } from "react"
import { Input } from "./input"
import { Button } from "./button"
import { Send, Mic, X, Loader2, ImageIcon } from "lucide-react"
import { cn } from "../../lib/utils"
import { QuestionnaireExecutor } from "../../questionnaire/QuestionnaireExecutor"

interface ChatBoxProps {
  onSubmit: (message: string) => void;
  isSessionActive?: boolean;
  isConnecting?: boolean;
  isAgentReady?: boolean;
  onStartSession?: () => void;
  onStopSession?: () => void;
  onTriggerReasoning?: () => void;
}

const ChatBox: React.FC<ChatBoxProps> = ({ 
  onSubmit, 
  isSessionActive = false, 
  isConnecting = false,
  isAgentReady = false,
  onStartSession, 
  onStopSession,
  onTriggerReasoning
}) => {
  const [message, setMessage] = useState("")
  const [isExpanded, setIsExpanded] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [showMic, setShowMic] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [pasteImageFeedback, setPasteImageFeedback] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatBoxRef = useRef<HTMLDivElement>(null)

  // Auto-expand when agent is ready
  useEffect(() => {
    if (isAgentReady && !isExpanded && !isTransitioning) {
      console.log('🤖 Agent is ready - auto-expanding chat');
      toggleExpand();
    }
  }, [isAgentReady]);

  // Add clipboard paste event listener for images
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      console.log('📋 Paste event detected at', new Date().toISOString());
      
      // Only handle paste if the chat box is expanded
      if (!chatBoxRef.current || !isExpanded) return;
      
      // Check if the paste event is happening within our chat box or if no other input is focused
      const isWithinChatBox = chatBoxRef.current.contains(event.target as Node);
      const activeElement = document.activeElement;
      const isInTextInput = activeElement && activeElement.tagName.toLowerCase() === 'input';
      
      // Always allow image paste within our chat box, regardless of text input focus
      // Only skip if pasting outside our component AND a text input elsewhere is focused
      if (!isWithinChatBox && isInTextInput) {
        console.log('⏭️ Skipping paste: not within chat box and text input is focused');
        return;
      }
      
      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        console.log('❌ No clipboard data available');
        return;
      }
      
      // Check if clipboard contains image data
      const items = Array.from(clipboardData.items);
      const imageItems = items.filter(item => item.type.startsWith('image/'));
      
      console.log('📋 Clipboard analysis:', {
        totalItems: items.length,
        imageItems: imageItems.length,
        itemTypes: items.map(item => item.type)
      });
      
      // Handle direct image paste
      if (imageItems.length > 0) {
        console.log('📋 Detected image paste, processing...');
        event.preventDefault(); // Prevent default paste behavior
        
        const processedImages: File[] = [];
        
        for (const item of imageItems) {
          try {
            const blob = item.getAsFile();
            if (blob) {
              // Create a File object from the blob
              const timestamp = Date.now();
              const fileName = `pasted-image-${timestamp}.${blob.type.split('/')[1] || 'png'}`;
              const file = new File([blob], fileName, {
                type: blob.type,
                lastModified: timestamp
              });
              
              console.log('📋 Processing pasted image:', fileName, blob.type);
              
              // If it's an SVG, convert it to PNG
              if (blob.type === 'image/svg+xml') {
                console.log('🔄 Converting pasted SVG to PNG');
                const pngFile = await convertSvgToPng(file);
                processedImages.push(pngFile);
              } else {
                processedImages.push(file);
              }
            }
          } catch (error) {
            console.error('❌ Failed to process pasted image:', error);
          }
        }
        
        if (processedImages.length > 0) {
          setSelectedImages(prev => [...prev, ...processedImages]);
          console.log('📋 Added pasted images to selection:', processedImages.length);
          
          // Show feedback that images were pasted
          const feedbackText = `📋 ${processedImages.length} image${processedImages.length > 1 ? 's' : ''} pasted!`;
          setPasteImageFeedback(feedbackText);
          
          // Clear feedback after 2 seconds
          setTimeout(() => {
            setPasteImageFeedback('');
          }, 2000);
        }
      }
    };
    
    // Add event listener to the document
    document.addEventListener('paste', handlePaste);
    
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [isExpanded]);

  // Function to convert SVG to PNG
  const convertSvgToPng = (svgFile: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const svgData = e.target?.result as string;
        
        // Create an image element from the SVG data
        const img = new Image();
        img.onload = () => {
          // Create canvas and draw the SVG
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          // Set canvas size (you can adjust this for better quality)
          canvas.width = img.width || 800;
          canvas.height = img.height || 600;
          
          // Draw the SVG image onto the canvas
          ctx.drawImage(img, 0, 0);
          
          // Convert canvas to PNG blob
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Failed to convert canvas to blob'));
              return;
            }
            
            // Create a new File object with PNG type
            const pngFile = new File([blob], svgFile.name.replace('.svg', '.png'), {
              type: 'image/png',
              lastModified: Date.now()
            });
            
            console.log(`📸 Converted SVG to PNG: ${svgFile.name} → ${pngFile.name}`);
            resolve(pngFile);
          }, 'image/png', 0.9); // 90% quality
        };
        
        img.onerror = () => {
          reject(new Error('Failed to load SVG image'));
        };
        
        // Set the SVG data as the image source
        img.src = svgData;
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read SVG file'));
      };
      
      reader.readAsDataURL(svgFile);
    });
  };

  // Function to handle image selection with SVG conversion
  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    // Filter for image files (including SVG)
    const imageFiles = files.filter(file => 
      file.type.startsWith('image/') || file.type === 'image/svg+xml'
    );
    
    if (imageFiles.length > 0) {
      console.log('📸 Processing selected images:', imageFiles.map(f => f.name));
      
      const processedImages: File[] = [];
      
      for (const file of imageFiles) {
        try {
          if (file.type === 'image/svg+xml') {
            // Convert SVG to PNG
            console.log('🔄 Converting SVG to PNG:', file.name);
            const pngFile = await convertSvgToPng(file);
            processedImages.push(pngFile);
          } else {
            // Use the file as-is for supported formats
            processedImages.push(file);
          }
        } catch (error) {
          console.error('❌ Failed to process image:', file.name, error);
          // Show error to user
          alert(`Failed to process image "${file.name}": ${error.message}`);
        }
      }
      
      if (processedImages.length > 0) {
        setSelectedImages(prev => [...prev, ...processedImages]);
        console.log('📸 Selected images for reasoning agent:', processedImages.length);
      }
    }
    
    // Clear the input so the same file can be selected again
    event.target.value = '';
  };

  // Function to remove a selected image
  const removeImage = (indexToRemove: number) => {
    setSelectedImages(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  // Function to compress and convert image to base64
  const compressAndConvertImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions (max 512px on longest side)
        const maxSize = 512;
        let { width, height } = img;
        
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Convert to base64 with compression
        const base64 = canvas.toDataURL('image/jpeg', 0.6); // 60% quality
        resolve(base64);
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && selectedImages.length === 0) return;
    
    setIsProcessing(true);
    
    try {
      if (selectedImages.length > 0) {
        // Handle image submission - convert to base64 and send to reasoning agent
        console.log('📸 Processing images for reasoning agent...');
        const imageContents = [];
        
        for (const image of selectedImages) {
          const base64 = await compressAndConvertImage(image);
          imageContents.push({
            type: "image_url",
            image_url: { url: base64, detail: "high" }
          });
        }
        
        const textContent = message.trim() || "Please analyze the uploaded image(s) and describe what you see in detail. Focus on identifying components, architecture, relationships, and any technical elements that could be used to create a diagram.";
        const structuredContent = [{ type: "text", text: textContent }, ...imageContents];
        
        // Store structured content globally for the reasoning agent
        (window as any).chatImageContent = structuredContent;
        
        // Send special marker to trigger image processing
        onSubmit("__IMAGES_PRESENT__");
        
        // Clear inputs
        setMessage("");
        setSelectedImages([]);
        if (fileInputRef.current) { 
          fileInputRef.current.value = ''; 
        }
      } else {
        // Handle text-only submission
        console.log('🔧 Starting reasoning agent with user input:', message);
        
        // Use questionnaire executor for text-only
        const executor = new QuestionnaireExecutor();

        await executor.execute(
          message,
          () => {
            console.log('🚀 Questionnaire agent started');
          },
          (questions) => {
            console.log('✅ Questions received:', questions);
            console.log('✅ Questionnaire completed, triggering reasoning agent...');
            setIsProcessing(false);
            
            // Trigger reasoning agent after questions are displayed
            if (onTriggerReasoning) {
              setTimeout(() => {
                onTriggerReasoning();
              }, 2000); // 2 second delay to let user see questions
            }
          },
          (error) => {
            console.error('❌ Questionnaire agent failed:', error);
            setIsProcessing(false);
          }
        );
        
        // Clear the input
        setMessage("");
      }
      
      setIsProcessing(false);
    } catch (error) {
      console.error('❌ Failed to process:', error);
      setIsProcessing(false);
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
    // Start the real-time session when the start button is clicked
    if (!isExpanded && !isTransitioning) {
      if (onStartSession) {
        console.log('🎤 Start button clicked - starting real-time session');
        onStartSession();
      }
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

  // Simple button appearance - red like it used to be
  const getButtonState = () => {
    return {
      color: "#ef4444", // red-500
      borderColor: "border-red-500", 
      hoverColor: "hover:bg-red-600",
      icon: null, // No icon
      disabled: false
    };
  };

  const buttonState = getButtonState();

  return (
    <div ref={chatBoxRef} className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50 pointer-events-auto">
      <form
        onSubmit={handleSubmit}
        style={{
          transition: "all 400ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        className={cn(
          "flex flex-col bg-white border border-gray-200 overflow-hidden",
          isExpanded 
            ? "w-[70vw] p-4 rounded-lg" 
            : "w-[140px] h-14 p-0 rounded-full",
        )}
      >
        {isExpanded ? (
          <div className={cn(
            "space-y-4",
            showControls ? "opacity-100" : "opacity-0",
            "transition-opacity duration-300"
          )}>
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*,.svg"
              multiple
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            
            {/* Image upload area */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                title="Click to select images or paste images from clipboard"
              >
                <ImageIcon className="h-4 w-4" />
                Add Images
              </Button>
              
              {/* Paste hint or feedback */}
              {pasteImageFeedback ? (
                <span className="text-xs text-green-600 font-medium animate-pulse">
                  {pasteImageFeedback}
                </span>
              ) : (
                <span className="text-xs text-gray-500 font-medium">
                  or paste images
                </span>
              )}
              
              {/* Image count display */}
              {selectedImages.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 rounded-full text-sm">
                  <span className="text-blue-700">
                    {selectedImages.length} image{selectedImages.length > 1 ? 's' : ''} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedImages([])}
                    className="text-blue-500 hover:text-blue-700 text-xs ml-1"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            
            {/* Input area */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                style={{
                  background: "transparent",
                }}
                className={cn(
                  "h-12 w-12 rounded-full border-2 border-red-500 flex-shrink-0 flex items-center justify-center p-0",
                  "hover:bg-gray-100"
                )}
                onClick={handleCancelClick}
              >
                <X className="h-5 w-5 text-red-500 hover:text-red-300" />
              </Button>
              
              <Input
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={isProcessing ? "Processing..." : "Describe your architecture requirements..."}
                disabled={isProcessing}
                className={cn(
                  "flex-grow rounded-full border-gray-300 focus-visible:ring-2 focus-visible:ring-blue-500",
                  isProcessing && "cursor-not-allowed opacity-75"
                )}
              />
              
              <Button
                type="submit"
                disabled={isProcessing || (!message.trim() && selectedImages.length === 0)}
                style={{
                  background: isProcessing ? "#6b7280" : "#000",
                }}
                className={cn(
                  "h-12 w-12 rounded-full border-2 border-black text-white hover:bg-gray-800 flex-shrink-0 flex items-center justify-center p-0",
                  isProcessing && "cursor-not-allowed"
                )}
              >
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
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
              "h-14 w-full rounded-full border-2 flex items-center justify-center",
              buttonState.borderColor,
              buttonState.hoverColor,
              showMic ? "opacity-100" : "opacity-0",
              buttonState.disabled && "cursor-not-allowed opacity-75"
            )}
          >
            <span className="text-white font-medium">Start</span>
          </Button>
        )}
      </form>
    </div>
  )
}

export default ChatBox
