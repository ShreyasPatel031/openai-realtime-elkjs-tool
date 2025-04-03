import React, { useState, useEffect } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  useNodesState,
  useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';

const ReactFlowGraph = ({ graphData }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!graphData || !graphData.graph) return;

    // Convert ELK graph to ReactFlow format
    const convertToReactFlow = (elkGraph) => {
      const newNodes = [];
      const newEdges = [];
      
      // Process nodes
      const processNode = (node, parentId = null, position = { x: 0, y: 0 }) => {
        // Create node
        const nodeId = node.id;
        const nodePosition = {
          x: position.x + (node.x || 0),
          y: position.y + (node.y || 0)
        };
        
        newNodes.push({
          id: nodeId,
          position: nodePosition,
          data: { 
            label: node.labels && node.labels[0] ? node.labels[0].text : nodeId 
          },
          style: {
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '10px',
            width: node.width || 150,
            height: node.height || 40
          }
        });
        
        // Process children
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => {
            processNode(child, nodeId, nodePosition);
          });
        }
        
        // Process edges
        if (node.edges && node.edges.length > 0) {
          node.edges.forEach(edge => {
            if (edge.sources && edge.targets) {
              edge.sources.forEach(source => {
                edge.targets.forEach(target => {
                  newEdges.push({
                    id: `${source}-${target}`,
                    source: source,
                    target: target,
                    type: 'smoothstep'
                  });
                });
              });
            }
          });
        }
      };
      
      // Process root node
      processNode(elkGraph);
      
      // Process root-level edges
      if (elkGraph.edges && elkGraph.edges.length > 0) {
        elkGraph.edges.forEach(edge => {
          if (edge.sources && edge.targets) {
            edge.sources.forEach(source => {
              edge.targets.forEach(target => {
                newEdges.push({
                  id: `${source}-${target}`,
                  source: source,
                  target: target,
                  type: 'smoothstep'
                });
              });
            });
          }
        });
      }
      
      return { nodes: newNodes, edges: newEdges };
    };
    
    try {
      const { nodes: newNodes, edges: newEdges } = convertToReactFlow(graphData.graph);
      setNodes(newNodes);
      setEdges(newEdges);
    } catch (error) {
      console.error('Error converting graph to ReactFlow format:', error);
    }
  }, [graphData]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};

export default ReactFlowGraph; 