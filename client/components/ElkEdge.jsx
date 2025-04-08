import { BaseEdge } from 'reactflow';

const ElkEdge = ({ id, sourceX, sourceY, targetX, targetY, data }) => {
  // If we have sections from the ELK graph, use them to create the path
  if (data?.sections && data.sections.length > 0) {
    const section = data.sections[0];
    
    // Start with the source point
    let path = `M ${sourceX} ${sourceY}`;
    
    // Add the section's start point
    path += ` L ${section.startPoint.x} ${section.startPoint.y}`;
    
    // Add bend points if they exist
    if (section.bendPoints && section.bendPoints.length > 0) {
      section.bendPoints.forEach((point) => {
        path += ` L ${point.x} ${point.y}`;
      });
    }
    
    // Add the section's end point
    path += ` L ${section.endPoint.x} ${section.endPoint.y}`;
    
    // End with the target point
    path += ` L ${targetX} ${targetY}`;
    
    return (
      <BaseEdge 
        id={id} 
        path={path}
        markerEnd="url(#arrow)"
        style={{ stroke: '#777', strokeWidth: 2 }}
      />
    );
  }
  
  // Fallback to a straight line if no sections
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  return (
    <BaseEdge 
      id={id} 
      path={path}
      markerEnd="url(#arrow)"
      style={{ stroke: '#777', strokeWidth: 2 }}
    />
  );
};

export default ElkEdge; 