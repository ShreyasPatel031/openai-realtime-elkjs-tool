/**
 * Centralized URL architecture processing hook
 * Replaces scattered URL architecture checking and loading logic
 */

import { useCallback, useRef } from 'react';
import { anonymousArchitectureService, AnonymousArchitecture } from '../services/anonymousArchitectureService';
import { EMBED_PENDING_ARCH_PREFIX } from '../utils/anonymousSave';
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

    const urlArchId = anonymousArchitectureService.getArchitectureIdFromUrl();
    // console.log('🔍 [URL-ARCH] Checking for URL architecture ID:', urlArchId);
    
    if (urlArchId) {
      console.log('🔄 [URL-ARCH] Loading shared architecture from URL');
      await loadSharedAnonymousArchitecture(urlArchId);
      return true;
    }
    
    return false;
  }, [loadArchitecture, config.isEmbedded]);

  /**
   * Load a shared anonymous architecture by ID
   */
  const loadSharedAnonymousArchitecture = useCallback(async (architectureId: string) => {
    console.log('🔥 [LOAD-SHARED] Starting to load shared architecture:', architectureId);
    
    try {
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

      if (!sharedArch && fallbackData?.rawGraph) {
        console.log('🔥 [LOAD-SHARED] Using local fallback architecture data:', {
          id: architectureId,
          createdAt: fallbackData.createdAt,
          hasChatMessages: Array.isArray(fallbackData.chatMessages) && fallbackData.chatMessages.length > 0,
        });

        sharedArch = {
          id: architectureId,
          name: fallbackData.name || 'Unsaved Architecture',
          rawGraph: fallbackData.rawGraph,
          sessionId: 'local-fallback',
          timestamp: Timestamp.now(),
          isAnonymous: true,
          userPrompt: fallbackData.userPrompt || '',
          chatMessages: fallbackData.chatMessages || [],
        } as AnonymousArchitecture;
      } else if (sharedArch && fallbackData) {
        const hasChatInDoc = Array.isArray((sharedArch as any).chatMessages) && (sharedArch as any).chatMessages.length > 0;
        const fallbackChat = Array.isArray(fallbackData.chatMessages) ? fallbackData.chatMessages : [];
        if (!hasChatInDoc && fallbackChat.length > 0) {
          console.log('🔥 [LOAD-SHARED] Enriching shared architecture with fallback chat messages');
          sharedArch = {
            ...sharedArch,
            chatMessages: fallbackChat,
            userPrompt: sharedArch.userPrompt || fallbackData.userPrompt || sharedArch.userPrompt,
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
        console.log('🔥 [LOAD-SHARED] ✅ Loaded shared architecture:', {
          id: architectureId,
          name: sharedArch.name,
          nodeCount: sharedArch.rawGraph?.children?.length || 0,
          hasChatMessages: !!(sharedArch as any).chatMessages?.length
        });
        
        // ALWAYS set chat messages from architecture (even if empty) to clear any stale localStorage data
        try {
          const archChatMessages = (sharedArch as any).chatMessages || [];
          localStorage.setItem('atelier_current_conversation', JSON.stringify(archChatMessages));
          if (archChatMessages.length > 0) {
            console.log('💬 [LOAD-SHARED] Restored', archChatMessages.length, 'chat messages from architecture');
          } else {
            console.log('💬 [LOAD-SHARED] Cleared chat messages (architecture has no saved messages)');
          }
        } catch (error) {
          console.warn('Failed to restore/clear chat messages:', error);
        }
        
        // Check if we're in auth mode (user is authenticated)
        const isAuthMode = config.requiresAuth || false;
        console.log('🔥 [LOAD-SHARED] Auth mode:', isAuthMode);
        
        if (isAuthMode) {
          // In auth mode, we need to convert the anonymous architecture to a Firebase architecture
          // and set it as priority so it becomes the first tab
          console.log('🔥 [LOAD-SHARED] 🔐 Processing URL architecture for authenticated user');

          // Check if user is authenticated
          if (!currentUserRef.current?.uid || !currentUserRef.current?.email) {
            console.log('🔥 [LOAD-SHARED] ⚠️ User not authenticated yet - will process after sign-in');
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
              console.log('🔥 [LOAD-SHARED] ⚠️ No userPrompt in architecture, trying chat messages...');
              const persistedMessages = getChatMessages();
              const lastUserMessage = persistedMessages.filter(msg => msg.sender === 'user').pop();
              userPrompt = lastUserMessage?.content || (window as any).originalChatTextInput || (window as any).chatTextInput || '';

              console.log('🔥 [LOAD-SHARED] 📝 Chat messages for naming:', persistedMessages);
              console.log('🔥 [LOAD-SHARED] 🔍 Fallback debug info:', {
                messageCount: persistedMessages.length,
                lastUserMessage: lastUserMessage?.content,
                windowOriginalChat: (window as any).originalChatTextInput,
                windowChatText: (window as any).chatTextInput,
                finalPrompt: userPrompt
              });
            } else {
              console.log('🔥 [LOAD-SHARED] ✅ Using userPrompt from architecture:', userPrompt);
            }

            console.log('🔥 [LOAD-SHARED] 🏷️ Final user prompt for naming:', userPrompt || '(empty - will use graph components)');

            // Generate name using backend API (will use componentsHintFromGraph if userPrompt is empty)
            const baseChatName = await generateNameWithFallback(sharedArch.rawGraph, userPrompt);
            console.log('🔥 [LOAD-SHARED] 🎯 Generated architecture name:', baseChatName);
            
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
            
            console.log('🔥 [LOAD-SHARED] 💾 Saved to Firebase with ID:', savedArchId);
            
            // Set as priority architecture so it appears as first tab
            localStorage.setItem('priority_architecture_id', savedArchId);
            console.log('🔥 [LOAD-SHARED] 🏆 Set priority architecture ID:', savedArchId);
            
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
          console.log('🔥 [LOAD-SHARED] 🌐 Loading as anonymous architecture (non-auth mode)');
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
