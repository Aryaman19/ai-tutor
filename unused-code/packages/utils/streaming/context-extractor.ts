/**
 * Context Extractor for maintaining educational progression across chunks.
 * 
 * This module analyzes completed chunks to extract key entities, concepts,
 * and educational progression state for seamless continuation in subsequent chunks.
 */

import type {
  StreamingTimelineChunk,
  ChunkContext,
} from '@ai-tutor/types';

import type {
  TimelineEvent,
  VisualInstruction,
  LayoutHint,
} from '@ai-tutor/types';

import { createUtilLogger } from '../logger';
import { asContentObject, asString } from '../type-utils';

const logger = createUtilLogger('ContextExtractor');

/**
 * Extracted entity with metadata
 */
export interface ExtractedEntity {
  /** Entity name */
  name: string;
  
  /** Entity type (concept, process, tool, etc.) */
  type: EntityType;
  
  /** Frequency of occurrence */
  frequency: number;
  
  /** Importance weight (0.0-1.0) */
  importance: number;
  
  /** First occurrence timestamp */
  firstOccurrence: number;
  
  /** Last occurrence timestamp */
  lastOccurrence: number;
  
  /** Related entities */
  relationships: string[];
  
  /** Context where it appeared */
  contexts: string[];
}

/**
 * Entity types for classification
 */
export enum EntityType {
  CONCEPT = 'concept',
  PROCESS = 'process',
  TOOL = 'tool',
  PERSON = 'person',
  LOCATION = 'location',
  FORMULA = 'formula',
  PRINCIPLE = 'principle',
  EXAMPLE = 'example',
  TERM = 'term',
}

/**
 * Knowledge progression state
 */
export interface KnowledgeProgression {
  /** Current complexity level (0.0-1.0) */
  complexityLevel: number;
  
  /** Concepts mastered so far */
  masteredConcepts: string[];
  
  /** Prerequisites satisfied */
  prerequisitesSatisfied: string[];
  
  /** Knowledge gaps identified */
  knowledgeGaps: string[];
  
  /** Recommended next concepts */
  nextConcepts: string[];
  
  /** Learning path progression */
  learningPath: string[];
}

/**
 * Visual context state
 */
export interface VisualContext {
  /** Elements currently on canvas */
  activeElements: VisualInstruction[];
  
  /** Visual themes used */
  visualThemes: string[];
  
  /** Layout patterns established */
  layoutPatterns: LayoutHint[];
  
  /** Color schemes used */
  colorSchemes: string[];
  
  /** Visual density level */
  densityLevel: number;
  
  /** Available canvas regions */
  availableRegions: string[];
}

/**
 * Narrative progression state
 */
export interface NarrativeProgression {
  /** Main story arc */
  storyArc: string;
  
  /** Current narrative position */
  narrativePosition: number;
  
  /** Narrative tone */
  tone: string;
  
  /** Character voice consistency */
  voicePattern: string;
  
  /** Story elements introduced */
  storyElements: string[];
  
  /** Narrative hooks for continuation */
  continuationHooks: string[];
}

/**
 * Complete context extraction result
 */
export interface ExtractionResult {
  /** Extracted entities with relationships */
  entities: ExtractedEntity[];
  
  /** Knowledge progression state */
  knowledge: KnowledgeProgression;
  
  /** Visual context state */
  visual: VisualContext;
  
  /** Narrative progression state */
  narrative: NarrativeProgression;
  
  /** Extraction metadata */
  metadata: {
    chunkCount: number;
    totalDuration: number;
    extractionTimestamp: number;
    confidence: number;
  };
}

/**
 * Configuration for context extraction
 */
export interface ExtractionConfig {
  /** Enable entity relationship detection */
  extractRelationships: boolean;
  
  /** Enable knowledge progression analysis */
  analyzeKnowledgeProgression: boolean;
  
  /** Enable visual context tracking */
  trackVisualContext: boolean;
  
  /** Enable narrative analysis */
  analyzeNarrative: boolean;
  
  /** Minimum entity frequency for inclusion */
  minEntityFrequency: number;
  
  /** Maximum entities to track */
  maxEntities: number;
  
  /** Entity importance threshold */
  importanceThreshold: number;
}

/**
 * Extracts and analyzes context from completed content chunks
 */
export class ContextExtractor {
  private config: ExtractionConfig;
  private entityPatterns: Map<EntityType, RegExp[]>;
  private stopWords: Set<string>;
  
  constructor(config: Partial<ExtractionConfig> = {}) {
    this.config = {
      extractRelationships: true,
      analyzeKnowledgeProgression: true,
      trackVisualContext: true,
      analyzeNarrative: true,
      minEntityFrequency: 1,
      maxEntities: 50,
      importanceThreshold: 0.1,
      ...config,
    };
    
    this.entityPatterns = this.initializeEntityPatterns();
    this.stopWords = this.initializeStopWords();
    
    logger.debug('ContextExtractor initialized', { config: this.config });
  }
  
  /**
   * Extract comprehensive context from chunks
   */
  async extractContext(chunks: StreamingTimelineChunk[]): Promise<ExtractionResult> {
    logger.info('Extracting context from chunks', { chunkCount: chunks.length });
    
    const startTime = Date.now();
    
    try {
      // Extract entities
      const entities = this.config.extractRelationships 
        ? await this.extractEntitiesWithRelationships(chunks)
        : await this.extractBasicEntities(chunks);
      
      // Analyze knowledge progression
      const knowledge = this.config.analyzeKnowledgeProgression
        ? await this.analyzeKnowledgeProgression(chunks, entities)
        : this.getDefaultKnowledgeProgression();
      
      // Track visual context
      const visual = this.config.trackVisualContext
        ? await this.extractVisualContext(chunks)
        : this.getDefaultVisualContext();
      
      // Analyze narrative
      const narrative = this.config.analyzeNarrative
        ? await this.analyzeNarrativeProgression(chunks)
        : this.getDefaultNarrativeProgression();
      
      const totalDuration = chunks.reduce((sum, chunk) => {
        return sum + chunk.events.reduce((eventSum, event) => eventSum + (event.duration || 0), 0);
      }, 0);
      
      const extractionTime = Date.now() - startTime;
      const confidence = this.calculateConfidence(chunks, entities);
      
      const result: ExtractionResult = {
        entities,
        knowledge,
        visual,
        narrative,
        metadata: {
          chunkCount: chunks.length,
          totalDuration,
          extractionTimestamp: Date.now(),
          confidence,
        },
      };
      
      logger.info('Context extraction complete', {
        entityCount: entities.length,
        extractionTime,
        confidence: confidence.toFixed(2),
      });
      
      return result;
      
    } catch (error) {
      logger.error('Error extracting context', { error });
      throw new Error(`Context extraction failed: ${error}`);
    }
  }
  
  /**
   * Extract entities with relationship analysis
   */
  private async extractEntitiesWithRelationships(chunks: StreamingTimelineChunk[]): Promise<ExtractedEntity[]> {
    const entityMap = new Map<string, ExtractedEntity>();
    const coOccurrenceMap = new Map<string, Set<string>>();
    
    // First pass: extract all entities
    for (const chunk of chunks) {
      for (const event of chunk.events) {
        if (!event.content) continue;
        
        const eventEntities = this.extractEntitiesFromText(asString(event.content), event.timestamp || 0);
        
        for (const entity of eventEntities) {
          const key = `${entity.type}:${entity.name}`;
          
          if (entityMap.has(key)) {
            // Update existing entity
            const existing = entityMap.get(key)!;
            existing.frequency += 1;
            existing.lastOccurrence = event.timestamp || 0;
            existing.contexts.push(asString(event.content));
            
            // Update importance based on frequency and recency
            existing.importance = this.calculateEntityImportance(existing);
          } else {
            entityMap.set(key, entity);
            coOccurrenceMap.set(key, new Set());
          }
        }
        
        // Track co-occurrences for relationship detection
        for (let i = 0; i < eventEntities.length; i++) {
          for (let j = i + 1; j < eventEntities.length; j++) {
            const entity1Key = `${eventEntities[i].type}:${eventEntities[i].name}`;
            const entity2Key = `${eventEntities[j].type}:${eventEntities[j].name}`;
            
            coOccurrenceMap.get(entity1Key)?.add(entity2Key);
            coOccurrenceMap.get(entity2Key)?.add(entity1Key);
          }
        }
      }
    }
    
    // Second pass: establish relationships
    for (const [key, entity] of entityMap) {
      const relatedKeys = coOccurrenceMap.get(key) || new Set();
      entity.relationships = Array.from(relatedKeys)
        .map(relKey => relKey.split(':')[1]) // Extract name from type:name key
        .filter(name => name !== entity.name)
        .slice(0, 5); // Limit to top 5 relationships
    }
    
    // Filter and sort entities
    const entities = Array.from(entityMap.values())
      .filter(entity => 
        entity.frequency >= this.config.minEntityFrequency &&
        entity.importance >= this.config.importanceThreshold
      )
      .sort((a, b) => b.importance - a.importance)
      .slice(0, this.config.maxEntities);
    
    return entities;
  }
  
  /**
   * Extract basic entities without relationships
   */
  private async extractBasicEntities(chunks: StreamingTimelineChunk[]): Promise<ExtractedEntity[]> {
    const entityMap = new Map<string, ExtractedEntity>();
    
    for (const chunk of chunks) {
      for (const event of chunk.events) {
        if (!event.content) continue;
        
        const entities = this.extractEntitiesFromText(asString(event.content), event.timestamp || 0);
        
        for (const entity of entities) {
          const key = `${entity.type}:${entity.name}`;
          
          if (entityMap.has(key)) {
            const existing = entityMap.get(key)!;
            existing.frequency += 1;
            existing.lastOccurrence = event.timestamp || 0;
            existing.contexts.push(asString(event.content));
            existing.importance = this.calculateEntityImportance(existing);
          } else {
            entityMap.set(key, entity);
          }
        }
      }
    }
    
    return Array.from(entityMap.values())
      .filter(entity => entity.frequency >= this.config.minEntityFrequency)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, this.config.maxEntities);
  }
  
  /**
   * Extract entities from text content
   */
  private extractEntitiesFromText(text: string, timestamp: number): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    
    // Extract entities for each type
    for (const [type, patterns] of this.entityPatterns) {
      for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
          for (const match of matches) {
            const cleanName = this.cleanEntityName(match);
            if (cleanName && !this.stopWords.has(cleanName.toLowerCase())) {
              entities.push({
                name: cleanName,
                type,
                frequency: 1,
                importance: 0.5, // Will be recalculated
                firstOccurrence: timestamp,
                lastOccurrence: timestamp,
                relationships: [],
                contexts: [text],
              });
            }
          }
        }
      }
    }
    
    return entities;
  }
  
  /**
   * Analyze knowledge progression
   */
  private async analyzeKnowledgeProgression(
    chunks: StreamingTimelineChunk[],
    entities: ExtractedEntity[]
  ): Promise<KnowledgeProgression> {
    // Analyze concept complexity progression
    const conceptEntities = entities.filter(e => 
      e.type === EntityType.CONCEPT || e.type === EntityType.PRINCIPLE
    );
    
    // Calculate complexity level based on concept density and sophistication
    const complexityLevel = this.calculateComplexityLevel(chunks, conceptEntities);
    
    // Identify mastered concepts (mentioned multiple times, early introduction)
    const masteredConcepts = conceptEntities
      .filter(e => e.frequency >= 2 && e.firstOccurrence < chunks.length * 0.5)
      .map(e => e.name);
    
    // Simple prerequisite satisfaction based on concept order
    const prerequisitesSatisfied = this.identifyPrerequisites(conceptEntities);
    
    // Knowledge gaps (concepts mentioned but not fully explained)
    const knowledgeGaps = this.identifyKnowledgeGaps(chunks, entities);
    
    // Recommend next concepts based on progression
    const nextConcepts = this.recommendNextConcepts(conceptEntities, complexityLevel);
    
    // Build learning path
    const learningPath = this.constructLearningPath(conceptEntities);
    
    return {
      complexityLevel,
      masteredConcepts,
      prerequisitesSatisfied,
      knowledgeGaps,
      nextConcepts,
      learningPath,
    };
  }
  
  /**
   * Extract visual context
   */
  private async extractVisualContext(chunks: StreamingTimelineChunk[]): Promise<VisualContext> {
    const activeElements: VisualInstruction[] = [];
    const visualThemes = new Set<string>();
    const layoutPatterns: LayoutHint[] = [];
    const colorSchemes = new Set<string>();
    let densityLevel = 0;
    const availableRegions = new Set<string>();
    
    for (const chunk of chunks) {
      for (const event of chunk.events) {
        // Handle both legacy visualInstruction and new content structure
        const content = asContentObject(event.content);
        const visual = content.visual || (typeof event.visualInstruction === 'object' ? event.visualInstruction : null);
        
        if (visual) {
          activeElements.push(visual);
          
          // Extract visual themes
          if (visual.elementType) {
            visualThemes.add(visual.elementType);
          }
          
          // Track layout patterns
          if (event.layoutHints && event.layoutHints.length > 0) {
            const firstHint = event.layoutHints[0];
            layoutPatterns.push(firstHint);
            
            if (firstHint.preferredRegion) {
              availableRegions.add(firstHint.preferredRegion);
            }
          }
          
          // Extract color information (if available in properties)
          if (visual.properties?.color) {
            colorSchemes.add(visual.properties.color);
          }
        }
      }
    }
    
    // Calculate visual density
    densityLevel = activeElements.length / Math.max(1, chunks.length);
    
    return {
      activeElements: activeElements.slice(-10), // Keep recent elements
      visualThemes: Array.from(visualThemes),
      layoutPatterns: layoutPatterns.slice(-5), // Recent patterns
      colorSchemes: Array.from(colorSchemes),
      densityLevel: Math.min(1.0, densityLevel / 5), // Normalize
      availableRegions: Array.from(availableRegions),
    };
  }
  
  /**
   * Analyze narrative progression
   */
  private async analyzeNarrativeProgression(chunks: StreamingTimelineChunk[]): Promise<NarrativeProgression> {
    if (chunks.length === 0) {
      return this.getDefaultNarrativeProgression();
    }
    
    // Extract story arc from chunk progression
    const storyArc = this.extractStoryArc(chunks);
    
    // Calculate narrative position (0.0-1.0)
    const narrativePosition = chunks.length > 0 ? 0.5 + (chunks.length * 0.1) : 0.0;
    
    // Analyze tone consistency
    const tone = this.analyzeTone(chunks);
    
    // Extract voice pattern
    const voicePattern = this.extractVoicePattern(chunks);
    
    // Identify story elements
    const storyElements = this.extractStoryElements(chunks);
    
    // Generate continuation hooks
    const continuationHooks = this.generateContinuationHooks(chunks);
    
    return {
      storyArc,
      narrativePosition: Math.min(1.0, narrativePosition),
      tone,
      voicePattern,
      storyElements,
      continuationHooks,
    };
  }
  
  /**
   * Initialize entity extraction patterns
   */
  private initializeEntityPatterns(): Map<EntityType, RegExp[]> {
    return new Map([
      [EntityType.CONCEPT, [
        /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g, // Capitalized terms
        /"([^"]+)"/g, // Quoted terms
        /\b(?:concept|principle|idea|theory)\s+of\s+([A-Za-z\s]+)/gi,
      ]],
      [EntityType.PROCESS, [
        /\b(?:process|method|procedure|technique)\s+of\s+([A-Za-z\s]+)/gi,
        /\b([A-Za-z\s]+)\s+(?:process|method|procedure)/gi,
      ]],
      [EntityType.FORMULA, [
        /\b([A-Z]\s*=\s*[^.]+)/g, // Simple formulas
        /\b(?:formula|equation)\s+([A-Za-z0-9\s=+-]+)/gi,
      ]],
      [EntityType.TERM, [
        /\b(?:term|word|phrase)\s+"([^"]+)"/gi,
        /\b([a-z]+)\s+(?:means|refers to|is defined as)/gi,
      ]],
      [EntityType.EXAMPLE, [
        /\b(?:example|instance|case)\s+of\s+([A-Za-z\s]+)/gi,
        /\bfor\s+example,?\s+([A-Za-z\s]+)/gi,
      ]],
    ]);
  }
  
  /**
   * Initialize stop words set
   */
  private initializeStopWords(): Set<string> {
    return new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'this', 'that', 'these', 'those', 'we', 'you',
      'they', 'it', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has',
      'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
      'might', 'can', 'example', 'like', 'such', 'very', 'just', 'now',
    ]);
  }
  
  /**
   * Calculate entity importance
   */
  private calculateEntityImportance(entity: ExtractedEntity): number {
    // Weight factors
    const frequencyWeight = 0.4;
    const recencyWeight = 0.3;
    const contextWeight = 0.3;
    
    // Frequency score (logarithmic)
    const frequencyScore = Math.min(1.0, Math.log(entity.frequency + 1) / Math.log(10));
    
    // Recency score (more recent = higher score)
    const recencyScore = entity.lastOccurrence / Math.max(1, entity.lastOccurrence);
    
    // Context diversity score
    const uniqueContexts = new Set(entity.contexts.map(ctx => ctx.substring(0, 50)));
    const contextScore = Math.min(1.0, uniqueContexts.size / 5);
    
    return (
      frequencyWeight * frequencyScore +
      recencyWeight * recencyScore +
      contextWeight * contextScore
    );
  }
  
  /**
   * Calculate complexity level progression
   */
  private calculateComplexityLevel(chunks: StreamingTimelineChunk[], concepts: ExtractedEntity[]): number {
    if (chunks.length === 0) return 0.0;
    
    // Base progression
    const baseComplexity = Math.min(0.9, 0.2 + (chunks.length * 0.1));
    
    // Concept density factor
    const conceptDensity = concepts.length / chunks.length;
    const densityFactor = Math.min(0.3, conceptDensity * 0.1);
    
    // Technical term factor
    const technicalTerms = concepts.filter(c => c.name.length > 8 || /[A-Z]{2,}/.test(c.name));
    const technicalFactor = Math.min(0.2, technicalTerms.length * 0.05);
    
    return Math.min(1.0, baseComplexity + densityFactor + technicalFactor);
  }
  
  /**
   * Additional helper methods (simplified for brevity)
   */
  private cleanEntityName(name: string): string {
    return name.replace(/['"]/g, '').trim();
  }
  
  private identifyPrerequisites(concepts: ExtractedEntity[]): string[] {
    return concepts
      .filter(c => c.firstOccurrence === 0 && c.frequency > 1)
      .map(c => c.name)
      .slice(0, 5);
  }
  
  private identifyKnowledgeGaps(chunks: StreamingTimelineChunk[], entities: ExtractedEntity[]): string[] {
    return entities
      .filter(e => e.frequency === 1 && e.contexts.length === 1)
      .map(e => e.name)
      .slice(0, 3);
  }
  
  private recommendNextConcepts(concepts: ExtractedEntity[], complexityLevel: number): string[] {
    const baseConcepts = ['Applications', 'Examples', 'Practice'];
    const advancedConcepts = ['Advanced Topics', 'Complex Scenarios', 'Real-world Cases'];
    
    return complexityLevel > 0.6 ? advancedConcepts : baseConcepts;
  }
  
  private constructLearningPath(concepts: ExtractedEntity[]): string[] {
    return concepts
      .sort((a, b) => a.firstOccurrence - b.firstOccurrence)
      .map(c => c.name)
      .slice(0, 10);
  }
  
  private extractStoryArc(chunks: StreamingTimelineChunk[]): string {
    const chunkSummaries = chunks
      .map(chunk => chunk.metadata?.summary || '')
      .filter(summary => summary.length > 0);
    
    return chunkSummaries.join(' → ') || 'Educational progression';
  }
  
  private analyzeTone(chunks: StreamingTimelineChunk[]): string {
    // Simple tone analysis based on content patterns
    const allContent = chunks
      .flatMap(chunk => chunk.events.map(event => asString(event.content) || ''))
      .join(' ');
    
    if (allContent.includes('!')) return 'enthusiastic';
    if (allContent.includes('?')) return 'questioning';
    if (allContent.includes('we') || allContent.includes('you')) return 'conversational';
    
    return 'formal';
  }
  
  private extractVoicePattern(chunks: StreamingTimelineChunk[]): string {
    // Analyze consistent voice patterns
    return 'educational'; // Simplified implementation
  }
  
  private extractStoryElements(chunks: StreamingTimelineChunk[]): string[] {
    // Extract narrative elements
    return ['introduction', 'development', 'examples']; // Simplified
  }
  
  private generateContinuationHooks(chunks: StreamingTimelineChunk[]): string[] {
    const lastChunk = chunks[chunks.length - 1];
    if (!lastChunk) return [];
    
    return [
      'Build on established concepts',
      'Explore practical applications',
      'Introduce advanced variations',
    ];
  }
  
  private calculateConfidence(chunks: StreamingTimelineChunk[], entities: ExtractedEntity[]): number {
    const chunkFactor = Math.min(1.0, chunks.length / 3);
    const entityFactor = Math.min(1.0, entities.length / 10);
    const contentFactor = chunks.some(chunk => 
      chunk.events.some(event => event.content && asString(event.content).length > 50)
    ) ? 1.0 : 0.5;
    
    return (chunkFactor + entityFactor + contentFactor) / 3;
  }
  
  private getDefaultKnowledgeProgression(): KnowledgeProgression {
    return {
      complexityLevel: 0.5,
      masteredConcepts: [],
      prerequisitesSatisfied: [],
      knowledgeGaps: [],
      nextConcepts: [],
      learningPath: [],
    };
  }
  
  private getDefaultVisualContext(): VisualContext {
    return {
      activeElements: [],
      visualThemes: [],
      layoutPatterns: [],
      colorSchemes: [],
      densityLevel: 0.5,
      availableRegions: ['main', 'sidebar'],
    };
  }
  
  private getDefaultNarrativeProgression(): NarrativeProgression {
    return {
      storyArc: 'Educational content',
      narrativePosition: 0.0,
      tone: 'neutral',
      voicePattern: 'standard',
      storyElements: [],
      continuationHooks: [],
    };
  }
}