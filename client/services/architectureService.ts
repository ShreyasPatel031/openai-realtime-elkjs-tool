import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface SavedArchitecture {
  id?: string;
  name: string;
  description?: string;
  rawGraph: any;
  nodes: any[];
  edges: any[];
  timestamp: Timestamp;
  userId: string;
  userEmail: string;
  userPrompt?: string;
  isPublic?: boolean;
  tags?: string[];
}

export class ArchitectureService {
  private static readonly COLLECTION_NAME = 'architectures';





  /**
   * Clean data recursively to remove undefined values and functions
   */
  private static cleanFirestoreData(obj: any): any {
    if (obj === null || obj === undefined) {
      return null;
    }
    
    if (typeof obj === 'function') {
      return null;
    }
    
    if (Array.isArray(obj)) {
      return obj
        .map(item => this.cleanFirestoreData(item))
        .filter(item => item !== null && item !== undefined);
    }
    
    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanedValue = this.cleanFirestoreData(value);
        if (cleanedValue !== null && cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
        }
      }
      return cleaned;
    }
    
    return obj;
  }

  /**
   * Save complete ELK architecture data to Firebase
   */
  static async saveArchitecture(
    architectureData: Omit<SavedArchitecture, 'id' | 'timestamp'>
  ): Promise<string> {
    try {
      console.log('💾 Saving complete ELK architecture to Firebase...');
      
      // Save the complete architecture data including ELK rawGraph
      const completeData = {
        name: architectureData.name, // No fallback - name must be provided
        description: architectureData.description || `Architecture with ${architectureData.nodes?.length || 0} components`,
        userId: architectureData.userId,
        userEmail: architectureData.userEmail,
        isPublic: architectureData.isPublic || false,
        tags: architectureData.tags || [],
        
        // Save the complete ELK data
        rawGraph: architectureData.rawGraph,
        nodes: architectureData.nodes,
        edges: architectureData.edges,
        
        // Metadata - preserve existing timestamps or use current time
        nodeCount: architectureData.nodes?.length || 0,
        edgeCount: architectureData.edges?.length || 0,
        timestamp: architectureData.timestamp ? Timestamp.fromDate(new Date(architectureData.timestamp)) : Timestamp.now(),
        createdAt: architectureData.createdAt ? Timestamp.fromDate(new Date(architectureData.createdAt)) : Timestamp.now(),
        lastModified: Timestamp.now() // Always update lastModified
      };
      
      // Clean the data to remove undefined values and functions
      const cleanedData = this.cleanFirestoreData(completeData);
      
      console.log('📊 Saving ELK architecture:', cleanedData.name);
      
      // Save to Firebase
      const docRef = await addDoc(collection(db, this.COLLECTION_NAME), cleanedData);
      
      console.log('✅ ELK Architecture saved to Firebase with ID:', docRef.id);
      
      // Success message now handled by toast notifications in InteractiveCanvas
      
      return docRef.id;
    } catch (error: any) {
      console.error('❌ Error saving ELK architecture to Firebase:', error);
      console.error('❌ Error code:', error?.code);
      console.error('❌ Error message:', error?.message);
      console.error('❌ Full error object:', error);
      
      // Provide helpful error messages based on common Firebase issues
      let userMessage = 'Failed to save architecture to Firebase.';
      
      if (error?.message?.includes('Failed to fetch') || error?.message?.includes('network')) {
        userMessage += ' Network connectivity issue - check your internet connection.';
      } else if (error?.code === 'permission-denied') {
        userMessage += ' Permission denied - check Firestore security rules.';
      } else if (error?.code === 'unauthenticated') {
        userMessage += ' Authentication required - please sign in again.';
      } else if (error?.message?.includes('referrer') || error?.message?.includes('API key')) {
        userMessage += ' API key configuration issue - check Firebase console settings.';
      } else {
        userMessage += ` Error: ${error?.message || 'Unknown error'}`;
      }
      
      throw new Error(userMessage);
    }
  }



  // REMOVED: generateArchitectureName function - all names must be AI-generated via generateChatName API

  static async loadUserArchitectures(userId: string): Promise<SavedArchitecture[]> {
    try {
      console.log('🔄 Loading architectures for user:', userId);
      
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(20) // Limit to recent 20 architectures
      );
      
      const querySnapshot = await getDocs(q);
      const architectures: SavedArchitecture[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        architectures.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp || Timestamp.now()
        } as SavedArchitecture);
      });
      
      console.log(`✅ Loaded ${architectures.length} architectures from Firebase`);
      return architectures;
    } catch (error) {
      console.error('❌ Error loading user architectures:', error);
      return [];
    }
  }

  static async updateArchitecture(
    architectureId: string, 
    updates: Partial<SavedArchitecture>
  ): Promise<void> {
    try {
      console.log('🔄 Updating architecture in Firebase:', architectureId);
      
      const docRef = doc(db, this.COLLECTION_NAME, architectureId);
      
      // Clean the update data
      const cleanedUpdates = ArchitectureService.cleanFirestoreData({
        ...updates,
        timestamp: Timestamp.now(),
        lastModified: Timestamp.now()
      });
      
      await updateDoc(docRef, cleanedUpdates);
      console.log('✅ Architecture updated in Firebase:', architectureId);
    } catch (error) {
      console.error('❌ Error updating architecture:', error);
      throw error;
    }
  }

  static async cleanupInvalidArchitectures(userId: string): Promise<void> {
    try {
      console.log('🧹 Cleaning up invalid architectures for user:', userId);
      
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('userId', '==', userId)
      );
      
      const querySnapshot = await getDocs(q);
      const deletePromises: Promise<void>[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        // Check if architecture is invalid (missing required fields)
        const isInvalid = !data.name || !data.rawGraph || !data.userId;
        
        if (isInvalid) {
          console.log('🗑️ Deleting invalid architecture:', doc.id, data);
          deletePromises.push(deleteDoc(doc.ref));
        }
      });
      
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        console.log(`✅ Cleaned up ${deletePromises.length} invalid architectures`);
      } else {
        console.log('✅ No invalid architectures found');
      }
    } catch (error) {
      console.error('❌ Error cleaning up architectures:', error);
    }
  }

  static async deleteArchitecture(architectureId: string): Promise<void> {
    try {
      console.log('🗑️ Deleting architecture from Firebase:', architectureId);
      
      const docRef = doc(db, this.COLLECTION_NAME, architectureId);
      await deleteDoc(docRef);
      
      console.log('✅ Architecture deleted from Firebase:', architectureId);
    } catch (error) {
      console.error('❌ Error deleting architecture:', error);
      throw error;
    }
  }
}

export default ArchitectureService;
