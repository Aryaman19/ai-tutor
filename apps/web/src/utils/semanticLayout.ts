import { createComponentLogger } from '@ai-tutor/utils';

const logger = createComponentLogger('semanticLayout');

export interface SemanticLayout {
  region: string;
  priority: string;
  spacing: string;
  relative_to?: string;
  relationship?: string;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface Coordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementInfo {
  id: string;
  type: string;
  text?: string;
  size: string;
  coordinates?: Coordinates;
}

// Grid regions for semantic positioning
const REGIONS = {
  'top_left': { x: 0.1, y: 0.1 },
  'top_center': { x: 0.5, y: 0.1 },
  'top_right': { x: 0.9, y: 0.1 },
  'middle_left': { x: 0.1, y: 0.5 },
  'center': { x: 0.5, y: 0.5 },
  'middle_right': { x: 0.9, y: 0.5 },
  'bottom_left': { x: 0.1, y: 0.9 },
  'bottom_center': { x: 0.5, y: 0.9 },
  'bottom_right': { x: 0.9, y: 0.9 },
} as const;

// Size presets for different element types
const SIZE_PRESETS = {
  title: {
    small: { width: 200, height: 40 },
    medium: { width: 300, height: 50 },
    large: { width: 400, height: 60 },
  },
  subtitle: {
    small: { width: 150, height: 30 },
    medium: { width: 250, height: 40 },
    large: { width: 350, height: 50 },
  },
  text: {
    small: { width: 120, height: 20 },
    medium: { width: 200, height: 30 },
    large: { width: 300, height: 40 },
  },
  circle: {
    small: { width: 60, height: 60 },
    medium: { width: 100, height: 100 },
    large: { width: 140, height: 140 },
  },
  rectangle: {
    small: { width: 100, height: 60 },
    medium: { width: 150, height: 80 },
    large: { width: 200, height: 100 },
  },
  concept_box: {
    small: { width: 120, height: 70 },
    medium: { width: 150, height: 80 },
    large: { width: 180, height: 90 },
  },
  arrow: {
    small: { width: 80, height: 20 },
    medium: { width: 120, height: 30 },
    large: { width: 160, height: 40 },
  },
} as const;

// Spacing values based on priority and spacing preference
const SPACING_VALUES = {
  small: 20,
  medium: 40,
  large: 60,
} as const;

const PRIORITY_SPACING = {
  high: 1.5,    // 50% more space
  medium: 1.0,  // Normal spacing
  low: 0.7,     // 30% less space
} as const;

export class SemanticLayoutEngine {
  private canvasSize: CanvasSize;
  private placedElements: Map<string, ElementInfo> = new Map();
  private occupiedRegions: Set<string> = new Set();

  constructor(canvasSize: CanvasSize = { width: 800, height: 600 }) {
    this.canvasSize = canvasSize;
  }

  updateCanvasSize(size: CanvasSize) {
    this.canvasSize = size;
    logger.debug('Canvas size updated:', size);
    
    // Recalculate positions for responsive adjustment
    this.recalculateAllPositions();
  }

  private recalculateAllPositions() {
    const elements = Array.from(this.placedElements.values());
    this.placedElements.clear();
    this.occupiedRegions.clear();

    // Re-place all elements with new canvas size
    elements.forEach(element => {
      // Create layout from stored element info
      const layout: SemanticLayout = {
        region: this.getRegionFromCoordinates(element.coordinates!),
        priority: 'medium', // Default fallback
        spacing: 'medium',
      };

      const newCoordinates = this.convertSemanticToCoordinates(layout, element);
      element.coordinates = newCoordinates;
      this.placedElements.set(element.id, element);
    });
  }

  private getRegionFromCoordinates(coords: Coordinates): string {
    // Find the closest semantic region for the given coordinates
    const centerX = (coords.x + coords.width / 2) / this.canvasSize.width;
    const centerY = (coords.y + coords.height / 2) / this.canvasSize.height;

    let closestRegion = 'center';
    let minDistance = Infinity;

    Object.entries(REGIONS).forEach(([region, pos]) => {
      const distance = Math.sqrt(
        Math.pow(centerX - pos.x, 2) + Math.pow(centerY - pos.y, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestRegion = region;
      }
    });

    return closestRegion;
  }

  convertSemanticToCoordinates(layout: SemanticLayout, element: ElementInfo): Coordinates {
    try {
      // Get base coordinates from region
      const regionPos = REGIONS[layout.region as keyof typeof REGIONS];
      if (!regionPos) {
        logger.warn(`Unknown region: ${layout.region}, using center`);
        return this.convertSemanticToCoordinates(
          { ...layout, region: 'center' },
          element
        );
      }

      // Get element size
      const size = this.getElementSize(element.type, element.size);
      
      // Calculate base position
      let baseX = regionPos.x * this.canvasSize.width;
      let baseY = regionPos.y * this.canvasSize.height;

      // Adjust for element centering on the region point
      baseX -= size.width / 2;
      baseY -= size.height / 2;

      // Handle relative positioning
      if (layout.relative_to && layout.relationship) {
        const relativeElement = this.placedElements.get(layout.relative_to);
        if (relativeElement && relativeElement.coordinates) {
          const adjusted = this.applyRelativePositioning(
            { x: baseX, y: baseY, ...size },
            relativeElement.coordinates,
            layout.relationship,
            layout.spacing
          );
          baseX = adjusted.x;
          baseY = adjusted.y;
        }
      }

      // Handle region conflicts and spacing
      const finalPosition = this.resolvePositionConflicts(
        { x: baseX, y: baseY, ...size },
        layout
      );

      // Ensure position is within canvas bounds
      const clampedPosition = this.clampToCanvas(finalPosition);

      // Store element information
      const elementInfo: ElementInfo = {
        ...element,
        coordinates: clampedPosition,
      };
      this.placedElements.set(element.id, elementInfo);

      // Mark region as occupied
      this.occupiedRegions.add(layout.region);

      logger.debug(`Positioned element ${element.id} at`, clampedPosition);
      return clampedPosition;

    } catch (error) {
      logger.error('Error converting semantic layout:', error);
      // Fallback to center position
      const fallbackSize = this.getElementSize('text', 'medium');
      return {
        x: this.canvasSize.width / 2 - fallbackSize.width / 2,
        y: this.canvasSize.height / 2 - fallbackSize.height / 2,
        ...fallbackSize,
      };
    }
  }

  private getElementSize(type: string, size: string): { width: number; height: number } {
    const sizeKey = size as keyof (typeof SIZE_PRESETS)[keyof typeof SIZE_PRESETS];
    const typeKey = type as keyof typeof SIZE_PRESETS;

    // Get size preset or fallback to rectangle
    const presets = SIZE_PRESETS[typeKey] || SIZE_PRESETS.rectangle;
    const selectedSize = presets[sizeKey] || presets.medium;

    // Apply responsive scaling
    const scale = Math.min(this.canvasSize.width / 800, this.canvasSize.height / 600);
    
    return {
      width: selectedSize.width * scale,
      height: selectedSize.height * scale,
    };
  }

  private applyRelativePositioning(
    position: Coordinates,
    relativeCoords: Coordinates,
    relationship: string,
    spacing: string
  ): Coordinates {
    const spacingValue = SPACING_VALUES[spacing as keyof typeof SPACING_VALUES] || SPACING_VALUES.medium;
    
    switch (relationship) {
      case 'below_with_spacing':
        return {
          ...position,
          x: relativeCoords.x + (relativeCoords.width - position.width) / 2, // Center horizontally
          y: relativeCoords.y + relativeCoords.height + spacingValue,
        };

      case 'above_with_spacing':
        return {
          ...position,
          x: relativeCoords.x + (relativeCoords.width - position.width) / 2,
          y: relativeCoords.y - position.height - spacingValue,
        };

      case 'right_with_spacing':
        return {
          ...position,
          x: relativeCoords.x + relativeCoords.width + spacingValue,
          y: relativeCoords.y + (relativeCoords.height - position.height) / 2, // Center vertically
        };

      case 'left_with_spacing':
        return {
          ...position,
          x: relativeCoords.x - position.width - spacingValue,
          y: relativeCoords.y + (relativeCoords.height - position.height) / 2,
        };

      case 'overlay_center':
        return {
          ...position,
          x: relativeCoords.x + (relativeCoords.width - position.width) / 2,
          y: relativeCoords.y + (relativeCoords.height - position.height) / 2,
        };

      default:
        logger.warn(`Unknown relationship: ${relationship}`);
        return position;
    }
  }

  private resolvePositionConflicts(
    position: Coordinates,
    layout: SemanticLayout
  ): Coordinates {
    const spacingValue = SPACING_VALUES[layout.spacing as keyof typeof SPACING_VALUES] || SPACING_VALUES.medium;
    const priorityMultiplier = PRIORITY_SPACING[layout.priority as keyof typeof PRIORITY_SPACING] || 1.0;
    const adjustedSpacing = spacingValue * priorityMultiplier;

    // Check for conflicts with existing elements
    let adjustedPosition = { ...position };
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const hasConflict = Array.from(this.placedElements.values()).some(element => {
        if (!element.coordinates) return false;
        return this.rectanglesOverlap(adjustedPosition, element.coordinates, adjustedSpacing);
      });

      if (!hasConflict) {
        break;
      }

      // Try to resolve conflict by moving in a spiral pattern
      const offset = adjustedSpacing * (attempts + 1);
      const angle = (attempts * Math.PI * 2) / 8; // 8 directions

      adjustedPosition.x = position.x + Math.cos(angle) * offset;
      adjustedPosition.y = position.y + Math.sin(angle) * offset;

      attempts++;
    }

    if (attempts >= maxAttempts) {
      logger.warn('Could not resolve position conflict, using best attempt');
    }

    return adjustedPosition;
  }

  private rectanglesOverlap(
    rect1: Coordinates,
    rect2: Coordinates,
    minSpacing: number = 0
  ): boolean {
    return !(
      rect1.x + rect1.width + minSpacing < rect2.x ||
      rect2.x + rect2.width + minSpacing < rect1.x ||
      rect1.y + rect1.height + minSpacing < rect2.y ||
      rect2.y + rect2.height + minSpacing < rect1.y
    );
  }

  private clampToCanvas(position: Coordinates): Coordinates {
    const margin = 20; // Minimum margin from canvas edge

    return {
      x: Math.max(margin, Math.min(position.x, this.canvasSize.width - position.width - margin)),
      y: Math.max(margin, Math.min(position.y, this.canvasSize.height - position.height - margin)),
      width: position.width,
      height: position.height,
    };
  }

  // Public methods for managing the layout
  clearAll() {
    this.placedElements.clear();
    this.occupiedRegions.clear();
    logger.debug('Layout cleared');
  }

  removeElement(elementId: string) {
    const element = this.placedElements.get(elementId);
    if (element) {
      this.placedElements.delete(elementId);
      
      // Check if region is still occupied by other elements
      const region = this.getRegionFromCoordinates(element.coordinates!);
      const stillOccupied = Array.from(this.placedElements.values()).some(el => 
        el.coordinates && this.getRegionFromCoordinates(el.coordinates) === region
      );
      
      if (!stillOccupied) {
        this.occupiedRegions.delete(region);
      }
      
      logger.debug(`Removed element ${elementId}`);
    }
  }

  getPlacedElements(): ElementInfo[] {
    return Array.from(this.placedElements.values());
  }

  getOccupiedRegions(): string[] {
    return Array.from(this.occupiedRegions);
  }

  // Utility method for responsive design
  getOptimalTextSize(text: string, maxWidth: number): string {
    if (!text) return 'medium';
    
    const charWidth = 8; // Approximate character width
    const estimatedWidth = text.length * charWidth;
    
    if (estimatedWidth <= maxWidth * 0.6) return 'small';
    if (estimatedWidth <= maxWidth * 0.8) return 'medium';
    return 'large';
  }

  // Method for suggesting optimal layouts based on content
  suggestLayout(elements: ElementInfo[], canvasSize?: CanvasSize): SemanticLayout[] {
    if (canvasSize) {
      this.updateCanvasSize(canvasSize);
    }

    const suggestions: SemanticLayout[] = [];
    
    elements.forEach((element, index) => {
      let region: string;
      
      // Suggest layouts based on element type and order
      if (element.type === 'title') {
        region = 'top_center';
      } else if (element.type === 'subtitle') {
        region = index < 2 ? 'top_left' : 'top_right';
      } else {
        // Distribute other elements across available regions
        const availableRegions = Object.keys(REGIONS).filter(r => 
          !this.occupiedRegions.has(r) && r !== 'top_center'
        );
        region = availableRegions[index % availableRegions.length] || 'center';
      }

      suggestions.push({
        region,
        priority: element.type === 'title' ? 'high' : 'medium',
        spacing: 'medium',
      });
    });

    return suggestions;
  }
}

// Export a singleton instance for use across the application
export const semanticLayoutEngine = new SemanticLayoutEngine();