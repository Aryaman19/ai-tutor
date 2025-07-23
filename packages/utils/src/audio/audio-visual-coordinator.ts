/**
 * Audio-Visual Coordinator - Phase 5: Audio Integration & Synchronization
 * 
 * Coordinates precise timing between audio narration and visual events.
 * Manages audio completion triggers and timeline scrubbing coordination.
 */

import type {
  TimelineEvent,
  AudioCue,
  VisualInstruction,
  TransitionInstruction,
} from '@ai-tutor/types';

import type {
  AudioTimelinePosition,
  TimelineAudioSyncConfig,
} from './timeline-audio-sync';

import type {
  StreamingAudioChunk,
  AudioProcessingMetrics,
} from './streaming-audio-processor';

import { createUtilLogger } from '../logger';

const logger = createUtilLogger('AudioVisualCoordinator');

/**
 * Coordination mode
 */
export type CoordinationMode = 'audio_driven' | 'visual_driven' | 'synchronized' | 'independent';

/**
 * Audio-visual synchronization event
 */
export interface AVSyncEvent {
  /** Event identifier */
  id: string;
  
  /** Event type */
  type: 'audio_complete' | 'visual_complete' | 'sync_point' | 'transition_trigger';
  
  /** Timeline position (milliseconds) */
  position: number;
  
  /** Associated audio chunk ID */
  audioChunkId?: string;
  
  /** Associated timeline event ID */
  timelineEventId: string;
  
  /** Timing information */
  timing: {
    /** Scheduled time */
    scheduledTime: number;
    
    /** Actual trigger time */
    actualTime: number;
    
    /** Timing accuracy (milliseconds) */
    accuracy: number;
  };
  
  /** Coordination data */
  coordination: {
    /** Coordination mode used */
    mode: CoordinationMode;
    
    /** Sync tolerance applied */
    tolerance: number;
    
    /** Compensation applied */
    compensation: number;
  };
  
  /** Result data */
  result?: any;
}

/**
 * Visual progression state
 */
export interface VisualProgressionState {
  /** Current visual event ID */
  currentVisualEvent?: string;
  
  /** Visual timeline position */
  visualPosition: number;
  
  /** Pending visual events */
  pendingVisualEvents: string[];
  
  /** Completed visual events */
  completedVisualEvents: Set<string>;
  
  /** Visual synchronization state */
  syncState: 'waiting' | 'ready' | 'progressing' | 'completed';
}

/**
 * Audio progression state
 */
export interface AudioProgressionState {
  /** Current audio chunk ID */
  currentAudioChunk?: string;
  
  /** Audio timeline position */
  audioPosition: number;
  
  /** Audio playback state */
  playbackState: 'stopped' | 'playing' | 'paused' | 'seeking';
  
  /** Active audio chunks */
  activeChunks: Set<string>;
  
  /** Audio queue */
  audioQueue: string[];
}

/**
 * Coordination metrics
 */
export interface CoordinationMetrics {
  /** Total sync events processed */
  totalSyncEvents: number;
  
  /** Successful synchronizations */
  successfulSyncs: number;
  
  /** Failed synchronizations */
  failedSyncs: number;
  
  /** Average sync accuracy */
  averageSyncAccuracy: number;
  
  /** Timing statistics */
  timingStats: {
    /** Average audio completion timing */
    averageAudioCompletionTime: number;
    
    /** Average visual completion timing */
    averageVisualCompletionTime: number;
    
    /** Sync point accuracy */
    syncPointAccuracy: number;
    
    /** Timeline scrubbing performance */
    scrubbingPerformance: {
      averageSeekTime: number;
      successfulSeeks: number;
      failedSeeks: number;
    };
  };
  
  /** Coordination mode usage */
  modeUsage: Record<CoordinationMode, number>;
  
  /** Error statistics */
  errorStats: {
    audioErrors: number;
    visualErrors: number;
    syncErrors: number;
    totalErrors: number;
  };
}

/**
 * Coordination configuration
 */
export interface CoordinationConfig {
  /** Default coordination mode */
  defaultMode: CoordinationMode;
  
  /** Audio completion delay tolerance */
  audioCompletionTolerance: number;
  
  /** Visual event trigger delay */
  visualEventDelay: number;
  
  /** Synchronization settings */
  synchronization: {
    /** Enable automatic sync correction */
    enableSyncCorrection: boolean;
    
    /** Sync correction threshold */
    syncCorrectionThreshold: number;
    
    /** Maximum sync correction */
    maxSyncCorrection: number;
  };
  
  /** Scrubbing coordination settings */
  scrubbing: {
    /** Enable audio scrubbing */
    enableAudioScrubbing: boolean;
    
    /** Scrubbing response time target */
    scrubbingResponseTarget: number;
    
    /** Audio fade during scrubbing */
    audioFadeDuration: number;
  };
  
  /** Performance settings */
  performance: {
    /** Enable predictive coordination */
    enablePredictiveCoordination: boolean;
    
    /** Event processing batch size */
    eventBatchSize: number;
    
    /** Coordination update interval */
    updateInterval: number;
  };
}

/**
 * Default coordination configuration
 */
const DEFAULT_COORDINATION_CONFIG: CoordinationConfig = {
  defaultMode: 'synchronized',
  audioCompletionTolerance: 100, // 100ms tolerance
  visualEventDelay: 50, // 50ms delay for visual events
  synchronization: {
    enableSyncCorrection: true,
    syncCorrectionThreshold: 75, // 75ms threshold
    maxSyncCorrection: 200, // 200ms max correction
  },
  scrubbing: {
    enableAudioScrubbing: true,
    scrubbingResponseTarget: 100, // 100ms response target
    audioFadeDuration: 150, // 150ms fade
  },
  performance: {
    enablePredictiveCoordination: true,
    eventBatchSize: 5,
    updateInterval: 50, // 50ms update interval
  },
};

/**
 * Main Audio-Visual Coordinator
 */
export class AudioVisualCoordinator {
  private config: CoordinationConfig;
  private syncConfig: TimelineAudioSyncConfig;
  private coordinationMode: CoordinationMode;
  private eventHandlers = new Map<string, Array<(data: any) => void>>();
  
  // State management
  private visualState: VisualProgressionState;
  private audioState: AudioProgressionState;
  private syncEvents: AVSyncEvent[] = [];
  private pendingCoordination = new Map<string, AVSyncEvent>();
  
  // Timing and performance
  private metrics: CoordinationMetrics;
  private lastSyncCheck = 0;
  private coordinationTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  
  // Event processing
  private eventProcessingQueue: Array<{ type: string; data: any; timestamp: number }> = [];
  private isProcessingEvents = false;

  constructor(
    config: Partial<CoordinationConfig> = {},
    syncConfig: TimelineAudioSyncConfig
  ) {
    this.config = { ...DEFAULT_COORDINATION_CONFIG, ...config };
    this.syncConfig = syncConfig;
    this.coordinationMode = this.config.defaultMode;
    
    this.visualState = this.createInitialVisualState();
    this.audioState = this.createInitialAudioState();
    this.metrics = this.createInitialMetrics();
    
    // Start background services
    this.startBackgroundServices();
    
    logger.info('AudioVisualCoordinator initialized', {
      config: this.config,
      defaultMode: this.coordinationMode,
    });
  }

  /**
   * Set coordination mode
   */
  setCoordinationMode(mode: CoordinationMode): void {
    logger.debug('Setting coordination mode', { from: this.coordinationMode, to: mode });
    
    this.coordinationMode = mode;
    this.metrics.modeUsage[mode]++;
    
    this.emit('coordinationModeChanged', { mode });
  }

  /**
   * Process audio completion event
   */
  handleAudioComplete(audioChunkId: string, completionTime: number): void {
    logger.debug('Audio completion received', { audioChunkId, completionTime });
    
    try {
      const syncEvent: AVSyncEvent = {
        id: `audio_complete_${audioChunkId}_${Date.now()}`,
        type: 'audio_complete',
        position: completionTime,
        audioChunkId,
        timelineEventId: this.getTimelineEventIdFromChunk(audioChunkId),
        timing: {
          scheduledTime: this.getScheduledCompletionTime(audioChunkId),
          actualTime: completionTime,
          accuracy: 0, // Will be calculated
        },
        coordination: {
          mode: this.coordinationMode,
          tolerance: this.config.audioCompletionTolerance,
          compensation: 0,
        },
      };
      
      // Calculate timing accuracy
      syncEvent.timing.accuracy = Math.abs(
        syncEvent.timing.actualTime - syncEvent.timing.scheduledTime
      );
      
      // Process based on coordination mode
      this.processAudioCompletionSync(syncEvent);
      
      // Record metrics
      this.recordSyncEvent(syncEvent);
      
      this.emit('audioCompleted', {
        audioChunkId,
        syncEvent,
        triggeredVisualEvents: this.getTriggerableVisualEvents(completionTime),
      });

    } catch (error) {
      logger.error('Error handling audio completion', { audioChunkId, error });
      this.metrics.errorStats.audioErrors++;
    }
  }

  /**
   * Process visual completion event
   */
  handleVisualComplete(eventId: string, completionTime: number): void {
    logger.debug('Visual completion received', { eventId, completionTime });
    
    try {
      this.visualState.completedVisualEvents.add(eventId);
      this.visualState.pendingVisualEvents = this.visualState.pendingVisualEvents.filter(
        id => id !== eventId
      );
      
      const syncEvent: AVSyncEvent = {
        id: `visual_complete_${eventId}_${Date.now()}`,
        type: 'visual_complete',
        position: completionTime,
        timelineEventId: eventId,
        timing: {
          scheduledTime: this.getScheduledVisualTime(eventId),
          actualTime: completionTime,
          accuracy: 0,
        },
        coordination: {
          mode: this.coordinationMode,
          tolerance: this.config.audioCompletionTolerance,
          compensation: 0,
        },
      };
      
      syncEvent.timing.accuracy = Math.abs(
        syncEvent.timing.actualTime - syncEvent.timing.scheduledTime
      );
      
      // Update visual state
      this.updateVisualProgressionState(eventId, completionTime);
      
      this.recordSyncEvent(syncEvent);
      
      this.emit('visualCompleted', { eventId, syncEvent });

    } catch (error) {
      logger.error('Error handling visual completion', { eventId, error });
      this.metrics.errorStats.visualErrors++;
    }
  }

  /**
   * Handle timeline position change (scrubbing)
   */
  handleTimelineSeek(targetPosition: number): Promise<void> {
    logger.debug('Timeline seek received', { targetPosition });
    
    const seekStartTime = performance.now();
    
    return new Promise((resolve, reject) => {
      try {
        // Handle audio scrubbing
        if (this.config.scrubbing.enableAudioScrubbing) {
          this.handleAudioScrubbing(targetPosition);
        }
        
        // Update visual state for new position
        this.updateVisualStateForPosition(targetPosition);
        
        // Update audio state for new position
        this.updateAudioStateForPosition(targetPosition);
        
        // Create sync event for seeking
        const syncEvent: AVSyncEvent = {
          id: `timeline_seek_${Date.now()}`,
          type: 'sync_point',
          position: targetPosition,
          timelineEventId: `seek_${targetPosition}`,
          timing: {
            scheduledTime: seekStartTime,
            actualTime: performance.now(),
            accuracy: performance.now() - seekStartTime,
          },
          coordination: {
            mode: this.coordinationMode,
            tolerance: this.config.scrubbing.scrubbingResponseTarget,
            compensation: 0,
          },
        };
        
        this.recordSyncEvent(syncEvent);
        
        // Check if seek completed within target
        const seekTime = performance.now() - seekStartTime;
        if (seekTime <= this.config.scrubbing.scrubbingResponseTarget) {
          this.metrics.timingStats.scrubbingPerformance.successfulSeeks++;
        } else {
          this.metrics.timingStats.scrubbingPerformance.failedSeeks++;
        }
        
        this.metrics.timingStats.scrubbingPerformance.averageSeekTime = 
          this.calculateMovingAverage(
            this.metrics.timingStats.scrubbingPerformance.averageSeekTime,
            seekTime,
            Math.max(1, this.metrics.timingStats.scrubbingPerformance.successfulSeeks + this.metrics.timingStats.scrubbingPerformance.failedSeeks)
          );
        
        this.emit('timelineSeeked', { targetPosition, seekTime, syncEvent });
        
        resolve();

      } catch (error) {
        logger.error('Error handling timeline seek', { targetPosition, error });
        this.metrics.errorStats.syncErrors++;
        reject(error);
      }
    });
  }

  /**
   * Update coordination state based on audio and visual positions
   */
  updateCoordinationState(
    audioPosition: AudioTimelinePosition,
    visualPosition: number
  ): void {
    // Update internal state
    this.audioState.audioPosition = audioPosition.audioPosition;
    this.visualState.visualPosition = visualPosition;
    
    // Check for synchronization issues
    const syncOffset = audioPosition.audioPosition - visualPosition;
    
    if (this.config.synchronization.enableSyncCorrection && 
        Math.abs(syncOffset) > this.config.synchronization.syncCorrectionThreshold) {
      
      this.applySyncCorrection(syncOffset);
    }
    
    // Update progression states
    this.updateProgressionStates(audioPosition, visualPosition);
  }

  /**
   * Get current coordination metrics
   */
  getMetrics(): CoordinationMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get current coordination state
   */
  getCoordinationState(): {
    visualState: VisualProgressionState;
    audioState: AudioProgressionState;
    coordinationMode: CoordinationMode;
    syncEvents: number;
    pendingCoordination: number;
  } {
    return {
      visualState: { ...this.visualState },
      audioState: { ...this.audioState },
      coordinationMode: this.coordinationMode,
      syncEvents: this.syncEvents.length,
      pendingCoordination: this.pendingCoordination.size,
    };
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
   * Reset coordination state
   */
  reset(): void {
    logger.debug('Resetting coordination state');
    
    this.visualState = this.createInitialVisualState();
    this.audioState = this.createInitialAudioState();
    this.syncEvents = [];
    this.pendingCoordination.clear();
    this.eventProcessingQueue = [];
    
    this.emit('coordinationReset', {});
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    logger.debug('Shutting down AudioVisualCoordinator');
    
    this.stopBackgroundServices();
    this.reset();
    this.eventHandlers.clear();
    
    logger.debug('AudioVisualCoordinator shutdown complete');
  }

  // ========== Private Methods ==========

  /**
   * Process audio completion synchronization
   */
  private processAudioCompletionSync(syncEvent: AVSyncEvent): void {
    switch (this.coordinationMode) {
      case 'audio_driven':
        // Audio drives visual progression
        this.triggerVisualProgression(syncEvent);
        break;
        
      case 'visual_driven':
        // Visual drives audio, just record completion
        this.recordAudioCompletion(syncEvent);
        break;
        
      case 'synchronized':
        // Check if visual and audio should proceed together
        this.processSynchronizedProgression(syncEvent);
        break;
        
      case 'independent':
        // No coordination needed
        this.recordAudioCompletion(syncEvent);
        break;
    }
  }

  /**
   * Trigger visual progression based on audio completion
   */
  private triggerVisualProgression(syncEvent: AVSyncEvent): void {
    const visualEventsToTrigger = this.getTriggerableVisualEvents(syncEvent.position);
    
    logger.debug('Triggering visual progression', { 
      audioEvent: syncEvent.id, 
      visualEvents: visualEventsToTrigger.length 
    });
    
    for (const eventId of visualEventsToTrigger) {
      setTimeout(() => {
        this.emit('triggerVisualEvent', {
          eventId,
          triggerTime: performance.now(),
          audioTrigger: syncEvent.audioChunkId,
          coordinationMode: this.coordinationMode,
        });
      }, this.config.visualEventDelay);
    }
  }

  /**
   * Process synchronized progression
   */
  private processSynchronizedProgression(syncEvent: AVSyncEvent): void {
    // Check if corresponding visual events are ready
    const relatedVisualEvents = this.getRelatedVisualEvents(syncEvent.timelineEventId);
    const readyVisualEvents = relatedVisualEvents.filter(eventId => 
      this.isVisualEventReady(eventId)
    );
    
    if (readyVisualEvents.length > 0 || this.canProgressWithoutVisual(syncEvent)) {
      this.triggerVisualProgression(syncEvent);
    } else {
      // Wait for visual events to be ready
      this.pendingCoordination.set(syncEvent.id, syncEvent);
    }
  }

  /**
   * Handle audio scrubbing during timeline seeking
   */
  private handleAudioScrubbing(targetPosition: number): void {
    logger.debug('Handling audio scrubbing', { targetPosition });
    
    // Fade out current audio
    this.fadeOutCurrentAudio();
    
    // Update audio state for new position
    this.audioState.audioPosition = targetPosition;
    
    // Determine which audio should be playing at target position
    const targetAudioChunks = this.getAudioChunksAtPosition(targetPosition);
    
    // Update active chunks
    this.audioState.activeChunks.clear();
    for (const chunkId of targetAudioChunks) {
      this.audioState.activeChunks.add(chunkId);
    }
    
    this.emit('audioScrubbingHandled', {
      targetPosition,
      activeChunks: Array.from(this.audioState.activeChunks),
    });
  }

  /**
   * Apply synchronization correction
   */
  private applySyncCorrection(syncOffset: number): void {
    const correctionAmount = Math.min(
      Math.abs(syncOffset),
      this.config.synchronization.maxSyncCorrection
    ) * Math.sign(syncOffset);
    
    logger.debug('Applying sync correction', { syncOffset, correctionAmount });
    
    if (Math.abs(correctionAmount) > 10) { // Only correct significant offsets
      this.emit('applySyncCorrection', {
        offset: syncOffset,
        correction: correctionAmount,
        mode: this.coordinationMode,
      });
    }
  }

  /**
   * Get timeline event ID from audio chunk ID
   */
  private getTimelineEventIdFromChunk(audioChunkId: string): string {
    // Extract timeline event ID from audio chunk ID
    return audioChunkId.replace('audio_', '');
  }

  /**
   * Get scheduled completion time for audio chunk
   */
  private getScheduledCompletionTime(audioChunkId: string): number {
    // This would normally come from the timeline system
    // For now, return current time as placeholder
    return performance.now();
  }

  /**
   * Get triggerable visual events at position
   */
  private getTriggerableVisualEvents(position: number): string[] {
    // This would integrate with the timeline system to get events
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Get scheduled visual time for event
   */
  private getScheduledVisualTime(eventId: string): number {
    // This would come from the timeline system
    return performance.now();
  }

  /**
   * Update visual progression state
   */
  private updateVisualProgressionState(eventId: string, completionTime: number): void {
    this.visualState.visualPosition = completionTime;
    
    // Update sync state based on pending events
    if (this.visualState.pendingVisualEvents.length === 0) {
      this.visualState.syncState = 'completed';
    } else if (this.visualState.pendingVisualEvents.length > 0) {
      this.visualState.syncState = 'progressing';
    }
  }

  /**
   * Update visual state for position
   */
  private updateVisualStateForPosition(position: number): void {
    this.visualState.visualPosition = position;
    this.visualState.currentVisualEvent = undefined; // Would be determined from timeline
    this.visualState.pendingVisualEvents = []; // Would be populated from timeline
  }

  /**
   * Update audio state for position
   */
  private updateAudioStateForPosition(position: number): void {
    this.audioState.audioPosition = position;
    this.audioState.currentAudioChunk = undefined; // Would be determined from active chunks
    this.audioState.playbackState = 'seeking';
  }

  /**
   * Update progression states
   */
  private updateProgressionStates(
    audioPosition: AudioTimelinePosition,
    visualPosition: number
  ): void {
    // Update audio state
    this.audioState.playbackState = audioPosition.state === 'synced' ? 'playing' : 'seeking';
    
    // Update visual state based on progression
    if (this.visualState.pendingVisualEvents.length > 0) {
      this.visualState.syncState = 'progressing';
    } else if (this.visualState.completedVisualEvents.size > 0) {
      this.visualState.syncState = 'completed';
    } else {
      this.visualState.syncState = 'ready';
    }
  }

  /**
   * Record audio completion
   */
  private recordAudioCompletion(syncEvent: AVSyncEvent): void {
    this.syncEvents.push(syncEvent);
    
    // Trim sync events to keep memory usage reasonable
    if (this.syncEvents.length > 100) {
      this.syncEvents = this.syncEvents.slice(-50);
    }
  }

  /**
   * Get related visual events for timeline event
   */
  private getRelatedVisualEvents(timelineEventId: string): string[] {
    // This would query the timeline system for related visual events
    return [];
  }

  /**
   * Check if visual event is ready for execution
   */
  private isVisualEventReady(eventId: string): boolean {
    // This would check with the layout engine if visual event is prepared
    return true;
  }

  /**
   * Check if progression can continue without visual events
   */
  private canProgressWithoutVisual(syncEvent: AVSyncEvent): boolean {
    // Allow progression if audio completion is significantly late
    return syncEvent.timing.accuracy > this.config.audioCompletionTolerance * 2;
  }

  /**
   * Fade out current audio for scrubbing
   */
  private fadeOutCurrentAudio(): void {
    // This would integrate with audio system to fade out current audio
    this.emit('fadeOutAudio', {
      duration: this.config.scrubbing.audioFadeDuration,
    });
  }

  /**
   * Get audio chunks at specific position
   */
  private getAudioChunksAtPosition(position: number): string[] {
    // This would query the audio system for chunks at position
    return [];
  }

  /**
   * Record sync event for metrics
   */
  private recordSyncEvent(syncEvent: AVSyncEvent): void {
    this.metrics.totalSyncEvents++;
    
    if (syncEvent.timing.accuracy <= this.config.audioCompletionTolerance) {
      this.metrics.successfulSyncs++;
    } else {
      this.metrics.failedSyncs++;
    }
    
    // Update average accuracy
    this.metrics.averageSyncAccuracy = this.calculateMovingAverage(
      this.metrics.averageSyncAccuracy,
      syncEvent.timing.accuracy,
      this.metrics.totalSyncEvents
    );
  }

  /**
   * Calculate moving average
   */
  private calculateMovingAverage(current: number, newValue: number, count: number): number {
    return (current * (count - 1) + newValue) / count;
  }

  /**
   * Create initial visual state
   */
  private createInitialVisualState(): VisualProgressionState {
    return {
      visualPosition: 0,
      pendingVisualEvents: [],
      completedVisualEvents: new Set(),
      syncState: 'ready',
    };
  }

  /**
   * Create initial audio state
   */
  private createInitialAudioState(): AudioProgressionState {
    return {
      audioPosition: 0,
      playbackState: 'stopped',
      activeChunks: new Set(),
      audioQueue: [],
    };
  }

  /**
   * Create initial metrics
   */
  private createInitialMetrics(): CoordinationMetrics {
    return {
      totalSyncEvents: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageSyncAccuracy: 0,
      timingStats: {
        averageAudioCompletionTime: 0,
        averageVisualCompletionTime: 0,
        syncPointAccuracy: 0,
        scrubbingPerformance: {
          averageSeekTime: 0,
          successfulSeeks: 0,
          failedSeeks: 0,
        },
      },
      modeUsage: {
        audio_driven: 0,
        visual_driven: 0,
        synchronized: 0,
        independent: 0,
      },
      errorStats: {
        audioErrors: 0,
        visualErrors: 0,
        syncErrors: 0,
        totalErrors: 0,
      },
    };
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    // Update total errors
    this.metrics.errorStats.totalErrors = 
      this.metrics.errorStats.audioErrors +
      this.metrics.errorStats.visualErrors +
      this.metrics.errorStats.syncErrors;
    
    // Update sync point accuracy
    if (this.metrics.totalSyncEvents > 0) {
      this.metrics.timingStats.syncPointAccuracy = 
        this.metrics.successfulSyncs / this.metrics.totalSyncEvents;
    }
  }

  /**
   * Start background services
   */
  private startBackgroundServices(): void {
    // Coordination update timer
    this.coordinationTimer = setInterval(() => {
      this.processCoordinationUpdates();
    }, this.config.performance.updateInterval);
    
    // Metrics update timer
    this.metricsTimer = setInterval(() => {
      this.updateMetrics();
    }, 1000);
  }

  /**
   * Stop background services
   */
  private stopBackgroundServices(): void {
    if (this.coordinationTimer) {
      clearInterval(this.coordinationTimer);
      this.coordinationTimer = undefined;
    }
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }
  }

  /**
   * Process coordination updates
   */
  private processCoordinationUpdates(): void {
    // Process pending coordination events
    for (const [eventId, syncEvent] of this.pendingCoordination) {
      const relatedVisualEvents = this.getRelatedVisualEvents(syncEvent.timelineEventId);
      const readyVisualEvents = relatedVisualEvents.filter(id => this.isVisualEventReady(id));
      
      if (readyVisualEvents.length > 0) {
        this.triggerVisualProgression(syncEvent);
        this.pendingCoordination.delete(eventId);
      }
    }
    
    // Process event queue if not already processing
    if (!this.isProcessingEvents && this.eventProcessingQueue.length > 0) {
      this.processEventQueue();
    }
  }

  /**
   * Process event queue
   */
  private async processEventQueue(): Promise<void> {
    this.isProcessingEvents = true;
    
    const batch = this.eventProcessingQueue.splice(0, this.config.performance.eventBatchSize);
    
    for (const event of batch) {
      try {
        await this.processQueuedEvent(event);
      } catch (error) {
        logger.error('Error processing queued event', { event: event.type, error });
      }
    }
    
    this.isProcessingEvents = false;
  }

  /**
   * Process individual queued event
   */
  private async processQueuedEvent(event: { type: string; data: any; timestamp: number }): Promise<void> {
    // Process different event types
    switch (event.type) {
      case 'audioComplete':
        this.handleAudioComplete(event.data.audioChunkId, event.data.completionTime);
        break;
      case 'visualComplete':
        this.handleVisualComplete(event.data.eventId, event.data.completionTime);
        break;
      default:
        logger.warn('Unknown event type in queue', { type: event.type });
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

export default AudioVisualCoordinator;