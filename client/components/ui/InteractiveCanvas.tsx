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
import { Timestamp } from "firebase/firestore"
import { Settings, PanelRightOpen, PanelRightClose, Save, Edit, Share } from "lucide-react"
import { DEFAULT_ARCHITECTURE as EXTERNAL_DEFAULT_ARCHITECTURE } from "../../data/defaultArchitecture"
import { SAVED_ARCHITECTURES } from "../../data/savedArchitectures"
import SaveAuth from "../auth/SaveAuth"
import ArchitectureService from "../../services/architectureService"
import { anonymousArchitectureService } from "../../services/anonymousArchitectureService"
import { SharingService } from "../../services/sharingService"
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
  isPublicMode = false,
}) => {
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
    const mockArchs = Object.values(SAVED_ARCHITECTURES).sort((a, b) => (b.createdAt || b.timestamp).getTime() - (a.createdAt || a.timestamp).getTime());
    return [newArchTab, ...mockArchs];
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
    console.log('🎯 Agent targeting architecture:', targetArchitectureId, agentLockedArchitectureId ? '(LOCKED)' : '(following selection)');
  }, [selectedArchitectureId, agentLockedArchitectureId]);
  
  // State for auth flow
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingArchitectures, setIsLoadingArchitectures] = useState(false);

  // Enhanced Firebase sync with cleanup
  const syncWithFirebase = useCallback(async (userId: string) => {
    // Don't load architectures in public mode
    if (isPublicMode) {
      console.log('🔒 Public mode - skipping Firebase sync');
      return;
    }
    
    let timeoutId: NodeJS.Timeout;
    
    try {
      console.log('🔄 Syncing with Firebase for user:', userId);
      console.log('🔄 Setting loading state to true');
      setIsLoadingArchitectures(true);
      
      // Add timeout to prevent infinite loading
      timeoutId = setTimeout(() => {
        console.warn('⚠️ Firebase sync timeout - forcing loading state to false');
        setIsLoadingArchitectures(false);
      }, 10000); // 10 second timeout
      
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
        }).map(arch => {
          // Safe timestamp conversion with error protection
          const safeTimestamp = (() => {
            try {
              // Check if it's a Firebase Timestamp with seconds/nanoseconds
              if (arch.timestamp?.seconds !== undefined) {
                return new Date(arch.timestamp.seconds * 1000 + (arch.timestamp.nanoseconds || 0) / 1000000);
              }
              // Check if it has toDate method
              if (arch.timestamp?.toDate) {
                return arch.timestamp.toDate();
              }
              // Check if it's already a Date
              if (arch.timestamp instanceof Date) {
                return arch.timestamp;
              }
              // Try to parse as string/number
              if (arch.timestamp) {
                const converted = new Date(arch.timestamp);
                if (!isNaN(converted.getTime())) {
                  return converted;
                }
              }
              // Fallback to current time
              return new Date();
            } catch (e) {
              return new Date();
            }
          })();
          
          const safeCreatedAt = (() => {
            try {
              // Check if it's a Firebase Timestamp with seconds/nanoseconds
              if (arch.createdAt?.seconds !== undefined) {
                return new Date(arch.createdAt.seconds * 1000 + (arch.createdAt.nanoseconds || 0) / 1000000);
              }
              // Check if it has toDate method
              if (arch.createdAt?.toDate) {
                return arch.createdAt.toDate();
              }
              // Check if it's already a Date
              if (arch.createdAt instanceof Date) {
                return arch.createdAt;
              }
              // Try to parse as string/number
              if (arch.createdAt) {
                const converted = new Date(arch.createdAt);
                if (!isNaN(converted.getTime())) {
                  return converted;
                }
              }
              // Fallback to timestamp
              return safeTimestamp;
            } catch (e) {
              console.warn(`❌ CreatedAt conversion failed for ${arch.name}:`, e);
              return safeTimestamp;
            }
          })();
          
          const safeLastModified = (() => {
            try {
              // Check if it's a Firebase Timestamp with seconds/nanoseconds
              if (arch.lastModified?.seconds !== undefined) {
                return new Date(arch.lastModified.seconds * 1000 + (arch.lastModified.nanoseconds || 0) / 1000000);
              }
              if (arch.lastModified?.toDate) return arch.lastModified.toDate();
              if (arch.lastModified instanceof Date) return arch.lastModified;
              if (arch.lastModified) {
                const converted = new Date(arch.lastModified);
                if (!isNaN(converted.getTime())) return converted;
              }
              return safeTimestamp; // Fallback to timestamp
            } catch (e) {
              return safeTimestamp;
            }
          })();
          
          return {
            id: arch.id,
            firebaseId: arch.id, // Keep Firebase ID for updates
            name: arch.name,
            timestamp: safeTimestamp,
            createdAt: safeCreatedAt,
            lastModified: safeLastModified,
            rawGraph: arch.rawGraph,
            userPrompt: (arch as any).userPrompt || '',
            isFromFirebase: true
          };
        });
        
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
        
        // Check for priority architecture (transferred from anonymous session)
        const priorityArchId = localStorage.getItem('priority_architecture_id');
        let finalValidArchs = sortedValidArchs;
        let foundPriorityArch = null; // Track if we found and processed the priority architecture
        
        if (priorityArchId) {
          console.log('📌 Checking for priority architecture:', priorityArchId);
          console.log('📌 DEBUG: Available Firebase architectures:', sortedValidArchs.map(arch => ({id: arch.id, name: arch.name})));
          const priorityArchIndex = sortedValidArchs.findIndex(arch => arch.id === priorityArchId);
          
          if (priorityArchIndex >= 0) {
            console.log('✅ Found priority architecture, moving to top');
            const priorityArch = sortedValidArchs[priorityArchIndex];
            console.log('✅ DEBUG: Priority architecture details:', {id: priorityArch.id, name: priorityArch.name});
            finalValidArchs = [
              priorityArch,
              ...sortedValidArchs.filter(arch => arch.id !== priorityArchId)
            ];
            
            foundPriorityArch = priorityArch;
            // Clear the priority flag after using it
            localStorage.removeItem('priority_architecture_id');
            console.log('🧹 Cleared priority architecture flag');
          } else {
            console.log('⚠️ Priority architecture not found in initial results, fetching directly...');
            console.log('⚠️ DEBUG: Looking for ID:', priorityArchId, 'in:', sortedValidArchs.map(arch => arch.id));
            
            // Try to fetch the priority architecture directly (with small delay for Firebase consistency)
            try {
              // Small delay to handle potential Firebase consistency issues
              await new Promise(resolve => setTimeout(resolve, 500));
              
              const priorityArch = await ArchitectureService.getArchitectureById(priorityArchId);
              if (priorityArch) {
                console.log('✅ Found priority architecture via direct fetch:', priorityArch.name);
                finalValidArchs = [
                  priorityArch,
                  ...sortedValidArchs
                ];
                
                foundPriorityArch = priorityArch;
                // Clear the priority flag after using it
                localStorage.removeItem('priority_architecture_id');
                console.log('🧹 Cleared priority architecture flag');
              } else {
                console.log('❌ Priority architecture not found even with direct fetch');
                // Keep the priority flag for potential retry
                console.log('🔄 Keeping priority flag for potential retry');
              }
            } catch (error) {
              console.error('❌ Error fetching priority architecture:', error);
              // Keep the priority flag for potential retry
              console.log('🔄 Keeping priority flag for potential retry');
            }
          }
        }
        
        const allArchs = [newArchTab, ...finalValidArchs, ...sortedMockArchs];
        setSavedArchitectures(allArchs);
        
        console.log(`✅ Loaded ${validArchs.length} valid architectures from Firebase`);
        console.log(`📊 Total architectures: ${allArchs.length} (${validArchs.length} Firebase + ${mockArchs.length} mock)`);
        
        // DEBUG: Log current tab order and timestamps (with error protection)
        console.log('🔍 Current tab order:', allArchs.map((arch, index) => {
          let createdAtStr = 'null';
          let timestampStr = 'null';
          
          try {
            if (arch.createdAt) {
              createdAtStr = new Date(arch.createdAt).toISOString();
            }
          } catch (e) {
            createdAtStr = `invalid(${arch.createdAt})`;
          }
          
          try {
            if (arch.timestamp) {
              timestampStr = new Date(arch.timestamp).toISOString();
            }
          } catch (e) {
            timestampStr = `invalid(${arch.timestamp})`;
          }
          
          return `${index + 1}. ${arch.name} (${arch.id}) - createdAt: ${createdAtStr}, timestamp: ${timestampStr}`;
        }));
        
        // If current selection is invalid, reset to "New Architecture"
        if (selectedArchitectureId && !allArchs.some(arch => arch.id === selectedArchitectureId)) {
          console.warn(`⚠️ Selected architecture ${selectedArchitectureId} not found, resetting to New Architecture`);
          setSelectedArchitectureId('new-architecture');
        }
        
        // Check if we should auto-select a priority architecture or stay on New Architecture
        if (foundPriorityArch) {
          console.log('✅ User signed in - will auto-select transferred architecture after state update:', foundPriorityArch.id, foundPriorityArch.name);
          // Set a flag to select this architecture after the state updates
          setPendingArchitectureSelection(foundPriorityArch.id);
        } else {
          console.log('✅ User signed in - staying on New Architecture tab for fresh start');
          
          // FORCE selection to "New Architecture" to ensure no auto-selection happens
          if (selectedArchitectureId !== 'new-architecture') {
            console.log('🔄 Forcing selection back to New Architecture tab after sign-in');
            setSelectedArchitectureId('new-architecture');
          }
        }
      }
    } catch (error) {
      console.error('❌ Failed to sync with Firebase:', error);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      console.log('🔄 Setting loading state to false');
      setIsLoadingArchitectures(false);
    }
  }, [selectedArchitectureId, isPublicMode]);

  // Track when we just created an architecture to prevent immediate re-sync
  const [justCreatedArchId, setJustCreatedArchId] = useState<string | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [hasInitialSync, setHasInitialSync] = useState(false);

  // Sync Firebase architectures ONLY when user changes (not when tabs change)
  useEffect(() => {
    console.log('🔄 useEffect triggered - user:', user?.uid, 'justCreatedArchId:', justCreatedArchId, 'hasInitialSync:', hasInitialSync);
    if (user?.uid && !hasInitialSync) {
      // Don't sync immediately after creating an architecture
      if (!justCreatedArchId) {
        // Clear any existing timeout
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }
        
        // Only sync once when user signs in
        console.log('🚀 Initial sync for user:', user.uid);
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
        // Only show mock architectures when not in public mode and not loading
        const mockArchs = Object.values(SAVED_ARCHITECTURES).sort((a, b) => (b.createdAt || b.timestamp).getTime() - (a.createdAt || a.timestamp).getTime());
        setSavedArchitectures([newArchTab, ...mockArchs]);
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
        
        // Set the selected architecture ID directly
        setSelectedArchitectureId(pendingArchitectureSelection);
        
        // Manually load the architecture content to ensure it's displayed
        if (targetArch.rawGraph) {
          console.log('📂 Manually loading transferred architecture content:', targetArch.name);
          
          // Use typed event system for architecture loading
          dispatchElkGraph({
            elkGraph: assertRawGraph(targetArch.rawGraph, 'PendingSelection'),
            source: 'PendingSelection',
            reason: 'transferred-architecture-load'
          });
        } else {
          console.warn('⚠️ Target architecture has no rawGraph data');
        }
        
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

  
  // State for StreamViewer visibility
  // const [showStreamViewer, setShowStreamViewer] = useState(false);
  
  // State for current chat name
  const [currentChatName, setCurrentChatName] = useState<string>('New Chat');
  
  // State for manual save
  const [isSaving, setIsSaving] = useState(false);
  
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
          architecture.rawGraph
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
      let clipboardSuccess = false;
      if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(shareUrl);
          clipboardSuccess = true;
          console.log('✅ Sidebar share link copied to clipboard:', shareUrl);
        } catch (clipboardError) {
          console.warn('⚠️ Clipboard failed in sidebar share:', clipboardError.message);
        }
      }
      
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
    console.log('🌐 Current URL:', window.location.href, 'isPublicMode:', isPublicMode);
    
    // In public mode, completely skip Firebase auth monitoring and force clean state
    if (isPublicMode) {
      console.log('🔒 PUBLIC MODE ACTIVE - completely skipping Firebase auth, forcing clean state');
      setUser(null);
      setSidebarCollapsed(true);
      
      // Check if URL contains a shared anonymous architecture ID
      const sharedArchId = anonymousArchitectureService.getArchitectureIdFromUrl();
      if (sharedArchId) {
        console.log('🔗 Loading shared anonymous architecture:', sharedArchId);
        loadSharedAnonymousArchitecture(sharedArchId);
      }
      
      return; // Don't set up any Firebase listeners
    }

    // Only set up auth listener in canvas mode
    if (auth) {
      console.log('🔐 CANVAS MODE ACTIVE - setting up Firebase auth listener');
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        console.log('🔐 Auth state changed:', currentUser ? currentUser.email : 'No user');
        
        // On canvas route, use actual auth state
      setUser(currentUser);
        
        // Auto-open sidebar when user signs in, close when they sign out
      if (currentUser) {
          console.log('👤 User signed in - opening sidebar');
          setSidebarCollapsed(false);
        } else {
          console.log('👤 User signed out - closing sidebar');
          setSidebarCollapsed(true);
      }
    });
    return () => unsubscribe();
    } else {
      console.log('🚫 Firebase auth not available - authentication disabled');
    }
  }, [isPublicMode]);



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

    // Real-time sync: Auto-save current canvas to Firebase when state changes
  const [realtimeSyncId, setRealtimeSyncId] = useState<string | null>(null);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);

  // EMERGENCY: COMPLETELY DISABLED real-time sync to stop infinite Firebase loop
  // This was causing thousands of writes per second: 
  // Graph update → Firebase save → triggers graph change → Firebase save → LOOP!
  useEffect(() => {
    console.log('⚠️ Real-time Firebase sync DISABLED to prevent infinite loops');
    // TODO: Implement proper auto-save with loop prevention later
  }, []);

  // Reset real-time sync when switching away from "New Architecture"
  useEffect(() => {
    if (selectedArchitectureId !== 'new-architecture') {
      setRealtimeSyncId(null);
      setIsRealtimeSyncing(false);
    }
  }, [selectedArchitectureId]);

  // Handle shared architecture URLs (works in both public and canvas mode)
  useEffect(() => {
    // Check if URL contains a shared architecture ID
    const sharedArchId = anonymousArchitectureService.getArchitectureIdFromUrl();
    if (sharedArchId) {
      console.log('🔗 Loading shared architecture from URL:', sharedArchId, isPublicMode ? '(public mode)' : '(canvas mode)');
      
      // Load the shared architecture directly using the service
      (async () => {
        try {
          const sharedArch = await anonymousArchitectureService.loadAnonymousArchitectureById(sharedArchId);
          if (sharedArch) {
            console.log('✅ Loaded shared architecture from URL:', sharedArch.name);
            setRawGraph(sharedArch.rawGraph);
          }
        } catch (error) {
          console.error('❌ Failed to load shared architecture from URL:', error);
        }
      })();
    }
  }, [isPublicMode, setRawGraph]);

  // Load shared anonymous architecture from URL
  const loadSharedAnonymousArchitecture = useCallback(async (architectureId: string) => {
    try {
      const sharedArch = await anonymousArchitectureService.loadAnonymousArchitectureById(architectureId);
      
      if (sharedArch) {
        console.log('✅ Loaded shared anonymous architecture:', sharedArch.name);
        
        // Set the graph to the shared architecture
        setRawGraph(sharedArch.rawGraph);
        
        // Update the architecture name in the UI (optional - could show "Viewing: Architecture Name")
        console.log('🎯 Displaying shared architecture:', sharedArch.name);
      } else {
        console.warn('⚠️ Shared architecture not found or expired');
        // Could show a toast notification here
      }
    } catch (error) {
      console.error('❌ Error loading shared anonymous architecture:', error);
    }
  }, [setRawGraph]);

  // Handler for manual save functionality
  const handleManualSave = useCallback(async () => {
    if (!user) {
      showNotification('error', 'Sign In Required', 'Please sign in to save your architecture');
      return;
    }

    if (!selectedArchitectureId || selectedArchitectureId === 'new-architecture') {
      showNotification('error', 'No Architecture Selected', 'No architecture selected to save');
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
      showNotification('error', 'Save Failed', `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  }, [user, selectedArchitectureId, savedArchitectures, rawGraph, nodes, edges]);

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
          // Generate a name for the architecture
          const architectureName = `Shared Architecture ${new Date().toLocaleDateString()}`;
          
          // Save as anonymous architecture and get shareable ID
          const anonymousId = await anonymousArchitectureService.saveAnonymousArchitecture(
            architectureName,
            rawGraph
          );
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
            let clipboardSuccess = false;
            try {
              await navigator.clipboard.writeText(shareUrl);
              clipboardSuccess = true;
              console.log('✅ Share link copied to clipboard:', shareUrl);
            } catch (clipboardError) {
              console.warn('⚠️ Clipboard failed (document not focused):', clipboardError.message);
            }
            
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
          const anonymousId = await anonymousArchitectureService.saveAnonymousArchitecture(
            `${architecture.name} (Shared)`,
            architecture.rawGraph
          );
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
            let clipboardSuccess = false;
            try {
              await navigator.clipboard.writeText(shareUrl);
              clipboardSuccess = true;
              console.log('✅ User architecture share link copied to clipboard:', shareUrl);
            } catch (clipboardError) {
              console.warn('⚠️ Clipboard failed (document not focused):', clipboardError.message);
            }
            
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
      showNotification('success', 'Architecture Saved', `Architecture saved successfully!\n\nName: ${architectureData.name}\nID: ${savedId}\nNodes: ${architectureData.nodes.length}\nEdges: ${architectureData.edges.length}`);
      
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
    
    // Only update global architecture ID if agent is not locked to another architecture
    if (!agentLockedArchitectureId) {
      (window as any).currentArchitectureId = architectureId;
      console.log('🎯 Updated agent target architecture ID to:', architectureId);
    } else {
      console.log('🔒 Agent is locked to architecture:', agentLockedArchitectureId, '- not retargeting');
    }
    
    // Load the architecture data (prioritize dynamic savedArchitectures over static mock data)
    const architecture = savedArchitectures.find(arch => arch.id === architectureId) ||
                         SAVED_ARCHITECTURES[architectureId];
    
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
  }, [savedArchitectures, agentLockedArchitectureId]);

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
      try {
        const existingArchId = anonymousArchitectureService.getArchitectureIdFromUrl();
        
        if (existingArchId) {
          // Update existing anonymous architecture
          console.log('🔄 Updating existing anonymous architecture:', existingArchId);
          await anonymousArchitectureService.updateAnonymousArchitecture(existingArchId, {
            rawGraph: newGraph,
            timestamp: Timestamp.now()
          });
          console.log('✅ Anonymous architecture updated');
        } else {
          // Create new anonymous architecture
          const architectureName = `Architecture - ${new Date().toLocaleDateString()}`;
          const newArchId = await anonymousArchitectureService.saveAnonymousArchitecture(architectureName, newGraph);
          console.log('✅ New anonymous architecture saved with ID:', newArchId);
        }
      } catch (error) {
        // Check if this is the expected "No document to update" error after architecture transfer
        if (error instanceof Error && error.message?.includes('No document to update')) {
          console.log('ℹ️ Anonymous architecture was already transferred/deleted - this is expected after sign-in');
        } else {
        console.error('❌ Error saving/updating anonymous architecture:', error);
      }
      }
    } else if (isPublicMode && user) {
      console.log('🚫 DEBUG: Skipping anonymous architecture update in handleGraphChange - user is signed in, architecture may have been transferred');
    }
    
    console.groupEnd();
  }, [setRawGraph, rawGraph, user, selectedArchitectureId, savedArchitectures, isPublicMode]);

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
            const existingArchId = anonymousArchitectureService.getArchitectureIdFromUrl();
            
            if (existingArchId) {
              // Update existing anonymous architecture
              console.log('🔄 Updating existing anonymous architecture:', existingArchId);
              await anonymousArchitectureService.updateAnonymousArchitecture(existingArchId, {
                rawGraph: elkGraph,
                timestamp: Timestamp.now()
              });
              console.log('✅ Anonymous architecture updated after AI update');
            } else {
              // Create new anonymous architecture
              const architectureName = `Architecture - ${new Date().toLocaleDateString()}`;
              const newArchId = await anonymousArchitectureService.saveAnonymousArchitecture(architectureName, elkGraph);
              console.log('✅ New anonymous architecture saved after AI update with ID:', newArchId);
            }
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
            const baseChatName = await generateChatName(userPrompt, elkGraph);
            
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
            console.log('⚠️ Firebase auto-save DISABLED to prevent quota exhaustion');
            console.log('📝 Graph updated locally for:', selectedArchitectureId, '- manual save required');
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
      console.log('🔓 UNLOCKING agent - operations complete');
      setAgentLockedArchitectureId(null);
      
      // Clear loading indicators after unlocking (with small delay)
      setTimeout(() => {
        console.log('🧹 Final cleanup - clearing all loading indicators');
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
      
      {/* Architecture Sidebar - Always show collapsed in public mode */}
      <ArchitectureSidebar
        isCollapsed={isPublicMode ? true : sidebarCollapsed}
        onToggleCollapse={!isPublicMode && user ? handleToggleSidebar : undefined}
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

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'ml-0' : 'ml-0'}`}>
        {/* ProcessingStatusIcon with sidebar toggle - Always visible */}
      <div className="absolute top-4 left-4 z-[101]">
            {/* Atelier icon with hover overlay */}
            <div className="relative group">
              <ProcessingStatusIcon onClick={!isPublicMode && sidebarCollapsed && user ? handleToggleSidebar : undefined} />
              {/* Hover overlay - show panel-right-close on hover when sidebar is CLOSED and user is signed in (not in public mode) */}
              {!isPublicMode && sidebarCollapsed && user && (
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



      {/* Save/Edit and Settings buttons - top-right */}
      <div className="absolute top-4 right-4 z-[100] flex gap-2">
        {/* Share Button - Always visible for all users */}
        <button
          onClick={handleShareCurrent}
          disabled={!rawGraph || !rawGraph.children || rawGraph.children.length === 0}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border border-gray-200 hover:shadow-md transition-all duration-200 ${
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
        
        {/* Save Button (only show when signed in and not public mode) or Edit Button (when not signed in or public mode) */}
        {user && !isPublicMode ? (
          <button
            onClick={handleManualSave}
            disabled={isSaving || selectedArchitectureId === 'new-architecture'}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border border-gray-200 hover:shadow-md transition-all duration-200 ${
              isSaving 
                ? 'bg-blue-100 text-blue-600 cursor-not-allowed' 
                : selectedArchitectureId === 'new-architecture'
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
            title={
              isSaving ? 'Saving...' 
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
        ) : (
          (() => {
            // Early return with default config during SSR
            if (typeof window === 'undefined') {
              return (
          <button
                  className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all duration-200"
                  title="Edit in full app"
                >
                  <Edit className="w-4 h-4" />
                  <span className="text-sm font-medium">Edit</span>
                </button>
              );
            }

            // Detect if we're in embedded version vs main site
            const isEmbedded = window.location.hostname === 'archgen-ecru.vercel.app' || 
                              window.location.pathname === '/embed' ||
                              window.parent !== window; // Detect if inside iframe
            
            const urlParams = new URLSearchParams(window.location.search);
            const hasArchitectureId = urlParams.has('arch');
            const isMainSite = window.location.hostname === 'app.atelier-inc.net' || window.location.hostname === 'localhost';
            
            // Debug logging
            console.log('🔍 [BUTTON DEBUG] Detection results:', {
              hostname: window.location.hostname,
              pathname: window.location.pathname,
              isEmbedded,
              isMainSite,
              hasArchitectureId,
              architectureId: urlParams.get('arch'),
              isInIframe: window.parent !== window
            });
            
            // Button configuration based on context
            // Show "Save" on main site, "Edit" in embedded version
            const buttonConfig = isMainSite ? {
              text: 'Save',
              icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>,
              action: 'sign-in', // Trigger profile sign-in
              title: 'Sign in to save'
            } : {
              text: 'Edit',
              icon: <Edit className="w-4 h-4" />,
              action: 'new-tab', // Open new tab to main site
              title: 'Edit in full app'
            };
            
            console.log('🔍 [BUTTON DEBUG] Button config:', buttonConfig);
            
            return (
          <button
            onClick={async () => {
                  console.log('🔄 [BUTTON DEBUG] Button clicked, action:', buttonConfig.action);
                  
                  if (buttonConfig.action === 'new-tab') {
                    // Embedded version: open main site in new tab
              const currentState = {
                elkGraph: rawGraph,
                timestamp: Date.now()
              };
              localStorage.setItem('publicCanvasState', JSON.stringify(currentState));
                    console.log('🔄 [EMBEDDED] Opening main site in new tab...');
                    
                    // Build target URL with architecture ID
                    let targetUrl = 'https://app.atelier-inc.net/';
                    let architectureId = null;
                    
                    // Check if we already have an architecture ID in the URL
                    if (hasArchitectureId) {
                      architectureId = urlParams.get('arch');
                      console.log('🔗 [EMBEDDED] Using existing architecture ID:', architectureId);
                    } else {
                      // No existing ID - we need to save the current architecture to get an ID
                      console.log('💾 [EMBEDDED] Saving current architecture to get shareable ID...');
                      
                      try {
                        // Import the anonymous architecture service
                        const { anonymousArchitectureService } = await import('../../services/anonymousArchitectureService');
                        
                        // Save the current rawGraph as an anonymous architecture
                        architectureId = await anonymousArchitectureService.saveAnonymousArchitecture(
                          'Architecture from Embed',
                          rawGraph
                        );
                        console.log('✅ [EMBEDDED] Saved architecture with ID:', architectureId);
                      } catch (error) {
                        console.error('❌ [EMBEDDED] Failed to save architecture:', error);
                        // Continue without ID if save fails
                      }
                    }
                    
                    // Add architecture ID to URL if we have one
                    if (architectureId) {
                      targetUrl += `?arch=${architectureId}`;
                    }
                    
                    console.log('🔗 [EMBEDDED] Target URL:', targetUrl);
                    window.open(targetUrl, '_blank');
                  } else {
                    // Main site: trigger sign-in via profile button
                    console.log('🔄 [MAIN SITE] Triggering sign-in for save...');
              const saveAuthButton = document.querySelector('.save-auth-dropdown button');
              if (saveAuthButton) {
                      console.log('✅ [MAIN SITE] Found profile button, clicking...');
                (saveAuthButton as HTMLButtonElement).click();
                    } else {
                      console.error('❌ [MAIN SITE] Profile button not found!');
                    }
              }
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all duration-200"
                title={buttonConfig.title}
          >
                {buttonConfig.icon}
                <span className="text-sm font-medium">{buttonConfig.text}</span>
          </button>
            );
          })()
        )}
        


        {/* Profile/Auth - Hidden in embedded version, visible on main site */}
        {(() => {
          // Show SaveAuth during SSR, will be corrected on client-side
          if (typeof window === 'undefined') {
            return <SaveAuth onSave={handleSave} isCollapsed={true} user={user} />;
          }

          const isEmbedded = window.location.hostname === 'archgen-ecru.vercel.app' || 
                            window.location.pathname === '/embed' ||
                            window.parent !== window; // Detect if inside iframe
          
          // Don't show profile button in embedded version
          if (isEmbedded) {
            return null;
          }
          
          return <SaveAuth onSave={handleSave} isCollapsed={true} user={user} />;
        })()}
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
        
        {/* Comprehensive Dev Panel - Contains all developer tools - Hidden in public mode */}
        {showDev && !isPublicMode && (
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
      
      {/* Share Overlay for Embedded Version */}
      {shareOverlay.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" onClick={() => setShareOverlay({ show: false, url: '' })}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {shareOverlay.error ? 'Share Failed' : 'Share Architecture'}
              </h3>
              <button
                onClick={() => setShareOverlay({ show: false, url: '' })}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {shareOverlay.error ? (
              <div className="text-red-600 text-center py-4">
                {shareOverlay.error}
              </div>
            ) : (
              <div>
                <p className="text-gray-600 mb-4">
                  {shareOverlay.copied ? 
                    'Link copied to clipboard! Share this link with others:' : 
                    'Copy this link to share your architecture:'
                  }
                </p>
                <div className="relative mb-4">
                  <div className="bg-gray-50 border rounded-lg p-3 pr-12">
                    <code className="text-sm text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis block">
                      {shareOverlay.url}
                    </code>
                  </div>
                  <button
                    onClick={() => {
                      // Manual copy fallback for embedded version
                      const textArea = document.createElement('textarea');
                      textArea.value = shareOverlay.url;
                      document.body.appendChild(textArea);
                      textArea.select();
                      try {
                        document.execCommand('copy');
                        // Show brief success feedback
                        const btn = document.activeElement as HTMLButtonElement;
                        const originalInner = btn.innerHTML;
                        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
                        setTimeout(() => {
                          btn.innerHTML = originalInner;
                        }, 1000);
                      } catch (err) {
                        console.error('Manual copy failed:', err);
                      }
                      document.body.removeChild(textArea);
                    }}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 text-gray-500 hover:text-gray-700 transition-colors"
                    title="Copy to clipboard"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setCopyButtonState('copying');
                      
                      try {
                        let copySuccess = false;
                        
                        // Try modern clipboard API first (will fail in embedded contexts)
                        try {
                          if (navigator.clipboard && window.isSecureContext) {
                            await navigator.clipboard.writeText(shareOverlay.url);
                            copySuccess = true;
                          }
                        } catch (clipboardError) {
                          console.log('Modern clipboard API failed, trying fallback:', clipboardError);
                        }
                        
                        // Fallback for embedded contexts where clipboard API is blocked
                        if (!copySuccess) {
                          const textArea = document.createElement('textarea');
                          textArea.value = shareOverlay.url;
                          textArea.style.position = 'fixed';
                          textArea.style.top = '0';
                          textArea.style.left = '0';
                          textArea.style.width = '2em';
                          textArea.style.height = '2em';
                          textArea.style.padding = '0';
                          textArea.style.border = 'none';
                          textArea.style.outline = 'none';
                          textArea.style.boxShadow = 'none';
                          textArea.style.background = 'transparent';
                          document.body.appendChild(textArea);
                          textArea.focus();
                          textArea.select();
                          
                          const success = document.execCommand('copy');
                          document.body.removeChild(textArea);
                          
                          if (!success) {
                            throw new Error('execCommand copy failed');
                          }
                          copySuccess = true;
                        }
                        
                        if (copySuccess) {
                          // Show success animation
                          setCopyButtonState('success');
                          setTimeout(() => {
                            setCopyButtonState('idle');
                          }, 1500);
                        } else {
                          throw new Error('All copy methods failed');
                        }
                      } catch (err) {
                        console.error('Copy failed:', err);
                        setCopyButtonState('idle');
                        // Show error feedback to user
                        alert('Copy failed. Please manually select and copy the URL above.');
                      }
                    }}
                    className={`flex-1 px-4 py-2 rounded-full font-medium transition-all duration-200 flex items-center justify-center gap-2
                      ${copyButtonState === 'idle' ? 'bg-black text-white hover:bg-gray-800' : ''}
                      ${copyButtonState === 'copying' ? 'bg-gray-600 text-white scale-95' : ''}
                      ${copyButtonState === 'success' ? 'bg-white text-green-700 border-2 border-green-500 border-opacity-60 scale-105' : ''}
                    `}
                    disabled={copyButtonState !== 'idle'}
                  >
                    {copyButtonState === 'idle' && (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Link
                      </>
                    )}
                    {copyButtonState === 'copying' && (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Copying...
                      </>
                    )}
                    {copyButtonState === 'success' && (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShareOverlay({ show: false, url: '' })}
                    className="px-4 py-2 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input Overlay for Rename */}
      {inputOverlay.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" onClick={inputOverlay.onCancel}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {inputOverlay.title}
              </h3>
              <button
                onClick={inputOverlay.onCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const value = formData.get('inputValue') as string;
              if (value?.trim()) {
                inputOverlay.onConfirm(value.trim());
              }
            }}>
              <div className="mb-4">
                <input
                  type="text"
                  name="inputValue"
                  defaultValue={inputOverlay.defaultValue}
                  placeholder={inputOverlay.placeholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-black text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors font-medium"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={inputOverlay.onCancel}
                  className="px-4 py-2 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Overlay */}
      {deleteOverlay.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" onClick={deleteOverlay.onCancel}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {deleteOverlay.title}
              </h3>
              <button
                onClick={deleteOverlay.onCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600">
                {deleteOverlay.message}
              </p>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={deleteOverlay.onConfirm}
                className="flex-1 bg-black text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors font-medium"
              >
                Delete
              </button>
              <button
                onClick={deleteOverlay.onCancel}
                className="px-4 py-2 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Universal Notification Overlay (replaces all alert/confirm popups) */}
      {notification.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" onClick={() => notification.type !== 'confirm' && hideNotification()}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${
                notification.type === 'success' ? 'text-green-600' :
                notification.type === 'error' ? 'text-red-600' :
                notification.type === 'confirm' ? 'text-orange-600' :
                'text-gray-900'
              }`}>
                {notification.title}
              </h3>
              {notification.type !== 'confirm' && (
                <button
                  onClick={hideNotification}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600 whitespace-pre-line">
                {notification.message}
              </p>
            </div>
            
            <div className="flex gap-2 justify-end">
              {notification.type === 'confirm' ? (
                <>
                  <button
                    onClick={notification.onCancel}
                    className="px-4 py-2 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
                  >
                    {notification.cancelText}
                  </button>
                  <button
                    onClick={notification.onConfirm}
                    className="px-4 py-2 bg-black text-white rounded-full hover:bg-gray-800 transition-colors font-medium"
                  >
                    {notification.confirmText}
                  </button>
                </>
              ) : (
                <button
                  onClick={hideNotification}
                  className="px-4 py-2 bg-black text-white rounded-full hover:bg-gray-800 transition-colors font-medium"
                >
                  {notification.confirmText}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      </div>
    </div>
    </ApiEndpointProvider>
  )
}

export default InteractiveCanvas 