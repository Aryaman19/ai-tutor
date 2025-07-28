/**
 * Seek Optimizer - Phase 4: Timeline Control & Playback
 * 
 * Provides instant layout state calculation for any timeline position with
 * efficient event filtering, layout reconstruction, and timeline scrubbing
 * with frame-perfect accuracy.
 */

import type {
  TimelineEvent,
  TimelineEventCollection,
} from '@ai-tutor/types';

import { createUtilLogger } from '../logger';

const logger = createUtilLogger('SeekOptimizer');

/**
 * Seek operation result
 */
export interface SeekResult {
  /** Target position achieved */
  targetPosition: number;
  
  /** Time taken for seek operation */
  seekTime: number;
  
  /** Layout state at target position */
  layoutState: LayoutState;
  
  /** Active events at target position */
  activeEvents: TimelineEvent[];
  
  /** Events that need to be executed to reach target state */
  eventsToExecute: TimelineEvent[];
  
  /** Visual elements that should be visible */
  visibleElements: VisualElement[];
  
  /** Audio state at target position */
  audioState: AudioState;
  
  /** Whether seek was successful */
  success: boolean;
  
  /** Any errors that occurred during seek */
  error?: string;
}

/**
 * Layout state at a specific timeline position
 */
export interface LayoutState {
  /** Canvas viewport */
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  
  /** Active visual elements */
  elements: Map<string, VisualElement>;
  
  /** Layout regions and their occupancy */
  regions: Map<string, RegionState>;
  
  /** Visual hierarchy at this position */
  hierarchy: VisualHierarchy;
  
  /** Animation states */
  animations: Map<string, AnimationState>;
  
  /** Timestamp of this state */
  timestamp: number;
}

/**
 * Visual element state
 */
export interface VisualElement {
  /** Element ID */
  id: string;
  
  /** Element type */
  type: string;
  
  /** Position on canvas */
  position: { x: number; y: number };
  
  /** Element size */
  size: { width: number; height: number };
  
  /** Visibility (0-1) */
  opacity: number;
  
  /** Z-index for layering */
  zIndex: number;
  
  /** Element properties */
  properties: Record<string, any>;
  
  /** Associated timeline event */
  sourceEventId?: string;
  
  /** Lifecycle state */
  lifecycle: 'entering' | 'stable' | 'exiting';
}

/**
 * Region occupancy state
 */
export interface RegionState {
  /** Region identifier */
  regionId: string;
  
  /** Elements in this region */
  elements: string[];
  
  /** Occupancy percentage (0-1) */
  occupancy: number;
  
  /** Whether region is available for new elements */
  available: boolean;
}

/**
 * Visual hierarchy information
 */
export interface VisualHierarchy {
  /** Primary focus element */
  primaryFocus?: string;
  
  /** Secondary elements */
  secondary: string[];
  
  /** Background elements */
  background: string[];
  
  /** Visual flow connections */
  connections: Array<{ from: string; to: string; type: string }>;
}

/**
 * Animation state
 */
export interface AnimationState {
  /** Animation target element */
  elementId: string;
  
  /** Animation type */
  type: string;
  
  /** Progress (0-1) */
  progress: number;
  
  /** Start time */
  startTime: number;
  
  /** Duration */
  duration: number;
  
  /** Animation properties */
  properties: Record<string, any>;
}

/**
 * Audio state at timeline position
 */
export interface AudioState {
  /** Currently playing audio */
  currentAudio?: {
    id: string;
    text: string;
    startTime: number;
    duration: number;
    progress: number;
  };
  
  /** Queued audio */
  queue: Array<{
    id: string;
    text: string;
    scheduledTime: number;
  }>;
  
  /** Audio volume */
  volume: number;
  
  /** Audio properties */
  properties: Record<string, any>;
}

/**
 * Seek optimization configuration
 */
export interface SeekOptimizerConfig {
  /** Target seek response time (milliseconds) */
  targetResponseTime: number;
  
  /** Enable layout state caching */
  enableCaching: boolean;
  
  /** Cache size (number of states to keep) */
  cacheSize: number;
  
  /** Keyframe interval for cached states */
  keyframeInterval: number;
  
  /** Enable predictive caching */
  enablePredictiveCache: boolean;
  
  /** Performance optimization settings */
  performance: {
    /** Enable fast seek mode (reduced accuracy for speed) */
    enableFastMode: boolean;
    
    /** Maximum events to process per frame */
    maxEventsPerFrame: number;
    
    /** Use simplified layout calculation */
    useSimplifiedLayout: boolean;
    
    /** Skip non-critical animations during seek */
    skipAnimations: boolean;
  };
  
  /** Accuracy settings */
  accuracy: {
    /** Position tolerance (milliseconds) */
    positionTolerance: number;
    
    /** Layout calculation precision */
    layoutPrecision: 'high' | 'medium' | 'low';
    
    /** Element positioning accuracy */
    positioningAccuracy: number;
  };
}

/**
 * Default seek optimizer configuration
 */
const DEFAULT_SEEK_CONFIG: SeekOptimizerConfig = {
  targetResponseTime: 100, // < 100ms
  enableCaching: true,
  cacheSize: 50,
  keyframeInterval: 5000, // 5 seconds
  enablePredictiveCache: true,
  performance: {
    enableFastMode: false,
    maxEventsPerFrame: 20,
    useSimplifiedLayout: false,
    skipAnimations: false,
  },
  accuracy: {
    positionTolerance: 16, // ~1 frame at 60fps
    layoutPrecision: 'medium',
    positioningAccuracy: 1.0, // Pixel-perfect
  },
};

/**
 * Cached layout state
 */
interface CachedState {
  /** Timestamp of cached state */
  timestamp: number;
  
  /** Cached layout state */
  layoutState: LayoutState;
  
  /** Events active at this timestamp */
  activeEvents: TimelineEvent[];
  
  /** Cache creation time (for LRU) */
  createdAt: number;
  
  /** Access count for popularity tracking */
  accessCount: number;
  
  /** Last accessed time */
  lastAccessed: number;
}

/**
 * Main Seek Optimizer class
 */
export class SeekOptimizer {
  private config: SeekOptimizerConfig;
  private events: TimelineEvent[] = [];
  private layoutStateCache = new Map<number, CachedState>();
  private eventHandlers = new Map<string, Array<(data: any) => void>>();
  
  // Performance tracking
  private seekTimes: number[] = [];
  private totalSeeks = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(config: Partial<SeekOptimizerConfig> = {}) {
    this.config = { ...DEFAULT_SEEK_CONFIG, ...config };
    
    logger.info('SeekOptimizer initialized', {
      targetResponseTime: this.config.targetResponseTime,
      cacheEnabled: this.config.enableCaching,
      cacheSize: this.config.cacheSize,
    });
  }

  /**
   * Load timeline events for seek optimization
   */
  loadEvents(events: TimelineEvent[]): void {
    logger.debug('Loading events into seek optimizer', { eventCount: events.length });
    
    // Sort events by timestamp for efficient processing
    this.events = [...events].sort((a, b) => a.timestamp - b.timestamp);
    
    // Clear existing cache as events have changed
    this.layoutStateCache.clear();
    
    // Pre-generate keyframe cache if enabled
    if (this.config.enableCaching) {
      this.generateKeyframeCache();
    }
    
    logger.debug('Events loaded and cache initialized', {
      eventCount: this.events.length,
      cacheEntries: this.layoutStateCache.size,
    });
  }

  /**
   * Perform instant seek to target position
   */
  async seekToPosition(targetPosition: number): Promise<SeekResult> {
    const startTime = performance.now();
    this.totalSeeks++;
    
    logger.debug('Seeking to position', { targetPosition });
    
    try {
      // Find the best cached state to start from
      const nearestCache = this.findNearestCachedState(targetPosition);
      let startPosition = 0;
      let baseLayoutState = this.createEmptyLayoutState(targetPosition);
      
      if (nearestCache && nearestCache.timestamp <= targetPosition) {
        startPosition = nearestCache.timestamp;
        baseLayoutState = this.cloneLayoutState(nearestCache.layoutState);
        nearestCache.accessCount++;
        nearestCache.lastAccessed = performance.now();
        this.cacheHits++;
        
        logger.debug('Using cached state as starting point', {
          cacheTimestamp: nearestCache.timestamp,
          targetPosition,
          skip: targetPosition - nearestCache.timestamp,
        });
      } else {
        this.cacheMisses++;
      }
      
      // Get events that need to be processed
      const eventsToProcess = this.getEventsInRange(startPosition, targetPosition);
      const activeEvents = this.getActiveEventsAtPosition(targetPosition);
      
      // Calculate layout state at target position
      const layoutState = await this.calculateLayoutStateAtPosition(
        targetPosition,
        baseLayoutState,
        eventsToProcess
      );
      
      // Get visible elements
      const visibleElements = this.getVisibleElementsAtPosition(targetPosition, layoutState);
      
      // Calculate audio state
      const audioState = this.calculateAudioStateAtPosition(targetPosition);
      
      // Determine events that need to be executed
      const eventsToExecute = this.getEventsToExecuteForSeek(targetPosition, activeEvents);
      
      const seekTime = performance.now() - startTime;
      this.recordSeekTime(seekTime);
      
      const result: SeekResult = {
        targetPosition,
        seekTime,
        layoutState,
        activeEvents,
        eventsToExecute,
        visibleElements,
        audioState,
        success: true,
      };
      
      // Cache this state for future seeks if beneficial
      if (this.shouldCacheState(targetPosition, seekTime)) {
        this.cacheLayoutState(targetPosition, layoutState, activeEvents);
      }
      
      this.emit('seekCompleted', {
        targetPosition,
        seekTime,
        cacheHit: nearestCache !== null,
        eventsProcessed: eventsToProcess.length,
      });
      
      logger.debug('Seek completed successfully', {
        targetPosition,
        seekTime,
        eventsProcessed: eventsToProcess.length,
        cacheHit: nearestCache !== null,
      });
      
      return result;

    } catch (error) {
      const seekTime = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Seek operation failed', { targetPosition, seekTime, error: errorMessage });
      
      return {
        targetPosition,
        seekTime,
        layoutState: this.createEmptyLayoutState(targetPosition),
        activeEvents: [],
        eventsToExecute: [],
        visibleElements: [],
        audioState: { volume: 1.0, queue: [], properties: {} },
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get seek performance metrics
   */
  getPerformanceMetrics(): {
    averageSeekTime: number;
    minSeekTime: number;
    maxSeekTime: number;
    totalSeeks: number;
    cacheHitRate: number;
    cacheEntries: number;
  } {
    const seekTimes = this.seekTimes;
    const averageSeekTime = seekTimes.length > 0
      ? seekTimes.reduce((sum, time) => sum + time, 0) / seekTimes.length
      : 0;
    
    return {
      averageSeekTime,
      minSeekTime: seekTimes.length > 0 ? Math.min(...seekTimes) : 0,
      maxSeekTime: seekTimes.length > 0 ? Math.max(...seekTimes) : 0,
      totalSeeks: this.totalSeeks,
      cacheHitRate: this.totalSeeks > 0 ? this.cacheHits / this.totalSeeks : 0,
      cacheEntries: this.layoutStateCache.size,
    };
  }

  /**
   * Clear seek cache
   */
  clearCache(): void {
    this.layoutStateCache.clear();
    logger.debug('Seek cache cleared');
  }

  /**
   * Optimize cache by removing least useful entries
   */
  optimizeCache(): void {
    if (this.layoutStateCache.size <= this.config.cacheSize) return;
    
    // Sort by access patterns and remove least useful entries
    const cacheEntries = Array.from(this.layoutStateCache.entries())
      .map(([timestamp, state]) => ({
        timestamp,
        state,
        score: this.calculateCacheScore(state),
      }))
      .sort((a, b) => a.score - b.score);
    
    // Remove lowest scoring entries
    const entriesToRemove = cacheEntries.slice(0, cacheEntries.length - this.config.cacheSize);
    for (const entry of entriesToRemove) {
      this.layoutStateCache.delete(entry.timestamp);
    }
    
    logger.debug('Cache optimized', {
      removedEntries: entriesToRemove.length,
      remainingEntries: this.layoutStateCache.size,
    });
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
   * Shutdown seek optimizer
   */
  shutdown(): void {
    logger.debug('Shutting down SeekOptimizer');
    
    this.clearCache();
    this.eventHandlers.clear();
    this.events.length = 0;
    this.seekTimes.length = 0;
    
    logger.debug('SeekOptimizer shutdown complete');
  }

  // ========== Private Methods ==========

  /**
   * Generate keyframe cache for important timeline positions
   */
  private generateKeyframeCache(): void {
    if (!this.config.enableCaching || this.events.length === 0) return;
    
    const totalDuration = Math.max(...this.events.map(e => e.timestamp + e.duration));
    const keyframes: number[] = [];
    
    // Generate keyframes at regular intervals
    for (let t = 0; t <= totalDuration; t += this.config.keyframeInterval) {
      keyframes.push(t);
    }
    
    // Add keyframes at important positions (event boundaries)
    const importantPositions = this.events
      .filter(e => e.priority && e.priority >= 8) // High priority events
      .map(e => e.timestamp);
    
    keyframes.push(...importantPositions);
    
    // Sort and deduplicate
    const uniqueKeyframes = [...new Set(keyframes)].sort((a, b) => a - b);
    
    logger.debug('Generating keyframe cache', {
      keyframes: uniqueKeyframes.length,
      interval: this.config.keyframeInterval,
      totalDuration,
    });
    
    // Pre-calculate layout states for keyframes (in background)
    setTimeout(() => {
      this.preCalculateKeyframes(uniqueKeyframes);
    }, 0);
  }

  /**
   * Pre-calculate layout states for keyframe positions
   */
  private async preCalculateKeyframes(keyframes: number[]): Promise<void> {
    for (const position of keyframes.slice(0, 10)) { // Limit to first 10 to avoid blocking
      try {
        const baseState = this.createEmptyLayoutState(position);
        const events = this.getEventsInRange(0, position);
        const layoutState = await this.calculateLayoutStateAtPosition(position, baseState, events);
        const activeEvents = this.getActiveEventsAtPosition(position);
        
        this.cacheLayoutState(position, layoutState, activeEvents);
        
        // Small delay to avoid blocking the main thread
        await new Promise(resolve => setTimeout(resolve, 1));
      } catch (error) {
        logger.warn('Error pre-calculating keyframe', { position, error });
      }
    }
    
    logger.debug('Keyframe pre-calculation completed', {
      cachedStates: this.layoutStateCache.size,
    });
  }

  /**
   * Find the nearest cached state before or at the target position
   */
  private findNearestCachedState(targetPosition: number): CachedState | null {
    let nearest: CachedState | null = null;
    let nearestDistance = Infinity;
    
    for (const [timestamp, state] of this.layoutStateCache) {
      if (timestamp <= targetPosition) {
        const distance = targetPosition - timestamp;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = state;
        }
      }
    }
    
    return nearest;
  }

  /**
   * Get events in a time range
   */
  private getEventsInRange(startTime: number, endTime: number): TimelineEvent[] {
    return this.events.filter(event => {
      const eventStart = event.timestamp;
      const eventEnd = event.timestamp + event.duration;
      
      // Event overlaps with range
      return eventStart < endTime && eventEnd >= startTime;
    });
  }

  /**
   * Get events that are active at a specific position
   */
  private getActiveEventsAtPosition(position: number): TimelineEvent[] {
    return this.events.filter(event => {
      const eventStart = event.timestamp;
      const eventEnd = event.timestamp + event.duration;
      
      return position >= eventStart && position <= eventEnd;
    });
  }

  /**
   * Calculate layout state at target position
   */
  private async calculateLayoutStateAtPosition(
    targetPosition: number,
    baseState: LayoutState,
    eventsToProcess: TimelineEvent[]
  ): Promise<LayoutState> {
    const layoutState = this.cloneLayoutState(baseState);
    layoutState.timestamp = targetPosition;
    
    // Process events in chronological order
    const sortedEvents = eventsToProcess.sort((a, b) => a.timestamp - b.timestamp);
    
    // Use performance mode settings
    const maxEventsPerFrame = this.config.performance.maxEventsPerFrame;
    let processedCount = 0;
    
    for (const event of sortedEvents) {
      // Skip if we've processed enough events for this frame
      if (processedCount >= maxEventsPerFrame && this.config.performance.enableFastMode) {
        break;
      }
      
      // Apply event to layout state
      await this.applyEventToLayoutState(event, layoutState, targetPosition);
      processedCount++;
      
      // Yield occasionally to prevent blocking
      if (processedCount % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    // Finalize layout state
    this.finalizeLayoutState(layoutState, targetPosition);
    
    return layoutState;
  }

  /**
   * Apply a single event to the layout state
   */
  private async applyEventToLayoutState(
    event: TimelineEvent,
    layoutState: LayoutState,
    currentPosition: number
  ): Promise<void> {
    const eventProgress = Math.min(1.0, Math.max(0.0, 
      (currentPosition - event.timestamp) / event.duration
    ));
    
    switch (event.type) {
      case 'visual':
        await this.applyVisualEvent(event, layoutState, eventProgress);
        break;
      case 'transition':
        await this.applyTransitionEvent(event, layoutState, eventProgress);
        break;
      case 'layout_change':
        await this.applyLayoutChangeEvent(event, layoutState, eventProgress);
        break;
      case 'emphasis':
        await this.applyEmphasisEvent(event, layoutState, eventProgress);
        break;
      // Audio events don't affect layout state directly
    }
  }

  /**
   * Apply visual event to layout state
   */
  private async applyVisualEvent(
    event: TimelineEvent,
    layoutState: LayoutState,
    progress: number
  ): Promise<void> {
    if (typeof event.content !== 'object' || !event.content.visual) return;
    
    const visual = event.content.visual;
    const elementId = visual.targetElementId || `element_${event.id}`;
    
    switch (visual.action) {
      case 'create':
        if (!layoutState.elements.has(elementId)) {
          const element = this.createVisualElement(elementId, visual, event, progress);
          layoutState.elements.set(elementId, element);
        }
        break;
        
      case 'modify':
        const existingElement = layoutState.elements.get(elementId);
        if (existingElement) {
          this.modifyVisualElement(existingElement, visual, progress);
        }
        break;
        
      case 'remove':
        if (progress >= 1.0) {
          layoutState.elements.delete(elementId);
        } else {
          // Fade out during removal
          const element = layoutState.elements.get(elementId);
          if (element) {
            element.opacity = 1.0 - progress;
            element.lifecycle = 'exiting';
          }
        }
        break;
    }
  }

  /**
   * Apply transition event to layout state
   */
  private async applyTransitionEvent(
    event: TimelineEvent,
    layoutState: LayoutState,
    progress: number
  ): Promise<void> {
    if (typeof event.content !== 'object' || !event.content.transition) return;
    
    const transition = event.content.transition;
    
    // Apply viewport changes based on transition type
    switch (transition.type) {
      case 'zoom':
        if (typeof transition.target === 'object' && 'zoom' in transition.target) {
          const targetZoom = transition.target.zoom;
          if (typeof targetZoom === 'number') {
            layoutState.viewport.zoom = this.lerp(layoutState.viewport.zoom, targetZoom, progress);
          }
        }
        break;
        
      case 'pan':
        if (typeof transition.target === 'object' && 'x' in transition.target && 'y' in transition.target) {
          layoutState.viewport.x = this.lerp(layoutState.viewport.x, transition.target.x, progress);
          layoutState.viewport.y = this.lerp(layoutState.viewport.y, transition.target.y, progress);
        }
        break;
        
      case 'focus':
        // Focus transitions would adjust viewport to center on target element
        if (typeof transition.target === 'string') {
          const targetElement = layoutState.elements.get(transition.target);
          if (targetElement) {
            const targetX = targetElement.position.x;
            const targetY = targetElement.position.y;
            layoutState.viewport.x = this.lerp(layoutState.viewport.x, targetX, progress);
            layoutState.viewport.y = this.lerp(layoutState.viewport.y, targetY, progress);
          }
        }
        break;
    }
  }

  /**
   * Apply layout change event to layout state
   */
  private async applyLayoutChangeEvent(
    event: TimelineEvent,
    layoutState: LayoutState,
    progress: number
  ): Promise<void> {
    // Layout change events would trigger region reorganization
    // This would integrate with the layout engine from Phase 3
    
    // For now, mark affected regions as needing update
    for (const hint of event.layoutHints) {
      if (hint.preferredRegion) {
        const region = layoutState.regions.get(hint.preferredRegion);
        if (region) {
          region.available = progress < 0.5; // Temporarily unavailable during transition
        }
      }
    }
  }

  /**
   * Apply emphasis event to layout state
   */
  private async applyEmphasisEvent(
    event: TimelineEvent,
    layoutState: LayoutState,
    progress: number
  ): Promise<void> {
    // Emphasis events affect visual hierarchy
    const targetElements = event.layoutHints
      .filter(hint => hint.relationshipTargets)
      .flatMap(hint => hint.relationshipTargets || []);
    
    for (const elementId of targetElements) {
      const element = layoutState.elements.get(elementId);
      if (element && progress < 1.0) {
        // Increase Z-index for emphasis
        element.zIndex += Math.floor(progress * 10);
      }
    }
  }

  /**
   * Create a visual element from visual instruction
   */
  private createVisualElement(
    elementId: string,
    visual: any,
    event: TimelineEvent,
    progress: number
  ): VisualElement {
    // This would integrate with the actual layout engine to position elements
    // For now, create a basic element structure
    
    return {
      id: elementId,
      type: visual.elementType,
      position: { x: 100, y: 100 }, // Would be calculated by layout engine
      size: { width: 200, height: 100 }, // Would be calculated based on content
      opacity: progress, // Fade in as event progresses
      zIndex: 1,
      properties: visual.properties || {},
      sourceEventId: event.id,
      lifecycle: progress < 1.0 ? 'entering' : 'stable',
    };
  }

  /**
   * Modify an existing visual element
   */
  private modifyVisualElement(
    element: VisualElement,
    visual: any,
    progress: number
  ): void {
    // Apply modifications based on progress
    if (visual.properties) {
      // Interpolate properties based on progress
      for (const [key, value] of Object.entries(visual.properties)) {
        if (typeof value === 'number' && typeof element.properties[key] === 'number') {
          element.properties[key] = this.lerp(element.properties[key], value, progress);
        } else if (progress >= 1.0) {
          element.properties[key] = value;
        }
      }
    }
  }

  /**
   * Finalize layout state after all events have been applied
   */
  private finalizeLayoutState(layoutState: LayoutState, position: number): void {
    // Update visual hierarchy based on current elements
    layoutState.hierarchy = this.calculateVisualHierarchy(layoutState.elements);
    
    // Update region states
    this.updateRegionStates(layoutState);
    
    // Clean up exited elements
    for (const [elementId, element] of layoutState.elements) {
      if (element.lifecycle === 'exiting' && element.opacity <= 0) {
        layoutState.elements.delete(elementId);
      }
    }
  }

  /**
   * Calculate visual hierarchy from current elements
   */
  private calculateVisualHierarchy(elements: Map<string, VisualElement>): VisualHierarchy {
    const elementsArray = Array.from(elements.values());
    
    // Sort by importance (z-index, size, opacity)
    const sortedElements = elementsArray
      .sort((a, b) => {
        const aImportance = a.zIndex * 1000 + (a.size.width * a.size.height) * a.opacity;
        const bImportance = b.zIndex * 1000 + (b.size.width * b.size.height) * b.opacity;
        return bImportance - aImportance;
      });
    
    return {
      primaryFocus: sortedElements[0]?.id,
      secondary: sortedElements.slice(1, 4).map(e => e.id),
      background: sortedElements.slice(4).map(e => e.id),
      connections: [], // Would be calculated based on layout hints and relationships
    };
  }

  /**
   * Update region occupancy states
   */
  private updateRegionStates(layoutState: LayoutState): void {
    // This would integrate with the responsive regions from Phase 3
    // For now, create basic region states
    
    const regions = ['header', 'main', 'sidebar', 'footer'];
    for (const regionId of regions) {
      if (!layoutState.regions.has(regionId)) {
        layoutState.regions.set(regionId, {
          regionId,
          elements: [],
          occupancy: 0,
          available: true,
        });
      }
    }
  }

  /**
   * Get visible elements at position
   */
  private getVisibleElementsAtPosition(position: number, layoutState: LayoutState): VisualElement[] {
    return Array.from(layoutState.elements.values())
      .filter(element => element.opacity > 0);
  }

  /**
   * Calculate audio state at position
   */
  private calculateAudioStateAtPosition(position: number): AudioState {
    // Find audio events active at this position
    const audioEvents = this.events.filter(event => {
      const eventStart = event.timestamp;
      const eventEnd = event.timestamp + event.duration;
      return event.type === 'narration' && position >= eventStart && position <= eventEnd;
    });
    
    const currentAudio = audioEvents[0];
    const audioState: AudioState = {
      volume: 1.0,
      queue: [],
      properties: {},
    };
    
    if (currentAudio && typeof currentAudio.content === 'object' && currentAudio.content.audio) {
      const audio = currentAudio.content.audio;
      const progress = (position - currentAudio.timestamp) / currentAudio.duration;
      
      audioState.currentAudio = {
        id: currentAudio.id,
        text: audio.text,
        startTime: currentAudio.timestamp,
        duration: currentAudio.duration,
        progress,
      };
    }
    
    return audioState;
  }

  /**
   * Get events that need to be executed for seek
   */
  private getEventsToExecuteForSeek(position: number, activeEvents: TimelineEvent[]): TimelineEvent[] {
    // Return events that should be immediately executed to reach the target state
    return activeEvents.filter(event => {
      // Execute visual and transition events that should be instant
      return event.type === 'visual' || event.type === 'transition';
    });
  }

  /**
   * Cache layout state
   */
  private cacheLayoutState(
    position: number,
    layoutState: LayoutState,
    activeEvents: TimelineEvent[]
  ): void {
    if (!this.config.enableCaching) return;
    
    const cachedState: CachedState = {
      timestamp: position,
      layoutState: this.cloneLayoutState(layoutState),
      activeEvents: [...activeEvents],
      createdAt: performance.now(),
      accessCount: 0,
      lastAccessed: performance.now(),
    };
    
    this.layoutStateCache.set(position, cachedState);
    
    // Optimize cache if it's getting too large
    if (this.layoutStateCache.size > this.config.cacheSize * 1.2) {
      this.optimizeCache();
    }
  }

  /**
   * Check if a state should be cached
   */
  private shouldCacheState(position: number, seekTime: number): boolean {
    if (!this.config.enableCaching) return false;
    
    // Cache if seek took longer than average (expensive to recalculate)
    const avgSeekTime = this.seekTimes.length > 0
      ? this.seekTimes.reduce((sum, time) => sum + time, 0) / this.seekTimes.length
      : 0;
    
    return seekTime > avgSeekTime * 1.5;
  }

  /**
   * Calculate cache score for cache optimization
   */
  private calculateCacheScore(state: CachedState): number {
    const now = performance.now();
    const age = now - state.createdAt;
    const timeSinceAccess = now - state.lastAccessed;
    
    // Higher score = more valuable (less likely to be removed)
    const accessScore = state.accessCount * 10;
    const ageScore = Math.max(0, 10000 - age / 1000); // Prefer newer entries
    const recentAccessScore = Math.max(0, 5000 - timeSinceAccess / 1000); // Prefer recently accessed
    
    return accessScore + ageScore + recentAccessScore;
  }

  /**
   * Create empty layout state
   */
  private createEmptyLayoutState(timestamp: number): LayoutState {
    return {
      viewport: { x: 0, y: 0, zoom: 1.0 },
      elements: new Map(),
      regions: new Map(),
      hierarchy: { secondary: [], background: [], connections: [] },
      animations: new Map(),
      timestamp,
    };
  }

  /**
   * Clone layout state for modification
   */
  private cloneLayoutState(state: LayoutState): LayoutState {
    return {
      viewport: { ...state.viewport },
      elements: new Map(Array.from(state.elements.entries()).map(([id, element]) => [
        id, { ...element, position: { ...element.position }, size: { ...element.size } }
      ])),
      regions: new Map(Array.from(state.regions.entries()).map(([id, region]) => [
        id, { ...region, elements: [...region.elements] }
      ])),
      hierarchy: {
        primaryFocus: state.hierarchy.primaryFocus,
        secondary: [...state.hierarchy.secondary],
        background: [...state.hierarchy.background],
        connections: state.hierarchy.connections.map(conn => ({ ...conn })),
      },
      animations: new Map(state.animations),
      timestamp: state.timestamp,
    };
  }

  /**
   * Linear interpolation utility
   */
  private lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * progress;
  }

  /**
   * Record seek time for performance metrics
   */
  private recordSeekTime(seekTime: number): void {
    this.seekTimes.push(seekTime);
    
    // Keep only last 100 seek times
    if (this.seekTimes.length > 100) {
      this.seekTimes.shift();
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

export default SeekOptimizer;