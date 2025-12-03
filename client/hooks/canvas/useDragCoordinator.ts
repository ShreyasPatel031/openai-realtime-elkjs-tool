/**
 * useDragCoordinator - Hook to integrate DragCoordinator with React components
 * 
 * This hook:
 * 1. Creates and manages a DragCoordinator instance
 * 2. Handles position change events from ReactFlow
 * 3. Routes drag events to the coordinator
 */

import { useRef, useCallback, useEffect } from 'react';
import type { Node, NodeChange } from '@xyflow/react';
import { DragCoordinator, createDragCoordinator, getDragCoordinator, type DragCoordinatorConfig } from '../../core/drag/DragCoordinator';
import type { ViewState } from '../../core/viewstate/ViewState';
import type { RawGraph } from '../../components/graph/types';

interface UseDragCoordinatorParams {
  viewStateRef: React.MutableRefObject<ViewState>;
  rawGraphRef: React.MutableRefObject<RawGraph | null>;
  setRawGraph: (graph: RawGraph, source?: 'user' | 'ai') => void;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  reactFlowRef: React.MutableRefObject<any>;
  selectedArchitectureId: string | null;
  recentlyCreatedNodesRef: React.MutableRefObject<Map<string, number>>;
}

interface UseDragCoordinatorReturn {
  handlePositionChanges: (changes: NodeChange[]) => void;
  coordinator: DragCoordinator | null;
}

export function useDragCoordinator({
  viewStateRef,
  rawGraphRef,
  setRawGraph,
  setNodes,
  reactFlowRef,
  selectedArchitectureId,
  recentlyCreatedNodesRef,
}: UseDragCoordinatorParams): UseDragCoordinatorReturn {
  const coordinatorRef = useRef<DragCoordinator | null>(null);
  const isDraggingRef = useRef(false);
  const draggedNodeIdsRef = useRef<Set<string>>(new Set());

  // Initialize coordinator
  useEffect(() => {
    const config: DragCoordinatorConfig = {
      viewStateRef,
      domainRef: rawGraphRef,
      setRawGraph,
      setNodes,
      getReactFlowNodes: () => reactFlowRef.current?.getNodes() || [],
      architectureId: selectedArchitectureId,
    };

    coordinatorRef.current = createDragCoordinator(config);

    return () => {
      coordinatorRef.current = null;
    };
  }, [viewStateRef, rawGraphRef, setRawGraph, setNodes, reactFlowRef, selectedArchitectureId]);

  // Update config when architectureId changes
  useEffect(() => {
    if (coordinatorRef.current) {
      coordinatorRef.current.updateConfig({ architectureId: selectedArchitectureId });
    }
  }, [selectedArchitectureId]);

  /**
   * Handle position changes from ReactFlow's onNodesChange
   */
  const handlePositionChanges = useCallback((changes: NodeChange[]) => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) return;

    // Filter to position changes only
    const positionChanges = changes.filter(
      (ch): ch is NodeChange & { type: 'position'; id: string; position?: { x: number; y: number }; dragging?: boolean } =>
        ch.type === 'position'
    );

    if (positionChanges.length === 0) return;

    // Skip recently created nodes (they're just being positioned initially)
    const now = Date.now();
    const relevantChanges = positionChanges.filter((ch) => {
      const createdTime = recentlyCreatedNodesRef.current.get(ch.id);
      if (createdTime && now - createdTime < 100) {
        return false;
      }
      return true;
    });

    if (relevantChanges.length === 0) return;

    // Check if any node is currently dragging
    const anyDragging = relevantChanges.some((ch) => ch.dragging === true);
    const anyDragEnd = relevantChanges.some((ch) => ch.dragging === false);

    // Handle drag start
    if (anyDragging && !isDraggingRef.current) {
      isDraggingRef.current = true;
      const nodeIds = relevantChanges.map((ch) => ch.id);
      draggedNodeIdsRef.current = new Set(nodeIds);
      coordinator.handleDragStart(nodeIds);
    }

    // Handle drag move
    if (anyDragging) {
      for (const change of relevantChanges) {
        if (change.position && change.dragging) {
          console.log('[🎯 DRAG-HOOK] Drag move:', {
            id: change.id,
            position: change.position,
            dragging: change.dragging,
          });
          // Position from ReactFlow is absolute (we don't use parent-relative)
          coordinator.handleDragMove(change.id, change.position);
        }
      }
    }

    // Handle drag end
    if (anyDragEnd && isDraggingRef.current) {
      isDraggingRef.current = false;
      draggedNodeIdsRef.current.clear();
      coordinator.handleDragEnd();
    }
  }, [recentlyCreatedNodesRef]);

  return {
    handlePositionChanges,
    coordinator: coordinatorRef.current,
  };
}

