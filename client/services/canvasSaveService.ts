import { User } from 'firebase/auth';
import ArchitectureService from './architectureService';
import { anonymousArchitectureService } from './anonymousArchitectureService';
import { ensureAnonymousSaved } from '../utils/anonymousSave';
import { normalizeChatMessages, getCurrentConversation } from '../utils/chatPersistence';

export const AUTO_SAVE_DEBOUNCE_MS = 2 * 60 * 1000; // 2 minutes

export interface SavedArchitecture {
  id: string;
  name: string;
  timestamp: Date;
  rawGraph: any;
  userPrompt?: string;
  firebaseId?: string;
  isFromFirebase?: boolean;
  viewState?: any;
  chatMessages?: any[];
}

export interface SaveServiceDependencies {
  user: User | null;
  selectedArchitectureId: string;
  savedArchitectures: SavedArchitecture[];
  setSavedArchitectures: (updater: (prev: SavedArchitecture[]) => SavedArchitecture[]) => void;
  rawGraph: any;
  isPublicMode: boolean;
  getViewStateSnapshot: () => any;
  isHydratingRef: React.MutableRefObject<boolean>;
  dirtySinceRef: React.MutableRefObject<number | null>;
  remoteSaveTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

export class CanvasSaveService {
  constructor(private deps: SaveServiceDependencies) {}

  /**
   * Flushes pending changes to remote storage (Firebase)
   */
  flushRemoteSave = async (reason: 'auto' | 'manual') => {
    if (this.deps.isHydratingRef.current) return;
    if (!this.deps.rawGraph) return;

    const viewStateSnapshot = this.deps.getViewStateSnapshot();
    const graphWithViewState = viewStateSnapshot
      ? { ...this.deps.rawGraph, viewState: viewStateSnapshot }
      : this.deps.rawGraph;

    try {
      if (this.deps.user && this.deps.selectedArchitectureId && this.deps.selectedArchitectureId !== 'new-architecture') {
        const architecture = this.deps.savedArchitectures.find(arch => arch.id === this.deps.selectedArchitectureId);
        if (!architecture) {
          console.warn('[AUTO-SAVE] Selected architecture not found in cache, skipping remote save');
        } else {
          const firebaseId = architecture.firebaseId || architecture.id;
          const chatMessages = normalizeChatMessages(getCurrentConversation()) ?? [];

          await ArchitectureService.updateArchitecture(firebaseId, {
            rawGraph: graphWithViewState,
            chatMessages,
            viewState: viewStateSnapshot,
          });

          this.deps.setSavedArchitectures(prev =>
            prev.map(arch =>
              arch.id === this.deps.selectedArchitectureId
                ? {
                    ...arch,
                    chatMessages,
                    rawGraph: graphWithViewState,
                    viewState: viewStateSnapshot,
                  }
                : arch
            )
          );
        }
      } else if (
        this.deps.isPublicMode &&
        !this.deps.user &&
        graphWithViewState?.children &&
        graphWithViewState.children.length > 0
      ) {
        const userPrompt =
          (window as any).originalChatTextInput || (window as any).chatTextInput || '';
        await ensureAnonymousSaved({
          rawGraph: graphWithViewState,
          userPrompt,
          anonymousService: anonymousArchitectureService,
          metadata: viewStateSnapshot ? { viewState: viewStateSnapshot } : undefined,
        });
      }
    } catch (error) {
      console.error('❌ Remote save failed:', error);
    } finally {
      this.deps.dirtySinceRef.current = null;
      if (this.deps.remoteSaveTimeoutRef.current) {
        clearTimeout(this.deps.remoteSaveTimeoutRef.current);
        this.deps.remoteSaveTimeoutRef.current = null;
      }
    }
  };

  /**
   * Requests a debounced remote save
   */
  requestRemoteSave = () => {
    if (this.deps.remoteSaveTimeoutRef.current) {
      clearTimeout(this.deps.remoteSaveTimeoutRef.current);
    }
    this.deps.remoteSaveTimeoutRef.current = setTimeout(() => {
      this.flushRemoteSave('auto');
    }, AUTO_SAVE_DEBOUNCE_MS);
  };

  /**
   * Marks the canvas as dirty and triggers a debounced save
   */
  markDirty = () => {
    if (this.deps.isHydratingRef.current) return;
    this.deps.dirtySinceRef.current = Date.now();
    this.requestRemoteSave();
  };

  /**
   * Cancels any pending save operations
   */
  cancelPendingSave = () => {
    if (this.deps.remoteSaveTimeoutRef.current) {
      clearTimeout(this.deps.remoteSaveTimeoutRef.current);
      this.deps.remoteSaveTimeoutRef.current = null;
    }
    this.deps.dirtySinceRef.current = null;
  };

  /**
   * Checks if there are unsaved changes
   */
  hasUnsavedChanges = (): boolean => {
    return this.deps.dirtySinceRef.current !== null;
  };

  /**
   * Gets the timestamp of the last change
   */
  getLastChangeTimestamp = (): number | null => {
    return this.deps.dirtySinceRef.current;
  };
}
