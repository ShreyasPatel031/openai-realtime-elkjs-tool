/**
 * Orchestration types for edit intents and policy decisions
 * Part of Agent B Inter Plan - B4, B5
 */

/**
 * Source of an edit (ephemeral, not persisted)
 */
export type Source = 'ai' | 'user';

/**
 * Kind of edit operation
 */
export type EditKind = 
  | 'geo-only'           // FREE: drag/resize within same parent (no structure change)
  | 'free-structural'    // FREE: reparent/group/edge ops (structure changes, no ELK)
  | 'ai-lock-structural'; // AI or LOCK: structural changes that require ELK

/**
 * Edit intent passed to orchestrator
 */
export interface EditIntent {
  source: Source;
  kind: EditKind;
  scopeId: string;
  /**
   * Optional payload for specific operations
   */
  payload?: {
    nodeId?: string;
    oldParentId?: string;
    newParentId?: string;
    [key: string]: unknown;
  };
}

/**
 * Mode map: group ID -> 'FREE' | 'LOCK'
 */
export type ModeMap = Record<string, 'FREE' | 'LOCK'>;





