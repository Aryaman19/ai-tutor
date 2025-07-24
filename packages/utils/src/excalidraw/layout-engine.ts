import { createServiceLogger } from '../logger';
import type { StreamingTimelineChunk, TimelineEvent } from '@ai-tutor/types';

const logger = createServiceLogger('LayoutEngine');

export interface CanvasElement {
  id: string;
  type: 'text' | 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'line' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: 'solid' | 'hachure' | 'cross-hatch' | 'dots';
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed';
  roughness: number;
  opacity: number;
  strokeSharpness: 'round' | 'sharp';
  seed: number;
  groupIds: string[];
  roundness: any;
  boundElements: any;
  updated: number;
  link: any;
  locked: boolean;
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  versionNonce: number;
  isDeleted: boolean;
  customData: any;
}

export interface CanvasState {
  elements: CanvasElement[];
  timestamp: number;
  duration: number;
  viewBox: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
  };
  metadata?: {
    chunkId?: string;
    eventId?: string;
    contentType?: string;
    title?: string;
  };
}

export interface LayoutEngineOptions {
  canvasWidth: number;
  canvasHeight: number;
  elementSpacing: number;
  fontSize: number;
  maxElementsPerScreen: number;
  autoScroll: boolean;
  animationDuration: number;
}

/**
 * LayoutEngine class that processes semantic JSON and creates timeline-based canvas rendering
 * Handles automatic canvas navigation, element positioning, and visual transitions
 */
export class LayoutEngine {
  private options: LayoutEngineOptions;
  private canvasStates: CanvasState[] = [];
  private elementCache: Map<string, CanvasElement> = new Map();
  private currentViewBox = { x: 0, y: 0, width: 800, height: 600, zoom: 1 };

  constructor(options: Partial<LayoutEngineOptions> = {}) {
    this.options = {
      canvasWidth: 800,
      canvasHeight: 600,
      elementSpacing: 80,
      fontSize: 16,
      maxElementsPerScreen: 8,
      autoScroll: true,
      animationDuration: 300,
      ...options
    };

    this.currentViewBox = {
      x: 0,
      y: 0,
      width: this.options.canvasWidth,
      height: this.options.canvasHeight,
      zoom: 1
    };

    logger.debug('LayoutEngine initialized', { options: this.options });
  }

  /**
   * Process semantic JSON data and create timeline-based canvas states
   */
  processSemanticData(data: any, audioSegments: any[] = []): CanvasState[] {
    logger.debug('Processing semantic data for layout', {
      dataType: typeof data,
      hasChunks: !!data.chunks,
      chunksLength: data.chunks?.length || 0,
      audioSegmentsLength: audioSegments.length
    });

    const states: CanvasState[] = [];
    let currentTime = 0;

    // Handle different data formats
    if (data.chunks && Array.isArray(data.chunks)) {
      // StreamingTimelineChunk format
      data.chunks.forEach((chunk: StreamingTimelineChunk, chunkIndex: number) => {
        if (chunk.events && Array.isArray(chunk.events)) {
          chunk.events.forEach((event: TimelineEvent, eventIndex: number) => {
            const canvasData = this.extractCanvasData(event);
            const audioSegment = audioSegments.find(seg => 
              seg.metadata?.chunkId === chunk.chunkId && 
              seg.metadata?.eventId === event.id
            );

            if (canvasData || audioSegment) {
              const duration = audioSegment?.duration || this.estimateEventDuration(event);
              
              const elements = this.createElementsFromEvent(event, chunkIndex, eventIndex);
              const viewBox = this.calculateOptimalViewBox(elements);

              states.push({
                elements,
                timestamp: currentTime,
                duration,
                viewBox,
                metadata: {
                  chunkId: chunk.chunkId,
                  eventId: event.id,
                  contentType: chunk.contentType || event.semanticType,
                  title: this.extractTitle(event)
                }
              });

              currentTime += duration;
            }
          });
        }
      });
    } else if (data.events && Array.isArray(data.events)) {
      // Direct events array
      data.events.forEach((event: any, index: number) => {
        const audioSegment = audioSegments[index];
        const duration = audioSegment?.duration || this.estimateEventDuration(event);
        
        const elements = this.createElementsFromEvent(event, 0, index);
        const viewBox = this.calculateOptimalViewBox(elements);

        states.push({
          elements,
          timestamp: currentTime,
          duration,
          viewBox,
          metadata: {
            eventId: event.id || `event_${index}`,
            contentType: event.type || event.semanticType,
            title: this.extractTitle(event)
          }
        });

        currentTime += duration;
      });
    }

    this.canvasStates = states;

    logger.debug('Processed layout data', {
      statesCount: states.length,
      totalDuration: currentTime,
      states: states.map(s => ({
        timestamp: s.timestamp,
        duration: s.duration,
        elementsCount: s.elements.length,
        title: s.metadata?.title
      }))
    });

    return states;
  }

  /**
   * Extract canvas/visual data from event content
   */
  private extractCanvasData(event: any): any {
    if (event.content && typeof event.content === 'object') {
      // Visual content
      if (event.content.visual) {
        return event.content.visual;
      }
      
      // Canvas content
      if (event.content.canvas) {
        return event.content.canvas;
      }
      
      // Elements array
      if (event.content.elements) {
        return { elements: event.content.elements };
      }
    }

    // Direct canvas properties
    if (event.visual || event.canvas || event.elements) {
      return event.visual || event.canvas || { elements: event.elements };
    }

    return null;
  }

  /**
   * Create Excalidraw elements from event data
   */
  private createElementsFromEvent(event: any, chunkIndex: number, eventIndex: number): CanvasElement[] {
    const elements: CanvasElement[] = [];
    const canvasData = this.extractCanvasData(event);
    
    // Get text content for display
    const textContent = this.extractTextContent(event);
    
    if (canvasData && canvasData.elements && Array.isArray(canvasData.elements)) {
      // Process existing elements
      canvasData.elements.forEach((element: any, elemIndex: number) => {
        const processedElement = this.processElement(element, chunkIndex, eventIndex, elemIndex);
        if (processedElement) {
          elements.push(processedElement);
        }
      });
    } else if (textContent) {
      // Create text element from content
      const textElement = this.createTextElement(
        textContent,
        chunkIndex,
        eventIndex,
        0
      );
      elements.push(textElement);
    }

    // Auto-position elements if needed
    if (elements.length > 0) {
      this.autoPositionElements(elements, chunkIndex);
    }

    return elements;
  }

  /**
   * Process and normalize element data
   */
  private processElement(element: any, chunkIndex: number, eventIndex: number, elemIndex: number): CanvasElement | null {
    if (!element || typeof element !== 'object') {
      return null;
    }

    const id = element.id || `element-${chunkIndex}-${eventIndex}-${elemIndex}`;
    
    // Check cache first
    if (this.elementCache.has(id)) {
      const cached = this.elementCache.get(id)!;
      // Update position and visibility
      return { ...cached, id };
    }

    const processedElement: CanvasElement = {
      id,
      type: element.type || 'text',
      x: element.x || 50,
      y: element.y || 50,
      width: element.width || 200,
      height: element.height || 50,
      angle: element.angle || 0,
      strokeColor: element.strokeColor || '#1e1e1e',
      backgroundColor: element.backgroundColor || 'transparent',
      fillStyle: element.fillStyle || 'solid',
      strokeWidth: element.strokeWidth || 1,
      strokeStyle: element.strokeStyle || 'solid',
      roughness: element.roughness || 1,
      opacity: element.opacity || 100,
      strokeSharpness: element.strokeSharpness || 'sharp',
      seed: element.seed || Math.floor(Math.random() * 1000000),
      groupIds: element.groupIds || [],
      roundness: element.roundness || { type: 'round' },
      boundElements: element.boundElements || null,
      updated: Date.now(),
      link: element.link || null,
      locked: element.locked || false,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      customData: element.customData || null
    };

    // Add text properties if it's a text element
    if (element.type === 'text' || element.text) {
      processedElement.text = element.text || '';
      processedElement.fontSize = element.fontSize || this.options.fontSize;
      processedElement.fontFamily = element.fontFamily || 1;
      processedElement.textAlign = element.textAlign || 'left';
      processedElement.verticalAlign = element.verticalAlign || 'top';
    }

    // Cache the element
    this.elementCache.set(id, processedElement);

    return processedElement;
  }

  /**
   * Create a text element from content
   */
  private createTextElement(text: string, chunkIndex: number, eventIndex: number, elemIndex: number): CanvasElement {
    const id = `text-${chunkIndex}-${eventIndex}-${elemIndex}`;
    
    // Truncate long text for better display
    const displayText = text.length > 150 ? text.substring(0, 150) + '...' : text;
    
    // Calculate dimensions based on text length
    const estimatedWidth = Math.min(Math.max(displayText.length * 8, 200), 700);
    const estimatedHeight = Math.max(Math.ceil(displayText.length / 80) * 25, 50);

    const textElement: CanvasElement = {
      id,
      type: 'text',
      x: 50,
      y: 50,
      width: estimatedWidth,
      height: estimatedHeight,
      angle: 0,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      strokeSharpness: 'sharp',
      seed: Math.floor(Math.random() * 1000000),
      groupIds: [],
      roundness: { type: 'round' },
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      text: displayText,
      fontSize: this.options.fontSize,
      fontFamily: 1,
      textAlign: 'left',
      verticalAlign: 'top',
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      customData: null
    };

    this.elementCache.set(id, textElement);
    return textElement;
  }

  /**
   * Auto-position elements to prevent overlap and optimize layout
   */
  private autoPositionElements(elements: CanvasElement[], chunkIndex: number): void {
    const startY = 50 + (chunkIndex * 100); // Vertical offset per chunk
    let currentY = startY;

    elements.forEach((element, index) => {
      // Position elements vertically with spacing
      element.x = 50;
      element.y = currentY;
      
      currentY += element.height + this.options.elementSpacing;
      
      // Reset Y if we exceed screen bounds
      if (currentY > this.options.canvasHeight - 100) {
        currentY = startY;
        element.x += 400; // Move to next column
      }
    });
  }

  /**
   * Calculate optimal viewBox for elements
   */
  private calculateOptimalViewBox(elements: CanvasElement[]): { x: number; y: number; width: number; height: number; zoom: number } {
    if (elements.length === 0) {
      return { ...this.currentViewBox };
    }

    // Find bounds of all elements
    const bounds = {
      minX: Math.min(...elements.map(e => e.x)),
      minY: Math.min(...elements.map(e => e.y)),
      maxX: Math.max(...elements.map(e => e.x + e.width)),
      maxY: Math.max(...elements.map(e => e.y + e.height))
    };

    // Add padding
    const padding = 50;
    const viewBox = {
      x: bounds.minX - padding,
      y: bounds.minY - padding,
      width: bounds.maxX - bounds.minX + (padding * 2),
      height: bounds.maxY - bounds.minY + (padding * 2),
      zoom: 1
    };

    // Ensure minimum size
    viewBox.width = Math.max(viewBox.width, this.options.canvasWidth);
    viewBox.height = Math.max(viewBox.height, this.options.canvasHeight);

    return viewBox;
  }

  /**
   * Extract text content from event
   */
  private extractTextContent(event: any): string | null {
    // Direct text content
    if (typeof event.content === 'string' && event.content.trim()) {
      return event.content.trim();
    }

    // Structured content
    if (event.content && typeof event.content === 'object') {
      if (event.content.audio && event.content.audio.text) {
        return event.content.audio.text;
      }
      
      if (event.content.visual && event.content.visual.text) {
        return event.content.visual.text;
      }
      
      if (event.content.text) {
        return event.content.text;
      }
    }

    // Direct properties
    if (event.text && typeof event.text === 'string') {
      return event.text;
    }

    if (event.narration && typeof event.narration === 'string') {
      return event.narration;
    }

    return null;
  }

  /**
   * Extract title from event
   */
  private extractTitle(event: any): string | undefined {
    if (event.title) return event.title;
    if (event.content?.title) return event.content.title;
    if (event.metadata?.title) return event.metadata.title;
    return undefined;
  }

  /**
   * Estimate event duration for timing
   */
  private estimateEventDuration(event: any): number {
    if (event.duration) return event.duration;
    
    const text = this.extractTextContent(event);
    if (text) {
      const words = text.split(/\s+/).length;
      return Math.max((words / 160) * 60 * 1000, 2000); // ~160 WPM, min 2 seconds
    }
    
    return 3000; // Default 3 seconds
  }

  /**
   * Get canvas state at specific timestamp
   */
  getStateAtTime(timestamp: number): CanvasState | null {
    return this.canvasStates.find(state => 
      timestamp >= state.timestamp && 
      timestamp < state.timestamp + state.duration
    ) || null;
  }

  /**
   * Get all canvas states
   */
  getStates(): CanvasState[] {
    return [...this.canvasStates];
  }

  /**
   * Clear all data and reset engine
   */
  reset(): void {
    this.canvasStates = [];
    this.elementCache.clear();
    this.currentViewBox = {
      x: 0,
      y: 0,
      width: this.options.canvasWidth,
      height: this.options.canvasHeight,
      zoom: 1
    };
    
    logger.debug('LayoutEngine reset');
  }

  /**
   * Static factory method to create and process data in one call
   */
  static createFromSemanticData(
    semanticData: any,
    audioSegments: any[] = [],
    options: Partial<LayoutEngineOptions> = {}
  ): { engine: LayoutEngine; states: CanvasState[] } {
    const engine = new LayoutEngine(options);
    const states = engine.processSemanticData(semanticData, audioSegments);
    
    return { engine, states };
  }
}

export default LayoutEngine;