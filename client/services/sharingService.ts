import { SavedArchitecture, ArchitectureService } from './architectureService';
import { auth } from '../lib/firebase';

export class SharingService {
  /**
   * Creates a shareable URL for an architecture using dynamic domain and consistent URL format
   */
  static async createShareableLink(architectureId: string): Promise<string> {
    try {
      // Use current domain and consistent ?arch= parameter format (same as anonymous sharing)
      const currentUrl = new URL(window.location.href);
      const shareUrl = new URL(currentUrl.origin);
      
      // Use the root path for public sharing (works for both signed-in and anonymous users)
      shareUrl.pathname = '/';
      shareUrl.searchParams.set('arch', architectureId);
      
      const finalUrl = shareUrl.toString();
      console.log('🔗 Created dynamic shareable link:', finalUrl);
      return finalUrl;
    } catch (error) {
      console.error('❌ Error creating shareable link:', error);
      throw new Error('Failed to create shareable link');
    }
  }

  /**
   * Copies the shareable link to clipboard
   */
  static async shareArchitecture(architectureId: string): Promise<void> {
    try {
      const shareUrl = await this.createShareableLink(architectureId);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(shareUrl);
      console.log('✅ Architecture link copied to clipboard:', shareUrl);
      
      return;
    } catch (error) {
      console.error('❌ Error sharing architecture:', error);
      throw new Error('Failed to share architecture');
    }
  }

  /**
   * Loads a shared architecture by ID (for when someone visits a shared link with ?arch= parameter)
   */
  static async loadSharedArchitecture(architectureId: string): Promise<SavedArchitecture | null> {
    try {
      // This handles both signed-in user architectures and anonymous architectures
      // The URL format is now: https://domain.com/?arch={architectureId}
      console.log('🔍 Loading shared architecture:', architectureId);
      
      // Try to load as a regular user architecture first (if user is signed in)
      if (auth.currentUser) {
        try {
          // Note: We'd need to implement a method in ArchitectureService to load any public architecture
          // For now, this is handled by the existing architecture loading system
          console.log('👤 User is signed in, attempting to load user architecture');
        } catch (error) {
          console.log('⚠️ Could not load as user architecture, will try anonymous');
        }
      }
      
      // If not found as user architecture or user not signed in, try anonymous architecture
      // This is handled by the anonymousArchitectureService in InteractiveCanvas
      console.log('🔍 Delegating to anonymous architecture service for ID:', architectureId);
      return null; // Let the anonymous service handle it
    } catch (error) {
      console.error('❌ Error loading shared architecture:', error);
      throw error;
    }
  }

  /**
   * Checks if current URL contains a shared architecture ID using ?arch= parameter
   */
  static getSharedArchitectureIdFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('arch');
  }
}
