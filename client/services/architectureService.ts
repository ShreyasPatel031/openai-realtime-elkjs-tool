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
        name: architectureData.name || 'Untitled Architecture',
        description: architectureData.description || `Architecture with ${architectureData.nodes?.length || 0} components`,
        userId: architectureData.userId,
        userEmail: architectureData.userEmail,
        isPublic: architectureData.isPublic || false,
        tags: architectureData.tags || [],
        
        // Save the complete ELK data
        rawGraph: architectureData.rawGraph,
        nodes: architectureData.nodes,
        edges: architectureData.edges,
        
        // Metadata
        nodeCount: architectureData.nodes?.length || 0,
        edgeCount: architectureData.edges?.length || 0,
        timestamp: Timestamp.now()
      };
      
      // Clean the data to remove undefined values and functions
      const cleanedData = this.cleanFirestoreData(completeData);
      
      console.log('📊 Saving ELK architecture:', {
        name: cleanedData.name,
        userId: cleanedData.userId,
        nodeCount: cleanedData.nodeCount,
        edgeCount: cleanedData.edgeCount,
        hasRawGraph: !!cleanedData.rawGraph,
        dataSize: JSON.stringify(cleanedData).length + ' chars'
      });
      
      // Save to Firebase
      const docRef = await addDoc(collection(db, this.COLLECTION_NAME), cleanedData);
      
      console.log('✅ ELK Architecture saved to Firebase with ID:', docRef.id);
      
      // Show success message
      alert(`✅ Architecture saved successfully!

🔥 Firebase ID: ${docRef.id}
🏗️ Name: ${cleanedData.name}
👤 User: ${cleanedData.userEmail}
📊 ELK Data: ${cleanedData.nodeCount} nodes, ${cleanedData.edgeCount} edges
💾 Size: ${JSON.stringify(cleanedData).length} characters

Your complete architecture with ELK layout data has been saved!`);
      
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



  /**
   * Generate a default name for an architecture based on its content
   */
  static generateArchitectureName(nodes: any[], edges: any[]): string {
    const nodeCount = nodes.length;
    const edgeCount = edges.length;
    const timestamp = new Date().toLocaleDateString();
    
    // Try to identify the type of architecture based on node names/types
    const nodeLabels = nodes.map(node => node.data?.label || node.id).join(' ').toLowerCase();
    
    let archType = 'Architecture';
    if (nodeLabels.includes('gcp') || nodeLabels.includes('google')) {
      archType = 'GCP Architecture';
    } else if (nodeLabels.includes('aws')) {
      archType = 'AWS Architecture';
    } else if (nodeLabels.includes('azure')) {
      archType = 'Azure Architecture';
    } else if (nodeLabels.includes('web') || nodeLabels.includes('frontend')) {
      archType = 'Web Architecture';
    } else if (nodeLabels.includes('microservice') || nodeLabels.includes('api')) {
      archType = 'Microservices Architecture';
    }
    
    return `${archType} - ${timestamp}`;
  }
}

export default ArchitectureService;
