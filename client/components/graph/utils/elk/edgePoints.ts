import { ElkGraphNode } from "../../../types/graph";

type HandleMap = Record<string, { x: number; y: number }>;
type Point = { x: number; y: number };

const warn = (msg: string, obj?: any) =>
  console.warn(`[edgePoints] ${msg}`, obj ?? "");

function visitContainerEdges(container: ElkGraphNode, map: HandleMap, points: Point[]): void {
  if (!container.edges) return;
  
  for (const e of container.edges) {
    if (!map[e.sources[0]]) warn("source handle map missing", e);
    if (!map[e.targets[0]]) warn("target handle map missing", e);
    add(points, map[e.sources[0]], map[e.targets[0]]);
  }
} 