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

  // For invisible handles that still support connections
  const handleOpacity = 0.01;

  return (
    <div style={groupStyle}>
      {/* Add standard connection handles (invisible but functional) */}
      <Handle
        type="target"
        position={Position.Left}
        id="left-0"
        style={{ 
          background: '#555',
          opacity: handleOpacity,
          zIndex: 5000
        }}
      />
      
      <Handle
        type="source"
        position={Position.Right}
        id="right-0"
        style={{ 
          background: '#555',
          opacity: handleOpacity,
          zIndex: 5000
        }}
      />
      
      {/* Add dynamic handles based on the data */}
      {data.leftHandles && data.leftHandles.map((yPos: string, index: number) => (
        <Handle
          key={`left-${index}`}
          type="target"
          position={Position.Left}
          id={`left-${index}`}
          style={{ 
            top: yPos, 
            background: '#555',
            opacity: handleOpacity,
            zIndex: 5000
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
            top: yPos, 
            background: '#555',
            opacity: handleOpacity,
            zIndex: 5000
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