// src/graph/types/index.ts
import { ElkGraph as _ElkGraph } from "../../../types/graph";

export interface RawGraph extends _ElkGraph {
  viewState?: {
    node?: Record<string, { x: number; y: number; w: number; h: number }>;
    group?: Record<string, { x: number; y: number; w: number; h: number }>;
    edge?: Record<string, { waypoints?: Array<{ x: number; y: number }> }>;
  };
}
export interface LayoutGraph extends _ElkGraph {} 