/**
 * Edge mode detection utility
 * Determines whether an edge should use ELK or libavoid routing based on:
 * - Source: AI always uses ELK
 * - Mode: LOCK uses ELK, FREE uses libavoid
 * - LCG: Finds the lowest common group containing both endpoints
 */

import type { RawGraph } from '../components/graph/types';
import type { ViewState } from '../core/viewstate/ViewState';
import type { Edge } from 'reactflow';
import { findLCG } from '../components/graph/mutations';
import { getModeFromViewState } from '../core/viewstate/modeHelpers';

export type EdgeRoutingMode = 'ELK' | 'libavoid';

export interface EdgeModeDetectionParams {
  edge: Edge;
  rawGraph: RawGraph;
  viewState: ViewState;
  source?: 'ai' | 'user';
}

/**
 * Determines the routing mode for an edge
 * 
 * Rules:
 * - AI always uses ELK
 * - LOCK mode uses ELK
 * - FREE mode uses libavoid
 * - Default to libavoid if mode cannot be determined
 * 
 * @param params - Edge mode detection parameters
 * @returns 'ELK' or 'libavoid'
 */
export function getEdgeMode(params: EdgeModeDetectionParams): EdgeRoutingMode {
  const { edge, rawGraph, viewState, source = 'user' } = params;
  
  // AI always uses ELK
  if (source === 'ai') {
    return 'ELK';
  }
  
  // Find LCG of edge endpoints
  const lcg = findLCG(rawGraph, [edge.source, edge.target]);
  if (!lcg) {
    // No LCG found, default to libavoid for FREE mode
    return 'libavoid';
  }
  
  // Get mode from ViewState.layout
  const mode = getModeFromViewState(viewState, lcg.id);
  
  // LOCK uses ELK, FREE uses libavoid
  return mode === 'LOCK' ? 'ELK' : 'libavoid';
}



