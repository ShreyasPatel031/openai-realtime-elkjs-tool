import { Node } from 'reactflow';

/**
 * Check if a point is inside a rectangle
 */
function isPointInRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Check if a rectangle is fully contained within another rectangle
 */
function isRectFullyContained(
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Get absolute position from ViewState (preferred) or ReactFlow node as fallback
 * @param useReactFlowPosition - If true, forces use of ReactFlow position even if ViewState exists
 */
function getAbsolutePosition(
  node: Node, 
  allNodes: Node[], 
  viewState?: { node: Record<string, { x: number; y: number; w: number; h: number }>; group: Record<string, { x: number; y: number; w: number; h: number }> },
  useReactFlowPosition: boolean = false
): { x: number; y: number } {
  // If forcing ReactFlow position (e.g., during drag), use it directly
  if (useReactFlowPosition) {
    let x = node.position.x;
    let y = node.position.y;
    
    // If node has a parent, add parent's absolute position
    if (node.parentId) {
      const parent = allNodes.find(n => n.id === node.parentId);
      if (parent) {
        // For parent, prefer ViewState (parents don't move during child drag)
        const parentAbs = getAbsolutePosition(parent, allNodes, viewState, false);
        x += parentAbs.x;
        y += parentAbs.y;
      }
    }
    
    return { x, y };
  }
  
  // Prefer ViewState positions (absolute coordinates) when not forcing ReactFlow
  if (viewState) {
    const nodeGeom = viewState.node[node.id] || viewState.group[node.id];
    if (nodeGeom) {
      return { x: nodeGeom.x, y: nodeGeom.y };
    }
  }
  
  // Fallback to ReactFlow positions (may be stale)
  let x = node.position.x;
  let y = node.position.y;
  
  // If node has a parent, add parent's absolute position
  if (node.parentId) {
    const parent = allNodes.find(n => n.id === node.parentId);
    if (parent) {
      const parentAbs = getAbsolutePosition(parent, allNodes, viewState, false);
      x += parentAbs.x;
      y += parentAbs.y;
    }
  }
  
  return { x, y };
}

/**
 * Get node bounds from ViewState (preferred) or ReactFlow node in absolute coordinates
 * During drag operations, ReactFlow positions are more up-to-date than ViewState
 */
function getNodeBounds(
  node: Node, 
  allNodes: Node[], 
  viewState?: { node: Record<string, { x: number; y: number; w: number; h: number }>; group: Record<string, { x: number; y: number; w: number; h: number }> },
  useReactFlowPosition: boolean = false
): { x: number; y: number; width: number; height: number } | null {
  const width = (node.data as any)?.width ?? (node.style as any)?.width ?? 96;
  const height = (node.data as any)?.height ?? (node.style as any)?.height ?? 96;
  
  if (typeof width !== 'number' || typeof height !== 'number') {
    return null;
  }

  // During drag operations, ReactFlow positions are more current than ViewState
  // Use ReactFlow position directly for root nodes (already absolute)
  // For child nodes, calculate absolute from ReactFlow position + parent
  if (useReactFlowPosition || !viewState) {
    const absPos = getAbsolutePosition(node, allNodes, viewState, useReactFlowPosition);
    return {
      x: absPos.x,
      y: absPos.y,
      width,
      height,
    };
  }

  // Prefer ViewState dimensions and positions (absolute coordinates) when not dragging
  const nodeGeom = viewState.node[node.id] || viewState.group[node.id];
  if (nodeGeom) {
    return {
      x: nodeGeom.x,
      y: nodeGeom.y,
      width: nodeGeom.w,
      height: nodeGeom.h,
    };
  }
  
  // Final fallback: calculate from ReactFlow position
  const absPos = getAbsolutePosition(node, allNodes, viewState);
  
  return {
    x: absPos.x,
    y: absPos.y,
    width,
    height,
  };
}

/**
 * Check if a node is completely inside a group's bounds
 * Returns the group node if containment is detected
 * A node is considered inside if ALL of its bounds are within the group bounds
 * Uses absolute coordinates to account for parent positions
 */
export function findContainingGroup(
  node: Node,
  allNodes: Node[],
  viewState?: { node: Record<string, { x: number; y: number; w: number; h: number }>; group: Record<string, { x: number; y: number; w: number; h: number }> },
  useReactFlowPosition: boolean = true
): Node | null {
  // Don't check containment for the node against itself
  if (node.type === 'group') {
    return null;
  }

  const nodeBounds = getNodeBounds(node, allNodes, viewState, useReactFlowPosition);
  if (!nodeBounds) {
    console.log('❌ [CONTAINMENT] No node bounds for:', { nodeId: node.id });
    return null;
  }

  // Find all group nodes
  const groups = allNodes.filter(n => n.type === 'group');
  
  for (const group of groups) {
    // Skip if node is the group itself
    if (node.id === group.id) {
      continue;
    }
    
    // For groups, prefer ViewState (groups don't move as frequently during drag)
    const groupBounds = getNodeBounds(group, allNodes, viewState, false);
    if (!groupBounds) {
      continue;
    }

    // Check if ALL of the node is inside group bounds
    // All four corners must be inside - using absolute coordinates
    // We check even if node.parentId === group.id to detect when it moves out
    const isFullyContained = isRectFullyContained(nodeBounds, groupBounds);
    
    if (isFullyContained) {
      return group;
    }
  }
  

  return null;
}

/**
 * Check if a group fully encompasses a node
 * Returns the node if it's fully contained
 * Uses absolute coordinates to account for parent positions
 */
export function findFullyContainedNodes(
  group: Node,
  allNodes: Node[],
  viewState?: { node: Record<string, { x: number; y: number; w: number; h: number }>; group: Record<string, { x: number; y: number; w: number; h: number }> }
): Node[] {
  const groupBounds = getNodeBounds(group, allNodes, viewState);
  if (!groupBounds) return [];

  // Find all non-group nodes that are not already children of this group
  const regularNodes = allNodes.filter(n => 
    n.type !== 'group' && 
    n.id !== group.id && 
    n.parentId !== group.id
  );
  const containedNodes: Node[] = [];

  for (const node of regularNodes) {
    const nodeBounds = getNodeBounds(node, allNodes, viewState);
    if (!nodeBounds) continue;

    // Check if node is fully contained within group (using absolute coordinates)
    if (isRectFullyContained(nodeBounds, groupBounds)) {
      containedNodes.push(node);
    }
  }

  return containedNodes;
}

