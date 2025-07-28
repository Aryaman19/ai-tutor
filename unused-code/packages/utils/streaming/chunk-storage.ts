/**
 * Chunk Storage System
 * 
 * Efficient storage and retrieval of timeline chunks with caching,
 * memory management, and performance optimization.
 * Integrates with existing React Query patterns for consistency.
 */

import type {
  StreamingTimelineChunk,
  StreamingTimelineLesson,
  ChunkStatus,
} from '@ai-tutor/types';

import type { TimelineEvent } from '@ai-tutor/types';

import { createUtilLogger } from '../logger';

const logger = createUtilLogger('ChunkStorage');

/**
 * Storage configuration options
 */
export interface ChunkStorageOptions {
  /** Maximum memory usage (bytes) */
  maxMemoryUsage: number;
  
  /** Cache duration for chunks (milliseconds) */
  cacheDuration: number;
  
  /** Enable persistent storage */
  enablePersistentStorage: boolean;
  
  /** Storage key prefix */
  storageKeyPrefix: string;
  
  /** Compression settings */
  compression: {
    /** Enable compression for large chunks */
    enabled: boolean;
    
    /** Minimum size for compression (bytes) */
    minSizeForCompression: number;
    
    /** Compression level (1-9) */
    level: number;
  };
  
  /** Performance monitoring */
  performance: {
    /** Enable access pattern tracking */
    trackAccessPatterns: boolean;
    
    /** Enable size monitoring */
    trackSizeMetrics: boolean;
    
    /** Performance log interval (milliseconds) */
    logInterval: number;
  };
}

/**
 * Default storage options
 */
const DEFAULT_STORAGE_OPTIONS: ChunkStorageOptions = {
  maxMemoryUsage: 100 * 1024 * 1024, // 100MB
  cacheDuration: 30 * 60 * 1000, // 30 minutes
  enablePersistentStorage: true,
  storageKeyPrefix: 'timeline_chunk_',
  compression: {
    enabled: true,
    minSizeForCompression: 10 * 1024, // 10KB
    level: 6,
  },
  performance: {
    trackAccessPatterns: true,
    trackSizeMetrics: true,
    logInterval: 60000, // 1 minute
  },
};

/**
 * Chunk storage entry with metadata
 */
interface ChunkStorageEntry {
  chunk: StreamingTimelineChunk;
  metadata: {
    storedAt: number;
    lastAccessed: number;
    accessCount: number;
    sizeBytes: number;
    compressed: boolean;
  };
}

/**
 * Storage performance metrics
 */
interface StorageMetrics {
  totalChunks: number;
  totalSizeBytes: number;
  hitRate: number;
  missRate: number;
  averageAccessTime: number;
  memoryUsage: number;
  compressionRatio: number;
}

/**
 * Access pattern information
 */
interface AccessPattern {
  chunkId: string;
  accessTimes: number[];
  frequency: number;
  sequentialAccess: boolean;
  predictedNextAccess?: number;
}

/**
 * Main Chunk Storage class
 */
export class ChunkStorage {
  private storage = new Map<string, ChunkStorageEntry>();
  private readonly options: ChunkStorageOptions;
  private metrics: StorageMetrics;
  private accessPatterns = new Map<string, AccessPattern>();
  private cleanupTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;

  constructor(options: Partial<ChunkStorageOptions> = {}) {
    this.options = { ...DEFAULT_STORAGE_OPTIONS, ...options };
    this.metrics = {
      totalChunks: 0,
      totalSizeBytes: 0,
      hitRate: 0,
      missRate: 0,
      averageAccessTime: 0,
      memoryUsage: 0,
      compressionRatio: 1,
    };

    this.startBackgroundTasks();
    logger.info('ChunkStorage initialized', { options: this.options });
  }

  /**
   * Store a chunk
   */
  async store(chunk: StreamingTimelineChunk): Promise<void> {
    const startTime = performance.now();
    
    try {
      // Calculate chunk size
      const chunkSize = this.calculateChunkSize(chunk);
      
      // Check memory limits
      if (this.metrics.memoryUsage + chunkSize > this.options.maxMemoryUsage) {
        await this.evictChunks(chunkSize);
      }

      // Compress if needed
      let finalChunk = chunk;
      let compressed = false;
      if (this.options.compression.enabled && chunkSize > this.options.compression.minSizeForCompression) {
        finalChunk = await this.compressChunk(chunk);
        compressed = true;
      }

      // Create storage entry
      const entry: ChunkStorageEntry = {
        chunk: finalChunk,
        metadata: {
          storedAt: Date.now(),
          lastAccessed: Date.now(),
          accessCount: 0,
          sizeBytes: chunkSize,
          compressed,
        },
      };

      // Store in memory
      this.storage.set(chunk.chunkId, entry);

      // Store persistently if enabled
      if (this.options.enablePersistentStorage) {
        await this.storePersistent(chunk.chunkId, entry);
      }

      // Update metrics
      this.metrics.totalChunks++;
      this.metrics.totalSizeBytes += chunkSize;
      this.metrics.memoryUsage += chunkSize;

      // Initialize access pattern
      if (this.options.performance.trackAccessPatterns) {
        this.accessPatterns.set(chunk.chunkId, {
          chunkId: chunk.chunkId,
          accessTimes: [],
          frequency: 0,
          sequentialAccess: false,
        });
      }

      const duration = performance.now() - startTime;
      logger.debug('Chunk stored', { 
        chunkId: chunk.chunkId, 
        sizeBytes: chunkSize, 
        compressed, 
        duration: `${duration.toFixed(2)}ms` 
      });

    } catch (error) {
      logger.error('Error storing chunk', { chunkId: chunk.chunkId, error });
      throw error;
    }
  }

  /**
   * Retrieve a chunk
   */
  async retrieve(chunkId: string): Promise<StreamingTimelineChunk | null> {
    const startTime = performance.now();
    
    try {
      // Try memory first
      let entry = this.storage.get(chunkId);
      let cacheHit = true;

      // Try persistent storage if not in memory
      if (!entry && this.options.enablePersistentStorage) {
        entry = await this.retrievePersistent(chunkId);
        cacheHit = false;
        
        if (entry) {
          // Re-store in memory for faster access
          this.storage.set(chunkId, entry);
          this.metrics.memoryUsage += entry.metadata.sizeBytes;
        }
      }

      if (!entry) {
        this.updateMissMetrics();
        return null;
      }

      // Update access metadata
      entry.metadata.lastAccessed = Date.now();
      entry.metadata.accessCount++;

      // Update access patterns
      if (this.options.performance.trackAccessPatterns) {
        this.updateAccessPattern(chunkId);
      }

      // Decompress if needed
      let chunk = entry.chunk;
      if (entry.metadata.compressed) {
        chunk = await this.decompressChunk(chunk);
      }

      // Update metrics
      this.updateHitMetrics(cacheHit);
      
      const duration = performance.now() - startTime;
      this.metrics.averageAccessTime = (this.metrics.averageAccessTime + duration) / 2;

      logger.debug('Chunk retrieved', { 
        chunkId, 
        cacheHit, 
        duration: `${duration.toFixed(2)}ms` 
      });

      return chunk;

    } catch (error) {
      logger.error('Error retrieving chunk', { chunkId, error });
      this.updateMissMetrics();
      return null;
    }
  }

  /**
   * Check if chunk exists
   */
  has(chunkId: string): boolean {
    return this.storage.has(chunkId);
  }

  /**
   * Remove a chunk
   */
  async remove(chunkId: string): Promise<boolean> {
    const entry = this.storage.get(chunkId);
    const removed = this.storage.delete(chunkId);
    
    if (removed && entry) {
      this.metrics.totalChunks--;
      this.metrics.totalSizeBytes -= entry.metadata.sizeBytes;
      this.metrics.memoryUsage -= entry.metadata.sizeBytes;
      
      // Remove from persistent storage
      if (this.options.enablePersistentStorage) {
        await this.removePersistent(chunkId);
      }
      
      // Remove access pattern
      this.accessPatterns.delete(chunkId);
      
      logger.debug('Chunk removed', { chunkId });
    }
    
    return removed;
  }

  /**
   * Get multiple chunks efficiently
   */
  async retrieveMultiple(chunkIds: string[]): Promise<(StreamingTimelineChunk | null)[]> {
    const startTime = performance.now();
    
    // Parallel retrieval for better performance
    const promises = chunkIds.map(id => this.retrieve(id));
    const results = await Promise.all(promises);
    
    const duration = performance.now() - startTime;
    logger.debug('Multiple chunks retrieved', { 
      count: chunkIds.length, 
      found: results.filter(r => r !== null).length,
      duration: `${duration.toFixed(2)}ms` 
    });
    
    return results;
  }

  /**
   * Store multiple chunks efficiently
   */
  async storeMultiple(chunks: StreamingTimelineChunk[]): Promise<void> {
    const startTime = performance.now();
    
    // Parallel storage for better performance
    const promises = chunks.map(chunk => this.store(chunk));
    await Promise.all(promises);
    
    const duration = performance.now() - startTime;
    logger.debug('Multiple chunks stored', { 
      count: chunks.length, 
      duration: `${duration.toFixed(2)}ms` 
    });
  }

  /**
   * Get chunks in a time range
   */
  async getChunksInTimeRange(startTime: number, endTime: number): Promise<StreamingTimelineChunk[]> {
    const chunks: StreamingTimelineChunk[] = [];
    
    for (const [chunkId] of this.storage) {
      const chunk = await this.retrieve(chunkId);
      if (chunk) {
        const chunkStart = chunk.timestampOffset;
        const chunkEnd = chunkStart + chunk.duration;
        
        // Check if chunk overlaps with time range
        if (chunkStart <= endTime && chunkEnd >= startTime) {
          chunks.push(chunk);
        }
      }
    }
    
    // Sort by start time
    chunks.sort((a, b) => a.timestampOffset - b.timestampOffset);
    
    return chunks;
  }

  /**
   * Preload chunks based on access patterns
   */
  async preloadChunks(currentChunkId: string, lookAhead: number = 2): Promise<void> {
    if (!this.options.performance.trackAccessPatterns) return;
    
    const pattern = this.accessPatterns.get(currentChunkId);
    if (!pattern || !pattern.sequentialAccess) return;
    
    // Find the current chunk to determine next chunks
    const currentChunk = await this.retrieve(currentChunkId);
    if (!currentChunk) return;
    
    // Preload next chunks in sequence
    const nextChunkNumbers = Array.from({ length: lookAhead }, (_, i) => 
      currentChunk.chunkNumber + i + 1
    );
    
    // This would require chunk ID mapping by number - simplified for now
    logger.debug('Preloading suggested', { 
      currentChunkId, 
      nextChunkNumbers,
      pattern: pattern.sequentialAccess 
    });
  }

  /**
   * Get storage metrics
   */
  getMetrics(): StorageMetrics {
    return { ...this.metrics };
  }

  /**
   * Get access patterns
   */
  getAccessPatterns(): AccessPattern[] {
    return Array.from(this.accessPatterns.values());
  }

  /**
   * Clear all storage
   */
  async clear(): Promise<void> {
    const chunkCount = this.storage.size;
    
    // Clear memory
    this.storage.clear();
    this.accessPatterns.clear();
    
    // Clear persistent storage
    if (this.options.enablePersistentStorage) {
      await this.clearPersistent();
    }
    
    // Reset metrics
    this.metrics = {
      totalChunks: 0,
      totalSizeBytes: 0,
      hitRate: 0,
      missRate: 0,
      averageAccessTime: 0,
      memoryUsage: 0,
      compressionRatio: 1,
    };
    
    logger.info('Storage cleared', { removedChunks: chunkCount });
  }

  /**
   * Cleanup and shutdown
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    
    logger.info('ChunkStorage destroyed');
  }

  /**
   * Private: Calculate chunk size in bytes
   */
  private calculateChunkSize(chunk: StreamingTimelineChunk): number {
    // Rough estimation - in production, use proper serialization size
    const jsonString = JSON.stringify(chunk);
    return new Blob([jsonString]).size;
  }

  /**
   * Private: Compress chunk (placeholder implementation)
   */
  private async compressChunk(chunk: StreamingTimelineChunk): Promise<StreamingTimelineChunk> {
    // In production, implement actual compression (e.g., using pako)
    // For now, return as-is
    return chunk;
  }

  /**
   * Private: Decompress chunk (placeholder implementation)
   */
  private async decompressChunk(chunk: StreamingTimelineChunk): Promise<StreamingTimelineChunk> {
    // In production, implement actual decompression
    // For now, return as-is
    return chunk;
  }

  /**
   * Private: Evict chunks to free memory
   */
  private async evictChunks(requiredSpace: number): Promise<void> {
    const entries = Array.from(this.storage.entries())
      .map(([id, entry]) => ({ id, entry }))
      .sort((a, b) => {
        // Evict least recently used first
        const aScore = a.entry.metadata.lastAccessed - (a.entry.metadata.accessCount * 1000);
        const bScore = b.entry.metadata.lastAccessed - (b.entry.metadata.accessCount * 1000);
        return aScore - bScore;
      });

    let freedSpace = 0;
    const evicted: string[] = [];
    
    for (const { id, entry } of entries) {
      if (freedSpace >= requiredSpace) break;
      
      await this.remove(id);
      freedSpace += entry.metadata.sizeBytes;
      evicted.push(id);
    }
    
    logger.debug('Chunks evicted for memory', { 
      evictedCount: evicted.length, 
      freedBytes: freedSpace 
    });
  }

  /**
   * Private: Update access pattern
   */
  private updateAccessPattern(chunkId: string): void {
    const pattern = this.accessPatterns.get(chunkId);
    if (!pattern) return;
    
    const now = Date.now();
    pattern.accessTimes.push(now);
    pattern.frequency++;
    
    // Keep only recent access times
    pattern.accessTimes = pattern.accessTimes.filter(time => now - time < 300000); // 5 minutes
    
    // Detect sequential access
    if (pattern.accessTimes.length >= 2) {
      const intervals = pattern.accessTimes
        .slice(1)
        .map((time, i) => time - pattern.accessTimes[i]);
      
      const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
      pattern.sequentialAccess = avgInterval < 60000; // Less than 1 minute intervals
      
      if (pattern.sequentialAccess) {
        pattern.predictedNextAccess = now + avgInterval;
      }
    }
  }

  /**
   * Private: Update hit metrics
   */
  private updateHitMetrics(wasHit: boolean): void {
    const total = this.metrics.hitRate + this.metrics.missRate;
    if (wasHit) {
      this.metrics.hitRate = (this.metrics.hitRate * total + 1) / (total + 1);
      this.metrics.missRate = this.metrics.missRate * total / (total + 1);
    } else {
      this.updateMissMetrics();
    }
  }

  /**
   * Private: Update miss metrics
   */
  private updateMissMetrics(): void {
    const total = this.metrics.hitRate + this.metrics.missRate;
    this.metrics.hitRate = this.metrics.hitRate * total / (total + 1);
    this.metrics.missRate = (this.metrics.missRate * total + 1) / (total + 1);
  }

  /**
   * Private: Start background tasks
   */
  private startBackgroundTasks(): void {
    // Cleanup task
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredChunks();
    }, this.options.cacheDuration / 4); // Check 4 times per cache duration

    // Metrics logging
    if (this.options.performance.logInterval > 0) {
      this.metricsTimer = setInterval(() => {
        logger.debug('Storage metrics', this.getMetrics());
      }, this.options.performance.logInterval);
    }
  }

  /**
   * Private: Cleanup expired chunks
   */
  private async cleanupExpiredChunks(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [chunkId, entry] of this.storage) {
      if (now - entry.metadata.lastAccessed > this.options.cacheDuration) {
        toRemove.push(chunkId);
      }
    }
    
    for (const chunkId of toRemove) {
      await this.remove(chunkId);
    }
    
    if (toRemove.length > 0) {
      logger.debug('Expired chunks cleaned up', { count: toRemove.length });
    }
  }

  /**
   * Private: Persistent storage operations (localStorage/IndexedDB)
   */
  private async storePersistent(chunkId: string, entry: ChunkStorageEntry): Promise<void> {
    try {
      const key = this.options.storageKeyPrefix + chunkId;
      const serialized = JSON.stringify(entry);
      localStorage.setItem(key, serialized);
    } catch (error) {
      logger.warn('Failed to store chunk persistently', { chunkId, error });
    }
  }

  private async retrievePersistent(chunkId: string): Promise<ChunkStorageEntry | null> {
    try {
      const key = this.options.storageKeyPrefix + chunkId;
      const serialized = localStorage.getItem(key);
      return serialized ? JSON.parse(serialized) : null;
    } catch (error) {
      logger.warn('Failed to retrieve chunk from persistent storage', { chunkId, error });
      return null;
    }
  }

  private async removePersistent(chunkId: string): Promise<void> {
    try {
      const key = this.options.storageKeyPrefix + chunkId;
      localStorage.removeItem(key);
    } catch (error) {
      logger.warn('Failed to remove chunk from persistent storage', { chunkId, error });
    }
  }

  private async clearPersistent(): Promise<void> {
    try {
      const keys = Object.keys(localStorage).filter(key => 
        key.startsWith(this.options.storageKeyPrefix)
      );
      keys.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      logger.warn('Failed to clear persistent storage', { error });
    }
  }
}