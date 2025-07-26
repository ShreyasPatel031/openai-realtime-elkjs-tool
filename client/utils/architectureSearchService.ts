import OpenAI from "openai";

interface ReferenceArchitecture {
  cloud: string;
  group: string;
  subgroup: string;
  source: string;
  description: string;
  architecture: string;
}

interface EmbeddingCache {
  [key: string]: number[];
}

class ArchitectureSearchService {
  private client: OpenAI | null = null;
  private embeddingCache: EmbeddingCache = {};
  private architectures: ReferenceArchitecture[] = [];
  private initialized = false;

  constructor() {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      console.log('🚫 ArchitectureSearchService: Skipping initialization in server environment');
      return;
    }

    // Get API key from multiple sources (dev: window global, prod: env var)
    let apiKey = (import.meta as any).env?.VITE_OPENAI_API_KEY || 
                 (window as any).__OPENAI_API_KEY__;

    // Debug logging
    console.log('🔍 Architecture Service Environment check:', {
      'import.meta.env': (import.meta as any).env,
      'VITE_OPENAI_API_KEY': apiKey ? 'Found ✅' : 'Missing ❌'
    });

    try {
      this.client = new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true
      });
      this.initializeArchitectures();
      console.log('✅ ArchitectureSearchService initialized with OpenAI embeddings');
    } catch (error) {
      console.warn('⚠️ Failed to initialize ArchitectureSearchService:', error);
    }
  }

  private async initializeArchitectures() {
    try {
      console.log('🔄 Fetching CSV file...');
      // Fetch the CSV file
      const response = await fetch('/Architecture References - Sheet1.csv');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const csvText = await response.text();
      console.log(`📄 CSV loaded, ${csvText.length} characters`);
      
      // Parse CSV - handle quoted fields properly
      const lines = csvText.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      console.log('📋 CSV headers:', headers);
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Simple CSV parsing - split by comma but handle quoted fields
        const values = this.parseCSVLine(line);
        
        if (values.length >= 6) {
          const arch = {
            cloud: values[0]?.trim() || '',
            group: values[1]?.trim() || '',
            subgroup: values[2]?.trim() || '',
            source: values[3]?.trim() || '',
            description: values[4]?.trim() || '',
            architecture: values[5]?.trim() || ''
          };
          
          // Only add if we have meaningful data
          if (arch.subgroup && arch.description) {
            this.architectures.push(arch);
          }
        }
      }
      
      this.initialized = true;
      console.log(`✅ Loaded ${this.architectures.length} reference architectures from CSV`);
      
      // Log first few architectures for debugging
      if (this.architectures.length > 0) {
        console.log('🔍 Sample architectures:', this.architectures.slice(0, 3));
      }
    } catch (error) {
      console.warn('⚠️ Failed to load architecture CSV:', error);
    }
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current); // Add the last field
    return result;
  }

  private async getEmbedding(text: string): Promise<number[]> {
    if (!this.client) throw new Error('OpenAI client not initialized');

    // Check cache first
    if (this.embeddingCache[text]) {
      return this.embeddingCache[text];
    }

    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small', // Lowest latency model
        input: text,
      });

      const embedding = response.data[0].embedding;
      this.embeddingCache[text] = embedding;
      return embedding;
    } catch (error) {
      console.warn(`⚠️ Failed to get embedding for: ${text}`, error);
      throw error;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  public async findMatchingArchitecture(userInput: string): Promise<ReferenceArchitecture | null> {
    if (typeof window === 'undefined' || !this.client || !this.initialized) {
      console.log('🚫 ArchitectureSearchService: Not available');
      return null;
    }

    if (this.architectures.length === 0) {
      console.warn('⚠️ No architectures loaded');
      return null;
    }

    try {
      console.log(`🤖 Searching for architecture matching: "${userInput}"`);
      
      // Get embedding for user input
      const userEmbedding = await this.getEmbedding(userInput);

      // Get embeddings for all architecture descriptions in parallel
      console.log(`🚀 Getting embeddings for ${this.architectures.length} architectures...`);
      const embeddingPromises = this.architectures.map(async (arch) => {
        // Create searchable text from description and subgroup
        const searchText = `${arch.subgroup} ${arch.description}`.toLowerCase();
        const embedding = await this.getEmbedding(searchText);
        return { 
          architecture: arch, 
          embedding, 
          searchText 
        };
      });

      const archEmbeddings = await Promise.all(embeddingPromises);

      // Find best match using cosine similarity
      let bestMatch: { architecture: ReferenceArchitecture; similarity: number } | null = null;

      for (const { architecture, embedding } of archEmbeddings) {
        const similarity = this.cosineSimilarity(userEmbedding, embedding);
        
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { architecture, similarity };
        }
      }

      if (bestMatch) {
        console.log(`✅ Found architecture match: ${bestMatch.architecture.subgroup} (similarity: ${bestMatch.similarity.toFixed(3)})`);
        console.log(`📋 Architecture: ${bestMatch.architecture.architecture}`);
        return bestMatch.architecture;
      } else {
        console.warn(`⚠️ No architecture match found for: ${userInput}`);
        return null;
      }

    } catch (error) {
      console.warn(`❌ Architecture search failed for ${userInput}:`, error);
      return null;
    }
  }

  public async warmUpEmbeddings() {
    if (typeof window === 'undefined' || !this.client || !this.initialized) {
      console.log('🚫 ArchitectureSearchService: Skipping warmup');
      return;
    }

    console.log('🔥 Warming up architecture embeddings...');
    
    // Pre-compute embeddings for all architectures
    for (const arch of this.architectures) {
      const searchText = `${arch.subgroup} ${arch.description}`.toLowerCase();
      try {
        await this.getEmbedding(searchText);
      } catch (error) {
        console.warn(`⚠️ Failed to warm up embedding for: ${searchText}`);
      }
    }
    
    console.log(`✅ Warmed up embeddings for ${this.architectures.length} architectures`);
  }

  public getAvailableArchitectures(): ReferenceArchitecture[] {
    return [...this.architectures];
  }
}

export const architectureSearchService = new ArchitectureSearchService();

// Auto-warmup in browser environment
if (typeof window !== 'undefined') {
  // Wait a bit for initialization to complete
  setTimeout(() => {
    console.log('🔥 Starting architecture service warmup...');
    const archs = architectureSearchService.getAvailableArchitectures();
    console.log(`📊 Service status: ${archs.length} architectures available`);
    
    if (archs.length > 0) {
      architectureSearchService.warmUpEmbeddings();
    } else {
      console.warn('⚠️ No architectures loaded during warmup, service may not be initialized');
    }
  }, 2000);
} 