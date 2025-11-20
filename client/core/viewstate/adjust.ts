/**
 * ViewState adjustment helpers for FREE structural edits
 * Part of Agent B Inter Plan - B2
 * 
 * When a node/group is reparented in FREE mode (no ELK), we must preserve
 * its world position by adjusting its relative coordinates to the new parent.
 */

import type { ViewState, Geometry } from './ViewState';

export interface AdjustForReparentOptions {
  nodeId: string;
  oldParentId: string;
  newParentId: string;
  viewState: ViewState;
  /**
   * Function to get the world position of a group (for computing relative positions)
   */
  getGroupWorldPos: (groupId: string) => { x: number; y: number } | undefined;
}

/**
 * Adjusts ViewState geometry when a node is reparented in FREE mode.
 * 
 * Preserves the node's world (screen) position by recomputing its relative
 * position within the new parent.
 * 
 * Formula:
 * - nodeWorldPos = oldParentWorldPos + nodeRelativePos
 * - nodeRelativePos = nodeWorldPos - newParentWorldPos
 * 
 * @param options - Reparent adjustment options
 * @returns Updated ViewState with adjusted geometry
 */
export function adjustForReparent(options: AdjustForReparentOptions): ViewState {
  const { nodeId, oldParentId, newParentId, viewState, getGroupWorldPos } = options;

  // Get current node geometry
  const nodeGeom = viewState.node?.[nodeId];
  if (!nodeGeom) {
    console.warn(`[adjustForReparent] Node "${nodeId}" has no geometry in ViewState`);
    return viewState;
  }

  // Get world positions of old and new parents
  const oldParentWorldPos = oldParentId === 'root' 
    ? { x: 0, y: 0 } 
    : getGroupWorldPos(oldParentId);
  
  const newParentWorldPos = newParentId === 'root'
    ? { x: 0, y: 0 }
    : getGroupWorldPos(newParentId);

  if (!oldParentWorldPos || !newParentWorldPos) {
    console.warn(
      `[adjustForReparent] Cannot compute world positions for parents. ` +
      `oldParent: ${oldParentId}, newParent: ${newParentId}`
    );
    return viewState;
  }

  // Compute node's world position
  const nodeWorldX = oldParentWorldPos.x + nodeGeom.x;
  const nodeWorldY = oldParentWorldPos.y + nodeGeom.y;

  // Compute new relative position
  const newRelativeX = nodeWorldX - newParentWorldPos.x;
  const newRelativeY = nodeWorldY - newParentWorldPos.y;

  // Update ViewState
  const updated = {
    ...viewState,
    node: {
      ...viewState.node,
      [nodeId]: {
        ...nodeGeom,
        x: newRelativeX,
        y: newRelativeY,
      },
    },
  };

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[adjustForReparent] Preserved world position', {
      nodeId,
      oldParent: oldParentId,
      newParent: newParentId,
      worldPos: { x: nodeWorldX, y: nodeWorldY },
      oldRelative: { x: nodeGeom.x, y: nodeGeom.y },
      newRelative: { x: newRelativeX, y: newRelativeY },
    });
  }

  return updated;
}

