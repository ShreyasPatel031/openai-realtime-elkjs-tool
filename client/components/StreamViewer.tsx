import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { StreamExecutor, StreamExecutorOptions } from "../reasoning/StreamExecutor";
import { addReasoningMessage, addFunctionCallingMessage, addProcessCompleteMessage, updateStreamingMessage } from "../utils/chatUtils";

interface StreamViewerProps {
  elkGraph?: any;
  setElkGraph?: (graph: any) => void;
  isVisible?: boolean;
  onToggleVisibility?: () => void;
}

export interface StreamViewerHandle {
  start: () => void;
}

const StreamViewer = forwardRef<StreamViewerHandle, StreamViewerProps>(({ elkGraph, setElkGraph, isVisible = false, onToggleVisibility }, ref) => {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loopCount, setLoopCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  
  // Use ref to track current graph state and avoid stale closures
  const elkGraphRef = useRef(elkGraph);
  
  // Track chat message IDs for streaming and accumulated content
  const reasoningMessageIdRef = useRef<string | null>(null);
  const currentFunctionMessageIdRef = useRef<string | null>(null);
  const reasoningContentRef = useRef<string>("");
  const currentFunctionContentRef = useRef<string>("");
  const currentFunctionNameRef = useRef<string>("");
  
  useEffect(() => {
    elkGraphRef.current = elkGraph;
    console.log("🔄 StreamViewer elkGraphRef updated:", elkGraphRef.current);
  }, [elkGraph]);
  
  const addLine = (line: string) => {
    setLines(ls => [...ls, line]);
    
    // Check if this is a function call line - extract actual function name
    if (line.includes('🔄 Loop') && line.includes('Processing:')) {
      // Extract function name from "Processing: function_name"
      const functionMatch = line.match(/Processing:\s+(\w+)/);
      if (functionMatch) {
        const functionName = functionMatch[1];
        
        // Complete previous function if different
        if (currentFunctionNameRef.current && currentFunctionNameRef.current !== functionName) {
          if (currentFunctionMessageIdRef.current) {
            updateStreamingMessage(currentFunctionMessageIdRef.current, currentFunctionContentRef.current, true, currentFunctionNameRef.current);
          }
          // Reset for new function
          currentFunctionMessageIdRef.current = null;
          currentFunctionContentRef.current = "";
        }
        
        // Create new function message if needed
        if (!currentFunctionMessageIdRef.current) {
          currentFunctionMessageIdRef.current = addFunctionCallingMessage();
          currentFunctionContentRef.current = "";
        }
        
        currentFunctionNameRef.current = functionName;
        
        // Add the processing line to the function content
        currentFunctionContentRef.current += line + '\n';
        updateStreamingMessage(currentFunctionMessageIdRef.current, currentFunctionContentRef.current, false, currentFunctionNameRef.current);
      }
    }
    // Check for other function-related lines
    else if (line.includes('🟢') || line.includes('🔴') || line.includes('➡️') || line.includes('🔧')) {
      if (currentFunctionMessageIdRef.current) {
        currentFunctionContentRef.current += line + '\n';
        updateStreamingMessage(currentFunctionMessageIdRef.current, currentFunctionContentRef.current, false, currentFunctionNameRef.current);
      }
    }
  };

  const appendToReasoningLine = (text: string) => {
    setLines(ls => {
      const newLines = [...ls];
      const lastLineIndex = newLines.length - 1;
      if (lastLineIndex >= 0 && newLines[lastLineIndex].startsWith('🧠 ')) {
        // Append to existing reasoning line
        newLines[lastLineIndex] += text;
      } else {
        // Start new reasoning line
        newLines.push(`🧠 ${text}`);
      }
      return newLines;
    });
    
    // Stream to chat reasoning message - properly accumulate content
    if (!reasoningMessageIdRef.current) {
      reasoningMessageIdRef.current = addReasoningMessage();
      reasoningContentRef.current = "";
    }
    
    // Accumulate reasoning content as sentences, not individual tokens
    reasoningContentRef.current += text;
    updateStreamingMessage(reasoningMessageIdRef.current, reasoningContentRef.current, false);
  };

  const appendToArgsLine = (text: string) => {
    setLines(ls => {
      const newLines = [...ls];
      const lastLineIndex = newLines.length - 1;
      if (lastLineIndex >= 0 && newLines[lastLineIndex].startsWith('🔄 Building args: ')) {
        // Append to existing args line
        newLines[lastLineIndex] += text;
      } else {
        // Start new args line
        newLines.push(`🔄 Building args: ${text}`);
      }
      return newLines;
    });
    
    // This is function argument building - add to current function message
    if (currentFunctionMessageIdRef.current) {
      // Don't show "building_args" as function name, keep the actual function name
      currentFunctionContentRef.current += text;
      updateStreamingMessage(currentFunctionMessageIdRef.current, currentFunctionContentRef.current, false, currentFunctionNameRef.current);
    }
  };

  const appendToTextLine = (text: string) => {
    setLines(ls => {
      const newLines = [...ls];
      const lastLineIndex = newLines.length - 1;
      if (lastLineIndex >= 0 && newLines[lastLineIndex].startsWith('💭 ')) {
        // Append to existing text line
        newLines[lastLineIndex] += text;
      } else {
        // Start new text line
        newLines.push(`💭 ${text}`);
      }
      return newLines;
    });
    
    // Stream to chat reasoning message - properly accumulate content
    if (!reasoningMessageIdRef.current) {
      reasoningMessageIdRef.current = addReasoningMessage();
      reasoningContentRef.current = "";
    }
    
    // Accumulate reasoning content as sentences, not individual tokens
    reasoningContentRef.current += text;
    updateStreamingMessage(reasoningMessageIdRef.current, reasoningContentRef.current, false);
  };

  const start = async () => {
    if (!elkGraphRef.current || !setElkGraph) {
      addLine("❌ No graph state available");
      return;
    }

    setLines([]);
    setLoopCount(0);
    setErrorCount(0);
    
    // Reset chat message refs and content
    reasoningMessageIdRef.current = null;
    currentFunctionMessageIdRef.current = null;
    reasoningContentRef.current = "";
    currentFunctionContentRef.current = "";
    currentFunctionNameRef.current = "";
    
    const options: StreamExecutorOptions = {
      elkGraph: elkGraphRef.current,
      setElkGraph: setElkGraph,
      addLine,
      appendToTextLine,
      appendToReasoningLine,
      appendToArgsLine,
      setBusy,
      onComplete: () => {
        // Simple completion - just log it, no fancy UI stuff
        addLine("✅ Architecture generation completed!");
        console.log('✅ StreamViewer: Architecture generation finished');
        
        // Complete any remaining streaming messages
        if (reasoningMessageIdRef.current) {
          updateStreamingMessage(reasoningMessageIdRef.current, reasoningContentRef.current, true);
        }
        if (currentFunctionMessageIdRef.current) {
          updateStreamingMessage(currentFunctionMessageIdRef.current, currentFunctionContentRef.current, true, currentFunctionNameRef.current);
        }
      },
      onError: (error) => {
        addLine(`❌ Stream execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error('❌ StreamViewer onError called:', error);
        
        // Mark streaming as complete even on error
        if (reasoningMessageIdRef.current) {
          updateStreamingMessage(reasoningMessageIdRef.current, reasoningContentRef.current, true);
        }
        if (currentFunctionMessageIdRef.current) {
          updateStreamingMessage(currentFunctionMessageIdRef.current, currentFunctionContentRef.current, true, currentFunctionNameRef.current);
        }
      }
    };

    try {
      const executor = new StreamExecutor(options);
      await executor.execute();
    } catch (error) {
      console.error('StreamViewer start error:', error);
      addLine(`❌ Failed to start stream: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setBusy(false);
    }
  };

  // Expose start method via ref
  useImperativeHandle(ref, () => ({
    start
  }));

  return (
    <div className={`fixed bottom-0 right-4 z-50 transition-all duration-300 ease-in-out ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}>
      <div className="w-[600px] bg-white dark:bg-gray-800 rounded-t-lg shadow-lg border border-gray-200 dark:border-gray-700">
        {/* Header with toggle button */}
        <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={onToggleVisibility}
            className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
            {isVisible ? '▼' : '▲'} Stream Viewer
          </button>
        <button 
          onClick={start} 
          disabled={busy || !elkGraphRef.current || !setElkGraph} 
            className="px-4 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-md disabled:opacity-50 text-sm"
          data-streamviewer-trigger
        >
          {busy ? "Streaming..." : "Stream + Execute"}
        </button>
        </div>

        {/* Content */}
        <div className="p-2 flex flex-col" style={{ height: '40vh', maxHeight: '40vh' }}>
          <div className="flex items-center gap-4 mb-2 flex-shrink-0">
        <span className="text-sm text-gray-600 flex-shrink-0">
          {busy ? "🔴 Streaming active" : !elkGraphRef.current ? "⚪ No graph state" : "⚪ Ready"}
        </span>
      </div>
      
      <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-lg flex-1 overflow-auto text-xs border whitespace-pre-wrap break-words break-all min-h-0 w-full" style={{ maxHeight: '35vh', maxWidth: '100%' }}>
        {lines.join("\n")}
      </pre>
        </div>
      </div>
    </div>
  );
});

StreamViewer.displayName = 'StreamViewer';

export default StreamViewer;
