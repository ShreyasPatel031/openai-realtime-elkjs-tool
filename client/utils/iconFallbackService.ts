import OpenAI from "openai";
import { iconLists } from "../generated/iconLists";

interface EmbeddingCache {
  [key: string]: number[];
}

class IconFallbackService {
  private client: OpenAI | null = null;
  private embeddingCache: EmbeddingCache = {};
  private fallbackCache: { [key: string]: string } = {};
  private providerIconSets: Map<string, string[]> = new Map();

  constructor() {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      console.log('🚫 IconFallbackService: Skipping initialization in server environment');
      return;
    }

    // Get API key ONLY from the secure Vite environment variable
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

    // If no API key is available, disable the service gracefully
    if (!apiKey) {
      console.warn('⚠️ IconFallbackService: No OpenAI API key found. Icon fallback disabled. Set VITE_OPENAI_API_KEY in your .env file to enable.');
      return;
    }

    try {
      this.client = new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true
      });
      this.initializeProviderIconSets();

    } catch (error) {
      console.warn('⚠️ Failed to initialize IconFallbackService:', error);
    }
  }

  private initializeProviderIconSets() {
    // GCP icons
    const gcpIcons: string[] = [];
    Object.values(iconLists.gcp).forEach(categoryIcons => {
      gcpIcons.push(...categoryIcons);
    });
    this.providerIconSets.set('gcp', gcpIcons);

    // AWS icons  
    const awsIcons: string[] = [];
    Object.values(iconLists.aws).forEach(categoryIcons => {
      awsIcons.push(...categoryIcons);
    });
    this.providerIconSets.set('aws', awsIcons);

    // Azure icons
    const azureIcons: string[] = [];
    Object.values(iconLists.azure).forEach(categoryIcons => {
      azureIcons.push(...categoryIcons);
    });
    this.providerIconSets.set('azure', azureIcons);

    // console.log('🔧 Provider icon sets loaded:', {
    //   gcp: gcpIcons.length,
    //   aws: awsIcons.length, 
    //   azure: azureIcons.length
    // });
  }

  private async getEmbedding(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = text.toLowerCase();
    if (this.embeddingCache[cacheKey]) {
      return this.embeddingCache[cacheKey];
    }

    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      // Use fastest/cheapest embedding model
      const response = await this.client.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        encoding_format: "float"
      });

      const embedding = response.data[0].embedding;
      this.embeddingCache[cacheKey] = embedding;
      return embedding;
    } catch (error) {
      // Handle CORS errors gracefully - don't break the main app
      if (error.message && error.message.includes('CORS')) {
        console.warn('⚠️ CORS issue with OpenAI API - icon fallback disabled');
        return null; // Return null instead of throwing
      }
      console.error('❌ Failed to get embedding:', error);
      return null; // Return null for any embedding error
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  public async findFallbackIcon(missingIconName: string): Promise<string | null> {
    // Return null if not in browser environment
    if (typeof window === 'undefined' || !this.client) {
      console.log('🚫 IconFallbackService: Not available in server environment');
      return null;
    }
    
    // Check fallback cache first
    if (this.fallbackCache[missingIconName]) {
              // console.log(`🎯 Using cached fallback for ${missingIconName}: ${this.fallbackCache[missingIconName]}`);
      return this.fallbackCache[missingIconName];
    }

    try {
      // Extract provider prefix (gcp_, aws_, azure_)
      const prefixMatch = missingIconName.match(/^(aws|gcp|azure)_(.+)$/);
      if (!prefixMatch) {
        console.warn(`⚠️ No provider prefix found in: ${missingIconName}`);
        return null;
      }

      const [, provider, iconName] = prefixMatch;
      const availableIcons = this.providerIconSets.get(provider);

      if (!availableIcons || availableIcons.length === 0) {
        console.warn(`⚠️ No icons available for provider: ${provider}`);
        return null;
      }

      // console.log(`🤖 Finding embedding match for ${missingIconName} in ${provider} (${availableIcons.length} icons)`);

      // Get embedding for the missing icon
      const searchEmbedding = await this.getEmbedding(iconName);
      
      // If we can't get the search embedding (CORS error), return null gracefully
      if (!searchEmbedding) {
        console.warn(`⚠️ Cannot get embedding for ${missingIconName} - icon fallback disabled`);
        return null;
      }

      // Get embeddings for all icons in parallel (much faster)
      // console.log(`🚀 Getting embeddings for ${availableIcons.length} icons...`);
      const embeddingPromises = availableIcons.map(async (icon) => {
        const embedding = await this.getEmbedding(icon);
        return { icon, embedding };
      });

      const iconEmbeddings = await Promise.all(embeddingPromises);
      
      // Filter out null embeddings (failed API calls)
      const validEmbeddings = iconEmbeddings.filter(item => item.embedding !== null);
      
      if (validEmbeddings.length === 0) {
        console.warn(`⚠️ Could not get embeddings for any icons - icon fallback disabled`);
        return null;
      }
      
      // console.log(`✅ Got ${validEmbeddings.length}/${iconEmbeddings.length} valid embeddings, calculating similarities...`);

      // Find best match
      let bestMatch: { icon: string; similarity: number } | null = null;

      for (const { icon, embedding } of validEmbeddings) {
        const similarity = this.cosineSimilarity(searchEmbedding, embedding!);
        
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { icon, similarity };
        }
      }

      if (bestMatch) {
        const fallbackIcon = `${provider}_${bestMatch.icon}`;
        this.fallbackCache[missingIconName] = fallbackIcon;
        // console.log(`✅ Found embedding match for ${missingIconName}: ${fallbackIcon} (similarity: ${bestMatch.similarity.toFixed(3)})`);
        return fallbackIcon;
      } else {
        console.warn(`⚠️ No icons found for ${missingIconName}`);
        return null;
      }

    } catch (error) {
      console.error(`❌ Error finding fallback for ${missingIconName}:`, error);
      return null;
    }
  }
}

// Singleton instance
export const iconFallbackService = new IconFallbackService(); 