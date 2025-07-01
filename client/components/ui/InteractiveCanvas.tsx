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
import { ChatBoxProps, Message as ChatMessage, ChatWindowProps, InteractiveCanvasProps } from "../../types/chat"
import { CustomNode, NodeData, EdgeData, ElkGraph, ElkGraphNode, ElkGraphEdge } from "../../types/graph"
import { RawGraph } from "../graph/types/index"
import { getInitialElkGraph } from "../graph/initialGraph"
import { addNode, deleteNode, moveNode, addEdge, deleteEdge, groupNodes, removeGroup, batchUpdate } from "../graph/mutations"
import { process_user_requirements } from "../graph/userRequirements"
import { useElkToReactflowGraphConverter } from "../../hooks/useElkToReactflowGraphConverter"
import { useChatSession } from '../../hooks/useChatSession'
import { elkGraphDescription, agentInstruction } from '../../realtime/agentConfig'

// Import extracted components
import CustomNodeComponent from "../CustomNode"
import GroupNode from "../GroupNode"
import StepEdge from "../StepEdge"
import ConnectionStatus from "../ConnectionStatus"
import DevPanel from "../DevPanel"
import StreamViewer, { StreamViewerHandle } from "../StreamViewer"

import Chatbox from "./Chatbox"
import ChatWindow from "./ChatWindow"
// import DebugGeometry from '../DebugGeometry'

const ChatBox = Chatbox as React.ComponentType<ChatBoxProps>

const initialMessages: ChatMessage[] = [
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
  smoothstep: StepEdge  // Use StepEdge for both types
};

const InteractiveCanvas: React.FC<InteractiveCanvasProps> = ({
  isSessionActive = false,
  isConnecting = false,
  isAgentReady = false,
  startSession = () => {},
  stopSession = () => {},
  sendTextMessage = () => {},
  sendClientEvent = () => {},
  events = [],
}) => {
  // State for DevPanel visibility
  const [showDev, setShowDev] = useState(false);
  
  // State for StreamViewer visibility
  const [showStreamViewer, setShowStreamViewer] = useState(false);
  
  // State for visualization mode (ReactFlow vs SVG)
  const [useReactFlow, setUseReactFlow] = useState(true);
  
  // State for SVG content when in SVG mode
  const [svgContent, setSvgContent] = useState<string | null>(null);
  
  // State for SVG zoom
  const [svgZoom, setSvgZoom] = useState(1);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  
  // New state for showing debug information
  const [showElkDebug, setShowElkDebug] = useState(false);
  
  // Ref to access StreamViewer's start method directly
  const streamViewerRef = useRef<StreamViewerHandle | null>(null);
  
  // Use the new ElkFlow hook instead of managing ELK state directly
  const {
    // State
    rawGraph,
    layoutGraph,
    nodes,
    edges,
    layoutVersion,
    
    // Setters
    setRawGraph,
    setNodes,
    setEdges,
    
    // Handlers
    onNodesChange,
    onEdgesChange,
    onConnect,
    
  } = useElkToReactflowGraphConverter(getInitialElkGraph());
  

  
  // Handler for graph changes from DevPanel
  const handleGraphChange = useCallback((newGraph: RawGraph) => {
    console.group('[DevPanel] Graph Change');
    console.log('raw newGraph:', newGraph);
    setRawGraph(newGraph);
    console.log('…called setRawGraph');
    console.groupEnd();
  }, [setRawGraph]);
  
  // Memoize node and edge types to prevent recreation on each render
  const memoizedNodeTypes = useMemo(() => nodeTypes, []);
  const memoizedEdgeTypes = useMemo(() => edgeTypes, []);
  
  const {
    messages,
    isSending,
    messageSendStatus,
    handleChatSubmit,
    processEvents,
    safeSendClientEvent
  } = useChatSession({
    isSessionActive,
    sendTextMessage,
    sendClientEvent,
    events,
    elkGraph: rawGraph,
    setElkGraph: setRawGraph,
    elkGraphDescription,
    agentInstruction,
    addNode: addNode as any,
    deleteNode: deleteNode as any,
    moveNode: moveNode as any,
    addEdge: addEdge as any,
    deleteEdge: deleteEdge as any,
    groupNodes: groupNodes as any,
    removeGroup: removeGroup as any,
    batchUpdate: batchUpdate as any,
    process_user_requirements: process_user_requirements as any
  });
  
  // Process events when they change
  useEffect(() => {
    processEvents();
  }, [events, processEvents]);
  
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
          zIndex: 3000,
          // Set the label from data
          label: edge.data?.labelText || edge.label
        }));
      });
    };
    
    // Run the fix immediately
    ensureEdgesVisible();
    
    // Set up animation frame for next paint
    const id = requestAnimationFrame(ensureEdgesVisible);
    
    // Clean up
    return () => cancelAnimationFrame(id);
  }, [setEdges, layoutVersion]); // Run on mount and when layout changes

  // Update message handling to use the hook's state
  const handleNodeClick = useCallback((nodeId: string) => {
    if (!isSessionActive) return;
    
    const message = `I want to focus on node ${nodeId}`;
    safeSendClientEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'text', text: message }]
      }
    });
  }, [isSessionActive, safeSendClientEvent]);

  const handleEdgeClick = useCallback((edgeId: string) => {
    if (!isSessionActive) return;
    
    const message = `I want to focus on edge ${edgeId}`;
    safeSendClientEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'text', text: message }]
      }
    });
  }, [isSessionActive, safeSendClientEvent]);

  // Function to generate SVG directly from layoutGraph
  const generateSVG = useCallback((layoutedGraph: any): string => {
    if (!layoutedGraph) return '';
    
    // Create accumulator for flattened nodes and edges
    const collected = { nodes: [] as any[], edges: [] as any[] };
    
    // Helper function to flatten graph with proper coordinates
    const flattenGraph = (
      node: any,
      parentX: number = 0,
      parentY: number = 0
    ) => {
      const absX = (node.x ?? 0) + parentX;
      const absY = (node.y ?? 0) + parentY;
      
      // Add node with absolute coordinates
      collected.nodes.push({
        ...node,
        x: absX,
        y: absY,
        isContainer: Array.isArray(node.children) && node.children.length > 0
      });
      
      // Process edges
      if (Array.isArray(node.edges)) {
        for (const edge of node.edges) {
          const edgeCopy = { ...edge };
          if (edge.sections) {
            edgeCopy.sections = edge.sections.map((section: any) => {
              return {
                ...section,
                startPoint: {
                  x: section.startPoint.x + absX,
                  y: section.startPoint.y + absY
                },
                endPoint: {
                  x: section.endPoint.x + absX,
                  y: section.endPoint.y + absY
                },
                bendPoints: section.bendPoints ? section.bendPoints.map((bp: any) => ({
                  x: bp.x + absX,
                  y: bp.y + absY
                })) : []
              };
            });
          }
          collected.edges.push(edgeCopy);
        }
      }
      
      // Recurse through children
      if (Array.isArray(node.children)) {
        node.children.forEach((child: any) => {
          flattenGraph(child, absX, absY);
        });
      }
    };
    
    // Start the flattening process
    flattenGraph(layoutedGraph);
    
    const { nodes, edges } = collected;
    
    // Calculate bounding box
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const node of nodes) {
      const x2 = node.x + (node.width ?? 120);
      const y2 = node.y + (node.height ?? 60);
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (x2 > maxX) maxX = x2;
      if (y2 > maxY) maxY = y2;
    }
    
    const padding = 20;
    const svgWidth = maxX - minX + padding * 2;
    const svgHeight = maxY - minY + padding * 2;
    
    const shiftX = (x: number) => x - minX + padding;
    const shiftY = (y: number) => y - minY + padding;
    
    // Collect all unique icons used in nodes for embedding
    const usedIcons = new Set<string>();
    for (const node of nodes) {
      let icon = node.data?.icon;
      
      // Special case for root node
      if (node.id === 'root' && !icon) {
        icon = 'root';
      }
      
      if (icon) {
        usedIcons.add(icon);
      }
    }
    
    // Start building SVG
    let svg = `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;
    
    // Add defs for markers and icons
    svg += `<defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" 
        markerWidth="6" markerHeight="6" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#2d6bc4" />
      </marker>
    </defs>`;
    
    // Draw nodes
    for (const node of nodes) {
      const x = shiftX(node.x);
      const y = shiftY(node.y);
      const width = node.width ?? 120;
      const height = node.height ?? 60;
      const isContainer = node.isContainer;
      const fill = isContainer ? "#f0f4f8" : "#d0e3ff";
      
      // Debug icon data
      console.log(`Node ${node.id} data:`, {
        label: node.data?.label || (node.labels && node.labels[0]?.text) || node.id,
        icon: node.data?.icon,
        hasData: !!node.data,
        hasIcon: !!node.data?.icon
      });
      
      svg += `
        <rect x="${x}" y="${y}" width="${width}" height="${height}" 
          fill="${fill}" stroke="#2d6bc4" stroke-width="2" rx="5" ry="5" />
      `;
      
      // Add label if it exists
      const label = node.data?.label || (node.labels && node.labels[0]?.text) || node.id;
      
      // Special handling - if it's the root node or if node has explicit icon in data
      let icon = node.data?.icon;
      
      // If it's the root node and doesn't already have an icon, assign root icon
      if (node.id === 'root' && !icon) {
        icon = 'root';
      }

      if (label) {
        if (isContainer) {
          // Group node - label at center
          svg += `
            <text x="${x + width/2}" y="${y + height/2}" 
              text-anchor="middle" dominant-baseline="middle" 
              font-size="14" font-weight="bold" fill="#2d6bc4">${label}</text>
          `;
          
          // Add icon for container nodes too at the top
          if (icon) {
            // Direct image embedding approach
            svg += `
              <image x="${x + width/2 - 15}" y="${y + 10}" width="30" height="30" 
                 href="/assets/canvas/${icon}.svg" />
            `;
          }
        } else {
          // Regular node - label at bottom
          svg += `
            <text x="${x + width/2}" y="${y + height - 10}" 
              text-anchor="middle" dominant-baseline="middle" 
              font-size="12" font-weight="bold" fill="#2d6bc4">${label}</text>
          `;
          
          // Add icon if specified, otherwise use first letter
          if (icon) {
            // Direct image embedding approach
            svg += `
              <image x="${x + width/2 - 20}" y="${y + 10}" width="40" height="40"
                href="/assets/canvas/${icon}.svg" />
            `;
          } else {
            // Fallback to first letter in a circle
            const iconLetter = label.charAt(0).toUpperCase();
            svg += `
              <circle cx="${x + width/2}" cy="${y + height/2 - 10}" r="15" fill="#2d6bc4" />
              <text x="${x + width/2}" y="${y + height/2 - 6}" 
                text-anchor="middle" dominant-baseline="middle" 
                font-size="14" font-weight="bold" fill="white">${iconLetter}</text>
            `;
          }
        }
      }
      
      // Add node ID as smaller text below
      svg += `
        <text x="${x + width/2}" y="${y + height - 2}" 
          text-anchor="middle" dominant-baseline="baseline" 
          font-size="9" fill="#666666">(${node.id})</text>
      `;
    }
    
    // Draw edges
    for (const edge of edges) {
      if (edge.sections) {
        for (const section of edge.sections) {
          const startX = shiftX(section.startPoint.x);
          const startY = shiftY(section.startPoint.y);
          const endX = shiftX(section.endPoint.x);
          const endY = shiftY(section.endPoint.y);
          
          let points = `${startX},${startY}`;
          
          // Add bend points if they exist
          if (section.bendPoints && section.bendPoints.length > 0) {
            for (const bp of section.bendPoints) {
              points += ` ${shiftX(bp.x)},${shiftY(bp.y)}`;
            }
          }
          
          points += ` ${endX},${endY}`;
          
          svg += `
            <polyline points="${points}" fill="none" stroke="#2d6bc4" 
              stroke-width="2" marker-end="url(#arrow)" />
          `;
          
          // Add edge label if it exists
          if (edge.labels && edge.labels.length > 0) {
            const rawLabel = edge.labels[0];
            // Use the edge section's coordinates directly or fall back to calculated positions
            let labelX, labelY;
            
            // If section contains labelPos, use that directly
            if (section.labelPos) {
              labelX = shiftX(section.labelPos.x);
              labelY = shiftY(section.labelPos.y);
            } 
            // Otherwise, use the midpoint of the edge as fallback
            else if (section.bendPoints && section.bendPoints.length > 0) {
              // If there are bend points, use the middle one
              const middleIndex = Math.floor(section.bendPoints.length / 2);
              labelX = shiftX(section.bendPoints[middleIndex].x);
              labelY = shiftY(section.bendPoints[middleIndex].y);
            } else {
              // For straight edges, use the midpoint
              labelX = (startX + endX) / 2;
              labelY = (startY + endY) / 2;
            }
            
            // Draw label with higher z-index to ensure visibility
            svg += `
              <text x="${labelX}" y="${labelY}" 
                text-anchor="middle" dominant-baseline="middle" 
                font-size="11" fill="#333" 
                paint-order="stroke"
                stroke="#fff" 
                stroke-width="3" 
                stroke-linecap="round" 
                stroke-linejoin="round">${rawLabel.text}</text>
            `;
          }
        }
      }
    }
    
    // Close SVG tag
    svg += '</svg>';
    
    return svg;
  }, []);

  // Handler for switching visualization modes
  const handleToggleVisMode = useCallback((reactFlowMode: boolean) => {
    setUseReactFlow(reactFlowMode);
    
    // If switching to SVG mode, generate SVG immediately if layoutGraph is available
    if (!reactFlowMode && layoutGraph) {
      const svgContent = generateSVG(layoutGraph);
      setSvgContent(svgContent);
    }
  }, [layoutGraph, generateSVG]);
  
  // Handler for receiving SVG content from DevPanel
  const handleSvgGenerated = useCallback((svg: string) => {
    console.log('[InteractiveCanvas] Received SVG content, length:', svg?.length || 0);
    setSvgContent(svg);
  }, []);

  // SVG zoom handler
  const handleSvgZoom = useCallback((delta: number) => {
    setSvgZoom(prev => {
      const newZoom = Math.max(0.2, Math.min(5, prev + delta));
      return newZoom;
    });
  }, []);

  // Effect to generate SVG content when needed
  useEffect(() => {
    if (!useReactFlow && !svgContent && layoutGraph) {
      const newSvgContent = generateSVG(layoutGraph);
      setSvgContent(newSvgContent);
    }
  }, [useReactFlow, svgContent, layoutGraph, generateSVG]);

  // Event handler for mousewheel to zoom SVG
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!useReactFlow && svgContainerRef.current && svgContainerRef.current.contains(e.target as Element)) {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          handleSvgZoom(delta);
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [useReactFlow, handleSvgZoom]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-white dark:bg-black">
      {/* Connection status indicator - moved to top-left */}
      <div className="absolute top-4 left-4 z-[101]">
        <ConnectionStatus 
          isSessionActive={isSessionActive}
          isConnecting={isConnecting}
          isAgentReady={isAgentReady}
          messageSendStatus={{
            sending: isSending,
            retrying: false,
            retryCount: 0,
            lastError: undefined
          }}
        />
      </div>

      <div className="flex-1 relative min-h-0 overflow-hidden">
        {/* ReactFlow container - only show when in ReactFlow mode */}
        {useReactFlow && (
          <div className="absolute inset-0 h-full w-full z-0">
            <ReactFlow 
              nodes={nodes} 
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              nodeTypes={memoizedNodeTypes}
              edgeTypes={memoizedEdgeTypes}
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
              {/* <DebugGeometry /> */}
            </ReactFlow>
          </div>
        )}
        
        {/* SVG Visualization - only show when in SVG mode */}
        {!useReactFlow && svgContent && (
          <div className="absolute inset-0 h-full w-full z-0 flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950 overflow-auto">
            <div className="relative" ref={svgContainerRef}>
              {/* Zoom controls */}
              <div className="absolute bottom-4 right-4 bg-white rounded-md shadow-sm flex gap-1 p-1 z-10">
                <button 
                  onClick={() => handleSvgZoom(-0.1)}
                  className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded"
                >
                  <span className="text-xl">−</span>
                </button>
                <button
                  onClick={() => setSvgZoom(1)} 
                  className="px-2 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-sm"
                >
                  {Math.round(svgZoom * 100)}%
                </button>
                <button 
                  onClick={() => handleSvgZoom(0.1)}
                  className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded"
                >
                  <span className="text-xl">+</span>
                </button>
              </div>
              
              {/* SVG content */}
              <div 
                className="svg-container shadow-lg rounded-lg bg-white transform origin-center transition-transform"
                style={{ transform: `scale(${svgZoom})` }}
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </div>
          </div>
        )}
        
        {/* Show a message when SVG mode is selected but no SVG is generated */}
        {!useReactFlow && !svgContent && (
          <div className="absolute inset-0 h-full w-full z-0 flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
            <div className="text-center p-6 bg-white rounded-lg shadow-lg">
              <p className="text-lg font-medium text-gray-700">No SVG visualization available</p>
              <p className="text-sm text-gray-500 mt-2">Click "Generate SVG" in the Dev Panel to create a visualization</p>
            </div>
          </div>
        )}
        
        {/* Chat overlay */}
        <div className="absolute top-10 left-4 z-10 max-w-md pointer-events-none">
          <div className="pointer-events-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg overflow-auto max-h-[calc(100vh - 200px)]">
            <ChatWindow messages={messages} isMinimized={true} />
          </div>
        </div>

        {/* Dev Panel Toggle Button and Visualization Toggle */}
        <div className="absolute top-4 right-4 z-[100] flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStreamViewer((p) => !p)}
              className="w-36 h-10 px-3 py-2 bg-white text-gray-700 rounded-md shadow-sm border border-gray-200 hover:bg-gray-50 text-sm font-medium flex items-center justify-center"
            >
              {showStreamViewer ? 'Hide Stream' : 'Show Stream'}
            </button>
          
          <button
            onClick={() => setShowDev((p) => !p)}
            className="w-36 h-10 px-3 py-2 bg-white text-gray-700 rounded-md shadow-sm border border-gray-200 hover:bg-gray-50 text-sm font-medium flex items-center justify-center"
          >
            {showDev ? 'Hide Dev Panel' : 'Show Dev Panel'}
          </button>
          </div>
          
          <div className="flex items-center gap-2">
          {/* Visualization Toggle */}
          <div className="w-36 h-10 flex items-center bg-white rounded-md shadow-sm border border-gray-200 px-3 py-2">
            <label className="inline-flex items-center cursor-pointer w-full">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={useReactFlow}
                  onChange={() => handleToggleVisMode(!useReactFlow)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </div>
              <span className="ml-3 text-sm font-medium text-gray-900">
                {useReactFlow ? 'ReactFlow' : 'SVG'}
              </span>
            </label>
          </div>
          
          {/* Debug Output Toggle */}
          <button
            onClick={() => setShowElkDebug((prev) => !prev)}
            className="w-36 h-10 px-3 py-2 bg-white text-gray-700 rounded-md shadow-sm border border-gray-200 hover:bg-gray-50 text-sm font-medium flex items-center justify-center"
          >
            {showElkDebug ? 'Hide ELK Data' : 'Show ELK Data'}
          </button>
          </div>
        </div>
        
        {/* StreamViewer - moved outside the button group */}
        <StreamViewer 
          elkGraph={rawGraph} 
          setElkGraph={setRawGraph} 
          ref={streamViewerRef}
          isVisible={showStreamViewer}
          onToggleVisibility={() => setShowStreamViewer(p => !p)}
        />
        
        {/* Debug panel to show raw ELK layout data */}
        {showElkDebug && (
          <div className="absolute top-24 right-4 z-50 max-w-lg max-h-[calc(100vh-200px)] overflow-auto bg-white rounded-md shadow-lg border border-gray-200 p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold">ELK Layout Data</h3>
              <button 
                onClick={() => setShowElkDebug(false)}
                className="p-1 rounded hover:bg-gray-100"
              >
                ✕
              </button>
            </div>
            <pre className="text-xs bg-gray-50 p-4 rounded-md overflow-auto max-h-[calc(100vh-300px)]">
              {JSON.stringify(layoutGraph, null, 2)}
            </pre>
          </div>
        )}
        
        {/* Dev Panel */}
        {showDev && (
          <div className="absolute top-16 right-4 z-50">
            <DevPanel 
              elkGraph={rawGraph} 
              onGraphChange={handleGraphChange}
              onToggleVisMode={handleToggleVisMode}
              useReactFlow={useReactFlow}
              onSvgGenerated={handleSvgGenerated}
            />
          </div>
        )}
      </div>
      
      {/* ChatBox at the bottom */}
      <div className="flex-none min-h-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg z-10">
        <ChatBox 
          onSubmit={handleChatSubmit} 
          isSessionActive={isSessionActive}
          isConnecting={isConnecting}
          isAgentReady={isAgentReady}
          onStartSession={startSession}
          onStopSession={stopSession}
          onTriggerReasoning={() => {
            if (streamViewerRef && streamViewerRef.current && streamViewerRef.current.start) {
              streamViewerRef.current.start();
            }
          }}
        />
      </div>
    </div>
  )
}

export default InteractiveCanvas 