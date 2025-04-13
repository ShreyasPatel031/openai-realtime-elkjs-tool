import React, { useState, useEffect } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  Handle
} from 'reactflow';
import 'reactflow/dist/style.css';

// Custom node component with handles at edge connection points
const CustomNode = ({ data, id }) => {
  // Determine styling based on whether this is a parent node
  const nodeStyle = {
    background: data.isParent ? 'rgba(240, 240, 240, 0.8)' : '#fff',
    border: data.isParent ? '1px dashed #999' : '1px solid #ccc',
    borderRadius: '4px',
    padding: '10px',
    width: data.width || 80,
    height: data.height || 40,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '12px',
    boxShadow: data.isParent ? 'none' : '0 1px 4px rgba(0, 0, 0, 0.1)',
    position: 'relative'
  };

  // Debug information
  const debugInfo = {
    id,
    position: data.position,
    width: data.width,
    height: data.height,
    leftHandles: data.leftHandles,
    rightHandles: data.rightHandles
  };

  return (
    <div style={nodeStyle}>
      {/* Debug overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        background: 'rgba(255, 255, 255, 0.8)',
        padding: '2px',
        fontSize: '8px',
        zIndex: 1000,
        display: 'none' // Toggle this to show/hide debug info
      }}>
        {JSON.stringify(debugInfo, null, 2)}
      </div>

      {/* Input handles on left side */}
      {data.leftHandles && data.leftHandles.map((yPos, index) => (
        <Handle
          key={`left-${index}`}
          type="target"
          position={Position.Left}
          id={`left-${index}`}
          style={{ 
            top: yPos, 
            background: '#555',
            width: 6,
            height: 6
          }}
        />
      ))}
      
      {/* Output handles on right side */}
      {data.rightHandles && data.rightHandles.map((yPos, index) => (
        <Handle
          key={`right-${index}`}
          type="source"
          position={Position.Right}
          id={`right-${index}`}
          style={{ 
            top: yPos, 
            background: '#555',
            width: 6,
            height: 6
          }}
        />
      ))}
      
      {/* Default handles if no custom handles exist */}
      {(!data.leftHandles || data.leftHandles.length === 0) && (
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          style={{ background: '#555' }}
        />
      )}
      {(!data.rightHandles || data.rightHandles.length === 0) && (
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          style={{ background: '#555' }}
        />
      )}
      
      <div>{data.label}</div>
    </div>
  );
};

// Register the custom node type
const nodeTypes = {
  custom: CustomNode,
};

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
    
    console.log('ReactFlowGraph: Received graph data:', graphData);
    // Check if the graph has layout properties (x, y) which indicates it's already layouted
    const isLayouted = graphData.x !== undefined && graphData.y !== undefined;
    console.log('ReactFlowGraph: Graph is already layouted:', isLayouted);
    
    setDebug(`Received graph with ${graphData.children?.length || 0} root children. Has layout: ${isLayouted}`);
    
    try {
      // Process the already layouted graph into ReactFlow format
      const processLayoutedGraph = (layoutedGraph) => {
        console.log('ReactFlowGraph: Processing layouted graph:', layoutedGraph);
        
        const reactFlowNodes = [];
        const reactFlowEdges = [];
        const edgeIds = new Set();
        
        // 1. Dictionary to hold absolute positions of all nodes
        const absolutePositions = {};
        
        // 2. First pass: compute and store absolute positions for all nodes
        const computeNodeAbsPositions = (node, parentX = 0, parentY = 0) => {
          if (!node || !node.id) return;
          
          const nodeAbsX = (node.x || 0) + parentX;
          const nodeAbsY = (node.y || 0) + parentY;
          
          // Store absolute position in our dictionary
          absolutePositions[node.id] = { 
            x: nodeAbsX, 
            y: nodeAbsY, 
            width: node.width || 80,
            height: node.height || 40
          };
          
          console.log(`Storing absolute position for ${node.id}:`, {
            relative: { x: node.x || 0, y: node.y || 0 },
            parent: { x: parentX, y: parentY },
            absolute: { x: nodeAbsX, y: nodeAbsY }
          });
          
          // Recurse on children
          if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
              computeNodeAbsPositions(child, nodeAbsX, nodeAbsY);
            });
          }
        };
        
        // Build absolute positions map
        computeNodeAbsPositions(layoutedGraph);
        console.log('Node absolute positions:', absolutePositions);
        
        // Helper to store edge connection points for each node
        const nodeEdgePoints = {};
        
        // 3. Second pass: collect edge points with proper container offsets
        const collectEdgePoints = (node) => {
          // Process node edges
          if (node.edges && node.edges.length > 0) {
            node.edges.forEach(edge => {
              if (edge.sections && edge.sections.length > 0) {
                const section = edge.sections[0];
                
                // Get container's absolute position
                const containerId = edge.container || node.id;
                const containerOffset = absolutePositions[containerId] || { x: 0, y: 0 };
                
                console.log(`Edge ${edge.id} container:`, {
                  containerId,
                  containerOffset
                });
                
                // Store source point (right side of source node)
                if (edge.sources && edge.sources.length > 0 && section.startPoint) {
                  const sourceId = edge.sources[0];
                  if (!nodeEdgePoints[sourceId]) {
                    nodeEdgePoints[sourceId] = { right: [], left: [] };
                  }
                  
                  // Apply container offset to get absolute Y
                  const absStartY = containerOffset.y + section.startPoint.y;
                  
                  console.log(`Edge ${edge.id} source point:`, {
                    nodeId: sourceId,
                    rawPoint: section.startPoint,
                    containerOffset: containerOffset.y,
                    absoluteY: absStartY,
                    edgeId: edge.id
                  });
                  
                  nodeEdgePoints[sourceId].right.push({
                    edgeId: edge.id,
                    y: absStartY,
                    originalY: section.startPoint.y
                  });
                }
                
                // Store target point (left side of target node)
                if (edge.targets && edge.targets.length > 0 && section.endPoint) {
                  const targetId = edge.targets[0];
                  if (!nodeEdgePoints[targetId]) {
                    nodeEdgePoints[targetId] = { right: [], left: [] };
                  }
                  
                  // Apply container offset to get absolute Y
                  const absEndY = containerOffset.y + section.endPoint.y;
                  
                  console.log(`Edge ${edge.id} target point:`, {
                    nodeId: targetId,
                    rawPoint: section.endPoint,
                    containerOffset: containerOffset.y,
                    absoluteY: absEndY,
                    edgeId: edge.id
                  });
                  
                  nodeEdgePoints[targetId].left.push({
                    edgeId: edge.id,
                    y: absEndY,
                    originalY: section.endPoint.y
                  });
                }
              }
            });
          }
          
          // Process children recursively
          if (node.children && node.children.length > 0) {
            node.children.forEach(child => collectEdgePoints(child));
          }
        };
        
        // Collect edge points for all nodes in the graph
        collectEdgePoints(layoutedGraph);
        
        // Also handle root-level edges
        if (layoutedGraph.edges && layoutedGraph.edges.length > 0) {
          layoutedGraph.edges.forEach(edge => {
            if (edge.sections && edge.sections.length > 0) {
              const section = edge.sections[0];
              
              // Get container's absolute position
              const containerId = edge.container || layoutedGraph.id || 'root';
              const containerOffset = absolutePositions[containerId] || { x: 0, y: 0 };
              
              console.log(`Root edge ${edge.id} container:`, {
                containerId,
                containerOffset
              });
              
              // Store source point
              if (edge.sources && edge.sources.length > 0 && section.startPoint) {
                const sourceId = edge.sources[0];
                if (!nodeEdgePoints[sourceId]) {
                  nodeEdgePoints[sourceId] = { right: [], left: [] };
                }
                
                // Apply container offset to get absolute Y
                const absStartY = containerOffset.y + section.startPoint.y;
                
                console.log(`Root edge ${edge.id} source point:`, {
                  nodeId: sourceId,
                  rawPoint: section.startPoint,
                  containerOffset: containerOffset.y,
                  absoluteY: absStartY,
                  edgeId: edge.id
                });
                
                nodeEdgePoints[sourceId].right.push({
                  edgeId: edge.id,
                  y: absStartY,
                  originalY: section.startPoint.y
                });
              }
              
              // Store target point
              if (edge.targets && edge.targets.length > 0 && section.endPoint) {
                const targetId = edge.targets[0];
                if (!nodeEdgePoints[targetId]) {
                  nodeEdgePoints[targetId] = { right: [], left: [] };
                }
                
                // Apply container offset to get absolute Y
                const absEndY = containerOffset.y + section.endPoint.y;
                
                console.log(`Root edge ${edge.id} target point:`, {
                  nodeId: targetId,
                  rawPoint: section.endPoint,
                  containerOffset: containerOffset.y,
                  absoluteY: absEndY,
                  edgeId: edge.id
                });
                
                nodeEdgePoints[targetId].left.push({
                  edgeId: edge.id,
                  y: absEndY,
                  originalY: section.endPoint.y
                });
              }
            }
          });
        }
        
        console.log("ReactFlowGraph: Collected edge points:", nodeEdgePoints);
        
        // 4. Third pass: build ReactFlow nodes and edges using absolute positions
        const buildReactFlowNodes = (node, parentX = 0, parentY = 0) => {
          if (!node || !node.id) {
            console.error('ReactFlowGraph: Invalid node found:', node);
            return;
          }
          
          // Calculate absolute position using parent's coordinates
          const absX = (node.x || 0) + parentX;
          const absY = (node.y || 0) + parentY;
          
          // Verify our position matches what we pre-calculated
          const storedPos = absolutePositions[node.id] || { x: 0, y: 0 };
          if (Math.abs(storedPos.x - absX) > 0.1 || Math.abs(storedPos.y - absY) > 0.1) {
            console.warn(`Position mismatch for ${node.id}: stored=${storedPos.x},${storedPos.y}, calculated=${absX},${absY}`);
          }
          
          console.log(`Processing node ${node.id}:`, {
            original: { x: node.x, y: node.y },
            parent: { x: parentX, y: parentY },
            absolute: { x: absX, y: absY },
            dimensions: { width: node.width, height: node.height }
          });
          
          // Determine if this is a parent node (has children)
          const isParent = Array.isArray(node.children) && node.children.length > 0;
          
          // Get edge connection points for this node
          const edgePoints = nodeEdgePoints[node.id] || { left: [], right: [] };
          
          // Calculate relative y positions for handles
          const leftHandles = edgePoints.left.map((point, index) => {
            // Use the pre-calculated absolute Y position
            const relativeY = ((point.y - absY) / (node.height || 40) * 100);
            console.log(`Node ${node.id} left handle #${index}:`, {
              originalY: point.originalY,
              absoluteY: point.y,
              nodeY: absY,
              nodeHeight: node.height,
              relativeY: `${relativeY}%`,
              edgeId: point.edgeId
            });
            return `${relativeY}%`;
          });
          
          const rightHandles = edgePoints.right.map((point, index) => {
            // Use the pre-calculated absolute Y position
            const relativeY = ((point.y - absY) / (node.height || 40) * 100);
            console.log(`Node ${node.id} right handle #${index}:`, {
              originalY: point.originalY,
              absoluteY: point.y,
              nodeY: absY,
              nodeHeight: node.height,
              relativeY: `${relativeY}%`,
              edgeId: point.edgeId
            });
            return `${relativeY}%`;
          });
          
          // Add node to the nodes array
          reactFlowNodes.push({
            id: node.id,
            position: { x: absX, y: absY },
            type: 'custom', // Use our custom node type
            zIndex: isParent ? 0 : 100, // Set highest z-index for regular nodes, lowest for parents
            data: { 
              label: node.labels && node.labels[0] ? node.labels[0].text : node.id,
              width: node.width || 80,
              height: node.height || 40,
              isParent: isParent,
              leftHandles,
              rightHandles,
              position: { x: absX, y: absY } // Store position for debugging
            }
          });
          
          // Process node's edges
          if (node.edges && node.edges.length > 0) {
            node.edges.forEach(edge => {
              if (edge.sources && edge.targets) {
                edge.sources.forEach((source, sIdx) => {
                  edge.targets.forEach((target, tIdx) => {
                    const edgeId = edge.id || `${source}-${target}-${Math.random().toString(36).substr(2, 9)}`;
                    if (!edgeIds.has(edgeId)) {
                      edgeIds.add(edgeId);
                      
                      // Find the handle index by matching edge ID
                      const sourceHandleIndex = nodeEdgePoints[source]?.right.findIndex(
                        point => point.edgeId === edge.id
                      );
                      
                      const targetHandleIndex = nodeEdgePoints[target]?.left.findIndex(
                        point => point.edgeId === edge.id
                      );
                      
                      console.log(`Creating edge ${edgeId}:`, {
                        source,
                        target,
                        sourceHandle: sourceHandleIndex >= 0 ? `right-${sourceHandleIndex}` : 'right',
                        targetHandle: targetHandleIndex >= 0 ? `left-${targetHandleIndex}` : 'left',
                        sourcePoint: edge.sections?.[0]?.startPoint,
                        targetPoint: edge.sections?.[0]?.endPoint
                      });
                      
                      reactFlowEdges.push({
                        id: edgeId,
                        source: source,
                        target: target,
                        type: 'smoothstep',
                        zIndex: 50,
                        sourceHandle: sourceHandleIndex >= 0 ? `right-${sourceHandleIndex}` : 'right',
                        targetHandle: targetHandleIndex >= 0 ? `left-${targetHandleIndex}` : 'left',
                        style: { strokeWidth: 2 },
                        markerEnd: {
                          type: 'arrowclosed',
                          width: 20,
                          height: 20,
                          color: '#555'
                        }
                      });
                    }
                  });
                });
              }
            });
          }
          
          // Recursively process children
          if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
              buildReactFlowNodes(child, absX, absY);
            });
          }
        };
        
        // Start with the root node
        buildReactFlowNodes(layoutedGraph);
        
        // Process root-level edges
        if (layoutedGraph.edges && layoutedGraph.edges.length > 0) {
          layoutedGraph.edges.forEach(edge => {
            if (edge.sources && edge.targets) {
              edge.sources.forEach((source, sIdx) => {
                edge.targets.forEach((target, tIdx) => {
                  const edgeId = edge.id || `${source}-${target}-${Math.random().toString(36).substr(2, 9)}`;
                  if (!edgeIds.has(edgeId)) {
                    edgeIds.add(edgeId);
                    
                    // Find the handle index by matching edge ID
                    const sourceHandleIndex = nodeEdgePoints[source]?.right.findIndex(
                      point => point.edgeId === edge.id
                    );
                    
                    const targetHandleIndex = nodeEdgePoints[target]?.left.findIndex(
                      point => point.edgeId === edge.id
                    );
                    
                    console.log(`Creating root edge ${edgeId}:`, {
                      source,
                      target,
                      sourceHandle: sourceHandleIndex >= 0 ? `right-${sourceHandleIndex}` : 'right',
                      targetHandle: targetHandleIndex >= 0 ? `left-${targetHandleIndex}` : 'left',
                      sourcePoint: edge.sections?.[0]?.startPoint,
                      targetPoint: edge.sections?.[0]?.endPoint
                    });
                    
                    reactFlowEdges.push({
                      id: edgeId,
                      source: source,
                      target: target,
                      type: 'smoothstep',
                      zIndex: 50,
                      sourceHandle: sourceHandleIndex >= 0 ? `right-${sourceHandleIndex}` : 'right',
                      targetHandle: targetHandleIndex >= 0 ? `left-${targetHandleIndex}` : 'left',
                      style: { strokeWidth: 2 },
                      markerEnd: {
                        type: 'arrowclosed',
                        width: 20,
                        height: 20,
                        color: '#555'
                      }
                    });
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
            nodeTypes={nodeTypes}
            fitView
            elementsSelectable={true}
            nodesDraggable={true}
            edgesFocusable={true}
            edgesUpdatable={true}
            elevateEdgesOnSelect={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
            selectNodesOnDrag={false}
            defaultEdgeOptions={{
              type: 'smoothstep',
              style: { strokeWidth: 2 },
              markerEnd: {
                type: 'arrowclosed',
                color: '#555'
              },
              zIndex: 50
            }}
          >
            <Background />
            <Controls />
            <MiniMap 
              nodeStrokeWidth={3}
              zoomable 
              pannable
            />
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