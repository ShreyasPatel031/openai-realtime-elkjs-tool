import React from 'react';
import { Node } from 'reactflow';
import { DragDropEdgeHandler } from './DragDropEdgeHandler';
import { NodeDragHandler } from './NodeDragHandler';
import CustomNode from '../CustomNode';

interface EnhancedCustomNodeProps {
  data: {
    label: string;
    icon?: string;
    width?: number;
    height?: number;
    leftHandles?: string[];
    rightHandles?: string[];
    topHandles?: string[];
    bottomHandles?: string[];
    isEditing?: boolean;
    hoverTarget?: boolean; // Add hover target flag
  };
  id: string;
  selected?: boolean;
  onLabelChange: (id: string, label: string) => void;
  onGraphChange?: (newGraph: any) => void;
  rawGraph?: any;
  position?: { x: number; y: number };
  width?: number;
  height?: number;
  type?: string;
  onNodeDragStart?: (nodeId: string) => void;
  onNodeDragEnd?: (nodeId: string, dropPosition: { x: number, y: number }) => void;
  onNodeDragMove?: (nodeId: string, position: { x: number, y: number }) => void;
}

/**
 * Enhanced CustomNode that adds drag-to-connect functionality
 * Wraps the existing CustomNode with DragDropEdgeHandler
 */
const EnhancedCustomNode: React.FC<EnhancedCustomNodeProps> = ({
  data,
  id,
  selected = false,
  onLabelChange,
  onGraphChange,
  rawGraph,
  position,
  width,
  height,
  type,
  onNodeDragStart,
  onNodeDragEnd,
  onNodeDragMove
}) => {
  // Get hover state directly from node data (set by InteractiveCanvas)
  const isHoverTarget = !!data.hoverTarget;
  
  // Apply hover styling to the node - more visible green highlighting
  const nodeStyle = {
    transform: isHoverTarget ? 'scale(1.02)' : 'scale(1)',
    transition: 'transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease, border-color 120ms ease',
    filter: isHoverTarget ? 'brightness(1.05)' : 'brightness(1)',
    backgroundColor: isHoverTarget ? '#F0FDF4' : 'transparent',
    border: isHoverTarget ? '2px solid #10B981' : 'none',
    borderRadius: isHoverTarget ? '8px' : '0px',
    boxShadow: isHoverTarget 
      ? '0 0 0 4px rgba(16,185,129,0.15), 0 8px 24px rgba(0,0,0,0.12)' 
      : 'none',
    padding: isHoverTarget ? '4px' : '0px',
  };

  // Handle ghost drag start (similar to reference example)
  const onPointerDown = (ev: React.PointerEvent) => {
    // Don't start ghost drag when grabbing an edge handle
    const targetEl = ev.target as HTMLElement;
    if (targetEl.closest('.react-flow__handle')) return;
    
    // Only start ghost drag and prevent default on actual drag (not click)
    if (data?.startGhostDrag) {
      // Store the element reference
      const element = ev.currentTarget as HTMLElement;
      const startPos = { x: ev.clientX, y: ev.clientY };
      
      const onPointerMove = (moveEv: PointerEvent) => {
        const distance = Math.sqrt(
          Math.pow(moveEv.clientX - startPos.x, 2) + 
          Math.pow(moveEv.clientY - startPos.y, 2)
        );
        
        // If moved more than 5px, it's a drag
        if (distance > 5) {
          element.setPointerCapture?.(ev.pointerId);
          data.startGhostDrag(id, ev as unknown as PointerEvent);
          
          // Clean up move listener
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          
          // Prevent ReactFlow default drag
          ev.stopPropagation();
          ev.preventDefault();
        }
      };
      
      const onPointerUp = () => {
        // Clean up listeners
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        // If we get here, it was just a click - let ReactFlow handle selection
      };
      
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }
  };

  // Base custom node component with pointer down handler
  const customNodeComponent = (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: 'relative',
        userSelect: 'none',
        cursor: 'grab',
        ...nodeStyle
      }}
    >
      <CustomNode
        data={data}
        id={id}
        selected={selected}
        onLabelChange={onLabelChange}
      />
    </div>
  );

  // If no graph change handler provided, just return with ghost drag
  if (!onGraphChange || !rawGraph) {
    return customNodeComponent;
  }

  // Full enhanced node with edge creation capabilities
  return (
    <DragDropEdgeHandler
      nodeId={id}
      isSelected={selected}
      onGraphChange={onGraphChange}
      rawGraph={rawGraph}
    >
      {customNodeComponent}
    </DragDropEdgeHandler>
  );
};

export default EnhancedCustomNode;

