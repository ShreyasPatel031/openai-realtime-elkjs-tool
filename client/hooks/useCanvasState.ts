import { useState, useRef, useEffect } from 'react';
import type { Node, Edge } from 'reactflow';

type Tool = 'select' | 'box' | 'connector' | 'group' | 'arrow' | 'hand';

export function useCanvasState(params?: any): any {
  const [svgPan, setSvgPan] = useState({ x: 0, y: 0 });
  const [svgZoom, setSvgZoom] = useState(1);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [showDev, setShowDev] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [savedArchitectures, setSavedArchitectures] = useState<any[]>([]);
  const [selectedArchitectureId, setSelectedArchitectureId] = useState<string | null>(null);
  const [pendingArchitectureSelection, setPendingArchitectureSelection] = useState<string | null>(null);
  const [agentLockedArchitectureId, setAgentLockedArchitectureId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isLoadingArchitectures, setIsLoadingArchitectures] = useState(false);
  const [urlArchitectureProcessed, setUrlArchitectureProcessed] = useState(false);
  const [justCreatedArchId, setJustCreatedArchId] = useState<string | null>(null);
  const [hasInitialSync, setHasInitialSync] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [realtimeSyncId, setRealtimeSyncId] = useState<string | null>(null);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentChatName, setCurrentChatName] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [shareOverlay, setShareOverlay] = useState<any>(null);
  const [copyButtonState, setCopyButtonState] = useState({ copied: false });
  const [inputOverlay, setInputOverlay] = useState<any>(null);
  const [deleteOverlay, setDeleteOverlay] = useState<any>(null);
  const [notification, setNotification] = useState<any>(null);
  const [architectureOperations, setArchitectureOperations] = useState<any>({});
  const [selectedTool, setSelectedTool] = useState<Tool>('arrow');
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<Edge[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [useReactFlow, setUseReactFlow] = useState(true);
  const [showElkDebug, setShowElkDebug] = useState(false);
  
  // Initialize showElkDomainGraph - always default to false on startup
  // Clear any existing localStorage value to ensure it doesn't auto-open
  const showElkDomainGraphInitialValue = (() => {
    if (typeof window !== 'undefined') {
      try {
        // Always clear localStorage on startup to ensure it starts hidden
        localStorage.removeItem('atelier_showElkDomainGraph');
      } catch (error) {
        console.warn('Failed to clear showElkDomainGraph from localStorage:', error);
      }
    }
    return false; // Always default to hidden
  })();
  
  const [showElkDomainGraph, setShowElkDomainGraph] = useState(showElkDomainGraphInitialValue);
  const showElkDomainGraphInitializedRef = useRef(false);
  
  // Persist showElkDomainGraph to localStorage whenever it changes (but not on initial mount)
  useEffect(() => {
    if (!showElkDomainGraphInitializedRef.current) {
      showElkDomainGraphInitializedRef.current = true;
      return; // Skip saving on initial mount
    }
    
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('atelier_showElkDomainGraph', JSON.stringify(showElkDomainGraph));
      } catch (error) {
        console.warn('Failed to save showElkDomainGraph to localStorage:', error);
      }
    }
  }, [showElkDomainGraph]);
  
  // Initialize showDebugButton from localStorage, default to true
  // Use null initially to prevent flash, then set from localStorage
  const [showDebugButton, setShowDebugButton] = useState<boolean | null>(null);
  const showDebugButtonInitializedRef = useRef(false);
  
  // Load initial value from localStorage on mount
  useEffect(() => {
    if (showDebugButton === null && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('atelier_showDebugButton');
        if (stored !== null) {
          setShowDebugButton(JSON.parse(stored));
        } else {
          setShowDebugButton(true); // Default to visible if not set
        }
      } catch (error) {
        console.warn('Failed to load showDebugButton from localStorage:', error);
        setShowDebugButton(true); // Default to visible on error
      }
      showDebugButtonInitializedRef.current = true;
    }
  }, [showDebugButton]);
  
  // Persist showDebugButton to localStorage whenever it changes (but not on initial mount)
  useEffect(() => {
    if (!showDebugButtonInitializedRef.current || showDebugButton === null) {
      return; // Skip saving on initial mount or if not initialized
    }
    
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('atelier_showDebugButton', JSON.stringify(showDebugButton));
      } catch (error) {
        console.warn('Failed to save showDebugButton to localStorage:', error);
      }
    }
  }, [showDebugButton]);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectingFromHandle, setConnectingFromHandle] = useState<string | null>(null);
  const [connectionMousePos, setConnectionMousePos] = useState<{ x: number; y: number } | null>(null);
  
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHydratingRef = useRef(false);
  const expectedHydratedNodeCountRef = useRef(0);
  const hydratedArchitectureIdRef = useRef<string | null>(null);
  const dirtySinceRef = useRef(false);
  const remoteSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const restoredFromSnapshotRef = useRef(false);
  const skipPersistenceRef = useRef(false);
  const pendingSelectionRef = useRef<string[] | null>(null);

  return {
    svgPan, setSvgPan,
    svgZoom, setSvgZoom,
    svgContent, setSvgContent,
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
    showElkDebug, setShowElkDebug,
    showElkDomainGraph, setShowElkDomainGraph,
    showDebugButton, setShowDebugButton,
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
    pendingSelectionRef,
  };
}

