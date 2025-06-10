import { ElkGraphNode, ElkGraphEdge } from "../../../../types/graph";

interface EdgeResult {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string;
  targetHandle: string;
}

export function processLayoutedGraph(layoutedGraph: ElkGraphNode): EdgeResult[] {
  const edges: EdgeResult[] = [];
  
  // Process edges from the graph
  if (layoutedGraph.edges) {
    for (const edge of layoutedGraph.edges) {
      const edgeId = edge.id;
      const sourceNodeId = edge.sources[0] || '';
      const targetNodeId = edge.targets[0] || '';
      const sourceHandle = edge.sources[0] || '';
      const targetHandle = edge.targets[0] || '';
      
      if (sourceHandle && targetHandle) {
        edges.push({
          edgeId,
          sourceNodeId,
          targetNodeId,
          sourceHandle,
          targetHandle
        });
      } else {
        console.warn("[RF-convert] edge skipped – handle not found", {
          edgeId,
          sourceNodeId,
          targetNodeId,
          sourceHandle,
          targetHandle
        });
      }
    }
  }
  
  return edges;
} 