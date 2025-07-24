/**
 * Timeline-Audio Sync Engine - Phase 5: Audio Integration & Synchronization
 * 
 * Provides precise audio-visual synchronization for timeline-based content.
 * Integrates with existing TTS infrastructure and timeline event system.
 */

import type {
  TimelineEvent,
  AudioCue,
} from '@ai-tutor/types';

import { createUtilLogger } from '../logger';

const logger = createUtilLogger('TimelineAudioSync');

/**
 * Audio synchronization state
 */
export type AudioSyncState = 'synced' | 'leading' | 'lagging' | 'seeking' | 'error';

/**
 * Timeline audio position information
 */
export interface AudioTimelinePosition {
  /** Current timeline position (milliseconds) */
  timelinePosition: number;
  
  /** Current audio position (milliseconds) */
  audioPosition: number;
  
  /** Synchronization offset (positive = audio ahead) */
  syncOffset: number;
  
  /** Synchronization state */
  state: AudioSyncState;
  
  /** Confidence in synchronization accuracy (0-1) */
  confidence: number;
}

/**
 * Audio chunk with timeline metadata
 */
export interface TimelineAudioChunk {
  /** Unique chunk identifier */
  id: string;
  
  /** Associated timeline event ID */
  eventId: string;
  
  /** Audio text content */
  text: string;
  
  /** Timeline start position (milliseconds) */
  timelineStart: number;
  
  /** Timeline duration (milliseconds) */
  timelineDuration: number;
  
  /** Audio duration (milliseconds) */
  audioDuration: number;
  
  /** Audio element reference */
  audioElement?: HTMLAudioElement;
  
  /** Audio data or URL */
  audioData?: string | ArrayBuffer;
  
  /** Loading state */
  isLoaded: boolean;
  
  /** Playback state */
  isPlaying: boolean;
  
  /** Voice settings used */
  voiceSettings: {
    voice?: string;
    speed: number;
    volume: number;
  };
  
  /** Synchronization metadata */
  syncMetadata: {
    /** Expected sync offset */
    expectedOffset: number;
    
    /** Measured sync accuracy */
    measuredAccuracy: number;
    
    /** Timing adjustments made */
    timingAdjustments: number[];
  };
}

/**
 * Audio seeking information
 */
export interface AudioSeekInfo {
  /** Target timeline position */
  targetPosition: number;
  
  /** Timeline events at target position */
  activeEvents: TimelineEvent[];
  
  /** Audio chunks that should be active */
  activeChunks: TimelineAudioChunk[];
  
  /** Seek start time */
  seekStartTime: number;
  
  /** Audio seek positions */
  audioSeekPositions: Array<{
    chunkId: string;
    seekPosition: number;
  }>;
}

/**
 * Timeline audio synchronization configuration
 */
export interface TimelineAudioSyncConfig {
  /** Maximum audio-visual sync tolerance (milliseconds) */
  syncTolerance: number;
  
  /** Audio seek response time target (milliseconds) */
  seekResponseTarget: number;
  
  /** Enable predictive audio loading */
  predictiveLoading: boolean;
  
  /** Audio buffer ahead time (milliseconds) */
  bufferAheadTime: number;
  
  /** Maximum concurrent audio chunks */
  maxConcurrentChunks: number;
  
  /** Audio quality settings */
  quality: {
    /** Sample rate preference */
    sampleRate: number;
    
    /** Bit depth preference */
    bitDepth: number;
    
    /** Enable high precision timing */
    highPrecisionTiming: boolean;
  };
  
  /** Performance optimization settings */
  performance: {
    /** Enable audio compression */
    enableCompression: boolean;
    
    /** Memory cleanup interval */
    memoryCleanupInterval: number;
    
    /** Maximum cache size (bytes) */
    maxCacheSize: number;
  };
  
  /** Synchronization correction settings */
  correction: {
    /** Enable automatic drift correction */
    enableDriftCorrection: boolean;
    
    /** Drift correction threshold (milliseconds) */
    driftThreshold: number;
    
    /** Maximum correction per adjustment */
    maxCorrectionStep: number;
  };
}

/**
 * Default synchronization configuration
 */
const DEFAULT_SYNC_CONFIG: TimelineAudioSyncConfig = {
  syncTolerance: 50, // 50ms sync tolerance
  seekResponseTarget: 100, // 100ms seek response target
  predictiveLoading: true,
  bufferAheadTime: 2000, // 2 seconds ahead
  maxConcurrentChunks: 5,
  quality: {
    sampleRate: 22050,
    bitDepth: 16,
    highPrecisionTiming: true,
  },
  performance: {
    enableCompression: true,
    memoryCleanupInterval: 30000, // 30 seconds
    maxCacheSize: 50 * 1024 * 1024, // 50MB
  },
  correction: {
    enableDriftCorrection: true,
    driftThreshold: 100, // 100ms drift before correction
    maxCorrectionStep: 25, // 25ms max correction per step
  },
};

/**
 * Audio synchronization metrics
 */
export interface AudioSyncMetrics {
  /** Current synchronization state */
  syncState: AudioSyncState;
  
  /** Current sync offset (milliseconds) */
  currentOffset: number;
  
  /** Average sync accuracy over time */
  averageAccuracy: number;
  
  /** Number of sync corrections applied */
  correctionsApplied: number;
  
  /** Audio seek times */
  seekPerformance: {
    /** Average seek time */
    averageSeekTime: number;
    
    /** Last seek time */
    lastSeekTime: number;
    
    /** Seeks within target time */
    seeksWithinTarget: number;
    
    /** Total seeks performed */
    totalSeeks: number;
  };
  
  /** Memory and performance metrics */
  resourceUsage: {
    /** Current audio memory usage */
    audioMemoryUsage: number;
    
    /** Active audio chunks */
    activeChunks: number;
    
    /** Cached chunks */
    cachedChunks: number;
  };
}

/**
 * Main Timeline Audio Synchronization Engine
 */
export class TimelineAudioSync {
  private config: TimelineAudioSyncConfig;
  private timelinePosition = 0;
  private audioChunks = new Map<string, TimelineAudioChunk>();
  private activeChunks = new Set<string>();
  private eventHandlers = new Map<string, Array<(data: any) => void>>();
  
  // Timing and synchronization
  private lastSyncCheck = 0;
  private syncOffsetHistory: number[] = [];
  private playbackStartTime = 0;
  private realStartTime = 0;
  private currentPlaybackSpeed = 1.0;
  
  // Performance and metrics
  private metrics: AudioSyncMetrics;
  private seekTimes: number[] = [];
  private syncCheckTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  
  // Audio context and processing
  private audioContext?: AudioContext;
  private audioNodes = new Map<string, AudioNode>();

  constructor(config: Partial<TimelineAudioSyncConfig> = {}) {
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
    
    this.metrics = this.createInitialMetrics();
    
    // Initialize audio context for high-precision timing if supported
    if (this.config.quality.highPrecisionTiming) {
      this.initializeAudioContext();
    }
    
    // Start background services
    this.startBackgroundServices();
    
    logger.info('TimelineAudioSync initialized', {
      config: this.config,
      highPrecisionTiming: !!this.audioContext,
    });
  }

  /**
   * Load timeline events with audio cues
   */
  loadAudioEvents(events: TimelineEvent[]): void {
    logger.debug('Loading audio events', { eventCount: events.length });
    
    try {
      // Filter events with audio content
      const audioEvents = events.filter(event => 
        event.type === 'narration' && 
        typeof event.content === 'object' && 
        event.content.audio
      );
      
      logger.debug('Processing audio events', { audioEventCount: audioEvents.length });
      
      // Convert to timeline audio chunks
      for (const event of audioEvents) {
        const audioChunk = this.createTimelineAudioChunk(event);
        this.audioChunks.set(audioChunk.id, audioChunk);
      }
      
      // Start predictive loading if enabled
      if (this.config.predictiveLoading) {
        this.startPredictiveLoading();
      }
      
      this.emit('audioEventsLoaded', {
        totalEvents: events.length,
        audioEvents: audioEvents.length,
        chunks: this.audioChunks.size,
      });
      
      logger.debug('Audio events loaded successfully', {
        totalChunks: this.audioChunks.size,
        predictiveLoading: this.config.predictiveLoading,
      });

    } catch (error) {
      logger.error('Error loading audio events', { error });
      throw error;
    }
  }

  /**
   * Synchronize audio with timeline position
   */
  syncToPosition(timelinePosition: number, playbackSpeed = 1.0): AudioTimelinePosition {
    this.timelinePosition = timelinePosition;
    this.currentPlaybackSpeed = playbackSpeed;
    
    const syncStartTime = performance.now();
    
    try {
      // Get chunks that should be active at this position
      const targetChunks = this.getChunksAtPosition(timelinePosition);
      
      // Update active chunks
      this.updateActiveChunks(targetChunks);
      
      // Calculate current synchronization state
      const syncPosition = this.calculateSyncPosition();
      
      // Apply drift correction if needed
      if (this.config.correction.enableDriftCorrection) {
        this.applyDriftCorrection(syncPosition);
      }
      
      this.emit('positionSynced', {
        position: timelinePosition,
        syncPosition,
        activeChunks: targetChunks.length,
      });
      
      return syncPosition;

    } catch (error) {
      logger.error('Error syncing to position', { position: timelinePosition, error });
      
      return {
        timelinePosition,
        audioPosition: timelinePosition,
        syncOffset: 0,
        state: 'error',
        confidence: 0,
      };
    }
  }

  /**
   * Seek audio to specific timeline position
   */
  async seekToPosition(targetPosition: number): Promise<AudioSeekInfo> {
    const seekStartTime = performance.now();
    
    logger.debug('Seeking audio to position', { 
      from: this.timelinePosition, 
      to: targetPosition 
    });
    
    try {
      // Stop current playback
      this.stopActiveAudio();
      
      // Calculate seek information
      const seekInfo: AudioSeekInfo = {
        targetPosition,
        activeEvents: [], // Would be populated by timeline system
        activeChunks: this.getChunksAtPosition(targetPosition),
        seekStartTime,
        audioSeekPositions: [],
      };
      
      // Seek each relevant audio chunk
      for (const chunk of seekInfo.activeChunks) {
        const chunkSeekPosition = this.calculateChunkSeekPosition(chunk, targetPosition);
        
        if (chunk.audioElement) {
          await this.seekAudioElement(chunk.audioElement, chunkSeekPosition);
        }
        
        seekInfo.audioSeekPositions.push({
          chunkId: chunk.id,
          seekPosition: chunkSeekPosition,
        });
      }
      
      // Update timeline position
      this.timelinePosition = targetPosition;
      
      // Record seek performance
      const seekTime = performance.now() - seekStartTime;
      this.recordSeekTime(seekTime);
      
      this.emit('audioSeeked', {
        targetPosition,
        seekTime,
        activeChunks: seekInfo.activeChunks.length,
      });
      
      logger.debug('Audio seek completed', {
        targetPosition,
        seekTime,
        activeChunks: seekInfo.activeChunks.length,
        withinTarget: seekTime <= this.config.seekResponseTarget,
      });
      
      return seekInfo;

    } catch (error) {
      logger.error('Error seeking audio', { targetPosition, error });
      throw error;
    }
  }

  /**
   * Start audio playback synchronized with timeline
   */
  async startSyncedPlayback(startPosition: number, playbackSpeed = 1.0): Promise<void> {
    logger.debug('Starting synced audio playback', { 
      startPosition, 
      playbackSpeed 
    });
    
    try {
      // Initialize playback timing
      this.playbackStartTime = startPosition;
      this.realStartTime = this.getHighPrecisionTime();
      this.currentPlaybackSpeed = playbackSpeed;
      
      // Get initial active chunks
      const activeChunks = this.getChunksAtPosition(startPosition);
      
      // Start audio for active chunks
      for (const chunk of activeChunks) {
        await this.startChunkPlayback(chunk, startPosition, playbackSpeed);
      }
      
      // Start synchronization monitoring
      this.startSyncMonitoring();
      
      this.emit('syncedPlaybackStarted', {
        startPosition,
        playbackSpeed,
        activeChunks: activeChunks.length,
      });

    } catch (error) {
      logger.error('Error starting synced playback', { startPosition, error });
      throw error;
    }
  }

  /**
   * Pause synced audio playback
   */
  pauseSyncedPlayback(): void {
    logger.debug('Pausing synced audio playback');
    
    try {
      // Pause all active audio
      for (const chunkId of this.activeChunks) {
        const chunk = this.audioChunks.get(chunkId);
        if (chunk?.audioElement) {
          chunk.audioElement.pause();
          chunk.isPlaying = false;
        }
      }
      
      // Stop sync monitoring
      this.stopSyncMonitoring();
      
      this.emit('syncedPlaybackPaused', {
        position: this.timelinePosition,
        activeChunks: this.activeChunks.size,
      });

    } catch (error) {
      logger.error('Error pausing synced playback', { error });
      throw error;
    }
  }

  /**
   * Stop all audio playback
   */
  stopSyncedPlayback(): void {
    logger.debug('Stopping synced audio playback');
    
    try {
      this.stopActiveAudio();
      this.stopSyncMonitoring();
      
      // Reset state
      this.timelinePosition = 0;
      this.activeChunks.clear();
      
      this.emit('syncedPlaybackStopped', {});

    } catch (error) {
      logger.error('Error stopping synced playback', { error });
      throw error;
    }
  }

  /**
   * Set playback speed for all audio
   */
  setPlaybackSpeed(speed: number): void {
    if (speed <= 0 || speed > 4) {
      throw new Error('Playback speed must be between 0 and 4');
    }
    
    logger.debug('Setting audio playback speed', { 
      from: this.currentPlaybackSpeed, 
      to: speed 
    });
    
    this.currentPlaybackSpeed = speed;
    
    // Update speed for all active audio elements
    for (const chunkId of this.activeChunks) {
      const chunk = this.audioChunks.get(chunkId);
      if (chunk?.audioElement) {
        chunk.audioElement.playbackRate = speed;
        chunk.voiceSettings.speed = speed;
      }
    }
    
    this.emit('playbackSpeedChanged', { speed });
  }

  /**
   * Get current synchronization metrics
   */
  getMetrics(): AudioSyncMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get current audio position information
   */
  getCurrentPosition(): AudioTimelinePosition {
    return this.calculateSyncPosition();
  }
  
  /**
   * Recalibrate timeline events when actual TTS durations are available
   * This method adjusts timeline positions to prevent overlaps and gaps
   */
  recalibrateTimelineWithMeasuredDurations(): void {
    logger.debug('Recalibrating timeline with measured audio durations');
    
    const chunks = Array.from(this.audioChunks.values())
      .sort((a, b) => a.timelineStart - b.timelineStart);
    
    let currentTime = 0;
    const adjustments: Array<{chunkId: string, oldStart: number, newStart: number, oldDuration: number, newDuration: number}> = [];
    
    for (const chunk of chunks) {
      const originalStart = chunk.timelineStart;
      const originalDuration = chunk.timelineDuration;
      
      // Update timeline start to prevent overlaps
      chunk.timelineStart = Math.max(chunk.timelineStart, currentTime);
      
      // Use measured audio duration if significantly different from estimated
      const durationDifference = Math.abs(chunk.audioDuration - chunk.timelineDuration);
      const significantDifference = durationDifference > chunk.timelineDuration * 0.2; // 20% threshold
      
      if (significantDifference) {
        chunk.timelineDuration = chunk.audioDuration;
      }
      
      // Record adjustment
      if (chunk.timelineStart !== originalStart || chunk.timelineDuration !== originalDuration) {
        adjustments.push({
          chunkId: chunk.id,
          oldStart: originalStart,
          newStart: chunk.timelineStart,
          oldDuration: originalDuration,
          newDuration: chunk.timelineDuration
        });
      }
      
      // Update current time for next chunk
      currentTime = chunk.timelineStart + chunk.timelineDuration;
    }
    
    if (adjustments.length > 0) {
      logger.info('Timeline recalibrated with measured durations', {
        adjustments: adjustments.length,
        totalAdjustedTime: currentTime
      });
      
      this.emit('timelineRecalibrated', {
        adjustments,
        totalDuration: currentTime
      });
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
    logger.debug('Shutting down TimelineAudioSync');
    
    this.stopSyncedPlayback();
    this.stopBackgroundServices();
    
    // Cleanup audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = undefined;
    }
    
    // Clear all data
    this.audioChunks.clear();
    this.activeChunks.clear();
    this.eventHandlers.clear();
    
    logger.debug('TimelineAudioSync shutdown complete');
  }

  // ========== Private Methods ==========

  /**
   * Create timeline audio chunk from event
   */
  private createTimelineAudioChunk(event: TimelineEvent): TimelineAudioChunk {
    const audio = (event.content as any).audio as AudioCue;
    
    return {
      id: `audio_${event.id}`,
      eventId: event.id,
      text: audio.text,
      timelineStart: event.timestamp,
      timelineDuration: event.duration,
      audioDuration: this.estimateAudioDuration(audio.text, audio.speed || 1.0, audio.voice),
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
    };
  }

  /**
   * Get audio chunks active at specific position
   */
  private getChunksAtPosition(position: number): TimelineAudioChunk[] {
    return Array.from(this.audioChunks.values()).filter(chunk => {
      const chunkStart = chunk.timelineStart;
      const chunkEnd = chunk.timelineStart + chunk.timelineDuration;
      return position >= chunkStart && position <= chunkEnd;
    });
  }

  /**
   * Update active chunks based on timeline position
   */
  private updateActiveChunks(targetChunks: TimelineAudioChunk[]): void {
    const targetIds = new Set(targetChunks.map(chunk => chunk.id));
    
    // Stop chunks that are no longer active
    for (const activeId of this.activeChunks) {
      if (!targetIds.has(activeId)) {
        const chunk = this.audioChunks.get(activeId);
        if (chunk?.audioElement) {
          chunk.audioElement.pause();
          chunk.isPlaying = false;
        }
        this.activeChunks.delete(activeId);
      }
    }
    
    // Start new chunks
    for (const chunk of targetChunks) {
      if (!this.activeChunks.has(chunk.id)) {
        this.activeChunks.add(chunk.id);
      }
    }
  }

  /**
   * Calculate current synchronization position
   */
  private calculateSyncPosition(): AudioTimelinePosition {
    const currentTime = this.getHighPrecisionTime();
    
    // Calculate expected audio position based on timeline
    let audioPosition = 0;
    let syncOffset = 0;
    let confidence = 1.0;
    let state: AudioSyncState = 'synced';
    
    // Get current active audio element for timing reference
    const activeChunk = this.getTimingReferenceChunk();
    
    if (activeChunk?.audioElement) {
      audioPosition = (activeChunk.audioElement.currentTime * 1000) + activeChunk.timelineStart;
      syncOffset = audioPosition - this.timelinePosition;
      
      // Determine sync state based on offset
      if (Math.abs(syncOffset) <= this.config.syncTolerance) {
        state = 'synced';
        confidence = Math.max(0, 1 - Math.abs(syncOffset) / this.config.syncTolerance);
      } else if (syncOffset > 0) {
        state = 'leading';
        confidence = Math.max(0.3, 1 - Math.abs(syncOffset) / (this.config.syncTolerance * 3));
      } else {
        state = 'lagging';
        confidence = Math.max(0.3, 1 - Math.abs(syncOffset) / (this.config.syncTolerance * 3));
      }
    } else {
      // No active audio reference, use timeline position
      audioPosition = this.timelinePosition;
      syncOffset = 0;
      confidence = 0.5;
    }
    
    return {
      timelinePosition: this.timelinePosition,
      audioPosition,
      syncOffset,
      state,
      confidence,
    };
  }

  /**
   * Get the primary chunk for timing reference
   */
  private getTimingReferenceChunk(): TimelineAudioChunk | undefined {
    // Use the chunk with the longest remaining duration
    let bestChunk: TimelineAudioChunk | undefined;
    let maxRemainingDuration = 0;
    
    for (const chunkId of this.activeChunks) {
      const chunk = this.audioChunks.get(chunkId);
      if (chunk?.audioElement?.currentTime !== undefined) {
        const remainingDuration = chunk.audioDuration - (chunk.audioElement.currentTime * 1000);
        if (remainingDuration > maxRemainingDuration) {
          maxRemainingDuration = remainingDuration;
          bestChunk = chunk;
        }
      }
    }
    
    return bestChunk;
  }

  /**
   * Apply drift correction to maintain synchronization
   */
  private applyDriftCorrection(syncPosition: AudioTimelinePosition): void {
    if (!this.config.correction.enableDriftCorrection) return;
    
    const { syncOffset, state } = syncPosition;
    
    // Only correct if drift exceeds threshold
    if (Math.abs(syncOffset) <= this.config.correction.driftThreshold) return;
    
    logger.debug('Applying drift correction', { 
      offset: syncOffset, 
      state 
    });
    
    // Calculate correction amount
    const maxCorrection = this.config.correction.maxCorrectionStep;
    const correctionAmount = Math.sign(syncOffset) * Math.min(Math.abs(syncOffset), maxCorrection);
    
    // Apply correction to active audio elements
    for (const chunkId of this.activeChunks) {
      const chunk = this.audioChunks.get(chunkId);
      if (chunk?.audioElement) {
        const currentTime = chunk.audioElement.currentTime;
        const newTime = Math.max(0, currentTime - (correctionAmount / 1000));
        chunk.audioElement.currentTime = newTime;
        
        // Record correction
        chunk.syncMetadata.timingAdjustments.push(correctionAmount);
        if (chunk.syncMetadata.timingAdjustments.length > 10) {
          chunk.syncMetadata.timingAdjustments.shift();
        }
      }
    }
    
    // Update metrics
    this.metrics.correctionsApplied++;
  }

  /**
   * Calculate seek position within an audio chunk
   */
  private calculateChunkSeekPosition(chunk: TimelineAudioChunk, targetPosition: number): number {
    const chunkOffset = targetPosition - chunk.timelineStart;
    const chunkProgress = chunkOffset / chunk.timelineDuration;
    return Math.max(0, Math.min(chunkProgress * chunk.audioDuration / 1000, chunk.audioDuration / 1000));
  }

  /**
   * Seek audio element to specific time
   */
  private async seekAudioElement(audioElement: HTMLAudioElement, seekTime: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Audio seek timeout'));
      }, 1000);
      
      const handleSeeked = () => {
        clearTimeout(timeoutId);
        audioElement.removeEventListener('seeked', handleSeeked);
        audioElement.removeEventListener('error', handleError);
        resolve();
      };
      
      const handleError = () => {
        clearTimeout(timeoutId);
        audioElement.removeEventListener('seeked', handleSeeked);
        audioElement.removeEventListener('error', handleError);
        reject(new Error('Audio seek failed'));
      };
      
      audioElement.addEventListener('seeked', handleSeeked);
      audioElement.addEventListener('error', handleError);
      
      audioElement.currentTime = seekTime;
    });
  }

  /**
   * Start playback for a specific chunk
   */
  private async startChunkPlayback(
    chunk: TimelineAudioChunk, 
    startPosition: number, 
    playbackSpeed: number
  ): Promise<void> {
    if (!chunk.audioElement || !chunk.isLoaded) {
      // Audio not ready, skip for now
      return;
    }
    
    try {
      // Calculate playback start position within the chunk
      const chunkSeekPosition = this.calculateChunkSeekPosition(chunk, startPosition);
      
      // Set audio properties
      chunk.audioElement.playbackRate = playbackSpeed;
      chunk.audioElement.volume = chunk.voiceSettings.volume;
      chunk.audioElement.currentTime = chunkSeekPosition;
      
      // Start playback
      await chunk.audioElement.play();
      chunk.isPlaying = true;
      
    } catch (error) {
      logger.error('Error starting chunk playback', { chunkId: chunk.id, error });
    }
  }

  /**
   * Stop all active audio
   */
  private stopActiveAudio(): void {
    for (const chunkId of this.activeChunks) {
      const chunk = this.audioChunks.get(chunkId);
      if (chunk?.audioElement) {
        chunk.audioElement.pause();
        chunk.audioElement.currentTime = 0;
        chunk.isPlaying = false;
      }
    }
    this.activeChunks.clear();
  }

  /**
   * Start synchronization monitoring
   */
  private startSyncMonitoring(): void {
    if (this.syncCheckTimer) return;
    
    this.syncCheckTimer = setInterval(() => {
      const syncPosition = this.calculateSyncPosition();
      
      // Apply drift correction if enabled
      if (this.config.correction.enableDriftCorrection) {
        this.applyDriftCorrection(syncPosition);
      }
      
      // Update metrics
      this.recordSyncOffset(syncPosition.syncOffset);
      
    }, 100); // Check every 100ms
  }

  /**
   * Stop synchronization monitoring
   */
  private stopSyncMonitoring(): void {
    if (this.syncCheckTimer) {
      clearInterval(this.syncCheckTimer);
      this.syncCheckTimer = undefined;
    }
  }

  /**
   * Start predictive audio loading
   */
  private startPredictiveLoading(): void {
    // This would integrate with existing TTS system to pre-load audio
    logger.debug('Predictive audio loading started');
  }

  /**
   * Initialize audio context for high-precision timing
   */
  private initializeAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      logger.debug('Audio context initialized for high-precision timing');
    } catch (error) {
      logger.warn('Failed to initialize audio context', { error });
    }
  }

  /**
   * Get high-precision time
   */
  private getHighPrecisionTime(): number {
    return this.audioContext ? this.audioContext.currentTime * 1000 : performance.now();
  }

  /**
   * Estimate audio duration from text using TTS calibration when available
   */
  private estimateAudioDuration(text: string, speed: number, voice?: string): number {
    // Try to use TTS service calibration if available
    try {
      // This would integrate with the TTS service calibration system
      // For now, use improved estimation with voice-specific adjustments
      const baseWordsPerMinute = this.getVoiceSpecificRate(voice) * speed;
      const wordCount = text.trim().split(/\s+/).length;
      
      if (wordCount === 0) {
        return Math.max(text.length * 50, 1000); // 50ms per character, min 1 second
      }
      
      const baseDuration = (wordCount / baseWordsPerMinute) * 60 * 1000;
      
      // Add buffer for natural speech patterns
      const bufferFactor = 1.25; // 25% buffer for pauses and natural speech
      
      return Math.max(baseDuration * bufferFactor, 1000); // Minimum 1 second
    } catch (error) {
      logger.warn('TTS calibration unavailable, using fallback estimation', { error });
      
      // Fallback to basic estimation
      const wordsPerMinute = 150 * speed;
      const wordCount = text.trim().split(/\s+/).length;
      return Math.max((wordCount / wordsPerMinute) * 60 * 1000, 1000);
    }
  }
  
  /**
   * Get voice-specific speaking rate (words per minute)
   * This integrates with the TTS calibration system
   */
  private getVoiceSpecificRate(voice?: string): number {
    // Default rates based on common voice characteristics
    const voiceRates: Record<string, number> = {
      'en_US-lessac-medium': 145,
      'en_US-ryan-medium': 155,
      'en_US-jenny-medium': 140,
      'en_US-danny-medium': 150,
    };
    
    return voice && voiceRates[voice] ? voiceRates[voice] : 150;
  }
  
  /**
   * Update audio chunk with measured duration from TTS
   * This should be called when actual TTS audio is generated
   */
  updateChunkWithMeasuredDuration(chunkId: string, measuredDuration: number): void {
    const chunk = this.audioChunks.get(chunkId);
    if (chunk) {
      const previousDuration = chunk.audioDuration;
      chunk.audioDuration = measuredDuration;
      
      // Update sync metadata with accuracy measurement
      const accuracy = Math.min(1.0, previousDuration / measuredDuration);
      chunk.syncMetadata.measuredAccuracy = accuracy;
      
      logger.debug('Updated chunk with measured duration', {
        chunkId,
        estimatedDuration: previousDuration,
        measuredDuration,
        accuracy
      });
      
      this.emit('chunkDurationUpdated', {
        chunkId,
        previousDuration,
        measuredDuration,
        accuracy
      });
      
      // Trigger timeline recalibration if this was a significant change
      const durationChange = Math.abs(previousDuration - measuredDuration) / previousDuration;
      if (durationChange > 0.15) { // 15% change threshold
        setTimeout(() => this.recalibrateTimelineWithMeasuredDurations(), 100);
      }
    }
  }

  /**
   * Record seek time for metrics
   */
  private recordSeekTime(seekTime: number): void {
    this.seekTimes.push(seekTime);
    if (this.seekTimes.length > 20) {
      this.seekTimes.shift();
    }
  }

  /**
   * Record sync offset for metrics
   */
  private recordSyncOffset(offset: number): void {
    this.syncOffsetHistory.push(offset);
    if (this.syncOffsetHistory.length > 100) {
      this.syncOffsetHistory.shift();
    }
  }

  /**
   * Create initial metrics object
   */
  private createInitialMetrics(): AudioSyncMetrics {
    return {
      syncState: 'synced',
      currentOffset: 0,
      averageAccuracy: 1.0,
      correctionsApplied: 0,
      seekPerformance: {
        averageSeekTime: 0,
        lastSeekTime: 0,
        seeksWithinTarget: 0,
        totalSeeks: 0,
      },
      resourceUsage: {
        audioMemoryUsage: 0,
        activeChunks: 0,
        cachedChunks: 0,
      },
    };
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    const currentPosition = this.calculateSyncPosition();
    
    // Update sync metrics
    this.metrics.syncState = currentPosition.state;
    this.metrics.currentOffset = currentPosition.syncOffset;
    
    // Calculate average accuracy
    if (this.syncOffsetHistory.length > 0) {
      const avgOffset = this.syncOffsetHistory.reduce((sum, offset) => sum + Math.abs(offset), 0) / this.syncOffsetHistory.length;
      this.metrics.averageAccuracy = Math.max(0, 1 - avgOffset / this.config.syncTolerance);
    }
    
    // Update seek performance
    if (this.seekTimes.length > 0) {
      this.metrics.seekPerformance.averageSeekTime = this.seekTimes.reduce((sum, time) => sum + time, 0) / this.seekTimes.length;
      this.metrics.seekPerformance.lastSeekTime = this.seekTimes[this.seekTimes.length - 1];
      this.metrics.seekPerformance.seeksWithinTarget = this.seekTimes.filter(time => time <= this.config.seekResponseTarget).length;
      this.metrics.seekPerformance.totalSeeks = this.seekTimes.length;
    }
    
    // Update resource usage
    this.metrics.resourceUsage.activeChunks = this.activeChunks.size;
    this.metrics.resourceUsage.cachedChunks = this.audioChunks.size;
    this.metrics.resourceUsage.audioMemoryUsage = this.estimateMemoryUsage();
  }

  /**
   * Estimate current memory usage
   */
  private estimateMemoryUsage(): number {
    let totalMemory = 0;
    
    for (const chunk of this.audioChunks.values()) {
      if (chunk.audioData) {
        if (typeof chunk.audioData === 'string') {
          totalMemory += chunk.audioData.length * 2; // UTF-16
        } else {
          totalMemory += chunk.audioData.byteLength;
        }
      }
      
      // Estimate for text and metadata
      totalMemory += chunk.text.length * 2;
      totalMemory += 1024; // Metadata overhead
    }
    
    return totalMemory;
  }

  /**
   * Start background services
   */
  private startBackgroundServices(): void {
    // Memory cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.performMemoryCleanup();
    }, this.config.performance.memoryCleanupInterval);
  }

  /**
   * Stop background services
   */
  private stopBackgroundServices(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    this.stopSyncMonitoring();
  }

  /**
   * Perform memory cleanup
   */
  private performMemoryCleanup(): void {
    const currentMemory = this.estimateMemoryUsage();
    
    if (currentMemory > this.config.performance.maxCacheSize) {
      logger.debug('Performing memory cleanup', { currentMemory, maxSize: this.config.performance.maxCacheSize });
      
      // Remove oldest inactive chunks
      const inactiveChunks = Array.from(this.audioChunks.values())
        .filter(chunk => !this.activeChunks.has(chunk.id))
        .sort((a, b) => a.timelineStart - b.timelineStart);
      
      const chunksToRemove = Math.ceil(inactiveChunks.length * 0.3); // Remove 30% of inactive chunks
      
      for (let i = 0; i < chunksToRemove && i < inactiveChunks.length; i++) {
        const chunk = inactiveChunks[i];
        this.audioChunks.delete(chunk.id);
      }
      
      logger.debug('Memory cleanup completed', { chunksRemoved: chunksToRemove });
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

export default TimelineAudioSync;