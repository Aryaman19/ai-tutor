export type ViewMode = "video" | "notes" | "mindmap" | "quiz";

export interface CanvasStep {
  step_number: number;
  title: string;
  explanation?: string;  // Primary field for explanation text
  content?: string;      // Legacy field for backward compatibility
  narration?: string;    // Script content for narration
  visual_elements?: string[] | any[];
  elements?: any[];      // Excalidraw elements
  audio_url?: string;
  canvas_data?: any;
  duration?: number;     // Estimated duration in seconds
  
  // TTS metadata fields
  audio_id?: string;     // TTS audio cache ID
  tts_voice?: string;    // TTS voice used for generation
  tts_generated?: boolean; // Whether TTS audio was generated
  tts_error?: string;    // TTS generation error if any
  
  // Timeline-based features (Phase 1 extension)
  timeline_events?: string[];  // Array of timeline event IDs for this step
  chunk_id?: string;          // Reference to the streaming chunk this step belongs to
  timeline_offset?: number;   // Start time offset within the global timeline (milliseconds)
  semantic_type?: 'definition' | 'process' | 'comparison' | 'example' | 'list' | 'concept_map' | 'formula' | 'story';
  complexity_level?: 'simple' | 'medium' | 'complex';
  
  // Enhanced metadata for timeline support
  timeline_metadata?: {
    /** Whether this step supports timeline-based playback */
    timelineEnabled: boolean;
    
    /** Key concepts introduced in this step */
    keyEntities?: string[];
    
    /** Relationships to other steps */
    relationships?: Array<{
      targetStepId: string;
      relationshipType: 'continues' | 'builds_on' | 'contrasts' | 'summarizes';
    }>;
    
    /** Layout preferences for this step */
    layoutPreferences?: {
      preferredStyle: 'minimal' | 'balanced' | 'rich';
      maxSimultaneousElements: number;
    };
    
    /** Quality metrics */
    qualityMetrics?: {
      contentCompleteness: number;  // 0-1
      technicalFeasibility: number; // 0-1
      engagementLevel: number;      // 0-1
    };
  };
  
  // Helper method to get explanation text with fallback
  getExplanation?: () => string;
}

// Type guard to check if step has explanation
export function hasExplanation(step: CanvasStep): boolean {
  return !!(step.explanation || step.content);
}

// Helper function to get explanation text with fallback
export function getStepExplanation(step: CanvasStep): string {
  return step.explanation || step.content || "";
}

// Helper function to migrate legacy content to explanation
export function migrateStepContent(step: CanvasStep): CanvasStep {
  if (step.content && !step.explanation) {
    return {
      ...step,
      explanation: step.content,
      content: step.content, // Keep for backward compatibility
    };
  }
  return step;
}

// Timeline-aware helper functions (Phase 1 extensions)

/**
 * Type guard to check if step has timeline features enabled
 */
export function hasTimelineFeatures(step: CanvasStep): boolean {
  return !!(step.timeline_metadata?.timelineEnabled || step.timeline_events?.length);
}

/**
 * Helper function to check if step belongs to a specific chunk
 */
export function isStepInChunk(step: CanvasStep, chunkId: string): boolean {
  return step.chunk_id === chunkId;
}

/**
 * Helper function to get step complexity with fallback
 */
export function getStepComplexity(step: CanvasStep): 'simple' | 'medium' | 'complex' {
  if (step.complexity_level) {
    return step.complexity_level;
  }
  
  // Estimate complexity based on content
  const textLength = getStepExplanation(step).length;
  const visualElementCount = step.visual_elements?.length || 0;
  const hasElements = (step.elements?.length || 0) > 0;
  
  if (textLength < 100 && visualElementCount <= 2 && !hasElements) {
    return 'simple';
  } else if (textLength > 300 || visualElementCount > 5 || hasElements) {
    return 'complex';
  } else {
    return 'medium';
  }
}

/**
 * Helper function to get semantic type with fallback detection
 */
export function getStepSemanticType(step: CanvasStep): 'definition' | 'process' | 'comparison' | 'example' | 'list' | 'concept_map' | 'formula' | 'story' {
  if (step.semantic_type) {
    return step.semantic_type;
  }
  
  // Basic semantic type detection based on content
  const content = getStepExplanation(step).toLowerCase();
  
  if (content.includes('define') || content.includes('definition') || content.includes('means') || content.includes('refers to')) {
    return 'definition';
  } else if (content.includes('step') || content.includes('process') || content.includes('first') || content.includes('then')) {
    return 'process';
  } else if (content.includes('versus') || content.includes('compared to') || content.includes('difference')) {
    return 'comparison';
  } else if (content.includes('example') || content.includes('for instance') || content.includes('such as')) {
    return 'example';
  } else if (content.includes('formula') || content.includes('equation') || /\d+[\+\-\*\/]/.test(content)) {
    return 'formula';
  } else if ((step.visual_elements?.length || 0) > 3) {
    return 'concept_map';
  } else {
    return 'story'; // Default fallback
  }
}

/**
 * Helper function to normalize step data for timeline compatibility
 */
export function normalizeStepForTimeline(step: CanvasStep): CanvasStep {
  const normalized = migrateStepContent(step);
  
  return {
    ...normalized,
    complexity_level: normalized.complexity_level || getStepComplexity(normalized),
    semantic_type: normalized.semantic_type || getStepSemanticType(normalized),
    timeline_metadata: {
      timelineEnabled: false, // Will be enabled when timeline events are added
      keyEntities: [],
      relationships: [],
      layoutPreferences: {
        preferredStyle: 'balanced',
        maxSimultaneousElements: 5,
      },
      qualityMetrics: {
        contentCompleteness: hasExplanation(normalized) ? 1 : 0.5,
        technicalFeasibility: 1,
        engagementLevel: 0.7, // Default assumption
      },
      ...normalized.timeline_metadata,
    },
  };
}

/**
 * Helper function to extract key entities from step content
 */
export function extractStepEntities(step: CanvasStep): string[] {
  const content = getStepExplanation(step);
  const title = step.title;
  
  // Simple entity extraction (can be enhanced with NLP)
  const entities: string[] = [];
  
  // Extract capitalized words (likely proper nouns or concepts)
  const capitalizedWords = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  entities.push(...capitalizedWords);
  
  // Extract words from title
  const titleWords = title.split(/\s+/).filter(word => word.length > 3);
  entities.push(...titleWords);
  
  // Remove duplicates and common words
  const commonWords = ['The', 'This', 'That', 'When', 'Where', 'What', 'How', 'Why'];
  return [...new Set(entities)].filter(entity => !commonWords.includes(entity));
}

/**
 * Helper function to estimate step duration based on content
 */
export function estimateStepDuration(step: CanvasStep): number {
  if (step.duration) {
    return step.duration;
  }
  
  const content = getStepExplanation(step) + (step.narration || '');
  const words = content.split(/\s+/).length;
  const visualElements = step.visual_elements?.length || 0;
  const excalidrawElements = step.elements?.length || 0;
  
  // Base duration: ~150 words per minute for reading/narration
  let baseDuration = (words / 150) * 60;
  
  // Add time for visual processing
  const visualProcessingTime = (visualElements + excalidrawElements) * 2; // 2 seconds per visual element
  
  // Add minimum time for very short content
  const minimumDuration = 5; // 5 seconds minimum
  
  return Math.max(minimumDuration, baseDuration + visualProcessingTime);
}
