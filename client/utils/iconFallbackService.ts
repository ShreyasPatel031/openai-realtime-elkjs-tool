import { iconLists } from "../generated/iconLists";

interface PrecomputedData {
  embeddings: { [iconName: string]: number[] };
  similarities: { [provider: string]: { [iconName: string]: { [otherIcon: string]: number } } };
}

class IconFallbackService {
  private fallbackCache: { [key: string]: string } = {};
  private embeddingCache: { [key: string]: number[] } = {};
  private precomputedData: PrecomputedData | null = null;

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }
    
    this.loadPrecomputedData();
  }

  private async loadPrecomputedData() {
    try {
      const response = await fetch('/precomputed-icon-embeddings.json');
      if (!response.ok) {
        throw new Error(`Failed to load precomputed data: ${response.status}`);
      }
      this.precomputedData = await response.json();
    } catch (error) {
      this.precomputedData = null;
    }
  }

  private async getEmbedding(text: string): Promise<number[] | null> {
    const cacheKey = `embedding_${text.toLowerCase()}`;
    if (this.embeddingCache[cacheKey]) {
      return this.embeddingCache[cacheKey];
    }

    try {
      const response = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error(`Embedding API failed: ${response.status}`);
      }

      const data = await response.json();
      const embedding = data.embedding;
      this.embeddingCache[cacheKey] = embedding;
      return embedding;
    } catch (error) {
      return null;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  public async findFallbackIcon(missingIconName: string): Promise<string | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    // Check cache first
    if (this.fallbackCache[missingIconName]) {
      return this.fallbackCache[missingIconName];
    }

    // Wait for precomputed data if not loaded yet
    if (!this.precomputedData) {
      await this.loadPrecomputedData();
    }

    if (!this.precomputedData) {
      return null;
    }

    try {
      console.log(`🔍 IconFallback: Searching fallback for "${missingIconName}"`);
      
      // Handle both prefixed (gcp_compute) and non-prefixed (server) icon names
      let provider: string;
      let searchTerm: string;
      
      const prefixMatch = missingIconName.match(/^(aws|gcp|azure)_(.+)$/);
      if (prefixMatch) {
        [, provider, searchTerm] = prefixMatch;
        console.log(`🔍 IconFallback: Prefixed name detected - provider: ${provider}, term: ${searchTerm}`);
      } else {
        // For non-prefixed names, search across all providers to find the best semantic match
        provider = 'gcp'; // Default to GCP for result formatting, but we'll search all
        searchTerm = missingIconName;
        console.log(`🔍 IconFallback: Non-prefixed name detected - will search all providers for: ${searchTerm}`);
      }

      // Get embedding for search term (only 1 API call)
      const searchEmbedding = await this.getEmbedding(searchTerm.replace(/_/g, ' '));
      if (!searchEmbedding) {
        console.log(`❌ IconFallback: Could not get embedding for "${searchTerm}"`);
        return null;
      }

      // For non-prefixed names, prioritize general icons first, then cloud provider icons
      let globalBestMatch: { icon: string; similarity: number; provider: string } | null = null;
      let searchProviders: string[] = [];
      
      if (prefixMatch) {
        // Prefixed names: search only the specified provider
        searchProviders = [provider];
      } else {
        // Non-prefixed names: first search general icons using embeddings, then cloud providers
        console.log(`🔍 IconFallback: Searching general icons first for "${searchTerm}"`);
        
        // Search through all embeddings to find general icons (no provider prefix)
        for (const [iconName, iconEmbedding] of Object.entries(this.precomputedData.embeddings)) {
          // General icons don't have provider prefixes (aws_, gcp_, azure_)
          if (!iconName.match(/^(aws|gcp|azure)_/)) {
            const similarity = this.cosineSimilarity(searchEmbedding, iconEmbedding);
            if (!globalBestMatch || similarity > globalBestMatch.similarity) {
              globalBestMatch = { icon: iconName, similarity, provider: 'general' };
            }
          }
        }
        
        // Always search cloud providers to find the absolute best match across all icons
        console.log(`🔍 IconFallback: Found general icon match: "${searchTerm}" → "${globalBestMatch?.icon || 'none'}" (similarity: ${globalBestMatch?.similarity.toFixed(3) || 'none'}), also searching cloud providers for better match...`);
        searchProviders = ['gcp', 'aws', 'azure'];
      }

      // Search cloud provider icons to find absolute best match across all providers
      if (searchProviders.length > 0) {
        for (const currentProvider of searchProviders) {
          const providerIcons = iconLists[currentProvider as keyof typeof iconLists];
          if (!providerIcons) {
            continue;
          }

          const availableIcons = Object.values(providerIcons).flat();
          if (availableIcons.length === 0) {
            continue;
          }

          // Compare against precomputed icon embeddings (no API calls)
          for (const icon of availableIcons) {
            const iconEmbedding = this.precomputedData.embeddings[icon];
            if (iconEmbedding) {
              const similarity = this.cosineSimilarity(searchEmbedding, iconEmbedding);
              if (!globalBestMatch || similarity > globalBestMatch.similarity) {
                globalBestMatch = { icon, similarity, provider: currentProvider };
              }
            }
          }
        }
      }

      if (globalBestMatch) { // Always use best match, no matter how low similarity
        // For general icons, don't add provider prefix
        const fallbackIcon = globalBestMatch.provider === 'general' 
          ? globalBestMatch.icon 
          : `${globalBestMatch.provider}_${globalBestMatch.icon}`;
        console.log(`✅ IconFallback: Found best fallback "${missingIconName}" → "${fallbackIcon}" (similarity: ${globalBestMatch.similarity.toFixed(3)})`);
        this.fallbackCache[missingIconName] = fallbackIcon;
        return fallbackIcon;
      } else {
        console.log(`❌ IconFallback: No icons found in database for "${missingIconName}"`);
        return null;
      }

    } catch (error) {
      return null;
    }
  }
}

export const iconFallbackService = new IconFallbackService();