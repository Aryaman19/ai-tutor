/**
 * Streaming Playback Controller
 * 
 * Coordinates progressive playback with seamless transitions between
 * buffered and unbuffered content, handling automatic pause/resume
 * based on buffer availability.
 */

import type {
  StreamingTimelineChunk,
  TimelineEvent,
} from '@ai-tutor/types';

import { ProgressiveBufferManager, type BufferRegion, type PlaybackReadiness } from './progressive-buffer-manager';
import { ChunkCoordinator } from './chunk-coordinator';
import { createUtilLogger } from '../logger';

const logger = createUtilLogger('StreamingPlaybackController');

/**
 * Playback state
 */
export type PlaybackState = 
  | 'stopped'      // Not playing, position at 0
  | 'paused'       // Paused by user
  | 'playing'      // Active playback
  | 'buffering'    // Temporarily paused due to buffer underrun
  | 'seeking'      // Seeking to new position
  | 'loading'      // Initial loading state
  | 'error';       // Error state

/**
 * Buffering strategy
 */
export interface BufferingStrategy {
  /** Auto-pause when buffer runs low */
  autoPauseOnUnderrun: boolean;
  
  /** Auto-resume when buffer is sufficient */
  autoResumeOnBuffer: boolean;
  
  /** Show buffering indicator during underruns */
  showBufferingIndicator: boolean;
  
  /** Maximum time to wait for buffer before showing loading */
  maxBufferWaitTime: number;
  
  /** Minimum buffer to resume after underrun */
  resumeBufferThreshold: number;
}

/**
 * Playback events
 */
export interface PlaybackEvents {
  /** Playback state changed */
  'stateChanged': { 
    oldState: PlaybackState; 
    newState: PlaybackState; 
    reason?: string; 
  };
  
  /** Position changed */
  'positionChanged': { 
    position: number; 
    duration: number; 
    bufferedRanges: BufferRegion[]; 
  };
  
  /** Started buffering */
  'bufferingStarted': { 
    position: number; 
    reason: 'underrun' | 'seek' | 'initial'; 
  };
  
  /** Finished buffering */
  'bufferingEnded': { 
    position: number; 
    bufferLevel: number; 
  };
  
  /** Seeking started */
  'seekStarted': { 
    fromPosition: number; 
    toPosition: number; 
  };
  
  /** Seeking completed */
  'seekCompleted': { 
    position: number; 
    wasImmediate: boolean; 
    loadingTime?: number; 
  };
  
  /** Error occurred */
  'error': { 
    error: Error; 
    position: number; 
    recoverable: boolean; 
  };
  
  /** Ready to play (enough buffer available) */
  'readyToPlay': { 
    position: number; 
    bufferLevel: number; 
  };
}

/**
 * Controller configuration
 */
export interface StreamingControllerConfig {
  /** Buffering strategy settings */
  bufferingStrategy: BufferingStrategy;
  
  /** Position update interval (milliseconds) */
  positionUpdateInterval: number;
  
  /** Enable automatic quality adaptation */
  enableQualityAdaptation: boolean;
  
  /** Performance monitoring */
  monitoring: {
    /** Track playback metrics */
    enableMetrics: boolean;
    
    /** Metrics update interval */
    metricsInterval: number;
  };
}

/**
 * Default controller configuration
 */
const DEFAULT_STREAMING_CONFIG: StreamingControllerConfig = {
  bufferingStrategy: {
    autoPauseOnUnderrun: true,
    autoResumeOnBuffer: true,
    showBufferingIndicator: true,
    maxBufferWaitTime: 5000, // 5 seconds
    resumeBufferThreshold: 3000, // 3 seconds
  },
  positionUpdateInterval: 100, // 100ms for smooth updates
  enableQualityAdaptation: true,
  monitoring: {
    enableMetrics: true,
    metricsInterval: 1000, // 1 second
  },
};

/**
 * Playback metrics
 */
export interface PlaybackMetrics {
  /** Total play time */
  totalPlayTime: number;
  
  /** Total buffer underruns */
  bufferUnderruns: number;
  
  /** Average buffer level */
  averageBufferLevel: number;
  
  /** Seek count */
  seekCount: number;
  
  /** Average seek time */
  averageSeekTime: number;
  
  /** Time spent buffering */
  bufferingTime: number;
  
  /** Playback efficiency (play time / total time) */
  playbackEfficiency: number;
}

/**
 * Streaming Playback Controller
 * Handles YouTube-style progressive playback with intelligent buffering
 */
export class StreamingPlaybackController {
  private config: StreamingControllerConfig;
  private bufferManager: ProgressiveBufferManager;
  private chunkCoordinator: ChunkCoordinator;
  private eventHandlers = new Map<string, Array<(data: any) => void>>();
  
  // Playback state
  private playbackState: PlaybackState = 'stopped';
  private currentPosition = 0;
  private totalDuration = 0;
  private isUserPaused = false;
  
  // Timers
  private positionTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private bufferCheckTimer?: NodeJS.Timeout;
  
  // Metrics
  private metrics: PlaybackMetrics = {
    totalPlayTime: 0,
    bufferUnderruns: 0,
    averageBufferLevel: 0,
    seekCount: 0,
    averageSeekTime: 0,
    bufferingTime: 0,
    playbackEfficiency: 0,
  };
  
  private metricsStartTime = 0;
  private lastMetricsUpdate = 0;
  private bufferingStartTime = 0;

  constructor(
    bufferManager: ProgressiveBufferManager,
    chunkCoordinator: ChunkCoordinator,
    config: Partial<StreamingControllerConfig> = {}
  ) {
    this.config = { ...DEFAULT_STREAMING_CONFIG, ...config };
    this.bufferManager = bufferManager;
    this.chunkCoordinator = chunkCoordinator;
    
    this.setupBufferManagerEvents();
    this.setupChunkCoordinatorEvents();
    this.startMonitoring();
    
    logger.info('Streaming Playback Controller initialized', {
      autoPause: this.config.bufferingStrategy.autoPauseOnUnderrun,
      autoResume: this.config.bufferingStrategy.autoResumeOnBuffer,
      positionUpdateInterval: this.config.positionUpdateInterval,
    });
  }

  /**
   * Start playback (YouTube-style - starts as soon as possible)
   */
  async play(): Promise<boolean> {
    logger.debug('Play requested', { 
      currentState: this.playbackState,
      position: this.currentPosition,
    });

    // If user had paused, clear that flag
    this.isUserPaused = false;

    // Check if we can start playing immediately
    const readiness = this.bufferManager.getPlaybackReadiness(this.currentPosition);
    
    if (readiness.canStart) {
      // Immediate playback
      this.changeState('playing', 'sufficient_buffer');
      this.startPositionTracking();
      return true;
    } else {
      // Need to wait for buffer
      this.changeState('buffering', readiness.reason);
      this.emit('bufferingStarted', {
        position: this.currentPosition,
        reason: 'initial',
      });
      
      // Wait for buffer or timeout
      const startTime = Date.now();
      const maxWaitTime = this.config.bufferingStrategy.maxBufferWaitTime;
      
      return new Promise((resolve) => {
        const checkBuffer = () => {
          const currentReadiness = this.bufferManager.getPlaybackReadiness(this.currentPosition);
          
          if (currentReadiness.canStart) {
            this.changeState('playing', 'buffer_ready');
            this.startPositionTracking();
            this.emit('bufferingEnded', {
              position: this.currentPosition,
              bufferLevel: currentReadiness.bufferLevel,
            });
            resolve(true);
          } else if (Date.now() - startTime > maxWaitTime) {
            this.changeState('loading', 'buffer_timeout');
            resolve(false);
          } else {
            setTimeout(checkBuffer, 100);
          }
        };
        
        checkBuffer();
      });
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    logger.debug('Pause requested', { currentState: this.playbackState });
    
    this.isUserPaused = true;
    this.stopPositionTracking();
    
    if (this.playbackState === 'playing' || this.playbackState === 'buffering') {
      this.changeState('paused', 'user_requested');
    }
  }

  /**
   * Resume playback
   */
  async resume(): Promise<boolean> {
    logger.debug('Resume requested', { 
      currentState: this.playbackState,
      isUserPaused: this.isUserPaused,
    });
    
    if (this.playbackState !== 'paused') {
      return false;
    }
    
    return this.play();
  }

  /**
   * Stop playback and reset position
   */
  stop(): void {
    logger.debug('Stop requested', { currentState: this.playbackState });
    
    this.isUserPaused = false;
    this.stopPositionTracking();
    this.currentPosition = 0;
    this.changeState('stopped', 'user_requested');
  }

  /**
   * Seek to specific position (YouTube-style smart seeking)
   */
  async seek(position: number): Promise<boolean> {
    const clampedPosition = Math.max(0, Math.min(position, this.totalDuration));
    const fromPosition = this.currentPosition;
    
    logger.debug('Seek requested', {
      from: fromPosition,
      to: clampedPosition,
      buffered: this.bufferManager.isBuffered(clampedPosition, clampedPosition + 1000),
    });

    this.emit('seekStarted', { fromPosition, toPosition: clampedPosition });
    this.metrics.seekCount++;
    
    const seekStartTime = Date.now();
    const wasPlaying = this.playbackState === 'playing';
    
    this.changeState('seeking', 'user_requested');
    this.currentPosition = clampedPosition;
    
    // Attempt to seek
    const canSeekImmediately = await this.bufferManager.seek(clampedPosition);
    
    if (canSeekImmediately) {
      // Immediate seek to buffered region
      const seekTime = Date.now() - seekStartTime;
      this.updateSeekMetrics(seekTime);
      
      this.emit('seekCompleted', {
        position: clampedPosition,
        wasImmediate: true,
        loadingTime: seekTime,
      });
      
      // Resume previous state
      if (wasPlaying && !this.isUserPaused) {
        this.changeState('playing', 'seek_completed');
        this.startPositionTracking();
      } else {
        this.changeState('paused', 'seek_completed');
      }
      
      return true;
    } else {
      // Seeking to unbuffered region - need to load
      this.changeState('buffering', 'seek_to_unbuffered');
      this.emit('bufferingStarted', {
        position: clampedPosition,
        reason: 'seek',
      });
      
      // Wait for content to load
      const maxWaitTime = this.config.bufferingStrategy.maxBufferWaitTime;
      const startTime = Date.now();
      
      return new Promise((resolve) => {
        const checkBuffer = () => {
          const readiness = this.bufferManager.getPlaybackReadiness(clampedPosition);
          
          if (readiness.canStart) {
            const seekTime = Date.now() - seekStartTime;
            this.updateSeekMetrics(seekTime);
            
            this.emit('seekCompleted', {
              position: clampedPosition,
              wasImmediate: false,
              loadingTime: seekTime,
            });
            
            this.emit('bufferingEnded', {
              position: clampedPosition,
              bufferLevel: readiness.bufferLevel,
            });
            
            // Resume appropriate state
            if (wasPlaying && !this.isUserPaused) {
              this.changeState('playing', 'seek_buffer_ready');
              this.startPositionTracking();
            } else {
              this.changeState('paused', 'seek_buffer_ready');
            }
            
            resolve(true);
          } else if (Date.now() - startTime > maxWaitTime) {
            this.changeState('loading', 'seek_timeout');
            this.emit('error', {
              error: new Error('Seek timeout - content not available'),
              position: clampedPosition,
              recoverable: true,
            });
            resolve(false);
          } else {
            setTimeout(checkBuffer, 100);
          }
        };
        
        checkBuffer();
      });
    }
  }

  /**
   * Get current playback state
   */
  getState(): PlaybackState {
    return this.playbackState;
  }

  /**
   * Get current position
   */
  getPosition(): number {
    return this.currentPosition;
  }

  /**
   * Get total duration
   */
  getDuration(): number {
    return this.totalDuration;
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.playbackState === 'playing';
  }

  /**
   * Check if paused by user (vs auto-paused for buffering)
   */
  isPausedByUser(): boolean {
    return this.isUserPaused;
  }

  /**
   * Get buffered regions for UI visualization
   */
  getBufferedRegions(): BufferRegion[] {
    return this.bufferManager.getBufferedRegions();
  }

  /**
   * Get buffer level at current position
   */
  getCurrentBufferLevel(): number {
    return this.bufferManager.getBufferLevelAt(this.currentPosition);
  }

  /**
   * Get playback metrics
   */
  getMetrics(): PlaybackMetrics {
    this.updatePlaybackMetrics();
    return { ...this.metrics };
  }

  /**
   * Event handling
   */
  on<K extends keyof PlaybackEvents>(
    event: K,
    handler: (data: PlaybackEvents[K]) => void
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off<K extends keyof PlaybackEvents>(
    event: K,
    handler: (data: PlaybackEvents[K]) => void
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
   * Shutdown and cleanup
   */
  shutdown(): void {
    this.stopPositionTracking();
    this.stopMonitoring();
    this.eventHandlers.clear();
    
    logger.info('Streaming Playback Controller shutdown complete');
  }

  // ========== Private Methods ==========

  /**
   * Setup buffer manager event handlers
   */
  private setupBufferManagerEvents(): void {
    this.bufferManager.on('playbackReady', ({ readiness }) => {
      if (this.playbackState === 'buffering' && !this.isUserPaused) {
        this.changeState('playing', 'buffer_ready');
        this.startPositionTracking();
        this.emit('bufferingEnded', {
          position: this.currentPosition,
          bufferLevel: readiness.bufferLevel,
        });
      }
    });

    this.bufferManager.on('bufferUrgent', ({ position, bufferLevel }) => {
      if (this.playbackState === 'playing' && this.config.bufferingStrategy.autoPauseOnUnderrun) {
        this.changeState('buffering', 'buffer_underrun');
        this.stopPositionTracking();
        this.metrics.bufferUnderruns++;
        this.emit('bufferingStarted', {
          position,
          reason: 'underrun',
        });
      }
    });

    this.bufferManager.on('seekBlocked', ({ position, nearestBuffer }) => {
      logger.debug('Seek blocked - loading required', {
        position,
        nearestBufferStart: nearestBuffer?.startTime,
      });
    });
  }

  /**
   * Setup chunk coordinator event handlers
   */
  private setupChunkCoordinatorEvents(): void {
    this.chunkCoordinator.on('chunkProcessingCompleted', ({ chunkId }) => {
      // Update total duration when new chunks are processed
      const state = this.chunkCoordinator.getCoordinationState();
      this.totalDuration = state.totalDuration;
    });
  }

  /**
   * Change playback state and emit events
   */
  private changeState(newState: PlaybackState, reason?: string): void {
    const oldState = this.playbackState;
    
    if (oldState === newState) return;
    
    this.playbackState = newState;
    
    // Track buffering time
    if (oldState === 'buffering' && this.bufferingStartTime > 0) {
      this.metrics.bufferingTime += Date.now() - this.bufferingStartTime;
      this.bufferingStartTime = 0;
    }
    
    if (newState === 'buffering') {
      this.bufferingStartTime = Date.now();
    }
    
    this.emit('stateChanged', { oldState, newState, reason });
    
    logger.debug('Playback state changed', {
      from: oldState,
      to: newState,
      reason,
      position: this.currentPosition,
    });
  }

  /**
   * Start position tracking
   */
  private startPositionTracking(): void {
    if (this.positionTimer) return;
    
    this.positionTimer = setInterval(() => {
      if (this.playbackState === 'playing') {
        this.currentPosition += this.config.positionUpdateInterval;
        
        // Clamp to duration
        if (this.currentPosition >= this.totalDuration) {
          this.currentPosition = this.totalDuration;
          this.changeState('stopped', 'playback_completed');
          this.stopPositionTracking();
          return;
        }
        
        // Update buffer manager
        this.bufferManager.setPlaybackPosition(this.currentPosition);
        
        // Emit position update
        this.emit('positionChanged', {
          position: this.currentPosition,
          duration: this.totalDuration,
          bufferedRanges: this.bufferManager.getBufferedRegions(),
        });
        
        // Check for buffer underrun
        this.checkBufferHealth();
      }
    }, this.config.positionUpdateInterval);
  }

  /**
   * Stop position tracking
   */
  private stopPositionTracking(): void {
    if (this.positionTimer) {
      clearInterval(this.positionTimer);
      this.positionTimer = undefined;
    }
  }

  /**
   * Check buffer health and handle underruns
   */
  private checkBufferHealth(): void {
    if (this.playbackState !== 'playing') return;
    
    const bufferLevel = this.bufferManager.getBufferLevelAt(this.currentPosition);
    const strategy = this.config.bufferingStrategy;
    
    if (bufferLevel < 500 && strategy.autoPauseOnUnderrun) { // Less than 500ms buffer
      this.changeState('buffering', 'buffer_underrun');
      this.stopPositionTracking();
      this.metrics.bufferUnderruns++;
      this.emit('bufferingStarted', {
        position: this.currentPosition,
        reason: 'underrun',
      });
    }
  }

  /**
   * Start monitoring services
   */
  private startMonitoring(): void {
    if (this.config.monitoring.enableMetrics) {
      this.metricsStartTime = Date.now();
      this.lastMetricsUpdate = this.metricsStartTime;
      
      this.metricsTimer = setInterval(() => {
        this.updatePlaybackMetrics();
      }, this.config.monitoring.metricsInterval);
    }
  }

  /**
   * Stop monitoring services
   */
  private stopMonitoring(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }
  }

  /**
   * Update playback metrics
   */
  private updatePlaybackMetrics(): void {
    const now = Date.now();
    const deltaTime = now - this.lastMetricsUpdate;
    
    if (this.playbackState === 'playing') {
      this.metrics.totalPlayTime += deltaTime;
    }
    
    // Calculate efficiency
    const totalTime = now - this.metricsStartTime;
    this.metrics.playbackEfficiency = totalTime > 0 ? this.metrics.totalPlayTime / totalTime : 0;
    
    // Update average buffer level
    const currentBufferLevel = this.bufferManager.getBufferLevelAt(this.currentPosition);
    this.metrics.averageBufferLevel = 
      (this.metrics.averageBufferLevel + currentBufferLevel) / 2;
    
    this.lastMetricsUpdate = now;
  }

  /**
   * Update seek metrics
   */
  private updateSeekMetrics(seekTime: number): void {
    const seekCount = this.metrics.seekCount;
    this.metrics.averageSeekTime = 
      (this.metrics.averageSeekTime * (seekCount - 1) + seekTime) / seekCount;
  }

  /**
   * Emit event to handlers
   */
  private emit<K extends keyof PlaybackEvents>(
    event: K,
    data: PlaybackEvents[K]
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

export default StreamingPlaybackController;