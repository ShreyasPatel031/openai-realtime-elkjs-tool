import React from 'react';
import { Handle, Position } from 'reactflow';
import { baseHandleStyle } from './graph/handles';

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
  // Style for the outer container that ReactFlow adds
  const groupStyle = {
    // Restore original background color but keep transparency with alpha
    background: 'rgba(240, 240, 240, 0.6)',
    border: selected ? '2px dashed #6c757d' : '1px dashed #999',
    borderRadius: '8px',
    // Reduce padding to eliminate extra space
    padding: '0px',
    width: '100%',
    height: '100%',
    fontSize: '12px',
    position: 'relative' as const,
    color: '#333',
    pointerEvents: 'all' as const,
    zIndex: 1,
    boxSizing: 'border-box' as const,
    // Override any internal borders that ReactFlow might add
    overflow: 'visible'
  };

  return (
    <div style={groupStyle}>
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
        color: '#333',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        padding: '2px 4px',
        borderRadius: '3px',
        zIndex: 10
      }}>
        {data.label}
      </div>
    </div>
  );
};

export default GroupNode; 