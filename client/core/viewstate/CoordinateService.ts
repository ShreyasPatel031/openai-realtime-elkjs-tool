/**
 * CoordinateService - Pure coordinate transformation functions
 * Part of CP1: Library-agnostic coordinate system unification
 * 
 * All coordinate transforms go through this service to enable canvas library swapping.
 * World coordinates (absolute) are the single source of truth in ViewState.
 */

export type Point = { x: number; y: number };
export type Bounds = { x: number; y: number; w: number; h: number };

/**
 * Grid configuration for snap-to-grid operations
 */
export const GRID_CONFIG = {
  SIZE: 16, // Keep in sync with canvas grid
} as const;

/**
 * Debug configuration - enable coordinate transform logging
 */
export const DEBUG_CONFIG = {
  COORDINATE_TRANSFORMS: process.env.NODE_ENV === 'development', // Only in dev
} as const;

/**
 * Pure coordinate transformation functions
 */
export class CoordinateService {
  /**
   * Convert world (absolute) position to relative position within a parent
   * @param childWorldPos - Child's absolute world position
   * @param parentWorldPos - Parent's absolute world position
   * @returns Relative position of child within parent
   */
  static toRelativeFromWorld(childWorldPos: Point, parentWorldPos: Point): Point {
    const result = {
      x: childWorldPos.x - parentWorldPos.x,
      y: childWorldPos.y - parentWorldPos.y,
    };
    
    if (DEBUG_CONFIG.COORDINATE_TRANSFORMS) {
      console.log('[🎯COORD] CoordinateService.toRelativeFromWorld:', {
        childWorld: `${childWorldPos.x},${childWorldPos.y}`,
        parentWorld: `${parentWorldPos.x},${parentWorldPos.y}`,
        relative: `${result.x},${result.y}`,
      });
    }
    
    return result;
  }

  /**
   * Convert relative position within parent to world (absolute) position
   * @param childRelativePos - Child's relative position within parent
   * @param parentWorldPos - Parent's absolute world position
   * @returns Absolute world position of child
   */
  static toWorldFromRelative(childRelativePos: Point, parentWorldPos: Point): Point {
    const result = {
      x: childRelativePos.x + parentWorldPos.x,
      y: childRelativePos.y + parentWorldPos.y,
    };
    
    if (DEBUG_CONFIG.COORDINATE_TRANSFORMS) {
      console.log('[🎯COORD] CoordinateService.toWorldFromRelative:', {
        childRelative: `${childRelativePos.x},${childRelativePos.y}`,
        parentWorld: `${parentWorldPos.x},${parentWorldPos.y}`,
        world: `${result.x},${result.y}`,
      });
    }
    
    return result;
  }

  /**
   * Convert ELK node position to world coordinates
   * ELK nodes have relative x,y within their parent scope
   * @param elkNode - ELK node with x, y properties
   * @param parentWorldPos - Parent's absolute world position (0,0 for root)
   * @returns Absolute world position
   */
  static toWorldFromELK(elkNode: { x?: number; y?: number }, parentWorldPos: Point = { x: 0, y: 0 }): Point {
    return {
      x: (elkNode.x ?? 0) + parentWorldPos.x,
      y: (elkNode.y ?? 0) + parentWorldPos.y,
    };
  }

  /**
   * Convert world position to ELK relative position within parent
   * @param worldPos - Absolute world position
   * @param parentWorldPos - Parent's absolute world position
   * @returns ELK-compatible relative position
   */
  static toELKFromWorld(worldPos: Point, parentWorldPos: Point = { x: 0, y: 0 }): Point {
    return this.toRelativeFromWorld(worldPos, parentWorldPos);
  }

  /**
   * Snap value to grid
   * @param value - Numeric value to snap
   * @returns Grid-aligned value
   */
  static snapValue(value: number): number {
    return Math.round(value / GRID_CONFIG.SIZE) * GRID_CONFIG.SIZE;
  }

  /**
   * Snap point to grid
   * @param point - Point to snap
   * @returns Grid-aligned point
   */
  static snapPoint(point: Point): Point {
    const result = {
      x: this.snapValue(point.x),
      y: this.snapValue(point.y),
    };
    
    if (DEBUG_CONFIG.COORDINATE_TRANSFORMS) {
      console.log('[🎯COORD] CoordinateService.snapPoint:', {
        original: `${point.x},${point.y}`,
        snapped: `${result.x},${result.y}`,
        gridSize: GRID_CONFIG.SIZE,
        changed: point.x !== result.x || point.y !== result.y,
      });
    }
    
    return result;
  }

  /**
   * Snap bounds to grid
   * @param bounds - Bounds to snap
   * @returns Grid-aligned bounds
   */
  static snapBounds(bounds: Bounds): Bounds {
    return {
      x: this.snapValue(bounds.x),
      y: this.snapValue(bounds.y),
      w: Math.max(GRID_CONFIG.SIZE, this.snapValue(bounds.w)),
      h: Math.max(GRID_CONFIG.SIZE, this.snapValue(bounds.h)),
    };
  }

  /**
   * Quantize size to grid (ensures both start and end positions land on grid)
   * @param size - Size to quantize
   * @returns Grid-aligned size (minimum one grid unit)
   */
  static quantizeSize(size: number): number {
    return Math.max(GRID_CONFIG.SIZE, Math.round(size / GRID_CONFIG.SIZE) * GRID_CONFIG.SIZE);
  }

  /**
   * Calculate bounds from position and size
   * @param pos - Position
   * @param size - Size
   * @returns Bounds object
   */
  static createBounds(pos: Point, size: { w: number; h: number }): Bounds {
    return {
      x: pos.x,
      y: pos.y,
      w: size.w,
      h: size.h,
    };
  }

  /**
   * Check if point is within bounds
   * @param point - Point to check
   * @param bounds - Bounds to check against
   * @returns True if point is within bounds
   */
  static isPointInBounds(point: Point, bounds: Bounds): boolean {
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.w &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.h
    );
  }

  /**
   * Check if inner bounds are fully contained within outer bounds
   * @param inner - Inner bounds
   * @param outer - Outer bounds
   * @returns True if inner is fully contained in outer
   */
  static isFullyContained(inner: Bounds, outer: Bounds): boolean {
    return (
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.w <= outer.x + outer.w &&
      inner.y + inner.h <= outer.y + outer.h
    );
  }

  /**
   * Calculate distance between two points
   * @param a - First point
   * @param b - Second point
   * @returns Euclidean distance
   */
  static distance(a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
