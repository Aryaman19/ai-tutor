/**
 * Memory Manager - Phase 4: Timeline Control & Playback
 * 
 * Handles memory-efficient management of timeline content for long-duration
 * educational sessions. Provides intelligent caching, cleanup, and optimization
 * strategies to maintain smooth performance.
 */

import { createUtilLogger } from '../logger';

const logger = createUtilLogger('MemoryManager');

/**
 * Memory usage categories
 */
export type MemoryCategory = 'timeline_events' | 'audio_buffers' | 'visual_elements' | 'cache_data' | 'metadata';

/**
 * Memory cleanup strategy
 */
export type CleanupStrategy = 'lru' | 'temporal' | 'priority' | 'size_based';

/**
 * Memory entry interface
 */
interface MemoryEntry {
  /** Unique identifier */
  id: string;
  
  /** Memory category */
  category: MemoryCategory;
  
  /** Estimated size in bytes */
  size: number;
  
  /** Priority for retention (higher = keep longer) */
  priority: number;
  
  /** Last access timestamp */
  lastAccessed: number;
  
  /** Creation timestamp */
  createdAt: number;
  
  /** Number of accesses */
  accessCount: number;
  
  /** Associated timeline position (if applicable) */
  timelinePosition?: number;
  
  /** Cleanup cost (processing required to recreate) */
  cleanupCost: number;
  
  /** Whether this entry can be safely removed */
  disposable: boolean;
  
  /** Reference to the actual data */
  data: any;
  
  /** Metadata for debugging */
  metadata?: Record<string, any>;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  /** Total memory usage by category */
  usageByCategory: Record<MemoryCategory, number>;
  
  /** Total memory usage */
  totalUsage: number;
  
  /** Peak memory usage in session */
  peakUsage: number;
  
  /** Number of entries by category */
  entriesByCategory: Record<MemoryCategory, number>;
  
  /** Total number of entries */
  totalEntries: number;
  
  /** Cleanup operations performed */
  cleanupOperations: number;
  
  /** Memory efficiency (0-1, higher is better) */
  efficiency: number;
  
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
  
  /** Average entry size */
  averageEntrySize: number;
}

/**
 * Memory manager configuration
 */
export interface MemoryManagerConfig {
  /** Maximum total memory usage (bytes) */
  maxTotalMemory: number;
  
  /** Memory limits by category */
  categoryLimits: Partial<Record<MemoryCategory, number>>;
  
  /** Cleanup threshold (start cleanup when usage exceeds this) */
  cleanupThreshold: number;
  
  /** Target memory after cleanup */
  cleanupTarget: number;
  
  /** Default cleanup strategy */
  defaultCleanupStrategy: CleanupStrategy;
  
  /** Cleanup strategies by category */
  categoryStrategies: Partial<Record<MemoryCategory, CleanupStrategy>>;
  
  /** Automatic cleanup settings */
  autoCleanup: {
    /** Enable automatic cleanup */
    enabled: boolean;
    
    /** Cleanup interval (milliseconds) */
    interval: number;
    
    /** Minimum time between cleanups */
    minInterval: number;
    
    /** Aggressive cleanup threshold (emergency cleanup) */
    aggressiveThreshold: number;
  };
  
  /** Performance monitoring */
  monitoring: {
    /** Enable detailed monitoring */
    enabled: boolean;
    
    /** Update interval for statistics */
    updateInterval: number;
    
    /** Track access patterns */
    trackAccessPatterns: boolean;
  };
}

/**
 * Default memory manager configuration
 */
const DEFAULT_MEMORY_CONFIG: MemoryManagerConfig = {
  maxTotalMemory: 200 * 1024 * 1024, // 200MB
  categoryLimits: {
    timeline_events: 50 * 1024 * 1024,  // 50MB
    audio_buffers: 75 * 1024 * 1024,    // 75MB
    visual_elements: 40 * 1024 * 1024,  // 40MB
    cache_data: 25 * 1024 * 1024,       // 25MB
    metadata: 10 * 1024 * 1024,         // 10MB
  },
  cleanupThreshold: 0.8, // 80% of max memory
  cleanupTarget: 0.6,    // Clean up to 60% of max memory
  defaultCleanupStrategy: 'lru',
  categoryStrategies: {
    timeline_events: 'temporal',
    audio_buffers: 'lru',
    visual_elements: 'lru',
    cache_data: 'size_based',
    metadata: 'priority',
  },
  autoCleanup: {
    enabled: true,
    interval: 30000,      // 30 seconds
    minInterval: 5000,    // 5 seconds minimum
    aggressiveThreshold: 0.95, // 95% for emergency cleanup
  },
  monitoring: {
    enabled: true,
    updateInterval: 1000, // 1 second
    trackAccessPatterns: true,
  },
};

/**
 * Cleanup operation result
 */
interface CleanupResult {
  /** Number of entries removed */
  entriesRemoved: number;
  
  /** Memory freed (bytes) */
  memoryFreed: number;
  
  /** Time taken for cleanup (milliseconds) */
  cleanupTime: number;
  
  /** Entries removed by category */
  removedByCategory: Partial<Record<MemoryCategory, number>>;
  
  /** Whether cleanup target was achieved */
  targetAchieved: boolean;
}

/**
 * Main Memory Manager class
 */
export class MemoryManager {
  private config: MemoryManagerConfig;
  private memoryEntries = new Map<string, MemoryEntry>();
  private categoryUsage = new Map<MemoryCategory, number>();
  private stats: MemoryStats;
  private lastCleanup = 0;
  private cleanupTimer?: NodeJS.Timeout;
  private monitoringTimer?: NodeJS.Timeout;
  private eventHandlers = new Map<string, Array<(data: any) => void>>();
  
  // Performance tracking
  private accessCount = 0;
  private hitCount = 0;
  private totalCleanups = 0;
  private peakUsage = 0;

  constructor(config: Partial<MemoryManagerConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    this.stats = this.createInitialStats();
    
    // Initialize category usage tracking
    for (const category of Object.keys(this.config.categoryLimits) as MemoryCategory[]) {
      this.categoryUsage.set(category, 0);
    }
    
    // Start background services
    this.startBackgroundServices();
    
    logger.info('MemoryManager initialized', {
      maxMemory: this.config.maxTotalMemory,
      autoCleanup: this.config.autoCleanup.enabled,
      monitoring: this.config.monitoring.enabled,
    });
  }

  /**
   * Store data in memory with automatic management
   */
  async store(
    id: string,
    data: any,
    category: MemoryCategory,
    options: {
      priority?: number;
      timelinePosition?: number;
      disposable?: boolean;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<boolean> {
    try {
      const size = this.estimateDataSize(data);
      const now = performance.now();
      
      // Check if we have space for this entry
      if (!this.canAllocate(size, category)) {
        // Attempt cleanup to make space
        await this.performCleanup('size_based', size);
        
        // Check again after cleanup
        if (!this.canAllocate(size, category)) {
          logger.warn('Cannot allocate memory for entry', {
            id,
            size,
            category,
            currentUsage: this.getTotalUsage(),
            maxMemory: this.config.maxTotalMemory,
          });
          return false;
        }
      }
      
      // Remove existing entry if present
      if (this.memoryEntries.has(id)) {
        this.remove(id);
      }
      
      // Create memory entry
      const entry: MemoryEntry = {
        id,
        category,
        size,
        priority: options.priority || 1,
        lastAccessed: now,
        createdAt: now,
        accessCount: 1,
        timelinePosition: options.timelinePosition,
        cleanupCost: this.estimateCleanupCost(data, category),
        disposable: options.disposable !== false, // Default to disposable
        data,
        metadata: options.metadata,
      };
      
      // Store entry
      this.memoryEntries.set(id, entry);
      
      // Update usage tracking
      const currentUsage = this.categoryUsage.get(category) || 0;
      this.categoryUsage.set(category, currentUsage + size);
      
      // Update peak usage
      const totalUsage = this.getTotalUsage();
      if (totalUsage > this.peakUsage) {
        this.peakUsage = totalUsage;
      }
      
      // Emit storage event
      this.emit('entryStored', {
        id,
        category,
        size,
        totalUsage,
      });
      
      logger.debug('Entry stored in memory', {
        id,
        category,
        size,
        totalUsage,
        entries: this.memoryEntries.size,
      });
      
      return true;

    } catch (error) {
      logger.error('Error storing entry in memory', { id, category, error });
      return false;
    }
  }

  /**
   * Retrieve data from memory
   */
  retrieve(id: string): any {
    this.accessCount++;
    
    const entry = this.memoryEntries.get(id);
    if (!entry) {
      return null;
    }
    
    // Update access tracking
    entry.lastAccessed = performance.now();
    entry.accessCount++;
    this.hitCount++;
    
    logger.debug('Entry retrieved from memory', {
      id,
      category: entry.category,
      accessCount: entry.accessCount,
    });
    
    return entry.data;
  }

  /**
   * Check if data exists in memory
   */
  has(id: string): boolean {
    return this.memoryEntries.has(id);
  }

  /**
   * Remove specific entry from memory
   */
  remove(id: string): boolean {
    const entry = this.memoryEntries.get(id);
    if (!entry) {
      return false;
    }
    
    // Update usage tracking
    const currentUsage = this.categoryUsage.get(entry.category) || 0;
    this.categoryUsage.set(entry.category, Math.max(0, currentUsage - entry.size));
    
    // Remove entry
    this.memoryEntries.delete(id);
    
    this.emit('entryRemoved', {
      id,
      category: entry.category,
      size: entry.size,
      totalUsage: this.getTotalUsage(),
    });
    
    logger.debug('Entry removed from memory', {
      id,
      category: entry.category,
      size: entry.size,
      totalUsage: this.getTotalUsage(),
    });
    
    return true;
  }

  /**
   * Clear all entries in a category
   */
  clearCategory(category: MemoryCategory): number {
    const entriesToRemove = Array.from(this.memoryEntries.values())
      .filter(entry => entry.category === category);
    
    let removedCount = 0;
    for (const entry of entriesToRemove) {
      if (this.remove(entry.id)) {
        removedCount++;
      }
    }
    
    logger.debug('Category cleared', {
      category,
      removedCount,
      totalUsage: this.getTotalUsage(),
    });
    
    return removedCount;
  }

  /**
   * Clear all memory entries
   */
  clearAll(): void {
    const totalEntries = this.memoryEntries.size;
    
    this.memoryEntries.clear();
    
    for (const category of this.categoryUsage.keys()) {
      this.categoryUsage.set(category, 0);
    }
    
    this.emit('allCleared', {
      entriesRemoved: totalEntries,
    });
    
    logger.debug('All memory entries cleared', {
      entriesRemoved: totalEntries,
    });
  }

  /**
   * Perform manual cleanup with specific strategy
   */
  async performCleanup(
    strategy?: CleanupStrategy,
    targetFreeSpace?: number
  ): Promise<CleanupResult> {
    const startTime = performance.now();
    const initialUsage = this.getTotalUsage();
    
    const cleanupStrategy = strategy || this.config.defaultCleanupStrategy;
    const targetMemory = targetFreeSpace
      ? this.config.maxTotalMemory - targetFreeSpace
      : this.config.maxTotalMemory * this.config.cleanupTarget;
    
    logger.debug('Starting memory cleanup', {
      strategy: cleanupStrategy,
      initialUsage,
      targetMemory,
      entries: this.memoryEntries.size,
    });
    
    const removedByCategory: Partial<Record<MemoryCategory, number>> = {};
    let entriesRemoved = 0;
    
    try {
      // Get cleanup candidates based on strategy
      const candidates = this.getCleanupCandidates(cleanupStrategy);
      
      // Remove entries until we reach target
      for (const entry of candidates) {
        if (this.getTotalUsage() <= targetMemory) break;
        
        if (this.remove(entry.id)) {
          entriesRemoved++;
          removedByCategory[entry.category] = (removedByCategory[entry.category] || 0) + 1;
        }
      }
      
      const finalUsage = this.getTotalUsage();
      const memoryFreed = initialUsage - finalUsage;
      const cleanupTime = performance.now() - startTime;
      const targetAchieved = finalUsage <= targetMemory;
      
      this.totalCleanups++;
      this.lastCleanup = performance.now();
      
      const result: CleanupResult = {
        entriesRemoved,
        memoryFreed,
        cleanupTime,
        removedByCategory,
        targetAchieved,
      };
      
      this.emit('cleanupCompleted', result);
      
      logger.debug('Memory cleanup completed', {
        ...result,
        initialUsage,
        finalUsage,
        strategy: cleanupStrategy,
      });
      
      return result;

    } catch (error) {
      logger.error('Error during memory cleanup', { error });
      
      return {
        entriesRemoved: 0,
        memoryFreed: 0,
        cleanupTime: performance.now() - startTime,
        removedByCategory: {},
        targetAchieved: false,
      };
    }
  }

  /**
   * Get current memory statistics
   */
  getStats(): MemoryStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Get memory usage by category
   */
  getUsageByCategory(): Record<MemoryCategory, number> {
    const usage: Partial<Record<MemoryCategory, number>> = {};
    
    for (const [category, amount] of this.categoryUsage) {
      usage[category] = amount;
    }
    
    return usage as Record<MemoryCategory, number>;
  }

  /**
   * Get total memory usage
   */
  getTotalUsage(): number {
    return Array.from(this.categoryUsage.values()).reduce((sum, usage) => sum + usage, 0);
  }

  /**
   * Check if memory is available for allocation
   */
  canAllocate(size: number, category: MemoryCategory): boolean {
    const totalUsage = this.getTotalUsage();
    const categoryUsage = this.categoryUsage.get(category) || 0;
    const categoryLimit = this.config.categoryLimits[category];
    
    // Check total memory limit
    if (totalUsage + size > this.config.maxTotalMemory) {
      return false;
    }
    
    // Check category limit if defined
    if (categoryLimit && categoryUsage + size > categoryLimit) {
      return false;
    }
    
    return true;
  }

  /**
   * Optimize memory layout and cleanup fragmented entries
   */
  async optimize(): Promise<void> {
    logger.debug('Optimizing memory layout');
    
    try {
      // Perform cleanup with LRU strategy to remove stale entries
      await this.performCleanup('lru');
      
      // Compact memory usage data structures (if needed)
      this.compactDataStructures();
      
      this.emit('memoryOptimized', {
        totalUsage: this.getTotalUsage(),
        entries: this.memoryEntries.size,
      });
      
      logger.debug('Memory optimization completed', {
        totalUsage: this.getTotalUsage(),
        entries: this.memoryEntries.size,
      });

    } catch (error) {
      logger.error('Error optimizing memory', { error });
      throw error;
    }
  }

  /**
   * Register event handler
   */
  on(event: string, handler: (data: any) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Unregister event handler
   */
  off(event: string, handler: (data: any) => void): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Shutdown memory manager and cleanup
   */
  shutdown(): void {
    logger.debug('Shutting down MemoryManager');
    
    this.stopBackgroundServices();
    this.clearAll();
    this.eventHandlers.clear();
    
    logger.debug('MemoryManager shutdown complete');
  }

  // ========== Private Methods ==========

  /**
   * Estimate data size in bytes
   */
  private estimateDataSize(data: any): number {
    try {
      if (data instanceof ArrayBuffer) {
        return data.byteLength;
      } else if (data instanceof Blob) {
        return data.size;
      } else if (typeof data === 'string') {
        return data.length * 2; // UTF-16
      } else {
        return JSON.stringify(data).length * 2;
      }
    } catch (error) {
      // Fallback estimation
      return 1024; // 1KB default
    }
  }

  /**
   * Estimate cleanup cost for data
   */
  private estimateCleanupCost(data: any, category: MemoryCategory): number {
    // Higher cost = harder to recreate, less likely to be cleaned up
    switch (category) {
      case 'timeline_events':
        return 10; // High cost - requires LLM generation
      case 'audio_buffers':
        return 8;  // High cost - requires TTS processing
      case 'visual_elements':
        return 5;  // Medium cost - requires layout calculation
      case 'cache_data':
        return 2;  // Low cost - can be recalculated
      case 'metadata':
        return 1;  // Very low cost - easily recreated
      default:
        return 3;
    }
  }

  /**
   * Get cleanup candidates based on strategy
   */
  private getCleanupCandidates(strategy: CleanupStrategy): MemoryEntry[] {
    const entries = Array.from(this.memoryEntries.values())
      .filter(entry => entry.disposable);
    
    switch (strategy) {
      case 'lru':
        return entries.sort((a, b) => a.lastAccessed - b.lastAccessed);
      
      case 'temporal':
        return entries.sort((a, b) => {
          // Prioritize by timeline position distance from current playback
          const currentPosition = 0; // Would get from timeline scheduler
          const aDistance = Math.abs((a.timelinePosition || 0) - currentPosition);
          const bDistance = Math.abs((b.timelinePosition || 0) - currentPosition);
          return bDistance - aDistance; // Further = more likely to be removed
        });
      
      case 'priority':
        return entries.sort((a, b) => a.priority - b.priority);
      
      case 'size_based':
        return entries.sort((a, b) => b.size - a.size); // Largest first
      
      default:
        return entries;
    }
  }

  /**
   * Create initial statistics
   */
  private createInitialStats(): MemoryStats {
    const categories: MemoryCategory[] = ['timeline_events', 'audio_buffers', 'visual_elements', 'cache_data', 'metadata'];
    
    const usageByCategory: Partial<Record<MemoryCategory, number>> = {};
    const entriesByCategory: Partial<Record<MemoryCategory, number>> = {};
    
    for (const category of categories) {
      usageByCategory[category] = 0;
      entriesByCategory[category] = 0;
    }
    
    return {
      usageByCategory: usageByCategory as Record<MemoryCategory, number>,
      totalUsage: 0,
      peakUsage: 0,
      entriesByCategory: entriesByCategory as Record<MemoryCategory, number>,
      totalEntries: 0,
      cleanupOperations: 0,
      efficiency: 1.0,
      cacheHitRate: 1.0,
      averageEntrySize: 0,
    };
  }

  /**
   * Update memory statistics
   */
  private updateStats(): void {
    const usageByCategory: Partial<Record<MemoryCategory, number>> = {};
    const entriesByCategory: Partial<Record<MemoryCategory, number>> = {};
    
    for (const category of this.categoryUsage.keys()) {
      usageByCategory[category] = this.categoryUsage.get(category) || 0;
      entriesByCategory[category] = 0;
    }
    
    // Count entries by category
    for (const entry of this.memoryEntries.values()) {
      entriesByCategory[entry.category] = (entriesByCategory[entry.category] || 0) + 1;
    }
    
    const totalUsage = this.getTotalUsage();
    const totalEntries = this.memoryEntries.size;
    
    this.stats = {
      usageByCategory: usageByCategory as Record<MemoryCategory, number>,
      totalUsage,
      peakUsage: Math.max(this.peakUsage, totalUsage),
      entriesByCategory: entriesByCategory as Record<MemoryCategory, number>,
      totalEntries,
      cleanupOperations: this.totalCleanups,
      efficiency: totalUsage > 0 ? Math.min(1.0, (this.config.maxTotalMemory - totalUsage) / this.config.maxTotalMemory) : 1.0,
      cacheHitRate: this.accessCount > 0 ? this.hitCount / this.accessCount : 1.0,
      averageEntrySize: totalEntries > 0 ? totalUsage / totalEntries : 0,
    };
  }

  /**
   * Compact data structures for better memory efficiency
   */
  private compactDataStructures(): void {
    // Recreate maps to eliminate fragmentation
    const entries = Array.from(this.memoryEntries.entries());
    this.memoryEntries.clear();
    
    for (const [id, entry] of entries) {
      this.memoryEntries.set(id, entry);
    }
  }

  /**
   * Start background services
   */
  private startBackgroundServices(): void {
    if (this.config.autoCleanup.enabled) {
      this.cleanupTimer = setInterval(() => {
        this.performPeriodicCleanup();
      }, this.config.autoCleanup.interval);
    }
    
    if (this.config.monitoring.enabled) {
      this.monitoringTimer = setInterval(() => {
        this.updateStats();
        this.checkMemoryHealth();
      }, this.config.monitoring.updateInterval);
    }
  }

  /**
   * Stop background services
   */
  private stopBackgroundServices(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }
  }

  /**
   * Perform periodic cleanup
   */
  private async performPeriodicCleanup(): Promise<void> {
    const now = performance.now();
    const timeSinceLastCleanup = now - this.lastCleanup;
    
    // Respect minimum cleanup interval
    if (timeSinceLastCleanup < this.config.autoCleanup.minInterval) {
      return;
    }
    
    const currentUsage = this.getTotalUsage();
    const usageRatio = currentUsage / this.config.maxTotalMemory;
    
    // Perform cleanup if above threshold
    if (usageRatio >= this.config.cleanupThreshold) {
      try {
        await this.performCleanup();
      } catch (error) {
        logger.error('Error in periodic cleanup', { error });
      }
    }
    
    // Perform aggressive cleanup if critical
    if (usageRatio >= this.config.autoCleanup.aggressiveThreshold) {
      try {
        await this.performCleanup('size_based');
      } catch (error) {
        logger.error('Error in aggressive cleanup', { error });
      }
    }
  }

  /**
   * Check memory health and emit warnings
   */
  private checkMemoryHealth(): void {
    const stats = this.getStats();
    
    if (stats.efficiency < 0.2) {
      this.emit('memoryWarning', {
        type: 'low_efficiency',
        efficiency: stats.efficiency,
        totalUsage: stats.totalUsage,
        maxMemory: this.config.maxTotalMemory,
      });
    }
    
    if (stats.totalUsage / this.config.maxTotalMemory > 0.9) {
      this.emit('memoryWarning', {
        type: 'high_usage',
        usage: stats.totalUsage,
        maxMemory: this.config.maxTotalMemory,
        ratio: stats.totalUsage / this.config.maxTotalMemory,
      });
    }
  }

  /**
   * Emit event to handlers
   */
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          logger.error('Error in event handler', { event, error });
        }
      });
    }
  }
}

export default MemoryManager;