/**
 * Mode Migration: Domain → ViewState
 * 
 * One-time migration utility to move group modes from Domain Graph to ViewState.layout
 * This ensures backward compatibility with existing snapshots while moving to the new architecture.
 * 
 * Per docs/FIGJAM_REFACTOR.md §2.2: Mode should live in ViewState.layout, not Domain.
 */

import type { ViewState } from './ViewState';
import type { RawGraph } from '../../components/graph/types/index';

export interface MigrationResult {
  migratedGraph: RawGraph;
  migratedViewState: ViewState;
  changed: boolean;
  migratedGroups: string[];
}

/**
 * Migrates mode data from Domain Graph to ViewState.layout
 * 
 * Steps:
 * 1. Extract all modes from Domain Graph (groups with .mode property)
 * 2. Write to ViewState.layout[groupId].mode
 * 3. Remove .mode from Domain Graph (deep clone to avoid mutation)
 * 4. Ensure all groups have a mode (default to FREE if missing)
 * 
 * @param rawGraph - Domain Graph (may contain .mode on groups)
 * @param viewState - ViewState (may or may not have .layout)
 * @returns Migration result with cleaned graph and updated ViewState
 */
export function migrateModeToViewState(
  rawGraph: RawGraph,
  viewState: ViewState
): MigrationResult {
  // Deep clone to avoid mutating input
  const migratedGraph = JSON.parse(JSON.stringify(rawGraph));
  const migratedViewState = JSON.parse(JSON.stringify(viewState));
  
  // Collect all group IDs and their modes from Domain
  const domainModes: Record<string, 'FREE' | 'LOCK'> = {};
  const allGroupIds = new Set<string>();
  
  const traverse = (node: any) => {
    // Groups are nodes with children
    if (node.children && node.children.length > 0) {
      allGroupIds.add(node.id);
      
      // Extract mode from Domain if present
      if (node.mode === 'FREE' || node.mode === 'LOCK') {
        domainModes[node.id] = node.mode;
      }
    }
    
    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  };
  
  traverse(migratedGraph);
  
  // Initialize ViewState.layout if missing
  if (!migratedViewState.layout) {
    migratedViewState.layout = {};
  }
  
  // Migrate modes from Domain to ViewState.layout
  const migratedGroups: string[] = [];
  let changed = false;
  
  for (const [groupId, mode] of Object.entries(domainModes)) {
    // Only migrate if ViewState doesn't already have this mode
    if (!migratedViewState.layout[groupId]) {
      migratedViewState.layout[groupId] = { mode };
      migratedGroups.push(groupId);
      changed = true;
    }
  }
  
  // Ensure all groups have a mode (default to FREE)
  for (const groupId of allGroupIds) {
    if (!migratedViewState.layout[groupId]) {
      migratedViewState.layout[groupId] = { mode: 'FREE' };
      changed = true;
    }
  }
  
  // Remove .mode from Domain Graph (clean up)
  const removeModeFromGraph = (node: any) => {
    if ('mode' in node) {
      delete node.mode;
      changed = true;
    }
    if (node.children) {
      for (const child of node.children) {
        removeModeFromGraph(child);
      }
    }
  };
  
  removeModeFromGraph(migratedGraph);
  
  return {
    migratedGraph,
    migratedViewState,
    changed,
    migratedGroups
  };
}

/**
 * Checks if migration is needed (Domain has modes that aren't in ViewState)
 */
export function needsMigration(rawGraph: RawGraph, viewState: ViewState): boolean {
  // Check if Domain has any .mode properties
  let hasDomainModes = false;
  
  const checkForModes = (node: any) => {
    if (node.mode === 'FREE' || node.mode === 'LOCK') {
      hasDomainModes = true;
      return; // Early exit
    }
    if (node.children) {
      for (const child of node.children) {
        checkForModes(child);
      }
    }
  };
  
  checkForModes(rawGraph);
  
  if (!hasDomainModes) {
    return false; // No modes in Domain, no migration needed
  }
  
  // Check if ViewState.layout has all the modes
  const domainModes: Record<string, 'FREE' | 'LOCK'> = {};
  const collectDomainModes = (node: any) => {
    if (node.children && node.children.length > 0) {
      if (node.mode === 'FREE' || node.mode === 'LOCK') {
        domainModes[node.id] = node.mode;
      }
    }
    if (node.children) {
      for (const child of node.children) {
        collectDomainModes(child);
      }
    }
  };
  
  collectDomainModes(rawGraph);
  
  // Check if ViewState.layout has all these modes
  for (const groupId of Object.keys(domainModes)) {
    if (!viewState.layout?.[groupId]) {
      return true; // Missing in ViewState, needs migration
    }
  }
  
  return false;
}





