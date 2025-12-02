/**
 * ViewState cleanup utilities
 * Removes stale ViewState entries that don't correspond to actual domain nodes/groups
 */

import type { RawGraph } from '../../components/graph/types/index';
import type { ViewState } from './ViewState';

/**
 * Collects all node and group IDs from the domain graph
 */
function collectAllIds(graph: RawGraph): { nodeIds: Set<string>, groupIds: Set<string> } {
  const nodeIds = new Set<string>();
  const groupIds = new Set<string>();

  function traverse(node: any) {
    if (node.id) {
      // Check if this is a group (has children array or isGroup flag)
      // CRITICAL: Array.isArray() returns true even for empty arrays []
      const isGroup = 
        node.type === 'group' || 
        node.data?.isGroup === true || 
        node.mode || 
        Array.isArray(node.children) ||  // Empty array [] still counts
        Array.isArray(node.edges);
      
      if (isGroup) {
        groupIds.add(node.id);
        // CRITICAL: Groups also need to be in nodeIds so viewState.node entries are preserved
        nodeIds.add(node.id);
      } else {
        nodeIds.add(node.id);
      }
      console.log(`[🧹 CLEANUP] traverse: ${node.id} isGroup=${isGroup}`);
    }
    
    if (node.children) {
      node.children.forEach((child: any) => traverse(child));
    }
  }

  // Include root
  if (graph.id) {
    groupIds.add(graph.id);
  }
  
  if (graph.children) {
    console.log(`[🧹 CLEANUP] Processing ${graph.children.length} children of root`);
    graph.children.forEach(child => traverse(child));
  }

  return { nodeIds, groupIds };
}

/**
 * Cleans ViewState by removing entries that don't exist in the domain graph
 * This prevents "Missing ViewState geometry" warnings for stale nodes
 */
export function cleanViewState(domainGraph: RawGraph, viewState: ViewState): ViewState {
  const { nodeIds, groupIds } = collectAllIds(domainGraph);
  
  console.log('[🧹 CLEANUP] collectAllIds result:', {
    nodeIds: Array.from(nodeIds),
    groupIds: Array.from(groupIds),
    domainChildren: domainGraph.children?.length || 0,
    domainChildIds: domainGraph.children?.map(c => c.id) || []
  });
  
  const cleanedViewState: ViewState = {
    node: {},
    group: {},
    edge: { ...viewState.edge }, // Keep edges as-is for now
    layout: { ...viewState.layout } // CRITICAL: Preserve layout (modes) during cleanup
  };

  // CRITICAL: Groups need BOTH node and group entries in ViewState
  // CRITICAL: Groups also need entries in viewState.node
  // Keep ViewState entries for nodes OR groups that exist in domain
  // Also preserve groups that have group entries (in-flight creation)
  // CRITICAL: Preserve ALL geometry properties including w and h (size)
  Object.entries(viewState.node || {}).forEach(([nodeId, geometry]) => {
    // Keep if it's a node or a group (groups are in both nodeIds and groupIds)
    if (nodeIds.has(nodeId) || groupIds.has(nodeId)) {
      // CRITICAL: Preserve entire geometry object including w and h
      cleanedViewState.node[nodeId] = { ...geometry };
    } else {
      console.log(`[🧹 CLEANUP] Removing stale node ViewState: ${nodeId}`);
    }
  });

  // CRITICAL: Only keep ViewState entries for groups that exist in domain
  // If a group is not in domain, remove it (either deleted or never existed)
  // CRITICAL: Preserve ALL geometry properties including w and h (size)
  Object.entries(viewState.group || {}).forEach(([groupId, geometry]) => {
    if (groupIds.has(groupId)) {
      // Group exists in domain - definitely keep it with ALL properties
      cleanedViewState.group[groupId] = { ...geometry };
      console.log(`[🧹 CLEANUP] Preserving group ViewState: ${groupId}`, {
        geometry: { x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h }
      });
    } else if (nodeIds.has(groupId)) {
      // Group exists in domain as a node (groups are in both nodeIds and groupIds)
      // Preserve it
      cleanedViewState.group[groupId] = { ...geometry };
      console.log(`[🧹 CLEANUP] Preserving group ViewState (exists as node in domain): ${groupId}`, {
        geometry: { x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h }
      });
    } else {
      // Not in domain - remove it (deleted groups should be removed)
      console.log(`[🧹 CLEANUP] Removing stale/deleted group ViewState: ${groupId}`);
    }
  });

  const removedNodes = Object.keys(viewState.node || {}).length - Object.keys(cleanedViewState.node).length;
  const removedGroups = Object.keys(viewState.group || {}).length - Object.keys(cleanedViewState.group).length;
  
  if (removedNodes > 0 || removedGroups > 0) {
    console.log(`[🧹 CLEANUP] Cleaned ViewState: removed ${removedNodes} stale nodes, ${removedGroups} stale groups`);
  }

  return cleanedViewState;
}
