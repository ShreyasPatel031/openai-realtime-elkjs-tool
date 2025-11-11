import { useState, useRef } from 'react';
import { Node, Edge } from 'reactflow';
import { User } from 'firebase/auth';
import { 
  NotificationState, 
  ShareOverlayState, 
  InputOverlayState, 
  DeleteOverlayState,
  createDefaultNotificationState,
  createDefaultShareOverlayState,
  createDefaultInputOverlayState,
  createDefaultDeleteOverlayState
} from '../utils/canvasModals';
import { ViewState } from '../utils/canvasPersistence';

export interface SavedArchitecture {
  id: string;
  name: string;
  timestamp: Date;
  rawGraph: any;
  userPrompt?: string;
  firebaseId?: string;
  isFromFirebase?: boolean;
  viewState?: any;
  isFromUrl?: boolean;
  chatMessages?: any[];
}

export function useCanvasState() {
  // DevPanel and UI state
  const [showDev, setShowDev] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  
  // Architecture management state
  const [savedArchitectures, setSavedArchitectures] = useState<SavedArchitecture[]>(() => {
    // Start with "New Architecture" as first tab
    return [{
      id: 'new-architecture',
      name: 'New Architecture',
      timestamp: new Date(),
      rawGraph: { id: "root", children: [], edges: [] },
      userPrompt: '',
      isNew: true
    }];
  });
  const [selectedArchitectureId, setSelectedArchitectureId] = useState<string>('new-architecture');
  const [pendingArchitectureSelection, setPendingArchitectureSelection] = useState<string | null>(null);
  const [agentLockedArchitectureId, setAgentLockedArchitectureId] = useState<string | null>(null);
  
  // Authentication state
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingArchitectures, setIsLoadingArchitectures] = useState(false);
  const [urlArchitectureProcessed, setUrlArchitectureProcessed] = useState(false);
  
  // Sync and save state
  const [justCreatedArchId, setJustCreatedArchId] = useState<string | null>(null);
  const [hasInitialSync, setHasInitialSync] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [realtimeSyncId, setRealtimeSyncId] = useState<string | null>(null);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Chat and UI state
  const [currentChatName, setCurrentChatName] = useState<string>('New Architecture');
  const [agentBusy, setAgentBusy] = useState(false);
  
  // Modal states
  const [shareOverlay, setShareOverlay] = useState<ShareOverlayState>(createDefaultShareOverlayState());
  const [copyButtonState, setCopyButtonState] = useState<'idle' | 'copying' | 'success'>('idle');
  const [inputOverlay, setInputOverlay] = useState<InputOverlayState>(createDefaultInputOverlayState());
  const [deleteOverlay, setDeleteOverlay] = useState<DeleteOverlayState>(createDefaultDeleteOverlayState());
  const [notification, setNotification] = useState<NotificationState>(createDefaultNotificationState());
  
  // Architecture operations tracking
  const [architectureOperations, setArchitectureOperations] = useState<Record<string, boolean>>({});
  
  // Canvas tool and interaction state
  const [selectedTool, setSelectedTool] = useState<"select" | "box" | "connector" | "group">("select");
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<Edge[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  
  // Visualization state
  const [useReactFlow, setUseReactFlow] = useState(true);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [svgZoom, setSvgZoom] = useState(1);
  const [svgPan, setSvgPan] = useState({ x: 0, y: 0 });
  const [showElkDebug, setShowElkDebug] = useState(false);
  
  // Connection state for edge creation
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectingFromHandle, setConnectingFromHandle] = useState<string | null>(null);
  const [connectionMousePos, setConnectionMousePos] = useState<{ x: number; y: number } | null>(null);
  
  // Refs for state management
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const viewStateRef = useRef<ViewState | undefined>(undefined);
  const isHydratingRef = useRef<boolean>(false);
  const expectedHydratedNodeCountRef = useRef<number>(0);
  const hydratedArchitectureIdRef = useRef<string | null>(null);
  const dirtySinceRef = useRef<number | null>(null);
  const remoteSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const restoredFromSnapshotRef = useRef<boolean>(false);
  const pendingSelectionRef = useRef<{ id: string; size?: { width: number; height: number } } | null>(null);
  
  return {
    // State values
    showDev,
    sidebarCollapsed,
    savedArchitectures,
    selectedArchitectureId,
    pendingArchitectureSelection,
    agentLockedArchitectureId,
    user,
    isLoadingArchitectures,
    urlArchitectureProcessed,
    justCreatedArchId,
    hasInitialSync,
    isSaving,
    saveSuccess,
    realtimeSyncId,
    isRealtimeSyncing,
    isSyncing,
    currentChatName,
    agentBusy,
    shareOverlay,
    copyButtonState,
    inputOverlay,
    deleteOverlay,
    notification,
    architectureOperations,
    selectedTool,
    selectedNodes,
    selectedEdges,
    selectedNodeIds,
    useReactFlow,
    svgContent,
    svgZoom,
    svgPan,
    showElkDebug,
    connectingFrom,
    connectingFromHandle,
    connectionMousePos,
    
    // State setters
    setShowDev,
    setSidebarCollapsed,
    setSavedArchitectures,
    setSelectedArchitectureId,
    setPendingArchitectureSelection,
    setAgentLockedArchitectureId,
    setUser,
    setIsLoadingArchitectures,
    setUrlArchitectureProcessed,
    setJustCreatedArchId,
    setHasInitialSync,
    setIsSaving,
    setSaveSuccess,
    setRealtimeSyncId,
    setIsRealtimeSyncing,
    setIsSyncing,
    setCurrentChatName,
    setAgentBusy,
    setShareOverlay,
    setCopyButtonState,
    setInputOverlay,
    setDeleteOverlay,
    setNotification,
    setArchitectureOperations,
    setSelectedTool,
    setSelectedNodes,
    setSelectedEdges,
    setSelectedNodeIds,
    setUseReactFlow,
    setSvgContent,
    setSvgZoom,
    setSvgPan,
    setShowElkDebug,
    setConnectingFrom,
    setConnectingFromHandle,
    setConnectionMousePos,
    
    // Refs
    syncTimeoutRef,
    viewStateRef,
    isHydratingRef,
    expectedHydratedNodeCountRef,
    hydratedArchitectureIdRef,
    dirtySinceRef,
    remoteSaveTimeoutRef,
    restoredFromSnapshotRef,
    pendingSelectionRef,
  };
}
