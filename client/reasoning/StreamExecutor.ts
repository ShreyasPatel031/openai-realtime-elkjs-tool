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
    
    console.log('🔴 STEP 6: StreamExecutor.execute() called - starting architecture generation');
    setBusy(true);
    this.resetState();
    
    // START TIMING ANALYSIS
    const timingStart = performance.now();
    let lastTiming = timingStart;
    
    const logTiming = (stage: string) => {
      const now = performance.now();
      const stageTime = now - lastTiming;
      const totalTime = now - timingStart;
      console.log(`⏱️ TIMING: ${stage} took ${stageTime.toFixed(2)}ms (total: ${totalTime.toFixed(2)}ms)`);
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
      console.log("📸 DEBUG: Found stored images:", storedImages.length);
      
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
      console.log(`🔍 STEP 7: Starting architecture search for input: "${combinedContent.trim()}"`);
      console.log(`📏 Combined content length: ${combinedContent.length} characters`);
      
      if (combinedContent.trim()) {
        try {
          const searchInput = combinedContent.toLowerCase();
          console.log(`🔍 Searching for reference architecture matching: "${searchInput}"`);
          
          // Check if service is ready
          const availableArchs = architectureSearchService.getAvailableArchitectures();
          console.log(`📊 Architecture service has ${availableArchs.length} architectures loaded`);
          
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
                console.log(`✅ Using reference architecture: ${matchedArch.subgroup}`);
                console.log(`📋 Description: ${matchedArch.description}`);
                console.log(`🔗 Source URL: ${matchedArch.source}`);
                console.log(`☁️ Cloud Provider: ${matchedArch.cloud.toUpperCase()}`);
                console.log(`📁 Category: ${matchedArch.group} > ${matchedArch.subgroup}`);
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
      console.log("📊 Current graph state being sent to agent:", currentGraphState);
      
      logTiming("Content building");
      
      // Move CURRENT GRAPH STATE into the user content to avoid duplicating system config.
      // The backend will prepend the canonical system instructions from api/agentConfig.ts.
      const userContentWithGraph = `${userContent}

## CURRENT GRAPH STATE
The following is your current graph state (same format as display_elk_graph). Use this to understand what nodes and edges already exist:

\`\`\`json
${currentGraphJSON}
\`\`\`

Only create edges between nodes that exist and share a common parent container. Do not create duplicate nodes or edges.`;

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
            console.log(`🔍 StreamExecutor: Found ${responseIds.length} response IDs in payload:`, responseIds);
          }
        } catch (e) {
          // Ignore parse errors for debugging
        }
      }
      
      const ev = createPostEventSource(payload, undefined, this.options.apiEndpoint);
      const responseIdRef = { current: null as string | null };

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

      const handleDelta = createDeltaHandler(callbacks, responseIdRef);

      ev.onmessage = e => {
        // Debug tap 2: Log every delta the agent streams back
        if ((window as any).__LLM_DEBUG__) {
          const d = JSON.parse(e.data);
          console.log(
            "%c🛰️  ◀ inbound delta",
            "color:#9a0",
            { type: d.type, payload: d }
          );
        }
        
        const delta = JSON.parse(e.data);
        
        if (e.data === '[DONE]') {
                  // [DONE] marker received - finalizing execution
          
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
    
    // Check if we're in server-managed mode (Vercel dev) by detecting if we're getting
    // function calls without client-initiated follow-up streams
    const isServerManaged = this.isServerManagedConversation();
    
    if (isServerManaged) {
      console.log(`📥 Server-managed mode: Executing ${pc.call.name} locally without follow-up stream`);
      this.executeCallDirectly(pc.call);
      return;
    }
    
    // Client-managed mode (npm run dev) - traditional flow
    console.log(`📥 Client-managed mode: Queuing ${pc.call.name} for traditional flow`);
    // NEVER store response IDs for multi-server compatibility
    this.toolCallParent.current.set(pc.call.call_id, null);
    this.pendingCalls.current.set(pc.call.call_id, pc.call);
    this.queueRef.current.push(pc.call.call_id);
    console.log(`📥 Queued: ${pc.call.name} - NO response ID stored for multi-server compatibility`);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    // Processing function call queue
    
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
      // Debug tap 3: Log the tool call arguments
      if ((window as any).__LLM_DEBUG__) {
        console.log("%c🔧 tool call", "color:#fa0", {
          name: call.name,
          args: JSON.parse(call.arguments),
          call_id: call.call_id
        });
      }
      
      const result = await executeFunctionCall(
        call, 
        { elkGraph: this.elkGraphRef.current, setElkGraph: this.options.setElkGraph },
        { addLine: this.options.addLine },
        this.elkGraphRef
      );
      
      // Debug tap 3: Log the tool result
      if ((window as any).__LLM_DEBUG__) {
        console.log("%c✅ tool result", "color:#0a0", {
          call_id: call.call_id,
          result,
        });
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

      if (this.loopRef.current >= this.MAX_LOOPS || this.errorRef.current >= this.MAX_ERRORS) {
        this.isProcessingRef.current = false;
        return;
      }

      // Pass null instead of parentId to ensure no response ID is used
      console.log(`🔍 DEBUG: About to open follow-up stream for call ${callId}`);
      await this.openFollowUpStream(null, callId, typeof result === 'string' ? result : JSON.stringify(result));
      console.log(`🔍 DEBUG: Follow-up stream completed for call ${callId}`);
      
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
          // Include current graph state in follow-up
          const currentGraphState = this.getStructuralData(this.elkGraphRef.current);
          const currentGraphJSON = JSON.stringify(currentGraphState, null, 2);
          
          outputContent = JSON.stringify({
            ...parsedResult,
            current_graph_state: currentGraphState,
            graph_state_info: `CURRENT GRAPH STATE: Here is the updated graph state after the last operation:\n\`\`\`json\n${currentGraphJSON}\n\`\`\`\n\nUse this state information for your next function call. Only create edges between existing nodes that share a common parent.`,
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
      console.log(`🔍 DEBUG: Follow-up payload preview:`, followUpPayload.substring(0, 300) + '...');
      
      // DON'T pass responseId - let the server handle conversation state
      console.log(`🔍 DEBUG: About to create PostEventSource for follow-up`);
      const ev = createPostEventSource(followUpPayload, undefined);
      console.log(`🔍 DEBUG: PostEventSource created for follow-up, setting up handlers...`);
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
        
        const result = handleDelta(delta);
        
        if (result === 'close') {
          ev.close();
          resolve();
        }
      };
      
      ev.onerror = (error) => {
        console.error('🚨 Follow-up EventSource error:', error);
        console.error('🚨 Follow-up EventSource error details:', {
          error,
          callId,
          responseId: 'NOT_USED',
          errorType: error && (error as any).error?.name,
          timestamp: new Date().toISOString(),
          payload: followUpPayload.substring(0, 200) + '...',
          payloadLength: followUpPayload.length
        });
        console.error('🚨 This is likely the Vercel dev issue - follow-up stream failed to connect');
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

  private isServerManagedConversation(): boolean {
    // Server-managed mode (Vercel) sends multiple function calls in one stream
    // without expecting client follow-up streams. We can detect this by checking
    // if we've received multiple calls without sending any follow-up streams yet.
    const queueLength = this.queueRef.current.length;
    const pendingCallsCount = this.pendingCalls.current.size;
    const isInInitialStream = queueLength === 0 && pendingCallsCount === 0;
    
    // Server managed mode detection for function execution
    
    // If we're getting function calls during the initial stream (not as a result
    // of our follow-up), it's likely server-managed
    return isInInitialStream;
  }

  private async executeCallDirectly(call: { name: string; arguments: string; call_id: string }): Promise<void> {
    try {
      console.log(`🔧 Executing ${call.name} directly in server-managed mode`);
      
      // Debug tap 3: Log the tool call arguments
      if ((window as any).__LLM_DEBUG__) {
        console.log("%c🔧 tool call", "color:#fa0", {
          name: call.name,
          args: JSON.parse(call.arguments),
          call_id: call.call_id
        });
      }
      
      const result = await executeFunctionCall(
        call,
        { elkGraph: this.elkGraphRef.current, setElkGraph: this.options.setElkGraph },
        { addLine: this.options.addLine },
        this.elkGraphRef
      );
      
      // Debug tap 3: Log the tool result
      if ((window as any).__LLM_DEBUG__) {
        console.log("%c✅ tool result", "color:#0a0", {
          call_id: call.call_id,
          result,
        });
      }
      
      // Mark as handled but don't send follow-up stream
      this.handledCallsRef.current.add(call.call_id);
      
      console.log(`✅ Executed ${call.name} locally in server-managed mode`);
      
    } catch (error) {
      console.error(`❌ Error executing ${call.name} in server-managed mode:`, error);
      this.options.addLine(`❌ Error executing ${call.name}: ${error}`);
    }
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