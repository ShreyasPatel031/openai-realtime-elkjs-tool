/**
 * Edge collision detection utilities
 * Tests if a rendered edge path intersects with node rectangles
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Test if a line segment intersects with a rectangle
 */
export function lineIntersectsRect(p1: Point, p2: Point, rect: Rectangle): boolean {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  // First, check if the segment lies completely outside on one side
  if ((p1.x < left && p2.x < left) || (p1.x > right && p2.x > right)) {
    return false;
  }
  if ((p1.y < top && p2.y < top) || (p1.y > bottom && p2.y > bottom)) {
    return false;
  }

  // If both points are inside, treat as non-intersection to allow hugging edges
  const inside =
    p1.x > left && p1.x < right && p1.y > top && p1.y < bottom &&
    p2.x > left && p2.x < right && p2.y > top && p2.y < bottom;
  if (inside) {
    return false;
  }

  // Otherwise, check actual edge intersections with a tiny epsilon
  const epsilon = 1e-6;
  const horizontal = [
    lineIntersectsLine(p1, p2, { x: left - epsilon, y: top }, { x: right + epsilon, y: top }),
    lineIntersectsLine(p1, p2, { x: left - epsilon, y: bottom }, { x: right + epsilon, y: bottom }),
  ];
  if (horizontal.some(Boolean)) return true;

  const vertical = [
    lineIntersectsLine(p1, p2, { x: left, y: top - epsilon }, { x: left, y: bottom + epsilon }),
    lineIntersectsLine(p1, p2, { x: right, y: top - epsilon }, { x: right, y: bottom + epsilon }),
  ];
  return vertical.some(Boolean);
}

/**
 * Test if two line segments intersect
 */
export function lineIntersectsLine(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(denom) < 1e-10) return false; // parallel lines
  
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;
  const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / denom;
  
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Test if an edge path (with bend points) collides with any nodes
 */
export function testEdgeCollision(
  startPoint: Point,
  endPoint: Point,
  bendPoints: Point[],
  nodes: Rectangle[]
): { collides: boolean; details: string[] } {
  // Create full path: start → bend points → end
  const fullPath = [startPoint, ...bendPoints, endPoint];
  
  const details: string[] = [];
  let collides = false;
  
  // Check each path segment against each node
  for (let i = 0; i < fullPath.length - 1; i++) {
    const p1 = fullPath[i];
    const p2 = fullPath[i + 1];
    
    for (let j = 0; j < nodes.length; j++) {
      const node = nodes[j];
      
      if (lineIntersectsRect(p1, p2, node)) {
        details.push(`❌ Segment ${i} (${p1.x.toFixed(1)},${p1.y.toFixed(1)}) → (${p2.x.toFixed(1)},${p2.y.toFixed(1)}) intersects node ${j} at (${node.x},${node.y})`);
        collides = true;
      }
    }
  }
  
  if (!collides) {
    details.push('✅ Edge successfully routes around all nodes');
  }
  
  return { collides, details };
}

/**
 * Segment overlap detection and separation utilities
 * These work independently of libavoid to ensure parallel edges don't overlap
 */

export interface Segment {
  edgeId: string;
  index: number; // segment index within the edge
  p1: Point;
  p2: Point;
  isVertical: boolean;
  isHorizontal: boolean;
  fixedCoord: number; // x for vertical, y for horizontal
  minVar: number; // min of variable coord
  maxVar: number; // max of variable coord
}

/**
 * Extract segments from a path (array of points)
 */
export function extractSegments(edgeId: string, path: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    const isVertical = dx < 1 && dy > 1;
    const isHorizontal = dy < 1 && dx > 1;
    
    segments.push({
      edgeId,
      index: i,
      p1,
      p2,
      isVertical,
      isHorizontal,
      fixedCoord: isVertical ? p1.x : p1.y,
      minVar: isVertical ? Math.min(p1.y, p2.y) : Math.min(p1.x, p2.x),
      maxVar: isVertical ? Math.max(p1.y, p2.y) : Math.max(p1.x, p2.x),
    });
  }
  return segments;
}

/**
 * Check if two segments overlap (share the same fixed coordinate and overlapping variable range)
 */
export function segmentsOverlap(s1: Segment, s2: Segment, tolerance: number = 2): boolean {
  // Must be same orientation
  if (s1.isVertical !== s2.isVertical) return false;
  if (s1.isHorizontal !== s2.isHorizontal) return false;
  if (!s1.isVertical && !s1.isHorizontal) return false;
  
  // Must have same fixed coordinate (within tolerance)
  if (Math.abs(s1.fixedCoord - s2.fixedCoord) > tolerance) return false;
  
  // Must have overlapping variable range
  const overlap = Math.min(s1.maxVar, s2.maxVar) - Math.max(s1.minVar, s2.minVar);
  return overlap > tolerance;
}

/**
 * Find all overlapping segment pairs across multiple edges
 */
export function findOverlappingSegments(
  edgePaths: Map<string, Point[]>,
  tolerance: number = 2
): Array<{ seg1: Segment; seg2: Segment; overlapLength: number }> {
  const allSegments: Segment[] = [];
  
  edgePaths.forEach((path, edgeId) => {
    allSegments.push(...extractSegments(edgeId, path));
  });
  
  const overlaps: Array<{ seg1: Segment; seg2: Segment; overlapLength: number }> = [];
  
  for (let i = 0; i < allSegments.length; i++) {
    for (let j = i + 1; j < allSegments.length; j++) {
      const s1 = allSegments[i];
      const s2 = allSegments[j];
      
      // Skip segments from the same edge
      if (s1.edgeId === s2.edgeId) continue;
      
      if (segmentsOverlap(s1, s2, tolerance)) {
        const overlapLength = Math.min(s1.maxVar, s2.maxVar) - Math.max(s1.minVar, s2.minVar);
        overlaps.push({ seg1: s1, seg2: s2, overlapLength });
      }
    }
  }
  
  return overlaps;
}

/**
 * Separate overlapping segments by nudging them apart
 * Returns new paths with adjusted coordinates
 */
export function separateOverlappingSegments(
  edgePaths: Map<string, Point[]>,
  spacing: number = 8,
  tolerance: number = 2
): Map<string, Point[]> {
  const result = new Map<string, Point[]>();
  
  // Deep copy all paths
  edgePaths.forEach((path, edgeId) => {
    result.set(edgeId, path.map(p => ({ ...p })));
  });
  
  const overlaps = findOverlappingSegments(edgePaths, tolerance);
  
  // Group overlapping segments by their fixed coordinate and orientation
  const overlapGroups = new Map<string, Set<string>>();
  
  overlaps.forEach(({ seg1, seg2 }) => {
    const key = `${seg1.isVertical ? 'v' : 'h'}:${Math.round(seg1.fixedCoord)}`;
    if (!overlapGroups.has(key)) {
      overlapGroups.set(key, new Set());
    }
    overlapGroups.get(key)!.add(seg1.edgeId);
    overlapGroups.get(key)!.add(seg2.edgeId);
  });
  
  // For each group, spread the edges apart
  overlapGroups.forEach((edgeIds, key) => {
    const isVertical = key.startsWith('v');
    const fixedCoord = parseInt(key.split(':')[1]);
    const edgeArray = Array.from(edgeIds).sort();
    const count = edgeArray.length;
    
    if (count < 2) return;
    
    edgeArray.forEach((edgeId, idx) => {
      const offset = (idx - (count - 1) / 2) * spacing;
      const path = result.get(edgeId)!;
      
      // Adjust all points that are on or near this fixed coordinate
      path.forEach(point => {
        if (isVertical) {
          if (Math.abs(point.x - fixedCoord) <= tolerance) {
            point.x = fixedCoord + offset;
          }
        } else {
          if (Math.abs(point.y - fixedCoord) <= tolerance) {
            point.y = fixedCoord + offset;
          }
        }
      });
    });
  });
  
  return result;
}

