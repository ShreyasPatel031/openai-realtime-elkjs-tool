import { RawGraph } from '../components/graph/types';

export const ELK_GRAPH_SET = 'elkGraph:set' as const;

export type ElkGraphEventDetail = {
  elkGraph: RawGraph;
  source?: string;        // e.g., 'FunctionExecutor', 'HistoryRestore', 'UserAction'
  reason?: string;        // e.g., 'agent-update', 'history-restore', 'architecture-load'
  targetArchitectureId?: string; // ID of the architecture being updated
  version?: number;       // schema version for future compatibility
  ts?: number;            // Date.now() timestamp
};

/**
 * Emit an elkGraph:set event with proper typing and metadata
 * Call this from any code that updates the graph state
 */
export function dispatchElkGraph(detail: ElkGraphEventDetail): void {
  const eventDetail: ElkGraphEventDetail = {
    ...detail,
    version: detail.version ?? 1,
    ts: detail.ts ?? Date.now()
  };
  
  console.log('📡 Dispatching elkGraph:set event:', {
    source: eventDetail.source,
    reason: eventDetail.reason,
    targetArchitectureId: eventDetail.targetArchitectureId,
    nodeCount: eventDetail.elkGraph?.children?.length || 0,
    edgeCount: eventDetail.elkGraph?.edges?.length || 0,
    timestamp: new Date(eventDetail.ts).toISOString()
  });
  
  window.dispatchEvent(new CustomEvent<ElkGraphEventDetail>(ELK_GRAPH_SET, { 
    detail: eventDetail 
  }));
}

/**
 * Listen for elkGraph:set events with proper typing
 * Call this from InteractiveCanvas or any component that needs graph updates
 * Returns cleanup function
 */
export function onElkGraph(
  handler: (detail: ElkGraphEventDetail) => void
): () => void {
  const wrapped = (e: Event) => {
    const ce = e as CustomEvent<ElkGraphEventDetail>;
    console.log('👂 Received elkGraph:set event:', {
      source: ce.detail.source,
      reason: ce.detail.reason,
      targetArchitectureId: ce.detail.targetArchitectureId,
      nodeCount: ce.detail.elkGraph?.children?.length || 0,
      version: ce.detail.version
    });
    handler(ce.detail);
  };
  
  window.addEventListener(ELK_GRAPH_SET, wrapped);
  console.log('🔗 Registered elkGraph:set listener');
  
  return () => {
    window.removeEventListener(ELK_GRAPH_SET, wrapped);
    console.log('🗑️ Unregistered elkGraph:set listener');
  };
}

/**
 * Type guard for CustomEvent with ElkGraphEventDetail
 */
export function isElkGraphEvent(event: Event): event is CustomEvent<ElkGraphEventDetail> {
  return event instanceof CustomEvent && event.type === ELK_GRAPH_SET;
}
