import React from 'react';
import { Handle, Position } from 'reactflow';

interface GroupNodeProps {
  data: {
    label: string;
    width?: number;
    height?: number;
    leftHandles?: string[];
    rightHandles?: string[];
  };
  id: string;
  selected?: boolean;
}

// Shared handle style to avoid per-render object creation
const baseHandleStyle = {
  background: '#555',
  opacity: 0.01,
  zIndex: 5000
};

const GroupNode: React.FC<GroupNodeProps> = ({ data, id, selected }) => {
  const groupStyle = {
    background: 'rgba(240, 240, 240, 0.6)',
    border: selected ? '2px solid #6c757d' : '1px solid #ccc',
    borderRadius: '8px',
    padding: '10px',
    width: data.width || 200,
    height: data.height || 200,
    fontSize: '12px',
    position: 'relative' as const,
    color: '#333',
    pointerEvents: 'all' as const,
    zIndex: 1,
  };

  return (
    <div style={groupStyle}>
      {/* Add standard connection handles (invisible but functional) */}
      <Handle
        type="target"
        position={Position.Left}
        id="left-0"
        style={baseHandleStyle}
      />
      
      <Handle
        type="source"
        position={Position.Right}
        id="right-0"
        style={baseHandleStyle}
      />
      
      {/* Add dynamic handles based on the data */}
      {data.leftHandles && data.leftHandles.map((yPos: string, index: number) => (
        <Handle
          key={`left-${index}`}
          type="target"
          position={Position.Left}
          id={`left-${index}`}
          style={{ 
            ...baseHandleStyle,
            top: yPos
          }}
        />
      ))}
      
      {data.rightHandles && data.rightHandles.map((yPos: string, index: number) => (
        <Handle
          key={`right-${index}`}
          type="source"
          position={Position.Right}
          id={`right-${index}`}
          style={{ 
            ...baseHandleStyle,
            top: yPos
          }}
        />
      ))}
      
      {/* Node label */}
      <div style={{ 
        position: 'absolute',
        top: '5px',
        left: '5px',
        fontWeight: 'bold',
        fontSize: '14px',
        color: '#333'
      }}>
        {data.label}
      </div>
    </div>
  );
};

export default GroupNode; 