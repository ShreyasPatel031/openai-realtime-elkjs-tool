import { Node } from 'reactflow';

export const LOCAL_CANVAS_SNAPSHOT_KEY = "atelier_canvas_last_snapshot_v1";

let lastSnapshotDigest: string | null = null;

export interface ViewStateGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewState {
  node: Record<string, ViewStateGeometry>;
  group: Record<string, ViewStateGeometry>;
  edge: Record<string, any>;
}

export interface CanvasSnapshot {
  rawGraph: any;
  viewState: ViewState;
  selectedArchitectureId: string;
  timestamp: number;
}

/**
 * Creates a snapshot of the current view state based on ReactFlow nodes
 */
export function createViewStateSnapshot(
  nodes: Node[],
  viewStateRef: React.MutableRefObject<ViewState | undefined>,
  isHydratingRef: React.MutableRefObject<boolean>
): ViewState {
  if (isHydratingRef.current && viewStateRef?.current) {
    try {
      return JSON.parse(JSON.stringify(viewStateRef.current));
    } catch (error) {
      return viewStateRef.current;
    }
  }

  const base = viewStateRef?.current
    ? (() => {
        try {
          return JSON.parse(JSON.stringify(viewStateRef.current));
        } catch (error) {
          return viewStateRef.current;
        }
      })()
    : { node: {}, group: {}, edge: {} };

  const snapshot = base || { node: {}, group: {}, edge: {} };

  // Helper to calculate absolute position from node and all nodes
  const getAbsolutePosition = (node: Node, allNodes: Node[]): { x: number; y: number } => {
    let x = node.position?.x ?? 0;
    let y = node.position?.y ?? 0;
    
    // If node has a parent, add parent's absolute position
    if ((node as any).parentId) {
      const parent = allNodes.find(n => n.id === (node as any).parentId);
      if (parent) {
        const parentAbs = getAbsolutePosition(parent, allNodes);
        x += parentAbs.x;
        y += parentAbs.y;
      }
    }
    
    return { x, y };
  };


  nodes.forEach((node) => {
    const existingNodeView = viewStateRef?.current?.node?.[node.id];
    const existingGroupView = viewStateRef?.current?.group?.[node.id];

    const rawWidth =
      (typeof node.data?.width === 'number' && node.data.width) ||
      (typeof node.style?.width === 'number' && node.style.width) ||
      (typeof node.style?.width === 'string' ? parseFloat(node.style.width) : undefined);
    const rawHeight =
      (typeof node.data?.height === 'number' && node.data.height) ||
      (typeof node.style?.height === 'number' && node.style.height) ||
      (typeof node.style?.height === 'string' ? parseFloat(node.style.height) : undefined);

    // CRITICAL: Calculate absolute position (not relative)
    // ReactFlow nodes inside groups have relative positions, but ViewState must store absolute
    const absolutePos = getAbsolutePosition(node, nodes);
    
    const width = rawWidth ?? existingNodeView?.w ?? existingGroupView?.w ?? 96;
    const height = rawHeight ?? existingNodeView?.h ?? existingGroupView?.h ?? 96;

    // Stabilize: if position is (0,0) and we have existing view, use existing
    const stabilizedX =
      absolutePos.x === 0 && absolutePos.y === 0 && (existingNodeView || existingGroupView)
        ? (existingNodeView?.x ?? existingGroupView?.x ?? 0)
        : absolutePos.x;
    const stabilizedY =
      absolutePos.x === 0 && absolutePos.y === 0 && (existingNodeView || existingGroupView)
        ? (existingNodeView?.y ?? existingGroupView?.y ?? 0)
        : absolutePos.y;

    snapshot.node = snapshot.node || {};
    snapshot.node[node.id] = {
      x: stabilizedX,
      y: stabilizedY,
      w: width,
      h: height,
    };

    if (node.type === 'group') {
      snapshot.group = snapshot.group || {};
      snapshot.group[node.id] = {
        x: stabilizedX,
        y: stabilizedY,
        w: rawWidth ?? existingGroupView?.w ?? width,
        h: rawHeight ?? existingGroupView?.h ?? height,
      };
    }
  });

  return snapshot;
}

/**
 * Helper to extract all group IDs from the graph
 */
function extractGroupIdsFromGraph(graph: any): string[] {
  const groupIds: string[] = [];
  if (!graph) return groupIds;
  
  const traverse = (node: any) => {
    if (node.type === 'group' || node.data?.isGroup || node.mode) {
      groupIds.push(node.id);
    }
    if (node.children) {
      node.children.forEach((child: any) => traverse(child));
    }
  };
  
  if (graph.children) {
    graph.children.forEach((child: any) => traverse(child));
  }
  
  return groupIds;
}

/**
 * Saves a canvas snapshot to local storage
 */
export function saveCanvasSnapshot(
  rawGraph: any,
  viewState: ViewState,
  selectedArchitectureId: string
): void {
  try {
    const payload: CanvasSnapshot = {
      rawGraph,
      viewState,
      selectedArchitectureId,
      timestamp: Date.now(),
    };
    const serialized = JSON.stringify(payload);
    localStorage.setItem(LOCAL_CANVAS_SNAPSHOT_KEY, serialized);
    sessionStorage.setItem(LOCAL_CANVAS_SNAPSHOT_KEY, serialized);
  } catch (error) {
    console.error("❌ [saveCanvasSnapshot] Failed to persist local canvas snapshot:", error);
  }
}

/**
 * Restores a canvas snapshot from local storage
 */
export function restoreCanvasSnapshot(): CanvasSnapshot | null {
  try {
    const stored = localStorage.getItem(LOCAL_CANVAS_SNAPSHOT_KEY) || sessionStorage.getItem(LOCAL_CANVAS_SNAPSHOT_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    if (!parsed || !parsed.rawGraph || !parsed.rawGraph.children || parsed.rawGraph.children.length === 0) {
      return null;
    }

    // Check if snapshot is recent (within 24 hours)
    const ageInHours = (Date.now() - (parsed.timestamp || 0)) / (1000 * 60 * 60);
    if (ageInHours > 24) {
      console.log("🗑️ Local canvas snapshot expired, ignoring");
      clearCanvasSnapshot();
      return null;
    }

    return parsed as CanvasSnapshot;
  } catch (error) {
    console.warn("⚠️ Failed to restore local canvas snapshot:", error);
    return null;
  }
}

/**
 * Clears the canvas snapshot from local storage
 */
export function clearCanvasSnapshot(): void {
  try {
    localStorage.removeItem(LOCAL_CANVAS_SNAPSHOT_KEY);
    sessionStorage.removeItem(LOCAL_CANVAS_SNAPSHOT_KEY);
  } catch (error) {
    console.warn("⚠️ Failed to clear canvas snapshot:", error);
  }
}

/**
 * Checks if a canvas snapshot exists and is valid
 */
export function hasValidCanvasSnapshot(): boolean {
  const snapshot = restoreCanvasSnapshot();
  return snapshot !== null;
}
