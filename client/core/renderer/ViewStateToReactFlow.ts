/**
 * Universal ViewState → ReactFlow converter
 * Used by ALL scenarios: FREE mode, AI mode, LOCK mode
 * 
 * Write once, use everywhere - no duplication
 */

import type { Node, Edge } from 'reactflow';
import type { RawGraph } from '../../components/graph/types/index';
import type { ViewState } from '../viewstate/ViewState';

export interface ReactFlowOutput {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Convert Domain + ViewState → ReactFlow nodes/edges
 * Universal function used by all modes (FREE, AI, LOCK)
 * 
 * @param domainGraph - Domain structure (node IDs, hierarchy, data)
 * @param viewState - ViewState geometry (positions, sizes)
 * @returns ReactFlow nodes and edges
 */
export function convertViewStateToReactFlow(
  domainGraph: RawGraph,
  viewState: ViewState
): ReactFlowOutput {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  console.log('[🎯COORD] ViewState → ReactFlow (Universal)', {
    domainChildren: domainGraph.children?.length || 0,
    viewStateNodeKeys: Object.keys(viewState.node || {}),
    viewStateGroupKeys: Object.keys(viewState.group || {})
  });

  // Process all domain nodes
  const processNode = (domainNode: any) => {
    const nodeId = domainNode.id;
    
    // Standard group detection (same across all renderers)
    const isGroup = 
      domainNode.data?.isGroup === true || 
      Array.isArray(domainNode.children) ||
      Array.isArray(domainNode.edges);

    // Read geometry from ViewState (same across all renderers)
    const geometry = isGroup
      ? viewState.group?.[nodeId]
      : viewState.node?.[nodeId];

    if (!geometry) {
      console.warn(`[🎯COORD] Missing ViewState geometry for ${isGroup ? 'group' : 'node'} "${nodeId}"`);
      return; // Skip nodes without ViewState - no fallbacks
    }

    console.log(`[🎯COORD] Converting ${nodeId}:`, {
      isGroup,
      position: `${geometry.x},${geometry.y}`,
      size: `${geometry.w}×${geometry.h}`
    });

    // Create ReactFlow node
    const reactFlowNode: Node = {
      id: nodeId,
      type: isGroup ? 'group' : 'custom',
      position: { x: geometry.x, y: geometry.y },
      data: {
        ...domainNode.data,
        width: geometry.w,
        height: geometry.h,
      },
      style: {
        width: geometry.w,
        height: geometry.h,
      },
    };

    nodes.push(reactFlowNode);

    // Process children recursively
    if (domainNode.children?.length > 0) {
      domainNode.children.forEach(processNode);
    }
  };

  // Process root children
  if (domainGraph.children?.length > 0) {
    domainGraph.children.forEach(processNode);
  }

  // Process edges
  if (domainGraph.edges?.length > 0) {
    domainGraph.edges.forEach((edge: any, index: number) => {
      const edgeId = edge.id || `edge-${index}`;
      
      const reactFlowEdge: Edge = {
        id: edgeId,
        source: edge.sources?.[0] || edge.source,
        target: edge.targets?.[0] || edge.target,
        type: 'smoothstep',
      };

      edges.push(reactFlowEdge);
    });
  }

  console.log('[🎯COORD] ViewState → ReactFlow result:', {
    nodes: nodes.length,
    edges: edges.length,
    samplePosition: nodes[0]?.position
  });

  return { nodes, edges };
}
