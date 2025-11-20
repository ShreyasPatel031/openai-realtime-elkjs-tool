import type { MutableRefObject } from 'react';
import type { ReactFlowInstance } from 'reactflow';
import { CoordinateService } from '../../core/viewstate/CoordinateService';
import { apply } from '../../core/orchestration/Orchestrator';
import type { EditIntent } from '../../core/orchestration/types';

export function placeNodeOnCanvas(
  e: MouseEvent,
  selectedTool: 'arrow' | 'hand' | 'box' | 'connector' | 'group',
  reactFlowRef: MutableRefObject<ReactFlowInstance | null>,
  viewStateRef?: MutableRefObject<any>,
  onDone?: (nextTool: 'arrow' | 'hand' | 'box' | 'connector' | 'group') => void,
  parentId?: string | null,
) {
  if (selectedTool !== 'box' && !parentId) {
    return;
  }
  const target = e.currentTarget as HTMLDivElement;
  if (!target) return;
  const rf = reactFlowRef.current;
  if (!rf) return;
  // Convert screen coordinates to world coordinates
  const screenPoint = { x: (e as any).clientX, y: (e as any).clientY };
  const projected = (rf as any).screenToFlowPosition
    ? (rf as any).screenToFlowPosition(screenPoint)
    : rf.project(screenPoint);
  
  console.log('[🎯COORD] placeNodeOnCanvas - screen to world:', {
    screen: `${screenPoint.x},${screenPoint.y}`,
    world: `${projected.x},${projected.y}`,
  });
  
  // Use CoordinateService to snap to grid
  const snappedCenter = CoordinateService.snapPoint(projected);
  const NODE_SIZE = 96; // align to 16px grid
  const half = NODE_SIZE / 2;
  const topLeft = { x: snappedCenter.x - half, y: snappedCenter.y - half };
  const id = `user-node-${Date.now()}`;

  console.log('[🎯COORD] placeNodeOnCanvas - final position:', {
    nodeId: id,
    snappedCenter: `${snappedCenter.x},${snappedCenter.y}`,
    topLeft: `${topLeft.x},${topLeft.y}`,
    parentId: parentId || 'root',
  });

  // Use Orchestrator for FREE structural edit (add node)
  // Orchestrator will write position to ViewState
  const intent: EditIntent = {
    source: 'user',
    kind: 'free-structural', 
    scopeId: parentId || 'root',
    payload: {
      action: 'add-node',
      nodeId: id,
      parentId: parentId || 'root',
      position: { x: topLeft.x, y: topLeft.y },
      size: { w: NODE_SIZE, h: NODE_SIZE },
      data: {
        label: '', // Empty label for "Add text" placeholder
      }
    }
  };
  
  console.log('[placeNodeOnCanvas] Applying intent:', intent);
  
  apply(intent).catch(error => {
    console.error('[placeNodeOnCanvas] Orchestrator apply failed:', error);
  });

  // Auto-switch to select tool after creating a node so user can interact with it
  onDone?.('arrow');
}



