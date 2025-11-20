/**
 * Layout policy decisions
 * Part of Agent B Inter Plan - B4
 * 
 * Agent D will implement:
 * - decideLayout: when to run ELK based on source + mode
 * - findHighestLockedAncestor: walk up tree to find first LOCK ancestor
 * 
 * This is a stub with signatures only; Agent D will fill implementation.
 */

import type { Source, ModeMap } from './types';

export interface DecideLayoutInput {
  source: Source;
  scopeId: string;
  modeMap: ModeMap;
}

/**
 * Decides whether ELK layout should run for a given edit.
 * 
 * Policy:
 * - AI edits: always run ELK
 * - User edits in LOCK scope: run ELK
 * - User edits in FREE scope: no ELK (unless explicit arrange)
 * 
 * @param input - Edit context (source, scope, mode map)
 * @returns true if ELK should run, false otherwise
 * 
 * @example
 * ```ts
 * const shouldRun = decideLayout({
 *   source: 'user',
 *   scopeId: 'group-123',
 *   modeMap: { 'group-123': 'LOCK' }
 * });
 * // returns true (LOCK mode requires ELK)
 * ```
 */
export function decideLayout(input: DecideLayoutInput): boolean {
  // TODO: Agent D will implement:
  // - If source === 'ai': return true (AI always ELK)
  // - If source === 'user':
  //   - Find highest locked ancestor of scopeId
  //   - If found: return true (LOCK mode requires ELK)
  //   - Else: return false (FREE mode, no ELK)

  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[Policy] decideLayout called but not yet implemented. ` +
      `input:`, input
    );
  }

  // Stub: default to false (conservative, no ELK until policy implemented)
  return false;
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
  // TODO: Agent D will implement:
  // - Walk up from id to root using parentOf
  // - For each ancestor, check modeMap
  // - Return first ancestor with mode === 'LOCK'
  // - Return null if reach root without finding LOCK

  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[Policy] findHighestLockedAncestor called but not yet implemented. ` +
      `id: ${id}, modeMap keys:`, Object.keys(modeMap)
    );
  }

  // Stub: return null (no locked ancestor found)
  return null;
}





