import { User } from 'firebase/auth';
import ArchitectureService from './architectureService';
import { anonymousArchitectureService } from './anonymousArchitectureService';
import { ensureUniqueName } from '../utils/naming';
import { copyToClipboard } from '../utils/copyToClipboard';

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

export interface NotificationOptions {
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
}

export interface ArchitectureServiceDependencies {
  user: User | null;
  savedArchitectures: SavedArchitecture[];
  setSavedArchitectures: (updater: (prev: SavedArchitecture[]) => SavedArchitecture[]) => void;
  selectedArchitectureId: string;
  setSelectedArchitectureId: (id: string) => void;
  setCurrentChatName: (name: string) => void;
  setRawGraph: (graph: any) => void;
  viewStateRef: React.MutableRefObject<any>;
  getViewStateSnapshot: () => any;
  showNotification: (type: string, title: string, message: string, options?: NotificationOptions) => void;
  hideNotification: () => void;
  setDeleteOverlay: (overlay: any) => void;
  setInputOverlay: (overlay: any) => void;
  setShareOverlay: (overlay: any) => void;
}

export class CanvasArchitectureService {
  constructor(private deps: ArchitectureServiceDependencies) {}

  handleNewArchitecture = () => {
    // Reset to "New Architecture" tab
    console.log('🆕 [DEBUG] handleNewArchitecture called - clearing canvas');
    console.trace('🆕 [DEBUG] Stack trace for handleNewArchitecture');
    this.deps.setSelectedArchitectureId('new-architecture');
    this.deps.setCurrentChatName('New Architecture');
    
    // Clear the canvas by setting empty graph
    const emptyGraph = {
      id: "root",
      children: [],
      edges: []
    };
    this.deps.setRawGraph(emptyGraph);
    this.deps.viewStateRef.current = { node: {}, group: {}, edge: {} };
    
    // Reset the "New Architecture" tab name in case it was changed
    this.deps.setSavedArchitectures(prev => prev.map(arch => 
      arch.id === 'new-architecture' 
        ? { ...arch, name: 'New Architecture', isNew: true, rawGraph: emptyGraph, viewState: undefined }
        : arch
    ));
  };

  handleDeleteArchitecture = async (architectureId: string) => {
    if (architectureId === 'new-architecture') {
      this.deps.showNotification('error', 'Cannot Delete', 'Cannot delete the "New Architecture" tab');
      return;
    }

    const architecture = this.deps.savedArchitectures.find(arch => arch.id === architectureId);
    if (!architecture) {
      console.warn('⚠️ Architecture not found for deletion:', architectureId);
      this.deps.showNotification('error', 'Architecture Not Found', 'The selected architecture could not be found.');
      return;
    }

    // Show delete confirmation overlay
    this.deps.setDeleteOverlay({
      show: true,
      title: 'Delete Architecture',
      message: `Are you sure you want to delete "${architecture.name}"? This action cannot be undone.`,
      onConfirm: async () => {
        this.deps.setDeleteOverlay(prev => ({ ...prev, show: false }));
        
        try {
          // Always attempt to delete from Firebase if user is signed in
          if (this.deps.user?.uid) {
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
          this.deps.setSavedArchitectures(prev => prev.filter(arch => arch.id !== architectureId));
          
          // If the deleted architecture was selected, switch to "New Architecture"
          if (this.deps.selectedArchitectureId === architectureId) {
            this.deps.setSelectedArchitectureId('new-architecture');
            const emptyGraph = { id: "root", children: [], edges: [] };
            this.deps.setRawGraph(emptyGraph);
          }

          console.log('✅ Architecture deleted locally and from Firebase');
          this.deps.showNotification('success', 'Deleted', `Architecture "${architecture.name}" has been deleted`);
          
        } catch (error) {
          console.error('❌ Error deleting architecture:', error);
          this.deps.showNotification('error', 'Delete Failed', `Failed to delete architecture: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },
      onCancel: () => {
        this.deps.setDeleteOverlay(prev => ({ ...prev, show: false }));
      }
    });
  };

  handleShareArchitecture = async (architectureId: string) => {
    const architecture = this.deps.savedArchitectures.find(arch => arch.id === architectureId);
    if (!architecture) {
      console.warn('⚠️ Architecture not found for sharing:', architectureId);
      this.deps.showNotification('error', 'Architecture Not Found', 'The selected architecture could not be found.');
      return;
    }

    try {
      console.log('📤 Sharing architecture from sidebar:', architectureId, architecture.name);
      
      // Create a shareable anonymous copy so anonymous users can access it
      console.log('📤 Creating shareable anonymous copy of architecture:', architecture.name);
      
      const viewStateSnapshot = architecture.viewState || this.deps.getViewStateSnapshot();
      let anonymousId;
      try {
        anonymousId = await anonymousArchitectureService.saveAnonymousArchitecture(
          `${architecture.name} (Shared)`,
          viewStateSnapshot ? { ...architecture.rawGraph, viewState: viewStateSnapshot } : architecture.rawGraph,
          architecture.userPrompt,  // Include userPrompt when sharing
          viewStateSnapshot
        );
      } catch (error: any) {
        console.warn('⚠️ Share creation throttled:', error.message);
        this.deps.showNotification('error', 'Share Throttled', 'Please wait a moment before sharing again.');
        return;
      }
      
      // Create shareable URL using the anonymous copy ID
      if (typeof window === 'undefined') return;
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('arch', anonymousId);
      const shareUrl = currentUrl.toString();
      
      // Always show overlay, try clipboard as enhancement
      const clipboardSuccess = await copyToClipboard(shareUrl, {
        successMessage: 'Sidebar share link copied to clipboard',
        errorMessage: 'Failed to copy sidebar share link',
        showFeedback: false // Already logging ourselves
      });
      
      // Always show overlay regardless of clipboard success
      this.deps.setShareOverlay({ show: true, url: shareUrl, copied: clipboardSuccess });
      
      console.log('✅ Architecture share link created:', shareUrl);
    } catch (error) {
      console.error('❌ Failed to share architecture:', error);
      this.deps.showNotification('error', 'Share Failed', 'Failed to create share link. Please try again.');
    }
  };

  handleEditArchitecture = (architectureId: string) => {
    const architecture = this.deps.savedArchitectures.find(arch => arch.id === architectureId);
    if (!architecture) {
      console.warn('⚠️ Architecture not found for editing:', architectureId);
      this.deps.showNotification('error', 'Architecture Not Found', 'The selected architecture could not be found.');
      return;
    }

    // Show input overlay for renaming
    this.deps.setInputOverlay({
      show: true,
      title: 'Rename Architecture',
      placeholder: 'Enter architecture name',
      defaultValue: architecture.name,
      onConfirm: (newName: string) => {
        this.deps.setInputOverlay(prev => ({ ...prev, show: false }));
        
        if (newName && newName.trim() && newName !== architecture.name) {
          // Ensure the new name is unique
          const otherArchitectures = this.deps.savedArchitectures.filter(arch => arch.id !== architectureId);
          const uniqueName = ensureUniqueName(newName.trim(), otherArchitectures);
          
          if (uniqueName !== newName.trim()) {
            this.deps.showNotification('confirm', 'Name Already Exists', `The name "${newName.trim()}" already exists. Use "${uniqueName}" instead?`, {
              onConfirm: () => {
                this.deps.hideNotification();
                this.performRename(architectureId, uniqueName);
              },
              onCancel: this.deps.hideNotification,
              confirmText: 'Use New Name',
              cancelText: 'Cancel'
            });
            return;
          }
          
          this.performRename(architectureId, uniqueName);
        }
      },
      onCancel: () => {
        this.deps.setInputOverlay(prev => ({ ...prev, show: false }));
      }
    });
  };

  private performRename = (architectureId: string, newName: string) => {
    const architecture = this.deps.savedArchitectures.find(arch => arch.id === architectureId);
    if (!architecture) return;
      
    // Update locally
    this.deps.setSavedArchitectures(prev => prev.map(arch => 
      arch.id === architectureId 
      ? { ...arch, name: newName }
        : arch
    ));

    // Update in Firebase if it exists there
    if (architecture.isFromFirebase && this.deps.user?.uid) {
      const firebaseId = architecture.firebaseId || architecture.id;
      ArchitectureService.updateArchitecture(firebaseId, { name: newName })
        .then(() => {
          console.log('✅ Architecture name updated in Firebase');
          this.deps.showNotification('success', 'Renamed Successfully', `Architecture renamed to "${newName}"`);
        })
        .catch(error => {
          console.error('❌ Error updating name in Firebase:', error);
          this.deps.showNotification('error', 'Update Failed', 'Failed to update name in the cloud. Changes saved locally.');
        });
    } else {
      this.deps.showNotification('success', 'Renamed Successfully', `Architecture renamed to "${newName}"`);
    }
  };

  handleSelectArchitecture = (architectureId: string, getCurrentConversation: () => any[], mergeChatMessages: (a: any[], b: any[]) => any[], normalizeChatMessages: (msgs: any[]) => any[]) => {
    console.log('🔄 Selecting architecture:', architectureId);
    
    // Save current architecture before switching (if it has content and is not the same architecture)
    if (this.deps.selectedArchitectureId !== architectureId && this.deps.savedArchitectures.find(arch => arch.id === this.deps.selectedArchitectureId)?.rawGraph?.children?.length > 0) {
      console.log('💾 Saving current architecture before switching:', this.deps.selectedArchitectureId);
      const viewStateSnapshot = this.deps.getViewStateSnapshot();
      const currentArch = this.deps.savedArchitectures.find(arch => arch.id === this.deps.selectedArchitectureId);
      if (currentArch?.rawGraph) {
        const rawGraphWithViewState = viewStateSnapshot ? { ...currentArch.rawGraph, viewState: viewStateSnapshot } : currentArch.rawGraph;
        this.deps.setSavedArchitectures(prev => prev.map(arch => 
          arch.id === this.deps.selectedArchitectureId 
            ? { ...arch, rawGraph: rawGraphWithViewState, viewState: viewStateSnapshot, timestamp: new Date() }
            : arch
        ));
      }
    }
    
    this.deps.setSelectedArchitectureId(architectureId);
    
    // Only update global architecture ID if agent is not locked to another architecture
    const agentLockedArchitectureId = (window as any).agentLockedArchitectureId;
    if (!agentLockedArchitectureId) {
      (window as any).currentArchitectureId = architectureId;
      console.log('🎯 Updated agent target architecture ID to:', architectureId);
    } else {
      console.log('🔒 Agent is locked to architecture:', agentLockedArchitectureId, '- not retargeting');
    }
    
    // Load the architecture data from dynamic savedArchitectures
    const architecture = this.deps.savedArchitectures.find(arch => arch.id === architectureId);
    
    if (architecture && architecture.rawGraph) {
      console.log('📂 Loading architecture:', architecture.name);
      
      // Update the current chat name to match the selected architecture
      this.deps.setCurrentChatName(architecture.name);
      console.log('🏷️ Updated chat name to:', architecture.name);
      console.log('🏷️ Selected architecture details:', { id: architecture.id, name: architecture.name, hasRawGraph: !!architecture.rawGraph });

      if (architecture.chatMessages && architecture.chatMessages.length > 0) {
        try {
          const mergedConversation = mergeChatMessages(
            getCurrentConversation(),
            normalizeChatMessages(architecture.chatMessages)
          );
          if (mergedConversation && mergedConversation.length > 0) {
            const serialized = JSON.stringify(mergedConversation);
            localStorage.setItem('atelier_current_conversation', serialized);
            (window as any).__atelierLastConversation = serialized;
            console.log('💬 [ARCH-SELECT] Hydrated chat from architecture:', mergedConversation.length);
          }
        } catch (error) {
          console.warn('⚠️ [ARCH-SELECT] Failed to hydrate chat for architecture:', error);
        }
      }
      
      // Use typed event system for architecture loading
      let viewStateSnapshot = undefined;
      if (architecture.viewState) {
        try {
          viewStateSnapshot = JSON.parse(JSON.stringify(architecture.viewState));
        } catch (error) {
          console.warn('⚠️ [ARCH-SELECT] Failed to clone viewState snapshot:', error);
          viewStateSnapshot = architecture.viewState;
        }
        this.deps.viewStateRef.current = viewStateSnapshot ?? { node: {}, group: {}, edge: {} };
      } else {
        this.deps.viewStateRef.current = this.deps.viewStateRef.current || { node: {}, group: {}, edge: {} };
      }

      const graphWithViewState = viewStateSnapshot
        ? { ...architecture.rawGraph, viewState: viewStateSnapshot }
        : architecture.rawGraph;

      this.deps.setRawGraph(graphWithViewState);
      
      console.log('✅ [ARCH-SELECT] Architecture loaded successfully:', architecture.name);
    } else if (architectureId === 'new-architecture') {
      console.log('📄 [ARCH-SELECT] Switching to New Architecture tab');
      this.deps.setCurrentChatName('New Architecture');
      
      // Don't clear the canvas if it already has content - let user decide
      const currentGraph = this.deps.savedArchitectures.find(arch => arch.id === 'new-architecture')?.rawGraph;
      if (currentGraph) {
        this.deps.setRawGraph(currentGraph);
      }
    } else {
      console.warn('⚠️ [ARCH-SELECT] Architecture not found or has no content:', architectureId);
    }
  };
}
