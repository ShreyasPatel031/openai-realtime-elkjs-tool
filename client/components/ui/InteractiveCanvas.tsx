"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import ReactFlow, { 
  Background, 
  Controls, 
  BackgroundVariant,
  Node,
  Edge,
  OnConnectStartParams
} from "reactflow"
import "reactflow/dist/style.css"
import { cn } from "../../lib/utils"

// Import types from separate type definition files
import { InteractiveCanvasProps } from "../../types/chat"
import { RawGraph } from "../graph/types/index"
import { deleteNode, deleteEdge } from "../graph/mutations"
import { batchUpdate } from "../graph/mutations"
import { CANVAS_STYLES, getEdgeStyle, getEdgeZIndex } from "../graph/styles/canvasStyles"
import { useElkToReactflowGraphConverter } from "../../hooks/useElkToReactflowGraphConverter"
import { useChatSession } from '../../hooks/useChatSession'
import { elkGraphDescription, agentInstruction } from '../../realtime/agentConfig'

// Import extracted components
import CustomNodeComponent from "../CustomNode"
import GroupNode from "../GroupNode"
import StepEdge from "../StepEdge"
import DevPanel from "../DevPanel"
import StreamViewer from "../StreamViewer"

import Chatbox from "./Chatbox"
import { ApiEndpointProvider } from '../../contexts/ApiEndpointContext'
import ProcessingStatusIcon from "../ProcessingStatusIcon"
import { auth } from "../../lib/firebase"
import { onAuthStateChanged, User } from "firebase/auth"
import { Settings, PanelRightOpen, PanelRightClose, Save } from "lucide-react"
import { DEFAULT_ARCHITECTURE as EXTERNAL_DEFAULT_ARCHITECTURE } from "../../data/defaultArchitecture"
import { SAVED_ARCHITECTURES } from "../../data/savedArchitectures"
import SaveAuth from "../auth/SaveAuth"
import ArchitectureService from "../../services/architectureService"
import ArchitectureSidebar from "./ArchitectureSidebar"
import { onElkGraph, dispatchElkGraph } from "../../events/graphEvents"
import { assertRawGraph } from "../../events/graphSchema"
import { generateChatName } from "../../utils/chatUtils"
// import toast, { Toaster } from 'react-hot-toast' // Removed toaster

// Relaxed typing to avoid prop mismatch across layers
const ChatBox = Chatbox as React.ComponentType<any>

// Helper function to add appropriate icons to nodes based on their IDs
const addIconsToArchitecture = (architecture: any) => {
  const iconMap: Record<string, string> = {
    // External clients
    "external_client": "browser_client",
    

    
    // GCP API Gateway services
    "cloud_lb": "gcp_cloud_load_balancing",
    "cloud_armor": "gcp_cloud_armor",
    "certificate_manager": "gcp_security", // Using security icon as fallback
    "cloud_cdn": "gcp_cloud_cdn",
    
    // Gateway Management
    "cloud_dns": "gcp_cloud_dns",
    "gke_gateway_controller": "gcp_google_kubernetes_engine",
    "k8s_gateway_api": "gcp_google_kubernetes_engine",
    
    // App Services
    "cloud_run": "gcp_cloud_run",
    "web_client": "browser_client",
    
    // Data services
    "cloud_sql": "gcp_cloud_sql",
    "cloud_storage": "gcp_cloud_storage",
    "memorystore": "gcp_memorystore",
    
    // AI/ML services
    "vertex_ai": "gcp_vertexai",
    "document_ai": "gcp_document_ai",
    "translation_api": "gcp_cloud_translation_api",
    
    // Monitoring
    "cloud_logging": "gcp_cloud_logging",
    "cloud_monitoring": "gcp_cloud_monitoring",
    "error_reporting": "gcp_error_reporting",
    
    // Security
    "secret_manager": "gcp_secret_manager",
    "identity_platform": "gcp_identity_platform",
    "cloud_kms": "gcp_key_management_service"
  };
  
  const addIconsToNode = (node: any) => {
    if (node.id && iconMap[node.id]) {
      node.data = node.data || {};
      node.data.icon = iconMap[node.id];

    } else if (node.id) {

    }
    
    if (node.children) {
      node.children.forEach(addIconsToNode);
    }
  };
  
  addIconsToNode(architecture);
  return architecture;
};

// Use external architecture file instead of hardcoded data
const DEFAULT_ARCHITECTURE = addIconsToArchitecture(EXTERNAL_DEFAULT_ARCHITECTURE);

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Architecture data from saved architectures
  const [savedArchitectures, setSavedArchitectures] = useState<any[]>(() => {
    // Start with "New Architecture" as first tab
    const newArchTab = {
      id: 'new-architecture',
      name: 'New Architecture',
      timestamp: new Date(),
      rawGraph: { id: "root", children: [], edges: [] },
      isNew: true
    };
    const mockArchs = Object.values(SAVED_ARCHITECTURES).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return [newArchTab, ...mockArchs];
  });
  const [selectedArchitectureId, setSelectedArchitectureId] = useState<string>('new-architecture');
  
  // State for auth flow
  const [user, setUser] = useState<User | null>(null);

  // Enhanced Firebase sync with cleanup
  const syncWithFirebase = useCallback(async (userId: string) => {
    try {
      console.log('🔄 Syncing with Firebase for user:', userId);
      
      // First, cleanup any invalid architectures
      await ArchitectureService.cleanupInvalidArchitectures(userId);
      
      const firebaseArchs = await ArchitectureService.loadUserArchitectures(userId);
      console.log(`📥 Raw Firebase architectures:`, firebaseArchs);
      
      if (firebaseArchs.length > 0) {
        // Convert Firebase architectures to local format with validation
        const validArchs = firebaseArchs.filter(arch => {
          const isValid = arch && arch.id && arch.name && arch.rawGraph;
          if (!isValid) {
            console.warn('⚠️ Invalid architecture found, skipping:', arch);
          }
          return isValid;
        }).map(arch => ({
          id: arch.id,
          firebaseId: arch.id, // Keep Firebase ID for updates
          name: arch.name,
          timestamp: arch.timestamp?.toDate ? arch.timestamp.toDate() : (arch.timestamp instanceof Date ? arch.timestamp : new Date()),
          createdAt: arch.createdAt?.toDate ? arch.createdAt.toDate() : (arch.timestamp?.toDate ? arch.timestamp.toDate() : (arch.timestamp instanceof Date ? arch.timestamp : new Date())),
          lastModified: arch.lastModified?.toDate ? arch.lastModified.toDate() : (arch.timestamp?.toDate ? arch.timestamp.toDate() : (arch.timestamp instanceof Date ? arch.timestamp : new Date())),
          rawGraph: arch.rawGraph,
          userPrompt: (arch as any).userPrompt || '',
          isFromFirebase: true
        }));
        
        // Keep "New Architecture" at top, add Firebase data after
        const newArchTab = {
          id: 'new-architecture',
          name: 'New Architecture',
          timestamp: new Date(),
          rawGraph: { id: "root", children: [], edges: [] },
          isNew: true
        };
        
        // Only keep mock architectures that aren't duplicated in Firebase
        const mockArchs = Object.values(SAVED_ARCHITECTURES).filter(mockArch => 
          !validArchs.some(fbArch => fbArch.name === mockArch.name)
        );
        
        // Sort Firebase and mock architectures by createdAt (newest first)
        const sortedValidArchs = validArchs.sort((a, b) => (b.createdAt || b.timestamp).getTime() - (a.createdAt || a.timestamp).getTime());
        const sortedMockArchs = mockArchs.sort((a, b) => (b.createdAt || b.timestamp).getTime() - (a.createdAt || a.timestamp).getTime());
        
        const allArchs = [newArchTab, ...sortedValidArchs, ...sortedMockArchs];
        setSavedArchitectures(allArchs);
        
        console.log(`✅ Loaded ${validArchs.length} valid architectures from Firebase`);
        console.log(`📊 Total architectures: ${allArchs.length} (${validArchs.length} Firebase + ${mockArchs.length} mock)`);
        
        // If current selection is invalid, reset to "New Architecture"
        if (selectedArchitectureId && !allArchs.some(arch => arch.id === selectedArchitectureId)) {
          console.warn(`⚠️ Selected architecture ${selectedArchitectureId} not found, resetting to New Architecture`);
          setSelectedArchitectureId('new-architecture');
        }
      }
    } catch (error) {
      console.error('❌ Failed to sync with Firebase:', error);
    }
  }, [selectedArchitectureId]);

  // Sync Firebase architectures when user changes
  useEffect(() => {
    if (user?.uid) {
      syncWithFirebase(user.uid);
    } else {
      // User signed out - reset to clean state
      const newArchTab = {
        id: 'new-architecture',
        name: 'New Architecture',
        timestamp: new Date(),
        rawGraph: { id: "root", children: [], edges: [] },
        isNew: true
      };
      const mockArchs = Object.values(SAVED_ARCHITECTURES).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setSavedArchitectures([newArchTab, ...mockArchs]);
      setSelectedArchitectureId('new-architecture');
    }
  }, [user, syncWithFirebase]);
  
  // State for StreamViewer visibility
  // const [showStreamViewer, setShowStreamViewer] = useState(false);
  
  // State for current chat name
  const [currentChatName, setCurrentChatName] = useState<string>('New Chat');
  
  // State for manual save
  const [isSaving, setIsSaving] = useState(false);
  
  // State for tracking operations per architecture
  const [architectureOperations, setArchitectureOperations] = useState<Record<string, boolean>>({});
  
  // Helper functions for operation tracking
  const setArchitectureOperationState = useCallback((architectureId: string, isRunning: boolean) => {
    setArchitectureOperations(prev => ({ ...prev, [architectureId]: isRunning }));
  }, []);

  const isArchitectureOperationRunning = useCallback((architectureId: string) => {
    return architectureOperations[architectureId] || false;
  }, [architectureOperations]);
  
  // State for selected nodes and edges (for delete functionality)
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<Edge[]>([]);

  // Sidebar handlers for ellipsis menu
  const handleDeleteArchitecture = async (architectureId: string) => {
    if (architectureId === 'new-architecture') {
      alert('Cannot delete the "New Architecture" tab');
      return;
    }

    const architecture = savedArchitectures.find(arch => arch.id === architectureId);
    if (!architecture) {
      console.warn('⚠️ Architecture not found for deletion:', architectureId);
      return;
    }

    if (confirm(`Are you sure you want to delete "${architecture.name}"? This action cannot be undone.`)) {
      try {
        // Delete from Firebase if it exists there
        if (architecture.isFromFirebase && user?.uid) {
          const firebaseId = architecture.firebaseId || architecture.id;
          await ArchitectureService.deleteArchitecture(firebaseId);
          console.log('✅ Architecture deleted from Firebase:', firebaseId);
        }

        // Remove from local state
        setSavedArchitectures(prev => prev.filter(arch => arch.id !== architectureId));
        
        // If the deleted architecture was selected, switch to "New Architecture"
        if (selectedArchitectureId === architectureId) {
          setSelectedArchitectureId('new-architecture');
          const emptyGraph = { id: "root", children: [], edges: [] };
          setRawGraph(emptyGraph);
        }

        console.log('✅ Architecture deleted locally and from Firebase');
      } catch (error) {
        console.error('❌ Error deleting architecture:', error);
        alert(`Failed to delete architecture: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleShareArchitecture = async (architectureId: string) => {
    const architecture = savedArchitectures.find(arch => arch.id === architectureId);
    if (!architecture) {
      console.warn('⚠️ Architecture not found for sharing:', architectureId);
      return;
    }

    try {
      // Import the sharing service
      const { SharingService } = await import('../../services/sharingService');
      
      // Create and copy shareable link
      await SharingService.shareArchitecture(architectureId);
      
      // Simple success feedback
      console.log(`✅ Share link for "${architecture.name}" copied to clipboard!`);
    } catch (error) {
      console.error('❌ Failed to share architecture:', error);
      // Fallback to basic sharing
      const shareUrl = `https://atelier.inc.net/architecture/${architectureId}`;
      navigator.clipboard.writeText(shareUrl)
        .then(() => console.log('✅ Fallback share link copied to clipboard'))
        .catch(() => console.error('❌ Failed to copy to clipboard'));
    }
  };

  const handleEditArchitecture = (architectureId: string) => {
    const architecture = savedArchitectures.find(arch => arch.id === architectureId);
    if (!architecture) {
      console.warn('⚠️ Architecture not found for editing:', architectureId);
      return;
    }

    const newName = prompt('Enter new name for the architecture:', architecture.name);
    if (newName && newName.trim() && newName !== architecture.name) {
      // Update locally
      setSavedArchitectures(prev => prev.map(arch => 
        arch.id === architectureId 
          ? { ...arch, name: newName.trim() }
          : arch
      ));

      // Update in Firebase if it exists there
      if (architecture.isFromFirebase && user?.uid) {
        const firebaseId = architecture.firebaseId || architecture.id;
        ArchitectureService.updateArchitecture(firebaseId, { name: newName.trim() })
          .then(() => console.log('✅ Architecture name updated in Firebase'))
          .catch(error => console.error('❌ Error updating name in Firebase:', error));
      }
    }
  };

  // Chat submission handler with operation tracking
  const handleChatSubmit = useCallback((message: string) => {
    console.log('📝 Chat message submitted for architecture:', selectedArchitectureId, message);
    
    // Mark operation as starting for current architecture
    setArchitectureOperationState(selectedArchitectureId, true);
    
    // Pass the current architecture ID to the global state for FunctionExecutor
    (window as any).currentArchitectureId = selectedArchitectureId;
    
    // Send the message (if real-time chat is being used)
    if (sendTextMessage) {
      sendTextMessage(message);
    }
  }, [selectedArchitectureId, setArchitectureOperationState, sendTextMessage]);

  // Listen for auth state changes
  useEffect(() => {
    // Only set up auth listener if Firebase is properly initialized
    if (auth) {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // Just set the user, no need to show coming soon card
    });
    return () => unsubscribe();
    } else {
      console.log('🚫 Firebase auth not available - authentication disabled');
    }
  }, []);



  // Handler for the edit button click (unused)
  // const handleEditClick = async () => {
  //   if (!auth || !googleProvider) {
  //     console.log('🚫 Firebase authentication not available');
  //     return;
  //   }
  //   if (user) {
  //     setShowComingSoon(true);
  //   } else {
  //     try {
  //       await signInWithRedirect(auth, googleProvider);
  //     } catch (error) {
  //       console.error("Error signing in with Google", error);
  //     }
  //   }
  // };
  
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
    handleLabelChange,
    
  } = useElkToReactflowGraphConverter({
    id: "root",
    children: [],
    edges: []
  });

  // Handler for manual save functionality
  const handleManualSave = useCallback(async () => {
    if (!user) {
      alert('Please sign in to save your architecture');
      return;
    }

    if (!selectedArchitectureId || selectedArchitectureId === 'new-architecture') {
      alert('No architecture selected to save');
      return;
    }

    setIsSaving(true);
    try {
      console.log('💾 Manual save triggered for:', selectedArchitectureId);
      
      // Find the current architecture
      const currentArch = savedArchitectures.find(arch => arch.id === selectedArchitectureId);
      if (!currentArch) {
        throw new Error('Architecture not found');
      }

      const firebaseId = currentArch.firebaseId || currentArch.id;
      
      if (firebaseId === 'new-architecture') {
        throw new Error('Cannot save new architecture - generate content first');
      }

      // Update Firebase
      await ArchitectureService.updateArchitecture(firebaseId, {
        rawGraph: rawGraph,
        nodes: nodes,
        edges: edges,
      });

      console.log('✅ Architecture manually saved to Firebase');
    } catch (error) {
      console.error('❌ Error manually saving architecture:', error);
      alert(`❌ Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  }, [user, selectedArchitectureId, savedArchitectures, rawGraph, nodes, edges]);



  // Initialize with empty canvas for "New Architecture" tab
  useEffect(() => {
    if (selectedArchitectureId === 'new-architecture') {
      const emptyGraph = {
        id: "root",
        children: [],
        edges: []
      };
      console.log('🔄 Setting empty graph for New Architecture tab');
      setRawGraph(emptyGraph);
    }
  }, [selectedArchitectureId, setRawGraph]);

  // Debug logging for graph state changes
  useEffect(() => {
    console.log('📊 Current rawGraph state:', {
      id: rawGraph?.id,
      childrenCount: rawGraph?.children?.length || 0,
      edgesCount: rawGraph?.edges?.length || 0,
      selectedArchitecture: selectedArchitectureId,
      graphDetails: rawGraph
    });
  }, [rawGraph, selectedArchitectureId]);

  // Handler for save functionality
  const handleSave = useCallback(async (user: User) => {
    console.log('💾 Save triggered by user:', user.email);
    
    try {
      // Validate that we have data to save
      if (!user || !user.uid || !user.email) {
        throw new Error('Invalid user data');
      }

      if (!nodes || !edges || !rawGraph) {
        throw new Error('No architecture data to save');
      }

      // Generate a meaningful name for the architecture
      const architectureName = ArchitectureService.generateArchitectureName(nodes, edges);
      
      // Prepare the architecture data for saving with validation
      const architectureData = {
        name: architectureName || 'Untitled Architecture',
        description: `Architecture with ${nodes.length} components and ${edges.length} connections`,
        rawGraph: rawGraph || {},
        nodes: nodes || [],
        edges: edges || [],
        userId: user.uid,
        userEmail: user.email,
        isPublic: false, // Private by default
        tags: [] // Could be enhanced to auto-generate tags based on content
      };
      
      console.log('📊 Saving architecture data:', {
        name: architectureData.name,
        nodeCount: architectureData.nodes.length,
        edgeCount: architectureData.edges.length,
        userId: architectureData.userId,
        hasRawGraph: !!architectureData.rawGraph
      });
      
      // Log the data being sent for debugging
      console.log('🔍 Raw architecture data before service call:', {
        name: architectureData.name,
        userId: architectureData.userId,
        userEmail: architectureData.userEmail,
        nodeCount: architectureData.nodes.length,
        edgeCount: architectureData.edges.length,
        rawGraphExists: !!architectureData.rawGraph,
        firstNode: architectureData.nodes[0],
        firstEdge: architectureData.edges[0]
      });

      // Save to Firestore
      const savedId = await ArchitectureService.saveArchitecture(architectureData);
      
      // Show success feedback
      alert(`✅ Architecture saved successfully!\n\nName: ${architectureData.name}\nID: ${savedId}\nNodes: ${architectureData.nodes.length}\nEdges: ${architectureData.edges.length}`);
      
    } catch (error) {
      console.error('❌ Error saving architecture:', error);
      let errorMessage = 'Failed to save architecture. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('Invalid user data')) {
          errorMessage = 'Authentication error. Please sign in again.';
        } else if (error.message.includes('No architecture data')) {
          errorMessage = 'No architecture to save. Please create some components first.';
        }
      }
      
      alert(`❌ ${errorMessage}`);
    }
  }, [rawGraph, nodes, edges]);

  // Sidebar handlers
  const handleNewArchitecture = useCallback(() => {
    // Reset to "New Architecture" tab
    console.log('🆕 Resetting to New Architecture tab');
    setSelectedArchitectureId('new-architecture');
    setCurrentChatName('New Chat');
    
    // Clear the canvas by setting empty graph
    const emptyGraph = {
      id: "root",
      children: [],
      edges: []
    };
    setRawGraph(emptyGraph);
    
    // Reset the "New Architecture" tab name in case it was changed
    setSavedArchitectures(prev => prev.map(arch => 
      arch.id === 'new-architecture' 
        ? { ...arch, name: 'New Architecture', isNew: true, rawGraph: emptyGraph }
        : arch
    ));
    
  }, [setRawGraph]);

  const handleSelectArchitecture = useCallback((architectureId: string) => {
    console.log('🔄 Selecting architecture:', architectureId);
    setSelectedArchitectureId(architectureId);
    
    // Load the architecture data
    const architecture = SAVED_ARCHITECTURES[architectureId] || 
                         savedArchitectures.find(arch => arch.id === architectureId);
    
    if (architecture && architecture.rawGraph) {
      console.log('📂 Loading architecture:', architecture.name);
      
      // Use typed event system for architecture loading
      dispatchElkGraph({
        elkGraph: assertRawGraph(architecture.rawGraph, 'ArchitectureSelector'),
        source: 'ArchitectureSelector',
        reason: 'architecture-load'
      });
    } else {
      console.warn('⚠️ Architecture not found:', architectureId);
    }
  }, [savedArchitectures]);

  // Handle canvas resize when sidebar state changes
  useEffect(() => {
    // Small delay to ensure sidebar animation has started
    const timeoutId = setTimeout(() => {
      if (reactFlowRef.current) {
        // Force React Flow to recalculate its dimensions
        window.dispatchEvent(new Event('resize'));
        
        // Then fit the view with animation
        setTimeout(() => {
          if (reactFlowRef.current) {
            reactFlowRef.current.fitView({ 
              padding: 0.1,
              includeHiddenNodes: false,
              duration: 300
            });
          }
        }, 100);
      }
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [sidebarCollapsed]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  // Handler for graph changes from DevPanel or manual interactions
  const handleGraphChange = useCallback(async (newGraph: RawGraph) => {
    console.group('[Graph Change] Manual/DevPanel Update');
    console.log('raw newGraph:', newGraph);
    console.log('Previous rawGraph had', rawGraph?.children?.length || 0, 'children');
    console.log('New graph has', newGraph?.children?.length || 0, 'children');
    
    // Update the local state immediately
    setRawGraph(newGraph);
    console.log('…called setRawGraph');
    
    // Update Firebase if user is signed in and not on "New Architecture" tab
    if (user && selectedArchitectureId !== 'new-architecture') {
      console.log('🔄 Updating Firebase for manual graph change...');
      try {
        const architecture = savedArchitectures.find(arch => arch.id === selectedArchitectureId);
        if (architecture && architecture.isFromFirebase) {
          const firebaseId = architecture.firebaseId || architecture.id;
          await ArchitectureService.updateArchitecture(firebaseId, {
            rawGraph: newGraph
          });
          console.log('✅ Firebase updated for manual graph change');
        }
      } catch (error) {
        console.error('❌ Error updating Firebase for manual graph change:', error);
      }
    }
    
    console.groupEnd();
  }, [setRawGraph, rawGraph, user, selectedArchitectureId, savedArchitectures]);

  const handleAddNodeToGroup = useCallback((groupId: string) => {
    const nodeName = `new_node_${Date.now()}`;
    const updated = batchUpdate([
      {
        name: "add_node",
        nodename: nodeName,
        parentId: groupId,
        data: { label: "New Node" }
      }
    ], structuredClone(rawGraph));
    handleGraphChange(updated);
    // Try to focus edit on the newly created node in RF layer
    const newNodeId = nodeName.toLowerCase();
    setTimeout(() => {
      setNodes(nds => nds.map(n => n.id === newNodeId ? { ...n, data: { ...n.data, isEditing: true } } : n));
    }, 0);
  }, [rawGraph, handleGraphChange, setNodes]);
  
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

  // Handle delete key for selected nodes and edges
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          event.preventDefault();
          // Create a deep copy of the graph (like DevPanel does)
          let updatedGraph = JSON.parse(JSON.stringify(rawGraph));
          
          // Delete selected nodes
          selectedNodes.forEach(node => {
            console.log(`Deleting node: ${node.id}`);
            try {
              updatedGraph = deleteNode(node.id, updatedGraph);
              console.log(`Successfully deleted node: ${node.id}`);
            } catch (error) {
              console.error(`Error deleting node ${node.id}:`, error);
            }
          });
          
          // Delete selected edges
          selectedEdges.forEach(edge => {
            console.log(`Deleting edge: ${edge.id}`);
            try {
              updatedGraph = deleteEdge(edge.id, updatedGraph);
              console.log(`Successfully deleted edge: ${edge.id}`);
            } catch (error) {
              console.error(`Error deleting edge ${edge.id}:`, error);
            }
          });
          
          // Apply the final updated graph using the proper handler
          handleGraphChange(updatedGraph);
          // Clear selection after deletion
          setSelectedNodes([]);
          setSelectedEdges([]);
        }
      }
    };

    // Add event listener to document
    document.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNodes, selectedEdges, rawGraph, handleGraphChange]);
  
  // Create node types with handlers - memoized to prevent recreation
  const memoizedNodeTypes = useMemo(() => {
    const types = {
    custom: (props: any) => <CustomNodeComponent {...props} onLabelChange={handleLabelChange} />,
    group: (props: any) => <GroupNode {...props} onAddNode={handleAddNodeToGroup} />,
    };
    return types;
  }, [handleLabelChange, handleAddNodeToGroup]);
  const memoizedEdgeTypes = useMemo(() => edgeTypes, []);

  // Edge creation: track source node when starting a connection
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  const handleConnectStart = useCallback((_e: any, params: OnConnectStartParams) => {
    setConnectingFrom(params.nodeId ?? null);
  }, []);

  const handleConnectEnd = useCallback((event: any) => {
    const target = event.target as HTMLElement;
    const droppedOnPane = target?.classList?.contains('react-flow__pane');
    if (!droppedOnPane || !connectingFrom) {
      setConnectingFrom(null);
      return;
    }

    // Create a new node next to the cursor and connect from source → new
    const sourceNode = nodes.find(n => n.id === connectingFrom);
    const parentForNew = (sourceNode as any)?.parentId || 'root';
    const nodeName = `node_${Date.now()}`;
    const edgeId = `edge_${Math.random().toString(36).slice(2, 9)}`;
    const newNodeId = nodeName.toLowerCase();

    const updated = batchUpdate([
      { name: 'add_node', nodename: nodeName, parentId: parentForNew, data: { label: 'New Node' } },
      { name: 'add_edge', edgeId, sourceId: connectingFrom, targetId: newNodeId }
    ], structuredClone(rawGraph));

    handleGraphChange(updated);
    // Focus edit the newly added node in RF view once nodes sync
    setTimeout(() => {
      setNodes(nds => nds.map(n => n.id === newNodeId ? { ...n, data: { ...n.data, isEditing: true } } : n));
    }, 0);

    setConnectingFrom(null);
  }, [connectingFrom, nodes, rawGraph, setNodes, setRawGraph]);
  
  const {
    messages,
    isSending,
    messageSendStatus,
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
    agentInstruction
  });

  // Debug chat session state
  useEffect(() => {
    console.log('💬 Chat session state:', {
      isSessionActive,
      messagesCount: messages.length,
      isSending,
      messageSendStatus,
      elkGraphNodes: rawGraph?.children?.length || 0,
      currentChatName
    });
  }, [isSessionActive, messages.length, isSending, messageSendStatus, rawGraph, currentChatName]);

  // Typed event bridge: Listen for AI-generated graphs and apply them to canvas
  useEffect(() => {
    const unsubscribe = onElkGraph(async ({ elkGraph, source, reason, version, ts, targetArchitectureId }) => {
      console.log('🔄 Received ELK graph update:', {
        source,
        reason,
        targetArchitectureId,
        currentlySelected: selectedArchitectureId,
        nodeCount: elkGraph?.children?.length || 0,
        edgeCount: elkGraph?.edges?.length || 0,
        version,
        timestamp: ts ? new Date(ts).toISOString() : undefined
      });
      
      // Don't mark operation as complete here - wait for the final completion event
      
      // Only update canvas if this operation is for the currently selected architecture
      const shouldUpdateCanvas = !targetArchitectureId || targetArchitectureId === selectedArchitectureId;
      
      if (shouldUpdateCanvas) {
        console.log('✅ Updating canvas for selected architecture');
        setRawGraph(elkGraph);
      } else {
        console.log('⏸️ Skipping canvas update - operation for different architecture:', {
          target: targetArchitectureId,
          current: selectedArchitectureId
        });
      }
      
      // Always update the architecture data in savedArchitectures for background tabs
      if (targetArchitectureId && targetArchitectureId !== 'new-architecture') {
        setSavedArchitectures(prev => prev.map(arch => 
          arch.id === targetArchitectureId 
            ? { ...arch, rawGraph: elkGraph, lastModified: new Date() }
            : arch
        ));
      }
      
      // Create new named chat ONLY when going from empty to first architecture
      if (source === 'FunctionExecutor' && reason === 'agent-update') {
        try {
          // Check if this is the first operation (empty → first architecture)
          const isEmptyGraph = !elkGraph?.children?.length || elkGraph.children.length === 0;
          const wasEmptyBefore = !rawGraph?.children?.length || rawGraph.children.length === 0;
          const isNewArchitectureTab = selectedArchitectureId === 'new-architecture';
          const currentArch = savedArchitectures.find(arch => arch.id === selectedArchitectureId);
          const isFirstOperation = wasEmptyBefore && !isEmptyGraph && isNewArchitectureTab && currentArch?.isNew;
          
          console.log('🔍 Chat creation check:', {
            isEmptyGraph,
            wasEmptyBefore, 
            isNewArchitectureTab,
            isFirstOperation,
            currentNodes: elkGraph?.children?.length || 0,
            previousNodes: rawGraph?.children?.length || 0,
            selectedArchitectureId,
            currentArchIsNew: currentArch?.isNew
          });
          
          if (isFirstOperation) {
            // Rename "New Architecture" tab to AI-generated name
            const userPrompt = (window as any).originalChatTextInput || (window as any).chatTextInput || '';
            const newChatName = await generateChatName(userPrompt, elkGraph);
            console.log('🆕 Renaming "New Architecture" to:', newChatName, 'from prompt:', userPrompt);
            
            // Update the "New Architecture" tab in place
            setSavedArchitectures(prev => prev.map(arch => 
              arch.id === 'new-architecture' 
                ? { ...arch, name: newChatName, rawGraph: elkGraph, createdAt: new Date(), lastModified: new Date(), isNew: false, userPrompt }
                : arch
            ));
            setCurrentChatName(newChatName);
            
            // Save to Firebase if user is authenticated
            if (user) {
              try {
                const docId = await ArchitectureService.saveArchitecture({
                  name: newChatName,
                  userId: user.uid,
                  userEmail: user.email || '',
                  rawGraph: elkGraph,
                  nodes: [], // React Flow nodes will be generated
                  edges: [], // React Flow edges will be generated
                  userPrompt: userPrompt
                });
                
                // Update the tab with Firebase ID for future updates
                setSavedArchitectures(prev => prev.map(arch => 
                  arch.id === 'new-architecture' 
                    ? { ...arch, id: docId, firebaseId: docId }
                    : arch
                ));
                setSelectedArchitectureId(docId);
                
                console.log('✅ New architecture saved to Firebase:', newChatName);
              } catch (firebaseError) {
                console.error('❌ Failed to save to Firebase:', firebaseError);
              }
            }
          } else if (selectedArchitectureId && selectedArchitectureId !== 'new-architecture' && !isEmptyGraph) {
            // Just update local state - manual save will handle Firebase
            console.log('🔄 Updating local architecture state:', selectedArchitectureId);
            
            // Update local state only
            setSavedArchitectures(prev => prev.map(arch => 
              arch.id === selectedArchitectureId 
                ? { ...arch, rawGraph: elkGraph, lastModified: new Date() }
                : arch
            ));
          }
          
        } catch (error) {
          console.error('Failed to handle chat creation/update:', error);
        }
      }
    });
    
    return unsubscribe;
  }, [setRawGraph, user, rawGraph, selectedArchitectureId]);

  // Listen for final processing completion (sync with ProcessingStatusIcon)
  useEffect(() => {
    const handleFinalComplete = () => {
      console.log('🏁 Final processing complete - stopping all loading indicators');
      // Add a small delay to match the ProcessingStatusIcon timing
      setTimeout(() => {
        setArchitectureOperations({});
      }, 100); // Small delay to ensure the check mark appears first
    };

    // ONLY listen for allProcessingComplete (same as ProcessingStatusIcon)
    window.addEventListener('allProcessingComplete', handleFinalComplete);

    return () => {
      window.removeEventListener('allProcessingComplete', handleFinalComplete);
    };
  }, []);
  
  // Process events when they change
  useEffect(() => {
    processEvents();
  }, [events, processEvents]);
  
  // Expose diagnostic functions to the window object for debugging (kept minimal)
  useEffect(() => {
    // Minimal exposure if needed elsewhere
    (window as any).getCurrentGraph = () => rawGraph;
    return () => {
      delete (window as any).getCurrentGraph;
    };
  }, [rawGraph]);
  
  // State to track edge visibility (keeping minimal state for the fix)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  // Handle selection changes to ensure edges remain visible
  const onSelectionChange = useCallback(({ nodes: selectedNodesParam, edges: selectedEdgesParam }: { nodes: Node[]; edges: Edge[] }) => {
    // Update selected nodes and edges state for delete functionality
    setSelectedNodes(selectedNodesParam);
    setSelectedEdges(selectedEdgesParam);
    
    // Log selection for debugging
    if (selectedEdgesParam.length > 0) {
      console.log(`🔗 Selected edges:`, selectedEdgesParam.map(edge => edge.id));
    }
    if (selectedNodesParam.length > 0) {
      console.log(`📦 Selected nodes:`, selectedNodesParam.map(node => node.id));
    }
    
    if (selectedNodesParam.length > 0) {
      const selectedIds = selectedNodesParam.map(node => node.id);
      
      // Is a group node selected?
      const hasGroupNode = selectedNodesParam.some(node => node.type === 'group');
      
      // Force edge visibility regardless of node type, but especially for group nodes
      setEdges(currentEdges => 
        currentEdges.map(edge => {
          const isConnectedToSelected = selectedIds.includes(edge.source) || selectedIds.includes(edge.target);
          
          return {
            ...edge,
            hidden: false, // Always force visibility
            style: {
              ...edge.style,
              ...getEdgeStyle(false, isConnectedToSelected),
              zIndex: getEdgeZIndex(isConnectedToSelected),
            },
            zIndex: getEdgeZIndex(isConnectedToSelected),
            animated: isConnectedToSelected && CANVAS_STYLES.edges.connected.animated,
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
            ...getEdgeStyle(false, false),
            zIndex: getEdgeZIndex(false),
          },
          zIndex: getEdgeZIndex(false)
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
    <ApiEndpointProvider apiEndpoint={apiEndpoint}>
    <div className="w-full h-full flex overflow-hidden bg-white dark:bg-black">
      
      {/* Architecture Sidebar */}
      <ArchitectureSidebar
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        onNewArchitecture={handleNewArchitecture}
        onSelectArchitecture={handleSelectArchitecture}
        onDeleteArchitecture={handleDeleteArchitecture}
        onShareArchitecture={handleShareArchitecture}
        onEditArchitecture={handleEditArchitecture}
        selectedArchitectureId={selectedArchitectureId}
        architectures={savedArchitectures}
        isArchitectureOperationRunning={isArchitectureOperationRunning}
      />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'ml-0' : 'ml-0'}`}>
        {/* ProcessingStatusIcon with sidebar toggle */}
      <div className="absolute top-4 left-4 z-[101]">
          {/* Atelier icon with hover overlay */}
          <div className="relative group">
            <ProcessingStatusIcon onClick={sidebarCollapsed ? handleToggleSidebar : undefined} />
            {/* Hover overlay - show panel-right-close on hover when sidebar is CLOSED */}
            {sidebarCollapsed && (
              <button 
                onClick={handleToggleSidebar}
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-10 h-10 flex items-center justify-center rounded-lg bg-white border border-gray-200 shadow-lg"
                title="Open Sidebar"
              >
                <PanelRightClose className="w-4 h-4 text-gray-700" />
              </button>
            )}
          </div>
      </div>



      {/* Save, Manual Save and Settings buttons - top-right */}
      <div className="absolute top-4 right-4 z-[100] flex gap-2">
        <SaveAuth onSave={handleSave} isCollapsed={true} />
        
        {/* Manual Save Button */}
        <button
          onClick={handleManualSave}
          disabled={isSaving || !user || selectedArchitectureId === 'new-architecture'}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border border-gray-200 hover:shadow-md transition-all duration-200 ${
            isSaving 
              ? 'bg-blue-100 text-blue-600 cursor-not-allowed' 
              : (!user || selectedArchitectureId === 'new-architecture')
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          title={
            isSaving ? 'Saving...' 
            : !user ? 'Sign in to save'
            : selectedArchitectureId === 'new-architecture' ? 'Generate content first'
            : 'Save current architecture'
          }
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">Save</span>
        </button>
        
        <button
          onClick={() => setShowDev(!showDev)}
          className={`flex items-center justify-center w-10 h-10 rounded-lg shadow-lg border border-gray-200 hover:shadow-md transition-all duration-200 ${
            showDev ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          title="Developer Panel"
        >
          <Settings className="w-4 h-4" />
        </button>
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
              className={`w-full h-full ${CANVAS_STYLES.canvas.background.light} dark:${CANVAS_STYLES.canvas.background.dark}`}
              defaultEdgeOptions={{
                style: CANVAS_STYLES.edges.default,
                animated: false,
                zIndex: CANVAS_STYLES.zIndex.edgeLabels,
              }}
              fitView
              minZoom={CANVAS_STYLES.canvas.zoom.min}
              maxZoom={CANVAS_STYLES.canvas.zoom.max}
              defaultViewport={CANVAS_STYLES.canvas.viewport.default}
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
              onConnectStart={handleConnectStart}
              onConnectEnd={handleConnectEnd}

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
          <div className="absolute top-16 right-4 z-50 w-80 max-h-[calc(100vh-80px)]">
            <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden h-full flex flex-col">
              {/* Panel Header */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex-shrink-0">
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
              
              {/* Load Default Architecture Button - Top Priority */}
              <div className="px-4 py-3 border-b border-gray-200 bg-green-50 flex-shrink-0">
                <button
                  onClick={() => {
                    console.log('Loading default architecture...');
                    setRawGraph(DEFAULT_ARCHITECTURE);
                  }}
                  className="w-full px-3 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  🏗️ Load Default GCP Architecture
                </button>
              </div>
              
              {/* Panel Content - Scrollable */}
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* Streaming Controls - removed toggle as StreamViewer is always shown */}
                {/* <div className="space-y-2">
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
                </div> */}
                
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
          onProcessStart={() => {
            console.log('🔄 Starting operation for architecture:', selectedArchitectureId);
            setArchitectureOperationState(selectedArchitectureId, true);
            (window as any).currentArchitectureId = selectedArchitectureId;
          }}
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
    </div>
    </ApiEndpointProvider>
  )
}

export default InteractiveCanvas 