/**
 * Timeline Content Processor - Phase 4: Timeline Control & Playback
 * 
 * Handles real-time integration of streaming chunks with timeline events,
 * manages buffering strategies, and provides memory-efficient processing
 * for continuous playback.
 */

import type {
  StreamingTimelineChunk,
  ChunkProcessingOptions,
} from '@ai-tutor/types';

import type {
  TimelineEvent,
  TimelineEventCollection,
} from '@ai-tutor/types';

import { ChunkCoordinator } from './chunk-coordinator';
import { TimelineEventScheduler } from './timeline-event-scheduler';
import { createUtilLogger } from '../logger';

const logger = createUtilLogger('TimelineContentProcessor');

/**
 * Content processing state
 */
export type ProcessingState = 'idle' | 'processing' | 'buffering' | 'ready' | 'error';

/**
 * Buffer strategy for handling streaming content
 */
export interface BufferStrategy {
  /** Target buffer size in milliseconds */
  targetBufferSize: number;
  
  /** Minimum buffer before starting playback */
  minBufferSize: number;
  
  /** Maximum buffer size to prevent memory issues */
  maxBufferSize: number;
  
  /** Buffer refill threshold (when to start loading more) */
  refillThreshold: number;
  
  /** Adaptive buffer sizing based on network conditions */
  adaptiveBuffering: boolean;
}

/**
 * Memory management configuration
 */
export interface MemoryConfig {
  /** Maximum memory usage in bytes */
  maxMemoryUsage: number;
  
  /** Memory cleanup threshold */
  cleanupThreshold: number;
  
  /** Garbage collection interval */
  gcInterval: number;
  
  /** Enable memory monitoring */
  enableMonitoring: boolean;
}

/**
 * Real-time processing metrics
 */
export interface ProcessingMetrics {
  /** Current buffer level (milliseconds) */
  currentBufferLevel: number;
  
  /** Processing latency (milliseconds) */
  processingLatency: number;
  
  /** Memory usage (bytes) */
  memoryUsage: number;
  
  /** Events processed per second */
  eventsPerSecond: number;
  
  /** Buffer health (0-1, 1 = healthy) */
  bufferHealth: number;
  
  /** Processing efficiency (0-1, 1 = optimal) */
  processingEfficiency: number;
  
  /** Active chunks count */
  activeChunksCount: number;
  
  /** Pending events count */
  pendingEventsCount: number;
}

/**
 * Content processor configuration
 */
export interface ContentProcessorConfig {
  /** Buffer strategy settings */
  bufferStrategy: BufferStrategy;
  
  /** Memory management settings */
  memoryConfig: MemoryConfig;
  
  /** Performance optimization settings */
  performance: {
    /** Enable background processing */
    enableBackgroundProcessing: boolean;
    
    /** Maximum concurrent chunk processing */
    maxConcurrentProcessing: number;
    
    /** Event batch size for efficient processing */
    eventBatchSize: number;
    
    /** Processing timeout (milliseconds) */
    processingTimeout: number;
  };
  
  /** Real-time adaptation settings */
  adaptation: {
    /** Enable adaptive quality */
    enableAdaptiveQuality: boolean;
    
    /** Performance monitoring interval */
    monitoringInterval: number;
    
    /** Automatic buffer adjustment */
    autoAdjustBuffer: boolean;
    
    /** Network-aware processing */
    networkAware: boolean;
  };
}

/**
 * Default processor configuration
 */
const DEFAULT_PROCESSOR_CONFIG: ContentProcessorConfig = {
  bufferStrategy: {
    targetBufferSize: 15000, // 15 seconds
    minBufferSize: 5000,     // 5 seconds
    maxBufferSize: 60000,    // 60 seconds
    refillThreshold: 0.3,    // Refill when buffer is 30% full
    adaptiveBuffering: true,
  },
  memoryConfig: {
    maxMemoryUsage: 100 * 1024 * 1024, // 100MB
    cleanupThreshold: 80 * 1024 * 1024, // 80MB
    gcInterval: 30000, // 30 seconds
    enableMonitoring: true,
  },
  performance: {
    enableBackgroundProcessing: true,
    maxConcurrentProcessing: 3,
    eventBatchSize: 10,
    processingTimeout: 10000, // 10 seconds
  },
  adaptation: {
    enableAdaptiveQuality: true,
    monitoringInterval: 1000, // 1 second
    autoAdjustBuffer: true,
    networkAware: false, // Disabled by default for offline-first apps
  },
};

/**
 * Processed content buffer entry
 */
interface BufferEntry {
  /** Timeline position (milliseconds) */
  timestamp: number;
  
  /** Duration of this buffer entry */
  duration: number;
  
  /** Timeline events in this buffer */
  events: TimelineEvent[];
  
  /** Source chunk information */
  sourceChunk: {
    chunkId: string;
    chunkNumber: number;
  };
  
  /** Processing metadata */
  metadata: {
    processedAt: number;
    processingTime: number;
    memoryUsage: number;
  };
}

/**
 * Main Timeline Content Processor class
 */
export class TimelineContentProcessor {
  private config: ContentProcessorConfig;
  private chunkCoordinator: ChunkCoordinator;
  private eventScheduler: TimelineEventScheduler;
  private eventHandlers = new Map<string, Array<(data: any) => void>>();
  
  // Processing state
  private processingState: ProcessingState = 'idle';
  private contentBuffer = new Map<number, BufferEntry>();
  private processingQueue: StreamingTimelineChunk[] = [];
  private activeProcessing = new Set<string>();
  
  // Buffering and memory management
  private currentBufferLevel = 0;
  private memoryUsage = 0;
  private lastCleanupTime = 0;
  
  // Performance monitoring
  private metrics: ProcessingMetrics;
  private performanceTimer?: NodeJS.Timeout;
  private gcTimer?: NodeJS.Timeout;
  
  // Event processing
  private eventProcessingRate = 0;
  private lastEventCount = 0;
  private lastEventTime = performance.now();

  constructor(
    chunkCoordinator: ChunkCoordinator,
    eventScheduler: TimelineEventScheduler,
    config: Partial<ContentProcessorConfig> = {}
  ) {
    this.config = { ...DEFAULT_PROCESSOR_CONFIG, ...config };
    this.chunkCoordinator = chunkCoordinator;
    this.eventScheduler = eventScheduler;
    
    this.metrics = this.createInitialMetrics();
    
    // Set up chunk coordinator event handlers
    this.setupChunkCoordinatorHandlers();
    
    // Start background services
    this.startBackgroundServices();
    
    logger.info('TimelineContentProcessor initialized', {
      config: this.config,
      bufferTarget: this.config.bufferStrategy.targetBufferSize,
      maxMemory: this.config.memoryConfig.maxMemoryUsage,
    });
  }

  /**
   * Start processing streaming chunks
   */
  async startProcessing(): Promise<void> {
    if (this.processingState === 'processing') return;
    
    logger.debug('Starting content processing');
    
    try {
      this.processingState = 'processing';
      
      // Process any queued chunks
      await this.processQueuedChunks();
      
      // Initialize buffer with any available content
      await this.initializeBuffer();
      
      this.emit('processingStarted', {
        bufferLevel: this.currentBufferLevel,
        memoryUsage: this.memoryUsage,
      });
      
      logger.debug('Content processing started', {
        bufferLevel: this.currentBufferLevel,
        queuedChunks: this.processingQueue.length,
      });

    } catch (error) {
      logger.error('Error starting content processing', { error });
      this.processingState = 'error';
      throw error;
    }
  }

  /**
   * Stop processing and cleanup
   */
  async stopProcessing(): Promise<void> {
    logger.debug('Stopping content processing');
    
    this.processingState = 'idle';
    this.processingQueue.length = 0;
    this.activeProcessing.clear();
    
    // Clear buffer
    this.contentBuffer.clear();
    this.currentBufferLevel = 0;
    
    this.emit('processingStopped', {});
    
    logger.debug('Content processing stopped');
  }

  /**
   * Process a new streaming chunk
   */
  async processChunk(chunk: StreamingTimelineChunk): Promise<void> {
    logger.debug('Processing new chunk', {
      chunkId: chunk.chunkId,
      chunkNumber: chunk.chunkNumber,
      eventCount: chunk.events.length,
    });

    try {
      // Add to processing queue if we're at capacity
      if (this.activeProcessing.size >= this.config.performance.maxConcurrentProcessing) {
        this.processingQueue.push(chunk);
        logger.debug('Chunk queued for later processing', { chunkId: chunk.chunkId });
        return;
      }

      // Process chunk immediately
      await this.processChunkInternal(chunk);

    } catch (error) {
      logger.error('Error processing chunk', { chunkId: chunk.chunkId, error });
      throw error;
    }
  }

  /**
   * Get buffered content for a time range
   */
  getBufferedContent(startTime: number, endTime: number): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    
    for (const entry of this.contentBuffer.values()) {
      const entryStart = entry.timestamp;
      const entryEnd = entry.timestamp + entry.duration;
      
      // Check if buffer entry overlaps with requested range
      if (entryStart <= endTime && entryEnd >= startTime) {
        // Filter events within the specific time range
        const relevantEvents = entry.events.filter(event => {
          const eventStart = event.timestamp;
          const eventEnd = event.timestamp + event.duration;
          return eventStart <= endTime && eventEnd >= startTime;
        });
        
        events.push(...relevantEvents);
      }
    }
    
    // Sort by timestamp
    return events.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Check if content is buffered for a specific time range
   */
  isBuffered(startTime: number, endTime: number): boolean {
    const bufferedEvents = this.getBufferedContent(startTime, endTime);
    
    // Simple heuristic: check if we have reasonable event density
    const duration = endTime - startTime;
    const expectedEvents = Math.max(1, Math.floor(duration / 2000)); // Expect 1 event per 2 seconds
    
    return bufferedEvents.length >= expectedEvents;
  }

  /**
   * Get current buffer level (milliseconds of content)
   */
  getBufferLevel(): number {
    return this.currentBufferLevel;
  }

  /**
   * Get processing metrics
   */
  getMetrics(): ProcessingMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get current processing state
   */
  getState(): ProcessingState {
    return this.processingState;
  }

  /**
   * Force buffer optimization (manual garbage collection)
   */
  async optimizeBuffer(): Promise<void> {
    logger.debug('Optimizing content buffer');
    
    try {
      await this.performGarbageCollection();
      await this.optimizeBufferLayout();
      
      this.emit('bufferOptimized', {
        bufferLevel: this.currentBufferLevel,
        memoryUsage: this.memoryUsage,
      });
      
      logger.debug('Buffer optimization completed', {
        bufferLevel: this.currentBufferLevel,
        memoryUsage: this.memoryUsage,
      });

    } catch (error) {
      logger.error('Error optimizing buffer', { error });
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
   * Cleanup and shutdown
   */
  shutdown(): void {
    logger.debug('Shutting down TimelineContentProcessor');
    
    this.stopBackgroundServices();
    this.stopProcessing();
    this.eventHandlers.clear();
    
    logger.debug('TimelineContentProcessor shutdown complete');
  }

  // ========== Private Methods ==========

  /**
   * Set up event handlers for chunk coordinator
   */
  private setupChunkCoordinatorHandlers(): void {
    this.chunkCoordinator.on('chunkAdded', (data: any) => {
      if (this.processingState === 'processing') {
        this.processChunk(data.chunk).catch(error => {
          logger.error('Error processing chunk from coordinator', { error });
        });
      }
    });
    
    this.chunkCoordinator.on('chunkProcessingCompleted', (data: any) => {
      // Chunk is ready for timeline integration
      const orderedChunks = this.chunkCoordinator.getOrderedChunks();
      const chunk = orderedChunks.find(c => c.chunkId === data.chunkId);
      if (chunk && this.processingState === 'processing') {
        this.integrateChunkIntoTimeline(chunk).catch(error => {
          logger.error('Error integrating chunk into timeline', { error });
        });
      }
    });
  }

  /**
   * Process a chunk internally
   */
  private async processChunkInternal(chunk: StreamingTimelineChunk): Promise<void> {
    const chunkId = chunk.chunkId;
    this.activeProcessing.add(chunkId);
    
    try {
      const startTime = performance.now();
      
      // Process events in batches for efficiency
      const events = chunk.events;
      const batches = this.createEventBatches(events, this.config.performance.eventBatchSize);
      
      for (const batch of batches) {
        await this.processBatch(batch, chunk);
      }
      
      // Create buffer entry
      const processingTime = performance.now() - startTime;
      const memoryUsed = this.estimateChunkMemoryUsage(chunk);
      
      const bufferEntry: BufferEntry = {
        timestamp: chunk.timestampOffset || 0,
        duration: chunk.duration,
        events: chunk.events,
        sourceChunk: {
          chunkId: chunk.chunkId,
          chunkNumber: chunk.chunkNumber,
        },
        metadata: {
          processedAt: performance.now(),
          processingTime,
          memoryUsage: memoryUsed,
        },
      };
      
      // Add to buffer
      this.contentBuffer.set(chunk.timestampOffset || 0, bufferEntry);
      this.updateBufferLevel();
      this.memoryUsage += memoryUsed;
      
      // Check if buffer management is needed
      await this.checkBufferHealth();
      
      this.emit('chunkProcessed', {
        chunkId,
        processingTime,
        memoryUsage: memoryUsed,
        bufferLevel: this.currentBufferLevel,
      });
      
      logger.debug('Chunk processed successfully', {
        chunkId,
        processingTime,
        bufferLevel: this.currentBufferLevel,
      });

    } finally {
      this.activeProcessing.delete(chunkId);
      
      // Process any queued chunks
      if (this.processingQueue.length > 0) {
        const nextChunk = this.processingQueue.shift();
        if (nextChunk) {
          this.processChunkInternal(nextChunk).catch(error => {
            logger.error('Error processing queued chunk', { error });
          });
        }
      }
    }
  }

  /**
   * Process queued chunks
   */
  private async processQueuedChunks(): Promise<void> {
    const chunks = [...this.processingQueue];
    this.processingQueue.length = 0;
    
    for (const chunk of chunks) {
      await this.processChunkInternal(chunk);
    }
  }

  /**
   * Initialize buffer with available content
   */
  private async initializeBuffer(): Promise<void> {
    const coordinationState = this.chunkCoordinator.getCoordinationState();
    
    if (coordinationState.sortedEvents.length > 0) {
      // Load initial buffer content from coordination state
      const initialEvents = coordinationState.sortedEvents.slice(0, 50); // Load first 50 events
      
      // Group events by time segments for buffering
      const segments = this.groupEventsByTimeSegments(initialEvents);
      
      for (const segment of segments) {
        const bufferEntry: BufferEntry = {
          timestamp: segment.startTime,
          duration: segment.endTime - segment.startTime,
          events: segment.events,
          sourceChunk: {
            chunkId: 'initial',
            chunkNumber: 0,
          },
          metadata: {
            processedAt: performance.now(),
            processingTime: 0,
            memoryUsage: this.estimateEventsMemoryUsage(segment.events),
          },
        };
        
        this.contentBuffer.set(segment.startTime, bufferEntry);
      }
      
      this.updateBufferLevel();
    }
  }

  /**
   * Integrate chunk into timeline scheduler
   */
  private async integrateChunkIntoTimeline(chunk: StreamingTimelineChunk): Promise<void> {
    try {
      // Load events into scheduler
      this.eventScheduler.loadEvents(chunk.events);
      
      this.emit('chunkIntegrated', {
        chunkId: chunk.chunkId,
        eventCount: chunk.events.length,
      });
      
    } catch (error) {
      logger.error('Error integrating chunk into timeline', { chunkId: chunk.chunkId, error });
      throw error;
    }
  }

  /**
   * Create event batches for efficient processing
   */
  private createEventBatches(events: TimelineEvent[], batchSize: number): TimelineEvent[][] {
    const batches: TimelineEvent[][] = [];
    
    for (let i = 0; i < events.length; i += batchSize) {
      batches.push(events.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Process a batch of events
   */
  private async processBatch(batch: TimelineEvent[], chunk: StreamingTimelineChunk): Promise<void> {
    // Process events in batch for validation and optimization
    for (const event of batch) {
      // Validate event
      if (!this.validateEvent(event)) {
        logger.warn('Invalid event skipped', { eventId: event.id, chunkId: chunk.chunkId });
        continue;
      }
      
      // Apply any real-time optimizations
      this.optimizeEvent(event);
    }
    
    // Update event processing metrics
    this.updateEventProcessingRate(batch.length);
  }

  /**
   * Validate a timeline event
   */
  private validateEvent(event: TimelineEvent): boolean {
    return !!(event.id &&
      typeof event.timestamp === 'number' &&
      typeof event.duration === 'number' &&
      event.type &&
      event.content);
  }

  /**
   * Optimize event for real-time processing
   */
  private optimizeEvent(event: TimelineEvent): void {
    // Apply performance optimizations based on current system state
    if (this.memoryUsage > this.config.memoryConfig.cleanupThreshold) {
      // Reduce precision or complexity for performance
      if (event.layoutHints && event.layoutHints.length > 3) {
        event.layoutHints = event.layoutHints.slice(0, 3); // Keep only top 3 hints
      }
    }
  }

  /**
   * Group events by time segments for efficient buffering
   */
  private groupEventsByTimeSegments(events: TimelineEvent[]): Array<{
    startTime: number;
    endTime: number;
    events: TimelineEvent[];
  }> {
    const segmentDuration = 5000; // 5 second segments
    const segments: Map<number, TimelineEvent[]> = new Map();
    
    for (const event of events) {
      const segmentStart = Math.floor(event.timestamp / segmentDuration) * segmentDuration;
      
      if (!segments.has(segmentStart)) {
        segments.set(segmentStart, []);
      }
      segments.get(segmentStart)!.push(event);
    }
    
    return Array.from(segments.entries()).map(([startTime, segmentEvents]) => ({
      startTime,
      endTime: startTime + segmentDuration,
      events: segmentEvents,
    }));
  }

  /**
   * Update current buffer level
   */
  private updateBufferLevel(): void {
    let totalDuration = 0;
    
    for (const entry of this.contentBuffer.values()) {
      totalDuration += entry.duration;
    }
    
    this.currentBufferLevel = totalDuration;
  }

  /**
   * Check buffer health and perform maintenance
   */
  private async checkBufferHealth(): Promise<void> {
    const { bufferStrategy, memoryConfig } = this.config;
    
    // Check memory usage
    if (this.memoryUsage > memoryConfig.cleanupThreshold) {
      await this.performGarbageCollection();
    }
    
    // Check buffer size
    if (this.currentBufferLevel > bufferStrategy.maxBufferSize) {
      await this.trimBuffer();
    }
    
    // Check for buffer refill needs
    if (this.currentBufferLevel < bufferStrategy.targetBufferSize * bufferStrategy.refillThreshold) {
      this.emit('bufferRefillNeeded', {
        currentLevel: this.currentBufferLevel,
        targetLevel: bufferStrategy.targetBufferSize,
      });
    }
  }

  /**
   * Perform garbage collection on buffer
   */
  private async performGarbageCollection(): Promise<void> {
    const now = performance.now();
    const maxAge = 300000; // 5 minutes
    
    let removedEntries = 0;
    let freedMemory = 0;
    
    for (const [timestamp, entry] of this.contentBuffer) {
      if (now - entry.metadata.processedAt > maxAge) {
        freedMemory += entry.metadata.memoryUsage;
        this.contentBuffer.delete(timestamp);
        removedEntries++;
      }
    }
    
    this.memoryUsage -= freedMemory;
    this.updateBufferLevel();
    this.lastCleanupTime = now;
    
    logger.debug('Garbage collection completed', {
      removedEntries,
      freedMemory,
      currentMemoryUsage: this.memoryUsage,
      currentBufferLevel: this.currentBufferLevel,
    });
  }

  /**
   * Trim buffer to manageable size
   */
  private async trimBuffer(): Promise<void> {
    const { bufferStrategy } = this.config;
    const targetSize = bufferStrategy.targetBufferSize;
    
    // Remove oldest buffer entries until we reach target size
    const entries = Array.from(this.contentBuffer.entries())
      .sort(([, a], [, b]) => a.metadata.processedAt - b.metadata.processedAt);
    
    while (this.currentBufferLevel > targetSize && entries.length > 0) {
      const [timestamp, entry] = entries.shift()!;
      this.contentBuffer.delete(timestamp);
      this.memoryUsage -= entry.metadata.memoryUsage;
    }
    
    this.updateBufferLevel();
    
    logger.debug('Buffer trimmed', {
      newBufferLevel: this.currentBufferLevel,
      targetSize,
    });
  }

  /**
   * Optimize buffer layout for better performance
   */
  private async optimizeBufferLayout(): Promise<void> {
    // Reorganize buffer entries for optimal access patterns
    // This could include merging adjacent segments or reordering for cache efficiency
    
    // For now, just ensure buffer is properly indexed
    const sortedEntries = Array.from(this.contentBuffer.entries())
      .sort(([a], [b]) => a - b);
    
    this.contentBuffer.clear();
    for (const [timestamp, entry] of sortedEntries) {
      this.contentBuffer.set(timestamp, entry);
    }
  }

  /**
   * Estimate memory usage for a chunk
   */
  private estimateChunkMemoryUsage(chunk: StreamingTimelineChunk): number {
    try {
      return JSON.stringify(chunk).length * 2; // UTF-16 approximation
    } catch {
      return 10240; // 10KB fallback estimate
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
   * Update event processing rate metrics
   */
  private updateEventProcessingRate(eventCount: number): void {
    const now = performance.now();
    const timeDelta = now - this.lastEventTime;
    
    if (timeDelta >= 1000) { // Update every second
      this.eventProcessingRate = (eventCount + this.lastEventCount) / (timeDelta / 1000);
      this.lastEventCount = 0;
      this.lastEventTime = now;
    } else {
      this.lastEventCount += eventCount;
    }
  }

  /**
   * Create initial metrics
   */
  private createInitialMetrics(): ProcessingMetrics {
    return {
      currentBufferLevel: 0,
      processingLatency: 0,
      memoryUsage: 0,
      eventsPerSecond: 0,
      bufferHealth: 1.0,
      processingEfficiency: 1.0,
      activeChunksCount: 0,
      pendingEventsCount: 0,
    };
  }

  /**
   * Update processing metrics
   */
  private updateMetrics(): void {
    const { bufferStrategy, memoryConfig } = this.config;
    
    // Calculate buffer health (0-1)
    const bufferHealth = Math.min(1.0, this.currentBufferLevel / bufferStrategy.targetBufferSize);
    
    // Calculate processing efficiency based on memory usage
    const memoryEfficiency = 1.0 - (this.memoryUsage / memoryConfig.maxMemoryUsage);
    
    this.metrics = {
      currentBufferLevel: this.currentBufferLevel,
      processingLatency: 0, // Would be calculated based on actual processing times
      memoryUsage: this.memoryUsage,
      eventsPerSecond: this.eventProcessingRate,
      bufferHealth,
      processingEfficiency: Math.max(0, memoryEfficiency),
      activeChunksCount: this.activeProcessing.size,
      pendingEventsCount: this.processingQueue.length,
    };
  }

  /**
   * Start background services
   */
  private startBackgroundServices(): void {
    if (this.config.adaptation.enableAdaptiveQuality) {
      this.performanceTimer = setInterval(() => {
        this.updateMetrics();
        this.adaptToPerformance();
      }, this.config.adaptation.monitoringInterval);
    }
    
    if (this.config.memoryConfig.enableMonitoring) {
      this.gcTimer = setInterval(() => {
        this.performGarbageCollection().catch(error => {
          logger.error('Error in scheduled garbage collection', { error });
        });
      }, this.config.memoryConfig.gcInterval);
    }
  }

  /**
   * Stop background services
   */
  private stopBackgroundServices(): void {
    if (this.performanceTimer) {
      clearInterval(this.performanceTimer);
      this.performanceTimer = undefined;
    }
    
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = undefined;
    }
  }

  /**
   * Adapt processing based on performance metrics
   */
  private adaptToPerformance(): void {
    if (!this.config.adaptation.autoAdjustBuffer) return;
    
    const metrics = this.getMetrics();
    
    // Adjust buffer size based on performance
    if (metrics.bufferHealth < 0.5 && metrics.processingEfficiency > 0.7) {
      // Increase buffer size if we have good performance but low buffer
      this.config.bufferStrategy.targetBufferSize *= 1.1;
    } else if (metrics.processingEfficiency < 0.5) {
      // Decrease buffer size if performance is poor
      this.config.bufferStrategy.targetBufferSize *= 0.9;
    }
    
    // Keep buffer size within reasonable bounds
    this.config.bufferStrategy.targetBufferSize = Math.min(
      Math.max(this.config.bufferStrategy.targetBufferSize, 5000), // Min 5 seconds
      60000 // Max 60 seconds
    );
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

export default TimelineContentProcessor;