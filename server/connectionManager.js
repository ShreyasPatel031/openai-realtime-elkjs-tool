import OpenAI from "openai";
import { EventEmitter } from 'events';
import { modelConfigs, timeoutConfigs, isReasoningModel } from '../api/agentConfig.ts';

class ConnectionManager extends EventEmitter {
  static instance;
  
  constructor() {
    super();
    this.clients = new Map();
    this.requestQueue = [];
    this.activeRequests = new Set();
    this.isProcessingQueue = false;
  
  // Configuration
    this.maxConcurrentRequests = timeoutConfigs.maxConcurrentRequests; // Limit concurrent OpenAI requests
    this.maxClientInstances = 5;    // Pool multiple client instances
    this.queueTimeout = timeoutConfigs.queueTimeout;     // Centralized timeout config
    this.requestTimeout = timeoutConfigs.requestTimeout;   // Centralized timeout config
    this.o3Timeout = timeoutConfigs.o3Timeout;        // Centralized timeout config
    this.retryDelays = [1000, 2000, 4000]; // Exponential backoff

    this.stats = {
    activeConnections: 0,
    queuedRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    totalTimeouts: 0,
    socketTimeouts: 0,
    prematureCloses: 0
  };

    this.initializeClients();
    this.startQueueProcessor();
  }

  static getInstance() {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  initializeClients() {
    // Create a pool of OpenAI clients with different configurations
    for (let i = 0; i < this.maxClientInstances; i++) {
      const clientId = `client-${i}`;
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        maxRetries: 0, // We handle retries manually
        timeout: this.o3Timeout, // Use longer timeout for O3 model
      });
      this.clients.set(clientId, client);
    }
    console.log(`🔧 Initialized ${this.maxClientInstances} OpenAI client instances`);
  }

  getAvailableClient() {
    // Round-robin client selection for load distribution
    const clientIds = Array.from(this.clients.keys());
    const clientId = clientIds[this.stats.completedRequests % clientIds.length];
    return this.clients.get(clientId);
  }

  startQueueProcessor() {
    setInterval(() => {
      this.processQueue();
    }, 100); // Check queue every 100ms
  }

  async processQueue() {
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
        const queuedRequest = this.requestQueue.shift();
        
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

  async executeRequest(queuedRequest) {
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

  async executeWithRetry(request) {
    let lastError;

    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      try {
        return await request();
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain error types
        if (error.status === 401 || error.status === 403) {
          throw error; // Authentication errors shouldn't be retried
        }

        // Handle socket timeout and premature close errors
        if (error.message && (error.message.includes('Socket timeout') || error.message.includes('Premature close'))) {
          console.log(`🔍 ConnectionManager: Connection Error Details:`, {
            attempt: attempt + 1,
            error: error.message,
            type: 'connection_error',
            timestamp: new Date().toISOString()
          });
          
          // Update stats for specific error types
          if (error.message.includes('Socket timeout')) {
            this.stats.socketTimeouts++;
          } else if (error.message.includes('Premature close')) {
            this.stats.prematureCloses++;
          }
          
          // These errors are often transient, so we should retry
          if (attempt < this.retryDelays.length) {
            console.log(`⚠️ Connection error detected, will retry...`);
          }
        }

        // Enhanced logging for 404 errors
        if (error.status === 404 && error.message.includes('not found')) {
          console.log(`🔍 ConnectionManager: 404 Error Details:`, {
            attempt: attempt + 1,
            status: error.status,
            message: error.message,
            type: error.type,
            param: error.param,
            code: error.code,
            request_id: error.request_id,
            timestamp: new Date().toISOString()
          });
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

  updateStats() {
    this.stats.queuedRequests = this.requestQueue.length;
    this.emit('statsUpdated', this.stats);
  }

  // Public API
  async queueRequest(requestFn, priority = 'normal') {
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const queuedRequest = {
        id: requestId,
        request: requestFn,
        resolve,
        reject,
        timestamp: Date.now(),
        priority
      };

      this.requestQueue.push(queuedRequest);
      console.log(`📥 Queued request ${requestId} with priority ${priority} (${this.requestQueue.length} in queue)`);
      console.log(`🔍 ConnectionManager: Current state:`, {
        activeRequests: this.activeRequests.size,
        queuedRequests: this.requestQueue.length,
        completedRequests: this.stats.completedRequests,
        failedRequests: this.stats.failedRequests,
        totalClients: this.clients.size,
        maxConcurrentRequests: this.maxConcurrentRequests
      });
      
      this.processQueue(); // Trigger immediate processing attempt
    });
  }

  async createStream(conversation, sessionId) {
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

  async createChatCompletion(messages) {
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

  getStats() {
    return { ...this.stats };
  }

  // Cleanup method
  shutdown() {
    this.clients.clear();
    this.requestQueue.forEach(req => req.reject(new Error('Connection manager shutdown')));
    this.requestQueue = [];
    this.activeRequests.clear();
    this.removeAllListeners();
  }
}

export default ConnectionManager; 