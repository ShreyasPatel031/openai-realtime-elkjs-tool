/**
 * Domain layer - re-exports for clean imports
 * Part of Agent B Inter Plan
 * 
 * This is an optional convenience module that re-exports existing
 * domain mutations and types. No code changes needed here.
 */

// Re-export mutations
export {
  addNode,
  deleteNode,
  moveNode,
  addEdge,
  deleteEdge,
  groupNodes,
  removeGroup,
  batchUpdate,
  edgeIdExists,
} from '../components/graph/mutations';

// Re-export types
export type { RawGraph } from '../components/graph/types';





