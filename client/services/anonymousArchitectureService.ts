/**
 * Anonymous Architecture Service - Handles saving architectures for non-signed-in users
 */

import { collection, addDoc, doc, updateDoc, query, where, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Timestamp } from 'firebase/firestore';

export interface AnonymousArchitecture {
  id?: string;
  name: string;
  rawGraph: any;
  sessionId: string; // Unique session identifier for anonymous user
  timestamp: Timestamp;
  isAnonymous: true;
  userAgent?: string;
  ipHash?: string; // For cleanup purposes (hashed IP)
  userPrompt?: string; // Original user prompt that created the architecture
  chatMessages?: Array<{
    id: string;
    content: string;
    timestamp: number;
    sender: 'user' | 'assistant';
  }>;
}

class AnonymousArchitectureService {
  private sessionId: string | null = null
  private lastSaveTime: number = 0
  private saveThrottleMs: number = 1000 // Minimum 1 second between saves (reasonable spam protection);
  private firestoreUnavailable = false
  private readonly disableFirestore = import.meta.env.VITE_FIREBASE_API_KEY === 'test-firebase-api-key'
  private readonly fallbackStorageKey = 'anonymous_architectures_fallback'

  /**
   * Get or create a session ID for anonymous user
   */
  private getSessionId(): string {
    if (this.sessionId) {
      return this.sessionId;
    }

    // Check localStorage first
    let sessionId = localStorage.getItem('anonymous_session_id');
    
    if (!sessionId) {
      // Generate new session ID
      sessionId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('anonymous_session_id', sessionId);
    }

    this.sessionId = sessionId;
    return sessionId;
  }
  
  private shouldUseFirestore(): boolean {
    return !this.disableFirestore && !this.firestoreUnavailable;
  }

  private markFirestoreUnavailable(error?: unknown) {
    if (!this.firestoreUnavailable) {
      console.warn('⚠️ Firestore unavailable, falling back to local storage for anonymous architectures.', error);
    }
    this.firestoreUnavailable = true;
  }

  private getFallbackStore(): Record<string, any> {
    if (typeof window === 'undefined') return {};
    try {
      const fromLocal = window.localStorage.getItem(this.fallbackStorageKey);
      const fromSession = window.sessionStorage.getItem(this.fallbackStorageKey);
      const raw = fromLocal || fromSession;
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (error) {
      console.warn('⚠️ Failed to read fallback anonymous architecture store:', error);
      return {};
    }
  }

  private saveFallbackStore(store: Record<string, any>) {
    if (typeof window === 'undefined') return;
    const serialized = JSON.stringify(store);
    try {
      window.localStorage.setItem(this.fallbackStorageKey, serialized);
    } catch (error) {
      console.warn('⚠️ Unable to persist fallback anonymous architectures to localStorage:', error);
    }
    try {
      window.sessionStorage.setItem(this.fallbackStorageKey, serialized);
    } catch (error) {
      console.warn('⚠️ Unable to persist fallback anonymous architectures to sessionStorage:', error);
    }
  }

  private buildFallbackEntry(
    id: string,
    data: Omit<AnonymousArchitecture, 'id' | 'timestamp'> & { timestamp?: Timestamp | number }
  ) {
    const timestampMs =
      typeof data.timestamp === 'number'
        ? data.timestamp
        : data.timestamp instanceof Timestamp
          ? data.timestamp.toMillis()
          : Date.now();

    return {
      ...data,
      id,
      timestamp: timestampMs,
      isAnonymous: true as const,
    };
  }

  private convertFallbackEntry(entry: any): AnonymousArchitecture {
    return {
      ...entry,
      timestamp: typeof entry.timestamp === 'number'
        ? Timestamp.fromMillis(entry.timestamp)
        : entry.timestamp ?? Timestamp.now(),
      isAnonymous: true,
    } as AnonymousArchitecture;
  }

  private saveAnonymousArchitectureToFallback(anonymousArch: Omit<AnonymousArchitecture, 'id'>): string {
    const store = this.getFallbackStore();
    const id = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    store[id] = this.buildFallbackEntry(id, anonymousArch);
    this.saveFallbackStore(store);
    this.updateUrlWithArchitectureId(id);
    console.log('✅ Saved anonymous architecture to fallback store:', id);
    return id;
  }

  private updateFallbackArchitecture(id: string, updates: Partial<AnonymousArchitecture>): void {
    const store = this.getFallbackStore();
    if (!store[id]) {
      return;
    }
    store[id] = this.buildFallbackEntry(id, {
      ...(store[id] as any),
      ...updates,
      timestamp: Date.now(),
    });
    this.saveFallbackStore(store);
    console.log('✅ Updated anonymous architecture in fallback store:', id);
  }

  private loadFallbackArchitecture(id: string): AnonymousArchitecture | null {
    const store = this.getFallbackStore();
    if (!store[id]) return null;
    return this.convertFallbackEntry(store[id]);
  }

  private getAllFallbackArchitectures(): AnonymousArchitecture[] {
    const store = this.getFallbackStore();
    return Object.values(store)
      .map(entry => this.convertFallbackEntry(entry))
      .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
  }

  private deleteFallbackArchitecture(id: string) {
    const store = this.getFallbackStore();
    if (store[id]) {
      delete store[id];
      this.saveFallbackStore(store);
      console.log('🗑️ Removed anonymous architecture from fallback store:', id);
    }
  }
  
  private async transferFallbackArchitectures(userId: string, userEmail: string): Promise<{count: number, transferredIds: string[]}> {
    const fallbackArchs = this.getAllFallbackArchitectures();
    if (fallbackArchs.length === 0) {
      console.log('ℹ️ No fallback anonymous architectures to transfer');
      return { count: 0, transferredIds: [] };
    }

    const { default: ArchitectureService } = await import('./architectureService');
    const transferredIds: string[] = [];

    for (const arch of fallbackArchs) {
      try {
        let architectureName = arch.name;
        try {
          const response = await fetch('/api/generateChatName', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              architecture: arch.rawGraph,
              nodeCount: arch.rawGraph?.children?.length || 0,
              edgeCount: arch.rawGraph?.edges?.length || 0,
              userPrompt: `Architecture with ${arch.rawGraph?.children?.length || 0} components from user session`
            }),
          });
          if (response.ok) {
            const data = await response.json();
            if (data.name && data.name.trim()) {
              architectureName = data.name.trim();
            }
          }
        } catch (namingError) {
          console.warn('⚠️ AI naming failed for fallback transfer, using original name:', namingError);
        }

        const nodes = arch.rawGraph?.children || [];
        const edges = arch.rawGraph?.edges || [];

        const newArchId = await ArchitectureService.saveArchitecture({
          name: architectureName,
          userId,
          userEmail,
          rawGraph: arch.rawGraph,
          nodes,
          edges,
          userPrompt: `Architecture transferred from anonymous fallback session`,
        });

        transferredIds.push(newArchId);
        this.deleteFallbackArchitecture(arch.id!);
      } catch (error) {
        console.error(`❌ Failed to transfer fallback architecture "${arch.name}":`, error);
      }
    }

    localStorage.removeItem('anonymous_session_id');
    this.sessionId = null;

    console.log(`🎉 Successfully transferred ${transferredIds.length}/${fallbackArchs.length} fallback anonymous architectures`);
    return { count: transferredIds.length, transferredIds };
  }

  /**
   * Save an anonymous architecture
   */
  async saveAnonymousArchitecture(name: string, rawGraph: any, userPrompt?: string): Promise<string> {
    try {
      // Ensure we're running on client side
      if (typeof window === 'undefined') {
        throw new Error('Anonymous architecture saving only works on client side');
      }

      if (!db) {
        this.markFirestoreUnavailable('Firebase db is not initialized');
      }

      const now = Date.now();

      if (now - this.lastSaveTime < this.saveThrottleMs) {
        console.log('⏳ Save throttled - too soon after last save');
        throw new Error('Save throttled - please wait before saving again');
      }

      const sessionId = this.getSessionId();

      const finalUserPrompt = userPrompt
        || (window as any).originalChatTextInput
        || (window as any).chatTextInput
        || '';

      let chatMessages: Array<{id: string; content: string; timestamp: number; sender: 'user' | 'assistant'}> | undefined;
      try {
        const { getCurrentConversation } = await import('../utils/chatPersistence');
        const messages = getCurrentConversation();
        if (messages && messages.length > 0) {
          chatMessages = messages;
        }
      } catch (error) {
        console.warn('Failed to get chat messages for architecture:', error);
      }

      const anonymousArch: Omit<AnonymousArchitecture, 'id'> = {
        name,
        rawGraph,
        sessionId,
        timestamp: Timestamp.now(),
        isAnonymous: true,
        userAgent: navigator.userAgent,
        userPrompt: finalUserPrompt,
        chatMessages,
      };

      console.log('💾 Saving anonymous architecture:', name, 'for session:', sessionId);

      if (this.shouldUseFirestore()) {
        try {
          const docRef = await addDoc(collection(db, 'anonymous_architectures'), anonymousArch);

          console.log('✅ Anonymous architecture saved with ID:', docRef.id);

          this.lastSaveTime = now;
          this.updateUrlWithArchitectureId(docRef.id);

          return docRef.id;
        } catch (firestoreError) {
          this.markFirestoreUnavailable(firestoreError);
        }
      }

      const fallbackId = this.saveAnonymousArchitectureToFallback(anonymousArch);
      this.lastSaveTime = now;
      return fallbackId;
    } catch (error) {
      console.error('❌ Error saving anonymous architecture:', error);
      throw error;
    }
  }

  /**
   * Load a specific anonymous architecture by ID (for shared URLs)
   */
    async loadAnonymousArchitectureById(architectureId: string): Promise<AnonymousArchitecture | null> {
      if (!this.shouldUseFirestore()) {
        return this.loadFallbackArchitecture(architectureId);
      }

      try {
        const docRef = doc(db, 'anonymous_architectures', architectureId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log('📥 Loaded shared anonymous architecture:', architectureId);
          return {
            id: docSnap.id,
            ...data,
            timestamp: data.timestamp || Timestamp.now()
          } as AnonymousArchitecture;
        } else {
          console.warn('⚠️ Anonymous architecture not found in Firestore:', architectureId);
          return this.loadFallbackArchitecture(architectureId);
        }
      } catch (error) {
        this.markFirestoreUnavailable(error);
        const fallback = this.loadFallbackArchitecture(architectureId);
        if (fallback) {
          return fallback;
        }
        console.error('❌ Error loading anonymous architecture:', error);
        return null;
      }
    }

  /**
   * Update URL with architecture ID for sharing
   */
  private updateUrlWithArchitectureId(architectureId: string): void {
    if (typeof window === 'undefined') return;
    
    const url = new URL(window.location.href);
    url.searchParams.set('arch', architectureId);
    
    // Update URL without page reload
    window.history.replaceState({}, '', url.toString());
    console.log('🔗 Updated URL for sharing:', url.toString());
  }

  /**
   * Get architecture ID from URL parameters
   */
  getArchitectureIdFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('arch');
  }

  /**
   * Clear architecture ID from URL
   */
  clearArchitectureIdFromUrl(): void {
    if (typeof window === 'undefined') return;
    
    const url = new URL(window.location.href);
    url.searchParams.delete('arch');
    
    // Update URL without page reload
    window.history.replaceState({}, '', url.toString());
    console.log('🧹 Cleared architecture ID from URL');
  }

  /**
   * Get anonymous architectures for current session
   */
    async getAnonymousArchitectures(): Promise<AnonymousArchitecture[]> {
      if (!this.shouldUseFirestore()) {
        return this.getAllFallbackArchitectures();
      }

      try {
        const sessionId = this.getSessionId();
        
        const q = query(
          collection(db, 'anonymous_architectures'),
          where('sessionId', '==', sessionId),
          where('isAnonymous', '==', true)
        );

        const querySnapshot = await getDocs(q);
        const architectures: AnonymousArchitecture[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          architectures.push({
            id: doc.id,
            ...data,
            timestamp: data.timestamp || Timestamp.now()
          } as AnonymousArchitecture);
        });

        console.log(`📥 Found ${architectures.length} anonymous architectures for session:`, sessionId);
        return architectures.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
      } catch (error) {
        this.markFirestoreUnavailable(error);
        return this.getAllFallbackArchitectures();
      }
  }

  /**
   * Transfer anonymous architectures to signed-in user
   */
  async transferAnonymousArchitectures(userId: string, userEmail: string): Promise<{count: number, transferredIds: string[]}> {
      if (!this.shouldUseFirestore()) {
        return this.transferFallbackArchitectures(userId, userEmail);
      }

    try {
      const sessionId = this.getSessionId();
      console.log('🔄 Transferring anonymous architectures to user:', userEmail, 'from session:', sessionId);

      // Get all anonymous architectures for this session
      const anonymousArchs = await this.getAnonymousArchitectures();
      
      if (anonymousArchs.length === 0) {
        console.log('ℹ️ No anonymous architectures to transfer');
        return {count: 0, transferredIds: []};
      }

      // Import ArchitectureService to save as regular architectures
      const { default: ArchitectureService } = await import('./architectureService');

      let transferredCount = 0;
      const transferredIds: string[] = [];

      for (const arch of anonymousArchs) {
        try {
          // 🔥 Generate AI name when transferring anonymous → user architecture
          console.log('🔥 TRANSFER NAMING - Converting anonymous session architecture to user architecture');
          console.log('📝 Anonymous arch name (should be generic):', arch.name);
          
          let architectureName = arch.name;
          try {
            console.log('🌐 Making API request to /api/generateChatName...');
            const response = await fetch('/api/generateChatName', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                architecture: arch.rawGraph,
                nodeCount: arch.rawGraph?.children?.length || 0,
                edgeCount: arch.rawGraph?.edges?.length || 0,
                userPrompt: `Architecture with ${arch.rawGraph?.children?.length || 0} components from user session`
              }),
            });
            
            if (response.ok) {
              const data = await response.json();
              if (data.name && data.name.trim()) {
                architectureName = data.name.trim();
                console.log('✅ Generated AI name for transferred architecture:', architectureName);
              }
            } else {
              console.warn('⚠️ AI naming API failed, using original name');
            }
          } catch (error) {
            console.warn('⚠️ AI naming failed for transfer, using original name:', error);
          }
          
          // Save as regular user architecture with complete data
          // Extract nodes and edges from rawGraph for compatibility
          const nodes = arch.rawGraph?.children || [];
          const edges = arch.rawGraph?.edges || [];
          
          const newArchId = await ArchitectureService.saveArchitecture({
            name: architectureName,
            userId,
            userEmail,
            rawGraph: arch.rawGraph,
            nodes: nodes,
            edges: edges,
            userPrompt: `Architecture transferred from anonymous session`
          });

          console.log(`✅ Transferred anonymous architecture "${arch.name}" → "${architectureName}" to user architecture:`, newArchId);
          transferredIds.push(newArchId);

          // Delete the anonymous version
          if (arch.id) {
            await deleteDoc(doc(db, 'anonymous_architectures', arch.id));
            console.log(`🗑️ Deleted anonymous architecture:`, arch.id);
          }

          transferredCount++;
        } catch (error) {
          console.error(`❌ Failed to transfer architecture "${arch.name}":`, error);
        }
      }

      // Clear session ID after successful transfer
      localStorage.removeItem('anonymous_session_id');
      this.sessionId = null;

      console.log(`🎉 Successfully transferred ${transferredCount}/${anonymousArchs.length} anonymous architectures`);
      return {count: transferredCount, transferredIds};
    } catch (error) {
      console.error('❌ Error transferring anonymous architectures:', error);
      return {count: 0, transferredIds: []};
    }
  }

  /**
   * Update an existing anonymous architecture
   */
    async updateAnonymousArchitecture(architectureId: string, updates: Partial<AnonymousArchitecture>): Promise<void> {
      if (!this.shouldUseFirestore()) {
        this.updateFallbackArchitecture(architectureId, updates);
        return;
      }

      try {
        const docRef = doc(db, 'anonymous_architectures', architectureId);
        await updateDoc(docRef, {
          ...updates,
          timestamp: Timestamp.now() // Update timestamp
        });
        
        console.log('✅ Updated anonymous architecture:', architectureId);
      } catch (error) {
        this.markFirestoreUnavailable(error);
        this.updateFallbackArchitecture(architectureId, updates);
      }
  }

  /**
   * Cleanup old anonymous architectures (older than 7 days)
   */
  async cleanupOldAnonymousArchitectures(): Promise<void> {
      if (!this.shouldUseFirestore()) {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const store = this.getFallbackStore();
        let removed = 0;
        for (const [id, entry] of Object.entries(store)) {
          const timestampMs =
            typeof entry.timestamp === 'number'
              ? entry.timestamp
              : entry.timestamp?.toMillis?.() ?? Date.now();
          if (timestampMs < cutoff) {
            delete store[id];
            removed++;
          }
        }
        if (removed > 0) {
          this.saveFallbackStore(store);
          console.log(`🧹 Cleaned up ${removed} old anonymous architectures from fallback store`);
        }
        return;
      }

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const q = query(
        collection(db, 'anonymous_architectures'),
        where('timestamp', '<', Timestamp.fromDate(sevenDaysAgo)),
        where('isAnonymous', '==', true)
      );

      const querySnapshot = await getDocs(q);
      
      const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      console.log(`🧹 Cleaned up ${querySnapshot.size} old anonymous architectures`);
      } catch (error: any) {
        this.markFirestoreUnavailable(error);
      // Handle specific Firestore index errors gracefully
      if (error?.code === 'failed-precondition' && error?.message?.includes('index')) {
        console.log('ℹ️ Firestore index not ready for cleanup query - this is expected during initial setup');
      } else {
        console.error('❌ Error cleaning up anonymous architectures:', error);
      }
    }
  }

  /**
   * Get current session ID (for debugging)
   */
  getCurrentSessionId(): string | null {
    return this.sessionId || localStorage.getItem('anonymous_session_id');
  }
}

export const anonymousArchitectureService = new AnonymousArchitectureService();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).anonymousArchService = {
    getSessionId: () => anonymousArchitectureService.getCurrentSessionId(),
    getArchitectures: () => anonymousArchitectureService.getAnonymousArchitectures(),
    cleanup: () => anonymousArchitectureService.cleanupOldAnonymousArchitectures(),
    getUrlArchId: () => anonymousArchitectureService.getArchitectureIdFromUrl(),
    loadById: (id: string) => anonymousArchitectureService.loadAnonymousArchitectureById(id),
    clearUrl: () => anonymousArchitectureService.clearArchitectureIdFromUrl()
  };

  // Automatically run cleanup every 24 hours to maintain 7-day persistence
  setInterval(() => {
    anonymousArchitectureService.cleanupOldAnonymousArchitectures();
  }, 24 * 60 * 60 * 1000); // 24 hours

  // Run initial cleanup on load (with delay to avoid blocking startup)
  setTimeout(() => {
    anonymousArchitectureService.cleanupOldAnonymousArchitectures();
  }, 30000); // 30 seconds after load
}
