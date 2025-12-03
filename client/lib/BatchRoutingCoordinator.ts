/**
 * BatchRoutingCoordinator
 * 
 * Manages batch routing for libavoid to ensure all edges are registered
 * before processTransaction() is called. This allows libavoid's nudging
 * algorithms to properly separate overlapping segments.
 * 
 * Based on Joint.js libavoid implementation pattern:
 * https://github.com/clientIO/joint/tree/master/examples/libavoid
 * 
 * Usage:
 * 1. Each StepEdge calls coordinator.registerEdge(id, connectionFactory)
 * 2. Coordinator waits for all edges to register (based on expectedEdgeCount)
 * 3. Coordinator calls processTransaction() once
 * 4. Each StepEdge retrieves its route via coordinator.getRoute(id)
 */

export interface Point {
  x: number;
  y: number;
}

export interface EdgeRegistration {
  id: string;
  connection: any; // libavoid ConnRef
  sourceId: string;
  targetId: string;
}

export interface BatchRoutingCoordinatorOptions {
  /** Time to wait after last edge registers before processing (ms) */
  debounceTime?: number;
  /** Maximum time to wait for all edges (ms) */
  maxWaitTime?: number;
  /** Callback when batch processing completes */
  onBatchComplete?: (edgeIds: string[]) => void;
}

type RouteReadyCallback = (route: Point[]) => void;

export class BatchRoutingCoordinator {
  private router: any = null;
  private avoidModule: any = null;
  private routerVersion: string = '';
  
  // Edge registration tracking
  private pendingEdges: Map<string, EdgeRegistration> = new Map();
  private computedRoutes: Map<string, Point[]> = new Map();
  private routeCallbacks: Map<string, RouteReadyCallback[]> = new Map();
  
  // Batch processing state
  private expectedEdgeCount: number = 0;
  private batchProcessed: boolean = false;
  private processingInProgress: boolean = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private batchStartTime: number = 0;
  
  // Configuration
  private options: Required<BatchRoutingCoordinatorOptions>;
  
  constructor(options: BatchRoutingCoordinatorOptions = {}) {
    this.options = {
      debounceTime: options.debounceTime ?? 100,
      maxWaitTime: options.maxWaitTime ?? 2000,
      onBatchComplete: options.onBatchComplete ?? (() => {}),
    };
  }
  
  /**
   * Initialize or reset the coordinator with a new router
   */
  initialize(router: any, avoidModule: any, routerVersion: string): void {
    // If router version changed, reset everything
    if (this.routerVersion !== routerVersion) {
      this.reset();
      this.router = router;
      this.avoidModule = avoidModule;
      this.routerVersion = routerVersion;
      this.batchStartTime = Date.now();
      
      // Router initialized
    }
  }
  
  /**
   * Set the expected number of edges for this batch
   */
  setExpectedEdgeCount(count: number): void {
    if (this.expectedEdgeCount !== count) {
      // Expected edge count updated
      this.expectedEdgeCount = count;
      
      // If we already have enough edges, trigger processing
      if (this.pendingEdges.size >= count && !this.batchProcessed) {
        this.scheduleProcessing();
      }
    }
  }
  
  /**
   * Register an edge for batch routing
   * 
   * @param id - Unique edge identifier
   * @param connection - libavoid ConnRef object
   * @param sourceId - Source node ID
   * @param targetId - Target node ID
   * @param onRouteReady - Callback when route is computed
   */
  registerEdge(
    id: string,
    connection: any,
    sourceId: string,
    targetId: string,
    onRouteReady?: RouteReadyCallback
  ): void {
    // Store the registration
    this.pendingEdges.set(id, {
      id,
      connection,
      sourceId,
      targetId,
    });
    
    // Store callback if provided
    if (onRouteReady) {
      if (!this.routeCallbacks.has(id)) {
        this.routeCallbacks.set(id, []);
      }
      this.routeCallbacks.get(id)!.push(onRouteReady);
    }
    
    // Edge registered
    
    // Check if we should process
    this.checkAndProcess();
  }
  
  /**
   * Check if we should trigger batch processing
   */
  private checkAndProcess(): void {
    if (this.batchProcessed || this.processingInProgress) {
      return;
    }
    
    const pendingCount = this.pendingEdges.size;
    const waitTime = Date.now() - this.batchStartTime;
    
    // Process if all edges registered OR if we've waited too long
    if (pendingCount >= this.expectedEdgeCount && this.expectedEdgeCount > 0) {
      this.scheduleProcessing();
    } else if (waitTime > this.options.maxWaitTime && pendingCount > 0) {
      // Max wait time exceeded, processing batch
      this.processBatch();
    }
  }
  
  /**
   * Schedule batch processing with debounce
   */
  private scheduleProcessing(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      this.processBatch();
    }, this.options.debounceTime);
  }
  
  /**
   * Process all registered edges in a single batch
   */
  private processBatch(): void {
    if (this.batchProcessed || this.processingInProgress || !this.router) {
      return;
    }
    
    this.processingInProgress = true;
    const edgeIds = Array.from(this.pendingEdges.keys());
    
    // Processing batch
    
    try {
      // Check if router is valid and not aborted
      if (!this.router || typeof this.router.processTransaction !== 'function') {
        throw new Error('Router not initialized or invalid');
      }
      
      // Call processTransaction ONCE for all edges
      // Wrap in try-catch to handle abort errors gracefully
      try {
        this.router.processTransaction();
      } catch (processError: any) {
        // If router is aborted, don't fail the entire batch
        if (processError?.message?.includes('aborted') || processError?.message?.includes('already aborted')) {
          console.warn(`[BatchRoutingCoordinator] Router aborted, skipping batch processing`);
          this.processingInProgress = false;
          return;
        }
        throw processError;
      }
      
      // Extract routes for each edge
      for (const [id, registration] of Array.from(this.pendingEdges.entries())) {
        try {
          const route = this.extractRoute(registration.connection);
          this.computedRoutes.set(id, route);
          
          // Notify callbacks
          const callbacks = this.routeCallbacks.get(id) || [];
          for (const callback of callbacks) {
            callback(route);
          }
        } catch (routeError: any) {
          // If connection is invalid/aborted, skip this edge
          if (routeError?.message?.includes('aborted') || routeError?.message?.includes('already aborted')) {
            console.warn(`[BatchRoutingCoordinator] Connection aborted for edge ${id}, skipping`);
            continue;
          }
          throw routeError;
        }
      }
      
      this.batchProcessed = true;
      this.processingInProgress = false;
      
      // Batch complete
      this.options.onBatchComplete(edgeIds);
      
    } catch (error) {
      console.error(`[BatchRoutingCoordinator] ❌ Batch processing failed:`, error);
      this.processingInProgress = false;
      
      // Notify all callbacks with empty route to trigger fallback
      for (const [id] of Array.from(this.pendingEdges.entries())) {
        const callbacks = this.routeCallbacks.get(id) || [];
        for (const callback of callbacks) {
          callback([]);
        }
      }
    }
  }
  
  /**
   * Extract route points from a libavoid connection
   */
  private extractRoute(connection: any): Point[] {
    const points: Point[] = [];
    
    try {
      const polyline = connection.displayRoute();
      for (let i = 0; i < polyline.size(); i++) {
        const pt = polyline.get_ps(i);
        points.push({ x: pt.x, y: pt.y });
      }
    } catch (error) {
      console.error(`[BatchRoutingCoordinator] Failed to extract route:`, error);
    }
    
    return points;
  }
  
  /**
   * Get the computed route for an edge
   * Returns null if route is not yet computed
   */
  getRoute(id: string): Point[] | null {
    return this.computedRoutes.get(id) || null;
  }
  
  /**
   * Check if batch processing is complete
   */
  isBatchComplete(): boolean {
    return this.batchProcessed;
  }
  
  /**
   * Check if an edge is registered
   */
  isEdgeRegistered(id: string): boolean {
    return this.pendingEdges.has(id);
  }
  
  /**
   * Get current batch status
   */
  getStatus(): {
    routerVersion: string;
    expectedEdgeCount: number;
    registeredEdgeCount: number;
    batchProcessed: boolean;
    processingInProgress: boolean;
  } {
    return {
      routerVersion: this.routerVersion,
      expectedEdgeCount: this.expectedEdgeCount,
      registeredEdgeCount: this.pendingEdges.size,
      batchProcessed: this.batchProcessed,
      processingInProgress: this.processingInProgress,
    };
  }
  
  /**
   * Reset the coordinator for a new batch
   */
  reset(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    this.pendingEdges.clear();
    this.computedRoutes.clear();
    this.routeCallbacks.clear();
    this.batchProcessed = false;
    this.processingInProgress = false;
    this.batchStartTime = Date.now();
    
    // Reset
  }
  
  /**
   * Force immediate processing (useful for testing or when edge count is unknown)
   */
  forceProcess(): void {
    if (!this.batchProcessed && this.pendingEdges.size > 0) {
      // Force processing
      this.processBatch();
    }
  }
}

// Singleton instance for global access
let globalCoordinator: BatchRoutingCoordinator | null = null;

/**
 * Get the global BatchRoutingCoordinator instance
 */
export function getBatchRoutingCoordinator(): BatchRoutingCoordinator {
  if (!globalCoordinator) {
    globalCoordinator = new BatchRoutingCoordinator();
  }
  return globalCoordinator;
}

/**
 * Reset the global coordinator (useful for testing)
 */
export function resetBatchRoutingCoordinator(): void {
  if (globalCoordinator) {
    globalCoordinator.reset();
  }
  globalCoordinator = null;
}



