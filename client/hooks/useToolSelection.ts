import { useState, useCallback } from 'react';
import { Node } from 'reactflow';

export type Tool = 'arrow' | 'hand' | 'box' | 'connector' | 'group';

interface UseToolSelectionProps {
  nodes: Node[];
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setSelectedNodes: (nodes: Node[]) => void;
}

export const useToolSelection = ({ nodes, setNodes, setSelectedNodes }: UseToolSelectionProps) => {
  const [selectedTool, setSelectedTool] = useState<Tool>('arrow');

  const handleToolSelect = useCallback((tool: Tool) => {
    console.log('🛠️ [handleToolSelect] Switching tool:', { from: selectedTool, to: tool });
    
    // Deselect all nodes when switching to box or connector tool BEFORE setting the tool
    // This ensures nodes are deselected immediately when switching tools
    if (tool === 'connector' || tool === 'box') {
      console.log('🛠️ [handleToolSelect] Deselecting nodes for tool:', tool);
      
      // Debug nodes state  
      console.log('🛠️ [handleToolSelect] Nodes from state:', nodes.length, 'selected:', nodes.filter(n => n.selected).length);
      
      // Use the actual nodes state instead of ref (ref might be stale)
      const selectedNodesFromState = nodes.filter(n => n.selected);
      console.log('🛠️ [handleToolSelect] Selected nodes from state:', selectedNodesFromState.map(n => n.id));
      
      // Deselect all nodes using state (more reliable than ref)
      if (selectedNodesFromState.length > 0) {
        console.log('🛠️ [handleToolSelect] Deselecting nodes:', selectedNodesFromState.map(n => n.id));
        setNodes((nds) => {
          const updated = nds.map(node => ({ ...node, selected: false }));
          console.log('🛠️ [handleToolSelect] After deselection - nodes:', updated.length, 'selected:', updated.filter(n => n.selected).length);
          return updated;
        });
      }
      
      setSelectedNodes([]);
    }
    
    // Special case: If switching away from arrow tool while nodes are selected, deselect them
    if (selectedTool === 'arrow' && tool !== 'arrow' && tool !== 'group') {
      const selectedNodesFromState = nodes.filter(n => n.selected);
      if (selectedNodesFromState.length > 0) {
        console.log('🛠️ [handleToolSelect] Switching away from select tool, deselecting nodes:', selectedNodesFromState.map(n => n.id));
        setNodes((nds) => nds.map(node => ({ ...node, selected: false })));
        setSelectedNodes([]);
      }
    }
    
    console.log('🛠️ [handleToolSelect] Setting tool to:', tool);
    setSelectedTool(tool);
  }, [selectedTool, nodes, setNodes, setSelectedNodes]);

  return {
    selectedTool,
    handleToolSelect
  };
};

