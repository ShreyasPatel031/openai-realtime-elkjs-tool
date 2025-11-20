/**
 * ViewState types and helpers
 * Part of Agent B Inter Plan - B2
 * 
 * ViewState is the authoritative source of truth for all geometry (positions, sizes, waypoints).
 * Renderer reads exclusively from ViewState; no fallbacks to ELK or Domain.
 */

export type ViewState = {
  node?: Record<string, { x: number; y: number; w?: number; h?: number }>;
  group?: Record<string, { x: number; y: number; w?: number; h?: number }>;
  edge?: Record<string, { waypoints?: Array<{ x: number; y: number }> }>;
};

export type Geometry = { x: number; y: number; w?: number; h?: number };

/**
 * Creates an empty ViewState
 */
export function createEmptyViewState(): ViewState {
  return {
    node: {},
    group: {},
    edge: {},
  };
}

/**
 * Requires geometry for a node or group, throwing if missing.
 * Enforces no-fallback contract: if geometry is missing, fail loudly.
 * 
 * @param kind - 'node' or 'group'
 * @param id - Entity ID
 * @param viewState - ViewState to read from
 * @returns Geometry (never undefined)
 * @throws Error if geometry missing
 */
export function requireGeometry(
  kind: 'node' | 'group',
  id: string,
  viewState: ViewState
): Geometry {
  const store = kind === 'node' ? viewState.node : viewState.group;
  const geometry = store?.[id];

  if (!geometry || !Number.isFinite(geometry.x) || !Number.isFinite(geometry.y)) {
    const error = new Error(
      `[ViewState] Missing geometry for ${kind} "${id}". ` +
      `ViewState is the source of truth; no fallbacks allowed. ` +
      `Ensure Layout or Orchestration has written geometry before rendering.`
    );
    if (process.env.NODE_ENV !== 'production') {
      console.error(error);
      throw error;
    }
    // In production, return a safe default but log warning
    console.warn(`[ViewState] Missing geometry for ${kind} "${id}", using fallback (0,0)`);
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  return geometry;
}

/**
 * Gets geometry for a node or group, returning undefined if missing.
 * Use requireGeometry() if you need to enforce presence.
 */
export function getGeometry(
  kind: 'node' | 'group',
  id: string,
  viewState: ViewState
): Geometry | undefined {
  const store = kind === 'node' ? viewState.node : viewState.group;
  return store?.[id];
}





