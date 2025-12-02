/**
 * Canvas Selection Utilities
 * 
 * Provides helper functions to replace direct ReactFlow manipulation
 * with Orchestrator-based selection intents following the architecture.
 */

import { apply } from '../../core/orchestration/Orchestrator';
import type { EditIntent } from '../../core/orchestration/types';

/**
 * Select specific nodes via Orchestrator (replaces direct setNodes calls)
 */
export async function selectNodes(nodeIds: string[]): Promise<void> {
  const intent: EditIntent = {
    source: 'user',
    kind: 'free-structural',
    scopeId: 'root',
    payload: {
      action: 'select-nodes',
      nodeIds
    }
  };
  
  try {
    await apply(intent);
  } catch (error) {
    console.error('[Selection] Failed to select nodes:', error);
  }
}

/**
 * Deselect all nodes and edges via Orchestrator (replaces direct setNodes calls)
 */
export async function deselectAll(): Promise<void> {
  const intent: EditIntent = {
    source: 'user',
    kind: 'free-structural', 
    scopeId: 'root',
    payload: {
      action: 'deselect-all'
    }
  };
  
  try {
    await apply(intent);
  } catch (error) {
    console.error('[Selection] Failed to deselect all:', error);
  }
}

/**
 * Toggle selection of a single node via Orchestrator
 */
export async function toggleNodeSelection(nodeId: string, currentlySelected: boolean): Promise<void> {
  if (currentlySelected) {
    await deselectAll();
  } else {
    await selectNodes([nodeId]);
  }
}

/**
 * Replace ReactFlow's direct setNodes selection with Orchestrator-based selection
 * This is a drop-in replacement for: reactFlowRef.current.setNodes((nds) => nds.map(node => ({ ...node, selected: false })))
 */
export async function clearReactFlowSelection(): Promise<void> {
  await deselectAll();
}

/**
 * Replace direct setNodes selection with Orchestrator-based selection
 * This is a drop-in replacement for: setNodes((nds) => nds.map(n => n.id === targetId ? { ...n, selected: true } : { ...n, selected: false }))
 */
export async function selectSingleNode(nodeId: string): Promise<void> {
  await selectNodes([nodeId]);
}
