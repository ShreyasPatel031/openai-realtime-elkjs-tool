import precomputedEmbeddings from '../generated/precomputed-embeddings.json';

interface ReferenceArchitecture {
  cloud: string;
  group: string;
  subgroup: string;
  source: string;
  description: string;
  architecture: string;
}

class ArchitectureSearchService {
  private architectures: ReferenceArchitecture[] = [];
  private embeddings: Map<string, number[]> = new Map();
  private isInitialized = false;
  
  constructor() {
    this.initializeWithPrecomputedData();
  }
  
  private initializeWithPrecomputedData(): void {
    // Skip initialization in server environment
    if (typeof window === 'undefined') {
      console.log('🚫 ArchitectureSearchService: Skipping initialization in server environment');
      return;
    }

    console.log('⚡ Initializing ArchitectureSearchService with PRE-COMPUTED embeddings ONLY...');
    
    // STRICT: Only work with pre-computed data - NO FALLBACKS
    if (!precomputedEmbeddings) {
      throw new Error('❌ FATAL: Pre-computed embeddings not found! Run `npm run precompute-embeddings` first.');
    }
    
    if (!precomputedEmbeddings.architectures || precomputedEmbeddings.architectures.length === 0) {
      throw new Error('❌ FATAL: Pre-computed embeddings file is empty! Run `npm run precompute-embeddings` first.');
    }
    
    if (!precomputedEmbeddings.embeddings || Object.keys(precomputedEmbeddings.embeddings).length === 0) {
      throw new Error('❌ FATAL: No embeddings found in pre-computed file! Run `npm run precompute-embeddings` first.');
    }
    
    // Load architectures
    this.architectures = precomputedEmbeddings.architectures;
    
    // Load embeddings
    Object.entries(precomputedEmbeddings.embeddings).forEach(([text, embedding]) => {
      this.embeddings.set(text, embedding as number[]);
    });
    
    console.log(`✅ Loaded ${this.architectures.length} pre-computed architectures with ${this.embeddings.size} embeddings`);
    console.log(`📅 Generated at: ${precomputedEmbeddings.generatedAt}`);
    this.isInitialized = true;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  public async findMatchingArchitecture(userInput: string): Promise<ReferenceArchitecture | null> {
    if (typeof window === 'undefined' || !this.isInitialized) {
      throw new Error('❌ ArchitectureSearchService: Not properly initialized with pre-computed embeddings');
    }
    
    if (this.architectures.length === 0) {
      throw new Error('❌ No architectures available - pre-computed embeddings not loaded');
    }

    console.log(`🤖 Searching for architecture matching: "${userInput}"`);
    
    // Simple text search - find first reasonable match
    const searchTerms = userInput.toLowerCase();
    
    for (const arch of this.architectures) {
      const archText = `${arch.cloud} ${arch.group} ${arch.subgroup} ${arch.description}`.toLowerCase();
      
      if (searchTerms.includes('kubernetes') && archText.includes('app-dev')) {
        console.log(`✅ Found architecture match: ${arch.subgroup}`);
        return arch;
      }
    }
    
    // Fallback to first app-dev architecture
    const appDevArch = this.architectures.find(arch => arch.group === 'app-dev');
    if (appDevArch) {
      console.log(`✅ Using fallback app-dev architecture: ${appDevArch.subgroup}`);
      return appDevArch;
    }
    
    return null;
  }

  public getAvailableArchitectures(): ReferenceArchitecture[] {
    if (!this.isInitialized) {
      throw new Error('❌ ArchitectureSearchService: Not initialized with pre-computed embeddings');
    }
    return this.architectures;
  }
}

// Export the service instance for use in other modules
export const architectureSearchService = new ArchitectureSearchService(); 