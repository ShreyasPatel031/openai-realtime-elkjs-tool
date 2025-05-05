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
  
  // Return the side with the minimum distance
  if (minDist === distToLeft) return "left";
  if (minDist === distToRight) return "right";
  if (minDist === distToTop) return "top";
  if (minDist === distToBottom) return "bottom";
  
  // Fallback - should never happen
  return "right";
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

  // First pass: collect all nodes with their dimensions
  const nodeDimensions = new Map();
  const collectNodeDimensions = (node: any) => {
    nodeDimensions.set(node.id, {
      width: node.width || 80,
      height: node.height || 40
    });
    (node.children || []).forEach(collectNodeDimensions);
  };
  collectNodeDimensions(graph);

  const visitContainerEdges = (container: any) => {
    (container.edges || []).forEach((e: any) => {
      const sec = e.sections?.[0];
      if (!sec) return;

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