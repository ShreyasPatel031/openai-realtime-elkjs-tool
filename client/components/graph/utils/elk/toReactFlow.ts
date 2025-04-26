import { Edge, MarkerType } from "reactflow";
import { CustomNode } from "../../types";
import { computeAbsolutePositions } from "./absPositions";
import { buildNodeEdgePoints } from "./edgePoints";

export function processLayoutedGraph(elkGraph: any) {
  const abs = computeAbsolutePositions(elkGraph);
  const ep = buildNodeEdgePoints(elkGraph, abs);

  const nodes: CustomNode[] = [];
  const edges: Edge[] = [];
  const seen = new Set<string>();

  /* ---------- helper to create RF nodes -------------------------------- */
  const pushNode = (n: any, parentAbs = { x: 0, y: 0 }, parentId?: string) => {
    const pos = abs[n.id];
    const isGroup = (n.children?.length ?? 0) > 0;

    nodes.push({
      id: n.id,
      type: isGroup ? "group" : "custom",
      position: parentId ? { x: n.x || 0, y: n.y || 0 } : { x: pos.x, y: pos.y },
      parentId,
      zIndex: isGroup ? 5 : 50,
      selectable: true,
      selected: false,
      draggable: true,
      data: {
        label: n.labels?.[0]?.text || n.id,
        width: n.width || 80,
        height: n.height || 40,
        isParent: isGroup,
        leftHandles: (ep[n.id]?.left ?? []).map(p => ((p.y - pos.y) / (n.height || 40) * 100) + "%"),
        rightHandles: (ep[n.id]?.right ?? []).map(p => ((p.y - pos.y) / (n.height || 40) * 100) + "%"),
        position: { x: pos.x, y: pos.y }
      },
      style: isGroup ? {
        width: n.width || 200,
        height: n.height || 200,
        backgroundColor: 'rgba(240, 240, 240, 0.8)',
        border: '1px dashed #999',
        display: 'flex',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        padding: '10px',
        pointerEvents: 'all'
      } : {
        pointerEvents: 'all'
      }
    } as CustomNode);

    (n.children || []).forEach((c: any) => pushNode(c, pos, n.id));
  };

  pushNode(elkGraph);

  /* ---------- helper to create RF edges -------------------------------- */
  const pushEdge = (e: any) => {
    e.sources?.forEach((s: string) =>
      e.targets?.forEach((t: string) => {
        const id = e.id || `${s}-${t}-${Math.random().toString(36).substr(2, 9)}`;
        if (seen.has(id)) return;
        seen.add(id);

        const sIdx = (ep[s]?.right ?? []).findIndex(p => p.edgeId === e.id);
        const tIdx = (ep[t]?.left ?? []).findIndex(p => p.edgeId === e.id);

        const isSourceGroupNode = nodes.find(n => n.id === s)?.type === 'group';
        const isTargetGroupNode = nodes.find(n => n.id === t)?.type === 'group';
        
        const sourceHandle = isSourceGroupNode 
          ? (sIdx >= 0 ? `right-${sIdx}` : 'right-0')
          : (sIdx >= 0 ? `right-${sIdx}` : 'right');
          
        const targetHandle = isTargetGroupNode
          ? (tIdx >= 0 ? `left-${tIdx}` : 'left-0') 
          : (tIdx >= 0 ? `left-${tIdx}` : 'left');

        edges.push({
          id, 
          source: s, 
          target: t,
          type: e.sections?.[0]?.bendPoints?.length >= 2 ? "step" : "smoothstep",
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
          data: { bendPoints: e.absoluteBendPoints ?? [] },
          selected: false,
          hidden: false,
          focusable: true,
        });
      })
    );
  };

  const walkEdges = (n: any) => {
    (n.edges || []).forEach(pushEdge);
    (n.children || []).forEach(walkEdges);
  };
  walkEdges(elkGraph);

  return { nodes, edges };
} 