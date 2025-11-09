import type { MutableRefObject } from 'react';
import type { ReactFlowInstance } from 'reactflow';

export function placeNodeOnCanvas(
  e: MouseEvent,
  selectedTool: 'select' | 'box' | 'connector' | 'group',
  reactFlowRef: MutableRefObject<ReactFlowInstance | null>,
  handleAddNode: (nodeName: string, parentId: string, data?: { label?: string; icon?: string; style?: any }) => void,
  viewStateRef?: MutableRefObject<any>,
  onDone?: (nextTool: 'select' | 'box' | 'connector' | 'group') => void,
) {
  if (selectedTool !== 'box') {
    return;
  }
  const target = e.currentTarget as HTMLDivElement;
  if (!target) return;
  const rf = reactFlowRef.current;
  if (!rf) return;
  const projected = (rf as any).screenToFlowPosition
    ? (rf as any).screenToFlowPosition({ x: (e as any).clientX, y: (e as any).clientY })
    : rf.project({ x: (e as any).clientX, y: (e as any).clientY });
  const snap = (v: number) => Math.round(v / 16) * 16; // match canvas grid
  // Snap cursor in world space as the node center
  const snappedCenter = { x: snap(projected.x), y: snap(projected.y) };
  const NODE_SIZE = 96; // align to 16px grid
  const half = NODE_SIZE / 2;
  const topLeft = { x: snappedCenter.x - half, y: snappedCenter.y - half };
  const id = `user-node-${Date.now()}`;

  // Add node to domain graph (structure only, no positions)
  handleAddNode(id, 'root', {
    label: '',  // Empty label for "Add text" placeholder
  });

  // Write position to ViewState (not domain graph)
  try {
    if (viewStateRef && viewStateRef.current) {
      const vs = viewStateRef.current;
      vs.node = vs.node || {};
      vs.node[id] = { x: topLeft.x, y: topLeft.y, w: NODE_SIZE, h: NODE_SIZE };
    }
  } catch (error) {
    console.error(`[canvasInteractions] Error writing to viewState:`, error);
  }

  // Auto-switch to select tool after creating a node so user can interact with it
  onDone?.('select');
}


