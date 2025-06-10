import { ElkGraphNode } from "../../../../types/graph";

type HandleMap = Record<string, { x: number; y: number }>;
type Point = { x: number; y: number };

const warn = (msg: string, obj?: any) =>
  console.warn(`[edgePoints] ${msg}`, obj ?? "");

function add(points: Point[], source: Point, target: Point): void {
  if (source) points.push(source);
  if (target) points.push(target);
}

function visitContainerEdges(container: ElkGraphNode, map: HandleMap, points: Point[]): void {
  if (!container.edges) return;
  
  for (const e of container.edges) {
    if (!map[e.sources[0]]) warn("source handle map missing", e);
    if (!map[e.targets[0]]) warn("target handle map missing", e);
    add(points, map[e.sources[0]], map[e.targets[0]]);
  }
}

export { visitContainerEdges, type HandleMap, type Point }; 