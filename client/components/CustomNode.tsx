import React from 'react';
import { Handle, Position } from 'reactflow';
import { baseHandleStyle } from './graph/handles';

interface CustomNodeProps {
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

const CustomNode: React.FC<CustomNodeProps> = ({ data, id, selected }) => {
  const { leftHandles = [], rightHandles = [] } = data;
  
  const nodeStyle = {
    background: selected ? '#f8f9fa' : 'white',
    border: selected ? '2px solid #6c757d' : '1px solid #ccc',
    borderRadius: '4px',
    padding: '10px',
    width: data.width || 80,
    height: data.height || 40,
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    fontSize: '12px',
    boxShadow: selected ? '0 0 5px rgba(0, 0, 0, 0.3)' : '0 1px 4px rgba(0, 0, 0, 0.1)',
    position: 'relative' as const,
    zIndex: selected ? 100 : 50,
    pointerEvents: 'all' as const
  };

  return (
    <div style={nodeStyle}>
      {/* Custom handle positions */}
      {leftHandles.map((yPos: string, index: number) => (
        <Handle
          key={`left-${index}`}
          type="target"
          position={Position.Left}
          id={`left-${index}`}
          style={{ 
            ...baseHandleStyle,
            position: 'absolute',
            top: yPos
          }}
        />
      ))}
      
      {rightHandles.map((yPos: string, index: number) => (
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
        padding: '2px 4px',
        fontSize: '12px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const
      }}>
        {data.label}
      </div>
    </div>
  );
};

export default CustomNode; 