import React, { useState, useEffect } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  Handle,
  BaseEdge
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
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
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
      
      <div style={{ textAlign: 'left', padding: '2px' }}>{data.label}</div>
    </div>
  );
};

// Custom group node component
const GroupNode = ({ data }) => {
  const groupStyle = {
    background: 'rgba(240, 240, 240, 0.8)',
    border: '1px dashed #999',
    borderRadius: '4px',
    padding: '10px',
    width: data.width || 200,
    height: data.height || 200,
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    fontSize: '12px',
    position: 'relative'
  };

  return (
    <div style={groupStyle}>
      <div style={{ 
        position: 'absolute',
        top: '5px',
        left: '5px',
        fontWeight: 'bold',
        fontSize: '14px'
      }}>
        {data.label}
      </div>
    </div>
  );
};

// Replace the existing StepEdge component with this improved version
function StepEdge({ id, sourceX, sourceY, targetX, targetY, data, style = {}, markerEnd }) {
  let edgePath = '';
  
  // Check if we have bend points
  if (data?.bendPoints && data.bendPoints.length > 0) {
    const bendPoints = data.bendPoints;
    
    if (bendPoints.length === 2) {
      // For 2 bend points, use the first bend point's x as the fixed x coordinate
      const fixedX = bendPoints[0].x;
      edgePath = `M ${sourceX} ${sourceY} L ${fixedX} ${sourceY} L ${fixedX} ${targetY} L ${targetX} ${targetY}`;
    } 
    else if (bendPoints.length > 2) {
      // For more than 2 bend points, keep intermediate points fixed
      // and only allow first and last segments to move
      
      // Add source point as the starting point and target as the ending point
      const points = [{ x: sourceX, y: sourceY }, ...bendPoints, { x: targetX, y: targetY }];
      
      // Build path segments
      let pathCommands = [`M ${sourceX} ${sourceY}`]; // Start at source
      
      for (let i = 1; i < points.length; i++) {
        const prev = points[i-1];
        const curr = points[i];
        
        if (i === 1) {
          // First segment - horizontal from source to first bend point
          pathCommands.push(`L ${curr.x} ${sourceY}`);
        } else if (i === points.length - 1) {
          // Last segment - horizontal to target
          // Use the penultimate point's x for the vertical segment
          const penultimate = points[points.length - 2];
          pathCommands.push(`L ${penultimate.x} ${targetY}`);
          pathCommands.push(`L ${targetX} ${targetY}`);
        } else if (i !== points.length - 2) { // Skip the penultimate point
          // Intermediate segments - keep fixed
          pathCommands.push(`L ${curr.x} ${curr.y}`);
        }
      }
      
      // Join all path commands
      edgePath = pathCommands.join(' ');
    }
    else {
      // For any unexpected number of bend points, fall back to a simple step edge
      const midX = sourceX + (targetX - sourceX) / 2;
      edgePath = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
    }
  } 
  else {
    // No bend points, use default step edge
    const midX = sourceX + (targetX - sourceX) / 2;
    edgePath = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
  }
  
  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={style || { strokeWidth: 2 }}
      markerEnd={markerEnd}
    />
  );
}

// Register the custom node and edge types
const nodeTypes = {
  custom: CustomNode,
  group: GroupNode
};

const edgeTypes = {
  step: StepEdge,
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
    
    // Handle different data formats that might be passed from ToolPanel or ElkTestPage
    let processableGraph = graphData;
    
    // If graphData has a 'graph' property (from ToolPanel), use that
    if (graphData.graph) {
      processableGraph = graphData.graph;
      console.log('ReactFlowGraph: Using graph from object with title:', graphData.title || 'Untitled');
    }
    
    
    // Check if the graph has layout properties (x, y) which indicates it's already layouted
    const isLayouted = processableGraph.x !== undefined && processableGraph.y !== undefined;
    
    setDebug(`Received graph with ${processableGraph.children?.length || 0} root children. Has layout: ${isLayouted}`);
    
    // Ensure we have a valid graph structure before proceeding
    if (!processableGraph.children || processableGraph.children.length === 0) {
      // If there are no children, but we have an ID, try treating the root as the graph itself
      if (processableGraph.id) {
        // Create a new graph with the current object as the single child
        processableGraph = {
          id: 'synthetic-root',
          children: [processableGraph]
        };
      } else {
        setError("Invalid graph structure: No children found and no graph ID");
        setDebug("Invalid graph structure: No children found and no graph ID");
        return;
      }
    }
    
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
          
          
          // Recurse on children
          if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
              computeNodeAbsPositions(child, nodeAbsX, nodeAbsY);
            });
          }
        };
        
        // Build absolute positions map
        computeNodeAbsPositions(layoutedGraph);
        
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
                
                
                // Store source point (right side of source node)
                if (edge.sources && edge.sources.length > 0 && section.startPoint) {
                  const sourceId = edge.sources[0];
                  if (!nodeEdgePoints[sourceId]) {
                    nodeEdgePoints[sourceId] = { right: [], left: [] };
                  }
                  
                  // Apply container offset to get absolute coordinates
                  const absStartX = containerOffset.x + section.startPoint.x;
                  const absStartY = containerOffset.y + section.startPoint.y;
                  
                  
                  nodeEdgePoints[sourceId].right.push({
                    edgeId: edge.id,
                    x: absStartX,
                    y: absStartY,
                    originalX: section.startPoint.x,
                    originalY: section.startPoint.y
                  });
                }
                
                // Store target point (left side of target node)
                if (edge.targets && edge.targets.length > 0 && section.endPoint) {
                  const targetId = edge.targets[0];
                  if (!nodeEdgePoints[targetId]) {
                    nodeEdgePoints[targetId] = { right: [], left: [] };
                  }
                  
                  // Apply container offset to get absolute coordinates
                  const absEndX = containerOffset.x + section.endPoint.x;
                  const absEndY = containerOffset.y + section.endPoint.y;
                  
                  
                  nodeEdgePoints[targetId].left.push({
                    edgeId: edge.id,
                    x: absEndX,
                    y: absEndY,
                    originalX: section.endPoint.x,
                    originalY: section.endPoint.y
                  });
                }
                
                // Store bend points with absolute positions
                if (section.bendPoints && section.bendPoints.length > 0) {
                  // Reset the array instead of checking if it exists
                  edge.absoluteBendPoints = [];
                  
                  section.bendPoints.forEach((point, index) => {
                    // Apply container offset to get absolute coordinates
                    const absBendX = containerOffset.x + point.x;
                    const absBendY = containerOffset.y + point.y;
                    
                    edge.absoluteBendPoints.push({
                      index,
                      x: absBendX,
                      y: absBendY,
                      originalX: point.x,
                      originalY: point.y
                    });
                    
                    
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
              
              
              // Store source point
              if (edge.sources && edge.sources.length > 0 && section.startPoint) {
                const sourceId = edge.sources[0];
                if (!nodeEdgePoints[sourceId]) {
                  nodeEdgePoints[sourceId] = { right: [], left: [] };
                }
                
                // Apply container offset to get absolute coordinates
                const absStartX = containerOffset.x + section.startPoint.x;
                const absStartY = containerOffset.y + section.startPoint.y;
              
                
                nodeEdgePoints[sourceId].right.push({
                  edgeId: edge.id,
                  x: absStartX,
                  y: absStartY,
                  originalX: section.startPoint.x,
                  originalY: section.startPoint.y
                });
              }
              
              // Store target point
              if (edge.targets && edge.targets.length > 0 && section.endPoint) {
                const targetId = edge.targets[0];
                if (!nodeEdgePoints[targetId]) {
                  nodeEdgePoints[targetId] = { right: [], left: [] };
                }
                
                // Apply container offset to get absolute coordinates
                const absEndX = containerOffset.x + section.endPoint.x;
                const absEndY = containerOffset.y + section.endPoint.y;
                
                nodeEdgePoints[targetId].left.push({
                  edgeId: edge.id,
                  x: absEndX,
                  y: absEndY,
                  originalX: section.endPoint.x,
                  originalY: section.endPoint.y
                });
              }
              
              // Store bend points with absolute positions
              if (section.bendPoints && section.bendPoints.length > 0) {
                // Reset the array instead of checking if it exists
                edge.absoluteBendPoints = [];
                
                section.bendPoints.forEach((point, index) => {
                  // Apply container offset to get absolute coordinates
                  const absBendX = containerOffset.x + point.x;
                  const absBendY = containerOffset.y + point.y;
                  
                  edge.absoluteBendPoints.push({
                    index,
                    x: absBendX,
                    y: absBendY,
                    originalX: point.x,
                    originalY: point.y
                  });

                });
              }
            }
          });
        }
        
        
        // 4. Third pass: build ReactFlow nodes and edges using absolute positions
        const buildReactFlowNodes = (node, parentX = 0, parentY = 0, parentId = null) => {
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
          
          // Determine if this is a parent node (has children)
          const isParent = Array.isArray(node.children) && node.children.length > 0;
          
          // Get edge connection points for this node
          const edgePoints = nodeEdgePoints[node.id] || { left: [], right: [] };
          
          // Calculate relative y positions for handles
          const leftHandles = edgePoints.left.map((point, index) => {
            const relativeY = ((point.y - absY) / (node.height || 40) * 100);
            return `${relativeY}%`;
          });
          
          const rightHandles = edgePoints.right.map((point, index) => {
            const relativeY = ((point.y - absY) / (node.height || 40) * 100);
            return `${relativeY}%`;
          });
          
          // Add node to the nodes array
          const newNode = {
            id: node.id,
            position: { x: absX, y: absY },
            type: isParent ? 'group' : 'custom',
            zIndex: isParent ? 0 : 100,
            data: { 
              label: node.labels && node.labels[0] ? node.labels[0].text : node.id,
              width: node.width || 80,
              height: node.height || 40,
              isParent: isParent,
              leftHandles,
              rightHandles,
              position: { x: absX, y: absY }
            },
            style: isParent ? {
              width: node.width || 200,
              height: node.height || 200,
              backgroundColor: 'rgba(240, 240, 240, 0.8)',
              border: '1px dashed #999',
              display: 'flex',
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              padding: '10px'
            } : undefined
          };

          // If this is a child node, add parentId
          if (parentId) {
            newNode.parentId = parentId;
            // For child nodes, position is relative to parent
            newNode.position = { x: node.x || 0, y: node.y || 0 };
          }

          reactFlowNodes.push(newNode);
          
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
                      
                      
                      reactFlowEdges.push({
                        id: edgeId,
                        source: source,
                        target: target,
                        // Use step edge type for edges with 2 bendpoints
                        type: edge.sections?.[0]?.bendPoints?.length >= 2 ? 'step' : 'smoothstep',
                        zIndex: 50,
                        sourceHandle: sourceHandleIndex >= 0 ? `right-${sourceHandleIndex}` : 'right',
                        targetHandle: targetHandleIndex >= 0 ? `left-${targetHandleIndex}` : 'left',
                        style: { strokeWidth: 2 },
                        markerEnd: {
                          type: 'arrowclosed',
                          width: 20,
                          height: 20,
                          color: '#555'
                        },
                        // Add the bend points data
                        data: {
                          bendPoints: edge.absoluteBendPoints || edge.sections?.[0]?.bendPoints?.map(point => ({
                            x: point.x,
                            y: point.y
                          })) || []
                        }
                      });
                    }
                  });
                });
              }
            });
          }
          
          // Process children recursively
          if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
              buildReactFlowNodes(child, absX, absY, node.id);
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
                    
                    
                    reactFlowEdges.push({
                      id: edgeId,
                      source: source,
                      target: target,
                      // Use step edge type for edges with 2 bendpoints
                      type: edge.sections?.[0]?.bendPoints?.length >= 2 ? 'step' : 'smoothstep',
                      zIndex: 50,
                      sourceHandle: sourceHandleIndex >= 0 ? `right-${sourceHandleIndex}` : 'right',
                      targetHandle: targetHandleIndex >= 0 ? `left-${targetHandleIndex}` : 'left',
                      style: { strokeWidth: 2 },
                      markerEnd: {
                        type: 'arrowclosed',
                        width: 20,
                        height: 20,
                        color: '#555'
                      },
                      // Add the bend points data
                      data: {
                        bendPoints: edge.absoluteBendPoints || edge.sections?.[0]?.bendPoints?.map(point => ({
                          x: point.x,
                          y: point.y
                        })) || []
                      }
                    });
                  }
                });
              });
            }
          });
        }
        
        
        
        return { nodes: reactFlowNodes, edges: reactFlowEdges };
      };
      
      // Process the layouted graph
      const { nodes: newNodes, edges: newEdges } = processLayoutedGraph(processableGraph);
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
            edgeTypes={edgeTypes}
            fitView
            maxZoom={2}
            minZoom={0.1}
            fitViewOptions={{ 
              padding: 0.2,
              includeHiddenNodes: true 
            }}
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
            <Controls showZoom={true} showFitView={true} showInteractive={true} />
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