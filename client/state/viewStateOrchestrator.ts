import type { RawGraph } from "../components/graph/types";
import { createEmptyViewState, type ViewState } from "../utils/canvasLayout";

const DEFAULT_GRID_SIZE = 8;

type Geometry = { x: number; y: number; w?: number; h?: number };
type EdgeGeometry = { waypoints?: Array<{ x: number; y: number }> };

export interface ViewStateWriteOptions {
  snapToGrid?: boolean;
  gridSize?: number;
  merge?: boolean;
}

export interface GraphValidationResult {
  ok: boolean;
  errors: string[];
}

export const ensureViewState = (viewState?: ViewState): ViewState => {
  if (!viewState) return createEmptyViewState();
  return {
    node: { ...(viewState.node ?? {}) },
    group: { ...(viewState.group ?? {}) },
    edge: { ...(viewState.edge ?? {}) }
  };
};

export const snapScalar = (value: number, gridSize = DEFAULT_GRID_SIZE) => {
  if (!Number.isFinite(value)) return value;
  const snapped = Math.round(value / gridSize) * gridSize;
  return Number.isFinite(snapped) ? snapped : value;
};

const maybeSnapGeometry = (
  geometry: Geometry,
  options: ViewStateWriteOptions | undefined
): Geometry => {
  if (!options?.snapToGrid) return { ...geometry };

  const grid = options.gridSize ?? DEFAULT_GRID_SIZE;
  return {
    ...geometry,
    x: snapScalar(geometry.x, grid),
    y: snapScalar(geometry.y, grid),
    ...(geometry.w !== undefined ? { w: snapScalar(geometry.w, grid) } : {}),
    ...(geometry.h !== undefined ? { h: snapScalar(geometry.h, grid) } : {})
  };
};

export const withNodeGeometry = (
  viewState: ViewState | undefined,
  nodeId: string,
  geometry: Geometry,
  options?: ViewStateWriteOptions
): ViewState => {
  const next = ensureViewState(viewState);
  const snapped = maybeSnapGeometry(geometry, options);
  const existing = options?.merge ? next.node?.[nodeId] ?? {} : {};

  next.node = next.node ?? {};
  next.node[nodeId] = {
    ...existing,
    ...snapped
  };

  return next;
};

export const withoutNodeGeometry = (viewState: ViewState | undefined, nodeId: string): ViewState => {
  if (!viewState?.node?.[nodeId]) return ensureViewState(viewState);
  const next = ensureViewState(viewState);
  delete next.node?.[nodeId];
  return next;
};

export const withGroupGeometry = (
  viewState: ViewState | undefined,
  groupId: string,
  geometry: Geometry,
  options?: ViewStateWriteOptions
): ViewState => {
  const next = ensureViewState(viewState);
  const snapped = maybeSnapGeometry(geometry, options);
  const existing = options?.merge ? next.group?.[groupId] ?? {} : {};

  next.group = next.group ?? {};
  next.group[groupId] = {
    ...existing,
    ...snapped
  };

  return next;
};

export const withoutGroupGeometry = (
  viewState: ViewState | undefined,
  groupId: string
): ViewState => {
  if (!viewState?.group?.[groupId]) return ensureViewState(viewState);
  const next = ensureViewState(viewState);
  delete next.group?.[groupId];
  return next;
};

export const withEdgeGeometry = (
  viewState: ViewState | undefined,
  edgeId: string,
  geometry: EdgeGeometry,
  options?: ViewStateWriteOptions
): ViewState => {
  const next = ensureViewState(viewState);
  const grid = options?.gridSize ?? DEFAULT_GRID_SIZE;
  const snappedWaypoints = geometry.waypoints?.map((point) => ({
    x: options?.snapToGrid ? snapScalar(point.x, grid) : point.x,
    y: options?.snapToGrid ? snapScalar(point.y, grid) : point.y
  }));

  const existing = options?.merge ? next.edge?.[edgeId] ?? {} : {};

  next.edge = next.edge ?? {};
  next.edge[edgeId] = {
    ...existing,
    ...(snappedWaypoints ? { waypoints: snappedWaypoints } : {})
  };

  return next;
};

export const withoutEdgeGeometry = (
  viewState: ViewState | undefined,
  edgeId: string
): ViewState => {
  if (!viewState?.edge?.[edgeId]) return ensureViewState(viewState);
  const next = ensureViewState(viewState);
  delete next.edge?.[edgeId];
  return next;
};

export const mergeViewState = (base: ViewState | undefined, patch: ViewState | undefined): ViewState => {
  if (!base) return ensureViewState(patch);
  if (!patch) return ensureViewState(base);

  return {
    node: {
      ...(base.node ?? {}),
      ...(patch.node ?? {})
    },
    group: {
      ...(base.group ?? {}),
      ...(patch.group ?? {})
    },
    edge: {
      ...(base.edge ?? {}),
      ...(patch.edge ?? {})
    }
  };
};

export const diffViewState = (before: ViewState | undefined, after: ViewState | undefined): ViewState => {
  const result = createEmptyViewState();
  const prior = before ?? createEmptyViewState();
  const next = after ?? createEmptyViewState();

  for (const [id, geometry] of Object.entries(next.node ?? {})) {
    if (JSON.stringify(prior.node?.[id]) !== JSON.stringify(geometry)) {
      result.node![id] = geometry;
    }
  }

  for (const [id, geometry] of Object.entries(next.group ?? {})) {
    if (JSON.stringify(prior.group?.[id]) !== JSON.stringify(geometry)) {
      result.group![id] = geometry;
    }
  }

  for (const [id, geometry] of Object.entries(next.edge ?? {})) {
    if (JSON.stringify(prior.edge?.[id]) !== JSON.stringify(geometry)) {
      result.edge![id] = geometry;
    }
  }

  return result;
};

export const validateGraphInvariants = (graph: RawGraph | undefined): GraphValidationResult => {
  const errors: string[] = [];

  if (!graph) {
    return { ok: false, errors: ["Graph is undefined"] };
  }

  const seenIds = new Map<string, string>();
  const nodeIds = new Set<string>();
  const collect = (entity: any, parentGroupId: string | null) => {
    if (!entity) return;

    const { id, type } = entity;
    if (typeof id !== "string" || !id) {
      errors.push(`Entity missing id under parent ${parentGroupId ?? "root"}`);
      return;
    }

    if (seenIds.has(id)) {
      errors.push(`Duplicate id "${id}" (${seenIds.get(id)} vs ${type ?? "unknown"})`);
    } else {
      seenIds.set(id, type ?? "unknown");
    }

    if (type === "node") {
      nodeIds.add(id);
    }

    if (Array.isArray(entity.edges)) {
      for (const edge of entity.edges) {
        if (!edge?.id) {
          errors.push(`Edge missing id within group ${id}`);
          continue;
        }
        if (seenIds.has(edge.id)) {
          errors.push(`Duplicate id "${edge.id}" (edge) across graph`);
        } else {
          seenIds.set(edge.id, "edge");
        }

        const sources = Array.isArray(edge.sources) ? edge.sources : [];
        const targets = Array.isArray(edge.targets) ? edge.targets : [];
        if (sources.length !== 1 || targets.length !== 1) {
          errors.push(`Edge "${edge.id}" must have exactly one source and one target`);
        }
      }
    }

    if (Array.isArray(entity.children)) {
      for (const child of entity.children) {
        collect(child, id);
      }
    }
  };

  if (Array.isArray(graph.children)) {
    for (const child of graph.children) {
      collect(child, null);
    }
  }

  if (graph.edges) {
    for (const edge of graph.edges) {
      errors.push(`Edge "${edge?.id ?? "unknown"}" declared at root; edges must live under their LCG group`);
    }
  }

  return { ok: errors.length === 0, errors };
};

export const logGraphInvariantViolations = (graph: RawGraph | undefined): GraphValidationResult => {
  const result = validateGraphInvariants(graph);
  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.warn("[viewStateOrchestrator] Graph invariant violations detected:", result.errors);
  }
  return result;
};

