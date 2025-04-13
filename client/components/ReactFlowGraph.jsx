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
  const [error, setError] = useState(null);
  const [debug, setDebug] = useState("");

  useEffect(() => {
    if (!graphData) {
      console.log('ReactFlowGraph: No graph data provided.');
      setDebug("No graph data provided");
      return;
    }
    
    console.log('ReactFlowGraph: Received layouted graph data:', graphData);
    setDebug(`Received graph with ${graphData.children?.length || 0} root children`);
    
    try {
      // Process the already layouted graph into ReactFlow format
      const processLayoutedGraph = (layoutedGraph) => {
        console.log('ReactFlowGraph: Processing layouted graph:', layoutedGraph);
        
        const reactFlowNodes = [];
        const reactFlowEdges = [];
        const edgeIds = new Set();
        
        // Helper to process a node and its children
        const processNode = (node, parentX = 0, parentY = 0) => {
          if (!node || !node.id) {
            console.error('ReactFlowGraph: Invalid node found:', node);
            return;
          }
          
          // Calculate absolute position using parent's coordinates
          const absX = (node.x || 0) + parentX;
          const absY = (node.y || 0) + parentY;
          
          console.log(`ReactFlowGraph: Processing node ${node.id} at position (${absX}, ${absY}), width=${node.width}, height=${node.height}`);
          
          // Add node to the nodes array
          reactFlowNodes.push({
            id: node.id,
            position: { x: absX, y: absY },
            data: { 
              label: node.labels && node.labels[0] ? node.labels[0].text : node.id 
            },
            style: {
              background: '#fff',
              border: '1px solid #ccc',
              borderRadius: '4px',
              padding: '10px',
              width: node.width || 80,
              height: node.height || 40
            }
          });
          
          // Process node's edges
          if (node.edges && node.edges.length > 0) {
            console.log(`ReactFlowGraph: Processing ${node.edges.length} edges for node ${node.id}`);
            node.edges.forEach(edge => {
              if (edge.sources && edge.targets) {
                edge.sources.forEach(source => {
                  edge.targets.forEach(target => {
                    const edgeId = `${source}-${target}-${Math.random().toString(36).substr(2, 9)}`;
                    if (!edgeIds.has(edgeId)) {
                      edgeIds.add(edgeId);
                      reactFlowEdges.push({
                        id: edgeId,
                        source: source,
                        target: target,
                        type: 'smoothstep'
                      });
                      console.log(`ReactFlowGraph: Added edge from ${source} to ${target}`);
                    }
                  });
                });
              }
            });
          }
          
          // Recursively process children
          if (node.children && node.children.length > 0) {
            console.log(`ReactFlowGraph: Processing ${node.children.length} children of node ${node.id}`);
            node.children.forEach(child => {
              processNode(child, absX, absY);
            });
          }
        };
        
        // Start with the root node
        processNode(layoutedGraph);
        
        // Process root-level edges
        if (layoutedGraph.edges && layoutedGraph.edges.length > 0) {
          console.log(`ReactFlowGraph: Processing ${layoutedGraph.edges.length} root-level edges`);
          layoutedGraph.edges.forEach(edge => {
            if (edge.sources && edge.targets) {
              edge.sources.forEach(source => {
                edge.targets.forEach(target => {
                  const edgeId = `${source}-${target}-${Math.random().toString(36).substr(2, 9)}`;
                  if (!edgeIds.has(edgeId)) {
                    edgeIds.add(edgeId);
                    reactFlowEdges.push({
                      id: edgeId,
                      source: source,
                      target: target,
                      type: 'smoothstep'
                    });
                    console.log(`ReactFlowGraph: Added root-level edge from ${source} to ${target}`);
                  }
                });
              });
            }
          });
        }
        
        console.log('ReactFlowGraph: Processed ReactFlow nodes and edges:', { 
          nodes: reactFlowNodes.length, 
          edges: reactFlowEdges.length 
        });
        setDebug(`Processed ${reactFlowNodes.length} nodes and ${reactFlowEdges.length} edges`);
        
        return { nodes: reactFlowNodes, edges: reactFlowEdges };
      };
      
      // Process the layouted graph
      const { nodes: newNodes, edges: newEdges } = processLayoutedGraph(graphData);
      setNodes(newNodes);
      setEdges(newEdges);
      setError(null);
      
    } catch (err) {
      console.error('ReactFlowGraph: Error processing graph data:', err);
      setError(err.message);
      setDebug(`Error: ${err.message}`);
    }
  }, [graphData]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {error ? (
        <div style={{ padding: '20px', color: 'red' }}>
          <h3>Error rendering graph:</h3>
          <p>{error}</p>
          <pre>{debug}</pre>
        </div>
      ) : nodes.length === 0 ? (
        <div style={{ padding: '20px', color: 'orange' }}>
          <h3>Loading graph or no nodes to display</h3>
          <pre>{debug}</pre>
        </div>
      ) : (
        <>
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
          <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(255,255,255,0.8)', padding: '5px', fontSize: '12px' }}>
            {debug}
          </div>
        </>
      )}
    </div>
  );
};

export default ReactFlowGraph; 