/**
 * Pre-generation Pipeline for proactive content creation.
 * 
 * This module implements ahead-of-time chunk generation based on user position
 * and playback patterns to ensure smooth experience without generation delays.
 */

import type {
  StreamingTimelineChunk,
  ChunkContext,
  ChunkGenerationRequest,
} from '@ai-tutor/types/timeline/StreamingTimelineChunk';

import { createUtilLogger } from '@ai-tutor/utils';

const logger = createUtilLogger('PreGenerationPipeline');

/**
 * User behavior patterns for prediction
 */
export interface UserBehaviorPattern {
  /** Average playback speed (1.0 = normal) */
  playbackSpeed: number;
  
  /** Seeking frequency (seeks per minute) */
  seekingFrequency: number;
  
  /** Pause frequency (pauses per minute) */
  pauseFrequency: number;
  
  /** Preferred content length (seconds) */
  preferredLength: number;
  
  /** Skip rate (0.0-1.0) */
  skipRate: number;
  
  /** Replay rate (0.0-1.0) */
  replayRate: number;
  
  /** Time of day patterns */
  timePatterns: Record<string, number>;
}

/**
 * Generation priority levels
 */
export enum GenerationPriority {
  IMMEDIATE = 'immediate',    // Generate right now
  HIGH = 'high',             // Generate soon
  MEDIUM = 'medium',         // Generate when possible
  LOW = 'low',               // Generate when idle
  BACKGROUND = 'background', // Generate in spare time
}

/**
 * Generation request with priority and timing
 */
export interface PriorityGenerationRequest extends ChunkGenerationRequest {
  /** Priority level for generation */
  priority: GenerationPriority;
  
  /** Requested by timestamp */
  requestedAt: number;
  
  /** Estimated generation time */
  estimatedDuration: number;
  
  /** User position when requested */
  userPosition: number;
  
  /** Deadline for completion */
  deadline?: number;
  
  /** Retry count */
  retryCount: number;
  
  /** Dependencies on other chunks */
  dependencies: string[];
}

/**
 * Pipeline performance metrics
 */
export interface PipelineMetrics {
  /** Total chunks generated */
  totalGenerated: number;
  
  /** Cache hit rate */
  cacheHitRate: number;
  
  /** Average generation time */
  avgGenerationTime: number;
  
  /** User wait time (time user had to wait) */
  userWaitTime: number;
  
  /** Generation success rate */
  successRate: number;
  
  /** Queue processing efficiency */
  queueEfficiency: number;
  
  /** Resource utilization */
  resourceUtilization: number;
}

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  /** Maximum concurrent generations */
  maxConcurrentGenerations: number;
  
  /** Lookahead distance (seconds) */
  lookaheadDistance: number;
  
  /** Cache size limit */
  maxCacheSize: number;
  
  /** Generation timeout (ms) */
  generationTimeout: number;
  
  /** Retry attempts for failed generations */
  maxRetries: number;
  
  /** Enable adaptive timing */
  adaptiveTiming: boolean;
  
  /** Enable user behavior prediction */
  enablePrediction: boolean;
  
  /** Resource throttling threshold */
  resourceThreshold: number;
}

/**
 * Generation worker status
 */
interface GenerationWorker {
  id: string;
  isActive: boolean;
  currentRequest?: PriorityGenerationRequest;
  startTime?: number;
  performance: {
    totalGenerations: number;
    avgTime: number;
    successRate: number;
  };
}

/**
 * Pre-generation pipeline for smooth content delivery
 */
export class PreGenerationPipeline {
  private config: PipelineConfig;
  private generationQueue: PriorityGenerationRequest[] = [];
  private workers: Map<string, GenerationWorker> = new Map();
  private cache: Map<string, StreamingTimelineChunk> = new Map();
  private userBehavior: UserBehaviorPattern;
  private metrics: PipelineMetrics;
  private isRunning = false;
  private processingInterval?: NodeJS.Timeout;
  
  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = {
      maxConcurrentGenerations: 3,
      lookaheadDistance: 60.0, // 60 seconds ahead
      maxCacheSize: 20,
      generationTimeout: 30000, // 30 seconds
      maxRetries: 2,
      adaptiveTiming: true,
      enablePrediction: true,
      resourceThreshold: 0.8,
      ...config,
    };
    
    this.userBehavior = this.initializeDefaultBehavior();
    this.metrics = this.initializeMetrics();
    
    // Initialize workers
    for (let i = 0; i < this.config.maxConcurrentGenerations; i++) {
      const workerId = `worker-${i}`;
      this.workers.set(workerId, {
        id: workerId,
        isActive: false,
        performance: {
          totalGenerations: 0,
          avgTime: 0,
          successRate: 1.0,
        },
      });
    }
    
    logger.debug('PreGenerationPipeline initialized', { 
      config: this.config,
      workerCount: this.workers.size,
    });
  }
  
  /**
   * Start the pipeline processing
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Pipeline already running');
      return;
    }
    
    this.isRunning = true;
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 1000); // Process every second
    
    logger.info('Pre-generation pipeline started');
  }
  
  /**
   * Stop the pipeline processing
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    
    // Cancel all active generations
    for (const worker of this.workers.values()) {
      if (worker.isActive) {
        worker.isActive = false;
        worker.currentRequest = undefined;
      }
    }
    
    logger.info('Pre-generation pipeline stopped');
  }
  
  /**
   * Request chunk generation with priority
   */
  requestGeneration(
    request: ChunkGenerationRequest,
    priority: GenerationPriority = GenerationPriority.MEDIUM,
    userPosition: number = 0
  ): string {
    const priorityRequest: PriorityGenerationRequest = {
      ...request,
      priority,
      requestedAt: Date.now(),
      estimatedDuration: this.estimateGenerationTime(request),
      userPosition,
      retryCount: 0,
      dependencies: request.dependencies || [],
    };
    
    // Set deadline based on priority and user position
    if (priority === GenerationPriority.IMMEDIATE) {
      priorityRequest.deadline = Date.now() + 5000; // 5 seconds
    } else if (priority === GenerationPriority.HIGH) {
      priorityRequest.deadline = Date.now() + 15000; // 15 seconds
    }
    
    // Check if already in queue or cache
    const existingIndex = this.generationQueue.findIndex(
      req => req.chunkId === request.chunkId
    );
    
    if (existingIndex >= 0) {
      // Update priority if higher
      const existing = this.generationQueue[existingIndex];
      if (this.comparePriority(priority, existing.priority) > 0) {
        existing.priority = priority;
        existing.deadline = priorityRequest.deadline;
        this.sortQueue();
      }
      return existing.chunkId;
    }
    
    // Check cache
    if (this.cache.has(request.chunkId)) {
      logger.debug('Chunk already in cache', { chunkId: request.chunkId });
      return request.chunkId;
    }
    
    // Add to queue
    this.generationQueue.push(priorityRequest);
    this.sortQueue();
    
    logger.debug('Generation request queued', {
      chunkId: request.chunkId,
      priority,
      queueSize: this.generationQueue.length,
    });
    
    return request.chunkId;
  }
  
  /**
   * Predict and request future chunks based on user behavior
   */
  predictAndRequest(
    currentPosition: number,
    availableChunks: string[],
    userBehavior?: Partial<UserBehaviorPattern>
  ): void {
    if (!this.config.enablePrediction) return;
    
    // Update user behavior if provided
    if (userBehavior) {
      this.updateUserBehavior(userBehavior);
    }
    
    // Calculate prediction window
    const predictionWindow = this.calculatePredictionWindow(currentPosition);
    
    // Predict next chunks user will likely consume
    const predictedChunks = this.predictNextChunks(
      currentPosition,
      availableChunks,
      predictionWindow
    );
    
    // Request generation for predicted chunks
    for (const chunkId of predictedChunks) {
      const priority = this.calculatePredictivePriority(chunkId, currentPosition);
      
      this.requestGeneration(
        {
          chunkId,
          topic: 'predicted-content',
          config: {}, // This would be filled by the caller
        },
        priority,
        currentPosition
      );
    }
  }
  
  /**
   * Get cached chunk if available
   */
  getCachedChunk(chunkId: string): StreamingTimelineChunk | null {
    const chunk = this.cache.get(chunkId);
    
    if (chunk) {
      this.metrics.cacheHitRate = this.updateMetricAverage(
        this.metrics.cacheHitRate,
        1.0,
        this.metrics.totalGenerated
      );
      
      logger.debug('Cache hit', { chunkId });
      return chunk;
    }
    
    this.metrics.cacheHitRate = this.updateMetricAverage(
      this.metrics.cacheHitRate,
      0.0,
      this.metrics.totalGenerated
    );
    
    return null;
  }
  
  /**
   * Process the generation queue
   */
  private processQueue(): void {
    if (!this.isRunning || this.generationQueue.length === 0) return;
    
    // Check resource utilization
    if (this.getResourceUtilization() > this.config.resourceThreshold) {
      logger.debug('Resource threshold exceeded, throttling generation');
      return;
    }
    
    // Find available workers
    const availableWorkers = Array.from(this.workers.values()).filter(
      worker => !worker.isActive
    );
    
    if (availableWorkers.length === 0) return;
    
    // Process highest priority items
    const toProcess = this.generationQueue
      .filter(req => !this.isBeingProcessed(req))
      .slice(0, availableWorkers.length);
    
    for (let i = 0; i < toProcess.length; i++) {
      const request = toProcess[i];
      const worker = availableWorkers[i];
      
      this.assignToWorker(worker, request);
    }
  }
  
  /**
   * Assign generation request to worker
   */
  private async assignToWorker(
    worker: GenerationWorker,
    request: PriorityGenerationRequest
  ): Promise<void> {
    worker.isActive = true;
    worker.currentRequest = request;
    worker.startTime = Date.now();
    
    logger.debug('Assigning generation to worker', {
      workerId: worker.id,
      chunkId: request.chunkId,
      priority: request.priority,
    });
    
    try {
      // This would be implemented to call the actual content generator
      const chunk = await this.generateChunk(request);
      
      if (chunk) {
        this.cacheChunk(request.chunkId, chunk);
        this.updateWorkerPerformance(worker, true);
        this.removeFromQueue(request.chunkId);
        
        logger.debug('Chunk generation completed', {
          chunkId: request.chunkId,
          duration: Date.now() - (worker.startTime || 0),
        });
      } else {
        throw new Error('Generation returned null');
      }
      
    } catch (error) {
      logger.error('Generation failed', {
        chunkId: request.chunkId,
        error,
        retryCount: request.retryCount,
      });
      
      this.updateWorkerPerformance(worker, false);
      
      // Retry if under limit
      if (request.retryCount < this.config.maxRetries) {
        request.retryCount++;
        request.priority = GenerationPriority.HIGH; // Boost priority for retry
        // Keep in queue for retry
      } else {
        this.removeFromQueue(request.chunkId);
      }
    } finally {
      worker.isActive = false;
      worker.currentRequest = undefined;
      worker.startTime = undefined;
    }
  }
  
  /**
   * Generate chunk (placeholder - would integrate with actual generator)
   */
  private async generateChunk(request: PriorityGenerationRequest): Promise<StreamingTimelineChunk | null> {
    // This is a placeholder - in real implementation, this would call
    // the ChunkedContentGenerator or similar service
    
    return new Promise((resolve) => {
      setTimeout(() => {
        // Mock generation
        resolve({
          id: request.chunkId,
          events: [],
          metadata: {
            generatedAt: Date.now(),
            topic: request.topic,
          },
        } as StreamingTimelineChunk);
      }, request.estimatedDuration);
    });
  }
  
  /**
   * Cache generated chunk
   */
  private cacheChunk(chunkId: string, chunk: StreamingTimelineChunk): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.config.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    this.cache.set(chunkId, chunk);
    this.metrics.totalGenerated++;
    
    logger.debug('Chunk cached', {
      chunkId,
      cacheSize: this.cache.size,
    });
  }
  
  /**
   * Sort queue by priority and deadline
   */
  private sortQueue(): void {
    this.generationQueue.sort((a, b) => {
      // First by priority
      const priorityDiff = this.comparePriority(b.priority, a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by deadline
      const aDeadline = a.deadline || Infinity;
      const bDeadline = b.deadline || Infinity;
      return aDeadline - bDeadline;
    });
  }
  
  /**
   * Compare priority levels
   */
  private comparePriority(a: GenerationPriority, b: GenerationPriority): number {
    const priorities = {
      [GenerationPriority.IMMEDIATE]: 5,
      [GenerationPriority.HIGH]: 4,
      [GenerationPriority.MEDIUM]: 3,
      [GenerationPriority.LOW]: 2,
      [GenerationPriority.BACKGROUND]: 1,
    };
    
    return priorities[a] - priorities[b];
  }
  
  /**
   * Additional helper methods (simplified for brevity)
   */
  private initializeDefaultBehavior(): UserBehaviorPattern {
    return {
      playbackSpeed: 1.0,
      seekingFrequency: 0.1,
      pauseFrequency: 0.2,
      preferredLength: 30.0,
      skipRate: 0.1,
      replayRate: 0.05,
      timePatterns: {},
    };
  }
  
  private initializeMetrics(): PipelineMetrics {
    return {
      totalGenerated: 0,
      cacheHitRate: 0.0,
      avgGenerationTime: 0.0,
      userWaitTime: 0.0,
      successRate: 1.0,
      queueEfficiency: 1.0,
      resourceUtilization: 0.0,
    };
  }
  
  private estimateGenerationTime(request: ChunkGenerationRequest): number {
    // Simple estimation - in reality, this would be more sophisticated
    return 3000; // 3 seconds
  }
  
  private calculatePredictionWindow(currentPosition: number): number {
    const baseWindow = this.config.lookaheadDistance;
    const speedFactor = this.userBehavior.playbackSpeed;
    
    return baseWindow * speedFactor;
  }
  
  private predictNextChunks(
    currentPosition: number,
    availableChunks: string[],
    window: number
  ): string[] {
    // Simple prediction - in reality, this would use ML or more sophisticated logic
    return availableChunks.slice(0, 3); // Predict next 3 chunks
  }
  
  private calculatePredictivePriority(chunkId: string, currentPosition: number): GenerationPriority {
    // Simple priority calculation
    return GenerationPriority.MEDIUM;
  }
  
  private updateUserBehavior(behavior: Partial<UserBehaviorPattern>): void {
    this.userBehavior = { ...this.userBehavior, ...behavior };
  }
  
  private getResourceUtilization(): number {
    const activeWorkers = Array.from(this.workers.values()).filter(w => w.isActive).length;
    return activeWorkers / this.config.maxConcurrentGenerations;
  }
  
  private isBeingProcessed(request: PriorityGenerationRequest): boolean {
    return Array.from(this.workers.values()).some(
      worker => worker.currentRequest?.chunkId === request.chunkId
    );
  }
  
  private updateWorkerPerformance(worker: GenerationWorker, success: boolean): void {
    const duration = Date.now() - (worker.startTime || Date.now());
    
    worker.performance.totalGenerations++;
    worker.performance.avgTime = this.updateMetricAverage(
      worker.performance.avgTime,
      duration,
      worker.performance.totalGenerations
    );
    worker.performance.successRate = this.updateMetricAverage(
      worker.performance.successRate,
      success ? 1.0 : 0.0,
      worker.performance.totalGenerations
    );
  }
  
  private removeFromQueue(chunkId: string): void {
    this.generationQueue = this.generationQueue.filter(req => req.chunkId !== chunkId);
  }
  
  private updateMetricAverage(current: number, newValue: number, count: number): number {
    return (current * (count - 1) + newValue) / count;
  }
  
  /**
   * Get current pipeline status
   */
  getStatus(): {
    isRunning: boolean;
    queueSize: number;
    cacheSize: number;
    activeWorkers: number;
    metrics: PipelineMetrics;
  } {
    return {
      isRunning: this.isRunning,
      queueSize: this.generationQueue.length,
      cacheSize: this.cache.size,
      activeWorkers: Array.from(this.workers.values()).filter(w => w.isActive).length,
      metrics: this.metrics,
    };
  }
  
  /**
   * Clear cache and reset state
   */
  reset(): void {
    this.cache.clear();
    this.generationQueue = [];
    this.metrics = this.initializeMetrics();
    
    // Reset workers
    for (const worker of this.workers.values()) {
      worker.isActive = false;
      worker.currentRequest = undefined;
      worker.performance = {
        totalGenerations: 0,
        avgTime: 0,
        successRate: 1.0,
      };
    }
    
    logger.debug('Pre-generation pipeline reset');
  }
}