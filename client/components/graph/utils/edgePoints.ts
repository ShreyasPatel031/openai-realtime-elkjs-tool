// utils/elk/edgePoints.ts
import { AbsMap } from "./elk/absPositions";

export interface NodeEdgePoints { 
  left: any[]; 
  right: any[]; 
  top: any[]; 
  bottom: any[];
  // Add index signature to allow dynamic access with string keys
  [key: string]: any[];
}
export type EdgePointMap = Record<string, NodeEdgePoints>;

/** Determines which side of the node a point is closest to */
function determineConnectionSide(nodePosition: {x: number, y: number}, nodeWidth: number, nodeHeight: number, connectionPoint: {x: number, y: number}) {
  
  // Calculate the center of the node
  const centerX = nodePosition.x + nodeWidth / 2;
  const centerY = nodePosition.y + nodeHeight / 2;
  
  // Calculate distances from the connection point to each edge of the node
  const distToLeft = Math.abs(connectionPoint.x - nodePosition.x);
  const distToRight = Math.abs(connectionPoint.x - (nodePosition.x + nodeWidth));
  const distToTop = Math.abs(connectionPoint.y - nodePosition.y);
  const distToBottom = Math.abs(connectionPoint.y - (nodePosition.y + nodeHeight));
  
  // Find the minimum distance
  const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
  
  // After computing minDist, if two sides tie, prefer the one with the larger delta
  // toward the outside (e.g., bottom over right for points below center on BR).
  const tiedSides = [];
  if (minDist === distToLeft) tiedSides.push("left");
  if (minDist === distToRight) tiedSides.push("right");
  if (minDist === distToTop) tiedSides.push("top");
  if (minDist === distToBottom) tiedSides.push("bottom");
  
  // If only one side, return it
  if (tiedSides.length === 1) {
    return tiedSides[0];
  }
  
  // Handle ties by preferring the side that's more "outward" from center
  const deltaX = connectionPoint.x - centerX;
  const deltaY = connectionPoint.y - centerY;
  
  // 🔎 DEBUG: side decision (filters to bottom corners to avoid noise)
  const nearBottom = Math.abs(connectionPoint.y - (nodePosition.y + nodeHeight)) <= 12;
  const nearRight  = Math.abs(connectionPoint.x - (nodePosition.x + nodeWidth)) <= 12;
  const nearLeft   = Math.abs(connectionPoint.x - nodePosition.x) <= 12;

  if (nearBottom && (nearRight || nearLeft)) {
    console.warn('[SIDE-DECISION]', {
      nodePos: { ...nodePosition, width: nodeWidth, height: nodeHeight },
      connectionPoint,
      dists: {
        left: Math.abs(connectionPoint.x - nodePosition.x),
        right: Math.abs(connectionPoint.x - (nodePosition.x + nodeWidth)),
        top: Math.abs(connectionPoint.y - nodePosition.y),
        bottom: Math.abs(connectionPoint.y - (nodePosition.y + nodeHeight)),
      },
      tiedSides,
      deltaFromCenter: { x: deltaX, y: deltaY },
    });
  }

  // Dev-only sanity: if we are closer/equal to bottom than right/left, prefer bottom.
  const bottomCloserOrEqual = distToBottom <= Math.min(distToLeft, distToRight, distToTop);
  if (nearBottom && bottomCloserOrEqual && tiedSides.includes('right')) {
    console.warn('[SIDE-ASSERT] Picked RIGHT near bottom; likely tie-break issue', { connectionPoint, nodePosition, nodeWidth, nodeHeight });
  }
  if (nearBottom && bottomCloserOrEqual && tiedSides.includes('left')) {
    console.warn('[SIDE-ASSERT] Picked LEFT near bottom; likely tie-break issue', { connectionPoint, nodePosition, nodeWidth, nodeHeight });
  }
  
  // For corner ties, prefer the side that aligns with the larger offset from center
  if (tiedSides.includes("bottom") && tiedSides.includes("right") && deltaY > 0 && deltaX > 0) {
    return Math.abs(deltaY) > Math.abs(deltaX) ? "bottom" : "right";
  }
  if (tiedSides.includes("bottom") && tiedSides.includes("left") && deltaY > 0 && deltaX < 0) {
    return Math.abs(deltaY) > Math.abs(deltaX) ? "bottom" : "left";
  }
  if (tiedSides.includes("top") && tiedSides.includes("right") && deltaY < 0 && deltaX > 0) {
    return Math.abs(deltaY) > Math.abs(deltaX) ? "top" : "right";
  }
  if (tiedSides.includes("top") && tiedSides.includes("left") && deltaY < 0 && deltaX < 0) {
    return Math.abs(deltaY) > Math.abs(deltaX) ? "top" : "left";
  }
  
  // 🔎 DEBUG — log distances to see tie-breaking behavior
  console.warn('🎯 [determineConnectionSide]', {
    nodePos: nodePosition,
    nodeWidth,
    nodeHeight,
    connectionPoint,
    dists: {
      left: distToLeft,
      right: distToRight,
      top: distToTop,
      bottom: distToBottom,
    },
    minDist,
    chosen: (minDist === distToLeft && 'left')
         || (minDist === distToRight && 'right')
         || (minDist === distToTop && 'top')
         || (minDist === distToBottom && 'bottom'),
  });

  // Return the first tied side as fallback
  return tiedSides[0];
}

/** Gathers connection + bend points using absolute positions. */
export function buildNodeEdgePoints(graph: any, abs: AbsMap): EdgePointMap {
  const map: EdgePointMap = {};

  const add = (nodeId: string, side: "left" | "right" | "top" | "bottom", entry: any) => {
    // Initialize the node in the map if it doesn't exist
    if (!map[nodeId]) {
      map[nodeId] = { left: [], right: [], top: [], bottom: [] };
    }
    map[nodeId][side].push(entry);
  };

  // First pass: collect all nodes with their dimensions (use real sizes)
  const nodeDimensions = new Map();
  const collectNodeDimensions = (node: any) => {
    const dimensions = {
      width:  node.width  ?? node.measuredWidth  ?? node.layout?.width  ?? node.size?.width  ?? 80,
      height: node.height ?? node.measuredHeight ?? node.layout?.height ?? node.size?.height ?? 40,
    };
    
    
    nodeDimensions.set(node.id, dimensions);
    (node.children || []).forEach(collectNodeDimensions);
  };
  collectNodeDimensions(graph);

  const visitContainerEdges = (container: any) => {
        (container.edges || []).forEach((e: any) => {
      const sec = e.sections?.[0];
      if (!sec) {
        console.warn('❌ [buildNodeEdgePoints] No sections[0] for edge:', e.id);
        return;
      }

      const { x: ox, y: oy } = abs[container.id] ?? { x: 0, y: 0 };

      if (e.sources?.[0] && sec.startPoint) {
        const sourceNodeId = e.sources[0];
        const startPointX = ox + sec.startPoint.x;
        const startPointY = oy + sec.startPoint.y;
        const sourceNodePos = abs[sourceNodeId] || { x: 0, y: 0 };
        const sourceNodeDim = nodeDimensions.get(sourceNodeId) || { width: 80, height: 40 };
        
        
        // Determine which side of the source node the connection is coming from
        const sourceSide = determineConnectionSide(
          sourceNodePos,
          sourceNodeDim.width,
          sourceNodeDim.height,
          { x: startPointX, y: startPointY }
        );
        
        
        
        add(sourceNodeId, sourceSide, {
          edgeId: e.id,
          x: startPointX,
          y: startPointY,
          originalX: sec.startPoint.x,
          originalY: sec.startPoint.y,
          side: sourceSide
        });
      }

      if (e.targets?.[0] && sec.endPoint) {
        const targetNodeId = e.targets[0];
        const endPointX = ox + sec.endPoint.x;
        const endPointY = oy + sec.endPoint.y;
        const targetNodePos = abs[targetNodeId] || { x: 0, y: 0 };
        const targetNodeDim = nodeDimensions.get(targetNodeId) || { width: 80, height: 40 };
        
        
        // Determine which side of the target node the connection is going to
        const targetSide = determineConnectionSide(
          targetNodePos,
          targetNodeDim.width,
          targetNodeDim.height,
          { x: endPointX, y: endPointY }
        );
        
        add(targetNodeId, targetSide, {
          edgeId: e.id,
          x: endPointX,
          y: endPointY,
          originalX: sec.endPoint.x,
          originalY: sec.endPoint.y,
          side: targetSide
        });
      }

      // bendPoints → store absolute coords next to the edge object for later
      if (sec.bendPoints?.length) {
        e.absoluteBendPoints = sec.bendPoints.map((p: any, index: number) => {
          const absBendX = ox + p.x;
          const absBendY = oy + p.y;
          
          // For first and last bendpoints in edges with multiple bendpoints
          if (sec.bendPoints.length >= 2) {
            if (index === 0 && e.sources && e.sources.length > 0) {
              const sourceId = e.sources[0];
              const sourceSide = map[sourceId]?.right[0]?.side || 'right';
              const sourcePoint = map[sourceId]?.[sourceSide][0];
              if (sourcePoint) {
                return {
                  index,
                  x: absBendX,
                  y: sourcePoint.y,
                  originalX: p.x,
                  originalY: p.y
                };
              }
            }
            
            if (index === sec.bendPoints.length - 1 && e.targets && e.targets.length > 0) {
              const targetId = e.targets[0];
              const targetSide = map[targetId]?.left[0]?.side || 'left';
              const targetPoint = map[targetId]?.[targetSide][0];
              if (targetPoint) {
                return {
                  index,
                  x: absBendX,
                  y: targetPoint.y,
                  originalX: p.x,
                  originalY: p.y
                };
              }
            }
          }
          
          return {
            index,
            x: absBendX,
            y: absBendY,
            originalX: p.x,
            originalY: p.y
          };
        });
      }
    });

    (container.children || []).forEach(visitContainerEdges);
  };

  visitContainerEdges(graph);
  return map;
} 