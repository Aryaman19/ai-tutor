/**
 * Streaming Audio Processor - Phase 5: Audio Integration & Synchronization
 * 
 * Handles timeline-aligned audio chunk processing, buffering, and streaming integration.
 * Extends existing TTS streaming capabilities with precise timeline coordination.
 */

import type {
  TimelineEvent,
  AudioCue,
} from '@ai-tutor/types';

import type {
  TimelineAudioChunk,
  AudioTimelinePosition,
  TimelineAudioSyncConfig,
} from './timeline-audio-sync';

import { createUtilLogger } from '../logger';

const logger = createUtilLogger('StreamingAudioProcessor');

/**
 * Audio chunk processing state
 */
export type AudioProcessingState = 'pending' | 'generating' | 'ready' | 'playing' | 'completed' | 'error';

/**
 * Streaming audio chunk with processing metadata
 */
export interface StreamingAudioChunk extends TimelineAudioChunk {
  /** Processing state */
  processingState: AudioProcessingState;
  
  /** Generation progress (0-1) */
  generationProgress: number;
  
  /** TTS request metadata */
  ttsRequest?: {
    requestId: string;
    requestTime: number;
    voice: string;
    speed: number;
    chunkSize: number;
  };
  
  /** Buffer management */
  bufferInfo: {
    /** Is chunk in buffer */
    isBuffered: boolean;
    
    /** Buffer priority (higher = more important) */
    bufferPriority: number;
    
    /** Last access time */
    lastAccessTime: number;
    
    /** Preload score (0-1) */
    preloadScore: number;
  };
  
  /** Audio processing metadata */
  processingMetadata: {
    /** Original text length */
    originalTextLength: number;
    
    /** Processing duration */
    processingDuration?: number;
    
    /** Audio quality metrics */
    qualityMetrics?: {
      sampleRate: number;
      bitDepth: number;
      compressionRatio?: number;
    };
    
    /** Error information */
    errorInfo?: {
      errorType: string;
      errorMessage: string;
      retryCount: number;
    };
  };
}

/**
 * Audio buffer management configuration
 */
export interface AudioBufferConfig {
  /** Maximum buffer size (bytes) */
  maxBufferSize: number;
  
  /** Minimum buffer ahead time (milliseconds) */
  minBufferAhead: number;
  
  /** Optimal buffer ahead time (milliseconds) */
  optimalBufferAhead: number;
  
  /** Buffer cleanup threshold */
  cleanupThreshold: number;
  
  /** Priority-based eviction */
  priorityEviction: boolean;
  
  /** Preload distance (milliseconds) */
  preloadDistance: number;
}

/**
 * Audio processing metrics
 */
export interface AudioProcessingMetrics {
  /** Total chunks processed */
  totalChunksProcessed: number;
  
  /** Successfully generated chunks */
  successfulChunks: number;
  
  /** Failed chunk generations */
  failedChunks: number;
  
  /** Average generation time */
  averageGenerationTime: number;
  
  /** Buffer statistics */
  bufferStats: {
    /** Current buffer utilization (0-1) */
    bufferUtilization: number;
    
    /** Buffer hits vs misses */
    bufferHitRatio: number;
    
    /** Current buffered chunks */
    bufferedChunks: number;
    
    /** Buffer memory usage */
    bufferMemoryUsage: number;
  };
  
  /** Quality metrics */
  qualityStats: {
    /** Average audio quality score */
    averageQuality: number;
    
    /** Compression efficiency */
    compressionEfficiency: number;
    
    /** Audio processing errors */
    processingErrors: number;
  };
  
  /** Performance metrics */
  performance: {
    /** Chunks ready on time */
    chunksReadyOnTime: number;
    
    /** Late chunks */
    lateChunks: number;
    
    /** Average processing latency */
    averageLatency: number;
  };
}

/**
 * Audio generation request
 */
export interface AudioGenerationRequest {
  /** Request identifier */
  id: string;
  
  /** Timeline event reference */
  event: TimelineEvent;
  
  /** Audio cue to generate */
  audioCue: AudioCue;
  
  /** Priority level */
  priority: 'critical' | 'high' | 'normal' | 'low';
  
  /** Target completion time */
  targetCompletionTime: number;
  
  /** Voice settings */
  voiceSettings: {
    voice?: string;
    speed: number;
    volume: number;
    quality?: 'high' | 'medium' | 'low';
  };
  
  /** Processing options */
  processingOptions: {
    /** Enable compression */
    enableCompression: boolean;
    
    /** Target bitrate */
    targetBitrate?: number;
    
    /** Enable background processing */
    backgroundProcessing: boolean;
  };
}

/**
 * Default buffer configuration
 */
const DEFAULT_BUFFER_CONFIG: AudioBufferConfig = {
  maxBufferSize: 25 * 1024 * 1024, // 25MB
  minBufferAhead: 1000, // 1 second
  optimalBufferAhead: 3000, // 3 seconds
  cleanupThreshold: 0.8, // 80% full
  priorityEviction: true,
  preloadDistance: 5000, // 5 seconds
};

/**
 * Main Streaming Audio Processor
 */
export class StreamingAudioProcessor {
  private bufferConfig: AudioBufferConfig;
  private syncConfig: TimelineAudioSyncConfig;
  private processingQueue: AudioGenerationRequest[] = [];
  private chunks = new Map<string, StreamingAudioChunk>();
  private bufferedChunks = new Set<string>();
  private eventHandlers = new Map<string, Array<(data: any) => void>>();
  
  // Processing state
  private isProcessing = false;
  private currentTimelinePosition = 0;
  private playbackSpeed = 1.0;
  
  // Metrics and performance
  private metrics: AudioProcessingMetrics;
  private generationTimes: number[] = [];
  private bufferAccessTimes = new Map<string, number>();
  
  // Background processing
  private processingTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private preloadTimer?: NodeJS.Timeout;

  constructor(
    bufferConfig: Partial<AudioBufferConfig> = {},
    syncConfig: TimelineAudioSyncConfig
  ) {
    this.bufferConfig = { ...DEFAULT_BUFFER_CONFIG, ...bufferConfig };
    this.syncConfig = syncConfig;
    
    this.metrics = this.createInitialMetrics();
    
    // Start background services
    this.startBackgroundServices();
    
    logger.info('StreamingAudioProcessor initialized', {
      bufferConfig: this.bufferConfig,
      maxConcurrentChunks: syncConfig.maxConcurrentChunks,
    });
  }

  /**
   * Process timeline events for audio generation
   */
  async processTimelineEvents(events: TimelineEvent[]): Promise<void> {
    logger.debug('Processing timeline events for audio', { eventCount: events.length });
    
    try {
      // Filter events with audio content
      const audioEvents = events.filter(event => 
        event.type === 'narration' && 
        typeof event.content === 'object' && 
        event.content.audio
      );
      
      // Create streaming audio chunks
      const streamingChunks = audioEvents.map(event => 
        this.createStreamingAudioChunk(event)
      );
      
      // Store chunks
      for (const chunk of streamingChunks) {
        this.chunks.set(chunk.id, chunk);
      }
      
      // Generate high-priority requests
      const highPriorityRequests = this.createGenerationRequests(streamingChunks, 'high');
      
      // Queue for processing
      this.queueGenerationRequests(highPriorityRequests);
      
      // Start processing if not already running
      if (!this.isProcessing) {
        await this.startProcessing();
      }
      
      this.emit('eventsProcessed', {
        totalEvents: events.length,
        audioEvents: audioEvents.length,
        chunksCreated: streamingChunks.length,
        requestsQueued: highPriorityRequests.length,
      });
      
      logger.debug('Timeline events processed', {
        audioEvents: audioEvents.length,
        chunksCreated: streamingChunks.length,
      });

    } catch (error) {
      logger.error('Error processing timeline events', { error });
      throw error;
    }
  }

  /**
   * Update current timeline position for buffer management
   */
  updateTimelinePosition(position: number, speed: number = 1.0): void {
    this.currentTimelinePosition = position;
    this.playbackSpeed = speed;
    
    // Update buffer priorities based on new position
    this.updateBufferPriorities();
    
    // Trigger preloading for upcoming chunks
    this.triggerPreloading();
    
    // Update metrics
    this.updateMetrics();
  }

  /**
   * Get audio chunks for specific timeline position
   */
  getChunksForPosition(position: number): StreamingAudioChunk[] {
    return Array.from(this.chunks.values()).filter(chunk => {
      const chunkStart = chunk.timelineStart;
      const chunkEnd = chunk.timelineStart + chunk.timelineDuration;
      return position >= chunkStart && position <= chunkEnd;
    });
  }

  /**
   * Get chunk by ID
   */
  getChunk(chunkId: string): StreamingAudioChunk | undefined {
    return this.chunks.get(chunkId);
  }

  /**
   * Request immediate chunk generation
   */
  async requestImmediateGeneration(chunkIds: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    logger.debug('Requesting immediate generation', { chunkIds });
    
    for (const chunkId of chunkIds) {
      const chunk = this.chunks.get(chunkId);
      if (!chunk) {
        results.set(chunkId, false);
        continue;
      }
      
      if (chunk.processingState === 'ready') {
        results.set(chunkId, true);
        continue;
      }
      
      try {
        // Create high-priority request
        const request = this.createGenerationRequest(chunk, 'critical');
        
        // Process immediately
        const success = await this.processGenerationRequest(request);
        results.set(chunkId, success);
        
      } catch (error) {
        logger.error('Immediate generation failed', { chunkId, error });
        results.set(chunkId, false);
      }
    }
    
    return results;
  }

  /**
   * Ensure chunks are buffered for position range
   */
  async ensureBuffered(startPosition: number, endPosition: number): Promise<boolean> {
    const chunksInRange = Array.from(this.chunks.values()).filter(chunk => {
      return chunk.timelineStart < endPosition && 
             (chunk.timelineStart + chunk.timelineDuration) > startPosition;
    });
    
    logger.debug('Ensuring chunks buffered', { 
      startPosition, 
      endPosition, 
      chunksInRange: chunksInRange.length 
    });
    
    const unbufferedChunks = chunksInRange.filter(chunk => 
      !chunk.bufferInfo.isBuffered && chunk.processingState !== 'ready'
    );
    
    if (unbufferedChunks.length === 0) {
      return true; // Already buffered
    }
    
    // Generate requests for unbuffered chunks
    const requests = this.createGenerationRequests(unbufferedChunks, 'high');
    
    // Process requests
    const results = await Promise.allSettled(
      requests.map(request => this.processGenerationRequest(request))
    );
    
    const successCount = results.filter(result => 
      result.status === 'fulfilled' && result.value
    ).length;
    
    return successCount === unbufferedChunks.length;
  }

  /**
   * Get current processing metrics
   */
  getMetrics(): AudioProcessingMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get buffer status
   */
  getBufferStatus(): {
    totalChunks: number;
    bufferedChunks: number;
    processingChunks: number;
    pendingChunks: number;
    memoryUsage: number;
    bufferUtilization: number;
  } {
    const processingChunks = Array.from(this.chunks.values()).filter(
      chunk => chunk.processingState === 'generating'
    ).length;
    
    const pendingChunks = Array.from(this.chunks.values()).filter(
      chunk => chunk.processingState === 'pending'
    ).length;
    
    return {
      totalChunks: this.chunks.size,
      bufferedChunks: this.bufferedChunks.size,
      processingChunks,
      pendingChunks,
      memoryUsage: this.calculateMemoryUsage(),
      bufferUtilization: this.calculateBufferUtilization(),
    };
  }

  /**
   * Clear buffer and reset state
   */
  clearBuffer(): void {
    logger.debug('Clearing audio buffer');
    
    // Stop any active processing
    this.isProcessing = false;
    
    // Clear all chunks
    this.chunks.clear();
    this.bufferedChunks.clear();
    this.processingQueue = [];
    
    // Reset metrics
    this.metrics = this.createInitialMetrics();
    
    this.emit('bufferCleared', {});
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
   * Shutdown and cleanup
   */
  shutdown(): void {
    logger.debug('Shutting down StreamingAudioProcessor');
    
    this.stopBackgroundServices();
    this.clearBuffer();
    this.eventHandlers.clear();
    
    logger.debug('StreamingAudioProcessor shutdown complete');
  }

  // ========== Private Methods ==========

  /**
   * Create streaming audio chunk from timeline event
   */
  private createStreamingAudioChunk(event: TimelineEvent): StreamingAudioChunk {
    const audio = (event.content as any).audio as AudioCue;
    
    return {
      id: `audio_${event.id}`,
      eventId: event.id,
      text: audio.text,
      timelineStart: event.timestamp,
      timelineDuration: event.duration,
      audioDuration: this.estimateAudioDuration(audio.text, audio.speed || 1.0),
      isLoaded: false,
      isPlaying: false,
      voiceSettings: {
        voice: audio.voice,
        speed: audio.speed || 1.0,
        volume: audio.volume || 1.0,
      },
      syncMetadata: {
        expectedOffset: 0,
        measuredAccuracy: 1.0,
        timingAdjustments: [],
      },
      
      // Streaming processor specific fields
      processingState: 'pending',
      generationProgress: 0,
      bufferInfo: {
        isBuffered: false,
        bufferPriority: this.calculateInitialPriority(event),
        lastAccessTime: performance.now(),
        preloadScore: 0,
      },
      processingMetadata: {
        originalTextLength: audio.text.length,
      },
    };
  }

  /**
   * Calculate initial buffer priority
   */
  private calculateInitialPriority(event: TimelineEvent): number {
    // Higher priority for earlier events and critical content
    const timeFactor = Math.max(0, 1 - event.timestamp / 60000); // Decrease over 60 seconds
    const importanceFactor = event.priority || 1;
    return timeFactor * importanceFactor;
  }

  /**
   * Create generation requests for chunks
   */
  private createGenerationRequests(
    chunks: StreamingAudioChunk[], 
    priority: 'critical' | 'high' | 'normal' | 'low'
  ): AudioGenerationRequest[] {
    return chunks.map(chunk => this.createGenerationRequest(chunk, priority));
  }

  /**
   * Create single generation request
   */
  private createGenerationRequest(
    chunk: StreamingAudioChunk, 
    priority: 'critical' | 'high' | 'normal' | 'low'
  ): AudioGenerationRequest {
    const event = { id: chunk.eventId } as TimelineEvent; // Simplified for this example
    const audio = { text: chunk.text, voice: chunk.voiceSettings.voice } as AudioCue;
    
    return {
      id: `req_${chunk.id}_${Date.now()}`,
      event,
      audioCue: audio,
      priority,
      targetCompletionTime: chunk.timelineStart - this.bufferConfig.optimalBufferAhead,
      voiceSettings: {
        voice: chunk.voiceSettings.voice,
        speed: chunk.voiceSettings.speed,
        volume: chunk.voiceSettings.volume,
        quality: 'medium',
      },
      processingOptions: {
        enableCompression: this.syncConfig.performance.enableCompression,
        backgroundProcessing: true,
      },
    };
  }

  /**
   * Queue generation requests
   */
  private queueGenerationRequests(requests: AudioGenerationRequest[]): void {
    // Sort by priority and target completion time
    const sortedRequests = requests.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.targetCompletionTime - b.targetCompletionTime;
    });
    
    this.processingQueue.push(...sortedRequests);
    
    logger.debug('Generation requests queued', { 
      requestsAdded: requests.length, 
      totalQueued: this.processingQueue.length 
    });
  }

  /**
   * Start processing queue
   */
  private async startProcessing(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    logger.debug('Starting audio processing');
    
    while (this.processingQueue.length > 0 && this.isProcessing) {
      const request = this.processingQueue.shift();
      if (request) {
        try {
          await this.processGenerationRequest(request);
        } catch (error) {
          logger.error('Request processing failed', { requestId: request.id, error });
        }
      }
    }
    
    this.isProcessing = false;
    
    logger.debug('Audio processing completed');
  }

  /**
   * Process single generation request
   */
  private async processGenerationRequest(request: AudioGenerationRequest): Promise<boolean> {
    const chunkId = `audio_${request.event.id}`;
    const chunk = this.chunks.get(chunkId);
    
    if (!chunk) {
      logger.warn('Chunk not found for request', { requestId: request.id, chunkId });
      return false;
    }
    
    logger.debug('Processing generation request', { 
      requestId: request.id, 
      chunkId, 
      priority: request.priority 
    });
    
    const startTime = performance.now();
    
    try {
      // Update chunk state
      chunk.processingState = 'generating';
      chunk.ttsRequest = {
        requestId: request.id,
        requestTime: startTime,
        voice: request.voiceSettings.voice || 'default',
        speed: request.voiceSettings.speed,
        chunkSize: chunk.text.length,
      };
      
      // Simulate TTS generation (this would integrate with actual TTS service)
      const success = await this.performTTSGeneration(request, chunk);
      
      const endTime = performance.now();
      const generationTime = endTime - startTime;
      
      // Update metrics
      this.recordGenerationTime(generationTime);
      
      if (success) {
        chunk.processingState = 'ready';
        chunk.bufferInfo.isBuffered = true;
        chunk.processingMetadata.processingDuration = generationTime;
        this.bufferedChunks.add(chunkId);
        this.metrics.successfulChunks++;
        
        this.emit('chunkReady', {
          chunkId,
          generationTime,
          priority: request.priority,
        });
      } else {
        chunk.processingState = 'error';
        this.metrics.failedChunks++;
        
        this.emit('chunkError', {
          chunkId,
          error: 'TTS generation failed',
          generationTime,
        });
      }
      
      return success;

    } catch (error) {
      const endTime = performance.now();
      const generationTime = endTime - startTime;
      
      logger.error('Generation request failed', { 
        requestId: request.id, 
        chunkId, 
        error,
        generationTime,
      });
      
      chunk.processingState = 'error';
      chunk.processingMetadata.errorInfo = {
        errorType: 'generation_failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        retryCount: 0,
      };
      
      this.metrics.failedChunks++;
      
      return false;
    }
  }

  /**
   * Perform actual TTS generation (placeholder)
   */
  private async performTTSGeneration(
    request: AudioGenerationRequest, 
    chunk: StreamingAudioChunk
  ): Promise<boolean> {
    // This would integrate with the existing TTS service
    // For now, simulate the generation process
    
    const estimatedDuration = chunk.text.length * 10; // Simulate processing time
    
    return new Promise(resolve => {
      setTimeout(() => {
        // Simulate 95% success rate
        const success = Math.random() > 0.05;
        
        if (success) {
          // Simulate audio data creation
          chunk.audioData = `simulated_audio_data_${chunk.id}`;
          chunk.isLoaded = true;
        }
        
        resolve(success);
      }, Math.min(estimatedDuration, 2000)); // Cap at 2 seconds
    });
  }

  /**
   * Update buffer priorities based on current position
   */
  private updateBufferPriorities(): void {
    const currentTime = performance.now();
    
    for (const chunk of this.chunks.values()) {
      // Calculate distance from current position
      const distance = Math.abs(chunk.timelineStart - this.currentTimelinePosition);
      
      // Calculate time-based priority (closer = higher)
      const timePriority = Math.max(0, 1 - distance / this.bufferConfig.preloadDistance);
      
      // Calculate recency factor
      const timeSinceAccess = currentTime - chunk.bufferInfo.lastAccessTime;
      const recencyFactor = Math.max(0.1, 1 - timeSinceAccess / 300000); // 5 minute decay
      
      // Update priority
      chunk.bufferInfo.bufferPriority = (timePriority * 0.7) + (recencyFactor * 0.3);
      
      // Update preload score
      chunk.bufferInfo.preloadScore = Math.max(0, 1 - distance / this.bufferConfig.optimalBufferAhead);
    }
  }

  /**
   * Trigger preloading for upcoming chunks
   */
  private triggerPreloading(): void {
    const preloadEndPosition = this.currentTimelinePosition + this.bufferConfig.preloadDistance;
    
    const chunksToPreload = Array.from(this.chunks.values())
      .filter(chunk => 
        chunk.processingState === 'pending' &&
        chunk.timelineStart <= preloadEndPosition &&
        chunk.timelineStart >= this.currentTimelinePosition &&
        chunk.bufferInfo.preloadScore > 0.3
      )
      .sort((a, b) => b.bufferInfo.preloadScore - a.bufferInfo.preloadScore)
      .slice(0, 3); // Preload top 3 chunks
    
    if (chunksToPreload.length > 0) {
      const requests = this.createGenerationRequests(chunksToPreload, 'normal');
      this.queueGenerationRequests(requests);
      
      if (!this.isProcessing) {
        this.startProcessing();
      }
    }
  }

  /**
   * Calculate memory usage
   */
  private calculateMemoryUsage(): number {
    let totalMemory = 0;
    
    for (const chunk of this.chunks.values()) {
      if (chunk.audioData) {
        if (typeof chunk.audioData === 'string') {
          totalMemory += chunk.audioData.length * 2; // UTF-16
        } else {
          totalMemory += chunk.audioData.byteLength;
        }
      }
      
      // Text and metadata overhead
      totalMemory += chunk.text.length * 2;
      totalMemory += 512; // Metadata overhead estimate
    }
    
    return totalMemory;
  }

  /**
   * Calculate buffer utilization
   */
  private calculateBufferUtilization(): number {
    const memoryUsage = this.calculateMemoryUsage();
    return Math.min(1.0, memoryUsage / this.bufferConfig.maxBufferSize);
  }

  /**
   * Estimate audio duration from text
   */
  private estimateAudioDuration(text: string, speed: number): number {
    // Rough estimation: ~150 words per minute at normal speed
    const wordsPerMinute = 150 * speed;
    const wordCount = text.trim().split(/\s+/).length;
    return (wordCount / wordsPerMinute) * 60 * 1000; // Convert to milliseconds
  }

  /**
   * Record generation time for metrics
   */
  private recordGenerationTime(time: number): void {
    this.generationTimes.push(time);
    if (this.generationTimes.length > 50) {
      this.generationTimes.shift();
    }
  }

  /**
   * Create initial metrics
   */
  private createInitialMetrics(): AudioProcessingMetrics {
    return {
      totalChunksProcessed: 0,
      successfulChunks: 0,
      failedChunks: 0,
      averageGenerationTime: 0,
      bufferStats: {
        bufferUtilization: 0,
        bufferHitRatio: 1.0,
        bufferedChunks: 0,
        bufferMemoryUsage: 0,
      },
      qualityStats: {
        averageQuality: 1.0,
        compressionEfficiency: 1.0,
        processingErrors: 0,
      },
      performance: {
        chunksReadyOnTime: 0,
        lateChunks: 0,
        averageLatency: 0,
      },
    };
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    // Update generation time average
    if (this.generationTimes.length > 0) {
      this.metrics.averageGenerationTime = this.generationTimes.reduce((sum, time) => sum + time, 0) / this.generationTimes.length;
    }
    
    // Update buffer stats
    this.metrics.bufferStats.bufferUtilization = this.calculateBufferUtilization();
    this.metrics.bufferStats.bufferedChunks = this.bufferedChunks.size;
    this.metrics.bufferStats.bufferMemoryUsage = this.calculateMemoryUsage();
    
    // Update total processed
    this.metrics.totalChunksProcessed = this.metrics.successfulChunks + this.metrics.failedChunks;
  }

  /**
   * Start background services
   */
  private startBackgroundServices(): void {
    // Processing timer for continuous processing
    this.processingTimer = setInterval(() => {
      if (!this.isProcessing && this.processingQueue.length > 0) {
        this.startProcessing();
      }
    }, 1000);
    
    // Cleanup timer for buffer management
    this.cleanupTimer = setInterval(() => {
      this.performBufferCleanup();
    }, this.bufferConfig.cleanupThreshold * 10000); // Every 8 seconds if 80% threshold
    
    // Preload timer for predictive loading
    this.preloadTimer = setInterval(() => {
      this.triggerPreloading();
    }, 2000);
  }

  /**
   * Stop background services
   */
  private stopBackgroundServices(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = undefined;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    if (this.preloadTimer) {
      clearInterval(this.preloadTimer);
      this.preloadTimer = undefined;
    }
  }

  /**
   * Perform buffer cleanup when approaching capacity
   */
  private performBufferCleanup(): void {
    const utilization = this.calculateBufferUtilization();
    
    if (utilization < this.bufferConfig.cleanupThreshold) {
      return; // No cleanup needed
    }
    
    logger.debug('Performing buffer cleanup', { utilization });
    
    // Get chunks sorted by priority (lowest first)
    const chunksToConsider = Array.from(this.chunks.values())
      .filter(chunk => 
        chunk.bufferInfo.isBuffered && 
        !this.isChunkActive(chunk)
      )
      .sort((a, b) => a.bufferInfo.bufferPriority - b.bufferInfo.bufferPriority);
    
    // Remove lowest priority chunks until under threshold
    const targetRemoval = Math.ceil(chunksToConsider.length * 0.2); // Remove 20%
    
    for (let i = 0; i < targetRemoval && i < chunksToConsider.length; i++) {
      const chunk = chunksToConsider[i];
      chunk.bufferInfo.isBuffered = false;
      chunk.audioData = undefined;
      chunk.audioElement = undefined;
      chunk.isLoaded = false;
      this.bufferedChunks.delete(chunk.id);
    }
    
    logger.debug('Buffer cleanup completed', { 
      chunksRemoved: Math.min(targetRemoval, chunksToConsider.length),
      newUtilization: this.calculateBufferUtilization(),
    });
  }

  /**
   * Check if chunk is currently active/playing
   */
  private isChunkActive(chunk: StreamingAudioChunk): boolean {
    const currentTime = this.currentTimelinePosition;
    return currentTime >= chunk.timelineStart && 
           currentTime <= chunk.timelineStart + chunk.timelineDuration;
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

export default StreamingAudioProcessor;