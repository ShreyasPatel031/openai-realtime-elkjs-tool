/**
 * DragCoordinator - Single entry point for all drag operations
 * 
 * Key principles:
 * 1. ViewState stores ABSOLUTE positions
 * 2. ReactFlow uses ABSOLUTE positions (no conversion)
 * 3. Reparenting happens DURING drag (not on drag end)
 * 4. State updates are atomic
 * 5. Single source of truth for drag logic
 */

import type { Node } from '@xyflow/react';
import type { ViewState } from '../viewstate/ViewState';
import type { RawGraph } from '../../components/graph/types';
import { moveNode, findParentOfNode } from '../../components/graph/mutations';
import { findNodeById } from '../../components/graph/utils/find';
import { saveCanvasSnapshot } from '../../utils/canvasPersistence';

// ============================================
// Types
// ============================================

export interface Position {
  x: number;
  y: number;
}

interface DragState {
  isDragging: boolean;
  draggedNodeIds: Set<string>;
  startPositions: Map<string, Position>;  // absolute positions at drag start
}

interface ReparentEvent {
  nodeId: string;
  from: string | null;  // null means root
  to: string | null;    // null means root
}

export interface DragCoordinatorConfig {
  viewStateRef: React.MutableRefObject<ViewState>;
  domainRef: React.MutableRefObject<RawGraph | null>;
  setRawGraph: (graph: RawGraph, source?: 'user' | 'ai') => void;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  getReactFlowNodes: () => Node[];
  architectureId: string | null;
  onRenderNeeded?: () => void;
}

// ============================================
// DragCoordinator Class
// ============================================

export class DragCoordinator {
  private state: DragState;
  private config: DragCoordinatorConfig;

  constructor(config: DragCoordinatorConfig) {
    this.config = config;
    this.state = {
      isDragging: false,
      draggedNodeIds: new Set(),
      startPositions: new Map(),
    };
  }

  /**
   * Update config (e.g., when architectureId changes)
   */
  updateConfig(partial: Partial<DragCoordinatorConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Called when drag starts
   */
  handleDragStart(nodeIds: string[]): void {
    console.log('[🎯 DRAG-COORD] Drag started:', nodeIds);
    
    this.state.isDragging = true;
    this.state.draggedNodeIds = new Set(nodeIds);
    this.state.startPositions.clear();

    // Capture start positions (absolute from ViewState)
    for (const nodeId of nodeIds) {
      const absolutePos = this.getAbsolutePosition(nodeId);
      if (absolutePos) {
        this.state.startPositions.set(nodeId, { ...absolutePos });
      }
      
      // If this is a group, also capture children's start positions
      if (this.isGroup(nodeId)) {
        this.captureChildrenStartPositions(nodeId);
      }
    }
  }
  
  /**
   * Recursively capture start positions for all children of a group
   */
  private captureChildrenStartPositions(groupId: string): void {
    const domain = this.config.domainRef.current;
    if (!domain) return;

    const group = findNodeById(domain, groupId);
    if (!group?.children) return;

    for (const child of group.children) {
      const absolutePos = this.getAbsolutePosition(child.id);
      if (absolutePos) {
        this.state.startPositions.set(child.id, { ...absolutePos });
      }
      
      // Recursively capture nested children
      if (child.children?.length) {
        this.captureChildrenStartPositions(child.id);
      }
    }
  }

  /**
   * Called on every position change DURING drag
   * This is where reparenting happens - NOT on drag end
   */
  handleDragMove(nodeId: string, newAbsolutePos: Position): void {
    if (!this.state.isDragging) {
      // Auto-start drag if not started
      this.handleDragStart([nodeId]);
    }

    const viewState = this.config.viewStateRef.current;
    const domain = this.config.domainRef.current;

    if (!viewState || !domain) {
      console.warn('[🎯 DRAG-COORD] Missing viewState or domain');
      return;
    }
    
    console.log('[🎯 DRAG-COORD] handleDragMove:', {
      nodeId,
      newAbsolutePos,
      isGroup: this.isGroup(nodeId),
      domainChildrenCount: domain.children?.length || 0,
    });

    // 1. Update ViewState position immediately (always absolute)
    this.updateViewStatePosition(nodeId, newAbsolutePos);

    // 2. If this is a group, move children by same delta
    if (this.isGroup(nodeId)) {
      const startPos = this.state.startPositions.get(nodeId);
      if (startPos) {
        const delta = {
          x: newAbsolutePos.x - startPos.x,
          y: newAbsolutePos.y - startPos.y,
        };
        this.moveChildrenBy(nodeId, delta);
      }
    }

    // 3. Check for reparenting DURING drag (for non-groups only)
    if (!this.isGroup(nodeId)) {
      const containingGroup = this.findContainingGroup(nodeId, newAbsolutePos);
      const currentParent = this.getCurrentParent(nodeId);

      // Normalize: null and 'root' both mean "no parent"
      const normalizedContaining = containingGroup || null;
      const normalizedCurrent = currentParent === 'root' ? null : currentParent;

      console.log('[🎯 DRAG-COORD] Containment check:', {
        nodeId,
        containingGroup: containingGroup || 'none',
        currentParent: currentParent || 'root',
        willReparent: normalizedContaining !== normalizedCurrent,
      });

      if (normalizedContaining !== normalizedCurrent) {
        console.log('[🎯 DRAG-COORD] Reparent DURING drag:', {
          nodeId,
          from: normalizedCurrent || 'root',
          to: normalizedContaining || 'root',
        });
        this.reparentNode(nodeId, normalizedCurrent, normalizedContaining);
      }
    }
  }

  /**
   * Called when drag ends - just persist to localStorage
   * Reparenting already happened during drag
   */
  handleDragEnd(): void {
    if (!this.state.isDragging) {
      return;
    }

    console.log('[🎯 DRAG-COORD] Drag ended, persisting state');

    // Persist to localStorage
    if (this.config.architectureId && this.config.domainRef.current && this.config.viewStateRef.current) {
      saveCanvasSnapshot(
        this.config.domainRef.current,
        this.config.viewStateRef.current,
        this.config.architectureId
      );
      console.log('[🎯 DRAG-COORD] Persisted to localStorage');
    }

    this.resetState();
  }

  // ============================================
  // State Queries (for testing)
  // ============================================

  isDragging(): boolean {
    return this.state.isDragging;
  }

  getDraggedNodeIds(): string[] {
    return Array.from(this.state.draggedNodeIds);
  }

  // ============================================
  // Private Helpers
  // ============================================

  private resetState(): void {
    this.state.isDragging = false;
    this.state.draggedNodeIds.clear();
    this.state.startPositions.clear();
  }

  /**
   * Get absolute position from ViewState
   */
  private getAbsolutePosition(nodeId: string): Position | null {
    const viewState = this.config.viewStateRef.current;
    const geom = viewState?.node?.[nodeId] || viewState?.group?.[nodeId];
    if (!geom) return null;
    return { x: geom.x, y: geom.y };
  }

  /**
   * Check if a node is a group
   */
  private isGroup(nodeId: string): boolean {
    const nodes = this.config.getReactFlowNodes();
    const node = nodes.find(n => n.id === nodeId);
    return node?.type === 'group';
  }

  /**
   * Move all children of a group by a delta
   */
  private moveChildrenBy(groupId: string, delta: Position): void {
    const domain = this.config.domainRef.current;
    if (!domain) return;

    const group = findNodeById(domain, groupId);
    if (!group?.children) return;

    for (const child of group.children) {
      const startPos = this.state.startPositions.get(child.id);
      if (startPos) {
        const newPos = {
          x: startPos.x + delta.x,
          y: startPos.y + delta.y,
        };
        this.updateViewStatePosition(child.id, newPos);
        
        // Also update ReactFlow node position directly for immediate visual feedback
        this.config.setNodes((nodes) =>
          nodes.map((n) =>
            n.id === child.id ? { ...n, position: newPos } : n
          )
        );
      }

      // Recursively move nested children
      if (child.children?.length) {
        this.moveChildrenBy(child.id, delta);
      }
    }
  }

  /**
   * Find which group (if any) fully contains a node at the given position
   */
  private findContainingGroup(nodeId: string, absolutePos: Position): string | null {
    const viewState = this.config.viewStateRef.current;
    const nodes = this.config.getReactFlowNodes();
    
    // Get node dimensions
    const nodeGeom = viewState?.node?.[nodeId];
    const node = nodes.find(n => n.id === nodeId);
    const nodeWidth = nodeGeom?.w || (node?.data as any)?.width || 96;
    const nodeHeight = nodeGeom?.h || (node?.data as any)?.height || 96;

    const nodeBounds = {
      x: absolutePos.x,
      y: absolutePos.y,
      width: nodeWidth,
      height: nodeHeight,
    };

    // Check all groups
    const groups = nodes.filter(n => n.type === 'group' && n.id !== nodeId);
    
    for (const group of groups) {
      const groupGeom = viewState?.group?.[group.id];
      if (!groupGeom) continue;

      const groupBounds = {
        x: groupGeom.x,
        y: groupGeom.y,
        width: groupGeom.w,
        height: groupGeom.h,
      };

      // Check if node is fully contained
      if (this.isFullyContained(nodeBounds, groupBounds)) {
        return group.id;
      }
    }

    return null;
  }

  /**
   * Check if inner rect is fully inside outer rect
   */
  private isFullyContained(
    inner: { x: number; y: number; width: number; height: number },
    outer: { x: number; y: number; width: number; height: number }
  ): boolean {
    return (
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.width <= outer.x + outer.width &&
      inner.y + inner.height <= outer.y + outer.height
    );
  }

  /**
   * Get current parent of a node from domain
   */
  private getCurrentParent(nodeId: string): string | null {
    const domain = this.config.domainRef.current;
    if (!domain) return null;

    const parent = findParentOfNode(domain, nodeId);
    if (!parent) return null;
    
    // If parent is the root graph, return 'root'
    if (parent.id === domain.id || parent.id === 'root') {
      return 'root';
    }
    
    return parent.id;
  }

  /**
   * Update ViewState position for a node (always absolute)
   */
  private updateViewStatePosition(nodeId: string, absolutePos: Position): void {
    const viewState = this.config.viewStateRef.current;
    const isGroup = this.isGroup(nodeId);
    const store = isGroup ? 'group' : 'node';

    if (!viewState[store]) {
      viewState[store] = {};
    }

    const existingEntry = viewState[store][nodeId];
    
    // CRITICAL: Get dimensions from ReactFlow node (source of truth for resize)
    // ViewState might be stale due to async updates
    const rfNodes = this.config.getReactFlowNodes();
    const rfNode = rfNodes.find(n => n.id === nodeId);
    const rfWidth = rfNode?.width || (rfNode?.style as any)?.width;
    const rfHeight = rfNode?.height || (rfNode?.style as any)?.height;
    
    // Use ReactFlow dimensions if available, otherwise fall back to ViewState/defaults
    const finalW = rfWidth ?? existingEntry?.w ?? (isGroup ? 200 : 96);
    const finalH = rfHeight ?? existingEntry?.h ?? (isGroup ? 150 : 96);

    if (!existingEntry) {
      viewState[store][nodeId] = {
        x: absolutePos.x,
        y: absolutePos.y,
        w: finalW,
        h: finalH,
      };
    } else {
      // Update position AND dimensions (dimensions might have changed from resize)
      viewState[store][nodeId].x = absolutePos.x;
      viewState[store][nodeId].y = absolutePos.y;
      viewState[store][nodeId].w = finalW;
      viewState[store][nodeId].h = finalH;
    }
  }

  /**
   * Reparent a node - update domain immediately
   */
  private reparentNode(nodeId: string, from: string | null, to: string | null): void {
    const domain = this.config.domainRef.current;
    if (!domain) return;

    try {
      const newParentId = to || 'root';
      
      // Deep clone to ensure we don't have mutation issues
      let updatedDomain = JSON.parse(JSON.stringify(domain));
      updatedDomain = moveNode(nodeId, newParentId, updatedDomain);

      // If moving into group, set FREE mode (in both domain and ViewState.layout)
      if (to) {
        const group = findNodeById(updatedDomain, to);
        if (group) {
          group.mode = 'FREE';
        }
        
        // Also update ViewState.layout
        const viewState = this.config.viewStateRef.current;
        if (viewState) {
          if (!viewState.layout) {
            viewState.layout = {};
          }
          viewState.layout[to] = { mode: 'FREE' };
        }
      }

      // Update domain ref immediately
      this.config.domainRef.current = updatedDomain;

      // Update React state
      this.config.setRawGraph(updatedDomain, 'user');

      console.log('[🎯 DRAG-COORD] Reparented successfully:', {
        nodeId,
        to: newParentId,
      });
    } catch (error) {
      console.error('[🎯 DRAG-COORD] Reparent failed:', { nodeId, from, to, error });
    }
  }
}

// ============================================
// Singleton instance
// ============================================

let globalCoordinator: DragCoordinator | null = null;

export function createDragCoordinator(config: DragCoordinatorConfig): DragCoordinator {
  globalCoordinator = new DragCoordinator(config);
  return globalCoordinator;
}

export function getDragCoordinator(): DragCoordinator | null {
  return globalCoordinator;
}

export function resetDragCoordinator(): void {
  globalCoordinator = null;
}
