/**
 * Canvas persistence effect
 * Handles automatic persistence of graph changes to localStorage
 */

import { useEffect, useRef } from 'react';
import type { RawGraph } from '../../components/graph/types/index';
import type { ViewState } from '../../core/viewstate/ViewState';
import { saveCanvasSnapshot } from '../../utils/canvasPersistence';

export interface CanvasPersistenceEffectParams {
  rawGraph: RawGraph | null;
  selectedArchitectureId?: string;
  getViewStateSnapshot: () => ViewState | undefined;
  viewStateRef?: React.MutableRefObject<ViewState | undefined>;
  skipPersistenceRef?: React.MutableRefObject<boolean>;
}

/**
 * Effect hook that persists graph changes to localStorage
 * This ensures Orchestrator updates (deletes, adds, etc.) are persisted
 * 
 * CRITICAL: Uses viewStateRef directly (from Orchestrator) to ensure we capture
 * the latest ViewState even if ReactFlow hasn't re-rendered yet.
 */
export function useCanvasPersistenceEffect(params: CanvasPersistenceEffectParams): void {
  const { rawGraph, selectedArchitectureId, getViewStateSnapshot, viewStateRef, skipPersistenceRef } = params;
  const lastSavedRef = useRef<string>('');
  const isInitialMountRef = useRef<boolean>(true);

  useEffect(() => {
    // Skip persistence if explicitly disabled (e.g., during restore)
    if (skipPersistenceRef?.current) {
      return;
    }
    
    if (!rawGraph || !selectedArchitectureId) return;
    
    // Create a unique key for this graph state to avoid saving duplicates
    const nodeIds = rawGraph.children?.map((c: any) => c.id).sort() || [];
    const graphKey = JSON.stringify({
      children: rawGraph.children?.length || 0,
      edges: rawGraph.edges?.length || 0,
      nodeIds
    });
    
    // Skip if we just saved this exact state
    if (lastSavedRef.current === graphKey) return;
    
    // CRITICAL: Don't persist empty graphs on initial mount
    // This prevents overwriting a restored graph with an empty state
    const isEmpty = (rawGraph.children?.length || 0) === 0 && (rawGraph.edges?.length || 0) === 0;
    if (isEmpty && isInitialMountRef.current) {
      // First save on page load is empty - skip it to avoid overwriting restored state
      isInitialMountRef.current = false;
      return;
    }
    
    isInitialMountRef.current = false;
    
    // Prefer viewStateRef (from Orchestrator) over getViewStateSnapshot (from ReactFlow)
    let currentViewState: ViewState | undefined;
    if (viewStateRef?.current) {
      currentViewState = JSON.parse(JSON.stringify(viewStateRef.current));
    } else {
      currentViewState = getViewStateSnapshot();
    }
    
    if (currentViewState && selectedArchitectureId) {
      saveCanvasSnapshot(rawGraph, currentViewState, selectedArchitectureId);
      lastSavedRef.current = graphKey;
    }
  }, [rawGraph, selectedArchitectureId, getViewStateSnapshot, viewStateRef, skipPersistenceRef]);
}

