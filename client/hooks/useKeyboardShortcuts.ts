import { useEffect, useCallback } from 'react';
import { Node, Edge } from 'reactflow';

interface UseKeyboardShortcutsProps {
  selectedNodes: Node[];
  selectedEdges: Edge[];
  rawGraph: any;
  setRawGraph: (graph: any) => void;
  selectedTool?: 'select' | 'box' | 'connector' | 'group';
  handleGroupNodes?: (nodeIds: string[], parentId: string, groupId: string, style?: any, groupIconName?: string) => void;
  setSelectedNodes?: (nodes: Node[]) => void;
  setSelectedTool?: (tool: 'select' | 'box' | 'connector' | 'group') => void;
}

export const useKeyboardShortcuts = ({
  selectedNodes,
  selectedEdges,
  rawGraph,
  setRawGraph,
  selectedTool,
  handleGroupNodes,
  setSelectedNodes,
  setSelectedTool
}: UseKeyboardShortcutsProps) => {

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Handle Enter key for group creation when group tool is active
    if (event.key === 'Enter' && selectedTool === 'group' && selectedNodes.length >= 2 && handleGroupNodes) {
      event.preventDefault();
      const nodeIds = selectedNodes.map(node => node.id);
      const groupId = `group-${Date.now()}`;
      const parentId = 'root'; // Default to root
      
      try {
        handleGroupNodes(nodeIds, parentId, groupId, undefined);
        // Clear selection after grouping
        if (setSelectedNodes) {
          setSelectedNodes([]);
        }
        // Switch back to select tool
        if (setSelectedTool) {
          setSelectedTool('select');
        }
      } catch (error) {
        console.error('Failed to create group:', error);
      }
      return;
    }
    
    // Handle Delete/Backspace for selected nodes and edges
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selectedNodes.length > 0 || selectedEdges.length > 0) {
        event.preventDefault();
        // Create a deep copy of the graph (like DevPanel does)
        let updatedGraph = JSON.parse(JSON.stringify(rawGraph));
        
        // Remove selected nodes
        if (selectedNodes.length > 0) {
          console.log('🗑️ [Keyboard] Deleting nodes:', selectedNodes.map(n => n.id));
          
          const deleteNodeRecursively = (node: any, nodeIdToDelete: string): any => {
            if (!node.children) return node;
            
            return {
              ...node,
              children: node.children
                .filter((child: any) => child.id !== nodeIdToDelete)
                .map((child: any) => deleteNodeRecursively(child, nodeIdToDelete))
            };
          };
          
          selectedNodes.forEach(selectedNode => {
            updatedGraph = deleteNodeRecursively(updatedGraph, selectedNode.id);
          });
        }
        
        // Remove selected edges
        if (selectedEdges.length > 0) {
          console.log('🗑️ [Keyboard] Deleting edges:', selectedEdges.map(e => e.id));
          
          const deleteEdgeRecursively = (node: any, edgeIdToDelete: string): any => {
            const updatedNode = { ...node };
            
            if (updatedNode.edges) {
              updatedNode.edges = updatedNode.edges.filter((edge: any) => edge.id !== edgeIdToDelete);
            }
            
            if (updatedNode.children) {
              updatedNode.children = updatedNode.children.map((child: any) => 
                deleteEdgeRecursively(child, edgeIdToDelete)
              );
            }
            
            return updatedNode;
          };
          
          selectedEdges.forEach(selectedEdge => {
            updatedGraph = deleteEdgeRecursively(updatedGraph, selectedEdge.id);
          });
        }
        
        // Update the graph
        setRawGraph(updatedGraph);
        console.log('✅ [Keyboard] Graph updated after deletion');
      }
    }
  }, [selectedNodes, selectedEdges, rawGraph, setRawGraph]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return null; // This hook doesn't render anything
};
