import { RawGraph } from "../components/graph/types";

export type ViewState = {
  node?: Record<string, { x: number; y: number; w?: number; h?: number }>;
  group?: Record<string, { x: number; y: number; w?: number; h?: number }>;
  edge?: Record<string, unknown>;
};

export const createEmptyViewState = (): ViewState => ({
  node: {},
  group: {},
  edge: {}
});

const hasMeaningfulGeometry = (entries: [string, { x: number; y: number }][]) =>
  entries.some(([, geom]) => {
    if (!geom) return false;
    const { x, y } = geom;
    return Number.isFinite(x) && Number.isFinite(y) && (Math.abs(x) > 1 || Math.abs(y) > 1);
  });

export function sanitizeStoredViewState(input: unknown): ViewState | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  try {
    const clone: ViewState = JSON.parse(JSON.stringify(input));
    const nodeEntries = Object.entries(clone.node || {});
    const groupEntries = Object.entries(clone.group || {});

    if (!hasMeaningfulGeometry(nodeEntries) && !hasMeaningfulGeometry(groupEntries)) {
      return undefined;
    }

    return clone;
  } catch {
    return undefined;
  }
}

export function restoreNodeVisuals(target: RawGraph, original?: RawGraph): void {
  if (!target?.children || !original?.children) return;

  const originalById = new Map<string, any>();

  const collect = (node: any) => {
    if (!node || typeof node !== "object") return;
    originalById.set(node.id, node);
    node.children?.forEach(collect);
  };

  original.children.forEach(collect);

  const apply = (node: any) => {
    if (!node || typeof node !== "object") return;
    const originalNode = originalById.get(node.id);
    if (originalNode?.data) {
      const targetData = { ...(node.data || {}) };
      if (originalNode.data.icon && !targetData.icon) {
        targetData.icon = originalNode.data.icon;
      }
      if (originalNode.data.iconName && !targetData.iconName) {
        targetData.iconName = originalNode.data.iconName;
      }
      if (originalNode.data.style && !targetData.style) {
        targetData.style = originalNode.data.style;
      }
      if (Object.keys(targetData).length > 0) {
        node.data = targetData;
      }
    }
    node.children?.forEach(apply);
  };

  target.children.forEach(apply);
}

