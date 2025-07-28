/**
 * Progressive Buffer Manager
 * 
 * Enables YouTube-style progressive streaming where playback starts immediately
 * when minimal content is available, with intelligent background buffering.
 */

import type {
  StreamingTimelineChunk,
  TimelineEvent,
} from '@ai-tutor/types';

import { createUtilLogger } from '../logger';

const logger = createUtilLogger('ProgressiveBufferManager');

/**
 * Buffer region representing a continuous span of loaded content
 */
export interface BufferRegion {
  /** Start time of the buffered region (milliseconds) */
  startTime: number;
  
  /** End time of the buffered region (milliseconds) */
  endTime: number;
  
  /** Source chunks that contribute to this region */
  sourceChunks: string[];
  
  /** Loading status of this region */
  status: 'loading' | 'ready' | 'error';
  
  /** Priority for background loading */
  priority: 'low' | 'medium' | 'high';
  
  /** Last access time for garbage collection */
  lastAccessed: number;
}

/**
 * Progressive buffering configuration
 */
export interface ProgressiveBufferConfig {
  /** Minimum buffer required to start playback (milliseconds) */
  minStartBuffer: number;
  
  /** Target buffer size to maintain ahead of playback (milliseconds) */
  targetBuffer: number;
  
  /** Maximum buffer size to prevent memory issues (milliseconds) */
  maxBuffer: number;
  
  /** Buffer below which to trigger urgent loading (milliseconds) */
  urgentThreshold: number;
  
  /** How far ahead to prefetch content (milliseconds) */
  prefetchDistance: number;
  
  /** Enable adaptive buffer sizing based on network/performance */
  adaptiveBuffering: boolean;
  
  /** Memory management */
  memoryManagement: {
    /** Maximum memory usage in bytes */
    maxMemoryUsage: number;
    
    /** Cleanup threshold */
    cleanupThreshold: number;
    
    /** Cleanup interval */
    cleanupInterval: number;
  };
}

/**
 * Default progressive buffer configuration optimized for immediate playback
 */
const DEFAULT_PROGRESSIVE_CONFIG: ProgressiveBufferConfig = {
  minStartBuffer: 2000,      // Start playing with just 2 seconds
  targetBuffer: 10000,       // Maintain 10 seconds ahead
  maxBuffer: 30000,          // Max 30 seconds to save memory
  urgentThreshold: 1000,     // Urgent loading below 1 second
  prefetchDistance: 20000,   // Prefetch 20 seconds ahead
  adaptiveBuffering: true,
  memoryManagement: {
    maxMemoryUsage: 50 * 1024 * 1024, // 50MB
    cleanupThreshold: 40 * 1024 * 1024, // 40MB
    cleanupInterval: 15000, // 15 seconds
  },
};

/**
 * Playback readiness state
 */
export interface PlaybackReadiness {
  /** Can playback start now? */
  canStart: boolean;
  
  /** Current buffer level at playback position */
  bufferLevel: number;
  
  /** Reason if playback cannot start */
  reason?: string;
  
  /** Estimated time until ready (if not ready) */
  estimatedReadyTime?: number;
  
  /** Buffer regions available */
  availableRegions: BufferRegion[];
}

/**
 * Progressive Buffer Manager Events
 */
export interface ProgressiveBufferEvents {
  /** Emitted when playback can start */
  'playbackReady': { readiness: PlaybackReadiness };
  
  /** Emitted when buffer falls below urgent threshold */
  'bufferUrgent': { position: number; bufferLevel: number };
  
  /** Emitted when seeking to unbuffered region */
  'seekBlocked': { position: number; nearestBuffer: BufferRegion | null };
  
  /** Emitted when new content is buffered */
  'contentBuffered': { region: BufferRegion };
  
  /** Emitted when buffer regions change */
  'bufferChanged': { regions: BufferRegion[] };
  
  /** Emitted during memory cleanup */
  'memoryCleanup': { freedMemory: number; removedRegions: number };
}

/**
 * Progressive Buffer Manager
 * Handles YouTube-style progressive loading with immediate playback
 */
export class ProgressiveBufferManager {
  private config: ProgressiveBufferConfig;
  private eventHandlers = new Map<string, Array<(data: any) => void>>();
  
  // Buffer state
  private bufferRegions = new Map<string, BufferRegion>();
  private contentCache = new Map<string, TimelineEvent[]>();
  private currentPlaybackPosition = 0;
  private totalDuration = 0;
  
  // Memory management
  private memoryUsage = 0;
  private cleanupTimer?: NodeJS.Timeout;
  
  // Performance tracking
  private loadingRequests = new Set<string>();
  private metrics = {
    bufferHits: 0,
    bufferMisses: 0,
    averageLoadTime: 0,
    lastCleanupTime: 0,
  };

  constructor(config: Partial<ProgressiveBufferConfig> = {}) {
    this.config = { ...DEFAULT_PROGRESSIVE_CONFIG, ...config };
    
    // Start memory management
    this.startMemoryManagement();
    
    logger.info('Progressive Buffer Manager initialized', {
      minStartBuffer: this.config.minStartBuffer,
      targetBuffer: this.config.targetBuffer,
      adaptiveBuffering: this.config.adaptiveBuffering,
    });
  }

  /**
   * Add chunk content to the buffer
   */
  async addChunkContent(chunk: StreamingTimelineChunk): Promise<void> {
    const chunkId = chunk.chunkId;
    const startTime = chunk.timestampOffset || chunk.startTimeOffset || 0;
    const endTime = startTime + chunk.duration;
    
    logger.debug('Adding chunk to progressive buffer', {
      chunkId,
      startTime,
      endTime,
      eventCount: chunk.events.length,
    });

    try {
      // Store chunk events
      this.contentCache.set(chunkId, chunk.events);
      this.memoryUsage += this.estimateChunkMemoryUsage(chunk);
      
      // Create or update buffer region
      const regionId = this.getRegionId(startTime, endTime);
      const existingRegion = this.bufferRegions.get(regionId);
      
      if (existingRegion) {
        // Extend existing region
        existingRegion.endTime = Math.max(existingRegion.endTime, endTime);
        existingRegion.startTime = Math.min(existingRegion.startTime, startTime);
        existingRegion.sourceChunks.push(chunkId);
        existingRegion.status = 'ready';
        existingRegion.lastAccessed = Date.now();
      } else {
        // Create new buffer region
        const newRegion: BufferRegion = {
          startTime,
          endTime,
          sourceChunks: [chunkId],
          status: 'ready',
          priority: this.calculateRegionPriority(startTime),
          lastAccessed: Date.now(),
        };
        
        this.bufferRegions.set(regionId, newRegion);
      }
      
      // Update total duration
      this.totalDuration = Math.max(this.totalDuration, endTime);
      
      // Check if this makes playback ready
      this.checkPlaybackReadiness();
      
      // Emit events
      const region = this.bufferRegions.get(regionId)!;
      this.emit('contentBuffered', { region });
      this.emit('bufferChanged', { regions: Array.from(this.bufferRegions.values()) });
      
      logger.debug('Chunk added to buffer successfully', {
        chunkId,
        regionId,
        totalRegions: this.bufferRegions.size,
        memoryUsage: this.memoryUsage,
      });

    } catch (error) {
      logger.error('Error adding chunk to buffer', { chunkId, error });
      throw error;
    }
  }

  /**
   * Check if playback can start at current position
   */
  getPlaybackReadiness(position: number = this.currentPlaybackPosition): PlaybackReadiness {
    const bufferLevel = this.getBufferLevelAt(position);
    const canStart = bufferLevel >= this.config.minStartBuffer;
    
    const readiness: PlaybackReadiness = {
      canStart,
      bufferLevel,
      availableRegions: this.getRegionsAt(position),
    };
    
    if (!canStart) {
      readiness.reason = `Insufficient buffer. Need ${this.config.minStartBuffer}ms, have ${bufferLevel}ms`;
      readiness.estimatedReadyTime = this.estimateReadyTime(position);
    }
    
    return readiness;
  }

  /**
   * Check if content is buffered for a time range
   */
  isBuffered(startTime: number, endTime: number): boolean {
    return this.getBufferLevelForRange(startTime, endTime) >= (endTime - startTime);
  }

  /**
   * Get buffer level at a specific position
   */
  getBufferLevelAt(position: number): number {
    let bufferLevel = 0;
    
    for (const region of this.bufferRegions.values()) {
      if (region.status === 'ready' && position >= region.startTime && position <= region.endTime) {
        bufferLevel = Math.max(bufferLevel, region.endTime - position);
      }
    }
    
    return Math.min(bufferLevel, this.config.targetBuffer);
  }

  /**
   * Get buffered regions for visualization (YouTube-style gray bars)
   */
  getBufferedRegions(): BufferRegion[] {
    return Array.from(this.bufferRegions.values())
      .filter(region => region.status === 'ready')
      .sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Get events for a specific time range from buffer
   */
  getBufferedEvents(startTime: number, endTime: number): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    
    // Find regions that overlap with the requested range
    for (const region of this.bufferRegions.values()) {
      if (region.status !== 'ready') continue;
      
      const regionStart = region.startTime;
      const regionEnd = region.endTime;
      
      // Check if region overlaps with requested range
      if (regionStart <= endTime && regionEnd >= startTime) {
        // Get events from source chunks
        for (const chunkId of region.sourceChunks) {
          const chunkEvents = this.contentCache.get(chunkId) || [];
          
          // Filter events within the requested time range
          const relevantEvents = chunkEvents.filter(event => {
            const eventStart = event.timestamp;
            const eventEnd = event.timestamp + event.duration;
            return eventStart <= endTime && eventEnd >= startTime;
          });
          
          events.push(...relevantEvents);
        }
      }
    }
    
    // Sort by timestamp and remove duplicates
    return events
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((event, index, arr) => 
        index === 0 || event.id !== arr[index - 1].id
      );
  }

  /**
   * Handle seeking to a new position
   */
  async seek(position: number): Promise<boolean> {
    this.currentPlaybackPosition = position;
    
    const bufferLevel = this.getBufferLevelAt(position);
    
    if (bufferLevel >= this.config.minStartBuffer) {
      // Seeking to buffered region - immediate
      this.metrics.bufferHits++;
      return true;
    } else {
      // Seeking to unbuffered region - need to load
      this.metrics.bufferMisses++;
      const nearestRegion = this.findNearestBufferedRegion(position);
      
      this.emit('seekBlocked', {
        position,
        nearestBuffer: nearestRegion,
      });
      
      // Trigger urgent loading for this position
      await this.requestUrgentLoading(position);
      
      return false;
    }
  }

  /**
   * Update current playback position
   */
  setPlaybackPosition(position: number): void {
    this.currentPlaybackPosition = position;
    
    // Check if we need urgent loading
    const bufferLevel = this.getBufferLevelAt(position);
    if (bufferLevel < this.config.urgentThreshold) {
      this.emit('bufferUrgent', { position, bufferLevel });
      this.requestUrgentLoading(position).catch(error => {
        logger.error('Error in urgent loading', { position, error });
      });
    }
    
    // Update region access times
    this.updateRegionAccessTimes(position);
  }

  /**
   * Get buffer progress for visualization (0-1)
   */
  getBufferProgress(): number {
    if (this.totalDuration === 0) return 0;
    
    let bufferedDuration = 0;
    const sortedRegions = this.getBufferedRegions();
    
    // Calculate total buffered duration (accounting for overlaps)
    let lastEnd = 0;
    for (const region of sortedRegions) {
      const start = Math.max(region.startTime, lastEnd);
      const end = region.endTime;
      
      if (end > start) {
        bufferedDuration += end - start;
        lastEnd = end;
      }
    }
    
    return Math.min(1, bufferedDuration / this.totalDuration);
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    currentUsage: number;
    maxUsage: number;
    utilization: number;
    regionCount: number;
    chunkCount: number;
  } {
    return {
      currentUsage: this.memoryUsage,
      maxUsage: this.config.memoryManagement.maxMemoryUsage,
      utilization: this.memoryUsage / this.config.memoryManagement.maxMemoryUsage,
      regionCount: this.bufferRegions.size,
      chunkCount: this.contentCache.size,
    };
  }

  /**
   * Get performance metrics
   */
  getMetrics(): typeof this.metrics & {
    bufferHitRate: number;
    memoryUtilization: number;
  } {
    const totalRequests = this.metrics.bufferHits + this.metrics.bufferMisses;
    const bufferHitRate = totalRequests > 0 ? this.metrics.bufferHits / totalRequests : 0;
    const memoryUtilization = this.memoryUsage / this.config.memoryManagement.maxMemoryUsage;
    
    return {
      ...this.metrics,
      bufferHitRate,
      memoryUtilization,
    };
  }

  /**
   * Event handling
   */
  on<K extends keyof ProgressiveBufferEvents>(
    event: K,
    handler: (data: ProgressiveBufferEvents[K]) => void
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off<K extends keyof ProgressiveBufferEvents>(
    event: K,
    handler: (data: ProgressiveBufferEvents[K]) => void
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Cleanup and shutdown
   */
  shutdown(): void {
    this.stopMemoryManagement();
    this.bufferRegions.clear();
    this.contentCache.clear();
    this.eventHandlers.clear();
    this.memoryUsage = 0;
    
    logger.info('Progressive Buffer Manager shutdown complete');
  }

  // ========== Private Methods ==========

  /**
   * Generate region ID for time range
   */
  private getRegionId(startTime: number, endTime: number): string {
    // Round to 5-second boundaries for efficient region management
    const roundedStart = Math.floor(startTime / 5000) * 5000;
    const roundedEnd = Math.ceil(endTime / 5000) * 5000;
    return `region_${roundedStart}_${roundedEnd}`;
  }

  /**
   * Calculate priority for a buffer region
   */
  private calculateRegionPriority(startTime: number): 'low' | 'medium' | 'high' {
    const distanceFromPlayback = Math.abs(startTime - this.currentPlaybackPosition);
    
    if (distanceFromPlayback <= this.config.targetBuffer) {
      return 'high';
    } else if (distanceFromPlayback <= this.config.prefetchDistance) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Check if playback is ready and emit events
   */
  private checkPlaybackReadiness(): void {
    const readiness = this.getPlaybackReadiness();
    
    if (readiness.canStart) {
      this.emit('playbackReady', { readiness });
    }
  }

  /**
   * Get buffer level for a time range
   */
  private getBufferLevelForRange(startTime: number, endTime: number): number {
    let coveredDuration = 0;
    const requestedDuration = endTime - startTime;
    
    // Sort regions by start time
    const sortedRegions = Array.from(this.bufferRegions.values())
      .filter(region => region.status === 'ready')
      .sort((a, b) => a.startTime - b.startTime);
    
    let currentPos = startTime;
    
    for (const region of sortedRegions) {
      // Skip regions that don't overlap
      if (region.endTime <= currentPos || region.startTime >= endTime) {
        continue;
      }
      
      // Calculate overlap
      const overlapStart = Math.max(currentPos, region.startTime);
      const overlapEnd = Math.min(endTime, region.endTime);
      
      if (overlapEnd > overlapStart) {
        coveredDuration += overlapEnd - overlapStart;
        currentPos = overlapEnd;
      }
      
      // If we've covered the entire range
      if (currentPos >= endTime) {
        break;
      }
    }
    
    return coveredDuration;
  }

  /**
   * Get regions that contain or overlap with a position
   */
  private getRegionsAt(position: number): BufferRegion[] {
    return Array.from(this.bufferRegions.values()).filter(region =>
      region.status === 'ready' &&
      position >= region.startTime &&
      position <= region.endTime
    );
  }

  /**
   * Find nearest buffered region to a position
   */
  private findNearestBufferedRegion(position: number): BufferRegion | null {
    let nearestRegion: BufferRegion | null = null;
    let minDistance = Infinity;
    
    for (const region of this.bufferRegions.values()) {
      if (region.status !== 'ready') continue;
      
      let distance: number;
      if (position >= region.startTime && position <= region.endTime) {
        return region; // Position is within this region
      } else if (position < region.startTime) {
        distance = region.startTime - position;
      } else {
        distance = position - region.endTime;
      }
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestRegion = region;
      }
    }
    
    return nearestRegion;
  }

  /**
   * Request urgent loading for a position
   */
  private async requestUrgentLoading(position: number): Promise<void> {
    const loadingKey = `urgent_${position}`;
    
    if (this.loadingRequests.has(loadingKey)) {
      return; // Already loading
    }
    
    this.loadingRequests.add(loadingKey);
    
    try {
      // This would trigger the chunk coordinator to prioritize loading
      // content around this position
      logger.debug('Requesting urgent loading', {
        position,
        bufferLevel: this.getBufferLevelAt(position),
      });
      
      // Simulate loading delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } finally {
      this.loadingRequests.delete(loadingKey);
    }
  }

  /**
   * Update region access times for LRU cleanup
   */
  private updateRegionAccessTimes(position: number): void {
    const accessedRegions = this.getRegionsAt(position);
    const now = Date.now();
    
    for (const region of accessedRegions) {
      region.lastAccessed = now;
    }
  }

  /**
   * Estimate memory usage for a chunk
   */
  private estimateChunkMemoryUsage(chunk: StreamingTimelineChunk): number {
    try {
      return JSON.stringify(chunk.events).length * 2; // UTF-16 approximation
    } catch {
      return chunk.events.length * 1024; // 1KB per event fallback
    }
  }

  /**
   * Estimate time until content will be ready
   */
  private estimateReadyTime(position: number): number {
    // Simple heuristic based on average load time and distance to nearest buffer
    const nearestRegion = this.findNearestBufferedRegion(position);
    
    if (!nearestRegion) {
      return this.metrics.averageLoadTime || 2000; // 2 second default
    }
    
    const distance = Math.min(
      Math.abs(position - nearestRegion.startTime),
      Math.abs(position - nearestRegion.endTime)
    );
    
    // Estimate based on distance and typical loading speed
    return Math.max(500, distance / 10); // Minimum 500ms
  }

  /**
   * Start memory management services
   */
  private startMemoryManagement(): void {
    this.cleanupTimer = setInterval(() => {
      this.performMemoryCleanup().catch(error => {
        logger.error('Error in memory cleanup', { error });
      });
    }, this.config.memoryManagement.cleanupInterval);
  }

  /**
   * Stop memory management services
   */
  private stopMemoryManagement(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Perform memory cleanup
   */
  private async performMemoryCleanup(): Promise<void> {
    if (this.memoryUsage < this.config.memoryManagement.cleanupThreshold) {
      return; // No cleanup needed
    }
    
    const now = Date.now();
    const maxAge = 300000; // 5 minutes
    let freedMemory = 0;
    let removedRegions = 0;
    
    // Remove old regions that are far from current playback position
    for (const [regionId, region] of this.bufferRegions) {
      const distanceFromPlayback = Math.abs(region.startTime - this.currentPlaybackPosition);
      const isOld = now - region.lastAccessed > maxAge;
      const isFarAway = distanceFromPlayback > this.config.maxBuffer;
      
      if (isOld && isFarAway && region.priority === 'low') {
        // Remove region and associated chunks
        for (const chunkId of region.sourceChunks) {
          const chunkEvents = this.contentCache.get(chunkId);
          if (chunkEvents) {
            freedMemory += this.estimateEventsMemoryUsage(chunkEvents);
            this.contentCache.delete(chunkId);
          }
        }
        
        this.bufferRegions.delete(regionId);
        removedRegions++;
      }
    }
    
    this.memoryUsage -= freedMemory;
    this.metrics.lastCleanupTime = now;
    
    if (removedRegions > 0) {
      this.emit('memoryCleanup', { freedMemory, removedRegions });
      
      logger.debug('Memory cleanup completed', {
        freedMemory,
        removedRegions,
        currentMemoryUsage: this.memoryUsage,
        remainingRegions: this.bufferRegions.size,
      });
    }
  }

  /**
   * Estimate memory usage for events
   */
  private estimateEventsMemoryUsage(events: TimelineEvent[]): number {
    try {
      return JSON.stringify(events).length * 2; // UTF-16 approximation
    } catch {
      return events.length * 1024; // 1KB per event fallback
    }
  }

  /**
   * Emit event to handlers
   */
  private emit<K extends keyof ProgressiveBufferEvents>(
    event: K,
    data: ProgressiveBufferEvents[K]
  ): void {
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

export default ProgressiveBufferManager;