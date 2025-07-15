import type { CanvasStep } from '@ai-tutor/types';
import { getStepExplanation, migrateStepContent } from '@ai-tutor/types';
import type { ExcalidrawElement } from './excalidraw';
import { createUtilLogger } from '@ai-tutor/utils';

// POC format interface
export interface LessonSlide {
  title?: string;
  narration: string;
  elements: ExcalidrawElement[];
}

// Union type for both formats
export type LessonData = LessonSlide[] | CanvasStep[];

/**
 * Transforms API CanvasStep format to ExcalidrawPlayer format
 */
export function transformApiToPlayerFormat(steps: CanvasStep[]): LessonSlide[] {
  return steps.map(step => {
    // Migrate legacy data first
    const migratedStep = migrateStepContent(step);
    
    return {
      title: migratedStep.title,
      narration: migratedStep.narration || getStepExplanation(migratedStep),
      elements: migratedStep.elements || []
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
  
  // Ensure consistent structure
  return normalized.map((slide, index) => ({
    title: slide.title || `Step ${index + 1}`,
    narration: slide.narration || `Step ${index + 1}`,
    elements: slide.elements || []
  }));
}