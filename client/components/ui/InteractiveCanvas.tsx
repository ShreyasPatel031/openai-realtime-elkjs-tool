/**
 * CRITICAL REPOSITORY RULE — DO NOT SKIP
 *
 * InteractiveCanvas.tsx is already too large. Do NOT add new logic or components here.
 * - Only orchestrate and wire references to helpers/modules.
 * - Put new interactions (e.g., tools, gestures, policies) in dedicated files:
 *   - Hooks → client/hooks/{domain}/ (e.g., client/hooks/canvas/)
 *   - Utilities → client/utils/{domain}/ (e.g., client/utils/canvas/)
 *   - If a domain folder doesn't exist, CREATE IT rather than adding to root hooks/utils
 * - Keep this file as a thin coordinator to protect maintainability and testability.
 */
"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import ReactFlow, { 
  Background, 
  Controls, 
  BackgroundVariant,
  Node,
  Edge,
  useReactFlow,
  getRectOfNodes,
  getTransformForBounds,
  BaseEdge
} from "reactflow"
import "reactflow/dist/style.css"
import { cn } from "../../lib/utils"
import { markEmbedToCanvasTransition, isEmbedToCanvasTransition, clearEmbedToCanvasFlag, getChatMessages, getCurrentConversation, normalizeChatMessages, mergeChatMessages, saveChatMessage, EMBED_PENDING_CHAT_KEY, EMBED_CHAT_BROADCAST_CHANNEL, PersistedChatMessage } from "../../utils/chatPersistence"
import ViewControls from "./ViewControls"

// Import types from separate type definition files
import { InteractiveCanvasProps } from "../../types/chat"
import { RawGraph } from "../graph/types/index"
import { deleteNode, deleteEdge, addNode, addEdge, groupNodes, batchUpdate, moveNode, createWrapperSection } from "../graph/mutations"
import { initializeOrchestrator } from "../../core/orchestration/Orchestrator"
import { CANVAS_STYLES, getEdgeStyle, getEdgeZIndex } from "../graph/styles/canvasStyles"
import { useCanvasInitialization } from "../../hooks/canvas/useCanvasInitialization"
import { useChatSession } from '../../hooks/useChatSession'
import { addFunctionCallingMessage, updateStreamingMessage } from '../../utils/chatUtils'
import { elkGraphDescription, agentInstruction } from '../../realtime/agentConfig'

// Import extracted components
import CustomNodeComponent from "../CustomNode"
import ShareOverlay from "../canvas/ShareOverlay"
import PromptModal from "../canvas/PromptModal"
import ConfirmModal from "../canvas/ConfirmModal"
import NotificationModal from "../canvas/NotificationModal"
import { exportArchitectureAsPNG } from "../../utils/exportPng"
import { copyToClipboard } from "../../utils/copyToClipboard"
import { generateNameWithFallback, ensureUniqueName } from "../../utils/naming"
import { ensureAnonymousSaved, createAnonymousShare } from "../../utils/anonymousSave"
import { useUrlArchitecture } from "../../hooks/useUrlArchitecture"
import { ensureEdgeVisibility, updateEdgeStylingOnSelection, updateEdgeStylingOnDeselection } from "../../utils/edgeVisibility"
import { findContainingGroup, findFullyContainedNodes } from "../../utils/containmentDetection"
import { syncWithFirebase as syncWithFirebaseService } from "../../services/syncArchitectures"
import { sanitizeStoredViewState, restoreNodeVisuals } from "../../utils/canvasLayout"
import { createEmptyViewState } from "../../core/viewstate/ViewState"
import { CoordinateService } from "../../core/viewstate/CoordinateService"
import DraftGroupNode from "../node/DraftGroupNode"
import StepEdge from "../StepEdge"
import { runScopeLayout } from "../../core/layout/ScopedLayoutRunner"
import { mergeViewState } from "../../state/viewStateOrchestrator"
import { createNodeID } from "../../types/graph"
import { NodeInteractionContext } from "../../contexts/NodeInteractionContext"
import { resolveElkScope, apply } from "../../core/orchestration/Orchestrator"
import type { EditIntent } from "../../core/orchestration/types"
import ELK from "elkjs/lib/elk.bundled.js"
import { ensureIds } from "../graph/utils/elk/ids"
import { generateSVG, handleSvgZoom } from "../../utils/svgExport"

// Import extracted services and utilities
import { CanvasArchitectureService } from "../../services/canvasArchitectureService"
import { CanvasSaveService } from "../../services/canvasSaveService"
import { CanvasChatService } from "../../services/canvasChatService"
import { CanvasModalManager } from "../../utils/canvasModals"
import { createViewStateSnapshot, saveCanvasSnapshot, LOCAL_CANVAS_SNAPSHOT_KEY } from "../../utils/canvasPersistence"
import { logDeletionAndSave, logPageLoad, logUrlArchCheck, extractGroupIdsFromGraph } from "../../utils/viewstateDebug"
import { useCanvasState } from "../../hooks/useCanvasState"
import { setupWindowHelpers } from "../../utils/migrationTestHelpers"

/**
 * READ ME: InteractiveCanvas is already very large. Do NOT add new interaction
 * logic or component code directly here. Add it in a dedicated helper/module and
 * import the reference. Keep this file as a thin orchestrator.
 */
import { placeNodeOnCanvas } from "../../utils/canvas/canvasInteractions"
import { handleGroupToolPaneClick } from "../../utils/canvas/canvasGroupInteractions"
import { handleDeleteKey } from "../../utils/canvas/canvasDeleteInteractions"
import { useCanvasPersistenceEffect } from "../../hooks/canvas/useCanvasPersistence"
import NodeHoverPreview from "./NodeHoverPreview"
import GroupHoverPreview from "./GroupHoverPreview"
import CanvasToolbar from "./CanvasToolbar"
import { useCanvasEdgeInteractions } from "../../hooks/canvas/useCanvasEdgeInteractions"

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
import { assertRawGraph } from "../../events/graphSchema"
import { iconFallbackService } from "../../utils/iconFallbackService"
import { useViewMode } from "../../contexts/ViewModeContext"
import { onElkGraph, dispatchElkGraph } from "../../events/graphEvents"
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
  group: DraftGroupNode,
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
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasOpener = (() => {
      try {
        return !!window.opener && window.opener !== window;
      } catch {
        return false;
      }
    })();
    const transitionedFromEmbed = isEmbedToCanvasTransition() || hasOpener;
    if (!transitionedFromEmbed) return;

    const hydrateConversation = (raw: any, source: string) => {
      if (!raw) return false;

      let parsed: any[] | null = null;

      if (typeof raw === 'string') {
        try {
          const attempt = JSON.parse(raw);
          parsed = Array.isArray(attempt) ? attempt : null;
        } catch (error) {
          console.warn(`Failed to parse chat snapshot from ${source}:`, error);
          parsed = null;
        }
      } else if (Array.isArray(raw)) {
        parsed = raw;
      } else if (typeof raw === 'object' && Array.isArray((raw as any).conversation)) {
        parsed = (raw as any).conversation;
      }

      const normalizedIncoming = normalizeChatMessages(parsed || undefined);
      if (!normalizedIncoming || normalizedIncoming.length === 0) {
        return false;
      }

      const merged = mergeChatMessages(getCurrentConversation(), normalizedIncoming);
      if (!merged || merged.length === 0) {
        return false;
      }

      try {
        const serialized = JSON.stringify(merged);
        localStorage.setItem('atelier_current_conversation', serialized);
        (window as any).__atelierLastConversation = serialized;
        console.log(`💬 [CHAT SYNC] Restored conversation from ${source}, messages=`, merged.length);
        return true;
      } catch (error) {
        console.warn(`Failed to store chat snapshot from ${source}:`, error);
        return false;
      }
    };

    const handleEmbedChatSnapshot = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || typeof message !== 'object') return;
      if (message.type !== 'embed-chat-snapshot') return;

      hydrateConversation(message.conversation, 'embed message');
    };

    window.addEventListener('message', handleEmbedChatSnapshot);

    let broadcastChannel: BroadcastChannel | null = null;
    const handleBroadcastMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'chat-snapshot') {
        hydrateConversation(data.conversation, 'broadcast channel');
        if (data.prompt && typeof data.prompt === 'string' && data.prompt.trim().length > 0) {
          try {
            const existingConversation = getCurrentConversation();
            const incoming = normalizeChatMessages([{ content: data.prompt, sender: 'user' as const, timestamp: Date.now(), id: crypto.randomUUID() }]);
            const merged = mergeChatMessages(existingConversation, incoming);
            if (merged && merged.length > 0) {
              const serialized = JSON.stringify(merged);
              localStorage.setItem('atelier_current_conversation', serialized);
              (window as any).__atelierLastConversation = serialized;
            }
          } catch (error) {
            console.warn('Failed to merge prompt from broadcast channel:', error);
          }
        }
      }
    };

    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannel = new BroadcastChannel(EMBED_CHAT_BROADCAST_CHANNEL);
      embedChatChannelRef.current = broadcastChannel;
      broadcastChannel.onmessage = handleBroadcastMessage;
      console.log('📡 [CHAT SYNC] Broadcast channel connected in canvas');
      broadcastChannel.postMessage({ type: 'chat-request' });
    }

    try {
      if (window.opener && window.opener !== window) {
        window.opener.postMessage({ type: 'embed-chat-request' }, window.location.origin);
      }
    } catch (error) {
      console.warn('Failed to request chat snapshot from embed:', error);
    }

    try {
      if (window.name && window.name.startsWith('embed-')) {
        const encoded = window.name.slice('embed-'.length);
        const decoded = decodeURIComponent(escape(window.atob(encoded)));
        const payload = JSON.parse(decoded);

        if (payload?.conversation) {
          hydrateConversation(payload.conversation, 'window.name payload');
        } else if (payload?.prompt) {
          const prompt = String(payload.prompt);
          if (prompt.trim().length > 0) {
            hydrateConversation([{ content: prompt }], 'window.name prompt');
          }
        }

        window.name = '';
      }
    } catch (error) {
      console.warn('Failed to decode embed payload from window.name:', error);
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const embedChatSnapshotParam = params.get('embedChatSnapshot');
      if (embedChatSnapshotParam) {
        try {
          const decodedSnapshot = decodeURIComponent(escape(window.atob(embedChatSnapshotParam)));
          hydrateConversation(decodedSnapshot, 'URL snapshot parameter');
        } catch (error) {
          console.warn('Failed to decode embed chat snapshot parameter:', error);
        }
        params.delete('embedChatSnapshot');
      }
      const embedPromptParam = params.get('embedPrompt');
      if (embedPromptParam) {
        const decodedPrompt = embedPromptParam;
        hydrateConversation([{ content: decodedPrompt }], 'URL parameter');
        params.delete('embedPrompt');
      }

      const updatedSearch = params.toString();
      const newUrl =
        `${window.location.pathname}` +
        (updatedSearch ? `?${updatedSearch}` : '') +
        window.location.hash;
      window.history.replaceState({}, '', newUrl);
    } catch (error) {
      console.warn('Failed to process embed parameters:', error);
    }

    return () => {
      window.removeEventListener('message', handleEmbedChatSnapshot);
      if (broadcastChannel) {
        broadcastChannel.onmessage = null;
        broadcastChannel.close();
        embedChatChannelRef.current = null;
      }
    };
  }, []);
  
  // Clear chat localStorage on mount if NOT coming from embed
  useEffect(() => {
    const transitionedFromEmbed = isEmbedToCanvasTransition();
    let currentCount = 0;
    try {
      const currentMessagesRaw = localStorage.getItem('atelier_current_conversation');
      currentCount = currentMessagesRaw ? (() => {
        try {
          const parsed = JSON.parse(currentMessagesRaw);
          return Array.isArray(parsed) ? parsed.length : 0;
        } catch {
          return 0;
        }
      })() : 0;
    } catch (error) {
      console.warn('Failed to inspect chat messages on mount:', error);
    }

    if (currentCount === 0) {
      try {
        if (typeof window !== 'undefined' && window.opener && window.opener !== window) {
          let openerConversation: string | null = null;
          try {
            openerConversation = window.opener.localStorage?.getItem('atelier_current_conversation') ?? null;
          } catch (error) {
            console.warn('Failed to read opener localStorage:', error);
          }

          if (openerConversation) {
            localStorage.setItem('atelier_current_conversation', openerConversation);
            currentCount = (() => {
              try {
                const parsed = JSON.parse(openerConversation);
                return Array.isArray(parsed) ? parsed.length : 0;
              } catch {
                return 0;
              }
            })();
          }
        }
      } catch (error) {
        console.warn('Failed to read chat from opener window:', error);
      }

      try {
        const fallbackChat =
          sessionStorage.getItem(EMBED_PENDING_CHAT_KEY) ||
          localStorage.getItem(EMBED_PENDING_CHAT_KEY);
        if (fallbackChat) {
          localStorage.setItem('atelier_current_conversation', fallbackChat);
          currentCount = (() => {
            try {
              const parsed = JSON.parse(fallbackChat);
              return Array.isArray(parsed) ? parsed.length : 0;
            } catch {
              return 0;
            }
          })();
          sessionStorage.removeItem(EMBED_PENDING_CHAT_KEY);
          localStorage.removeItem(EMBED_PENDING_CHAT_KEY);
        }
      } catch (error) {
        console.warn('Failed to restore embed chat snapshot:', error);
      }
    }

    if (!transitionedFromEmbed && currentCount === 0) {
      // User is visiting directly, not from embed, and no conversation exists - clear stale chat
      try {
        localStorage.removeItem('atelier_current_conversation');
      } catch (error) {
        console.warn('Failed to clear chat on mount:', error);
      }
    } else {
    }
  }, []); // Run once on mount
  
  // Use extracted canvas state hook
  // Use extracted canvas state hook
  const canvasState = useCanvasState();
  const {
    showDev, setShowDev,
    sidebarCollapsed, setSidebarCollapsed,
    savedArchitectures, setSavedArchitectures,
    selectedArchitectureId, setSelectedArchitectureId,
    pendingArchitectureSelection, setPendingArchitectureSelection,
    agentLockedArchitectureId, setAgentLockedArchitectureId,
    user, setUser,
    isLoadingArchitectures, setIsLoadingArchitectures,
    urlArchitectureProcessed, setUrlArchitectureProcessed,
    justCreatedArchId, setJustCreatedArchId,
    hasInitialSync, setHasInitialSync,
    isSaving, setIsSaving,
    saveSuccess, setSaveSuccess,
    realtimeSyncId, setRealtimeSyncId,
    isRealtimeSyncing, setIsRealtimeSyncing,
    isSyncing, setIsSyncing,
    currentChatName, setCurrentChatName,
    agentBusy, setAgentBusy,
    shareOverlay, setShareOverlay,
    copyButtonState, setCopyButtonState,
    inputOverlay, setInputOverlay,
    deleteOverlay, setDeleteOverlay,
    notification, setNotification,
    architectureOperations, setArchitectureOperations,
    selectedTool, setSelectedTool,
    selectedNodes, setSelectedNodes,
    selectedEdges, setSelectedEdges,
    selectedNodeIds, setSelectedNodeIds,
    useReactFlow, setUseReactFlow,
    svgContent, setSvgContent,
    svgZoom, setSvgZoom,
    svgPan, setSvgPan,
    showElkDebug, setShowElkDebug,
    connectingFrom, setConnectingFrom,
    connectingFromHandle, setConnectingFromHandle,
    connectionMousePos, setConnectionMousePos,
    syncTimeoutRef,
    isHydratingRef,
    expectedHydratedNodeCountRef,
    hydratedArchitectureIdRef,
    dirtySinceRef,
    remoteSaveTimeoutRef,
    restoredFromSnapshotRef,
    skipPersistenceRef,
    pendingSelectionRef
  } = canvasState;

  // Initialize modal manager
  const modalManager = useMemo(() => new CanvasModalManager({
    setNotification,
    setShareOverlay,
    setInputOverlay,
    setDeleteOverlay
  }), [setNotification, setShareOverlay, setInputOverlay, setDeleteOverlay]);

  // Helper functions from modal manager
  const showNotification = modalManager.showNotification;
  const hideNotification = modalManager.hideNotification;

  // Architecture service will be initialized after useElkToReactflowGraphConverter hook
  
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
      
      // Reset viewport to center (access ref when called, not when defined)
      setTimeout(() => {
        const rfInstance = (window as any).__reactFlowInstance || reactFlowRef?.current;
        if (rfInstance) {
          rfInstance.setCenter(0, 0, { zoom: 1 });
          console.log('📍 Viewport reset to center');
        }
      }, 100);
      
      // Clear local storage snapshot
      try {
        localStorage.removeItem(LOCAL_CANVAS_SNAPSHOT_KEY);
        sessionStorage.removeItem(LOCAL_CANVAS_SNAPSHOT_KEY);
        console.log('🗑️ Cleared local storage snapshot');
      } catch (e) {
        console.warn('Failed to clear local storage:', e);
      }
      
      console.log('✅ Canvas cleared - empty root loaded');
      console.log('💡 Run resetCanvas() again if viewport needs reset');
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
  
  // Auth flow state now managed by useCanvasState hook

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
  // Sync state now managed by useCanvasState hook

  // Sync Firebase architectures ONLY when user changes (not when tabs change)
  useEffect(() => {
    if (!user?.uid) return;
    if (justCreatedArchId) {
        // Clear any existing timeout
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }
        
        // Only sync once when user signs in
        // Initial sync for user
        syncWithFirebase(user.uid);
        setHasInitialSync(true);
    }
    
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [user, justCreatedArchId, syncWithFirebase]);

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

  
  
  // UI state now managed by useCanvasState hook
  
  // Notification functions now provided by modal manager
  
  // Tool selection state now managed by useCanvasState hook
  
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
  
  const svgContainerRef = useRef<HTMLDivElement>(null);
  
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
  
  // Initialize canvas graph state and services
  const canvasGraphState = useCanvasInitialization({
    selectedTool,
    user,
    savedArchitectures,
    setSavedArchitectures,
    selectedArchitectureId,
    setSelectedArchitectureId,
    setCurrentChatName,
    showNotification,
    hideNotification,
    setDeleteOverlay,
    setInputOverlay,
    setShareOverlay,
    isPublicMode
  });
  
  // Extract state and handlers from the initialization hook
  const {
    rawGraph,
    nodes,
    edges,
    layoutVersion,
    setRawGraph,
    setNodes,
    setEdges,
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
    getViewStateSnapshot,
    architectureService,
    saveService,
    handleDeleteArchitecture,
    handleShareArchitecture,
    handleEditArchitecture,
    skipPersistenceRef: graphSkipPersistenceRef,
  } = canvasGraphState;

  // Create a ref for rawGraph since Orchestrator expects refs
  const rawGraphRef = useRef(rawGraph);
  
  // Keep rawGraphRef in sync
  useEffect(() => {
    rawGraphRef.current = rawGraph;
  }, [rawGraph]);

  // Initialize Orchestrator (moved from ELK hook for proper separation of concerns)
  useEffect(() => {
    const triggerRender = () => {
      // This is only needed for AI/LOCK mode ELK triggers - not used for FREE mode
    };
    
    const setGraph = (graph: RawGraph) => {
      setRawGraph(graph, 'user');
    };
    
    initializeOrchestrator(
      rawGraphRef,
      viewStateRef,
      triggerRender,
      setGraph,
      setNodes,
      setEdges
    );
    
    console.log('[🔄 CANVAS] Orchestrator initialized from InteractiveCanvas');
  }, [setRawGraph, setNodes, setEdges]); // Stable dependencies

  // Ref to store ReactFlow instance for auto-zoom functionality
  const reactFlowRef = useRef<any>(null);
  const embedChatChannelRef = useRef<BroadcastChannel | null>(null);
  
  // Track recently created nodes/groups to skip containment detection
  const recentlyCreatedNodesRef = useRef<Map<string, number>>(new Map());
  
  // Utility to validate and clean nodes before setting them
  const validateNodes = useCallback((nodes: Node[]): Node[] => {
    const nodeIdsSet = new Set(nodes.map(n => n.id));
    const cleanedNodes = nodes.map(node => {
      const parentId = (node as any).parentId;
      if (parentId && !nodeIdsSet.has(parentId)) {
        console.warn(`[VALIDATE] Removing invalid parentId '${parentId}' from node '${node.id}' - parent does not exist`);
        const cleaned = { ...node };
        delete (cleaned as any).parentId;
        // Convert to absolute position if it was relative
        if ((cleaned.data as any)?.position) {
          cleaned.position = (cleaned.data as any).position;
        }
        return cleaned;
      }
      return node;
    });
    return cleanedNodes;
  }, []);
  
  // State for tracking pending group add mode (when Plus button is clicked)
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  
  // Canvas tool selection handler (defined after setNodes is available)
  const handleToolSelect = useCallback((tool: typeof selectedTool) => {
    // Cancel pending group add mode when switching tools
    if (pendingGroupId) {
      setPendingGroupId(null);
    }
    
    // CRITICAL: Use ReactFlow's API directly to deselect nodes IMMEDIATELY
    // This must happen BEFORE setting the tool state to prevent ReactFlow from re-selecting
    if (tool === 'connector' || tool === 'box') {
      if (reactFlowRef.current) {
        reactFlowRef.current.getNodes();
        reactFlowRef.current.setNodes((nds) => nds.map(node => ({ ...node, selected: false })));
      }
      // Don't duplicate - ReactFlow ref call above handles deselection and maintains sync
    }
 
    if (tool !== 'arrow' && tool !== 'hand') {
      // Clear selection manually so ReactFlow doesn't try to keep previous selection
      setSelectedNodes([]);
      setSelectedEdges([]);
    }

    setSelectedTool(tool);
  }, [selectedTool, reactFlowRef, setNodes, selectedNodes, setSelectedNodes, setSelectedEdges, pendingGroupId]);

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
          }
          }
        }
      });
      return () => unsubscribe();
    }
  }, [isPublicMode, viewModeConfig.mode]);

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
        const chatMessages = normalizeChatMessages(getCurrentConversation()) ?? [];
        const viewStateSnapshot = getViewStateSnapshot();
        const rawGraphWithViewState = viewStateSnapshot ? { ...rawGraph, viewState: viewStateSnapshot } : rawGraph;
        const docId = await ArchitectureService.saveArchitecture({
          name: newChatName,
          userId: user.uid,
          userEmail: user.email || '',
          rawGraph: rawGraphWithViewState,
          nodes: [], // React Flow nodes will be generated
          edges: [], // React Flow edges will be generated
          userPrompt: userPrompt || 'Manually saved architecture',
          timestamp: now,
          createdAt: now,
          lastModified: now,
          chatMessages,
          viewState: viewStateSnapshot
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
          rawGraph: rawGraphWithViewState,
          userPrompt: userPrompt || 'Manually saved architecture',
          isFromFirebase: true,
          chatMessages,
          viewState: viewStateSnapshot
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
      const chatMessages = normalizeChatMessages(getCurrentConversation()) ?? [];
      const viewStateSnapshot = getViewStateSnapshot();
      const rawGraphWithViewState = viewStateSnapshot ? { ...rawGraph, viewState: viewStateSnapshot } : rawGraph;
      await ArchitectureService.updateArchitecture(firebaseId, {
        rawGraph: rawGraphWithViewState,
        nodes: nodes,
        edges: edges,
        chatMessages,
        viewState: viewStateSnapshot,
      });

      console.log('✅ Architecture manually saved to Firebase');
      setSavedArchitectures(prev => prev.map(arch =>
        arch.id === selectedArchitectureId
          ? { ...arch, chatMessages, rawGraph: rawGraphWithViewState, viewState: viewStateSnapshot }
          : arch
      ));
    } catch (error) {
      console.error('❌ Error manually saving architecture:', error);
      showNotification('error', 'Save Failed', `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
      if (remoteSaveTimeoutRef.current) {
        clearTimeout(remoteSaveTimeoutRef.current);
        remoteSaveTimeoutRef.current = null;
    }
      dirtySinceRef.current = null;
    }
  }, [user, selectedArchitectureId, savedArchitectures, rawGraph, nodes, edges, getViewStateSnapshot]);

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
          const viewStateSnapshot = getViewStateSnapshot();
          const rawGraphWithViewState = viewStateSnapshot ? { ...rawGraph, viewState: viewStateSnapshot } : rawGraph;
          const anonymousId = await ensureAnonymousSaved({
            rawGraph: rawGraphWithViewState,
            userPrompt: effectivePrompt,
            anonymousService: anonymousArchitectureService,
            metadata: viewStateSnapshot ? { viewState: viewStateSnapshot } : undefined
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
            rawGraph: architecture.viewState ? { ...architecture.rawGraph, viewState: architecture.viewState } : architecture.rawGraph,
            anonymousService: anonymousArchitectureService,
            viewState: architecture.viewState || (viewStateRef.current ? JSON.parse(JSON.stringify(viewStateRef.current)) : undefined),
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
  }, [selectedArchitectureId, handleShareArchitecture, user, rawGraph, anonymousArchitectureService, getViewStateSnapshot]);

  // Initialize with empty canvas for "New Architecture" tab
  // Only reset when switching TO "new-architecture", not when already on it
  const previousArchitectureIdRef = useRef<string>(selectedArchitectureId);
  useEffect(() => {
    const wasNewArch = previousArchitectureIdRef.current === 'new-architecture';
    const isNewArch = selectedArchitectureId === 'new-architecture';
    
    // Only reset if switching TO new-architecture from another architecture
    // Don't reset if already on new-architecture (would clear user's work!)
    if (isNewArch && !wasNewArch) {
      console.log('🔄 [useEffect] Switching to new-architecture, resetting graph');
      const emptyGraph = {
        id: "root",
        children: [],
        edges: []
      };
      setRawGraph(emptyGraph);
    }
    
    previousArchitectureIdRef.current = selectedArchitectureId;
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
      const chatMessages = normalizeChatMessages(getCurrentConversation()) ?? [];
      const viewStateSnapshot = getViewStateSnapshot();
      const rawGraphWithViewState = viewStateSnapshot ? { ...rawGraph, viewState: viewStateSnapshot } : rawGraph;
      const architectureData = {
        name: architectureName, // No fallback - must be AI-generated
        description: `Architecture with ${nodes.length} components and ${edges.length} connections`,
        rawGraph: rawGraphWithViewState || {},
        nodes: nodes || [],
        edges: edges || [],
        userId: user.uid,
        userEmail: user.email,
        isPublic: false, // Private by default
        tags: [], // Could be enhanced to auto-generate tags based on content
        chatMessages,
        viewState: viewStateSnapshot
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
  }, [rawGraph, nodes, edges, getViewStateSnapshot]);

  // Sidebar handlers now provided by service
  const handleNewArchitecture = architectureService.handleNewArchitecture;

  // URL Architecture management
  const loadArchitectureFromUrl = useCallback((architecture: any, source: string) => {
    
    if (architecture.rawGraph) {
      // SIMPLE RULE: Always use localStorage if it exists for the same architecture ID
      // Only load from URL if localStorage doesn't have this architecture
      try {
        const stored = localStorage.getItem(LOCAL_CANVAS_SNAPSHOT_KEY) || sessionStorage.getItem(LOCAL_CANVAS_SNAPSHOT_KEY);
        
        if (stored) {
          const parsed = JSON.parse(stored);
          const isSameArchitecture = parsed?.selectedArchitectureId === architecture.id;
          const hasContent = 
            (parsed?.rawGraph?.children && parsed.rawGraph.children.length > 0) ||
            (parsed?.rawGraph?.edges && parsed.rawGraph.edges.length > 0);
          
          // If localStorage has the same architecture, ALWAYS use it (user's current state)
          if (isSameArchitecture && hasContent) {
            const storedAge = Date.now() - (parsed?.timestamp || 0);
            // Still create the tab and select it, but don't overwrite the graph
            const urlArch = {
              id: architecture.id,
              name: architecture.name,
              timestamp: architecture.timestamp || new Date(),
              rawGraph: architecture.rawGraph,
              userPrompt: architecture.userPrompt || '',
              firebaseId: architecture.firebaseId || architecture.id,
              isFromFirebase: true,
              viewState: architecture.viewState,
              isFromUrl: true
            };
            setSavedArchitectures(prev => {
              const exists = prev.some(arch => arch.id === architecture.id);
              if (!exists) {
                return [urlArch, ...prev];
              }
              return prev;
            });
            setSelectedArchitectureId(architecture.id);
            return; // Exit early, don't overwrite the restored graph
          } else {
          }
        } else {
        }
      } catch (e) {
        console.error('❌ [URL-ARCH] Error checking localStorage:', e);
      }

      let viewStateSnapshot = undefined;
      if (architecture.viewState) {
        try {
          viewStateSnapshot = JSON.parse(JSON.stringify(architecture.viewState));
        } catch (error) {
          console.warn('⚠️ [URL-ARCH] Failed to clone viewState snapshot:', error);
          viewStateSnapshot = architecture.viewState;
        }
        viewStateRef.current = viewStateSnapshot ?? { node: {}, group: {}, edge: {} };
      } else {
        viewStateRef.current = viewStateRef.current || { node: {}, group: {}, edge: {} };
      }

      const graphWithViewState = viewStateSnapshot
        ? { ...architecture.rawGraph, viewState: viewStateSnapshot }
        : architecture.rawGraph;

      // Set the content
      logPageLoad('URL', architecture.rawGraph, architecture.id);
      setRawGraph(graphWithViewState);
      setCurrentChatName(architecture.name);
      
      // Create architecture object for tab (ensure it has proper structure)
      const urlArch = {
        id: architecture.id,
        name: architecture.name,
        timestamp: architecture.timestamp || new Date(),
        rawGraph: graphWithViewState,
        userPrompt: architecture.userPrompt || '',
        firebaseId: architecture.firebaseId || architecture.id,
        isFromFirebase: true,
        viewState: viewStateSnapshot,
        isFromUrl: true
      };
      
      // Add to saved architectures (create new tab)
      setSavedArchitectures(prev => {
        const exists = prev.some(arch => arch.id === architecture.id);
        if (!exists) {
          return [urlArch, ...prev];
        }
        return prev;
      });
      
      // Select this architecture
      setSelectedArchitectureId(architecture.id);
      setPendingArchitectureSelection(null);
      
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
      const viewStateSnapshot = getViewStateSnapshot();
      const rawGraphWithViewState = viewStateSnapshot ? { ...rawGraph, viewState: viewStateSnapshot } : rawGraph;
      setSavedArchitectures(prev => prev.map(arch => 
        arch.id === selectedArchitectureId 
          ? { ...arch, rawGraph: rawGraphWithViewState, viewState: viewStateSnapshot, timestamp: new Date() }
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
      logPageLoad('Firebase', architecture.rawGraph, architecture.id);
      
      // Update the current chat name to match the selected architecture
      setCurrentChatName(architecture.name);
      console.log('🏷️ Updated chat name to:', architecture.name);
      console.log('🏷️ Selected architecture details:', { id: architecture.id, name: architecture.name, hasRawGraph: !!architecture.rawGraph });

      if (architecture.chatMessages && architecture.chatMessages.length > 0) {
        try {
          const mergedConversation = mergeChatMessages(
            getCurrentConversation(),
            normalizeChatMessages(architecture.chatMessages)
          );
          if (mergedConversation && mergedConversation.length > 0) {
            const serialized = JSON.stringify(mergedConversation);
            localStorage.setItem('atelier_current_conversation', serialized);
            (window as any).__atelierLastConversation = serialized;
            console.log('💬 [ARCH-SELECT] Hydrated chat from architecture:', mergedConversation.length);
          }
        } catch (error) {
          console.warn('⚠️ [ARCH-SELECT] Failed to hydrate chat for architecture:', error);
        }
      }
      
      // Use typed event system for architecture loading
      const viewStateSnapshot = sanitizeStoredViewState(architecture.viewState);
      viewStateRef.current = viewStateSnapshot ?? { node: {}, group: {}, edge: {}, layout: {} };

      const rawGraphWithViewState = viewStateSnapshot
        ? { ...architecture.rawGraph, viewState: viewStateSnapshot }
        : architecture.rawGraph;

      dispatchElkGraph({
        elkGraph: assertRawGraph(rawGraphWithViewState, 'ArchitectureSelector'),
        source: 'ArchitectureSelector',
        reason: 'architecture-load',
        viewState: viewStateSnapshot,
        targetArchitectureId: architecture.id
      });
    } else {
      console.warn('⚠️ Architecture not found:', architectureId);
      console.warn('⚠️ Available architectures:', savedArchitectures.map(arch => ({ id: arch.id, name: arch.name })));
    }
  }, [savedArchitectures, agentLockedArchitectureId, setCurrentChatName, selectedArchitectureId, rawGraph, getViewStateSnapshot]);

  // Ensure currentChatName stays in sync with selectedArchitectureId
  useEffect(() => {
    if (selectedArchitectureId && selectedArchitectureId !== 'new-architecture') {
      const architecture = savedArchitectures.find(arch => arch.id === selectedArchitectureId);
      if (architecture && architecture.name && currentChatName !== architecture.name) {
        setCurrentChatName(architecture.name);
      }
    } else if (selectedArchitectureId === 'new-architecture' && currentChatName !== 'New Architecture') {
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

  // Save functions now provided by service
  const flushRemoteSave = saveService.flushRemoteSave;
  const requestRemoteSave = saveService.requestRemoteSave;
  const markDirty = saveService.markDirty;

  // Handler for graph changes from DevPanel or manual interactions
  const handleGraphChange = useCallback(async (
    newGraph: RawGraph,
    options: { source?: 'ai' | 'user' } = {}
  ) => {
    const prevChildren = rawGraph?.children?.length || 0;
    const prevEdges = rawGraph?.edges?.length || 0;
    const newChildren = newGraph?.children?.length || 0;
    const newEdges = newGraph?.edges?.length || 0;
    
    
    // Prevent clearing graph with substantial content
    if ((prevChildren > 5 || prevEdges > 5) && (newChildren === 0 && newEdges === 0)) {
      console.error('❌ [handleGraphChange] BLOCKING - would clear graph with content!', {
        prev: { children: prevChildren, edges: prevEdges },
        new: { children: newChildren, edges: newEdges },
        source: options.source
      });
      console.groupEnd();
      return; // Don't clear if we have substantial content
    }
    
    let finalGraph: RawGraph;

    if (options.source === 'ai') {
      const aiGraph = structuredClone(newGraph) as RawGraph & { viewState?: unknown };
      if ('viewState' in aiGraph) {
        delete (aiGraph as any).viewState;
      }
      viewStateRef.current = createEmptyViewState();
      restoreNodeVisuals(aiGraph, rawGraph);
      
      // Wrap AI-generated diagram in a numbered group (Group 1, Group 2, etc.)
      const topLevelNodeIds = (aiGraph.children || []).map((child: any) => child.id);
      
      if (topLevelNodeIds.length > 0) {
        // Find all existing group names to determine smallest available number
        const findExistingGroupNumbers = (graph: RawGraph): Set<number> => {
          const numbers = new Set<number>();
          const traverse = (node: any) => {
            if (node.labels && node.labels[0] && node.labels[0].text) {
              const label = node.labels[0].text;
              const match = label.match(/^Group (\d+)$/);
              if (match) {
                numbers.add(parseInt(match[1], 10));
              }
            }
            if (node.children) {
              node.children.forEach((child: any) => traverse(child));
            }
          };
          traverse(graph);
          return numbers;
        };
        
        const existingNumbers = findExistingGroupNumbers(rawGraph || { id: 'root', children: [], edges: [] });
        
        // Find smallest available number
        let groupNumber = 1;
        while (existingNumbers.has(groupNumber)) {
          groupNumber++;
        }
        
        const groupName = `Group ${groupNumber}`;
        // Use the display name as the groupId - groupNodes will normalize the ID but keep the label
        const groupId = groupName;
        
        // Wrap all top-level nodes in the group
        try {
          finalGraph = groupNodes(topLevelNodeIds, 'root', groupId, aiGraph, undefined);
          // Find the group node by checking labels (since ID might be normalized)
          const groupNode = finalGraph.children?.find((child: any) => 
            child.labels?.[0]?.text === groupName || child.id === createNodeID(groupId)
          );
          if (groupNode) {
            // Ensure label and data.label are set correctly
            groupNode.labels = [{ text: groupName }];
            if (groupNode.data) {
              groupNode.data.label = groupName;
            } else {
              groupNode.data = { label: groupName, isGroup: true };
            }
          }
        } catch (error) {
          console.error('Failed to wrap AI diagram in group:', error);
          finalGraph = aiGraph; // Fallback to original if grouping fails
        }
      } else {
        finalGraph = aiGraph;
      }
            } else {
      const viewStateSnapshot = getViewStateSnapshot();
      finalGraph = viewStateSnapshot ? { ...newGraph, viewState: viewStateSnapshot } : newGraph;
    }
    
    // Update the local state immediately
    setRawGraph(finalGraph, options.source === 'ai' ? 'ai' : undefined);

    // CRITICAL FIX: Immediately persist viewstate to localStorage after any graph change
    // This ensures that when page refreshes, the current state is preserved
    try {
      const currentViewState = getViewStateSnapshot();
      
      if (currentViewState && selectedArchitectureId) {
        saveCanvasSnapshot(finalGraph, currentViewState, selectedArchitectureId);
        
        // Log what was saved
        const savedGroups = extractGroupIdsFromGraph(finalGraph);
      } else {
        console.warn('⚠️ [handleGraphChange] Cannot persist - missing viewstate or architectureId:', {
          hasViewState: !!currentViewState,
          hasArchitectureId: !!selectedArchitectureId
        });
      }
    } catch (error) {
      console.error('❌ [handleGraphChange] Failed to immediately persist viewstate:', error);
    }

    markDirty();
  }, [setRawGraph, rawGraph, getViewStateSnapshot, markDirty, selectedArchitectureId]);

  // Persist graph changes from Orchestrator (user-initiated structural changes)
  // CRITICAL: Pass viewStateRef directly so persistence reads from Orchestrator's ViewState
  // (not ReactFlow nodes, which might not be updated yet)
  useCanvasPersistenceEffect({
    rawGraph,
    selectedArchitectureId,
    getViewStateSnapshot,
    viewStateRef,
    skipPersistenceRef: graphSkipPersistenceRef
  });

  const chatService = useMemo(() => new CanvasChatService({
    selectedArchitectureId,
    setArchitectureOperationState: (id: string, isRunning: boolean) => {
      setArchitectureOperations(prev => ({ ...prev, [id]: isRunning }));
    },
    rawGraph,
    handleGraphChange: (graph: any) => {
      handleGraphChange(graph, { source: 'ai' });
    },
  }), [selectedArchitectureId, setArchitectureOperations, rawGraph, handleGraphChange]);

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
          // CRITICAL: Mark as 'ai' source so ELK runs for AI-generated architectures
        handleGraphChange(currentGraph, { source: 'ai' });
          
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
      
      // CRITICAL: Mark as 'ai' source so ELK runs for AI-generated architectures
      handleGraphChange(currentGraph, { source: 'ai' });
      
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
    console.log('[GroupTool] Plus button clicked - entering add node mode for group:', groupId);
    // Set pendingGroupId to enable hover preview and track which group to add to
    setPendingGroupId(groupId);
  }, []);
  
  useEffect(() => {
    return () => {
      if (remoteSaveTimeoutRef.current) {
        clearTimeout(remoteSaveTimeoutRef.current);
        remoteSaveTimeoutRef.current = null;
      }
    };
  }, []);

  // Note: Using nodes state directly in handleToolSelect instead of ref to avoid stale closures

  // Manual fit view function that can be called anytime
  const manualFitView = useCallback(() => {
    if (reactFlowRef.current && typeof reactFlowRef.current.getViewport === 'function') {
      try {
        const viewport = reactFlowRef.current.getViewport();
        // If viewport is way off (negative Y or extreme values), reset it first
        if (viewport.y < -500 || viewport.y > 5000 || viewport.x < -500 || viewport.x > 5000) {
          console.warn('⚠️ [VIEWPORT] Viewport is way off, resetting before fitView', viewport);
          reactFlowRef.current.setCenter(0, 0, { zoom: 1 });
        }
        
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
      // Check if ReactFlow instance is ready (getViewport might not exist yet)
      if (typeof reactFlowRef.current.getViewport !== 'function') {
        return; // ReactFlow not ready yet
      }
      
      // Debug: Log viewport and node positions
      const viewport = reactFlowRef.current.getViewport();
      const nodePositions = nodes.slice(0, 5).map(n => ({ id: n.id, x: n.position.x, y: n.position.y }));
      const minX = Math.min(...nodes.map(n => n.position.x));
      const minY = Math.min(...nodes.map(n => n.position.y));
      const maxX = Math.max(...nodes.map(n => n.position.x));
      const maxY = Math.max(...nodes.map(n => n.position.y));
      
      
      // Check if we should skip fitView (for user mutations in FREE mode)
      // BUT: Always run fitView if nodes are spread far apart (AI diagrams)
      const nodeSpread = Math.max(maxX - minX, maxY - minY);
      const hasLargeSpread = nodeSpread > 2000; // Nodes spread over 2000px
      const shouldForceFitView = hasLargeSpread || nodes.length > 10; // Force for AI diagrams
      
      if (shouldSkipFitViewRef?.current === true && !shouldForceFitView) {
        shouldSkipFitViewRef.current = false; // Clear flag after checking
        return;
      }
      
      // Clear skip flag if we're forcing fitView
      if (shouldForceFitView) {
        shouldSkipFitViewRef.current = false;
      }
      
      const timeoutId = setTimeout(() => {
        const afterViewport = reactFlowRef.current?.getViewport();
        
        // For large spreads, center on the middle of all nodes first
        if (hasLargeSpread && reactFlowRef.current) {
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          reactFlowRef.current.setCenter(centerX, centerY, { zoom: 0.5 }); // Start zoomed out
        }
        
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
    if (newShowState && rawGraph) {
      const structuralData = getStructuralData(rawGraph);
      copyStructuralDataToClipboard(structuralData);
    }
  }, [showElkDebug, rawGraph, getStructuralData, copyStructuralDataToClipboard]);

  // Handler for graph sync
  const handleGraphSync = useCallback(() => {
    console.log('🔄 Syncing graph state with React Flow...');
    
    // Set loading state
    setIsSyncing(true);
    
    // ReactFlow state will be cleared automatically by layout side-effect when rawGraph changes
    // Don't directly modify ReactFlow - maintain Domain → ViewState → ReactFlow sync
    
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
          
          handleDeleteKey({
            selectedNodes,
            selectedEdges,
            rawGraph,
            selectedArchitectureId,
            logDeletionAndSave,
          });
          
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
  }, [selectedNodes, selectedEdges, rawGraph, selectedArchitectureId, logDeletionAndSave, setSelectedNodes, setSelectedEdges]);
  
  // Edge creation handled by useCanvasState
  const {
    handleConnectStart,
    handleConnectEnd,
    handleConnectorDotClick,
    edgePreview,
  } = useCanvasEdgeInteractions({
    selectedTool,
    setSelectedTool,
    selectedNodes,
    setSelectedNodes,
    connectingFrom,
    connectingFromHandle,
    setConnectingFrom,
    setConnectingFromHandle,
    connectionMousePos,
    setConnectionMousePos,
    reactFlowRef,
    onConnect,
    nodes,
  });

  
  // ELK SVG view - always visible
  const [elkSvgContent, setElkSvgContent] = useState<string>('');
  const [isGeneratingSvg, setIsGeneratingSvg] = useState(false);
  
  // Generate SVG from domain graph - auto-update when graph changes
  const generateElkSvg = useCallback(async () => {
    if (!rawGraph) {
      setElkSvgContent('');
      return;
    }
    
    setIsGeneratingSvg(true);
    try {
      // Create a deep copy of the graph
      const graphCopy = JSON.parse(JSON.stringify(rawGraph));
      
      // Apply defaults and ensure IDs
      const graphWithOptions = ensureIds(graphCopy);
      
      // Inject ViewState dimensions into graph before ELK layout
      // This ensures debug viewer shows actual sizes, not defaults
      const viewState = viewStateRef.current;
      if (viewState) {
        function injectViewStateDimensions(node: any): void {
          const id = node.id;
          const isGroup = !!(node.children && node.children.length > 0);
          
          // Get dimensions from ViewState
          if (isGroup) {
            const groupGeom = viewState.group?.[id];
            if (groupGeom?.w && groupGeom?.h) {
              node.width = groupGeom.w;
              node.height = groupGeom.h;
            }
          } else {
            const nodeGeom = viewState.node?.[id];
            if (nodeGeom?.w && nodeGeom?.h) {
              node.width = nodeGeom.w;
              node.height = nodeGeom.h;
            }
          }
          
          // Recursively process children
          if (node.children) {
            node.children.forEach((child: any) => injectViewStateDimensions(child));
          }
        }
        
        injectViewStateDimensions(graphWithOptions);
      }
      
      // Run ELK layout
      const elk = new ELK();
      const layoutedGraph = await elk.layout(graphWithOptions);
      
      // Generate SVG
      const svgContent = generateSVG(layoutedGraph);
      setElkSvgContent(svgContent);
    } catch (error) {
      console.error('Error generating ELK SVG:', error);
      setElkSvgContent('<text x="20" y="20" fill="red">Error generating SVG</text>');
    } finally {
      setIsGeneratingSvg(false);
    }
  }, [rawGraph, viewStateRef]);
  
  // Auto-generate SVG when graph changes
  useEffect(() => {
    generateElkSvg();
  }, [generateElkSvg]);

  const handleCreateWrapperAndArrange = useCallback(async (selectionIds: string[]) => {
    if (!rawGraph || !viewStateRef.current) {
      console.warn('🟦 [WRAPPER] Missing rawGraph or viewState');
      return;
    }
    
    try {
      console.log('🟦 [WRAPPER] Creating wrapper section for selection:', selectionIds);
      
      // Create wrapper section (domain mutation)
      const { graph: updatedGraph, wrapperId } = createWrapperSection(selectionIds, rawGraph);
      setRawGraph(updatedGraph, 'user');
      
      console.log('🟦 [WRAPPER] Created wrapper:', wrapperId);
      
      // Run scoped ELK layout with LOCK gesture routing (single explicit ELK run)
      const elkScope = resolveElkScope(wrapperId, updatedGraph);
      
      if (!elkScope) {
        console.warn('🟦 [WRAPPER] No ELK scope resolved, skipping layout');
        return;
      }
      
      console.log('🟦 [WRAPPER] Running ELK on scope:', { originalWrapper: wrapperId, resolvedScope: elkScope });
      
      const delta = await runScopeLayout(
        elkScope, 
        updatedGraph, 
        viewStateRef.current || createEmptyViewState(), 
        {}
      );
      
      // Merge delta into ViewState
      const beforeViewState = viewStateRef.current || createEmptyViewState();
      console.log('🟦 [ARRANGE] ViewState before merge:', {
        nodeCount: Object.keys(beforeViewState.node || {}).length,
        groupCount: Object.keys(beforeViewState.group || {}).length,
        beforeNodes: beforeViewState.node
      });
      
      const updatedViewState = mergeViewState(beforeViewState, delta);
      viewStateRef.current = updatedViewState;
      
      console.log('🟦 [ARRANGE] ViewState after merge:', {
        nodeCount: Object.keys(updatedViewState.node || {}).length,
        groupCount: Object.keys(updatedViewState.group || {}).length,
        afterNodes: updatedViewState.node
      });
      
      console.log('🟦 [WRAPPER] Layout complete, updating ReactFlow nodes');
      
      // Don't directly update ReactFlow - let Domain → ViewState → layout side-effect handle it
      // The setRawGraph() call below will trigger proper synchronization
      
      console.log('🟦 [WRAPPER] Wrapper creation and arrangement complete');
      
    } catch (error) {
      console.error('🟦 [WRAPPER] Failed to create wrapper section:', error);
    }
  }, [rawGraph, viewStateRef, setRawGraph, setNodes]);

  // Helper to find a group/node in the graph by ID
  const findNodeInGraph = useCallback((graph: any, targetId: string): any => {
    if (graph.id === targetId) return graph;
    if (graph.children) {
      for (const child of graph.children) {
        const found = findNodeInGraph(child, targetId);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const handleArrangeGroup = useCallback(async (groupId: string) => {
    // Arrange the insides of the group using ELK, relative to group position
    if (!rawGraph || !viewStateRef.current) {
      console.warn('🟦 [ARRANGE] Missing rawGraph or viewState');
      return;
    }
    
    try {
      
      // Check if group exists in graph
      const groupNode = findNodeInGraph(rawGraph, groupId);
      if (!groupNode) {
        console.error('🟦 [ARRANGE] Group not found in graph:', groupId);
        return;
      }
      
      const currentMode = groupNode.mode || 'FREE';
      
      // Toggle mode: FREE -> LOCK, LOCK -> FREE
      const newMode = currentMode === 'FREE' ? 'LOCK' : 'FREE';
      
      if (!groupNode.children || groupNode.children.length === 0) {
        console.warn('🟦 [ARRANGE] Group has no children to arrange');
        // Still update the graph to persist the mode change - use deep copy
        const updatedGraph = JSON.parse(JSON.stringify(rawGraph));
        const updatedGroupNode = findGroup(updatedGraph);
        if (updatedGroupNode) {
          updatedGroupNode.mode = newMode;
        }
        
        setRawGraph(updatedGraph, 'user');
        return;
      }
      
      // Only run ELK if setting to LOCK (arranging)
      if (newMode !== 'LOCK') {
        // Persist mode change with deep copy
        const updatedGraph = JSON.parse(JSON.stringify(rawGraph));
        const updatedGroupNode = findGroup(updatedGraph);
        if (updatedGroupNode) {
          updatedGroupNode.mode = newMode;
        }
        
        setRawGraph(updatedGraph, 'user');
        return;
      }
      
      // Run ELK layout on resolved scope (LOCK gesture routing)
      const elkScope = resolveElkScope(groupId, rawGraph);
      
      if (!elkScope) {
        console.warn('🟦 [ARRANGE] No ELK scope resolved, skipping layout');
        return;
      }
      
      console.log('[🎯COORD] handleArrangeGroup - starting ELK layout:', { 
        originalGroup: groupId, 
        resolvedScope: elkScope,
        groupAbsolutePos: viewStateRef.current.group?.[groupId] 
          ? `${viewStateRef.current.group[groupId].x},${viewStateRef.current.group[groupId].y}`
          : 'none',
      });
      
      // Use original rawGraph for ELK (before mode change)
      const delta = await runScopeLayout(elkScope, rawGraph, viewStateRef.current, {});
      
      console.log('[🎯COORD] handleArrangeGroup - ELK delta received (absolute positions):', {
        nodeCount: Object.keys(delta.node || {}).length,
        groupCount: Object.keys(delta.group || {}).length,
        nodePositions: Object.entries(delta.node || {}).slice(0, 3).map(([id, geom]: [string, any]) => ({
          id,
          absolute: `${geom.x},${geom.y}`,
        })),
      });
      
      if (Object.keys(delta.node || {}).length === 0 && Object.keys(delta.group || {}).length === 0) {
        console.warn('🟦 [ARRANGE] Empty delta - no positions calculated');
        return;
      }
      
      // Merge delta into ViewState
      const updatedViewState = mergeViewState(viewStateRef.current, delta);
      viewStateRef.current = updatedViewState;
      
      console.log('🟦 [ARRANGE] ViewState updated, updating ReactFlow nodes');
      console.log('🟦 [ARRANGE] Delta received:', {
        nodeCount: Object.keys(delta.node || {}).length,
        groupCount: Object.keys(delta.group || {}).length,
        deltaNodes: delta.node,
        deltaGroups: delta.group
      });
      console.log('🟦 [ARRANGE] Updated ViewState:', {
        nodeCount: Object.keys(updatedViewState.node || {}).length,
        groupCount: Object.keys(updatedViewState.group || {}).length,
        viewStateNodes: updatedViewState.node,
        viewStateGroups: updatedViewState.group
      });
      
      // Don't directly update ReactFlow - maintain Domain → ViewState → ReactFlow sync
      // The setRawGraph() call below will trigger proper update via layout side-effect
      
      // ReactFlow positions are updated via ViewState → layout side-effect
      // No need to force refresh - the setRawGraph() call below will trigger proper update
      
      // CRITICAL: Create a deep copy of rawGraph BEFORE setting mode
      // This ensures we have a clean copy that we can mutate without affecting the original
      const updatedGraph = JSON.parse(JSON.stringify(rawGraph));
      updatedGraph.viewState = updatedViewState;
      
      // Phase 3: Write to ViewState only (no more Domain writes)
      
      // Write to ViewState.layout (primary location)
      if (!updatedViewState.layout) {
        updatedViewState.layout = {};
      }
      updatedViewState.layout[groupId] = { mode: newMode };
      
      // Update the graph with the ViewState that now includes layout
      updatedGraph.viewState = updatedViewState;
      
      setRawGraph(updatedGraph, 'user');
      
      
      console.log('🟦 [ARRANGE] Group arranged successfully, mode:', newMode);
    } catch (error) {
      console.error('🟦 [ARRANGE] Failed to arrange group:', error);
    }
  }, [rawGraph, setRawGraph, setNodes]);


  // Create node types with handlers - memoized to prevent recreation
  // Use useCallback for each node type component to prevent ReactFlow warnings
  const memoizedNodeTypes = useMemo(
    () => ({
      custom: CustomNodeComponent,
      group: DraftGroupNode,
    }),
    []
  );
  
  const memoizedEdgeTypes = useMemo(() => edgeTypes, []);

  const nodeInteractionValue = useMemo(
    () => ({
      selectedTool,
      connectingFrom,
      connectingFromHandle,
      handleConnectorDotClick,
      handleLabelChange,
      handleAddNodeToGroup,
      handleArrangeGroup,
      handleCreateWrapperAndArrange,
      selectedNodeIds: selectedNodeIds || [],
    }),
    [
      selectedTool,
      connectingFrom,
      connectingFromHandle,
      handleConnectorDotClick,
      handleLabelChange,
      handleAddNodeToGroup,
      handleArrangeGroup,
      handleCreateWrapperAndArrange,
      selectedNodeIds,
    ]
  );

  useEffect(() => {
    const viewStateNodes = rawGraph?.viewState?.node;
    const nodeCount = viewStateNodes ? Object.keys(viewStateNodes).length : 0;
    const graphChildrenCount = rawGraph?.children?.length || 0;
    
    // Debug: Log node visibility issue
    if (graphChildrenCount > 0 && nodes.length === 0) {
      // Graph has nodes but ReactFlow nodes are empty
    }
    
    if (
      nodeCount > 0 &&
      nodes.length === 0 &&
      selectedArchitectureId &&
      selectedArchitectureId !== hydratedArchitectureIdRef.current
    ) {
      isHydratingRef.current = true;
      expectedHydratedNodeCountRef.current = nodeCount;
      if (process.env.NODE_ENV !== 'production') {
        console.info('[HYDRATION] Detected incoming viewState, waiting for stabilization', {
          expectedNodes: nodeCount,
          architectureId: selectedArchitectureId,
          graphChildren: graphChildrenCount,
          reactFlowNodes: nodes.length
        });
      }
      
      // CRITICAL: Add fallback timeout to prevent hydration from blocking saves forever
      setTimeout(() => {
        if (isHydratingRef.current) {
          isHydratingRef.current = false;
        }
      }, 1000);
    }
  }, [rawGraph, nodes.length, selectedArchitectureId, nodes]);

  useEffect(() => {
    // Check for nodes at (0,0) - indicates ELK didn't run
    if (nodes.length > 0) {
      const zeroPosNodes = nodes.filter(n => n.position.x === 0 && n.position.y === 0);
      if (zeroPosNodes.length === nodes.length && nodes.length > 3) {
        // All nodes at (0,0) - ELK may not have run
      }
    }
    
    if (!isHydratingRef.current) return;
    const expected = expectedHydratedNodeCountRef.current;
    if (!expected) {
      isHydratingRef.current = false;
      hydratedArchitectureIdRef.current = selectedArchitectureId || null;
      return;
    }
    if (nodes.length < expected) {
      return;
    }

    const viewStateNodes = rawGraph?.viewState?.node || {};
    const stabilized = nodes.every((node) => {
      const expectedView = viewStateNodes[node.id];
      if (!expectedView) return true;
      const roundedX = Math.round(node.position.x);
      const roundedY = Math.round(node.position.y);
      const expectedX = Math.round(expectedView.x);
      const expectedY = Math.round(expectedView.y);
      return roundedX === expectedX && roundedY === expectedY;
    });

    if (stabilized) {
      isHydratingRef.current = false;
      hydratedArchitectureIdRef.current = selectedArchitectureId || null;
      if (process.env.NODE_ENV !== 'production') {
        console.info('[HYDRATION] Nodes stabilized with viewState positions', {
          nodes: nodes.map((node) => ({
            id: node.id,
            position: node.position,
          })),
        });
      }
    }
  }, [nodes, rawGraph, selectedArchitectureId]);

const geometriesDiffer = (prevState: Record<string, { x: number; y: number; w: number; h: number }> = {}, nextState: Record<string, { x: number; y: number; w: number; h: number }> = {}) => {
  const prevKeys = Object.keys(prevState);
  const nextKeys = Object.keys(nextState);
  if (prevKeys.length !== nextKeys.length) {
    return true;
  }
  for (const key of nextKeys) {
    const prevGeom = prevState[key];
    const nextGeom = nextState[key];
    if (!prevGeom || !nextGeom) {
      return true;
    }
    if (
      prevGeom.x !== nextGeom.x ||
      prevGeom.y !== nextGeom.y ||
      prevGeom.w !== nextGeom.w ||
      prevGeom.h !== nextGeom.h
    ) {
      return true;
    }
  }
  return false;
};

const extractDimension = (value: number | string | undefined, fallback: number) => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

// Canvas restoration logic moved to useCanvasInitialization hook

// Canvas restoration logic moved to useCanvasInitialization hook

useEffect(() => {
  if (isHydratingRef.current) return;
  if (typeof window === "undefined") return;
  if (!rawGraph) return;

  const hasContent =
    (rawGraph.children && rawGraph.children.length > 0) ||
    nodes.length > 0 ||
    edges.length > 0;

  if (!hasContent) {
    return;
  }

  try {
    const viewStateSnapshot = getViewStateSnapshot();
    
    // CRITICAL: Use deep copy to preserve nested modes (shallow copy loses nested mutations)
    const rawGraphCopy = JSON.parse(JSON.stringify(rawGraph));
    
    const payload = {
      rawGraph: viewStateSnapshot ? { ...rawGraphCopy, viewState: viewStateSnapshot } : rawGraphCopy,
      viewState: viewStateSnapshot,
      selectedArchitectureId,
      timestamp: Date.now(), // Use 'timestamp' to match saveCanvasSnapshot format
    };
    
    
    const serialized = JSON.stringify(payload);
    localStorage.setItem(LOCAL_CANVAS_SNAPSHOT_KEY, serialized);
    sessionStorage.setItem(LOCAL_CANVAS_SNAPSHOT_KEY, serialized);
    markDirty();
  } catch (error) {
    console.warn("⚠️ Failed to persist local canvas snapshot:", error);
  }
}, [rawGraph, nodes, edges, getViewStateSnapshot, selectedArchitectureId, markDirty]);

  
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
    const unsubscribe = onElkGraph(async ({ elkGraph, source, reason, version, ts, targetArchitectureId, viewState }) => {
      
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
        const externalViewStateRaw = viewState ? (typeof viewState === 'object' ? JSON.parse(JSON.stringify(viewState)) : viewState) : undefined;
        const externalViewState = sanitizeStoredViewState(externalViewStateRaw);
        const graphForCanvas = externalViewState ? { ...elkGraph, viewState: externalViewState } : elkGraph;

        viewStateRef.current = externalViewState ?? createEmptyViewState();

        setRawGraph(graphForCanvas);
        
        // Save anonymous architecture in public mode when AI updates the graph
        // But skip if user is signed in (architecture may have been transferred)
        if (isPublicMode && !user && elkGraph?.children && elkGraph.children.length > 0) {
          console.log('💾 Saving anonymous architecture after AI update...');
          try {
            const userPrompt = (window as any).originalChatTextInput || (window as any).chatTextInput || '';
            
            await ensureAnonymousSaved({
              rawGraph: graphForCanvas,
              userPrompt,
              anonymousService: anonymousArchitectureService,
              metadata: externalViewState ? { viewState: externalViewState } : undefined
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
        const viewStateSnapshot = sanitizeStoredViewState(externalViewState || getViewStateSnapshot());
        const graphWithViewState = viewStateSnapshot ? { ...elkGraph, viewState: viewStateSnapshot } : elkGraph;

        setSavedArchitectures(prev => prev.map(arch => 
          arch.id === targetArchitectureId 
            ? { ...arch, rawGraph: graphWithViewState, viewState: viewStateSnapshot, lastModified: new Date() }
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
            const chatMessages = normalizeChatMessages(getCurrentConversation()) ?? [];
            const viewStateSnapshot = externalViewState || getViewStateSnapshot();
            const elkGraphWithViewState = viewStateSnapshot ? { ...elkGraph, viewState: viewStateSnapshot } : elkGraph;
            
            // Update the "New Architecture" tab in place
            setSavedArchitectures(prev => prev.map(arch => 
              arch.id === 'new-architecture' 
                ? { ...arch, name: newChatName, rawGraph: elkGraphWithViewState, viewState: viewStateSnapshot, createdAt: new Date(), lastModified: new Date(), isNew: false, userPrompt, chatMessages }
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
                  rawGraph: elkGraphWithViewState,
                  nodes: [], // React Flow nodes will be generated
                  edges: [], // React Flow edges will be generated
                  userPrompt: userPrompt,
                  timestamp: now,
                  createdAt: now,
                  lastModified: now,
                  chatMessages,
                  viewState: viewStateSnapshot
                });
                
                // Update the tab with Firebase ID and move to top of list
                setSavedArchitectures(prev => {
                  console.log('🔍 Before reordering - savedArchitectures:', prev.map((arch, index) => `${index + 1}. ${arch.name} (${arch.id})`));
                  
                  const updatedArchs = prev.map(arch => 
                    arch.id === 'new-architecture' 
                      ? { ...arch, id: docId, firebaseId: docId, timestamp: now, createdAt: now, lastModified: now, chatMessages, rawGraph: elkGraphWithViewState, viewState: viewStateSnapshot }
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
                ? { ...arch, rawGraph: graphWithViewState, viewState: viewStateSnapshot, lastModified: new Date() }
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
  }, [setRawGraph, user, rawGraph, selectedArchitectureId, isPublicMode, getViewStateSnapshot]);

  // Listen for final processing completion (sync with ProcessingStatusIcon)
  useEffect(() => {
    const handleFinalComplete = () => {
      // Only clear operations if the agent is truly done (not locked to any architecture)
      // The agent lock gets cleared when operations are truly complete
      if (!agentLockedArchitectureId) {
        setArchitectureOperations({});
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

  // Update selection box corner positions dynamically
  useEffect(() => {
    if (selectedTool !== 'arrow') return;
    
    const updateSelectionBoxCorners = () => {
      // Try multiple selector strategies
      const container = document.querySelector('.react-flow__nodesselection') || 
                       document.querySelector('.arrow-mode .react-flow__nodesselection');
      const rect = document.querySelector('.react-flow__nodesselection-rect') ||
                   document.querySelector('.arrow-mode .react-flow__nodesselection-rect');
      
      if (!container || !rect) {
        return; // Silently return if not found
      }
      
      const containerRect = (container as HTMLElement).getBoundingClientRect();
      const rectElement = rect as HTMLElement;
      const rectRect = rectElement.getBoundingClientRect();
      const rectStyle = window.getComputedStyle(rectElement);
      
      // Parse the rect's top and left values
      const rectTop = parseFloat(rectStyle.top) || 0;
      const rectLeft = parseFloat(rectStyle.left) || 0;
      const rectWidth = rectRect.width;
      const rectHeight = rectRect.height;
      
      // Get container transform to account for zoom
      const containerStyle = window.getComputedStyle(container as HTMLElement);
      const transform = containerStyle.transform;
      let zoom = 1;
      if (transform && transform !== 'none') {
        // Extract scale from matrix: matrix(scaleX, 0, 0, scaleY, translateX, translateY)
        const matrix = transform.match(/matrix\(([^)]+)\)/);
        if (matrix) {
          const values = matrix[1].split(',').map(v => parseFloat(v.trim()));
          if (values.length >= 4) {
            zoom = values[0]; // scaleX (assuming uniform scaling)
          }
        }
      }
      
      // Set CSS custom property on the rect element for corner scale
      // The corner is now positioned directly on the rect, so it moves/zooms with it naturally
      // We just need to scale it inversely to keep visual size constant
      const rectEl = rectElement;
      const inverseScale = zoom > 0 ? 1 / zoom : 1;
      rectEl.style.setProperty('--corner-scale', `${inverseScale}`);
      
      // Get the corner square element to check its actual position
      const cornerSquare = rectElement.querySelector('::before') || 
        (rectElement as any).querySelector('[data-corner-square]');
      
      // Calculate expected positions
      const selectionCornerX = rectRect.right; // Right edge of selection box
      const selectionCornerY = rectRect.top;   // Top edge of selection box
      
      // The corner square should be positioned at top: -8px, right: -8px relative to rect
      // This means its center should be at the selection corner
      const cornerSquareExpectedCenterX = selectionCornerX;
      const cornerSquareExpectedCenterY = selectionCornerY;
      
      // Get actual corner square position
      const cornerSquareStyle = window.getComputedStyle(rectElement, '::before');
      const cornerSquareTop = cornerSquareStyle.top;
      const cornerSquareRight = cornerSquareStyle.right;
      
      // Parse the CSS values
      const cornerTopValue = parseFloat(cornerSquareTop) || 0;
      const cornerRightValue = parseFloat(cornerSquareRight) || 0;
      
      // Rect's top-right corner in container space (using already declared rectTop and rectLeft)
      const rectTopRightX = rectLeft + rectWidth;
      const rectTopRightY = rectTop;
      
      // Corner square is positioned at top: cornerTopValue, right: cornerRightValue relative to rect
      // The square is 8px × 8px
      // With transform-origin at center, the center is at 4px from each edge
      // So the center position relative to rect's top-right corner is:
      // X: rect's right edge - cornerRightValue - 4px (half width)
      // Y: rect's top edge + cornerTopValue + 4px (half height)
      const cornerSquareCenterX = rectTopRightX - cornerRightValue - 4;
      const cornerSquareCenterY = rectTopRightY + cornerTopValue + 4;
      
      // Convert to screen coordinates (accounting for container transform)
      // Use already declared containerRect
      const cornerSquareCenterScreenX = containerRect.left + cornerSquareCenterX;
      const cornerSquareCenterScreenY = containerRect.top + cornerSquareCenterY;
      
      // Calculate the offset
      const offsetX = selectionCornerX - cornerSquareCenterScreenX;
      const offsetY = selectionCornerY - cornerSquareCenterScreenY;
      
      // Removed verbose selection corner debug logs
      
    };
    
    // Update corners when selection appears or changes (debounced)
    let timeoutId: NodeJS.Timeout;
    const observer = new MutationObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateSelectionBoxCorners, 50);
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    
    // Use requestAnimationFrame to continuously update when selection box exists
    let rafId: number;
    const updateLoop = () => {
      const container = document.querySelector('.arrow-mode .react-flow__nodesselection');
      if (container) {
        updateSelectionBoxCorners();
        rafId = requestAnimationFrame(updateLoop);
      } else {
        // Stop loop when no selection box
        rafId = requestAnimationFrame(updateLoop);
      }
    };
    rafId = requestAnimationFrame(updateLoop);
    
    // Initial update
    setTimeout(updateSelectionBoxCorners, 100);
    
    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);
    };
  }, [selectedTool]);

  // Handle selection changes to ensure edges remain visible
  const handleSelectionChange = useCallback((params: any) => {
    if (!params) {
      return;
    }
 
    // Allow selection when using arrow tool, but prevent when actively using other tools
    if (selectedTool === 'connector' || selectedTool === 'box') {
      return;
    }
 
    // Domain and ReactFlow MUST be perfectly synchronized - no validation needed
    const newSelectedNodes = params.nodes || [];
    const newSelectedEdges = params.edges || [];

    // Update selected nodes state - use functional updates to prevent infinite loops
    setSelectedNodes((prev) => {
      const prevIds = prev.map(n => n.id).sort().join(',');
      const newIds = newSelectedNodes.map((n: Node) => n.id).sort().join(',');
      if (prevIds === newIds) return prev; // Prevent unnecessary updates
      return newSelectedNodes;
    });
    setSelectedEdges((prev) => {
      const prevIds = prev.map(e => e.id).sort().join(',');
      const newIds = newSelectedEdges.map((e: Edge) => e.id).sort().join(',');
      if (prevIds === newIds) return prev; // Prevent unnecessary updates
      return newSelectedEdges;
    });
    setSelectedNodeIds((prev) => {
      const prevStr = prev.sort().join(',');
      const newStr = newSelectedNodes.map((n: Node) => n.id).sort().join(',');
      if (prevStr === newStr) return prev; // Prevent unnecessary updates
      return newSelectedNodes.map((n: Node) => n.id);
    });

    if (newSelectedNodes.length === 0 && newSelectedEdges.length === 0) {
      setEdges((edges) => updateEdgeStylingOnDeselection(edges));
      return;
    }
 
    // Always highlight edges when nodes are selected (not just in arrow mode)
    setEdges((edges) => updateEdgeStylingOnSelection(edges, newSelectedNodes.map((n: Node) => n.id)));
  }, [selectedTool, setEdges, setSelectedNodes, setSelectedEdges, setSelectedNodeIds]);

  // REMOVED: Problematic edge visibility effect that caused flicker during node movement
  // The centralized z-index configuration now handles edge layering properly

  // Add mousedown handler to pane for immediate deselection (not waiting for mouse up)
  useEffect(() => {
    if (!reactFlowRef.current) return;
    
    const pane = document.querySelector('.react-flow__pane');
    if (!pane) return;
    
    const handlePaneMouseDown = (e: MouseEvent) => {
      // Only deselect if clicking on pane (not on a node or edge)
      const target = e.target as HTMLElement;
      if (target && target.closest('.react-flow__node')) {
        return; // Don't deselect if clicking on a node
      }
      if (target && target.closest('.react-flow__edge')) {
        return; // Don't deselect if clicking on an edge
      }
      
      // Deselect immediately on mouse down when in arrow mode
      if (selectedTool === 'arrow') {
        // Use ReactFlow's built-in selection clearing instead of direct node manipulation
        if (reactFlowRef.current) {
          reactFlowRef.current.setNodes((nds) => nds.map(node => ({ ...node, selected: false })));
        }
        setSelectedNodes([]);
        setSelectedEdges([]);
      }
    };
    
    pane.addEventListener('mousedown', handlePaneMouseDown);
    
    return () => {
      pane.removeEventListener('mousedown', handlePaneMouseDown);
    };
  }, [reactFlowRef, selectedTool, setNodes, setSelectedNodes, setSelectedEdges]);

  // CRITICAL: When tool changes to box/connector, immediately deselect any selected nodes
  // This handles the case where ReactFlow's internal state has selected nodes that our React state doesn't know about
  useEffect(() => {
    if (selectedTool === 'box' || selectedTool === 'connector') {
      if (reactFlowRef.current) {
        const currentNodes = reactFlowRef.current.getNodes();
        const selectedNodes = currentNodes.filter(n => n.selected);
        
        if (selectedNodes.length > 0) {
          console.log('🔄 [useEffect] Tool changed to', selectedTool, '- deselecting nodes:', selectedNodes.map(n => n.id));
          
          // Deselect immediately using ReactFlow's API
          reactFlowRef.current.setNodes((nds) => {
            const updated = nds.map(node => ({ ...node, selected: false }));
            console.log('🔄 [useEffect] Deselected via ReactFlow API, remaining selected:', updated.filter(n => n.selected).length);
            return updated;
          });
          
          // Also clear our selection state
          setSelectedNodes([]);
          setSelectedEdges([]);
        }
      }
    }
  }, [selectedTool, reactFlowRef, setSelectedNodes, setSelectedEdges]);

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
    
    // If switching to SVG mode, generate SVG immediately if rawGraph is available
    if (!reactFlowMode && rawGraph) {
      const svgContent = generateSVG(rawGraph);
      setSvgContent(svgContent);
    }
  }, [rawGraph]);
  
  // Handler for receiving SVG content from DevPanel
  const handleSvgGenerated = useCallback((svg: string) => {
    console.log('[InteractiveCanvas] Received SVG content, length:', svg?.length || 0);
    setSvgContent(svg);
  }, []);

  // SVG zoom handler using utility function
  const handleSvgZoomCallback = useCallback((delta: number) => {
    setSvgZoom(prev => handleSvgZoom(delta, prev));
  }, [setSvgZoom]);

  // Effect to generate SVG content when needed
  useEffect(() => {
    if (!useReactFlow && !svgContent && rawGraph) {
      const newSvgContent = generateSVG(rawGraph);
      setSvgContent(newSvgContent);
    }
  }, [useReactFlow, svgContent, rawGraph]);

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
  }, [useReactFlow, handleSvgZoomCallback]);

  useEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) return;

    const match = nodes.find((node) => node.id === pending.id);
    if (!match) return;

    if (
      !match.selected ||
      (pending.size?.width && match.data?.width !== pending.size.width) ||
      (pending.size?.height && match.data?.height !== pending.size.height)
    ) {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === pending.id
            ? {
                ...node,
                selected: true,
                data: {
                  ...node.data,
                  width: pending.size?.width ?? node.data?.width,
                  height: pending.size?.height ?? node.data?.height,
                },
                style:
                  node.type === 'group'
                    ? {
                        ...(node.style || {}),
                        width: pending.size?.width ?? (node.style as any)?.width,
                        height: pending.size?.height ?? (node.style as any)?.height,
                      }
                    : node.style,
              }
            : node
        )
      );
    }

    setSelectedNodes([{ ...(match as Node), selected: true }]);
    pendingSelectionRef.current = null;
  }, [nodes, setNodes, setSelectedNodes]);

  // Track connector dot hover to display preview
  const [hoveredConnector, setHoveredConnector] = useState<{ nodeId: string; handleId: string } | null>(null);

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
        <NodeHoverPreview reactFlowRef={reactFlowRef} visible={selectedTool === 'box' || pendingGroupId !== null} />
        <GroupHoverPreview reactFlowRef={reactFlowRef} visible={selectedTool === 'group'} />
        {/* ReactFlow container - only show when in ReactFlow mode */}
        {useReactFlow && (
          <div className="absolute inset-0 h-full w-full z-0 bg-gray-50"
            onClick={(event) => {
              const parentId = pendingGroupId;
              placeNodeOnCanvas(
                event.nativeEvent as MouseEvent,
                selectedTool,
                reactFlowRef,
                viewStateRef,
                (next) => {
                  setSelectedTool(next);
                  setPendingGroupId(null); // Reset after adding
                },
                parentId
              );
              // Reset pendingGroupId after handling
              if (parentId) {
                setPendingGroupId(null);
              }
            }}
          >
            <NodeInteractionContext.Provider value={nodeInteractionValue}>
            <ReactFlow 
              ref={reactFlowRef}
              nodes={nodes} 
              edges={edges}
              onNodesChange={(changes) => {
                
                onNodesChange(changes);
                
                // Track newly added nodes/groups to skip containment detection for them
                const now = Date.now();
                changes.forEach((ch: any) => {
                  if (ch.type === 'add' && ch.item?.id) {
                    recentlyCreatedNodesRef.current.set(ch.item.id, now);
                    // Clean up old entries (older than 2 seconds)
                    recentlyCreatedNodesRef.current.forEach((timestamp, id) => {
                      if (now - timestamp > 2000) {
                        recentlyCreatedNodesRef.current.delete(id);
                      }
                    });
                  }
                });
                
                // Check for containment after nodes are updated
                
                if (selectedTool !== 'box' && reactFlowRef.current) {
                  // Use requestAnimationFrame to check after ReactFlow has updated
                  requestAnimationFrame(() => {
                    const currentNodes = reactFlowRef.current?.getNodes() || [];
                    const movedNodes = changes
                      .filter(ch => ch.type === 'position')
                      .map(ch => (ch as any).id)
                      .filter(Boolean)
                      // Skip recently created nodes/groups - they're just being positioned initially
                      .filter((nodeId: string) => {
                        const createdTime = recentlyCreatedNodesRef.current.get(nodeId);
                        if (createdTime) {
                          const age = Date.now() - createdTime;
                          // Enable for production but lower threshold for testing
                          if (age < 100) { // Reduced from 1000ms to 100ms for debugging
                            return false;
                          }
                        }
                        return true;
                      });
                    
                    
                    if (movedNodes.length > 0) {
                      let updatedGraph = structuredClone(rawGraph);
                      let graphUpdated = false;
                      
                      // Helper to find parent in domain graph
                      const findParentInGraph = (graph: RawGraph, nodeId: string): string | null => {
                        const findParent = (n: any, targetId: string, parentId: string | null = null): string | null => {
                          if (n.id === targetId) return parentId;
                          if (n.children) {
                            for (const child of n.children) {
                              const result = findParent(child, targetId, n.id);
                              if (result !== null) return result;
                            }
                          }
                          return null;
                        };
                        return findParent(graph, nodeId);
                      };
                      
                      // Helper to find node in domain graph
                      const findNodeInGraph = (graph: RawGraph, nodeId: string): any => {
                        const find = (n: any, targetId: string): any => {
                          if (n.id === targetId) return n;
                          if (n.children) {
                            for (const child of n.children) {
                              const result = find(child, targetId);
                              if (result) return result;
                            }
                          }
                          return null;
                        };
                        return find(graph, nodeId);
                      };
                      
                      // Check each moved node for containment
                      movedNodes.forEach((nodeId) => {
                        const node = currentNodes.find(n => n.id === nodeId);
                        if (!node) return;
                        
                        // Case 1: Regular node moved into or out of a group
                        if (node.type !== 'group') {
                          // Use ReactFlow position during drag (ViewState may be stale)
                          const containingGroup = findContainingGroup(node, currentNodes, viewStateRef.current, true);
                          const currentParentInGraph = findParentInGraph(updatedGraph, nodeId);
                          
                          // Determine new parent: if node is fully contained in a group, use that group; otherwise use root
                          const newParentId = containingGroup ? containingGroup.id : 'root';
                          
                          // Check if parent changed (including moving out of a group)
                          // currentParentInGraph could be a group ID or 'root' or null
                          // newParentId is either a group ID or 'root'
                          if (currentParentInGraph !== newParentId) {
                            // CRITICAL: Preserve absolute position when moving nodes out of groups
                            const viewStateBefore = viewStateRef.current;
                            const absolutePosBefore = viewStateBefore?.node?.[nodeId] || viewStateBefore?.group?.[nodeId];
                            
                            
                            // Update domain graph: move node to new parent
                            try {
                              
                              updatedGraph = moveNode(nodeId, newParentId, updatedGraph);
                              graphUpdated = true;
                              
                              // If node was moved INTO a group (not root), set that group to FREE mode
                              // User is manually positioning, so disable auto-arrange (LOCK mode)
                              if (newParentId !== 'root') {
                                const targetGroup = findNodeInGraph(updatedGraph, newParentId);
                                if (targetGroup) {
                                  targetGroup.mode = 'FREE';
                                }
                              }
                              
                              const newParentAfter = findParentInGraph(updatedGraph, nodeId);
                              
                              // CRITICAL: Immediately prevent coordinate jumps by updating ReactFlow first
                              if (absolutePosBefore) {
                                
                                // IMMEDIATELY update ReactFlow to prevent coordinate conversion issues
                                setNodes((prevNodes) => prevNodes.map((n) => {
                                  if (n.id === nodeId) {
                                    const updatedNode = { ...n };
                                    
                                    if (newParentId === 'root') {
                                      // Moving OUT of group: Remove parentId and use absolute position
                                      delete (updatedNode as any).parentId;
                                      updatedNode.position = {
                                        x: absolutePosBefore.x,
                                        y: absolutePosBefore.y
                                      };
                                      
                                      console.log('🔧 [MOVE-OUT] Node moved to root:', {
                                        nodeId,
                                        removedParentId: (n as any).parentId || 'none',
                                        absolutePosition: `${absolutePosBefore.x},${absolutePosBefore.y}`
                                      });
                                    } else {
                                      // Moving INTO group: Set parentId and calculate relative position
                                      const groupNode = currentNodes.find(gn => gn.id === newParentId);
                                      if (groupNode && groupNode.position) {
                                        (updatedNode as any).parentId = newParentId;
                                        updatedNode.position = {
                                          x: absolutePosBefore.x - groupNode.position.x,
                                          y: absolutePosBefore.y - groupNode.position.y
                                        };
                                      }
                                    }
                                    
                                    return updatedNode;
                                  }
                                  return n;
                                }));
                                
                                // Update ViewState to match
                                if (viewStateRef.current) {
                                  const currentViewState = { ...viewStateRef.current };
                                  if (!currentViewState.node) currentViewState.node = {};
                                  
                                  currentViewState.node[nodeId] = {
                                    x: absolutePosBefore.x,
                                    y: absolutePosBefore.y,
                                    w: absolutePosBefore.w,
                                    h: absolutePosBefore.h
                                  };
                                  
                                  viewStateRef.current = currentViewState;
                                }
                              }
                              
                              if (containingGroup) {
                                // Select the group (not the node) - this will trigger highlighting of contained nodes
                                setNodes((nds) =>
                                  nds.map((n) =>
                                    n.id === containingGroup.id ? { ...n, selected: true } : { ...n, selected: false }
                                  )
                                );
                                setSelectedNodes([containingGroup]);
                                setSelectedNodeIds([containingGroup.id]);
                              }
                            } catch (error) {
                              console.warn(`Failed to move node ${nodeId} from ${currentParentInGraph} to ${newParentId}:`, error);
                            }
                          }
                        }
                        // Case 2: Group moved around nodes or other groups
                        else {
                          const group = node;
                          
                          // First check if the group itself was moved into another group
                          const containingGroup = findContainingGroup(group, currentNodes, viewStateRef.current);
                          const currentParentInGraph = findParentInGraph(updatedGraph, nodeId);
                          const newParentId = containingGroup ? containingGroup.id : 'root';
                          
                          if (currentParentInGraph !== newParentId) {
                            
                            // Update domain graph: move group to new parent
                            try {
                              updatedGraph = moveNode(nodeId, newParentId, updatedGraph);
                              graphUpdated = true;
                              
                              console.log('✅ [GROUP-MOVE] Group moved successfully in domain graph:', {
                                groupId: nodeId,
                                newParent: newParentId
                              });
                              
                              if (containingGroup) {
                                // Select the containing group (not the moved group)
                                setNodes((nds) =>
                                  nds.map((n) =>
                                    n.id === containingGroup.id ? { ...n, selected: true } : { ...n, selected: false }
                                  )
                                );
                                setSelectedNodes([containingGroup]);
                                setSelectedNodeIds([containingGroup.id]);
                              }
                            } catch (error) {
                              console.error(`❌ [GROUP-MOVE] Failed to move group ${nodeId} from ${currentParentInGraph} to ${newParentId}:`, error);
                            }
                          } else {
                            console.log('⏭️ [GROUP-MOVE] Group parent unchanged, skipping domain update:', {
                              groupId: nodeId,
                              parent: currentParentInGraph
                            });
                          }
                          
                          // Find nodes/groups fully contained in this group
                          const containedNodes = findFullyContainedNodes(group, currentNodes);
                          
                          if (containedNodes.length > 0) {
                            // Update domain graph: move each contained node/group into the group
                            containedNodes.forEach((containedNode) => {
                              try {
                                updatedGraph = moveNode(containedNode.id, group.id, updatedGraph);
                                graphUpdated = true;
                              } catch (error) {
                                console.warn(`Failed to move ${containedNode.id} into group ${group.id}:`, error);
                              }
                            });
                            
                            // Set group to FREE mode when nodes are moved into it (user is manually positioning)
                            const targetGroup = findNodeInGraph(updatedGraph, group.id);
                            if (targetGroup) {
                              targetGroup.mode = 'FREE';
                            }
                            
                            // Select the contained nodes
                            setNodes((nds) =>
                              nds.map((n) =>
                                containedNodes.some(cn => cn.id === n.id) ? { ...n, selected: true } : n
                              )
                            );
                            setSelectedNodes(containedNodes);
                            setSelectedNodeIds(containedNodes.map(n => n.id));
                          }
                        }
                      });
                      
                      // Update domain graph if any changes were made
                      if (graphUpdated) {
                        // CRITICAL: Preserve viewState when updating domain graph
                        // This ensures nodes maintain their absolute positions when moved into/out of groups
                        // The viewstate position should NOT change - only the domain structure changes
                        const currentViewState = viewStateRef.current;
                        if (currentViewState) {
                          (updatedGraph as any).viewState = currentViewState;
                        }
                        // Use a small delay to ensure ReactFlow has finished processing the node changes
                        // before updating the domain graph, which will trigger a re-render
                        setTimeout(() => {
                          // Mark as 'user' source to preserve ViewState and skip ELK layout
                          setRawGraph(updatedGraph, 'user');
                          
                          // Log position after update to detect jumps
                          setTimeout(() => {
                            movedNodes.forEach((nodeId) => {
                              const viewStateAfter = viewStateRef.current;
                              const viewStatePos = viewStateAfter?.node?.[nodeId] || viewStateAfter?.group?.[nodeId];
                              const reactFlowNode = reactFlowRef.current?.getNodes()?.find(n => n.id === nodeId);
                              if (viewStatePos && reactFlowNode) {
                                const viewStateX = viewStatePos.x;
                                const reactFlowX = reactFlowNode.position.x;
                                const viewStateY = viewStatePos.y;
                                const reactFlowY = reactFlowNode.position.y;
                                const xDiff = Math.abs(viewStateX - reactFlowX);
                                const yDiff = Math.abs(viewStateY - reactFlowY);
                                
                                if (xDiff > 1 || yDiff > 1) {
                                }
                              }
                            });
                          }, 100);
                        }, 0);
                      }
                    }
                  });
                }
              }}
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
              onSelectionChange={handleSelectionChange}
              onPaneClick={(event) => {
                if (process.env.NODE_ENV !== 'production') {
                  console.debug('[InteractiveCanvas] onPaneClick', {
                    selectedTool,
                    targetClassList: (event?.target as Element)?.className,
                  });
                }
                if (selectedTool === 'group') {
                  const handled = handleGroupToolPaneClick({
                    event,
                    selectedNodes,
                    reactFlowRef,
                    handleGroupNodes,
                    handleBatchUpdate,
                    setNodes,
                    setSelectedNodes,
                    setSelectedTool,
                    viewStateRef,
                    pendingSelectionRef,
                    shouldSkipFitViewRef,
                  });

                  if (handled) {
                    return;
                  }
                }

                // Handle pendingGroupId (Plus button mode) - add node to specific group
                if (pendingGroupId) {
                  const rf = reactFlowRef.current;
                  if (!rf) return;
                  
                  // Convert screen coordinates to world coordinates
                  const screenPoint = { x: (event as any).clientX, y: (event as any).clientY };
                  const projected = (rf as any).screenToFlowPosition
                    ? (rf as any).screenToFlowPosition(screenPoint)
                    : rf.project(screenPoint);
                  
                  console.log('[🎯COORD] InteractiveCanvas - screen to world (group):', {
                    screen: `${screenPoint.x},${screenPoint.y}`,
                    world: `${projected.x},${projected.y}`,
                    pendingGroupId,
                  });
                  
                  // Use CoordinateService to snap to grid
                  const snappedCenter = CoordinateService.snapPoint(projected);
                  const NODE_SIZE = 96;
                  const half = NODE_SIZE / 2;
                  const topLeft = { x: snappedCenter.x - half, y: snappedCenter.y - half };
                  const id = `user-node-${Date.now()}`;

                  console.log('[🎯COORD] InteractiveCanvas - final position (group):', {
                    nodeId: id,
                    snappedCenter: `${snappedCenter.x},${snappedCenter.y}`,
                    topLeft: `${topLeft.x},${topLeft.y}`,
                    parentId: pendingGroupId,
                  });

                  // Write position to ViewState first (before domain mutation)
                  try {
                    if (viewStateRef && viewStateRef.current) {
                      const vs = viewStateRef.current;
                      vs.node = vs.node || {};
                      vs.node[id] = { x: topLeft.x, y: topLeft.y, w: NODE_SIZE, h: NODE_SIZE };
                      
                      console.log('[🎯COORD] InteractiveCanvas - wrote to ViewState (group):', {
                        nodeId: id,
                        viewStatePosition: `${topLeft.x},${topLeft.y}`,
                        size: `${NODE_SIZE}x${NODE_SIZE}`,
                      });
                    }
                  } catch (error) {
                    console.error(`[InteractiveCanvas] Error writing to viewState:`, error);
                  }

                  // Use Orchestrator for FREE structural edit (add node to group)
                  const intent = {
                    source: 'user' as const,
                    kind: 'free-structural' as const,
                    scopeId: pendingGroupId,
                    payload: {
                      action: 'add-node' as const,
                      nodeId: id,
                      parentId: pendingGroupId,
                      position: { x: topLeft.x, y: topLeft.y }, // ✅ FIX: Include position in payload
                      size: { w: NODE_SIZE, h: NODE_SIZE },     // ✅ FIX: Include size in payload  
                      data: {
                        label: '', // Empty label for "Add text" placeholder
                      }
                    }
                  };
                  
                  apply(intent).catch(error => {
                    console.error('[InteractiveCanvas] Orchestrator apply failed:', error);
                  });

                  // Reset pendingGroupId after adding
                  setPendingGroupId(null);
                  return;
                }

                if ((event as any).target?.classList?.contains("react-flow__pane")) {
                  // ... existing code ...
                }
              }}
              onInit={(instance) => {
                reactFlowRef.current = instance;
                (window as any).__reactFlowInstance = instance; // Expose for console commands
              }}
              nodeTypes={memoizedNodeTypes}
              edgeTypes={memoizedEdgeTypes}
              className={`w-full h-full ${CANVAS_STYLES.canvas.background.light} dark:${CANVAS_STYLES.canvas.background.dark} ${selectedTool === 'arrow' ? 'arrow-mode' : 'non-arrow-mode'}`}
              defaultEdgeOptions={{
                type: 'step', // Right-angled edges (not bezier/smoothstep)
                style: CANVAS_STYLES.edges.default,
                animated: false,
                zIndex: CANVAS_STYLES.zIndex.edges, // Fix: Use correct edge z-index (2000), not edgeLabels (5000)
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
              panOnDrag={selectedTool === 'hand'}
              selectionOnDrag={selectedTool === 'arrow'}
              elementsSelectable={selectedTool !== 'box' && selectedTool !== 'hand'} // Disable selection in box mode (placer) and hand mode (pan only)
              nodesDraggable={selectedTool !== 'hand'}
              nodesConnectable={false} // Disable ReactFlow's default drag-to-connect, we use custom click-to-connect
              selectNodesOnDrag={selectedTool === 'arrow'} // Only allow marquee selection in arrow mode
              style={{ cursor: selectedTool === 'hand' ? 'grab' : 'default' }}
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
              {/* Edge preview that follows cursor when connecting */}
              {edgePreview}
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
            </NodeInteractionContext.Provider>
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


      {/* ELK SVG View - Always Visible */}
      <div className="fixed bottom-4 right-4 w-96 h-96 bg-white border border-gray-300 rounded-lg shadow-xl z-[10001] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-2 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-900">ELK Domain Graph</h3>
          <button
            onClick={generateElkSvg}
            disabled={isGeneratingSvg}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isGeneratingSvg ? 'Generating...' : 'Refresh'}
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2 bg-white">
          {isGeneratingSvg ? (
            <div className="flex items-center justify-center h-full text-gray-500">Generating SVG...</div>
          ) : elkSvgContent ? (
            <div 
              className="w-full h-full"
              dangerouslySetInnerHTML={{ __html: elkSvgContent }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">No graph data</div>
          )}
        </div>
      </div>

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
      <div className={`absolute top-4 z-[10002] flex items-center transition-all duration-300 ${
        viewModeConfig.showChatPanel
          ? (rightPanelCollapsed ? 'right-[5.5rem]' : 'right-[25rem]')
          : 'right-4'
      }`} style={{ height: 40, gap: 8, pointerEvents: 'auto' }}>
        {/* Share Button - Always visible for all users */}
                <button
          onClick={handleShareCurrent}
          disabled={!rawGraph || !rawGraph.children || rawGraph.children.length === 0}
          className={`flex items-center gap-2 px-2 h-10 rounded-lg shadow-lg border border-gray-200 hover:shadow-md transition-all duration-200 ${
            !rawGraph || !rawGraph.children || rawGraph.children.length === 0
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          style={{ position: 'relative', zIndex: 10003 }}
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
          viewStateRef={viewStateRef}
        />
      </div>
    </div>
  );
}

export default InteractiveCanvas;
