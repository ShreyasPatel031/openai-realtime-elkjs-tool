import { StreamExecutor } from "../../reasoning/StreamExecutor";
import { addReasoningMessage, addFunctionCallingMessage, updateStreamingMessage, addProcessCompleteMessage } from "../../utils/chatUtils";

export function process_user_requirements(): void {
  console.log("[user requirements] process_user_requirements");
  
  console.time("process_user_requirements");
  console.log("🟠 STEP 4: process_user_requirements called - collecting chat data and triggering StreamViewer");

  // Step 1: Try to get conversation data from the current chat
  let conversationData: any[] = [];
  let textInput = "";
  let images: string[] = [];
  
  try {
    // Get text input from global storage (set by ChatBox or other input components)
    const globalTextInput = (window as any).chatTextInput;
    if (globalTextInput && typeof globalTextInput === 'string') {
      textInput = globalTextInput.trim();
      console.log("📝 Found text input:", textInput);
    }

    // Get images from global storage
    const globalImages = (window as any).selectedImages;
    if (globalImages && Array.isArray(globalImages)) {
      images = globalImages;
      console.log("🖼️ Found images:", images.length);
    }

    // Try to get conversation data from chat session
    const chatMessages = (window as any).getChatMessages?.() || [];
    console.log("💬 Found chat messages:", chatMessages.length);
    
    if (chatMessages.length > 0) {
      // Convert chat messages to conversation format
      conversationData = chatMessages.map((msg: any) => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content || msg.question || '',
        type: msg.type
      }));
    }

    // If we have text input but no conversation data, create a simple conversation
    if (textInput && conversationData.length === 0) {
      conversationData = [
        {
          role: 'user',
          content: textInput
        }
      ];
    }

    console.log("🔍 Final conversation data:", conversationData.length, "items");
    
  } catch (error) {
    console.warn("⚠️ Error collecting conversation data:", error);
  }
  
  // Default to simple architecture request if no conversation data
  if (conversationData.length === 0) {
    console.log("📝 No conversation data found, using default architecture");
    conversationData = [
      {
        role: 'user',
        content: textInput || 'Create a cloud architecture'
      }
    ];
  }
  
  // Store conversation data globally so StreamExecutor can access it
  // Convert array to string format that StreamExecutor expects
  let conversationString = "";
  if (conversationData.length > 0) {
    conversationString = conversationData.map(msg => {
      const role = msg.role === 'user' ? 'USER' : 'ASSISTANT';
      const content = typeof msg.content === 'string' ? msg.content : String(msg.content || '');
      return `${role}: ${content}`;
    }).join('\n\n');
  }
  
  (window as any).chatConversationData = conversationString;
  
  // Get current graph state
  const currentGraph = (window as any).getCurrentGraph?.() || { id: "root", children: [], edges: [] };
  console.log("🗂️ Current graph state:", currentGraph);
  
  // Track active streaming messages with accumulated content
  let reasoningMessageId: string | null = null;
  let reasoningContent = "";
  
  const functionCallMessages = new Map<string, { messageId: string; content: string }>(); // itemId -> {messageId, accumulated content}
  
  // Directly instantiate and execute StreamExecutor
  console.log("🟣 STEP 5: Creating StreamExecutor directly...");
  
  try {
    const streamExecutor = new StreamExecutor({
      elkGraph: currentGraph,
      setElkGraph: (newGraph: any) => {
        console.log("📊 StreamExecutor updating graph:", newGraph);
        // Try to update the graph via the global function
        const setGraphFunction = (window as any).setElkGraph;
        if (setGraphFunction && typeof setGraphFunction === 'function') {
          setGraphFunction(newGraph);
        } else {
          console.warn("⚠️ No setElkGraph function available");
        }
      },
      addLine: (line: string) => {
        console.log("📝 Stream:", line);
      },
      appendToTextLine: (text: string) => {
        console.log("📝 Text:", text);
      },
      appendToReasoningLine: (text: string) => {
        console.log("🧠 Reasoning:", text);
        
        // Create reasoning message if it doesn't exist
        if (!reasoningMessageId) {
          reasoningMessageId = addReasoningMessage();
          reasoningContent = "";
        }
        
        // Accumulate reasoning content
        reasoningContent += text;
        
        // Update the streaming reasoning message with accumulated content
        updateStreamingMessage(reasoningMessageId, reasoningContent, false);
      },
      appendToArgsLine: (text: string, itemId?: string) => {
        console.log("🔄 Args:", text, itemId);
        
        if (itemId) {
          // Get or create function call message for this itemId
          let callInfo = functionCallMessages.get(itemId);
          if (!callInfo) {
            const messageId = addFunctionCallingMessage();
            callInfo = { messageId, content: "" };
            functionCallMessages.set(itemId, callInfo);
          }
          
          // Accumulate function call content
          callInfo.content += text;
          
          // Update the streaming function call message with accumulated content
          updateStreamingMessage(callInfo.messageId, callInfo.content, false);
        }
      },
      completeFunctionCall: (itemId: string, functionName?: string) => {
        console.log("✅ Function call complete:", itemId, functionName);
        
        // Mark this specific function call as complete
        const callInfo = functionCallMessages.get(itemId);
        if (callInfo) {
          updateStreamingMessage(callInfo.messageId, callInfo.content, true, functionName);
          functionCallMessages.delete(itemId);
        }
      },
      setBusy: (busy: boolean) => {
        console.log("⏳ Busy:", busy);
      },
      onComplete: () => {
        console.log("✅ StreamExecutor completed!");
        
        // Mark any remaining active messages as complete
        if (reasoningMessageId) {
          updateStreamingMessage(reasoningMessageId, reasoningContent, true);
          reasoningMessageId = null;
          reasoningContent = "";
        }
        
        // Any remaining function calls should be marked complete
        // (Individual function calls should already be closed by completeFunctionCall)
        functionCallMessages.forEach((callInfo, itemId) => {
          console.log("⚠️ Marking remaining function call as complete:", itemId);
          updateStreamingMessage(callInfo.messageId, callInfo.content, true);
        });
        functionCallMessages.clear();
        
        // Only add completion message if no active streaming is happening
        if (functionCallMessages.size === 0 && !reasoningMessageId) {
          addProcessCompleteMessage();
        }
      },
      onError: (error: any) => {
        console.error("❌ StreamExecutor error:", error);
        
        // Mark all active messages as complete on error
        if (reasoningMessageId) {
          updateStreamingMessage(reasoningMessageId, reasoningContent, true);
          reasoningMessageId = null;
          reasoningContent = "";
        }
        
        functionCallMessages.forEach((callInfo, itemId) => {
          updateStreamingMessage(callInfo.messageId, callInfo.content, true);
        });
        functionCallMessages.clear();
      },
      apiEndpoint: undefined // Use default endpoint
    });

    console.log("🚀 STEP 5: Executing StreamExecutor...");
    streamExecutor.execute();
    console.log("✅ STEP 5: StreamExecutor execution started");
    
  } catch (error) {
    console.error("❌ STEP 5: Failed to execute StreamExecutor:", error);
  }
  
  console.timeEnd("process_user_requirements");
} 