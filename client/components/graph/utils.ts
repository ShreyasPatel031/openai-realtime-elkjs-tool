// Re-export all functionality from the new module structure
// This file is maintained for backward compatibility

import { 
  findNodeById,
  ensureIds,
  computeAbsolutePositions,
  buildNodeEdgePoints,
  processLayoutedGraph
} from './utils/elk';

export {
  findNodeById,
  ensureIds,
  processLayoutedGraph
}; 