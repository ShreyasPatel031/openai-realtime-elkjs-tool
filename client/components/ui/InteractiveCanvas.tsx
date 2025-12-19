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
import { markEmbedToCanvasTransition, isEmbedToCanvasTransition, clearEmbedToCanvasFlag, getChatMessages, getCurrentConversation, normalizeChatMessages, mergeChatMessages, saveChatMessage, clearChatMessages, startNewConversation, EMBED_PENDING_CHAT_KEY, EMBED_CHAT_BROADCAST_CHANNEL, PersistedChatMessage } from "../../utils/chatPersistence"
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
import { handleGroupDrag, initializeDragTracking, clearDragTracking } from "../../core/drag/GroupDragHandler"
import { handleDragReparent } from "../../core/drag/DragReparentHandler"
import { batchUpdateObstaclesAndReroute } from "../../utils/canvas/routingUpdates"
import DraftGroupNode from "../node/DraftGroupNode"
import StepEdge from "../StepEdge"
import { runScopeLayout } from "../../core/layout/ScopedLayoutRunner"
import { mergeViewState } from "../../state/viewStateOrchestrator"
import { createNodeID } from "../../types/graph"
import { NodeInteractionContext } from "../../contexts/NodeInteractionContext"
import { resolveElkScope, apply } from "../../core/orchestration/Orchestrator"
import type { EditIntent } from "../../core/orchestration/types"
import { EdgeRoutingProvider } from "../../contexts/EdgeRoutingContext"
import ELK from "elkjs/lib/elk.bundled.js"
import { ensureIds } from "../graph/utils/elk/ids"
import { generateSVG, handleSvgZoom } from "../../utils/svgExport"

// Import extracted services and utilities
import { CanvasArchitectureService } from "../../services/canvasArchitectureService"
import { CanvasSaveService } from "../../services/canvasSaveService"
import { CanvasChatService } from "../../services/canvasChatService"
import { CanvasModalManager } from "../../utils/canvasModals"
import { createViewStateSnapshot, saveCanvasSnapshot, restoreCanvasSnapshot, LOCAL_CANVAS_SNAPSHOT_KEY } from "../../utils/canvasPersistence"
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
import { createLibavoidFixtures } from "../../utils/canvas/libavoidTestFixtures"
import { handleDeleteKey } from "../../utils/canvas/canvasDeleteInteractions"
import { useCanvasPersistenceEffect } from "../../hooks/canvas/useCanvasPersistence"
import NodeHoverPreview from "./NodeHoverPreview"
import GroupHoverPreview from "./GroupHoverPreview"
import CanvasToolbar from "./CanvasToolbar"
import { useCanvasEdgeInteractions } from "../../hooks/canvas/useCanvasEdgeInteractions"
import { setModeInViewState, migrateModeDomainToViewState } from "../../core/viewstate/modeHelpers"
import { useElkDebugger } from "../../hooks/canvas/useElkDebugger"
import { ElkDebugProvider } from "../../contexts/ElkDebugContext"
import ElkDebugPanel from "../debug/ElkDebugPanel"

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
import DevPanel from "../DevPanel"
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
  draftGroup: DraftGroupNode, // Used for groups to avoid ReactFlow's built-in group behavior
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
  
  // URL parameter to clear localStorage: ?reset=1
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset') === '1') {
      console.log('🗑️ [RESET] Clearing ALL localStorage due to ?reset=1 parameter');
      try {
        // Clear all possible storage keys
        localStorage.removeItem(LOCAL_CANVAS_SNAPSHOT_KEY);
        sessionStorage.removeItem(LOCAL_CANVAS_SNAPSHOT_KEY);
        localStorage.removeItem('atelier_current_conversation');
        localStorage.removeItem('publicCanvasState');
        localStorage.removeItem('publicCanvasSnapshot');
        localStorage.removeItem('atelier_current_architecture_id');
        localStorage.removeItem('atelier_chat_snapshot');
        localStorage.removeItem('atelier_pending_arch');
        
        // Clear ALL atelier-related keys
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('atelier_') || key.includes('canvas') || key.includes('architecture'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        console.log('✅ [RESET] Cleared', keysToRemove.length + 4, 'localStorage keys');
        
        // Remove the reset param and navigate
        urlParams.delete('reset');
        const newUrl = urlParams.toString() ? `${window.location.pathname}?${urlParams.toString()}` : window.location.pathname;
        window.location.replace(newUrl);  // Use replace instead of reload for cleaner navigation
      } catch (e) {
        console.error('Failed to clear localStorage:', e);
      }
    }
  }, []);
  
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
  
  // Restore chat from opener or fallback storage if needed
  // DO NOT clear chat on refresh - messages should persist
  useEffect(() => {
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

    // Only try to restore from opener or fallback if we have no current conversation
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
            console.log('💬 Restored chat from opener window');
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
          sessionStorage.removeItem(EMBED_PENDING_CHAT_KEY);
          localStorage.removeItem(EMBED_PENDING_CHAT_KEY);
          console.log('💬 Restored chat from fallback storage');
        }
      } catch (error) {
        console.warn('Failed to restore embed chat snapshot:', error);
      }
    }

    // Chat messages persist across refreshes - do NOT clear them
    if (currentCount > 0) {
      console.log('💬 Chat messages loaded on mount:', currentCount);
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
    showElkDomainGraph, setShowElkDomainGraph,
    showDebugButton, setShowDebugButton,
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
  
  
  // Store setShowDebugButton in a ref so it's always accessible
  const setShowDebugButtonRef = useRef(setShowDebugButton);
  useEffect(() => {
    setShowDebugButtonRef.current = setShowDebugButton;
    
    // Register toggleDebug immediately when ref is set
    (window as any).toggleDebug = () => {
      if (!setShowDebugButtonRef.current) {
        console.error('❌ toggleDebug: setShowDebugButton not available yet. Component may not be mounted.');
        console.log('💡 Try refreshing the page or waiting a moment for the component to mount.');
        return;
      }
      setShowDebugButtonRef.current((prev: boolean) => {
        const newState = !prev;
        console.log(`🔧 Debug button ${newState ? 'shown' : 'hidden'}`);
        return newState;
      });
    };
    console.log('✅ toggleDebug() function registered and available');
  }, [setShowDebugButton]);
  
  // Console commands to toggle default architectures
  useEffect(() => {
    // Command to load simple default (serverless API)
    // Uses source='ai' to trigger ELK layout
    (window as any).loadSimpleDefault = () => {
      console.log('✅ Loading simple default architecture (Serverless API)...');
      
      // 1. Clear ViewState so ELK computes fresh positions
      viewStateRef.current = { node: {}, group: {}, edge: {} };
      
      // 2. Clear ReactFlow state to prevent stale renders
      setNodes([]);
      setEdges([]);
      
      // 3. Load architecture with source='ai' to trigger ELK layout
      setRawGraph(SIMPLE_DEFAULT as any, 'ai');
      
      console.log('🏗️ Simple default loaded: Client → API Gateway → Lambda → DynamoDB');
    };

    // Command to load complex default (full GCP example)
    // Uses LOCK mode so edges are routed through ELK, not libavoid
    (window as any).loadComplexDefault = () => {
      console.log('✅ Loading complex default architecture (GCP Full Example, LOCK mode)...');
      
      // 1. Clear ViewState AND localStorage so ELK computes fresh grid-aligned positions
      viewStateRef.current = { node: {}, group: {}, edge: {} };
      localStorage.removeItem('viewState');  // Clear old non-grid-aligned data
      
      // 2. Clear ReactFlow state to prevent stale renders
      setNodes([]);
      setEdges([]);
      
      // 3. Load architecture with source='ai' to trigger ELK layout
      // Per FIGJAM_REFACTOR.md: AI edits always trigger ELK for their scope
      setRawGraph(DEFAULT_ARCHITECTURE as any, 'ai');
      
      console.log('🏗️ Complex default loaded with', DEFAULT_ARCHITECTURE.children?.length || 0, 'top-level components (LOCK mode, ELK routing)');
    };

    
    // Command to clear all localStorage and reload with fresh grid-aligned coordinates
    (window as any).clearAndReload = () => {
      console.log('🧹 Clearing localStorage and reloading with grid-aligned coordinates...');
      localStorage.clear();
      window.location.reload();
    };

    // Command to reset to empty
    // Uses Orchestrator handler to bypass useElkToReactflowGraphConverter
    (window as any).resetCanvas = () => {
      console.log('🗑️ [RESET] Clearing canvas completely...');
      
      const emptyGraph = { id: 'root', children: [], edges: [] };
      const emptyViewState = { node: {}, group: {}, edge: {} };
      
      // 1. Clear domain graph and ViewState via refs (bypasses ELK hook)
      rawGraphRef.current = emptyGraph;
      viewStateRef.current = emptyViewState;
      
      // 2. Also update React state to trigger re-render
      setRawGraph(emptyGraph);
      
      // 3. Clear ReactFlow directly (bypasses ELK hook)
      setNodes([]);
      setEdges([]);
      
      // 4. Clear chat history using utility function
      clearChatMessages();
      console.log('✅ [RESET] Chat history cleared');
      
      // Trigger custom event so chat component reloads (same-window updates)
      window.dispatchEvent(new CustomEvent('chatCleared'));
      
      // 5. Clear global currentGraph for chat agent
      (window as any).currentGraph = emptyGraph;
      (window as any).selectedNodeIds = [];
      (window as any).selectedEdgeIds = [];
      
      // 6. Reset viewport to center
      setTimeout(() => {
        const rfInstance = (window as any).__reactFlowInstance || reactFlowRef?.current;
        if (rfInstance) {
          rfInstance.setCenter(0, 0, { zoom: 1 });
        }
      }, 100);
      
      // 7. Save EMPTY snapshot to localStorage (this signals "user cleared the app")
      try {
        const emptySnapshot = {
          rawGraph: emptyGraph,
          viewState: emptyViewState,
          selectedArchitectureId: 'new-architecture',
          timestamp: Date.now()
        };
        const serialized = JSON.stringify(emptySnapshot);
        localStorage.setItem(LOCAL_CANVAS_SNAPSHOT_KEY, serialized);
        sessionStorage.setItem(LOCAL_CANVAS_SNAPSHOT_KEY, serialized);
        console.log('✅ [RESET] Canvas cleared and empty snapshot saved');
      } catch (e) {
        console.warn('Failed to save empty snapshot:', e);
      }
    };

    // Legacy command for backward compatibility
    (window as any).toggleDefaultArchitecture = (enabled: boolean) => {
      if (enabled) {
        (window as any).loadSimpleDefault();
      } else {
        (window as any).resetCanvas();
      }
    };

    // Command to load libavoid test fixtures - logic extracted to utility
    (window as any).loadLibavoidFixtures = () => {
      createLibavoidFixtures({
        setNodes,
        setEdges,
        viewStateRef
      });
    };

    // Command to toggle debug button visibility
    (window as any).toggleDebug = () => {
      if (!setShowDebugButtonRef.current) {
        console.error('❌ toggleDebug: setShowDebugButton not available yet. Component may not be mounted.');
        console.log('💡 Try refreshing the page or waiting a moment for the component to mount.');
        return;
      }
      setShowDebugButtonRef.current((prev: boolean) => {
        const newState = !prev;
        console.log(`🔧 Debug button ${newState ? 'shown' : 'hidden'}`);
        return newState;
      });
    };
    
    // Immediately verify and log that toggleDebug is available
    if ((window as any).toggleDebug) {
      console.log('✅ toggleDebug() function registered and available');
      console.log('💡 You can now call toggleDebug() in the console');
    } else {
      console.error('❌ Failed to register toggleDebug() function');
    }

    // Command to test selection tracking
    (window as any).testSelection = () => {
      console.log('🧪 Testing selection tracking...');
      console.log('📊 Current graph:', (window as any).currentGraph ? `${(window as any).currentGraph.children?.length || 0} nodes` : 'none');
      console.log('🎯 Selected nodes (global):', (window as any).selectedNodeIds || []);
      console.log('🎯 Selected edges (global):', (window as any).selectedEdgeIds || []);
      console.log('📋 React state selectedNodeIds:', selectedNodeIds);
      console.log('📋 React state selectedNodes:', selectedNodes?.map(n => n.id) || []);
      console.log('📋 React state selectedEdges:', selectedEdges?.map(e => e.id) || []);
      
      if ((window as any).selectedNodeIds && (window as any).selectedNodeIds.length > 0) {
        console.log('✅ Selections are tracked in global state');
        console.log('📤 These will be sent to chat API when you send a message');
      } else {
        console.log('⚠️ No selections found - select a group/node first');
      }
    };

    // Log help message
    console.log('💡 Console commands available:');
    console.log('  - loadLibavoidFixtures() → Load 5-node obstacle/batch routing test');
    console.log('  - loadSimpleDefault()    → Load simple serverless API architecture');
    console.log('  - loadComplexDefault()   → Load complex GCP test architecture');
    console.log('  - clearAndReload()       → Clear localStorage and reload (fixes grid alignment)');
    console.log('  - resetCanvas()          → Reset to empty canvas');
    console.log('  - toggleDebug()           → Toggle debug button visibility');
    console.log('  - testSelection()         → Test selection tracking (check if selections are being tracked)');

    // Cleanup - but DON'T delete toggleDebug to keep it available
    return () => {
      delete (window as any).loadSimpleDefault;
      delete (window as any).loadComplexDefault;
      delete (window as any).clearAndReload;
      delete (window as any).resetCanvas;
      delete (window as any).toggleDefaultArchitecture;
      delete (window as any).loadLibavoidFixtures;
      // Keep toggleDebug and testSelection available - they use refs so they're safe
      // delete (window as any).toggleDebug;
      // delete (window as any).testSelection;
    };
    // Empty dependency array - these functions use closures to access current state/refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Additional safety: ensure toggleDebug is always available, even if useEffect hasn't run
  useEffect(() => {
    if (!(window as any).toggleDebug) {
      console.warn('⚠️ toggleDebug not set by main useEffect, setting up fallback...');
      (window as any).toggleDebug = () => {
        if (!setShowDebugButtonRef.current) {
          console.error('❌ toggleDebug: setShowDebugButton not available yet. Component may not be mounted.');
          return;
        }
        setShowDebugButtonRef.current((prev: boolean) => {
          const newState = !prev;
          console.log(`🔧 Debug button ${newState ? 'shown' : 'hidden'}`);
          return newState;
        });
      };
      console.log('✅ toggleDebug() fallback registered');
    }
  }, []);

  // Load libavoid test fixtures ONLY when explicitly requested via URL params
  // Canvas stays clean by default - use ?testFixtures=1 or ?libavoidFixtures=1 to load fixtures
  useEffect(() => {
        const params = new URLSearchParams(window.location.search);
    const hasTestFixtures = params.get('testFixtures') === '1';
    const hasLibavoidFixtures = params.get('libavoidFixtures') === '1';
    
    // Only load if URL params explicitly request it
    if (hasTestFixtures || hasLibavoidFixtures) {
      console.log('🧪 [LIBAVOID] URL param detected, loading fixtures...');
      // Small delay to ensure component is fully mounted and console commands are registered
      setTimeout(() => {
        if ((window as any).loadLibavoidFixtures) {
          console.log('🧪 [LIBAVOID] Calling loadLibavoidFixtures()...');
          (window as any).loadLibavoidFixtures();
        } else {
          console.error('🧪 [LIBAVOID] ERROR: loadLibavoidFixtures function not found!');
        }
      }, 500);
    }
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
    rawGraphRef,  // Use the ref from useElkToReactflowGraphConverter
    architectureService,
    saveService,
    handleDeleteArchitecture,
    handleShareArchitecture,
    handleEditArchitecture,
    skipPersistenceRef: graphSkipPersistenceRef,
  } = canvasGraphState;

  // rawGraphRef now comes from canvasGraphState (from useElkToReactflowGraphConverter)
  // No need to create a separate ref - this ensures Orchestrator and getDomainGraph() use the same ref

  // AUTO-CONFIGURE OBSTACLES: Ensure all edges have staticObstacleIds AND staticObstacles for libavoid routing
  // This is CRITICAL - without this, libavoid doesn't know about obstacles and edges pass through nodes
  // We pass BOTH staticObstacleIds AND staticObstacles with actual positions to ensure correct routing
  useEffect(() => {
    if (nodes.length === 0 || edges.length === 0) {
      return; // Skip silently - no obstacles to configure
    }

    // Build obstacle rects from current node positions
    const allObstacles = nodes.map((node) => ({
      id: node.id,
      x: node.position?.x ?? 0,
      y: node.position?.y ?? 0,
      width: (node as any).width ?? node.data?.width ?? 96,
      height: (node as any).height ?? node.data?.height ?? 96
    }));
    
    const allNodeIds = allObstacles.map(o => o.id);
    if (allNodeIds.length === 0) {
      return;
    }

    // Create a signature to detect if obstacles changed
    const obstacleSignature = allObstacles
      .map(o => `${o.id}:${Math.round(o.x)}:${Math.round(o.y)}:${Math.round(o.width)}:${Math.round(o.height)}`)
      .sort()
      .join('|');

    setEdges((prevEdges) => {
      let updated = false;
      const nextEdges = prevEdges.map((edge) => {
        const data = edge.data || {};
        const currentSignature = data._obstacleSignature || '';
        
        // If edge has same obstacle signature, skip it
        if (currentSignature === obstacleSignature) {
          return edge;
        }

        // Configure obstacles with positions
        updated = true;

        return {
          ...edge,
          type: edge.type || 'step', // Ensure type is set to 'step' for StepEdge to mount
          data: {
            ...data,
            staticObstacleIds: allNodeIds,
            staticObstacles: allObstacles, // Include actual positions!
            obstacleMargin: 32, // 2 grid spaces (16px * 2 = 32px)
            _obstacleSignature: obstacleSignature, // Track for change detection
            // Use signature hash as rerouteKey - stable but changes when obstacles change
            rerouteKey: obstacleSignature.length + obstacleSignature.charCodeAt(0)
          },
        };
      });

      return updated ? nextEdges : prevEdges;
    });
  }, [edges, nodes, setEdges]);

  // CRITICAL: Ensure fixture edges always have type 'step' for StepEdge to mount
  // This runs continuously to override any conversions that might change edge types
  useEffect(() => {
    const fixtureEdges = (window as any).__libavoidFixtureEdges?.current;
    if (!fixtureEdges || fixtureEdges.length === 0) {
      return;
    }

    setEdges((prevEdges) => {
      const fixtureEdgeIds = new Set(fixtureEdges.map((e: any) => e.id));
      let updated = false;
      const nextEdges = prevEdges.map((edge) => {
        if (fixtureEdgeIds.has(edge.id)) {
          // Ensure fixture edges always have type 'step'
          if (edge.type !== 'step') {
            updated = true;
            return { ...edge, type: 'step' };
          }
        }
        return edge;
      });
      return updated ? nextEdges : prevEdges;
    });
  }, [edges, setEdges]);

  // Initialize Orchestrator (moved from ELK hook for proper separation of concerns)
  useEffect(() => {
    // FIRST: Handle restoration BEFORE Orchestrator initialization
    // This ensures restored data is available when Orchestrator initializes
    if (!restoredFromSnapshotRef.current) {
      try {
        const snapshot = restoreCanvasSnapshot();
        if (snapshot && snapshot.rawGraph && snapshot.rawGraph.children?.length > 0) {

          // Set ViewState FIRST and apply mode migration if needed
          let viewStateSnapshot = snapshot.viewState || { node: {}, group: {}, edge: {} };
          // Preserve existing layout before migration
          const existingLayout = viewStateSnapshot.layout ? { ...viewStateSnapshot.layout } : undefined;
          viewStateSnapshot = migrateModeDomainToViewState(snapshot.rawGraph, viewStateSnapshot);
          // Ensure existing layout entries are preserved (migration might have defaulted some to FREE)
          if (existingLayout) {
            viewStateSnapshot.layout = { ...viewStateSnapshot.layout, ...existingLayout };
          }
          viewStateRef.current = JSON.parse(JSON.stringify(viewStateSnapshot));

          // Set domain graph directly in ref (bypass ELK hook)
          rawGraphRef.current = snapshot.rawGraph;
          
          // CRITICAL: Ensure mode is preserved for all groups in restored graph
          // This function recursively preserves mode from the snapshot
          const ensureModePreserved = (node: any) => {
            // CRITICAL: If mode exists in snapshot, preserve it (don't override)
            // Only set default if mode is completely missing
            if (node.children && node.children.length > 0) {
              // This is a group - preserve mode from snapshot
              if (!node.mode) {
                // Only set default if mode is truly missing
                // Don't override existing mode from snapshot
                node.mode = 'FREE'; // Default to FREE only if not in snapshot
              } else {
                // Mode exists in snapshot - log it for debugging
                console.log(`🔒 [RESTORE] Preserving mode='${node.mode}' for group: ${node.id}`);
              }
            }
            // Recursively check children
            if (node.children) {
              node.children.forEach((child: any) => ensureModePreserved(child));
            }
          };
          
          // Ensure all groups have their mode preserved from snapshot
          if (snapshot.rawGraph.children) {
            snapshot.rawGraph.children.forEach((child: any) => ensureModePreserved(child));
          }
          
          // CRITICAL: Set global currentGraph for chat agent immediately on restore
          (window as any).currentGraph = snapshot.rawGraph;
          console.log('📊 Restored global currentGraph from snapshot:', snapshot.rawGraph ? `${snapshot.rawGraph.children?.length || 0} nodes` : 'none');
          
          // Log mode information for debugging
          const groupsWithMode = snapshot.rawGraph.children?.filter((child: any) => child.mode).map((child: any) => ({
            id: child.id,
            label: child.labels?.[0]?.text || child.data?.label,
            mode: child.mode
          })) || [];
          if (groupsWithMode.length > 0) {
            console.log('🔒 Groups with mode preserved:', groupsWithMode);
          }
          
          // CRITICAL FIX: Check if restored graph has LOCK groups - if so, trigger ELK
          // Only top-level LCG should run ELK (ELK processes entire graph hierarchically)
          const hasTopLevelLockGroup = snapshot.rawGraph.children?.some((child: any) => child.mode === 'LOCK');
          
          // CRITICAL: Set rawGraphRef BEFORE calling setRawGraph to ensure ViewState is available
          // This ensures that when ELK runs, it can read the restored ViewState
          rawGraphRef.current = snapshot.rawGraph;
          
          // If there are LOCK groups, use 'ai' source to trigger ELK layout
          // This ensures edges are routed correctly on refresh
          const restoreSource = hasTopLevelLockGroup ? 'ai' : 'free-structural';
          
          if (hasTopLevelLockGroup) {
            console.log('🔒 [RESTORE] Detected LOCK groups - triggering ELK layout for top-level LCG');
          }
          
          // Update React state - use 'ai' source if LOCK groups exist to trigger ELK
          // CRITICAL: ViewState is already set in viewStateRef.current above, so ELK will preserve it
          setRawGraph(snapshot.rawGraph, restoreSource);

          restoredFromSnapshotRef.current = true;
        }
      } catch (error) {
        console.error("❌ [INIT] Failed to restore canvas:", error);
      }
    }

    const triggerRender = () => {
      // This is only needed for AI/LOCK mode ELK triggers - not used for FREE mode
    };
    
    const setGraph = (graph: RawGraph, source?: 'ai' | 'user' | 'free-structural') => {
      // Pass through the source from Orchestrator (defaults to 'user' for backwards compatibility)
      setRawGraph(graph, source || 'user');
    };
    
    // SECOND: Initialize Orchestrator (will detect existing data and render)
    initializeOrchestrator(
      rawGraphRef,
      viewStateRef,
      triggerRender,
      setGraph,
      setNodes,
      setEdges
    );
    
  }, [setRawGraph, setNodes, setEdges]); // Stable dependencies

  // Ref to store ReactFlow instance for auto-zoom functionality
  const reactFlowRef = useRef<any>(null);
  const embedChatChannelRef = useRef<BroadcastChannel | null>(null);
  // Track fitView triggers: only on initial load and AI diagram generation
  const hasFittedInitialLoadRef = useRef<boolean>(false);
  const shouldFitViewForAIDiagramRef = useRef<boolean>(false);
  const newlyCreatedAIGroupIdRef = useRef<string | null>(null); // Track newly created AI group to focus on
  const previousNodeCountRef = useRef<number>(0);
  
  // Track recently created nodes/groups to skip containment detection
  const recentlyCreatedNodesRef = useRef<Map<string, number>>(new Map());
  const unlockedDuringDragRef = useRef<Set<string>>(new Set());
  
  // Debounce domain graph updates during drag to prevent flickering
  const domainUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDomainUpdateRef = useRef<RawGraph | null>(null);
  
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

  // Expose handleToolSelect on window for testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).handleToolSelect = handleToolSelect;
      (window as any).__selectedTool = selectedTool;
    }
  }, [handleToolSelect, selectedTool]);

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
        
        // REMOVED: Auto-redirect from canvas/embed to auth when user signs in
        // Users should be able to freely navigate between /embed, /canvas, and /auth routes
        // The route should be determined by the URL path, not by auth state
        
        // Canvas/Embed mode: Allow users to stay on current route even after signing in
        // Just update the user state without redirecting
        if (!viewModeConfig.requiresAuth && currentUser) {
          console.log('✅ [CANVAS/EMBED] User signed in - staying on current route:', window.location.pathname);
          setUser(currentUser);
          // Don't redirect - let users stay on /canvas or /embed if they want
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
        const viewStateSnapshot = getViewStateSnapshot(edges);
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
      const viewStateSnapshot = getViewStateSnapshot(edges);
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
          const viewStateSnapshot = getViewStateSnapshot(edges);
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
      // Bypass ELK hook - update refs directly
      rawGraphRef.current = { id: 'root', children: [], edges: [] };
      viewStateRef.current = { node: {}, group: {}, edge: {} };
      setNodes([]);
      setEdges([]);
    }
    
    previousArchitectureIdRef.current = selectedArchitectureId;
  }, [selectedArchitectureId, setNodes, setEdges]);

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
      const viewStateSnapshot = getViewStateSnapshot(edges);
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
        // Apply mode migration to ensure layout is properly initialized
        viewStateSnapshot = migrateModeDomainToViewState(architecture.rawGraph, viewStateSnapshot || { node: {}, group: {}, edge: {} });
        viewStateRef.current = viewStateSnapshot;
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
      
      // CRITICAL: Set global currentGraph for chat agent
      (window as any).currentGraph = architecture.rawGraph;
      console.log('📊 Set global currentGraph from URL architecture:', architecture.rawGraph ? `${architecture.rawGraph.children?.length || 0} nodes` : 'none');
      
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
      const viewStateSnapshot = getViewStateSnapshot(edges);
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
    
    // Handle "New Architecture" case - clear everything and start fresh
    if (architectureId === 'new-architecture') {
      console.log('🆕 Selecting new architecture - clearing canvas and conversation');
      
      // Clear conversation FIRST (this dispatches chatCleared event)
      startNewConversation();
      
      // Also explicitly dispatch the event to ensure it's caught
      // Use a small delay to ensure localStorage is cleared first
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('chatCleared'));
        console.log('💬 Dispatched chatCleared event (delayed)');
      }, 10);
      
      // Reset canvas to empty graph
      const emptyGraph = { id: "root", children: [], edges: [] };
      setRawGraph(emptyGraph);
      
      // Reset view state
      viewStateRef.current = { node: {}, group: {}, edge: {}, layout: {} };
      
      // Clear global chat input
      (window as any).originalChatTextInput = '';
      (window as any).chatTextInput = '';
      (window as any).currentGraph = emptyGraph;
      
      // Dispatch empty graph to reset canvas
      dispatchElkGraph({
        elkGraph: assertRawGraph(emptyGraph, 'NewArchitecture'),
        source: 'NewArchitecture',
        reason: 'new-architecture',
        viewState: { node: {}, group: {}, edge: {}, layout: {} },
        targetArchitectureId: 'new-architecture'
      });
      
      console.log('✅ New architecture selected - canvas and conversation cleared');
      return;
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

      // CRITICAL: Set global currentGraph for chat agent BEFORE dispatching
      // This ensures it's available even if onElkGraph handler hasn't run yet
      (window as any).currentGraph = architecture.rawGraph;
      console.log('📊 Set global currentGraph from selected architecture:', architecture.rawGraph ? `${architecture.rawGraph.children?.length || 0} nodes` : 'none');

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

  // Auto-trigger architecture loading when architectures are loaded and selectedArchitectureId changes
  // This ensures architectures load on canvas when auto-selected from useAuthListener
  const previousSelectedIdRef = useRef<string | null>(null);
  const hasTriggeredSelectionRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    // Only trigger if selectedArchitectureId actually changed and architecture exists
    if (selectedArchitectureId && selectedArchitectureId !== previousSelectedIdRef.current) {
      const prevId = previousSelectedIdRef.current;
      previousSelectedIdRef.current = selectedArchitectureId;
      
      // Skip if it's "new-architecture" (handled separately)
      if (selectedArchitectureId === 'new-architecture') {
        hasTriggeredSelectionRef.current.clear();
        return;
      }
      
      // Check if architecture exists and has rawGraph
      const architecture = savedArchitectures.find(arch => arch.id === selectedArchitectureId);
      if (architecture && architecture.rawGraph) {
        // Check if we've already triggered selection for this architecture
        // This prevents infinite loops when handleSelectArchitecture updates state
        if (!hasTriggeredSelectionRef.current.has(selectedArchitectureId)) {
          // Only trigger if the graph hasn't been loaded yet or is different
          const currentGraphMatches = rawGraph && 
            JSON.stringify(rawGraph) === JSON.stringify(architecture.rawGraph);
          
          if (!currentGraphMatches) {
            hasTriggeredSelectionRef.current.add(selectedArchitectureId);
            // Use a small delay to ensure state has settled
            const timeoutId = setTimeout(() => {
              handleSelectArchitecture(selectedArchitectureId);
              // Clear the flag after a delay to allow re-selection if needed
              setTimeout(() => {
                hasTriggeredSelectionRef.current.delete(selectedArchitectureId);
              }, 1000);
            }, 100);
            return () => clearTimeout(timeoutId);
          }
        }
      }
    }
    
    // Clear flags when selection changes to a different architecture
    if (previousSelectedIdRef.current && previousSelectedIdRef.current !== selectedArchitectureId) {
      hasTriggeredSelectionRef.current.delete(previousSelectedIdRef.current);
    }
  }, [selectedArchitectureId, savedArchitectures, handleSelectArchitecture, rawGraph]);

  // Handle canvas resize when sidebar state changes
  useEffect(() => {
    // Small delay to ensure sidebar animation has started
    const timeoutId = setTimeout(() => {
      if (reactFlowRef.current) {
        // Force React Flow to recalculate its dimensions
        window.dispatchEvent(new Event('resize'));
        // NOTE: fitView removed - canvas should not reset view on sidebar changes
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
      // Mark that we should fitView when this AI diagram is rendered
      shouldFitViewForAIDiagramRef.current = true;
      newlyCreatedAIGroupIdRef.current = null; // Reset before processing
      
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
            // Per FIGJAM_REFACTOR.md: AI edits default to LOCK mode
            // LOCK mode = ELK routing, internal auto-layout on structural changes
            groupNode.mode = 'LOCK';
            // Store the group ID so we can focus on it when fitting view
            newlyCreatedAIGroupIdRef.current = groupNode.id;
          }
        } catch (error) {
          console.error('Failed to wrap AI diagram in group:', error);
          finalGraph = aiGraph; // Fallback to original if grouping fails
        }
      } else {
        finalGraph = aiGraph;
      }
            } else {
      const viewStateSnapshot = getViewStateSnapshot(edges);
      finalGraph = viewStateSnapshot ? { ...newGraph, viewState: viewStateSnapshot } : newGraph;
    }
    
    // Update the local state immediately
    setRawGraph(finalGraph, options.source === 'ai' ? 'ai' : undefined);

    // CRITICAL FIX: Immediately persist viewstate to localStorage after any graph change
    // This ensures that when page refreshes, the current state is preserved
    try {
      const currentViewState = getViewStateSnapshot(edges);
      
      if (currentViewState && selectedArchitectureId) {
        // CRITICAL: Ensure mode is preserved in the graph before saving
        // Deep clone to avoid mutating the original
        const graphToSave = JSON.parse(JSON.stringify(finalGraph));
        
        // Verify mode is present on groups (especially AI-created LOCK groups)
        const verifyModes = (node: any) => {
          if (node.children && node.children.length > 0) {
            // This is a group - ensure mode is preserved
            if (!node.mode && options.source === 'ai') {
              // AI-created groups should be LOCK by default
              node.mode = 'LOCK';
              console.log(`🔒 [PERSIST] Set mode to LOCK for AI-created group: ${node.id}`);
            }
          }
          if (node.children) {
            node.children.forEach((child: any) => verifyModes(child));
          }
        };
        
        if (graphToSave.children) {
          graphToSave.children.forEach((child: any) => verifyModes(child));
        }
        
        saveCanvasSnapshot(graphToSave, currentViewState, selectedArchitectureId);
        
        // Log what was saved
        const savedGroups = extractGroupIdsFromGraph(graphToSave);
        // Helper to find node in graph (inline to avoid dependency issues)
        const findNode = (graph: any, targetId: string): any => {
          if (graph.id === targetId) return graph;
          if (graph.children) {
            for (const child of graph.children) {
              const found = findNode(child, targetId);
              if (found) return found;
            }
          }
          return null;
        };
        const groupsWithMode = savedGroups.map((id: string) => {
          const group = findNode(graphToSave, id);
          return { id, mode: group?.mode || 'FREE' };
        });
        console.log('💾 [PERSIST] Saved groups with modes:', groupsWithMode);
      } else {
        console.warn('⚠️ [handleGraphChange] Cannot persist - missing viewstate or architectureId:', {
          hasViewState: !!currentViewState,
          hasArchitectureId: !!selectedArchitectureId
        });
      }
    } catch (error) {
      console.error('❌ [handleGraphChange] Failed to immediately persist viewstate:', error);
    }

    if (markDirty && typeof markDirty === 'function') {
    markDirty();
    }
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
          
          // Include error feedback in tool outputs if there were errors
          if (batchErrors.length > 0) {
            toolOutputs.forEach(output => {
              const outputData = JSON.parse(output.output);
              outputData.errors = batchErrors;
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
          // #region agent log
          const completionId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
          fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InteractiveCanvas.tsx:2697',message:'Firing completion events - natural completion',data:{completionId,selectedArchitectureId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
          // #endregion
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

  // Fit view ONLY on initial load (when transitioning from 0 nodes to first nodes)
  // This handles cases where nodes are restored from localStorage without ELK running
  useEffect(() => {
    const previousCount = previousNodeCountRef.current;
    const currentCount = nodes.length;
    
    // Only trigger when transitioning from empty (0 nodes) to having nodes (>0)
    // AND we haven't already fitted the initial load
    const isInitialLoad = previousCount === 0 && currentCount > 0 && !hasFittedInitialLoadRef.current;
    
    // Update ref for next check
    previousNodeCountRef.current = currentCount;
    
    if (isInitialLoad && reactFlowRef.current) {
      if (typeof reactFlowRef.current.getViewport !== 'function') {
        return; // ReactFlow not ready yet
      }
      
      // Mark as fitted - this prevents any future triggers
      hasFittedInitialLoadRef.current = true;
      
      const minX = Math.min(...nodes.map(n => n.position.x));
      const minY = Math.min(...nodes.map(n => n.position.y));
      const maxX = Math.max(...nodes.map(n => n.position.x));
      const maxY = Math.max(...nodes.map(n => n.position.y));
      const nodeSpread = Math.max(maxX - minX, maxY - minY);
      const hasLargeSpread = nodeSpread > 2000;
      
      const timeoutId = setTimeout(() => {
        if (hasLargeSpread && reactFlowRef.current) {
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          reactFlowRef.current.setCenter(centerX, centerY, { zoom: 0.5 });
        }
        manualFitView();
      }, 300); // Slightly longer delay for initial load
      return () => clearTimeout(timeoutId);
    }
  }, [nodes.length, manualFitView]); // Still depend on nodes.length to detect changes, but logic prevents re-triggering

  // Fit view on AI diagram generation ONLY (when layoutVersion changes after AI graph change)
  // NOT on user interactions - only when shouldFitViewForAIDiagramRef flag is explicitly set
  useEffect(() => {
    // CRITICAL: Only trigger if flag is set (set in handleGraphChange when source === 'ai')
    // This ensures we never fitView on user interactions, even if layoutVersion changes
    if (!shouldFitViewForAIDiagramRef.current) {
      return; // Early exit - flag not set, this is not an AI diagram
    }
    
    // Only proceed if we have content, ReactFlow is ready, and layoutVersion has changed
    if (nodes.length > 0 && reactFlowRef.current && layoutVersion > 0) {
      // Check if ReactFlow instance is ready
      if (typeof reactFlowRef.current.getViewport !== 'function') {
        return; // ReactFlow not ready yet
      }
      
      // Clear AI diagram flag immediately to prevent re-triggering
      shouldFitViewForAIDiagramRef.current = false;
      
      const timeoutId = setTimeout(() => {
        if (!reactFlowRef.current) return;
        
        // If we have a newly created AI group, focus specifically on that group
        if (newlyCreatedAIGroupIdRef.current) {
          const groupNode = nodes.find(n => n.id === newlyCreatedAIGroupIdRef.current);
          if (groupNode) {
            // Get group bounds (including all children)
            const groupNodes = nodes.filter(n => 
              n.parentId === groupNode.id || n.id === groupNode.id
            );
            
            if (groupNodes.length > 0) {
              // Calculate bounds including node dimensions
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              
              groupNodes.forEach(n => {
                const width = (n.width as number) || (n.data?.width as number) || 96;
                const height = (n.height as number) || (n.data?.height as number) || 96;
                minX = Math.min(minX, n.position.x);
                minY = Math.min(minY, n.position.y);
                maxX = Math.max(maxX, n.position.x + width);
                maxY = Math.max(maxY, n.position.y + height);
              });
              
              // Center on the newly created group
              const centerX = (minX + maxX) / 2;
              const centerY = (minY + maxY) / 2;
              
              console.log('🎯 [AI-FITVIEW] Focusing on newly created AI group:', {
                groupId: newlyCreatedAIGroupIdRef.current,
                center: { x: centerX, y: centerY },
                bounds: { minX, minY, maxX, maxY },
                nodeCount: groupNodes.length
              });
              
              // Calculate zoom to fit the group with padding
              const groupWidth = maxX - minX;
              const groupHeight = maxY - minY;
              
              // Estimate viewport size (ReactFlow doesn't expose this easily)
              // Use typical browser viewport dimensions
              const estimatedViewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
              const estimatedViewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
              
              // Calculate zoom to fit group with 20% padding on all sides
              const padding = 0.2;
              const availableWidth = estimatedViewportWidth * (1 - padding * 2);
              const availableHeight = estimatedViewportHeight * (1 - padding * 2);
              
              const zoomX = availableWidth / groupWidth;
              const zoomY = availableHeight / groupHeight;
              const targetZoom = Math.min(Math.max(zoomX, zoomY, 0.3), 1.5); // Clamp between 0.3 and 1.5
              
              // Center and zoom to the newly created group
              reactFlowRef.current.setCenter(centerX, centerY, { 
                zoom: targetZoom,
                duration: 800 
              });
              
              // Clear the ref after focusing
              newlyCreatedAIGroupIdRef.current = null;
              return;
            }
          }
          // If group not found, fall through to fit all nodes
          newlyCreatedAIGroupIdRef.current = null;
        }
        
        // Fallback: fit all nodes if no specific group to focus on
        const minX = Math.min(...nodes.map(n => n.position.x));
        const minY = Math.min(...nodes.map(n => n.position.y));
        const maxX = Math.max(...nodes.map(n => n.position.x));
        const maxY = Math.max(...nodes.map(n => n.position.y));
        const nodeSpread = Math.max(maxX - minX, maxY - minY);
        const hasLargeSpread = nodeSpread > 2000; // Nodes spread over 2000px
        
        // For large spreads (AI diagrams), center on the middle of all nodes first
        if (hasLargeSpread && reactFlowRef.current) {
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          reactFlowRef.current.setCenter(centerX, centerY, { zoom: 0.5 }); // Start zoomed out
        }
        
        manualFitView();
      }, 200); // Delay to ensure layout is complete
      return () => clearTimeout(timeoutId);
    }
  }, [
    // Only trigger on layoutVersion changes (ELK layout completion)
    // Combined with shouldFitViewForAIDiagramRef flag check to only trigger for AI diagrams
    layoutVersion,
    nodes.length, // Also check nodes.length to ensure nodes are present
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

  
  // ELK Debugger - extracted to dedicated hook per cursor rules
  const { elkSvgContent, isGeneratingSvg, generateElkSvg } = useElkDebugger({
    rawGraph,
    rawGraphRef,
    viewStateRef,
    nodesLength: nodes.length
  });

  const handleCreateWrapperAndArrange = useCallback(async (selectionIds: string[]) => {
    if (!rawGraph || !viewStateRef.current) {
      console.warn('🟦 [WRAPPER] Missing rawGraph or viewState');
      return;
    }
    
    try {
      console.log('🟦 [WRAPPER] Creating wrapper section for selection:', selectionIds);
      
      // Create wrapper section (domain mutation)
      const { graph: updatedGraph, wrapperId } = createWrapperSection(selectionIds, rawGraph);
      
      // Update refs directly - bypasses ELK hook (ELK runs separately below)
      rawGraphRef.current = updatedGraph;
      
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
      
      console.log('🟦 [WRAPPER] Layout complete, rendering directly');
      
      // Render directly - bypasses ELK hook (ELK already ran above)
      const { convertViewStateToReactFlow } = await import('../../core/renderer/ViewStateToReactFlow');
      const { nodes, edges } = convertViewStateToReactFlow(updatedGraph, updatedViewState);
      setNodes(nodes);
      setEdges(edges);
      
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

  const handleArrangeGroup = useCallback(async (groupId: string, currentModeFromButton?: 'FREE' | 'LOCK') => {
    // Arrange the insides of the group using ELK, relative to group position
    console.log('🟦 [ARRANGE] handleArrangeGroup called for group:', groupId, 'with currentMode:', currentModeFromButton);
    
    // CRITICAL: Use rawGraphRef.current (source of truth) instead of rawGraph (might be stale)
    const currentGraph = rawGraphRef.current || rawGraph;
    if (!currentGraph || !viewStateRef.current) {
      console.warn('🟦 [ARRANGE] Missing graph or viewState');
      return;
    }
    
    try {
      // Normalize the group ID to match how it's stored in the graph
      const normalizedGroupId = createNodeID(groupId);
      console.log('🟦 [ARRANGE] Original ID:', groupId, '→ Normalized:', normalizedGroupId);
      
      // Try to find the group in the graph (use ref, not state)
      let groupNode = findNodeInGraph(currentGraph, groupId);
      let finalGroupId = groupId;
      
      if (!groupNode && normalizedGroupId !== groupId) {
        groupNode = findNodeInGraph(currentGraph, normalizedGroupId);
        if (groupNode) {
          finalGroupId = normalizedGroupId;
          console.log('🟦 [ARRANGE] Found group using normalized ID');
        }
      }
      
      // If group not found, still proceed - resolveElkScope will handle it
      // The group might exist in ReactFlow but not yet in domain (race condition)
      if (!groupNode) {
        console.warn('🟦 [ARRANGE] Group not found in graph, but proceeding anyway - will run ELK on scope:', groupId);
        // Use the original groupId - resolveElkScope will figure it out
        finalGroupId = groupId;
      }
      
      // CRITICAL FIX: Use mode passed from button if available (most reliable)
      // Otherwise fallback to reading from ReactFlow or ViewState
      let currentMode: 'FREE' | 'LOCK' = currentModeFromButton || 'FREE';
      
      if (!currentModeFromButton) {
        // Fallback: Read from ReactFlow node data (data.mode) which is the source of truth
        if (reactFlowRef.current) {
          const reactFlowNodes = reactFlowRef.current.getNodes();
          const groupReactFlowNode = reactFlowNodes.find(n => n.id === finalGroupId || n.id === groupId);
          if (groupReactFlowNode?.data?.mode) {
            currentMode = groupReactFlowNode.data.mode;
            console.log(`🟦 [ARRANGE] Read mode from ReactFlow node data: ${currentMode}`);
          }
        }
        
        // Final fallback to ViewState if ReactFlow data not available
        if (currentMode === 'FREE' && viewStateRef.current.layout?.[finalGroupId]?.mode) {
          currentMode = viewStateRef.current.layout[finalGroupId].mode;
          console.log(`🟦 [ARRANGE] Read mode from ViewState: ${currentMode}`);
        }
      } else {
        console.log(`🟦 [ARRANGE] Using mode from button: ${currentMode}`);
      }
      
      // Toggle mode: FREE -> LOCK, LOCK -> FREE
      const newMode = currentMode === 'FREE' ? 'LOCK' : 'FREE';
      console.log(`🟦 [ARRANGE] Toggling mode: ${currentMode} → ${newMode} for group: ${finalGroupId}`);
      
      // Update mode in graph structure (if group exists)
      // CRITICAL: Deep clone to avoid mutating the original graph
      const updatedGraph = JSON.parse(JSON.stringify(currentGraph));
      if (groupNode) {
        const updatedGroupNode = findNodeInGraph(updatedGraph, finalGroupId);
        if (updatedGroupNode) {
          // CRITICAL: Ensure group structure is preserved (data.isGroup and children)
          // Don't just set mode - ensure all group properties are preserved
          if (!updatedGroupNode.data) {
            updatedGroupNode.data = {};
          }
          updatedGroupNode.data.isGroup = true; // Ensure isGroup flag is set
          // Ensure children array exists (it should, but be safe)
          if (!Array.isArray(updatedGroupNode.children)) {
            console.warn(`🟦 [ARRANGE] Group ${finalGroupId} missing children array! Restoring from original.`);
            updatedGroupNode.children = groupNode.children || [];
          }
          console.log(`🟦 [ARRANGE] Updated group ${finalGroupId} mode to ${newMode} in domain graph`, {
            hasIsGroup: updatedGroupNode.data.isGroup === true,
            hasChildren: Array.isArray(updatedGroupNode.children) && updatedGroupNode.children.length > 0,
            childrenCount: updatedGroupNode.children?.length || 0
          });
        } else {
          console.warn(`🟦 [ARRANGE] Group ${finalGroupId} not found in updated graph!`);
        }
      }
      
      // Check if group has children (only if we found the group)
      // CRITICAL: Even if group has no children, we still need to update ReactFlow for mode change
      if (groupNode && (!groupNode.children || groupNode.children.length === 0)) {
        console.warn('🟦 [ARRANGE] Group has no children to arrange, but still updating mode');
        // Still update the mode change - need to update ReactFlow too!
        rawGraphRef.current = updatedGraph;
        if (!viewStateRef.current.layout) viewStateRef.current.layout = {};
        viewStateRef.current.layout[finalGroupId] = { mode: newMode };
        
        // CRITICAL: Update ReactFlow nodes to reflect mode change even for empty groups
        const viewStateWithNewMode = {
          ...viewStateRef.current,
          layout: {
            ...viewStateRef.current.layout,
            [finalGroupId]: { mode: newMode }
          }
        };
        viewStateRef.current = viewStateWithNewMode;
        
        const { convertViewStateToReactFlow } = await import('../../core/renderer/ViewStateToReactFlow');
        const { nodes, edges } = convertViewStateToReactFlow(updatedGraph, viewStateWithNewMode);
        
        // CRITICAL: Preserve selection state of the group
        const currentNodes = reactFlowRef.current?.getNodes() || [];
        const currentlySelectedGroup = currentNodes.find(n => (n.id === finalGroupId || n.id === groupId) && n.selected);
        const wasSelected = !!currentlySelectedGroup;
        
        // CRITICAL: Verify group is still a group
        const groupNodeInResult = nodes.find(n => n.id === finalGroupId || n.id === groupId);
        if (groupNodeInResult && groupNodeInResult.type !== 'draftGroup') {
          console.error(`🟦 [ARRANGE] ⚠️ CRITICAL: Empty group ${finalGroupId} lost its group type! Type is: ${groupNodeInResult.type}, expected: draftGroup`);
          groupNodeInResult.type = 'draftGroup';
          groupNodeInResult.data = { ...groupNodeInResult.data, isGroup: true };
        }
        
        // CRITICAL: Preserve selection state
        if (wasSelected && groupNodeInResult) {
          groupNodeInResult.selected = true;
          console.log('🟦 [ARRANGE] Preserving group selection state');
        }
        
        setNodes(nodes);
        setEdges(edges);
        setRawGraph(updatedGraph, 'user');
        console.log('🟦 [ARRANGE] Empty group mode updated to:', newMode);
        return;
      }
      
      // CRITICAL FIX: Update mode in ViewState.layout BEFORE any rendering
      // This ensures the mode is available when converting to ReactFlow
      if (!viewStateRef.current.layout) {
        viewStateRef.current.layout = {};
      }
      
      // NEW: Lock this group and all descendants when locking
      let viewStateWithNewMode = viewStateRef.current;
      if (newMode === 'LOCK') {
        const { lockScopeAndDescendants } = await import('../../core/orchestration/handlers/mode/lockScopeAndDescendants');
        viewStateWithNewMode = lockScopeAndDescendants(finalGroupId, updatedGraph, viewStateRef.current);
        viewStateRef.current = viewStateWithNewMode;
        
        // Update domain graph modes recursively
        const setModeRecursive = (node: any) => {
          if (node.children && node.children.length > 0) {
            node.mode = 'LOCK';
            node.children.forEach(setModeRecursive);
          }
        };
        const groupNodeForMode = findNodeInGraph(updatedGraph, finalGroupId);
        if (groupNodeForMode) {
          setModeRecursive(groupNodeForMode);
        }
      } else {
        viewStateRef.current.layout[finalGroupId] = { mode: newMode };
        viewStateWithNewMode = {
          ...viewStateRef.current,
          layout: {
            ...viewStateRef.current.layout,
            [finalGroupId]: { mode: newMode }
          }
        };
      }
      
      // Only run ELK if setting to LOCK (arranging)
      if (newMode !== 'LOCK') {
        // FREE mode: Update refs directly (bypasses useElkToReactflowGraphConverter)
        rawGraphRef.current = updatedGraph;
        viewStateRef.current = viewStateWithNewMode;
        
        // CRITICAL: Update ReactFlow nodes directly to reflect mode change
        // This ensures the button state updates immediately
        const { convertViewStateToReactFlow } = await import('../../core/renderer/ViewStateToReactFlow');
        const { nodes, edges } = convertViewStateToReactFlow(updatedGraph, viewStateWithNewMode);
        
        // CRITICAL: Preserve selection state of the group
        const currentNodes = reactFlowRef.current?.getNodes() || [];
        const currentlySelectedGroup = currentNodes.find(n => (n.id === finalGroupId || n.id === groupId) && n.selected);
        const wasSelected = !!currentlySelectedGroup;
        
        // CRITICAL: Verify mode is in the converted nodes before setting them
        const groupNodeInResult = nodes.find(n => n.id === finalGroupId || n.id === groupId);
        console.log('🟦 [ARRANGE] FREE mode - Converting to ReactFlow - group node mode:', {
          groupId: finalGroupId,
          nodeId: groupNodeInResult?.id,
          modeInData: groupNodeInResult?.data?.mode,
          modeInViewState: viewStateWithNewMode.layout?.[finalGroupId]?.mode,
          expectedMode: newMode,
          wasSelected
        });
        
        // CRITICAL: Preserve selection state
        if (wasSelected && groupNodeInResult) {
          groupNodeInResult.selected = true;
          console.log('🟦 [ARRANGE] Preserving group selection state for FREE mode');
        }
        
        setNodes(nodes);
        setEdges(edges);
        
        console.log('🟦 [ARRANGE] FREE mode set, ReactFlow nodes updated with mode:', newMode);
        console.log('🟦 [ARRANGE] ViewState layout mode:', viewStateWithNewMode.layout[finalGroupId]);
        return;
      }
      
      // Run ELK layout on the group scope directly
      // resolveElkScope will find the group or highest locked ancestor
      const elkScope = resolveElkScope(finalGroupId, updatedGraph, viewStateWithNewMode);
      
      if (!elkScope) {
        console.warn('🟦 [ARRANGE] No ELK scope resolved, but running anyway on groupId:', finalGroupId);
        // Still try to run ELK on the groupId directly
      }
      
      const scopeToUse = elkScope || finalGroupId;
      console.log('[🎯COORD] handleArrangeGroup - starting ELK layout:', { 
        originalGroup: finalGroupId, 
        resolvedScope: scopeToUse,
        groupAbsolutePos: viewStateRef.current.group?.[finalGroupId] 
          ? `${viewStateRef.current.group[finalGroupId].x},${viewStateRef.current.group[finalGroupId].y}`
          : 'none',
        newMode,
        graphHasGroup: !!groupNode
      });
      
      // CRITICAL: Use updatedGraph (with mode set) and viewStateWithNewMode
      // This ensures ELK runs on everything inside the group
      const delta = await runScopeLayout(scopeToUse, updatedGraph, viewStateWithNewMode, {});
      
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
      const updatedViewState = mergeViewState(viewStateWithNewMode, delta);
      
      // CRITICAL: Ensure mode is preserved in merged ViewState
      if (!updatedViewState.layout) {
        updatedViewState.layout = {};
      }
      updatedViewState.layout[finalGroupId] = { mode: newMode };
      
      // CRITICAL: Double-check that scope group dimensions are preserved after merge
      // This is a safeguard against mergeViewState overwriting with incorrect values
      const originalScopeGeom = viewStateRef.current?.group?.[finalGroupId];
      if (originalScopeGeom && updatedViewState.group?.[finalGroupId]) {
        const mergedScopeGeom = updatedViewState.group[finalGroupId];
        // If merged dimensions don't match original, force preserve original
        if (mergedScopeGeom.w !== originalScopeGeom.w || mergedScopeGeom.h !== originalScopeGeom.h) {
          console.warn(`[🔍 ELK-DEBUG] ⚠️ Scope group dimensions changed during merge! Preserving original:`, {
            original: { w: originalScopeGeom.w, h: originalScopeGeom.h },
            merged: { w: mergedScopeGeom.w, h: mergedScopeGeom.h },
            fixing: true
          });
          updatedViewState.group[finalGroupId] = {
            ...mergedScopeGeom,
            w: originalScopeGeom.w,
            h: originalScopeGeom.h
          };
        }
        // Also preserve position if it changed
        if (mergedScopeGeom.x !== originalScopeGeom.x || mergedScopeGeom.y !== originalScopeGeom.y) {
          console.warn(`[🔍 ELK-DEBUG] ⚠️ Scope group position changed during merge! Preserving original:`, {
            original: { x: originalScopeGeom.x, y: originalScopeGeom.y },
            merged: { x: mergedScopeGeom.x, y: mergedScopeGeom.y },
            fixing: true
          });
          updatedViewState.group[finalGroupId] = {
            ...updatedViewState.group[finalGroupId],
            x: originalScopeGeom.x,
            y: originalScopeGeom.y
          };
        }
      }
      
      viewStateRef.current = updatedViewState;
      
      // CRITICAL: Verify mode is set correctly
      console.log('🟦 [ARRANGE] Mode after merge:', {
        groupId: finalGroupId,
        modeInViewState: updatedViewState.layout?.[finalGroupId]?.mode,
        expectedMode: newMode,
        allLayoutModes: Object.entries(updatedViewState.layout || {}).map(([id, layout]: [string, any]) => ({ id, mode: layout.mode }))
      });
      
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
      
      // CRITICAL: Mode is already updated in ViewState.layout (done before ELK)
      // Just ensure it's persisted in the updated ViewState
      if (!updatedViewState.layout) {
        updatedViewState.layout = {};
      }
      updatedViewState.layout[finalGroupId] = { mode: newMode };
      
      // Update refs with mode change and ELK results
      // Note: Don't write mode to domain graph - mode lives in ViewState.layout only
      rawGraphRef.current = updatedGraph;
      viewStateRef.current = updatedViewState;
      
      // Render directly - bypasses ELK hook (ELK already ran above)
      const { convertViewStateToReactFlow } = await import('../../core/renderer/ViewStateToReactFlow');
      const { nodes, edges } = convertViewStateToReactFlow(updatedGraph, updatedViewState);
      
      // CRITICAL: Preserve selection state of the group
      const currentNodes = reactFlowRef.current?.getNodes() || [];
      const currentlySelectedGroup = currentNodes.find(n => (n.id === finalGroupId || n.id === groupId) && n.selected);
      const wasSelected = !!currentlySelectedGroup;
      
      // CRITICAL: Verify group is still a group (type should be 'draftGroup', not 'custom')
      const groupNodeInResult = nodes.find(n => n.id === finalGroupId || n.id === groupId);
      console.log('🟦 [ARRANGE] Converting to ReactFlow - group node verification:', {
        groupId: finalGroupId,
        nodeId: groupNodeInResult?.id,
        type: groupNodeInResult?.type,
        isGroup: groupNodeInResult?.data?.isGroup,
        modeInData: groupNodeInResult?.data?.mode,
        modeInViewState: updatedViewState.layout?.[finalGroupId]?.mode,
        expectedMode: newMode,
        expectedType: 'draftGroup',
        wasSelected
      });
      
      // CRITICAL: Verify the group is still recognized as a group
      if (groupNodeInResult && groupNodeInResult.type !== 'draftGroup') {
        console.error(`🟦 [ARRANGE] ⚠️ CRITICAL: Group ${finalGroupId} lost its group type! Type is: ${groupNodeInResult.type}, expected: draftGroup`);
        // Force it to be a group
        groupNodeInResult.type = 'draftGroup';
        groupNodeInResult.data = { ...groupNodeInResult.data, isGroup: true };
      }
      
      // CRITICAL: Preserve selection state
      if (wasSelected && groupNodeInResult) {
        groupNodeInResult.selected = true;
        console.log('🟦 [ARRANGE] Preserving group selection state for LOCK mode');
      }
      
      setNodes(nodes);
      setEdges(edges);
      
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
      draftGroup: DraftGroupNode, // Used for groups to avoid ReactFlow's built-in group behavior
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

  // CRITICAL: Always use rawGraphRef.current (source of truth for FREE mode) 
  // instead of rawGraph React state which may be stale, especially after deletions
  // FREE mode handlers update rawGraphRef.current directly, not React state
  // CRITICAL: Re-read rawGraphRef.current to ensure we have the latest state (it may have been updated by Orchestrator)
  const graphToSave = rawGraphRef.current;
  if (!graphToSave) return;

  // CRITICAL FIX: Ensure graph structure matches rendered nodes
  // If nodes are empty but graph has children, the graph is stale (e.g., after deletion)
  // Only save if the graph matches what's actually rendered, OR if we're explicitly clearing
  // BUT: During ELK layout, nodes might not be rendered yet, so allow saving if graph has content
  const graphNodeCount = graphToSave.children?.length || 0;
  const renderedNodeCount = nodes.length;
  
  // DEBUG: Log graph state for deletion debugging
  if (graphNodeCount === 0 && renderedNodeCount > 0) {
    console.log('💾 [PERSISTENCE] Deletion detected - graph empty, nodes still rendering:', {
      graphNodeCount,
      renderedNodeCount,
      graphChildren: graphToSave.children?.map((c: any) => c.id) || []
    });
  }
  
  // CRITICAL: Get latest edges directly from ReactFlow instance to ensure we have ELK data
  // The `edges` dependency might be stale, so read fresh from ReactFlow
  // Fallback to edges prop if ReactFlow instance isn't available yet
  const latestEdges = (reactFlowRef.current && typeof reactFlowRef.current.getEdges === 'function')
    ? reactFlowRef.current.getEdges()
    : edges;
  
  // CRITICAL: Check if edges have ELK data - if they do, we MUST save even if node counts don't match
  // This ensures ELK waypoints are persisted before the node count check blocks saving
  const edgesWithElkData = latestEdges.filter((e: any) => {
    const edgeData = e.data || {};
    return edgeData.routingMode === 'LOCK' && edgeData.elkStartPoint && edgeData.elkEndPoint;
  });
  const hasEdgesWithElkData = edgesWithElkData.length > 0;
  
  // If there's a mismatch, don't save stale data
  // Exception 1: Allow saving empty state (0 nodes, 0 graph children) for resetCanvas
  // Exception 2: Allow saving if graph has content but nodes aren't rendered yet (ELK layout in progress)
  // Exception 3: CRITICAL - Always save if edges have ELK data (must persist waypoints before they're lost!)
  // Exception 4: CRITICAL - Allow saving when graph is empty but nodes might still be rendering (deletion in progress)
  if (graphNodeCount !== renderedNodeCount && !hasEdgesWithElkData) {
    // Graph and rendered nodes don't match
    if (graphNodeCount === 0 && renderedNodeCount === 0) {
      // Both are empty - this is valid (after resetCanvas or deletion)
      // Continue to save empty state
    } else if (graphNodeCount === 0 && renderedNodeCount > 0) {
      // Graph is empty but nodes still rendering - deletion in progress
      // CRITICAL: Save empty state to persist deletion (otherwise nodes will reappear on refresh)
      console.log('💾 [PERSISTENCE] Graph is empty but nodes still rendering (deletion in progress) - saving empty state to persist deletion');
    } else if (graphNodeCount > 0 && renderedNodeCount === 0) {
      // Graph has content but nodes aren't rendered yet - likely ELK layout in progress
      // Allow saving to prevent data loss during layout
      console.log('⚠️ [PERSISTENCE] Graph has content but nodes not rendered yet (ELK layout in progress) - saving anyway');
    } else {
      // Mismatch - don't save stale data (unless edges have ELK data)
      console.warn('⚠️ [PERSISTENCE] Skipping save - graph structure mismatch:', {
        graphChildren: graphNodeCount,
        renderedNodes: renderedNodeCount
      });
    return;
    }
  }
  
  // CRITICAL: If edges have ELK data, log it for debugging
  if (hasEdgesWithElkData) {
    console.log(`💾 [PERSISTENCE] Saving ${edgesWithElkData.length} edges with ELK data to preserve waypoints`);
  }

  const hasContent = nodes.length > 0 || latestEdges.length > 0;
  
  // If no content, we still save to persist the empty state (important for resetCanvas)
  // But ensure the graph structure matches (already checked above)

  try {
    // CRITICAL: Only save if edges have ELK data OR if we have content
    // This prevents saving empty/incomplete state during initial load
    if (latestEdges.length > 0 && !hasEdgesWithElkData && latestEdges.length < 5) {
      // Edges exist but don't have ELK data yet - might be mid-layout
      // Only skip if we have very few edges (might be incomplete)
      // If we have many edges, they might be in FREE mode (which is valid)
      const edgesInFreeMode = latestEdges.filter((e: any) => e.data?.routingMode === 'FREE').length;
      if (edgesInFreeMode === 0) {
        // No FREE mode edges and no ELK data - likely still loading
        console.log('⏳ [PERSISTENCE] Edges exist but no ELK data yet - waiting for ELK layout to complete');
        return;
      }
    }
    
    // Use latest edges for snapshot (they have ELK data)
    const viewStateSnapshot = getViewStateSnapshot(latestEdges);
    
    // Verify that edge data was actually saved
    const savedEdgeCount = Object.keys(viewStateSnapshot?.edge || {}).length;
    if (latestEdges.length > 0 && savedEdgeCount === 0) {
      console.warn('⚠️ [PERSISTENCE] WARNING: Edges exist but none were saved to ViewState snapshot!', {
        edgesCount: latestEdges.length,
        edgesWithElkData: edgesWithElkData.length,
        sampleEdge: latestEdges[0]?.id,
        sampleEdgeData: latestEdges[0]?.data ? {
          routingMode: latestEdges[0].data.routingMode,
          hasElkStart: !!latestEdges[0].data.elkStartPoint,
          hasElkEnd: !!latestEdges[0].data.elkEndPoint
        } : 'no_data'
      });
    }
    
    // CRITICAL: Use deep copy to preserve nested modes (shallow copy loses nested mutations)
    const rawGraphCopy = JSON.parse(JSON.stringify(graphToSave));
    
    const payload = {
      rawGraph: viewStateSnapshot ? { ...rawGraphCopy, viewState: viewStateSnapshot } : rawGraphCopy,
      viewState: viewStateSnapshot,
      selectedArchitectureId,
      timestamp: Date.now(), // Use 'timestamp' to match saveCanvasSnapshot format
    };
    
    
    const serialized = JSON.stringify(payload);
    localStorage.setItem(LOCAL_CANVAS_SNAPSHOT_KEY, serialized);
    sessionStorage.setItem(LOCAL_CANVAS_SNAPSHOT_KEY, serialized);
    
    // DEBUG: Log what we saved for deletion debugging
    const savedNodeCount = graphToSave.children?.length || 0;
    if (savedNodeCount === 0) {
      console.log('✅ [PERSISTENCE] Saved empty state (0 nodes) to localStorage - deletion persisted');
    } else {
      console.log(`💾 [PERSISTENCE] Saved ${savedNodeCount} nodes to localStorage:`, graphToSave.children?.map((c: any) => c.id) || []);
    }
    
    if (hasEdgesWithElkData) {
      console.log(`✅ [PERSISTENCE] Saved ${savedEdgeCount} edges (${edgesWithElkData.length} with ELK data) to localStorage`);
    }
    
    if (markDirty && typeof markDirty === 'function') {
    markDirty();
    }
  } catch (error) {
    console.warn("⚠️ Failed to persist local canvas snapshot:", error);
  }
}, [nodes, edges, getViewStateSnapshot, selectedArchitectureId, markDirty]); // Removed rawGraph dependency - always use rawGraphRef.current

  
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
    agentInstruction,
    selectedNodeIds: selectedNodeIds || []  // Pass selected nodes for AI targeting
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
        const viewStateSnapshot = sanitizeStoredViewState(externalViewState || getViewStateSnapshot(edges));
        const graphWithViewState = viewStateSnapshot ? { ...elkGraph, viewState: viewStateSnapshot } : elkGraph;

        setSavedArchitectures(prev => prev.map(arch => 
          arch.id === targetArchitectureId 
            ? { ...arch, rawGraph: graphWithViewState, viewState: viewStateSnapshot, lastModified: new Date() }
            : arch
        ));
      }
      
      // Update global currentGraph for chat agent - always keep it in sync
      (window as any).currentGraph = elkGraph;
      console.log('📊 Updated global currentGraph for chat agent:', elkGraph ? `${elkGraph.children?.length || 0} nodes` : 'none');
      
      // Also update global selections for chat agent context
      (window as any).selectedNodeIds = selectedNodeIds || [];
      (window as any).selectedEdgeIds = selectedEdges?.map(e => e.id) || [];
      
      // Select first group after agent draws (if going from empty to first architecture)
      if (source === 'FunctionExecutor' && reason === 'agent-update' && shouldUpdateCanvas) {
        const wasEmptyBefore = !rawGraph?.children?.length || rawGraph.children.length === 0;
        const hasContentNow = elkGraph?.children?.length > 0;
        
        if (wasEmptyBefore && hasContentNow) {
          // Find the first group (or first node if no groups)
          const firstChild = elkGraph.children?.[0];
          if (firstChild) {
            // Check if it's a group (has children) or a node
            const isGroup = firstChild.children && firstChild.children.length > 0;
            if (isGroup) {
              console.log('🎯 Selecting first drawn group:', firstChild.id);
              // Select the first group
              setTimeout(() => {
                setSelectedNodeIds([firstChild.id]);
                // Also update ReactFlow selection
                setNodes((nds) => nds.map(n => ({
                  ...n,
                  selected: n.id === firstChild.id
                })));
              }, 100); // Small delay to ensure graph is rendered
            }
          }
        }
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
            const viewStateSnapshot = externalViewState || getViewStateSnapshot(edges);
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
 
    // CRITICAL: Don't process selection if clicking on UI elements (chat, buttons, etc.)
    // Check active element and recent click target - use capture phase to catch early
    const activeElement = document.activeElement as HTMLElement;
    const target = activeElement || (window as any).lastClickTarget;
    
    if (target) {
      // Check if click is on chat box, chat input, or any UI element
      // Check element itself first, then ancestors
      const isUIClick = 
                       // Check element directly
                       (target.getAttribute && target.getAttribute('data-chatbox') === 'true') ||
                       (target.getAttribute && target.getAttribute('data-chat-input') === 'true') ||
                       (target.getAttribute && target.getAttribute('data-ui-element') === 'true') ||
                       target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.tagName === 'BUTTON' ||
                       // Check ancestors
                       target.closest('[data-chatbox="true"]') ||
                       target.closest('[data-chat-input="true"]') ||
                       target.closest('[data-ui-element="true"]') ||
                       target.closest('.chatbox') ||
                       target.closest('[class*="Chatbox"]') ||
                       target.closest('input[type="text"]') ||
                       target.closest('textarea') ||
                       target.closest('button:not(.react-flow__controls-button)') ||
                       target.closest('[role="textbox"]') ||
                       target.closest('[data-testid*="chat"]') ||
                       target.closest('[class*="chat"]') ||
                       target.closest('[id*="chat"]') ||
                       // Check for RightPanelChat
                       target.closest('[class*="RightPanelChat"]') ||
                       // Check if it's an input/textarea/button (UI elements)
                       (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') ||
                       // Check for any element with high z-index (UI elements)
                       (target.closest('[style*="z-index"]') && parseInt(getComputedStyle(target.closest('[style*="z-index"]') as HTMLElement)?.zIndex || '0') > 10000);
      
      if (isUIClick) {
        console.log('🚫 Ignoring selection change - click on UI element:', target);
        return; // Don't process selection change if clicking on UI
      }
    }
    
    // Also check if the click originated from a UI element by checking event path
    // This catches cases where ReactFlow processes the click before our checks
    if (params.event?.target) {
      const eventTarget = params.event.target as HTMLElement;
      const isEventUIClick = 
                            (eventTarget.getAttribute && eventTarget.getAttribute('data-chatbox') === 'true') ||
                            (eventTarget.getAttribute && eventTarget.getAttribute('data-chat-input') === 'true') ||
                            (eventTarget.getAttribute && eventTarget.getAttribute('data-ui-element') === 'true') ||
                            eventTarget.tagName === 'INPUT' ||
                            eventTarget.tagName === 'TEXTAREA' ||
                            eventTarget.tagName === 'BUTTON' ||
                            eventTarget.closest('[data-chatbox="true"]') ||
                            eventTarget.closest('[data-chat-input="true"]') ||
                            eventTarget.closest('[data-ui-element="true"]') ||
                            eventTarget.closest('.chatbox') ||
                            eventTarget.closest('[class*="Chatbox"]') ||
                            eventTarget.closest('[class*="RightPanelChat"]') ||
                            eventTarget.closest('[class*="chat"]') ||
                            eventTarget.closest('[id*="chat"]');
      
      if (isEventUIClick) {
        console.log('🚫 Ignoring selection change - event target is UI element:', eventTarget);
      return;
      }
    }
    
    // Additional check: if we have selected nodes and the click is on chatbox area, prevent deselection
    if (selectedNodes.length > 0) {
      // Check if click is anywhere in the chatbox container area
      const chatboxElement = document.querySelector('[data-chatbox="true"]');
      if (chatboxElement && (target?.closest === chatboxElement || target === chatboxElement || chatboxElement.contains(target as Node))) {
        console.log('🚫 Preventing deselection - click in chatbox area while nodes are selected');
        return; // Don't process selection change - keep current selection
      }
    }
 
    // Allow selection when using arrow tool
    // Also allow when box tool is active (for auto-selection of newly added nodes)
    // Only prevent when connector tool is actively connecting
    if (selectedTool === 'connector' && (params.nodes?.length > 0 || params.edges?.length > 0)) {
      return; // Prevent selection during active connection
    }
 
    // Update global selections for chat agent context
    const nodeIds = params.nodes?.map((n: any) => n.id) || [];
    const edgeIds = params.edges?.map((e: any) => e.id) || [];
    (window as any).selectedNodeIds = nodeIds;
    (window as any).selectedEdgeIds = edgeIds;
 
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
      const newIds = newSelectedNodes.map((n: Node) => n.id);
      // Update global selections for chat agent context
      (window as any).selectedNodeIds = newIds;
      (window as any).selectedEdgeIds = newSelectedEdges.map((e: Edge) => e.id);
      return newIds;
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

  // Track all clicks globally to detect UI element clicks
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      (window as any).lastClickTarget = e.target;
    };
    document.addEventListener('click', handleGlobalClick, true); // Use capture phase
    return () => {
      document.removeEventListener('click', handleGlobalClick, true);
    };
  }, []);

  // Add mousedown handler to pane for immediate deselection (not waiting for mouse up)
  useEffect(() => {
    if (!reactFlowRef.current) return;
    
    const pane = document.querySelector('.react-flow__pane');
    if (!pane) return;
    
    const handlePaneMouseDown = (e: MouseEvent) => {
      // Store click target for selection change handler
      (window as any).lastClickTarget = e.target;
      
      // Only deselect if clicking on pane (not on a node or edge)
      const target = e.target as HTMLElement;
      if (target && target.closest('.react-flow__node')) {
        return; // Don't deselect if clicking on a node
      }
      if (target && target.closest('.react-flow__edge')) {
        return; // Don't deselect if clicking on an edge
      }
      
      // CRITICAL: Don't deselect if clicking on UI elements (chat, buttons, etc.)
      // Check element directly first, then ancestors
      const isUIClick = 
                       // Check element directly
                       (target.getAttribute && target.getAttribute('data-chatbox') === 'true') ||
                       (target.getAttribute && target.getAttribute('data-chat-input') === 'true') ||
                       (target.getAttribute && target.getAttribute('data-ui-element') === 'true') ||
                       target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.tagName === 'BUTTON' ||
                       // Check ancestors
                       target.closest('[data-chatbox="true"]') ||
                       target.closest('[data-chat-input="true"]') ||
                       target.closest('[data-ui-element="true"]') ||
                       target.closest('.chatbox') ||
                       target.closest('input[type="text"]') ||
                       target.closest('textarea') ||
                       target.closest('button:not(.react-flow__controls-button)') ||
                       target.closest('[role="textbox"]') ||
                       target.closest('[data-testid*="chat"]') ||
                       target.closest('[class*="chat"]') ||
                       target.closest('[id*="chat"]') ||
                       target.closest('[class*="RightPanelChat"]') ||
                       // Check if it's an input/textarea/button (UI elements)
                       (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') ||
                       // Check for any element with high z-index (UI elements)
                       (target.closest('[style*="z-index"]') && parseInt(getComputedStyle(target.closest('[style*="z-index"]') as HTMLElement)?.zIndex || '0') > 10000);
      
      if (isUIClick) {
        console.log('🚫 Ignoring pane click - click on UI element');
        return; // Don't deselect if clicking on UI
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
        {/* NOTE: Node creation is handled in ReactFlow's onPaneClick, not here */}
        {useReactFlow && (
          <div 
            className="absolute inset-0 z-0 bg-gray-50"
            style={{ width: '100%', height: '100%', minHeight: '400px' }}
          >
            <NodeInteractionContext.Provider value={nodeInteractionValue}>
            <EdgeRoutingProvider 
              rawGraph={rawGraph} 
              viewState={viewStateRef.current}
            >
            <ReactFlow 
              ref={reactFlowRef}
              nodes={nodes} 
              edges={edges}
              onNodesChange={(changes) => {
                // Debug: Log when onNodesChange is called
                const hasCloudSqlChange = changes.some((ch: any) => ch.id === 'cloud_sql');
                if (hasCloudSqlChange) {
                  console.log('[onNodesChange] Called with cloud_sql change:', changes.filter((ch: any) => ch.id === 'cloud_sql'));
                }
                
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
                
                // FUNDAMENTAL: Update edge routing DURING drag for real-time rerouting
                // This ensures edges rerender immediately when nodes move, not just after drag ends
                // Use position comparison approach: compare current ReactFlow node positions with ViewState
                // This is more reliable than filtering changes since ReactFlow's change structure can vary
                if (reactFlowRef.current && viewStateRef.current) {
                  const currentNodes = reactFlowRef.current.getNodes();
                  const GRID_SIZE = 16;
                  const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;
                  
                  const routingUpdates: Array<{ nodeId: string; geometry: { x: number; y: number; w: number; h: number } }> = [];
                  
                  // Debug: Check if cloud_sql is in currentNodes
                  const hasCloudSql = currentNodes.some(n => n.id === 'cloud_sql');
                  if (!hasCloudSql) {
                    console.log('[onNodesChange] cloud_sql NOT in currentNodes!');
                  }
                  
                  // Find groups that are being dragged (have position changes)
                  const draggedGroupIds = new Set<string>();
                  for (const change of changes) {
                    if (change.type === 'position' && 'id' in change) {
                      const node = currentNodes.find(n => n.id === change.id);
                      if (node && (node.type === 'group' || node.type === 'draftGroup')) {
                        draggedGroupIds.add(change.id);
                      }
                    }
                  }
                  
                  // Find all children of dragged groups (to skip in main loop)
                  const childrenOfDraggedGroups = new Set<string>();
                  if (draggedGroupIds.size > 0 && rawGraphRef.current) {
                    const findChildren = (node: any, isDescendant: boolean) => {
                      if (isDescendant) {
                        childrenOfDraggedGroups.add(node.id);
                      }
                      if (node.children) {
                        for (const child of node.children) {
                          findChildren(child, isDescendant || draggedGroupIds.has(node.id));
                        }
                      }
                    };
                    findChildren(rawGraphRef.current, false);
                  }
                  
                  for (const node of currentNodes) {
                    // Skip children of dragged groups - handleGroupDrag will handle them
                    // This prevents feedback loop: main loop updates → handleGroupDrag adds delta → double movement
                    if (childrenOfDraggedGroups.has(node.id)) {
                      continue;
                    }
                    
                    // Skip recently created nodes (being positioned initially)
                    const createdTime = recentlyCreatedNodesRef.current.get(node.id);
                    if (createdTime && (now - createdTime) < 100) {
                      if (node.id === 'cloud_sql') {
                        console.log(`[onNodesChange] Skipping cloud_sql - recently created (age=${now - createdTime}ms)`);
                      }
                      continue;
                    }
                    
                    if (node.id === 'cloud_sql') {
                      console.log(`[onNodesChange] Processing cloud_sql`);
                    }
                    
                    const isGroup = node.type === 'group' || node.type === 'draftGroup';
                    // Use positionAbsolute for absolute coordinates (works for both top-level and nested nodes)
                    // CRITICAL: If positionAbsolute is undefined, compute it from position + parent position
                    let absoluteX: number;
                    let absoluteY: number;
                    
                    if ((node as any).positionAbsolute) {
                      absoluteX = snap((node as any).positionAbsolute.x);
                      absoluteY = snap((node as any).positionAbsolute.y);
                    } else if (node.parentNode) {
                      // Compute absolute position from relative position + parent position
                      const parentNode = currentNodes.find(n => n.id === node.parentNode);
                      const parentAbsPos = (parentNode as any)?.positionAbsolute || parentNode?.position || { x: 0, y: 0 };
                      absoluteX = snap(parentAbsPos.x + node.position.x);
                      absoluteY = snap(parentAbsPos.y + node.position.y);
                    } else {
                      // Top-level node without positionAbsolute - use position as absolute
                      absoluteX = snap(node.position.x);
                      absoluteY = snap(node.position.y);
                    }
                    
                    // Get current geometry from ViewState
                    const existingGeom = isGroup 
                      ? viewStateRef.current.group?.[node.id]
                      : viewStateRef.current.node?.[node.id];
                    
                    // Debug: Log for cloud_sql
                    if (node.id === 'cloud_sql') {
                      console.log(`[onNodesChange:cloud_sql] existingGeom:`, existingGeom, `computed:`, { absoluteX, absoluteY });
                    }
                    
                    // Skip if position hasn't changed (within grid snapping tolerance)
                    if (existingGeom && existingGeom.x === absoluteX && existingGeom.y === absoluteY) {
                      if (node.id === 'cloud_sql') {
                        console.log(`[onNodesChange:cloud_sql] SKIPPED - position unchanged`);
                      }
                      continue;
                    }
                    
                    const geometry = {
                      x: absoluteX,
                      y: absoluteY,
                      w: existingGeom?.w ?? (node.width || 96),
                      h: existingGeom?.h ?? (node.height || 96),
                    };
                    
                    // Update ViewState immediately (source of truth)
                    if (isGroup) {
                      if (!viewStateRef.current.group) viewStateRef.current.group = {};
                      viewStateRef.current.group[node.id] = geometry;
                    } else {
                      if (!viewStateRef.current.node) viewStateRef.current.node = {};
                      viewStateRef.current.node[node.id] = geometry;
                    }
                    
                    // Debug: Log updates for cloud_sql
                    if (node.id === 'cloud_sql') {
                      console.log(`[onNodesChange] Updating cloud_sql ViewState:`, geometry);
                    }
                    
                    routingUpdates.push({ nodeId: node.id, geometry });
                  }
                  
                  // Trigger routing update immediately for real-time edge rerouting
                  // Skip if handleGroupDrag will handle it (to avoid duplicate updates)
                  const hasGroups = routingUpdates.some(u => {
                    const node = currentNodes.find(n => n.id === u.nodeId);
                    return node && (node.type === 'group' || node.type === 'draftGroup');
                  });
                  
                  // Only handle regular nodes here; groups are handled by handleGroupDrag below
                  const regularNodeUpdates = routingUpdates.filter(u => {
                    const node = currentNodes.find(n => n.id === u.nodeId);
                    return node && node.type !== 'group' && node.type !== 'draftGroup';
                  });
                  
                  if (regularNodeUpdates.length > 0) {
                    batchUpdateObstaclesAndReroute(regularNodeUpdates);
                    // Dispatch event so StepEdge can re-read ViewState
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('viewstate-updated', { 
                        detail: { nodeIds: regularNodeUpdates.map(u => u.nodeId) }
                      }));
                    }
                  }
                }
                      
                // Check for containment after nodes are updated
                
                // Debug: Log condition check
                const conditionMet = selectedTool !== 'box' && reactFlowRef.current;
                console.log(`[onNodesChange] Containment check condition: selectedTool=${selectedTool}, hasReactFlowRef=${!!reactFlowRef.current}, conditionMet=${conditionMet}`);
                
                if (selectedTool !== 'box' && reactFlowRef.current) {
                  // Use requestAnimationFrame to check after ReactFlow has updated
                  requestAnimationFrame(() => {
                    console.log(`[onNodesChange] Inside requestAnimationFrame callback`);
                    const currentNodes = reactFlowRef.current?.getNodes() || [];
                    // Track which nodes were actually dragged by the user (from position changes)
                    const userDraggedNodeIds = changes
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
                    const movedNodes = userDraggedNodeIds;
                    
                    // All drag logic is in DragReparentHandler (isolated module)
                    const currentGraph = rawGraphRef.current || rawGraph;
                    
                    const reparentResult = handleDragReparent({
                      movedNodeIds: movedNodes,
                      currentNodes,
                      currentGraph: currentGraph || { id: 'root', children: [], edges: [] },
                    viewStateRef,
                      setNodes,
                      setSelectedNodes,
                      setSelectedNodeIds
                    });
                    
                    // FREE MODE: Update ref directly, DO NOT call setRawGraph
                    // setRawGraph goes through useElkToReactflowGraphConverter which we bypass for FREE mode
                    if (reparentResult.graphUpdated && reparentResult.updatedGraph) {
                      rawGraphRef.current = reparentResult.updatedGraph;
                      // NO setRawGraph call - FREE mode bypasses the ELK hook entirely
                    }
                    
                    // Check if any LOCK mode groups are being dragged - unlock on FIRST drag frame
                    // Don't require dragging flag - ReactFlow may not always set it
                    const positionChanges = changes.filter(ch => ch.type === 'position' && 'position' in ch);
                    
                    // Debug: Log position changes for groups
                    const groupChanges = positionChanges.filter(ch => {
                      const node = currentNodes.find(n => n.id === (ch as any).id);
                      return node && (node.type === 'group' || node.type === 'draftGroup');
                    });
                    
                    const draggedLockGroups = positionChanges
                      .map(ch => currentNodes.find(n => n.id === (ch as any).id))
                      .filter(node => 
                        node &&
                        (node.type === 'group' || node.type === 'draftGroup') &&
                        node.data?.mode === 'LOCK'
                      ) as Node[];
                    
                    // Unlock LOCK mode groups on drag start (first frame)
                    if (draggedLockGroups.length > 0) {
                      (async () => {
                        for (const group of draggedLockGroups) {
                          // Skip if already unlocked during this drag
                          if (unlockedDuringDragRef.current.has(group.id)) {
                            continue;
                          }
                          
                          try {
                            const { findHighestContainingGroup } = await import('../../core/orchestration/handlers/mode/domainUtils');
                            const highestGroupId = findHighestContainingGroup(currentGraph, group.id);
                            
                            if (highestGroupId && !unlockedDuringDragRef.current.has(highestGroupId)) {
                              unlockedDuringDragRef.current.add(highestGroupId);
                              
                              // Get current selection before unlock
                              const currentSelection = reactFlowRef.current?.getNodes().filter(n => n.selected).map(n => n.id) || [];
                              // Trigger unlock - this will update ViewState and set routingMode=FREE
                              await apply({
                                kind: 'free-structural',
                                source: 'user',
                                payload: {
                                  action: 'unlock-scope-to-free',
                                  scopeGroupId: highestGroupId,
                                  reason: 'drag-start',
                                  preserveSelection: currentSelection
                                }
                              });
                            }
                          } catch (error) {
                            console.error(`[🔄 UNLOCK] Error unlocking group ${group.id}:`, error);
                          }
                        }
                      })();
                    }
                    
                    // Handle group drag - updates ViewState for children
                    const groupResults = handleGroupDrag(changes, currentNodes, viewStateRef, rawGraphRef);
                    
                    // Track children that were updated by handleGroupDrag
                    // These are already correctly positioned in ViewState - don't update again
                    const childrenUpdatedByDrag = new Set<string>();
                    const nodesToUpdate: Array<{ id: string; position: { x: number; y: number } }> = [];
                    
                    for (const result of groupResults) {
                      for (const childPos of result.childPositions) {
                        childrenUpdatedByDrag.add(childPos.id);
                        // CRITICAL: Update ReactFlow nodes so they actually move visually
                        nodesToUpdate.push({ id: childPos.id, position: { x: childPos.x, y: childPos.y } });
                      }
                    }
                    
                    // CRITICAL: Actually update ReactFlow nodes with new positions
                    // This is what makes nodes visually move when groups are dragged
                    if (nodesToUpdate.length > 0 && setNodes) {
                      // CRITICAL: Mark these nodes as updated BEFORE calling setNodes
                      // This prevents the next onNodesChange from updating them again
                      const updatedNodeIds = new Set(nodesToUpdate.map(u => u.id));
                      (window as any).__childrenUpdatedByGroupDrag = new Set([
                        ...(childrenUpdatedByDrag),
                        ...updatedNodeIds
                      ]);
                      
                      setNodes((nds) => {
                        return nds.map((node) => {
                          const update = nodesToUpdate.find((u) => u.id === node.id);
                          if (update) {
                            return {
                              ...node,
                              position: update.position,
                              // CRITICAL: Also update positionAbsolute for ReactFlow's internal calculations
                              positionAbsolute: update.position,
                            };
                          }
                          return node;
                        });
                      });
                    } else {
                      // Store on window so the main onNodesChange loop can skip these
                      (window as any).__childrenUpdatedByGroupDrag = childrenUpdatedByDrag;
                    }
                    
                    // Dispatch event so edges can re-route with new child positions
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('viewstate-updated', {
                        detail: { source: 'group-drag' }
                      }));
                    }
                  });
                }
              }}
              onEdgesChange={onEdgesChange}
              onNodeDragStart={(event, node) => {
                // Initialize tracking for groups so first frame of drag has correct delta
                const isGroup = node.type === 'group' || node.type === 'draftGroup';
                if (isGroup) {
                  // Use ViewState position if available, otherwise use ReactFlow position
                  const existingGeom = viewStateRef.current?.group?.[node.id];
                  const position = existingGeom 
                    ? { x: existingGeom.x, y: existingGeom.y }
                    : node.position;
                  initializeDragTracking(node.id, position);
                }
              }}
              onNodeDragStop={(event, node) => {
                // FREE MODE: Update ViewState on drag end (per FIGJAM_REFACTOR.md)
                // NOTE: For groups, children are ALREADY updated DURING drag by handleGroupDrag
                // This just finalizes the group position and clears tracking
                const GRID_SIZE = 16;
                const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;
                
                // Get existing geometry for dimensions
                const existingGeom = viewStateRef.current?.node?.[node.id] || 
                                     viewStateRef.current?.group?.[node.id];
                
                const isGroup = node.type === 'group' || node.type === 'draftGroup';
                
                // Get absolute position - ReactFlow position is ALWAYS absolute during drag
                const absoluteX = snap(node.position.x);
                const absoluteY = snap(node.position.y);
                
                const geometry = {
                  x: absoluteX,
                  y: absoluteY,
                  w: existingGeom?.w ?? (node.data as any)?.width ?? (node.style as any)?.width ?? 96,
                  h: existingGeom?.h ?? (node.data as any)?.height ?? (node.style as any)?.height ?? 96,
                };
                
                // Update ViewState directly
                if (!viewStateRef.current) {
                  viewStateRef.current = { node: {}, group: {}, edge: {} };
                }
                
                // For groups: finalize position and clear tracking
                // NOTE: Children were ALREADY updated DURING drag by handleGroupDrag
                // DO NOT recalculate delta here - handleGroupDrag already did it correctly
                if (isGroup) {
                  if (!viewStateRef.current.group) {
                    viewStateRef.current.group = {};
                  }
                  viewStateRef.current.group[node.id] = geometry;
                  // Remove from node if it was there
                  if (viewStateRef.current.node?.[node.id]) {
                    delete viewStateRef.current.node[node.id];
                  }
                  clearDragTracking(node.id);
                          } else {
                  if (!viewStateRef.current.node) {
                    viewStateRef.current.node = {};
                  }
                  viewStateRef.current.node[node.id] = geometry;
                }
                
                // Clear unlock tracking on drag end
                unlockedDuringDragRef.current.clear();
                
                // CRITICAL: Trigger final reroute after drag ends
                // This ensures edges route to final node positions
                // Use requestAnimationFrame to ensure StepEdge has re-rendered with new routingMode
                // before we trigger reroute (edges need to be registered with libavoid first)
                requestAnimationFrame(() => {
                  setTimeout(async () => {
                    const { batchUpdateObstaclesAndReroute } = await import('../../utils/canvas/routingUpdates');
                    
                    // Collect ALL node geometries for final reroute
                    const allUpdates: Array<{ nodeId: string; geometry: { x: number; y: number; w: number; h: number } }> = [];
                    
                    if (viewStateRef.current) {
                      // Add all nodes
                      for (const [nodeId, geom] of Object.entries(viewStateRef.current.node || {})) {
                        allUpdates.push({
                          nodeId,
                          geometry: { x: geom.x, y: geom.y, w: geom.w || 96, h: geom.h || 96 }
                        });
                      }
                      // Add all groups
                      for (const [groupId, geom] of Object.entries(viewStateRef.current.group || {})) {
                        allUpdates.push({
                          nodeId: groupId,
                          geometry: { x: geom.x, y: geom.y, w: geom.w || 480, h: geom.h || 320 }
                        });
                      }
                    }
                    
                    if (allUpdates.length > 0) {
                      batchUpdateObstaclesAndReroute(allUpdates);
                    }
                  }, 50); // Small delay to ensure React has re-rendered StepEdge with new routingMode
                });
              }}
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
                
                // CRITICAL: Don't handle pane clicks if clicking on UI elements (chatbox, etc.)
                const target = event?.target as HTMLElement;
                if (target) {
                  // Check element directly first, then ancestors
                  const isUIClick = 
                                   // Check element directly
                                   (target.getAttribute && target.getAttribute('data-chatbox') === 'true') ||
                                   (target.getAttribute && target.getAttribute('data-chat-input') === 'true') ||
                                   target.tagName === 'INPUT' || 
                                   target.tagName === 'TEXTAREA' || 
                                   target.tagName === 'BUTTON' ||
                                   // Check ancestors
                                   target.closest('[data-chatbox="true"]') ||
                                   target.closest('[data-chat-input="true"]') ||
                                   target.closest('.chatbox') ||
                                   target.closest('input[type="text"]') ||
                                   target.closest('textarea') ||
                                   target.closest('button:not(.react-flow__controls-button)') ||
                                   target.closest('[role="textbox"]') ||
                                   target.closest('[data-testid*="chat"]') ||
                                   target.closest('[class*="chat"]') ||
                                   target.closest('[id*="chat"]') ||
                                   target.closest('[class*="RightPanelChat"]') ||
                                   target.closest('[class*="Chatbox"]') ||
                                   (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON');
                  
                  if (isUIClick) {
                    console.log('🚫 Ignoring pane click - click on UI element (chatbox, etc.)');
                    return; // Don't process pane click if clicking on UI
                  }
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
                  
                  // Use CoordinateService to snap to grid
                  const snappedCenter = CoordinateService.snapPoint(projected);
                  const NODE_SIZE = 96;
                  const half = NODE_SIZE / 2;
                  const topLeft = { x: snappedCenter.x - half, y: snappedCenter.y - half };
                  const id = `user-node-${Date.now()}`;

                  // Write position to ViewState first (before domain mutation)
                  try {
                    if (viewStateRef && viewStateRef.current) {
                      const vs = viewStateRef.current;
                      vs.node = vs.node || {};
                      vs.node[id] = { x: topLeft.x, y: topLeft.y, w: NODE_SIZE, h: NODE_SIZE };
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

                // Handle box tool - create node on pane click
                if (selectedTool === 'box') {
                  // Create the node (this will set selected: true in addNode handler)
                  placeNodeOnCanvas(
                    event.nativeEvent as MouseEvent,
                    selectedTool,
                    reactFlowRef,
                    handleAddNode,
                    viewStateRef,
                    async (next, nodeId) => {
                      if (!nodeId) return;
                      
                      // Switch tool to arrow first
                      setSelectedTool(next);
                      
                      // Wait for ReactFlow to render the node, then manually select it
                      // This ensures both ReactFlow state AND our React state are updated
                      // Increase delay to ensure node is fully rendered before selection
                      await new Promise(resolve => setTimeout(resolve, 200));
                      
                      if (reactFlowRef.current) {
                        // Use ReactFlow's setNodes to ensure selection is recognized
                        reactFlowRef.current.setNodes((nds) => {
                          return nds.map(node => 
                            node.id === nodeId 
                              ? { ...node, selected: true }
                              : { ...node, selected: false }
                          );
                        });
                        
                        // Manually trigger selection change to update our React state
                        // This ensures selectedNodes state is updated so dots appear
                        const nodes = reactFlowRef.current.getNodes();
                        const newNode = nodes.find(n => n.id === nodeId);
                        if (newNode) {
                          handleSelectionChange({ nodes: [{ ...newNode, selected: true }], edges: [] });
                        }
                      }
                    },
                    null,
                    apply // Pass Orchestrator apply function
                  );
                  return;
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
            </EdgeRoutingProvider>
            </NodeInteractionContext.Provider>
          </div>
        )}
        
        {/* SVG container - only show when in SVG mode */}
        {!useReactFlow && (
          <div 
            ref={svgContainerRef}
            className="absolute inset-0 h-full w-full z-0 overflow-hidden bg-gray-50"
            style={{
              transform: `scale(${svgZoom || 1}) translate(${svgPan?.x || 0}px, ${svgPan?.y || 0}px)`,
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
        <div className="flex-none min-h-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg z-[10005] relative" style={{ pointerEvents: 'auto' }} data-chatbox="true">
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
          showElkDomainGraph={showElkDomainGraph}
          setShowElkDomainGraph={setShowElkDomainGraph}
          rightPanelCollapsed={rightPanelCollapsed}
          onTriggerLayout={() => {
            // Force full ELK layout recalculation by:
            // 1. Clearing ViewState geometry so ELK recalculates all positions
            // 2. Using source='ai' to ensure ELK runs (even without LOCK groups)
            // 3. Creating a new graph reference to trigger the layout effect
            viewStateRef.current = { node: {}, group: {}, edge: {} };
            const syncedGraph = structuredClone(rawGraph);
            // Add a tiny timestamp to force structural hash change
            (syncedGraph as any)._layoutTrigger = Date.now();
            setRawGraph(syncedGraph, 'ai');
          }}
        />
      )}

      {/* ELK Debug Panel */}
      <ElkDebugProvider onTriggerLayout={() => {
        // Force full ELK layout recalculation by:
        // 1. Clearing ViewState geometry so ELK recalculates all positions
        // 2. Using source='ai' to ensure ELK runs (even without LOCK groups)
        // 3. Creating a new graph reference to trigger the layout effect
        viewStateRef.current = { node: {}, group: {}, edge: {} };
        const syncedGraph = structuredClone(rawGraph);
        // Add a tiny timestamp to force structural hash change
        (syncedGraph as any)._layoutTrigger = Date.now();
        setRawGraph(syncedGraph, 'ai');
      }}>
        <ElkDebugPanel
          isVisible={showElkDebug || false}
          onClose={() => setShowElkDebug(false)}
        />
      </ElkDebugProvider>
      
      {/* Share Overlay for Embedded Version */}
      <ShareOverlay
        state={shareOverlay}
        onClose={() => setShareOverlay({ show: false, url: '' })}
        onCopy={(ok) => setShareOverlay(prev => ({ ...prev, copied: ok }))}
      />
      {/* Input Overlay - Matching Share Dialog Design */}
      <PromptModal
        show={inputOverlay?.show || false}
        title={inputOverlay?.title || ''}
                  placeholder={inputOverlay?.placeholder || ''}
                defaultValue={inputOverlay?.defaultValue || ''}
        onConfirm={inputOverlay?.onConfirm || (() => {})}
        onCancel={inputOverlay?.onCancel || (() => {})}
      />

      {/* Delete Overlay - Matching Share Dialog Design */}
      <ConfirmModal
        show={deleteOverlay?.show || false}
        title={deleteOverlay?.title || ''}
        message={deleteOverlay?.message || ''}
        onConfirm={deleteOverlay?.onConfirm || (() => {})}
        onCancel={deleteOverlay?.onCancel || (() => {})}
      />


      {/* ELK SVG View - Toggleable */}
      {showElkDomainGraph && (
      <div className="fixed bottom-4 right-4 w-96 h-96 bg-white border border-gray-300 rounded-lg shadow-xl flex flex-col overflow-hidden" style={{ zIndex: 99999, pointerEvents: 'auto', position: 'fixed' }}>
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
      )}

      {/* Notification Overlay - Matching Share Dialog Design */}
      <NotificationModal
        show={notification?.show || false}
        title={notification?.title || ''}
        message={notification?.message || ''}
        type={notification?.type || 'info'}
        onConfirm={() => setNotification(prev => prev ? ({ ...prev, show: false }) : null)}
        onCancel={() => setNotification(prev => prev ? ({ ...prev, show: false }) : null)}
        confirmText={notification?.confirmText || "OK"}
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
          showDebugButton={showDebugButton}
          onDebugClick={() => setShowDev(true)}
          viewStateRef={viewStateRef}
        />
      </div>
    </div>
  );
}

export default InteractiveCanvas;
