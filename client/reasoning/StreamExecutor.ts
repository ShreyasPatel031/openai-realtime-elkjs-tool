import { createPostEventSource } from "./PostEventSource";
import { createDeltaHandler, DeltaHandlerCallbacks, PendingCall } from "./EventHandlers";
import { executeFunctionCall, GraphState } from "./FunctionExecutor";
import { addProcessCompleteMessage, closeChatWindow, sendArchitectureCompleteToRealtimeAgent } from "../utils/chatUtils";
import { architectureSearchService } from "../utils/architectureSearchService";

export interface StreamExecutorOptions {
  elkGraph: any;
  setElkGraph: (graph: any) => void;
  addLine: (line: string) => void;
  appendToTextLine: (text: string) => void;
  appendToReasoningLine: (text: string) => void;
  appendToArgsLine: (text: string, itemId?: string) => void;
  completeFunctionCall?: (itemId: string, functionName?: string) => void;
  setBusy: (busy: boolean) => void;
  onComplete?: () => void;
  onError?: (error: any) => void;
  apiEndpoint?: string;
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
  private responseIdRef: React.MutableRefObject<string | null>;
  private finalizationAttemptedRef: React.MutableRefObject<boolean>;
  
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
    this.responseIdRef = { current: null };
    this.finalizationAttemptedRef = { current: false };
  }

  async execute(): Promise<void> {
    const { addLine, setBusy } = this.options;
    
  
    setBusy(true);
    this.resetState();
    
    // START TIMING ANALYSIS
    const timingStart = performance.now();
    let lastTiming = timingStart;
    
    const logTiming = (stage: string) => {
      const now = performance.now();
      const stageTime = now - lastTiming;
      const totalTime = now - timingStart;

      lastTiming = now;
    };
    
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
      // Retrieved conversation data and additional input

      
      logTiming("Initial data collection");
      
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
      
      logTiming("Data preparation");
      
      // Search for matching reference architecture
      let referenceArchitecture = "";


      
      if (combinedContent.trim()) {
        try {
          const searchInput = combinedContent.toLowerCase();

          
          // Check if service is ready
          const availableArchs = architectureSearchService.getAvailableArchitectures();

          
          if (availableArchs.length === 0) {
            console.warn('⚠️ No architectures loaded in service yet, proceeding without reference');
            addLine(`⚠️ Architecture database not ready, proceeding without reference`);
            } else {
            // Use the optimized architecture search with pre-computed embeddings
              const matchedArch = await architectureSearchService.findMatchingArchitecture(searchInput);
              
              if (matchedArch) {
                referenceArchitecture = `\n\nREFERENCE ARCHITECTURE:
This is a reference architecture for the use case. Please replicate it:
${matchedArch.architecture}`;
                
                // Enhanced logging with URL


                // Debug: Log the full architecture content being appended
                if ((window as any).__LLM_DEBUG__) {
                  console.log('%c📐 reference architecture (full)', 'color:#06f', matchedArch.architecture);
                }
                
                addLine(`🏗️ Found reference architecture: ${matchedArch.subgroup}`);
                addLine(`🔗 Reference URL: ${matchedArch.source}`);
          } else {
              console.log('❌ No suitable architecture match found');
              addLine(`⚠️ No matching reference architecture found`);
            }
          }
        } catch (error) {
          console.warn("⚠️ Architecture search failed:", error);
        }
      }
      
      logTiming("Architecture search");
      
      if (combinedContent.trim()) {
        userContent = `${combinedContent}${referenceArchitecture}

${hasImages ? `The user has provided ${storedImages.length} image(s) showing the exact architecture to replicate. REPLICATE and MIMIC the architecture shown in the image(s) as closely as possible.` : ''}

Build a complete architecture based on the above requirements.`;
      } else {
        userContent = `Build a complete cloud architecture.${referenceArchitecture}

${hasImages ? `The user has provided ${storedImages.length} image(s) showing the exact architecture to replicate. REPLICATE and MIMIC the architecture shown in the image(s) as closely as possible.` : ''}`;
      }
      
      // Clear stored text input after using it
      (window as any).chatTextInput = '';
      
      // Get current graph state for context using the same format as "Show ELK Data"
      const currentGraphState = this.getStructuralData(this.elkGraphRef.current);
      const currentGraphJSON = JSON.stringify(currentGraphState, null, 2);

      
      logTiming("Content building");
      
      // Do NOT send CURRENT GRAPH STATE up-front. We will include the updated graph state
      // only after each tool execution in the follow-up tool output.
      const userContentWithGraph = `${userContent}`;

      const conversationPayload = [
        { 
          role: "user", 
          content: userContentWithGraph
        }
      ];
      // Debug: Log the exact user content being sent to the agent
      if ((window as any).__LLM_DEBUG__) {
        console.log('%c🛰️  ► user content to agent', 'color:#08f', userContentWithGraph);
      }
      
      logTiming("Payload assembly");
      
      // Show immediate loading indicator
      addLine(`🚀 Sending request to AI model...`);
      
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
    this.finalizationAttemptedRef.current = false;
  }

  // Extract structural data (same as InteractiveCanvas getStructuralData)
  private getStructuralData(graph: any): any {
    if (!graph) return null;
    
    const extractStructuralData = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(extractStructuralData);
      }
      
      const structural: any = {};
      
      // Only keep core structural properties that define the graph's logical state
      const allowedProperties = [
        'id',           // Node/Edge identification
        'type',         // Node/Edge type
        'children',     // Hierarchical structure
        'edges',        // Edge connections
        'source',       // Edge source
        'target',       // Edge target
        'sourcePort',   // Edge source port
        'targetPort',   // Edge target port
        'labels',       // Text labels
        'properties',   // Custom properties
        'data',         // Custom data
        'text'          // Label text
      ];
      
      for (const [key, value] of Object.entries(obj)) {
        // Only include explicitly allowed structural properties
        if (allowedProperties.includes(key)) {
          // Recursively process objects and arrays
          if (typeof value === 'object' && value !== null) {
            structural[key] = extractStructuralData(value);
          } else {
            structural[key] = value;
          }
        }
      }
      
      return structural;
    };
    
    return extractStructuralData(graph);
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
    
          }
        } catch (e) {
          // Ignore parse errors for debugging
        }
      }
      
              const ev = createPostEventSource(payload, undefined, this.options.apiEndpoint);
        this.responseIdRef = { current: null as string | null };

      const callbacks: DeltaHandlerCallbacks = {
        addLine: this.options.addLine,
        appendToTextLine: this.options.appendToTextLine,
        appendToReasoningLine: this.options.appendToReasoningLine,
        appendToArgsLine: this.options.appendToArgsLine,
        completeFunctionCall: this.options.completeFunctionCall,
        pushCall: (params: { call: any; responseId: string }) => this.pushCall({
          call: params.call,
          responseId: params.responseId
        }),
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

      // For the main stream, allow completion only on final [DONE]; mid-turn response.completed is ignored in handler
      const handleDelta = createDeltaHandler(callbacks, this.responseIdRef, { suppressCompletion: false, completionOnCompleted: false });

      ev.onmessage = e => {
        // Handle [DONE] sentinel BEFORE any JSON parsing
        if (e.data === '[DONE]') {
          addLine('🏁 Stream finished - [DONE] received');
    
          ev.close();
          setBusy(false);
          this.options.onComplete?.();
          setTimeout(() => { addProcessCompleteMessage(); }, 500);
          setTimeout(() => { sendArchitectureCompleteToRealtimeAgent(); }, 1000);
          resolve();
          return;
        }

        // Debug tap 2: Log every delta the agent streams back
        if ((window as any).__LLM_DEBUG__) {
          try {
            const d = JSON.parse(e.data);
            console.log("%c🛰️  ◀ inbound delta", "color:#9a0", { type: d.type, payload: d });
          } catch {}
        }

        let delta: any;
        try {
          delta = JSON.parse(e.data);
        } catch (parseErr) {
          console.error('❌ Failed to parse inbound delta:', parseErr);
          return;
        }

        const result = handleDelta(delta);
        
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
          addLine(`⚠️ Stream connection interrupted - checking for completion`);
          
          // Don't increment error count for premature close - it's often transient
          if (this.errorRef.current < this.MAX_ERRORS) {
            // Check if we have pending function calls to process
            const pendingCallsCount = this.queueRef.current.length;
            const activePendingCalls = this.pendingCalls.current.size;
            
            if (pendingCallsCount === 0 && activePendingCalls === 0) {
              addLine(`✅ No pending calls - treating as successful completion`);
              this.options.setBusy(false);
              
              // Trigger completion workflow like [DONE] would
              this.options.onComplete?.();
              setTimeout(() => {
                addProcessCompleteMessage();
              }, 500);
              setTimeout(() => {
                sendArchitectureCompleteToRealtimeAgent();
              }, 1000);
            } else {
              addLine(`🔄 ${pendingCallsCount} queued calls + ${activePendingCalls} active calls - will continue processing`);
              this.options.setBusy(false);
            }
            
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
    // Function call queued for processing
    
    if (this.handledCallsRef.current.has(pc.call.call_id)) {
      console.log(`🚫 Skipping already handled call_id: ${pc.call.call_id}`);
      return;
    }
    
    // Store the response ID for GPT-5 chaining
    this.toolCallParent.current.set(pc.call.call_id, pc.responseId);
    this.pendingCalls.current.set(pc.call.call_id, pc.call);
    this.queueRef.current.push(pc.call.call_id);

    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    // Processing function call queue
    
    if (this.isProcessingRef.current) return;
    if (this.queueRef.current.length === 0) return;
    
    const processStartTime = performance.now();

    if (this.loopRef.current >= this.MAX_LOOPS) {
      this.options.addLine(`🛑 Reached ${this.MAX_LOOPS} loops – stopping`);
      this.options.setBusy(false);
      return;
    }

    this.isProcessingRef.current = true;
    // Signal function-call icon start once per processing batch
    try { window.dispatchEvent(new CustomEvent('functionCallStart')); } catch {}
    const firstCallId = this.queueRef.current[0];
    const firstCall = this.pendingCalls.current.get(firstCallId);
    let responseId = this.toolCallParent.current.get(firstCallId) || this.responseIdRef.current || undefined;

    
    // Improved response ID handling with longer wait and retry logic
    if (!responseId) {
      console.log(`⏳ Waiting for response.id before sending tool outputs...`);
      this.isProcessingRef.current = false;
      
      // Wait longer and implement exponential backoff for response ID
      const retryCount = (this as any)._responseIdRetryCount || 0;
      const maxRetries = 15;
      const waitTime = Math.min(300 + (retryCount * 200), 5000); // 300ms to 5s max
      
      if (retryCount < maxRetries) {
        (this as any)._responseIdRetryCount = retryCount + 1;
        console.log(`⏳ Retry ${retryCount + 1}/${maxRetries} for response ID in ${waitTime}ms`);
        setTimeout(() => {
          this.processQueue();
        }, waitTime);
        return;
      } else {
        console.error(`❌ Failed to get response ID after ${maxRetries} retries`);
        this.options.addLine(`❌ Failed to get response ID for function call - aborting`);
        this.isProcessingRef.current = false;
        return;
      }
    }
    
    // Reset retry counter on success
    (this as any)._responseIdRetryCount = 0;

    
    // Group all queued calls that belong to the same responseId
    const groupedCallIds: string[] = [];
    for (const queuedId of this.queueRef.current) {
      if ((this.toolCallParent.current.get(queuedId) || this.responseIdRef.current) === responseId) {
        groupedCallIds.push(queuedId);
      } else {
        break; // stop at first call from a different response
      }
    }

    if (groupedCallIds.length === 0 || !firstCall) {
      this.isProcessingRef.current = false;
      return;
    }

    this.incLoop();
    this.options.addLine(`🔄 Loop ${this.loopRef.current}/${this.MAX_LOOPS} - Processing ${groupedCallIds.length} call(s)`);

    const outputs: { type: string; call_id: string; output: string }[] = [];

    try {
      for (const callId of groupedCallIds) {
        const call = this.pendingCalls.current.get(callId);
        if (!call) continue;
        if (this.sentOutput.current.has(callId)) continue;

        if ((window as any).__LLM_DEBUG__) {
          console.log("%c🔧 tool call", "color:#fa0", {
            name: call.name,
            args: JSON.parse(call.arguments),
            call_id: call.call_id
          });
        }

        const executionStartTime = performance.now();
        
        const result = await executeFunctionCall(
          call,
          { elkGraph: this.elkGraphRef.current, setElkGraph: this.options.setElkGraph },
          { addLine: this.options.addLine },
          this.elkGraphRef
        );
        
        const executionTime = performance.now() - executionStartTime;

        if ((window as any).__LLM_DEBUG__) {

        }

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

        // Ensure the output is properly formatted as a string
        let outputContent: string;
        if (typeof result === 'string') {
          outputContent = result;
        } else if (result === null || result === undefined) {
          outputContent = JSON.stringify({ success: true, message: "Function completed successfully" });
        } else {
          outputContent = JSON.stringify(result);
        }
        
        // Validate the output format
        if (!outputContent.trim()) {
          outputContent = JSON.stringify({ success: true, message: "Function completed with empty output" });
        }
        

        outputs.push({ type: "function_call_output", call_id: call.call_id, output: outputContent });
      }

      // Send a single follow-up continuation with all outputs for this response
      const followUpStartTime = performance.now();
      
      try {
        await this.openFollowUpStreamBatch(responseId, outputs);
        
        const followUpTime = performance.now() - followUpStartTime;
      } catch (error: any) {
        if (error.name === 'ExpiredResponseError' || error.message?.includes('EXPIRED_RESPONSE_ID')) {
          this.options.addLine(`🔄 Restarting conversation with function outputs...`);
          
          // Start a fresh conversation with all the function outputs we have so far
          try {
            await this.openFollowUpStreamBatch(null, outputs); // null = start fresh
            
            const followUpTime = performance.now() - followUpStartTime;
          } catch (freshError) {
            console.error('❌ Fresh conversation also failed:', freshError);
            this.options.addLine(`❌ Failed to restart conversation`);
            throw freshError;
          }
        } else {
          // Re-throw other errors
          throw error;
        }
      }

      // Mark all as sent and cleanup
      for (const callId of groupedCallIds) {
        this.sentOutput.current.add(callId);
        this.cleanupCall(callId);
      }

    } catch (error) {
      console.error('Error processing queue group:', error);
      this.incError();
      if (this.errorRef.current >= this.MAX_ERRORS) {
        this.options.addLine(`🛑 ${this.MAX_ERRORS} consecutive errors – stopping`);
        this.options.setBusy(false);
        this.isProcessingRef.current = false;
        return;
      }
    }

    const processTotalTime = performance.now() - processStartTime;

    this.isProcessingRef.current = false;
    if (this.queueRef.current.length > 0) {
      this.processQueue();
    } else {
      this.options.addLine(`🎯 All function calls completed - ${this.loopRef.current} steps processed`);
      // Attempt a single resume turn to allow the model to finalize with a message
      if (!this.finalizationAttemptedRef.current && this.responseIdRef.current) {
        this.finalizationAttemptedRef.current = true;
        const resumeStartTime = performance.now();

        try {
          await this.openResumeStream(this.responseIdRef.current);
          const resumeTime = performance.now() - resumeStartTime;

        } catch (e) {
          console.warn('⚠️ Resume stream failed:', e);
          this.options.addLine(`⚠️ Final completion failed - using fallback completion`);
          
          // If resume stream fails, we need to complete manually
          setTimeout(() => {

            this.options.addLine(`🏁 Architecture generation completed (fallback)`);
            this.options.setBusy(false);
            this.options.onComplete?.();
            window.dispatchEvent(new CustomEvent('processingComplete'));
          }, 1000);
        }
      } else {
        // No pending function calls and no resume needed - complete immediately

        this.options.addLine(`🏁 Architecture generation completed`);
        setTimeout(() => {
          this.options.setBusy(false);
          this.options.onComplete?.();
          window.dispatchEvent(new CustomEvent('processingComplete'));
        }, 500);
      }
    }
  }

  private async openFollowUpStreamBatch(responseId: string | null, outputs: { type: string; call_id: string; output: string }[]): Promise<void> {
    return new Promise((resolve, reject) => {
      // Validate inputs before proceeding
      if (!outputs || outputs.length === 0) {
        console.error('❌ openFollowUpStreamBatch: No outputs to send');
        resolve();
        return;
      }
      
      if (!responseId) {

        this.options.addLine(`🔄 Starting fresh conversation with function outputs`);
        // Continue processing with responseId = null for fresh conversation
      }
      
      // Validate each output before sending
      for (const output of outputs) {
        if (!output.call_id || !output.output || !output.call_id.startsWith('call_')) {
          console.error('❌ Invalid output format:', output);
          this.options.addLine(`❌ Invalid function output format for ${output.call_id}`);
          // Don't proceed with invalid outputs
          resolve();
          return;
        }
      }
      
      // Log the function call IDs we're sending outputs for


      
      // Build array payload of all outputs
      const followUpPayload = JSON.stringify(outputs);

      
      const ev = createPostEventSource(followUpPayload, responseId, this.options.apiEndpoint);
      const responseIdRef = { current: null };

      const callbacks: DeltaHandlerCallbacks = {
        addLine: this.options.addLine,
        appendToTextLine: this.options.appendToTextLine,
        appendToReasoningLine: this.options.appendToReasoningLine,
        appendToArgsLine: this.options.appendToArgsLine,
        completeFunctionCall: this.options.completeFunctionCall,
        pushCall: (params: { call: any; responseId: string }) => this.pushCall({
          call: params.call,
          responseId: params.responseId
        }),
        setBusy: this.options.setBusy,
        onComplete: () => {
          // Follow-up streams should not trigger completion
  
        }
      };

      // For follow-up tool-output streams, suppress completion and busy clearing.
      const handleDelta = createDeltaHandler(callbacks, this.responseIdRef, { suppressCompletion: true, completionOnCompleted: false, suppressBusyOnDone: true });

      ev.onmessage = e => {
        // Handle [DONE] sentinel BEFORE any JSON parsing
        if (e.data === '[DONE]') {
          // Suppress noisy logs for follow-up streams to avoid multiple "done" lines
          ev.close();
          resolve();
          return;
        }

        let delta: any;
        try {
          delta = JSON.parse(e.data);
        } catch (parseErr) {
          console.error('❌ Failed to parse follow-up delta:', parseErr);
          return;
        }

        const result = handleDelta(delta);
        
        if (result === 'close') {
          ev.close();
          resolve();
        }
      };
      
      ev.onerror = (error) => {
        // Downgrade to warning to avoid scaring the user; follow-up errors are often benign
        console.warn('⚠️ Follow-up EventSource warning:', error);
        const errorDetails = (error as any).error || error;
        
        ev.close();
        
        // Handle specific OpenAI API errors
        if (errorDetails?.message?.includes('No tool output found')) {
          console.warn('⚠️ OpenAI "No tool output found" - treating as non-fatal and continuing');
          
          // Don't increment error count for this specific error - it's likely a timing issue
          resolve(); // Resolve to continue processing
          return;
        }
        
        if (errorDetails?.name === 'AbortError') {
          console.log('📡 Follow-up stream closed normally (AbortError expected)');
          resolve();
          return;
        }
        
        // Handle HTTP 500 errors more gracefully
        if (errorDetails?.message?.includes('HTTP 500')) {
          console.warn('⚠️ HTTP 500 on follow-up stream - continuing');
          
          // Don't fail the entire process for server errors
          resolve();
          return;
        }
        
        // Treat other follow-up errors as non-fatal: resolve to allow UI to finish
        resolve();
      };
      
      ev.onopen = () => {
        this.options.addLine("🔄 Continuing stream...");
        this.resetError();
      };
    });
  }

  // Open a lightweight resume stream to continue the conversation after tool outputs
  private async openResumeStream(previousResponseId: string): Promise<void> {
    return new Promise((resolve) => {
      const nudgeMessages = [
        { role: 'user', content: 'Continue and finalize. If the architecture is complete, respond with a final message instead of calling tools.' }
      ];

      const payload = JSON.stringify(nudgeMessages);
      const ev = createPostEventSource(payload, previousResponseId, this.options.apiEndpoint);

      const callbacks: DeltaHandlerCallbacks = {
        addLine: this.options.addLine,
        appendToTextLine: this.options.appendToTextLine,
        appendToReasoningLine: this.options.appendToReasoningLine,
        appendToArgsLine: this.options.appendToArgsLine,
        completeFunctionCall: this.options.completeFunctionCall,
        pushCall: (params: { call: any; responseId: string }) => this.pushCall({
          call: params.call,
          responseId: params.responseId
        }),
        setBusy: this.options.setBusy,
        onComplete: () => {
          // Main completion will be handled by [DONE] branch
        }
      };

      const handleDelta = createDeltaHandler(callbacks, this.responseIdRef, { suppressCompletion: false, completionOnCompleted: false });

      ev.onmessage = e => {
        if (e.data === '[DONE]') {
          // Finalization turn complete
          ev.close();
          // Allow main [DONE] to clear busy and trigger UI completion
          resolve();
          return;
        }

        let delta: any;
        try {
          delta = JSON.parse(e.data);
        } catch {
          return;
        }

        const result = handleDelta(delta);
        if (result === 'close') {
          ev.close();
          resolve();
        }
      };

      ev.onerror = () => {
        // Treat resume errors as non-fatal
        try { ev.close(); } catch {}
        resolve();
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

 