import { elkGraphDescription } from "./agentConfig";
import { createPostEventSource } from "./PostEventSource";
import { createDeltaHandler, EventHandlerCallbacks, PendingCall } from "./EventHandlers";
import { executeFunctionCall, GraphState } from "./FunctionExecutor";

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
      
      // Full payload with complete instructions
      const fullPayload = JSON.stringify([
        { 
          role: "system", 
          content: elkGraphDescription
        },
        { 
          role: "user", 
          content: `Build a complete e-commerce microservices architecture following this exact structure:

IMPORTANT: Call display_elk_graph() first to see the current state, then build the architecture step by step.

Required Architecture Components:

1. Frontend Layer (group: "frontend", style: "GREEN")
   - web_app: React Web Application
   - mobile_app: Mobile Application
   - admin_portal: Admin Dashboard

2. API Gateway Layer (group: "api_gateway", style: "PURPLE")
   - api_gw: Main API Gateway
   - auth_service: Authentication Service
   - rate_limiter: Rate Limiting Service
   
3. Business Services (group: "services", style: "BLUE")
   - order_service: Order Management
   - product_service: Product Catalog
   - user_service: User Management
   - payment_service: Payment Processing
   - inventory_service: Inventory Management

4. Data Layer (group: "data", style: "TEAL")
   - postgres_orders: PostgreSQL for Orders
   - mongodb_products: MongoDB for Products
   - redis_cache: Redis Cache
   - elasticsearch: Search Index

5. Infrastructure (group: "infrastructure", style: "GREY")
   - load_balancer: Load Balancer
   - cdn: Content Delivery Network
   - message_queue: RabbitMQ/Kafka
   - monitoring: Monitoring Service

EXECUTION STEPS:
1. First call display_elk_graph() to see current state
2. Use batch_update to create each group with ALL its nodes
3. After creating all groups, add edges between components using batch_update
4. Each batch_update should be complete - include all nodes for a group or all edges in one call

Example edge relationships:
- Frontend components → API Gateway
- API Gateway → Business Services
- Business Services → Data Layer
- All components → Infrastructure services

Remember: Do NOT acknowledge or explain. Just execute the functions.` 
        }
      ]);

      const fullEncodedLength = encodeURIComponent(fullPayload).length;
      addLine(`📦 Full payload (${fullEncodedLength} chars), using POST...`);
      
      await this.createMainStream(fullPayload);
      
    } catch (error) {
      console.error('StreamExecutor error:', error);
      addLine(`❌ Stream execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  private async createMainStream(payload: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const { addLine, setBusy } = this.options;
      const ev = createPostEventSource(payload);
      const responseIdRef = { current: null as string | null };

      const callbacks: EventHandlerCallbacks = {
        addLine: this.options.addLine,
        appendToTextLine: this.options.appendToTextLine,
        appendToReasoningLine: this.options.appendToReasoningLine,
        appendToArgsLine: this.options.appendToArgsLine,
        pushCall: (pc: PendingCall) => this.pushCall(pc),
        setBusy: this.options.setBusy
      };

      const handleDelta = createDeltaHandler(callbacks, responseIdRef);

      ev.onmessage = e => {
        const delta = JSON.parse(e.data);
        
        if (e.data === '[DONE]') {
          addLine('🏁 Stream finished - [DONE] received');
          ev.close();
          setBusy(false);
          this.options.onComplete?.();
          resolve();
          return;
        }
        
        const result = handleDelta(delta, this.pendingCalls.current, this.handledCallsRef.current);
        
        if (result === 'close') {
          ev.close();
          setBusy(false);
          this.options.onComplete?.();
          resolve();
        }
      };
      
      ev.onerror = (error) => {
        console.error('EventSource error:', error);
        ev.close();
        
        if (error && (error as any).error?.name === 'AbortError') {
          console.log('📡 Stream closed normally (AbortError expected)');
          resolve();
          return;
        }
        
        this.incError();
        
        if (this.errorRef.current >= this.MAX_ERRORS) {
          addLine(`🛑 Stopping after ${this.MAX_ERRORS} consecutive errors`);
          setBusy(false);
          this.options.onError?.(error);
          reject(error);
        } else {
          addLine(`❌ Stream failed (${this.errorRef.current}/${this.MAX_ERRORS}) - check console for details`);
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
    
    this.toolCallParent.current.set(pc.call.call_id, pc.responseId);
    this.pendingCalls.current.set(pc.call.call_id, pc.call);
    this.queueRef.current.push(pc.call.call_id);
    console.log(`📥 Queued function call: ${pc.call.name} (${pc.call.call_id}) from response ${pc.responseId}`);
    console.log(`📋 Queue now has ${this.queueRef.current.length} items`);
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
    
    if (!call || !parentId) {
      this.options.addLine(`❌ Missing call details or parent for ${callId}`);
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

      await this.openFollowUpStream(parentId, callId, typeof result === 'string' ? result : JSON.stringify(result));
      
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
    
    if (this.queueRef.current.length === 0) {
      this.options.addLine(`🎯 All function calls completed - ready to finish`);
      this.options.setBusy(false);
    }
    
    this.processQueue();
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

      console.log(`🔄 Opening follow-up stream for call_id: ${callId} with response_id: ${responseId}`);
      
      const ev = createPostEventSource(followUpPayload, responseId);
      const responseIdRef = { current: responseId };

      const callbacks: EventHandlerCallbacks = {
        addLine: this.options.addLine,
        appendToTextLine: this.options.appendToTextLine,
        appendToReasoningLine: this.options.appendToReasoningLine,
        appendToArgsLine: this.options.appendToArgsLine,
        pushCall: (pc: PendingCall) => this.pushCall(pc),
        setBusy: this.options.setBusy
      };

      const handleDelta = createDeltaHandler(callbacks, responseIdRef);

      ev.onmessage = e => {
        const delta = JSON.parse(e.data);
        
        if (e.data === '[DONE]') {
          this.options.addLine('🏁 Stream finished - [DONE] received');
          ev.close();
          this.options.setBusy(false);
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