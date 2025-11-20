/**
 * Canvas delete interactions
 * Handles delete/backspace key for deleting selected nodes and edges
 */

import type { Node, Edge } from 'reactflow';
import type { RawGraph } from '../../components/graph/types/index';
import { apply } from '../../core/orchestration/Orchestrator';
import type { EditIntent } from '../../core/orchestration/types';

export interface DeleteInteractionsParams {
  selectedNodes: Node[];
  selectedEdges: Edge[];
  rawGraph: RawGraph;
  selectedArchitectureId?: string;
  logDeletionAndSave?: (
    deletedNodeIds: string[],
    graphBeforeDelete: RawGraph,
    graphAfterDelete: RawGraph,
    architectureId?: string
  ) => void;
}

/**
 * Handles delete/backspace key press to delete selected nodes and edges
 */
export function handleDeleteKey(
  params: DeleteInteractionsParams
): void {
  const { selectedNodes, selectedEdges, rawGraph, selectedArchitectureId, logDeletionAndSave } = params;

  if (selectedNodes.length === 0 && selectedEdges.length === 0) {
    return;
  }

  // Delete selected nodes using Orchestrator
  const deletedNodeIds = selectedNodes.map(n => n.id);
  const graphBeforeDelete = JSON.parse(JSON.stringify(rawGraph));

  selectedNodes.forEach(node => {
    try {
      const intent: EditIntent = {
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'delete-node',
          nodeId: node.id,
        }
      };
      apply(intent).catch(error => {
        console.error(`❌ [DELETE] Error deleting node ${node.id}:`, error);
      });
    } catch (error) {
      console.error(`❌ [DELETE] Error deleting node ${node.id}:`, error);
    }
  });

  // Delete selected edges using Orchestrator
  selectedEdges.forEach(edge => {
    try {
      const intent: EditIntent = {
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'delete-edge',
          edgeId: edge.id,
        }
      };
      apply(intent).catch(error => {
        console.error(`❌ [DELETE] Error deleting edge ${edge.id}:`, error);
      });
    } catch (error) {
      console.error(`❌ [DELETE] Error deleting edge ${edge.id}:`, error);
    }
  });

  // Log deletion (graph will be updated by Orchestrator)
  if (logDeletionAndSave) {
    logDeletionAndSave(deletedNodeIds, graphBeforeDelete, rawGraph, selectedArchitectureId);
  }
}

