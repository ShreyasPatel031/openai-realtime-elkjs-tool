import { Edge, MarkerType } from "reactflow";
import { CustomNode } from "../../types";
import { computeAbsolutePositions } from "./absPositions";
import { buildNodeEdgePoints } from "./edgePoints";

interface NodeDimensions {
  width: number;
  height: number;
  groupWidth: number;
  groupHeight: number;
  padding: number;
}

export function processLayoutedGraph(elkGraph: any, dimensions: NodeDimensions) {
  // Calculate absolute positions for all nodes in the graph
  const absolutePositions = computeAbsolutePositions(elkGraph);
  
  // Build a map of edge connection points for each node
  const edgeConnectionPoints = buildNodeEdgePoints(elkGraph, absolutePositions);

  const nodes: CustomNode[] = [];
  const edges: Edge[] = [];
  const processedEdgeIds = new Set<string>();

  /* ---------- helper to create RF nodes -------------------------------- */
  const createNode = (node: any, parentAbsolutePosition = { x: 0, y: 0 }, parentId?: string) => {
    const absPos = absolutePositions[node.id]; 
    const isGroupNode = (node.children?.length ?? 0) > 0;

    nodes.push({
      id: node.id,
      type: isGroupNode ? "group" : "custom",
      position: parentId ? { x: node.x ?? 0, y: node.y ?? 0 } : { x: absPos.x, y: absPos.y },
      parentId,
      zIndex: isGroupNode ? 5 : 50,
      selectable: true,
      selected: false,
      draggable: true,
      data: {
        label: node.labels?.[0]?.text || node.id,
        width: node.width || dimensions.width,
        height: node.height || dimensions.height,
        isParent: isGroupNode,
        leftHandles: (edgeConnectionPoints[node.id]?.left ?? []).map(connectionPoint => {
          const delta = connectionPoint.y - absPos.y;
          // const TOP_PAD = isGroupNode ? dimensions.padding : 0;
          // return delta - TOP_PAD;
          return delta;
        }),
        rightHandles: (edgeConnectionPoints[node.id]?.right ?? []).map(connectionPoint => {
          const delta = connectionPoint.y - absPos.y;
          // const TOP_PAD = isGroupNode ? dimensions.padding : 0;
          // return delta - TOP_PAD;
          return delta;
        }),
        position: { x: absPos.x, y: absPos.y }
      },
      style: isGroupNode ? {
        width: node.width || dimensions.groupWidth,
        height: node.height || dimensions.groupHeight,
        backgroundColor: 'rgba(240, 240, 240, 0.8)',
        border: '1px dashed #999',
        display: 'flex',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        padding: `${dimensions.padding}px`,
        pointerEvents: 'all'
      } : {
        pointerEvents: 'all'
      }
    } as CustomNode);

    // Process child nodes recursively
    (node.children || []).forEach((childNode: any) => createNode(childNode, absPos, node.id));
  };

  // Start node creation from the root
  createNode(elkGraph);

  /* ---------- helper to create RF edges -------------------------------- */
  // Create a map of node types for quick lookups
  const nodeTypeMap = new Map(nodes.map(node => [node.id, node.type]));

  const createEdge = (edge: any) => {
    edge.sources?.forEach((sourceNodeId: string) =>
      edge.targets?.forEach((targetNodeId: string) => {
        const edgeId = edge.id || `${sourceNodeId}-${targetNodeId}-${Math.random().toString(36).substr(2, 9)}`;
        if (processedEdgeIds.has(edgeId)) return;
        processedEdgeIds.add(edgeId);

        // Find the handle indices for source and target nodes
        const sourceHandleIndex = (edgeConnectionPoints[sourceNodeId]?.right ?? []).findIndex(
          connectionPoint => connectionPoint.edgeId === edge.id
        );
        
        const targetHandleIndex = (edgeConnectionPoints[targetNodeId]?.left ?? []).findIndex(
          connectionPoint => connectionPoint.edgeId === edge.id
        );

        const isSourceGroupNode = nodeTypeMap.get(sourceNodeId) === 'group';
        const isTargetGroupNode = nodeTypeMap.get(targetNodeId) === 'group';
        
        const sourceHandle = sourceHandleIndex >= 0 ? `right-${sourceHandleIndex}` : undefined;
        const targetHandle = targetHandleIndex >= 0 ? `left-${targetHandleIndex}` : undefined;

        if (sourceHandle && targetHandle) {
          edges.push({
            id: edgeId, 
            source: sourceNodeId, 
            target: targetNodeId,
            type: edge.sections?.[0]?.bendPoints?.length >= 2 ? "step" : "smoothstep",
            zIndex: 1000,
            sourceHandle: sourceHandle,
            targetHandle: targetHandle,
            style: { 
              strokeWidth: 2,
              stroke: '#000',
              opacity: 1,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: '#555'
            },
            data: { bendPoints: edge.absoluteBendPoints ?? [] },
            selected: false,
            hidden: false,
            focusable: true,
          });
        }
      })
    );
  };

  const processEdges = (node: any) => {
    (node.edges || []).forEach(createEdge);
    (node.children || []).forEach(processEdges);
  };
  
  // Process all edges in the graph
  processEdges(elkGraph);

  return { nodes, edges };
} 