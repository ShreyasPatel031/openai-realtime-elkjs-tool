/**
 * ReactFlow adapter - ViewState-first rendering
 * Part of Agent B Inter Plan - B1 + CP1 Coordinate Service integration
 * 
 * This adapter enforces the contract: Renderer reads geometry exclusively from ViewState.
 * No fallbacks to ELK output or Domain. If geometry is missing, fail loudly in dev.
 * 
 * CP1 Update: Uses CoordinateService for all coordinate transformations.
 */

import { processLayoutedGraph } from '../../components/graph/utils/toReactFlow';
import type { NodeDimensions } from './types';
import type { ReactFlowAdapterOptions } from './types';
import type { ViewState } from '../viewstate/ViewState';
import { requireGeometry } from '../viewstate/ViewState';
import { CoordinateService } from '../viewstate/CoordinateService';
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

  // Build a map of all node positions for parent lookup
  const nodePositionMap = new Map<string, { x: number; y: number }>();
  elkNodes.forEach((n) => {
    const isGroupNode = n.type === 'group';
    const geom = isGroupNode ? viewState.group?.[n.id] : viewState.node?.[n.id];
    if (geom) {
      nodePositionMap.set(n.id, { x: geom.x, y: geom.y });
    }
  });

  // Override all node positions from ViewState (enforce contract)
  const nodes = elkNodes.map((node) => {
    const nodeId = node.id;
    const isGroup = node.type === 'group';

    if (strictGeometry && process.env.NODE_ENV !== 'production') {
      // Enforce: geometry must exist in ViewState
      try {
        requireGeometry(isGroup ? 'group' : 'node', nodeId, viewState);
      } catch (error: any) {
        // Re-throw with more context
        const message = `[ReactFlowAdapter] Missing ViewState geometry for ${isGroup ? 'group' : 'node'} "${nodeId}". ` +
          `This violates the ViewState-first contract. ` +
          `Ensure Layout or Orchestration has written geometry before rendering.`;
        const enhancedError = new Error(message);
        if (error) {
          (enhancedError as any).cause = error;
        }
        throw enhancedError;
      }
    }

    // Get geometry from ViewState (source of truth)
    const geometry = isGroup
      ? viewState.group?.[nodeId]
      : viewState.node?.[nodeId];

    console.log('[🎯COORD] ReactFlowAdapter - reading ViewState:', {
      nodeId,
      isGroup,
      hasGeometry: !!geometry,
      geometry: geometry ? `${geometry.x},${geometry.y}` : 'none',
      viewStateKeys: isGroup 
        ? Object.keys(viewState.group || {})
        : Object.keys(viewState.node || {})
    });

    if (geometry) {
      // CRITICAL: If node has a parent, convert absolute position to relative
      // ReactFlow requires relative positions for child nodes
      // CP1 Update: Use CoordinateService for coordinate transformations
      const worldPos = { x: geometry.x, y: geometry.y };
      const parentId = (node as any).parentId;
      
      console.log('[🎯COORD] ReactFlowAdapter - position calculation:', {
        nodeId,
        parentId: parentId || 'root',
        worldPos: `${worldPos.x},${worldPos.y}`,
      });
      
      let position = worldPos;
      
      if (parentId) {
        const parentGeometry = viewState.group?.[parentId];
        if (parentGeometry) {
          const parentWorldPos = { x: parentGeometry.x, y: parentGeometry.y };
          // Use CoordinateService for world → relative conversion
          position = CoordinateService.toRelativeFromWorld(worldPos, parentWorldPos);
          
          console.log('[🎯COORD] MOVE-INTO-GROUP absolute to relative:', {
            nodeId,
            parentId,
            absolutePos: `${worldPos.x},${worldPos.y}`,
            parentPos: `${parentWorldPos.x},${parentWorldPos.y}`,
            relativePos: `${position.x},${position.y}`,
          });
        } else {
          console.log('[🎯COORD] MOVE-INTO-GROUP missing parent geometry:', {
            nodeId,
            parentId,
            absolutePos: `${worldPos.x},${worldPos.y}`,
            availableGroups: Object.keys(viewState.group || {}),
          });
        }
      } else {
        console.log('[🎯COORD] MOVE-INTO-GROUP no parent, absolute position:', {
          nodeId,
          position: `${position.x},${position.y}`,
        });
      }
      
      // Override position AND dimensions from ViewState (now correctly relative if has parent)
      const width = geometry.w ?? node.data?.width ?? (node.style as any)?.width ?? (isGroup ? 480 : 96);
      const height = geometry.h ?? node.data?.height ?? (node.style as any)?.height ?? (isGroup ? 320 : 96);
      
      const result = {
        ...node,
        position,
        // Update data.position and dimensions
        data: {
          ...node.data,
          width,
          height,
          position: { x: geometry.x, y: geometry.y }, // Keep absolute in data for reference
        },
        // Update style dimensions for groups
        style: isGroup ? {
          ...(node.style || {}),
          width,
          height,
        } : node.style,
      };
      
      console.log('[🎯COORD] ReactFlowAdapter - final ReactFlow node:', {
        nodeId,
        reactFlowPosition: `${position.x},${position.y}`,
        viewStateGeometry: `${geometry.x},${geometry.y}`,
        parentId: (node as any).parentId || 'root',
        isGroup,
      });
      
      return result;
    }

    // Fallback: use ELK position (only if strictGeometry is false)
    if (!strictGeometry) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[🎯COORD] ReactFlowAdapter using ELK position for ${isGroup ? 'group' : 'node'} "${nodeId}" ` +
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
  // Also preserve sourcePosition and targetPosition from domain graph edge data
  const edges = elkEdges.map((edge) => {
    const edgeId = edge.id;
    const edgeGeom = viewState.edge?.[edgeId];
    
    // Get port positions from domain graph edge data (if available)
    const domainEdge = (elkGraph as any).edges?.find((e: any) => e.id === edgeId);
    const sourcePosition = domainEdge?.data?.sourcePosition || edge.data?.sourcePosition;
    const targetPosition = domainEdge?.data?.targetPosition || edge.data?.targetPosition;

    if (edgeGeom?.waypoints && Array.isArray(edgeGeom.waypoints)) {
      // Use ViewState waypoints (manual routing in FREE mode)
      return {
        ...edge,
        data: {
          ...edge.data,
          bendPoints: edgeGeom.waypoints,
          sourcePosition,
          targetPosition,
        },
      };
    }

    // Use ELK waypoints (from processLayoutedGraph) but preserve port positions
    return {
      ...edge,
      data: {
        ...edge.data,
        sourcePosition,
        targetPosition,
      },
    };
  });

  return { nodes, edges };
}

