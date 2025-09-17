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

  // Debug: Check if startGhostDrag is in data
  console.log(`🔍 Group ${id} data:`, {
    hasStartGhostDrag: !!data?.startGhostDrag,
    dataKeys: Object.keys(data || {}),
    data: data
  });

  // Handle ghost drag start (same logic as EnhancedCustomNode)
  const onPointerDown = (ev: React.PointerEvent) => {
    console.log(`🎯 Group ${id} onPointerDown triggered`);
    
    // Don't start ghost drag when grabbing an edge handle
    const targetEl = ev.target as HTMLElement;
    if (targetEl.closest('.react-flow__handle')) {
      console.log(`🎯 Group ${id} - skipping, clicked on handle`);
      return;
    }
    
    // Only start ghost drag and prevent default on actual drag (not click)
    if (data?.startGhostDrag) {
      console.log(`🎯 Group ${id} - has startGhostDrag, setting up listeners`);
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
          console.log(`🎯 Group ${id} - starting ghost drag (distance: ${distance})`);
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
        console.log(`🎯 Group ${id} - pointer up, cleaning up listeners`);
        // Clean up listeners
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        // If we get here, it was just a click - let ReactFlow handle selection
      };
      
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    } else {
      console.log(`🎯 Group ${id} - no startGhostDrag function found in data`);
    }
  };

  // Minimal wrapper - just add pointer events, let outer wrapper handle dimensions
  const groupNodeComponent = (
    <div
      onPointerDown={onPointerDown}
      style={{
        cursor: 'grab',
        userSelect: 'none',
        // NO width/height - outer wrapper handles this
        // Add hover target effects only
        transform: isHoverTarget ? 'scale(1.01)' : 'scale(1)',
        filter: isHoverTarget ? 'brightness(1.02) drop-shadow(0 4px 12px rgba(16, 185, 129, 0.2))' : 'brightness(1)',
        transition: 'transform 150ms ease, filter 150ms ease',
      }}
    >
      <GroupNode
        data={enhancedData}
        id={id}
        selected={selected}
        isConnectable={isConnectable}
        onAddNode={onAddNode}
      />
    </div>
  );

  // If no graph change handler provided, just return with ghost drag
  if (!onGraphChange || !rawGraph) {
    return groupNodeComponent;
  }

  // Full enhanced node with edge creation capabilities
  return (
    <DragDropEdgeHandler
      nodeId={id}
      isSelected={selected}
      onGraphChange={onGraphChange}
      rawGraph={rawGraph}
      nodeWidth={data.width}
      nodeHeight={data.height}
    >
      {groupNodeComponent}
    </DragDropEdgeHandler>
  );
};

export default EnhancedGroupNode;

