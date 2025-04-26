// utils/elk/absPositions.ts
interface AbsPos { x: number; y: number; width: number; height: number }
export type AbsMap = Record<string, AbsPos>;

/** Walks the ELK graph and returns absolute coords for every node. */
export function computeAbsolutePositions(root: any): AbsMap {
  const map: AbsMap = {};

  const walk = (n: any, parentX = 0, parentY = 0) => {
    if (!n?.id) return;
    const absX = (n.x || 0) + parentX;
    const absY = (n.y || 0) + parentY;

    map[n.id] = { x: absX, y: absY, width: n.width || 80, height: n.height || 40 };
    (n.children || []).forEach((c: any) => walk(c, absX, absY));
  };

  walk(root);
  return map;
} 