import React from 'react';
import CanvasToolbar from './CanvasToolbar';
import { Tool } from '../../hooks/useToolSelection';

interface CanvasToolbarContainerProps {
  selectedTool: Tool;
  onToolSelect: (tool: Tool) => void;
}

const CanvasToolbarContainer: React.FC<CanvasToolbarContainerProps> = ({
  selectedTool,
  onToolSelect
}) => {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[8000]">
      <CanvasToolbar selectedTool={selectedTool} onSelect={onToolSelect} />
    </div>
  );
};

export default CanvasToolbarContainer;
