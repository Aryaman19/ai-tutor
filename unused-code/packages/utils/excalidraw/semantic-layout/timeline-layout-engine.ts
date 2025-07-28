/**
 * Timeline Layout Engine
 * 
 * Core engine for timeline-based semantic layout with instant seek capability.
 * Integrates Phase 1 timeline events, Phase 2 chunked generation, and Phase 3 responsive regions.
 */

import type { TimelineEvent } from '@ai-tutor/types';
import type { ExcalidrawElement } from '../types';
import type { ResponsiveRegionManager, LayoutRegion } from './responsive-regions';
import type { CollisionDetector, ElementPlacementContext } from './collision-detector';
import { LayoutCache, type LayoutCacheEntry } from './layout-cache';
import { 
  getEventContentString, 
  getEventSemanticType, 
  getEventContentLength 
} from '../timeline-utils';

export interface TimelineLayoutState {
  timestamp: number; // Current timeline position in milliseconds
  visibleElements: Map<string, ExcalidrawElement>; // Elements visible at this timestamp
  elementPositions: Map<string, { x: number; y: number; zIndex: number }>; // Cached positions
  regionState: Map<string, { occupancy: number; lastUpdate: number }>; // Region usage state
  transitionElements: Map<string, ElementTransition>; // Elements in transition
  regionAssignments: Map<string, string>; // element ID -> region ID
  transitions: ElementTransition[]; // Array of transitions
}

export interface ElementTransition {
  elementId: string;
  startTime: number;
  endTime: number;
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
  type: 'enter' | 'exit' | 'move' | 'update';
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface LayoutPlan {
  elements: ExcalidrawElement[];
  transitions: ElementTransition[];
  regionAssignments: Map<string, string>; // element ID -> region ID
  timeline: {
    duration: number;
    keyframes: number[]; // Important timestamps for layout changes
  };
}

export interface SeekResult {
  elements: ExcalidrawElement[];
  transitions: ElementTransition[];
  seekTime: number; // Actual time taken for seek operation
}

export interface TimelineLayoutConfig {
  enableAnimations: boolean;
  defaultTransitionDuration: number;
  maxSeekCacheSize: number;
  precacheRadius: number; // How far ahead/behind to precache
  performanceMode: 'quality' | 'performance' | 'auto';
}

export class TimelineLayoutEngine {
  private regionManager: ResponsiveRegionManager;
  private collisionDetector: CollisionDetector;
  private layoutCache: LayoutCache;
  private currentState: TimelineLayoutState;
  private timelineEvents: Map<string, TimelineEvent> = new Map();
  private config: TimelineLayoutConfig;
  private eventTimeline: number[] = []; // Sorted timeline of all event times
  private totalDuration: number = 0;
  
  constructor(
    regionManager: ResponsiveRegionManager,
    collisionDetector: CollisionDetector,
    config?: Partial<TimelineLayoutConfig>
  ) {
    this.regionManager = regionManager;
    this.collisionDetector = collisionDetector;
    this.layoutCache = new LayoutCache();
    
    this.config = {
      enableAnimations: true,
      defaultTransitionDuration: 500,
      maxSeekCacheSize: 50,
      precacheRadius: 5000, // 5 seconds in each direction
      performanceMode: 'auto',
      ...config
    };

    this.currentState = this.createEmptyState();
  }

  private createEmptyState(): TimelineLayoutState {
    return {
      timestamp: 0,
      visibleElements: new Map(),
      elementPositions: new Map(),
      regionState: new Map(),
      transitionElements: new Map(),
      regionAssignments: new Map(),
      transitions: []
    };
  }

  /**
   * Load timeline events from Phase 1 & Phase 2 systems
   */
  public loadTimelineEvents(events: TimelineEvent[]): void {
    this.timelineEvents.clear();
    this.eventTimeline = [];

    for (const event of events) {
      this.timelineEvents.set(event.id, event);
      
      // Add event start time to timeline
      if (event.timestamp !== undefined) {
        this.eventTimeline.push(event.timestamp);
      }
      
      // Add event end time to timeline if it has duration
      if (event.timestamp !== undefined && event.duration) {
        this.eventTimeline.push(event.timestamp + event.duration);
      }
    }

    // Sort and deduplicate timeline
    this.eventTimeline = [...new Set(this.eventTimeline)].sort((a, b) => a - b);
    
    // Precache initial layouts
    this.precacheLayouts(0, Math.min(this.config.precacheRadius, this.eventTimeline[this.eventTimeline.length - 1] || 0));
  }

  /**
   * Instantly seek to any timeline position with layout state reconstruction
   */
  public seekToTimestamp(timestamp: number): SeekResult {
    const seekStartTime = performance.now();

    // Check cache first for performance
    const cachedLayout = this.layoutCache.get(timestamp);
    if (cachedLayout) {
      this.currentState = this.reconstructStateFromCache(cachedLayout);
      return {
        elements: Array.from(this.currentState.visibleElements.values()),
        transitions: Array.from(this.currentState.transitionElements.values()),
        seekTime: performance.now() - seekStartTime
      };
    }

    // Calculate which events should be active at this timestamp
    const activeEvents = this.getActiveEventsAtTimestamp(timestamp);
    
    // Generate layout for active events
    const layoutPlan = this.generateLayoutPlan(activeEvents, timestamp);
    
    // Update current state
    this.updateStateFromLayoutPlan(layoutPlan, timestamp);
    
    // Cache the result for future seeks
    this.layoutCache.set(timestamp, this.createCacheEntry(this.currentState, layoutPlan));

    // Trigger background precaching for nearby timestamps
    this.precacheNearbyTimestamps(timestamp);

    return {
      elements: Array.from(this.currentState.visibleElements.values()),
      transitions: layoutPlan.transitions,
      seekTime: performance.now() - seekStartTime
    };
  }

  /**
   * Get all events that should be active (visible) at a specific timestamp
   */
  private getActiveEventsAtTimestamp(timestamp: number): TimelineEvent[] {
    const activeEvents: TimelineEvent[] = [];

    for (const event of this.timelineEvents.values()) {
      const startTime = event.timestamp || 0;
      const endTime = startTime + (event.duration || 1000); // Default 1 second duration

      if (timestamp >= startTime && timestamp < endTime) {
        activeEvents.push(event);
      }
    }

    return activeEvents.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  /**
   * Generate a complete layout plan for given events
   */
  private generateLayoutPlan(events: TimelineEvent[], timestamp: number): LayoutPlan {
    const plan: LayoutPlan = {
      elements: [],
      transitions: [],
      regionAssignments: new Map(),
      timeline: {
        duration: Math.max(...events.map(e => (e.timestamp || 0) + (e.duration || 1000)), timestamp),
        keyframes: events.map(e => e.timestamp || 0)
      }
    };

    // Clear regions and collision detector for fresh layout
    this.regionManager.clearPlacements();
    this.collisionDetector.clear();

    // Position each event's visual elements
    for (const event of events) {
      const eventElements = this.createElementsForEvent(event);
      
      if (eventElements.length === 0) continue;

      // Find optimal region for this event
      const region = this.regionManager.findOptimalRegion(event);
      if (!region) {
        console.warn(`No region found for event: ${event.id}`);
        continue;
      }

      // Position elements within the region with collision avoidance
      for (const element of eventElements) {
        const context: ElementPlacementContext = {
          element,
          timelineEvent: event,
          targetRegion: region,
          priority: this.calculateElementPriority(event, element),
          canReposition: true
        };

        // Get region position
        const regionPosition = this.regionManager.reserveRegionSpace(region, element, event.timestamp);
        
        if (regionPosition) {
          // Apply collision detection and avoidance
          const { x, y, collision } = this.collisionDetector.findCollisionFreePosition(
            context,
            regionPosition,
            10 // max attempts
          );

          const positionedElement: ExcalidrawElement = {
            ...element,
            x,
            y,
            updated: Date.now(),
            versionNonce: Math.floor(Math.random() * 2147483647)
          };

          plan.elements.push(positionedElement);
          plan.regionAssignments.set(element.id, region.id);

          // Add element to collision detector
          this.collisionDetector.addElement(positionedElement);

          // Create transition if this is a new element
          if (!this.currentState.visibleElements.has(element.id)) {
            plan.transitions.push({
              elementId: element.id,
              startTime: timestamp,
              endTime: timestamp + this.config.defaultTransitionDuration,
              startPosition: { x, y },
              endPosition: { x, y },
              type: 'enter',
              easing: 'ease-out'
            });
          }
        }
      }
    }

    // Handle element exits (elements that were visible but no longer should be)
    for (const [elementId, element] of this.currentState.visibleElements) {
      const isStillActive = events.some(event => 
        this.createElementsForEvent(event).some(e => e.id === elementId)
      );

      if (!isStillActive) {
        plan.transitions.push({
          elementId,
          startTime: timestamp,
          endTime: timestamp + this.config.defaultTransitionDuration,
          startPosition: { x: element.x, y: element.y },
          endPosition: { x: element.x, y: element.y },
          type: 'exit',
          easing: 'ease-in'
        });
      }
    }

    return plan;
  }

  /**
   * Create Excalidraw elements for a timeline event using Phase 2 content analysis
   */
  private createElementsForEvent(event: TimelineEvent): ExcalidrawElement[] {
    const elements: ExcalidrawElement[] = [];

    // Create text element for event content - always create one
    const contentText = getEventContentString(event) || 'Timeline event content';
    console.log(`🎨 Creating text element for event ${event.id}: "${contentText.substring(0, 50)}..."`); 
    
    if (contentText && contentText.trim() !== '') {
      const textElement: ExcalidrawElement = {
        id: `${event.id}_text`,
        type: 'text',
        x: 0, // Will be positioned by region manager
        y: 0,
        width: 300,
        height: 100,
        angle: 0,
        strokeColor: '#1e1e1e',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: Math.floor(Math.random() * 2147483647),
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: null,
        locked: false,
        index: `timeline_${event.id}_${Date.now()}`,
        text: contentText.length > 100 ? contentText.substring(0, 100) + '...' : contentText,
        fontSize: this.calculateFontSizeForEvent(event),
        fontFamily: 1, // Virgil font family
        textAlign: 'left',
        verticalAlign: 'top'
      };

      elements.push(textElement);
    }

    // Create additional elements based on semantic type
    const semanticType = getEventSemanticType(event);
    if (semanticType) {
      console.log(`🎨 Creating semantic elements for event ${event.id} (type: ${semanticType})`);
      const semanticElements = this.createSemanticElements(event);
      console.log(`🎨 Created ${semanticElements.length} semantic elements:`, semanticElements.map(e => `${e.type}(${e.id})`));
      elements.push(...semanticElements);
    }

    return elements;
  }

  private createSemanticElements(event: TimelineEvent): ExcalidrawElement[] {
    const elements: ExcalidrawElement[] = [];
    const baseId = `${event.id}_semantic`;

    switch (getEventSemanticType(event)) {
      case 'process':
        // Create arrow elements for process steps
        elements.push(this.createArrowElement(`${baseId}_arrow`, 50, 50, 200, 50));
        break;
        
      case 'comparison':
        // Create side-by-side rectangles
        elements.push(
          this.createRectangleElement(`${baseId}_rect1`, 0, 0, 120, 80, '#e3f2fd'),
          this.createRectangleElement(`${baseId}_rect2`, 140, 0, 120, 80, '#fff3e0')
        );
        break;
        
      case 'definition':
        // Create a highlight box with text
        elements.push(
          this.createRectangleElement(`${baseId}_highlight`, 0, 0, 300, 100, '#f3e5f5', '#9c27b0')
        );
        // Add text content inside the highlight box
        const definitionText: ExcalidrawElement = {
          id: `${baseId}_definition_text`,
          type: 'text',
          x: 20,
          y: 30,
          width: 260,
          height: 40,
          angle: 0,
          strokeColor: '#9c27b0',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 1,
          strokeStyle: 'solid',
          roughness: 1,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: null,
          seed: Math.floor(Math.random() * 2147483647),
          versionNonce: Math.floor(Math.random() * 2147483647),
          isDeleted: false,
          boundElements: [],
          updated: Date.now(),
          link: null,
          locked: false,
          index: `semantic_text_${Date.now()}`,
          text: getEventContentString(event)?.substring(0, 80) + (getEventContentLength(event) > 80 ? '...' : '') || `Definition content for ${event.id}`,
          fontSize: 16,
          fontFamily: 1,
          textAlign: 'left',
          verticalAlign: 'top'
        } as ExcalidrawElement;
        elements.push(definitionText);
        break;
        
      case 'concept_map':
        // Create connected nodes
        elements.push(
          this.createEllipseElement(`${baseId}_node1`, 0, 0, 100, 60),
          this.createEllipseElement(`${baseId}_node2`, 150, 80, 100, 60),
          this.createArrowElement(`${baseId}_connection`, 50, 30, 200, 110)
        );
        break;
    }

    return elements;
  }

  private createArrowElement(id: string, x1: number, y1: number, x2: number, y2: number): ExcalidrawElement {
    return {
      id,
      type: 'arrow',
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
      angle: 0,
      strokeColor: '#1976d2',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 2 },
      seed: Math.floor(Math.random() * 2147483647),
      versionNonce: Math.floor(Math.random() * 2147483647),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      index: `semantic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      points: [[0, 0], [x2 - x1, y2 - y1]],
      lastCommittedPoint: [x2 - x1, y2 - y1],
      startArrowhead: null,
      endArrowhead: 'arrow'
    };
  }

  private createRectangleElement(id: string, x: number, y: number, width: number, height: number, bgColor = '#ffffff', strokeColor = '#000000'): ExcalidrawElement {
    return {
      id,
      type: 'rectangle',
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor,
      backgroundColor: bgColor,
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 3 },
      seed: Math.floor(Math.random() * 2147483647),
      versionNonce: Math.floor(Math.random() * 2147483647),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      index: `semantic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  private createEllipseElement(id: string, x: number, y: number, width: number, height: number): ExcalidrawElement {
    return {
      id,
      type: 'ellipse',
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: '#4caf50',
      backgroundColor: '#e8f5e8',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: Math.floor(Math.random() * 2147483647),
      versionNonce: Math.floor(Math.random() * 2147483647),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      index: `semantic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  private calculateFontSizeForEvent(event: TimelineEvent): number {
    // Base font size on content length and semantic importance
    const baseSize = 16;
    const contentLength = getEventContentLength(event);
    
    if (contentLength < 50) return Math.min(24, baseSize + 8);
    if (contentLength < 100) return Math.min(20, baseSize + 4);
    if (contentLength < 200) return baseSize;
    return Math.max(12, baseSize - 4);
  }

  private calculateElementPriority(event: TimelineEvent, element: ExcalidrawElement): number {
    let priority = 5; // Base priority

    // Higher priority for important semantic types
    switch (getEventSemanticType(event)) {
      case 'definition': priority += 3; break;
      case 'formula': priority += 2; break;
      case 'concept_map': priority += 2; break;
      case 'process': priority += 1; break;
    }

    // Higher priority for text elements
    if (element.type === 'text') priority += 1;

    // Higher priority for elements that appear earlier in timeline
    const timeBonus = Math.max(0, 10 - ((event.timestamp || 0) / 1000));
    priority += timeBonus;

    return priority;
  }

  private updateStateFromLayoutPlan(plan: LayoutPlan, timestamp: number): void {
    this.currentState.timestamp = timestamp;
    this.currentState.visibleElements.clear();
    this.currentState.elementPositions.clear();
    this.currentState.transitionElements.clear();

    // Update visible elements
    for (const element of plan.elements) {
      this.currentState.visibleElements.set(element.id, element);
      this.currentState.elementPositions.set(element.id, {
        x: element.x,
        y: element.y,
        zIndex: 1
      });
    }

    // Update transition elements
    for (const transition of plan.transitions) {
      this.currentState.transitionElements.set(transition.elementId, transition);
    }

    // Update region state
    this.currentState.regionState.clear();
    for (const region of this.regionManager.getAllRegions()) {
      this.currentState.regionState.set(region.id, {
        occupancy: region.currentLoad,
        lastUpdate: timestamp
      });
    }
  }

  private createCacheEntry(state: TimelineLayoutState, plan: LayoutPlan): LayoutCacheEntry {
    return {
      timestamp: state.timestamp,
      elements: Array.from(state.visibleElements.values()),
      regionAssignments: new Map(plan.regionAssignments),
      transitionData: Array.from(state.transitionElements.values()),
      createdAt: Date.now(),
      accessCount: 1,
      computationTime: 0 // Would be calculated during generation
    };
  }

  private reconstructStateFromCache(cacheEntry: LayoutCacheEntry): TimelineLayoutState {
    const state = this.createEmptyState();
    state.timestamp = cacheEntry.timestamp;

    for (const element of cacheEntry.elements) {
      state.visibleElements.set(element.id, element);
      state.elementPositions.set(element.id, {
        x: element.x,
        y: element.y,
        zIndex: 1
      });
    }

    for (const transition of cacheEntry.transitionData) {
      state.transitionElements.set(transition.elementId, transition);
    }

    return state;
  }

  private precacheLayouts(startTime: number, endTime: number): void {
    const keyTimestamps = this.eventTimeline.filter(t => t >= startTime && t <= endTime);
    
    // Limit precaching to avoid performance issues
    const maxPrecache = Math.min(keyTimestamps.length, 20);
    
    for (let i = 0; i < maxPrecache; i++) {
      const timestamp = keyTimestamps[i];
      if (!this.layoutCache.has(timestamp)) {
        // Background precache (don't block main thread)
        setTimeout(() => {
          this.seekToTimestamp(timestamp);
        }, i * 10); // Stagger the precaching
      }
    }
  }

  private precacheNearbyTimestamps(currentTimestamp: number): void {
    const radius = this.config.precacheRadius;
    const startTime = currentTimestamp - radius;
    const endTime = currentTimestamp + radius;
    
    // Run precaching in background
    setTimeout(() => {
      this.precacheLayouts(startTime, endTime);
    }, 50);
  }

  /**
   * Get current timeline state
   */
  public getCurrentState(): TimelineLayoutState {
    return { ...this.currentState };
  }

  /**
   * Get timeline duration
   */
  public getTimelineDuration(): number {
    if (this.eventTimeline.length === 0) return 0;
    return this.eventTimeline[this.eventTimeline.length - 1];
  }

  /**
   * Get all keyframe timestamps
   */
  public getKeyframes(): number[] {
    return [...this.eventTimeline];
  }

  /**
   * Update layout configuration
   */
  public updateConfig(newConfig: Partial<TimelineLayoutConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Clear all cached layouts
   */
  public clearCache(): void {
    this.layoutCache.clear();
  }

  /**
   * Get performance metrics
   */
  public getPerformanceMetrics() {
    return {
      cacheSize: this.layoutCache.size,
      cacheHitRate: this.layoutCache.getHitRate(),
      totalSeekOperations: this.layoutCache.getTotalAccesses(),
      averageSeekTime: this.layoutCache.getAverageComputationTime()
    };
  }

  /**
   * Update timeline data with new events
   */
  public updateTimelineData(timelineEvents: TimelineEvent[]): void {
    // Store the new timeline events in the map
    this.timelineEvents.clear();
    timelineEvents.forEach((event, index) => {
      this.timelineEvents.set(event.id || `event_${index}`, event);
    });
    
    // Clear cache to force regeneration with new data
    this.layoutCache.clear();
    
    // Reset current state
    this.currentState = {
      timestamp: 0,
      visibleElements: new Map(),
      elementPositions: new Map(),
      regionState: new Map(),
      transitionElements: new Map(),
      regionAssignments: new Map(),
      transitions: []
    };
    
    // Update total duration based on events
    if (timelineEvents.length > 0) {
      const maxEndTime = Math.max(
        ...timelineEvents.map(event => (event.timestamp || 0) + (event.duration || 1000))
      );
      this.totalDuration = Math.max(this.totalDuration, maxEndTime);
      
      // Update event timeline for seeking
      this.eventTimeline = [];
      for (const event of timelineEvents) {
        if (event.timestamp !== undefined) {
          this.eventTimeline.push(event.timestamp);
          if (event.duration) {
            this.eventTimeline.push(event.timestamp + event.duration);
          }
        }
      }
      this.eventTimeline = [...new Set(this.eventTimeline)].sort((a, b) => a - b);
    }
  }
}

/**
 * Factory function to create a timeline layout engine
 */
export function createTimelineLayoutEngine(
  regionManager: ResponsiveRegionManager,
  collisionDetector: CollisionDetector,
  config?: Partial<TimelineLayoutConfig>
): TimelineLayoutEngine {
  return new TimelineLayoutEngine(regionManager, collisionDetector, config);
}