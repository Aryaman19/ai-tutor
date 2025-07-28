/**
 * Layout Cache System
 * 
 * High-performance caching system for timeline layout states with intelligent
 * eviction policies and performance optimization.
 */

import type { ExcalidrawElement } from '../types';
import type { ElementTransition } from './timeline-layout-engine';

export interface LayoutCacheEntry {
  timestamp: number;
  elements: ExcalidrawElement[];
  regionAssignments: Map<string, string>; // element ID -> region ID
  transitionData: ElementTransition[];
  createdAt: number;
  accessCount: number;
  computationTime: number; // Time taken to compute this layout in ms
  compressed?: boolean; // Whether the entry data has been compressed
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  totalAccesses: number;
  averageComputationTime: number;
  memoryUsage: number; // Estimated memory usage in bytes
  oldestEntry: number;
  newestEntry: number;
}

export interface CacheConfig {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  compressionThreshold: number; // Compress entries older than this (ms)
  evictionStrategy: 'lru' | 'lfu' | 'adaptive';
  memoryLimit: number; // Max memory usage in bytes
}

export class LayoutCache {
  private cache: Map<number, LayoutCacheEntry> = new Map();
  private accessOrder: number[] = []; // For LRU tracking
  private accessFrequency: Map<number, number> = new Map(); // For LFU tracking
  private stats: {
    hits: number;
    misses: number;
    totalComputationTime: number;
    totalAccesses: number;
  };
  
  private config: CacheConfig;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxSize: 50,
      ttl: 5 * 60 * 1000, // 5 minutes
      compressionThreshold: 2 * 60 * 1000, // 2 minutes
      evictionStrategy: 'adaptive',
      memoryLimit: 100 * 1024 * 1024, // 100MB
      ...config
    };

    this.stats = {
      hits: 0,
      misses: 0,
      totalComputationTime: 0,
      totalAccesses: 0
    };

    // Periodic cleanup
    this.startCleanupInterval();
  }

  /**
   * Store a layout in the cache
   */
  public set(timestamp: number, entry: LayoutCacheEntry): void {
    // Remove old entry if it exists
    if (this.cache.has(timestamp)) {
      this.remove(timestamp);
    }

    // Check if we need to evict entries
    this.ensureCapacity();

    // Store the entry
    this.cache.set(timestamp, {
      ...entry,
      createdAt: Date.now(),
      accessCount: 0
    });

    // Update access tracking
    this.updateAccessOrder(timestamp);
  }

  /**
   * Retrieve a layout from the cache
   */
  public get(timestamp: number): LayoutCacheEntry | null {
    const entry = this.cache.get(timestamp);
    
    if (!entry) {
      this.stats.misses++;
      this.stats.totalAccesses++;
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.remove(timestamp);
      this.stats.misses++;
      this.stats.totalAccesses++;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    this.updateAccessOrder(timestamp);
    this.updateAccessFrequency(timestamp);
    
    this.stats.hits++;
    this.stats.totalAccesses++;

    // Decompress if needed
    if (entry.compressed) {
      this.decompressEntry(entry);
    }

    return entry;
  }

  /**
   * Check if cache has an entry for the timestamp
   */
  public has(timestamp: number): boolean {
    const entry = this.cache.get(timestamp);
    return entry !== undefined && !this.isExpired(entry);
  }

  /**
   * Remove a specific entry from the cache
   */
  public remove(timestamp: number): boolean {
    const removed = this.cache.delete(timestamp);
    
    if (removed) {
      // Clean up access tracking
      this.accessOrder = this.accessOrder.filter(t => t !== timestamp);
      this.accessFrequency.delete(timestamp);
    }

    return removed;
  }

  /**
   * Clear all entries from the cache
   */
  public clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.accessFrequency.clear();
    
    // Reset stats but keep historical data
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.totalAccesses = 0;
  }

  /**
   * Find the closest cached timestamp to the requested one
   */
  public findClosest(timestamp: number, maxDistance: number = 1000): LayoutCacheEntry | null {
    let closest: { timestamp: number; distance: number; entry: LayoutCacheEntry } | null = null;

    for (const [cachedTimestamp, entry] of this.cache) {
      if (this.isExpired(entry)) continue;

      const distance = Math.abs(timestamp - cachedTimestamp);
      
      if (distance <= maxDistance && (!closest || distance < closest.distance)) {
        closest = { timestamp: cachedTimestamp, distance, entry };
      }
    }

    if (closest) {
      // Update access statistics for the closest entry
      this.updateAccessOrder(closest.timestamp);
      this.updateAccessFrequency(closest.timestamp);
      return closest.entry;
    }

    return null;
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    const now = Date.now();
    let oldestEntry = now;
    let newestEntry = 0;
    let estimatedMemoryUsage = 0;

    for (const entry of this.cache.values()) {
      if (entry.createdAt < oldestEntry) oldestEntry = entry.createdAt;
      if (entry.createdAt > newestEntry) newestEntry = entry.createdAt;
      
      // Rough memory estimation
      estimatedMemoryUsage += this.estimateEntrySize(entry);
    }

    return {
      totalEntries: this.cache.size,
      hitRate: this.stats.totalAccesses > 0 ? this.stats.hits / this.stats.totalAccesses : 0,
      missRate: this.stats.totalAccesses > 0 ? this.stats.misses / this.stats.totalAccesses : 0,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      totalAccesses: this.stats.totalAccesses,
      averageComputationTime: this.stats.totalAccesses > 0 ? this.stats.totalComputationTime / this.stats.totalAccesses : 0,
      memoryUsage: estimatedMemoryUsage,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Manually trigger cache optimization
   */
  public optimize(): void {
    this.compressOldEntries();
    this.removeExpiredEntries();
    this.enforceMemoryLimit();
  }

  private ensureCapacity(): void {
    // Remove expired entries first
    this.removeExpiredEntries();

    // If still over capacity, use eviction strategy
    while (this.cache.size >= this.config.maxSize) {
      const timestampToEvict = this.selectEvictionCandidate();
      if (timestampToEvict !== null) {
        this.remove(timestampToEvict);
      } else {
        break; // Safety valve
      }
    }
  }

  private selectEvictionCandidate(): number | null {
    if (this.cache.size === 0) return null;

    switch (this.config.evictionStrategy) {
      case 'lru':
        return this.selectLRUCandidate();
      case 'lfu':
        return this.selectLFUCandidate();
      case 'adaptive':
        return this.selectAdaptiveCandidate();
      default:
        return this.selectLRUCandidate();
    }
  }

  private selectLRUCandidate(): number | null {
    // Return the least recently used timestamp
    return this.accessOrder.length > 0 ? this.accessOrder[0] : null;
  }

  private selectLFUCandidate(): number | null {
    // Return the least frequently used timestamp
    let minFrequency = Infinity;
    let candidate: number | null = null;

    for (const [timestamp, frequency] of this.accessFrequency) {
      if (frequency < minFrequency && this.cache.has(timestamp)) {
        minFrequency = frequency;
        candidate = timestamp;
      }
    }

    return candidate;
  }

  private selectAdaptiveCandidate(): number | null {
    // Combine LRU and LFU with age weighting
    const now = Date.now();
    let bestScore = -1;
    let candidate: number | null = null;

    for (const [timestamp, entry] of this.cache) {
      const age = now - entry.createdAt;
      const frequency = this.accessFrequency.get(timestamp) || 1;
      const recentAccessIndex = this.accessOrder.indexOf(timestamp);
      
      // Lower score = better candidate for eviction
      // Factors: age (older is better for eviction), frequency (lower is better), recent access (earlier in order is better)
      const score = (age / 1000) + (1 / frequency) + (recentAccessIndex * 0.1);
      
      if (score > bestScore) {
        bestScore = score;
        candidate = timestamp;
      }
    }

    return candidate;
  }

  private updateAccessOrder(timestamp: number): void {
    // Remove from current position
    this.accessOrder = this.accessOrder.filter(t => t !== timestamp);
    // Add to end (most recently used)
    this.accessOrder.push(timestamp);
  }

  private updateAccessFrequency(timestamp: number): void {
    const currentFreq = this.accessFrequency.get(timestamp) || 0;
    this.accessFrequency.set(timestamp, currentFreq + 1);
  }

  private isExpired(entry: LayoutCacheEntry): boolean {
    return Date.now() - entry.createdAt > this.config.ttl;
  }

  private removeExpiredEntries(): void {
    const now = Date.now();
    const toRemove: number[] = [];

    for (const [timestamp, entry] of this.cache) {
      if (now - entry.createdAt > this.config.ttl) {
        toRemove.push(timestamp);
      }
    }

    for (const timestamp of toRemove) {
      this.remove(timestamp);
    }
  }

  private compressOldEntries(): void {
    const now = Date.now();

    for (const entry of this.cache.values()) {
      if (!entry.compressed && (now - entry.createdAt) > this.config.compressionThreshold) {
        this.compressEntry(entry);
      }
    }
  }

  private compressEntry(entry: LayoutCacheEntry): void {
    // Simple compression: remove redundant data and mark as compressed
    // In a real implementation, you might use actual compression algorithms
    entry.compressed = true;
    
    // Could implement actual compression here:
    // - Remove redundant element properties
    // - Compress coordinate data
    // - Use run-length encoding for repetitive data
  }

  private decompressEntry(entry: LayoutCacheEntry): void {
    // Restore compressed data
    entry.compressed = false;
    
    // Implementation would restore the compressed data
  }

  private enforceMemoryLimit(): void {
    let currentUsage = 0;
    for (const entry of this.cache.values()) {
      currentUsage += this.estimateEntrySize(entry);
    }

    // If over memory limit, evict entries until under limit
    while (currentUsage > this.config.memoryLimit && this.cache.size > 0) {
      const candidate = this.selectEvictionCandidate();
      if (candidate !== null) {
        const entry = this.cache.get(candidate);
        if (entry) {
          currentUsage -= this.estimateEntrySize(entry);
        }
        this.remove(candidate);
      } else {
        break;
      }
    }
  }

  private estimateEntrySize(entry: LayoutCacheEntry): number {
    // Rough estimation of memory usage for an entry
    let size = 0;
    
    // Basic entry properties
    size += 100; // Overhead
    
    // Elements array
    size += entry.elements.length * 500; // Rough estimate per element
    
    // Region assignments
    size += entry.regionAssignments.size * 50;
    
    // Transition data
    size += entry.transitionData.length * 100;
    
    return size;
  }

  private startCleanupInterval(): void {
    // Periodic cleanup every 30 seconds
    setInterval(() => {
      this.optimize();
    }, 30 * 1000);
  }

  /**
   * Get cache hit rate
   */
  public getHitRate(): number {
    return this.stats.totalAccesses > 0 ? this.stats.hits / this.stats.totalAccesses : 0;
  }

  /**
   * Get total number of cache accesses
   */
  public getTotalAccesses(): number {
    return this.stats.totalAccesses;
  }

  /**
   * Get average computation time
   */
  public getAverageComputationTime(): number {
    return this.stats.totalAccesses > 0 ? this.stats.totalComputationTime / this.stats.totalAccesses : 0;
  }

  /**
   * Get current cache size
   */
  public get size(): number {
    return this.cache.size;
  }

  /**
   * Pre-warm the cache with predicted timestamps
   */
  public preWarm(timestamps: number[], layoutGenerator: (timestamp: number) => LayoutCacheEntry): void {
    for (const timestamp of timestamps) {
      if (!this.has(timestamp)) {
        // Generate layout in background
        setTimeout(() => {
          const entry = layoutGenerator(timestamp);
          this.set(timestamp, entry);
        }, 0);
      }
    }
  }

  /**
   * Export cache data for persistence
   */
  public export(): any {
    return {
      entries: Array.from(this.cache.entries()),
      stats: this.stats,
      config: this.config
    };
  }

  /**
   * Import cache data from persistence
   */
  public import(data: any): void {
    this.clear();
    
    if (data.entries) {
      for (const [timestamp, entry] of data.entries) {
        this.cache.set(timestamp, entry);
      }
    }
    
    if (data.stats) {
      this.stats = { ...this.stats, ...data.stats };
    }
  }
}

/**
 * Factory function to create a layout cache
 */
export function createLayoutCache(config?: Partial<CacheConfig>): LayoutCache {
  return new LayoutCache(config);
}