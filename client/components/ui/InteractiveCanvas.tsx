"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, use } from "react"
import ReactFlow, { 
  Background, 
  Controls, 
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
import StreamViewer from "../StreamViewer"

import Chatbox from "./Chatbox"
import ChatWindow from "./ChatWindow"
import EditButton from "./EditButton"
import SignIn from "../auth/SignIn"
import ComingSoonCard from "../auth/ComingSoonCard"
// import DebugGeometry from '../DebugGeometry'
import { diagnoseStateSynchronization, cleanupDuplicateGroups } from '../../utils/graph_helper_functions'
import { ApiEndpointProvider } from '../../contexts/ApiEndpointContext'
import ProcessingStatusIcon from "../ProcessingStatusIcon"
import { auth, googleProvider } from "../../lib/firebase"
import { onAuthStateChanged, User, signInWithPopup } from "firebase/auth"

// Relaxed typing to avoid prop mismatch across layers
const ChatBox = Chatbox as React.ComponentType<any>

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
  apiEndpoint,
}) => {
  // State for DevPanel visibility
  const [showDev, setShowDev] = useState(false);
  
  // State for StreamViewer visibility
  const [showStreamViewer, setShowStreamViewer] = useState(false);
  
  // State for auth flow
  const [user, setUser] = useState<User | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // If user signs in, hide the sign-in modal and show the coming soon card
      if (currentUser) {
        setShowSignIn(false);
        setShowComingSoon(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Handler for the edit button click
  const handleEditClick = async () => {
    if (user) {
      setShowComingSoon(true);
    } else {
      try {
        await signInWithPopup(auth, googleProvider);
        // The onAuthStateChanged listener will handle showing the card
      } catch (error) {
        console.error("Error signing in with Google", error);
        // Optionally, show the sign-in modal as a fallback
        setShowSignIn(true);
      }
    }
  };
  
  // State for visualization mode (ReactFlow vs SVG)
  const [useReactFlow, setUseReactFlow] = useState(true);
  
  // State for SVG content when in SVG mode
  const [svgContent, setSvgContent] = useState<string | null>(null);
  
  // State for SVG zoom
  const [svgZoom, setSvgZoom] = useState(1);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  
  // New state for showing debug information
  const [showElkDebug, setShowElkDebug] = useState(false);
  
  // State for sync button
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Function to extract only core structural data (no layout/rendering config)
  const getStructuralData = useCallback((graph: any) => {
    if (!graph) return null;
    
    const extractStructuralData = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(extractStructuralData);
      }
      
      const structural: any = {};
      
      // Only keep core structural properties that define the graph's logical state
      const allowedProperties = [
        'id',           // Node/Edge identification
        'type',         // Node/Edge type
        'children',     // Hierarchical structure
        'edges',        // Edge connections
        'source',       // Edge source
        'target',       // Edge target
        'sourcePort',   // Edge source port
        'targetPort',   // Edge target port
        'labels',       // Text labels
        'properties',   // Custom properties
        'data',         // Custom data
        'text'          // Label text
      ];
      
      for (const [key, value] of Object.entries(obj)) {
        // Only include explicitly allowed structural properties
        if (allowedProperties.includes(key)) {
          // Recursively process objects and arrays
          if (typeof value === 'object' && value !== null) {
            structural[key] = extractStructuralData(value);
          } else {
            structural[key] = value;
          }
        }
      }
      
      return structural;
    };
    
    return extractStructuralData(graph);
  }, []);
  
  // Function to copy structural data to clipboard
  const copyStructuralDataToClipboard = useCallback((data: any) => {
    const jsonString = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      console.log('✅ Structural ELK data copied to clipboard');
    }).catch(err => {
      console.error('❌ Failed to copy to clipboard:', err);
    });
  }, []);
  
  // StreamViewer is now standalone and doesn't need refs
  
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
  
  // Ref to store ReactFlow instance for auto-zoom functionality
  const reactFlowRef = useRef<any>(null);

  // Removed individual tracking refs - now using unified fitView approach
  // Track agent busy state to disable input while drawing
  const [agentBusy, setAgentBusy] = useState(false);

  // Manual fit view function that can be called anytime
  const manualFitView = useCallback(() => {
    if (reactFlowRef.current) {
      try {
        reactFlowRef.current.fitView({
          padding: 0.2,
          duration: 800,
          maxZoom: 1.5,
          minZoom: 0.1
        });
      } catch (error) {
        console.warn('Failed to fit view:', error);
      }
    }
  }, []);

  // Unified auto-fit view: triggers on ANY graph state change
  useEffect(() => {
    // Only trigger if we have content and ReactFlow is ready
    if (nodes.length > 0 && reactFlowRef.current && layoutVersion > 0) {
      const timeoutId = setTimeout(() => {
        manualFitView();
      }, 200); // Unified delay to ensure layout is complete
      return () => clearTimeout(timeoutId);
    }
  }, [
    // Trigger on ANY significant graph change:
    nodes.length,           // When nodes are added/removed
    edges.length,           // When edges are added/removed  
    layoutVersion,          // When ELK layout completes (includes groups, moves, etc.)
    manualFitView
  ]);

    // Listen to global processing events to disable inputs while agent is drawing
  useEffect(() => {
    const start = () => setAgentBusy(true);
    const complete = () => setAgentBusy(false);
    
    window.addEventListener('userRequirementsStart', start);
    window.addEventListener('functionCallStart', start);
    window.addEventListener('reasoningStart', start);
    window.addEventListener('processingComplete', complete);
    
    return () => {
      window.removeEventListener('userRequirementsStart', start);
      window.removeEventListener('functionCallStart', start);
      window.removeEventListener('reasoningStart', start);
      window.removeEventListener('processingComplete', complete);
    };
  }, []);

  // Expose fitView function globally for debugging and manual use
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).manualFitView = manualFitView;
      
      return () => {
        delete (window as any).manualFitView;
      };
    }
  }, [manualFitView]);
  
  // Handler for ELK debug toggle with auto-copy
  const handleElkDebugToggle = useCallback(() => {
    const newShowState = !showElkDebug;
    setShowElkDebug(newShowState);
    
    // Auto-copy when showing debug data
    if (newShowState && layoutGraph) {
      const structuralData = getStructuralData(layoutGraph);
      copyStructuralDataToClipboard(structuralData);
    }
  }, [showElkDebug, layoutGraph, getStructuralData, copyStructuralDataToClipboard]);

  // Handler for graph sync
  const handleGraphSync = useCallback(() => {
    console.log('🔄 Syncing graph state with React Flow...');
    
    // Set loading state
    setIsSyncing(true);
    
    // Clear React Flow state first
    setNodes([]);
    setEdges([]);
    
    // Force a re-layout by creating a new reference to the raw graph
    // This will trigger the useEffect in the hook that calls ELK layout
    const syncedGraph = structuredClone(rawGraph);
    
    // Use a small delay to ensure clearing happens first
    setTimeout(() => {
      setRawGraph(syncedGraph);
      console.log('✅ Graph sync triggered - complete re-layout starting');
    }, 50);
    
    // Reset loading state after a longer delay as a fallback
    setTimeout(() => {
      setIsSyncing(false);
    }, 3000);
  }, [rawGraph, setRawGraph, setNodes, setEdges]);

  // Reset syncing state when layout is complete
  useEffect(() => {
    if (isSyncing && layoutVersion > 0) {
      // Layout has been updated, reset syncing state
      setIsSyncing(false);
    }
  }, [layoutVersion, isSyncing]);

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
  
  // Expose diagnostic functions to the window object for debugging
  useEffect(() => {
    // Import the diagnostic functions
    import('../../utils/graph_helper_functions').then(({ analyzeGraphState, forceEdgeReattachmentAnalysis, showGraphStructure, validateBatchOperations }) => {
      // Expose functions to window object
      (window as any).analyzeGraphState = () => {
        if (rawGraph) {
          analyzeGraphState(rawGraph as any);
        } else {
          console.warn('No graph available to analyze');
        }
      };
      
      (window as any).forceEdgeReattachmentAnalysis = () => {
        if (rawGraph) {
          const updatedGraph = forceEdgeReattachmentAnalysis(rawGraph as any);
          setRawGraph(updatedGraph);
          console.log('🔄 Edge reattachment analysis complete - graph updated');
        } else {
          console.warn('No graph available for edge reattachment analysis');
        }
      };
      
      (window as any).showGraphStructure = () => {
        if (rawGraph) {
          showGraphStructure(rawGraph as any);
        } else {
          console.warn('No graph available to show structure');
        }
      };
      
      (window as any).validateBatchOperations = (operations) => {
        if (!operations) {
          console.warn('Please provide operations array: validateBatchOperations([...operations])');
          return [];
        }
        return validateBatchOperations(operations);
      };
      
      // Also expose the current graph for direct access
      (window as any).getCurrentGraph = () => {
        return rawGraph;
      };
      
      // Expose setElkGraph for StreamExecutor
      (window as any).setElkGraph = (newGraph: any) => {
  
        setRawGraph(newGraph);
      };
      
      // Expose state synchronization diagnostic and cleanup function
      (window as any).diagnoseStateSynchronization = diagnoseStateSynchronization;
      (window as any).cleanupDuplicateGroups = () => {
        const cleaned = cleanupDuplicateGroups(rawGraph as any);
        setRawGraph(cleaned as any);
        return cleaned;
      };
      
          // Diagnostic functions exposed to window object for debugging
    });
    
    // Cleanup on unmount
    return () => {
      delete (window as any).analyzeGraphState;
      delete (window as any).forceEdgeReattachmentAnalysis;
      delete (window as any).showGraphStructure;
      delete (window as any).validateBatchOperations;
      delete (window as any).getCurrentGraph;
      delete (window as any).diagnoseStateSynchronization;
      delete (window as any).cleanupDuplicateGroups;
    };
  }, [rawGraph, setRawGraph]);
  
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
      
      // Add label if it exists (hide root label)
      const label = node.data?.label || (node.labels && node.labels[0]?.text) || (node.id === 'root' ? '' : node.id);
      
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
    <ApiEndpointProvider value={apiEndpoint}>
    <div className="w-full h-full flex flex-col overflow-hidden bg-white dark:bg-black">
      {/* Auth Modals */}
      {showSignIn && <SignIn onClose={() => setShowSignIn(false)} />}
      {user && showComingSoon && <ComingSoonCard onClose={() => setShowComingSoon(false)} />}

      {/* ProcessingStatusIcon - moved to top-left */}
      <div className="absolute top-4 left-4 z-[101]">
        <ProcessingStatusIcon />
      </div>

      {/* EditButton - new top-right button */}
      <div className="absolute top-4 right-4 z-[100]">
        <EditButton onClick={handleEditClick} />
      </div>

      {/* Connection status indicator - HIDDEN */}
      {/* 
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
      */}

      <div className="flex-1 relative min-h-0 overflow-hidden">
        {/* ReactFlow container - only show when in ReactFlow mode */}
        {useReactFlow && (
          <div className="absolute inset-0 h-full w-full z-0">
            <ReactFlow 
              ref={reactFlowRef}
              nodes={nodes} 
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              onInit={(instance) => {
                reactFlowRef.current = instance;
              }}
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
        
        {/* Chat overlay - HIDDEN */}
        {/* <div className="absolute top-10 left-4 z-10 max-w-md pointer-events-none">
          <div className="pointer-events-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg overflow-auto max-h-[calc(100vh - 200px)]">
            <ChatWindow messages={messages} isMinimized={true} />
          </div>
        </div> */}

        {/* Single Dev Panel Toggle - Replace all 5 buttons with one sleek toggle */}
        {/* This is now replaced by the EditButton */}
        
        {/* StreamViewer - moved outside the button group */}
        <StreamViewer 
          elkGraph={rawGraph} 
          setElkGraph={setRawGraph} 
          apiEndpoint={apiEndpoint}
        />
        
        {/* Debug panel to show structural ELK data */}
        {showElkDebug && (
          <div className="absolute top-24 right-4 z-50 max-w-lg max-h-[calc(100vh-200px)] overflow-auto bg-white rounded-md shadow-lg border border-gray-200 p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold">ELK Structural Data</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyStructuralDataToClipboard(getStructuralData(layoutGraph))}
                  className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-200 rounded hover:bg-blue-50"
                >
                  📋 Copy
                </button>
                <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                  Auto-copied
                </span>
                <button 
                  onClick={() => setShowElkDebug(false)}
                  className="p-1 rounded hover:bg-gray-100"
                >
                  ✕
                </button>
              </div>
            </div>
            <pre className="text-xs bg-gray-50 p-4 rounded-md overflow-auto max-h-[calc(100vh-300px)]">
              {JSON.stringify(getStructuralData(layoutGraph), null, 2)}
            </pre>
          </div>
        )}
        
        {/* Comprehensive Dev Panel - Contains all developer tools */}
        {showDev && (
          <div className="absolute top-16 right-4 z-50 w-80">
            <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
              {/* Panel Header */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Developer Panel</h3>
                  <button 
                    onClick={() => setShowDev(false)}
                    className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Panel Content */}
              <div className="p-4 space-y-4">
                {/* Streaming Controls */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">AI Streaming</label>
                  <button
                    onClick={() => setShowStreamViewer((p) => !p)}
                    className={`w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      showStreamViewer 
                        ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {showStreamViewer ? 'Hide AI Stream' : 'Show AI Stream'}
                  </button>
                </div>
                
                {/* Visualization Mode */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Visualization Mode</label>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <span className="text-sm text-gray-600">
                      {useReactFlow ? 'Interactive (ReactFlow)' : 'Static (SVG)'}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={useReactFlow}
                        onChange={() => handleToggleVisMode(!useReactFlow)}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
                
                {/* Graph Operations */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Graph Operations</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleGraphSync}
                      disabled={isSyncing}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isSyncing 
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200'
                      }`}
                    >
                      {isSyncing ? 'Syncing...' : 'Sync Graph'}
                    </button>
                    
                    <button
                      onClick={handleElkDebugToggle}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        showElkDebug 
                          ? 'bg-green-100 text-green-700 border border-green-200' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                      }`}
                    >
                      {showElkDebug ? 'Hide Debug' : 'ELK Debug'}
                    </button>
                  </div>
                </div>
                
                {/* Test Functions */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Test Functions</label>
                  <button
                    onClick={() => {
                      // Store test input
                      (window as any).chatTextInput = 'Create a simple web application with frontend and backend';
                      // Trigger processing
                      import("../graph/userRequirements").then(module => {
                        module.process_user_requirements();
                      });
                    }}
                    className="w-full px-3 py-2 rounded-md text-sm font-medium bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border border-yellow-200 transition-colors"
                  >
                    🧪 Test Function Calls
                  </button>
                </div>
                
                {/* Original Dev Panel Content */}
                <div className="border-t pt-4">
            <DevPanel 
              elkGraph={rawGraph} 
              onGraphChange={handleGraphChange}
              onToggleVisMode={handleToggleVisMode}
              useReactFlow={useReactFlow}
              onSvgGenerated={handleSvgGenerated}
            />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* ChatBox at the bottom */}
      <div className="flex-none min-h-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg z-10">
        <ChatBox 
          onSubmit={handleChatSubmit}
          isDisabled={agentBusy}
          isSessionActive={isSessionActive}
          isConnecting={isConnecting}
          isAgentReady={isAgentReady}
          onStartSession={startSession}
          onStopSession={stopSession}
          onTriggerReasoning={() => {
            console.log("Reasoning trigger - now handled directly by process_user_requirements");
          }}
        />
      </div>
    </div>
    </ApiEndpointProvider>
  )
}

export default InteractiveCanvas 