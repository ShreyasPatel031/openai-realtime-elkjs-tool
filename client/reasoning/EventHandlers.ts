// Types for function call handling
export interface PendingCall {
  call: { name: string; arguments: string; call_id: string };
  responseId: string;
}

export interface EventHandlerCallbacks {
  addLine: (line: string) => void;
  appendToTextLine: (text: string) => void;
  appendToReasoningLine: (text: string) => void;
  appendToArgsLine: (text: string) => void;
  pushCall: (pc: PendingCall) => void;
  setBusy: (busy: boolean) => void;
  onComplete?: () => void; // Add completion callback
}

// Function to handle different delta types from the API response
export const createDeltaHandler = (callbacks: EventHandlerCallbacks, responseIdRef: { current: string | null }) => {
  const { addLine, appendToTextLine, appendToReasoningLine, appendToArgsLine, pushCall, setBusy, onComplete } = callbacks;
  
  return (delta: any, pendingCalls: Map<string, any>, handledCalls: Set<string>) => {
    // Debug: Log all delta types to see what we're getting
    if (delta && delta.type) {
      console.log(`🔍 DEBUG: Received delta type: ${delta.type}`, delta);
    }
    
    // Handle [DONE] marker from server
    if (delta === '[DONE]') {
      addLine('🏁 Stream finished - [DONE] received');
      setBusy(false);
      return 'close';
    }
    
    // Update response ID tracking
    if (delta.type === "response.started" || delta.type === "response.created") {
      responseIdRef.current = delta.response?.id ?? responseIdRef.current;
    }

    // Handle different delta types from the Responses API
    if (delta.type === "response.delta") {
      // Main response content
      if (delta.delta?.content) {
        appendToTextLine(delta.delta.content);
      }
    } else if (delta.type === "response.output_text.delta") {
      // Handle text output deltas (common type)
      if (delta.delta) {
        appendToTextLine(delta.delta);
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
        if (pendingCalls.has(funcCall.call_id) || handledCalls.has(funcCall.call_id)) {
          console.log('🔁 duplicate tool-call ignored (function_call.done)');
          return;
        }
        
        // Queue the function call with the correct response ID
        if (responseIdRef.current) {
          pushCall({
            call: {
              name: funcCall.name,
              arguments: funcCall.arguments,
              call_id: funcCall.call_id || funcCall.id
            },
            responseId: responseIdRef.current
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
        if (pendingCalls.has(funcCall.call_id) || handledCalls.has(funcCall.call_id)) {
          console.log('🔁 duplicate tool-call ignored (response.function_call_arguments.done)');
          return;
        }
        
        // Queue the function call with the correct response ID
        if (responseIdRef.current) {
          pushCall({
            call: {
              name: funcCall.name,
              arguments: funcCall.arguments,
              call_id: funcCall.call_id || funcCall.id
            },
            responseId: responseIdRef.current
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
      if (pendingCalls.has(funcCall.call_id) || handledCalls.has(funcCall.call_id)) {
        console.log('🔁 duplicate tool-call ignored (response.output_item.done)');
        return;
      }
      
      // Queue the function call with the correct response ID
      if (responseIdRef.current) {
        pushCall({
          call: {
            name: funcCall.name,
            arguments: funcCall.arguments,
            call_id: funcCall.call_id
          },
          responseId: responseIdRef.current
        });
      } else {
        addLine("❌ No response ID available for function call");
      }
    } else if (delta.type === "function_call_output") {
      // Handle function call output events from the server
      console.log(`📨 Function output received: ${delta.call_id}`);
      
      // Mark this call as handled to prevent the StreamExecutor from trying to send another output
      if (handledCalls) {
        handledCalls.add(delta.call_id);
      }
    } else if (delta.type === "error") {
      // Handle error events from the server
      const errorMessage = delta.error || 'Unknown error';
      
      // Enhance error messages with recovery information but still show them
      let displayMessage = errorMessage;
      let recoveryInfo = '';
      
      // Add context for 404 errors
      if (errorMessage.includes('404') && errorMessage.includes('not found')) {
        const isResponseIdError = errorMessage.includes('rs_') || errorMessage.includes('response');
        const isFunctionCallError = errorMessage.includes('fc_') || errorMessage.includes('function');
        const isMessageIdError = errorMessage.includes('msg_') || errorMessage.includes('message');
        const isOtherOpenAIId = errorMessage.match(/(run_|thread_|asst_|chatcmpl_)/);
        
        if (isResponseIdError || isFunctionCallError || isMessageIdError || isOtherOpenAIId) {
          recoveryInfo = ' (Server attempting automatic recovery with fresh conversation)';
        }
      }
      
      // Add context for connection errors
      if (errorMessage.includes('Socket timeout')) {
        recoveryInfo = ' (Automatic reconnection in progress - O3 model processing time)';
      } else if (errorMessage.includes('Premature close')) {
        recoveryInfo = ' (Automatic reconnection in progress - connection issue)';
      } else if (errorMessage.includes('session may have expired')) {
        recoveryInfo = ' (Server creating fresh conversation session)';
      }
      
      // Show all errors with enhanced context
      addLine(`❌ Error: ${displayMessage}${recoveryInfo}`);
      console.error('❌ Stream error:', delta);
      console.error('❌ Stream error details:', {
        errorType: delta.type,
        errorMessage,
        recoveryInfo,
        fullDelta: delta,
        timestamp: new Date().toISOString()
      });
    } else if (delta.type === "response.completed" || delta.type === "response.done") {
      // Keep the id
      if (!responseIdRef.current && delta.response?.id) {
        responseIdRef.current = delta.response.id;
      }

      const usage = delta.response?.usage || delta.usage;
      if (usage?.reasoning_tokens) {
        addLine(`🧠 Reasoning tokens: ${usage.reasoning_tokens}`);
      }
      if (usage?.total_tokens) {
        addLine(`📊 Total tokens: ${usage.total_tokens}`);
      }
      
      // Leave the stream open; the server will send [DONE] when truly finished
      // The backend manages the conversation loop and will close when done
    } else if (delta.type === "done" && delta.data === "[DONE]") {
      // Handle the final completion message
      addLine('🏁 Architecture generation completed - done signal received');
      console.log('🏁 Architecture generation complete - done type received with [DONE] data');
      setBusy(false);
      // Trigger completion callback which adds the completion message and closes chat
      if (onComplete) {
        onComplete();
      }
      // Send architecture complete notification to real-time agent
      setTimeout(() => {
        // sendArchitectureCompleteToRealtimeAgent();
      }, 1500);
      return 'close';
    } else if (delta.type?.includes('.done') || delta.type?.includes('.delta')) {
      // Silently handle common .done and .delta types that don't need processing
      // This prevents log spam for response.output_text.done, response.content_part.done, etc.
    } else {
      // Only log truly unknown/unexpected delta types
      if (delta.type && !delta.type.startsWith('response.')) {
        console.log(`📡 Unknown delta type: ${delta.type}`);
      }
    }
  };
};