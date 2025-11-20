/**
 * ReactFlowAdapterV2 - ReactFlow implementation of CanvasAdapter
 * Part of CP1: Library-agnostic coordinate system using ReactFlow
 * 
 * This adapter provides world coordinate access while using ReactFlow internally.
 * Delegates all coordinate transforms to CoordinateService.
 */

import type { ReactFlowInstance, Node } from 'reactflow';
import type { CanvasAdapter, CanvasAdapterConfig, ScreenProjection, DragLifecycle } from '../CanvasAdapter';
import type { Point, Bounds } from '../../viewstate/CoordinateService';
import type { ViewState } from '../../viewstate/ViewState';
import { CoordinateService } from '../../viewstate/CoordinateService';
import { DEFAULT_ADAPTER_CONFIG } from '../CanvasAdapter';

/**
 * ReactFlow implementation of CanvasAdapter
 */
export class ReactFlowAdapterV2 implements CanvasAdapter {
  private reactFlowInstance: ReactFlowInstance;
  private config: Required<CanvasAdapterConfig>;
  private viewStateRef: ViewState | undefined;
  
  // Drag lifecycle state
  private dragState: {
    active: boolean;
    nodeIds: string[];
    positions: Map<string, Point>;
  } = {
    active: false,
    nodeIds: [],
    positions: new Map(),
  };

  constructor(reactFlowInstance: ReactFlowInstance, config: CanvasAdapterConfig = {}) {
    this.reactFlowInstance = reactFlowInstance;
    this.config = { ...DEFAULT_ADAPTER_CONFIG, ...config };
  }

  // ViewState management
  getViewState(): ViewState | undefined {
    return this.viewStateRef;
  }

  setViewState(viewState: ViewState | undefined): void {
    this.viewStateRef = viewState;
  }

  // Screen projection
  screenToWorld(screenPoint: Point): Point {
    const canvasPoint = this.reactFlowInstance.screenToFlowPosition 
      ? this.reactFlowInstance.screenToFlowPosition(screenPoint)
      : this.reactFlowInstance.project(screenPoint);
    
    // ReactFlow "flow position" is already in world coordinates for top-level nodes
    // No additional transformation needed
    return CoordinateService.snapPoint(canvasPoint);
  }

  worldToScreen(worldPoint: Point): Point {
    // This is the inverse of screenToWorld
    // ReactFlow doesn't have a direct worldToScreen, but we can approximate
    // using viewport transforms
    const viewport = this.reactFlowInstance.getViewport();
    return {
      x: (worldPoint.x + viewport.x) * viewport.zoom,
      y: (worldPoint.y + viewport.y) * viewport.zoom,
    };
  }

  getViewport(): { x: number; y: number; zoom: number } {
    return this.reactFlowInstance.getViewport();
  }

  // Drag lifecycle
  beginDrag(nodeIds: string[], initialWorldPositions: Map<string, Point>): void {
    this.dragState = {
      active: true,
      nodeIds: [...nodeIds],
      positions: new Map(initialWorldPositions),
    };
  }

  updateDrag(nodeIds: string[], newWorldPositions: Map<string, Point>): void {
    if (!this.dragState.active) return;
    
    this.dragState.nodeIds = [...nodeIds];
    this.dragState.positions = new Map(newWorldPositions);
  }

  endDrag(): void {
    this.dragState = {
      active: false,
      nodeIds: [],
      positions: new Map(),
    };
  }

  isDragging(): boolean {
    return this.dragState.active;
  }

  getDragPositions(): Map<string, Point> | null {
    return this.dragState.active ? new Map(this.dragState.positions) : null;
  }

  // Core adapter methods
  getWorldNodeBounds(nodeId: string): Bounds | null {
    console.log('[🎯COORD] ReactFlowAdapterV2.getWorldNodeBounds:', { nodeId, isDragging: this.dragState.active });
    
    // Check drag overlay first
    if (this.dragState.active && this.dragState.positions.has(nodeId)) {
      const dragPos = this.dragState.positions.get(nodeId)!;
      const bounds = this.getViewStateBounds(nodeId);
      if (bounds) {
        const result = {
          x: dragPos.x,
          y: dragPos.y,
          w: bounds.w,
          h: bounds.h,
        };
        console.log('[🎯COORD] ReactFlowAdapterV2 drag overlay bounds:', { nodeId, bounds: result });
        return result;
      }
    }

    // Fall back to ViewState
    const result = this.getViewStateBounds(nodeId);
    console.log('[🎯COORD] ReactFlowAdapterV2 ViewState bounds:', { nodeId, bounds: result });
    return result;
  }

  getWorldPositions(nodeIds: string[]): Map<string, Point> {
    const positions = new Map<string, Point>();
    
    for (const nodeId of nodeIds) {
      // Check drag overlay first
      if (this.dragState.active && this.dragState.positions.has(nodeId)) {
        positions.set(nodeId, this.dragState.positions.get(nodeId)!);
        continue;
      }

      // Fall back to ViewState
      const bounds = this.getViewStateBounds(nodeId);
      if (bounds) {
        positions.set(nodeId, { x: bounds.x, y: bounds.y });
      }
    }

    return positions;
  }

  toCanvasFromWorld(nodeId: string, worldPos: Point, parentId?: string): Point {
    console.log('[🎯COORD] ReactFlowAdapterV2.toCanvasFromWorld:', { nodeId, worldPos, parentId });
    
    // For ReactFlow:
    // - Top-level nodes use world coordinates directly (absolute)
    // - Child nodes need relative coordinates (world - parent world)
    
    if (!parentId) {
      // Top-level node: world coordinates = ReactFlow coordinates
      console.log('[🎯COORD] ReactFlowAdapterV2 top-level node:', worldPos);
      return worldPos;
    }

    // Child node: convert to relative
    const parentBounds = this.getViewStateBounds(parentId);
    if (!parentBounds) {
      console.warn(`[ReactFlowAdapterV2] Parent ${parentId} not found for node ${nodeId}, using absolute position`);
      return worldPos;
    }

    const result = CoordinateService.toRelativeFromWorld(worldPos, { x: parentBounds.x, y: parentBounds.y });
    console.log('[🎯COORD] ReactFlowAdapterV2 child node relative:', { result, parentBounds });
    return result;
  }

  toWorldFromCanvas(nodeId: string, canvasPos: Point, parentId?: string): Point {
    // For ReactFlow:
    // - Top-level nodes: ReactFlow coordinates = world coordinates
    // - Child nodes: ReactFlow coordinates are relative, need to add parent world position
    
    if (!parentId) {
      // Top-level node: ReactFlow position is world position
      return canvasPos;
    }

    // Child node: convert from relative
    const parentBounds = this.getViewStateBounds(parentId);
    if (!parentBounds) {
      console.warn(`[ReactFlowAdapterV2] Parent ${parentId} not found for node ${nodeId}, using relative as absolute`);
      return canvasPos;
    }

    return CoordinateService.toWorldFromRelative(canvasPos, { x: parentBounds.x, y: parentBounds.y });
  }

  // Private helper methods
  private getViewStateBounds(nodeId: string): Bounds | null {
    if (!this.viewStateRef) {
      if (this.config.strictGeometry) {
        throw new Error(`[ReactFlowAdapterV2] ViewState not available for node ${nodeId}`);
      }
      return this.getReactFlowBounds(nodeId);
    }

    // Check node geometry
    const nodeGeom = this.viewStateRef.node?.[nodeId];
    if (nodeGeom) {
      return {
        x: nodeGeom.x,
        y: nodeGeom.y,
        w: nodeGeom.w ?? 96,
        h: nodeGeom.h ?? 96,
      };
    }

    // Check group geometry
    const groupGeom = this.viewStateRef.group?.[nodeId];
    if (groupGeom) {
      return {
        x: groupGeom.x,
        y: groupGeom.y,
        w: groupGeom.w ?? 480,
        h: groupGeom.h ?? 320,
      };
    }

    // ViewState missing geometry
    if (this.config.strictGeometry) {
      throw new Error(`[ReactFlowAdapterV2] Missing ViewState geometry for node ${nodeId}`);
    }

    // Fallback to ReactFlow (only if strictGeometry is false)
    return this.getReactFlowBounds(nodeId);
  }

  private getReactFlowBounds(nodeId: string): Bounds | null {
    const nodes = this.reactFlowInstance.getNodes();
    const node = nodes.find(n => n.id === nodeId);
    
    if (!node) return null;

    // Calculate absolute position from ReactFlow node
    let worldPos = { x: node.position.x, y: node.position.y };
    
    // If node has parent, convert relative to absolute
    if ((node as any).parentId) {
      const parent = nodes.find(n => n.id === (node as any).parentId);
      if (parent) {
        const parentWorldPos = this.getReactFlowAbsolutePosition(parent, nodes);
        worldPos = CoordinateService.toWorldFromRelative(node.position, parentWorldPos);
      }
    }

    // Extract dimensions
    const width = (node.data as any)?.width ?? (node.style as any)?.width ?? 96;
    const height = (node.data as any)?.height ?? (node.style as any)?.height ?? 96;

    return {
      x: worldPos.x,
      y: worldPos.y,
      w: typeof width === 'number' ? width : 96,
      h: typeof height === 'number' ? height : 96,
    };
  }

  private getReactFlowAbsolutePosition(node: Node, allNodes: Node[]): Point {
    let worldPos = { x: node.position.x, y: node.position.y };
    
    if ((node as any).parentId) {
      const parent = allNodes.find(n => n.id === (node as any).parentId);
      if (parent) {
        const parentWorldPos = this.getReactFlowAbsolutePosition(parent, allNodes);
        worldPos = CoordinateService.toWorldFromRelative(node.position, parentWorldPos);
      }
    }

    return worldPos;
  }
}

/**
 * Factory function to create ReactFlow adapter
 */
export function createReactFlowAdapter(
  reactFlowInstance: ReactFlowInstance, 
  config?: CanvasAdapterConfig
): ReactFlowAdapterV2 {
  return new ReactFlowAdapterV2(reactFlowInstance, config);
}
