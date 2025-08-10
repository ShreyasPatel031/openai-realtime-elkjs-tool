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
  private queryCache: Map<string, number[]> = new Map();   // reuse queries
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
    


    this.isInitialized = true;
  }

  /** Embed an arbitrary text once, then cache it. */
  private async embedQuery(text: string): Promise<number[]> {
    const key = text.toLowerCase();
    if (this.queryCache.has(key)) return this.queryCache.get(key)!;

    // Call the backend instead of the OpenAI SDK
    const res = await fetch('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: key })
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Backend /api/embed failed ${res.status}: ${detail}`);
    }

    const { embedding } = await res.json();
    this.queryCache.set(key, embedding);
    return embedding as number[];
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
    if (!this.isInitialized) {
      throw new Error('❌ ArchitectureSearchService: Not properly initialized with pre-computed embeddings');
    }



    // 1️⃣ embed the query
    let queryVec: number[];
    try {
      queryVec = await this.embedQuery(userInput);
    } catch (err) {
      console.error('❌ Unable to embed query', err);
      return null;
    }

    // 2️⃣ cosine-similarity over ALL reference vectors
    let bestArch: ReferenceArchitecture | null = null;
    let bestScore = -Infinity;

    for (const arch of this.architectures) {
      const key = `${arch.cloud} ${arch.group} ${arch.subgroup} ${arch.description}`.toLowerCase();
      const vec = this.embeddings.get(key);
      if (!vec) continue;                           // should not happen

      const score = this.cosineSimilarity(queryVec, vec);
      if (score > bestScore) {
        bestScore = score;
        bestArch  = arch;
      }
    }

    if (bestArch) {

    } else {
      console.warn('⚠️ No architecture matched');
    }
    return bestArch;
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