/**
 * Collision Detection System
 * 
 * Advanced collision detection and avoidance for timeline-based semantic layouts.
 * Integrates with the responsive regions system to ensure optimal element positioning.
 */

import type { ExcalidrawElement } from '../types';
import type { LayoutRegion } from './responsive-regions';
import type { TimelineEvent } from '@ai-tutor/types';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollisionInfo {
  hasCollision: boolean;
  overlappingElements: string[];
  overlappingArea: number;
  severity: 'none' | 'minor' | 'moderate' | 'severe';
  suggestedAdjustment?: { x: number; y: number };
}

export interface ElementPlacementContext {
  element: ExcalidrawElement;
  timelineEvent?: TimelineEvent;
  targetRegion?: LayoutRegion;
  priority: number;
  canReposition: boolean;
}

export interface AvoidanceVector {
  x: number;
  y: number;
  strength: number;
}

export class CollisionDetector {
  private elements: Map<string, ExcalidrawElement> = new Map();
  private spatialGrid: Map<string, Set<string>> = new Map(); // Grid-based spatial indexing
  private gridSize: number = 200; // Grid cell size for spatial indexing
  private minSeparation: number = 20; // Minimum separation between elements

  constructor(options?: { gridSize?: number; minSeparation?: number }) {
    if (options?.gridSize) this.gridSize = options.gridSize;
    if (options?.minSeparation) this.minSeparation = options.minSeparation;
  }

  /**
   * Add or update an element in the collision detection system
   */
  public addElement(element: ExcalidrawElement): void {
    // Remove from old spatial grid position if it exists
    this.removeFromSpatialGrid(element.id);
    
    // Update element storage
    this.elements.set(element.id, element);
    
    // Add to new spatial grid position
    this.addToSpatialGrid(element);
  }

  /**
   * Remove an element from the collision detection system
   */
  public removeElement(elementId: string): void {
    this.removeFromSpatialGrid(elementId);
    this.elements.delete(elementId);
  }

  /**
   * Check for collisions with a proposed element position
   */
  public checkCollision(proposedElement: ExcalidrawElement, excludeIds?: string[]): CollisionInfo {
    const proposedBounds = this.getElementBounds(proposedElement);
    const nearbyElements = this.getNearbyElements(proposedBounds);
    
    const overlappingElements: string[] = [];
    let totalOverlapArea = 0;

    for (const nearbyId of nearbyElements) {
      if (excludeIds?.includes(nearbyId) || nearbyId === proposedElement.id) continue;
      
      const nearbyElement = this.elements.get(nearbyId);
      if (!nearbyElement) continue;

      const nearbyBounds = this.getElementBounds(nearbyElement);
      const overlapArea = this.calculateOverlapArea(proposedBounds, nearbyBounds);

      if (overlapArea > 0) {
        overlappingElements.push(nearbyId);
        totalOverlapArea += overlapArea;
      }
    }

    const severity = this.calculateCollisionSeverity(totalOverlapArea, proposedBounds);
    const suggestedAdjustment = severity !== 'none' 
      ? this.calculateAvoidanceAdjustment(proposedElement, overlappingElements)
      : undefined;

    return {
      hasCollision: overlappingElements.length > 0,
      overlappingElements,
      overlappingArea: totalOverlapArea,
      severity,
      suggestedAdjustment
    };
  }

  /**
   * Find optimal position for an element with collision avoidance
   */
  public findCollisionFreePosition(
    context: ElementPlacementContext,
    startPosition: { x: number; y: number },
    maxAttempts: number = 20
  ): { x: number; y: number; collision: CollisionInfo } {
    const { element, targetRegion } = context;
    let currentPosition = { ...startPosition };
    let bestPosition = { ...startPosition };
    let bestCollisionInfo: CollisionInfo | null = null;
    let bestScore = Infinity;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Create test element with current position
      const testElement: ExcalidrawElement = {
        ...element,
        x: currentPosition.x,
        y: currentPosition.y
      };

      const collisionInfo = this.checkCollision(testElement);
      const score = this.calculatePositionScore(testElement, collisionInfo, targetRegion);

      if (score < bestScore) {
        bestScore = score;
        bestPosition = { ...currentPosition };
        bestCollisionInfo = collisionInfo;
      }

      // If we found a collision-free position, use it
      if (!collisionInfo.hasCollision) {
        break;
      }

      // Adjust position for next attempt
      if (collisionInfo.suggestedAdjustment) {
        currentPosition.x += collisionInfo.suggestedAdjustment.x;
        currentPosition.y += collisionInfo.suggestedAdjustment.y;
      } else {
        // Fallback: spiral search pattern
        const spiralOffset = this.getSpiralOffset(attempt);
        currentPosition.x = startPosition.x + spiralOffset.x;
        currentPosition.y = startPosition.y + spiralOffset.y;
      }

      // Constrain to region bounds if specified
      if (targetRegion) {
        currentPosition = this.constrainToRegion(currentPosition, element, targetRegion);
      }
    }

    return {
      x: bestPosition.x,
      y: bestPosition.y,
      collision: bestCollisionInfo || { hasCollision: false, overlappingElements: [], overlappingArea: 0, severity: 'none' }
    };
  }

  /**
   * Reposition elements to resolve existing collisions
   */
  public resolveCollisions(elements: ExcalidrawElement[], region?: LayoutRegion): ExcalidrawElement[] {
    const elementContexts: ElementPlacementContext[] = elements.map(element => ({
      element,
      priority: 5, // Default priority
      canReposition: true
    }));

    // Sort by priority (higher priority elements get positioned first)
    elementContexts.sort((a, b) => b.priority - a.priority);

    const repositionedElements: ExcalidrawElement[] = [];

    for (const context of elementContexts) {
      const currentPosition = { x: context.element.x, y: context.element.y };
      
      if (context.canReposition) {
        const { x, y } = this.findCollisionFreePosition(context, currentPosition);
        
        const repositionedElement: ExcalidrawElement = {
          ...context.element,
          x,
          y,
          updated: Date.now(),
          versionNonce: Math.floor(Math.random() * 2147483647)
        };

        repositionedElements.push(repositionedElement);
        this.addElement(repositionedElement);
      } else {
        repositionedElements.push(context.element);
        this.addElement(context.element);
      }
    }

    return repositionedElements;
  }

  private getElementBounds(element: ExcalidrawElement): BoundingBox {
    return {
      x: element.x,
      y: element.y,
      width: element.width || 100,
      height: element.height || 50
    };
  }

  private addToSpatialGrid(element: ExcalidrawElement): void {
    const bounds = this.getElementBounds(element);
    const gridCells = this.getGridCells(bounds);

    for (const cellKey of gridCells) {
      if (!this.spatialGrid.has(cellKey)) {
        this.spatialGrid.set(cellKey, new Set());
      }
      this.spatialGrid.get(cellKey)!.add(element.id);
    }
  }

  private removeFromSpatialGrid(elementId: string): void {
    for (const [cellKey, elementSet] of this.spatialGrid.entries()) {
      elementSet.delete(elementId);
      if (elementSet.size === 0) {
        this.spatialGrid.delete(cellKey);
      }
    }
  }

  private getGridCells(bounds: BoundingBox): string[] {
    const cells: string[] = [];
    const startX = Math.floor(bounds.x / this.gridSize);
    const endX = Math.floor((bounds.x + bounds.width) / this.gridSize);
    const startY = Math.floor(bounds.y / this.gridSize);
    const endY = Math.floor((bounds.y + bounds.height) / this.gridSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        cells.push(`${x},${y}`);
      }
    }

    return cells;
  }

  private getNearbyElements(bounds: BoundingBox): Set<string> {
    const nearby = new Set<string>();
    const gridCells = this.getGridCells(bounds);

    for (const cellKey of gridCells) {
      const elementsInCell = this.spatialGrid.get(cellKey);
      if (elementsInCell) {
        for (const elementId of elementsInCell) {
          nearby.add(elementId);
        }
      }
    }

    return nearby;
  }

  private calculateOverlapArea(bounds1: BoundingBox, bounds2: BoundingBox): number {
    const left = Math.max(bounds1.x, bounds2.x);
    const right = Math.min(bounds1.x + bounds1.width, bounds2.x + bounds2.width);
    const top = Math.max(bounds1.y, bounds2.y);
    const bottom = Math.min(bounds1.y + bounds1.height, bounds2.y + bounds2.height);

    if (left >= right || top >= bottom) return 0;
    
    return (right - left) * (bottom - top);
  }

  private calculateCollisionSeverity(overlapArea: number, elementBounds: BoundingBox): 'none' | 'minor' | 'moderate' | 'severe' {
    if (overlapArea === 0) return 'none';
    
    const elementArea = elementBounds.width * elementBounds.height;
    const overlapRatio = overlapArea / elementArea;

    if (overlapRatio < 0.1) return 'minor';
    if (overlapRatio < 0.3) return 'moderate';
    return 'severe';
  }

  private calculateAvoidanceAdjustment(element: ExcalidrawElement, overlappingIds: string[]): { x: number; y: number } {
    let totalAvoidanceX = 0;
    let totalAvoidanceY = 0;
    let count = 0;

    const elementBounds = this.getElementBounds(element);

    for (const overlappingId of overlappingIds) {
      const overlappingElement = this.elements.get(overlappingId);
      if (!overlappingElement) continue;

      const overlappingBounds = this.getElementBounds(overlappingElement);
      const avoidanceVector = this.calculateAvoidanceVector(elementBounds, overlappingBounds);

      totalAvoidanceX += avoidanceVector.x * avoidanceVector.strength;
      totalAvoidanceY += avoidanceVector.y * avoidanceVector.strength;
      count++;
    }

    if (count === 0) return { x: 0, y: 0 };

    return {
      x: (totalAvoidanceX / count) + (Math.random() - 0.5) * this.minSeparation,
      y: (totalAvoidanceY / count) + (Math.random() - 0.5) * this.minSeparation
    };
  }

  private calculateAvoidanceVector(elementBounds: BoundingBox, obstacleBounds: BoundingBox): AvoidanceVector {
    const elementCenterX = elementBounds.x + elementBounds.width / 2;
    const elementCenterY = elementBounds.y + elementBounds.height / 2;
    const obstacleCenterX = obstacleBounds.x + obstacleBounds.width / 2;
    const obstacleCenterY = obstacleBounds.y + obstacleBounds.height / 2;

    const directionX = elementCenterX - obstacleCenterX;
    const directionY = elementCenterY - obstacleCenterY;
    const distance = Math.sqrt(directionX * directionX + directionY * directionY);

    if (distance === 0) {
      // Elements are at the same position, push in a random direction
      const angle = Math.random() * Math.PI * 2;
      return {
        x: Math.cos(angle),
        y: Math.sin(angle),
        strength: this.minSeparation * 2
      };
    }

    const normalizedX = directionX / distance;
    const normalizedY = directionY / distance;
    
    // Strength inversely proportional to distance, but with minimum separation
    const strength = Math.max(this.minSeparation, 100 / (distance + 1));

    return {
      x: normalizedX,
      y: normalizedY,
      strength
    };
  }

  private calculatePositionScore(element: ExcalidrawElement, collision: CollisionInfo, region?: LayoutRegion): number {
    let score = collision.overlappingArea * 10; // Penalty for overlaps

    // Add penalty based on collision severity
    switch (collision.severity) {
      case 'severe': score += 1000; break;
      case 'moderate': score += 500; break;
      case 'minor': score += 100; break;
    }

    // Add penalty for being outside region bounds
    if (region) {
      const elementBounds = this.getElementBounds(element);
      const regionBounds = region.bounds;

      if (elementBounds.x < regionBounds.x || 
          elementBounds.y < regionBounds.y ||
          elementBounds.x + elementBounds.width > regionBounds.x + regionBounds.width ||
          elementBounds.y + elementBounds.height > regionBounds.y + regionBounds.height) {
        score += 200; // Penalty for being outside region
      }
    }

    return score;
  }

  private getSpiralOffset(attempt: number): { x: number; y: number } {
    // Generate spiral search pattern
    const angle = attempt * 0.5 * Math.PI;
    const radius = Math.sqrt(attempt) * this.minSeparation;
    
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  }

  private constrainToRegion(position: { x: number; y: number }, element: ExcalidrawElement, region: LayoutRegion): { x: number; y: number } {
    const elementBounds = this.getElementBounds({ ...element, x: position.x, y: position.y });
    const regionBounds = region.bounds;

    return {
      x: Math.max(
        regionBounds.x + region.padding,
        Math.min(position.x, regionBounds.x + regionBounds.width - elementBounds.width - region.padding)
      ),
      y: Math.max(
        regionBounds.y + region.padding,
        Math.min(position.y, regionBounds.y + regionBounds.height - elementBounds.height - region.padding)
      )
    };
  }

  /**
   * Get collision statistics for debugging
   */
  public getCollisionStats(): { totalElements: number; totalCollisions: number; severityBreakdown: Record<string, number> } {
    const severityBreakdown = { none: 0, minor: 0, moderate: 0, severe: 0 };
    let totalCollisions = 0;

    for (const element of this.elements.values()) {
      const collision = this.checkCollision(element, [element.id]);
      severityBreakdown[collision.severity]++;
      if (collision.hasCollision) totalCollisions++;
    }

    return {
      totalElements: this.elements.size,
      totalCollisions,
      severityBreakdown
    };
  }

  /**
   * Clear all elements from the collision detection system
   */
  public clear(): void {
    this.elements.clear();
    this.spatialGrid.clear();
  }

  /**
   * Batch add elements for efficient initialization
   */
  public batchAddElements(elements: ExcalidrawElement[]): void {
    for (const element of elements) {
      this.addElement(element);
    }
  }

  /**
   * Get all elements currently tracked
   */
  public getAllElements(): ExcalidrawElement[] {
    return Array.from(this.elements.values());
  }
}

/**
 * Utility function to create a collision detector
 */
export function createCollisionDetector(options?: { gridSize?: number; minSeparation?: number }): CollisionDetector {
  return new CollisionDetector(options);
}

/**
 * Helper function to check if two bounding boxes overlap
 */
export function checkBoundingBoxOverlap(box1: BoundingBox, box2: BoundingBox): boolean {
  return !(
    box1.x + box1.width <= box2.x ||
    box2.x + box2.width <= box1.x ||
    box1.y + box1.height <= box2.y ||
    box2.y + box2.height <= box1.y
  );
}

/**
 * Calculate the minimum distance between two bounding boxes
 */
export function calculateMinimumDistance(box1: BoundingBox, box2: BoundingBox): number {
  const dx = Math.max(0, Math.max(box1.x - (box2.x + box2.width), box2.x - (box1.x + box1.width)));
  const dy = Math.max(0, Math.max(box1.y - (box2.y + box2.height), box2.y - (box1.y + box1.height)));
  return Math.sqrt(dx * dx + dy * dy);
}