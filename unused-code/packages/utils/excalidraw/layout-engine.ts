import type { StreamingTimelineChunk, TimelineEvent } from '@ai-tutor/types';

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
    // Multi-slide support
    slideIndex?: number;
    slideOffset?: number;
    slideWidth?: number;
    isMultiSlide?: boolean;
    transitionType?: 'slide-change' | 'timeline-update';
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
  // Responsive options
  minFontSize?: number;
  maxFontSize?: number;
  scalingFactor?: number;
  aspectRatio?: number;
}

export interface ResponsiveSize {
  width: number;
  height: number;
}

export interface ParsedVisualInstruction {
  elementType: 'text' | 'rectangle' | 'circle' | 'arrow' | 'callout';
  position: 'left' | 'center' | 'right' | 'top' | 'bottom';
  label: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
}

export interface LayoutHints {
  semantic?: 'primary' | 'supporting' | 'accent';
  positioning?: 'left' | 'center' | 'right' | 'top' | 'bottom';
  importance?: 'critical' | 'high' | 'medium' | 'low';
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
      // Responsive defaults
      minFontSize: 12,
      maxFontSize: 32,
      scalingFactor: 50, // Responsive scaling factor
      aspectRatio: 16/9,
      ...options
    };

    this.currentViewBox = {
      x: 0,
      y: 0,
      width: this.options.canvasWidth,
      height: this.options.canvasHeight,
      zoom: 1
    };

  }

  /**
   * Process semantic JSON data and create timeline-based canvas states
   */
  processSemanticData(data: any, audioSegments: any[] = []): CanvasState[] {

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
   * Now supports visual instructions and diverse element types
   */
  private createElementsFromEvent(event: any, chunkIndex: number, eventIndex: number): CanvasElement[] {
    const elements: CanvasElement[] = [];
    let elemIndex = 0;
    
    // Process visual instructions if present
    if (event.visual_instruction) {
      const visualSpec = this.parseVisualInstruction(event.visual_instruction);
      if (visualSpec) {
        const visualElement = this.createVisualElement(visualSpec, chunkIndex, eventIndex, elemIndex++);
        elements.push(visualElement);
      }
    }

    // Process visual events (event_type: "visual")
    if (event.event_type === 'visual' && event.content) {
      // For now, create a descriptive text element from visual content
      // TODO: In future versions, parse diagram descriptions into multiple elements
      const visualTextElement = this.createTextElement(
        `[Visual: ${event.content.substring(0, 100)}...]`,
        chunkIndex,
        eventIndex,
        elemIndex++
      );
      elements.push(visualTextElement);
    }

    // Process narration content
    if (event.event_type === 'narration' && event.content) {
      const textContent = this.extractTextContent(event);
      if (textContent) {
        const textElement = this.createTextElement(
          textContent,
          chunkIndex,
          eventIndex,
          elemIndex++
        );
        
        // Apply layout hints if available
        if (event.layout_hints) {
          this.applyLayoutHints(textElement, event.layout_hints);
        }
        
        elements.push(textElement);
      }
    }

    // Process existing canvas data (legacy support)
    const canvasData = this.extractCanvasData(event);
    if (canvasData && canvasData.elements && Array.isArray(canvasData.elements)) {
      canvasData.elements.forEach((element: any) => {
        const processedElement = this.processElement(element, chunkIndex, eventIndex, elemIndex++);
        if (processedElement) {
          elements.push(processedElement);
        }
      });
    }

    // If no elements were created, create a fallback text element
    if (elements.length === 0) {
      const fallbackText = this.extractTextContent(event) || `Event ${eventIndex + 1}`;
      const fallbackElement = this.createTextElement(
        fallbackText,
        chunkIndex,
        eventIndex,
        0
      );
      elements.push(fallbackElement);
    }

    // Apply smart positioning based on element types and positions
    this.applySmartPositioning(elements, chunkIndex);

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
    
    // Smart text truncation that respects word boundaries
    const maxTextLength = Math.floor(this.options.canvasWidth / 8); // Responsive text length
    let displayText = text;
    if (text.length > maxTextLength) {
      const truncated = text.substring(0, maxTextLength);
      const lastSpaceIndex = truncated.lastIndexOf(' ');
      displayText = (lastSpaceIndex > maxTextLength * 0.7) 
        ? truncated.substring(0, lastSpaceIndex) + '...' 
        : truncated + '...';
    }
    
    // Calculate responsive dimensions for text wrapping
    const fontSize = this.options.fontSize;
    const charWidth = fontSize * 0.6;
    const lineHeight = fontSize * 1.4; // Better line spacing for readability
    
    // Responsive max width based on container size
    const containerPadding = Math.max(40, this.options.canvasWidth * 0.1); // 10% padding min 40px
    const maxWidth = this.options.canvasWidth - containerPadding;
    
    // Calculate text wrapping
    const words = displayText.split(' ');
    const avgWordLength = 6; // Average English word length
    const maxCharsPerLine = Math.floor(maxWidth / charWidth);
    const wordsPerLine = Math.floor(maxCharsPerLine / avgWordLength);
    const lines = Math.max(1, Math.ceil(words.length / wordsPerLine));
    
    // Calculate final dimensions
    const textWidth = Math.min(maxWidth, displayText.length * charWidth);
    const textHeight = lines * lineHeight + fontSize * 0.5; // Extra padding for better appearance

    const textElement: CanvasElement = {
      id,
      type: 'text',
      x: 100, // Will be repositioned by autoPositionElements
      y: 100,
      width: textWidth,
      height: textHeight,
      angle: 0,
      strokeColor: '#1971c2', // Better blue color for text
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 0, // Smoother text rendering
      opacity: 100,
      strokeSharpness: 'sharp',
      seed: Math.floor(Math.random() * 1000000),
      groupIds: [],
      roundness: null, // Text elements don't need roundness
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      text: displayText,
      fontSize: this.options.fontSize,
      fontFamily: 1, // Virgil (Excalidraw default)
      textAlign: 'left', // Left align for better readability with wrapping
      verticalAlign: 'top',
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      customData: {
        originalText: text, // Store original text for reference
        responsiveConfig: {
          maxWidth,
          lines,
          fontSize: this.options.fontSize,
          containerWidth: this.options.canvasWidth
        }
      }
    };
    
    this.elementCache.set(id, textElement);
    return textElement;
  }

  /**
   * Apply layout hints to enhance element styling and positioning
   */
  private applyLayoutHints(element: CanvasElement, hints: LayoutHints): void {
    // Store layout hints in custom data for positioning
    if (!element.customData) {
      element.customData = {};
    }
    element.customData.layoutHints = hints;

    // Apply semantic styling
    if (hints.semantic) {
      switch (hints.semantic) {
        case 'primary':
          element.strokeColor = '#dc2626'; // Red for primary content
          element.strokeWidth = 3;
          if (element.fontSize) {
            element.fontSize = Math.max(element.fontSize * 1.3, this.options.fontSize * 1.3);
          }
          break;
        case 'supporting':
          element.strokeColor = '#1971c2'; // Blue for supporting content
          element.strokeWidth = 2;
          break;
        case 'accent':
          element.strokeColor = '#059669'; // Green for accent content
          element.strokeWidth = 1.5;
          break;
      }
    }

    // Apply importance styling
    if (hints.importance) {
      const importanceColor = this.getImportanceColor(hints.importance);
      const importanceStrokeWidth = this.getImportanceStrokeWidth(hints.importance);
      
      element.strokeColor = importanceColor;
      element.strokeWidth = importanceStrokeWidth;
      
      if (element.fontSize && hints.importance === 'critical') {
        element.fontSize = Math.max(element.fontSize * 1.4, this.options.fontSize * 1.4);
      }
    }

  }

  /**
   * Apply smart positioning for multiple elements with different types and positions
   */
  private applySmartPositioning(elements: CanvasElement[], chunkIndex: number): void {
    if (elements.length === 0) return;

    // Group elements by their intended position
    const positionGroups: { [key: string]: CanvasElement[] } = {
      left: [],
      center: [],
      right: [],
      top: [],
      bottom: []
    };

    elements.forEach(element => {
      const visualSpec = element.customData?.visualSpec as ParsedVisualInstruction;
      const layoutHints = element.customData?.layoutHints as LayoutHints;
      
      // Determine position from visual spec, layout hints, or default to center
      let position = 'center';
      if (visualSpec?.position) {
        position = visualSpec.position;
      } else if (layoutHints?.positioning) {
        position = layoutHints.positioning;
      }
      
      positionGroups[position].push(element);
    });

    // Position each group
    Object.keys(positionGroups).forEach(position => {
      const groupElements = positionGroups[position];
      if (groupElements.length > 0) {
        this.positionElementGroup(groupElements, position as any, chunkIndex);
      }
    });

  }

  /**
   * Position a group of elements in a specific area
   */
  private positionElementGroup(elements: CanvasElement[], position: 'left' | 'center' | 'right' | 'top' | 'bottom', chunkIndex: number): void {
    if (elements.length === 0) return;

    const padding = Math.max(20, this.options.canvasWidth * 0.05);
    const spacing = Math.max(this.options.elementSpacing * 0.5, 20);

    switch (position) {
      case 'left':
        this.arrangeVertically(elements, padding, this.options.canvasHeight * 0.3, spacing);
        break;
      case 'right':
        this.arrangeVertically(elements, this.options.canvasWidth - 250 - padding, this.options.canvasHeight * 0.3, spacing);
        break;
      case 'top':
        this.arrangeHorizontally(elements, this.options.canvasWidth * 0.2, padding, spacing);
        break;
      case 'bottom':
        this.arrangeHorizontally(elements, this.options.canvasWidth * 0.2, this.options.canvasHeight - 100 - padding, spacing);
        break;
      case 'center':
      default:
        this.arrangeCentered(elements, chunkIndex);
        break;
    }
  }

  /**
   * Arrange elements vertically
   */
  private arrangeVertically(elements: CanvasElement[], startX: number, startY: number, spacing: number): void {
    let currentY = startY;
    elements.forEach(element => {
      element.x = startX;
      element.y = currentY;
      currentY += element.height + spacing;
    });
  }

  /**
   * Arrange elements horizontally
   */
  private arrangeHorizontally(elements: CanvasElement[], startX: number, startY: number, spacing: number): void {
    let currentX = startX;
    elements.forEach(element => {
      element.x = currentX;
      element.y = startY;
      currentX += element.width + spacing;
    });
  }

  /**
   * Arrange elements in the center area
   */
  private arrangeCentered(elements: CanvasElement[], chunkIndex: number): void {
    if (elements.length === 1) {
      const element = elements[0];
      element.x = (this.options.canvasWidth - element.width) / 2;
      element.y = (this.options.canvasHeight - element.height) / 2;
      return;
    }

    // For multiple center elements, arrange them vertically centered
    const totalHeight = elements.reduce((sum, el) => sum + el.height, 0) + (elements.length - 1) * this.options.elementSpacing * 0.7;
    let currentY = (this.options.canvasHeight - totalHeight) / 2;

    elements.forEach(element => {
      element.x = (this.options.canvasWidth - element.width) / 2;
      element.y = currentY;
      currentY += element.height + this.options.elementSpacing * 0.7;
    });
  }

  /**
   * Auto-position elements to prevent overlap and optimize layout
   * Uses percentage-based positioning for responsive design
   */
  private autoPositionElements(elements: CanvasElement[], chunkIndex: number): void {
    if (elements.length === 0) return;
    
    // Use percentage-based positioning for responsiveness
    const paddingPercent = 0.05; // 5% padding
    const padding = Math.max(20, this.options.canvasWidth * paddingPercent);
    const centerX = this.options.canvasWidth * 0.5; // 50% width
    const centerY = this.options.canvasHeight * 0.5; // 50% height
    
    // For single elements, center them
    if (elements.length === 1) {
      const element = elements[0];
      element.x = centerX - (element.width / 2);
      element.y = centerY - (element.height / 2);
      
      // Ensure element stays within bounds using percentage-based padding
      element.x = Math.max(padding, Math.min(element.x, this.options.canvasWidth - element.width - padding));
      element.y = Math.max(padding, Math.min(element.y, this.options.canvasHeight - element.height - padding));
      return;
    }
    
    // For multiple elements, arrange them vertically centered with responsive spacing
    const responsiveSpacing = Math.max(this.options.elementSpacing, this.options.canvasHeight * 0.03); // Min 3% of height
    const totalHeight = elements.reduce((sum, el) => sum + el.height, 0) + (elements.length - 1) * responsiveSpacing;
    let currentY = centerY - (totalHeight / 2);

    elements.forEach((element) => {
      // Center horizontally with responsive positioning
      element.x = centerX - (element.width / 2);
      element.y = currentY;
      
      currentY += element.height + responsiveSpacing;
      
      // Ensure elements stay within canvas bounds using percentage-based padding
      element.x = Math.max(padding, Math.min(element.x, this.options.canvasWidth - element.width - padding));
      element.y = Math.max(padding, Math.min(element.y, this.options.canvasHeight - element.height - padding));
    });
  }

  /**
   * Calculate optimal viewBox for elements
   */
  private calculateOptimalViewBox(elements: CanvasElement[]): { x: number; y: number; width: number; height: number; zoom: number } {
    if (elements.length === 0) {
      return { 
        x: 0, 
        y: 0, 
        width: this.options.canvasWidth, 
        height: this.options.canvasHeight, 
        zoom: 1 
      };
    }

    // Find bounds of all elements
    const bounds = {
      minX: Math.min(...elements.map(e => e.x)),
      minY: Math.min(...elements.map(e => e.y)),
      maxX: Math.max(...elements.map(e => e.x + e.width)),
      maxY: Math.max(...elements.map(e => e.y + e.height))
    };

    // Add padding
    const padding = 100;
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    
    // Calculate optimal zoom to fit content
    const availableWidth = this.options.canvasWidth - (padding * 2);
    const availableHeight = this.options.canvasHeight - (padding * 2);
    const zoomX = contentWidth > 0 ? availableWidth / contentWidth : 1;
    const zoomY = contentHeight > 0 ? availableHeight / contentHeight : 1;
    const zoom = Math.min(Math.max(Math.min(zoomX, zoomY), 0.5), 2); // Limit zoom between 0.5x and 2x
    
    const viewBox = {
      x: bounds.minX - padding,
      y: bounds.minY - padding,
      width: this.options.canvasWidth,
      height: this.options.canvasHeight,
      zoom
    };

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
   * Parse visual instruction string into structured data
   * Example: "VISUAL: rectangle left 'Photosynthesis Diagram' high"
   */
  private parseVisualInstruction(instruction: string): ParsedVisualInstruction | null {
    if (!instruction || typeof instruction !== 'string') {
      return null;
    }

    // Remove "VISUAL:" prefix and clean up
    const cleanInstruction = instruction.replace(/^VISUAL:\s*/i, '').trim();
    
    // Parse pattern: elementType position 'label' importance
    const match = cleanInstruction.match(/^(\w+)\s+(\w+)\s+['""]([^'"]+)['""]?\s*(\w+)?$/);
    
    if (!match) {
      return null;
    }

    const [, elementType, position, label, importance = 'medium'] = match;

    // Validate element type
    const validElementTypes = ['text', 'rectangle', 'circle', 'arrow', 'callout'];
    if (!validElementTypes.includes(elementType.toLowerCase())) {
      return null;
    }

    // Validate position
    const validPositions = ['left', 'center', 'right', 'top', 'bottom'];
    if (!validPositions.includes(position.toLowerCase())) {
      return null;
    }

    const parsed: ParsedVisualInstruction = {
      elementType: elementType.toLowerCase() as ParsedVisualInstruction['elementType'],
      position: position.toLowerCase() as ParsedVisualInstruction['position'],
      label: label.trim(),
      importance: (importance?.toLowerCase() || 'medium') as ParsedVisualInstruction['importance']
    };

    return parsed;
  }

  /**
   * Create visual element from parsed instruction
   */
  private createVisualElement(spec: ParsedVisualInstruction, chunkIndex: number, eventIndex: number, elemIndex: number): CanvasElement {
    const id = `visual-${spec.elementType}-${chunkIndex}-${eventIndex}-${elemIndex}`;
    
    switch (spec.elementType) {
      case 'rectangle':
        return this.createRectangleElement(spec, id);
      case 'circle':
        return this.createCircleElement(spec, id);
      case 'callout':
        return this.createCalloutElement(spec, id);
      case 'arrow':
        return this.createArrowElement(spec, id);
      case 'text':
      default:
        return this.createTextElementFromSpec(spec, id);
    }
  }

  /**
   * Create rectangle element
   */
  private createRectangleElement(spec: ParsedVisualInstruction, id: string): CanvasElement {
    const { width, height } = this.calculateElementSize(spec);
    const { x, y } = this.calculateElementPosition(spec, width, height);

    return {
      id,
      type: 'rectangle',
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: this.getImportanceColor(spec.importance),
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: this.getImportanceStrokeWidth(spec.importance),
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
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      customData: { visualSpec: spec }
    };
  }

  /**
   * Create circle element
   */
  private createCircleElement(spec: ParsedVisualInstruction, id: string): CanvasElement {
    const size = this.getImportanceSize(spec.importance, 60, 120); // Circle size based on importance
    const { x, y } = this.calculateElementPosition(spec, size, size);

    return {
      id,
      type: 'ellipse',
      x,
      y,
      width: size,
      height: size,
      angle: 0,
      strokeColor: this.getImportanceColor(spec.importance),
      backgroundColor: this.getImportanceFillColor(spec.importance),
      fillStyle: 'solid',
      strokeWidth: this.getImportanceStrokeWidth(spec.importance),
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      strokeSharpness: 'round',
      seed: Math.floor(Math.random() * 1000000),
      groupIds: [],
      roundness: null,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      customData: { visualSpec: spec }
    };
  }

  /**
   * Create callout element (enhanced text with background)
   */
  private createCalloutElement(spec: ParsedVisualInstruction, id: string): CanvasElement {
    const fontSize = this.getImportanceFontSize(spec.importance);
    const padding = 16;
    const charWidth = fontSize * 0.6;
    const textWidth = spec.label.length * charWidth;
    const width = textWidth + (padding * 2);
    const height = fontSize * 1.5 + (padding * 2);
    const { x, y } = this.calculateElementPosition(spec, width, height);

    return {
      id,
      type: 'text',
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: this.getImportanceColor(spec.importance),
      backgroundColor: this.getImportanceFillColor(spec.importance),
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      strokeSharpness: 'round',
      seed: Math.floor(Math.random() * 1000000),
      groupIds: [],
      roundness: { type: 'round' },
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      text: spec.label,
      fontSize,
      fontFamily: 1,
      textAlign: 'center',
      verticalAlign: 'middle',
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      customData: { visualSpec: spec, isCallout: true }
    };
  }

  /**
   * Create arrow element
   */
  private createArrowElement(spec: ParsedVisualInstruction, id: string): CanvasElement {
    const length = this.getImportanceSize(spec.importance, 80, 150);
    const { x, y } = this.calculateElementPosition(spec, length, 10);

    return {
      id,
      type: 'arrow',
      x,
      y,
      width: length,
      height: 10,
      angle: 0,
      strokeColor: this.getImportanceColor(spec.importance),
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: this.getImportanceStrokeWidth(spec.importance),
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      strokeSharpness: 'sharp',
      seed: Math.floor(Math.random() * 1000000),
      groupIds: [],
      roundness: null,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      customData: { visualSpec: spec }
    };
  }

  /**
   * Create text element from visual specification
   */
  private createTextElementFromSpec(spec: ParsedVisualInstruction, id: string): CanvasElement {
    const fontSize = this.getImportanceFontSize(spec.importance);
    const charWidth = fontSize * 0.6;
    const lineHeight = fontSize * 1.4;
    
    // Responsive max width based on container size
    const containerPadding = Math.max(40, this.options.canvasWidth * 0.1);
    const maxWidth = this.options.canvasWidth - containerPadding;
    
    // Smart text truncation for visual elements
    const maxTextLength = Math.floor(this.options.canvasWidth / 10); // Visual elements can be slightly longer
    let displayText = spec.label;
    if (spec.label.length > maxTextLength) {
      const truncated = spec.label.substring(0, maxTextLength);
      const lastSpaceIndex = truncated.lastIndexOf(' ');
      displayText = (lastSpaceIndex > maxTextLength * 0.7) 
        ? truncated.substring(0, lastSpaceIndex) + '...' 
        : truncated + '...';
    }
    
    // Calculate text wrapping
    const words = displayText.split(' ');
    const avgWordLength = 6;
    const maxCharsPerLine = Math.floor(maxWidth / charWidth);
    const wordsPerLine = Math.floor(maxCharsPerLine / avgWordLength);
    const lines = Math.max(1, Math.ceil(words.length / wordsPerLine));
    
    const width = Math.min(maxWidth, displayText.length * charWidth);
    const height = lines * lineHeight + fontSize * 0.5;
    const { x, y } = this.calculateElementPosition(spec, width, height);

    return {
      id,
      type: 'text',
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: this.getImportanceColor(spec.importance),
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      strokeSharpness: 'sharp',
      seed: Math.floor(Math.random() * 1000000),
      groupIds: [],
      roundness: null,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      text: displayText,
      fontSize,
      fontFamily: 1,
      textAlign: spec.position === 'center' ? 'center' : 'left', // Responsive text alignment
      verticalAlign: 'top',
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      customData: { 
        visualSpec: spec,
        originalText: spec.label, // Store original text
        responsiveConfig: {
          maxWidth,
          lines,
          fontSize,
          containerWidth: this.options.canvasWidth
        }
      }
    };
  }

  /**
   * Calculate element size based on type and importance
   */
  private calculateElementSize(spec: ParsedVisualInstruction): { width: number; height: number } {
    const baseWidth = 200;
    const baseHeight = 80;
    
    switch (spec.elementType) {
      case 'rectangle':
        return {
          width: this.getImportanceSize(spec.importance, baseWidth * 0.8, baseWidth * 1.2),
          height: this.getImportanceSize(spec.importance, baseHeight * 0.8, baseHeight * 1.2)
        };
      case 'circle':
        const size = this.getImportanceSize(spec.importance, 60, 120);
        return { width: size, height: size };
      case 'callout':
        const fontSize = this.getImportanceFontSize(spec.importance);
        const padding = 16;
        return {
          width: spec.label.length * fontSize * 0.6 + (padding * 2),
          height: fontSize * 1.5 + (padding * 2)
        };
      default:
        return { width: baseWidth, height: baseHeight };
    }
  }

  /**
   * Calculate element position based on positioning hint
   */
  private calculateElementPosition(spec: ParsedVisualInstruction, width: number, height: number): { x: number; y: number } {
    const padding = Math.max(20, this.options.canvasWidth * 0.05);
    const centerX = this.options.canvasWidth * 0.5;
    const centerY = this.options.canvasHeight * 0.5;

    switch (spec.position) {
      case 'left':
        return {
          x: padding,
          y: centerY - (height / 2)
        };
      case 'right':
        return {
          x: this.options.canvasWidth - width - padding,
          y: centerY - (height / 2)
        };
      case 'top':
        return {
          x: centerX - (width / 2),
          y: padding
        };
      case 'bottom':
        return {
          x: centerX - (width / 2),
          y: this.options.canvasHeight - height - padding
        };
      case 'center':
      default:
        return {
          x: centerX - (width / 2),
          y: centerY - (height / 2)
        };
    }
  }

  /**
   * Get color based on importance level
   */
  private getImportanceColor(importance: string): string {
    switch (importance) {
      case 'critical': return '#dc2626'; // Red
      case 'high': return '#1971c2';     // Blue
      case 'medium': return '#059669';   // Green
      case 'low': return '#6b7280';      // Gray
      default: return '#1971c2';
    }
  }

  /**
   * Get fill color based on importance level
   */
  private getImportanceFillColor(importance: string): string {
    switch (importance) {
      case 'critical': return '#fef2f2'; // Light red
      case 'high': return '#eff6ff';     // Light blue
      case 'medium': return '#ecfdf5';   // Light green
      case 'low': return '#f9fafb';      // Light gray
      default: return '#eff6ff';
    }
  }

  /**
   * Get stroke width based on importance level
   */
  private getImportanceStrokeWidth(importance: string): number {
    switch (importance) {
      case 'critical': return 3;
      case 'high': return 2;
      case 'medium': return 1.5;
      case 'low': return 1;
      default: return 2;
    }
  }

  /**
   * Get font size based on importance level
   */
  private getImportanceFontSize(importance: string): number {
    const baseFontSize = this.options.fontSize;
    switch (importance) {
      case 'critical': return baseFontSize * 1.5;
      case 'high': return baseFontSize * 1.2;
      case 'medium': return baseFontSize;
      case 'low': return baseFontSize * 0.9;
      default: return baseFontSize;
    }
  }

  /**
   * Get size multiplier based on importance level
   */
  private getImportanceSize(importance: string, minSize: number, maxSize: number): number {
    switch (importance) {
      case 'critical': return maxSize;
      case 'high': return minSize + (maxSize - minSize) * 0.8;
      case 'medium': return minSize + (maxSize - minSize) * 0.5;
      case 'low': return minSize + (maxSize - minSize) * 0.3;
      default: return minSize + (maxSize - minSize) * 0.5;
    }
  }

  /**
   * Update container size and recalculate layouts
   */
  updateContainerSize(containerSize: ResponsiveSize): CanvasState[] {
    // Update options with new container size
    this.options.canvasWidth = containerSize.width;
    this.options.canvasHeight = containerSize.height;

    // Update responsive properties based on container size
    this.updateResponsiveProperties(containerSize);

    // Recalculate all existing canvas states
    return this.recalculateCanvasStates(containerSize);
  }

  /**
   * Update responsive properties based on container size
   */
  private updateResponsiveProperties(containerSize: ResponsiveSize): void {
    // Calculate responsive font size
    const baseFontSize = Math.max(
      this.options.minFontSize!,
      Math.min(
        this.options.maxFontSize!,
        containerSize.width / this.options.scalingFactor!
      )
    );
    this.options.fontSize = baseFontSize;

    // Calculate responsive element spacing
    this.options.elementSpacing = Math.max(20, containerSize.height * 0.05); // 5% of height, min 20px
  }

  /**
   * Recalculate existing canvas states for new container size
   */
  private recalculateCanvasStates(containerSize: ResponsiveSize): CanvasState[] {
    if (this.canvasStates.length === 0) return [];

    // Clear element cache to force recreation with new dimensions
    this.elementCache.clear();

    // Recalculate each state
    this.canvasStates = this.canvasStates.map(state => {
      // Recreate elements with new responsive properties
      const newElements = state.elements.map(element => {
        // Update element dimensions and positioning for new container size
        return this.updateElementForContainerSize(element, containerSize);
      });

      // Recalculate viewBox for new container size
      const newViewBox = this.calculateOptimalViewBox(newElements);

      return {
        ...state,
        elements: newElements,
        viewBox: newViewBox
      };
    });

    return [...this.canvasStates];
  }

  /**
   * Update a single element for new container size
   */
  private updateElementForContainerSize(element: CanvasElement, containerSize: ResponsiveSize): CanvasElement {
    const updatedElement = { ...element };

    // Update text elements with new font size and proper wrapping
    if (element.type === 'text' && element.text) {
      updatedElement.fontSize = this.options.fontSize;
      
      // Get original text if available (to avoid truncated text issues)
      const originalText = element.customData?.originalText || element.text;
      
      // Recalculate responsive text dimensions
      const charWidth = this.options.fontSize * 0.6;
      const lineHeight = this.options.fontSize * 1.4;
      
      // Responsive max width based on new container size
      const containerPadding = Math.max(40, containerSize.width * 0.1);
      const maxWidth = containerSize.width - containerPadding;
      
      // Smart text truncation for new container size
      const maxTextLength = Math.floor(containerSize.width / 8);
      let displayText = originalText;
      if (originalText.length > maxTextLength) {
        const truncated = originalText.substring(0, maxTextLength);
        const lastSpaceIndex = truncated.lastIndexOf(' ');
        displayText = (lastSpaceIndex > maxTextLength * 0.7) 
          ? truncated.substring(0, lastSpaceIndex) + '...' 
          : truncated + '...';
      }
      
      // Calculate text wrapping for new size
      const words = displayText.split(' ');
      const avgWordLength = 6;
      const maxCharsPerLine = Math.floor(maxWidth / charWidth);
      const wordsPerLine = Math.floor(maxCharsPerLine / avgWordLength);
      const lines = Math.max(1, Math.ceil(words.length / wordsPerLine));
      
      // Update element with new responsive dimensions
      updatedElement.text = displayText;
      updatedElement.width = Math.min(maxWidth, displayText.length * charWidth);
      updatedElement.height = lines * lineHeight + this.options.fontSize * 0.5;
      
      // Update custom data for future reference
      updatedElement.customData = {
        ...element.customData,
        originalText,
        responsiveConfig: {
          maxWidth,
          lines,
          fontSize: this.options.fontSize,
          containerWidth: containerSize.width
        }
      };
    }

    // Update positioning to be relative to new container size
    const xPercent = element.x / (this.currentViewBox.width || 800);
    const yPercent = element.y / (this.currentViewBox.height || 600);
    
    updatedElement.x = xPercent * containerSize.width;
    updatedElement.y = yPercent * containerSize.height;

    return updatedElement;
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
    
  }

  /**
   * Multi-slide support methods
   */
  
  /**
   * Create multi-slide canvas states with horizontal positioning
   */
  createMultiSlideStates(
    slides: Array<{
      elements: CanvasElement[];
      timestamp: number;
      duration: number;
      metadata?: any;
    }>,
    slideWidth: number = 1200,
    slideSpacing: number = 100
  ): CanvasState[] {
    const states: CanvasState[] = [];
    
    slides.forEach((slide, index) => {
      // Calculate horizontal position for this slide
      const slideOffset = index * (slideWidth + slideSpacing);
      
      // Adjust all elements to be positioned at the slide offset
      const adjustedElements = slide.elements.map(element => ({
        ...element,
        x: element.x + slideOffset,
        id: `${element.id}-slide-${index}` // Ensure unique IDs across slides
      }));
      
      const state: CanvasState = {
        elements: adjustedElements,
        timestamp: slide.timestamp,
        duration: slide.duration,
        viewBox: {
          x: slideOffset,
          y: 0,
          width: slideWidth,
          height: this.options.canvasHeight,
          zoom: 1
        },
        metadata: {
          ...slide.metadata,
          slideIndex: index,
          slideOffset,
          slideWidth,
          isMultiSlide: true
        }
      };
      
      states.push(state);
    });
    
    return states;
  }
  
  
  /**
   * Calculate responsive font size based on container width
   */
  private calculateResponsiveFontSize(containerWidth: number): number {
    const { minFontSize = 12, maxFontSize = 32, scalingFactor = 50 } = this.options;
    
    // Base font size calculation
    let fontSize = Math.floor(containerWidth / scalingFactor);
    
    // Clamp to min/max values
    fontSize = Math.max(minFontSize, Math.min(maxFontSize, fontSize));
    
    return fontSize;
  }
  
  /**
   * Get canvas state at specific time with multi-slide support
   */
  
  /**
   * Get all canvas states (for external access)
   */
  getCanvasStates(): CanvasState[] {
    return [...this.canvasStates];
  }
  
  /**
   * Set canvas states (for multi-slide initialization)
   */
  setCanvasStates(states: CanvasState[]): void {
    this.canvasStates = states;
  }
  
  /**
   * Calculate optimal zoom level for multi-slide view
   */
  calculateOptimalZoom(
    totalSlides: number,
    slideWidth: number,
    slideSpacing: number,
    containerWidth: number
  ): number {
    const totalWidth = totalSlides * slideWidth + (totalSlides - 1) * slideSpacing;
    const optimalZoom = containerWidth / totalWidth;
    
    // Clamp zoom between reasonable values
    return Math.max(0.1, Math.min(3.0, optimalZoom));
  }
  
  /**
   * Get slide bounds for navigation
   */
  getSlideBounds(slideIndex: number, slideWidth: number, slideSpacing: number): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const slideOffset = slideIndex * (slideWidth + slideSpacing);
    
    return {
      x: slideOffset,
      y: 0,
      width: slideWidth,
      height: this.options.canvasHeight
    };
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