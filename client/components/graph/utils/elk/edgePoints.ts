// utils/elk/edgePoints.ts
import { AbsMap } from "./absPositions";

export interface NodeEdgePoints { left: any[]; right: any[] }
export type EdgePointMap = Record<string, NodeEdgePoints>;

/** Gathers connection + bend points using absolute positions. */
export function buildNodeEdgePoints(graph: any, abs: AbsMap): EdgePointMap {
  const map: EdgePointMap = {};

  const add = (nodeId: string, side: "left" | "right", entry: any) => {
    (map[nodeId] ||= { left: [], right: [] })[side].push(entry);
  };

  const visitContainerEdges = (container: any) => {
    (container.edges || []).forEach((e: any) => {
      const sec = e.sections?.[0];
      if (!sec) return;

      const offset = abs[container.id] ?? { x: 0, y: 0 };

      if (e.sources?.[0] && sec.startPoint)
        add(e.sources[0], "right", {
          edgeId: e.id,
          x: offset.x + sec.startPoint.x,
          y: offset.y + sec.startPoint.y,
          originalX: sec.startPoint.x,
          originalY: sec.startPoint.y
        });

      if (e.targets?.[0] && sec.endPoint)
        add(e.targets[0], "left", {
          edgeId: e.id,
          x: offset.x + sec.endPoint.x,
          y: offset.y + sec.endPoint.y,
          originalX: sec.endPoint.x,
          originalY: sec.endPoint.y
        });

      // bendPoints → store absolute coords next to the edge object for later
      if (sec.bendPoints?.length) {
        e.absoluteBendPoints = sec.bendPoints.map((p: any, index: number) => {
          const absBendX = offset.x + p.x;
          const absBendY = offset.y + p.y;
          
          // For first and last bendpoints in edges with multiple bendpoints
          if (sec.bendPoints.length >= 2) {
            if (index === 0 && e.sources && e.sources.length > 0) {
              const sourcePoint = map[e.sources[0]]?.right[0];
              if (sourcePoint) {
                return {
                  index,
                  x: absBendX,
                  y: sourcePoint.y, // Align with source node's connection point
                  originalX: p.x,
                  originalY: p.y
                };
              }
            }
            
            if (index === sec.bendPoints.length - 1 && e.targets && e.targets.length > 0) {
              const targetPoint = map[e.targets[0]]?.left[0];
              if (targetPoint) {
                return {
                  index,
                  x: absBendX,
                  y: targetPoint.y, // Align with target node's connection point
                  originalX: p.x,
                  originalY: p.y
                };
              }
            }
          }
          
          return {
            index,
            x: absBendX,
            y: absBendY,
            originalX: p.x,
            originalY: p.y
          };
        });
      }
    });

    (container.children || []).forEach(visitContainerEdges);
  };

  visitContainerEdges(graph);
  return map;
} 