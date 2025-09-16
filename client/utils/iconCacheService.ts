/**
 * Icon Cache Service - Caches successfully loaded icons to avoid reloading
 */

interface IconCacheEntry {
  url: string;
  timestamp: number;
}

class IconCacheService {
  private cache: Map<string, IconCacheEntry> = new Map();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  /**
   * Get cached icon URL if available and not expired
   */
  getCachedIcon(iconName: string): string | null {
    const entry = this.cache.get(iconName);
    
    if (!entry) {
      return null;
    }

    // Check if cache entry is expired
    const now = Date.now();
    if (now - entry.timestamp > this.CACHE_DURATION) {
      this.cache.delete(iconName);
      return null;
    }

    return entry.url;
  }

  /**
   * Cache a successfully loaded icon
   */
  cacheIcon(iconName: string, url: string): void {
    this.cache.set(iconName, {
      url,
      timestamp: Date.now()
    });
  }

  /**
   * Check if icon is cached (without returning the URL)
   */
  isIconCached(iconName: string): boolean {
    return this.getCachedIcon(iconName) !== null;
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.CACHE_DURATION) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }

  /**
   * Preload icons into cache (useful for warming up cache)
   */
  async preloadIcons(iconNames: string[], tryLoadIconFn: (iconName: string) => Promise<string>): Promise<void> {
    const uncachedIcons = iconNames.filter(name => !this.isIconCached(name));
    
    if (uncachedIcons.length === 0) {
      console.log('🎯 All icons already cached, skipping preload');
      return;
    }

    console.log(`🔄 Preloading ${uncachedIcons.length} icons into cache...`);
    
    const loadPromises = uncachedIcons.map(async (iconName) => {
      try {
        const url = await tryLoadIconFn(iconName);
        this.cacheIcon(iconName, url);
        return { iconName, success: true };
      } catch (error) {
        console.warn(`⚠️ Failed to preload icon: ${iconName}`, error);
        return { iconName, success: false };
      }
    });

    const results = await Promise.allSettled(loadPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    
    console.log(`✅ Preloaded ${successful}/${uncachedIcons.length} icons into cache`);
  }
}

// Export singleton instance
export const iconCacheService = new IconCacheService();

// Periodically clean up expired entries (every hour)
if (typeof window !== 'undefined') {
  setInterval(() => {
    iconCacheService.clearExpiredEntries();
  }, 60 * 60 * 1000); // 1 hour

  // Expose cache service to window for debugging
  (window as any).iconCache = {
    getStats: () => iconCacheService.getCacheStats(),
    clearCache: () => iconCacheService.clearCache(),
    clearExpired: () => iconCacheService.clearExpiredEntries()
  };
}
