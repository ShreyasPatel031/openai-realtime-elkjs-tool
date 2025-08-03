import { StreamExecutor } from "../../reasoning/StreamExecutor";
  import { addReasoningMessage, addFunctionCallingMessage, updateStreamingMessage, addProcessCompleteMessage, makeChatVisible } from "../../utils/chatUtils";

export async function process_user_requirements() {
  console.log('[user requirements] process_user_requirements');
  
  // IMMEDIATE UI FEEDBACK - Show something is happening RIGHT NOW
  addReasoningMessage("⚡ Processing your request...");
  makeChatVisible();
  
  // START PERFORMANCE TIMING
  const processStart = performance.now();
  console.log(`⏱️ USER REQ TIMING: Starting process_user_requirements at ${processStart.toFixed(2)}ms`);
  
  console.log('🟠 STEP 4: process_user_requirements called - collecting chat data and triggering StreamViewer');
  
  try {
    // Get the current text input
    const currentTextInput = (window as any).chatTextInput || '';
    console.log('📝 Current text input:', currentTextInput);
    
    // Handle empty input
    if (!currentTextInput.trim()) {
      console.warn('⚠️ No text input provided');
      return;
    }
    
    // Clear any previous conversation data to start fresh
    (window as any).chatConversationData = "";
    
    // Store current input globally for StreamExecutor to access
    (window as any).chatTextInput = currentTextInput;
    
    const dataCollectionTime = performance.now();
    console.log(`⏱️ USER REQ TIMING: Data collection took ${(dataCollectionTime - processStart).toFixed(2)}ms`);
    
    // Update the reasoning message to show progress
    updateStreamingMessage(
      null, // messageId will be found automatically
      "🔍 Analyzing your requirements...", 
      true, // isStreaming
      null // currentFunction
    );
    
    // Get images from global state
    const storedImages = (window as any).selectedImages || [];
    console.log('🖼️ Found images:', storedImages.length);
    
    // Build conversationData as formatted string
    const conversationData = `USER: ${currentTextInput}

${currentTextInput}`;
    
    const conversationPrepTime = performance.now();
    console.log(`⏱️ USER REQ TIMING: Conversation prep took ${(conversationPrepTime - dataCollectionTime).toFixed(2)}ms`);
    
    // Store globally for StreamExecutor
    (window as any).chatConversationData = conversationData;
    
    console.log('📝 Using fresh conversation with current input only:', currentTextInput);
    
    // Notify that we're moving to architecture generation
    updateStreamingMessage(
      null, // messageId will be found automatically
      "🏗️ Generating architecture...", 
      true, // isStreaming  
      null // currentFunction
    );
    
    const setupCompleteTime = performance.now();
    console.log(`⏱️ USER REQ TIMING: Setup complete after ${(setupCompleteTime - processStart).toFixed(2)}ms`);
    
         // Get current graph state
     const currentGraph = (window as any).getCurrentGraph?.() || { id: "root", children: [] };
     console.log('🗂️ Current graph state:', currentGraph);
     
     // Reasoning message tracking
     let reasoningMessageId: string | null = null;
     let reasoningContent = "";
 
     // Function call message tracking  
     const functionCallMessages = new Map<string, { messageId: string; content: string }>();
     
     // CRITICAL: Create StreamExecutor with all required callbacks
         const streamExecutor = new StreamExecutor({
       elkGraph: currentGraph,
       apiEndpoint: undefined, // Use default
       setElkGraph: (newGraph: any) => {
         console.log("🔄 Graph updated");
         const setGraphFunction = (window as any).setElkGraph;
         if (setGraphFunction && typeof setGraphFunction === 'function') {
           setGraphFunction(newGraph);
         }
       },
      addLine: (message: string) => {
        console.log('🎯 StreamExecutor addLine:', message);
      },
      appendToTextLine: () => {}, // Suppress verbose text logging
      appendToReasoningLine: (text: string) => {
        reasoningContent += text;
        updateStreamingMessage(
          reasoningMessageId,
          reasoningContent,
          true,
          null
        );
      },
      appendToArgsLine: (text: string, itemId: string) => {
        if (!functionCallMessages.has(itemId)) {
          functionCallMessages.set(itemId, {
            messageId: addFunctionCallingMessage("Processing..."),
            content: ""
          });
        }
        
        const callInfo = functionCallMessages.get(itemId)!;
        callInfo.content += text;
        
        updateStreamingMessage(
          callInfo.messageId,
          callInfo.content,
          true,
          null
        );
      },
      completeFunctionCall: (functionName: string, callId: string) => {
          console.log(`⏱️ USER REQ TIMING: Function ${functionName} completed at ${(performance.now() - processStart).toFixed(2)}ms`);
          // Find and update the message to show completion
          const callInfo = functionCallMessages.get(callId);
          if (callInfo) {
              updateStreamingMessage(callInfo.messageId, callInfo.content, true, functionName);
          }
          
          // Remove the message from active function calls
          functionCallMessages.delete(callId);
          
          // Graph is already updated by handleFunctionCall - no need to override it here
      },
      setBusy: (busy: boolean) => {
        console.log('⏳ Busy:', busy);
      },
      onComplete: () => {
        const completeTime = performance.now();
        console.log(`⏱️ USER REQ TIMING: TOTAL COMPLETION TIME: ${(completeTime - processStart).toFixed(2)}ms`);
        
        // Only add completion message if no active streaming
        if (functionCallMessages.size === 0 && !reasoningMessageId) {
          addProcessCompleteMessage();
        }
        
        // Clear reasoning tracking
        reasoningMessageId = null;
        reasoningContent = "";
        
        console.log('✅ Architecture generation complete!');
      }
    });
    
    const executorSetupTime = performance.now();
    console.log(`⏱️ USER REQ TIMING: StreamExecutor setup took ${(executorSetupTime - setupCompleteTime).toFixed(2)}ms`);
    
    console.log('🚀 STEP 5: Executing StreamExecutor...');
    
    // Execute the stream
    await streamExecutor.execute();
    
    console.log('✅ STEP 5: StreamExecutor execution started');
    
  } catch (error) {
    console.error('❌ Error in process_user_requirements:', error);
    updateStreamingMessage(
      null,
      `❌ Error: ${error}`,
      false,
      null
    );
  }
  
  const processEnd = performance.now();
  console.log(`⏱️ USER REQ TIMING: process_user_requirements total time: ${(processEnd - processStart).toFixed(2)}ms`);
} 