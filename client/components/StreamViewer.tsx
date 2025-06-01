import React, { useState, useRef, useEffect } from "react";
import { exampleArchitectureBuild, elkGraphDescription } from "./architectureInstructions";
import { createPostEventSource, createGetEventSource, PostEventSource } from "./reasoning/PostEventSource";
import { createDeltaHandler, PendingCall, EventHandlerCallbacks } from "./reasoning/EventHandlers";
import { executeFunctionCall, FunctionExecutorCallbacks, GraphState } from "./reasoning/FunctionExecutor";

// Define the instruction to include with all function responses
const agentInstruction = "Under no circumstances should you say anything to the user, do not acknowledge their requests, do not explain your actions, do not acknowledge your function call, do not ask if they have further modificaitons, do not ask what's the next action they want you to perform, do not say you are ready for the next instruction, do not say next instruction please, don't say you are listening for the next instruction, just listen quitely for the next instruction.";

interface StreamViewerProps {
  elkGraph?: any;
  setElkGraph?: (graph: any) => void;
}

export default function StreamViewer({ elkGraph, setElkGraph }: StreamViewerProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [functionCall, setFunctionCall] = useState<any>(null);
  const [loopCount, setLoopCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const MAX_LOOPS = 20;
  const MAX_ERRORS = 3; // Stop after 3 consecutive errors
  
  // Use ref to track current graph state and avoid stale closures
  const elkGraphRef = useRef(elkGraph);
  
  // Synchronous counters to avoid async state issues
  const loopRef = useRef(0);
  const errorRef = useRef(0);
  
  // Queue-based function call handling
  const queueRef = useRef<string[]>([]);  // Now stores just call_ids
  const isProcessingRef = useRef(false);
  const handledCallsRef = useRef<Set<string>>(new Set());
  const toolCallParent = useRef<Map<string, string>>(new Map());  // call_id -> response_id
  const sentOutput = useRef<Set<string>>(new Set());  // Track sent outputs
  const pendingCalls = useRef<Map<string, { name: string; arguments: string; call_id: string }>>(new Map());  // Store call details
  
  useEffect(() => {
    elkGraphRef.current = elkGraph;
    console.log("🔄 StreamViewer elkGraphRef updated:", elkGraphRef.current);
  }, [elkGraph]);
  
  // Counter helper functions
  const incLoop = () => {
    loopRef.current += 1;
    setLoopCount(loopRef.current);     // purely for re-render
  };

  const resetLoop = () => {
    loopRef.current = 0;
    setLoopCount(0);
  };

  const incError = () => {
    errorRef.current += 1;
    setErrorCount(errorRef.current);
  };

  const resetError = () => {
    errorRef.current = 0;
    setErrorCount(0);
  };

  const pushCall = (pc: PendingCall) => {
    // Don't add if already handled
    if (handledCallsRef.current.has(pc.call.call_id)) {
      console.log(`🚫 Skipping already handled call_id: ${pc.call.call_id}`);
      return;
    }
    
    // Record the exact parent for this tool call
    toolCallParent.current.set(pc.call.call_id, pc.responseId);
    pendingCalls.current.set(pc.call.call_id, pc.call);
    queueRef.current.push(pc.call.call_id);
    console.log(`📥 Queued function call: ${pc.call.name} (${pc.call.call_id}) from response ${pc.responseId}`);
    console.log(`📋 Queue now has ${queueRef.current.length} items`);
    processQueue();
  };

  const processQueue = async () => {
    if (isProcessingRef.current) return;
    if (queueRef.current.length === 0) return;

    // ----- LOOP GUARD -----
    if (loopRef.current >= MAX_LOOPS) {
      addLine(`🛑 Reached ${MAX_LOOPS} loops – stopping`);
      setBusy(false);
      return;
    }

    isProcessingRef.current = true;
    const callId = queueRef.current[0];
    const call = pendingCalls.current.get(callId);
    const parentId = toolCallParent.current.get(callId);
    
    if (!call) {
      addLine(`❌ No call details found for ${callId}`);
      queueRef.current.shift();
      isProcessingRef.current = false;
      processQueue();
      return;
    }
    
    if (!parentId) {
      addLine(`❌ No parent response for ${callId}`);
      queueRef.current.shift();
      isProcessingRef.current = false;
      processQueue();
      return;
    }
    
    // Guard against duplicate outputs - check before processing
    if (sentOutput.current.has(callId)) {
      addLine(`🚫 Output already sent for ${callId}`);
      handledCallsRef.current.add(callId);
      toolCallParent.current.delete(callId);
      pendingCalls.current.delete(callId);
      queueRef.current.shift();
      isProcessingRef.current = false;
      processQueue();
      return;
    }
    sentOutput.current.add(callId);
    
    incLoop();
    addLine(`🔄 Loop ${loopRef.current}/${MAX_LOOPS} - Processing: ${call.name}`);

    try {
      const result = await executeFunctionCall(
        call, 
        { elkGraph: elkGraphRef.current, setElkGraph: setElkGraph! },
        { addLine },
        elkGraphRef
      );
      
      // Check if the result is an error
      if (result && typeof result === 'string' && result.startsWith('Error:')) {
        incError();
        if (errorRef.current >= MAX_ERRORS) {
          addLine(`🛑 ${MAX_ERRORS} consecutive errors – stopping`);
          setBusy(false);
          isProcessingRef.current = false;
          return;
        }
        addLine(`⚠️ Error ${errorRef.current}/${MAX_ERRORS}: Will retry if possible`);
      } else {
        resetError();      // success ⇒ clear error streak
      }

      // Before opening any new EventSource
      if (loopRef.current >= MAX_LOOPS || errorRef.current >= MAX_ERRORS) {
        // don't reopen a stream at all
        isProcessingRef.current = false;
        return;
      }

      await openFollowUpStream(parentId, callId, typeof result === 'string' ? result : JSON.stringify(result));
      
    } catch (error) {
      console.error('Error processing queue item:', error);
      incError();
      if (errorRef.current >= MAX_ERRORS) {
        addLine(`🛑 ${MAX_ERRORS} consecutive errors – stopping`);
        setBusy(false);
        isProcessingRef.current = false;
        return;
      }
    }

    // Mark as handled and remove from queue
    handledCallsRef.current.add(callId);
    toolCallParent.current.delete(callId);  // hygiene
    pendingCalls.current.delete(callId);    // hygiene
    queueRef.current.shift();
    isProcessingRef.current = false;
    
    // Check if we've finished all queued calls and the main stream is waiting to close
    if (queueRef.current.length === 0) {
      addLine(`🎯 All function calls completed - ready to finish`);
      setBusy(false);
    }
    
    // Process next item in queue
    processQueue();
  };

  const openFollowUpStream = (responseId: string, callId: string, result: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Guard against duplicate outputs (sanity check)
      if (sentOutput.current.has(callId)) {
        console.log(`🚫 Already sent output for call_id: ${callId} (sanity check)`);
        resolve();
        return;
      }
      
      const followUpPayload = JSON.stringify([
        {
          type: "function_call_output",
          call_id: callId,
          output: result
        }
      ]);

      console.log(`🔄 Opening follow-up stream for call_id: ${callId} with response_id: ${responseId}`);
      console.log(`📋 Follow-up payload:`, followUpPayload);
      
      const ev = createPostEventSource(followUpPayload, responseId);
      let followRespId = responseId;   // this stream's own id
      const responseIdRef = { current: followRespId };

      // Create callbacks for the delta handler
      const callbacks: EventHandlerCallbacks = {
        addLine,
        appendToTextLine,
        appendToReasoningLine,
        appendToArgsLine,
        pushCall,
        setBusy
      };

      const handleDelta = createDeltaHandler(callbacks, responseIdRef);

      ev.onmessage = e => {
        const delta = JSON.parse(e.data);
        
        // Handle [DONE] marker from server
        if (e.data === '[DONE]') {
          addLine('🏁 Stream finished - [DONE] received');
          ev.close();
          setBusy(false);
          return;
        }
        
        const result = handleDelta(delta, pendingCalls.current, handledCallsRef.current);
        
        if (result === 'close') {
          ev.close();
          resolve();
        }

        // Update followRespId from responseIdRef
        if (responseIdRef.current) {
          followRespId = responseIdRef.current;
        }
      };
      
      ev.onerror = (error) => {
        console.error('Follow-up EventSource error:', error);
        ev.close();
        
        // Don't treat AbortError as a real error - it's expected when we close the stream
        if (error && (error as any).error?.name === 'AbortError') {
          console.log('📡 Follow-up stream closed normally (AbortError expected)');
          resolve(); // Treat as successful completion
          return;
        }
        
        incError();
        
        if (errorRef.current >= MAX_ERRORS) {
          addLine(`🛑 Stopping after ${MAX_ERRORS} consecutive errors`);
          setBusy(false);
        } else {
          addLine(`❌ Follow-up stream failed (${errorRef.current}/${MAX_ERRORS}) - check console for details`);
        }
        
        reject(error);
      };
      
      ev.onopen = () => {
        addLine("🔄 Continuing stream...");
        resetError(); // Reset error count on successful connection
      };
    });
  };

  const addLine = (line: string) => setLines(ls => [...ls, line]);

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
  };

  const start = () => {
    setBusy(true);
    setLines([]);
    setFunctionCall(null);
    resetLoop();
    resetError();
    
    // Clear queue and handled calls
    queueRef.current = [];
    isProcessingRef.current = false;
    handledCallsRef.current.clear();
    toolCallParent.current.clear();
    sentOutput.current.clear();
    pendingCalls.current.clear();
    
    // Full payload with complete instructions
    const fullPayload = JSON.stringify([
      { 
        role: "system", 
        content: elkGraphDescription  // Full instruction set!
      },
      { 
        role: "user", 
        content: `Build a complete e-commerce microservices architecture by calling multiple functions in sequence.

You must call ALL the functions needed to build this complete architecture:

     1. Create frontend  with React web app and mobile app nodes
     2. Create API gateway group  with authentication, rate limiting, routing nodes  
     3. Create business services group  with Order, Product, User, Payment service nodes
     4. Create data layer group with PostgreSQL, MongoDB, Redis nodes
     5. Create infrastructure group with Load balancer, CDN, Message queue nodes
     6. call multiple functions in sequence to build the complete architecture, use one batch_update per group

The server will now handle the conversation loop automatically. Each function call will be executed and the updated graph state will be returned to continue building the architecture.` 
      }
    ]);

    
    // Check if full payload would be too large for GET
    const fullEncodedLength = encodeURIComponent(fullPayload).length;
    const maxUrlLength = 8000; // Conservative limit
    
    addLine(`📦 Full payload (${fullEncodedLength} chars), using POST...`);
    const ev = createPostEventSource(fullPayload);

    // Track the *current* SSE response id for THIS EventSource
    const responseIdRef = { current: null as string | null };

    // Create callbacks for the delta handler
    const callbacks: EventHandlerCallbacks = {
      addLine,
      appendToTextLine,
      appendToReasoningLine,
      appendToArgsLine,
      pushCall,
      setBusy
    };

    const handleDelta = createDeltaHandler(callbacks, responseIdRef);

    ev.onmessage = e => {
      const delta = JSON.parse(e.data);
      
      // Handle [DONE] marker from server
      if (e.data === '[DONE]') {
        addLine('🏁 Stream finished - [DONE] received');
        ev.close();
        setBusy(false);
        return;
      }
      
      const result = handleDelta(delta, pendingCalls.current, handledCallsRef.current);
      
      if (result === 'close') {
        ev.close();
        setBusy(false);
      }
    };
    
    ev.onerror = (error) => {
      console.error('EventSource error:', error);
      ev.close();
      
      // Don't treat AbortError as a real error - it's expected when we close the stream
      if (error && (error as any).error?.name === 'AbortError') {
        console.log('📡 Stream closed normally (AbortError expected)');
        return;
      }
      
      incError();
      
      if (errorRef.current >= MAX_ERRORS) {
        addLine(`🛑 Stopping after ${MAX_ERRORS} consecutive errors`);
        setBusy(false);
      } else {
        addLine(`❌ Stream failed (${errorRef.current}/${MAX_ERRORS}) - check console for details`);
      }
    };
    
    ev.onopen = () => {
      addLine("🔄 Stream started...");
      resetError(); // Reset error count on successful connection
    };
  };

  return (
    <div className="w-full max-w-full mx-auto p-2 flex flex-col overflow-hidden" style={{ height: '40vh', maxHeight: '40vh' }}>
      <div className="flex items-center gap-4 mb-4 flex-shrink-0 flex-wrap">
        <button 
          onClick={start} 
          disabled={busy || !elkGraphRef.current || !setElkGraph} 
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md disabled:opacity-50 flex-shrink-0"
          data-streamviewer-trigger
        >
          {busy ? "Streaming..." : "Stream + Execute"}
        </button>
        <span className="text-sm text-gray-600 flex-shrink-0">
          {busy ? "🔴 Streaming active" : !elkGraphRef.current ? "⚪ No graph state" : "⚪ Ready"}
        </span>
      </div>
      
      <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-lg flex-1 overflow-auto text-xs border whitespace-pre-wrap break-words break-all min-h-0 w-full" style={{ maxHeight: '35vh', maxWidth: '100%' }}>
        {lines.join("\n")}
      </pre>
    </div>
  );
}
