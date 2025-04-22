import React from 'react';
import { BaseEdge } from 'reactflow';

interface StepEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  data?: {
    bendPoints?: { x: number; y: number }[];
  };
  style?: React.CSSProperties;
  markerEnd?: any;
}

const StepEdge: React.FC<StepEdgeProps> = ({ 
  id, 
  sourceX, 
  sourceY, 
  targetX, 
  targetY, 
  data, 
  style = {}, 
  markerEnd 
}) => {
  let edgePath = '';
  
  // Check if we have bend points
  if (data?.bendPoints && data.bendPoints.length > 0) {
    const bendPoints = data.bendPoints;
    
    if (bendPoints.length === 2) {
      // For 2 bend points, use the first bend point's x as the fixed x coordinate
      const fixedX = bendPoints[0].x;
      edgePath = `M ${sourceX} ${sourceY} L ${fixedX} ${sourceY} L ${fixedX} ${targetY} L ${targetX} ${targetY}`;
    } 
    else if (bendPoints.length > 2) {
      // For more than 2 bend points, keep intermediate points fixed
      // and only allow first and last segments to move
      
      // Add source point as the starting point and target as the ending point
      const points = [{ x: sourceX, y: sourceY }, ...bendPoints, { x: targetX, y: targetY }];
      
      // Build path segments
      let pathCommands = [`M ${sourceX} ${sourceY}`]; // Start at source
      
      for (let i = 1; i < points.length; i++) {
        const prev = points[i-1];
        const curr = points[i];
        
        if (i === 1) {
          // First segment - horizontal from source to first bend point
          pathCommands.push(`L ${curr.x} ${sourceY}`);
        } else if (i === points.length - 1) {
          // Last segment - horizontal to target
          // Use the penultimate point's x for the vertical segment
          const penultimate = points[points.length - 2];
          pathCommands.push(`L ${penultimate.x} ${targetY}`);
          pathCommands.push(`L ${targetX} ${targetY}`);
        } else if (i !== points.length - 2) { // Skip the penultimate point
          // Intermediate segments - keep fixed
          pathCommands.push(`L ${curr.x} ${curr.y}`);
        }
      }
      
      // Join all path commands
      edgePath = pathCommands.join(' ');
    }
    else {
      // For any unexpected number of bend points, fall back to a simple step edge
      const midX = sourceX + (targetX - sourceX) / 2;
      edgePath = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
    }
  } 
  else {
    // No bend points, use default step edge
    const midX = sourceX + (targetX - sourceX) / 2;
    edgePath = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
  }
  
  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        ...style,
        stroke: '#999',
        strokeWidth: 1.5
      }}
      markerEnd={markerEnd}
    />
  );
};

export default StepEdge; 