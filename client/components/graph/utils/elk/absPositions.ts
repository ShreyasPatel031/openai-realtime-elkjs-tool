// utils/elk/absPositions.ts
import { NON_ROOT_DEFAULT_OPTIONS } from "./elkOptions";

interface AbsPos { x: number; y: number; width: number; height: number }
export type AbsMap = Record<string, AbsPos>;

/** Walks the ELK graph and returns absolute coords for every node. */
export function computeAbsolutePositions(root: any): AbsMap {
  const map: AbsMap = {};
  
  function recurse(node: any, parentX: number, parentY: number) {
    if (!node) return;
    
    const absX = (node.x ?? 0) + parentX;
    const absY = (node.y ?? 0) + parentY;
    
    map[node.id] = { 
      x: absX, 
      y: absY, 
      width: node.width ?? NON_ROOT_DEFAULT_OPTIONS.width, 
      height: node.height ?? NON_ROOT_DEFAULT_OPTIONS.height 
    };
    
    (node.children || []).forEach((child: any) => 
      recurse(child, absX, absY)
    );
  }
  
  recurse(root, 0, 0);
  return map;
} 