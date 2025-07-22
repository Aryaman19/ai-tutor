/**
 * Entity Extractor for Timeline Content
 * 
 * Basic entity extraction types and interfaces for timeline-based content.
 */

import type { ImportanceLevel } from '@ai-tutor/types';

/**
 * Extracted entity information
 */
export interface ExtractedEntity {
  id: string;
  text: string;
  type: EntityType;
  importance: ImportanceLevel;
  confidence: number;
  context: string;
  position: {
    start: number;
    end: number;
  };
}

/**
 * Entity types for classification
 */
export type EntityType = 
  | 'concept'
  | 'process'
  | 'object'
  | 'person'
  | 'place'
  | 'time'
  | 'quantity'
  | 'relationship'
  | 'definition'
  | 'example';

/**
 * Relationship between entities
 */
export interface EntityRelationship {
  from: string;
  to: string;
  type: RelationshipType;
  confidence: number;
  context: string;
  bidirectional?: boolean;
  strength: number;
}

/**
 * Relationship types
 */
export type RelationshipType = 
  | 'causes'
  | 'is_part_of'
  | 'depends_on'
  | 'similar_to'
  | 'opposite_to'
  | 'leads_to'
  | 'contains'
  | 'enables'
  | 'requires';

/**
 * Complete entity extraction result
 */
export interface EntityExtraction {
  entities: ExtractedEntity[];
  relationships: EntityRelationship[];
  keyConceptEntities: ExtractedEntity[];
  mainTheme: string;
  confidence: number;
  processingTime: number;
}

/**
 * Configuration for entity extraction
 */
export interface EntityExtractionConfig {
  minConfidence: number;
  maxEntities: number;
  enableRelationshipDetection: boolean;
  contextWindow: number;
  entityTypes: EntityType[];
}

/**
 * Simple entity extractor class
 */
export class EntityExtractor {
  private config: EntityExtractionConfig;

  constructor(config: Partial<EntityExtractionConfig> = {}) {
    this.config = {
      minConfidence: 0.7,
      maxEntities: 20,
      enableRelationshipDetection: true,
      contextWindow: 100,
      entityTypes: ['concept', 'process', 'object', 'definition'],
      ...config
    };
  }

  /**
   * Extract entities from timeline event content
   */
  async extractFromContent(content: string): Promise<EntityExtraction> {
    const startTime = Date.now();
    
    // Basic entity extraction (placeholder implementation)
    const entities: ExtractedEntity[] = [];
    const relationships: EntityRelationship[] = [];
    
    // Simple word-based entity extraction for now
    const words = content.split(/\s+/);
    const importantWords = words.filter(word => 
      word.length > 3 && 
      !/^(the|and|or|but|in|on|at|to|for|of|with|by)$/i.test(word)
    );

    importantWords.slice(0, this.config.maxEntities).forEach((word, index) => {
      entities.push({
        id: `entity_${index}`,
        text: word,
        type: 'concept',
        importance: 'medium',
        confidence: 0.8,
        context: content.slice(Math.max(0, content.indexOf(word) - 20), content.indexOf(word) + 20),
        position: {
          start: content.indexOf(word),
          end: content.indexOf(word) + word.length
        }
      });
    });

    // Get key concepts (top 3 entities)
    const keyConceptEntities = entities.slice(0, 3);

    return {
      entities,
      relationships,
      keyConceptEntities,
      mainTheme: keyConceptEntities[0]?.text || 'General',
      confidence: 0.8,
      processingTime: Date.now() - startTime
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<EntityExtractionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

/**
 * Create a new entity extractor instance
 */
export function createEntityExtractor(config?: Partial<EntityExtractionConfig>): EntityExtractor {
  return new EntityExtractor(config);
}

export default EntityExtractor;