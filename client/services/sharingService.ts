import { SavedArchitecture, ArchitectureService } from './architectureService';
import { auth } from '../lib/firebase';

export class SharingService {
  private static readonly SHARE_DOMAIN = 'https://atelier.inc.net';
  
  /**
   * Creates a shareable URL for an architecture
   */
  static async createShareableLink(architectureId: string): Promise<string> {
    try {
      // The URL format will be: https://atelier.inc.net/architecture/{architectureId}
      // When someone visits this URL, they'll be prompted to sign in if not authenticated
      // Then the architecture will be loaded as the top/selected one
      const shareUrl = `${this.SHARE_DOMAIN}/architecture/${architectureId}`;
      
      console.log('🔗 Created shareable link:', shareUrl);
      return shareUrl;
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
   * Loads a shared architecture by ID (for when someone visits the shared link)
   */
  static async loadSharedArchitecture(architectureId: string): Promise<SavedArchitecture | null> {
    try {
      // This would be called when someone visits https://atelier.inc.net/architecture/{architectureId}
      // First ensure user is authenticated
      if (!auth.currentUser) {
        throw new Error('User must be signed in to view shared architectures');
      }

      // Load the architecture from Firebase
      // Note: We'll need to modify ArchitectureService to allow loading any public architecture
      // For now, this assumes the architecture is accessible to the current user
      console.log('🔍 Loading shared architecture:', architectureId);
      
      // This is a placeholder - we'd need to implement a method to load any architecture by ID
      // regardless of ownership (if it's marked as shareable)
      return null;
    } catch (error) {
      console.error('❌ Error loading shared architecture:', error);
      throw error;
    }
  }

  /**
   * Checks if current URL contains a shared architecture ID
   */
  static getSharedArchitectureIdFromUrl(): string | null {
    const urlPath = window.location.pathname;
    const match = urlPath.match(/\/architecture\/([^\/]+)$/);
    return match ? match[1] : null;
  }
}
