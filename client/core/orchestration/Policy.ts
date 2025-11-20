/**
 * Layout policy decisions
 * Part of Agent D - Policy Gate Implementation
 * 
 * Pure decision logic that determines:
 * - When ELK should run (decideLayout)
 * - Which ancestors need locking (getAncestorChainToLock)
 * - Top-most locked ancestor for ELK scope (findTopMostLockedAncestor)
 * - Whether AI should auto-lock FREE scopes (shouldAutoLockForAI)
 * 
 * All functions are pure - they return decisions/IDs, never modify state.
 * The Orchestrator uses these decisions to perform actual mutations.
 */

import type { Source, ModeMap } from './types';
import type { ElkGraphNode } from '../../types/graph';

export interface DecideLayoutInput {
  source: Source;
  scopeId: string;
  modeMap: ModeMap;
  parentOf: (id: string) => string | null;
}

/**
 * Decides whether ELK layout should run for a given edit.
 * 
 * Policy:
 * - AI edits: always run ELK
 * - User edits in LOCK scope: run ELK
 * - User edits in FREE scope: no ELK (unless explicit arrange)
 * 
 * @param input - Edit context (source, scope, mode map, parentOf function)
 * @returns true if ELK should run, false otherwise
 * 
 * @example
 * ```ts
 * const shouldRun = decideLayout({
 *   source: 'user',
 *   scopeId: 'group-123',
 *   modeMap: { 'group-123': 'LOCK' },
 *   parentOf: (id) => id === 'group-123' ? 'root' : null
 * });
 * // returns true (LOCK mode requires ELK)
 * ```
 */
export function decideLayout(input: DecideLayoutInput): boolean {
  const { source, scopeId, modeMap, parentOf } = input;

  // AI edits always trigger ELK
  if (source === 'ai') {
    return true;
  }

  // User edits: check if scope or any ancestor is LOCK
  const highestLocked = findHighestLockedAncestor(scopeId, modeMap, parentOf);
  return highestLocked !== null;
}

/**
 * Finds the highest (closest to root) locked ancestor of a given node/group.
 * 
 * Walks up the parent chain from the given ID until it finds a LOCK ancestor,
 * or returns null if none found.
 * 
 * @param id - Node or group ID to start from
 * @param modeMap - Map of group IDs to their modes
 * @param parentOf - Function to get parent ID of a given ID (returns null if root/no parent)
 * @returns Highest locked ancestor ID, or null if none
 * 
 * @example
 * ```ts
 * const ancestor = findHighestLockedAncestor(
 *   'node-456',
 *   { 'group-123': 'LOCK', 'group-789': 'FREE' },
 *   (id) => id === 'node-456' ? 'group-123' : null
 * );
 * // returns 'group-123'
 * ```
 */
export function findHighestLockedAncestor(
  id: string,
  modeMap: ModeMap,
  parentOf: (id: string) => string | null
): string | null {
  let current: string | null = id;

  // Walk up the parent chain
  while (current !== null) {
    // Check if current node/group is locked
    if (modeMap[current] === 'LOCK') {
      return current;
    }

    // Move to parent
    current = parentOf(current);
  }

  // Reached root without finding LOCK
  return null;
}

/**
 * Gets the chain of ancestor IDs that need to be locked before running ELK.
 * 
 * Returns all ancestors from scopeId up to (but not including) root.
 * This is used by the Orchestrator to lock the ancestor chain before ELK runs.
 * 
 * @param scopeId - Starting scope ID
 * @param parentOf - Function to get parent ID (returns null if root/no parent)
 * @returns Array of ancestor IDs in order from scopeId to root (exclusive)
 * 
 * @example
 * ```ts
 * const chain = getAncestorChainToLock('group-3', (id) => {
 *   if (id === 'group-3') return 'group-2';
 *   if (id === 'group-2') return 'group-1';
 *   if (id === 'group-1') return 'root';
 *   return null;
 * });
 * // returns ['group-3', 'group-2', 'group-1']
 * ```
 */
export function getAncestorChainToLock(
  scopeId: string,
  parentOf: (id: string) => string | null
): string[] {
  const chain: string[] = [];
  let current: string | null = scopeId;

  // Walk up to root, collecting all ancestors
  while (current !== null) {
    chain.push(current);
    const parent = parentOf(current);
    
    // Stop before root (root cannot be locked)
    if (parent === null || parent === 'root') {
      break;
    }
    
    current = parent;
  }

  return chain;
}

/**
 * Finds the top-most (closest to root) locked ancestor after locking the chain.
 * 
 * This is the scope that should be passed to ScopedLayoutRunner.
 * After locking the ancestor chain, this finds the highest locked group
 * (which will be the top-most ancestor in the chain, or an existing locked ancestor).
 * 
 * @param scopeId - Starting scope ID
 * @param modeMap - Map of group IDs to their modes (may include already-locked ancestors)
 * @param parentOf - Function to get parent ID (returns null if root/no parent)
 * @returns Top-most locked ancestor ID, or null if none (should not happen after chain locking)
 * 
 * @example
 * ```ts
 * // After locking chain ['group-3', 'group-2', 'group-1']
 * const topMost = findTopMostLockedAncestor(
 *   'group-3', 
 *   lockedModeMap, 
 *   parentOfFunction
 * );
 * // returns 'group-1' (top-most in chain)
 * ```
 */
export function findTopMostLockedAncestor(
  scopeId: string,
  modeMap: ModeMap,
  parentOf: (id: string) => string | null
): string | null {
  // Get the ancestor chain
  const chain = getAncestorChainToLock(scopeId, parentOf);
  
  // Find the top-most (last in chain, closest to root) that is locked
  // Walk from root down to find first locked
  for (let i = chain.length - 1; i >= 0; i--) {
    if (modeMap[chain[i]] === 'LOCK') {
      return chain[i];
    }
  }

  // Should not happen if chain was properly locked, but return null as fallback
  return null;
}

/**
 * Determines if a FREE scope should be auto-locked when AI targets it.
 * 
 * Policy: AI always runs ELK, so if AI targets a FREE scope, it should be
 * locked first to preserve ELK-first behavior.
 * 
 * @param scopeId - Target scope ID
 * @param modeMap - Map of group IDs to their modes
 * @returns true if scope should be auto-locked (it's FREE and AI is targeting it)
 * 
 * @example
 * ```ts
 * const shouldLock = shouldAutoLockForAI('group-123', { 'group-123': 'FREE' });
 * // returns true (FREE scope should be locked for AI)
 * ```
 */
export function shouldAutoLockForAI(
  scopeId: string,
  modeMap: ModeMap
): boolean {
  // If scope is not in modeMap, default to FREE, so should lock
  const currentMode = modeMap[scopeId];
  return currentMode === undefined || currentMode === 'FREE';
}

/**
 * Builds a ModeMap from ViewState only.
 * 
 * @param viewState - ViewState to read modes from
 * @returns ModeMap with all group IDs and their modes (defaults to 'FREE' if not set)
 * 
 * @example
 * ```ts
 * const modeMap = buildModeMap(viewState);
 * // returns { 'group-1': 'LOCK', 'group-2': 'FREE', ... }
 * ```
 */
export function buildModeMap(viewState: any): ModeMap {
  // Phase 4: Read from ViewState.layout only
  const modeMap: ModeMap = {};
  
  if (viewState?.layout) {
    for (const [groupId, { mode }] of Object.entries(viewState.layout)) {
      modeMap[groupId] = mode as 'FREE' | 'LOCK';
    }
  }
  
  return modeMap;
}

/**
 * Builds a parentOf function from a graph.
 * 
 * @param graph - Root graph node
 * @returns Function that returns parent ID for a given ID, or null if root/no parent
 * 
 * @example
 * ```ts
 * const parentOf = buildParentOf(rootGraph);
 * const parent = parentOf('node-123');
 * // returns 'group-456' or null
 * ```
 */
export function buildParentOf(graph: ElkGraphNode): (id: string) => string | null {
  // Build a parent map for efficient lookup
  const parentMap = new Map<string, string>();
  
  const traverse = (node: ElkGraphNode, parentId: string | null = null) => {
    if (parentId !== null) {
      parentMap.set(node.id, parentId);
    }
    
    if (node.children) {
      for (const child of node.children) {
        traverse(child, node.id);
      }
    }
  };
  
  traverse(graph);
  
  // Return lookup function
  return (id: string): string | null => {
    // Root has no parent
    if (id === graph.id || id === 'root') {
      return null;
    }
    return parentMap.get(id) || null;
  };
}

