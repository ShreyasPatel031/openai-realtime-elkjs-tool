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
    } else if (delta.type === "response.completed" || delta.type === "response.done") {
      // Keep the id
      if (!responseIdRef.current && delta.response?.id) {
        responseIdRef.current = delta.response.id;
        console.log("Captured responseId from completed →", responseIdRef.current);
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
    } else if (delta.type === "done" && delta.data === "[DONE]") {
      // Handle the final completion message
      addLine('🏁 Architecture generation completed - done signal received');
      console.log('🏁 Architecture generation complete - done type received with [DONE] data');
      setBusy(false);
      // Trigger completion callback which adds the completion message and closes chat
      if (onComplete) {
        onComplete();
      }
      return 'close';
    } else {
      // Log unknown delta types for debugging
      console.log(`📡 Unknown delta type: ${delta.type}`, delta);
      
      // Still show in UI but with more detail
      if (delta.type) {
        addLine(`📡 ${delta.type}`);
      }
    }
  };
}; 