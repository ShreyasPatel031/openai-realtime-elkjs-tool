import React, { useCallback, useEffect, useRef, MutableRefObject } from 'react';
import { Save, Edit, Check, Download } from 'lucide-react';
import { useViewMode } from '../../contexts/ViewModeContext';
import SaveAuth from '../auth/SaveAuth';
import { markEmbedToCanvasTransition, EMBED_PENDING_CHAT_KEY, EMBED_CHAT_BROADCAST_CHANNEL, getCurrentConversation, normalizeChatMessages, mergeChatMessages, PersistedChatMessage, saveChatMessage } from '../../utils/chatPersistence';
import { anonymousArchitectureService } from '../../services/anonymousArchitectureService';
import { ensureAnonymousSaved, EMBED_PENDING_ARCH_PREFIX } from '../../utils/anonymousSave';

interface ViewControlsProps {
  // Save button props
  isSaving?: boolean;
  saveSuccess?: boolean;
  rawGraph?: any;
  handleManualSave?: () => void;
  handleSave?: () => void;
  
  // User props
  user?: any;
  
  // Export props
  onExport?: () => void;
  viewStateRef?: MutableRefObject<any>;
}

const ViewControls: React.FC<ViewControlsProps> = ({
  isSaving = false,
  saveSuccess = false,
  rawGraph,
  handleManualSave,
  handleSave,
  user,
  onExport,
  viewStateRef
}) => {
  const { config } = useViewMode();
  const chatSnapshotRef = useRef<string | null>(null);
  const embedChatChannelRef = useRef<BroadcastChannel | null>(null);

  const collectChatMessages = useCallback((): PersistedChatMessage[] => {
    if (typeof window === 'undefined') {
      return [];
    }

    const sources: Array<PersistedChatMessage[] | undefined> = [];

    sources.push(normalizeChatMessages(getCurrentConversation()));

    const fallbackStrings = [
      localStorage.getItem('atelier_current_conversation'),
      (window as any).__atelierLastConversation,
      (window as any).__embedChatPayload,
    ];

    fallbackStrings.forEach((raw) => {
      if (typeof raw !== 'string' || raw.length === 0) return;
      try {
        const parsed = JSON.parse(raw);
        sources.push(normalizeChatMessages(parsed));
      } catch (error) {
        console.warn('⚠️ [EDIT] Failed to parse stored chat snapshot:', error);
      }
    });

    const merged = sources.reduce<PersistedChatMessage[] | undefined>(
      (acc, current) => mergeChatMessages(acc, current),
      undefined
    );

    return merged ?? [];
  }, []);

  const getLatestChatSnapshot = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;
    const sources = [
      chatSnapshotRef.current,
      localStorage.getItem('atelier_current_conversation'),
      (window as any).__embedChatPayload,
      (window as any).__atelierLastConversation,
    ];
    console.log('📝 [EDIT] Snapshot sources lengths:', sources.map((src) => (typeof src === 'string' ? src.length : src ? -1 : 0)));
    for (const source of sources) {
      if (typeof source === 'string' && source.length > 0) {
        return source;
      }
    }
    return null;
  }, []);

  const emitChatSnapshot = useCallback(
    (channel?: BroadcastChannel | null, extra?: { prompt?: string }) => {
      if (!channel) return;
      const snapshot = getLatestChatSnapshot();
      if (!snapshot) return;
      console.log('📡 [EDIT] Broadcasting chat snapshot, length:', snapshot.length);
      channel.postMessage({
        type: 'chat-snapshot',
        conversation: snapshot,
        prompt: extra?.prompt ?? null,
      });
    },
    [getLatestChatSnapshot]
  );

  useEffect(() => {
    const handleEmbedChatRequest = (event: MessageEvent) => {
      if (typeof window === 'undefined') return;
      if (event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || typeof message !== 'object') return;
      if (message.type !== 'embed-chat-request') return;

      const snapshot = getLatestChatSnapshot();

      console.log('📬 [EDIT] Received chat request, responding with length:', snapshot ? snapshot.length : 'none');

      event.source?.postMessage(
        {
          type: 'embed-chat-snapshot',
          conversation: snapshot,
        },
        event.origin
      );
    };

    window.addEventListener('message', handleEmbedChatRequest);
    return () => {
      window.removeEventListener('message', handleEmbedChatRequest);
    };
  }, [getLatestChatSnapshot]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof BroadcastChannel === 'undefined') {
      console.log('📡 [EDIT] BroadcastChannel unavailable in this environment');
      return;
    }

    const channel = new BroadcastChannel(EMBED_CHAT_BROADCAST_CHANNEL);
    console.log('📡 [EDIT] Broadcast channel connected in embed');
    embedChatChannelRef.current = channel;

    const handleChannelMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'chat-request') {
        console.log('📡 [EDIT] Received chat request via broadcast');
        emitChatSnapshot(channel, { prompt: data.prompt ?? null });
      }
    };

    channel.onmessage = handleChannelMessage;

    // Send initial snapshot when channel connects
    emitChatSnapshot(channel);

    return () => {
      channel.onmessage = null;
      channel.close();
      embedChatChannelRef.current = null;
    };
  }, [emitChatSnapshot]);

  const handleEditClick = async () => {
    try {
      // Mark that user is transitioning from embed to canvas view
      markEmbedToCanvasTransition();
      
      // Open in new tab for editing (from embedded contexts)
      const urlParams = new URLSearchParams(window.location.search);
      const urlArchId = urlParams.get('arch');
      
      // Determine target URL based on environment
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const hasPort = window.location.port && window.location.port !== '80' && window.location.port !== '443';
      const isProduction = window.location.hostname === 'atelier-inc.net' || 
                           window.location.hostname === 'app.atelier-inc.net' ||
                           window.location.hostname === 'www.atelier-inc.net';
      const isVercelPreview = window.location.hostname.includes('vercel.app') && !isProduction;
      
      let targetUrl;
      if (isLocalhost || hasPort) {
        // Local development - use root path, will auto-detect auth state
        targetUrl = `${window.location.origin}/`;
      } else if (isProduction) {
        // Production - redirect to main app domain (root path)
        targetUrl = 'https://app.atelier-inc.net/';
      } else {
        // Vercel preview/staging - stay in same environment (root path)
        targetUrl = `${window.location.origin}/`;
      }
      
      console.log('🔍 [EDIT] Edit button state check:', {
        hasArchitectureId: !!urlArchId,
        hasRawGraph: !!rawGraph,
        hasChildren: !!(rawGraph && rawGraph.children),
        childrenLength: rawGraph?.children?.length || 0,
        currentSearch: window.location.search
      });
      
      let finalArchId = urlArchId || null;

      // Only attempt to ensure save when we have graph content
      const hasGraphContent = !!(rawGraph && rawGraph.children && rawGraph.children.length > 0);
      const chatMessagesSnapshot = collectChatMessages();
      const hasChatContent = chatMessagesSnapshot.length > 0;
      let viewStateSnapshot: any = undefined;
      if (viewStateRef?.current) {
        try {
          viewStateSnapshot = JSON.parse(JSON.stringify(viewStateRef.current));
        } catch (error) {
          console.warn('⚠️ [EDIT] Failed to clone viewState snapshot:', error);
          viewStateSnapshot = viewStateRef.current;
        }
      }
      const rawGraphWithViewState = viewStateSnapshot ? { ...rawGraph, viewState: viewStateSnapshot } : rawGraph;

      const getUserPrompt = () =>
        (window as any).originalChatTextInput ||
        (window as any).chatTextInput ||
        '';
      const userPromptForTransition = getUserPrompt();

      // Persist chat snapshot for embed-to-canvas transition regardless of graph content
      try {
        const chatSnapshot =
          localStorage.getItem('atelier_current_conversation') ||
          (window as any).__atelierLastConversation ||
          null;
        if (chatSnapshot) {
          localStorage.setItem(EMBED_PENDING_CHAT_KEY, chatSnapshot);
          sessionStorage.setItem(EMBED_PENDING_CHAT_KEY, chatSnapshot);
          (window as any).__embedChatSnapshot = chatSnapshot;
          chatSnapshotRef.current = chatSnapshot;
          console.log('✅ [EDIT] Stored embed chat snapshot for transition (pre-save), length:', chatSnapshot.length);
        } else {
          localStorage.removeItem(EMBED_PENDING_CHAT_KEY);
          sessionStorage.removeItem(EMBED_PENDING_CHAT_KEY);
          (window as any).__embedChatSnapshot = null;
          chatSnapshotRef.current = null;
          console.log('ℹ️ [EDIT] No embed chat snapshot found to store');
        }
      } catch (error) {
        console.warn('⚠️ [EDIT] Failed to persist embed chat snapshot:', error);
      }

      emitChatSnapshot(embedChatChannelRef.current, { prompt: userPromptForTransition || '' });

      const ensureArchitectureSaved = async (): Promise<string | null> => {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const ensuredId = await ensureAnonymousSaved({
              rawGraph: rawGraphWithViewState,
              userPrompt: getUserPrompt(),
              anonymousService: anonymousArchitectureService,
              metadata: viewStateSnapshot ? { viewState: viewStateSnapshot } : undefined,
            });
            const resolvedId = ensuredId ?? anonymousArchitectureService.getArchitectureIdFromUrl();
            if (resolvedId) {
              return resolvedId;
            }
          } catch (error: any) {
            const message = error?.message || String(error);
            const isThrottle = message.toLowerCase().includes('throttled');
            if (isThrottle && attempt < maxAttempts) {
              const delay = 500 * attempt;
              console.warn(`⏳ [EDIT] Save throttled, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }
            console.error('❌ [EDIT] Failed to ensure anonymous save:', error);
            throw error;
          }
        }
        return anonymousArchitectureService.getArchitectureIdFromUrl();
      };

      if (!finalArchId && hasGraphContent) {
        console.log('💾 [EDIT] Ensuring architecture has a shareable ID...');
        try {
          finalArchId = await ensureArchitectureSaved();
        } catch (error) {
          console.error('❌ [EDIT] Failed to ensure architecture save, falling back to local session storage:', error);
        }
      }

      if (!finalArchId && (hasGraphContent || hasChatContent)) {
        // Fallback: store the current rawGraph in sessionStorage so canvas can recover if Firestore save fails
        try {
          const fallbackId = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          const fallbackName = getUserPrompt() || 'Unsaved Architecture';
          const payload = {
            rawGraph: rawGraphWithViewState,
            userPrompt: getUserPrompt(),
            chatMessages: chatMessagesSnapshot,
            createdAt: Date.now(),
            name: fallbackName,
            viewState: viewStateSnapshot,
          };
          const serialized = JSON.stringify(payload);
          sessionStorage.setItem(`${EMBED_PENDING_ARCH_PREFIX}${fallbackId}`, serialized);
          try {
            localStorage.setItem(`${EMBED_PENDING_ARCH_PREFIX}${fallbackId}`, serialized);
          } catch (localError) {
            console.warn('⚠️ [EDIT] Unable to persist fallback to localStorage:', localError);
          }
          finalArchId = fallbackId;
          console.log('🗄️ [EDIT] Stored fallback architecture in sessionStorage with ID:', fallbackId);
        } catch (storageError) {
          console.error('❌ [EDIT] Failed to persist fallback architecture:', storageError);
        }
      }

      if (!finalArchId) {
        console.error('❌ [EDIT] Unable to determine architecture ID for editing. Aborting navigation.');
        return;
      }

      if ((hasGraphContent || hasChatContent) && typeof window !== 'undefined') {
        try {
          const storageKey = `${EMBED_PENDING_ARCH_PREFIX}${finalArchId}`;
          const fallbackName = getUserPrompt() || 'Unsaved Architecture';
          const payload = {
            rawGraph: rawGraphWithViewState,
            userPrompt: getUserPrompt(),
            chatMessages: chatMessagesSnapshot,
            createdAt: Date.now(),
            name: fallbackName,
            viewState: viewStateSnapshot,
          };
          const serialized = JSON.stringify(payload);
          try {
            sessionStorage.setItem(storageKey, serialized);
            console.log('✅ [EDIT] Stored fallback payload in sessionStorage:', storageKey, 'chatCount:', chatMessagesSnapshot.length);
          } catch (error) {
            console.warn('⚠️ [EDIT] Failed to persist fallback architecture to sessionStorage:', error);
          }
          try {
            localStorage.setItem(storageKey, serialized);
            console.log('✅ [EDIT] Stored fallback payload in localStorage:', storageKey, 'chatCount:', chatMessagesSnapshot.length);
          } catch (error) {
            console.warn('⚠️ [EDIT] Failed to persist fallback architecture to localStorage:', error);
          }
          try {
            const chatSnapshot = JSON.stringify(chatMessagesSnapshot);
            if (chatSnapshot) {
              sessionStorage.setItem(EMBED_PENDING_CHAT_KEY, chatSnapshot);
              localStorage.setItem(EMBED_PENDING_CHAT_KEY, chatSnapshot);
              chatSnapshotRef.current = chatSnapshot;
              console.log('✅ [EDIT] Stored embed chat snapshot for transition, length:', chatMessagesSnapshot.length);
            }
          } catch (error) {
            console.warn('⚠️ [EDIT] Failed to store embed chat snapshot:', error);
          }
        } catch (error) {
          console.warn('⚠️ [EDIT] Unexpected error while preparing fallback payload:', error);
        }
      }

      const urlObject = new URL(targetUrl);
      urlObject.searchParams.set('arch', finalArchId);
      if (userPromptForTransition) {
        console.log('📝 [EDIT] userPromptForTransition:', userPromptForTransition);
        urlObject.searchParams.set('embedPrompt', userPromptForTransition);
      }
      const latestSnapshotForUrl = getLatestChatSnapshot();
      console.log('📝 [EDIT] Latest snapshot length for URL:', latestSnapshotForUrl ? latestSnapshotForUrl.length : 0);
      if (latestSnapshotForUrl) {
        try {
          const encodedSnapshot = window.btoa(unescape(encodeURIComponent(latestSnapshotForUrl)));
          urlObject.searchParams.set('embedChatSnapshot', encodedSnapshot);
        } catch (error) {
          console.warn('⚠️ [EDIT] Failed to encode chat snapshot for URL:', error);
        }
      }
      targetUrl = urlObject.toString();
      (window as any).__targetUrlForEdit = targetUrl;
      
      console.log('🚀 [EDIT] Opening main app:', targetUrl);
      // Ensure chat persistence exists for canvas validation
      try {
        const existing = collectChatMessages();
        if (existing.length === 0 && userPromptForTransition) {
          saveChatMessage(String(userPromptForTransition), 'user');
        }
      } catch {}
      // Mark the embed-to-canvas transition
      markEmbedToCanvasTransition();
      const latestSnapshot = getLatestChatSnapshot();
      const snapshotPayload = {
        conversation: latestSnapshot,
        prompt: userPromptForTransition || ''
      };

      const newWindow = window.open(targetUrl, '_blank');
      if (newWindow) {
        try {
          const encoded = window.btoa(unescape(encodeURIComponent(JSON.stringify(snapshotPayload))));
          newWindow.name = `embed-${encoded}`;
        } catch (error) {
          console.warn('⚠️ [EDIT] Failed to encode chat snapshot payload for window name:', error);
        }
      }
      (window as any).__embedChatPayload = snapshotPayload.conversation;

      const snapshotForMessage = getLatestChatSnapshot();

      if (newWindow && snapshotForMessage) {
        const sendSnapshot = () => {
          try {
            newWindow.postMessage(
              {
                type: 'embed-chat-snapshot',
                conversation: snapshotForMessage,
                prompt: userPromptForTransition || null,
              },
              window.location.origin
            );
          } catch {}
        };

        setTimeout(sendSnapshot, 200);
        setTimeout(sendSnapshot, 800);
      }
    } catch (error) {
      console.error('❌ [EDIT] Failed to open main app:', error);
    }
  };

  const handleCanvasSave = () => {
    // Preserve the architecture ID from the current URL when redirecting to auth
    const currentParams = new URLSearchParams(window.location.search);
    const archId = currentParams.get('arch');
    
    let authUrl = window.location.origin + '/auth';
    if (archId) {
      authUrl += `?arch=${archId}`;
      console.log('🔗 Preserving architecture ID in profile redirect:', archId);
    }
    
    window.location.href = authUrl;
  };

  return (
    <div className="flex items-center gap-3">
      {/* Export Button */}
      {config.allowExporting && onExport && (
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all duration-200"
          title="Export architecture"
        >
          <Download className="w-4 h-4" />
          <span className="text-sm font-medium">Export</span>
        </button>
      )}
      
      {/* Save Button (when allowed by view mode) or Edit Button (when not signed in or public mode) */}
      {config.showSaveButton ? (
        <button
          onClick={handleManualSave}
          disabled={isSaving || !rawGraph || !rawGraph.children || rawGraph.children.length === 0}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border border-gray-200 hover:shadow-md transition-all duration-200 ${
            isSaving 
              ? 'bg-blue-100 text-blue-600 cursor-not-allowed' 
              : (!rawGraph || !rawGraph.children || rawGraph.children.length === 0)
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          title={
            isSaving ? 'Saving...' 
            : (!rawGraph || !rawGraph.children || rawGraph.children.length === 0) ? 'Create some content first to save'
            : 'Save current architecture'
          }
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          ) : saveSuccess ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">Save</span>
        </button>
      ) : config.showEditButton ? (
        <button
          onClick={handleEditClick}
          className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all duration-200"
          title="Edit in full app"
        >
          <Edit className="w-4 h-4" />
          <span className="text-sm font-medium">Edit</span>
        </button>
      ) : null}
      
      {/* Profile/Auth - Show when allowed by view mode */}
      {config.showProfileSection && (
        <SaveAuth 
          onSave={!config.requiresAuth ? handleCanvasSave : handleSave} 
          isCollapsed={true} 
          user={user} 
        />
      )}
    </div>
  );
};

export default ViewControls;
