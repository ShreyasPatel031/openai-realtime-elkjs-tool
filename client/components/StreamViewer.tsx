import React, { useState, useRef, useEffect } from "react";
import { StreamExecutor } from "../reasoning/StreamExecutor";
import { addReasoningMessage, updateStreamingMessage, addFunctionCallingMessage } from "../utils/chatUtils";

const StreamViewer: React.FC<{ elkGraph: any; setElkGraph: (graph: any) => void; apiEndpoint?: string }> = ({ elkGraph, setElkGraph, apiEndpoint }) => {
  const [lines, setLines] = useState<string[]>([]);
  const [isStreaming, setBusy] = useState(false);

  // Refs for tracking streaming messages
  const reasoningMessageIdRef = useRef<string | null>(null);
  const reasoningContentRef = useRef<string>("");
  
  // Track function calls by item ID
  const functionCallsRef = useRef<Map<string, { messageId: string; content: string; name?: string }>>(new Map());

  // Handle graph updates
  useEffect(() => {
    console.log('🔄 StreamViewer elkGraphRef updated:', elkGraph);
  }, [elkGraph]);

  const addLine = (line: string) => {
    setLines(ls => [...ls, line]);
    
    // Check for function call patterns
    const functionMatch = line.match(/🔧 (\w+) \(/);
    if (functionMatch) {
      const functionName = functionMatch[1];
      
      // Complete previous function call if exists
      const currentCalls = functionCallsRef.current;
      for (const [itemId, callInfo] of currentCalls.entries()) {
        if (callInfo.messageId) {
          updateStreamingMessage(callInfo.messageId, callInfo.content, true, callInfo.name);
        }
      }
      // Clear previous calls
      functionCallsRef.current.clear();
    }
    // Check for other function-related lines
    else if (line.includes('🟢') || line.includes('🔴') || line.includes('➡️') || line.includes('🔧')) {
      // Add to any active function calls
      const currentCalls = functionCallsRef.current;
      for (const [itemId, callInfo] of currentCalls.entries()) {
        if (callInfo.messageId) {
          callInfo.content += line + '\n';
          updateStreamingMessage(callInfo.messageId, callInfo.content, false, callInfo.name);
        }
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

  const appendToArgsLine = (text: string, itemId?: string) => {
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
    
    // Handle function call arguments with item ID tracking
    if (itemId) {
      let callInfo = functionCallsRef.current.get(itemId);
      
      if (!callInfo) {
        // Create new function call message
        const messageId = addFunctionCallingMessage();
        callInfo = {
          messageId,
          content: '',
          name: undefined
        };
        functionCallsRef.current.set(itemId, callInfo);
      }
      
      // Accumulate function call content
      callInfo.content += text;
      updateStreamingMessage(callInfo.messageId, callInfo.content, false, callInfo.name);
    }
  };

  const appendToTextLine = (text: string) => {
    setLines(ls => {
      const newLines = [...ls];
      const lastLineIndex = newLines.length - 1;
      if (lastLineIndex >= 0 && 
          !newLines[lastLineIndex].startsWith('🧠 ') && 
          !newLines[lastLineIndex].startsWith('🔄 ') &&
          !newLines[lastLineIndex].includes('🎯') &&
          !newLines[lastLineIndex].includes('📝')) {
        // Append to existing non-special line
        newLines[lastLineIndex] += text;
      } else {
        // Start new line
        newLines.push(text);
      }
      return newLines;
    });
  };

  // Create StreamExecutor instance and execute
  const executeStream = () => {
    console.log('🔄 Starting StreamExecutor with graph:', elkGraph);
    
    const streamExecutor = new StreamExecutor({
      elkGraph,
      setElkGraph,
      addLine,
      appendToTextLine,
      appendToReasoningLine,
      appendToArgsLine,
      setBusy,
      onComplete: () => {
        console.log('✅ StreamExecutor completed');
        // Complete any remaining streaming messages
        if (reasoningMessageIdRef.current) {
          updateStreamingMessage(reasoningMessageIdRef.current, reasoningContentRef.current, true);
          reasoningMessageIdRef.current = null;
          reasoningContentRef.current = "";
        }
        
        // Complete any remaining function calls
        const currentCalls = functionCallsRef.current;
        for (const [itemId, callInfo] of currentCalls.entries()) {
          if (callInfo.messageId) {
            updateStreamingMessage(callInfo.messageId, callInfo.content, true, callInfo.name);
          }
        }
        functionCallsRef.current.clear();
      },
      apiEndpoint
    });

    // Reset streaming message refs when starting new stream
    reasoningMessageIdRef.current = null;
    reasoningContentRef.current = "";
    functionCallsRef.current.clear();

    streamExecutor.execute();
  };

  // Auto-execute when component mounts or elkGraph changes (if needed)
  // Commented out to prevent auto-execution
  // useEffect(() => {
  //   executeStream();
  // }, []);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-between p-3 border-b">
        <h2 className="text-lg font-semibold">AI Stream</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={executeStream}
            disabled={isStreaming}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              isStreaming 
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {isStreaming ? 'Processing...' : 'Start Stream'}
          </button>
          <button
            onClick={() => setLines([])}
            className="px-3 py-1 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 font-mono text-sm">
        {lines.length === 0 ? (
          <div className="text-gray-500 italic">Stream output will appear here...</div>
        ) : (
          lines.map((line, index) => (
            <div
              key={index}
              className={`mb-1 ${
                line.startsWith('🧠') ? 'text-purple-600' :
                line.startsWith('🔄') ? 'text-blue-600' :
                line.includes('🎯') ? 'text-green-600' :
                line.includes('❌') ? 'text-red-600' :
                line.includes('✅') ? 'text-green-500' :
                'text-gray-800'
              }`}
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StreamViewer;
