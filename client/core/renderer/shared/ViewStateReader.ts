/**
 * Shared ViewState reading logic
 * Used by all renderers: Canvas, SVG, ReactFlow
 */

import type { RawGraph } from '../../../components/graph/types/index';
import type { ViewState } from '../../viewstate/ViewState';

export interface NodeGeometry {
  id: string;
  isGroup: boolean;
  geometry: { x: number; y: number; w: number; h: number } | null;
  domainData: any;
}

/**
 * Read ViewState for all nodes in domain graph
 * Shared logic used by all renderers
 */
export function readViewStateGeometry(
  domainGraph: RawGraph,
  viewState: ViewState
): NodeGeometry[] {
  const results: NodeGeometry[] = [];

  const processNode = (domainNode: any) => {
    const nodeId = domainNode.id;
    
    // SAME GROUP DETECTION logic (used by all renderers)
    const isGroup = 
      domainNode.data?.isGroup === true || 
      Array.isArray(domainNode.children) ||
      Array.isArray(domainNode.edges);

    // SAME VIEWSTATE READING logic (used by all renderers)  
    const geometry = isGroup
      ? viewState.group?.[nodeId]
      : viewState.node?.[nodeId];

    results.push({
      id: nodeId,
      isGroup,
      geometry,
      domainData: domainNode.data || {}
    });

    // Recursive processing
    if (domainNode.children) {
      domainNode.children.forEach(processNode);
    }
  };

  // Process all domain children
  if (domainGraph.children) {
    domainGraph.children.forEach(processNode);
  }

  return results;
}
