/**
 * URL Architecture Service - CONSOLIDATED
 * 
 * This is the SINGLE source of truth for all URL architecture loading logic.
 * No more treasure hunts - everything is here.
 * 
 * PRIORITY RULE: localStorage ALWAYS takes priority over URL/Firebase
 */

import { anonymousArchitectureService, AnonymousArchitecture } from './anonymousArchitectureService';
import { restoreCanvasSnapshot, LOCAL_CANVAS_SNAPSHOT_KEY } from '../utils/canvasPersistence';
import { isEmbedToCanvasTransition, getCurrentConversation, normalizeChatMessages, mergeChatMessages, getChatMessages } from '../utils/chatPersistence';
import { EMBED_PENDING_ARCH_PREFIX } from '../utils/anonymousSave';
import { Timestamp } from 'firebase/firestore';

interface UrlArchitectureConfig {
  isEmbedded: boolean;
  requiresAuth?: boolean;
}

interface LoadArchitectureCallback {
  (architecture: AnonymousArchitecture, source: string): void;
}

interface UrlArchitectureServiceDeps {
  loadArchitecture: LoadArchitectureCallback;
  config: UrlArchitectureConfig;
  currentUser?: {
    uid: string;
    email: string | null;
  } | null;
  // UI callbacks for direct loading (from InteractiveCanvas)
  setRawGraph?: (graph: any, source?: string) => void;
  setCurrentChatName?: (name: string) => void;
  setSavedArchitectures?: (fn: (prev: any[]) => any[]) => void;
  setSelectedArchitectureId?: (id: string) => void;
  viewStateRef?: { current: any };
  getViewStateSnapshot?: () => any;
  logPageLoad?: (source: string, graph: any, id: string) => void;
}

export class UrlArchitectureService {
  private deps: UrlArchitectureServiceDeps;

  constructor(deps: UrlArchitectureServiceDeps) {
    this.deps = deps;
  }

  /**
   * MAIN ENTRY POINT: Check for URL architecture and load if appropriate
   * 
   * PRIORITY LOGIC:
   * 1. If localStorage exists (even empty) → Skip URL loading
   * 2. If no localStorage → Load from URL/Firebase
   */
  async checkAndLoadUrlArchitecture(): Promise<boolean> {
    console.log('[🔄 URL-ARCH-SERVICE] Starting URL architecture check');

    // Short circuit for embedded mode
    if (this.deps.config.isEmbedded) {
      console.log('[🔄 URL-ARCH-SERVICE] Embedded mode - skipping URL check');
      return false;
    }

    // CRITICAL: localStorage priority check
    if (!this.shouldLoadFromUrl()) {
      return false;
    }

    // Get URL architecture ID
    const urlArchId = anonymousArchitectureService.getArchitectureIdFromUrl();
    if (!urlArchId) {
      console.log('[🔄 URL-ARCH-SERVICE] No URL architecture ID found');
      return false;
    }

    console.log('[🔄 URL-ARCH-SERVICE] Loading from URL since localStorage allows it:', urlArchId);
    await this.loadSharedAnonymousArchitecture(urlArchId);
    return true;
  }

  /**
   * Check if we should load from URL based on localStorage priority
   */
  private shouldLoadFromUrl(): boolean {
    if (typeof window === 'undefined') return false;

    try {
      // Check if localStorage has been explicitly set (even if empty)
      const stored = localStorage.getItem(LOCAL_CANVAS_SNAPSHOT_KEY) || sessionStorage.getItem(LOCAL_CANVAS_SNAPSHOT_KEY);
      
      console.log('[🔍 URL-ARCH-SERVICE] localStorage priority check:', {
        hasStoredData: !!stored,
        storedLength: stored?.length || 0
      });
      
      if (stored) {
        // localStorage has been set - user has interacted with the app
        // Don't load from URL - localStorage takes absolute priority
        console.log('[🔄 URL-ARCH-SERVICE] localStorage exists - BLOCKING URL load (localStorage priority)');
        return false;
      } else {
        console.log('[🔄 URL-ARCH-SERVICE] No localStorage - ALLOWING URL load');
        return true;
      }
    } catch (error) {
      console.warn('⚠️ [URL-ARCH-SERVICE] Error checking localStorage:', error);
      // If localStorage check fails, allow URL loading as fallback
      return true;
    }
  }

  /**
   * Load a shared anonymous architecture by ID
   */
  private async loadSharedAnonymousArchitecture(architectureId: string): Promise<void> {
    try {
      // Double-check localStorage priority (redundant safety)
      if (!this.shouldLoadFromUrl()) {
        console.log('[🔄 URL-ARCH-SERVICE] localStorage priority block - aborting URL load');
        return;
      }

      let sharedArch = null;
      const isLocalFallback = architectureId.startsWith('local-');

      // Load from Firebase if not a local fallback
      if (!isLocalFallback) {
        sharedArch = await anonymousArchitectureService.loadAnonymousArchitectureById(architectureId);
      }

      // Try fallback storage (sessionStorage/localStorage)
      let fallbackData: any = null;
      const fallbackSources: Array<'session' | 'local'> = [];

      if (typeof window !== 'undefined') {
        const storageKey = `${EMBED_PENDING_ARCH_PREFIX}${architectureId}`;
        
        // Try sessionStorage first
        try {
          const sessionPayload = window.sessionStorage?.getItem(storageKey);
          if (sessionPayload) {
            fallbackData = JSON.parse(sessionPayload);
            fallbackSources.push('session');
          }
        } catch (error) {
          console.warn('⚠️ [URL-ARCH-SERVICE] Failed to read sessionStorage fallback:', error);
        }

        // Try localStorage if sessionStorage failed
        if (!fallbackData) {
          try {
            const localPayload = window.localStorage?.getItem(storageKey);
            if (localPayload) {
              fallbackData = JSON.parse(localPayload);
              fallbackSources.push('local');
            }
          } catch (error) {
            console.warn('⚠️ [URL-ARCH-SERVICE] Failed to read localStorage fallback:', error);
          }
        }
      }

      // Create default architecture if nothing found
      if (!sharedArch && !fallbackData) {
        console.warn('⚠️ [URL-ARCH-SERVICE] Architecture not found, creating default:', architectureId);
        sharedArch = this.createDefaultArchitecture(architectureId);
      }

      // Use fallback data if no Firebase data
      if (!sharedArch && fallbackData?.rawGraph) {
        sharedArch = this.createArchitectureFromFallback(architectureId, fallbackData);
      } else if (sharedArch && fallbackData) {
        // Merge Firebase data with fallback chat messages
        sharedArch = this.mergeArchitectureWithFallback(sharedArch, fallbackData);
      }

      // Clean up fallback storage
      this.cleanupFallbackStorage(architectureId, fallbackSources);

      if (sharedArch?.rawGraph) {
        await this.processLoadedArchitecture(sharedArch);
      } else {
        console.warn('🔥 [URL-ARCH-SERVICE] No valid architecture found:', architectureId);
      }
    } catch (error) {
      console.error('🔥 [URL-ARCH-SERVICE] Failed to load architecture:', error);
    }
  }

  /**
   * Process the loaded architecture based on auth mode
   */
  private async processLoadedArchitecture(sharedArch: AnonymousArchitecture): Promise<void> {
    // Handle chat messages
    this.handleChatMessages(sharedArch);

    const isAuthMode = this.deps.config.requiresAuth || false;

    if (isAuthMode && this.deps.currentUser?.uid) {
      // Auth mode: convert to Firebase architecture
      await this.processForAuthenticatedUser(sharedArch);
    } else {
      // Canvas/embed mode: load directly
      this.deps.loadArchitecture(sharedArch, 'URL_SHARED');
    }
  }

  /**
   * Process architecture for authenticated user (convert to Firebase)
   */
  private async processForAuthenticatedUser(sharedArch: AnonymousArchitecture): Promise<void> {
    try {
      const { ArchitectureService } = await import('./architectureService');
      const { generateNameWithFallback } = await import('../utils/naming');

      // Get user prompt from various sources
      let userPrompt = sharedArch.userPrompt || '';
      if (!userPrompt) {
        const persistedMessages = getChatMessages();
        const lastUserMessage = persistedMessages.filter(msg => msg.sender === 'user').pop();
        userPrompt = lastUserMessage?.content || (window as any).originalChatTextInput || (window as any).chatTextInput || '';
      }

      // Generate name and save to Firebase
      const baseChatName = await generateNameWithFallback(sharedArch.rawGraph, userPrompt);
      
      const savedArchId = await ArchitectureService.saveArchitecture({
        name: baseChatName,
        userId: this.deps.currentUser!.uid,
        userEmail: this.deps.currentUser!.email,
        rawGraph: sharedArch.rawGraph,
        userPrompt: userPrompt,
        nodes: [],
        edges: []
      });

      // Set as priority architecture
      localStorage.setItem('priority_architecture_id', savedArchId);

      // Create Firebase architecture object
      const firebaseArch = {
        id: savedArchId,
        name: baseChatName,
        timestamp: new Date(),
        rawGraph: sharedArch.rawGraph,
        firebaseId: savedArchId,
        userPrompt: userPrompt,
        isFromFirebase: true
      };

      this.deps.loadArchitecture(firebaseArch, 'URL_AUTH_TRANSFER');
    } catch (error) {
      console.error('🔥 [URL-ARCH-SERVICE] Failed to process for authenticated user:', error);
      // Fallback to anonymous loading
      this.deps.loadArchitecture(sharedArch, 'URL_SHARED');
    }
  }

  /**
   * Handle chat message restoration/merging
   */
  private handleChatMessages(sharedArch: AnonymousArchitecture): void {
    try {
      const transitionedFromEmbed = isEmbedToCanvasTransition();
      const existingConversation = getCurrentConversation();
      const normalizedArchMessages = normalizeChatMessages((sharedArch as any).chatMessages);
      const mergedConversation = mergeChatMessages(existingConversation, normalizedArchMessages);

      if (mergedConversation && mergedConversation.length > 0) {
        localStorage.setItem('atelier_current_conversation', JSON.stringify(mergedConversation));
      } else if (existingConversation.length === 0) {
        localStorage.removeItem('atelier_current_conversation');
      }
    } catch (error) {
      console.warn('Failed to restore/merge chat messages:', error);
    }
  }

  /**
   * Create default architecture when none found
   */
  private createDefaultArchitecture(architectureId: string): AnonymousArchitecture {
    const defaultGraph = {
      id: 'root',
      children: [
        {
          id: 'quickstart_node',
          labels: [{ text: 'Quickstart Node' }],
          children: [],
          edges: [],
          data: { label: 'Quickstart Node', icon: 'browser_client' },
        },
      ],
      edges: [],
    };

    return {
      id: architectureId,
      name: 'Quickstart Architecture',
      rawGraph: defaultGraph,
      sessionId: 'default-fallback',
      timestamp: Timestamp.now(),
      isAnonymous: true,
      userPrompt: '',
      chatMessages: [],
    } as AnonymousArchitecture;
  }

  /**
   * Create architecture from fallback data
   */
  private createArchitectureFromFallback(architectureId: string, fallbackData: any): AnonymousArchitecture {
    return {
      id: architectureId,
      name: fallbackData.name || 'Unsaved Architecture',
      rawGraph: fallbackData.rawGraph,
      sessionId: 'local-fallback',
      timestamp: Timestamp.now(),
      isAnonymous: true,
      userPrompt: fallbackData.userPrompt || '',
      chatMessages: fallbackData.chatMessages || [],
      viewState: fallbackData.viewState || undefined,
    } as AnonymousArchitecture;
  }

  /**
   * Merge Firebase architecture with fallback data
   */
  private mergeArchitectureWithFallback(sharedArch: AnonymousArchitecture, fallbackData: any): AnonymousArchitecture {
    const hasChatInDoc = Array.isArray((sharedArch as any).chatMessages) && (sharedArch as any).chatMessages.length > 0;
    const fallbackChat = Array.isArray(fallbackData.chatMessages) ? fallbackData.chatMessages : [];
    
    if (!hasChatInDoc && fallbackChat.length > 0) {
      return {
        ...sharedArch,
        chatMessages: fallbackChat,
        userPrompt: sharedArch.userPrompt || fallbackData.userPrompt || sharedArch.userPrompt,
        viewState: sharedArch.viewState || fallbackData.viewState || undefined,
      } as AnonymousArchitecture;
    }
    
    return sharedArch;
  }

  /**
   * Clean up fallback storage after successful load
   */
  private cleanupFallbackStorage(architectureId: string, fallbackSources: Array<'session' | 'local'>): void {
    if (fallbackSources.length && typeof window !== 'undefined') {
      const storageKey = `${EMBED_PENDING_ARCH_PREFIX}${architectureId}`;
      for (const source of fallbackSources) {
        try {
          if (source === 'session') {
            window.sessionStorage?.removeItem(storageKey);
          } else if (source === 'local') {
            window.localStorage?.removeItem(storageKey);
          }
        } catch {}
      }
    }
  }

  /**
   * LEGACY SUPPORT: Direct architecture loading (from InteractiveCanvas)
   * This maintains compatibility with existing loadArchitectureFromUrl calls
   */
  loadArchitectureFromUrl(architecture: any, source: string): void {
    if (!this.deps.setRawGraph || !this.deps.viewStateRef) {
      console.error('[URL-ARCH-SERVICE] Missing dependencies for direct loading');
      return;
    }

    // Check localStorage priority first
    if (!this.shouldLoadFromUrl()) {
      console.log('[🔄 URL-ARCH-SERVICE] localStorage priority - blocking direct URL load');
      return;
    }

    console.log('[🔄 URL-ARCH-SERVICE] Direct loading architecture from URL:', architecture.id);

    // Handle ViewState
    let viewStateSnapshot = undefined;
    if (architecture.viewState) {
      try {
        viewStateSnapshot = JSON.parse(JSON.stringify(architecture.viewState));
      } catch (error) {
        console.warn('⚠️ [URL-ARCH-SERVICE] Failed to clone viewState:', error);
        viewStateSnapshot = architecture.viewState;
      }
      this.deps.viewStateRef.current = viewStateSnapshot ?? { node: {}, group: {}, edge: {} };
    } else {
      this.deps.viewStateRef.current = this.deps.viewStateRef.current || { node: {}, group: {}, edge: {} };
    }

    const graphWithViewState = viewStateSnapshot
      ? { ...architecture.rawGraph, viewState: viewStateSnapshot }
      : architecture.rawGraph;

    // Set the content
    if (this.deps.logPageLoad) {
      this.deps.logPageLoad('URL', architecture.rawGraph, architecture.id);
    }
    this.deps.setRawGraph(graphWithViewState);
    
    if (this.deps.setCurrentChatName) {
      this.deps.setCurrentChatName(architecture.name);
    }

    // Create architecture tab
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

    if (this.deps.setSavedArchitectures && this.deps.setSelectedArchitectureId) {
      this.deps.setSavedArchitectures(prev => {
        const exists = prev.some(arch => arch.id === architecture.id);
        if (!exists) {
          return [urlArch, ...prev];
        }
        return prev;
      });
      this.deps.setSelectedArchitectureId(architecture.id);
    }
  }
}

// Export singleton factory
export function createUrlArchitectureService(deps: UrlArchitectureServiceDeps): UrlArchitectureService {
  return new UrlArchitectureService(deps);
}




