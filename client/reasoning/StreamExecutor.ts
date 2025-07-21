import { elkGraphDescription } from "./agentConfig";
import { createPostEventSource } from "./PostEventSource";
import { createDeltaHandler, EventHandlerCallbacks, PendingCall } from "./EventHandlers";
import { executeFunctionCall, GraphState } from "./FunctionExecutor";
import { addProcessCompleteMessage, closeChatWindow, sendArchitectureCompleteToRealtimeAgent } from "../utils/chatUtils";

export interface StreamExecutorOptions {
  elkGraph: any;
  setElkGraph: (graph: any) => void;
  addLine: (line: string) => void;
  appendToTextLine: (text: string) => void;
  appendToReasoningLine: (text: string) => void;
  appendToArgsLine: (text: string) => void;
  setBusy: (busy: boolean) => void;
  onComplete?: () => void;
  onError?: (error: any) => void;
}

export class StreamExecutor {
  private elkGraphRef: React.MutableRefObject<any>;
  private loopRef: React.MutableRefObject<number>;
  private errorRef: React.MutableRefObject<number>;
  private queueRef: React.MutableRefObject<string[]>;
  private isProcessingRef: React.MutableRefObject<boolean>;
  private handledCallsRef: React.MutableRefObject<Set<string>>;
  private toolCallParent: React.MutableRefObject<Map<string, string>>;
  private sentOutput: React.MutableRefObject<Set<string>>;
  private pendingCalls: React.MutableRefObject<Map<string, { name: string; arguments: string; call_id: string }>>;
  
  private readonly MAX_LOOPS = 20;
  private readonly MAX_ERRORS = 3;
  
  private options: StreamExecutorOptions;

  constructor(options: StreamExecutorOptions) {
    this.options = options;
    
    // Initialize refs
    this.elkGraphRef = { current: options.elkGraph };
    this.loopRef = { current: 0 };
    this.errorRef = { current: 0 };
    this.queueRef = { current: [] };
    this.isProcessingRef = { current: false };
    this.handledCallsRef = { current: new Set() };
    this.toolCallParent = { current: new Map() };
    this.sentOutput = { current: new Set() };
    this.pendingCalls = { current: new Map() };
  }

  async execute(): Promise<void> {
    const { addLine, setBusy } = this.options;
    
    setBusy(true);
    this.resetState();
    
    try {
      // Update elkGraphRef to current state
      this.elkGraphRef.current = this.options.elkGraph;
      
      // Get conversation data if available
      let conversationData = (window as any).chatConversationData || "";
      
      // Get additional text input if available
      const additionalTextInput = (window as any).chatTextInput || "";
      
      // Check for globally stored images
      const storedImages = (window as any).selectedImages || [];
      const hasImages = storedImages.length > 0;
      
      // Debug what conversation data, text input, and images we're using
      console.log("🔍 DEBUG: Retrieved conversation data:", conversationData);
      console.log("🔍 DEBUG: Conversation data length:", conversationData.length);
      console.log("🔍 DEBUG: Additional text input:", additionalTextInput);
      console.log("📸 DEBUG: Found stored images:", storedImages.length);
      
      // Clear any potentially cached fake data
      if (conversationData.includes('Which GCP services do you plan to use') || 
          conversationData.includes('Dataflow. Cloud Storage. Web applications')) {
        console.warn("⚠️ Detected fake/cached conversation data, clearing it");
        (window as any).chatConversationData = "";
        conversationData = "";
      }
      
      // Build payload with conversation data or default architecture
      let userContent = "";
      
      // Combine conversation data with additional text input
      const combinedContent = [conversationData, additionalTextInput].filter(content => content.trim()).join('\n\n');
      
      if (combinedContent.trim()) {
        userContent = `${combinedContent}

CRITICAL: The user has already provided specific requirements above. DO NOT ask generic questions about cloud provider, deployment type, or basic architecture choices - these requirements are final.

${hasImages ? `
CRITICAL: The user has provided ${storedImages.length} image(s) that show the exact architecture to replicate. REPLICATE and MIMIC the architecture shown in the image(s) as closely as possible.

When building the architecture:
1. Use the conversation data for functional requirements
2. REPLICATE the visual architecture structure, components, and connections shown in the image(s)
3. Match the component layout, grouping, and relationships depicted in the image(s)
4. Combine conversation requirements with the exact visual structure from the image(s)
5. **CRITICAL**: ONLY use icon names from your available icon list - do NOT invent or create new icon names based on what you see in the image
` : ''}

**🚨 CRITICAL EXECUTION INSTRUCTIONS 🚨**
DO NOT STOP after calling display_elk_graph() once. You MUST continue building the complete architecture:

STEP 1: Call display_elk_graph() to see current state
STEP 2: Use batch_update to create FIRST logical group with ALL its nodes and edges
STEP 3: Use batch_update to create SECOND logical group with ALL its nodes and edges  
STEP 4: Continue with batch_update for EACH logical group until ALL requirements are satisfied
STEP 5: Keep building - do NOT stop after just one or two groups
STEP 6: ONLY call display_elk_graph() again after ALL groups are complete

**CRITICAL: BUILD THE COMPLETE ARCHITECTURE, NOT JUST ONE GROUP!**

Build a complete architecture following these EXACT requirements using proper group icon theming:
- Available Group Icons: Use groupIconName parameter for all group_nodes operations
- AWS: aws_vpc, aws_region, aws_account for AWS-based architectures
- GCP: gcp_system (neutral), gcp_user_default (frontend), gcp_infrastructure_system (APIs), gcp_logical_grouping_services_instances (services), gcp_external_saas_providers (external)
- Azure: azure_subscription_filled, azure_resource_group_filled for Azure architectures

Remember: DO NOT acknowledge or explain. Execute multiple function calls to build the complete architecture.`;
      } else {
        userContent = `Build a complete cloud architecture following this structure:

${hasImages ? `
CRITICAL: The user has provided ${storedImages.length} image(s) showing the exact architecture to replicate. REPLICATE and MIMIC the architecture shown in the image(s) as closely as possible. Do not build a generic architecture - build exactly what is shown in the image(s).
**CRITICAL**: ONLY use icon names from your available icon list - do NOT invent or create new icon names based on what you see in the image.
` : ''}

**🚨 CRITICAL EXECUTION INSTRUCTIONS 🚨**
DO NOT STOP after calling display_elk_graph() once. You MUST continue building the complete architecture:

STEP 1: Call display_elk_graph() to see current state
STEP 2: Use batch_update to create FIRST logical group (frontend/users) with ALL its nodes and edges
STEP 3: Use batch_update to create SECOND logical group (api/gateway) with ALL its nodes and edges  
STEP 4: Use batch_update to create THIRD logical group (backend services) with ALL its nodes and edges
STEP 5: Use batch_update to create FOURTH logical group (data layer) with ALL its nodes and edges
STEP 6: Continue until ALL groups are built (6-10 groups total)
STEP 7: ONLY call display_elk_graph() again after ALL groups are complete

**CRITICAL: BUILD THE COMPLETE ARCHITECTURE, NOT JUST ONE GROUP!**

Example edge relationships:
- Frontend components → API Gateway
- API Gateway → Business Services
- Business Services → Data Layer
- All components → Infrastructure services

CRITICAL: Always specify groupIconName parameter for group_nodes operations - it's required for proper visual theming!

Remember: Do NOT acknowledge or explain. Execute multiple function calls to build the complete architecture.`;
      }
      
      // Clear stored text input after using it
      (window as any).chatTextInput = '';
      
      // Create the conversation payload
      const conversationPayload = [
        { 
          role: "system", 
          content: elkGraphDescription
        },
        { 
          role: "user", 
          content: userContent
        }
      ];
      
      // If we have images, create FormData payload, otherwise use JSON
      let payload;
      let isFormData = false;
      
      if (hasImages) {
        addLine(`📸 Including ${storedImages.length} image(s) in reasoning request...`);
        
        // Create FormData payload
        const formData = new FormData();
        formData.append('conversation', JSON.stringify(conversationPayload));
        
        // Add each image to FormData using the field name 'images' (not 'image_0', 'image_1', etc.)
        storedImages.forEach((imageFile: File, index: number) => {
          formData.append('images', imageFile);
          addLine(`📸 Added image ${index + 1}: ${imageFile.name} (${Math.round(imageFile.size / 1024)}KB)`);
        });
        
        payload = formData;
        isFormData = true;
        
        // Clear stored images after including them
        (window as any).selectedImages = [];
      } else {
        // Use JSON payload as before
        payload = JSON.stringify(conversationPayload);
        isFormData = false;
      }

      if (isFormData) {
        addLine(`📦 FormData payload with ${storedImages.length} image(s), using POST...`);
      } else {
        const fullEncodedLength = encodeURIComponent(payload as string).length;
        addLine(`📦 JSON payload (${fullEncodedLength} chars), using POST...`);
      }
      
      addLine(`📝 Using ${combinedContent.trim() ? 'conversation requirements' : 'generic cloud architecture'}`);
      if (additionalTextInput.trim()) {
        addLine(`📝 Including additional text input: "${additionalTextInput.substring(0, 100)}${additionalTextInput.length > 100 ? '...' : ''}"`);
      }
      
      await this.createMainStream(payload, isFormData);
      
    } catch (error) {
      console.error('StreamExecutor error:', error);
      console.error('StreamExecutor error details:', {
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        errorType: typeof error,
        errorValue: error
      });
      
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message || `${error.name} (no message)`;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        errorMessage = JSON.stringify(error, null, 2);
      }
      
      addLine(`❌ Stream execution failed: ${errorMessage}`);
      setBusy(false);
      this.options.onError?.(error);
      throw error;
    }
  }

  private resetState(): void {
    this.loopRef.current = 0;
    this.errorRef.current = 0;
    this.queueRef.current = [];
    this.isProcessingRef.current = false;
    this.handledCallsRef.current.clear();
    this.toolCallParent.current.clear();
    this.sentOutput.current.clear();
    this.pendingCalls.current.clear();
  }

  private async createMainStream(payload: string | FormData, isFormData: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const { addLine, setBusy } = this.options;
      
      // No timeout - let O3 model take as long as it needs
      
      // Debug: Check if payload contains response IDs
      if (typeof payload === 'string') {
        try {
          const parsedPayload = JSON.parse(payload);
          const responseIds = parsedPayload.filter((item: any) => item.response_id || (item.id && item.id.startsWith('rs_')))
            .map((item: any) => ({ id: item.id, response_id: item.response_id, role: item.role }));
          
          if (responseIds.length > 0) {
            console.log(`🔍 StreamExecutor: Found ${responseIds.length} response IDs in payload:`, responseIds);
          }
        } catch (e) {
          // Ignore parse errors for debugging
        }
      }
      
      const ev = createPostEventSource(payload, undefined);
      const responseIdRef = { current: null as string | null };

      const callbacks: EventHandlerCallbacks = {
        addLine: this.options.addLine,
        appendToTextLine: this.options.appendToTextLine,
        appendToReasoningLine: this.options.appendToReasoningLine,
        appendToArgsLine: this.options.appendToArgsLine,
        pushCall: (pc: PendingCall) => this.pushCall(pc),
        setBusy: this.options.setBusy,
        onComplete: () => {
          // Trigger completion when EventHandlers detects the done signal
          // No timeout to clear - let O3 model take as long as it needs
          this.options.onComplete?.();
          // Add the single completion message
          setTimeout(() => {
            addProcessCompleteMessage();
          }, 500);
          // Send architecture complete notification to real-time agent
          setTimeout(() => {
            sendArchitectureCompleteToRealtimeAgent();
          }, 1000);
        }
      };

      const handleDelta = createDeltaHandler(callbacks, responseIdRef);

      ev.onmessage = e => {
        const delta = JSON.parse(e.data);
        
        if (e.data === '[DONE]') {
          addLine('🏁 Stream finished - [DONE] received');
          console.log('🏁 Architecture generation complete - [DONE] marker received');
          ev.close();
          setBusy(false);
          // ONLY trigger completion here when [DONE] is received
          this.options.onComplete?.();
          // Add the single completion message
          setTimeout(() => {
            addProcessCompleteMessage();
          }, 500);
          // Send architecture complete notification to real-time agent
          setTimeout(() => {
            sendArchitectureCompleteToRealtimeAgent();
          }, 1000);
          resolve();
          return;
        }
        
        const result = handleDelta(delta, this.pendingCalls.current, this.handledCallsRef.current);
        
        if (result === 'close') {
          // No timeout to clear - let O3 model take as long as it needs
          ev.close();
          setBusy(false);
          resolve();
        }
      };
      
      ev.onerror = (error) => {
        console.error('EventSource error:', error);
        console.error('EventSource error details:', {
          error,
          errorDetails: (error as any).error,
          errorType: typeof error,
          errorString: String(error),
          timestamp: new Date().toISOString()
        });
        
        const errorDetails = (error as any).error || error;
        
        // No timeout to clear - let O3 model take as long as it needs
        ev.close();
        
        if (errorDetails?.name === 'AbortError') {
          console.log('📡 Stream closed normally (AbortError expected)');
          resolve();
          return;
        }
        
        // Handle premature close errors more gracefully
        if (errorDetails?.type === 'premature_close' || errorDetails?.message?.includes('Premature close')) {
          console.warn('⚠️ Stream closed prematurely - attempting to continue gracefully');
          addLine(`⚠️ Stream connection interrupted - this may be due to server issues`);
          
          // Don't increment error count for premature close - it's often transient
          if (this.errorRef.current < this.MAX_ERRORS) {
            addLine(`🔄 Will attempt to continue processing any remaining function calls`);
            this.options.setBusy(false);
            resolve(); // Resolve instead of reject for premature close
            return;
          }
        }
        
        // Handle network errors
        if (errorDetails?.type === 'network_error') {
          console.error('❌ Network error detected');
          addLine(`❌ Network error - please check your internet connection`);
          this.incError();
        } else {
          this.incError();
        }
        
        if (this.errorRef.current >= this.MAX_ERRORS) {
          addLine(`🛑 Stopping after ${this.MAX_ERRORS} consecutive errors`);
          console.error(`🛑 StreamExecutor: Reached max errors (${this.MAX_ERRORS}). Last error:`, errorDetails);
          setBusy(false);
          this.options.onError?.(error);
          reject(error);
        } else {
          console.warn(`⚠️ StreamExecutor: Error ${this.errorRef.current}/${this.MAX_ERRORS}:`, errorDetails);
          addLine(`❌ Stream failed (${this.errorRef.current}/${this.MAX_ERRORS}) - check console for details`);
          // Don't reject here - let it continue processing
        }
      };
      
      ev.onopen = () => {
        addLine("🔄 Stream started...");
        this.resetError();
      };
    });
  }

  private pushCall(pc: PendingCall): void {
    if (this.handledCallsRef.current.has(pc.call.call_id)) {
      console.log(`🚫 Skipping already handled call_id: ${pc.call.call_id}`);
      return;
    }
    
    // NEVER store response IDs for multi-server compatibility
    this.toolCallParent.current.set(pc.call.call_id, null);
    this.pendingCalls.current.set(pc.call.call_id, pc.call);
    this.queueRef.current.push(pc.call.call_id);
    console.log(`📥 Queued: ${pc.call.name} - NO response ID stored for multi-server compatibility`);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingRef.current) return;
    if (this.queueRef.current.length === 0) return;

    if (this.loopRef.current >= this.MAX_LOOPS) {
      this.options.addLine(`🛑 Reached ${this.MAX_LOOPS} loops – stopping`);
      this.options.setBusy(false);
      return;
    }

    this.isProcessingRef.current = true;
    const callId = this.queueRef.current[0];
    const call = this.pendingCalls.current.get(callId);
    const parentId = this.toolCallParent.current.get(callId);
    console.log(`🔍 Processing call ${callId} with parentId: ${parentId} (should be null for multi-server compatibility)`);
    
    if (!call) {
      this.options.addLine(`❌ Missing call details for ${callId}`);
      this.queueRef.current.shift();
      this.isProcessingRef.current = false;
      this.processQueue();
      return;
    }
    
    if (this.sentOutput.current.has(callId)) {
      this.options.addLine(`🚫 Output already sent for ${callId}`);
      this.cleanupCall(callId);
      this.isProcessingRef.current = false;
      this.processQueue();
      return;
    }
    this.sentOutput.current.add(callId);
    
    this.incLoop();
    this.options.addLine(`🔄 Loop ${this.loopRef.current}/${this.MAX_LOOPS} - Processing: ${call.name}`);

    try {
      const result = await executeFunctionCall(
        call, 
        { elkGraph: this.elkGraphRef.current, setElkGraph: this.options.setElkGraph },
        { addLine: this.options.addLine },
        this.elkGraphRef
      );
      
      if (result && typeof result === 'string' && result.startsWith('Error:')) {
        this.incError();
        if (this.errorRef.current >= this.MAX_ERRORS) {
          this.options.addLine(`🛑 ${this.MAX_ERRORS} consecutive errors – stopping`);
          this.options.setBusy(false);
          this.isProcessingRef.current = false;
          return;
        }
        this.options.addLine(`⚠️ Error ${this.errorRef.current}/${this.MAX_ERRORS}: Will retry if possible`);
      } else {
        this.resetError();
      }

      if (this.loopRef.current >= this.MAX_LOOPS || this.errorRef.current >= this.MAX_ERRORS) {
        this.isProcessingRef.current = false;
        return;
      }

      // Pass null instead of parentId to ensure no response ID is used
      await this.openFollowUpStream(null, callId, typeof result === 'string' ? result : JSON.stringify(result));
      
    } catch (error) {
      console.error('Error processing queue item:', error);
      this.incError();
      if (this.errorRef.current >= this.MAX_ERRORS) {
        this.options.addLine(`🛑 ${this.MAX_ERRORS} consecutive errors – stopping`);
        this.options.setBusy(false);
        this.isProcessingRef.current = false;
        return;
      }
    }

    this.cleanupCall(callId);
    this.isProcessingRef.current = false;
    
    // Continue processing queue if more items exist - DO NOT trigger completion here
    if (this.queueRef.current.length === 0) {
      this.options.addLine(`🎯 All function calls completed - ${this.loopRef.current} steps processed`);
      this.options.setBusy(false);
      // REMOVED: No completion trigger here - only [DONE] marker should trigger completion
    } else {
      // Still have work to do
      this.processQueue();
    }
  }

  private async openFollowUpStream(responseId: string, callId: string, result: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.sentOutput.current.has(callId)) {
        console.log(`🚫 Already sent output for call_id: ${callId} (sanity check)`);
        resolve();
        return;
      }
      
      let outputContent = result;
      try {
        const parsedResult = JSON.parse(result);
        if (parsedResult.success) {
          outputContent = JSON.stringify({
            ...parsedResult,
            next_action: "Continue building the architecture. Call the next required function without any explanation.",
            reminder: "Do not acknowledge this result. Just execute the next function."
          });
        }
      } catch (e) {
        // Keep as is if not JSON
      }
      
      const followUpPayload = JSON.stringify([
        {
          type: "function_call_output",
          call_id: callId,
          output: outputContent
        }
      ]);

      console.log(`🔄 Opening follow-up stream for call_id: ${callId} (NO response_id continuation)`);
      console.log(`🔍 StreamExecutor: Follow-up payload structure:`, {
        type: "function_call_output",
        call_id: callId,
        output_length: outputContent.length,
        using_response_id: undefined,
        responseId_param: responseId
      });
      
      // DON'T pass responseId - let the server handle conversation state
      const ev = createPostEventSource(followUpPayload, undefined);
      const responseIdRef = { current: null };

      const callbacks: EventHandlerCallbacks = {
        addLine: this.options.addLine,
        appendToTextLine: this.options.appendToTextLine,
        appendToReasoningLine: this.options.appendToReasoningLine,
        appendToArgsLine: this.options.appendToArgsLine,
        pushCall: (pc: PendingCall) => this.pushCall(pc),
        setBusy: this.options.setBusy,
        onComplete: () => {
          // Follow-up streams should not trigger completion
          console.log('⚠️ Follow-up stream tried to trigger completion - ignoring');
        }
      };

      const handleDelta = createDeltaHandler(callbacks, responseIdRef);

      ev.onmessage = e => {
        const delta = JSON.parse(e.data);
        
        if (e.data === '[DONE]') {
          this.options.addLine('🏁 Follow-up stream finished - [DONE] received');
          ev.close();
          this.options.setBusy(false);
          // DO NOT trigger completion here - only main stream should trigger completion
          resolve();
          return;
        }
        
        const result = handleDelta(delta, this.pendingCalls.current, this.handledCallsRef.current);
        
        if (result === 'close') {
          ev.close();
          resolve();
        }
      };
      
      ev.onerror = (error) => {
        console.error('Follow-up EventSource error:', error);
        console.error('Follow-up EventSource error details:', {
          error,
          callId,
          responseId: 'NOT_USED',
          errorType: error && (error as any).error?.name,
          timestamp: new Date().toISOString()
        });
        ev.close();
        
        if (error && (error as any).error?.name === 'AbortError') {
          console.log('📡 Follow-up stream closed normally (AbortError expected)');
          resolve();
          return;
        }
        
        this.incError();
        
        if (this.errorRef.current >= this.MAX_ERRORS) {
          this.options.addLine(`🛑 Stopping after ${this.MAX_ERRORS} consecutive errors`);
          this.options.setBusy(false);
        } else {
          this.options.addLine(`❌ Follow-up stream failed (${this.errorRef.current}/${this.MAX_ERRORS}) - check console for details`);
        }
        
        reject(error);
      };
      
      ev.onopen = () => {
        this.options.addLine("🔄 Continuing stream...");
        this.resetError();
      };
    });
  }

  private cleanupCall(callId: string): void {
    this.handledCallsRef.current.add(callId);
    this.toolCallParent.current.delete(callId);
    this.pendingCalls.current.delete(callId);
    this.queueRef.current.shift();
  }

  private incLoop(): void {
    this.loopRef.current += 1;
  }

  private resetLoop(): void {
    this.loopRef.current = 0;
  }

  private incError(): void {
    this.errorRef.current += 1;
  }

  private resetError(): void {
    this.errorRef.current = 0;
  }
}

/**
 * Utility function to execute streaming directly without DOM manipulation
 * Can be called from process_user_requirements or other components
 */
export const executeStreamDirectly = async (
  elkGraph: any,
  setElkGraph: (graph: any) => void,
  options?: {
    onLog?: (message: string) => void;
    onComplete?: () => void;
    onError?: (error: any) => void;
  }
): Promise<void> => {
  const logs: string[] = [];
  
  const addLine = (line: string) => {
    logs.push(line);
    options?.onLog?.(line);
    console.log(line); // Also log to console for debugging
  };

  const streamOptions: StreamExecutorOptions = {
    elkGraph,
    setElkGraph,
    addLine,
    appendToTextLine: addLine, // For direct execution, just add as normal lines
    appendToReasoningLine: addLine,
    appendToArgsLine: addLine,
    setBusy: (busy: boolean) => {
      // For direct execution, we don't have a UI busy state
      console.log(`🔄 Stream executor busy: ${busy}`);
    },
    onComplete: () => {
      addLine("🎯 Direct stream execution completed!");
      options?.onComplete?.();
    },
    onError: (error) => {
      addLine(`❌ Direct stream execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      options?.onError?.(error);
    }
  };

  const executor = new StreamExecutor(streamOptions);
  await executor.execute();
}; 