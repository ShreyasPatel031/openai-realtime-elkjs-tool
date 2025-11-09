/**
 * CRITICAL REPOSITORY RULE — DO NOT SKIP
 *
 * InteractiveCanvas.tsx is already too large. Do NOT add new logic or components here.
 * - Only orchestrate and wire references to helpers/modules.
 * - Put new interactions (e.g., tools, gestures, policies) in dedicated files
 *   under client/components/ui/ (e.g., canvasInteractions.ts) and import them.
 * - Keep this file as a thin coordinator to protect maintainability and testability.
 */
"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import ReactFlow, { 
  Background, 
  Controls, 
  BackgroundVariant,
  Node,
  Edge,
  OnConnectStartParams,
  useReactFlow,
  getRectOfNodes,
  getTransformForBounds,
  BaseEdge,
  EdgeLabelRenderer
} from "reactflow"
import "reactflow/dist/style.css"
import { cn } from "../../lib/utils"
import { markEmbedToCanvasTransition, isEmbedToCanvasTransition, clearEmbedToCanvasFlag, getChatMessages } from "../../utils/chatPersistence"
import ViewControls from "./ViewControls"

// Import types from separate type definition files
import { InteractiveCanvasProps } from "../../types/chat"
import { RawGraph } from "../graph/types/index"
import { deleteNode, deleteEdge, addNode, addEdge, groupNodes, batchUpdate } from "../graph/mutations"
import { CANVAS_STYLES, getEdgeStyle, getEdgeZIndex } from "../graph/styles/canvasStyles"
import { useElkToReactflowGraphConverter } from "../../hooks/useElkToReactflowGraphConverter"
import { useChatSession } from '../../hooks/useChatSession'
import { elkGraphDescription, agentInstruction } from '../../realtime/agentConfig'
import { addFunctionCallingMessage, updateStreamingMessage } from '../../utils/chatUtils'

// Import extracted components
import CustomNodeComponent from "../CustomNode"
import ShareOverlay from "../canvas/ShareOverlay"
import PromptModal from "../canvas/PromptModal"
import ConfirmModal from "../canvas/ConfirmModal"
import NotificationModal from "../canvas/NotificationModal"
import { exportArchitectureAsPNG } from "../../utils/exportPng"
import { copyToClipboard } from "../../utils/copyToClipboard"
import { generateNameWithFallback, ensureUniqueName } from "../../utils/naming"
import { ensureAnonymousSaved, createAnonymousShare, autoSaveAnonymous } from "../../utils/anonymousSave"
import { useUrlArchitecture } from "../../hooks/useUrlArchitecture"
import { ensureEdgeVisibility, updateEdgeStylingOnSelection, updateEdgeStylingOnDeselection } from "../../utils/edgeVisibility"
import { syncWithFirebase as syncWithFirebaseService } from "../../services/syncArchitectures"
import { generateSVG, handleSvgZoom } from "../../utils/svgExport"
import GroupNode from "../GroupNode"
import { DraftGroupNode } from "../node/DraftGroupNode"
import StepEdge from "../StepEdge"
/**
 * READ ME: InteractiveCanvas is already very large. Do NOT add new interaction
 * logic or component code directly here. Add it in a dedicated helper/module and
 * import the reference. Keep this file as a thin orchestrator.
 */
import DevPanel from "../DevPanel"
import { placeNodeOnCanvas } from "./canvasInteractions"
import NodeHoverPreview from "./NodeHoverPreview"
import GroupHoverPreview from "./GroupHoverPreview"
import CanvasToolbar from "./CanvasToolbar"

import Chatbox from "./Chatbox"
import { ApiEndpointProvider } from '../../contexts/ApiEndpointContext'
import ProcessingStatusIcon from "../ProcessingStatusIcon"
import { auth } from "../../lib/firebase"
import { onAuthStateChanged, User } from "firebase/auth"
import { Timestamp } from "firebase/firestore"
import { Settings, PanelRightOpen, PanelRightClose, Save, Edit, Share, Download, X, Menu, Share2, Check, Search } from "lucide-react"
import { DEFAULT_ARCHITECTURE as EXTERNAL_DEFAULT_ARCHITECTURE } from "../../data/defaultArchitecture"
import { SIMPLE_DEFAULT_ARCHITECTURE } from "../../data/simpleDefaultArchitecture"
// Removed mock architectures import - only using real user architectures now
import SaveAuth from "../auth/SaveAuth"
import ArchitectureService from "../../services/architectureService"
import { anonymousArchitectureService } from "../../services/anonymousArchitectureService"
import { SharingService } from "../../services/sharingService"
import { architectureSearchService } from "../../utils/architectureSearchService"
import ArchitectureSidebar from "./ArchitectureSidebar"
import { onElkGraph, dispatchElkGraph } from "../../events/graphEvents"
import { assertRawGraph } from "../../events/graphSchema"
import { iconFallbackService } from "../../utils/iconFallbackService"
import { useViewMode } from "../../contexts/ViewModeContext"
// import toast, { Toaster } from 'react-hot-toast' // Removed toaster

// Relaxed typing to avoid prop mismatch across layers
const ChatBox = Chatbox as React.ComponentType<any>

// Helper function to add appropriate icons to nodes based on their IDs
const addIconsToArchitecture = (architecture: any) => {
  // NO HARDCODED MAPPINGS - let everything fail and use semantic fallback
  const addIconsToNode = (node: any) => {
    // Don't assign any icons here - let the components handle fallback
    if (node.children) {
      node.children.forEach(addIconsToNode);
    }
  };
  
  addIconsToNode(architecture);
  return architecture;
};

// Use external architecture file instead of hardcoded data
const DEFAULT_ARCHITECTURE = addIconsToArchitecture(EXTERNAL_DEFAULT_ARCHITECTURE);
const SIMPLE_DEFAULT = addIconsToArchitecture(SIMPLE_DEFAULT_ARCHITECTURE);

// Register node and edge types
const nodeTypes = {
  custom: CustomNodeComponent,
  group: GroupNode,
  draftGroup: DraftGroupNode
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
  isPublicMode = false,
  rightPanelCollapsed = false,
}) => {
  // Get ViewMode configuration
  const { config: viewModeConfig } = useViewMode();
  
  // Clear chat localStorage on mount if NOT coming from embed
  useEffect(() => {
    if (!isEmbedToCanvasTransition()) {
      // User is visiting directly, not from embed - clear any stale chat
      try {
        localStorage.removeItem('atelier_current_conversation');
        // console.log('🧹 [MOUNT] Cleared stale chat messages (direct visit, not from embed)');
      } catch (error) {
        console.warn('Failed to clear chat on mount:', error);
      }
    }
  }, []); // Run once on mount
  
  // State for DevPanel visibility
  const [showDev, setShowDev] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
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
    // Only show the "New Architecture" tab initially - no mock architectures
    return [newArchTab];
  });
  const [selectedArchitectureId, setSelectedArchitectureId] = useState<string>('new-architecture');
  
  // Pending architecture selection (for handling async state updates)
  const [pendingArchitectureSelection, setPendingArchitectureSelection] = useState<string | null>(null);
  
  // State to lock agent operations to specific architecture during sessions
  const [agentLockedArchitectureId, setAgentLockedArchitectureId] = useState<string | null>(null);
  
  // Initialize global architecture ID for agent targeting
  useEffect(() => {
    // If agent is locked to an architecture, use that; otherwise use selected
    const targetArchitectureId = agentLockedArchitectureId || selectedArchitectureId;
    (window as any).currentArchitectureId = targetArchitectureId;
  }, [selectedArchitectureId, agentLockedArchitectureId]);
  
  // Console commands to toggle default architectures
  useEffect(() => {
    // Command to load simple default (serverless API)
    (window as any).loadSimpleDefault = () => {
      console.log('✅ Loading simple default architecture (Serverless API)...');
      setRawGraph(SIMPLE_DEFAULT);
      console.log('🏗️ Simple default loaded: Client → API Gateway → Lambda → DynamoDB');
    };

    // Command to load complex default (full GCP example)
    (window as any).loadComplexDefault = () => {
      console.log('✅ Loading complex default architecture (GCP Full Example)...');
      setRawGraph(DEFAULT_ARCHITECTURE);
      console.log('🏗️ Complex default loaded with', DEFAULT_ARCHITECTURE.children?.length || 0, 'top-level components');
    };

    // Command to reset to empty
    (window as any).resetCanvas = () => {
      console.log('🔄 Resetting to empty root...');
      setRawGraph({ id: "root", children: [], edges: [] });
      console.log('✅ Canvas cleared - empty root loaded');
    };

    // Legacy command for backward compatibility
    (window as any).toggleDefaultArchitecture = (enabled: boolean) => {
      if (enabled) {
        (window as any).loadSimpleDefault();
      } else {
        (window as any).resetCanvas();
      }
    };

    // Log help message
  // console.log('💡 Console commands available:');
  // console.log('  - loadSimpleDefault()    → Load simple serverless API architecture');
  // console.log('  - loadComplexDefault()   → Load complex GCP test architecture');
  // console.log('  - resetCanvas()          → Reset to empty canvas');
  // console.log('  - toggleDefaultArchitecture(true/false) → Legacy toggle command');

    // Cleanup
    return () => {
      delete (window as any).loadSimpleDefault;
      delete (window as any).loadComplexDefault;
      delete (window as any).resetCanvas;
      delete (window as any).toggleDefaultArchitecture;
    };
  }, []);
  
  // State for auth flow
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingArchitectures, setIsLoadingArchitectures] = useState(false);
  const [urlArchitectureProcessed, setUrlArchitectureProcessed] = useState(false);

  // Enhanced Firebase sync with cleanup - now handled by service
  const syncWithFirebase = useCallback(async (userId: string) => {
    await syncWithFirebaseService({
      userId,
      isPublicMode,
      urlArchitectureProcessed,
      callback: {
        setIsLoadingArchitectures,
        setSavedArchitectures,
        setSelectedArchitectureId,
        setCurrentChatName,
        setRawGraph,
        setPendingArchitectureSelection
      }
    });
  }, [isPublicMode, urlArchitectureProcessed, selectedArchitectureId]);
  const [justCreatedArchId, setJustCreatedArchId] = useState<string | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [hasInitialSync, setHasInitialSync] = useState(false);

  // Sync Firebase architectures ONLY when user changes (not when tabs change)
  useEffect(() => {
    if (user?.uid && !hasInitialSync) {
      // Don't sync immediately after creating an architecture
      if (!justCreatedArchId) {
        // Clear any existing timeout
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }
        
        // Only sync once when user signs in
        // Initial sync for user
        syncWithFirebase(user.uid);
        setHasInitialSync(true);
      } else {
        console.log('🚫 Skipping Firebase sync - just created architecture:', justCreatedArchId);
      }
    } else if (!user?.uid) {
      // Reset sync flag when user signs out
      setHasInitialSync(false);
      
      // User signed out - reset to clean state
      const newArchTab = {
        id: 'new-architecture',
        name: 'New Architecture',
        timestamp: new Date(),
        rawGraph: { id: "root", children: [], edges: [] },
        isNew: true
      };
      
      // In public mode, only show "New Architecture"
      if (isPublicMode) {
        setSavedArchitectures([newArchTab]);
      } else if (isLoadingArchitectures) {
        // When loading, show only "New Architecture" but don't override if we already have architectures
        console.log('🔄 User signed out but still loading - showing only New Architecture');
        setSavedArchitectures([newArchTab]);
      } else {
        // Only show New Architecture when signed out (no mock architectures)
        setSavedArchitectures([newArchTab]);
      }
      setSelectedArchitectureId('new-architecture');
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [user, justCreatedArchId, isPublicMode, hasInitialSync]);

  // Handle pending architecture selection after savedArchitectures state is updated
  useEffect(() => {
    if (pendingArchitectureSelection && savedArchitectures.length > 0) {
      const targetArch = savedArchitectures.find(arch => arch.id === pendingArchitectureSelection);
      if (targetArch) {
        console.log('🎯 Executing pending architecture selection:', pendingArchitectureSelection, targetArch.name);
        console.log('🎯 Target architecture data:', {id: targetArch.id, name: targetArch.name, hasRawGraph: !!targetArch.rawGraph});
        
        // Use handleSelectArchitecture to properly load the architecture with full functionality
        handleSelectArchitecture(pendingArchitectureSelection);
        
        setPendingArchitectureSelection(null); // Clear the pending selection
      } else {
        console.warn('⚠️ Pending architecture not found in savedArchitectures:', pendingArchitectureSelection);
        console.warn('⚠️ Available architectures:', savedArchitectures.map(arch => ({id: arch.id, name: arch.name})));
      }
    }
  }, [savedArchitectures, pendingArchitectureSelection]);

  // Function to manually refresh architectures (only when actually needed)
  const refreshArchitectures = useCallback(() => {
    if (user?.uid && hasInitialSync) {
      console.log('🔄 Manual refresh of architectures requested');
      syncWithFirebase(user.uid);
    }
  }, [user, hasInitialSync, syncWithFirebase]);

  
  
  // StreamViewer is now standalone and doesn't need refs
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // State for current chat name
  const [currentChatName, setCurrentChatName] = useState<string>('New Architecture');
  
  // State for share overlay (for embedded version when clipboard fails)
  const [shareOverlay, setShareOverlay] = useState<{ show: boolean; url: string; error?: string; copied?: boolean }>({ show: false, url: '' });
  const [copyButtonState, setCopyButtonState] = useState<'idle' | 'copying' | 'success'>('idle');
  const [inputOverlay, setInputOverlay] = useState<{ 
    show: boolean; 
    title: string; 
    placeholder: string; 
    defaultValue: string; 
    onConfirm: (value: string) => void; 
    onCancel: () => void; 
  }>({ 
    show: false, 
    title: '', 
    placeholder: '', 
    defaultValue: '', 
    onConfirm: () => {}, 
    onCancel: () => {} 
  });
  const [deleteOverlay, setDeleteOverlay] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    onCancel: () => {}
  });
  
  // Universal notification system (replaces all alert/confirm popups)
  const [notification, setNotification] = useState<{
    show: boolean;
    type: 'success' | 'error' | 'info' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
  }>({ show: false, type: 'info', title: '', message: '' });
  
  // State for tracking operations per architecture
  const [architectureOperations, setArchitectureOperations] = useState<Record<string, boolean>>({});
  
  // Helper function to show notifications (replaces alerts)
  const showNotification = useCallback((
    type: 'success' | 'error' | 'info' | 'confirm',
    title: string,
    message: string,
    options?: {
      onConfirm?: () => void;
      onCancel?: () => void;
      confirmText?: string;
      cancelText?: string;
    }
  ) => {
    setNotification({
      show: true,
      type,
      title,
      message,
      onConfirm: options?.onConfirm,
      onCancel: options?.onCancel,
      confirmText: options?.confirmText || 'OK',
      cancelText: options?.cancelText || 'Cancel'
    });
  }, []);

  const hideNotification = useCallback(() => {
    setNotification({ show: false, type: 'info', title: '', message: '' });
  }, []);
  
  // Canvas tool selection state (FREE by default - selection tool)
  const [selectedTool, setSelectedTool] = useState<"select" | "box" | "connector" | "group">("select");
  
  // Helper functions for operation tracking
  const setArchitectureOperationState = useCallback((architectureId: string, isRunning: boolean) => {
    setArchitectureOperations(prev => ({ ...prev, [architectureId]: isRunning }));
  }, []);

  const isArchitectureOperationRunning = useCallback((architectureId: string) => {
    return architectureOperations[architectureId] || false;
  }, [architectureOperations]);
  
  // Helper function to ensure unique architecture names
  const ensureUniqueName = useCallback((baseName: string, existingArchitectures: any[]) => {
    const existingNames = existingArchitectures.map(arch => arch.name.toLowerCase());
    let uniqueName = baseName;
    let counter = 1;
    
    while (existingNames.includes(uniqueName.toLowerCase())) {
      uniqueName = `${baseName} (${counter})`;
      counter++;
    }
    
    return uniqueName;
  }, []);
  
  // State for selected nodes and edges (for delete functionality)
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<Edge[]>([]);

  // Sidebar handlers for ellipsis menu
  const handleDeleteArchitecture = async (architectureId: string) => {
    if (architectureId === 'new-architecture') {
      showNotification('error', 'Cannot Delete', 'Cannot delete the "New Architecture" tab');
      return;
    }

    const architecture = savedArchitectures.find(arch => arch.id === architectureId);
    if (!architecture) {
      console.warn('⚠️ Architecture not found for deletion:', architectureId);
      showNotification('error', 'Architecture Not Found', 'The selected architecture could not be found.');
      return;
    }

    // Show delete confirmation overlay
    setDeleteOverlay({
      show: true,
      title: 'Delete Architecture',
      message: `Are you sure you want to delete "${architecture.name}"? This action cannot be undone.`,
      onConfirm: async () => {
        setDeleteOverlay(prev => ({ ...prev, show: false }));
        
      try {
        // Always attempt to delete from Firebase if user is signed in
        if (user?.uid) {
          const firebaseId = architecture.firebaseId || architecture.id;
          console.log('🗑️ Attempting to delete from Firebase:', firebaseId);
          
          try {
            await ArchitectureService.deleteArchitecture(firebaseId);
            console.log('✅ Architecture deleted from Firebase:', firebaseId);
          } catch (firebaseError: any) {
            if (firebaseError.code === 'not-found' || firebaseError.message?.includes('NOT_FOUND')) {
              console.log('ℹ️ Architecture was not in Firebase, only removing locally');
            } else {
              console.error('❌ Failed to delete from Firebase:', firebaseError);
              // Don't block local deletion if Firebase fails
            }
          }
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
          showNotification('success', 'Deleted', `Architecture "${architecture.name}" has been deleted`);
        
      } catch (error) {
        console.error('❌ Error deleting architecture:', error);
          showNotification('error', 'Delete Failed', `Failed to delete architecture: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      },
      onCancel: () => {
        setDeleteOverlay(prev => ({ ...prev, show: false }));
    }
    });
  };

  const handleShareArchitecture = async (architectureId: string) => {
    const architecture = savedArchitectures.find(arch => arch.id === architectureId);
    if (!architecture) {
      console.warn('⚠️ Architecture not found for sharing:', architectureId);
      showNotification('error', 'Architecture Not Found', 'The selected architecture could not be found.');
      return;
    }

    try {
      console.log('📤 Sharing architecture from sidebar:', architectureId, architecture.name);
      
      // Create a shareable anonymous copy so anonymous users can access it
      console.log('📤 Creating shareable anonymous copy of architecture:', architecture.name);
      
      let anonymousId;
      try {
        anonymousId = await anonymousArchitectureService.saveAnonymousArchitecture(
          `${architecture.name} (Shared)`,
          architecture.rawGraph,
          architecture.userPrompt  // Include userPrompt when sharing
        );
      } catch (error) {
        console.warn('⚠️ Share creation throttled:', error.message);
        showNotification('error', 'Share Throttled', 'Please wait a moment before sharing again.');
        return;
      }
      
      // Create shareable URL using the anonymous copy ID
      if (typeof window === 'undefined') return;
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('arch', anonymousId);
      const shareUrl = currentUrl.toString();
      
      // Always show overlay, try clipboard as enhancement
      const clipboardSuccess = await copyToClipboard(shareUrl, {
        successMessage: 'Sidebar share link copied to clipboard',
        errorMessage: 'Failed to copy sidebar share link',
        showFeedback: false // Already logging ourselves
      });
      
      // Always show overlay regardless of clipboard success
      setShareOverlay({ show: true, url: shareUrl, copied: clipboardSuccess });
      
      console.log('✅ Architecture share link created:', shareUrl);
    } catch (error) {
      console.error('❌ Failed to share architecture:', error);
      showNotification('error', 'Share Failed', 'Failed to create share link. Please try again.');
    }
  };

  const handleEditArchitecture = (architectureId: string) => {
    const architecture = savedArchitectures.find(arch => arch.id === architectureId);
    if (!architecture) {
      console.warn('⚠️ Architecture not found for editing:', architectureId);
      showNotification('error', 'Architecture Not Found', 'The selected architecture could not be found.');
      return;
    }

    // Show input overlay for renaming
    setInputOverlay({
      show: true,
      title: 'Rename Architecture',
      placeholder: 'Enter architecture name',
      defaultValue: architecture.name,
      onConfirm: (newName: string) => {
        setInputOverlay(prev => ({ ...prev, show: false }));
        
    if (newName && newName.trim() && newName !== architecture.name) {
      // Ensure the new name is unique
      const otherArchitectures = savedArchitectures.filter(arch => arch.id !== architectureId);
      const uniqueName = ensureUniqueName(newName.trim(), otherArchitectures);
      
      if (uniqueName !== newName.trim()) {
            showNotification('confirm', 'Name Already Exists', `The name "${newName.trim()}" already exists. Use "${uniqueName}" instead?`, {
              onConfirm: () => {
                hideNotification();
                performRename(architectureId, uniqueName);
              },
              onCancel: hideNotification,
              confirmText: 'Use New Name',
              cancelText: 'Cancel'
            });
            return;
          }
          
          performRename(architectureId, uniqueName);
        }
      },
      onCancel: () => {
        setInputOverlay(prev => ({ ...prev, show: false }));
      }
    });
  };

  const performRename = (architectureId: string, newName: string) => {
    const architecture = savedArchitectures.find(arch => arch.id === architectureId);
    if (!architecture) return;
      
      // Update locally
      setSavedArchitectures(prev => prev.map(arch => 
        arch.id === architectureId 
        ? { ...arch, name: newName }
          : arch
      ));

      // Update in Firebase if it exists there
      if (architecture.isFromFirebase && user?.uid) {
        const firebaseId = architecture.firebaseId || architecture.id;
      ArchitectureService.updateArchitecture(firebaseId, { name: newName })
        .then(() => {
          console.log('✅ Architecture name updated in Firebase');
          showNotification('success', 'Renamed Successfully', `Architecture renamed to "${newName}"`);
        })
        .catch(error => {
          console.error('❌ Error updating name in Firebase:', error);
          showNotification('error', 'Update Failed', 'Failed to update name in the cloud. Changes saved locally.');
        });
    } else {
      showNotification('success', 'Renamed Successfully', `Architecture renamed to "${newName}"`);
    }
  };

  // Placeholder for handleChatSubmit - will be defined after rawGraph and handleGraphChange are available

  // Auth state listener moved to after config is defined



  // Load stored canvas state from public mode (only in full app mode)
  useEffect(() => {
    if (!isPublicMode) {
      const storedState = localStorage.getItem('publicCanvasState');
      if (storedState) {
        try {
          const { elkGraph, timestamp } = JSON.parse(storedState);
          const ageInMinutes = (Date.now() - timestamp) / (1000 * 60);
          
          // Only load if state is less than 30 minutes old
          if (ageInMinutes < 30 && elkGraph) {
            console.log('🔄 Loading canvas state from public mode');
            dispatchElkGraph({
              elkGraph,
              source: 'PublicModeHandoff',
              reason: 'state-restore',
              targetArchitectureId: selectedArchitectureId
            });
            
            // Clear the stored state after loading
            localStorage.removeItem('publicCanvasState');
          } else {
            console.log('🗑️ Stored canvas state expired or invalid, clearing');
            localStorage.removeItem('publicCanvasState');
          }
        } catch (error) {
          console.error('❌ Failed to parse stored canvas state:', error);
          localStorage.removeItem('publicCanvasState');
        }
      }
    }
  }, [isPublicMode, selectedArchitectureId]);



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
  
  // State for SVG pan
  const [svgPan, setSvgPan] = useState({ x: 0, y: 0 });
  
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
  const copyStructuralDataToClipboard = useCallback(async (data: any) => {
    const jsonString = JSON.stringify(data, null, 2);
    await copyToClipboard(jsonString, {
      successMessage: 'Structural ELK data copied to clipboard',
      errorMessage: 'Failed to copy structural data',
      showFeedback: false // Already logging ourselves
    });
  }, []);
  
  // StreamViewer is now standalone and doesn't need refs
  
  // Use the new ElkFlow hook instead of managing ELK state directly
  const {
    // State
    rawGraph,
    layoutGraph,
    layoutError,
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
    handleAddNode,
    handleDeleteNode,
    handleMoveNode,
    handleAddEdge,
    handleDeleteEdge,
    handleGroupNodes,
    handleRemoveGroup,
    handleBatchUpdate,
    
    viewStateRef,
    shouldSkipFitViewRef,
  } = useElkToReactflowGraphConverter({
    id: "root",
    children: [],
    edges: []
  }, selectedTool);

  // Canvas tool selection handler (defined after setNodes is available)
  const handleToolSelect = useCallback((tool: typeof selectedTool) => {
    // Deselect all nodes when switching to box or connector tool BEFORE setting the tool
    // This ensures nodes are deselected immediately when switching tools
    // NOTE: Group tool preserves selection (like select tool) so users can select nodes then group them
    if (tool === 'connector' || tool === 'box') {
      // Use the actual nodes state instead of ref (ref might be stale)
      const selectedNodesFromState = nodes.filter(n => n.selected);
      
      // Deselect all nodes using state (more reliable than ref)
      if (selectedNodesFromState.length > 0) {
        setNodes((nds) => {
          return nds.map(node => ({ ...node, selected: false }));
        });
      }
      
      setSelectedNodes([]);
      setSelectedEdges([]);
    }
    
    // Special case: If switching away from select/group tool to box/connector, deselect nodes
    // But preserve selection when switching between select and group tools
    if ((selectedTool === 'select' || selectedTool === 'group') && (tool === 'box' || tool === 'connector')) {
      const selectedNodesFromState = nodes.filter(n => n.selected);
      if (selectedNodesFromState.length > 0) {
        setNodes((nds) => nds.map(node => ({ ...node, selected: false })));
        setSelectedNodes([]);
      }
    }
    
    // Set the tool after deselection
    setSelectedTool(tool);
  }, [selectedTool, nodes, setNodes, setSelectedNodes]);

  // Listen for auth state changes (moved here after config is defined)
  useEffect(() => {
    
    // In embed mode, handle shared architectures but don't set up auth listeners
    if (viewModeConfig.isEmbedded) {
      setUser(null);
      setSidebarCollapsed(true);
      
      // Check if URL contains a shared anonymous architecture ID
      (async () => {
        await checkAndLoadUrlArchitecture();
      })();
      
      return; // Don't set up any Firebase listeners
    }

    // Check for URL architecture immediately on mount for both canvas and auth modes
    if (viewModeConfig.requiresAuth || viewModeConfig.mode === 'canvas') {
      (async () => {
        const urlArchFound = await checkAndLoadUrlArchitecture();
        if (urlArchFound) {
          console.log('🔍 [URL-ARCH] URL architecture loaded in', viewModeConfig.mode, 'mode');
        }
      })();
    }

    // Set up auth listener based on mode
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        
        // Canvas mode: redirect to auth if user signs in, preserving architecture URL parameter
        if (!viewModeConfig.requiresAuth && currentUser) {
          console.log('🔥 [CANVAS-TO-AUTH] User signing in from canvas mode');
          console.log('🔥 [CANVAS-TO-AUTH] Current URL search:', window.location.search);
          console.log('🔥 [CANVAS-TO-AUTH] Current rawGraph:', rawGraph);
          console.log('🔥 [CANVAS-TO-AUTH] Current chat messages:', getChatMessages());
          
          // Preserve the architecture ID from the current URL
          const currentParams = new URLSearchParams(window.location.search);
          const archId = currentParams.get('arch');
          
          let authUrl = window.location.origin + '/auth';
          if (archId) {
            authUrl += `?arch=${archId}`;
            console.log('🔥 [CANVAS-TO-AUTH] Preserving URL architecture ID:', archId);
          } else {
            console.log('🔥 [CANVAS-TO-AUTH] No URL architecture ID found - will rely on Firebase sync');
          }
          
          console.log('🔥 [CANVAS-TO-AUTH] Redirecting to auth URL:', authUrl);
          window.location.href = authUrl;
          return;
        }
        
        // Auth mode: use actual auth state
        if (viewModeConfig.requiresAuth) {
          setUser(currentUser);
          
          // Auto-open sidebar when user signs in, close when they sign out
          if (currentUser) {
            setSidebarCollapsed(false);
            
            // Check if user is coming from embed view (Edit button transition)
            const isFromEmbed = isEmbedToCanvasTransition();
            if (isFromEmbed) {
              console.log('🔥 [AUTH-MODE] Detected embed-to-auth transition');
              console.log('🔥 [AUTH-MODE] Current rawGraph from canvas:', rawGraph);
              console.log('🔥 [AUTH-MODE] Persisted chat messages:', getChatMessages());
              clearEmbedToCanvasFlag();
              
              // Force Firebase sync if user is already authenticated but coming from embed
              if (!hasInitialSync) {
                console.log('🔥 [AUTH-MODE] Forcing Firebase sync for embed-to-auth transition');
                syncWithFirebase(currentUser.uid);
                setHasInitialSync(true);
              }
            }
            
            // Check if there's a URL architecture that needs to be processed
            console.log('🔥 [AUTH-MODE] Checking for URL architecture...');
            console.log('🔥 [AUTH-MODE] Current URL:', window.location.href);
            console.log('🔥 [AUTH-MODE] URL search params:', window.location.search);
            
            const urlArchFound = await checkAndLoadUrlArchitecture();
            if (urlArchFound) {
              // Set flag to indicate URL architecture was processed
              setUrlArchitectureProcessed(true);
              console.log('🔥 [AUTH-MODE] ✅ URL architecture processed and flag set');
              
              // Still run Firebase sync to load historical tabs
              if (!hasInitialSync) {
                console.log('🔥 [AUTH-MODE] Running Firebase sync for historical tabs...');
                syncWithFirebase(currentUser.uid);
                setHasInitialSync(true);
              }
            } else {
              // No URL architecture, but still ensure Firebase sync happens
              console.log('🔥 [AUTH-MODE] No URL architecture found - will run Firebase sync');
              if (!hasInitialSync) {
                console.log('🔥 [AUTH-MODE] Running Firebase sync...');
                syncWithFirebase(currentUser.uid);
                setHasInitialSync(true);
              }
            }
          } else {
            setSidebarCollapsed(true);
          
          // Even when not signed in, check for URL architecture and load it
          const urlArchFound = await checkAndLoadUrlArchitecture();
          if (urlArchFound) {
            console.log('🔍 [URL-ARCH] Non-authenticated user - URL architecture loaded');
          }
          }
        }
      });
      return () => unsubscribe();
    }
  }, [isPublicMode, viewModeConfig.mode]);

    // Real-time sync: Auto-save current canvas to Firebase when state changes
  const [realtimeSyncId, setRealtimeSyncId] = useState<string | null>(null);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);

  // Auto-save for anonymous architectures (when not signed in)
  useEffect(() => {
    // Only auto-save when not signed in and when there's actual content
    if (!user && rawGraph?.children && rawGraph.children.length > 0) {
      // Debounce saves to prevent loops
      const timeoutId = setTimeout(async () => {
        await autoSaveAnonymous({
          rawGraph,
          anonymousService: anonymousArchitectureService
        });
      }, 2000); // 2 second debounce
      
      return () => clearTimeout(timeoutId);
    }
  }, [rawGraph, user]);

  // Reset real-time sync when switching away from "New Architecture"
  useEffect(() => {
    if (selectedArchitectureId !== 'new-architecture') {
      setRealtimeSyncId(null);
      setIsRealtimeSyncing(false);
    }
  }, [selectedArchitectureId]);

  // Handle shared architecture URLs (works in public, canvas, and auth modes)
  // URL architecture loading is now handled by useUrlArchitecture hook in the main auth effect

  // URL architecture loading is now handled by useUrlArchitecture hook

  // Handler for manual save functionality
  const handleManualSave = useCallback(async () => {
    if (!user) {
      showNotification('confirm', 'Sign In Required', 'Please sign in to save your architecture', {
        onConfirm: async () => {
          // Trigger sign-in by programmatically clicking the SaveAuth button
          const saveAuthButton = document.querySelector('.save-auth-dropdown button');
          if (saveAuthButton) {
            (saveAuthButton as HTMLButtonElement).click();
          }
        },
        onCancel: () => {
          // Do nothing, just close the modal
        }
      });
      return;
    }

    if (!rawGraph || !rawGraph.children || rawGraph.children.length === 0) {
      showNotification('error', 'No Content', 'Please create some content first before saving');
      return;
    }

    setIsSaving(true);
    try {
      console.log('💾 Manual save triggered for:', selectedArchitectureId);
      
      // Handle "New Architecture" case - create a new architecture
      if (!selectedArchitectureId || selectedArchitectureId === 'new-architecture') {
        console.log('💾 Saving new architecture...');
        
        // Generate a proper name for the architecture using AI
        const userPrompt = (window as any).originalChatTextInput || (window as any).chatTextInput || '';
        
        console.log('🤖 Generating name for manual save');
        const baseChatName = await generateNameWithFallback(rawGraph, userPrompt);
        const newChatName = ensureUniqueName(baseChatName, savedArchitectures);
        
        // Save as new architecture
        const now = new Date();
        const docId = await ArchitectureService.saveArchitecture({
          name: newChatName,
          userId: user.uid,
          userEmail: user.email || '',
          rawGraph: rawGraph,
          nodes: [], // React Flow nodes will be generated
          edges: [], // React Flow edges will be generated
          userPrompt: userPrompt || 'Manually saved architecture',
          timestamp: now,
          createdAt: now,
          lastModified: now
        });
        
        console.log('✅ New architecture saved with ID:', docId);
        
        // Add to architectures list and select it
        const newArch = {
          id: docId,
          firebaseId: docId,
          name: newChatName,
          timestamp: now,
          createdAt: now,
          lastModified: now,
          rawGraph: rawGraph,
          userPrompt: userPrompt || 'Manually saved architecture',
          isFromFirebase: true
        };
        
        // Update architectures list - put newly saved architecture first
        setSavedArchitectures(prev => {
          const otherArchs = prev.filter(arch => arch.id !== 'new-architecture' && arch.id !== docId);
          // Put the newly saved architecture first, then other existing architectures
          return [newArch, ...otherArchs];
        });
        
        // Select the newly saved architecture
        setSelectedArchitectureId(docId);
        setCurrentChatName(newChatName);
        
        // Show subtle success indication
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000); // Reset after 2 seconds
        return;
      }
      
      // Handle existing architecture update
      const currentArch = savedArchitectures.find(arch => arch.id === selectedArchitectureId);
      if (!currentArch) {
        throw new Error('Architecture not found');
      }

      const firebaseId = currentArch.firebaseId || currentArch.id;

      // Update Firebase
      await ArchitectureService.updateArchitecture(firebaseId, {
        rawGraph: rawGraph,
        nodes: nodes,
        edges: edges,
      });

      console.log('✅ Architecture manually saved to Firebase');
    } catch (error) {
      console.error('❌ Error manually saving architecture:', error);
      showNotification('error', 'Save Failed', `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  }, [user, selectedArchitectureId, savedArchitectures, rawGraph, nodes, edges]);

  // Handler for canvas save - authenticate first, then save
  const handleCanvasSave = useCallback(async () => {
    if (!user) {
      // User not signed in - redirect to auth, preserving architecture URL parameter
      console.log('💾 Canvas save - user not signed in, redirecting to auth');
      
      // Preserve the architecture ID from the current URL
      const currentParams = new URLSearchParams(window.location.search);
      const archId = currentParams.get('arch');
      
      let authUrl = window.location.origin + '/auth';
      if (archId) {
        authUrl += `?arch=${archId}`;
        console.log('🔗 Preserving architecture ID in save redirect:', archId);
      }
      
      window.location.href = authUrl;
      return;
    }
    
    // User is signed in - proceed with save
    console.log('💾 Canvas save - user signed in, proceeding with save');
    await handleManualSave();
  }, [user, handleManualSave]);

  // Handler for sharing current architecture (works for both signed-in and anonymous users)
  const handleShareCurrent = useCallback(async () => {
    try {
      // Skip execution during SSR
      if (typeof window === 'undefined') return;
      
      // Detect if we're in embedded version
      const isEmbedded = window.location.hostname === 'archgen-ecru.vercel.app' || 
                        window.location.pathname === '/embed' ||
                        window.parent !== window;
      
      // For anonymous users or when no architecture is selected, create a shareable anonymous architecture
      if (!user || selectedArchitectureId === 'new-architecture') {
        if (!rawGraph || !rawGraph.children || rawGraph.children.length === 0) {
          const message = 'Please create some content first before sharing';
          if (isEmbedded) {
            setShareOverlay({ show: true, url: '', error: message });
          } else {
            showNotification('error', 'Cannot Share', message);
          }
          return;
        }

        console.log('📤 Creating shareable anonymous architecture...');
        
        try {
          // Generate an AI-powered name for the architecture
          const userPrompt = (window as any).originalChatTextInput || (window as any).chatTextInput || '';
          let effectivePrompt = userPrompt;
          console.log('🤖 Generating name for share');
          const architectureName = await generateNameWithFallback(rawGraph, effectivePrompt);
          
          // Save as anonymous architecture and get shareable ID
          const anonymousId = await ensureAnonymousSaved({
            rawGraph,
            userPrompt: effectivePrompt,
            anonymousService: anonymousArchitectureService
          });
          console.log('✅ Anonymous architecture saved with ID:', anonymousId);
          
          // Create shareable URL for anonymous architecture
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set('arch', anonymousId);
          const shareUrl = currentUrl.toString();
          console.log('🔗 Generated share URL:', shareUrl);
          
          // Always show the overlay first, then try clipboard as enhancement
          console.log('🔗 Showing share overlay:', shareUrl);
          
          if (isEmbedded) {
            // For embedded version, just show the overlay (no clipboard in iframes)
            setShareOverlay({ show: true, url: shareUrl, copied: false });
          } else {
            // For non-embedded, try clipboard but don't let it break the overlay
            const clipboardSuccess = await copyToClipboard(shareUrl, {
              successMessage: 'Share link copied to clipboard',
              errorMessage: 'Clipboard failed (document not focused)',
              showFeedback: false // Already logging ourselves
            });
              console.log('✅ Share link copied to clipboard:', shareUrl);
            
            // Always show overlay regardless of clipboard success
            setShareOverlay({ show: true, url: shareUrl, copied: clipboardSuccess });
          }
        } catch (shareError) {
          console.error('❌ Failed to create shareable architecture:', shareError);
          const message = 'Failed to create share link. Please try again.';
          if (isEmbedded) {
            setShareOverlay({ show: true, url: '', error: message });
          } else {
            showNotification('error', 'Share Failed', message);
          }
        }
        
        return;
      }

      // For signed-in users with saved architectures
      if (selectedArchitectureId && selectedArchitectureId !== 'new-architecture') {
        console.log('📤 Sharing signed-in user architecture:', selectedArchitectureId);
        
        // Find the architecture to share
        const architecture = savedArchitectures.find(arch => arch.id === selectedArchitectureId);
        if (!architecture || !architecture.rawGraph) {
          const message = 'Architecture not found or has no content to share';
          if (isEmbedded) {
            setShareOverlay({ show: true, url: '', error: message });
          } else {
            showNotification('error', 'Cannot Share', message);
          }
          return;
        }
        
        // Create a shareable anonymous copy so anonymous users can access it
        console.log('📤 Creating shareable anonymous copy of user architecture:', architecture.name);
        
        try {
          // Create anonymous copy for sharing
          const anonymousId = await createAnonymousShare({
            architectureName: architecture.name,
            rawGraph: architecture.rawGraph,
            anonymousService: anonymousArchitectureService
          });
          console.log('✅ Shareable anonymous copy created:', anonymousId);
          
          // Create shareable URL using the anonymous copy ID
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set('arch', anonymousId);
          const shareUrl = currentUrl.toString();
          console.log('🔗 Generated share URL:', shareUrl);
          
          // Always show the overlay first, then try clipboard as enhancement
          console.log('🔗 Showing share overlay:', shareUrl);
          
          if (isEmbedded) {
            // For embedded version, just show the overlay (no clipboard in iframes)
            setShareOverlay({ show: true, url: shareUrl, copied: false });
          } else {
            // For non-embedded, try clipboard but don't let it break the overlay
            const clipboardSuccess = await copyToClipboard(shareUrl, {
              successMessage: 'User architecture share link copied to clipboard',
              errorMessage: 'Clipboard failed (document not focused)',
              showFeedback: false // Already logging ourselves
            });
              console.log('✅ User architecture share link copied to clipboard:', shareUrl);
            
            // Always show overlay regardless of clipboard success
            setShareOverlay({ show: true, url: shareUrl, copied: clipboardSuccess });
          }
        } catch (shareError) {
          console.warn('⚠️ Share creation throttled or failed:', shareError.message);
          const message = shareError.message.includes('throttled') ? 
            'Share throttled - try again in a moment' : 
            'Failed to create share link. Please try again.';
          
          if (isEmbedded) {
            setShareOverlay({ show: true, url: '', error: message });
          } else {
            showNotification('error', 'Share Failed', message);
          }
        }
        
        return;
      }

      // Fallback
      const message = 'Please create some content first before sharing';
      if (isEmbedded) {
        setShareOverlay({ show: true, url: '', error: message });
      } else {
        showNotification('error', 'Cannot Share', message);
      }
    } catch (error) {
      console.error('❌ Error sharing current architecture:', error);
      const errorMessage = `❌ Failed to share: ${error instanceof Error ? error.message : 'Unknown error'}`;
      
      // Skip execution during SSR
      if (typeof window === 'undefined') return;
      
      const isEmbedded = window.location.hostname === 'archgen-ecru.vercel.app' || 
                        window.location.pathname === '/embed' ||
                        window.parent !== window;
      
      if (isEmbedded) {
        setShareOverlay({ show: true, url: '', error: errorMessage });
      } else {
        showNotification('error', 'Share Failed', errorMessage);
      }
    }
  }, [selectedArchitectureId, handleShareArchitecture, user, rawGraph, anonymousArchitectureService]);

  // Initialize with empty canvas for "New Architecture" tab
  useEffect(() => {
    if (selectedArchitectureId === 'new-architecture') {
      const emptyGraph = {
        id: "root",
        children: [],
        edges: []
      };
      setRawGraph(emptyGraph);
    }
  }, [selectedArchitectureId, setRawGraph]);

  // Debug logging for graph state changes
  useEffect(() => {
    // Graph state updated
  }, [rawGraph, selectedArchitectureId]);

  // Handler for PNG export functionality  
  const handleExportPNG = useCallback(async () => {
    await exportArchitectureAsPNG(nodes, {
      showNotification
    });
  }, [nodes, showNotification]);

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

      // Generate AI-powered name for the architecture using the backend API
      const userPrompt = (window as any).originalChatTextInput || (window as any).chatTextInput || '';
      let effectivePrompt = userPrompt;
      console.log('🤖 Generating name for handleSave');
      const architectureName = await generateNameWithFallback(rawGraph, effectivePrompt);
      
      // Prepare the architecture data for saving with validation
      const architectureData = {
        name: architectureName, // No fallback - must be AI-generated
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
      
      // Show subtle success indication
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000); // Reset after 2 seconds
      
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
      
      showNotification('error', 'Save Failed', errorMessage);
    }
  }, [rawGraph, nodes, edges]);

  // Sidebar handlers
  const handleNewArchitecture = useCallback(() => {
    // Reset to "New Architecture" tab
    console.log('🆕 [DEBUG] handleNewArchitecture called - clearing canvas');
    console.trace('🆕 [DEBUG] Stack trace for handleNewArchitecture');
    setSelectedArchitectureId('new-architecture');
    setCurrentChatName('New Architecture');
    
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

  // URL Architecture management
  const loadArchitectureFromUrl = useCallback((architecture: any, source: string) => {
    console.log('🔗 [URL-ARCH] Loading architecture from URL:', { 
      id: architecture.id, 
      name: architecture.name, 
      source,
      nodeCount: architecture.rawGraph?.children?.length || 0 
    });
    
    if (architecture.rawGraph) {
      // Set the content
      setRawGraph(architecture.rawGraph);
      setCurrentChatName(architecture.name);
      
      // Create architecture object for tab (ensure it has proper structure)
      const urlArch = {
        id: architecture.id,
        name: architecture.name,
        timestamp: architecture.timestamp || new Date(),
        rawGraph: architecture.rawGraph,
        userPrompt: architecture.userPrompt || '',
        firebaseId: architecture.firebaseId || architecture.id,
        isFromFirebase: true,
        isFromUrl: true
      };
      
      // Add to saved architectures (create new tab)
      setSavedArchitectures(prev => {
        const exists = prev.some(arch => arch.id === architecture.id);
        if (!exists) {
          console.log('📄 [URL-ARCH] Creating new tab for URL architecture:', architecture.name);
          return [urlArch, ...prev];
        }
        return prev;
      });
      
      // Select this architecture
      setSelectedArchitectureId(architecture.id);
      setPendingArchitectureSelection(null);
      
      console.log('✅ [URL-ARCH] Architecture loaded successfully and added as new tab:', architecture.name);
    } else {
      console.warn('⚠️ [URL-ARCH] Architecture has no rawGraph content');
    }
  }, [setRawGraph]);

  const { checkAndLoadUrlArchitecture, loadSharedAnonymousArchitecture } = useUrlArchitecture({
    loadArchitecture: loadArchitectureFromUrl,
    config: viewModeConfig,
    currentUser: user
  });

  const handleSelectArchitecture = useCallback((architectureId: string) => {
    console.log('🔄 Selecting architecture:', architectureId);
    
    // Save current architecture before switching (if it has content and is not the same architecture)
    if (selectedArchitectureId !== architectureId && rawGraph?.children && rawGraph.children.length > 0) {
      console.log('💾 Saving current architecture before switching:', selectedArchitectureId);
      setSavedArchitectures(prev => prev.map(arch => 
        arch.id === selectedArchitectureId 
          ? { ...arch, rawGraph: rawGraph, timestamp: new Date() }
          : arch
      ));
    }
    
    setSelectedArchitectureId(architectureId);
    
    // Only update global architecture ID if agent is not locked to another architecture
    if (!agentLockedArchitectureId) {
      (window as any).currentArchitectureId = architectureId;
      console.log('🎯 Updated agent target architecture ID to:', architectureId);
    } else {
      console.log('🔒 Agent is locked to architecture:', agentLockedArchitectureId, '- not retargeting');
    }
    
    // Load the architecture data from dynamic savedArchitectures
    const architecture = savedArchitectures.find(arch => arch.id === architectureId);
    
    if (architecture && architecture.rawGraph) {
      console.log('📂 Loading architecture:', architecture.name);
      
      // Update the current chat name to match the selected architecture
      setCurrentChatName(architecture.name);
      console.log('🏷️ Updated chat name to:', architecture.name);
      console.log('🏷️ Selected architecture details:', { id: architecture.id, name: architecture.name, hasRawGraph: !!architecture.rawGraph });
      
      // Use typed event system for architecture loading
      dispatchElkGraph({
        elkGraph: assertRawGraph(architecture.rawGraph, 'ArchitectureSelector'),
        source: 'ArchitectureSelector',
        reason: 'architecture-load'
      });
    } else {
      console.warn('⚠️ Architecture not found:', architectureId);
      console.warn('⚠️ Available architectures:', savedArchitectures.map(arch => ({ id: arch.id, name: arch.name })));
    }
  }, [savedArchitectures, agentLockedArchitectureId, setCurrentChatName, selectedArchitectureId, rawGraph]);

  // Ensure currentChatName stays in sync with selectedArchitectureId
  useEffect(() => {
    if (selectedArchitectureId && selectedArchitectureId !== 'new-architecture') {
      const architecture = savedArchitectures.find(arch => arch.id === selectedArchitectureId);
      if (architecture && architecture.name && currentChatName !== architecture.name) {
        console.log('🔄 Syncing tab name with selected architecture:', architecture.name);
        setCurrentChatName(architecture.name);
      }
    } else if (selectedArchitectureId === 'new-architecture' && currentChatName !== 'New Architecture') {
      console.log('🔄 Syncing tab name to New Architecture');
      setCurrentChatName('New Architecture');
    }
  }, [selectedArchitectureId, savedArchitectures, currentChatName]);

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
  }, [sidebarCollapsed, rightPanelCollapsed]);

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
    
    // Save to Firebase (signed in) or anonymous storage (public mode)
    if (user && selectedArchitectureId !== 'new-architecture') {
      console.log('🔄 Updating Firebase for manual graph change...');
      try {
        const architecture = savedArchitectures.find(arch => arch.id === selectedArchitectureId);
        console.log('🔍 Found architecture for update:', { 
          id: architecture?.id, 
          isFromFirebase: architecture?.isFromFirebase,
          hasFirebaseId: !!architecture?.firebaseId 
        });
        
        if (architecture) {
          // Try to update in Firebase if this architecture exists there
          const firebaseId = architecture.firebaseId || architecture.id;
          console.log('🔄 Attempting Firebase update with ID:', firebaseId);
          
          try {
            await ArchitectureService.updateArchitecture(firebaseId, {
              rawGraph: newGraph
            });
            console.log('✅ Firebase updated for manual graph change');
            
            // Mark as from Firebase if update was successful
            if (!architecture.isFromFirebase) {
              setSavedArchitectures(prev => prev.map(arch => 
                arch.id === selectedArchitectureId 
                  ? { ...arch, isFromFirebase: true, firebaseId }
                  : arch
              ));
            }
          } catch (error: any) {
            if (error.code === 'not-found' || error.message?.includes('NOT_FOUND')) {
              console.log('📝 Architecture not in Firebase, creating new document...');
              try {
                const newDocId = await ArchitectureService.saveArchitecture({
                  name: architecture.name,
                  userId: user.uid,
                  userEmail: user.email || '',
                  rawGraph: newGraph,
                  userPrompt: architecture.userPrompt || ''
                });
                console.log('✅ New Firebase document created:', newDocId);
                
                // Update local state with Firebase ID
                setSavedArchitectures(prev => prev.map(arch => 
                  arch.id === selectedArchitectureId 
                    ? { ...arch, firebaseId: newDocId, isFromFirebase: true }
                    : arch
                ));
              } catch (saveError) {
                console.error('❌ Failed to create new Firebase document:', saveError);
              }
            } else {
              throw error; // Re-throw if it's not a "not found" error
            }
          }
        } else {
          console.log('⚠️ Architecture not found for Firebase update');
        }
      } catch (error) {
        console.error('❌ Error updating Firebase for manual graph change:', error);
      }
    } else if (isPublicMode && !user && newGraph?.children && newGraph.children.length > 0) {
      // Save or update anonymous architecture in public mode when there's actual content
      // But skip if user is signed in (architecture may have been transferred)
      console.log('💾 Saving/updating anonymous architecture in public mode...');
      const userPrompt = (window as any).originalChatTextInput || (window as any).chatTextInput || '';
      
      try {
        await ensureAnonymousSaved({
            rawGraph: newGraph,
          userPrompt,
          anonymousService: anonymousArchitectureService
        });
        console.log('✅ Anonymous architecture saved/updated successfully');
      } catch (error) {
        console.error('❌ Error saving/updating anonymous architecture:', error);
      }
    } else if (isPublicMode && user) {
      console.log('🚫 DEBUG: Skipping anonymous architecture update in handleGraphChange - user is signed in, architecture may have been transferred');
    }
    
    console.groupEnd();
  }, [setRawGraph, rawGraph, user, selectedArchitectureId, savedArchitectures, isPublicMode]);

  // Helper function to extract complete graph state for the agent
  const extractCompleteGraphState = (graph: any) => {
    const collectAllNodes = (graph: any): any[] => {
      const nodes: any[] = [];
      
      const traverse = (node: any, parentId?: string) => {
        nodes.push({
          id: node.id,
          label: node.labels?.[0]?.text || node.id,
          type: node.children ? 'group' : 'node',
          parentId: parentId || 'root',
          iconName: node.data?.iconName || '',
          position: node.position || { x: 0, y: 0 }
        });
        
        if (node.children) {
          node.children.forEach((child: any) => traverse(child, node.id));
        }
      };
      
      if (graph.children) {
        graph.children.forEach((child: any) => traverse(child));
      }
      
      return nodes;
    };
    
    const allNodes = collectAllNodes(graph);
    const allEdges = graph.edges?.map((edge: any) => ({
      id: edge.id,
      source: edge.sources?.[0] || edge.source,
      target: edge.targets?.[0] || edge.target,
      label: edge.labels?.[0]?.text || ''
    })) || [];
    
    return {
      nodeCount: allNodes.length,
      edgeCount: allEdges.length,
      groupCount: allNodes.filter(n => n.type === 'group').length,
      nodes: allNodes,
      edges: allEdges,
      structure: graph,
      summary: `Current graph has ${allNodes.length} nodes (${allNodes.filter(n => n.type === 'group').length} groups) and ${allEdges.length} edges`
    };
  };

  // Chat submission handler - PROPER OPENAI RESPONSES API CHAINING
  const handleChatSubmit = useCallback(async (message: string) => {
    console.log('🚀 handleChatSubmit called with message:', message);
    
    // Fire processing start events for status indicators
    console.log('🔄 Firing userRequirementsStart event for processing indicators');
    window.dispatchEvent(new CustomEvent('userRequirementsStart'));
    
    setArchitectureOperationState(selectedArchitectureId, true);
    try {
      let conversationHistory: any[] = [];
      let currentGraph = JSON.parse(JSON.stringify(rawGraph));
      
      // Update global state for chat agent
      (window as any).currentGraph = currentGraph;
      console.log('📊 Updated global currentGraph for chat agent:', currentGraph ? `${currentGraph.children?.length || 0} nodes` : 'none');
      
      let turnNumber = 1;
      let referenceArchitecture = "";
      let errorCount = 0;
      const MAX_ERRORS = 10; // Increased error tolerance
      let currentResponseId: string | null = null;
      
      console.log('🚀 Starting architecture generation (3-turn prompt guidance)...');
      
      // 🏗️ Search for matching reference architecture to guide the agent
      try {
        console.log('🔍 Starting architecture search...');
        const searchInput = message.toLowerCase().trim();
        const availableArchs = architectureSearchService.getAvailableArchitectures();
        
        if (availableArchs.length === 0) {
          throw new Error('❌ FATAL: No architectures loaded in service! Pre-computed embeddings failed to load.');
        }
        
        console.log(`🔍 Searching for reference architecture: "${searchInput}"`);
        addFunctionCallingMessage(`🔍 Searching architecture database...`);
        const matchedArch = await architectureSearchService.findMatchingArchitecture(searchInput);
          
          if (matchedArch) {
            // Parse the architecture JSON to extract useful patterns for the agent
            let architectureGuidance = "";
            try {
              // The architecture field contains a JSON-like string that needs to be parsed
              const archStr = matchedArch.architecture;
              console.log(`🔍 Parsing reference architecture:`, archStr.substring(0, 200) + '...');
              
              // Extract key patterns from the architecture description and JSON structure
              architectureGuidance = `\n\n🏗️ REFERENCE ARCHITECTURE GUIDANCE:
Found matching pattern: "${matchedArch.subgroup}" from ${matchedArch.cloud.toUpperCase()}
Description: ${matchedArch.description.substring(0, 300)}...

SOURCE: ${matchedArch.source}

KEY ARCHITECTURAL PATTERNS TO FOLLOW:
- Use ${matchedArch.cloud}_* icons for cloud-specific services  
- Follow the layered architecture approach shown in the reference
- Include proper edge connections between all components
- Group related services into logical containers
- Consider observability, security, and data flow patterns shown

ACTUAL REFERENCE GRAPH STRUCTURE (use as inspiration for your design):
${archStr}

This reference provides proven patterns for ${matchedArch.group} applications.
Adapt these patterns to your specific requirements while maintaining the overall structure.`;
              
            } catch (error) {
              console.error('❌ FATAL: Could not parse reference architecture:', error);
              throw new Error(`Failed to parse reference architecture: ${error.message}`);
            }
            
            referenceArchitecture = architectureGuidance;
            
            console.log(`🏗️ Found reference architecture: ${matchedArch.subgroup}`);
            console.log(`📋 Reference architecture content:`, matchedArch);
            console.log(`📝 Full reference text being sent:`, referenceArchitecture);
            addFunctionCallingMessage(`🏗️ Found reference architecture: ${matchedArch.subgroup}`);
            addFunctionCallingMessage(`🔗 Reference URL: ${matchedArch.source}`);
          } else {
            console.log('❌ No suitable architecture match found');
            addFunctionCallingMessage(`⚠️ No matching reference architecture found`);
          }
      } catch (error) {
        console.error("❌ FATAL: Architecture search failed:", error);
        addFunctionCallingMessage(`❌ FATAL ERROR: ${error.message}`);
        throw error; // Re-throw to fail loudly
      }
      
      // Make initial conversation call to get response_id
      console.log(`📞 Making initial agent call for conversation start`);
      console.log('📤 Request payload:', { 
        message: message.trim(), 
        conversationHistory,
        currentGraph: currentGraph,
        referenceArchitecture: referenceArchitecture
      });
      
      // DEBUG: Check if images should be included
      const storedImages = (window as any).selectedImages || [];
      console.log('📸 DEBUG: InteractiveCanvas - storedImages:', storedImages.length);
      
      const initialResponse = await fetch('/api/simple-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: message.trim(), 
          conversationHistory,
          currentGraph: currentGraph,
          referenceArchitecture: referenceArchitecture,
          images: storedImages // Add images to the request
        })
      });

      if (!initialResponse.ok) {
        const errorData = await initialResponse.json();
        throw new Error(`API error: ${errorData.error}`);
      }

      let result = await initialResponse.json();
      currentResponseId = result.responseId || `temp_${Date.now()}`;
      
      console.log('🔗 Got initial response ID:', currentResponseId);
      console.log('🔍 Full result object:', result);

      // Main conversation loop - continue until no more work
      // Temporarily: continue if we have function calls, regardless of hasMoreWork field
      while ((result.hasMoreWork !== false && result.functionCalls && result.functionCalls.length > 0) && turnNumber <= 15) {
        console.log(`📊 Processing turn ${result.turnNumber || turnNumber} with ${result.count || result.functionCalls?.length || 0} operations`);
        
        console.log(`📊 Turn ${result.turnNumber} response:`, {
          functionCalls: result.count,
          isLikelyFinal: result.isLikelyFinalTurn,
          continueMessage: result.continueMessage
        });

      if (result.success && result.functionCalls) {
          // Fire function call start event for status indicators
          console.log('🔧 Firing functionCallStart event for processing indicators');
          window.dispatchEvent(new CustomEvent('functionCallStart'));
          
          const turnMessageId = addFunctionCallingMessage(`🔄 Turn ${result.turnNumber} - Processing ${result.count} operations`);
          let batchErrors: string[] = [];
          let toolOutputs: any[] = [];
        
        for (const functionCall of result.functionCalls) {
          const { name, arguments: args, call_id } = functionCall;
          const messageId = addFunctionCallingMessage(`${name}(${JSON.stringify(args, null, 2)})`);
          
            let executionResult = '';
          try {
            switch (name) {
              case 'add_node':
                const nodeName = args.nodename || 'new_node';
                const parentId = args.parentId || 'root';
                const nodeData = args.data || {};
                currentGraph = addNode(nodeName, parentId, currentGraph, {
                  label: nodeData.label || nodeName,
                  icon: nodeData.icon || 'api'
                });
                  executionResult = `Successfully created node: ${nodeName}`;
                updateStreamingMessage(messageId, `✅ Created node: ${nodeName}`, true, name);
                break;
              case 'add_edge':
                  currentGraph = addEdge(args.edgeId, args.sourceId, args.targetId, currentGraph, args.label);
                  executionResult = `Successfully created edge: ${args.sourceId} → ${args.targetId}`;
                  updateStreamingMessage(messageId, `✅ Created edge: ${args.sourceId} → ${args.targetId}`, true, name);
                break;
              case 'group_nodes':
                  currentGraph = groupNodes(args.nodeIds, args.parentId, args.groupId, currentGraph);
                  executionResult = `Successfully grouped nodes: [${args.nodeIds.join(', ')}] → ${args.groupId}`;
                  updateStreamingMessage(messageId, `✅ Grouped nodes: [${args.nodeIds.join(', ')}] → ${args.groupId}`, true, name);
                break;
              case 'batch_update':
                  currentGraph = batchUpdate(args.operations, currentGraph);
                  
                  // Update global state for chat agent after graph modifications
                  (window as any).currentGraph = currentGraph;
                  
                  executionResult = `Successfully executed batch update: ${args.operations.length} operations`;
                  updateStreamingMessage(messageId, `✅ Batch update: ${args.operations.length} operations`, true, name);
                break;
              default:
                  executionResult = `Error: Unknown function ${name}`;
                updateStreamingMessage(messageId, `❌ Unknown function: ${name}`, true, name);
                console.error('❌ Unknown function call:', name);
                  batchErrors.push(`Unknown function: ${name}`);
              }
            } catch (error: any) {
              let errorMsg = `Error executing ${name}: ${error.message}`;
              
              // Special handling for duplicate node errors - provide specific guidance
              if (error.message.includes('duplicate node id')) {
                const nodeId = error.message.match(/duplicate node id '([^']+)'/)?.[1];
                const existingNodes = currentGraph.children?.map((child: any) => child.id).join(', ') || 'none';
                errorMsg = `DUPLICATE NODE ERROR: Node '${nodeId}' already exists. Do NOT create it again. Existing nodes: ${existingNodes}`;
              }
              
              executionResult = errorMsg;
              updateStreamingMessage(messageId, `❌ ${errorMsg}`, true, name);
              console.error(`❌ ${errorMsg}:`, error);
              batchErrors.push(errorMsg);
              errorCount++;
            }

            // Prepare tool output for chaining - SEND COMPLETE GRAPH STATE
            const completeGraphState = extractCompleteGraphState(currentGraph);
            toolOutputs.push({
              type: 'function_call_output',
              call_id: call_id,
              output: JSON.stringify({
                success: batchErrors.length === 0,
                operation: name,
                result: executionResult,
                graph: completeGraphState,
                instruction: batchErrors.length === 0 
                  ? "Continue building the architecture by calling the next required function. The current graph state is provided above for your reference."
                  : "Fix the error and retry the operation. The current graph state is provided above for your reference."
              })
            });
          }
            
          updateStreamingMessage(turnMessageId, `✅ Turn ${result.turnNumber} completed (${result.count} operations)`, true, 'batch_update');
          
          // 🎯 UPDATE UI AFTER EACH TURN - This makes progress visible to user
        handleGraphChange(currentGraph);
          console.log(`🔄 Updated UI with turn ${result.turnNumber} changes`);
          
          // Check for ELK layout errors from the hook
          if (layoutError) {
            batchErrors.push(`ELK Layout Error: ${layoutError}`);
            console.error('🔥 ELK Layout Error detected:', layoutError);
          }
          
          // Include error feedback in tool outputs if there were errors
          if (batchErrors.length > 0 || layoutError) {
            toolOutputs.forEach(output => {
              const outputData = JSON.parse(output.output);
              outputData.errors = batchErrors;
              if (layoutError) outputData.layout_error = layoutError;
              output.output = JSON.stringify(outputData);
            });
            errorCount += batchErrors.length;
            console.log(`🔥 Including ${batchErrors.length} errors in tool outputs`);
          }
          
          // Stop if too many errors
          if (errorCount >= MAX_ERRORS) {
            console.log(`🛑 Stopping multi-turn generation after ${errorCount} errors`);
            const errorStopMessage = addFunctionCallingMessage(`🛑 Stopping generation due to ${errorCount} errors. Please review the architecture and try again.`);
            updateStreamingMessage(errorStopMessage, `❌ Generation stopped due to repeated errors`, true, 'error');
            break;
          }
          
          // Send tool outputs back to continue conversation
          console.log('🔗 Sending tool outputs for continuation with response ID:', currentResponseId);
          const continuationResponse = await fetch('/api/simple-agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toolOutputs: toolOutputs,
              previousResponseId: currentResponseId,
              currentGraph: currentGraph  // Include updated graph state
            })
          });

          if (!continuationResponse.ok) {
            console.error('❌ Tool output continuation failed');
            break;
          }

          result = await continuationResponse.json();
          currentResponseId = result.responseId;
          turnNumber++;
          
        } else if (result.completed || result.hasMoreWork === false) {
          console.log('✅ Agent completed architecture generation naturally');
          const completionMessage = addFunctionCallingMessage(`🏁 Agent completed architecture generation`);
          updateStreamingMessage(completionMessage, `✅ Architecture generation completed - agent has no more work to do`, true, 'completion');
          
          // Fire completion events to update ProcessingStatusIcon and re-enable chatbox
          window.dispatchEvent(new CustomEvent('allProcessingComplete'));
          window.dispatchEvent(new CustomEvent('processingComplete'));
          
          // Re-enable chatbox for natural completion
          setTimeout(() => {
            setArchitectureOperationState(selectedArchitectureId, false);
          }, 1000);
          
          break;
      } else {
          console.error('❌ Unexpected response format - stopping');
          break;
        }
      }
      
      handleGraphChange(currentGraph);
      console.log('✅ Architecture generation completed');
      
      // Fire completion events to update ProcessingStatusIcon and re-enable chatbox
      window.dispatchEvent(new CustomEvent('allProcessingComplete'));
      window.dispatchEvent(new CustomEvent('processingComplete'));
      
      setTimeout(() => {
        setArchitectureOperationState(selectedArchitectureId, false);
      }, 1000);
      
    } catch (error: any) {
      console.error('❌ MULTI-TURN AGENT error:', error);
      
      // Fire completion events to re-enable chatbox even on error
      window.dispatchEvent(new CustomEvent('allProcessingComplete'));
      window.dispatchEvent(new CustomEvent('processingComplete'));
      
      setArchitectureOperationState(selectedArchitectureId, false);
    }
  }, [selectedArchitectureId, setArchitectureOperationState, rawGraph, handleGraphChange]);

  // Make handleChatSubmit available globally for chat agent integration
  useEffect(() => {
    (window as any).handleChatSubmit = handleChatSubmit;
    return () => {
      delete (window as any).handleChatSubmit;
    };
  }, [handleChatSubmit]);

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
  
  // Note: Using nodes state directly in handleToolSelect instead of ref to avoid stale closures

  // Removed individual tracking refs - now using unified fitView approach
  // Track agent busy state to disable input while drawing
  const [agentBusy, setAgentBusy] = useState(false);
  // Trigger re-render when viewState-only draft groups change
  const [draftVersion, setDraftVersion] = useState(0);

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
  // BUT skip fitView for user-created nodes in FREE mode (they're placed at cursor)
  useEffect(() => {
    // Only trigger if we have content and ReactFlow is ready
    if (nodes.length > 0 && reactFlowRef.current && layoutVersion > 0) {
      // Check if we should skip fitView (for user mutations in FREE mode)
      if (shouldSkipFitViewRef?.current === true) {
        shouldSkipFitViewRef.current = false; // Clear flag after checking
        return;
      }
      
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
          console.log('🗑️ Applying graph changes after deletion:', {
            selectedArchitectureId,
            deletedNodes: selectedNodes.map(n => n.id),
            deletedEdges: selectedEdges.map(e => e.id),
            newGraphNodeCount: updatedGraph?.children?.length || 0
          });
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
  
  // Edge creation: track source node and handle when starting a connection
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectingFromHandle, setConnectingFromHandle] = useState<string | null>(null);

  // Track mouse position for edge preview
  const [connectionMousePos, setConnectionMousePos] = useState<{ x: number; y: number } | null>(null);

  const handleConnectStart = useCallback((_e: any, params: OnConnectStartParams) => {
    // DISABLED: We don't want ReactFlow's default drag-to-connect
    // Only our custom click-to-connect via handleConnectorDotClick should work
    // This prevents the bezier edge from appearing when dragging
    return;
  }, []);

  const handleConnectEnd = useCallback((event: any) => {
    // Reset connection state when connection ends
    // For click-to-connect, onConnect will handle the actual connection
    setConnectingFrom(null);
    setConnectingFromHandle(null);
    setConnectionMousePos(null);
  }, []);

  // Manual handler for clicking on connector dots to start connection with edge preview
  const handleConnectorDotClick = useCallback((nodeId: string, handleId: string) => {
    // CRITICAL: Immediately deselect all nodes when connector port is clicked
    // This prevents ReactFlow from selecting the node when clicking on the port
    if (reactFlowRef.current) {
      reactFlowRef.current.setNodes((nds) => nds.map(node => ({ ...node, selected: false })));
    }
    setSelectedNodes([]);
    
    
    // Check if handleId is a target handle (completing a connection)
    if (handleId.includes('target') && connectingFrom && connectingFrom !== nodeId) {
      console.log('🔗 [handleConnectorDotClick] Completing connection:', { connectingFrom, nodeId, sourceHandle: connectingFromHandle, targetHandle: handleId });
      
      // Complete the connection
      // Create the connection with proper handle IDs
      const connection = { 
        source: connectingFrom, 
        sourceHandle: connectingFromHandle || undefined, 
        target: nodeId, 
        targetHandle: handleId || undefined
      };
      
      console.log('🔗 [handleConnectorDotClick] Created connection object:', connection);
      
      // Call onConnect - this will trigger ReactFlow's onConnect handler
      // which then calls our graph onConnect handler
      console.log('🚀 [handleConnectorDotClick] Calling onConnect...');
      onConnect(connection);
      console.log('✅ [handleConnectorDotClick] onConnect called');
      
      // Clear connection state
      setConnectingFrom(null);
      setConnectingFromHandle(null);
      setConnectionMousePos(null);
      return;
    }
    
    // Otherwise, start a new connection
    setConnectingFrom(nodeId);
    setConnectingFromHandle(handleId);
    console.log('✅ [handleConnectorDotClick] Set connectingFrom:', { nodeId, handleId });
    
    // Track mouse movement to show edge preview (always show when connecting)
    const handleMouseMove = (e: MouseEvent) => {
      if (reactFlowRef.current) {
        const rf = reactFlowRef.current;
        const flowPos = (rf as any).screenToFlowPosition
          ? (rf as any).screenToFlowPosition({ x: e.clientX, y: e.clientY })
          : rf.project({ x: e.clientX, y: e.clientY });
        
        // Always show preview line while moving
        setConnectionMousePos(flowPos);
      }
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      // Remove mouse tracking
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      const currentConnectingFrom = connectingFrom;
      const currentConnectingFromHandle = connectingFromHandle;
      
      if (!currentConnectingFrom) {
        setConnectionMousePos(null);
        return;
      }
      
      // Check if clicked on a target handle
      const target = e.target as HTMLElement;
      const targetHandle = target.closest('.react-flow__handle') as HTMLElement;
      
      if (targetHandle) {
        const handleType = targetHandle.getAttribute('data-handletype');
        const handleId = targetHandle.getAttribute('data-id') || targetHandle.id;
        
        // Find the node that contains this handle
        const nodeElement = targetHandle.closest('.react-flow__node') as HTMLElement;
        const targetNodeId = nodeElement?.getAttribute('data-id') || nodeElement?.id;
        
        // Check if it's a target handle (or connector target handle)
        if (targetNodeId && handleId && 
            (handleType === 'target' || handleId.includes('target')) && 
            targetNodeId !== currentConnectingFrom) {
          // Create connection
          onConnect({ source: currentConnectingFrom, sourceHandle: currentConnectingFromHandle, target: targetNodeId, targetHandle: handleId });
          // Clear connection state after successful connection
          setConnectingFrom(null);
          setConnectingFromHandle(null);
          setConnectionMousePos(null);
          return;
        }
      }
      
      // Also check if clicking on another connector dot (to connect to it)
      const clickedConnectorDot = target.closest('[data-connector-dot]') as HTMLElement;
      if (clickedConnectorDot) {
        const targetNodeId = clickedConnectorDot.getAttribute('data-node-id');
        const targetHandleId = clickedConnectorDot.getAttribute('data-handle-id');
        
        if (targetNodeId && targetHandleId && targetNodeId !== currentConnectingFrom) {
          // Create connection to the clicked connector dot
          onConnect({ source: currentConnectingFrom, sourceHandle: currentConnectingFromHandle, target: targetNodeId, targetHandle: targetHandleId });
          setConnectingFrom(null);
          setConnectingFromHandle(null);
          setConnectionMousePos(null);
          return;
        }
      }
      
      // If clicked anywhere else (empty space, node, etc.), cancel connection (deselect)
      console.log(`[InteractiveCanvas] Clicked outside port area, cancelling connection (deselection)`);
      setConnectingFrom(null);
      setConnectingFromHandle(null);
      setConnectionMousePos(null);
    };
    
    const handleClick = (e: MouseEvent) => {
      // Check if this is a click on a connector port (source or target)
      const target = e.target as HTMLElement;
      const isConnectorPortClick = target.closest('[data-connector-dot]') || 
                                   target.closest('[style*="rgba(0, 255, 0"]') ||
                                   target.closest('.react-flow__handle[id*="connector"]');
      
      // CRITICAL FIX: Allow toolbar clicks to pass through
      const isToolbarClick = target.closest('.absolute.bottom-8.left-1\\/2.-translate-x-1\\/2.z-\\[8000\\]') ||
                             target.closest('[aria-label="Select (V)"]') ||
                             target.closest('[aria-label="Add box (R)"]') ||
                             target.closest('[aria-label="Add connector (C)"]') ||
                             target.closest('[aria-label="Create group (G)"]');
      
      // If clicking on toolbar, let the toolbar handle it - don't intercept
      if (isToolbarClick) {
        console.log(`[InteractiveCanvas] Toolbar click detected - allowing it to pass through`);
        // Clean up listeners but don't prevent the toolbar click
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('click', handleClick);
        return; // Let toolbar handle the click
      }
      
      // If clicking anywhere EXCEPT a connector port or toolbar, cancel the connection (deselect)
      if (!isConnectorPortClick) {
        console.log(`[InteractiveCanvas] Click outside connector port detected, cancelling connection (deselection)`);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('click', handleClick);
        setConnectingFrom(null);
        setConnectingFromHandle(null);
        setConnectionMousePos(null);
      } else {
        // Click was on a connector port - let the port click handler deal with it
        // Just clean up the event listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('click', handleClick);
      }
    };
    
    // Start tracking mouse
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp, { once: true });
    // Listen for clicks to detect deselection (clicking anywhere outside ports)
    document.addEventListener('click', handleClick, { once: true, capture: true });
  }, [connectingFrom, connectingFromHandle, onConnect, handleConnectEnd]);

  const nodeWrapperContextRef = useRef({
    handleLabelChange,
    selectedTool,
    connectingFrom,
    connectingFromHandle,
    handleConnectorDotClick,
    handleAddNodeToGroup,
  });

  useEffect(() => {
    nodeWrapperContextRef.current = {
      handleLabelChange,
      selectedTool,
      connectingFrom,
      connectingFromHandle,
      handleConnectorDotClick,
      handleAddNodeToGroup,
    };
  }, [handleLabelChange, selectedTool, connectingFrom, connectingFromHandle, handleConnectorDotClick, handleAddNodeToGroup]);

  const CustomNodeWrapper = useCallback((props: any) => {
    const ctx = nodeWrapperContextRef.current;
    return (
      <CustomNodeComponent
        {...props}
        onLabelChange={ctx.handleLabelChange}
        selectedTool={ctx.selectedTool}
        connectingFrom={ctx.connectingFrom}
        connectingFromHandle={ctx.connectingFromHandle}
        onConnectorDotClick={ctx.handleConnectorDotClick}
      />
    );
  }, []);

  const GroupNodeWrapper = useCallback((props: any) => {
    const ctx = nodeWrapperContextRef.current;
    return <GroupNode {...props} onAddNode={ctx.handleAddNodeToGroup} />;
  }, []);

  const nodeTypesRef = useRef({
    custom: CustomNodeWrapper,
    group: GroupNodeWrapper,
    draftGroup: DraftGroupNode,
  });

  const stableNodeTypes = nodeTypesRef.current;

  const memoizedEdgeTypes = edgeTypes;
  
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
  }, [isSessionActive, messages.length, isSending, messageSendStatus, rawGraph, currentChatName]);

  // Typed event bridge: Listen for AI-generated graphs and apply them to canvas
  useEffect(() => {
    const unsubscribe = onElkGraph(async ({ elkGraph, source, reason, version, ts, targetArchitectureId }) => {
      
      // Don't mark operation as complete here - wait for the final completion event
      
      // Only update canvas if this operation is for the currently selected architecture
      const shouldUpdateCanvas = !targetArchitectureId || targetArchitectureId === selectedArchitectureId;
      
      console.log('🔍 Canvas update decision:', {
        shouldUpdateCanvas,
        targetArchitectureId,
        selectedArchitectureId,
        agentLockedArchitectureId,
        reason,
        source
      });
      
      if (shouldUpdateCanvas) {
        console.log('✅ Updating canvas for selected architecture');
        setRawGraph(elkGraph);
        
        // Save anonymous architecture in public mode when AI updates the graph
        // But skip if user is signed in (architecture may have been transferred)
        if (isPublicMode && !user && elkGraph?.children && elkGraph.children.length > 0) {
          console.log('💾 Saving anonymous architecture after AI update...');
          try {
            const userPrompt = (window as any).originalChatTextInput || (window as any).chatTextInput || '';
            
            await ensureAnonymousSaved({
                rawGraph: elkGraph,
              userPrompt,
              anonymousService: anonymousArchitectureService
            });
            console.log('✅ Anonymous architecture saved/updated after AI update');
          } catch (error) {
          // Check if this is the expected "No document to update" error after architecture transfer
          if (error instanceof Error && error.message?.includes('No document to update')) {
            console.log('ℹ️ Anonymous architecture was already transferred/deleted - this is expected after sign-in');
          } else {
            console.error('❌ Error saving anonymous architecture after AI update:', error);
          }
        }
        } else if (isPublicMode && user) {
          console.log('🚫 DEBUG: Skipping anonymous architecture update - user is signed in, architecture may have been transferred');
        }
      } else {
        console.log('⏸️ Skipping canvas update - operation for different architecture:', {
          target: targetArchitectureId,
          current: selectedArchitectureId,
          agentLocked: agentLockedArchitectureId
        });
      }
      
      // Always update the architecture data in savedArchitectures for all tabs (including new-architecture)
      if (targetArchitectureId) {
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
            console.log('🤖 Generating name for first-operation rename');
            const baseChatName = await generateNameWithFallback(elkGraph, userPrompt);
            
            // Ensure the name is unique by checking against existing architectures
            const newChatName = ensureUniqueName(baseChatName, savedArchitectures);
            
            console.log('🆕 Renaming "New Architecture" to:', newChatName, 'from prompt:', userPrompt);
            if (newChatName !== baseChatName) {
              console.log('🔄 Name collision detected, using unique name:', newChatName);
            }
            
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
                // Always use current timestamp for new architectures to ensure proper sorting
                const now = new Date();
                
                const docId = await ArchitectureService.saveArchitecture({
                  name: newChatName,
                  userId: user.uid,
                  userEmail: user.email || '',
                  rawGraph: elkGraph,
                  nodes: [], // React Flow nodes will be generated
                  edges: [], // React Flow edges will be generated
                  userPrompt: userPrompt,
                  timestamp: now,
                  createdAt: now,
                  lastModified: now
                });
                
                // Update the tab with Firebase ID and move to top of list
                setSavedArchitectures(prev => {
                  console.log('🔍 Before reordering - savedArchitectures:', prev.map((arch, index) => `${index + 1}. ${arch.name} (${arch.id})`));
                  
                  const updatedArchs = prev.map(arch => 
                    arch.id === 'new-architecture' 
                      ? { ...arch, id: docId, firebaseId: docId, timestamp: now, createdAt: now, lastModified: now }
                      : arch
                  );
                  
                  // Move the newly created architecture to the top (after "New Architecture")
                  const newArchTab = updatedArchs.find(arch => arch.id === 'new-architecture');
                  const newArch = updatedArchs.find(arch => arch.id === docId);
                  const otherArchs = updatedArchs.filter(arch => arch.id !== docId && arch.id !== 'new-architecture');
                  
                  const reordered = newArchTab && newArch ? [newArchTab, newArch, ...otherArchs] : updatedArchs;
                  console.log('🔍 After reordering - savedArchitectures:', reordered.map((arch, index) => `${index + 1}. ${arch.name} (${arch.id})`));
                  
                  return reordered;
                });
                setSelectedArchitectureId(docId);
                
                // CRITICAL: Update the global architecture ID for the agent
                (window as any).currentArchitectureId = docId;
                console.log('🎯 Updated agent target architecture ID to:', docId);
                
                // CRITICAL: Update agent lock to the new Firebase ID
                // Check if we're transitioning from new-architecture (use immediate check)
                if (selectedArchitectureId === 'new-architecture' || agentLockedArchitectureId === 'new-architecture') {
                  console.log('🔒 Updating agent lock from new-architecture to:', docId);
                  setAgentLockedArchitectureId(docId);
                  
                  // IMMEDIATE: Update global architecture ID right away
                  (window as any).currentArchitectureId = docId;
                  console.log('🎯 IMMEDIATE: Updated global currentArchitectureId to:', docId);
                }
                
                // Transfer operation state from 'new-architecture' to new Firebase ID
                const isOperationRunning = architectureOperations['new-architecture'];
                console.log('🔍 Operation transfer check:', {
                  isOperationRunning,
                  currentOperations: architectureOperations,
                  fromId: 'new-architecture',
                  toId: docId
                });
                
                // Force transfer the loading state regardless of current state
                setArchitectureOperations(prev => {
                  const updated = { ...prev };
                  // Transfer any loading state from new-architecture to the new ID
                  if (prev['new-architecture']) {
                    updated[docId] = true;
                    delete updated['new-architecture'];
                    console.log('🔄 FORCED: Transferred loading state from new-architecture to:', docId);
                  } else {
                    // Even if there's no explicit loading state, ensure new tab shows loading if agent is working
                    updated[docId] = true;
                    console.log('🔄 FORCED: Set loading state on new tab:', docId);
                  }
                  
                  // Always clear any loading state from 'new-architecture' tab
                  delete updated['new-architecture'];
                  
                  console.log('🔄 Final operation state:', updated);
                  return updated;
                });
                
                if (isOperationRunning) {
                  console.log('✅ Operation was running on new-architecture, transferred to:', docId);
                } else {
                  console.log('⚠️ No explicit operation on new-architecture, but forced transfer anyway');
                }
                
                // Prevent Firebase sync from reordering for a few seconds
                setJustCreatedArchId(docId);
                setTimeout(() => {
                  setJustCreatedArchId(null);
                  console.log('🔄 Re-enabling Firebase sync after architecture creation');
                }, 3000); // 3 seconds should be enough
                
                console.log('✅ New architecture saved to Firebase:', newChatName);
              } catch (firebaseError) {
                console.error('❌ Failed to save to Firebase:', firebaseError);
              }
            }
          } else if (selectedArchitectureId && selectedArchitectureId !== 'new-architecture' && !isEmptyGraph) {
            // Update existing architecture - save to both local state AND Firebase
            console.log('🔄 Updating existing architecture:', selectedArchitectureId);
            
            // Update local state
            setSavedArchitectures(prev => prev.map(arch => 
              arch.id === selectedArchitectureId 
                ? { ...arch, rawGraph: elkGraph, lastModified: new Date() }
                : arch
            ));
            
            // EMERGENCY: DISABLED auto-save to prevent Firebase quota exhaustion
            // This was causing 20k+ writes by saving on every single graph update
            // TODO: Implement proper debounced auto-save with 5+ second delays
                    // Firebase auto-save disabled to prevent quota exhaustion
          }
          
        } catch (error) {
          console.error('Failed to handle chat creation/update:', error);
        }
      }
    });
    
    return unsubscribe;
  }, [setRawGraph, user, rawGraph, selectedArchitectureId, isPublicMode]);

  // Listen for final processing completion (sync with ProcessingStatusIcon)
  useEffect(() => {
    const handleFinalComplete = () => {
      console.log('🏁 Final processing complete event received');
      console.log('🔍 Current agent lock state:', agentLockedArchitectureId);
      console.log('🔍 Current operation states:', architectureOperations);
      
      // Only clear operations if the agent is truly done (not locked to any architecture)
      // The agent lock gets cleared when operations are truly complete
      if (!agentLockedArchitectureId) {
        console.log('✅ Agent not locked - clearing all loading indicators');
        setArchitectureOperations({});
      } else {
        console.log('⏸️ Agent still locked to:', agentLockedArchitectureId, '- keeping loading indicators');
      }
      
      // Always unlock the agent when this event fires (this indicates true completion)
      setAgentLockedArchitectureId(null);
      
      // Clear loading indicators after unlocking (with small delay)
      setTimeout(() => {
        setArchitectureOperations({});
      }, 100);
    };

    // ONLY listen for allProcessingComplete (same as ProcessingStatusIcon)
    window.addEventListener('allProcessingComplete', handleFinalComplete);

    return () => {
      window.removeEventListener('allProcessingComplete', handleFinalComplete);
    };
  }, [agentLockedArchitectureId, architectureOperations]);
  
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
    // CRITICAL: When connector or box tool is active, ignore node selections
    // Box tool: nodes should not be selectable while placing new nodes
    // Connector tool: nodes should not be selectable while connecting
    if (selectedTool === 'connector' || selectedTool === 'box') {
      // Clear node selection when these tools are active
      if (selectedNodesParam.length > 0) {
        // Force deselect nodes in ReactFlow
        setNodes((nds) => nds.map(node => ({ ...node, selected: false })));
      }
      setSelectedNodes([]);
      setSelectedEdges(selectedEdgesParam);
      return;
    }
    
    // Update selected nodes and edges state for delete functionality
    setSelectedNodes(selectedNodesParam);
    setSelectedEdges(selectedEdgesParam);
    
    // Log selection for debugging
    if (selectedEdgesParam.length > 0) {
      console.log(`🔗 Selected edges:`, selectedEdgesParam.map(edge => edge.id));
    }
    if (selectedNodesParam.length > 0) {
    }
    
    if (selectedNodesParam.length > 0) {
      const selectedIds = selectedNodesParam.map(node => node.id);
      
      // Is a group node selected?
      const hasGroupNode = selectedNodesParam.some(node => node.type === 'group');
      
      // Force edge visibility regardless of node type, but especially for group nodes
      setEdges(currentEdges => updateEdgeStylingOnSelection(currentEdges, selectedIds));
      
      // Update selected nodes tracking
      setSelectedNodeIds(selectedIds);
    } else {
      // Nothing selected - still ensure edges are visible
      setEdges(currentEdges => updateEdgeStylingOnDeselection(currentEdges));
      
      setSelectedNodeIds([]);
    }
  }, [selectedTool, setNodes]);

  // Critical fix to ensure edges remain visible at all times
  useEffect(() => {
    // Function to ensure all edges are visible always
    const ensureEdgesVisible = () => {
      setEdges(currentEdges => ensureEdgeVisibility(currentEdges, { customZIndex: 3000 }));
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

  // Handler for switching visualization modes
  const handleToggleVisMode = useCallback((reactFlowMode: boolean) => {
    setUseReactFlow(reactFlowMode);
    
    // If switching to SVG mode, generate SVG immediately if layoutGraph is available
    if (!reactFlowMode && layoutGraph) {
      const svgContent = generateSVG(layoutGraph);
      setSvgContent(svgContent);
    }
  }, [layoutGraph]);
  
  // Handler for receiving SVG content from DevPanel
  const handleSvgGenerated = useCallback((svg: string) => {
    console.log('[InteractiveCanvas] Received SVG content, length:', svg?.length || 0);
    setSvgContent(svg);
  }, []);

  // SVG zoom handler using utility function
  const handleSvgZoomCallback = useCallback((delta: number) => {
    setSvgZoom(prev => handleSvgZoom(delta, prev));
  }, []);

  // Effect to generate SVG content when needed
  useEffect(() => {
    if (!useReactFlow && !svgContent && layoutGraph) {
      const newSvgContent = generateSVG(layoutGraph);
      setSvgContent(newSvgContent);
    }
  }, [useReactFlow, svgContent, layoutGraph]);

  // Event handler for mousewheel to zoom SVG
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!useReactFlow && svgContainerRef.current && svgContainerRef.current.contains(e.target as Element)) {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
        handleSvgZoomCallback(delta);
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [useReactFlow, handleSvgZoom]);

  return (
    <div className="w-full h-full flex overflow-hidden bg-white dark:bg-black">
      
      {/* Architecture Sidebar - Show only when allowed by view mode */}
      {viewModeConfig.showSidebar && (
      <ArchitectureSidebar
          isCollapsed={viewModeConfig.isEmbedded ? true : (!viewModeConfig.requiresAuth ? true : sidebarCollapsed)}
          onToggleCollapse={viewModeConfig.isEmbedded ? undefined : (!viewModeConfig.requiresAuth ? handleToggleSidebar : (user ? handleToggleSidebar : undefined))}
        onNewArchitecture={handleNewArchitecture}
        onSelectArchitecture={handleSelectArchitecture}
        onDeleteArchitecture={handleDeleteArchitecture}
        onShareArchitecture={handleShareArchitecture}
        onEditArchitecture={handleEditArchitecture}
        selectedArchitectureId={selectedArchitectureId}
        architectures={savedArchitectures}
        isArchitectureOperationRunning={isArchitectureOperationRunning}
        user={user}
        isLoadingArchitectures={isLoadingArchitectures}
      />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">




      {/* Main Graph Area */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        {/* Canvas Toolbar - bottom center overlay */}
        <div 
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[8000]"
        >
          <CanvasToolbar selectedTool={selectedTool} onSelect={handleToolSelect} />
        </div>
        {/* Hover preview for Box placement (snap-to-grid) */}
        <NodeHoverPreview reactFlowRef={reactFlowRef} visible={selectedTool === 'box'} />
        {/* Hover preview for Group placement (snap-to-grid) */}
        <GroupHoverPreview reactFlowRef={reactFlowRef} visible={selectedTool === 'group'} />
        {/* ReactFlow container - only show when in ReactFlow mode */}
        {useReactFlow && (
          <div className="absolute inset-0 h-full w-full z-0"
            onClick={(e) => {
              // Only handle box tool: place node at click
              if (selectedTool === 'box') {
                e.stopPropagation();
                placeNodeOnCanvas(
                  e as unknown as MouseEvent,
                  selectedTool,
                  reactFlowRef,
                  handleAddNode,
                  viewStateRef,
                  (next) => setSelectedTool(next)
                );
                return;
              }
              // For all other tools (including group), let the event bubble through to ReactFlow
            }}
          >
            {/* Draft Group Overlay rendered ABOVE the pane (outside ReactFlow) */}
            {(() => {
              try {
                const vs: any = viewStateRef.current;
                const rf: any = reactFlowRef.current;
                const drafts = vs?.groupDraft ? Object.entries(vs.groupDraft) : [];
                if (!rf || drafts.length === 0) return null;

                const paneEl = typeof document !== 'undefined' ? (document.querySelector('.react-flow__pane') as HTMLElement) : null;
                const paneRect = paneEl ? paneEl.getBoundingClientRect() : null;
                const viewport = rf.getViewport ? rf.getViewport() : { x: 0, y: 0, zoom: (rf.getZoom ? rf.getZoom() : 1) };

                return drafts.map(([id, rect]: any) => {
                  const tlWorld = { x: rect.x, y: rect.y };
                  const brWorld = { x: rect.x + rect.w, y: rect.y + rect.h };
                  let tlScreen, brScreen;
                  if (rf.flowToScreenPosition) {
                    tlScreen = rf.flowToScreenPosition(tlWorld);
                    brScreen = rf.flowToScreenPosition(brWorld);
                  } else {
                    tlScreen = { x: tlWorld.x * viewport.zoom + viewport.x, y: tlWorld.y * viewport.zoom + viewport.y };
                    brScreen = { x: brWorld.x * viewport.zoom + viewport.x, y: brWorld.y * viewport.zoom + viewport.y };
                  }
                  const left = paneRect ? (tlScreen.x - paneRect.left) : tlScreen.x;
                  const top = paneRect ? (tlScreen.y - paneRect.top) : tlScreen.y;
                  const width = Math.max(1, brScreen.x - tlScreen.x);
                  const height = Math.max(1, brScreen.y - tlScreen.y);
                  return (
                    <div
                      key={id}
                      style={{
                        position: 'absolute',
                        left,
                        top,
                        width,
                        height,
                        pointerEvents: 'none',
                        border: '1.5px dashed #3B82F6',
                        background: 'rgba(59, 130, 246, 0.06)',
                        borderRadius: 6,
                        boxShadow: '0 0 0 1px rgba(59,130,246,0.15) inset',
                        zIndex: 10
                      }}
                    />
                  );
                });
              } catch (e) {
                console.warn('Draft overlay (outer) render failed:', e);
                return null;
              }
            })()}
            <ReactFlow 
              ref={reactFlowRef}
              nodes={nodes} 
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={(connection: any) => {
                console.log(`[InteractiveCanvas] ReactFlow onConnect called:`, connection);
                
                // Call the hook's onConnect first to create the edge with handle info
                console.log(`[InteractiveCanvas] Calling graph onConnect handler with:`, connection);
                onConnect(connection);
                
                // Then clear connecting state
                setConnectingFrom(null);
                setConnectingFromHandle(null);
                setConnectionMousePos(null);
              }}
              onSelectionChange={onSelectionChange}
              onPaneClick={(event) => {
                // Group tool: if nodes selected, group them. If none selected, create a draft group here.
                if (selectedTool === 'group') {
                  if (selectedNodes.length >= 1) {
                    const nodeIds = selectedNodes.map(node => node.id);
                    const groupId = `group-${Date.now()}`;
                    console.log('📦 [Group Tool] Creating group with nodes:', nodeIds);
                    
                    // Find common parent of selected nodes
                    // Start with the first node's parent, then find common ancestor with each subsequent node
                    let parentId = 'root'; // Default fallback
                    
                    try {
                      // Try to find the common parent by checking node positions in ReactFlow
                      // If nodes have parentNode property, use their common parent
                      const parentNodes = selectedNodes
                        .map(node => node.parentNode)
                        .filter(Boolean) as string[];
                      
                      if (parentNodes.length > 0) {
                        // If all nodes share the same parent, use it
                        const uniqueParents = [...new Set(parentNodes)];
                        if (uniqueParents.length === 1) {
                          parentId = uniqueParents[0];
                        } else {
                          // If nodes have different parents, default to root
                          // The groupNodes mutation will handle finding actual parents
                          parentId = 'root';
                        }
                      }
                      
                      // For nodes directly under root, check if they're siblings
                      // If no parent info available, default to root
                      
                      console.log('📦 [Group Tool] Calling handleGroupNodes with:', { nodeIds, parentId, groupId });
                      handleGroupNodes(nodeIds, parentId, groupId, undefined);
                      console.log('✅ [Group Tool] Group created successfully');
                      // Clear selection after grouping
                      setNodes((nds) => nds.map(node => ({ ...node, selected: false })));
                      setSelectedNodes([]);
                      // Switch back to select tool
                      setSelectedTool('select');
                    } catch (error) {
                      console.error('❌ [Group Tool] Failed to create group:', error);
                      // Show user-friendly error message
                      alert(`Failed to create group: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                  } else {
                    // No nodes selected: create a real empty group in the domain and position via view state
                    try {
                      const rf = reactFlowRef.current as any;
                      if (!rf) return;
                      const evt = event as unknown as MouseEvent;
                      const pt = rf.screenToFlowPosition
                        ? rf.screenToFlowPosition({ x: (evt as any).clientX, y: (evt as any).clientY })
                        : rf.project({ x: (evt as any).clientX, y: (evt as any).clientY });

                      // Create a DRAFT group as an actual ReactFlow node (moves with canvas)
                      const groupId = `draft-group-${Date.now()}`;
                      if (rf) {
                        const screenClick = { x: event.clientX, y: event.clientY };
                        const flowPosition = rf.screenToFlowPosition(screenClick);
                        const snap = (v: number) => Math.round(v / 16) * 16;
                        const cornerFlow = { x: flowPosition.x - 240, y: flowPosition.y - 160 }; // 480/2=240, 320/2=160 for center
                        const snappedPosition = { x: snap(cornerFlow.x), y: snap(cornerFlow.y) };
                        
                        console.log('🟢 [Group Creation] COORDINATES:', {
                          screenClick,
                          flowPosition,
                          cornerFlow: cornerFlow,  
                          snappedPosition: snappedPosition,
                          finalNodePosition: snappedPosition,
                          dimensions: { width: 480, height: 320 }
                        });
                        
                        // Add draft group as ReactFlow node (moves with canvas properly)
                        const draftNode = {
                          id: groupId,
                          type: 'draftGroup',
                          position: snappedPosition,
                          data: { 
                            label: 'Group',
                            isDraft: true,
                            state: 'default' // Start in default state, will show create state when selected
                          },
                          style: {
            width: 480, // Grid-aligned: 30×16
            height: 320, // Grid-aligned: 20×16
                          },
                          draggable: true,
                          selectable: true,
                          selected: true, // Auto-select to show create state initially
                          resizable: false, // Disable ReactFlow's built-in resize handles
                        };
                        
                        setNodes((nds) => [...nds, draftNode]);
                        console.log('📦 [Draft Group] Created draft group node', groupId, 'at', snappedPosition);
                        
                        // Switch back to select tool for immediate interaction
                        setSelectedTool('select');
                      }
                    } catch (e) {
                      console.error('❌ [Group Empty] Failed to create group:', e);
                    }
                  }
                } else if (selectedTool === 'select') {
                  // Only deselect when in select mode - other tools handle their own behavior
                  setNodes((nds) => nds.map(node => ({ ...node, selected: false })));
                  setSelectedNodes([]);
                  setSelectedEdges([]);
                }
              }}
              onInit={(instance) => {
                reactFlowRef.current = instance;
              }}
              nodeTypes={stableNodeTypes}
              edgeTypes={edgeTypes}
              className={`w-full h-full ${CANVAS_STYLES.canvas.background.light} dark:${CANVAS_STYLES.canvas.background.dark}`}
              defaultEdgeOptions={{
                type: 'step', // Right-angled edges (not bezier/smoothstep)
                style: CANVAS_STYLES.edges.default,
                animated: false,
                zIndex: CANVAS_STYLES.zIndex.edgeLabels,
                markerEnd: {
                  type: 'arrowclosed',
                  width: 20,
                  height: 20,
                  color: '#555'
                }
              }}
              // fitView removed - we control fitView manually via manualFitView() only
              minZoom={CANVAS_STYLES.canvas.zoom.min}
              maxZoom={CANVAS_STYLES.canvas.zoom.max}
              defaultViewport={CANVAS_STYLES.canvas.viewport.default}
              zoomOnScroll
              panOnScroll
              panOnDrag
              selectionOnDrag
              elementsSelectable={selectedTool !== 'box' && selectedTool !== 'connector'} // Disable selection when box/connector tool is active
              nodesDraggable={true}
              nodesConnectable={false} // Disable ReactFlow's default drag-to-connect, we use custom click-to-connect
              selectNodesOnDrag={selectedTool === 'select'} // Only allow drag selection in select mode
              style={{ cursor: 'grab' }}
              elevateEdgesOnSelect={true}
              disableKeyboardA11y={false}
              edgesFocusable={true}
              edgesUpdatable={true}
              onConnectStart={handleConnectStart}
              onConnectEnd={handleConnectEnd}
              onNodeDragStart={(event, node) => {
                // Prevent dragging draft group nodes when clicking on resize handles
                if (node.type === 'draftGroup') {
                  const target = event.target as HTMLElement;
                  const isResizeHandle = target.closest('[data-handle]') !== null;
                  if (isResizeHandle) {
                    console.log('🚫 [InteractiveCanvas] Preventing drag - resize handle clicked');
                    // Prevent ReactFlow from dragging by stopping the event
                    event.preventDefault();
                    // Return false to cancel drag
                    return false;
                  }
                }
              }}
              onNodeDrag={(event, node) => {
                // Also prevent drag during drag if handle was clicked
                if (node.type === 'draftGroup') {
                  const target = event.target as HTMLElement;
                  const isResizeHandle = target.closest('[data-handle]') !== null;
                  if (isResizeHandle) {
                    event.preventDefault();
                    return false;
                  }
                }
              }}
              deleteKeyCode="Delete"
              connectOnClick={false}
              elevateNodesOnSelect={false}
            >
              {/* Draft Group Overlay (view-state only) */}
              {(() => {
                try {
                  const vs: any = viewStateRef.current;
                  const rf: any = reactFlowRef.current;
                  const drafts = vs?.groupDraft ? Object.entries(vs.groupDraft) : [];
                  if (!rf || drafts.length === 0) return null;

                  const paneRect = (typeof document !== 'undefined') ? (document.querySelector('.react-flow__pane') as HTMLElement)?.getBoundingClientRect() : null;
                  const viewport = rf.getViewport ? rf.getViewport() : { x: 0, y: 0, zoom: (rf.getZoom ? rf.getZoom() : 1) };

                  return drafts.map(([id, rect]: any) => {
                    // Convert world top-left and bottom-right to screen, then to pane-local coords
                    const tlWorld = { x: rect.x, y: rect.y };
                    const brWorld = { x: rect.x + rect.w, y: rect.y + rect.h };

                    let tlScreen, brScreen;
                    if (rf.flowToScreenPosition) {
                      tlScreen = rf.flowToScreenPosition(tlWorld);
                      brScreen = rf.flowToScreenPosition(brWorld);
                    } else {
                      tlScreen = { x: tlWorld.x * viewport.zoom + viewport.x, y: tlWorld.y * viewport.zoom + viewport.y };
                      brScreen = { x: brWorld.x * viewport.zoom + viewport.x, y: brWorld.y * viewport.zoom + viewport.y };
                    }

                    const left = paneRect ? (tlScreen.x - paneRect.left) : tlScreen.x;
                    const top = paneRect ? (tlScreen.y - paneRect.top) : tlScreen.y;
                    const width = Math.max(1, brScreen.x - tlScreen.x);
                    const height = Math.max(1, brScreen.y - tlScreen.y);

                    return (
                      <div
                        key={id}
                        style={{
                          position: 'absolute',
                          left,
                          top,
                          width,
                          height,
                          pointerEvents: 'none',
                          border: '1.5px dashed #3B82F6', // blue-500
                          background: 'rgba(59, 130, 246, 0.06)',
                          borderRadius: 6,
                          boxShadow: '0 0 0 1px rgba(59,130,246,0.15) inset'
                        }}
                      />
                    );
                  });
                } catch (e) {
                  console.warn('Draft overlay render failed:', e);
                  return null;
                }
              })()}
              {/* Edge preview that follows cursor when connecting */}
              {connectingFrom && connectionMousePos && (() => {
                const sourceNode = nodes.find(n => n.id === connectingFrom);
                if (!sourceNode || !reactFlowRef.current) return null;
                
                const rf = reactFlowRef.current;
                const nodeElement = document.querySelector(`[data-id="${connectingFrom}"]`);
                if (!nodeElement) return null;
                
                // Get handle position - connector handles are on borders
                const nodeRect = (nodeElement as HTMLElement).getBoundingClientRect();
                const paneRect = document.querySelector('.react-flow__pane')?.getBoundingClientRect();
                if (!paneRect) return null;
                
                // Find which handle was clicked based on handleId
                const handleSide = connectingFromHandle?.includes('top') ? 'top' :
                                   connectingFromHandle?.includes('right') ? 'right' :
                                   connectingFromHandle?.includes('bottom') ? 'bottom' : 'left';
                
                const nodeWidth = (sourceNode.data as any)?.width || 96;
                const nodeCenterX = sourceNode.position.x + nodeWidth / 2;
                const nodeCenterY = sourceNode.position.y + nodeWidth / 2;
                
                let sourceX: number, sourceY: number;
                if (handleSide === 'top') {
                  sourceX = nodeCenterX;
                  sourceY = sourceNode.position.y;
                } else if (handleSide === 'bottom') {
                  sourceX = nodeCenterX;
                  sourceY = sourceNode.position.y + nodeWidth;
                } else if (handleSide === 'left') {
                  sourceX = sourceNode.position.x;
                  sourceY = nodeCenterY;
                } else {
                  sourceX = sourceNode.position.x + nodeWidth;
                  sourceY = nodeCenterY;
                }
                
                const targetX = connectionMousePos.x;
                const targetY = connectionMousePos.y;
                const midX = sourceX + (targetX - sourceX) / 2;
                const edgePath = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
                
                return (
                  <EdgeLabelRenderer>
                    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10000 }}>
                      <path
                        d={edgePath}
                        stroke="#b1b1b7"
                        strokeWidth={2}
                        fill="none"
                        strokeDasharray="5 5"
                      />
                    </svg>
                  </EdgeLabelRenderer>
                );
              })()}
              <Background 
                color="#333" 
                gap={16} 
                size={1}
                variant={BackgroundVariant.Dots}
              />
              <Controls 
                position="bottom-left" 
                showZoom={true}
                showFitView={true}
                showInteractive={true}
              />
            </ReactFlow>
          </div>
        )}
        
        {/* SVG container - only show when in SVG mode */}
        {!useReactFlow && (
          <div 
            ref={svgContainerRef}
            className="absolute inset-0 h-full w-full z-0 overflow-hidden bg-gray-50"
            style={{
              transform: `scale(${svgZoom}) translate(${svgPan.x}px, ${svgPan.y}px)`,
              transformOrigin: 'center center'
            }}
          >
            {svgContent ? (
              <div 
                className="w-full h-full flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500">
                Generating SVG...
          </div>
        )}
          </div>
        )}
        
      </div>
      
      {/* ChatBox at the bottom - Conditionally shown based on ViewMode config */}
      {viewModeConfig.showChatbox && (
        <div className="flex-none min-h-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg z-10">
          <Chatbox 
            onSubmit={handleChatSubmit}
            onProcessStart={() => {
              console.log('🔄 Starting operation for architecture:', selectedArchitectureId);
              console.log('🔒 LOCKING agent to architecture:', selectedArchitectureId);
              
              // Lock agent to current architecture for the entire session
              setAgentLockedArchitectureId(selectedArchitectureId);
              setArchitectureOperationState(selectedArchitectureId, true);
              
              // Set global architecture ID to locked architecture
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
      )}
      
      {/* Connection status indicator - HIDDEN */}
      {/* 
      <div className="absolute top-4 left-4 z-[101]">
        <ConnectionStatus />
      </div>
      */}



      {/* Dev Panel */}
      {showDev && (
            <DevPanel 
          onClose={() => setShowDev(false)}
          rawGraph={rawGraph}
          setRawGraph={setRawGraph}
          isSessionActive={isSessionActive}
          sendTextMessage={sendTextMessage}
        />
      )}
      
      {/* Share Overlay for Embedded Version */}
      <ShareOverlay
        state={shareOverlay}
        onClose={() => setShareOverlay({ show: false, url: '' })}
        onCopy={(ok) => setShareOverlay(prev => ({ ...prev, copied: ok }))}
      />
      {/* Input Overlay - Matching Share Dialog Design */}
      <PromptModal
        show={inputOverlay.show}
        title={inputOverlay.title}
                  placeholder={inputOverlay.placeholder}
                defaultValue={inputOverlay.defaultValue}
        onConfirm={inputOverlay.onConfirm}
        onCancel={inputOverlay.onCancel}
      />

      {/* Delete Overlay - Matching Share Dialog Design */}
      <ConfirmModal
        show={deleteOverlay.show}
        title={deleteOverlay.title}
        message={deleteOverlay.message}
        onConfirm={deleteOverlay.onConfirm}
        onCancel={deleteOverlay.onCancel}
      />

      {/* Notification Overlay - Matching Share Dialog Design */}
      <NotificationModal
        show={notification.show}
        title={notification.title}
        message={notification.message}
        type={notification.type}
        onConfirm={() => setNotification(prev => ({ ...prev, show: false }))}
        onCancel={() => setNotification(prev => ({ ...prev, show: false }))}
        confirmText={notification.confirmText || "OK"}
      />
      
              </div>

      {/* Save/Edit and Settings buttons - align to right, match toolbar height/spacing */}
      <div className={`absolute top-4 z-[100] flex items-center transition-all duration-300 ${
        viewModeConfig.showChatPanel
          ? (rightPanelCollapsed ? 'right-[5.5rem]' : 'right-[25rem]')
          : 'right-4'
      }`} style={{ height: 40, gap: 8 }}>
        {/* Share Button - Always visible for all users */}
                <button
          onClick={handleShareCurrent}
          disabled={!rawGraph || !rawGraph.children || rawGraph.children.length === 0}
          className={`flex items-center gap-2 px-2 h-10 rounded-lg shadow-lg border border-gray-200 hover:shadow-md transition-all duration-200 ${
            !rawGraph || !rawGraph.children || rawGraph.children.length === 0
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          title={
            !rawGraph || !rawGraph.children || rawGraph.children.length === 0
              ? 'Create some content first to share'
              : 'Share current architecture'
          }
        >
          <Share className="w-4 h-4" />
          <span className="text-sm font-medium">Share</span>
                </button>
        
        <ViewControls
          isSaving={isSaving}
          saveSuccess={saveSuccess}
          rawGraph={rawGraph}
          handleManualSave={handleManualSave}
          handleSave={handleSave}
          user={user} 
          onExport={handleExportPNG}
        />
      </div>
    </div>
  );
};

export default InteractiveCanvas;
