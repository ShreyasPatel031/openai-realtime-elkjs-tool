import { ROOT_DEFAULT_OPTIONS, NON_ROOT_DEFAULT_OPTIONS } from "./elk/elkOptions";
import { CustomNode } from "./types";
import { Edge, MarkerType } from "reactflow";

// Helper to find a node by ID
export const findNodeById = (node: any, id: string): any => {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
};

// Helper to ensure all nodes have IDs and proper layout options
export const ensureIds = (node: any, parentId: string = '') => {
  if (!node) return node;
  
  if (!parentId) {
    // Root node
    Object.assign(node, {
      ...ROOT_DEFAULT_OPTIONS,
      layoutOptions: {
        ...ROOT_DEFAULT_OPTIONS.layoutOptions,
        ...(node.layoutOptions || {})
      }
    });
  } else {
    // Non-root node
    node.width = node.width || NON_ROOT_DEFAULT_OPTIONS.width;
    node.height = node.height || NON_ROOT_DEFAULT_OPTIONS.height;
    node.layoutOptions = {
      ...NON_ROOT_DEFAULT_OPTIONS.layoutOptions,
      ...(node.layoutOptions || {})
    };
  }

  if (!node.id) {
    node.id = `${parentId}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => ensureIds(child, node.id));
  }

  return node;
};

// Helper to process layouted ELK graph to ReactFlow format
export const processLayoutedGraph = (layoutedGraph: any) => {
  const reactFlowNodes: CustomNode[] = []; // Use our custom interface
  const reactFlowEdges: Edge[] = [];
  const edgeIds = new Set();
  
  // Dictionary to hold absolute positions of all nodes
  const absolutePositions: Record<string, any> = {};
  
  // First pass: compute and store absolute positions for all nodes
  const computeNodeAbsPositions = (node: any, parentX = 0, parentY = 0) => {
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
      node.children.forEach((child: any) => {
        computeNodeAbsPositions(child, nodeAbsX, nodeAbsY);
      });
    }
  };
  
  // Build absolute positions map
  computeNodeAbsPositions(layoutedGraph);
  
  // Helper to store edge connection points for each node
  const nodeEdgePoints: Record<string, any> = {};
  
  // Second pass: collect edge points with proper container offsets
  const collectEdgePoints = (node: any) => {
    // Process node edges
    if (node.edges && node.edges.length > 0) {
      node.edges.forEach((edge: any) => {
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
            
            section.bendPoints.forEach((point: any, index: number) => {
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
      node.children.forEach((child: any) => collectEdgePoints(child));
    }
  };
  
  // Collect edge points for all nodes in the graph
  collectEdgePoints(layoutedGraph);
  
  // Also handle root-level edges
  if (layoutedGraph.edges && layoutedGraph.edges.length > 0) {
    layoutedGraph.edges.forEach((edge: any) => {
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
          
          section.bendPoints.forEach((point: any, index: number) => {
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
  
  // Third pass: build ReactFlow nodes and edges using absolute positions
  const buildReactFlowNodes = (node: any, parentX = 0, parentY = 0, parentId: string | null = null) => {
    if (!node || !node.id) {
      console.error('Invalid node found:', node);
      return;
    }
    
    // Calculate absolute position using parent's coordinates
    const absX = (node.x || 0) + parentX;
    const absY = (node.y || 0) + parentY;
    
    // Determine if this is a parent node (has children)
    const isParent = Array.isArray(node.children) && node.children.length > 0;
    
    // Get edge connection points for this node
    const edgePoints = nodeEdgePoints[node.id] || { left: [], right: [] };
    
    // Calculate relative y positions for handles
    const leftHandles = edgePoints.left.map((point: any, index: number) => {
      const relativeY = ((point.y - absY) / (node.height || 40) * 100);
      return `${relativeY}%`;
    });
    
    const rightHandles = edgePoints.right.map((point: any, index: number) => {
      const relativeY = ((point.y - absY) / (node.height || 40) * 100);
      return `${relativeY}%`;
    });
    
    // Add node to the nodes array
    const newNode: CustomNode = {
      id: node.id,
      position: { x: absX, y: absY },
      type: isParent ? 'group' : 'custom',
      zIndex: isParent ? 5 : 50,
      selectable: true,
      selected: false,
      draggable: true,
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
        padding: '10px',
        pointerEvents: 'all'
      } : {
        pointerEvents: 'all'
      }
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
      node.edges.forEach((edge: any) => {
        if (edge.sources && edge.targets) {
          edge.sources.forEach((source: string, sIdx: number) => {
            edge.targets.forEach((target: string, tIdx: number) => {
              const edgeId = edge.id || `${source}-${target}-${Math.random().toString(36).substr(2, 9)}`;
              if (!edgeIds.has(edgeId)) {
                edgeIds.add(edgeId);
                
                // Find the handle index by matching edge ID
                const sourceHandleIndex = nodeEdgePoints[source]?.right.findIndex(
                  (point: any) => point.edgeId === edge.id
                );
                
                const targetHandleIndex = nodeEdgePoints[target]?.left.findIndex(
                  (point: any) => point.edgeId === edge.id
                );
                
                // Determine source/target node types to set appropriate handles
                const sourceNode = reactFlowNodes.find(n => n.id === source);
                const targetNode = reactFlowNodes.find(n => n.id === target);
                
                const isSourceGroupNode = sourceNode?.type === 'group';
                const isTargetGroupNode = targetNode?.type === 'group';
                
                // Use appropriate handles based on node type
                const sourceHandle = isSourceGroupNode 
                  ? (sourceHandleIndex >= 0 ? `right-${sourceHandleIndex}` : 'right-0')
                  : (sourceHandleIndex >= 0 ? `right-${sourceHandleIndex}` : 'right');
                  
                const targetHandle = isTargetGroupNode
                  ? (targetHandleIndex >= 0 ? `left-${targetHandleIndex}` : 'left-0') 
                  : (targetHandleIndex >= 0 ? `left-${targetHandleIndex}` : 'left');
                
                reactFlowEdges.push({
                  id: edgeId,
                  source: source,
                  target: target,
                  // Use step edge type for edges with 2 bendpoints
                  type: edge.sections?.[0]?.bendPoints?.length >= 2 ? 'step' : 'smoothstep',
                  zIndex: 1000,
                  sourceHandle: sourceHandle,
                  targetHandle: targetHandle,
                  style: { 
                    strokeWidth: 2,
                    stroke: '#000',
                    opacity: 1,
                  },
                  markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 20,
                    height: 20,
                    color: '#555'
                  },
                  // Add the bend points data
                  data: {
                    bendPoints: edge.absoluteBendPoints || edge.sections?.[0]?.bendPoints?.map((point: any) => ({
                      x: point.x,
                      y: point.y
                    })) || []
                  },
                  selected: false,
                  hidden: false,
                  focusable: true,
                });
              }
            });
          });
        }
      });
    }
    
    // Process children recursively
    if (node.children && node.children.length > 0) {
      node.children.forEach((child: any) => {
        buildReactFlowNodes(child, absX, absY, node.id);
      });
    }
  };
  
  // Start with the root node
  buildReactFlowNodes(layoutedGraph);
  
  // Process root-level edges
  if (layoutedGraph.edges && layoutedGraph.edges.length > 0) {
    layoutedGraph.edges.forEach((edge: any) => {
      if (edge.sources && edge.targets) {
        edge.sources.forEach((source: string, sIdx: number) => {
          edge.targets.forEach((target: string, tIdx: number) => {
            const edgeId = edge.id || `${source}-${target}-${Math.random().toString(36).substr(2, 9)}`;
            if (!edgeIds.has(edgeId)) {
              edgeIds.add(edgeId);
              
              // Find the handle index by matching edge ID
              const sourceHandleIndex = nodeEdgePoints[source]?.right.findIndex(
                (point: any) => point.edgeId === edge.id
              );
              
              const targetHandleIndex = nodeEdgePoints[target]?.left.findIndex(
                (point: any) => point.edgeId === edge.id
              );
              
              // Determine source/target node types to set appropriate handles
              const sourceNode = reactFlowNodes.find(n => n.id === source);
              const targetNode = reactFlowNodes.find(n => n.id === target);
              
              const isSourceGroupNode = sourceNode?.type === 'group';
              const isTargetGroupNode = targetNode?.type === 'group';
              
              // Use appropriate handles based on node type
              const sourceHandle = isSourceGroupNode 
                ? (sourceHandleIndex >= 0 ? `right-${sourceHandleIndex}` : 'right-0')
                : (sourceHandleIndex >= 0 ? `right-${sourceHandleIndex}` : 'right');
                
              const targetHandle = isTargetGroupNode
                ? (targetHandleIndex >= 0 ? `left-${targetHandleIndex}` : 'left-0') 
                : (targetHandleIndex >= 0 ? `left-${targetHandleIndex}` : 'left');
              
              reactFlowEdges.push({
                id: edgeId,
                source: source,
                target: target,
                // Use step edge type for edges with 2 bendpoints
                type: edge.sections?.[0]?.bendPoints?.length >= 2 ? 'step' : 'smoothstep',
                zIndex: 1000,
                sourceHandle: sourceHandle,
                targetHandle: targetHandle,
                style: { 
                  strokeWidth: 2,
                  stroke: '#000',
                  opacity: 1,
                },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                  color: '#555'
                },
                // Add the bend points data
                data: {
                  bendPoints: edge.absoluteBendPoints || edge.sections?.[0]?.bendPoints?.map((point: any) => ({
                    x: point.x,
                    y: point.y
                  })) || []
                },
                selected: false,
                hidden: false,
                focusable: true,
              });
            }
          });
        });
      }
    });
  }
  
  return { nodes: reactFlowNodes, edges: reactFlowEdges };
}; 