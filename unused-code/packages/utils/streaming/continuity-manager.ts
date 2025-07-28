/**
 * Continuity Manager for seamless chunk transitions.
 * 
 * This module ensures smooth narrative flow and visual continuity across
 * content chunks by extracting context and generating transition hints.
 * It maintains educational progression and prevents repetition.
 */

import type {
  StreamingTimelineChunk,
  ChunkContext,
  ContinuityHint,
  ChunkTransition,
} from '@ai-tutor/types';

import type {
  TimelineEvent,
  VisualInstruction,
  LayoutHint,
} from '@ai-tutor/types';

import { createUtilLogger } from '../logger';
import { asContentObject, asString } from '../type-utils';

const logger = createUtilLogger('ContinuityManager');

/**
 * Metrics for continuity quality assessment
 */
export interface ContinuityMetrics {
  /** Conceptual overlap between chunks (0.0-1.0) */
  conceptualContinuity: number;
  
  /** Visual element consistency (0.0-1.0) */
  visualContinuity: number;
  
  /** Narrative flow smoothness (0.0-1.0) */
  narrativeContinuity: number;
  
  /** Overall continuity score (0.0-1.0) */
  overallScore: number;
  
  /** Issues detected in continuity */
  issues: string[];
  
  /** Suggestions for improvement */
  improvements: string[];
}

/**
 * Context extraction result
 */
export interface ExtractedContext {
  /** Key concepts from previous chunks */
  previousConcepts: string[];
  
  /** Visual elements that should be referenced */
  visualReferences: VisualInstruction[];
  
  /** Current narrative thread */
  narrativeThread: string;
  
  /** Knowledge level reached */
  knowledgeLevel: number;
  
  /** Logical next topics */
  suggestedNextTopics: string[];
  
  /** Transition requirements */
  transitionNeeds: string[];
}

/**
 * Configuration for continuity management
 */
export interface ContinuityConfig {
  /** Enable narrative flow analysis */
  analyzeNarrativeFlow: boolean;
  
  /** Enable visual continuity checks */
  checkVisualContinuity: boolean;
  
  /** Enable concept overlap detection */
  detectConceptOverlap: boolean;
  
  /** Minimum continuity score threshold */
  minContinuityScore: number;
  
  /** Maximum concept overlap allowed */
  maxConceptOverlap: number;
  
  /** Enable auto-correction of continuity issues */
  autoCorrectIssues: boolean;
}

/**
 * Manages continuity and transitions between content chunks
 */
export class ContinuityManager {
  private config: ContinuityConfig;
  private chunkHistory: StreamingTimelineChunk[] = [];
  private conceptFrequency: Map<string, number> = new Map();
  private visualElementHistory: Map<string, VisualInstruction[]> = new Map();
  
  constructor(config: Partial<ContinuityConfig> = {}) {
    this.config = {
      analyzeNarrativeFlow: true,
      checkVisualContinuity: true,
      detectConceptOverlap: true,
      minContinuityScore: 0.7,
      maxConceptOverlap: 0.3,
      autoCorrectIssues: false,
      ...config,
    };
    
    logger.debug('ContinuityManager initialized', { config: this.config });
  }
  
  /**
   * Extract context from previous chunks for next chunk generation
   */
  extractContext(chunks: StreamingTimelineChunk[]): ExtractedContext {
    logger.debug('Extracting context from chunks', { chunkCount: chunks.length });
    
    try {
      // Update chunk history
      this.chunkHistory = [...chunks];
      
      // Extract concepts from all chunks
      const allConcepts = this.extractConcepts(chunks);
      const previousConcepts = this.getUniqueConcepts(allConcepts);
      
      // Extract visual references
      const visualReferences = this.extractVisualReferences(chunks);
      
      // Analyze narrative progression
      const narrativeThread = this.analyzeNarrativeThread(chunks);
      
      // Calculate knowledge level progression
      const knowledgeLevel = this.calculateKnowledgeLevel(chunks);
      
      // Suggest logical next topics
      const suggestedNextTopics = this.suggestNextTopics(chunks, allConcepts);
      
      // Determine transition requirements
      const transitionNeeds = this.analyzeTransitionNeeds(chunks);
      
      const context: ExtractedContext = {
        previousConcepts,
        visualReferences,
        narrativeThread,
        knowledgeLevel,
        suggestedNextTopics,
        transitionNeeds,
      };
      
      logger.debug('Context extraction complete', {
        conceptCount: previousConcepts.length,
        visualCount: visualReferences.length,
        knowledgeLevel,
      });
      
      return context;
      
    } catch (error) {
      logger.error('Error extracting context', { error });
      
      // Return minimal context as fallback
      return {
        previousConcepts: [],
        visualReferences: [],
        narrativeThread: 'Continue with educational content',
        knowledgeLevel: 0.5,
        suggestedNextTopics: [],
        transitionNeeds: ['basic_transition'],
      };
    }
  }
  
  /**
   * Generate continuity hints for next chunk
   */
  generateContinuityHints(
    context: ExtractedContext,
    nextChunkConfig: any
  ): ContinuityHint[] {
    logger.debug('Generating continuity hints', { context });
    
    const hints: ContinuityHint[] = [];
    
    // Narrative continuity hints
    if (this.config.analyzeNarrativeFlow && context.narrativeThread) {
      hints.push({
        type: 'narrative',
        priority: 'high',
        description: 'Maintain narrative flow from previous chunk',
        suggestedTransition: `Building on ${context.narrativeThread.split(' ').slice(-10).join(' ')}...`,
        requirements: ['reference_previous_content', 'smooth_transition'],
      });
    }
    
    // Concept continuity hints
    if (context.previousConcepts.length > 0) {
      const recentConcepts = context.previousConcepts.slice(-3);
      hints.push({
        type: 'conceptual',
        priority: 'medium',
        description: 'Reference recent concepts without repeating',
        suggestedTransition: `Now that we understand ${recentConcepts.join(', ')}, let's explore...`,
        requirements: ['avoid_repetition', 'build_on_concepts'],
      });
    }
    
    // Visual continuity hints
    if (this.config.checkVisualContinuity && context.visualReferences.length > 0) {
      hints.push({
        type: 'visual',
        priority: 'medium',
        description: 'Maintain visual consistency with previous elements',
        suggestedTransition: 'Use consistent visual style and layout patterns',
        requirements: ['consistent_layout', 'reference_visual_elements'],
      });
    }
    
    // Knowledge level hints
    hints.push({
      type: 'knowledge_level',
      priority: 'high',
      description: 'Match appropriate knowledge level progression',
      suggestedTransition: `Continue at knowledge level ${context.knowledgeLevel.toFixed(1)}`,
      requirements: ['appropriate_complexity', 'progressive_difficulty'],
    });
    
    // Transition requirement hints
    if (context.transitionNeeds.length > 0) {
      hints.push({
        type: 'transition',
        priority: 'high',
        description: 'Address specific transition requirements',
        suggestedTransition: 'Handle required transitions smoothly',
        requirements: context.transitionNeeds,
      });
    }
    
    logger.debug('Generated continuity hints', { hintCount: hints.length });
    return hints;
  }
  
  /**
   * Validate continuity between consecutive chunks
   */
  validateContinuity(
    previousChunk: StreamingTimelineChunk,
    currentChunk: StreamingTimelineChunk
  ): ContinuityMetrics {
    logger.debug('Validating continuity between chunks');
    
    try {
      const conceptualScore = this.assessConceptualContinuity(previousChunk, currentChunk);
      const visualScore = this.assessVisualContinuity(previousChunk, currentChunk);
      const narrativeScore = this.assessNarrativeContinuity(previousChunk, currentChunk);
      
      // Calculate weighted overall score
      const overallScore = (
        conceptualScore * 0.4 +
        visualScore * 0.3 +
        narrativeScore * 0.3
      );
      
      // Identify issues
      const issues = this.identifyIssues(conceptualScore, visualScore, narrativeScore);
      
      // Generate improvement suggestions
      const improvements = this.generateImprovements(conceptualScore, visualScore, narrativeScore);
      
      const metrics: ContinuityMetrics = {
        conceptualContinuity: conceptualScore,
        visualContinuity: visualScore,
        narrativeContinuity: narrativeScore,
        overallScore,
        issues,
        improvements,
      };
      
      logger.debug('Continuity validation complete', {
        overallScore: overallScore.toFixed(2),
        issueCount: issues.length,
      });
      
      return metrics;
      
    } catch (error) {
      logger.error('Error validating continuity', { error });
      
      return {
        conceptualContinuity: 0.5,
        visualContinuity: 0.5,
        narrativeContinuity: 0.5,
        overallScore: 0.5,
        issues: ['continuity_validation_failed'],
        improvements: ['retry_continuity_analysis'],
      };
    }
  }
  
  /**
   * Extract concepts from chunks
   */
  private extractConcepts(chunks: StreamingTimelineChunk[]): string[] {
    const concepts: string[] = [];
    
    for (const chunk of chunks) {
      // Extract from chunk metadata
      if (chunk.metadata?.conceptsIntroduced) {
        concepts.push(...chunk.metadata.conceptsIntroduced);
      }
      
      // Extract from timeline events
      for (const event of chunk.events) {
        if (event.content) {
          // Simple concept extraction from content
          const eventConcepts = this.extractConceptsFromText(asString(event.content));
          concepts.push(...eventConcepts);
        }
      }
    }
    
    // Update concept frequency tracking
    for (const concept of concepts) {
      this.conceptFrequency.set(concept, (this.conceptFrequency.get(concept) || 0) + 1);
    }
    
    return concepts;
  }
  
  /**
   * Extract concepts from text content
   */
  private extractConceptsFromText(text: string): string[] {
    // Simple concept extraction - in a real implementation, this could use NLP
    const concepts: string[] = [];
    
    // Look for key terms (capitalized words, technical terms)
    const keyTermPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const matches = text.match(keyTermPattern);
    
    if (matches) {
      concepts.push(...matches.filter(term => term.length > 2));
    }
    
    // Look for quoted terms
    const quotedPattern = /"([^"]+)"/g;
    let match;
    while ((match = quotedPattern.exec(text)) !== null) {
      concepts.push(match[1]);
    }
    
    return concepts;
  }
  
  /**
   * Get unique concepts, filtering out overly repeated ones
   */
  private getUniqueConcepts(concepts: string[]): string[] {
    const uniqueConcepts = Array.from(new Set(concepts));
    
    // Filter out concepts that appear too frequently (likely common words)
    return uniqueConcepts.filter(concept => {
      const frequency = this.conceptFrequency.get(concept) || 0;
      return frequency <= this.chunkHistory.length * this.config.maxConceptOverlap;
    });
  }
  
  /**
   * Extract visual references from chunks
   */
  private extractVisualReferences(chunks: StreamingTimelineChunk[]): VisualInstruction[] {
    const visualRefs: VisualInstruction[] = [];
    
    for (const chunk of chunks) {
      for (const event of chunk.events) {
        const content = asContentObject(event.content);
        if (content.visual) {
          visualRefs.push(content.visual);
        }
      }
    }
    
    // Store in history for reference
    this.visualElementHistory.set('recent', visualRefs.slice(-10)); // Keep last 10
    
    return visualRefs.slice(-5); // Return most recent 5 for context
  }
  
  /**
   * Analyze narrative thread progression
   */
  private analyzeNarrativeThread(chunks: StreamingTimelineChunk[]): string {
    if (chunks.length === 0) return '';
    
    // Get the summary or key narrative from the last chunk
    const lastChunk = chunks[chunks.length - 1];
    
    if (lastChunk.metadata?.summary) {
      return lastChunk.metadata.summary;
    }
    
    // Extract narrative from last few events
    const recentEvents = lastChunk.events.slice(-2);
    const narrativeTexts = recentEvents
      .map(event => asString(event.content))
      .filter(content => content && content.length > 10);
    
    return narrativeTexts.join(' ').slice(0, 200); // Limit length
  }
  
  /**
   * Calculate knowledge level progression
   */
  private calculateKnowledgeLevel(chunks: StreamingTimelineChunk[]): number {
    if (chunks.length === 0) return 0.0;
    
    // Simple progression: start at 0.3, increase by 0.1 per chunk, cap at 0.9
    const baseLevel = 0.3;
    const progressionRate = 0.1;
    const maxLevel = 0.9;
    
    return Math.min(maxLevel, baseLevel + (chunks.length - 1) * progressionRate);
  }
  
  /**
   * Suggest logical next topics
   */
  private suggestNextTopics(chunks: StreamingTimelineChunk[], concepts: string[]): string[] {
    // Simple topic suggestion based on concept frequency and recency
    const topConcepts = Array.from(this.conceptFrequency.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([concept]) => concept);
    
    // Generate logical extensions
    const suggestions = topConcepts.map(concept => `Advanced ${concept}`);
    
    // Add generic progression topics
    suggestions.push('Practical Applications', 'Real-world Examples', 'Common Misconceptions');
    
    return suggestions.slice(0, 5);
  }
  
  /**
   * Analyze transition requirements
   */
  private analyzeTransitionNeeds(chunks: StreamingTimelineChunk[]): string[] {
    const needs: string[] = [];
    
    if (chunks.length === 0) {
      needs.push('introduction_needed');
      return needs;
    }
    
    const lastChunk = chunks[chunks.length - 1];
    
    // Check if summary is needed
    if (chunks.length % 3 === 0) {
      needs.push('summary_checkpoint');
    }
    
    // Check for concept reinforcement
    if (this.conceptFrequency.size > 5) {
      needs.push('concept_reinforcement');
    }
    
    // Check for visual variety
    const recentVisuals = this.extractVisualReferences(chunks.slice(-2));
    if (recentVisuals.length < 2) {
      needs.push('visual_enhancement');
    }
    
    return needs;
  }
  
  /**
   * Assess conceptual continuity between chunks
   */
  private assessConceptualContinuity(
    previous: StreamingTimelineChunk,
    current: StreamingTimelineChunk
  ): number {
    const prevConcepts = new Set(previous.metadata?.conceptsIntroduced || []);
    const currConcepts = new Set(current.metadata?.conceptsIntroduced || []);
    
    if (prevConcepts.size === 0 && currConcepts.size === 0) return 1.0;
    
    // Calculate concept overlap
    const intersection = new Set([...prevConcepts].filter(x => currConcepts.has(x)));
    const union = new Set([...prevConcepts, ...currConcepts]);
    
    const overlapRatio = intersection.size / union.size;
    
    // Good continuity: some overlap but not too much
    if (overlapRatio >= 0.2 && overlapRatio <= 0.5) {
      return 1.0;
    } else if (overlapRatio < 0.2) {
      return 0.6; // Too little connection
    } else {
      return 0.4; // Too much repetition
    }
  }
  
  /**
   * Assess visual continuity between chunks
   */
  private assessVisualContinuity(
    previous: StreamingTimelineChunk,
    current: StreamingTimelineChunk
  ): number {
    const prevVisuals = previous.events
      .map(e => asContentObject(e.content).visual?.elementType)
      .filter((type): type is NonNullable<typeof type> => type !== undefined) as string[];
    const currVisuals = current.events
      .map(e => asContentObject(e.content).visual?.elementType)
      .filter((type): type is NonNullable<typeof type> => type !== undefined) as string[];
    
    if (prevVisuals.length === 0 && currVisuals.length === 0) return 1.0;
    
    // Check for style consistency
    const styleConsistency = this.checkVisualStyleConsistency(prevVisuals, currVisuals);
    
    // Check for appropriate visual progression
    const progression = this.checkVisualProgression(prevVisuals, currVisuals);
    
    return (styleConsistency + progression) / 2;
  }
  
  /**
   * Assess narrative continuity between chunks
   */
  private assessNarrativeContinuity(
    previous: StreamingTimelineChunk,
    current: StreamingTimelineChunk
  ): number {
    const prevContent = previous.events.map(e => e.content).join(' ');
    const currContent = current.events.map(e => e.content).join(' ');
    
    if (!prevContent || !currContent) return 0.5;
    
    // Simple narrative flow check - in reality, this would use NLP
    const hasTransition = this.hasNarrativeTransition(prevContent, currContent);
    const hasToneConsistency = this.hasToneConsistency(prevContent, currContent);
    
    return (hasTransition + hasToneConsistency) / 2;
  }
  
  /**
   * Check visual style consistency
   */
  private checkVisualStyleConsistency(prevVisuals: string[], currVisuals: string[]): number {
    if (prevVisuals.length === 0 || currVisuals.length === 0) return 0.8;
    
    const commonTypes = prevVisuals.filter(type => currVisuals.includes(type));
    const uniqueTypes = new Set([...prevVisuals, ...currVisuals]);
    
    return commonTypes.length / uniqueTypes.size;
  }
  
  /**
   * Check visual progression appropriateness
   */
  private checkVisualProgression(prevVisuals: string[], currVisuals: string[]): number {
    // Simple progression check - variety is good, but not too different
    const varietyScore = currVisuals.length > 1 ? 0.8 : 0.6;
    const continuityScore = prevVisuals.some(type => currVisuals.includes(type)) ? 0.8 : 0.4;
    
    return (varietyScore + continuityScore) / 2;
  }
  
  /**
   * Check for narrative transitions
   */
  private hasNarrativeTransition(prevContent: string, currContent: string): number {
    // Look for transition words/phrases
    const transitionWords = [
      'now', 'next', 'then', 'after', 'following', 'building on',
      'moving forward', 'let\'s explore', 'continuing with'
    ];
    
    const currLower = currContent.toLowerCase();
    const hasTransition = transitionWords.some(word => currLower.includes(word));
    
    return hasTransition ? 1.0 : 0.5;
  }
  
  /**
   * Check tone consistency
   */
  private hasToneConsistency(prevContent: string, currContent: string): number {
    // Simple tone analysis - count question marks, exclamations, etc.
    const prevTone = this.analyzeTone(prevContent);
    const currTone = this.analyzeTone(currContent);
    
    // Similar tone scores indicate consistency
    const toneDifference = Math.abs(prevTone - currTone);
    
    return Math.max(0.0, 1.0 - toneDifference);
  }
  
  /**
   * Analyze tone of content
   */
  private analyzeTone(content: string): number {
    // Simple tone scoring: 0 = formal, 1 = conversational
    let score = 0.5; // baseline
    
    if (content.includes('?')) score += 0.1;
    if (content.includes('!')) score += 0.1;
    if (content.includes('we')) score += 0.1;
    if (content.includes('you')) score += 0.1;
    if (content.includes('let\'s')) score += 0.2;
    
    return Math.min(1.0, score);
  }
  
  /**
   * Identify continuity issues
   */
  private identifyIssues(conceptual: number, visual: number, narrative: number): string[] {
    const issues: string[] = [];
    
    if (conceptual < 0.6) {
      issues.push('Poor conceptual flow - too much repetition or disconnection');
    }
    
    if (visual < 0.6) {
      issues.push('Inconsistent visual presentation across chunks');
    }
    
    if (narrative < 0.6) {
      issues.push('Narrative flow disruption - missing transitions');
    }
    
    return issues;
  }
  
  /**
   * Generate improvement suggestions
   */
  private generateImprovements(conceptual: number, visual: number, narrative: number): string[] {
    const improvements: string[] = [];
    
    if (conceptual < 0.7) {
      improvements.push('Add concept bridges between chunks');
      improvements.push('Reference previous concepts more naturally');
    }
    
    if (visual < 0.7) {
      improvements.push('Maintain visual style consistency');
      improvements.push('Use progressive visual complexity');
    }
    
    if (narrative < 0.7) {
      improvements.push('Add smoother transitions between topics');
      improvements.push('Maintain consistent tone and voice');
    }
    
    return improvements;
  }
  
  /**
   * Clear cache and reset state
   */
  reset(): void {
    this.chunkHistory = [];
    this.conceptFrequency.clear();
    this.visualElementHistory.clear();
    
    logger.debug('ContinuityManager reset');
  }
  
  /**
   * Get current state for debugging
   */
  getState(): {
    chunkCount: number;
    conceptCount: number;
    visualElementCount: number;
    config: ContinuityConfig;
  } {
    return {
      chunkCount: this.chunkHistory.length,
      conceptCount: this.conceptFrequency.size,
      visualElementCount: this.visualElementHistory.size,
      config: this.config,
    };
  }
}