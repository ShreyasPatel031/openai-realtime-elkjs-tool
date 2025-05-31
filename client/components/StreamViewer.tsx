import React, { useState, useRef, useEffect } from "react";
import { handleFunctionCall } from "../realtime/handleFunctionCall";
import { addNode, deleteNode, moveNode, addEdge, deleteEdge, groupNodes, removeGroup, batchUpdate } from "./graph/mutations";
import { exampleArchitectureBuild, elkGraphDescription } from "./architectureInstructions";

// Define the instruction to include with all function responses
const agentInstruction = "Under no circumstances should you say anything to the user, do not acknowledge their requests, do not explain your actions, do not acknowledge your function call, do not ask if they have further modificaitons, do not ask what's the next action they want you to perform, do not say you are ready for the next instruction, do not say next instruction please, don't say you are listening for the next instruction, just listen quitely for the next instruction.";

interface StreamViewerProps {
  elkGraph?: any;
  setElkGraph?: (graph: any) => void;
}

// Custom EventSource-like interface for POST + SSE
interface PostEventSource extends EventTarget {
  readyState: number;
  url: string;
  withCredentials: boolean;
  close(): void;
  onmessage: ((this: EventSource, ev: MessageEvent) => any) | null;
  onerror: ((this: EventSource, ev: Event) => any) | null;
  onopen: ((this: EventSource, ev: Event) => any) | null;
  CONNECTING: number;
  OPEN: number;
  CLOSED: number;
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
  interface PendingCall {
    call: { name: string; arguments: string; call_id: string };
    responseId: string;               // the response that contained the tool-call
  }
  
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
      const result = await executeFunctionCall(call);
      
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

  // Helper to create EventSource-like object using POST + SSE parsing
  const createPostEventSource = (payload: string, prevId?: string): PostEventSource => {
    const controller = new AbortController();
    
    // Create EventSource-like object
    const source = new EventTarget() as PostEventSource;
    source.readyState = 0; // CONNECTING
    source.url = '/stream';
    source.withCredentials = false;
    source.onmessage = null;
    source.onerror = null;
    source.onopen = null;
    source.CONNECTING = 0;
    source.OPEN = 1;
    source.CLOSED = 2;
    
    // Add close method
    source.close = () => {
      source.readyState = 2; // CLOSED
      controller.abort();
    };
    
    // Start the fetch request
    const startFetch = async () => {
      try {
        console.log('🔄 Attempting POST request to /stream...');
        
        // Use JSON format for cleaner API
        const requestBody = JSON.stringify({
          payload: payload,
          ...(prevId && { previous_response_id: prevId })
        });
        
        console.log('📦 POST body format: JSON, length:', requestBody.length);
        
        const response = await fetch('/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: requestBody,
          signal: controller.signal,
        });
        
        console.log(`📡 POST response status: ${response.status} ${response.statusText}`);
        console.log(`📡 Response headers:`, Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Check if response is actually SSE
        const responseContentType = response.headers.get('content-type');
        if (!responseContentType?.includes('text/event-stream')) {
          console.warn(`⚠️ Unexpected content-type: ${responseContentType}`);
        }
        
        source.readyState = 1; // OPEN
        const openEvent = new Event('open');
        source.dispatchEvent(openEvent);
        if (source.onopen) source.onopen.call(source as any, openEvent);
        
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body reader available');
        }
        
        const decoder = new TextDecoder();
        let buffer = '';
        let messageCount = 0;
        
        // Read the stream
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log(`📡 Stream ended after ${messageCount} messages`);
            source.readyState = 2; // CLOSED
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          console.log(`📡 Raw chunk received (${chunk.length} chars):`, chunk.substring(0, 200) + '...');
          buffer += chunk;
          
          // Process complete SSE messages
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.trim() === '') continue; // Skip empty lines
            
            console.log(`📡 Processing line: "${line}"`);
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                console.log('📡 Received [DONE] marker');
                continue;
              }
              
              messageCount++;
              console.log(`📨 Received message ${messageCount}:`, data.substring(0, 100) + '...');
              
              // Dispatch message event
              const messageEvent = new MessageEvent('message', { data });
              source.dispatchEvent(messageEvent);
              if (source.onmessage) source.onmessage.call(source as any, messageEvent);
            } else if (line.startsWith('event: ') || line.startsWith('id: ') || line.startsWith('retry: ')) {
              console.log(`📡 SSE metadata: ${line}`);
            } else {
              console.log(`📡 Unexpected line format: "${line}"`);
            }
          }
        }
        
      } catch (error) {
        console.error('❌ POST EventSource error:', error);
        source.readyState = 2; // CLOSED
        
        // Don't treat AbortError as a real error - it's expected when we close the stream
        if (error.name === 'AbortError') {
          console.log('📡 Stream closed normally (AbortError expected)');
          return; // Don't dispatch error event for normal closure
        }
        
        const errorEvent = new Event('error');
        (errorEvent as any).error = error;
        source.dispatchEvent(errorEvent);
        if (source.onerror) source.onerror.call(source as any, errorEvent);
      }
    };
    
    // Start the fetch
    startFetch();
    
    return source;
  };

  // Fallback to GET with smaller payload
  const createGetEventSource = (payload: string, prevId?: string): EventSource => {
    let url = `/stream?payload=${encodeURIComponent(payload)}`;
    if (prevId) {
      url += `&previous_response_id=${encodeURIComponent(prevId)}`;
    }
    console.log(`🔄 Falling back to GET request, URL length: ${url.length}`);
    return new EventSource(url);
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

      ev.onmessage = e => {
        const delta = JSON.parse(e.data);
        
        // Handle [DONE] marker from server
        if (e.data === '[DONE]') {
          addLine('🏁 Stream finished - [DONE] received');
          ev.close();
          setBusy(false);
          return;
        }
        
        if (delta.type === "response.started" || delta.type === "response.created") {
          followRespId = delta.response?.id ?? followRespId;
        }
        
        // Handle different delta types from the Responses API
        if (delta.type === "response.delta") {
          // Main response content
          if (delta.delta?.content) {
            appendToTextLine(delta.delta.content);
          }
        } else if (delta.type === "reasoning.delta") {
          // Reasoning text
          if (delta.delta) {
            appendToReasoningLine(delta.delta);
          }
        } else if (delta.type === "reasoning.summary_text.delta") {
          // Reasoning summary text
          if (delta.delta) {
            appendToReasoningLine(delta.delta);
          }
        } else if (delta.type === "response.reasoning_summary_text.delta") {
          // Response reasoning summary text (actual API format)
          if (delta.delta) {
            appendToReasoningLine(delta.delta);
          }
        } else if (delta.type === "function_call.delta") {
          // Function call arguments being built
          if (delta.delta?.arguments) {
            appendToArgsLine(delta.delta.arguments);
          }
        } else if (delta.type === "response.function_call_arguments.delta") {
          // Response function call arguments being built (actual API format)
          if (delta.delta) {
            appendToArgsLine(delta.delta);
          }
        } else if (delta.type === "function_call.done") {
          // Complete function call
          const funcCall = delta.function_call;
          if (funcCall) {
            addLine(`🎯 Function call: ${funcCall.name}`);
            addLine(`📝 Args: ${funcCall.arguments}`);
            
            // Guard against duplicate tool calls
            if (pendingCalls.current.has(funcCall.call_id) || handledCallsRef.current.has(funcCall.call_id)) {
              console.log('🔁 duplicate tool-call ignored (function_call.done)');
              return;
            }
            
            // Queue the function call with the correct response ID
            if (followRespId) {
              pushCall({
                call: {
                  name: funcCall.name,
                  arguments: funcCall.arguments,
                  call_id: funcCall.call_id || funcCall.id
                },
                responseId: followRespId
              });
            } else {
              addLine("❌ No response ID available for function call");
            }
          }
        } else if (delta.type === "response.function_call_arguments.done") {
          // Response function call arguments complete (actual API format)
          const funcCall = delta.function_call;
          if (funcCall) {
            addLine(`🎯 Function call: ${funcCall.name}`);
            addLine(`📝 Args: ${funcCall.arguments}`);
            
            // Guard against duplicate tool calls
            if (pendingCalls.current.has(funcCall.call_id) || handledCallsRef.current.has(funcCall.call_id)) {
              console.log('🔁 duplicate tool-call ignored (response.function_call_arguments.done)');
              return;
            }
            
            // Queue the function call with the correct response ID
            if (followRespId) {
              pushCall({
                call: {
                  name: funcCall.name,
                  arguments: funcCall.arguments,
                  call_id: funcCall.call_id || funcCall.id
                },
                responseId: followRespId
              });
            } else {
              addLine("❌ No response ID available for function call");
            }
          }
        } else if (delta.type === "response.output_item.done" && delta.item?.type === "function_call") {
          // Alternative function call format (if the API uses this)
          const funcCall = delta.item;
          addLine(`🎯 Function call: ${funcCall.name}`);
          addLine(`📝 Args: ${funcCall.arguments}`);
          
          // Guard against duplicate tool calls
          if (pendingCalls.current.has(funcCall.call_id) || handledCallsRef.current.has(funcCall.call_id)) {
            console.log('🔁 duplicate tool-call ignored (response.output_item.done)');
            return;
          }
          
          // Queue the function call with the correct response ID
          if (followRespId) {
            pushCall({
              call: {
                name: funcCall.name,
                arguments: funcCall.arguments,
                call_id: funcCall.call_id
              },
              responseId: followRespId
            });
          } else {
            addLine("❌ No response ID available for function call");
          }
        } else if (delta.type === "response.completed" || delta.type === "response.done") {
          /* ─────────── keep the id ─────────── */
          if (!followRespId && delta.response?.id) {
            followRespId = delta.response.id;
            console.log("Captured currentResponseId from completed →", followRespId);
          }

          addLine(`✅ Follow-up stream completed`);
          const usage = delta.response?.usage || delta.usage;
          if (usage?.reasoning_tokens) {
            addLine(`🧠 Reasoning tokens used: ${usage.reasoning_tokens}`);
          }
          if (usage?.total_tokens) {
            addLine(`📊 Total tokens: ${usage.total_tokens}`);
          }
          
          ev.close();
          resolve();
          
        } else {
          // Log unknown delta types for debugging
          console.log(`📡 Unknown delta type: ${delta.type}`, delta);
          
          // Still show in UI but with more detail
          if (delta.type) {
            addLine(`📡 ${delta.type}`);
          }
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

  const executeFunctionCall = async (functionCall: any) => {
    if (!setElkGraph) {
      addLine("❌ No graph state setter available");
      return "Error: No graph state setter available";
    }

    addLine(`🔧 Executing function: ${functionCall.name}`);
    
    // Log graph state before operation (using current ref value)
    console.log("📊 Graph state BEFORE operation:", elkGraphRef.current);
    
    let capturedError: string | null = null;

    try {
      // Use the existing handleFunctionCall function with current graph state
      handleFunctionCall(
        {
          name: functionCall.name,
          arguments: functionCall.arguments,
          call_id: functionCall.call_id
        },
        {
          elkGraph: elkGraphRef.current,
          setElkGraph: (newGraph: any) => {
            // Log graph state after operation
            console.log("📊 Graph state AFTER operation:", newGraph);
            console.log("🔄 Graph layout changes detected - updating state");
            setElkGraph(newGraph);
          },
          mutations: {
            addNode,
            deleteNode,
            moveNode,
            addEdge,
            deleteEdge,
            groupNodes,
            removeGroup,
            batchUpdate
          },
          safeSend: (event: any) => {
            // Let handleFunctionCall do its job - we don't need to intercept
            // Just log what's being sent for debugging
            console.log("📤 safeSend called with:", event);
          }
        }
      );
      
      addLine(`✅ Function executed successfully: ${functionCall.name}`);
      addLine(`📊 Graph updated! Check the canvas for changes.`);
      addLine(`🔍 Graph state logged to console`);
      return {
        graph: elkGraphRef.current
      };
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addLine(`❌ Function execution failed: ${errorMsg}`);
      console.error("❌ Function execution error:", error);
      return `Error: ${errorMsg}`;
    }
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

    // Function to set up event handlers (extracted to avoid duplication)
    const setupEventHandlers = (eventSource: EventSource | PostEventSource) => {
      // Track the *current* SSE response id for THIS EventSource
      let currentResponseId: string | null = null;

      eventSource.onmessage = e => {
        const delta = JSON.parse(e.data);
        
        // Handle [DONE] marker from server
        if (e.data === '[DONE]') {
          addLine('🏁 Stream finished - [DONE] received');
          eventSource.close();
          setBusy(false);
          return;
        }
        
        // ===== keep a live response-id pointer =====
        if (delta.type === "response.started" || delta.type === "response.created") {
          currentResponseId = delta.response?.id ?? currentResponseId;
        }

        // Handle different delta types from the Responses API
        if (delta.type === "response.delta") {
          // Main response content
          if (delta.delta?.content) {
            appendToTextLine(delta.delta.content);
          }
        } else if (delta.type === "reasoning.delta") {
          // Reasoning text
          if (delta.delta) {
            appendToReasoningLine(delta.delta);
          }
        } else if (delta.type === "reasoning.summary_text.delta") {
          // Reasoning summary text
          if (delta.delta) {
            appendToReasoningLine(delta.delta);
          }
        } else if (delta.type === "response.reasoning_summary_text.delta") {
          // Response reasoning summary text (actual API format)
          if (delta.delta) {
            appendToReasoningLine(delta.delta);
          }
        } else if (delta.type === "function_call.delta") {
          // Function call arguments being built
          if (delta.delta?.arguments) {
            appendToArgsLine(delta.delta.arguments);
          }
        } else if (delta.type === "response.function_call_arguments.delta") {
          // Response function call arguments being built (actual API format)
          if (delta.delta) {
            appendToArgsLine(delta.delta);
          }
        } else if (delta.type === "function_call.done") {
          // Complete function call
          const funcCall = delta.function_call;
          if (funcCall) {
            addLine(`🎯 Function call: ${funcCall.name}`);
            addLine(`📝 Args: ${funcCall.arguments}`);
            
            // Guard against duplicate tool calls
            if (pendingCalls.current.has(funcCall.call_id) || handledCallsRef.current.has(funcCall.call_id)) {
              console.log('🔁 duplicate tool-call ignored (function_call.done)');
              return;
            }
            
            // Queue the function call with the correct response ID
            if (currentResponseId) {
              pushCall({
                call: {
                  name: funcCall.name,
                  arguments: funcCall.arguments,
                  call_id: funcCall.call_id || funcCall.id
                },
                responseId: currentResponseId
              });
            } else {
              addLine("❌ No response ID available for function call");
            }
          }
        } else if (delta.type === "response.function_call_arguments.done") {
          // Response function call arguments complete (actual API format)
          const funcCall = delta.function_call;
          if (funcCall) {
            addLine(`🎯 Function call: ${funcCall.name}`);
            addLine(`📝 Args: ${funcCall.arguments}`);
            
            // Guard against duplicate tool calls
            if (pendingCalls.current.has(funcCall.call_id) || handledCallsRef.current.has(funcCall.call_id)) {
              console.log('🔁 duplicate tool-call ignored (response.function_call_arguments.done)');
              return;
            }
            
            // Queue the function call with the correct response ID
            if (currentResponseId) {
              pushCall({
                call: {
                  name: funcCall.name,
                  arguments: funcCall.arguments,
                  call_id: funcCall.call_id || funcCall.id
                },
                responseId: currentResponseId
              });
            } else {
              addLine("❌ No response ID available for function call");
            }
          }
        } else if (delta.type === "response.output_item.done" && delta.item?.type === "function_call") {
          // Alternative function call format (if the API uses this)
          const funcCall = delta.item;
          addLine(`🎯 Function call: ${funcCall.name}`);
          addLine(`📝 Args: ${funcCall.arguments}`);
          
          // Guard against duplicate tool calls
          if (pendingCalls.current.has(funcCall.call_id) || handledCallsRef.current.has(funcCall.call_id)) {
            console.log('🔁 duplicate tool-call ignored (response.output_item.done)');
            return;
          }
          
          // Queue the function call with the correct response ID
          if (currentResponseId) {
            pushCall({
              call: {
                name: funcCall.name,
                arguments: funcCall.arguments,
                call_id: funcCall.call_id
              },
              responseId: currentResponseId
            });
          } else {
            addLine("❌ No response ID available for function call");
          }
        } else if (delta.type === "response.completed" || delta.type === "response.done") {
          /* ─────────── keep the id ─────────── */
          if (!currentResponseId && delta.response?.id) {
            currentResponseId = delta.response.id;
            console.log("Captured currentResponseId from completed →", currentResponseId);
          }

          addLine(`✅ Stream completed`);
          const usage = delta.response?.usage || delta.usage;
          if (usage?.reasoning_tokens) {
            addLine(`🧠 Reasoning tokens used: ${usage.reasoning_tokens}`);
          }
          if (usage?.total_tokens) {
            addLine(`📊 Total tokens: ${usage.total_tokens}`);
          }
          
          // Leave the stream open; the server will send [DONE] when truly finished
          // The backend manages the conversation loop and will close when done
        } else {
          // Log unknown delta types for debugging
          console.log(`📡 Unknown delta type: ${delta.type}`, delta);
          
          // Still show in UI but with more detail
          if (delta.type) {
            addLine(`📡 ${delta.type}`);
          }
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        eventSource.close();
        
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
      
      eventSource.onopen = () => {
        addLine("🔄 Stream started...");
        resetError(); // Reset error count on successful connection
      };
    };
    
    setupEventHandlers(ev);
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
