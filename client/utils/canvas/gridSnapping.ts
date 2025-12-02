/**
 * Grid Snapping Utility for FREE Mode User Interactions
 * 
 * This utility handles grid snapping for ReactFlow nodes during user interactions.
 * It is completely independent of ELK and the Domain/ViewState architecture.
 */

import { NodeChange, applyNodeChanges } from 'reactflow';

const GRID_SIZE = 16;

const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;
const snapPos = (p: { x: number; y: number }) => ({ x: snap(p.x), y: snap(p.y) });

/**
 * Applies grid snapping to node position changes
 * @param changes - ReactFlow node changes
 * @returns Changes with snapped positions
 */
export function applyGridSnapping(changes: NodeChange[]): NodeChange[] {
  return changes.map((ch) => {
    if (ch.type === 'position' && (ch as any).position) {
      const pos = (ch as any).position as { x: number; y: number };
      const snapped = snapPos(pos);
      return { ...ch, position: snapped } as NodeChange;
    }
    return ch;
  });
}

/**
 * Creates a handler function that applies grid snapping and updates ReactFlow nodes
 * @param setNodes - ReactFlow setNodes function
 * @returns Handler function for onNodesChange
 */
export function createGridSnappingHandler(
  setNodes: React.Dispatch<React.SetStateAction<any[]>>
) {
  return (changes: NodeChange[]) => {
    const snappedChanges = applyGridSnapping(changes);
    setNodes((nodesState) => applyNodeChanges(snappedChanges, nodesState));
  };
}




