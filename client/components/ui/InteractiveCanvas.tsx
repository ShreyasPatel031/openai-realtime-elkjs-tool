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
  const {
    messages,
    isSending,
    messageSendStatus,
    initSentRef,
    handleChatSubmit,
    processEvents,
    safeSendClientEvent
  } = useChatSession({
    isSessionActive,
    sendTextMessage,
    sendClientEvent,
    events
  });
  
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