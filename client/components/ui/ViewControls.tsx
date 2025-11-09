import React from 'react';
import { Save, Edit, Check, Download } from 'lucide-react';
import { useViewMode } from '../../contexts/ViewModeContext';
import SaveAuth from '../auth/SaveAuth';
import { markEmbedToCanvasTransition } from '../../utils/chatPersistence';
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
}

const ViewControls: React.FC<ViewControlsProps> = ({
  isSaving = false,
  saveSuccess = false,
  rawGraph,
  handleManualSave,
  handleSave,
  user,
  onExport
}) => {
  const { config } = useViewMode();

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

      const getUserPrompt = () =>
        (window as any).originalChatTextInput ||
        (window as any).chatTextInput ||
        '';

      const ensureArchitectureSaved = async (): Promise<string | null> => {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const ensuredId = await ensureAnonymousSaved({
              rawGraph,
              userPrompt: getUserPrompt(),
              anonymousService: anonymousArchitectureService,
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

      if (!finalArchId && hasGraphContent) {
        // Fallback: store the current rawGraph in sessionStorage so canvas can recover if Firestore save fails
        try {
          const fallbackId = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          const chatMessagesRaw = localStorage.getItem('atelier_current_conversation');
          const chatMessages = chatMessagesRaw ? JSON.parse(chatMessagesRaw) : [];
          const fallbackName = getUserPrompt() || 'Unsaved Architecture';
          const payload = {
            rawGraph,
            userPrompt: getUserPrompt(),
            chatMessages,
            createdAt: Date.now(),
            name: fallbackName,
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

      const separator = targetUrl.includes('?') ? '&' : '?';
      targetUrl += `${separator}arch=${finalArchId}`;
      
      console.log('🚀 [EDIT] Opening main app:', targetUrl);
      // Ensure chat persistence exists for canvas validation
      try {
        const userPrompt = getUserPrompt();
        const existing = localStorage.getItem('atelier_current_conversation');
        const parsed = existing ? JSON.parse(existing) : [];
        if (parsed.length === 0 && userPrompt) {
          localStorage.setItem('atelier_current_conversation', JSON.stringify([{ content: String(userPrompt) }]));
        }
      } catch {}
      // Mark the embed-to-canvas transition
      markEmbedToCanvasTransition();
      window.open(targetUrl, '_blank');
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
