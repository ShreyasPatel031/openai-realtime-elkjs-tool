/**
 * Scoped layout runner (ELK orchestration)
 * Part of Agent C - Wave 1
 * 
 * Implements:
 * - Extract subtree for scopeId from Domain
 * - Run ELK on subtree only (not whole graph)
 * - Anchor scope top-left to prevent jumping
 * - Write computed geometry to ViewStateDelta
 */

import ELK from "elkjs/lib/elk.bundled.js";
import type { ViewStateDelta } from './types';
import type { LayoutOptions } from './types';
import type { ViewState } from '../viewstate/ViewState';
import type { RawGraph } from '../../components/graph/types/index';
import type { ElkGraphNode } from '../../types/graph';
import { ensureIds } from '../../components/graph/utils/elk/ids';
import { NON_ROOT_DEFAULT_OPTIONS, GROUP_FRAME_PADDING } from '../../components/graph/utils/elk/elkOptions';
import { findNodeById } from '../../components/graph/utils/find';
import { CoordinateService } from '../viewstate/CoordinateService';

const elk = new ELK();

/**
 * Extracts a subtree from the domain graph starting at scopeId.
 * Returns a deep copy of the subtree suitable for ELK layout.
 */
function extractSubtree(graph: RawGraph, scopeId: string): ElkGraphNode | null {
  // Find the scope node in the graph
  const scopeNode = findNodeById(graph, scopeId);
  if (!scopeNode) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[ScopedLayoutRunner] Scope node "${scopeId}" not found in graph`);
    }
    return null;
  }

  // Deep clone the subtree
  return JSON.parse(JSON.stringify(scopeNode));
}

/**
 * Computes the bounding box top-left for a scope from ViewState.
 * Returns the minimum x and y coordinates of all nodes/groups in the scope.
 */
function computeScopeBboxTopLeft(
  scopeId: string,
  subtree: ElkGraphNode,
  viewState: ViewState
): { x: number; y: number } | null {
  // Collect all IDs in the subtree (including scope itself)
  const ids = new Set<string>([scopeId]);
  
  function collectIds(node: ElkGraphNode): void {
    if (node.children) {
      node.children.forEach(child => {
        ids.add(child.id);
        collectIds(child);
      });
    }
  }
  
  collectIds(subtree);

  // Find minimum x and y from ViewState
  let minX = Infinity;
  let minY = Infinity;
  let foundAny = false;

  for (const id of ids) {
    const nodeGeom = viewState.node?.[id];
    const groupGeom = viewState.group?.[id];
    const geom = nodeGeom || groupGeom;

    if (geom && Number.isFinite(geom.x) && Number.isFinite(geom.y)) {
      minX = Math.min(minX, geom.x);
      minY = Math.min(minY, geom.y);
      foundAny = true;
    }
  }

  if (!foundAny) {
    // No existing geometry - return null (will use ELK's natural position)
    return null;
  }

  return { x: minX, y: minY };
}

/**
 * Translates all positions in the ELK layout output to preserve the anchor point.
 */
function translateLayout(
  layout: ElkGraphNode,
  anchorTopLeft: { x: number; y: number },
  elkTopLeft: { x: number; y: number }
): void {
  const dx = anchorTopLeft.x - elkTopLeft.x;
  const dy = anchorTopLeft.y - elkTopLeft.y;

  function translateNode(node: ElkGraphNode): void {
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
      node.x = (node.x || 0) + dx;
      node.y = (node.y || 0) + dy;
    }

    if (node.children) {
      node.children.forEach(translateNode);
    }
  }

  translateNode(layout);
}

/**
 * Auto-fits a group frame to its children by computing bounding box.
 * Uses ViewState dimensions for nested groups instead of defaults.
 */
function autoFitGroupFrame(
  groupNode: ElkGraphNode,
  layout: ElkGraphNode,
  viewState: ViewState
): { w: number; h: number } {
  if (!groupNode.children || groupNode.children.length === 0) {
    // No children - try to use existing ViewState size, otherwise default
    const existingGeom = viewState.group?.[groupNode.id];
    if (existingGeom?.w && existingGeom?.h) {
      return { w: existingGeom.w, h: existingGeom.h };
    }
    return {
      w: NON_ROOT_DEFAULT_OPTIONS.width * 3,
      h: 96 * 3
    };
  }

  // Find the group in the layout
  const layoutGroup = findNodeById(layout, groupNode.id);
  if (!layoutGroup) {
    // Try to use existing ViewState size
    const existingGeom = viewState.group?.[groupNode.id];
    if (existingGeom?.w && existingGeom?.h) {
      return { w: existingGeom.w, h: existingGeom.h };
    }
    return {
      w: NON_ROOT_DEFAULT_OPTIONS.width * 3,
      h: 96 * 3
    };
  }

  // Compute bounding box of children
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function computeBbox(node: ElkGraphNode): void {
    if (node.id === groupNode.id) {
      // Skip the group itself, process children
      if (node.children) {
        node.children.forEach(computeBbox);
      }
      return;
    }

    const x = node.x || 0;
    const y = node.y || 0;
    
    // Check if this is a nested group and use ViewState dimensions if available
    const isNestedGroup = !!(node.children && node.children.length > 0);
    let w: number;
    let h: number;
    
    if (isNestedGroup) {
      // For nested groups, use ViewState dimensions if available
      const groupGeom = viewState.group?.[node.id];
      if (groupGeom?.w && groupGeom?.h) {
        w = groupGeom.w;
        h = groupGeom.h;
      } else {
        // Fallback to ELK output or default
        w = node.width || NON_ROOT_DEFAULT_OPTIONS.width * 3;
        h = node.height || 96 * 3;
      }
    } else {
      // Regular nodes: use ViewState or ELK output or default
      const nodeGeom = viewState.node?.[node.id];
      if (nodeGeom?.w && nodeGeom?.h) {
        w = nodeGeom.w;
        h = nodeGeom.h;
      } else {
        w = node.width || NON_ROOT_DEFAULT_OPTIONS.width;
        h = node.height || 96;
      }
    }

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  computeBbox(layoutGroup);

  if (!Number.isFinite(minX)) {
    // No valid children - try to use existing ViewState size
    const existingGeom = viewState.group?.[groupNode.id];
    if (existingGeom?.w && existingGeom?.h) {
      return { w: existingGeom.w, h: existingGeom.h };
    }
    return {
      w: NON_ROOT_DEFAULT_OPTIONS.width * 3,
      h: 96 * 3
    };
  }

  // Add padding using centralized constant
  return {
    w: Math.max(maxX - minX + GROUP_FRAME_PADDING * 2, NON_ROOT_DEFAULT_OPTIONS.width * 3),
    h: Math.max(maxY - minY + GROUP_FRAME_PADDING * 2, 96 * 3)
  };
}

/**
 * Extracts geometry from ELK layout output and converts to ViewStateDelta format.
 * Uses ViewState dimensions when available for nested groups.
 */
function extractGeometryFromLayout(
  layout: ElkGraphNode,
  scopeId: string,
  viewState: ViewState
): ViewStateDelta {
  const delta: ViewStateDelta = {
    node: {},
    group: {},
    edge: {}
  };

  // CRITICAL: Get scope group's absolute position from ViewState
  // ELK returns relative positions, we need to convert to absolute
  const scopeGroupGeom = viewState.group?.[scopeId];
  const scopeAbsolutePos = scopeGroupGeom 
    ? { x: scopeGroupGeom.x, y: scopeGroupGeom.y }
    : { x: 0, y: 0 }; // Fallback to origin if scope not found

  console.log('[🎯COORD] extractGeometryFromLayout - scope absolute position:', {
    scopeId,
    scopeAbsolute: `${scopeAbsolutePos.x},${scopeAbsolutePos.y}`,
  });

  function extractFromNode(node: ElkGraphNode, isGroup: boolean, parentElkPos: { x: number; y: number } = { x: 0, y: 0 }): void {
    const id = node.id;
    // ELK gives us relative position within its parent scope
    const elkRelativePos = { x: node.x || 0, y: node.y || 0 };
    
    // Convert to absolute: ELK relative + parent absolute (or scope absolute for root children)
    // For scope root children, parent is the scope itself
    const parentAbsolute = parentElkPos.x === 0 && parentElkPos.y === 0 
      ? scopeAbsolutePos 
      : parentElkPos;
    
    const absolutePos = CoordinateService.toWorldFromRelative(elkRelativePos, parentAbsolute);
    
    console.log('[🎯COORD] extractGeometryFromLayout - converting ELK relative to absolute:', {
      nodeId: id,
      isGroup,
      elkRelative: `${elkRelativePos.x},${elkRelativePos.y}`,
      parentAbsolute: `${parentAbsolute.x},${parentAbsolute.y}`,
      absolute: `${absolutePos.x},${absolutePos.y}`,
    });
    
    // Use ViewState dimensions if available, especially for nested groups
    let w: number;
    let h: number;
    
    if (isGroup) {
      const groupGeom = viewState.group?.[id];
      if (groupGeom?.w && groupGeom?.h) {
        w = groupGeom.w;
        h = groupGeom.h;
      } else {
        w = node.width || NON_ROOT_DEFAULT_OPTIONS.width * 3;
        h = node.height || 96 * 3;
      }
    } else {
      const nodeGeom = viewState.node?.[id];
      if (nodeGeom?.w && nodeGeom?.h) {
        w = nodeGeom.w;
        h = nodeGeom.h;
      } else {
        w = node.width || NON_ROOT_DEFAULT_OPTIONS.width;
        h = node.height || 96;
      }
    }

    if (isGroup) {
      if (!delta.group) delta.group = {};
      delta.group[id] = { x: absolutePos.x, y: absolutePos.y, w, h };
    } else {
      if (!delta.node) delta.node = {};
      delta.node[id] = { x: absolutePos.x, y: absolutePos.y, w, h };
    }

    // Process children recursively - pass this node's absolute position as parent
    if (node.children) {
      node.children.forEach(child => {
        const childIsGroup = !!(child.children && child.children.length > 0);
        extractFromNode(child, childIsGroup, absolutePos);
      });
    }

    // Extract edge waypoints if available
    if (node.edges) {
      if (!delta.edge) delta.edge = {};
      node.edges.forEach(edge => {
        if (edge.sections && edge.sections.length > 0) {
          const waypoints: Array<{ x: number; y: number }> = [];
          edge.sections.forEach(section => {
            if (section.bendPoints) {
              waypoints.push(...section.bendPoints);
            }
          });
          if (waypoints.length > 0) {
            delta.edge[edge.id] = { waypoints };
          }
        }
      });
    }
  }

  // Start extraction from the scope node
  // Scope node itself uses its absolute position from ViewState (already stored)
  const scopeIsGroup = !!(layout.children && layout.children.length > 0);
  
  // For scope node, use its absolute position directly (don't convert)
  const scopeX = layout.x || 0;
  const scopeY = layout.y || 0;
  // After anchoring, scope position might be different - use anchored position
  const scopeAbsoluteAfterAnchor = scopeGroupGeom
    ? { x: scopeGroupGeom.x, y: scopeGroupGeom.y } // Keep existing absolute position
    : { x: scopeX, y: scopeY }; // Use ELK position if no ViewState
  
  console.log('[🎯COORD] extractGeometryFromLayout - scope node position:', {
    scopeId,
    elkRelative: `${scopeX},${scopeY}`,
    viewStateAbsolute: scopeGroupGeom ? `${scopeGroupGeom.x},${scopeGroupGeom.y}` : 'none',
    finalAbsolute: `${scopeAbsoluteAfterAnchor.x},${scopeAbsoluteAfterAnchor.y}`,
  });
  
  // Extract children (they will be converted relative to scope)
  if (layout.children) {
    layout.children.forEach(child => {
      const childIsGroup = !!(child.children && child.children.length > 0);
      extractFromNode(child, childIsGroup, scopeAbsoluteAfterAnchor);
    });
  }

  return delta;
}

/**
 * Runs scoped ELK layout on a specific group scope.
 * 
 * @param scopeId - Group ID to run layout on (never 'root' by default)
 * @param domainGraph - The full domain graph (RawGraph)
 * @param currentViewState - Current ViewState for computing anchor
 * @param opts - Layout options (anchoring, etc.)
 * @returns ViewStateDelta with computed geometry for nodes/groups/edges in scope
 * 
 * @example
 * ```ts
 * const delta = await runScopeLayout('group-123', domainGraph, viewState, { anchorId: 'node-456' });
 * // delta contains { node: { 'node-456': { x, y, w, h }, ... }, ... }
 * ```
 */
export async function runScopeLayout(
  scopeId: string,
  domainGraph: RawGraph,
  currentViewState: ViewState,
  opts?: LayoutOptions
): Promise<ViewStateDelta> {
  // 1. Extract subtree for scopeId from Domain graph
  const subtree = extractSubtree(domainGraph, scopeId);
  if (!subtree) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[ScopedLayoutRunner] Failed to extract subtree for scope "${scopeId}"`);
    }
    return {};
  }

  // 2. Compute pre-layout bbox top-left for anchoring
  const anchorTopLeft = computeScopeBboxTopLeft(scopeId, subtree, currentViewState);

  // 3. Prepare subtree for ELK (ensure IDs and options)
  const prepared = ensureIds(JSON.parse(JSON.stringify(subtree)));

  // 3b. Inject ViewState dimensions into prepared subtree before ELK layout
  // This ensures ELK knows the actual sizes of nodes/groups (especially nested groups)
  function injectViewStateDimensions(node: ElkGraphNode): void {
    const id = node.id;
    const isGroup = !!(node.children && node.children.length > 0);
    
    // Get dimensions from ViewState
    if (isGroup) {
      const groupGeom = currentViewState.group?.[id];
      if (groupGeom?.w && groupGeom?.h) {
        node.width = groupGeom.w;
        node.height = groupGeom.h;
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[ScopedLayoutRunner] Injected ViewState dimensions for group ${id}: ${groupGeom.w}x${groupGeom.h}`);
        }
      }
    } else {
      const nodeGeom = currentViewState.node?.[id];
      if (nodeGeom?.w && nodeGeom?.h) {
        node.width = nodeGeom.w;
        node.height = nodeGeom.h;
      }
    }
    
    // Recursively process children
    if (node.children) {
      node.children.forEach(child => injectViewStateDimensions(child));
    }
  }
  
  injectViewStateDimensions(prepared);

  // 4. Run ELK on scope subtree
  let layout: ElkGraphNode;
  try {
    const elkResult = await elk.layout(prepared);
    layout = elkResult as ElkGraphNode;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[ScopedLayoutRunner] ELK layout failed for scope "${scopeId}":`, error);
    }
    throw new Error(`ELK layout failed for scope "${scopeId}": ${error}`);
  }

  // 5. Translate output to preserve anchor top-left (if anchor exists)
  if (anchorTopLeft && layout.x !== undefined && layout.y !== undefined) {
    const elkTopLeft = { x: layout.x, y: layout.y };
    translateLayout(layout, anchorTopLeft, elkTopLeft);
  }

  // 6. Auto-fit group frame to children (use ViewState dimensions for nested groups)
  const frameSize = autoFitGroupFrame(subtree, layout, currentViewState);
  if (layout.width !== undefined) layout.width = frameSize.w;
  if (layout.height !== undefined) layout.height = frameSize.h;

  // 7. Convert ELK positions to ViewStateDelta format (use ViewState dimensions for nested groups)
  const delta = extractGeometryFromLayout(layout, scopeId, currentViewState);

  // Ensure the scope group itself is included in the delta
  if (!delta.group) delta.group = {};
  delta.group[scopeId] = {
    x: layout.x || 0,
    y: layout.y || 0,
    w: frameSize.w,
    h: frameSize.h
  };

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[ScopedLayoutRunner] Layout complete for scope "${scopeId}":`, {
      nodeCount: Object.keys(delta.node || {}).length,
      groupCount: Object.keys(delta.group || {}).length,
      edgeCount: Object.keys(delta.edge || {}).length,
      anchored: !!anchorTopLeft
    });
  }

  return delta;
}

