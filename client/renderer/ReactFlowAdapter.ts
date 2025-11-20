/**
 * ReactFlow adapter - ViewState-first rendering
 * Part of Agent B Inter Plan - B1
 * 
 * This adapter enforces the contract: Renderer reads geometry exclusively from ViewState.
 * No fallbacks to ELK output or Domain. If geometry is missing, fail loudly in dev.
 */

import { processLayoutedGraph } from '../components/graph/utils/toReactFlow';
import type { NodeDimensions } from './types';
import type { ReactFlowAdapterOptions } from './types';
import type { ViewState } from '../viewstate/ViewState';
import { requireGeometry } from '../viewstate/ViewState';
import type { Node, Edge } from 'reactflow';

/**
 * Converts ELK graph + ViewState to ReactFlow nodes/edges.
 * 
 * Enforces ViewState-first contract:
 * - All node/group positions come from ViewState (not ELK output)
 * - Throws in dev mode if geometry is missing
 * - Edge waypoints use ViewState if available, otherwise ELK
 * 
 * @param elkGraph - ELK layouted graph (for structure and edge routing)
 * @param dimensions - Node/group dimensions
 * @param viewState - Authoritative geometry (positions, sizes, waypoints)
 * @param options - Adapter options
 * @returns ReactFlow nodes and edges
 */
export function toReactFlowWithViewState(
  elkGraph: any,
  dimensions: NodeDimensions,
  viewState: ViewState,
  options?: ReactFlowAdapterOptions
): { nodes: Node[]; edges: Edge[] } {
  const strictGeometry = options?.strictGeometry ?? true;

  // First, get ReactFlow nodes/edges from ELK (for structure, handles, edge routing)
  const { nodes: elkNodes, edges: elkEdges } = processLayoutedGraph(elkGraph, dimensions);

  // Override all node positions from ViewState (enforce contract)
  const nodes = elkNodes.map((node) => {
    const nodeId = node.id;
    const isGroup = node.type === 'group';

    if (strictGeometry && process.env.NODE_ENV !== 'production') {
      // Enforce: geometry must exist in ViewState
      try {
        requireGeometry(isGroup ? 'group' : 'node', nodeId, viewState);
      } catch (error) {
        // Re-throw with more context
        throw new Error(
          `[ReactFlowAdapter] Missing ViewState geometry for ${isGroup ? 'group' : 'node'} "${nodeId}". ` +
          `This violates the ViewState-first contract. ` +
          `Ensure Layout or Orchestration has written geometry before rendering.`,
          { cause: error }
        );
      }
    }

    // Get geometry from ViewState (source of truth)
    const geometry = isGroup
      ? viewState.group?.[nodeId]
      : viewState.node?.[nodeId];

    if (geometry) {
      // Override position from ViewState
      return {
        ...node,
        position: {
          x: geometry.x,
          y: geometry.y,
        },
        // Update data.position if it exists
        data: {
          ...node.data,
          position: { x: geometry.x, y: geometry.y },
        },
      };
    }

    // Fallback: use ELK position (only if strictGeometry is false)
    if (!strictGeometry) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[ReactFlowAdapter] Using ELK position for ${isGroup ? 'group' : 'node'} "${nodeId}" ` +
          `(ViewState missing, strictGeometry=false)`
        );
      }
      return node;
    }

    // Strict mode: should have thrown above, but if we get here, use safe default
    return {
      ...node,
      position: { x: 0, y: 0 },
    };
  });

  // Override edge waypoints from ViewState if available
  const edges = elkEdges.map((edge) => {
    const edgeId = edge.id;
    const edgeGeom = viewState.edge?.[edgeId];

    if (edgeGeom?.waypoints && Array.isArray(edgeGeom.waypoints)) {
      // Use ViewState waypoints (manual routing in FREE mode)
      return {
        ...edge,
        data: {
          ...edge.data,
          bendPoints: edgeGeom.waypoints,
        },
      };
    }

    // Use ELK waypoints (from processLayoutedGraph)
    return edge;
  });

  return { nodes, edges };
}





