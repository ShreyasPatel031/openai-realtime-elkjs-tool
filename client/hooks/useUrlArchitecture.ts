/**
 * Centralized URL architecture processing hook
 * Replaces scattered URL architecture checking and loading logic
 */

import { useCallback, useRef } from 'react';
import { anonymousArchitectureService, AnonymousArchitecture } from '../services/anonymousArchitectureService';
import { EMBED_PENDING_ARCH_PREFIX } from '../utils/anonymousSave';
import { isEmbedToCanvasTransition, getCurrentConversation, normalizeChatMessages, mergeChatMessages } from '../utils/chatPersistence';
import { restoreCanvasSnapshot } from '../utils/canvasPersistence';
import { Timestamp } from 'firebase/firestore';

interface UseUrlArchitectureProps {
  loadArchitecture: (architecture: AnonymousArchitecture, source: string) => void;
  config: { isEmbedded: boolean; requiresAuth?: boolean };
  currentUser?: {
    uid: string;
    email: string | null;
  } | null;
}

export function useUrlArchitecture({ loadArchitecture, config, currentUser }: UseUrlArchitectureProps) {
  // Store the current user in a ref so it's always up to date
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  /**
   * Check for URL architecture ID and load it if present
   * Returns whether URL architecture was found and loaded
   */
  const checkAndLoadUrlArchitecture = useCallback(async (): Promise<boolean> => {
    // Short circuit for embedded mode
    if (config.isEmbedded) {
      return false;
    }

    // CRITICAL: ALWAYS check localStorage FIRST before loading from URL
    // Only load from URL if localStorage doesn't have a snapshot for this architecture
    const urlArchId = anonymousArchitectureService.getArchitectureIdFromUrl();
    if (urlArchId && typeof window !== 'undefined') {
      try {
        const snapshot = restoreCanvasSnapshot();
        if (snapshot && snapshot.selectedArchitectureId === urlArchId) {
          const hasContent = 
            (snapshot.rawGraph?.children && snapshot.rawGraph.children.length > 0) ||
            (snapshot.rawGraph?.edges && snapshot.rawGraph.edges.length > 0);
          
          if (hasContent) {
            console.log('[🔄 URL-ARCH] localStorage snapshot exists for URL architecture - skipping URL load:', urlArchId);
            // Don't load from URL - let localStorage restoration handle it
            return false;
          }
        }
      } catch (error) {
        console.warn('⚠️ [URL-ARCH] Error checking localStorage before URL load:', error);
        // Continue with URL load if localStorage check fails
      }
    }
    
    if (urlArchId) {
      await loadSharedAnonymousArchitecture(urlArchId);
      return true;
    }
    
    return false;
  }, [loadArchitecture, config.isEmbedded]);

  /**
   * Load a shared anonymous architecture by ID
   */
  const loadSharedAnonymousArchitecture = useCallback(async (architectureId: string) => {
    
    try {
      // CRITICAL: Check if localStorage has a snapshot for this architecture ID first
      // If it does, skip loading from Firebase/URL - localStorage takes precedence (user's current state)
      if (typeof window !== 'undefined') {
        try {
          const snapshot = restoreCanvasSnapshot();
          if (snapshot && snapshot.selectedArchitectureId === architectureId) {
            const hasContent = 
              (snapshot.rawGraph?.children && snapshot.rawGraph.children.length > 0) ||
              (snapshot.rawGraph?.edges && snapshot.rawGraph.edges.length > 0);
            
            if (hasContent) {
              console.log('[🔄 URL-ARCH] Skipping URL load - localStorage snapshot exists for same architecture:', architectureId);
              // Return early - let the localStorage restoration handle it
              return true;
            }
          }
        } catch (error) {
          console.warn('⚠️ [LOAD-SHARED] Error checking localStorage snapshot:', error);
          // Continue with normal load
        }
      }
      
      let sharedArch = null;
      const isLocalFallback = architectureId.startsWith('local-');

      if (!isLocalFallback) {
        sharedArch = await anonymousArchitectureService.loadAnonymousArchitectureById(architectureId);
      }

      let fallbackData: any = null;
      const fallbackSources: Array<'session' | 'local'> = [];

      if (typeof window !== 'undefined') {
        const storageKey = `${EMBED_PENDING_ARCH_PREFIX}${architectureId}`;
        try {
          const sessionPayload = window.sessionStorage?.getItem(storageKey);
          if (sessionPayload) {
            fallbackData = JSON.parse(sessionPayload);
            fallbackSources.push('session');
          }
        } catch (error) {
          console.warn('⚠️ [LOAD-SHARED] Failed to read sessionStorage fallback:', error);
        }

        if (!fallbackData) {
          try {
            const localPayload = window.localStorage?.getItem(storageKey);
            if (localPayload) {
              fallbackData = JSON.parse(localPayload);
              fallbackSources.push('local');
            }
          } catch (error) {
            console.warn('⚠️ [LOAD-SHARED] Failed to read localStorage fallback:', error);
          }
        }

        if (!fallbackData && fallbackSources.length === 0) {
          // If session payload existed but couldn't be parsed, still try local storage
          try {
            const localPayload = window.localStorage?.getItem(storageKey);
            if (localPayload) {
              fallbackData = JSON.parse(localPayload);
              fallbackSources.push('local');
            }
          } catch (error) {
            console.warn('⚠️ [LOAD-SHARED] Fallback localStorage parse error:', error);
          }
        }
      }

      if (!sharedArch && !fallbackData) {
        console.warn('⚠️ [LOAD-SHARED] Shared architecture not found. Falling back to default architecture:', architectureId);
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

        sharedArch = {
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

      if (!sharedArch && fallbackData?.rawGraph) {

        sharedArch = {
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
      } else if (sharedArch && fallbackData) {
        const hasChatInDoc = Array.isArray((sharedArch as any).chatMessages) && (sharedArch as any).chatMessages.length > 0;
        const fallbackChat = Array.isArray(fallbackData.chatMessages) ? fallbackData.chatMessages : [];
        if (!hasChatInDoc && fallbackChat.length > 0) {
          sharedArch = {
            ...sharedArch,
            chatMessages: fallbackChat,
            userPrompt: sharedArch.userPrompt || fallbackData.userPrompt || sharedArch.userPrompt,
            viewState: sharedArch.viewState || fallbackData.viewState || undefined,
          } as AnonymousArchitecture;
        }
      }

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
      
      if (sharedArch && sharedArch.rawGraph) {
        
        // ALWAYS set chat messages from architecture (even if empty) to clear any stale localStorage data
        try {
          const transitionedFromEmbed = isEmbedToCanvasTransition();
          const existingConversation = getCurrentConversation();
          const normalizedArchMessages = normalizeChatMessages((sharedArch as any).chatMessages);
          const mergedConversation = mergeChatMessages(existingConversation, normalizedArchMessages);

          const existingCount = existingConversation.length;
          const incomingCount = normalizedArchMessages?.length || 0;


          if (mergedConversation && mergedConversation.length > 0) {
            localStorage.setItem('atelier_current_conversation', JSON.stringify(mergedConversation));
          } else if (existingCount > 0) {
          } else {
            localStorage.removeItem('atelier_current_conversation');
          }
        } catch (error) {
          console.warn('Failed to restore/merge chat messages:', error);
        }
        
        // Check if we're in auth mode (user is authenticated)
        const isAuthMode = config.requiresAuth || false;
        
        if (isAuthMode) {
          // In auth mode, we need to convert the anonymous architecture to a Firebase architecture
          // and set it as priority so it becomes the first tab

          // Check if user is authenticated
          if (!currentUserRef.current?.uid || !currentUserRef.current?.email) {
            // Still load the architecture as anonymous for now
            loadArchitecture(sharedArch, 'url-shared-anonymous');
            return true;
          }

          try {
            // Import required modules
            const { ArchitectureService } = await import('../services/architectureService');
            const { generateNameWithFallback } = await import('../utils/naming');
            const { getChatMessages } = await import('../utils/chatPersistence');

            // PRIORITY ORDER for getting userPrompt:
            // 1. From the loaded architecture (most reliable - saved with the architecture)
            // 2. From persisted chat messages (fallback for old architectures)
            // 3. From window global (fallback for current session)
            // 4. Empty string (will trigger componentsHintFromGraph fallback)

            let userPrompt = sharedArch.userPrompt || '';

            if (!userPrompt) {
              const persistedMessages = getChatMessages();
              const lastUserMessage = persistedMessages.filter(msg => msg.sender === 'user').pop();
              userPrompt = lastUserMessage?.content || (window as any).originalChatTextInput || (window as any).chatTextInput || '';

            } else {
            }


            // Generate name using backend API (will use componentsHintFromGraph if userPrompt is empty)
            const baseChatName = await generateNameWithFallback(sharedArch.rawGraph, userPrompt);
            
            // Save to Firebase
            const savedArchId = await ArchitectureService.saveArchitecture({
              name: baseChatName,
              userId: currentUserRef.current.uid,
              userEmail: currentUserRef.current.email,
              rawGraph: sharedArch.rawGraph,
              userPrompt: userPrompt,
              nodes: [],
              edges: []
            });
            
            
            // Set as priority architecture so it appears as first tab
            localStorage.setItem('priority_architecture_id', savedArchId);
            
            // Create the architecture object for loading
            const firebaseArch = {
              id: savedArchId,
              name: baseChatName,
              timestamp: new Date(),
              rawGraph: sharedArch.rawGraph,
              firebaseId: savedArchId,
              userPrompt: userPrompt,
              isFromFirebase: true
            };
            
            // Load the architecture
            loadArchitecture(firebaseArch, 'URL_AUTH_TRANSFER');
            
          } catch (error) {
            console.error('🔥 [LOAD-SHARED] ❌ Failed to process for authenticated user:', error);
            // Fallback to anonymous loading
            loadArchitecture(sharedArch, 'URL_SHARED');
          }
        } else {
          // In canvas/embed mode, load directly as anonymous architecture
          loadArchitecture(sharedArch, 'URL_SHARED');
        }
        
      } else {
        console.warn('🔥 [LOAD-SHARED] ⚠️ Shared architecture not found or has no content:', architectureId);
      }
    } catch (error) {
      console.error('🔥 [LOAD-SHARED] ❌ Failed to load shared architecture:', error);
    }
  }, [loadArchitecture, config]);

  return {
    checkAndLoadUrlArchitecture,
    loadSharedAnonymousArchitecture
  };
}
