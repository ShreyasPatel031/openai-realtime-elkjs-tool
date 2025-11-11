import { Node } from 'reactflow';

export const LOCAL_CANVAS_SNAPSHOT_KEY = "atelier_canvas_last_snapshot_v1";

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
    if (process.env.NODE_ENV !== 'production') {
      console.info('[VIEWSTATE DEBUG] Hydration in progress - reusing existing snapshot');
    }
    try {
      return JSON.parse(JSON.stringify(viewStateRef.current));
    } catch (error) {
      console.warn('⚠️ Failed to clone viewState snapshot during hydration:', error);
      return viewStateRef.current;
    }
  }

  const base = viewStateRef?.current
    ? (() => {
        try {
          return JSON.parse(JSON.stringify(viewStateRef.current));
        } catch (error) {
          console.warn('⚠️ Failed to clone viewState snapshot:', error);
          return viewStateRef.current;
        }
      })()
    : { node: {}, group: {}, edge: {} };

  const snapshot = base || { node: {}, group: {}, edge: {} };

  nodes.forEach((node) => {
    const existingNodeView = viewStateRef?.current?.node?.[node.id];

    const rawWidth =
      (typeof node.data?.width === 'number' && node.data.width) ||
      (typeof node.style?.width === 'number' && node.style.width) ||
      (typeof node.style?.width === 'string' ? parseFloat(node.style.width) : undefined);
    const rawHeight =
      (typeof node.data?.height === 'number' && node.data.height) ||
      (typeof node.style?.height === 'number' && node.style.height) ||
      (typeof node.style?.height === 'string' ? parseFloat(node.style.height) : undefined);

    const stabilizedX =
      (node.position?.x ?? 0) === 0 && (node.position?.y ?? 0) === 0 && existingNodeView
        ? existingNodeView.x
        : node.position?.x ?? 0;
    const stabilizedY =
      (node.position?.x ?? 0) === 0 && (node.position?.y ?? 0) === 0 && existingNodeView
        ? existingNodeView.y
        : node.position?.y ?? 0;

    const width = rawWidth ?? existingNodeView?.w ?? 96;
    const height = rawHeight ?? existingNodeView?.h ?? 96;

    snapshot.node = snapshot.node || {};
    snapshot.node[node.id] = {
      x: stabilizedX,
      y: stabilizedY,
      w: width,
      h: height,
    };

    if (node.type === 'group') {
      const existingGroupView = viewStateRef?.current?.group?.[node.id];
      snapshot.group = snapshot.group || {};
      snapshot.group[node.id] = {
        x:
          (node.position?.x ?? 0) === 0 && (node.position?.y ?? 0) === 0 && existingGroupView
            ? existingGroupView.x
            : node.position?.x ?? 0,
        y:
          (node.position?.x ?? 0) === 0 && (node.position?.y ?? 0) === 0 && existingGroupView
            ? existingGroupView.y
            : node.position?.y ?? 0,
        w: rawWidth ?? existingGroupView?.w ?? width,
        h: rawHeight ?? existingGroupView?.h ?? height,
      };
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const nodeEntries = Object.entries(snapshot.node || {});
    const groupEntries = Object.entries(snapshot.group || {});
    console.info('[VIEWSTATE DEBUG] createViewStateSnapshot', {
      nodeCount: nodeEntries.length,
      groupCount: groupEntries.length,
      sampleNodes: nodeEntries.slice(0, 5).map(([id, geom]) => ({ id, ...geom })),
      sampleGroups: groupEntries.slice(0, 5).map(([id, geom]) => ({ id, ...geom })),
    });
  }

  return snapshot;
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
    console.warn("⚠️ Failed to persist local canvas snapshot:", error);
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
