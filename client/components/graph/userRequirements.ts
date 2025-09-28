// DISABLED: StreamExecutor import - using simple agent instead
// import { StreamExecutor } from "../../reasoning/StreamExecutor";
  import { addReasoningMessage, addFunctionCallingMessage, updateStreamingMessage, addProcessCompleteMessage, makeChatVisible } from "../../utils/chatUtils";

export async function process_user_requirements() {
    console.log('🚀 process_user_requirements: FUNCTION CALLED!');
    
    // Signal that processing has started for the status icon
    window.dispatchEvent(new CustomEvent('userRequirementsStart'));
    
    console.log('📤 Dispatched userRequirementsStart event');
    addReasoningMessage("⚡ Processing your request...");
    console.log('💬 Added reasoning message');
    makeChatVisible();
    console.log('👁️ Made chat visible');
  
  // START PERFORMANCE TIMING
  const processStart = performance.now();

  

  
  try {
    // Get the current text input
    const currentTextInput = (window as any).chatTextInput || '';
    console.log('📝 Current text input from global state:', currentTextInput);
    
    // Handle empty input
    if (!currentTextInput.trim()) {
      console.warn('⚠️ No text input provided');
      return;
    }
    
    console.log('✅ Text input validation passed, proceeding with:', currentTextInput.trim());
    
    // Clear any previous conversation data to start fresh
    (window as any).chatConversationData = "";
    
    // Store current input globally for StreamExecutor to access
    (window as any).chatTextInput = currentTextInput;
    
    const dataCollectionTime = performance.now();
    console.log('⏱️ Data collection time recorded:', dataCollectionTime);

    
    // Update the reasoning message to show progress
    console.log('📝 Calling updateStreamingMessage...');
    updateStreamingMessage(
      null, // messageId will be found automatically
      "🔍 Analyzing your requirements...", 
      true, // isStreaming
      null // currentFunction
    );
    console.log('✅ updateStreamingMessage called successfully');
    
    // Get images from global state
    const storedImages = (window as any).selectedImages || [];
    console.log('🖼️ Retrieved stored images:', storedImages.length, 'images');

          
    // Build conversationData as formatted string
    const conversationData = `USER: ${currentTextInput}

${currentTextInput}`;
    console.log('💬 Built conversation data:', conversationData.length, 'characters');
    
    const conversationPrepTime = performance.now();

    
    // Store globally for StreamExecutor
    (window as any).chatConversationData = conversationData;
    console.log('💾 Stored conversation data globally');

    
    // Notify that we're moving to architecture generation
    console.log('🏗️ Updating message to "Generating architecture..."');
    updateStreamingMessage(
      null, // messageId will be found automatically
      "🏗️ Generating architecture...", 
      true, // isStreaming  
      null // currentFunction
    );
    
    const setupCompleteTime = performance.now();
    console.log('⏱️ Setup complete time:', setupCompleteTime);

    
         // Get current graph state
     const currentGraph = (window as any).getCurrentGraph?.() || { id: "root", children: [] };

    
     // Reasoning message tracking
     let reasoningMessageId: string | null = null;
     let reasoningContent = "";
 
     // Function call message tracking  
     const functionCallMessages = new Map<string, { messageId: string; content: string }>();
     
     // DISABLED: StreamExecutor creation - using simple agent instead
         /*
         const streamExecutor = new StreamExecutor({
       elkGraph: currentGraph,
       apiEndpoint: undefined, // Use default
       setElkGraph: (newGraph: any) => {

         const setGraphFunction = (window as any).setElkGraph;
         if (setGraphFunction && typeof setGraphFunction === 'function') {
           setGraphFunction(newGraph);
         }
       },
      addLine: (message: string) => {

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

      },
      onComplete: () => {
        const completeTime = performance.now();

        
        // Only add completion message if no active streaming
        if (functionCallMessages.size === 0 && !reasoningMessageId) {
          addProcessCompleteMessage();
        }
        
        // Clear reasoning tracking
        reasoningMessageId = null;
        reasoningContent = "";
        

      }
    });
    */
    
    const executorSetupTime = performance.now();

    

    
    // Call the global handleChatSubmit function from InteractiveCanvas
    const handleChatSubmit = (window as any).handleChatSubmit;
    if (handleChatSubmit && typeof handleChatSubmit === 'function') {
      console.log('🚀 Calling handleChatSubmit from process_user_requirements');
      await handleChatSubmit(currentTextInput);
    } else {
      console.error('❌ handleChatSubmit not available - InteractiveCanvas may not be loaded');
      updateStreamingMessage(
        null,
        `❌ Error: Canvas not ready - please refresh the page`,
        false,
        null
      );
    }
    
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

} 