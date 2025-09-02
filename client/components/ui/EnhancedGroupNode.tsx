import React from 'react';
import { DragDropEdgeHandler, useNodeHoverHighlight } from './DragDropEdgeHandler';
import GroupNode from '../GroupNode';

interface EnhancedGroupNodeProps {
  data: {
    label: string;
    icon?: string;
    groupIcon?: string;
    style?: string | {
      bg?: string;
      border?: string;
    };
    width?: number;
    height?: number;
    leftHandles?: string[];
    rightHandles?: string[];
    topHandles?: string[];
    bottomHandles?: string[];
    hoverTarget?: boolean; // Add hover target flag
  };
  id: string;
  selected?: boolean;
  isConnectable: boolean;
  onAddNode: (groupId: string) => void;
  onGraphChange?: (newGraph: any) => void;
  rawGraph?: any;
}

/**
 * Enhanced GroupNode that adds drag-to-connect functionality
 * Wraps the existing GroupNode with DragDropEdgeHandler
 */
const EnhancedGroupNode: React.FC<EnhancedGroupNodeProps> = ({
  data,
  id,
  selected = false,
  isConnectable,
  onAddNode,
  onGraphChange,
  rawGraph
}) => {
  // Use hover highlighting hook
  const isHoverTarget = useNodeHoverHighlight(id);
  
  // Merge hover state with existing data
  const enhancedData = {
    ...data,
    hoverTarget: isHoverTarget
  };

  // Apply hover styling to the group node
  const nodeStyle = {
    transform: isHoverTarget ? 'scale(1.01)' : 'scale(1)',
    transition: 'transform 150ms ease, box-shadow 150ms ease, filter 150ms ease',
    filter: isHoverTarget ? 'brightness(1.02) drop-shadow(0 4px 12px rgba(16, 185, 129, 0.2))' : 'brightness(1)',
    // Add green glow effect when hover target
    boxShadow: isHoverTarget 
      ? '0 0 0 2px rgba(16, 185, 129, 0.3), 0 4px 12px rgba(16, 185, 129, 0.15)' 
      : 'none',
  };

  // If no graph change handler provided, don't wrap with DragDropEdgeHandler
  if (!onGraphChange || !rawGraph) {
    return (
      <div style={nodeStyle}>
        <GroupNode
          data={enhancedData}
          id={id}
          selected={selected}
          isConnectable={isConnectable}
          onAddNode={onAddNode}
        />
      </div>
    );
  }

  return (
    <div style={nodeStyle}>
      <DragDropEdgeHandler
        nodeId={id}
        isSelected={selected}
        onGraphChange={onGraphChange}
        rawGraph={rawGraph}
      >
        <GroupNode
          data={enhancedData}
          id={id}
          selected={selected}
          isConnectable={isConnectable}
          onAddNode={onAddNode}
        />
      </DragDropEdgeHandler>
    </div>
  );
};

export default EnhancedGroupNode;

