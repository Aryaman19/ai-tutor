/**
 * Streaming Timeline Chunk System - Data structures for chunked LLM content generation
 * 
 * This module defines the container formats for streaming timeline content from LLM services.
 * It handles the chunked nature of LLM generation while maintaining temporal continuity
 * and providing metadata for seamless chunk transitions.
 */

import type { TimelineEvent, TimelineEventCollection, ContentType } from './TimelineEvent';

export type ChunkStatus = 'pending' | 'generating' | 'ready' | 'error' | 'cached';

export type ContinuityType = 'visual_continuity' | 'narrative_bridge' | 'concept_connection' | 'layout_transition';

/**
 * Continuity hint for maintaining smooth transitions between chunks
 */
export interface ContinuityHint {
  /** Type of continuity to maintain */
  type: 'narrative' | 'conceptual' | 'visual' | 'knowledge_level' | 'transition';
  
  /** Priority for this continuity requirement */
  priority: 'critical' | 'high' | 'medium' | 'low';
  
  /** Human-readable description of the continuity requirement */
  description: string;
  
  /** Suggested transition text or approach */
  suggestedTransition: string;
  
  /** Specific requirements for this continuity hint */
  requirements: string[];
  
  /** Reference to elements/concepts from previous chunk */
  references?: string[];
}

/**
 * Chunk transition information
 */
export interface ChunkTransition {
  /** Source chunk ID */
  fromChunkId: string;
  
  /** Target chunk ID */
  toChunkId: string;
  
  /** Transition type */
  type: 'sequential' | 'branch' | 'merge' | 'jump';
  
  /** Transition metadata */
  metadata: {
    /** Transition smoothness score (0-1) */
    smoothness: number;
    
    /** Transition requirements */
    requirements: string[];
    
    /** Generated transition content */
    transitionContent?: string;
  };
}

/**
 * Context information from previous chunks for continuity
 */
export interface ChunkContext {
  /** Visual elements active at end of previous chunk */
  lastVisualElements: Array<{
    id: string;
    type: string;
    description: string;
    position?: { x: number; y: number };
  }>;
  
  /** Main narrative thread and current focus */
  narrativeThread: string;
  
  /** Key concepts introduced in previous chunks */
  keyConceptsIntroduced: string[];
  
  /** Current topic focus */
  currentFocus: string;
  
  /** Layout state summary */
  layoutState: {
    /** Active regions and their content */
    activeRegions: string[];
    
    /** Element density assessment */
    density: 'sparse' | 'moderate' | 'dense';
    
    /** Visual hierarchy state */
    hierarchyLevel: number;
  };
  
  /** Pending connections to be made in next chunk */
  pendingConnections: Array<{
    concept: string;
    relationship: string;
    target?: string;
  }>;
  
  /** Emotional/engagement context */
  engagementContext: {
    /** Current engagement level */
    level: 'building' | 'peak' | 'maintaining' | 'concluding';
    
    /** Tone and style */
    tone: 'formal' | 'conversational' | 'enthusiastic' | 'explanatory';
  };
}

/**
 * Chunk generation parameters and constraints
 */
export interface ChunkGenerationParams {
  /** Target duration for this chunk (seconds) */
  targetDuration: number;
  
  /** Maximum number of events in this chunk */
  maxEvents: number;
  
  /** Content complexity level */
  complexity: 'simple' | 'medium' | 'complex';
  
  /** Layout constraints */
  layoutConstraints: {
    /** Maximum visual elements simultaneously */
    maxSimultaneousElements: number;
    
    /** Preferred layout style */
    preferredStyle: 'minimal' | 'balanced' | 'rich';
    
    /** Canvas size considerations */
    canvasSize?: { width: number; height: number };
  };
  
  /** Audio constraints */
  audioConstraints: {
    /** Speaking rate (words per minute) */
    speakingRate: number;
    
    /** Pause frequency */
    pauseFrequency: 'minimal' | 'normal' | 'frequent';
    
    /** Voice settings */
    voiceSettings?: {
      voice: string;
      speed: number;
      volume: number;
    };
  };
  
  /** Content focus */
  contentFocus: {
    /** Primary learning objective */
    primaryObjective: string;
    
    /** Key concepts to emphasize */
    keyConceptsToEmphasize: string[];
    
    /** Concepts to de-emphasize */
    conceptsToDeemphasize?: string[];
  };
}

/**
 * Chunk quality assessment metrics
 */
export interface ChunkQualityMetrics {
  /** Content quality scores (0-1) */
  contentQuality: {
    /** Clarity and coherence */
    clarity: number;
    
    /** Completeness of information */
    completeness: number;
    
    /** Engagement level */
    engagement: number;
    
    /** Educational effectiveness */
    effectiveness: number;
  };
  
  /** Technical quality scores (0-1) */
  technicalQuality: {
    /** Event timing consistency */
    timingConsistency: number;
    
    /** Layout feasibility */
    layoutFeasibility: number;
    
    /** Audio generation feasibility */
    audioFeasibility: number;
    
    /** Continuity with previous chunks */
    continuityScore: number;
  };
  
  /** Performance metrics */
  performanceMetrics: {
    /** Generation time (milliseconds) */
    generationTime: number;
    
    /** Token usage */
    tokenUsage: number;
    
    /** Memory efficiency score */
    memoryEfficiency: number;
  };
  
  /** Overall quality score (0-1) */
  overallScore: number;
  
  /** Quality assessment timestamp */
  assessedAt: number;
}

/**
 * Single streaming timeline chunk from LLM
 */
export interface StreamingTimelineChunk {
  /** Unique identifier for this chunk */
  chunkId: string;
  
  /** Chunk sequence number (1-based) */
  chunkNumber: number;
  
  /** Total number of chunks expected */
  totalChunks: number;
  
  /** Chunk status */
  status: ChunkStatus;
  
  /** Start time offset for this chunk (milliseconds from lesson start) */
  startTimeOffset: number;
  
  /** Timestamp offset (alias for startTimeOffset for backward compatibility) */
  timestampOffset?: number;
  
  /** Duration of this chunk (milliseconds) */
  duration: number;
  
  /** Timeline events in this chunk */
  events: TimelineEvent[];
  
  /** Content classification */
  contentType: ContentType;
  
  /** Chunk generation parameters used */
  generationParams: ChunkGenerationParams;
  
  /** Context from previous chunks */
  previousContext?: ChunkContext;
  
  /** Continuity hints for next chunk */
  nextChunkHints: ContinuityHint[];
  
  /** Quality assessment */
  qualityMetrics?: ChunkQualityMetrics;
  
  /** Generation metadata */
  metadata: {
    /** LLM model used */
    model: string;
    
    /** Generation timestamp */
    generatedAt: number;
    
    /** Generation source prompt */
    sourcePrompt?: string;
    
    /** Summary of this chunk's content */
    summary?: string;
    
    /** Key concepts introduced in this chunk */
    conceptsIntroduced?: string[];
    
    /** LLM parameters used */
    llmParams?: {
      temperature: number;
      topP?: number;
      maxTokens?: number;
      [key: string]: any;
    };
    
    /** Processing time breakdown */
    timing: {
      /** LLM generation time */
      llmGeneration: number;
      
      /** Post-processing time */
      postProcessing: number;
      
      /** Validation time */
      validation: number;
      
      /** Total time */
      total: number;
    };
    
    /** Error information if generation failed */
    error?: {
      message: string;
      code: string;
      timestamp: number;
      retryable: boolean;
    };
    
    /** Additional metadata */
    [key: string]: any;
  };
}

/**
 * Collection of streaming chunks representing a complete lesson
 */
export interface StreamingTimelineLesson {
  /** Unique lesson identifier */
  lessonId: string;
  
  /** Lesson topic */
  topic: string;
  
  /** Lesson title */
  title?: string;
  
  /** Target difficulty level */
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced';
  
  /** All chunks in temporal order */
  chunks: StreamingTimelineChunk[];
  
  /** Total lesson duration (milliseconds) */
  totalDuration: number;
  
  /** Overall content type classification */
  overallContentType: ContentType;
  
  /** Lesson generation status */
  status: 'generating' | 'complete' | 'error' | 'cancelled';
  
  /** Global lesson metadata */
  metadata: {
    /** Generation request timestamp */
    requestedAt: number;
    
    /** Generation completion timestamp */
    completedAt?: number;
    
    /** User parameters */
    userParams?: {
      userId?: string;
      preferences?: Record<string, any>;
      constraints?: Record<string, any>;
    };
    
    /** Performance summary */
    performanceSummary?: {
      /** Total generation time */
      totalGenerationTime: number;
      
      /** Average chunk quality */
      averageQuality: number;
      
      /** Token usage summary */
      totalTokens: number;
      
      /** Error count */
      errorCount: number;
    };
    
    /** Quality assessment */
    qualityAssessment?: {
      /** Overall lesson coherence */
      coherence: number;
      
      /** Learning objective achievement */
      objectiveAchievement: number;
      
      /** Engagement consistency */
      engagementConsistency: number;
      
      /** Technical quality */
      technicalQuality: number;
    };
  };
}

/**
 * Chunk validation result
 */
export interface ChunkValidationResult {
  /** Whether the chunk is valid */
  isValid: boolean;
  
  /** Validation errors */
  errors: string[];
  
  /** Validation warnings */
  warnings: string[];
  
  /** Suggested improvements */
  suggestions: string[];
  
  /** Continuity assessment */
  continuityAssessment: {
    /** How well this chunk connects to previous */
    backwardContinuity: number;
    
    /** How well this chunk sets up next */
    forwardContinuity: number;
    
    /** Specific continuity issues */
    issues: string[];
  };
  
  /** Quality prediction */
  qualityPrediction: {
    /** Predicted user experience score */
    userExperience: number;
    
    /** Predicted technical success */
    technicalSuccess: number;
    
    /** Risk factors */
    riskFactors: string[];
  };
}

/**
 * Chunk processing options
 */
export interface ChunkProcessingOptions {
  /** Whether to validate chunk on creation */
  validateOnCreate: boolean;
  
  /** Whether to assess quality immediately */
  assessQualityImmediately: boolean;
  
  /** Whether to pre-generate next chunk hints */
  generateNextHints: boolean;
  
  /** Whether to optimize for performance */
  optimizeForPerformance: boolean;
  
  /** Custom processing hooks */
  customProcessors?: Array<(chunk: StreamingTimelineChunk) => Promise<StreamingTimelineChunk>>;
  
  /** Error handling strategy */
  errorHandling: {
    /** How to handle validation errors */
    onValidationError: 'reject' | 'warn' | 'fix' | 'ignore';
    
    /** How to handle quality issues */
    onQualityIssues: 'reject' | 'warn' | 'improve' | 'accept';
    
    /** Retry configuration */
    retryConfig?: {
      maxRetries: number;
      backoffMultiplier: number;
      initialDelay: number;
    };
  };
}