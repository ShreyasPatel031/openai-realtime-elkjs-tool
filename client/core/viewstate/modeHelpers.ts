/**
 * Mode Migration Helpers
 * Part of Mode Domain→ViewState Migration Plan
 * 
 * Helpers for migrating FREE/LOCK mode from Domain Graph to ViewState.layout
 */

import type { ViewState } from './ViewState';
import type { ElkGraphNode } from '../../types/graph';

/**
 * Extracts mode from all groups in Domain Graph
 * @param graph - Domain Graph to scan
 * @returns Map of groupId → mode
 */
export function extractModeFromDomain(graph: ElkGraphNode): Record<string, 'FREE' | 'LOCK'> {
  const modeMap: Record<string, 'FREE' | 'LOCK'> = {};
  
  const traverse = (node: ElkGraphNode) => {
    // Only groups have mode (nodes don't)
    if (node.children && node.children.length > 0) {
      // Extract mode from Domain Graph node
      modeMap[node.id] = node.mode || 'FREE';
    }
    
    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  };
  
  traverse(graph);
  return modeMap;
}

/**
 * Gets mode from ViewState.layout, with FREE fallback
 * @param viewState - ViewState to read from
 * @param groupId - Group ID to get mode for
 * @returns Mode ('FREE' or 'LOCK')
 */
export function getModeFromViewState(viewState: ViewState, groupId: string): 'FREE' | 'LOCK' {
  return viewState.layout?.[groupId]?.mode || 'FREE';
}

/**
 * Sets mode in ViewState.layout (immutably)
 * @param viewState - ViewState to update
 * @param groupId - Group ID to set mode for
 * @param mode - Mode to set
 * @returns New ViewState with mode set
 */
export function setModeInViewState(
  viewState: ViewState, 
  groupId: string, 
  mode: 'FREE' | 'LOCK'
): ViewState {
  return {
    ...viewState,
    layout: {
      ...viewState.layout,
      [groupId]: { mode }
    }
  };
}

/**
 * One-time migration: Domain Graph → ViewState.layout
 * @param graph - Domain Graph to extract modes from
 * @param viewState - ViewState to migrate modes to
 * @returns ViewState with migrated modes
 */
export function migrateModeDomainToViewState(
  graph: ElkGraphNode, 
  viewState: ViewState
): ViewState {
  const domainModes = extractModeFromDomain(graph);
  
  // Get all group IDs from graph
  const allGroupIds = new Set<string>();
  const collectGroupIds = (node: ElkGraphNode) => {
    if (node.children && node.children.length > 0) {
      allGroupIds.add(node.id);
    }
    if (node.children) {
      node.children.forEach(collectGroupIds);
    }
  };
  collectGroupIds(graph);
  
  // Start with existing ViewState.layout or empty
  const layoutSection: Record<string, { mode: 'FREE' | 'LOCK' }> = { ...viewState.layout };
  
  // Migrate modes from Domain (if any)
  for (const [groupId, mode] of Object.entries(domainModes)) {
    if (!layoutSection[groupId]) {
      layoutSection[groupId] = { mode };
    }
  }
  
  // Ensure all groups have a mode (default to FREE if missing)
  for (const groupId of allGroupIds) {
    if (!layoutSection[groupId]) {
      layoutSection[groupId] = { mode: 'FREE' };
    }
  }
  
  return {
    ...viewState,
    layout: layoutSection
  };
}

/**
 * Sync ViewState.layout with current graph structure
 * Ensures all groups in graph have modes in ViewState.layout
 */
export function syncViewStateLayoutWithGraph(
  graph: ElkGraphNode,
  viewState: ViewState
): ViewState {
  const allGroupIds = new Set<string>();
  const collectGroupIds = (node: ElkGraphNode) => {
    if (node.children && node.children.length > 0) {
      allGroupIds.add(node.id);
    }
    if (node.children) {
      node.children.forEach(collectGroupIds);
    }
  };
  collectGroupIds(graph);
  
  const layoutSection: Record<string, { mode: 'FREE' | 'LOCK' }> = { ...viewState.layout };
  
  // Ensure all groups have a mode (default to FREE if missing)
  for (const groupId of allGroupIds) {
    if (!layoutSection[groupId]) {
      layoutSection[groupId] = { mode: 'FREE' };
    }
  }
  
  return {
    ...viewState,
    layout: layoutSection
  };
}

/**
 * Build ModeMap from ViewState (for Policy.ts compatibility)
 * @param viewState - ViewState to read from
 * @returns ModeMap for use with Policy functions
 */
export function buildModeMapFromViewState(viewState: ViewState): Record<string, 'FREE' | 'LOCK'> {
  const modeMap: Record<string, 'FREE' | 'LOCK'> = {};
  
  if (viewState.layout) {
    for (const [groupId, { mode }] of Object.entries(viewState.layout)) {
      modeMap[groupId] = mode;
    }
  }
  
  return modeMap;
}

/**
 * Build ModeMap with dual-read (ViewState first, Domain fallback)
 * Used during migration Phase 1 for backward compatibility
 */
export function buildModeMapDualRead(
  viewState: ViewState, 
  graph: ElkGraphNode
): Record<string, 'FREE' | 'LOCK'> {
  // Try ViewState first
  const viewStateModes = buildModeMapFromViewState(viewState);
  
  // If ViewState has modes, use those
  if (Object.keys(viewStateModes).length > 0) {
    return viewStateModes;
  }
  
  // Fallback to Domain Graph
  return extractModeFromDomain(graph);
}
