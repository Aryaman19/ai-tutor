import type { CanvasStep } from '@ai-tutor/types';
import { 
  getStepExplanation, 
  migrateStepContent, 
  hasTimelineFeatures,
  normalizeStepForTimeline,
  estimateStepDuration 
} from '@ai-tutor/types';
import type { ExcalidrawElement } from './excalidraw';
import { createUtilLogger } from '@ai-tutor/utils';

// POC format interface
export interface LessonSlide {
  title?: string;
  narration: string;
  elements: ExcalidrawElement[];
  
  // Timeline extensions (Phase 1)
  timeline_events?: string[];    // Timeline event IDs for this slide
  timeline_offset?: number;      // Start time offset (milliseconds)
  semantic_type?: string;        // Content semantic classification
  complexity_level?: string;     // Content complexity
  estimated_duration?: number;   // Estimated slide duration (seconds)
}

// Union type for both formats
export type LessonData = LessonSlide[] | CanvasStep[];

/**
 * Transforms API CanvasStep format to ExcalidrawPlayer format
 * Now includes timeline-aware transformations
 */
export function transformApiToPlayerFormat(steps: CanvasStep[]): LessonSlide[] {
  return steps.map((step, index) => {
    // Migrate legacy data and normalize for timeline
    const migratedStep = migrateStepContent(step);
    const normalizedStep = normalizeStepForTimeline(migratedStep);
    
    return {
      title: normalizedStep.title,
      narration: normalizedStep.narration || getStepExplanation(normalizedStep),
      elements: normalizedStep.elements || [],
      
      // Timeline extensions
      timeline_events: normalizedStep.timeline_events,
      timeline_offset: normalizedStep.timeline_offset,
      semantic_type: normalizedStep.semantic_type,
      complexity_level: normalizedStep.complexity_level,
      estimated_duration: estimateStepDuration(normalizedStep),
    };
  });
}

/**
 * Detects the lesson format and normalizes to player format
 */
export function normalizeToPlayerFormat(data: LessonData): LessonSlide[] {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }
  
  // Check if it's already in POC format (has narration and elements)
  const firstItem = data[0];
  if ('narration' in firstItem && 'elements' in firstItem && !('step_number' in firstItem)) {
    return data as LessonSlide[];
  }
  
  // It's API format (CanvasStep[]), transform it
  return transformApiToPlayerFormat(data as CanvasStep[]);
}

/**
 * Checks if data is in API format
 */
export function isApiFormat(data: any[]): data is CanvasStep[] {
  if (!Array.isArray(data) || data.length === 0) return false;
  const firstItem = data[0];
  return 'step_number' in firstItem && 'title' in firstItem;
}

/**
 * Checks if data is in POC format
 */
export function isPocFormat(data: any[]): data is LessonSlide[] {
  if (!Array.isArray(data) || data.length === 0) return false;
  const firstItem = data[0];
  return 'narration' in firstItem && 'elements' in firstItem && !('step_number' in firstItem);
}

const logger = createUtilLogger('LessonAdapter');

/**
 * Fetches lesson from API and transforms to player format
 */
export async function fetchApiLesson(lessonId: string): Promise<LessonSlide[]> {
  try {
    const response = await fetch(`/api/lesson/${lessonId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch lesson: ${response.statusText}`);
    }
    
    const lesson = await response.json();
    return transformApiToPlayerFormat(lesson.steps || []);
  } catch (error) {
    logger.error('Error fetching API lesson:', error);
    return [];
  }
}

/**
 * Fetches lesson script from API and transforms to player format
 */
export async function fetchApiLessonScript(lessonId: string): Promise<LessonSlide[]> {
  try {
    const response = await fetch(`/api/lesson/${lessonId}/script`);
    if (!response.ok) {
      throw new Error(`Failed to fetch lesson script: ${response.statusText}`);
    }
    
    const script = await response.json();
    return transformApiToPlayerFormat(script.steps || []);
  } catch (error) {
    logger.error('Error fetching API lesson script:', error);
    return [];
  }
}



/**
 * Validates lesson data consistency
 */
export function validateLessonData(data: LessonData): string[] {
  const errors: string[] = [];
  
  if (!Array.isArray(data) || data.length === 0) {
    errors.push("Lesson data must be a non-empty array");
    return errors;
  }
  
  if (isApiFormat(data)) {
    data.forEach((step, index) => {
      if (!step.title?.trim()) {
        errors.push(`Step ${index + 1}: Title is required`);
      }
      if (step.step_number !== index + 1) {
        errors.push(`Step ${index + 1}: Step number mismatch`);
      }
      if (!getStepExplanation(step) && !step.narration) {
        errors.push(`Step ${index + 1}: Either explanation or narration is required`);
      }
    });
  } else if (isPocFormat(data)) {
    data.forEach((slide, index) => {
      if (!slide.narration?.trim()) {
        errors.push(`Slide ${index + 1}: Narration is required`);
      }
    });
  }
  
  return errors;
}

/**
 * Normalizes lesson data for consistency
 */
export function normalizeLessonData(data: LessonData): LessonSlide[] {
  const normalized = normalizeToPlayerFormat(data);
  
  // Ensure consistent structure with timeline support
  return normalized.map((slide, index) => ({
    title: slide.title || `Step ${index + 1}`,
    narration: slide.narration || `Step ${index + 1}`,
    elements: slide.elements || [],
    
    // Timeline normalization
    timeline_events: slide.timeline_events || [],
    timeline_offset: slide.timeline_offset,
    semantic_type: slide.semantic_type,
    complexity_level: slide.complexity_level,
    estimated_duration: slide.estimated_duration || 10, // Default 10 seconds
  }));
}

// Timeline-aware utility functions (Phase 1 extensions)

/**
 * Checks if lesson data has timeline features
 */
export function hasTimelineSupport(data: LessonData): boolean {
  if (!Array.isArray(data) || data.length === 0) return false;
  
  if (isApiFormat(data)) {
    return data.some(step => hasTimelineFeatures(step));
  } else if (isPocFormat(data)) {
    return data.some(slide => slide.timeline_events && slide.timeline_events.length > 0);
  }
  
  return false;
}

/**
 * Transforms lesson data to include timeline metadata
 */
export function enhanceWithTimelineMetadata(data: LessonData): LessonSlide[] {
  const slides = normalizeToPlayerFormat(data);
  let cumulativeOffset = 0;
  
  return slides.map((slide, index) => {
    const duration = slide.estimated_duration || 10;
    const enhancedSlide = {
      ...slide,
      timeline_offset: cumulativeOffset,
      estimated_duration: duration,
    };
    
    cumulativeOffset += duration * 1000; // Convert to milliseconds
    return enhancedSlide;
  });
}

/**
 * Calculates total lesson duration with timeline support
 */
export function calculateLessonDuration(data: LessonData): number {
  const slides = normalizeToPlayerFormat(data);
  return slides.reduce((total, slide) => {
    return total + (slide.estimated_duration || 10);
  }, 0);
}

/**
 * Groups slides by semantic type for analysis
 */
export function groupSlidesBySemanticType(data: LessonData): Record<string, LessonSlide[]> {
  const slides = normalizeToPlayerFormat(data);
  const groups: Record<string, LessonSlide[]> = {};
  
  slides.forEach(slide => {
    const type = slide.semantic_type || 'story';
    if (!groups[type]) groups[type] = [];
    groups[type].push(slide);
  });
  
  return groups;
}

/**
 * Analyzes lesson complexity distribution
 */
export function analyzeLessonComplexity(data: LessonData): {
  simple: number;
  medium: number;
  complex: number;
  averageComplexity: number;
} {
  const slides = normalizeToPlayerFormat(data);
  const complexityMap = { simple: 1, medium: 2, complex: 3 };
  
  const counts = { simple: 0, medium: 0, complex: 0 };
  let totalComplexity = 0;
  
  slides.forEach(slide => {
    const complexity = (slide.complexity_level as keyof typeof complexityMap) || 'medium';
    counts[complexity]++;
    totalComplexity += complexityMap[complexity];
  });
  
  return {
    ...counts,
    averageComplexity: slides.length > 0 ? totalComplexity / slides.length : 0,
  };
}

/**
 * Validates timeline consistency across slides
 */
export function validateTimelineConsistency(data: LessonData): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!hasTimelineSupport(data)) {
    warnings.push('Lesson data does not have timeline support');
    return { isValid: true, errors, warnings };
  }
  
  const slides = enhanceWithTimelineMetadata(data);
  
  // Check for timeline gaps or overlaps
  for (let i = 1; i < slides.length; i++) {
    const prevSlide = slides[i - 1];
    const currentSlide = slides[i];
    
    const prevEnd = (prevSlide.timeline_offset || 0) + ((prevSlide.estimated_duration || 10) * 1000);
    const currentStart = currentSlide.timeline_offset || 0;
    
    if (currentStart < prevEnd) {
      warnings.push(`Slide ${i + 1} timeline overlaps with previous slide`);
    } else if (currentStart > prevEnd + 1000) { // > 1 second gap
      warnings.push(`Large gap (${(currentStart - prevEnd) / 1000}s) between slides ${i} and ${i + 1}`);
    }
  }
  
  // Check for reasonable durations
  slides.forEach((slide, index) => {
    const duration = slide.estimated_duration || 10;
    if (duration < 2) {
      warnings.push(`Slide ${index + 1} has very short duration (${duration}s)`);
    } else if (duration > 60) {
      warnings.push(`Slide ${index + 1} has very long duration (${duration}s)`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}