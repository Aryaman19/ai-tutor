/**
 * Timeline Content Classifier
 * 
 * Semantic content type detection and analysis for timeline-based content.
 * Extends existing content generation patterns with advanced classification
 * for intelligent layout and positioning decisions.
 */

import type {
  TimelineEvent,
  TimelineEventCollection,
  ContentType,
  LayoutHint,
  ImportanceLevel,
} from '@ai-tutor/types/timeline/TimelineEvent';

import type {
  StreamingTimelineChunk,
  ChunkContext,
} from '@ai-tutor/types/timeline/StreamingTimelineChunk';

import type { CanvasStep } from '@ai-tutor/types';

import { 
  getStepExplanation, 
  getStepSemanticType, 
  getStepComplexity,
  extractStepEntities,
} from '@ai-tutor/types';

import { createUtilLogger } from '@ai-tutor/utils';

const logger = createUtilLogger('TimelineContentClassifier');

/**
 * Content analysis result
 */
export interface ContentAnalysisResult {
  /** Primary content type */
  primaryType: ContentType;
  
  /** Secondary content types found */
  secondaryTypes: ContentType[];
  
  /** Complexity assessment */
  complexity: 'simple' | 'medium' | 'complex';
  
  /** Key entities and concepts */
  keyEntities: Array<{
    text: string;
    type: 'concept' | 'person' | 'place' | 'term' | 'formula';
    importance: ImportanceLevel;
    mentions: number;
  }>;
  
  /** Relationships between entities */
  relationships: Array<{
    from: string;
    to: string;
    type: 'causes' | 'leads_to' | 'is_part_of' | 'contrasts_with' | 'similar_to' | 'defines';
    confidence: number; // 0-1
  }>;
  
  /** Visual requirements detected */
  visualRequirements: Array<{
    type: 'diagram' | 'chart' | 'illustration' | 'flowchart' | 'comparison_table';
    priority: ImportanceLevel;
    description: string;
    estimatedElements: number;
  }>;
  
  /** Suggested layout hints */
  layoutHints: LayoutHint[];
  
  /** Engagement and educational metrics */
  metrics: {
    /** Estimated attention required (1-10) */
    attentionLevel: number;
    
    /** Information density (1-10) */
    informationDensity: number;
    
    /** Interaction potential (1-10) */
    interactionPotential: number;
    
    /** Memorability score (1-10) */
    memorability: number;
  };
  
  /** Content structure analysis */
  structure: {
    /** Main topics in order */
    mainTopics: string[];
    
    /** Supporting details */
    supportingDetails: string[];
    
    /** Examples provided */
    examples: string[];
    
    /** Questions or prompts */
    questions: string[];
  };
}

/**
 * Classification configuration
 */
export interface ClassificationConfig {
  /** Enable advanced NLP analysis */
  enableAdvancedNLP: boolean;
  
  /** Minimum confidence for relationships */
  minRelationshipConfidence: number;
  
  /** Maximum entities to extract */
  maxEntities: number;
  
  /** Language processing settings */
  languageSettings: {
    /** Stemming enabled */
    enableStemming: boolean;
    
    /** Stop words removal */
    removeStopWords: boolean;
    
    /** Custom stop words */
    customStopWords: string[];
  };
  
  /** Visual detection sensitivity */
  visualDetection: {
    /** Enable diagram detection */
    enableDiagramDetection: boolean;
    
    /** Minimum confidence for visual suggestions */
    minVisualConfidence: number;
  };
}

/**
 * Default classification configuration
 */
const DEFAULT_CLASSIFICATION_CONFIG: ClassificationConfig = {
  enableAdvancedNLP: true,
  minRelationshipConfidence: 0.6,
  maxEntities: 15,
  languageSettings: {
    enableStemming: false, // Keep false for simplicity in Phase 1
    removeStopWords: true,
    customStopWords: ['basically', 'essentially', 'actually', 'really'],
  },
  visualDetection: {
    enableDiagramDetection: true,
    minVisualConfidence: 0.7,
  },
};

/**
 * Content pattern definitions for classification
 */
const CONTENT_PATTERNS = {
  definition: {
    keywords: ['define', 'definition', 'means', 'refers to', 'is known as', 'called', 'term'],
    phrases: [
      /(.+) is defined as (.+)/i,
      /(.+) means (.+)/i,
      /(.+) refers to (.+)/i,
      /the definition of (.+) is (.+)/i,
    ],
    weight: 1.0,
  },
  process: {
    keywords: ['step', 'process', 'procedure', 'method', 'algorithm', 'sequence'],
    phrases: [
      /(first|initially|to start).+(then|next|after).+(finally|lastly|end)/is,
      /step \d+/i,
      /(begin|start).+(continue|proceed).+(complete|finish)/is,
    ],
    weight: 1.2,
  },
  comparison: {
    keywords: ['versus', 'compared to', 'difference', 'similar', 'unlike', 'contrast'],
    phrases: [
      /(.+) (vs|versus) (.+)/i,
      /difference between (.+) and (.+)/i,
      /(.+) is similar to (.+)/i,
      /unlike (.+), (.+)/i,
    ],
    weight: 1.1,
  },
  example: {
    keywords: ['example', 'instance', 'illustration', 'case study', 'demonstration'],
    phrases: [
      /for example/i,
      /such as (.+)/i,
      /for instance/i,
      /let's consider (.+)/i,
    ],
    weight: 0.8,
  },
  list: {
    keywords: ['list', 'items', 'elements', 'components', 'parts', 'types'],
    phrases: [
      /(\d+\.|•|-|\*) (.+)/gm,
      /(first|second|third|fourth|fifth).+/i,
      /include (.+), (.+), and (.+)/i,
    ],
    weight: 0.9,
  },
  formula: {
    keywords: ['formula', 'equation', 'calculation', 'math', 'solve'],
    phrases: [
      /(.+) = (.+)/,
      /formula for (.+)/i,
      /calculate (.+)/i,
      /\d+\s*[+\-*/]\s*\d+/,
    ],
    weight: 1.3,
  },
};

/**
 * Visual requirement patterns
 */
const VISUAL_PATTERNS = {
  diagram: {
    keywords: ['diagram', 'chart', 'graph', 'visual', 'illustration', 'figure'],
    contextKeywords: ['show', 'display', 'visualize', 'illustrate', 'draw'],
    weight: 1.0,
  },
  flowchart: {
    keywords: ['flow', 'process', 'steps', 'sequence', 'workflow'],
    contextKeywords: ['follows', 'leads to', 'next', 'then', 'after'],
    weight: 1.2,
  },
  comparison_table: {
    keywords: ['compare', 'contrast', 'versus', 'table', 'matrix'],
    contextKeywords: ['side by side', 'differences', 'similarities'],
    weight: 1.1,
  },
};

/**
 * Main Timeline Content Classifier
 */
export class TimelineContentClassifier {
  private readonly config: ClassificationConfig;

  constructor(config: Partial<ClassificationConfig> = {}) {
    this.config = { ...DEFAULT_CLASSIFICATION_CONFIG, ...config };
    logger.debug('TimelineContentClassifier initialized', { config: this.config });
  }

  /**
   * Analyze a timeline event for content classification
   */
  analyzeTimelineEvent(event: TimelineEvent): ContentAnalysisResult {
    const content = this.extractEventContent(event);
    return this.analyzeContent(content, `timeline-event-${event.id}`);
  }

  /**
   * Analyze a streaming timeline chunk
   */
  analyzeTimelineChunk(chunk: StreamingTimelineChunk): ContentAnalysisResult {
    // Combine all event content for analysis
    const combinedContent = chunk.events
      .map(event => this.extractEventContent(event))
      .join(' ');
    
    const result = this.analyzeContent(combinedContent, `chunk-${chunk.chunkId}`);
    
    // Enhance with chunk-specific metadata
    result.metrics.informationDensity = Math.min(10, chunk.events.length / (chunk.duration / 10000));
    
    return result;
  }

  /**
   * Analyze a CanvasStep for timeline compatibility
   */
  analyzeCanvasStep(step: CanvasStep): ContentAnalysisResult {
    const content = getStepExplanation(step);
    const narration = step.narration || '';
    const combinedContent = `${content} ${narration}`.trim();
    
    const result = this.analyzeContent(combinedContent, `step-${step.step_number}`);
    
    // Integrate existing step analysis
    const existingSemanticType = getStepSemanticType(step);
    const existingComplexity = getStepComplexity(step);
    const existingEntities = extractStepEntities(step);
    
    // Merge with existing analysis
    if (existingSemanticType && !result.secondaryTypes.includes(existingSemanticType as ContentType)) {
      result.secondaryTypes.unshift(existingSemanticType as ContentType);
    }
    
    result.complexity = existingComplexity;
    
    // Add existing entities
    existingEntities.forEach(entity => {
      if (!result.keyEntities.some(e => e.text === entity)) {
        result.keyEntities.push({
          text: entity,
          type: 'concept',
          importance: 'medium',
          mentions: 1,
        });
      }
    });
    
    return result;
  }

  /**
   * Analyze timeline event collection
   */
  analyzeEventCollection(collection: TimelineEventCollection): ContentAnalysisResult {
    // Analyze each event and combine results
    const eventAnalyses = collection.events.map(event => this.analyzeTimelineEvent(event));
    
    return this.combineAnalyses(eventAnalyses, `collection-${collection.events.length}-events`);
  }

  /**
   * Core content analysis method
   */
  private analyzeContent(content: string, sourceId: string): ContentAnalysisResult {
    logger.debug('Analyzing content', { sourceId, contentLength: content.length });

    // Clean and preprocess content
    const cleanContent = this.preprocessContent(content);
    
    // Classify content type
    const { primaryType, secondaryTypes, confidence } = this.classifyContentType(cleanContent);
    
    // Assess complexity
    const complexity = this.assessComplexity(cleanContent);
    
    // Extract entities
    const keyEntities = this.extractEntities(cleanContent);
    
    // Find relationships
    const relationships = this.extractRelationships(cleanContent, keyEntities);
    
    // Detect visual requirements
    const visualRequirements = this.detectVisualRequirements(cleanContent);
    
    // Generate layout hints
    const layoutHints = this.generateLayoutHints(primaryType, keyEntities, visualRequirements);
    
    // Calculate metrics
    const metrics = this.calculateMetrics(cleanContent, keyEntities, visualRequirements);
    
    // Analyze structure
    const structure = this.analyzeContentStructure(cleanContent);

    const result: ContentAnalysisResult = {
      primaryType,
      secondaryTypes,
      complexity,
      keyEntities,
      relationships,
      visualRequirements,
      layoutHints,
      metrics,
      structure,
    };

    logger.debug('Content analysis completed', { 
      sourceId, 
      primaryType, 
      complexity,
      entityCount: keyEntities.length,
      relationshipCount: relationships.length 
    });

    return result;
  }

  /**
   * Preprocess content for analysis
   */
  private preprocessContent(content: string): string {
    let processed = content.toLowerCase().trim();
    
    // Remove excessive whitespace
    processed = processed.replace(/\s+/g, ' ');
    
    // Remove stop words if enabled
    if (this.config.languageSettings.removeStopWords) {
      const stopWords = [
        'the', 'is', 'at', 'which', 'on', 'and', 'a', 'to', 'are', 'as', 'an', 'be', 'or', 'will', 'can',
        ...this.config.languageSettings.customStopWords,
      ];
      
      const words = processed.split(' ');
      processed = words.filter(word => !stopWords.includes(word)).join(' ');
    }
    
    return processed;
  }

  /**
   * Classify content type using pattern matching
   */
  private classifyContentType(content: string): {
    primaryType: ContentType;
    secondaryTypes: ContentType[];
    confidence: number;
  } {
    const scores = new Map<ContentType, number>();
    
    // Score each content type
    Object.entries(CONTENT_PATTERNS).forEach(([type, pattern]) => {
      let score = 0;
      
      // Keyword matching
      pattern.keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = content.match(regex);
        score += (matches?.length || 0) * 0.1;
      });
      
      // Phrase pattern matching
      pattern.phrases.forEach(phrasePattern => {
        const matches = content.match(phrasePattern);
        score += (matches?.length || 0) * 0.3;
      });
      
      // Apply pattern weight
      score *= pattern.weight;
      
      scores.set(type as ContentType, score);
    });
    
    // Sort by score
    const sortedTypes = Array.from(scores.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([type]) => type);
    
    const primaryType = sortedTypes[0] || 'story';
    const secondaryTypes = sortedTypes.slice(1, 3).filter(type => scores.get(type)! > 0);
    const confidence = Math.min(1, scores.get(primaryType)! / 2);
    
    return { primaryType, secondaryTypes, confidence };
  }

  /**
   * Assess content complexity
   */
  private assessComplexity(content: string): 'simple' | 'medium' | 'complex' {
    const words = content.split(' ').length;
    const sentences = content.split(/[.!?]+/).length;
    const avgWordsPerSentence = words / sentences;
    const uniqueWords = new Set(content.split(' ')).size;
    const vocabulary = uniqueWords / words;
    
    // Technical terms indicator
    const technicalTerms = content.match(/\b[A-Z]{2,}\b|\b\w+ology\b|\b\w+ism\b/g)?.length || 0;
    
    const complexityScore = (
      Math.min(words / 100, 1) * 0.3 +
      Math.min(avgWordsPerSentence / 20, 1) * 0.2 +
      vocabulary * 0.3 +
      Math.min(technicalTerms / 5, 1) * 0.2
    );
    
    if (complexityScore > 0.7) return 'complex';
    if (complexityScore > 0.4) return 'medium';
    return 'simple';
  }

  /**
   * Extract key entities from content
   */
  private extractEntities(content: string): Array<{
    text: string;
    type: 'concept' | 'person' | 'place' | 'term' | 'formula';
    importance: ImportanceLevel;
    mentions: number;
  }> {
    const entities = new Map<string, { type: string; mentions: number }>();
    
    // Extract capitalized words (potential proper nouns)
    const capitalizedWords = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    capitalizedWords.forEach(word => {
      const normalized = word.toLowerCase();
      if (!entities.has(normalized)) {
        entities.set(normalized, { type: 'concept', mentions: 0 });
      }
      entities.get(normalized)!.mentions++;
    });
    
    // Extract technical terms
    const technicalTerms = content.match(/\b\w+ology\b|\b\w+ism\b|\b\w+tion\b/g) || [];
    technicalTerms.forEach(term => {
      const normalized = term.toLowerCase();
      if (!entities.has(normalized)) {
        entities.set(normalized, { type: 'term', mentions: 0 });
      }
      entities.get(normalized)!.mentions++;
    });
    
    // Extract formulas
    const formulas = content.match(/\b\w+\s*=\s*\w+|\d+\s*[+\-*/]\s*\d+/g) || [];
    formulas.forEach(formula => {
      entities.set(formula, { type: 'formula', mentions: 1 });
    });
    
    // Convert to result format and sort by importance
    const result = Array.from(entities.entries())
      .map(([text, { type, mentions }]) => ({
        text,
        type: type as 'concept' | 'person' | 'place' | 'term' | 'formula',
        importance: this.calculateEntityImportance(mentions, content.length) as ImportanceLevel,
        mentions,
      }))
      .sort((a, b) => {
        const importanceOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return importanceOrder[b.importance] - importanceOrder[a.importance];
      })
      .slice(0, this.config.maxEntities);
    
    return result;
  }

  /**
   * Calculate entity importance
   */
  private calculateEntityImportance(mentions: number, contentLength: number): ImportanceLevel {
    const density = mentions / (contentLength / 100); // mentions per 100 characters
    
    if (density > 0.5) return 'critical';
    if (density > 0.3) return 'high';
    if (density > 0.1) return 'medium';
    return 'low';
  }

  /**
   * Extract relationships between entities
   */
  private extractRelationships(
    content: string,
    entities: Array<{ text: string; type: string; importance: ImportanceLevel; mentions: number }>
  ): Array<{
    from: string;
    to: string;
    type: 'causes' | 'leads_to' | 'is_part_of' | 'contrasts_with' | 'similar_to' | 'defines';
    confidence: number;
  }> {
    const relationships: Array<{
      from: string;
      to: string;
      type: 'causes' | 'leads_to' | 'is_part_of' | 'contrasts_with' | 'similar_to' | 'defines';
      confidence: number;
    }> = [];
    
    const relationshipPatterns = {
      causes: [/(.+) causes (.+)/i, /(.+) results in (.+)/i, /(.+) leads to (.+)/i],
      leads_to: [/(.+) then (.+)/i, /(.+) followed by (.+)/i, /after (.+), (.+)/i],
      is_part_of: [/(.+) is part of (.+)/i, /(.+) belongs to (.+)/i, /(.+) contains (.+)/i],
      contrasts_with: [/(.+) unlike (.+)/i, /(.+) versus (.+)/i, /(.+) differs from (.+)/i],
      similar_to: [/(.+) similar to (.+)/i, /(.+) like (.+)/i, /(.+) resembles (.+)/i],
      defines: [/(.+) is defined as (.+)/i, /(.+) means (.+)/i, /(.+) refers to (.+)/i],
    };
    
    Object.entries(relationshipPatterns).forEach(([relType, patterns]) => {
      patterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches && matches.length >= 3) {
          const from = matches[1].trim();
          const to = matches[2].trim();
          
          // Check if entities are in our extracted list
          const fromEntity = entities.find(e => 
            e.text.toLowerCase().includes(from.toLowerCase()) || 
            from.toLowerCase().includes(e.text.toLowerCase())
          );
          const toEntity = entities.find(e => 
            e.text.toLowerCase().includes(to.toLowerCase()) || 
            to.toLowerCase().includes(e.text.toLowerCase())
          );
          
          if (fromEntity && toEntity) {
            relationships.push({
              from: fromEntity.text,
              to: toEntity.text,
              type: relType as any,
              confidence: 0.8, // Base confidence for pattern matches
            });
          }
        }
      });
    });
    
    return relationships.filter(rel => rel.confidence >= this.config.minRelationshipConfidence);
  }

  /**
   * Detect visual requirements
   */
  private detectVisualRequirements(content: string): Array<{
    type: 'diagram' | 'chart' | 'illustration' | 'flowchart' | 'comparison_table';
    priority: ImportanceLevel;
    description: string;
    estimatedElements: number;
  }> {
    if (!this.config.visualDetection.enableDiagramDetection) return [];
    
    const requirements: Array<{
      type: 'diagram' | 'chart' | 'illustration' | 'flowchart' | 'comparison_table';
      priority: ImportanceLevel;
      description: string;
      estimatedElements: number;
    }> = [];
    
    Object.entries(VISUAL_PATTERNS).forEach(([visualType, pattern]) => {
      let score = 0;
      
      // Check for direct keywords
      pattern.keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = content.match(regex);
        score += (matches?.length || 0) * 0.2;
      });
      
      // Check for context keywords
      pattern.contextKeywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = content.match(regex);
        score += (matches?.length || 0) * 0.1;
      });
      
      score *= pattern.weight;
      
      if (score >= this.config.visualDetection.minVisualConfidence) {
        requirements.push({
          type: visualType as any,
          priority: score > 1.5 ? 'high' : score > 1 ? 'medium' : 'low',
          description: `${visualType} visualization suggested based on content analysis`,
          estimatedElements: Math.ceil(score * 2),
        });
      }
    });
    
    return requirements;
  }

  /**
   * Generate layout hints based on analysis
   */
  private generateLayoutHints(
    primaryType: ContentType,
    entities: Array<{ text: string; importance: ImportanceLevel }>,
    visualRequirements: Array<{ type: string; priority: ImportanceLevel }>
  ): LayoutHint[] {
    const hints: LayoutHint[] = [];
    
    // Primary content hint
    hints.push({
      semantic: 'primary',
      positioning: 'center',
      importance: 'critical',
      visualRelationship: 'emphasizes',
      preferredRegion: 'main',
    });
    
    // Entity-based hints
    entities.slice(0, 3).forEach((entity, index) => {
      hints.push({
        semantic: index === 0 ? 'primary' : 'supporting',
        positioning: index === 0 ? 'center' : 'relative_to',
        importance: entity.importance,
        visualRelationship: 'groups_with',
        preferredRegion: index === 0 ? 'main' : 'sidebar',
      });
    });
    
    // Visual requirement hints
    visualRequirements.forEach(req => {
      hints.push({
        semantic: req.priority === 'high' ? 'primary' : 'supporting',
        positioning: 'center',
        importance: req.priority,
        visualRelationship: 'emphasizes',
        preferredRegion: 'main',
      });
    });
    
    return hints;
  }

  /**
   * Calculate engagement and educational metrics
   */
  private calculateMetrics(
    content: string,
    entities: Array<{ text: string; importance: ImportanceLevel }>,
    visualRequirements: Array<{ type: string; priority: ImportanceLevel }>
  ) {
    const words = content.split(' ').length;
    const sentences = content.split(/[.!?]+/).length;
    
    // Attention level based on complexity and visual elements
    const attentionLevel = Math.min(10, 
      Math.ceil((words / 50) + (entities.length / 2) + visualRequirements.length)
    );
    
    // Information density
    const informationDensity = Math.min(10,
      Math.ceil((entities.length / 3) + (sentences / 5))
    );
    
    // Interaction potential
    const interactionPotential = Math.min(10,
      Math.ceil(visualRequirements.length * 2 + (entities.length > 5 ? 1 : 0))
    );
    
    // Memorability (keywords, repetition, examples)
    const examples = content.match(/example|instance|such as/gi)?.length || 0;
    const memorability = Math.min(10,
      Math.ceil(examples + (entities.length > 3 ? 2 : 0) + visualRequirements.length)
    );
    
    return {
      attentionLevel,
      informationDensity,
      interactionPotential,
      memorability,
    };
  }

  /**
   * Analyze content structure
   */
  private analyzeContentStructure(content: string) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    const mainTopics: string[] = [];
    const supportingDetails: string[] = [];
    const examples: string[] = [];
    const questions: string[] = [];
    
    sentences.forEach(sentence => {
      const trimmed = sentence.trim();
      
      if (trimmed.includes('?')) {
        questions.push(trimmed);
      } else if (trimmed.match(/example|instance|such as/i)) {
        examples.push(trimmed);
      } else if (trimmed.length > 20 && !trimmed.match(/however|moreover|furthermore|additionally/i)) {
        mainTopics.push(trimmed);
      } else {
        supportingDetails.push(trimmed);
      }
    });
    
    return {
      mainTopics: mainTopics.slice(0, 5),
      supportingDetails: supportingDetails.slice(0, 10),
      examples: examples.slice(0, 3),
      questions: questions.slice(0, 3),
    };
  }

  /**
   * Extract content from timeline event
   */
  private extractEventContent(event: TimelineEvent): string {
    const content: string[] = [];
    
    if (event.content.audio?.text) {
      content.push(event.content.audio.text);
    }
    
    if (event.content.visual?.properties.text) {
      content.push(event.content.visual.properties.text);
    }
    
    return content.join(' ');
  }

  /**
   * Combine multiple analyses into one
   */
  private combineAnalyses(analyses: ContentAnalysisResult[], sourceId: string): ContentAnalysisResult {
    if (analyses.length === 0) {
      throw new Error('No analyses to combine');
    }
    
    if (analyses.length === 1) {
      return analyses[0];
    }
    
    // Find most common primary type
    const typeCounts = new Map<ContentType, number>();
    analyses.forEach(analysis => {
      typeCounts.set(analysis.primaryType, (typeCounts.get(analysis.primaryType) || 0) + 1);
    });
    
    const primaryType = Array.from(typeCounts.entries())
      .sort(([, a], [, b]) => b - a)[0][0];
    
    // Combine secondary types
    const allSecondaryTypes = analyses.flatMap(a => a.secondaryTypes);
    const secondaryTypes = [...new Set(allSecondaryTypes)].slice(0, 3);
    
    // Use highest complexity
    const complexities = ['simple', 'medium', 'complex'];
    const complexity = analyses.reduce((max, analysis) => {
      return complexities.indexOf(analysis.complexity) > complexities.indexOf(max) 
        ? analysis.complexity 
        : max;
    }, 'simple' as 'simple' | 'medium' | 'complex');
    
    // Combine and deduplicate entities
    const allEntities = analyses.flatMap(a => a.keyEntities);
    const entityMap = new Map<string, typeof allEntities[0]>();
    
    allEntities.forEach(entity => {
      const existing = entityMap.get(entity.text);
      if (existing) {
        existing.mentions += entity.mentions;
      } else {
        entityMap.set(entity.text, { ...entity });
      }
    });
    
    const keyEntities = Array.from(entityMap.values())
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, this.config.maxEntities);
    
    // Combine other properties (taking averages or merging arrays)
    const relationships = analyses.flatMap(a => a.relationships);
    const visualRequirements = analyses.flatMap(a => a.visualRequirements);
    const layoutHints = analyses.flatMap(a => a.layoutHints);
    
    // Average metrics
    const metrics = {
      attentionLevel: Math.round(analyses.reduce((sum, a) => sum + a.metrics.attentionLevel, 0) / analyses.length),
      informationDensity: Math.round(analyses.reduce((sum, a) => sum + a.metrics.informationDensity, 0) / analyses.length),
      interactionPotential: Math.round(analyses.reduce((sum, a) => sum + a.metrics.interactionPotential, 0) / analyses.length),
      memorability: Math.round(analyses.reduce((sum, a) => sum + a.metrics.memorability, 0) / analyses.length),
    };
    
    // Combine structure
    const structure = {
      mainTopics: [...new Set(analyses.flatMap(a => a.structure.mainTopics))].slice(0, 5),
      supportingDetails: [...new Set(analyses.flatMap(a => a.structure.supportingDetails))].slice(0, 10),
      examples: [...new Set(analyses.flatMap(a => a.structure.examples))].slice(0, 3),
      questions: [...new Set(analyses.flatMap(a => a.structure.questions))].slice(0, 3),
    };
    
    logger.debug('Combined analyses', { 
      sourceId, 
      analysisCount: analyses.length,
      combinedPrimaryType: primaryType,
      totalEntities: keyEntities.length 
    });
    
    return {
      primaryType,
      secondaryTypes,
      complexity,
      keyEntities,
      relationships,
      visualRequirements,
      layoutHints,
      metrics,
      structure,
    };
  }
}