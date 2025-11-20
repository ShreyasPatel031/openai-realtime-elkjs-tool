/**
 * Architecture Sync Service
 * Centralized Firebase architecture synchronization logic
 * Extracted from InteractiveCanvas for better maintainability
 */

import { ArchitectureService } from './architectureService';
import { normalizeChatMessages } from '../utils/chatPersistence';

interface SyncArchitectureOptions {
  userId: string;
  isPublicMode: boolean;
  urlArchitectureProcessed: boolean;
  callback: {
    setIsLoadingArchitectures: (loading: boolean) => void;
    setSavedArchitectures: (archs: any[]) => void;
    setSelectedArchitectureId: (id: string) => void;
    setCurrentChatName: (name: string) => void;
    setRawGraph: (graph: any) => void;
    setPendingArchitectureSelection: (id: string | null) => void;
  };
}

/**
 * Enhanced Firebase sync with cleanup
 * Handles architecture loading, validation, timestamp conversion, and priority management
 */
export async function syncWithFirebase(options: SyncArchitectureOptions): Promise<void> {
  const {
    userId,
    isPublicMode,
    urlArchitectureProcessed,
    callback
  } = options;

  console.log('🔄 [FIREBASE-SYNC] Starting sync with options:', {
    userId,
    isPublicMode,
    urlArchitectureProcessed,
    hasCallback: !!callback
  });

  // Don't load architectures in public mode
  if (isPublicMode) {
    console.log('🔒 [FIREBASE-SYNC] Public mode - skipping Firebase sync');
    return;
  }
  
  // Always sync Firebase architectures, but handle URL architecture processing differently
  if (urlArchitectureProcessed) {
    console.log('🔗 [FIREBASE-SYNC] URL architecture already processed - proceeding with Firebase sync for historical tabs');
  }
  
  let timeoutId: NodeJS.Timeout;
  
  try {
    console.log('🔄 Syncing with Firebase for user:', userId);
    console.log('🔄 Setting loading state to true');
    callback.setIsLoadingArchitectures(true);
    
    // Add timeout to prevent infinite loading
    timeoutId = setTimeout(() => {
      console.warn('⚠️ Firebase sync timeout - forcing loading state to false');
      callback.setIsLoadingArchitectures(false);
    }, 10000); // 10 second timeout
    
    // First, cleanup any invalid architectures
    await ArchitectureService.cleanupInvalidArchitectures(userId);
    
    const firebaseArchs = await ArchitectureService.loadUserArchitectures(userId);
    // Raw Firebase architectures loaded
    
    if (firebaseArchs.length > 0) {
      // Convert Firebase architectures to local format with validation
      const validArchs = firebaseArchs.filter(arch => {
        const isValid = arch && arch.id && arch.name && arch.rawGraph;
        if (!isValid) {
          console.warn('⚠️ Invalid architecture found, skipping:', arch);
        }
        return isValid;
      }).map(arch => {
        return convertFirebaseArch(arch);
      });
      
      // Keep "New Architecture" at top, add Firebase data after
      const newArchTab = {
        id: 'new-architecture',
        name: 'New Architecture',
        timestamp: new Date(),
        rawGraph: { id: "root", children: [], edges: [] },
        isNew: true
      };
      
      // No mock architectures - only real user architectures from Firebase
      const sortedValidArchs = validArchs.sort((a, b) => (b.createdAt || b.timestamp).getTime() - (a.createdAt || a.timestamp).getTime());
      
      // Handle priority architecture (transferred from anonymous session)
      const { finalValidArchs, priorityArchId } = await handlePriorityArchitecture(sortedValidArchs);

      // Only include "New Architecture" tab if user has no existing architectures
      const allArchs = finalValidArchs.length > 0 ? finalValidArchs : [newArchTab];
      callback.setSavedArchitectures(allArchs);

      console.log(`✅ Loaded ${validArchs.length} valid architectures from Firebase`);
      console.log(`📊 Total architectures: ${allArchs.length}`);

      // Log current tab order for debugging
      logTabOrder(allArchs);

      // Handle architecture selection
      await handleArchitectureSelection(allArchs, finalValidArchs, priorityArchId, callback);
    }
  } catch (error) {
    console.error('❌ Failed to sync with Firebase:', error);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    console.log('🔄 Setting loading state to false');
    callback.setIsLoadingArchitectures(false);
  }
}

/**
 * Convert Firebase architecture to local format with safe timestamp handling
 */
function convertFirebaseArch(arch: any) {
  const safeTimestamp = safeTimestampConversion(arch.timestamp);
  const safeCreatedAt = safeTimestampConversion(arch.createdAt) || safeTimestamp;
  const safeLastModified = safeTimestampConversion(arch.lastModified) || safeTimestamp;
  
  return {
    id: arch.id,
    firebaseId: arch.id,
    name: arch.name,
    timestamp: safeTimestamp,
    createdAt: safeCreatedAt,
    lastModified: safeLastModified,
    rawGraph: arch.rawGraph,
    chatMessages: normalizeChatMessages(arch.chatMessages) ?? [],
    userPrompt: arch.userPrompt || '',
    isFromFirebase: true,
    viewState: arch.viewState || null
  };
}

/**
 * Safe timestamp conversion with error protection
 */
function safeTimestampConversion(timestamp: any): Date {
  try {
    // Check if it's a Firebase Timestamp with seconds/nanoseconds
    if (timestamp?.seconds !== undefined) {
      return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
    }
    // Check if it has toDate method
    if (timestamp?.toDate) {
      return timestamp.toDate();
    }
    // Check if it's already a Date
    if (timestamp instanceof Date) {
      return timestamp;
    }
    // Try to parse as string/number
    if (timestamp) {
      const converted = new Date(timestamp);
      if (!isNaN(converted.getTime())) {
        return converted;
      }
    }
    // Fallback to current time
    return new Date();
  } catch (e) {
    return new Date();
  }
}

/**
 * Handle priority architecture from localStorage
 * Returns both the reordered architectures and the priority ID (before it's removed)
 */
async function handlePriorityArchitecture(sortedValidArchs: any[]): Promise<{ finalValidArchs: any[], priorityArchId: string | null }> {
  const priorityArchId = localStorage.getItem('priority_architecture_id');
  console.log('🔥 [PRIORITY-ARCH] Priority architecture ID from localStorage:', priorityArchId);
  console.log('🔥 [PRIORITY-ARCH] Available arch IDs:', sortedValidArchs.map(a => a.id));
  console.log('🔥 [PRIORITY-ARCH] Current localStorage keys:', Object.keys(localStorage));

  let finalValidArchs = sortedValidArchs;

  if (priorityArchId) {
    console.log('🔥 [PRIORITY-ARCH] 📌 Checking for priority architecture:', priorityArchId);
    const priorityArchIndex = sortedValidArchs.findIndex(arch => arch.id === priorityArchId);

    if (priorityArchIndex >= 0) {
      console.log('🔥 [PRIORITY-ARCH] ✅ Found priority architecture in existing list, moving to top');
      const priorityArch = sortedValidArchs[priorityArchIndex];
      finalValidArchs = [
        priorityArch,
        ...sortedValidArchs.filter(arch => arch.id !== priorityArchId)
      ];
      localStorage.removeItem('priority_architecture_id');
      console.log('🔥 [PRIORITY-ARCH] 🧹 Cleared priority architecture flag');
    } else {
      console.log('🔥 [PRIORITY-ARCH] ⚠️ Priority architecture not found in existing list, fetching directly...');

      try {
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for Firebase consistency

        const priorityArch = await ArchitectureService.getArchitectureById(priorityArchId);
        if (priorityArch) {
          console.log('🔥 [PRIORITY-ARCH] ✅ Found priority architecture via direct fetch:', priorityArch.name);
          const convertedArch = convertFirebaseArch(priorityArch);
          finalValidArchs = [convertedArch, ...sortedValidArchs];
          localStorage.removeItem('priority_architecture_id');
          console.log('🔥 [PRIORITY-ARCH] 🧹 Cleared priority architecture flag');
        } else {
          console.log('🔥 [PRIORITY-ARCH] ❌ Priority architecture not found even with direct fetch');
        }
      } catch (error) {
        console.error('🔥 [PRIORITY-ARCH] ❌ Error fetching priority architecture:', error);
      }
    }
  } else {
    console.log('🔥 [PRIORITY-ARCH] No priority architecture ID found in localStorage');
  }

  console.log('🔥 [PRIORITY-ARCH] Final architectures after priority handling:', finalValidArchs.map(a => ({id: a.id, name: a.name})));
  return { finalValidArchs, priorityArchId };
}

/**
 * Log current tab order for debugging
 */
function logTabOrder(allArchs: any[]): void {
  console.log('🔍 Current tab order:', allArchs.map((arch, index) => {
    let createdAtStr = 'null';
    let timestampStr = 'null';
    
    try {
      if (arch.createdAt) {
        createdAtStr = new Date(arch.createdAt).toISOString();
      }
      if (arch.timestamp) {
        timestampStr = new Date(arch.timestamp).toISOString();
      }
    } catch (e) {
      createdAtStr = `invalid(${arch.createdAt})`;
      timestampStr = `invalid(${arch.timestamp})`;
    }
    
    return `${index + 1}. ${arch.name} (${arch.id}) - createdAt: ${createdAtStr}, timestamp: ${timestampStr}`;
  }));
}

/**
 * Handle architecture selection logic
 */
async function handleArchitectureSelection(
  allArchs: any[],
  finalValidArchs: any[],
  priorityArchId: string | null,
  callback: SyncArchitectureOptions['callback']
): Promise<void> {
  const { setSelectedArchitectureId, setCurrentChatName, setRawGraph, setPendingArchitectureSelection } = callback;

  // Find priority architecture in final list using the ID we captured before removal
  const foundPriorityArch = priorityArchId ? allArchs.find(arch => arch.id === priorityArchId) : null;

  // Handle architecture selection
  if (foundPriorityArch) {
    console.log('✅ User signed in - will auto-select transferred architecture after state update:', foundPriorityArch.id, foundPriorityArch.name);
    setPendingArchitectureSelection(foundPriorityArch.id);
  } else if (finalValidArchs.length > 0) {
    // If user has architectures, auto-select the first one
    const firstArch = finalValidArchs[0];
    console.log('📋 User has existing architectures - auto-selecting first one:', firstArch.name);
    setSelectedArchitectureId(firstArch.id);
    setCurrentChatName(firstArch.name);

    // Only load architecture content if canvas is empty (don't overwrite local storage restoration)
    // Check if there's a recent local storage snapshot that might have been restored
    try {
      const stored = localStorage.getItem('atelier_canvas_last_snapshot_v1') || sessionStorage.getItem('atelier_canvas_last_snapshot_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        const storedHasContent = 
          (parsed?.rawGraph?.children && parsed.rawGraph.children.length > 0) ||
          (parsed?.rawGraph?.edges && parsed.rawGraph.edges.length > 0);
        const storedAge = Date.now() - (parsed?.timestamp || 0);
        
        // If stored snapshot is recent (within 5 minutes) and has content, don't overwrite
        if (storedHasContent && storedAge < 5 * 60 * 1000) {
          console.log('📂 Skipping Firebase architecture load - local storage restoration detected', {
            storedAge: Math.round(storedAge / 1000) + 's',
            hasContent: storedHasContent
          });
          return;
        }
      }
    } catch (e) {
      // Ignore errors checking local storage
    }

    // Load the architecture content
    if (firstArch.rawGraph) {
      const archChildrenCount = firstArch.rawGraph?.children?.length || 0;
      const archEdgesCount = firstArch.rawGraph?.edges?.length || 0;
      console.log('📂 [FIREBASE-SYNC-DEBUG] Loading existing architecture content', {
        archId: firstArch.id,
        archName: firstArch.name,
        childrenCount: archChildrenCount,
        edgesCount: archEdgesCount,
        hasContent: archChildrenCount > 0 || archEdgesCount > 0
      });
      setRawGraph(firstArch.rawGraph);
    } else {
      console.log('📂 [FIREBASE-SYNC-DEBUG] Architecture has no rawGraph, skipping load');
    }
  } else {
    console.log('📋 User has no existing architectures - will add New Architecture tab');
    const newArchTab = {
      id: 'new-architecture',
      name: 'New Architecture',
      timestamp: new Date(),
      rawGraph: { id: "root", children: [], edges: [] },
      isNew: true
    };

    setSelectedArchitectureId('new-architecture');
    setCurrentChatName('New Architecture');
  }
}
