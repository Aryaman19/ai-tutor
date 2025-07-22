/**
 * Timeline Event Validation System
 * 
 * Comprehensive validation utilities for timeline events and chunks.
 * Extends existing validation patterns to ensure timeline consistency,
 * content quality, and technical feasibility.
 */

import type {
  TimelineEvent,
  TimelineEventCollection,
  EventValidationResult,
  EventType,
  LayoutHint,
  VisualInstruction,
  AudioCue,
  TransitionInstruction,
} from '@ai-tutor/types';

import type {
  StreamingTimelineChunk,
  ChunkValidationResult,
  ContinuityHint,
  ChunkContext,
} from '@ai-tutor/types';

import { createUtilLogger } from '../logger';
import { asContentObject, asString } from '../type-utils';

const logger = createUtilLogger('TimelineEventValidation');

/**
 * Validation configuration options
 */
export interface ValidationConfig {
  /** Maximum allowed event duration (milliseconds) */
  maxEventDuration: number;
  
  /** Minimum allowed event duration (milliseconds) */
  minEventDuration: number;
  
  /** Maximum simultaneous events */
  maxSimultaneousEvents: number;
  
  /** Maximum text length for audio cues */
  maxAudioTextLength: number;
  
  /** Strict timeline ordering */
  strictTimelineOrdering: boolean;
  
  /** Validate layout feasibility */
  validateLayoutFeasibility: boolean;
  
  /** Custom validation rules */
  customRules?: Array<(event: TimelineEvent) => string[]>;
}

/**
 * Default validation configuration
 */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  maxEventDuration: 30000, // 30 seconds
  minEventDuration: 100,   // 100 milliseconds
  maxSimultaneousEvents: 10,
  maxAudioTextLength: 500,
  strictTimelineOrdering: true,
  validateLayoutFeasibility: true,
};

/**
 * Validates a single timeline event
 */
export function validateTimelineEvent(
  event: TimelineEvent,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): EventValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  try {
    // Basic structure validation
    validateEventStructure(event, errors);
    
    // Timing validation
    validateEventTiming(event, config, errors, warnings);
    
    // Content validation
    validateEventContent(event, config, errors, warnings);
    
    // Layout hints validation
    validateLayoutHints(event.layoutHints, errors, warnings);
    
    // Type-specific validation
    validateEventTypeSpecific(event, config, errors, warnings, suggestions);
    
    // Dependencies validation
    if (event.dependencies) {
      validateEventDependencies(event, errors, warnings);
    }

  } catch (error) {
    logger.error('Error during event validation:', error);
    errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Validates basic event structure
 */
function validateEventStructure(event: TimelineEvent, errors: string[]): void {
  if (!event.id || typeof event.id !== 'string') {
    errors.push('Event must have a valid string ID');
  }
  
  if (typeof event.timestamp !== 'number' || event.timestamp < 0) {
    errors.push('Event timestamp must be a non-negative number');
  }
  
  if (typeof event.duration !== 'number' || event.duration <= 0) {
    errors.push('Event duration must be a positive number');
  }
  
  if (!event.type || !isValidEventType(event.type)) {
    errors.push(`Event type must be one of: visual, narration, transition, emphasis, layout_change`);
  }
  
  if (!event.content) {
    errors.push('Event must have valid content');
  }
  
  if (!Array.isArray(event.layoutHints)) {
    errors.push('Event must have layoutHints array');
  }
}

/**
 * Validates event timing
 */
function validateEventTiming(
  event: TimelineEvent,
  config: ValidationConfig,
  errors: string[],
  warnings: string[]
): void {
  if (event.duration > config.maxEventDuration) {
    warnings.push(`Event duration (${event.duration}ms) exceeds recommended maximum (${config.maxEventDuration}ms)`);
  }
  
  if (event.duration < config.minEventDuration) {
    errors.push(`Event duration (${event.duration}ms) is below minimum (${config.minEventDuration}ms)`);
  }
  
  // Validate animation timing consistency
  const contentObj = asContentObject(event.content);
  if (contentObj.visual?.animationType && contentObj.visual.animationType !== 'none') {
    const animDuration = contentObj.visual.animationDuration || 500;
    if (animDuration > event.duration) {
      warnings.push('Animation duration longer than event duration may cause timing issues');
    }
  }
}

/**
 * Validates event content based on type
 */
function validateEventContent(
  event: TimelineEvent,
  config: ValidationConfig,
  errors: string[],
  warnings: string[]
): void {
  const content = asContentObject(event.content);
  
  if (event.type === 'visual' && !content.visual) {
    errors.push('Visual event must have visual content');
  }
  
  if (event.type === 'narration' && !content.audio) {
    errors.push('Narration event must have audio content');
  }
  
  if (event.type === 'transition' && !content.transition) {
    errors.push('Transition event must have transition content');
  }
  
  // Validate visual content
  if (content.visual) {
    validateVisualInstruction(content.visual, errors, warnings);
  }
  
  // Validate audio content
  if (content.audio) {
    validateAudioCue(content.audio, config, errors, warnings);
  }
  
  // Validate transition content
  if (content.transition) {
    validateTransitionInstruction(content.transition, errors, warnings);
  }
}

/**
 * Validates visual instruction
 */
function validateVisualInstruction(
  visual: VisualInstruction,
  errors: string[],
  warnings: string[]
): void {
  const validActions = ['create', 'modify', 'remove', 'animate', 'highlight'];
  if (!validActions.includes(visual.action)) {
    errors.push(`Visual action must be one of: ${validActions.join(', ')}`);
  }
  
  const validElementTypes = ['text', 'shape', 'arrow', 'diagram', 'callout', 'flowchart', 'connector'];
  if (visual.action === 'create' && !validElementTypes.includes(visual.elementType)) {
    errors.push(`Element type must be one of: ${validElementTypes.join(', ')}`);
  }
  
  if (visual.action === 'modify' && !visual.targetElementId) {
    errors.push('Modify action requires targetElementId');
  }
  
  if (visual.elementType === 'text' && !visual.properties.text) {
    errors.push('Text elements must have text property');
  }
  
  if (visual.properties.text && visual.properties.text.length > 200) {
    warnings.push('Text content is quite long and may affect layout');
  }
}

/**
 * Validates audio cue
 */
function validateAudioCue(
  audio: AudioCue,
  config: ValidationConfig,
  errors: string[],
  warnings: string[]
): void {
  if (!audio.text || typeof audio.text !== 'string') {
    errors.push('Audio cue must have text content');
  }
  
  if (audio.text && audio.text.length > config.maxAudioTextLength) {
    warnings.push(`Audio text (${audio.text.length} chars) exceeds recommended maximum (${config.maxAudioTextLength})`);
  }
  
  if (audio.speed && (audio.speed < 0.5 || audio.speed > 2.0)) {
    warnings.push('Audio speed should be between 0.5 and 2.0 for best results');
  }
  
  if (audio.volume && (audio.volume < 0 || audio.volume > 1)) {
    errors.push('Audio volume must be between 0 and 1');
  }
  
  if (audio.emphasis) {
    audio.emphasis.forEach((emp, index) => {
      if (emp.start >= emp.end) {
        errors.push(`Emphasis ${index}: start position must be before end position`);
      }
      if (emp.start < 0 || emp.end > audio.text.length) {
        errors.push(`Emphasis ${index}: positions must be within text bounds`);
      }
    });
  }
}

/**
 * Validates transition instruction
 */
function validateTransitionInstruction(
  transition: TransitionInstruction,
  errors: string[],
  warnings: string[]
): void {
  const validTypes = ['zoom', 'pan', 'focus', 'fade', 'slide', 'none'];
  if (!validTypes.includes(transition.type)) {
    errors.push(`Transition type must be one of: ${validTypes.join(', ')}`);
  }
  
  if (transition.duration <= 0) {
    errors.push('Transition duration must be positive');
  }
  
  if (transition.duration > 5000) {
    warnings.push('Long transitions (>5s) may impact user experience');
  }
  
  if (['zoom', 'pan', 'focus'].includes(transition.type) && !transition.target) {
    errors.push(`${transition.type} transition requires a target`);
  }
}

/**
 * Validates layout hints
 */
function validateLayoutHints(
  hints: LayoutHint[],
  errors: string[],
  warnings: string[]
): void {
  if (hints.length === 0) {
    warnings.push('Event has no layout hints - may affect positioning quality');
    return;
  }
  
  hints.forEach((hint, index) => {
    const validSemantics = ['primary', 'supporting', 'detail', 'accent'];
    if (!validSemantics.includes(hint.semantic)) {
      errors.push(`Layout hint ${index}: semantic must be one of ${validSemantics.join(', ')}`);
    }
    
    const validPositioning = ['center', 'left', 'right', 'top', 'bottom', 'relative_to', 'flow', 'grid'];
    if (!validPositioning.includes(hint.positioning)) {
      errors.push(`Layout hint ${index}: positioning must be one of ${validPositioning.join(', ')}`);
    }
    
    if (hint.positioning === 'relative_to' && !hint.relativeElement) {
      errors.push(`Layout hint ${index}: relative_to positioning requires relativeElement`);
    }
    
    const validImportance = ['critical', 'high', 'medium', 'low'];
    if (!validImportance.includes(hint.importance)) {
      errors.push(`Layout hint ${index}: importance must be one of ${validImportance.join(', ')}`);
    }
  });
}

/**
 * Validates event dependencies
 */
function validateEventDependencies(
  event: TimelineEvent,
  errors: string[],
  warnings: string[]
): void {
  if (!Array.isArray(event.dependencies)) {
    errors.push('Dependencies must be an array of event IDs');
    return;
  }
  
  event.dependencies.forEach((depId, index) => {
    if (typeof depId !== 'string') {
      errors.push(`Dependency ${index}: must be a string event ID`);
    }
    
    if (depId === event.id) {
      errors.push('Event cannot depend on itself');
    }
  });
  
  if (event.dependencies.length > 5) {
    warnings.push('Event has many dependencies - may affect performance');
  }
}

/**
 * Type-specific validation
 */
function validateEventTypeSpecific(
  event: TimelineEvent,
  config: ValidationConfig,
  errors: string[],
  warnings: string[],
  suggestions: string[]
): void {
  const content = asContentObject(event.content);
  
  switch (event.type) {
    case 'visual':
      if (!content.visual) {
        errors.push('Visual event must have visual content');
      } else if (content.visual.action === 'create' && event.layoutHints.length === 0) {
        warnings.push('Visual creation without layout hints may result in poor positioning');
        suggestions.push('Add layout hints to guide element positioning');
      }
      break;
      
    case 'narration':
      if (!content.audio) {
        errors.push('Narration event must have audio content');
      } else {
        // Estimate speaking time and compare with event duration
        const words = content.audio.text.split(/\s+/).length;
        const estimatedDuration = (words / 2.5) * 1000; // ~150 WPM
        if (Math.abs(estimatedDuration - event.duration) > event.duration * 0.3) {
          warnings.push('Event duration may not match estimated speaking time');
          suggestions.push('Adjust event duration or speaking speed for better timing');
        }
      }
      break;
      
    case 'transition':
      if (!content.transition) {
        errors.push('Transition event must have transition content');
      }
      break;
      
    case 'emphasis':
      if (!content.visual && !content.audio) {
        errors.push('Emphasis event must have visual or audio content');
      }
      break;
      
    case 'layout_change':
      if (event.layoutHints.length === 0) {
        errors.push('Layout change event must have layout hints');
      }
      break;
  }
}

/**
 * Validates a collection of timeline events
 */
export function validateTimelineEventCollection(
  collection: TimelineEventCollection,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): EventValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Validate individual events
  collection.events.forEach((event, index) => {
    const result = validateTimelineEvent(event, config);
    errors.push(...result.errors.map(e => `Event ${index + 1}: ${e}`));
    warnings.push(...result.warnings.map(w => `Event ${index + 1}: ${w}`));
    suggestions.push(...result.suggestions.map(s => `Event ${index + 1}: ${s}`));
  });

  // Validate collection-level constraints
  validateEventOrdering(collection.events, config, errors, warnings);
  validateEventOverlaps(collection.events, config, errors, warnings);
  validateEventDependencyChain(collection.events, errors, warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Validates event temporal ordering
 */
function validateEventOrdering(
  events: TimelineEvent[],
  config: ValidationConfig,
  errors: string[],
  warnings: string[]
): void {
  if (!config.strictTimelineOrdering) return;

  for (let i = 1; i < events.length; i++) {
    if (events[i].timestamp < events[i - 1].timestamp) {
      errors.push(`Event ${i + 1} timestamp (${events[i].timestamp}) is before previous event (${events[i - 1].timestamp})`);
    }
  }
}

/**
 * Validates simultaneous event limits
 */
function validateEventOverlaps(
  events: TimelineEvent[],
  config: ValidationConfig,
  errors: string[],
  warnings: string[]
): void {
  const timePoints = new Map<number, TimelineEvent[]>();
  
  // Group events by timestamp
  events.forEach(event => {
    const startTime = event.timestamp;
    const endTime = event.timestamp + event.duration;
    
    for (let t = startTime; t <= endTime; t += 100) { // Check every 100ms
      if (!timePoints.has(t)) timePoints.set(t, []);
      timePoints.get(t)!.push(event);
    }
  });
  
  // Check for overcrowding
  timePoints.forEach((eventsAtTime, timestamp) => {
    if (eventsAtTime.length > config.maxSimultaneousEvents) {
      warnings.push(`${eventsAtTime.length} simultaneous events at ${timestamp}ms exceeds recommended maximum (${config.maxSimultaneousEvents})`);
    }
  });
}

/**
 * Validates event dependency chains
 */
function validateEventDependencyChain(
  events: TimelineEvent[],
  errors: string[],
  warnings: string[]
): void {
  const eventMap = new Map(events.map(e => [e.id, e]));
  
  events.forEach(event => {
    if (!event.dependencies) return;
    
    event.dependencies.forEach(depId => {
      const depEvent = eventMap.get(depId);
      if (!depEvent) {
        errors.push(`Event ${event.id} depends on non-existent event ${depId}`);
        return;
      }
      
      if (depEvent.timestamp >= event.timestamp) {
        errors.push(`Event ${event.id} depends on event ${depId} that occurs at the same time or later`);
      }
    });
  });
}

/**
 * Validates a streaming timeline chunk
 */
export function validateStreamingTimelineChunk(
  chunk: StreamingTimelineChunk,
  previousContext?: ChunkContext
): ChunkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Validate chunk structure
  if (!chunk.chunkId || typeof chunk.chunkId !== 'string') {
    errors.push('Chunk must have a valid string ID');
  }
  
  if (typeof chunk.chunkNumber !== 'number' || chunk.chunkNumber < 1) {
    errors.push('Chunk number must be a positive integer');
  }
  
  if (typeof chunk.totalChunks !== 'number' || chunk.totalChunks < chunk.chunkNumber) {
    errors.push('Total chunks must be >= chunk number');
  }
  
  // Validate events
  const eventValidation = validateTimelineEventCollection({
    events: chunk.events,
    totalDuration: chunk.duration,
    contentType: chunk.contentType,
    complexity: 'medium', // Default
    keyEntities: [],
    keyConceptEntities: [],
    relationships: [],
    qualityMetrics: {
      timingConsistency: 1,
      completeness: 1,
      layoutFeasibility: 1,
    },
    metadata: {
      source: 'llm',
      generatedAt: Date.now(),
    },
  });
  
  errors.push(...eventValidation.errors);
  warnings.push(...eventValidation.warnings);
  suggestions.push(...eventValidation.suggestions);

  // Validate continuity if previous context exists
  let continuityAssessment = {
    backwardContinuity: 1,
    forwardContinuity: 1,
    issues: [] as string[],
  };
  
  if (previousContext) {
    continuityAssessment = validateChunkContinuity(chunk, previousContext);
    warnings.push(...continuityAssessment.issues);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    continuityAssessment,
    qualityPrediction: {
      userExperience: Math.max(0, 1 - (warnings.length * 0.1) - (errors.length * 0.3)),
      technicalSuccess: Math.max(0, 1 - (errors.length * 0.2)),
      riskFactors: [...errors, ...warnings.filter(w => w.includes('exceed'))],
    },
  };
}

/**
 * Validates chunk continuity with previous context
 */
function validateChunkContinuity(
  chunk: StreamingTimelineChunk,
  previousContext: ChunkContext
): { backwardContinuity: number; forwardContinuity: number; issues: string[] } {
  const issues: string[] = [];
  let backwardContinuity = 1;
  let forwardContinuity = 1;

  // Check narrative continuity
  if (previousContext.narrativeThread && chunk.events.length > 0) {
    const firstNarration = chunk.events.find(e => e.type === 'narration');
    if (!firstNarration) {
      issues.push('Chunk starts without narration - may break narrative flow');
      backwardContinuity -= 0.2;
    }
  }

  // Check visual element continuity
  if (previousContext.lastVisualElements.length > 0) {
    const hasVisualReference = chunk.events.some(event => {
      const content = asContentObject(event.content);
      return previousContext.lastVisualElements.some(lastEl => 
        content.visual?.properties.text?.includes(lastEl.description) ||
        event.dependencies?.includes(lastEl.id)
      );
    });
    
    if (!hasVisualReference) {
      issues.push('Chunk does not reference previous visual elements');
      backwardContinuity -= 0.1;
    }
  }

  // Check concept continuity
  if (previousContext.pendingConnections.length > 0) {
    const addressedConnections = previousContext.pendingConnections.filter(connection =>
      chunk.events.some(event => {
        const content = asContentObject(event.content);
        return content.audio?.text.includes(connection.concept) ||
               content.visual?.properties.text?.includes(connection.concept);
      })
    );
    
    if (addressedConnections.length === 0) {
      issues.push('Chunk does not address pending concept connections');
      backwardContinuity -= 0.15;
    }
  }

  return {
    backwardContinuity: Math.max(0, backwardContinuity),
    forwardContinuity: Math.max(0, forwardContinuity),
    issues,
  };
}

/**
 * Type guard for event types
 */
function isValidEventType(type: string): type is EventType {
  return ['visual', 'narration', 'transition', 'emphasis', 'layout_change'].includes(type);
}