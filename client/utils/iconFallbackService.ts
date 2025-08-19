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
      const prefixMatch = missingIconName.match(/^(aws|gcp|azure)_(.+)$/);
      if (!prefixMatch) {
        return null;
      }

      const [, provider, searchTerm] = prefixMatch;
      const providerIcons = iconLists[provider as keyof typeof iconLists];
      if (!providerIcons) {
        return null;
      }

      const availableIcons = Object.values(providerIcons).flat();
      if (availableIcons.length === 0) {
        return null;
      }

      // Get embedding for search term (only 1 API call)
      const searchEmbedding = await this.getEmbedding(searchTerm.replace(/_/g, ' '));
      if (!searchEmbedding) {
        return null;
      }

      // Compare against precomputed icon embeddings (no API calls)
      let bestMatch: { icon: string; similarity: number } | null = null;

      for (const icon of availableIcons) {
        const iconEmbedding = this.precomputedData.embeddings[icon];
        if (iconEmbedding) {
          const similarity = this.cosineSimilarity(searchEmbedding, iconEmbedding);
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { icon, similarity };
          }
        }
      }

      if (bestMatch) {
        const fallbackIcon = `${provider}_${bestMatch.icon}`;
        this.fallbackCache[missingIconName] = fallbackIcon;
        return fallbackIcon;
      } else {
        return null;
      }

    } catch (error) {
      return null;
    }
  }
}

export const iconFallbackService = new IconFallbackService();