/**
 * Chunk Coordinator System
 * 
 * Manages multiple content chunks with global timeline coordination.
 * Builds on existing step progression patterns while adding timeline-aware
 * chunk management for seamless LLM content generation.
 */

import type {
  StreamingTimelineChunk,
  StreamingTimelineLesson,
  ChunkValidationResult,
  ChunkProcessingOptions,
  ChunkContext,
  ContinuityHint,
} from '@ai-tutor/types/timeline/StreamingTimelineChunk';

import type {
  TimelineEvent,
  TimelineEventCollection,
} from '@ai-tutor/types/timeline/TimelineEvent';

import {
  validateStreamingTimelineChunk,
  validateTimelineEventCollection,
} from '../timeline/event-validation';

import { ContinuityManager } from './continuity-manager';
import { ContextExtractor } from './context-extractor';
import { PreGenerationPipeline } from './pre-generation-pipeline';
import { PriorityQueue, ContentGenerationQueue, Priority } from './priority-queue';

import { createUtilLogger } from '@ai-tutor/utils';

const logger = createUtilLogger('ChunkCoordinator');

/**
 * Chunk coordination options
 */
export interface ChunkCoordinationOptions {
  /** Maximum chunks to keep in memory */
  maxCachedChunks: number;
  
  /** Validate chunks on addition */
  validateOnAdd: boolean;
  
  /** Automatically process chunks */
  autoProcess: boolean;
  
  /** Performance optimization settings */
  performance: {
    /** Enable chunk preloading */
    enablePreloading: boolean;
    
    /** Memory cleanup threshold */
    memoryCleanupThreshold: number;
    
    /** Background processing */
    enableBackgroundProcessing: boolean;
  };
  
  /** Error handling configuration */
  errorHandling: {
    /** Maximum retry attempts */
    maxRetries: number;
    
    /** Retry delay multiplier */
    retryDelayMultiplier: number;
    
    /** Continue on chunk errors */
    continueOnError: boolean;
  };
}

/**
 * Default coordination options
 */
const DEFAULT_COORDINATION_OPTIONS: ChunkCoordinationOptions = {
  maxCachedChunks: 10,
  validateOnAdd: true,
  autoProcess: true,
  performance: {
    enablePreloading: true,
    memoryCleanupThreshold: 50 * 1024 * 1024, // 50MB
    enableBackgroundProcessing: true,
  },
  errorHandling: {
    maxRetries: 3,
    retryDelayMultiplier: 1.5,
    continueOnError: true,
  },
};

/**
 * Chunk processing status
 */
export interface ChunkProcessingStatus {
  chunkId: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
  progress: number; // 0-1
  error?: string;
  processingStarted?: number;
  processingCompleted?: number;
}

/**
 * Timeline coordination state
 */
export interface TimelineCoordinationState {
  /** Total lesson duration (milliseconds) */
  totalDuration: number;
  
  /** Currently active chunk */
  currentChunkId?: string;
  
  /** Current playback position (milliseconds) */
  currentPosition: number;
  
  /** Timeline events sorted by timestamp */
  sortedEvents: TimelineEvent[];
  
  /** Global timeline metadata */
  metadata: {
    /** Total number of events */
    totalEvents: number;
    
    /** Events by type count */
    eventTypeCounts: Record<string, number>;
    
    /** Average event density (events per second) */
    eventDensity: number;
    
    /** Chunk boundaries (timestamps) */
    chunkBoundaries: Array<{
      chunkId: string;
      startTime: number;
      endTime: number;
    }>;
  };
}

/**
 * Main Chunk Coordinator class
 * Extends existing step progression patterns with timeline-aware chunk management
 */
export class ChunkCoordinator {
  private chunks = new Map<string, StreamingTimelineChunk>();
  private processingStatus = new Map<string, ChunkProcessingStatus>();
  private coordinationState: TimelineCoordinationState;
  private readonly options: ChunkCoordinationOptions;
  private readonly eventHandlers = new Map<string, Array<(data: any) => void>>();
  
  // Phase 2 components
  private continuityManager: ContinuityManager;
  private contextExtractor: ContextExtractor;
  private preGenerationPipeline: PreGenerationPipeline;
  private generationQueue: ContentGenerationQueue;

  constructor(options: Partial<ChunkCoordinationOptions> = {}) {
    this.options = { ...DEFAULT_COORDINATION_OPTIONS, ...options };
    this.coordinationState = {
      totalDuration: 0,
      currentPosition: 0,
      sortedEvents: [],
      metadata: {
        totalEvents: 0,
        eventTypeCounts: {},
        eventDensity: 0,
        chunkBoundaries: [],
      },
    };
    
    // Initialize Phase 2 components
    this.continuityManager = new ContinuityManager({
      analyzeNarrativeFlow: true,
      checkVisualContinuity: true,
      detectConceptOverlap: true,
      minContinuityScore: 0.7,
      autoCorrectIssues: this.options.autoProcess,
    });
    
    this.contextExtractor = new ContextExtractor({
      extractRelationships: true,
      analyzeKnowledgeProgression: true,
      trackVisualContext: true,
      analyzeNarrative: true,
      maxEntities: 30,
    });
    
    this.preGenerationPipeline = new PreGenerationPipeline({
      maxConcurrentGenerations: 2,
      lookaheadDistance: 30.0,
      maxCacheSize: this.options.maxCachedChunks,
      enablePrediction: this.options.performance.enablePreloading,
    });
    
    this.generationQueue = new ContentGenerationQueue({
      maxSize: 50,
      trackDependencies: true,
      enablePriorityDecay: true,
    });
    
    // Start background services if enabled
    if (this.options.performance.enableBackgroundProcessing) {
      this.preGenerationPipeline.start();
      this.generationQueue.start();
    }
    
    logger.info('ChunkCoordinator initialized with Phase 2 enhancements', { 
      options: this.options,
      backgroundProcessing: this.options.performance.enableBackgroundProcessing,
    });
  }

  /**
   * Add a new chunk to the coordinator
   */
  async addChunk(chunk: StreamingTimelineChunk): Promise<ChunkValidationResult> {
    logger.debug('Adding chunk', { chunkId: chunk.chunkId, chunkNumber: chunk.chunkNumber });

    try {
      // Validate chunk if enabled
      let validationResult: ChunkValidationResult | null = null;
      if (this.options.validateOnAdd) {
        const previousContext = this.getPreviousChunkContext(chunk.chunkNumber);
        validationResult = validateStreamingTimelineChunk(chunk, previousContext);
        
        if (!validationResult.isValid && !this.options.errorHandling.continueOnError) {
          logger.error('Chunk validation failed', { 
            chunkId: chunk.chunkId, 
            errors: validationResult.errors 
          });
          throw new Error(`Chunk validation failed: ${validationResult.errors.join(', ')}`);
        }
      }

      // Store chunk
      this.chunks.set(chunk.chunkId, chunk);
      
      // Initialize processing status
      this.processingStatus.set(chunk.chunkId, {
        chunkId: chunk.chunkId,
        status: 'pending',
        progress: 0,
        processingStarted: Date.now(),
      });

      // Update coordination state
      this.updateCoordinationState();

      // Auto-process if enabled
      if (this.options.autoProcess) {
        await this.processChunk(chunk.chunkId);
      }

      // Emit chunk added event
      this.emit('chunkAdded', { chunk, validationResult });

      // Cleanup old chunks if needed
      await this.cleanupOldChunks();

      return validationResult || {
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: [],
        continuityAssessment: {
          backwardContinuity: 1,
          forwardContinuity: 1,
          issues: [],
        },
        qualityPrediction: {
          userExperience: 1,
          technicalSuccess: 1,
          riskFactors: [],
        },
      };

    } catch (error) {
      logger.error('Error adding chunk', { chunkId: chunk.chunkId, error });
      
      // Update processing status with error
      this.processingStatus.set(chunk.chunkId, {
        chunkId: chunk.chunkId,
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : String(error),
        processingStarted: Date.now(),
      });

      throw error;
    }
  }

  /**
   * Process a specific chunk
   */
  async processChunk(chunkId: string): Promise<void> {
    const chunk = this.chunks.get(chunkId);
    if (!chunk) {
      throw new Error(`Chunk ${chunkId} not found`);
    }

    const status = this.processingStatus.get(chunkId);
    if (!status) {
      throw new Error(`Processing status for chunk ${chunkId} not found`);
    }

    try {
      // Update status to processing
      status.status = 'processing';
      status.progress = 0.1;
      this.emit('chunkProcessingStarted', { chunkId });

      // Adjust timestamps for global timeline
      const adjustedChunk = this.adjustChunkTimestamps(chunk);
      status.progress = 0.3;

      // Validate events
      const eventCollection: TimelineEventCollection = {
        events: adjustedChunk.events,
        totalDuration: adjustedChunk.duration,
        contentType: adjustedChunk.contentType,
        complexity: 'medium', // Will be determined by content analysis
        keyEntities: [],
        relationships: [],
        qualityMetrics: {
          timingConsistency: 1,
          completeness: 1,
          layoutFeasibility: 1,
        },
        metadata: {
          source: 'llm',
          generatedAt: adjustedChunk.metadata.generatedAt,
        },
      };

      const validation = validateTimelineEventCollection(eventCollection);
      if (!validation.isValid) {
        logger.warn('Timeline events validation failed', { 
          chunkId, 
          errors: validation.errors 
        });
      }
      status.progress = 0.7;

      // Store processed chunk
      this.chunks.set(chunkId, adjustedChunk);
      status.progress = 0.9;

      // Update coordination state
      this.updateCoordinationState();
      status.progress = 1.0;
      status.status = 'ready';
      status.processingCompleted = Date.now();

      this.emit('chunkProcessingCompleted', { chunkId, validationResult: validation });
      logger.debug('Chunk processing completed', { chunkId });

    } catch (error) {
      logger.error('Error processing chunk', { chunkId, error });
      status.status = 'error';
      status.error = error instanceof Error ? error.message : String(error);
      
      this.emit('chunkProcessingError', { chunkId, error });
      throw error;
    }
  }

  /**
   * Get events for a specific time range
   */
  getEventsForTimeRange(startTime: number, endTime: number): TimelineEvent[] {
    return this.coordinationState.sortedEvents.filter(event => {
      const eventStart = event.timestamp;
      const eventEnd = event.timestamp + event.duration;
      
      // Event overlaps with time range
      return (eventStart <= endTime && eventEnd >= startTime);
    });
  }

  /**
   * Get events at a specific timestamp
   */
  getEventsAtTime(timestamp: number): TimelineEvent[] {
    return this.coordinationState.sortedEvents.filter(event => {
      return timestamp >= event.timestamp && timestamp <= (event.timestamp + event.duration);
    });
  }

  /**
   * Get chunk containing a specific timestamp
   */
  getChunkAtTime(timestamp: number): StreamingTimelineChunk | null {
    const boundary = this.coordinationState.metadata.chunkBoundaries.find(b => 
      timestamp >= b.startTime && timestamp <= b.endTime
    );
    
    return boundary ? this.chunks.get(boundary.chunkId) || null : null;
  }

  /**
   * Get all chunks in order
   */
  getOrderedChunks(): StreamingTimelineChunk[] {
    return Array.from(this.chunks.values())
      .sort((a, b) => a.chunkNumber - b.chunkNumber);
  }

  /**
   * Get coordination state
   */
  getCoordinationState(): TimelineCoordinationState {
    return { ...this.coordinationState };
  }

  /**
   * Get chunk processing status
   */
  getProcessingStatus(chunkId?: string): ChunkProcessingStatus | ChunkProcessingStatus[] {
    if (chunkId) {
      return this.processingStatus.get(chunkId) || {
        chunkId,
        status: 'error',
        progress: 0,
        error: 'Chunk not found',
      };
    }
    
    return Array.from(this.processingStatus.values());
  }

  /**
   * Remove chunk and cleanup
   */
  async removeChunk(chunkId: string): Promise<boolean> {
    const removed = this.chunks.delete(chunkId);
    this.processingStatus.delete(chunkId);
    
    if (removed) {
      this.updateCoordinationState();
      this.emit('chunkRemoved', { chunkId });
      logger.debug('Chunk removed', { chunkId });
    }
    
    return removed;
  }

  /**
   * Clear all chunks
   */
  async clearAll(): Promise<void> {
    const chunkIds = Array.from(this.chunks.keys());
    this.chunks.clear();
    this.processingStatus.clear();
    
    this.coordinationState = {
      totalDuration: 0,
      currentPosition: 0,
      sortedEvents: [],
      metadata: {
        totalEvents: 0,
        eventTypeCounts: {},
        eventDensity: 0,
        chunkBoundaries: [],
      },
    };
    
    this.emit('allChunksCleared', { removedChunkIds: chunkIds });
    logger.debug('All chunks cleared');
  }

  /**
   * Update current playback position
   */
  setCurrentPosition(position: number): void {
    this.coordinationState.currentPosition = Math.max(0, 
      Math.min(position, this.coordinationState.totalDuration)
    );
    
    // Update current chunk
    const currentChunk = this.getChunkAtTime(position);
    this.coordinationState.currentChunkId = currentChunk?.chunkId;
    
    this.emit('positionChanged', { 
      position: this.coordinationState.currentPosition,
      currentChunkId: this.coordinationState.currentChunkId,
    });
  }

  /**
   * Event handling
   */
  on(event: string, handler: (data: any) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

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
   * Private: Emit event
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

  /**
   * Private: Adjust chunk timestamps for global timeline
   */
  private adjustChunkTimestamps(chunk: StreamingTimelineChunk): StreamingTimelineChunk {
    const adjustedEvents = chunk.events.map(event => ({
      ...event,
      timestamp: event.timestamp + chunk.startTimeOffset,
    }));

    return {
      ...chunk,
      events: adjustedEvents,
    };
  }

  /**
   * Private: Update coordination state
   */
  private updateCoordinationState(): void {
    const chunks = this.getOrderedChunks();
    let totalDuration = 0;
    const allEvents: TimelineEvent[] = [];
    const chunkBoundaries: Array<{ chunkId: string; startTime: number; endTime: number }> = [];
    const eventTypeCounts: Record<string, number> = {};

    chunks.forEach(chunk => {
      // Calculate chunk boundaries
      const startTime = chunk.startTimeOffset;
      const endTime = startTime + chunk.duration;
      chunkBoundaries.push({
        chunkId: chunk.chunkId,
        startTime,
        endTime,
      });
      
      totalDuration = Math.max(totalDuration, endTime);

      // Collect all events
      chunk.events.forEach(event => {
        allEvents.push(event);
        eventTypeCounts[event.type] = (eventTypeCounts[event.type] || 0) + 1;
      });
    });

    // Sort events by timestamp
    allEvents.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate event density
    const eventDensity = totalDuration > 0 ? allEvents.length / (totalDuration / 1000) : 0;

    this.coordinationState = {
      totalDuration,
      currentPosition: this.coordinationState.currentPosition,
      currentChunkId: this.coordinationState.currentChunkId,
      sortedEvents: allEvents,
      metadata: {
        totalEvents: allEvents.length,
        eventTypeCounts,
        eventDensity,
        chunkBoundaries,
      },
    };
  }

  /**
   * Private: Get previous chunk context for continuity
   */
  private getPreviousChunkContext(chunkNumber: number): ChunkContext | undefined {
    if (chunkNumber <= 1) return undefined;

    const previousChunk = Array.from(this.chunks.values())
      .find(chunk => chunk.chunkNumber === chunkNumber - 1);

    if (!previousChunk) return undefined;

    // Extract context from previous chunk
    const lastVisualElements = previousChunk.events
      .filter(e => e.type === 'visual' && e.content.visual)
      .map(e => ({
        id: e.id,
        type: e.content.visual!.elementType,
        description: e.content.visual!.properties.text || '',
      }));

    const narrativeThread = previousChunk.events
      .filter(e => e.type === 'narration' && e.content.audio)
      .map(e => e.content.audio!.text)
      .join(' ');

    return {
      lastVisualElements,
      narrativeThread,
      keyConceptsIntroduced: [],
      currentFocus: previousChunk.contentType,
      layoutState: {
        activeRegions: [],
        density: 'moderate',
        hierarchyLevel: 1,
      },
      pendingConnections: [],
      engagementContext: {
        level: 'maintaining',
        tone: 'explanatory',
      },
    };
  }

  /**
   * Private: Cleanup old chunks to manage memory
   */
  private async cleanupOldChunks(): Promise<void> {
    if (this.chunks.size <= this.options.maxCachedChunks) return;

    const chunks = this.getOrderedChunks();
    const currentPosition = this.coordinationState.currentPosition;
    
    // Remove chunks that are far behind current position
    const chunksToRemove = chunks.filter(chunk => {
      const chunkEndTime = chunk.startTimeOffset + chunk.duration;
      return chunkEndTime < currentPosition - 300000; // 5 minutes behind
    });

    // Keep at least some chunks for seeking
    const keepCount = Math.max(3, this.options.maxCachedChunks - chunksToRemove.length);
    const toRemove = chunksToRemove.slice(0, -keepCount);

    for (const chunk of toRemove) {
      await this.removeChunk(chunk.chunkId);
    }

    if (toRemove.length > 0) {
      logger.debug('Cleaned up old chunks', { removedCount: toRemove.length });
    }
  }

  // ========== Phase 2: Enhanced Chunked Generation Methods ==========

  /**
   * Extract context from all chunks for continuity analysis
   */
  async extractGlobalContext(): Promise<any> {
    try {
      const chunks = this.getOrderedChunks();
      const context = await this.contextExtractor.extractContext(chunks);
      
      logger.debug('Global context extracted', {
        entityCount: context.entities.length,
        chunkCount: chunks.length,
        confidence: context.metadata.confidence,
      });
      
      return context;
    } catch (error) {
      logger.error('Error extracting global context', { error });
      throw error;
    }
  }

  /**
   * Analyze continuity between consecutive chunks
   */
  analyzeContinuity(chunkIds: string[]): Promise<any> {
    try {
      if (chunkIds.length < 2) {
        return Promise.resolve({
          overallScore: 1.0,
          issues: [],
          improvements: [],
        });
      }

      const chunks = chunkIds
        .map(id => this.chunks.get(id))
        .filter(chunk => chunk !== undefined) as StreamingTimelineChunk[];

      if (chunks.length < 2) {
        throw new Error('Insufficient chunks for continuity analysis');
      }

      // Analyze continuity for each consecutive pair
      const continuityResults = [];
      for (let i = 0; i < chunks.length - 1; i++) {
        const result = this.continuityManager.validateContinuity(chunks[i], chunks[i + 1]);
        continuityResults.push(result);
      }

      // Calculate overall metrics
      const overallScore = continuityResults.reduce((sum, result) => sum + result.overallScore, 0) / continuityResults.length;
      const allIssues = continuityResults.flatMap(result => result.issues);
      const allImprovements = continuityResults.flatMap(result => result.improvements);

      return Promise.resolve({
        overallScore,
        issues: [...new Set(allIssues)], // Remove duplicates
        improvements: [...new Set(allImprovements)],
        detailedResults: continuityResults,
      });

    } catch (error) {
      logger.error('Error analyzing continuity', { error });
      return Promise.reject(error);
    }
  }

  /**
   * Generate continuity hints for next chunk
   */
  generateContinuityHints(contextData?: any): any[] {
    try {
      const chunks = this.getOrderedChunks();
      
      if (chunks.length === 0) {
        return [];
      }

      // Extract context if not provided
      const context = contextData || this.continuityManager.extractContext(chunks);
      
      // Generate hints for next chunk
      const hints = this.continuityManager.generateContinuityHints(
        context,
        { /* nextChunkConfig would be provided by caller */ }
      );

      logger.debug('Generated continuity hints', { hintCount: hints.length });
      
      return hints;

    } catch (error) {
      logger.error('Error generating continuity hints', { error });
      return [];
    }
  }

  /**
   * Request pre-generation of future chunks
   */
  requestPreGeneration(
    currentPosition: number,
    availableChunkIds: string[],
    userBehavior?: any
  ): void {
    try {
      if (!this.options.performance.enablePreloading) {
        logger.debug('Pre-generation disabled');
        return;
      }

      this.preGenerationPipeline.predictAndRequest(
        currentPosition,
        availableChunkIds,
        userBehavior
      );

      logger.debug('Pre-generation requested', {
        currentPosition,
        availableChunks: availableChunkIds.length,
      });

    } catch (error) {
      logger.error('Error requesting pre-generation', { error });
    }
  }

  /**
   * Get cached chunk from pre-generation pipeline
   */
  getCachedChunk(chunkId: string): StreamingTimelineChunk | null {
    try {
      // First check our local cache
      const localChunk = this.chunks.get(chunkId);
      if (localChunk) {
        return localChunk;
      }

      // Then check pre-generation cache
      const cachedChunk = this.preGenerationPipeline.getCachedChunk(chunkId);
      
      if (cachedChunk) {
        logger.debug('Retrieved chunk from pre-generation cache', { chunkId });
        // Add to local cache for faster future access
        this.chunks.set(chunkId, cachedChunk);
        this.updateCoordinationState();
      }

      return cachedChunk;

    } catch (error) {
      logger.error('Error getting cached chunk', { error, chunkId });
      return null;
    }
  }

  /**
   * Add high-priority generation request to queue
   */
  requestImmediateGeneration(chunkData: any): boolean {
    try {
      return this.generationQueue.addImmediateRequest(
        chunkData.chunkId || `chunk_${Date.now()}`,
        chunkData
      );
    } catch (error) {
      logger.error('Error requesting immediate generation', { error });
      return false;
    }
  }

  /**
   * Get comprehensive system status including Phase 2 components
   */
  getEnhancedStatus(): {
    coordination: any;
    continuity: any;
    preGeneration: any;
    queue: any;
    performance: any;
  } {
    try {
      const baseStatus = this.getStatus();
      
      return {
        coordination: baseStatus,
        continuity: this.continuityManager.getState(),
        preGeneration: this.preGenerationPipeline.getStatus(),
        queue: this.generationQueue.getStats(),
        performance: {
          memoryUsage: this.getMemoryUsage(),
          cacheEfficiency: this.getCacheEfficiency(),
          averageProcessingTime: this.getAverageProcessingTime(),
        },
      };

    } catch (error) {
      logger.error('Error getting enhanced status', { error });
      return {
        coordination: { error: 'status_unavailable' },
        continuity: { error: 'continuity_unavailable' },
        preGeneration: { error: 'pregeneration_unavailable' },
        queue: { error: 'queue_unavailable' },
        performance: { error: 'performance_unavailable' },
      };
    }
  }

  /**
   * Shutdown Phase 2 components
   */
  shutdown(): void {
    try {
      this.preGenerationPipeline.stop();
      this.generationQueue.stop();
      this.continuityManager.reset();
      
      logger.info('ChunkCoordinator shutdown completed');
    } catch (error) {
      logger.error('Error during shutdown', { error });
    }
  }

  /**
   * Reset all Phase 2 components
   */
  resetEnhancedComponents(): void {
    try {
      this.continuityManager.reset();
      this.preGenerationPipeline.reset();
      this.generationQueue.clear();
      
      logger.info('Enhanced components reset');
    } catch (error) {
      logger.error('Error resetting enhanced components', { error });
    }
  }

  // Private helper methods for enhanced status

  private getMemoryUsage(): number {
    try {
      let totalSize = 0;
      
      // Calculate chunk data size (rough estimate)
      for (const chunk of this.chunks.values()) {
        totalSize += JSON.stringify(chunk).length * 2; // UTF-16 approximation
      }
      
      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  private getCacheEfficiency(): number {
    try {
      const totalRequests = this.chunks.size + 
        (this.preGenerationPipeline.getStatus().cacheSize || 0);
      const cacheHits = this.preGenerationPipeline.getStatus().metrics?.cacheHitRate || 0;
      
      return totalRequests > 0 ? cacheHits : 0;
    } catch (error) {
      return 0;
    }
  }

  private getAverageProcessingTime(): number {
    try {
      const statuses = Array.from(this.processingStatus.values());
      const completedStatuses = statuses.filter(s => 
        s.status === 'ready' && s.processingStarted && s.processingCompleted
      );
      
      if (completedStatuses.length === 0) return 0;
      
      const totalTime = completedStatuses.reduce((sum, status) => {
        return sum + (status.processingCompleted! - status.processingStarted!);
      }, 0);
      
      return totalTime / completedStatuses.length;
    } catch (error) {
      return 0;
    }
  }
}