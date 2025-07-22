/**
 * Timeline Event Scheduler - Phase 4: Timeline Control & Playback
 * 
 * Provides video-like timeline control with seamless seeking, play, pause functionality.
 * Manages priority queue event processing with instant response and event coordination.
 */

import type {
  TimelineEvent,
  TimelineEventCollection,
  EventType,
} from '@ai-tutor/types';

import { PriorityQueue, Priority } from './priority-queue';
import { createUtilLogger } from '../logger';

const logger = createUtilLogger('TimelineEventScheduler');

/**
 * Playback states
 */
export type PlaybackState = 'playing' | 'paused' | 'seeking' | 'stopped' | 'buffering';

/**
 * Event scheduling states
 */
export type EventSchedulingState = 'pending' | 'scheduled' | 'active' | 'completed' | 'cancelled';

/**
 * Scheduled event with execution metadata
 */
export interface ScheduledEvent {
  /** Original timeline event */
  event: TimelineEvent;
  
  /** Current scheduling state */
  state: EventSchedulingState;
  
  /** Scheduled execution time (milliseconds since timeline start) */
  scheduledTime: number;
  
  /** Actual execution start time (performance.now()) */
  executionStartTime?: number;
  
  /** Actual execution end time (performance.now()) */
  executionEndTime?: number;
  
  /** Priority for execution */
  priority: Priority;
  
  /** Dependencies that must complete first */
  dependencies: string[];
  
  /** Retry count for failed executions */
  retryCount: number;
  
  /** Last error if execution failed */
  lastError?: string;
  
  /** Metadata for debugging */
  metadata: {
    createdAt: number;
    lastUpdated: number;
    source: 'timeline' | 'seek' | 'realtime';
  };
}

/**
 * Event execution result
 */
export interface EventExecutionResult {
  /** Event ID that was executed */
  eventId: string;
  
  /** Execution success status */
  success: boolean;
  
  /** Execution duration in milliseconds */
  executionDuration: number;
  
  /** Any error that occurred */
  error?: string;
  
  /** Output from event execution */
  output?: any;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Timeline scheduler configuration
 */
export interface TimelineSchedulerConfig {
  /** Maximum events to process concurrently */
  maxConcurrentEvents: number;
  
  /** Lookahead time for event preparation (milliseconds) */
  lookaheadTime: number;
  
  /** Maximum retry attempts for failed events */
  maxRetries: number;
  
  /** Seek response time target (milliseconds) */
  seekResponseTarget: number;
  
  /** Enable precise timing mode */
  preciseTimingMode: boolean;
  
  /** Performance monitoring */
  performance: {
    /** Enable timing metrics collection */
    enableMetrics: boolean;
    
    /** Event execution timeout (milliseconds) */
    executionTimeout: number;
    
    /** Memory cleanup interval (milliseconds) */
    cleanupInterval: number;
  };
  
  /** Event type priority mapping */
  eventTypePriorities: Record<EventType, Priority>;
  
  /** Audio-visual synchronization settings */
  synchronization: {
    /** Audio-visual sync tolerance (milliseconds) */
    syncTolerance: number;
    
    /** Enable audio-driven timing */
    audioDriven: boolean;
    
    /** Visual lag compensation (milliseconds) */
    visualCompensation: number;
  };
}

/**
 * Default scheduler configuration
 */
const DEFAULT_SCHEDULER_CONFIG: TimelineSchedulerConfig = {
  maxConcurrentEvents: 5,
  lookaheadTime: 1000, // 1 second lookahead
  maxRetries: 3,
  seekResponseTarget: 100, // < 100ms seek response
  preciseTimingMode: true,
  performance: {
    enableMetrics: true,
    executionTimeout: 5000, // 5 second timeout
    cleanupInterval: 30000, // 30 second cleanup
  },
  eventTypePriorities: {
    'transition': Priority.CRITICAL,
    'visual': Priority.HIGH,
    'narration': Priority.NORMAL,
    'emphasis': Priority.NORMAL,
    'layout_change': Priority.LOW,
  },
  synchronization: {
    syncTolerance: 50, // 50ms sync tolerance
    audioDriven: true,
    visualCompensation: 16, // ~1 frame at 60fps
  },
};

/**
 * Timeline playback metrics
 */
export interface TimelinePlaybackMetrics {
  /** Current playback position (milliseconds) */
  currentPosition: number;
  
  /** Total timeline duration (milliseconds) */
  totalDuration: number;
  
  /** Current playback state */
  state: PlaybackState;
  
  /** Playback speed multiplier */
  playbackSpeed: number;
  
  /** Events scheduled for current lookahead window */
  scheduledEventsCount: number;
  
  /** Active events currently executing */
  activeEventsCount: number;
  
  /** Events completed in current session */
  completedEventsCount: number;
  
  /** Event execution statistics */
  executionStats: {
    /** Average event execution time */
    averageExecutionTime: number;
    
    /** Success rate (0-1) */
    successRate: number;
    
    /** Total retries performed */
    totalRetries: number;
  };
  
  /** Performance metrics */
  performance: {
    /** Last seek time (milliseconds) */
    lastSeekTime: number;
    
    /** Average seek time over last 10 seeks */
    averageSeekTime: number;
    
    /** Frame drops or timing issues */
    timingIssues: number;
  };
}

/**
 * Main Timeline Event Scheduler class
 */
export class TimelineEventScheduler {
  private config: TimelineSchedulerConfig;
  private events: TimelineEvent[] = [];
  private scheduledEvents = new Map<string, ScheduledEvent>();
  private executionQueue: PriorityQueue<ScheduledEvent>;
  private eventHandlers = new Map<string, Array<(data: any) => void>>();
  
  // Playback state
  private playbackState: PlaybackState = 'stopped';
  private currentPosition = 0;
  private totalDuration = 0;
  private playbackSpeed = 1.0;
  private playbackStartTime = 0;
  private realStartTime = 0;
  
  // Event execution state
  private activeEvents = new Map<string, ScheduledEvent>();
  private completedEvents = new Set<string>();
  private failedEvents = new Set<string>();
  
  // Timing and performance
  private lastUpdateTime = 0;
  private frameRequestId?: number;
  private metricsUpdateTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  
  // Metrics
  private metrics: TimelinePlaybackMetrics;
  private seekTimes: number[] = [];
  private executionTimes: number[] = [];

  constructor(config: Partial<TimelineSchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    
    this.executionQueue = new PriorityQueue<ScheduledEvent>({
      maxSize: 1000,
      trackDependencies: true,
      enablePriorityDecay: false,
    });
    
    this.metrics = this.createInitialMetrics();
    
    // Start background services
    this.startBackgroundServices();
    
    logger.info('TimelineEventScheduler initialized', {
      config: this.config,
      preciseMode: this.config.preciseTimingMode,
    });
  }

  /**
   * Load timeline events for scheduling
   */
  loadEvents(events: TimelineEvent[]): void {
    logger.debug('Loading events into scheduler', { eventCount: events.length });
    
    try {
      // Sort events by timestamp
      this.events = [...events].sort((a, b) => a.timestamp - b.timestamp);
      
      // Calculate total duration
      this.totalDuration = this.calculateTotalDuration();
      
      // Clear previous scheduled events
      this.clearScheduledEvents();
      
      // Pre-schedule events based on current position
      this.scheduleEventsInWindow(this.currentPosition, this.currentPosition + this.config.lookaheadTime);
      
      this.emit('eventsLoaded', {
        eventCount: this.events.length,
        totalDuration: this.totalDuration,
      });
      
      logger.debug('Events loaded successfully', {
        totalEvents: this.events.length,
        totalDuration: this.totalDuration,
        scheduledCount: this.scheduledEvents.size,
      });

    } catch (error) {
      logger.error('Error loading events', { error });
      throw error;
    }
  }

  /**
   * Start playback from current position
   */
  play(): void {
    if (this.playbackState === 'playing') return;
    
    logger.debug('Starting playback', { 
      position: this.currentPosition, 
      speed: this.playbackSpeed 
    });
    
    try {
      this.playbackState = 'playing';
      this.playbackStartTime = this.currentPosition;
      this.realStartTime = performance.now();
      
      // Schedule events for current lookahead window
      this.scheduleEventsInWindow(
        this.currentPosition,
        this.currentPosition + this.config.lookaheadTime
      );
      
      // Start the main update loop
      this.startUpdateLoop();
      
      this.emit('playbackStarted', {
        position: this.currentPosition,
        speed: this.playbackSpeed,
      });

    } catch (error) {
      logger.error('Error starting playback', { error });
      this.playbackState = 'paused';
      throw error;
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.playbackState !== 'playing') return;
    
    logger.debug('Pausing playback', { position: this.currentPosition });
    
    try {
      this.playbackState = 'paused';
      this.stopUpdateLoop();
      
      // Cancel pending scheduled events but keep active ones
      this.cancelPendingEvents();
      
      this.emit('playbackPaused', {
        position: this.currentPosition,
      });

    } catch (error) {
      logger.error('Error pausing playback', { error });
      throw error;
    }
  }

  /**
   * Stop playback and reset to beginning
   */
  stop(): void {
    logger.debug('Stopping playback');
    
    try {
      this.playbackState = 'stopped';
      this.stopUpdateLoop();
      this.currentPosition = 0;
      
      // Cancel all events
      this.cancelAllEvents();
      
      this.emit('playbackStopped', {});

    } catch (error) {
      logger.error('Error stopping playback', { error });
      throw error;
    }
  }

  /**
   * Seek to specific position (< 100ms target response time)
   */
  async seek(position: number): Promise<void> {
    const seekStartTime = performance.now();
    const wasPlaying = this.playbackState === 'playing';
    
    logger.debug('Seeking to position', { 
      from: this.currentPosition, 
      to: position,
      wasPlaying,
    });
    
    try {
      // Temporarily set to seeking state
      this.playbackState = 'seeking';
      
      // Cancel current events and clear active state
      this.cancelAllEvents();
      
      // Update position
      this.currentPosition = Math.max(0, Math.min(position, this.totalDuration));
      
      // Get events that should be active at target position
      const activeEventsAtPosition = this.getEventsActiveAtTime(this.currentPosition);
      
      // Fast-schedule critical events for immediate execution
      await this.fastScheduleEvents(activeEventsAtPosition);
      
      // Schedule lookahead events
      this.scheduleEventsInWindow(
        this.currentPosition,
        this.currentPosition + this.config.lookaheadTime
      );
      
      // Update playback timing if we were playing
      if (wasPlaying) {
        this.playbackStartTime = this.currentPosition;
        this.realStartTime = performance.now();
        this.playbackState = 'playing';
        this.startUpdateLoop();
      } else {
        this.playbackState = 'paused';
      }
      
      // Record seek performance
      const seekTime = performance.now() - seekStartTime;
      this.recordSeekTime(seekTime);
      
      this.emit('seekCompleted', {
        position: this.currentPosition,
        seekTime,
        activeEventsCount: activeEventsAtPosition.length,
      });
      
      logger.debug('Seek completed', {
        position: this.currentPosition,
        seekTime,
        wasPlaying,
        resumedPlaying: wasPlaying && this.playbackState === 'playing',
      });

    } catch (error) {
      logger.error('Error during seek', { error });
      this.playbackState = wasPlaying ? 'playing' : 'paused';
      throw error;
    }
  }

  /**
   * Set playback speed
   */
  setPlaybackSpeed(speed: number): void {
    if (speed <= 0 || speed > 4) {
      throw new Error('Playback speed must be between 0 and 4');
    }
    
    logger.debug('Setting playback speed', { from: this.playbackSpeed, to: speed });
    
    // Update timing if currently playing
    if (this.playbackState === 'playing') {
      // Calculate current position first
      this.updateCurrentPosition();
      
      // Reset timing with new speed
      this.playbackStartTime = this.currentPosition;
      this.realStartTime = performance.now();
    }
    
    this.playbackSpeed = speed;
    
    this.emit('speedChanged', {
      speed: this.playbackSpeed,
      position: this.currentPosition,
    });
  }

  /**
   * Get current playback metrics
   */
  getMetrics(): TimelinePlaybackMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get current playback state
   */
  getState(): {
    state: PlaybackState;
    position: number;
    duration: number;
    speed: number;
    progress: number;
  } {
    return {
      state: this.playbackState,
      position: this.currentPosition,
      duration: this.totalDuration,
      speed: this.playbackSpeed,
      progress: this.totalDuration > 0 ? this.currentPosition / this.totalDuration : 0,
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
   * Cleanup and shutdown
   */
  shutdown(): void {
    logger.debug('Shutting down TimelineEventScheduler');
    
    this.stop();
    this.stopBackgroundServices();
    this.eventHandlers.clear();
    this.scheduledEvents.clear();
    this.activeEvents.clear();
    this.completedEvents.clear();
    this.failedEvents.clear();
    
    logger.debug('TimelineEventScheduler shutdown complete');
  }

  // ========== Private Methods ==========

  /**
   * Main update loop for timeline playback
   */
  private updateLoop = (): void => {
    if (this.playbackState !== 'playing') return;
    
    try {
      // Update current position based on real time
      this.updateCurrentPosition();
      
      // Process events in execution queue
      this.processExecutionQueue();
      
      // Schedule new events in lookahead window
      this.updateScheduledEvents();
      
      // Update metrics
      this.updateMetrics();
      
      // Continue loop
      this.frameRequestId = requestAnimationFrame(this.updateLoop);

    } catch (error) {
      logger.error('Error in update loop', { error });
      this.pause(); // Safe fallback
    }
  };

  /**
   * Start the main update loop
   */
  private startUpdateLoop(): void {
    if (this.frameRequestId) return;
    this.frameRequestId = requestAnimationFrame(this.updateLoop);
  }

  /**
   * Stop the main update loop
   */
  private stopUpdateLoop(): void {
    if (this.frameRequestId) {
      cancelAnimationFrame(this.frameRequestId);
      this.frameRequestId = undefined;
    }
  }

  /**
   * Update current playback position based on real time
   */
  private updateCurrentPosition(): void {
    if (this.playbackState === 'playing') {
      const realElapsed = performance.now() - this.realStartTime;
      const timelineElapsed = realElapsed * this.playbackSpeed;
      this.currentPosition = Math.min(
        this.playbackStartTime + timelineElapsed,
        this.totalDuration
      );
      
      // Check if we've reached the end
      if (this.currentPosition >= this.totalDuration) {
        this.stop();
        this.emit('playbackCompleted', {});
      }
    }
  }

  /**
   * Schedule events within a time window
   */
  private scheduleEventsInWindow(startTime: number, endTime: number): void {
    const eventsInWindow = this.events.filter(event => {
      const eventStart = event.timestamp;
      const eventEnd = event.timestamp + event.duration;
      
      // Event overlaps with window
      return (eventStart <= endTime && eventEnd >= startTime);
    });
    
    for (const event of eventsInWindow) {
      this.scheduleEvent(event, 'timeline');
    }
  }

  /**
   * Schedule a single event for execution
   */
  private scheduleEvent(event: TimelineEvent, source: 'timeline' | 'seek' | 'realtime'): void {
    // Skip if already scheduled
    if (this.scheduledEvents.has(event.id)) return;
    
    const priority = this.config.eventTypePriorities[event.type] || Priority.NORMAL;
    
    const scheduledEvent: ScheduledEvent = {
      event,
      state: 'scheduled',
      scheduledTime: event.timestamp,
      priority,
      dependencies: event.dependencies || [],
      retryCount: 0,
      metadata: {
        createdAt: performance.now(),
        lastUpdated: performance.now(),
        source,
      },
    };
    
    this.scheduledEvents.set(event.id, scheduledEvent);
    this.executionQueue.enqueue({
      id: event.id,
      priority: priority,
      data: scheduledEvent,
      dependencies: [],
      maxRetries: 3,
      tags: ['timeline', event.type]
    });
    
    logger.debug('Event scheduled', {
      eventId: event.id,
      type: event.type,
      scheduledTime: event.timestamp,
      priority,
      source,
    });
  }

  /**
   * Fast-schedule events for immediate execution (used during seeking)
   */
  private async fastScheduleEvents(events: TimelineEvent[]): Promise<void> {
    const criticalEvents = events
      .filter(event => this.config.eventTypePriorities[event.type] >= Priority.HIGH)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    for (const event of criticalEvents) {
      this.scheduleEvent(event, 'seek');
      
      // Immediately execute critical events for seeking
      const scheduledEvent = this.scheduledEvents.get(event.id);
      if (scheduledEvent) {
        await this.executeEvent(scheduledEvent);
      }
    }
  }

  /**
   * Process the execution queue
   */
  private processExecutionQueue(): void {
    while (!this.executionQueue.isEmpty() && this.activeEvents.size < this.config.maxConcurrentEvents) {
      const next = this.executionQueue.peek();
      if (!next) break;
      
      const scheduledEvent = next.data;
      const eventId = next.id;
      
      // Check if it's time to execute this event
      if (scheduledEvent.scheduledTime <= this.currentPosition + this.config.synchronization.visualCompensation) {
        // Check dependencies
        if (this.areDependenciesSatisfied(scheduledEvent)) {
          // Dequeue the event before execution
          this.executionQueue.dequeue(eventId);
          this.executeEvent(scheduledEvent).catch(error => {
            logger.error('Event execution failed', { eventId, error });
          });
        } else {
          // Re-queue with dependency delay - first dequeue then re-enqueue
          this.executionQueue.dequeue(eventId);
          this.executionQueue.enqueue({
            id: eventId,
            priority: scheduledEvent.priority,
            data: scheduledEvent,
            dependencies: [],
            maxRetries: 3,
            tags: ['timeline', scheduledEvent.event.type]
          });
        }
      } else {
        // Not time yet, break - Events are time-ordered
        break;
      }
    }
  }

  /**
   * Execute a single event
   */
  private async executeEvent(scheduledEvent: ScheduledEvent): Promise<EventExecutionResult> {
    const eventId = scheduledEvent.event.id;
    const startTime = performance.now();
    
    logger.debug('Executing event', {
      eventId,
      type: scheduledEvent.event.type,
      scheduledTime: scheduledEvent.scheduledTime,
      currentTime: this.currentPosition,
    });
    
    try {
      // Mark as active
      scheduledEvent.state = 'active';
      scheduledEvent.executionStartTime = startTime;
      this.activeEvents.set(eventId, scheduledEvent);
      
      // Execute the event based on its type and content
      const result = await this.performEventExecution(scheduledEvent);
      
      // Mark as completed
      const endTime = performance.now();
      scheduledEvent.state = 'completed';
      scheduledEvent.executionEndTime = endTime;
      this.completedEvents.add(eventId);
      this.activeEvents.delete(eventId);
      
      // Record execution time
      this.executionTimes.push(endTime - startTime);
      if (this.executionTimes.length > 100) {
        this.executionTimes.shift();
      }
      
      this.emit('eventExecuted', {
        eventId,
        result,
        executionTime: endTime - startTime,
      });
      
      return {
        eventId,
        success: true,
        executionDuration: endTime - startTime,
        output: result,
      };

    } catch (error) {
      const endTime = performance.now();
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Event execution failed', { eventId, error: errorMessage });
      
      // Handle retry logic
      if (scheduledEvent.retryCount < this.config.maxRetries) {
        scheduledEvent.retryCount++;
        scheduledEvent.lastError = errorMessage;
        scheduledEvent.state = 'scheduled';
        
        // Re-schedule with delay
        setTimeout(() => {
          this.executeEvent(scheduledEvent);
        }, Math.pow(2, scheduledEvent.retryCount) * 100); // Exponential backoff
        
      } else {
        // Max retries exceeded, mark as failed
        scheduledEvent.state = 'cancelled';
        this.failedEvents.add(eventId);
        this.activeEvents.delete(eventId);
      }
      
      return {
        eventId,
        success: false,
        executionDuration: endTime - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Perform the actual event execution based on event type
   */
  private async performEventExecution(scheduledEvent: ScheduledEvent): Promise<any> {
    const { event } = scheduledEvent;
    
    switch (event.type) {
      case 'visual':
        return this.executeVisualEvent(event);
      case 'narration':
        return this.executeNarrationEvent(event);
      case 'transition':
        return this.executeTransitionEvent(event);
      case 'emphasis':
        return this.executeEmphasisEvent(event);
      case 'layout_change':
        return this.executeLayoutChangeEvent(event);
      default:
        throw new Error(`Unknown event type: ${event.type}`);
    }
  }

  /**
   * Execute visual event (create/modify/remove visual elements)
   */
  private async executeVisualEvent(event: TimelineEvent): Promise<any> {
    // This would integrate with the existing Excalidraw utilities and layout engine
    this.emit('visualEventTriggered', {
      eventId: event.id,
      instruction: typeof event.content === 'object' ? event.content.visual : null,
      layoutHints: event.layoutHints,
    });
    
    return { type: 'visual', processed: true };
  }

  /**
   * Execute narration event (trigger TTS audio)
   */
  private async executeNarrationEvent(event: TimelineEvent): Promise<any> {
    // This would integrate with the existing TTS system
    this.emit('narrationEventTriggered', {
      eventId: event.id,
      audioCue: typeof event.content === 'object' ? event.content.audio : null,
      timestamp: event.timestamp,
    });
    
    return { type: 'narration', processed: true };
  }

  /**
   * Execute transition event (camera movements, focus changes)
   */
  private async executeTransitionEvent(event: TimelineEvent): Promise<any> {
    // This would integrate with canvas view transitions
    this.emit('transitionEventTriggered', {
      eventId: event.id,
      transition: typeof event.content === 'object' ? event.content.transition : null,
    });
    
    return { type: 'transition', processed: true };
  }

  /**
   * Execute emphasis event (highlight, focus, attention)
   */
  private async executeEmphasisEvent(event: TimelineEvent): Promise<any> {
    // This would trigger visual emphasis effects
    this.emit('emphasisEventTriggered', {
      eventId: event.id,
      emphasis: event.content,
    });
    
    return { type: 'emphasis', processed: true };
  }

  /**
   * Execute layout change event (reorganize elements)
   */
  private async executeLayoutChangeEvent(event: TimelineEvent): Promise<any> {
    // This would trigger layout engine reorganization
    this.emit('layoutChangeEventTriggered', {
      eventId: event.id,
      layoutChange: event.content,
      layoutHints: event.layoutHints,
    });
    
    return { type: 'layout_change', processed: true };
  }

  /**
   * Check if event dependencies are satisfied
   */
  private areDependenciesSatisfied(scheduledEvent: ScheduledEvent): boolean {
    if (!scheduledEvent.dependencies.length) return true;
    
    return scheduledEvent.dependencies.every(depId => 
      this.completedEvents.has(depId) || this.activeEvents.has(depId)
    );
  }

  /**
   * Get events that should be active at a specific time
   */
  private getEventsActiveAtTime(timestamp: number): TimelineEvent[] {
    return this.events.filter(event => {
      const eventStart = event.timestamp;
      const eventEnd = event.timestamp + event.duration;
      return timestamp >= eventStart && timestamp <= eventEnd;
    });
  }

  /**
   * Update scheduled events based on current position
   */
  private updateScheduledEvents(): void {
    const lookaheadEnd = this.currentPosition + this.config.lookaheadTime;
    
    // Remove events that are too far behind
    for (const [eventId, scheduledEvent] of this.scheduledEvents) {
      if (scheduledEvent.scheduledTime + scheduledEvent.event.duration < this.currentPosition - 1000) {
        this.scheduledEvents.delete(eventId);
      }
    }
    
    // Schedule new events entering the lookahead window
    this.scheduleEventsInWindow(this.currentPosition, lookaheadEnd);
  }

  /**
   * Cancel pending scheduled events
   */
  private cancelPendingEvents(): void {
    for (const [eventId, scheduledEvent] of this.scheduledEvents) {
      if (scheduledEvent.state === 'scheduled' || scheduledEvent.state === 'pending') {
        scheduledEvent.state = 'cancelled';
      }
    }
    this.executionQueue.clear();
  }

  /**
   * Cancel all events including active ones
   */
  private cancelAllEvents(): void {
    for (const [eventId, scheduledEvent] of this.scheduledEvents) {
      if (scheduledEvent.state !== 'completed') {
        scheduledEvent.state = 'cancelled';
      }
    }
    
    this.executionQueue.clear();
    this.activeEvents.clear();
  }

  /**
   * Clear all scheduled events
   */
  private clearScheduledEvents(): void {
    this.scheduledEvents.clear();
    this.executionQueue.clear();
    this.activeEvents.clear();
    this.completedEvents.clear();
    this.failedEvents.clear();
  }

  /**
   * Calculate total timeline duration
   */
  private calculateTotalDuration(): number {
    if (this.events.length === 0) return 0;
    
    return Math.max(
      ...this.events.map(event => event.timestamp + event.duration)
    );
  }

  /**
   * Record seek time for performance metrics
   */
  private recordSeekTime(seekTime: number): void {
    this.seekTimes.push(seekTime);
    if (this.seekTimes.length > 10) {
      this.seekTimes.shift();
    }
  }

  /**
   * Create initial metrics object
   */
  private createInitialMetrics(): TimelinePlaybackMetrics {
    return {
      currentPosition: 0,
      totalDuration: 0,
      state: 'stopped',
      playbackSpeed: 1.0,
      scheduledEventsCount: 0,
      activeEventsCount: 0,
      completedEventsCount: 0,
      executionStats: {
        averageExecutionTime: 0,
        successRate: 1.0,
        totalRetries: 0,
      },
      performance: {
        lastSeekTime: 0,
        averageSeekTime: 0,
        timingIssues: 0,
      },
    };
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(): void {
    const totalEvents = this.completedEvents.size + this.failedEvents.size;
    const successRate = totalEvents > 0 ? this.completedEvents.size / totalEvents : 1.0;
    
    const avgExecutionTime = this.executionTimes.length > 0
      ? this.executionTimes.reduce((sum, time) => sum + time, 0) / this.executionTimes.length
      : 0;
    
    const avgSeekTime = this.seekTimes.length > 0
      ? this.seekTimes.reduce((sum, time) => sum + time, 0) / this.seekTimes.length
      : 0;
    
    this.metrics = {
      currentPosition: this.currentPosition,
      totalDuration: this.totalDuration,
      state: this.playbackState,
      playbackSpeed: this.playbackSpeed,
      scheduledEventsCount: this.scheduledEvents.size,
      activeEventsCount: this.activeEvents.size,
      completedEventsCount: this.completedEvents.size,
      executionStats: {
        averageExecutionTime: avgExecutionTime,
        successRate,
        totalRetries: Array.from(this.scheduledEvents.values())
          .reduce((sum, event) => sum + event.retryCount, 0),
      },
      performance: {
        lastSeekTime: this.seekTimes[this.seekTimes.length - 1] || 0,
        averageSeekTime: avgSeekTime,
        timingIssues: this.failedEvents.size,
      },
    };
  }

  /**
   * Start background services
   */
  private startBackgroundServices(): void {
    // Metrics update timer
    if (this.config.performance.enableMetrics) {
      this.metricsUpdateTimer = setInterval(() => {
        this.updateMetrics();
      }, 1000);
    }
    
    // Cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.performance.cleanupInterval);
  }

  /**
   * Stop background services
   */
  private stopBackgroundServices(): void {
    if (this.metricsUpdateTimer) {
      clearInterval(this.metricsUpdateTimer);
      this.metricsUpdateTimer = undefined;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Perform periodic cleanup
   */
  private performCleanup(): void {
    const now = performance.now();
    const cleanupThreshold = now - 300000; // 5 minutes
    
    // Remove old completed events
    for (const [eventId, scheduledEvent] of this.scheduledEvents) {
      if (scheduledEvent.state === 'completed' && 
          scheduledEvent.executionEndTime && 
          scheduledEvent.executionEndTime < cleanupThreshold) {
        this.scheduledEvents.delete(eventId);
      }
    }
    
    // Trim performance arrays
    if (this.executionTimes.length > 100) {
      this.executionTimes.splice(0, this.executionTimes.length - 100);
    }
    
    if (this.seekTimes.length > 20) {
      this.seekTimes.splice(0, this.seekTimes.length - 20);
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

export default TimelineEventScheduler;