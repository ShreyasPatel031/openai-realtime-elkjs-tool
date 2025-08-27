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
}

class AnonymousArchitectureService {
  private sessionId: string | null = null
  private lastSaveTime: number = 0
  private saveThrottleMs: number = 1000 // Minimum 1 second between saves (reasonable spam protection);

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

  /**
   * Save an anonymous architecture
   */
  async saveAnonymousArchitecture(name: string, rawGraph: any): Promise<string> {
    try {
      // Ensure we're running on client side
      if (typeof window === 'undefined') {
        throw new Error('Anonymous architecture saving only works on client side');
      }
      
      // Ensure Firebase is initialized
      if (!db) {
        throw new Error('Firebase db is not initialized');
      }

      const now = Date.now();

      // Light throttle to prevent spam clicking (1 second)
      if (now - this.lastSaveTime < this.saveThrottleMs) {
        console.log('⏳ Save throttled - too soon after last save');
        throw new Error('Save throttled - please wait before saving again');
      }
      
      const sessionId = this.getSessionId();
      
      const anonymousArch: Omit<AnonymousArchitecture, 'id'> = {
        name,
        rawGraph,
        sessionId,
        timestamp: Timestamp.now(),
        isAnonymous: true,
        userAgent: navigator.userAgent,
      };

      console.log('💾 Saving anonymous architecture:', name, 'for session:', sessionId);
      
      const docRef = await addDoc(collection(db, 'anonymous_architectures'), anonymousArch);
      
      console.log('✅ Anonymous architecture saved with ID:', docRef.id);
      
      // Update throttling state
      this.lastSaveTime = now;
      
      // Update URL with architecture ID for sharing
      this.updateUrlWithArchitectureId(docRef.id);
      
      return docRef.id;
    } catch (error) {
      console.error('❌ Error saving anonymous architecture:', error);
      throw error;
    }
  }

  /**
   * Load a specific anonymous architecture by ID (for shared URLs)
   */
  async loadAnonymousArchitectureById(architectureId: string): Promise<AnonymousArchitecture | null> {
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
        console.warn('⚠️ Anonymous architecture not found:', architectureId);
        return null;
      }
    } catch (error) {
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
      console.error('❌ Error loading anonymous architectures:', error);
      return [];
    }
  }

  /**
   * Transfer anonymous architectures to signed-in user
   */
  async transferAnonymousArchitectures(userId: string, userEmail: string): Promise<{count: number, transferredIds: string[]}> {
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
            userPrompt: `Transferred from anonymous session on ${arch.timestamp.toDate().toLocaleDateString()}`
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
    try {
      const docRef = doc(db, 'anonymous_architectures', architectureId);
      await updateDoc(docRef, {
        ...updates,
        timestamp: Timestamp.now() // Update timestamp
      });
      
      console.log('✅ Updated anonymous architecture:', architectureId);
    } catch (error) {
      console.error('❌ Error updating anonymous architecture:', error);
      throw error;
    }
  }

  /**
   * Cleanup old anonymous architectures (older than 7 days)
   */
  async cleanupOldAnonymousArchitectures(): Promise<void> {
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
