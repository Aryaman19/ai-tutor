/**
 * Entity Extractor for Timeline Content
 * 
 * Advanced entity extraction and relationship detection for timeline-based content.
 * Builds on existing LLM integration patterns while providing structured entity
 * information for intelligent layout and semantic understanding.
 */

import type {
  TimelineEvent,
  ImportanceLevel,
} from '@ai-tutor/types/timeline/TimelineEvent';

import type {
  StreamingTimelineChunk,
} from '@ai-tutor/types/timeline/StreamingTimelineChunk';

import type { CanvasStep } from '@ai-tutor/types';

import { 
  getStepExplanation, 
  extractStepEntities,
} from '@ai-tutor/types';

import { createUtilLogger } from '@ai-tutor/utils';

const logger = createUtilLogger('EntityExtractor');

/**
 * Entity types with detailed classification
 */
export type EntityType = 
  | 'concept'        // Abstract ideas, theories, principles
  | 'person'         // People, historical figures, scientists
  | 'place'          // Locations, geographical features
  | 'organization'   // Companies, institutions, groups
  | 'term'           // Technical terms, jargon, definitions
  | 'formula'        // Mathematical formulas, equations
  | 'process'        // Methods, procedures, algorithms
  | 'measurement'    // Units, quantities, metrics
  | 'date'           // Time periods, historical dates
  | 'technology'     // Tools, software, devices
  | 'material'       // Substances, compounds, elements
  | 'event'          // Historical events, phenomena

/**
 * Extracted entity with rich metadata
 */
export interface ExtractedEntity {
  /** Entity text as it appears in content */
  text: string;
  
  /** Normalized form for matching */
  normalized: string;
  
  /** Entity classification */
  type: EntityType;
  
  /** Importance level for layout prioritization */
  importance: ImportanceLevel;
  
  /** Number of mentions in the content */
  mentions: number;
  
  /** Positions where entity appears (character indices) */
  positions: number[];
  
  /** Context around each mention */
  contexts: Array<{
    before: string;
    after: string;
    sentence: string;
  }>;
  
  /** Confidence in entity extraction (0-1) */
  confidence: number;
  
  /** Additional properties specific to entity type */
  properties: Record<string, any>;
  
  /** Related entities (discovered through context analysis) */
  relatedEntities: string[];
  
  /** Synonyms and alternative forms found */
  synonyms: string[];
  
  /** Suggested visual representation */
  visualSuggestion?: {
    type: 'icon' | 'diagram' | 'chart' | 'text' | 'illustration';
    description: string;
    priority: number; // 1-10
  };
}

/**
 * Relationship between entities
 */
export interface EntityRelationship {
  /** Source entity */
  from: string;
  
  /** Target entity */
  to: string;
  
  /** Relationship type */
  type: 'causes' | 'leads_to' | 'is_part_of' | 'contrasts_with' | 'similar_to' | 'defines' | 'uses' | 'contains' | 'produces';
  
  /** Confidence in this relationship (0-1) */
  confidence: number;
  
  /** Context where relationship was found */
  context: string;
  
  /** Bidirectional relationship indicator */
  bidirectional: boolean;
  
  /** Relationship strength (0-1) */
  strength: number;
}

/**
 * Entity extraction result
 */
export interface EntityExtractionResult {
  /** All extracted entities */
  entities: ExtractedEntity[];
  
  /** Relationships between entities */
  relationships: EntityRelationship[];
  
  /** Entity clusters (groups of related entities) */
  clusters: Array<{
    id: string;
    entities: string[];
    theme: string;
    importance: ImportanceLevel;
  }>;
  
  /** Statistics about extraction */
  statistics: {
    totalEntities: number;
    entitiesByType: Record<EntityType, number>;
    averageConfidence: number;
    relationshipCount: number;
    clusterCount: number;
  };
  
  /** Suggested layout implications */
  layoutImplications: {
    suggestedRegions: Array<{
      region: 'header' | 'main' | 'sidebar' | 'footer';
      entities: string[];
      rationale: string;
    }>;
    
    visualComplexity: 'low' | 'medium' | 'high';
    
    interactionPoints: Array<{
      entity: string;
      interactionType: 'hover' | 'click' | 'highlight';
      description: string;
    }>;
  };
}

/**
 * Entity extraction configuration
 */
export interface ExtractionConfig {
  /** Minimum confidence threshold for entities */
  minConfidence: number;
  
  /** Maximum entities to extract */
  maxEntities: number;
  
  /** Minimum mentions to consider an entity */
  minMentions: number;
  
  /** Enable context analysis */
  enableContextAnalysis: boolean;
  
  /** Enable relationship detection */
  enableRelationshipDetection: boolean;
  
  /** Enable clustering */
  enableClustering: boolean;
  
  /** Language-specific settings */
  languageSettings: {
    /** Enable stemming for better matching */
    enableStemming: boolean;
    
    /** Case sensitivity */
    caseSensitive: boolean;
    
    /** Custom entity patterns */
    customPatterns: Array<{
      pattern: RegExp;
      type: EntityType;
      confidence: number;
    }>;
  };
  
  /** Visual suggestion settings */
  visualSuggestions: {
    /** Enable automatic visual suggestions */
    enabled: boolean;
    
    /** Minimum importance for visual suggestions */
    minImportance: ImportanceLevel;
  };
}

/**
 * Default extraction configuration
 */
const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  minConfidence: 0.6,
  maxEntities: 20,
  minMentions: 1,
  enableContextAnalysis: true,
  enableRelationshipDetection: true,
  enableClustering: true,
  languageSettings: {
    enableStemming: false, // Keep simple for Phase 1
    caseSensitive: false,
    customPatterns: [],
  },
  visualSuggestions: {
    enabled: true,
    minImportance: 'medium',
  },
};

/**
 * Entity patterns for different types
 */
const ENTITY_PATTERNS: Record<EntityType, Array<{
  pattern: RegExp;
  confidence: number;
  properties?: Record<string, any>;
}>> = {
  concept: [
    { pattern: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g, confidence: 0.7 },
    { pattern: /\b\w+ism\b/gi, confidence: 0.8 },
    { pattern: /\b\w+ology\b/gi, confidence: 0.8 },
    { pattern: /\btheory of \w+/gi, confidence: 0.9 },
  ],
  person: [
    { pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, confidence: 0.8 },
    { pattern: /\bDr\. [A-Z][a-z]+/gi, confidence: 0.9 },
    { pattern: /\bProfessor [A-Z][a-z]+/gi, confidence: 0.9 },
  ],
  place: [
    { pattern: /\b[A-Z][a-z]+(?:,\s*[A-Z][a-z]+)*\b/g, confidence: 0.7 },
    { pattern: /\bUniversity of \w+/gi, confidence: 0.8 },
  ],
  organization: [
    { pattern: /\b[A-Z]+(?:\s+[A-Z]+)*\b/g, confidence: 0.7 },
    { pattern: /\b\w+ Inc\.|Corp\.|Ltd\./gi, confidence: 0.9 },
  ],
  term: [
    { pattern: /\b\w+tion\b/gi, confidence: 0.6 },
    { pattern: /\b\w+ness\b/gi, confidence: 0.6 },
    { pattern: /\b\w+ment\b/gi, confidence: 0.6 },
  ],
  formula: [
    { pattern: /\b[A-Za-z]\s*=\s*[A-Za-z0-9+\-*/()^]+/g, confidence: 0.9 },
    { pattern: /\b\d+\s*[+\-*/]\s*\d+/g, confidence: 0.8 },
    { pattern: /\b[A-Za-z]{1,3}\s*=\s*[A-Za-z]{1,3}/g, confidence: 0.8 },
  ],
  process: [
    { pattern: /\b\w+ing process\b/gi, confidence: 0.8 },
    { pattern: /\bmethod of \w+/gi, confidence: 0.8 },
    { pattern: /\b\w+ algorithm\b/gi, confidence: 0.9 },
  ],
  measurement: [
    { pattern: /\b\d+\s*(?:kg|g|m|cm|mm|km|l|ml|°C|°F|%)\b/gi, confidence: 0.9 },
    { pattern: /\b\d+\s*(?:seconds?|minutes?|hours?|days?|years?)\b/gi, confidence: 0.8 },
  ],
  date: [
    { pattern: /\b\d{4}\b/g, confidence: 0.7 },
    { pattern: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi, confidence: 0.9 },
    { pattern: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, confidence: 0.8 },
  ],
  technology: [
    { pattern: /\b\w+(?:\.com|\.org|\.net)\b/gi, confidence: 0.8 },
    { pattern: /\bAI|ML|API|CPU|GPU|RAM|SSD|HDD\b/gi, confidence: 0.9 },
  ],
  material: [
    { pattern: /\b(?:carbon|oxygen|hydrogen|nitrogen|iron|gold|silver|copper)\b/gi, confidence: 0.8 },
    { pattern: /\bH2O|CO2|NaCl|H2SO4\b/gi, confidence: 0.9 },
  ],
  event: [
    { pattern: /\b\w+ War\b/gi, confidence: 0.8 },
    { pattern: /\b\w+ Revolution\b/gi, confidence: 0.8 },
    { pattern: /\bWorld War \w+/gi, confidence: 0.9 },
  ],
};

/**
 * Relationship patterns for detecting entity connections
 */
const RELATIONSHIP_PATTERNS: Array<{
  pattern: RegExp;
  type: EntityRelationship['type'];
  confidence: number;
  bidirectional: boolean;
}> = [
  { pattern: /(.+?)\s+causes?\s+(.+)/gi, type: 'causes', confidence: 0.8, bidirectional: false },
  { pattern: /(.+?)\s+leads? to\s+(.+)/gi, type: 'leads_to', confidence: 0.8, bidirectional: false },
  { pattern: /(.+?)\s+is part of\s+(.+)/gi, type: 'is_part_of', confidence: 0.8, bidirectional: false },
  { pattern: /(.+?)\s+contains?\s+(.+)/gi, type: 'contains', confidence: 0.7, bidirectional: false },
  { pattern: /(.+?)\s+uses?\s+(.+)/gi, type: 'uses', confidence: 0.7, bidirectional: false },
  { pattern: /(.+?)\s+produces?\s+(.+)/gi, type: 'produces', confidence: 0.7, bidirectional: false },
  { pattern: /(.+?)\s+similar to\s+(.+)/gi, type: 'similar_to', confidence: 0.7, bidirectional: true },
  { pattern: /(.+?)\s+(?:unlike|differs from)\s+(.+)/gi, type: 'contrasts_with', confidence: 0.7, bidirectional: true },
  { pattern: /(.+?)\s+(?:is defined as|means)\s+(.+)/gi, type: 'defines', confidence: 0.8, bidirectional: false },
];

/**
 * Main Entity Extractor class
 */
export class EntityExtractor {
  private readonly config: ExtractionConfig;

  constructor(config: Partial<ExtractionConfig> = {}) {
    this.config = { ...DEFAULT_EXTRACTION_CONFIG, ...config };
    logger.debug('EntityExtractor initialized', { config: this.config });
  }

  /**
   * Extract entities from timeline event
   */
  extractFromTimelineEvent(event: TimelineEvent): EntityExtractionResult {
    const content = this.extractContentFromEvent(event);
    return this.extractEntities(content, `timeline-event-${event.id}`);
  }

  /**
   * Extract entities from timeline chunk
   */
  extractFromTimelineChunk(chunk: StreamingTimelineChunk): EntityExtractionResult {
    const combinedContent = chunk.events
      .map(event => this.extractContentFromEvent(event))
      .join(' ');
    
    return this.extractEntities(combinedContent, `chunk-${chunk.chunkId}`);
  }

  /**
   * Extract entities from CanvasStep
   */
  extractFromCanvasStep(step: CanvasStep): EntityExtractionResult {
    const content = getStepExplanation(step);
    const narration = step.narration || '';
    const combinedContent = `${content} ${narration}`.trim();
    
    const result = this.extractEntities(combinedContent, `step-${step.step_number}`);
    
    // Integrate with existing step entity extraction
    const existingEntities = extractStepEntities(step);
    this.mergeExistingEntities(result, existingEntities);
    
    return result;
  }

  /**
   * Extract entities from multiple events
   */
  extractFromMultipleEvents(events: TimelineEvent[]): EntityExtractionResult {
    const combinedContent = events
      .map(event => this.extractContentFromEvent(event))
      .join(' ');
    
    return this.extractEntities(combinedContent, `multiple-events-${events.length}`);
  }

  /**
   * Core entity extraction method
   */
  private extractEntities(content: string, sourceId: string): EntityExtractionResult {
    logger.debug('Extracting entities', { sourceId, contentLength: content.length });

    // Preprocess content
    const processedContent = this.preprocessContent(content);
    
    // Extract entities by type
    const entities = this.extractEntitiesByType(processedContent);
    
    // Filter by confidence and mentions
    const filteredEntities = this.filterEntities(entities);
    
    // Add context analysis if enabled
    if (this.config.enableContextAnalysis) {
      this.addContextAnalysis(filteredEntities, processedContent);
    }
    
    // Extract relationships if enabled
    let relationships: EntityRelationship[] = [];
    if (this.config.enableRelationshipDetection) {
      relationships = this.extractRelationships(filteredEntities, processedContent);
    }
    
    // Create clusters if enabled
    let clusters: Array<{
      id: string;
      entities: string[];
      theme: string;
      importance: ImportanceLevel;
    }> = [];
    if (this.config.enableClustering) {
      clusters = this.createEntityClusters(filteredEntities, relationships);
    }
    
    // Generate visual suggestions
    this.generateVisualSuggestions(filteredEntities);
    
    // Calculate statistics
    const statistics = this.calculateStatistics(filteredEntities, relationships, clusters);
    
    // Generate layout implications
    const layoutImplications = this.generateLayoutImplications(filteredEntities, relationships, clusters);

    const result: EntityExtractionResult = {
      entities: filteredEntities,
      relationships,
      clusters,
      statistics,
      layoutImplications,
    };

    logger.debug('Entity extraction completed', {
      sourceId,
      entityCount: filteredEntities.length,
      relationshipCount: relationships.length,
      clusterCount: clusters.length,
    });

    return result;
  }

  /**
   * Preprocess content for entity extraction
   */
  private preprocessContent(content: string): string {
    let processed = content;
    
    // Normalize whitespace
    processed = processed.replace(/\s+/g, ' ').trim();
    
    // Handle case sensitivity
    if (!this.config.languageSettings.caseSensitive) {
      // Keep original casing for pattern matching, but store normalized forms
    }
    
    return processed;
  }

  /**
   * Extract entities by type using patterns
   */
  private extractEntitiesByType(content: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const seenEntities = new Set<string>();

    // Apply patterns for each entity type
    Object.entries(ENTITY_PATTERNS).forEach(([entityType, patterns]) => {
      patterns.forEach(({ pattern, confidence, properties = {} }) => {
        let match;
        const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        
        while ((match = globalPattern.exec(content)) !== null) {
          const text = match[0].trim();
          const normalized = text.toLowerCase();
          
          // Skip if already found with higher confidence
          const existingKey = `${normalized}:${entityType}`;
          if (seenEntities.has(existingKey)) continue;
          seenEntities.add(existingKey);
          
          // Skip very short or common words
          if (text.length < 2 || this.isCommonWord(text)) continue;
          
          entities.push({
            text,
            normalized,
            type: entityType as EntityType,
            importance: this.calculateImportance(text, content),
            mentions: this.countMentions(text, content),
            positions: this.findPositions(text, content),
            contexts: [],
            confidence,
            properties: { ...properties },
            relatedEntities: [],
            synonyms: [],
          });
        }
      });
    });

    // Apply custom patterns if any
    this.config.languageSettings.customPatterns.forEach(({ pattern, type, confidence }) => {
      let match;
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      
      while ((match = globalPattern.exec(content)) !== null) {
        const text = match[0].trim();
        const normalized = text.toLowerCase();
        
        entities.push({
          text,
          normalized,
          type,
          importance: this.calculateImportance(text, content),
          mentions: this.countMentions(text, content),
          positions: this.findPositions(text, content),
          contexts: [],
          confidence,
          properties: {},
          relatedEntities: [],
          synonyms: [],
        });
      }
    });

    return entities;
  }

  /**
   * Filter entities based on configuration criteria
   */
  private filterEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    return entities
      .filter(entity => 
        entity.confidence >= this.config.minConfidence &&
        entity.mentions >= this.config.minMentions
      )
      .sort((a, b) => {
        // Sort by importance, then by mentions, then by confidence
        const importanceOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const aScore = importanceOrder[a.importance] * 100 + a.mentions * 10 + a.confidence;
        const bScore = importanceOrder[b.importance] * 100 + b.mentions * 10 + b.confidence;
        return bScore - aScore;
      })
      .slice(0, this.config.maxEntities);
  }

  /**
   * Add context analysis to entities
   */
  private addContextAnalysis(entities: ExtractedEntity[], content: string): void {
    entities.forEach(entity => {
      entity.contexts = entity.positions.map(position => {
        const sentenceStart = Math.max(0, content.lastIndexOf('.', position) + 1);
        const sentenceEnd = content.indexOf('.', position + entity.text.length);
        const sentence = content.slice(sentenceStart, sentenceEnd === -1 ? content.length : sentenceEnd).trim();
        
        const before = content.slice(Math.max(0, position - 30), position);
        const after = content.slice(position + entity.text.length, Math.min(content.length, position + entity.text.length + 30));
        
        return { before, after, sentence };
      });
    });
  }

  /**
   * Extract relationships between entities
   */
  private extractRelationships(entities: ExtractedEntity[], content: string): EntityRelationship[] {
    const relationships: EntityRelationship[] = [];
    const entityMap = new Map(entities.map(e => [e.normalized, e]));

    RELATIONSHIP_PATTERNS.forEach(({ pattern, type, confidence, bidirectional }) => {
      let match;
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      
      while ((match = globalPattern.exec(content)) !== null) {
        if (match.length >= 3) {
          const fromText = match[1].trim().toLowerCase();
          const toText = match[2].trim().toLowerCase();
          
          // Find matching entities
          const fromEntity = this.findBestEntityMatch(fromText, entityMap);
          const toEntity = this.findBestEntityMatch(toText, entityMap);
          
          if (fromEntity && toEntity && fromEntity !== toEntity) {
            relationships.push({
              from: fromEntity.text,
              to: toEntity.text,
              type,
              confidence,
              context: match[0],
              bidirectional,
              strength: this.calculateRelationshipStrength(fromEntity, toEntity, content),
            });
            
            // Add bidirectional relationship if specified
            if (bidirectional) {
              relationships.push({
                from: toEntity.text,
                to: fromEntity.text,
                type,
                confidence: confidence * 0.9, // Slightly lower confidence for reverse
                context: match[0],
                bidirectional: true,
                strength: this.calculateRelationshipStrength(toEntity, fromEntity, content),
              });
            }
          }
        }
      });
    });

    return relationships.filter(rel => rel.confidence >= this.config.minConfidence);
  }

  /**
   * Create entity clusters based on relationships and context similarity
   */
  private createEntityClusters(
    entities: ExtractedEntity[],
    relationships: EntityRelationship[]
  ): Array<{
    id: string;
    entities: string[];
    theme: string;
    importance: ImportanceLevel;
  }> {
    const clusters: Array<{
      id: string;
      entities: string[];
      theme: string;
      importance: ImportanceLevel;
    }> = [];

    // Group entities by type first
    const typeGroups = new Map<EntityType, ExtractedEntity[]>();
    entities.forEach(entity => {
      if (!typeGroups.has(entity.type)) {
        typeGroups.set(entity.type, []);
      }
      typeGroups.get(entity.type)!.push(entity);
    });

    // Create clusters from type groups and relationships
    typeGroups.forEach((groupEntities, type) => {
      if (groupEntities.length >= 2) {
        const cluster = {
          id: `cluster-${type}-${clusters.length}`,
          entities: groupEntities.map(e => e.text),
          theme: this.generateClusterTheme(type, groupEntities),
          importance: this.calculateClusterImportance(groupEntities),
        };
        clusters.push(cluster);
      }
    });

    // Create relationship-based clusters
    const relationshipGroups = this.groupEntitiesByRelationships(entities, relationships);
    relationshipGroups.forEach(group => {
      if (group.length >= 2) {
        const cluster = {
          id: `cluster-relationship-${clusters.length}`,
          entities: group.map(e => e.text),
          theme: this.generateRelationshipClusterTheme(group),
          importance: this.calculateClusterImportance(group),
        };
        clusters.push(cluster);
      }
    });

    return clusters.slice(0, 5); // Limit to 5 clusters
  }

  /**
   * Generate visual suggestions for entities
   */
  private generateVisualSuggestions(entities: ExtractedEntity[]): void {
    if (!this.config.visualSuggestions.enabled) return;

    entities.forEach(entity => {
      if (this.shouldGenerateVisualSuggestion(entity)) {
        entity.visualSuggestion = this.createVisualSuggestion(entity);
      }
    });
  }

  /**
   * Calculate extraction statistics
   */
  private calculateStatistics(
    entities: ExtractedEntity[],
    relationships: EntityRelationship[],
    clusters: Array<{ id: string; entities: string[]; theme: string; importance: ImportanceLevel }>
  ) {
    const entitiesByType: Record<EntityType, number> = {} as Record<EntityType, number>;
    
    entities.forEach(entity => {
      entitiesByType[entity.type] = (entitiesByType[entity.type] || 0) + 1;
    });

    const averageConfidence = entities.length > 0
      ? entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length
      : 0;

    return {
      totalEntities: entities.length,
      entitiesByType,
      averageConfidence,
      relationshipCount: relationships.length,
      clusterCount: clusters.length,
    };
  }

  /**
   * Generate layout implications based on extracted entities
   */
  private generateLayoutImplications(
    entities: ExtractedEntity[],
    relationships: EntityRelationship[],
    clusters: Array<{ id: string; entities: string[]; theme: string; importance: ImportanceLevel }>
  ) {
    const suggestedRegions: Array<{
      region: 'header' | 'main' | 'sidebar' | 'footer';
      entities: string[];
      rationale: string;
    }> = [];

    // High importance entities go to main region
    const highImportanceEntities = entities
      .filter(e => e.importance === 'critical' || e.importance === 'high')
      .map(e => e.text);

    if (highImportanceEntities.length > 0) {
      suggestedRegions.push({
        region: 'main',
        entities: highImportanceEntities,
        rationale: 'High importance entities should be prominently displayed',
      });
    }

    // Supporting entities go to sidebar
    const supportingEntities = entities
      .filter(e => e.importance === 'medium')
      .map(e => e.text);

    if (supportingEntities.length > 0) {
      suggestedRegions.push({
        region: 'sidebar',
        entities: supportingEntities,
        rationale: 'Supporting entities provide additional context',
      });
    }

    // Determine visual complexity
    const visualComplexity = entities.length > 15 ? 'high' :
                           entities.length > 8 ? 'medium' : 'low';

    // Generate interaction points
    const interactionPoints = entities
      .filter(e => e.relatedEntities.length > 0 || e.visualSuggestion)
      .map(entity => ({
        entity: entity.text,
        interactionType: 'hover' as const,
        description: `Show related concepts and details for ${entity.text}`,
      }));

    return {
      suggestedRegions,
      visualComplexity,
      interactionPoints,
    };
  }

  // Helper methods

  private extractContentFromEvent(event: TimelineEvent): string {
    const content: string[] = [];
    
    if (event.content.audio?.text) {
      content.push(event.content.audio.text);
    }
    
    if (event.content.visual?.properties.text) {
      content.push(event.content.visual.properties.text);
    }
    
    return content.join(' ');
  }

  private calculateImportance(text: string, content: string): ImportanceLevel {
    const mentions = this.countMentions(text, content);
    const density = mentions / (content.length / 100);
    
    if (density > 0.5 || mentions > 5) return 'critical';
    if (density > 0.3 || mentions > 3) return 'high';
    if (density > 0.1 || mentions > 1) return 'medium';
    return 'low';
  }

  private countMentions(text: string, content: string): number {
    const regex = new RegExp(`\\b${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    return (content.match(regex) || []).length;
  }

  private findPositions(text: string, content: string): number[] {
    const positions: number[] = [];
    const regex = new RegExp(`\\b${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      positions.push(match.index);
    }
    
    return positions;
  }

  private isCommonWord(text: string): boolean {
    const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'];
    return commonWords.includes(text.toLowerCase()) || text.length < 3;
  }

  private findBestEntityMatch(text: string, entityMap: Map<string, ExtractedEntity>): ExtractedEntity | null {
    // Exact match first
    const exact = entityMap.get(text);
    if (exact) return exact;
    
    // Partial match
    for (const [key, entity] of entityMap) {
      if (key.includes(text) || text.includes(key)) {
        return entity;
      }
    }
    
    return null;
  }

  private calculateRelationshipStrength(from: ExtractedEntity, to: ExtractedEntity, content: string): number {
    // Calculate based on proximity and co-occurrence
    let strength = 0;
    
    from.positions.forEach(fromPos => {
      to.positions.forEach(toPos => {
        const distance = Math.abs(fromPos - toPos);
        if (distance < 100) { // Within 100 characters
          strength += 1 / (distance + 1);
        }
      });
    });
    
    return Math.min(1, strength);
  }

  private generateClusterTheme(type: EntityType, entities: ExtractedEntity[]): string {
    const typeThemes: Record<EntityType, string> = {
      concept: 'Core Concepts',
      person: 'Key People',
      place: 'Locations',
      organization: 'Organizations',
      term: 'Technical Terms',
      formula: 'Formulas & Equations',
      process: 'Processes & Methods',
      measurement: 'Measurements & Metrics',
      date: 'Timeline & Dates',
      technology: 'Technology & Tools',
      material: 'Materials & Substances',
      event: 'Events & Phenomena',
    };
    
    return typeThemes[type] || 'Related Concepts';
  }

  private calculateClusterImportance(entities: ExtractedEntity[]): ImportanceLevel {
    const importanceScores = { critical: 4, high: 3, medium: 2, low: 1 };
    const avgScore = entities.reduce((sum, e) => sum + importanceScores[e.importance], 0) / entities.length;
    
    if (avgScore >= 3.5) return 'critical';
    if (avgScore >= 2.5) return 'high';
    if (avgScore >= 1.5) return 'medium';
    return 'low';
  }

  private groupEntitiesByRelationships(entities: ExtractedEntity[], relationships: EntityRelationship[]): ExtractedEntity[][] {
    const groups: ExtractedEntity[][] = [];
    const processed = new Set<string>();
    
    relationships.forEach(rel => {
      if (!processed.has(rel.from) && !processed.has(rel.to)) {
        const fromEntity = entities.find(e => e.text === rel.from);
        const toEntity = entities.find(e => e.text === rel.to);
        
        if (fromEntity && toEntity) {
          groups.push([fromEntity, toEntity]);
          processed.add(rel.from);
          processed.add(rel.to);
        }
      }
    });
    
    return groups;
  }

  private generateRelationshipClusterTheme(entities: ExtractedEntity[]): string {
    const types = [...new Set(entities.map(e => e.type))];
    if (types.length === 1) {
      return this.generateClusterTheme(types[0], entities);
    }
    return 'Related Elements';
  }

  private shouldGenerateVisualSuggestion(entity: ExtractedEntity): boolean {
    if (!this.config.visualSuggestions.enabled) return false;
    
    const importanceOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const minImportance = importanceOrder[this.config.visualSuggestions.minImportance];
    const entityImportance = importanceOrder[entity.importance];
    
    return entityImportance >= minImportance;
  }

  private createVisualSuggestion(entity: ExtractedEntity): {
    type: 'icon' | 'diagram' | 'chart' | 'text' | 'illustration';
    description: string;
    priority: number;
  } {
    const typeVisualMap: Record<EntityType, { type: 'icon' | 'diagram' | 'chart' | 'text' | 'illustration'; description: string }> = {
      concept: { type: 'diagram', description: 'Conceptual diagram or mind map' },
      person: { type: 'icon', description: 'Person icon or portrait' },
      place: { type: 'icon', description: 'Location pin or map illustration' },
      organization: { type: 'icon', description: 'Building or organization icon' },
      term: { type: 'text', description: 'Highlighted definition or callout' },
      formula: { type: 'text', description: 'Mathematical notation or equation' },
      process: { type: 'diagram', description: 'Process flow or step diagram' },
      measurement: { type: 'chart', description: 'Measurement scale or gauge' },
      date: { type: 'icon', description: 'Calendar or timeline marker' },
      technology: { type: 'icon', description: 'Technology icon or device illustration' },
      material: { type: 'illustration', description: 'Material sample or molecular structure' },
      event: { type: 'illustration', description: 'Event timeline or historical illustration' },
    };
    
    const suggestion = typeVisualMap[entity.type];
    const importancePriority = { critical: 10, high: 8, medium: 6, low: 4 };
    
    return {
      ...suggestion,
      priority: importancePriority[entity.importance],
    };
  }

  private mergeExistingEntities(result: EntityExtractionResult, existingEntities: string[]): void {
    existingEntities.forEach(existingEntity => {
      const found = result.entities.find(e => 
        e.text.toLowerCase() === existingEntity.toLowerCase() ||
        e.normalized === existingEntity.toLowerCase()
      );
      
      if (!found) {
        // Add missing entity from existing extraction
        result.entities.push({
          text: existingEntity,
          normalized: existingEntity.toLowerCase(),
          type: 'concept',
          importance: 'medium',
          mentions: 1,
          positions: [],
          contexts: [],
          confidence: 0.7,
          properties: {},
          relatedEntities: [],
          synonyms: [],
        });
      }
    });
  }
}