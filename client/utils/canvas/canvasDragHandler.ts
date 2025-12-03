/**
 * Canvas Drag Handler - FREE Mode Only
 * 
 * REFACTORED: All positions are ABSOLUTE.
 * - node.position is absolute (no parentId in ReactFlow)
 * - When a group moves, all children move by the same delta
 * - Domain reparenting is independent of position
 */

import { Node, NodeChange, applyNodeChanges } from 'reactflow';
import { findContainingGroup } from '../containmentDetection';
import { apply } from '../../core/orchestration/Orchestrator';
import type { EditIntent } from '../../core/orchestration/types';
import type { ViewState } from '../../core/viewstate/ViewState';
import type { RawGraph } from '../../components/graph/types';
import { persistViewStateAfterDrag } from './canvasDragPersistence';
import { CoordinateService } from '../../core/viewstate/CoordinateService';

// Track group drag start positions to calculate deltas for children
const groupDragStartPositions = new Map<string, { x: number; y: number }>();

interface HandleDragParams {
  changes: NodeChange[];
  selectedTool: string;
  reactFlowRef: React.RefObject<any>;
  recentlyCreatedNodesRef: React.MutableRefObject<Map<string, number>>;
  rawGraph: RawGraph | null;
  rawGraphRef: React.MutableRefObject<RawGraph | null>;
  viewStateRef: React.MutableRefObject<ViewState | undefined>;
  selectedArchitectureId: string | undefined;
}

/**
 * Find parent in domain graph
 */
function findParentInGraph(graph: RawGraph, nodeId: string): string {
  const findParent = (n: any, targetId: string, parentId: string = 'root'): string => {
    if (n.id === targetId) return parentId;
    if (n.children) {
      for (const child of n.children) {
        const result = findParent(child, targetId, n.id);
        if (result !== 'root' || child.id === targetId) return result;
      }
    }
    return 'root';
  };
  return findParent(graph, nodeId);
}

/**
 * Get all children IDs from domain graph (recursive)
 */
function getChildrenFromDomain(graph: RawGraph, groupId: string): string[] {
  const findNode = (n: any, targetId: string): any => {
    if (n.id === targetId) return n;
    if (n.children) {
      for (const child of n.children) {
        const found = findNode(child, targetId);
        if (found) return found;
      }
    }
    return null;
  };

  const group = findNode(graph, groupId);
  if (!group?.children) return [];

  const childIds: string[] = [];
  const collectIds = (node: any) => {
    childIds.push(node.id);
    node.children?.forEach(collectIds);
  };
  group.children.forEach(collectIds);
  return childIds;
}

/**
 * Check if a node is a group (has children in domain)
 */
function isGroupInDomain(graph: RawGraph, nodeId: string): boolean {
  const findNode = (n: any, targetId: string): any => {
    if (n.id === targetId) return n;
    if (n.children) {
      for (const child of n.children) {
        const found = findNode(child, targetId);
        if (found) return found;
      }
    }
    return null;
  };

  const node = findNode(graph, nodeId);
  return node?.children?.length > 0 || node?.edges?.length > 0;
}

/**
 * During drag: Handle reparenting in real-time as node crosses group boundaries
 * Also: Move children with groups in real-time during drag
 */
export async function handleDragChanges(params: HandleDragParams): Promise<void> {
  const { changes, selectedTool, reactFlowRef, recentlyCreatedNodesRef, rawGraph, rawGraphRef, viewStateRef } = params;

  // Filter for active drag events (dragging === true)
  const dragChanges = changes.filter((ch) => ch.type === 'position' && (ch as any).dragging === true);
  if (dragChanges.length === 0 || selectedTool === 'box' || !reactFlowRef.current || !rawGraph) return;

  const currentNodes = reactFlowRef.current.getNodes() || [];
  const latestGraph = rawGraphRef.current || rawGraph;

  for (const change of dragChanges) {
    const nodeId = (change as any).id;
    if (!nodeId) continue;

    // Skip recently created nodes
    const createdTime = recentlyCreatedNodesRef.current.get(nodeId);
    if (createdTime && Date.now() - createdTime < 100) continue;

    const node = currentNodes.find((n: Node) => n.id === nodeId);
    if (!node) continue;

    // Get position from change event (current drag position)
    const currentPosition = (change as any).position || node.position;

    // Handle group drag: Move children in real-time
    if (node.type === 'group' && isGroupInDomain(latestGraph, nodeId)) {
      // Track drag start position and child start positions on first drag event
      if (!groupDragStartPositions.has(nodeId)) {
        // Use ViewState as the starting position for the group
        const startGeom = viewStateRef.current?.node?.[nodeId] || viewStateRef.current?.group?.[nodeId];
        const groupStartPos = startGeom ? { x: startGeom.x, y: startGeom.y } : currentPosition;
        groupDragStartPositions.set(nodeId, groupStartPos);
        
        // Also track child start positions from ReactFlow (current positions at drag start)
        const childIds = getChildrenFromDomain(latestGraph, nodeId);
        childIds.forEach((childId: string) => {
          const childNode = currentNodes.find((n: Node) => n.id === childId);
          if (childNode && !groupDragStartPositions.has(`child_${childId}`)) {
            groupDragStartPositions.set(`child_${childId}`, { x: childNode.position.x, y: childNode.position.y });
          }
        });
      }
      
      const groupStartPos = groupDragStartPositions.get(nodeId)!;
      
      // Calculate delta from start position to current drag position
      const delta = {
        dx: currentPosition.x - groupStartPos.x,
        dy: currentPosition.y - groupStartPos.y,
      };

      // Only move children if there's actual movement
      if (Math.abs(delta.dx) > 0.1 || Math.abs(delta.dy) > 0.1) {
        const childIds = getChildrenFromDomain(latestGraph, nodeId);

        // CRITICAL: Use requestAnimationFrame to update children AFTER ReactFlow has applied the group's position change
        // This ensures we don't interfere with ReactFlow's drag handling
        requestAnimationFrame(() => {
          if (!reactFlowRef.current) return;
          
          const currentNodesState = reactFlowRef.current.getNodes() || [];
          const groupNode = currentNodesState.find((n: Node) => n.id === nodeId);
          if (!groupNode) return;
          
          // Get the ACTUAL current group position (after ReactFlow applied the change)
          const actualGroupPos = groupNode.position;
          
          // Recalculate delta based on actual group position
          const actualDelta = {
            dx: actualGroupPos.x - groupStartPos.x,
            dy: actualGroupPos.y - groupStartPos.y,
          };
          
          // Update children positions based on actual delta
          reactFlowRef.current.setNodes((nodes: Node[]) =>
            nodes.map((n: Node) => {
              // DON'T touch the group - ReactFlow handles it
              if (n.id === nodeId) return n;
              
              // Only update children
              if (childIds.includes(n.id)) {
                const childStartKey = `child_${n.id}`;
                const childStart = groupDragStartPositions.get(childStartKey);
                
                if (childStart) {
                  return {
                    ...n,
                    position: {
                      x: childStart.x + actualDelta.dx,
                      y: childStart.y + actualDelta.dy,
                    },
                  };
                }
              }
              
              return n;
            })
          );
        });

        console.log('[🔄 DRAG] Moving children with group in real-time:', {
          groupId: nodeId,
          childCount: childIds.length,
          delta: `${delta.dx},${delta.dy}`,
          groupStart: `${groupStartPos.x},${groupStartPos.y}`,
          groupCurrent: `${currentPosition.x},${currentPosition.y}`,
        });
      }

      // Continue to next change (groups handle reparenting differently)
      continue;
    }

    // Handle node drag: Check for reparenting
    if (node.type !== 'group') {
      const nodeWithCurrentPosition = { ...node, position: currentPosition };

      // Check containment
      const containingGroup = findContainingGroup(nodeWithCurrentPosition, currentNodes, viewStateRef.current, true);
      const currentParent = findParentInGraph(latestGraph, nodeId);
      const newParentId = containingGroup ? containingGroup.id : 'root';

      // If reparent needed
      if (currentParent !== newParentId) {
        console.log('[🔄 DRAG] Reparenting:', { nodeId, from: currentParent, to: newParentId });

        const intent: EditIntent = {
          source: 'user',
          kind: 'free-structural',
          scopeId: newParentId !== 'root' ? newParentId : 'root',
          payload: {
            action: 'move-node',
            nodeId,
            oldParentId: currentParent,
            newParentId,
          }
        };
        
        // Apply reparenting (don't await to keep drag smooth)
        apply(intent).catch(err => console.error('[🔄 DRAG] Reparent error:', err));
      }
    }
  }
}

/**
 * On drop: Update ViewState positions (absolute)
 * Reparenting is handled during drag (in handleDragChanges)
 * For groups: also move all children by the same delta
 */
export async function handleDragEndChanges(params: HandleDragParams): Promise<void> {
  const { changes, selectedTool, reactFlowRef, recentlyCreatedNodesRef, rawGraph, rawGraphRef, viewStateRef, selectedArchitectureId } = params;

  const dragEndChanges = changes.filter((ch) => ch.type === 'position' && (ch as any).dragging === false);
  if (dragEndChanges.length === 0 || selectedTool === 'box' || !reactFlowRef.current || !rawGraph) return;

  const currentNodes = reactFlowRef.current.getNodes() || [];
  const latestGraph = rawGraphRef.current || rawGraph;
    
  const draggedNodeIds = dragEndChanges
    .map(ch => (ch as any).id)
    .filter(Boolean)
    .filter((nodeId: string) => {
      const createdTime = recentlyCreatedNodesRef.current.get(nodeId);
      return !(createdTime && Date.now() - createdTime < 100);
    });
    
  // Update positions (reparenting already happened during drag)
  // Track which nodes we've already moved (to avoid moving children twice)
  const movedNodeIds = new Set<string>();

  for (const nodeId of draggedNodeIds) {
    if (movedNodeIds.has(nodeId)) continue;

    const node = currentNodes.find((n: Node) => n.id === nodeId);
    if (!node) continue;

    // Get position from ReactFlow node
    // CRITICAL: If node has parentId, position is RELATIVE; otherwise it's ABSOLUTE
    let newAbsolutePos = { x: node.position.x, y: node.position.y };
    
    // If node has a parent, convert relative position to absolute
    const parentId = (node as any).parentId;
    if (parentId && viewStateRef.current) {
      const parentGeom = viewStateRef.current.group?.[parentId];
      if (parentGeom) {
        const parentWorldPos = { x: parentGeom.x, y: parentGeom.y };
        newAbsolutePos = CoordinateService.toWorldFromRelative(newAbsolutePos, parentWorldPos);
        
        console.log('[🔄 DRAG-END] Converted relative to absolute:', {
          nodeId,
          parentId,
          relativePos: `${node.position.x},${node.position.y}`,
          parentPos: `${parentWorldPos.x},${parentWorldPos.y}`,
          absolutePos: `${newAbsolutePos.x},${newAbsolutePos.y}`,
        });
      } else {
        console.warn('[🔄 DRAG-END] Node has parentId but parent geometry missing:', {
          nodeId,
          parentId,
          availableGroups: Object.keys(viewStateRef.current.group || {}),
        });
      }
    }
    
    // Verify position from change event if available (for debugging)
    const positionChange = dragEndChanges.find((ch: any) => ch.id === nodeId && ch.type === 'position');
    if (positionChange && (positionChange as any).position) {
      const changePos = (positionChange as any).position;
      // Log if there's a discrepancy
      if (Math.abs(changePos.x - newAbsolutePos.x) > 1 || Math.abs(changePos.y - newAbsolutePos.y) > 1) {
        console.warn('[🔄 DRAG-END] Position mismatch:', {
          nodeId,
          nodePosition: newAbsolutePos,
          changePosition: changePos,
          using: 'node.position (converted to absolute)'
        });
      }
    }
    
    // Snap to grid (16px grid)
    newAbsolutePos = CoordinateService.snapPoint(newAbsolutePos);

    // Get old position from ViewState
    const oldGeom = viewStateRef.current?.node?.[nodeId] || viewStateRef.current?.group?.[nodeId];
    const oldAbsolutePos = oldGeom ? { x: oldGeom.x, y: oldGeom.y } : newAbsolutePos;

    // Calculate delta
    const delta = {
      dx: newAbsolutePos.x - oldAbsolutePos.x,
      dy: newAbsolutePos.y - oldAbsolutePos.y,
    };

    console.log('[🔄 DRAG-END] Position update:', {
      nodeId,
      oldPos: `${oldAbsolutePos.x},${oldAbsolutePos.y}`,
      newPos: `${newAbsolutePos.x},${newAbsolutePos.y}`,
      delta: `${delta.dx},${delta.dy}`,
    });

    // Update this node's position
    const intent: EditIntent = {
      source: 'user',
      kind: 'geo-only',
      scopeId: 'root',
      payload: {
        action: 'move-node',
        nodeId,
        position: newAbsolutePos
      }
    };
    await apply(intent);
    movedNodeIds.add(nodeId);

    // If this is a group, move all children by the same delta
    if (isGroupInDomain(latestGraph, nodeId) && (delta.dx !== 0 || delta.dy !== 0)) {
      const childIds = getChildrenFromDomain(latestGraph, nodeId);
      
      console.log('[🔄 DRAG-END] Moving children with group:', {
        groupId: nodeId,
        childCount: childIds.length,
        delta: `${delta.dx},${delta.dy}`,
      });

      for (const childId of childIds) {
        if (movedNodeIds.has(childId)) continue;

        const childGeom = viewStateRef.current?.node?.[childId] || viewStateRef.current?.group?.[childId];
        if (childGeom) {
          const childIntent: EditIntent = {
            source: 'user',
            kind: 'geo-only',
            scopeId: 'root',
            payload: {
              action: 'move-node',
              nodeId: childId,
              position: {
                x: childGeom.x + delta.dx,
                y: childGeom.y + delta.dy
              }
            }
          };
          await apply(childIntent);
          movedNodeIds.add(childId);
        }
      }
    }
  }

  // Clear drag start positions tracking
  draggedNodeIds.forEach((nodeId: string) => {
    if (isGroupInDomain(latestGraph, nodeId)) {
      groupDragStartPositions.delete(nodeId);
      // Also clear child start positions for this group
      const childIds = getChildrenFromDomain(latestGraph, nodeId);
      childIds.forEach((childId: string) => {
        groupDragStartPositions.delete(`child_${childId}`);
      });
    }
  });

  // Persist after all updates
  // CRITICAL: Use the graph from ref (which should have the latest reparenting changes)
  // Don't use rawGraph parameter which might be stale
  const graphToPersist = rawGraphRef.current || latestGraph;
  if (viewStateRef.current && selectedArchitectureId && graphToPersist) {
    persistViewStateAfterDrag(viewStateRef.current, graphToPersist, selectedArchitectureId);
  }
}
