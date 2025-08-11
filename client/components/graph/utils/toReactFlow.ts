import { Edge, MarkerType } from "reactflow";
import { CustomNode } from "../../../types/graph";
import { computeAbsolutePositions } from "./elk/absPositions";
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
        label: node.labels?.[0]?.text || (node.id === 'root' ? '' : node.id),
        width: node.width || dimensions.width,
        height: node.height || dimensions.height,
        isParent: isGroupNode,
        // Pass through icon if it exists in the node data
        ...(node.data?.icon && { icon: node.data.icon }),
        // Pass through style if it exists in the node data
        ...(node.data?.style && { style: node.data.style }),
        // Pass through groupIcon if it exists in the node data
        ...(node.data?.groupIcon && { groupIcon: node.data.groupIcon }),
        leftHandles: (edgeConnectionPoints[node.id]?.left ?? []).map(connectionPoint => {
          const delta = connectionPoint.y - absPos.y;
          return delta;
        }),
        rightHandles: (edgeConnectionPoints[node.id]?.right ?? []).map(connectionPoint => {
          const delta = connectionPoint.y - absPos.y;
          return delta;
        }),
        topHandles: (edgeConnectionPoints[node.id]?.top ?? []).map(connectionPoint => {
          const delta = connectionPoint.x - absPos.x;
          return delta;
        }),
        bottomHandles: (edgeConnectionPoints[node.id]?.bottom ?? []).map(connectionPoint => {
          const delta = connectionPoint.x - absPos.x;
          return delta;
        }),
        position: { x: absPos.x, y: absPos.y }
      },
      style: isGroupNode ? {
        width: node.width || dimensions.groupWidth,
        height: node.height || dimensions.groupHeight,
        backgroundColor: 'transparent',
        border: 'none',
        display: 'flex',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        padding: '0px',
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

  const createEdge = (edge: any, containerAbs: { x: number; y: number }) => {
    edge.sources?.forEach((sourceNodeId: string) =>
      edge.targets?.forEach((targetNodeId: string) => {
        const edgeId = edge.id || `${sourceNodeId}-${targetNodeId}-${Math.random().toString(36).substr(2, 9)}`;
        if (processedEdgeIds.has(edgeId)) return;
        processedEdgeIds.add(edgeId);

        // Find the connection points for this edge
        let sourceHandleIndex = -1;
        let sourceHandleSide = "right";
        let targetHandleIndex = -1;
        let targetHandleSide = "left";

        // Check all sides for the source node
        for (const side of ["right", "left", "top", "bottom"]) {
          const connectionPoints = edgeConnectionPoints[sourceNodeId]?.[side] ?? [];
          const index = connectionPoints.findIndex(
            connectionPoint => connectionPoint.edgeId === edge.id
          );
          if (index >= 0) {
            sourceHandleIndex = index;
            sourceHandleSide = side;
            break;
          }
        }

        // Check all sides for the target node
        for (const side of ["left", "right", "top", "bottom"]) {
          const connectionPoints = edgeConnectionPoints[targetNodeId]?.[side] ?? [];
          const index = connectionPoints.findIndex(
            connectionPoint => connectionPoint.edgeId === edge.id
          );
          if (index >= 0) {
            targetHandleIndex = index;
            targetHandleSide = side;
            break;
          }
        }

        const isSourceGroupNode = nodeTypeMap.get(sourceNodeId) === 'group';
        const isTargetGroupNode = nodeTypeMap.get(targetNodeId) === 'group';
        
        // Determine if the handle is a source or target based on the edge's direction
        // For source handle, prefer "source" type, for target handle, prefer "target" type
        const sourceHandleType = "source";
        const targetHandleType = "target";
        
        const sourceHandle = sourceHandleIndex >= 0 ? `${sourceHandleSide}-${sourceHandleIndex}-${sourceHandleType}` : undefined;
        const targetHandle = targetHandleIndex >= 0 ? `${targetHandleSide}-${targetHandleIndex}-${targetHandleType}` : undefined;

        if (sourceHandle && targetHandle) {
          /* ─────── turn label position into ABSOLUTE coordinates ─────── */
          const elkLbl      = edge.labels?.[0];
          const labelTxt    = elkLbl?.text ?? "";
          const labelPosAbs = elkLbl
            ? { x: elkLbl.x + containerAbs.x, y: elkLbl.y + containerAbs.y }
            : undefined;
          


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
            /* put it in BOTH places so every consumer is happy */
            label: labelTxt,
            data: {
              labelText: labelTxt,
              bendPoints: edge.absoluteBendPoints ?? [],
              labelPos: labelPosAbs          // ← now absolute
            },
            selected: false,
            hidden: false,
            focusable: true,
          });
        } else {
          // Keep essential edge skip warning for debugging
          console.warn(`⚠️ [EDGE-SKIP] Edge ${edge.id} skipped - handle not found`, {
            edgeId,
            sourceNodeId,
            targetNodeId,
            sourceHandle,
            targetHandle,
            containerAbs: containerAbs
          });
        }
      })
    );
  };

  const processEdges = (node: any) => {
    const abs = absolutePositions[node.id];      // abs pos of this container
    (node.edges || []).forEach((e: any) => createEdge(e, abs));
    (node.children || []).forEach(processEdges);
  };
  
  // Process all edges in the graph
  processEdges(elkGraph);

  // Final edge creation complete

  return { nodes, edges };
} 