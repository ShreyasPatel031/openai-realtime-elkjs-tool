"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, use } from "react"
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
import { cn } from "../../lib/utils"

// Import types from separate type definition files
import { ChatBoxProps, Message, ChatWindowProps, InteractiveCanvasProps } from "../../types/chat"
import { CustomNode, NodeData, EdgeData, ElkGraph, ElkGraphNode, ElkGraphEdge } from "../../types/graph"
import { ROOT_DEFAULT_OPTIONS, NON_ROOT_DEFAULT_OPTIONS } from "../graph/elk/elkOptions"
import { getInitialElkGraph } from "../graph/initialGraph"
import { addNode, deleteNode, moveNode, addEdge, deleteEdge, groupNodes, removeGroup } from "../graph/elk/mutations"
import { useElkFlow } from "../../hooks/useElkFlow"
import { useChatSession } from '../../hooks/useChatSession'

// Import extracted components
import CustomNodeComponent from "../CustomNode"
import GroupNode from "../GroupNode"
import StepEdge from "../StepEdge"
import ConnectionStatus from "../ConnectionStatus"

import Chatbox from "./Chatbox"
import ChatWindow from "./ChatWindow"

const ChatBox = Chatbox as React.ComponentType<ChatBoxProps>

const initialMessages: Message[] = [
  { id: "1", content: "Hello! How can I help you with the migration?", sender: "assistant" },
  { id: "2", content: "I need to migrate my database schema.", sender: "user" },
]

// Register node and edge types
const nodeTypes = {
  custom: CustomNodeComponent,
  group: GroupNode
};

const edgeTypes = {
  step: StepEdge,
};

export const elkGraphDescription = `You are a technical architecture diagram assistant. You can only interact with the system by calling the following functions:

- display_elk_graph(title): Call this first to retrieve and visualize the current graph layout.
- add_node(nodename, parentId): Add a component under a parent container. You cannot add a node if parentId doesnt exist.
- delete_node(nodeId): Remove an existing node.
- move_node(nodeId, newParentId): Move a node from one group/container to another.
- add_edge(edgeId, sourceId, targetId): Connect two nodes with a directional link. You must place this edge inside the nearest common ancestor container.
- delete_edge(edgeId): Remove an existing edge.
- group_nodes(nodeIds, parentId, groupId): Create a new container and move specified nodes into it.
- remove_group(groupId): Disband a group and promote its children to the parent.
- batch_update(operations): Apply a list of operations to the graph. If applying bath operations make sure that nodes to which you are applying exist.'

## Important:
1. If you have errors rectify them by calling the functions again and again till the reuqired objective is completed.

## Required Behavior:
1. Always call display_elk_graph first before any other action to understand the current structure.
2. You must never assume the layout or state—always infer structure from the latest graph after calling display_elk_graph.
3. Build clean architecture diagrams by calling only the provided functions. Avoid reasoning outside this structure.

## Best Practices:
- Use short, lowercase or snake_case nodename/nodeId identifiers.
- Parent-child structure should reflect logical grouping (e.g., "api" inside "aws").
- When adding edges, place them in the correct container—if both nodes are inside "aws", place the edge in aws.edges. If they are from different top-level containers, place the edge in root.edges.
- Prefer calling group_nodes when grouping related services (e.g., "auth" and "user" into "identity_group").

You are not allowed to write explanations, instructions, or visual output. You must interact purely by calling functions to update the architecture diagram.`;



// Define the instruction to include with all function responses
const agentInstruction = "Under no circumstances should you say anything to the user, do not acknowledge their requests, do not explain your actions, do not acknowledge your function call, do not ask if they have further modificaitons, do not ask what's the next action they want you to perform, do not say you are ready for the next instruction, do not say next instruction please, don't say you are listening for the next instruction, just listen quitely for the next instruction.";

const InteractiveCanvas: React.FC<InteractiveCanvasProps> = ({
  isSessionActive = false,
  startSession = () => {},
  stopSession = () => {},
  sendTextMessage = () => {},
  sendClientEvent = () => {},
  events = [],
}) => {
  // Use the new ElkFlow hook instead of managing ELK state directly
  const {
    // State
    elkGraph,
    nodes,
    edges,
    layoutVersion,
    
    // Setters
    setElkGraph,
    setNodes,
    setEdges,
    
    // Handlers
    onNodesChange,
    onEdgesChange,
    onConnect
  } = useElkFlow(getInitialElkGraph());
  
  const {
    messages,
    isSending,
    messageSendStatus,
    initSentRef,
    handleChatSubmit,
    processEvents,
    safeSendClientEvent,
    minimalSessionUpdate
  } = useChatSession({
    isSessionActive,
    sendTextMessage,
    sendClientEvent,
    events,
    elkGraph,
    setElkGraph,
    elkGraphDescription,
    agentInstruction,
    addNode,
    deleteNode,
    moveNode,
    addEdge,
    deleteEdge,
    groupNodes,
    removeGroup
  });
  
  // State to track edge visibility (keeping minimal state for the fix)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

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

  // Update message handling to use the hook's state
  const handleNodeClick = useCallback((nodeId: string) => {
    if (!isSessionActive) return;
    
    const message = `I want to focus on node ${nodeId}`;
    safeSendClientEvent({
      type: 'node_click',
      nodeId,
      message
    });
  }, [isSessionActive, safeSendClientEvent]);

  const handleEdgeClick = useCallback((edgeId: string) => {
    if (!isSessionActive) return;
    
    const message = `I want to focus on edge ${edgeId}`;
    safeSendClientEvent({
      type: 'edge_click',
      edgeId,
      message
    });
  }, [isSessionActive, safeSendClientEvent]);


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
            elevateNodesOnSelect={false}
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
      <ConnectionStatus 
        isSessionActive={isSessionActive}
        messageSendStatus={messageSendStatus}
      />
    </div>
  )
}

export default InteractiveCanvas 