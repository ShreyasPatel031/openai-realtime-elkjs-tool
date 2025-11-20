import { useCallback } from 'react';
import { ReactFlowInstance } from 'reactflow';
import { placeNodeOnCanvas } from '../utils/canvas/canvasInteractions';
import { Tool } from './useToolSelection';

interface UseCanvasInteractionsProps {
  selectedTool: Tool;
  reactFlowRef: React.RefObject<ReactFlowInstance>;
  viewStateRef: React.RefObject<any>;
  handleToolSelect: (tool: Tool) => void;
}

export const useCanvasInteractions = ({
  selectedTool,
  reactFlowRef,
  viewStateRef,
  handleToolSelect
}: UseCanvasInteractionsProps) => {
  
  const onPaneClick = useCallback((event: React.MouseEvent) => {
    console.log('🖱️ [Canvas onClick] Tool:', selectedTool, 'Target:', event.target);
    
    // Only handle pane clicks for certain tools
    switch (selectedTool) {
      case 'box':
        // Place a new node when clicking on the canvas with box tool
        placeNodeOnCanvas(
          event.nativeEvent as MouseEvent,
          selectedTool,
          reactFlowRef,
          viewStateRef,
          (newTool: Tool) => handleToolSelect(newTool)
        );
        break;
      
      case 'arrow':
        // Deselect all nodes and edges when clicking on empty canvas.
        // This is handled by ReactFlow's onSelectionChange.
        break;
        
      default:
        // For other tools, do nothing on pane click
        break;
    }
  }, [selectedTool, reactFlowRef, viewStateRef, handleToolSelect]);

  return {
    onPaneClick
  };
};

