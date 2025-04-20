"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  Position,
  Handle,
  BaseEdge,
  Node,
  Edge,
  MarkerType,
  NodeProps,
  useReactFlow,
  NodeMouseHandler,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange
} from "reactflow"
import "reactflow/dist/style.css"
import ELK from "elkjs/lib/elk.bundled.js"
import { cn } from "../../lib/utils"

// Import types from separate type definition files
interface ChatBoxProps {
  onSubmit: (message: string) => void;
  isSessionActive?: boolean;
  onStartSession?: () => void;
  onStopSession?: () => void;
}

interface Message {
  id: string
  content: string
  sender: "user" | "assistant"
  type?: "text" | "radio-question" | "checkbox-question"
  options?: { id: string; text: string }[]
  question?: string
}

interface ChatWindowProps {
  messages: Message[]
}

interface InteractiveCanvasProps {
  isSessionActive?: boolean
  startSession?: () => void
  stopSession?: () => void
  sendTextMessage?: (message: string) => void
  sendClientEvent?: (message: any) => void
  events?: any[] // Add events from the server
}

import Chatbox from "./Chatbox"
import ChatWindow from "./ChatWindow"

const ChatBox = Chatbox as React.ComponentType<ChatBoxProps>

const initialMessages: Message[] = [
  { id: "1", content: "Hello! How can I help you with the migration?", sender: "assistant" },
  { id: "2", content: "I need to migrate my database schema.", sender: "user" },
]

// Define types for ReactFlow nodes - extending the built-in Node type
interface CustomNode extends Node {
  parentId?: string;
}

// Custom node with connection handles
const CustomNode = ({ data, id, selected }: any) => {
  const { leftHandles = [], rightHandles = [] } = data;
  
  const nodeStyle = {
    background: selected ? '#f8f9fa' : 'white',
    border: selected ? '2px solid #6c757d' : '1px solid #ccc',
    borderRadius: '4px',
    padding: '10px',
    width: data.width || 80,
    height: data.height || 40,
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    fontSize: '12px',
    boxShadow: selected ? '0 0 5px rgba(0, 0, 0, 0.3)' : '0 1px 4px rgba(0, 0, 0, 0.1)',
    position: 'relative' as const,
    zIndex: selected ? 100 : 50, // Keep regular nodes above groups but below edges
    pointerEvents: 'all' as const
  };

  return (
    <div style={nodeStyle}>
      {/* Standard handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ 
          background: '#555',
          opacity: 0.8
        }}
      />
      
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ 
          background: '#555',
          opacity: 0.8
        }}
      />
      
      {/* Custom handle positions if needed */}
      {leftHandles.map((yPos: string, index: number) => (
        <Handle
          key={`left-${index}`}
          type="target"
          position={Position.Left}
          id={`left-${index}`}
          style={{ 
            top: yPos, 
            background: '#555',
            opacity: 0.8
          }}
        />
      ))}
      
      {rightHandles.map((yPos: string, index: number) => (
        <Handle
          key={`right-${index}`}
          type="source"
          position={Position.Right}
          id={`right-${index}`}
          style={{ 
            top: yPos, 
            background: '#555',
            opacity: 0.8
          }}
        />
      ))}
      
      {/* Node label */}
      <div style={{ 
        textAlign: 'left', 
        padding: '2px', 
        color: '#333'
      }}>
        {data.label}
      </div>
    </div>
  );
};

// Group node component with special handling to avoid hiding edges
const GroupNode = ({ data, id, selected }: any) => {
  // IMPORTANT: Keep z-index lower than edges (which are at 3000)
  // This ensures that even when a group node is selected, edges remain visible
  const groupStyle = {
    background: 'rgba(240, 240, 240, 0.6)',
    border: selected ? '2px solid #6c757d' : '1px solid #ccc',
    borderRadius: '8px',
    padding: '10px',
    width: data.width || 200,
    height: data.height || 200,
    fontSize: '12px',
    position: 'relative' as const,
    color: '#333',
    pointerEvents: 'all' as const,
    // Critical: Keep z-index lower than edges to prevent occlusion
    zIndex: 1, // Keep very low to ensure edges are always on top
  };

  // For invisible handles that still support connections
  const handleOpacity = 0.01;

  return (
    <div style={groupStyle}>
      {/* Add standard connection handles (invisible but functional) */}
      <Handle
        type="target"
        position={Position.Left}
        id="left-0"
        style={{ 
          background: '#555',
          opacity: handleOpacity,
          zIndex: 5000 // Make sure handles are above everything
        }}
      />
      
      <Handle
        type="source"
        position={Position.Right}
        id="right-0"
        style={{ 
          background: '#555',
          opacity: handleOpacity,
          zIndex: 5000
        }}
      />
      
      {/* Add dynamic handles based on the data */}
      {data.leftHandles && data.leftHandles.map((yPos: string, index: number) => (
        <Handle
          key={`left-${index}`}
          type="target"
          position={Position.Left}
          id={`left-${index}`}
          style={{ 
            top: yPos, 
            background: '#555',
            opacity: handleOpacity,
            zIndex: 5000
          }}
        />
      ))}
      
      {data.rightHandles && data.rightHandles.map((yPos: string, index: number) => (
        <Handle
          key={`right-${index}`}
          type="source"
          position={Position.Right}
          id={`right-${index}`}
          style={{ 
            top: yPos, 
            background: '#555',
            opacity: handleOpacity,
            zIndex: 5000
          }}
        />
      ))}
      
      {/* Node label */}
      <div style={{ 
        position: 'absolute',
        top: '5px',
        left: '5px',
        fontWeight: 'bold',
        fontSize: '14px',
        color: '#333'
      }}>
        {data.label}
      </div>
    </div>
  );
};

// Improved edge component with bend points
function StepEdge({ id, sourceX, sourceY, targetX, targetY, data, style = {}, markerEnd }: any) {
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
      style={{
        ...style,
        stroke: '#999',
        strokeWidth: 1.5
      }}
      markerEnd={markerEnd}
    />
  );
}

// Register node and edge types
const nodeTypes = {
  custom: CustomNode,
  group: GroupNode
};

const edgeTypes = {
  step: StepEdge,
};

// Define initial ELK graph
const getInitialElkGraph = () => {
  return {
    "id": "root",
    "children": [
      { 
        "id": "ui",
        "labels": [{ "text": "UI" }],
        "children": [
          { 
            "id": "webapp",        
            "labels": [{ "text": "Web App" }]
          }
        ]
      },
      { 
        "id": "aws",
        "labels": [{ "text": "AWS" }],
        "children": [
          { 
            "id": "api",  
            "labels": [{ "text": "API" }]
          },
          { 
            "id": "lambda",
            "labels": [{ "text": "Lambda" }],
            "children": [
              { 
                "id": "query", 
                "labels": [{ "text": "Query" }]
              },
              { 
                "id": "pdf", 
                "labels": [{ "text": "PDF" }]
              },
              { 
                "id": "fetch", 
                "labels": [{ "text": "Fetch" }]
              },
              { 
                "id": "chat", 
                "labels": [{ "text": "Chat" }]
              }
            ],
            "edges": [
              { "id": "e6", "sources": [ "chat" ], "targets": [ "fetch" ] }
            ]
          },
          { 
            "id": "vector", 
            "labels": [{ "text": "Vector" }]
          },
          { 
            "id": "storage", 
            "labels": [{ "text": "Storage" }]
          }
        ],
        "edges": [
          { "id": "e1", "sources": [ "api" ], "targets": ["lambda" ] },
          { "id": "e2", "sources": [ "query" ], "targets": ["vector" ] },
          { "id": "e3", "sources": [ "pdf" ], "targets": ["vector" ] },
          { "id": "e4", "sources": [ "pdf" ], "targets": ["storage" ] },
          { "id": "e5", "sources": [ "fetch" ], "targets": ["storage" ] }
        ]
      },
      { 
        "id": "openai", 
        "labels": [{ "text": "OpenAI" }],
        "children": [
          { 
            "id": "embed", 
            "labels": [{ "text": "Embed" }]
          },
          { 
            "id": "chat_api", 
            "labels": [{ "text": "Chat API" }]
          }
        ]
      }
    ],
    "edges": [
      { "id": "e0", "sources": [ "webapp" ], "targets": [ "api" ] },
      { "id": "e7", "sources": [ "chat" ], "targets": ["chat_api" ] },
      { "id": "e8", "sources": [ "embed" ], "targets": [ "query" ] },
      { "id": "e9", "sources": [ "embed" ], "targets": [ "pdf" ] }
    ]
  };
};

// Helper to find a node by ID
const findNodeById = (node: any, id: string) => {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
};

// ELK graph layout options
const ROOT_DEFAULT_OPTIONS = {
  layoutOptions: {
    "algorithm": "layered",
    "elk.direction": "RIGHT",
    "hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    "elk.layered.considerModelOrder": true,
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    "elk.layered.nodePlacement.favorStraightEdges": true,
    "elk.layered.cycleBreaking.strategy": "INTERACTIVE",
    "spacing.edgeNode": 30,
    "spacing.nodeNode": 30,
    "spacing.edgeEdge": 30,
    "spacing.nodeNodeBetweenLayers": 40,
    "spacing.edgeNodeBetweenLayers": 40,
    "spacing.edgeEdgeBetweenLayers": 30,
  }
};

const NON_ROOT_DEFAULT_OPTIONS = {
  width: 80,
  height: 50,
  layoutOptions: {
    "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
    "elk.padding": "[top=30.0,left=30.0,bottom=30.0,right=30.0]",
    "elk.layered.nodePlacement.favorStraightEdges": true,
    "elk.layered.priority.shortness": 100, 
    "spacing.edgeNode": 30,
    "spacing.nodeNode": 30,
    "spacing.edgeEdge": 30,
    "spacing.nodeNodeBetweenLayers": 40,
    "spacing.edgeNodeBetweenLayers": 40,
    "spacing.edgeEdgeBetweenLayers": 30,
  }
};

// Helper functions from ElkRender
function ensureIds(node: any, parentId: string = '') {
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
}

// Helper to flatten the graph coordinates for ReactFlow
function flattenGraph(
  node: any,
  parentX: number,
  parentY: number,
  accum: { nodes: any[]; edges: any[] }
) {
  const absX = (node.x ?? 0) + parentX;
  const absY = (node.y ?? 0) + parentY;

  // Shallow copy w/ absolute coords
  const newNode = { ...node, x: absX, y: absY };
  accum.nodes.push(newNode);

  if (Array.isArray(node.edges)) {
    for (const edge of node.edges) {
      const newEdge = {
        ...edge,
        sections: (edge.sections || []).map((section: any) => {
          const start = {
            x: section.startPoint.x + absX,
            y: section.startPoint.y + absY,
          };
          const end = {
            x: section.endPoint.x + absX,
            y: section.endPoint.y + absY,
          };
          const bendPoints = (section.bendPoints || []).map((bp: any) => ({
            x: bp.x + absX,
            y: bp.y + absY,
          }));
          return { ...section, startPoint: start, endPoint: end, bendPoints };
        }),
      };
      accum.edges.push(newEdge);
    }
  }

  // Recurse
  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => {
      flattenGraph(child, absX, absY, accum);
    });
  }
}

// Helper to process layouted ELK graph to ReactFlow format
const processLayoutedGraph = (layoutedGraph: any) => {
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

// Graph manipulation functions
// Add a node to the graph
const addNode = (nodeName: string, parentId: string, graph: any) => {
  // Find the parent node
  const parentNode = findNodeById(graph, parentId);
  if (!parentNode) {
    throw new Error(`Parent node '${parentId}' not found`);
  }
  
  // Create the new node
  const newNode = {
    id: nodeName,
    labels: [{ text: nodeName }]
  };
  
  // Ensure parent has a children array
  if (!parentNode.children) {
    parentNode.children = [];
  }
  
  // Add the new node to the parent's children
  parentNode.children.push(newNode);
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
};

// Delete a node from the graph
const deleteNode = (nodeId: string, graph: any) => {
  // Recursive function to find and remove the node
  const removeNodeFromChildren = (children: any[], nodeId: string): boolean => {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.id === nodeId) {
        // Remove the node
        children.splice(i, 1);
        return true;
      }
      if (child.children) {
        if (removeNodeFromChildren(child.children, nodeId)) {
          return true;
        }
      }
    }
    return false;
  };
  
  // Start the search from the root's children
  if (!graph.children) {
    throw new Error('Graph has no children');
  }
  
  const nodeRemoved = removeNodeFromChildren(graph.children, nodeId);
  if (!nodeRemoved) {
    throw new Error(`Node '${nodeId}' not found`);
  }
  
  // Remove any edges that reference this node
  const removeEdgesWithNode = (node: any, nodeId: string) => {
    if (node.edges) {
      node.edges = node.edges.filter((edge: any) => {
        return !edge.sources.includes(nodeId) && !edge.targets.includes(nodeId);
      });
    }
    if (node.children) {
      node.children.forEach((child: any) => removeEdgesWithNode(child, nodeId));
    }
  };
  
  removeEdgesWithNode(graph, nodeId);
  
  // Also clean up root-level edges
  if (graph.edges) {
    graph.edges = graph.edges.filter((edge: any) => {
      return !edge.sources.includes(nodeId) && !edge.targets.includes(nodeId);
    });
  }
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
};

// Move a node to a different parent
const moveNode = (nodeId: string, newParentId: string, graph: any) => {
  // Find the node to move
  let nodeToMove: any = null;
  let oldParent: any = null;
  let oldParentChildren: any[] = [];
  
  const findNodeAndParent = (node: any, parent: any, nodeId: string) => {
    if (!node.children) return false;
    
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.id === nodeId) {
        nodeToMove = child;
        oldParent = node;
        oldParentChildren = node.children;
        return true;
      }
      if (child.children && findNodeAndParent(child, node, nodeId)) {
        return true;
      }
    }
    return false;
  };
  
  findNodeAndParent(graph, null, nodeId);
  
  if (!nodeToMove) {
    throw new Error(`Node '${nodeId}' not found`);
  }
  
  // Find the new parent
  const newParent = findNodeById(graph, newParentId);
  if (!newParent) {
    throw new Error(`New parent node '${newParentId}' not found`);
  }
  
  // Remove node from old parent
  oldParentChildren.splice(oldParentChildren.indexOf(nodeToMove), 1);
  
  // Add node to new parent
  if (!newParent.children) {
    newParent.children = [];
  }
  newParent.children.push(nodeToMove);
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
};

// Add an edge between nodes
const addEdge = (edgeId: string, containerId: string | null, sourceId: string, targetId: string, graph: any) => {
  // Find the source and target nodes
  const sourceNode = findNodeById(graph, sourceId);
  const targetNode = findNodeById(graph, targetId);
  
  if (!sourceNode) {
    throw new Error(`Source node '${sourceId}' not found`);
  }
  if (!targetNode) {
    throw new Error(`Target node '${targetId}' not found`);
  }
  
  // Find the lowest common ancestor to place the edge
  const getNodePath = (node: any, id: string, path: any[] = []): any[] | null => {
    if (node.id === id) {
      return [...path, node];
    }
    if (!node.children) {
      return null;
    }
    for (let child of node.children) {
      const result = getNodePath(child, id, [...path, node]);
      if (result) {
        return result;
      }
    }
    return null;
  };
  
  const sourcePath = getNodePath(graph, sourceId, []);
  const targetPath = getNodePath(graph, targetId, []);
  
  if (!sourcePath || !targetPath) {
    throw new Error('Could not determine paths to nodes');
  }
  
  // Find the lowest common ancestor
  let commonAncestorIndex = 0;
  while (
    commonAncestorIndex < sourcePath.length &&
    commonAncestorIndex < targetPath.length &&
    sourcePath[commonAncestorIndex].id === targetPath[commonAncestorIndex].id
  ) {
    commonAncestorIndex++;
  }
  
  const commonAncestor = containerId ? 
    findNodeById(graph, containerId) : 
    sourcePath[commonAncestorIndex - 1] || graph;
  
  // Create the edge object
  const newEdge = {
    id: edgeId,
    sources: [sourceId],
    targets: [targetId]
  };
  
  // Add the edge to the common ancestor
  if (!commonAncestor.edges) {
    commonAncestor.edges = [];
  }
  
  commonAncestor.edges.push(newEdge);
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
};

// Delete an edge
const deleteEdge = (edgeId: string, graph: any) => {
  // Recursive function to find and remove the edge
  const removeEdgeFromNode = (node: any, edgeId: string): boolean => {
    if (node.edges) {
      const initialLength = node.edges.length;
      node.edges = node.edges.filter((edge: any) => edge.id !== edgeId);
      if (node.edges.length < initialLength) {
        return true;
      }
    }
    
    if (node.children) {
      for (let child of node.children) {
        if (removeEdgeFromNode(child, edgeId)) {
          return true;
        }
      }
    }
    
    return false;
  };
  
  // Try to remove from root level
  if (graph.edges) {
    const initialLength = graph.edges.length;
    graph.edges = graph.edges.filter((edge: any) => edge.id !== edgeId);
    if (graph.edges.length < initialLength) {
      return JSON.parse(JSON.stringify(graph)); // Edge found and removed
    }
  }
  
  // If not found at root, search through all nodes
  const edgeRemoved = removeEdgeFromNode(graph, edgeId);
  if (!edgeRemoved) {
    throw new Error(`Edge '${edgeId}' not found`);
  }
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
};

// Group nodes together
const groupNodes = (nodeIds: string[], parentId: string, groupId: string, graph: any) => {
  // Find the parent node
  const parentNode = findNodeById(graph, parentId);
  if (!parentNode) {
    throw new Error(`Parent node '${parentId}' not found`);
  }
  
  // Ensure parent has a children array
  if (!parentNode.children) {
    parentNode.children = [];
  }
  
  // Create the new group node
  const groupNode = {
    id: groupId,
    labels: [{ text: groupId }],
    children: [] as any[]
  };
  
  // Move each node to the group
  for (const nodeId of nodeIds) {
    let found = false;
    
    // Find the node and move it
    for (let i = 0; i < parentNode.children.length; i++) {
      if (parentNode.children[i].id === nodeId) {
        groupNode.children.push(parentNode.children[i]);
        parentNode.children.splice(i, 1);
        found = true;
        break;
      }
    }
    
    if (!found) {
      throw new Error(`Node '${nodeId}' not found in parent '${parentId}'`);
    }
  }
  
  // Add the group node to the parent
  parentNode.children.push(groupNode);
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
};

// Remove a group, moving its children to the parent
const removeGroup = (groupId: string, graph: any) => {
  // Find the group and its parent
  let groupNode: any = null;
  let parentNode: any = null;
  
  const findGroupAndParent = (node: any, parent: any, groupId: string): boolean => {
    if (!node.children) return false;
    
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.id === groupId) {
        groupNode = child;
        parentNode = node;
        return true;
      }
      if (child.children && findGroupAndParent(child, node, groupId)) {
        return true;
      }
    }
    return false;
  };
  
  findGroupAndParent(graph, null, groupId);
  
  if (!groupNode) {
    throw new Error(`Group '${groupId}' not found`);
  }
  
  // Get the index of the group in the parent
  const groupIndex = parentNode.children.indexOf(groupNode);
  
  // Get the children of the group
  const groupChildren = groupNode.children || [];
  
  // Replace the group with its children
  parentNode.children.splice(groupIndex, 1, ...groupChildren);
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
};

const elkGraphDescription = `
The graph structure follows these rules:
1. Each node has a unique ID and can have children
2. Edges connect nodes using source and target IDs
3. Nodes can be grouped using the "children" property
4. The layout is handled by ELK.js with these settings:
   - algorithm: "layered"
   - direction: "RIGHT"
   - spacing: { nodeNode: 50, nodeEdge: 50 }
   - padding: { top: 20, left: 20, right: 20, bottom: 20 }
`;

const minimalSessionUpdate = {
  type: "conversation.item.create",
  item: {
    type: "message",
    role: "user",
    content: [
      {
        type: "input_text",
        text: "You have access to the following tools:\n- display_elk_graph\n- add_node\n- delete_node\n- move_node\n- add_edge\n- delete_edge\n- group_nodes\n- remove_group"
      }
    ]
  }
};

// Define the instruction to include with all function responses
const agentInstruction = "Under no circumstances should you say anything to the user, do not acknowledge their requests, do not explain your actions, do not acknowledge your function call, do not ask if they have further modificaitons, don't ask what's the next action they want you to perform, do not say you are ready for the next instruction, do not say next instruction please, don't say you are listening for the next instruction, just listen quitely for the next instruction.";

const InteractiveCanvas: React.FC<InteractiveCanvasProps> = ({
  isSessionActive = false,
  startSession = () => {},
  stopSession = () => {},
  sendTextMessage = () => {},
  sendClientEvent = () => {},
  events = [],
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [elkGraph, setElkGraph] = useState(getInitialElkGraph());
  const [layoutedElkGraph, setLayoutedElkGraph] = useState<any>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    
    // Ensure edges remain visible after any node changes (selection, position, etc.)
    setTimeout(() => {
      setEdges(currentEdges => 
        currentEdges.map(edge => ({
          ...edge,
          hidden: false,
          style: {
            ...edge.style,
            opacity: 1,
            zIndex: 3000,
          },
          zIndex: 3000
        }))
      );
    }, 0);
  }, []);
  
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(eds => {
      // Apply the changes
      const updatedEdges = applyEdgeChanges(changes, eds);
      
      // Then ensure edges are always visible
      return updatedEdges.map(edge => ({
        ...edge,
        hidden: false,
        style: {
          ...edge.style,
          opacity: 1,
          zIndex: 3000,
        },
        zIndex: 3000
      }));
    });
  }, []);
  // Use useMemo to persist the ELK instance across renders
  const elk = useMemo(() => new ELK(), []);
  // Add a layoutVersion state to track when layouts actually change
  const [layoutVersion, setLayoutVersion] = useState(0);
  // Use refs to compare previous graph and layout results
  const prevElkGraphRef = useRef<string>('');
  const prevLayoutResultRef = useRef<any>(null);
  
  // State to track edge visibility (keeping minimal state for the fix)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  
  // Add state to track message sending status
  const [messageSendStatus, setMessageSendStatus] = useState({
    sending: false,
    retrying: false,
    retryCount: 0,
    lastError: null
  });
  
  // Helper function to generate a more robust hash for graph comparison
  const getGraphHash = (graph: any) => {
    try {
      // Extract the structure that matters for layout
      const simplifiedGraph = {
        id: graph.id,
        nodeCount: countNodes(graph),
        edgeCount: countEdges(graph),
        structure: extractStructure(graph)
      };
      return JSON.stringify(simplifiedGraph);
    } catch (e) {
      console.error("Error generating graph hash:", e);
      return Math.random().toString(); // Force update if hash generation fails
    }
  };
  
  // Helper to count total nodes in the graph
  const countNodes = (node: any): number => {
    if (!node) return 0;
    let count = 1; // Count this node
    if (Array.isArray(node.children)) {
      node.children.forEach((child: any) => {
        count += countNodes(child);
      });
    }
    return count;
  };
  
  // Helper to count total edges in the graph
  const countEdges = (node: any): number => {
    if (!node) return 0;
    let count = node.edges ? node.edges.length : 0;
    if (Array.isArray(node.children)) {
      node.children.forEach((child: any) => {
        count += countEdges(child);
      });
    }
    return count;
  };
  
  // Extract essential structure for comparison
  const extractStructure = (node: any): any => {
    if (!node) return null;
    const result: any = {
      id: node.id,
    };
    
    if (node.edges && node.edges.length > 0) {
      result.edges = node.edges.map((edge: any) => ({
        id: edge.id,
        sources: edge.sources,
        targets: edge.targets
      }));
    }
    
    if (node.children && node.children.length > 0) {
      result.children = node.children.map((child: any) => 
        extractStructure(child)
      );
    }
    
    return result;
  };

  // Add a queue for pending messages
  const pendingMessagesRef = useRef<any[]>([]);

  // Update the helper function to track retry status and check connection state
  const safeSendClientEvent = useCallback((message: any) => {
    // Enqueue the message instead of trying to send directly
    console.log("Queueing message for sending");
    pendingMessagesRef.current.push(message);
  }, []);

  // Add initialization flag
  const initSentRef = useRef(false);

  // Connect with the WebRTC session
  useEffect(() => {
    if (!isSessionActive) {
      // If we're not active, we should show a welcome message
      setMessages([
        { 
          id: "welcome", 
          content: "Welcome to the interactive console. Start a session to begin chatting with the AI.", 
          sender: "assistant" 
        }
      ]);
      
      // Clear any pending messages when session is inactive
      pendingMessagesRef.current = [];
      // Reset the initialization flag when session becomes inactive
      initSentRef.current = false;
      console.log("Session inactive, cleared pending messages queue and reset init flag");
    } else if (events && events.length > 0) {
      // Look for the session.created event AND make sure we haven't sent init messages yet
      if (!initSentRef.current && events.some(event => event.type === 'session.created')) {
        console.log('Sending initial tool-definition messages');
        
        // Queue messages instead of trying to send them directly
        pendingMessagesRef.current.push(minimalSessionUpdate);
        
        // Queue the full description message directly (no setTimeout)
        pendingMessagesRef.current.push({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: `
                Under no circumstances should you say anything to the user, do not acknowledge their requests, do not explain your actions, just perform the actions they tell you to do.

                Here are the detailed instructions for creating and editing ELK.js graphs:\n\n${elkGraphDescription}\n\nYou can use the following tools to manipulate the graph:
                - display_elk_graph: Show the current graph
                - add_node: Add a new node to the graph
                - delete_node: Remove a node from the graph
                - move_node: Move a node to a different parent
                - add_edge: Create a connection between nodes
                - delete_edge: Remove a connection
                - group_nodes: Group multiple nodes together
                - remove_group: Ungroup nodes
                `
              }
            ]
          }
        });
        
        // Queue the response.create message
        pendingMessagesRef.current.push({ type: "response.create" });
        
        // Mark as initialized to prevent sending these messages again
        initSentRef.current = true;
      }
    }
  }, [isSessionActive, events]);

  // Process the graph manipulation messages
  useEffect(() => {
    if (!isSessionActive || !events || events.length === 0) return;

    // Handle text messages from the assistant
    const latestServerEvent = events
      .filter(event => 
        event.type === 'response.delta' && 
        event.delta?.type === 'message' && 
        event.delta?.content?.[0]?.type === 'text'
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
    if (latestServerEvent) {
      // Extract text from the event
      const text = latestServerEvent.delta.content[0].text;
      
      // Check if we already have this response
      const existingMessage = messages.find(msg => 
        msg.sender === 'assistant' && 
        msg.id === latestServerEvent.event_id
      );
      
      if (existingMessage) {
        // Update existing message
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            msg.id === latestServerEvent.event_id 
              ? { ...msg, content: text } 
              : msg
          )
        );
      } else {
        // Add new message
        setMessages(prevMessages => [
          ...prevMessages, 
          {
            id: latestServerEvent.event_id,
            content: text,
            sender: 'assistant'
          }
        ]);
      }
    }

    // Handle function calls
    const mostRecentEvent = events.find(event => 
      event.type === "response.done" && event.response?.output
    );

    if (mostRecentEvent && mostRecentEvent.type === "response.done" && mostRecentEvent.response.output) {
      mostRecentEvent.response.output.forEach((output) => {
        if (output.type === "function_call") {
          console.log("Agent output:", output);
          
          try {
            const args = JSON.parse(output.arguments);
            console.log("Function call:", output.name, args);
            let updatedGraph: any = null;
            
            // Process each function based on its name
            switch(output.name) {
              case "display_elk_graph":
                try {
                  console.log("display_elk_graph called with args:", args);
                  console.log("Current elkGraph:", elkGraph);
                  
                  updatedGraph = { ...elkGraph };
                  setElkGraph(updatedGraph);
                  
                  console.log("Sending graph to agent:", JSON.stringify(updatedGraph).substring(0, 100) + "...");
                  
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  
                  setTimeout(() => {
                    safeSendClientEvent({ type: "response.create" });
                  }, 200);
                } catch (displayError) {
                  console.error(`Error in display_elk_graph operation:`, displayError);
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in display_elk_graph operation: ${displayError.message}.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                }
                break;
                
              case "add_node":
                try {
                  updatedGraph = addNode(args.nodename, args.parentId, elkGraph);
                  console.log("Updated graph after add_node:", updatedGraph);
                  setElkGraph(updatedGraph);
                  
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                } catch (addError) {
                  console.error(`Error in add_node operation:`, addError);
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in add_node operation: ${addError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                }
                break;
                
              case "delete_node":
                try {
                  updatedGraph = deleteNode(args.nodeId, elkGraph);
                  console.log("Updated graph after delete_node:", updatedGraph);
                  setElkGraph(updatedGraph);
                  
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                } catch (deleteError) {
                  console.error(`Error in delete_node operation:`, deleteError);
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in delete_node operation: ${deleteError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                }
                break;
                
              case "move_node":
                try {
                  updatedGraph = moveNode(args.nodeId, args.newParentId, elkGraph);
                  console.log("Updated graph after move_node:", updatedGraph);
                  setElkGraph(updatedGraph);
                  
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                } catch (moveError) {
                  console.error(`Error in move_node operation:`, moveError);
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in move_node operation: ${moveError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                }
                break;
                
              case "add_edge":
                try {
                  updatedGraph = addEdge(args.edgeId, null, args.sourceId, args.targetId, elkGraph);
                  console.log("Updated graph after add_edge:", updatedGraph);
                  setElkGraph(updatedGraph);
                  
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                } catch (addEdgeError) {
                  console.error(`Error in add_edge operation:`, addEdgeError);
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in add_edge operation: ${addEdgeError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                }
                break;
                
              case "delete_edge":
                try {
                  updatedGraph = deleteEdge(args.edgeId, elkGraph);
                  console.log("Updated graph after delete_edge:", updatedGraph);
                  setElkGraph(updatedGraph);
                  
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                } catch (deleteEdgeError) {
                  console.error(`Error in delete_edge operation:`, deleteEdgeError);
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in delete_edge operation: ${deleteEdgeError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                }
                break;
                
              case "group_nodes":
                try {
                  updatedGraph = groupNodes(args.nodeIds, args.parentId, args.groupId, elkGraph);
                  console.log("Updated graph after group_nodes:", updatedGraph);
                  setElkGraph(updatedGraph);
                  
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                } catch (groupError) {
                  console.error(`Error in group_nodes operation:`, groupError);
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in group_nodes operation: ${groupError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                }
                break;
                
              case "remove_group":
                try {
                  updatedGraph = removeGroup(args.groupId, elkGraph);
                  console.log("Updated graph after remove_group:", updatedGraph);
                  setElkGraph(updatedGraph);
                  
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                } catch (removeGroupError) {
                  console.error(`Error in remove_group operation:`, removeGroupError);
                  safeSendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in remove_group operation: ${removeGroupError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  safeSendClientEvent({ type: "response.create" });
                }
                break;
                
              default:
                console.error(`Unknown function call: ${output.name}`);
                // Don't expose internal errors to the user
                break;
            }
          } catch (error) {
            console.error("Failed to process function call:", error);
          }
        }
      });
    }
  }, [events, elkGraph, safeSendClientEvent]); // add dependencies

  // Process ELK graph layout with optimization to prevent unnecessary re-layouts
  useEffect(() => {
    async function layoutGraph() {
      try {
        // Create a deep copy of the graph to avoid modifying the original
        const graphCopy = JSON.parse(JSON.stringify(elkGraph));
        
        // Apply defaults through ensureIds
        const graphWithOptions = ensureIds(graphCopy);
        
        // Create a more robust hash of the graph structure for comparison
        const graphHash = getGraphHash(graphWithOptions);
        
        // Skip layout if the graph hasn't meaningfully changed
        if (graphHash === prevElkGraphRef.current) {
          console.log('Graph structure unchanged, skipping layout');
          return;
        }
        
        // Store current hash for future comparison
        prevElkGraphRef.current = graphHash;
        
        console.log('Laying out graph with options:', graphWithOptions);
        
        const layoutResult = await elk.layout(graphWithOptions);
        console.log('Layout result:', layoutResult);
        
        // Compare layout results to see if anything meaningful changed
        if (prevLayoutResultRef.current) {
          const prevPositionsHash = JSON.stringify(extractPositions(prevLayoutResultRef.current));
          const newPositionsHash = JSON.stringify(extractPositions(layoutResult));
          
          if (prevPositionsHash === newPositionsHash) {
            console.log('Layout positions unchanged, skipping update');
            return;
          }
        }
        
        // Store current layout result for future comparison
        prevLayoutResultRef.current = layoutResult;
        
        // Update state with new layout
        setLayoutedElkGraph(layoutResult);
        setLayoutVersion(prev => prev + 1);
        
        // Process the layouted graph for ReactFlow
        const { nodes: reactFlowNodes, edges: reactFlowEdges } = processLayoutedGraph(layoutResult);
        setNodes(reactFlowNodes);
        setEdges(reactFlowEdges);
      } catch (err) {
        console.error("Error laying out graph:", err);
      }
    }
    
    // Extract node and edge positions for layout comparison
    const extractPositions = (graph: any) => {
      const positions: any = {};
      
      const extractNodePositions = (node: any, parentX = 0, parentY = 0) => {
        if (!node || !node.id) return;
        
        const absX = (node.x || 0) + parentX;
        const absY = (node.y || 0) + parentY;
        
        positions[node.id] = { x: absX, y: absY };
        
        if (node.children && node.children.length > 0) {
          node.children.forEach((child: any) => {
            extractNodePositions(child, absX, absY);
          });
        }
      };
      
      extractNodePositions(graph);
      return positions;
    };
    
    if (elkGraph) {
      layoutGraph();
    }
  }, [elkGraph]); // Remove elk from dependencies since it's now stable

  // Handle selection changes to ensure edges remain visible
  const onSelectionChange = useCallback(({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
    if (selectedNodes.length > 0) {
      const selectedIds = selectedNodes.map(node => node.id);
      
      // Is a group node selected?
      const hasGroupNode = selectedNodes.some(node => node.type === 'group');
      
      // Force edge visibility regardless of node type, but especially for group nodes
      setEdges(currentEdges => 
        currentEdges.map(edge => {
          const isConnectedToSelected = selectedIds.includes(edge.source) || selectedIds.includes(edge.target);
          
          return {
            ...edge,
            hidden: false, // Always force visibility
            style: {
              ...edge.style,
              opacity: 1,
              strokeWidth: isConnectedToSelected ? 2 : 1.5,
              stroke: isConnectedToSelected ? '#0066cc' : '#000',
              zIndex: 3000, // Super high z-index to ensure visibility
            },
            zIndex: 3000,
            animated: isConnectedToSelected,
          };
        })
      );
      
      // Update selected nodes tracking
      setSelectedNodeIds(selectedIds);
    } else {
      // Nothing selected - still ensure edges are visible
      setEdges(currentEdges => 
        currentEdges.map(edge => ({
          ...edge,
          hidden: false,
          style: {
            ...edge.style,
            opacity: 1,
            zIndex: 3000,
          },
          zIndex: 3000
        }))
      );
      
      setSelectedNodeIds([]);
    }
  }, []);

  // Critical fix to ensure edges remain visible at all times
  useEffect(() => {
    // Function to ensure all edges are visible always
    const ensureEdgesVisible = () => {
      setEdges(currentEdges => {
        // Always force all edges to be visible, regardless of current hidden state
        return currentEdges.map(edge => ({
          ...edge,
          hidden: false,
          style: {
            ...edge.style,
            opacity: 1,
            zIndex: 3000, // Very high z-index to ensure visibility
          },
          zIndex: 3000
        }));
      });
    };
    
    // Run the fix immediately
    ensureEdgesVisible();
    
    // Set up a more frequent periodic check to ensure edges remain visible
    const intervalId = setInterval(ensureEdgesVisible, 150);
    
    // Clear the interval on cleanup
    return () => clearInterval(intervalId);
  }, [setEdges, selectedNodeIds]); // Important: Add selectedNodeIds as dependency

  // Handle new edge connections - use functional update to avoid dependency on current elkGraph
  const onConnect = useCallback((params: any) => {
    // Create a unique edge ID
    const newEdgeId = `edge-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Before adding the edge, determine if we're dealing with a group node
      // In that case, ensure we're using the right handle ID format
      const sourceNode = nodes.find(n => n.id === params.source);
      const targetNode = nodes.find(n => n.id === params.target);
      
      // Apply special handling for group nodes
      if (sourceNode?.type === 'group' && !params.sourceHandle) {
        params.sourceHandle = 'right-0';
      }
      
      if (targetNode?.type === 'group' && !params.targetHandle) {
        params.targetHandle = 'left-0';
      }
      
      // Use functional update pattern to avoid dependency on current elkGraph state
      setElkGraph(currentGraph => {
        const updatedGraph = addEdge(
          newEdgeId,
          null, // container ID, use null to auto-determine
          params.source,
          params.target,
          currentGraph
        );
        
        return updatedGraph;
      });
      
      // No need to manually add to edges state - the layout effect will handle this
    } catch (error) {
      console.error("Error adding edge:", error);
    }
  }, [nodes]); // Add nodes as dependency

  const handleChatSubmit = (message: string) => {
    // Add the user message to the UI immediately
    const newMessage: Message = {
      id: Date.now().toString(),
      content: message,
      sender: "user",
    }
    
    setMessages((prev) => [...prev, newMessage])
    
    // If there's a session, send the message to the AI
    if (isSessionActive && sendTextMessage) {
      sendTextMessage(message)
    } else {
      // If no session, show a message prompting to start a session
      setTimeout(() => {
        setMessages((prev) => [
          ...prev, 
          { 
            id: `system-${Date.now()}`, 
            content: "Please start a session to chat with the AI.", 
            sender: "assistant" 
          }
        ])
      }, 500)
    }
  }

  // Add UI component to show the status
  const ConnectionStatus = () => (
    <div className={`absolute top-4 right-4 bg-white dark:bg-gray-900 rounded-lg shadow-lg p-3 z-20 backdrop-blur-sm border border-gray-200 dark:border-gray-800 pointer-events-auto ${messageSendStatus.retrying ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${isSessionActive 
          ? messageSendStatus.retrying 
            ? 'bg-yellow-500 dark:bg-yellow-400' 
            : 'bg-green-500 dark:bg-green-400'
          : 'bg-red-500 dark:bg-red-400'} ${messageSendStatus.sending ? 'animate-pulse' : ''}`}></span>
        <span className="text-sm font-medium text-black dark:text-white">
          {!isSessionActive 
            ? 'Disconnected' 
            : messageSendStatus.retrying
              ? `Retrying (${messageSendStatus.retryCount}/3)...`
              : messageSendStatus.sending
                ? 'Sending...'
                : 'Connected'}
        </span>
      </div>
      {messageSendStatus.lastError && messageSendStatus.retrying && (
        <div className="text-xs text-red-600 dark:text-red-400 mt-1">
          Connection issue, retrying...
        </div>
      )}
    </div>
  );

  // Process pending messages when connection becomes ready
  useEffect(() => {
    // Don't process messages if session is not active
    if (!isSessionActive) return;
    
    // Processor function that sends a single message and schedules the next one
    const processNextMessage = () => {
      if (pendingMessagesRef.current.length === 0) return;
      
      const message = pendingMessagesRef.current.shift();
      
      // Set sending status
      setMessageSendStatus(prev => ({ ...prev, sending: true, retrying: false, retryCount: 0 }));
      
      try {
        sendClientEvent(message);
        console.log("Successfully sent message");
        setMessageSendStatus(prev => ({ ...prev, sending: false, retrying: false }));
        
        // Schedule the next message with a delay to avoid flooding
        if (pendingMessagesRef.current.length > 0) {
          setTimeout(processNextMessage, 300);
        }
      } catch (error) {
        console.error("Error sending message:", error);
        setMessageSendStatus(prev => ({ 
          ...prev, 
          sending: false, 
          retrying: false,
          lastError: error 
        }));
        
        // Put the message back at front of queue for later retry
        if (message) {
          pendingMessagesRef.current.unshift(message);
        }
      }
    };
    
    // Start processing when we have messages to send
    if (pendingMessagesRef.current.length > 0) {
      processNextMessage();
    }
    
    // Debounced queue processor with delay
    const queueProcessorTimer = setInterval(() => {
      if (pendingMessagesRef.current.length > 0 && !messageSendStatus.sending) {
        processNextMessage();
      }
    }, 500);
    
    return () => clearInterval(queueProcessorTimer);
  }, [isSessionActive, sendClientEvent, messageSendStatus.sending]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-white dark:bg-black">
      <div className="flex-1 relative min-h-0 overflow-hidden">
        {/* ReactFlow container */}
        <div className="absolute inset-0 h-full w-full z-0">
          <ReactFlow 
            nodes={nodes} 
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            className="w-full h-full bg-gray-50 dark:bg-gray-950"
            defaultEdgeOptions={{
              style: { stroke: '#000', strokeWidth: 2 },
              animated: false,
              zIndex: 5000,
            }}
            fitView
            minZoom={0.2}
            maxZoom={3}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            zoomOnScroll
            panOnScroll
            panOnDrag
            selectionOnDrag
            elementsSelectable={true}
            nodesDraggable={true}
            nodesConnectable={true}
            selectNodesOnDrag={true}
            style={{ cursor: 'grab' }}
            elevateEdgesOnSelect={true}
            disableKeyboardA11y={false}
            edgesFocusable={true}
            edgesUpdatable={true}
            deleteKeyCode="Delete"
            connectOnClick={false}
            elevateNodesOnSelect={false} // Don't elevate nodes to keep edges visible
          >
            <Background 
              color="#333" 
              gap={16} 
              size={1}
              variant={BackgroundVariant.Dots}
            />
            <Controls 
              position="bottom-left" 
              showInteractive={true}
              showZoom={true}
              showFitView={true}
              style={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '8px',
                padding: '8px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                color: '#000'
              }}
            />
            <MiniMap 
              position="bottom-right"
              nodeStrokeWidth={3}
              nodeColor="#000"
              maskColor="rgba(255, 255, 255, 0.1)"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '8px',
                padding: '8px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
              }}
            />
          </ReactFlow>
        </div>
        
        {/* Chat overlay */}
        <div className="absolute top-10 left-4 z-10 max-w-md pointer-events-none">
          <div className="pointer-events-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg overflow-auto max-h-[calc(100vh - 200px)]">
            <ChatWindow messages={messages} isMinimized={true} />
          </div>
        </div>
      </div>
      
      {/* ChatBox at the bottom */}
      <div className="flex-none min-h-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg z-10">
        <ChatBox 
          onSubmit={handleChatSubmit} 
          isSessionActive={isSessionActive}
          onStartSession={startSession}
          onStopSession={stopSession}
        />
      </div>
      
      {/* Connection status indicator */}
      <ConnectionStatus />
    </div>
  )
}

export default InteractiveCanvas 