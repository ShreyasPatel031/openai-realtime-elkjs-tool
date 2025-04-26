// Re-export all functionality from the new module structure
// This file is maintained for backward compatibility

import { 
  findNodeById,
  ensureIds,
  computeAbsolutePositions,
  buildNodeEdgePoints,
  processLayoutedGraph,
  structuralHash
} from './utils/elk';

export {
  findNodeById,
  ensureIds,
  processLayoutedGraph,
  structuralHash
}; 