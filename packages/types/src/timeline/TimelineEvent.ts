/**
 * Timeline Event System - Core interfaces for timeline-based content generation
 * 
 * This module defines the fundamental data structures for the Timeline-Based Semantic Layout Engine.
 * It extends the existing CanvasStep system to support fine-grained temporal control over
 * content presentation and layout positioning.
 */

export type EventType = 'visual' | 'narration' | 'transition' | 'emphasis' | 'layout_change';

export type ContentType = 'definition' | 'process' | 'comparison' | 'example' | 'list' | 'concept_map' | 'formula' | 'story';

export type SemanticLevel = 'primary' | 'supporting' | 'detail' | 'accent';

export type PositioningHint = 'center' | 'left' | 'right' | 'top' | 'bottom' | 'relative_to' | 'flow' | 'grid';

export type AnimationType = 'fade_in' | 'slide_in' | 'grow' | 'draw' | 'highlight' | 'none';

export type ImportanceLevel = 'critical' | 'high' | 'medium' | 'low';

/**
 * Layout hints provide semantic guidance for element positioning
 */
export interface LayoutHint {
  /** Semantic classification of content for intelligent positioning */
  semantic: SemanticLevel;
  
  /** Positioning strategy for this content */
  positioning: PositioningHint;
  
  /** Reference element ID for relative positioning */
  relativeElement?: string;
  
  /** Importance level affects visual hierarchy and sizing */
  importance: ImportanceLevel;
  
  /** Visual relationship to other elements */
  visualRelationship?: 'connects_to' | 'groups_with' | 'contrasts_with' | 'flows_from' | 'emphasizes';
  
  /** Target element IDs for relationships */
  relationshipTargets?: string[];
  
  /** Preferred region for placement (will be used by layout engine) */
  preferredRegion?: 'header' | 'main' | 'sidebar' | 'footer' | 'overlay';
}

/**
 * Visual instruction for creating Excalidraw elements
 */
export interface VisualInstruction {
  /** Type of visual element to create */
  action: 'create' | 'modify' | 'remove' | 'animate' | 'highlight';
  
  /** Element type for creation */
  elementType: 'text' | 'shape' | 'arrow' | 'diagram' | 'callout' | 'flowchart' | 'connector';
  
  /** Element properties and styling */
  properties: {
    /** Text content for text elements */
    text?: string;
    
    /** Size classification */
    size?: 'small' | 'medium' | 'large' | 'auto';
    
    /** Color scheme */
    color?: 'primary' | 'secondary' | 'accent' | 'neutral' | 'success' | 'warning' | 'error';
    
    /** Shape-specific properties */
    shape?: 'rectangle' | 'circle' | 'diamond' | 'arrow' | 'line';
    
    /** Custom properties for complex elements */
    custom?: Record<string, any>;
  };
  
  /** Animation type for this instruction */
  animationType?: AnimationType;
  
  /** Animation duration in milliseconds */
  animationDuration?: number;
  
  /** Target element ID for modifications */
  targetElementId?: string;
}

/**
 * Audio cue for narration events
 */
export interface AudioCue {
  /** Text to be spoken */
  text: string;
  
  /** Speaking speed multiplier (1.0 = normal) */
  speed?: number;
  
  /** Volume level (0.0 - 1.0) */
  volume?: number;
  
  /** Voice to use (if different from default) */
  voice?: string;
  
  /** Emphasis markers within the text */
  emphasis?: Array<{
    start: number;
    end: number;
    type: 'stress' | 'pause' | 'speed_up' | 'slow_down';
  }>;
  
  /** Pause before speaking (milliseconds) */
  pauseBefore?: number;
  
  /** Pause after speaking (milliseconds) */
  pauseAfter?: number;
}

/**
 * Transition instruction for scene changes
 */
export interface TransitionInstruction {
  /** Type of transition */
  type: 'zoom' | 'pan' | 'focus' | 'fade' | 'slide' | 'none';
  
  /** Target element ID or coordinate for focus transitions */
  target?: string | { x: number; y: number };
  
  /** Transition duration in milliseconds */
  duration: number;
  
  /** Easing function for smooth transitions */
  easing?: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out' | 'bounce';
  
  /** Additional transition parameters */
  parameters?: Record<string, any>;
}

/**
 * Core event content union type
 */
export type EventContent = {
  visual?: VisualInstruction;
  audio?: AudioCue;
  transition?: TransitionInstruction;
  metadata?: Record<string, any>;
  // Allow additional properties for backward compatibility
  [key: string]: any;
} & {
  // Add length property to help with string-like access patterns
  length?: number;
};

/**
 * Core timeline event structure
 */
export interface TimelineEvent {
  /** Unique identifier for this event */
  id: string;
  
  /** Timestamp from start of timeline (milliseconds) */
  timestamp: number;
  
  /** Start time (alias for timestamp for backward compatibility) */
  startTime?: number;
  
  /** Duration this event remains active (milliseconds) */
  duration: number;
  
  /** Type of event for processing logic */
  type: EventType;
  
  /** Semantic type for Phase 3 layout engine */
  semanticType?: ContentType;
  
  /** Event content and instructions */
  content: EventContent | string;
  
  /** Layout positioning hints */
  layoutHints: LayoutHint[];
  
  /** Dependencies on other events (event IDs) */
  dependencies?: string[];
  
  /** Priority for conflict resolution (higher = more important) */
  priority?: number;
  
  /** Tags for categorization and filtering */
  tags?: string[];
  
  /** Legacy visual instruction property for backward compatibility */
  visualInstruction?: string;

  /** Metadata for debugging and analysis */
  metadata?: {
    /** Source information (LLM chunk, manual, template) */
    source: 'llm' | 'manual' | 'template' | 'fallback';
    
    /** Generation timestamp */
    generatedAt: number;
    
    /** Confidence score for LLM-generated content (0-1) */
    confidence?: number;
    
    /** Original text or prompt that generated this event */
    originalPrompt?: string;
    
    /** Additional metadata */
    [key: string]: any;
  };
}

/**
 * Event validation result
 */
export interface EventValidationResult {
  /** Whether the event is valid */
  isValid: boolean;
  
  /** Validation errors */
  errors: string[];
  
  /** Validation warnings */
  warnings: string[];
  
  /** Suggested fixes */
  suggestions: string[];
}

/**
 * Timeline event collection with metadata
 */
export interface TimelineEventCollection {
  /** Array of timeline events */
  events: TimelineEvent[];
  
  /** Total duration of all events */
  totalDuration: number;
  
  /** Content classification */
  contentType: ContentType;
  
  /** Complexity assessment */
  complexity: 'simple' | 'medium' | 'complex';
  
  /** Key concepts identified in the content */
  keyEntities: string[];
  
  /** Key concept entities with metadata */
  keyConceptEntities?: Array<{
    entity: string;
    confidence: number;
    category: string;
  }>;
  
  /** Relationships between concepts */
  relationships: Array<{
    from: string;
    to: string;
    type: 'causes' | 'leads_to' | 'is_part_of' | 'contrasts_with' | 'similar_to';
  }>;
  
  /** Quality metrics */
  qualityMetrics: {
    /** Event timing consistency (0-1) */
    timingConsistency: number;
    
    /** Content completeness (0-1) */
    completeness: number;
    
    /** Layout feasibility (0-1) */
    layoutFeasibility: number;
  };
  
  /** Generation metadata */
  metadata: {
    /** Generation source */
    source: 'llm' | 'manual' | 'template';
    
    /** Generation timestamp */
    generatedAt: number;
    
    /** Source content or prompt */
    sourceContent?: string;
    
    /** Generation parameters */
    generationParams?: Record<string, any>;
  };
}