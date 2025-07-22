/**
 * Responsive Layout Regions System
 * 
 * Extends the existing GRID_CONFIG system with dynamic regions that adapt to canvas size
 * and content requirements. Integrates with Phase 1 timeline events and Phase 2 content analysis.
 */

import type { TimelineEvent } from '@ai-tutor/types';
import type { ExcalidrawElement } from '../types';
import { getEventSemanticType } from '../timeline-utils';

export interface CanvasSize {
  width: number;
  height: number;
}

export interface LayoutRegion {
  id: string;
  name: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  type: 'title' | 'main_content' | 'supporting' | 'sidebar' | 'footer' | 'floating';
  priority: number; // Higher priority regions get better positioning
  capacity: number; // Max elements this region can hold
  currentLoad: number; // Current number of elements
  padding: number;
  semanticRoles: Array<'definition' | 'process' | 'comparison' | 'example' | 'list' | 'concept_map' | 'formula' | 'story'>;
  layoutHints: {
    allowOverflow: boolean;
    preferredAlignment: 'left' | 'center' | 'right' | 'justify';
    elementSpacing: number;
    maxElementSize: { width: number; height: number };
  };
}

export interface ResponsiveGridConfig {
  baseWidth: number;
  baseHeight: number;
  margin: number;
  regions: LayoutRegion[];
  breakpoints: {
    small: { maxWidth: number; cols: number; };
    medium: { maxWidth: number; cols: number; };
    large: { maxWidth: number; cols: number; };
    xlarge: { minWidth: number; cols: number; };
  };
}

export interface ElementPlacement {
  element: ExcalidrawElement;
  region: string;
  position: { x: number; y: number };
  zIndex: number;
  timelineOffset?: number;
}

export class ResponsiveRegionManager {
  private config: ResponsiveGridConfig;
  private canvasSize: CanvasSize;
  private placements: Map<string, ElementPlacement> = new Map();
  private regionOccupancy: Map<string, number> = new Map();

  constructor(canvasSize: CanvasSize) {
    this.canvasSize = canvasSize;
    this.config = this.initializeDefaultConfig();
    this.initializeRegions();
  }

  private initializeDefaultConfig(): ResponsiveGridConfig {
    return {
      baseWidth: 900,
      baseHeight: 600,
      margin: 40,
      regions: [],
      breakpoints: {
        small: { maxWidth: 1200, cols: 2 },
        medium: { maxWidth: 1800, cols: 3 },
        large: { maxWidth: 2400, cols: 4 },
        xlarge: { minWidth: 2400, cols: 5 }
      }
    };
  }

  /**
   * Initialize responsive regions based on canvas size and breakpoints
   */
  private initializeRegions(): void {
    const breakpoint = this.getCurrentBreakpoint();
    const regionWidth = (this.canvasSize.width - this.config.margin * 2) / breakpoint.cols;
    const regionHeight = (this.canvasSize.height - this.config.margin * 2) / 3; // 3 rows by default

    this.config.regions = [
      // Title region (top row, spans all columns)
      {
        id: 'title',
        name: 'Title Area',
        bounds: {
          x: this.config.margin,
          y: this.config.margin,
          width: this.canvasSize.width - this.config.margin * 2,
          height: regionHeight * 0.3
        },
        type: 'title',
        priority: 10,
        capacity: 2,
        currentLoad: 0,
        padding: 20,
        semanticRoles: ['definition'],
        layoutHints: {
          allowOverflow: false,
          preferredAlignment: 'center',
          elementSpacing: 20,
          maxElementSize: { width: regionWidth * breakpoint.cols - 40, height: regionHeight * 0.25 }
        }
      },

      // Main content region (middle area)
      {
        id: 'main_content',
        name: 'Main Content',
        bounds: {
          x: this.config.margin,
          y: this.config.margin + regionHeight * 0.3,
          width: this.canvasSize.width - this.config.margin * 2,
          height: regionHeight * 1.4
        },
        type: 'main_content',
        priority: 9,
        capacity: Math.max(4, breakpoint.cols * 2),
        currentLoad: 0,
        padding: 30,
        semanticRoles: ['process', 'comparison', 'concept_map', 'formula'],
        layoutHints: {
          allowOverflow: true,
          preferredAlignment: 'center',
          elementSpacing: 40,
          maxElementSize: { width: regionWidth - 60, height: regionHeight * 0.8 }
        }
      },

      // Supporting content regions (side areas for examples, lists, etc.)
      ...this.generateSupportingRegions(regionWidth, regionHeight, breakpoint.cols),

      // Footer region
      {
        id: 'footer',
        name: 'Footer Area',
        bounds: {
          x: this.config.margin,
          y: this.canvasSize.height - this.config.margin - regionHeight * 0.3,
          width: this.canvasSize.width - this.config.margin * 2,
          height: regionHeight * 0.3
        },
        type: 'footer',
        priority: 5,
        capacity: 3,
        currentLoad: 0,
        padding: 15,
        semanticRoles: ['example', 'story'],
        layoutHints: {
          allowOverflow: false,
          preferredAlignment: 'center',
          elementSpacing: 30,
          maxElementSize: { width: regionWidth, height: regionHeight * 0.25 }
        }
      }
    ];

    // Initialize region occupancy tracking
    this.regionOccupancy.clear();
    this.config.regions.forEach(region => {
      this.regionOccupancy.set(region.id, 0);
    });
  }

  private generateSupportingRegions(regionWidth: number, regionHeight: number, cols: number): LayoutRegion[] {
    const supportingRegions: LayoutRegion[] = [];
    const supportingStartY = this.config.margin + regionHeight * 1.7;
    const supportingHeight = regionHeight * 0.6;

    for (let i = 0; i < cols; i++) {
      supportingRegions.push({
        id: `supporting_${i}`,
        name: `Supporting Area ${i + 1}`,
        bounds: {
          x: this.config.margin + i * regionWidth,
          y: supportingStartY,
          width: regionWidth,
          height: supportingHeight
        },
        type: 'supporting',
        priority: 6,
        capacity: 2,
        currentLoad: 0,
        padding: 20,
        semanticRoles: ['example', 'list'],
        layoutHints: {
          allowOverflow: false,
          preferredAlignment: 'left',
          elementSpacing: 15,
          maxElementSize: { width: regionWidth - 40, height: supportingHeight - 40 }
        }
      });
    }

    return supportingRegions;
  }

  private getCurrentBreakpoint() {
    const width = this.canvasSize.width;
    
    if (width <= this.config.breakpoints.small.maxWidth) {
      return this.config.breakpoints.small;
    } else if (width <= this.config.breakpoints.medium.maxWidth) {
      return this.config.breakpoints.medium;
    } else if (width <= this.config.breakpoints.large.maxWidth) {
      return this.config.breakpoints.large;
    } else {
      return this.config.breakpoints.xlarge;
    }
  }

  /**
   * Find the best region for a timeline event based on semantic analysis
   */
  public findOptimalRegion(timelineEvent: TimelineEvent): LayoutRegion | null {
    const eventType = getEventSemanticType(timelineEvent) || 'definition';
    
    // Find regions that support this semantic type
    const candidates = this.config.regions.filter(region =>
      region.semanticRoles.includes(eventType as any) && 
      region.currentLoad < region.capacity
    );

    if (candidates.length === 0) {
      // Fallback: find any region with capacity
      const fallbackCandidates = this.config.regions.filter(region =>
        region.currentLoad < region.capacity || region.layoutHints.allowOverflow
      );
      
      if (fallbackCandidates.length === 0) {
        console.warn(`No available regions for timeline event: ${timelineEvent.id}`);
        return null;
      }

      // Sort by priority and available capacity
      return fallbackCandidates.sort((a, b) => 
        (b.priority - b.currentLoad) - (a.priority - a.currentLoad)
      )[0];
    }

    // Sort candidates by priority and available capacity
    return candidates.sort((a, b) => 
      (b.priority - b.currentLoad) - (a.priority - a.currentLoad)
    )[0];
  }

  /**
   * Reserve space in a region and return the calculated position
   */
  public reserveRegionSpace(region: LayoutRegion, element: ExcalidrawElement, timelineOffset?: number): { x: number; y: number } | null {
    const currentOccupancy = this.regionOccupancy.get(region.id) || 0;
    
    // Check if region has capacity
    if (!region.layoutHints.allowOverflow && currentOccupancy >= region.capacity) {
      return null;
    }

    // Calculate position within region
    const position = this.calculateElementPosition(region, currentOccupancy, element);
    
    // Update occupancy
    this.regionOccupancy.set(region.id, currentOccupancy + 1);
    region.currentLoad = currentOccupancy + 1;

    // Store placement for tracking
    const placement: ElementPlacement = {
      element,
      region: region.id,
      position,
      zIndex: region.priority * 100 + currentOccupancy,
      timelineOffset
    };
    
    this.placements.set(element.id, placement);

    return position;
  }

  private calculateElementPosition(region: LayoutRegion, occupancyIndex: number, element: ExcalidrawElement): { x: number; y: number } {
    const { bounds, layoutHints, padding } = region;
    const availableWidth = bounds.width - padding * 2;
    const availableHeight = bounds.height - padding * 2;

    let x: number, y: number;

    // Position based on region alignment preference
    switch (layoutHints.preferredAlignment) {
      case 'center':
        x = bounds.x + bounds.width / 2 - (element.width || 100) / 2;
        break;
      case 'right':
        x = bounds.x + bounds.width - padding - (element.width || 100);
        break;
      case 'left':
      default:
        x = bounds.x + padding;
        break;
    }

    // Calculate Y position based on occupancy
    const elementHeight = element.height || 50;
    const totalSpacing = layoutHints.elementSpacing * occupancyIndex;
    y = bounds.y + padding + (elementHeight + layoutHints.elementSpacing) * occupancyIndex;

    // Ensure element stays within region bounds (with overflow check)
    if (!layoutHints.allowOverflow) {
      x = Math.max(bounds.x + padding, Math.min(x, bounds.x + bounds.width - padding - (element.width || 100)));
      y = Math.max(bounds.y + padding, Math.min(y, bounds.y + bounds.height - padding - elementHeight));
    }

    return { x, y };
  }

  /**
   * Update canvas size and reinitialize regions
   */
  public updateCanvasSize(newSize: CanvasSize): void {
    this.canvasSize = newSize;
    this.initializeRegions();
    
    // Reposition existing elements if needed
    this.repositionExistingElements();
  }

  private repositionExistingElements(): void {
    // This would be called when canvas is resized to reposition elements
    // Implementation would depend on specific requirements for element persistence
    console.log('Repositioning existing elements for new canvas size');
  }

  /**
   * Get all regions for debugging/visualization
   */
  public getAllRegions(): LayoutRegion[] {
    return [...this.config.regions];
  }

  /**
   * Get region by ID
   */
  public getRegion(regionId: string): LayoutRegion | undefined {
    return this.config.regions.find(region => region.id === regionId);
  }

  /**
   * Clear all placements (useful for timeline reset)
   */
  public clearPlacements(): void {
    this.placements.clear();
    this.regionOccupancy.clear();
    this.config.regions.forEach(region => {
      region.currentLoad = 0;
      this.regionOccupancy.set(region.id, 0);
    });
  }

  /**
   * Get placement info for an element
   */
  public getElementPlacement(elementId: string): ElementPlacement | undefined {
    return this.placements.get(elementId);
  }

  /**
   * Integration method: Get timeline-aware positioning for multiple events
   */
  public positionTimelineEvents(events: TimelineEvent[]): Map<string, { x: number; y: number; regionId: string }> {
    const positions = new Map<string, { x: number; y: number; regionId: string }>();

    // Sort events by timeline offset for proper sequencing
    const sortedEvents = events.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    for (const event of sortedEvents) {
      const region = this.findOptimalRegion(event);
      
      if (!region) {
        console.warn(`Could not find region for timeline event: ${event.id}`);
        continue;
      }

      // Create a mock element for positioning calculations
      const mockElement: ExcalidrawElement = {
        id: event.id,
        type: 'text',
        x: 0,
        y: 0,
        width: region.layoutHints.maxElementSize.width,
        height: region.layoutHints.maxElementSize.height,
        angle: 0,
        strokeColor: '#000000',
        backgroundColor: 'transparent',
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
        index: `timeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      const position = this.reserveRegionSpace(region, mockElement, event.timestamp);
      
      if (position) {
        positions.set(event.id, {
          x: position.x,
          y: position.y,
          regionId: region.id
        });
      }
    }

    return positions;
  }
}

/**
 * Utility function to create a responsive region manager
 */
export function createResponsiveRegionManager(canvasSize: CanvasSize): ResponsiveRegionManager {
  return new ResponsiveRegionManager(canvasSize);
}

/**
 * Helper function to get default canvas size based on viewport
 */
export function getDefaultCanvasSize(): CanvasSize {
  // Default fallback size, can be overridden by actual canvas measurements
  return {
    width: Math.max(1200, window.innerWidth * 0.8),
    height: Math.max(800, window.innerHeight * 0.8)
  };
}