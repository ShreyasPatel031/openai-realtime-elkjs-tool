/**
 * Centralized anonymous architecture save/update utilities
 * Extracted from InteractiveCanvas to reduce duplication
 */

import { Timestamp } from 'firebase/firestore';

export const EMBED_PENDING_ARCH_PREFIX = 'embed_pending_arch_' as const;
import { generateNameWithFallback } from './naming';

export interface AnonymousArchitectureService {
  getArchitectureIdFromUrl(): string | null;
  saveAnonymousArchitecture(name: string, graph: any, userPrompt?: string, viewState?: any): Promise<string>;
  updateAnonymousArchitecture(id: string, payload: any): Promise<void>;
}

/**
 * Ensures anonymous architecture is saved/updated with ID reuse
 * This replaces repeated anonymous save logic throughout InteractiveCanvas
 */
export async function ensureAnonymousSaved({
  rawGraph,
  userPrompt,
  anonymousService,
  existingId,
  metadata = {},
}: {
  rawGraph: any;
  userPrompt?: string;
  anonymousService: AnonymousArchitectureService;
  existingId?: string | null;
  metadata?: any;
}) {
  console.log('💾 ensureAnonymousSaved called with:', { 
    hasGraph: !!rawGraph,
    hasPrompt: !!userPrompt,
    hasExisting: !!existingId,
    nodeCount: rawGraph?.children?.length || 0
  });

  try {
    const id = existingId ?? anonymousService.getArchitectureIdFromUrl();
    let chatMessages: Array<{ id: string; content: string; timestamp: number; sender: 'user' | 'assistant' | 'system' }> | undefined;
    if (typeof window !== 'undefined') {
      try {
        const { getCurrentConversation, normalizeChatMessages } = await import('./chatPersistence');
        const rawConversation = getCurrentConversation();
        console.log('💬 [ENSURE-ANON] Raw conversation before normalize:', rawConversation);
        const normalized = normalizeChatMessages(rawConversation);
        if (normalized) {
          chatMessages = normalized;
        }
      } catch (error) {
        console.warn('⚠️ ensureAnonymousSaved: failed to load chat conversation for persistence', error);
      }
    }
    
    const viewState = metadata?.viewState;

    if (id) {
      // Update existing anonymous architecture
      console.log('🔄 Updating existing anonymous architecture:', id);
      
      const updatePayload = {
        rawGraph,
        timestamp: Timestamp.now(),
        ...metadata
      };
      
      if (userPrompt) {
        updatePayload.userPrompt = userPrompt;
      }
      
      if (chatMessages && chatMessages.length > 0) {
        updatePayload.chatMessages = chatMessages;
      }
      
      await anonymousService.updateAnonymousArchitecture(id, updatePayload);
      console.log('✅ Anonymous architecture updated successfully');
      return id;
    }
    
    // Create new anonymous architecture with AI-generated name
    console.log('🤖 Generating name for new anonymous architecture');
    const name = await generateNameWithFallback(rawGraph, userPrompt);

    const newId = await anonymousService.saveAnonymousArchitecture(name, rawGraph, userPrompt, viewState);
    console.log('✅ New anonymous architecture saved with ID:', newId, 'with userPrompt:', userPrompt ? 'YES' : 'NO');
    return newId;
    
  } catch (error) {
    console.error('❌ ensureAnonymousSaved failed:', error);
    
    // Check if this is the expected "No document to update" error after architecture transfer
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('No document to update') || errorMessage.includes('Document does not exist')) {
      console.log('📝 Architecture may已被 transferred to user account, this is expected');
      return null;
    }
    
    throw error;
  }
}

/**
 * Simple anonymous share functionality
 * Creates a copy of an architecture for sharing
 */
export async function createAnonymousShare({
  architectureName,
  rawGraph,
  anonymousService,
  viewState,
}: {
  architectureName: string;
  rawGraph: any;
  anonymousService: AnonymousArchitectureService;
  viewState?: any;
}) {
  console.log('📤 Creating anonymous share copy');
  
  const anonymousId = await anonymousService.saveAnonymousArchitecture(
    `${architectureName} (Shared)`,
    rawGraph,
    undefined,
    viewState
  );
  
  console.log('✅ Anonymous share created with ID:', anonymousId);
  return anonymousId;
}

/**
 * Handle auto-save for anonymous architectures in public mode
 * Simplified version for periodic saves
 */
export async function autoSaveAnonymous({
  rawGraph,
  anonymousService,
  viewState,
}: {
  rawGraph: any;
  anonymousService: AnonymousArchitectureService;
  viewState?: any;
}) {
  console.log('⏰ Auto-saving anonymous architecture...');
  
  try {
    const architectureName = `Architecture ${new Date().toLocaleDateString()}`;
    const newArchId = await anonymousService.saveAnonymousArchitecture(
      architectureName,
      rawGraph,
      undefined,
      viewState
    );
    
    console.log('✅ Auto-save completed with ID:', newArchId);
    return newArchId;
  } catch (error) {
    console.error('❌ Auto-save failed:', error);
    return null;
  }
}
