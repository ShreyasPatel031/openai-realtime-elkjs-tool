import { useState, useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import { Tool } from './useToolSelection';

interface UseNodeSelectionProps {
  selectedTool: Tool;
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
}

export const useNodeSelection = ({ selectedTool, setNodes }: UseNodeSelectionProps) => {
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<Edge[]>([]);

  const onSelectionChange = useCallback(({ nodes: selectedNodesParam, edges: selectedEdgesParam }: { nodes: Node[]; edges: Edge[] }) => {
    // CRITICAL: When connector or box tool is active, ignore node selections
    // Box tool: nodes should not be selectable while placing new nodes
    // Connector tool: nodes should not be selectable while connecting
    if (selectedTool === 'connector' || selectedTool === 'box') {
      // Clear node selection when these tools are active
      if (selectedNodesParam.length > 0) {
        console.log('🚫 [onSelectionChange] Ignoring node selection - tool is:', selectedTool);
        // Force deselect nodes in ReactFlow
        setNodes((nds) => nds.map(node => ({ ...node, selected: false })));
      }
      setSelectedNodes([]);
      setSelectedEdges(selectedEdgesParam);
      return;
    }

    // Normal selection handling for select tool
    setSelectedNodes(selectedNodesParam);
    setSelectedEdges(selectedEdgesParam);
    
    // Log selection changes for debugging
    console.log('📦 Selected nodes:', selectedNodesParam.map(n => n.id));
    console.log('📦 Selected edges:', selectedEdgesParam.map(e => e.id));
  }, [selectedTool, setNodes]);

  return {
    selectedNodes,
    selectedEdges,
    setSelectedNodes,
    setSelectedEdges,
    onSelectionChange
  };
};

