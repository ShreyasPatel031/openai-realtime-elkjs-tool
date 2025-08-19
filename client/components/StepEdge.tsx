import React from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps } from 'reactflow';
import { getEdgeStyle } from './graph/styles/canvasStyles';

const StepEdge: React.FC<EdgeProps> = ({ 
  id, 
  sourceX, 
  sourceY, 
  targetX, 
  targetY, 
  label,
  data,
  style = {}, 
  markerEnd,
  selected = false
}) => {
  let edgePath = '';
  
  // For edge path calculations only (used in path fallback)
  const midX = sourceX + (targetX - sourceX) / 2;
  
  /* ------------------------------------------------------ */
  /*   Label text & coordinates                           */
  /* ------------------------------------------------------ */
  const edgeLabel = label || data?.labelText;

  // absolute coordinates from ELK layout (if available)
  const labelPos = data?.labelPos;          // { x, y } | undefined

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
      edgePath = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
    }
  } 
  else {
    // No bend points, use default step edge
    edgePath = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
  }
  
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          ...getEdgeStyle(selected, false), // Use centralized styling
        }}
        markerEnd={markerEnd}
      />
      
      {edgeLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: labelPos 
                ? `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`
                : `translate(-50%, -50%) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`,
              background: 'white',
              padding: '2px 6px',
              border: '1px solid #888',
              borderRadius: 4,
              fontSize: 11,
              fontFamily: 'sans-serif',
              pointerEvents: 'all',
              zIndex: 5000
            }}
          >
            {edgeLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default StepEdge; 