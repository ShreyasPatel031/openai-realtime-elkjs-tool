import OpenAI from "openai";
import { EventEmitter } from 'events';
import { modelConfigs, timeoutConfigs, isReasoningModel } from '../client/reasoning/agentConfig';

interface QueuedRequest {
  id: string;
  request: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
  priority: 'high' | 'normal' | 'low';
}

interface ConnectionStats {
  activeConnections: number;
  queuedRequests: number;
  completedRequests: number;
  failedRequests: number;
  totalTimeouts: number;
}

class ConnectionManager extends EventEmitter {
  private static instance: ConnectionManager;
  private clients: Map<string, OpenAI> = new Map();
  private requestQueue: QueuedRequest[] = [];
  private activeRequests: Set<string> = new Set();
  private isProcessingQueue = false;
  
  // Configuration
  private readonly maxConcurrentRequests = timeoutConfigs.maxConcurrentRequests; // Limit concurrent OpenAI requests
  private readonly maxClientInstances = 5;    // Pool multiple client instances
  private readonly queueTimeout = timeoutConfigs.queueTimeout;     // Centralized timeout config
  private readonly requestTimeout = timeoutConfigs.requestTimeout;   // Centralized timeout config
  private readonly retryDelays = [1000, 2000, 4000]; // Exponential backoff

  private stats: ConnectionStats = {
    activeConnections: 0,
    queuedRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    totalTimeouts: 0
  };

  private constructor() {
    super();
    this.initializeClients();
    this.startQueueProcessor();
  }

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  private initializeClients(): void {
    // Create a pool of OpenAI clients with different configurations
    for (let i = 0; i < this.maxClientInstances; i++) {
      const clientId = `client-${i}`;
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        maxRetries: 0, // We handle retries manually
        timeout: this.requestTimeout,
      });
      this.clients.set(clientId, client);
    }
    console.log(`🔧 Initialized ${this.maxClientInstances} OpenAI client instances`);
  }

  getAvailableClient(): OpenAI {
    // Round-robin client selection for load distribution
    const clientIds = Array.from(this.clients.keys());
    const clientId = clientIds[this.stats.completedRequests % clientIds.length];
    return this.clients.get(clientId)!;
  }

  private startQueueProcessor(): void {
    setInterval(() => {
      this.processQueue();
    }, 100); // Check queue every 100ms
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    if (this.activeRequests.size >= this.maxConcurrentRequests) {
      return; // Wait for active requests to complete
    }

    this.isProcessingQueue = true;

    try {
      // Sort queue by priority and timestamp
      this.requestQueue.sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        return priorityDiff !== 0 ? priorityDiff : a.timestamp - b.timestamp;
      });

      // Process requests up to the concurrent limit
      while (
        this.requestQueue.length > 0 && 
        this.activeRequests.size < this.maxConcurrentRequests
      ) {
        const queuedRequest = this.requestQueue.shift()!;
        
        // Check if request has timed out in queue
        if (Date.now() - queuedRequest.timestamp > this.queueTimeout) {
          this.stats.failedRequests++;
          this.stats.totalTimeouts++;
          queuedRequest.reject(new Error('Request timed out in queue'));
          continue;
        }

        this.executeRequest(queuedRequest);
      }

      this.updateStats();
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async executeRequest(queuedRequest: QueuedRequest): Promise<void> {
    const { id, request, resolve, reject } = queuedRequest;
    
    this.activeRequests.add(id);
    this.stats.activeConnections++;

    try {
      console.log(`🚀 Executing request ${id} (${this.activeRequests.size}/${this.maxConcurrentRequests} active)`);
      
      // Execute with retry logic
      const result = await this.executeWithRetry(request);
      
      this.stats.completedRequests++;
      resolve(result);
      
      console.log(`✅ Request ${id} completed successfully`);
    } catch (error) {
      this.stats.failedRequests++;
      reject(error);
      
      console.error(`❌ Request ${id} failed:`, error.message);
    } finally {
      this.activeRequests.delete(id);
      this.stats.activeConnections--;
      this.emit('requestCompleted', { id, activeCount: this.activeRequests.size });
    }
  }

  private async executeWithRetry(request: () => Promise<any>): Promise<any> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      try {
        return await request();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on certain error types
        if (error.status === 401 || error.status === 403) {
          throw error; // Authentication errors shouldn't be retried
        }

        if (attempt < this.retryDelays.length) {
          const delay = this.retryDelays[attempt];
          console.warn(`⚠️ Request failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  private updateStats(): void {
    this.stats.queuedRequests = this.requestQueue.length;
    this.emit('statsUpdated', this.stats);
  }

  // Public API
  async queueRequest<T>(
    requestFn: () => Promise<T>,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const queuedRequest: QueuedRequest = {
        id: requestId,
        request: requestFn,
        resolve,
        reject,
        timestamp: Date.now(),
        priority
      };

      this.requestQueue.push(queuedRequest);
      console.log(`📥 Queued request ${requestId} with priority ${priority} (${this.requestQueue.length} in queue)`);
      
      this.processQueue(); // Trigger immediate processing attempt
    });
  }

  async createStream(conversation: any[], sessionId?: string): Promise<any> {
    const client = this.getAvailableClient();
    
    return this.queueRequest(async () => {
      console.log(`🔄 Creating OpenAI stream for session ${sessionId || 'unknown'}`);
      
      return client.responses.create({
        model: modelConfigs.reasoning.model,
        input: conversation,
        tools: [], // Tools will be passed from the caller
        tool_choice: "auto",
        parallel_tool_calls: modelConfigs.reasoning.parallel_tool_calls,
        ...(isReasoningModel(modelConfigs.reasoning.model) ? {
          reasoning: modelConfigs.reasoning.reasoning
        } : {}),
        stream: modelConfigs.reasoning.stream
      });
    }, sessionId ? 'high' : 'normal');
  }

  async createChatCompletion(messages: any[]): Promise<any> {
    const client = this.getAvailableClient();
    
    return this.queueRequest(async () => {
      return client.chat.completions.create({
        model: modelConfigs.reasoning.model,
        messages: messages,
        tools: [],
        tool_choice: "auto",
        temperature: modelConfigs.reasoning.temperature,
        max_tokens: modelConfigs.reasoning.max_tokens
      });
    }, 'low');
  }

  getStats(): ConnectionStats {
    return { ...this.stats };
  }

  // Cleanup method
  shutdown(): void {
    this.clients.clear();
    this.requestQueue.forEach(req => req.reject(new Error('Connection manager shutdown')));
    this.requestQueue = [];
    this.activeRequests.clear();
    this.removeAllListeners();
  }
}

export default ConnectionManager; 