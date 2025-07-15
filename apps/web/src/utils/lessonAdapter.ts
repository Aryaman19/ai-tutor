import type { CanvasStep } from '@ai-tutor/types';
import type { ExcalidrawElement } from './excalidraw';

// POC format interface
export interface LessonSlide {
  narration: string;
  elements: ExcalidrawElement[];
}

// Union type for both formats
export type LessonData = LessonSlide[] | CanvasStep[];

/**
 * Transforms API CanvasStep format to ExcalidrawPlayer format
 */
export function transformApiToPlayerFormat(steps: CanvasStep[]): LessonSlide[] {
  return steps.map(step => ({
    narration: step.narration || step.explanation || step.content || "",
    elements: step.elements || [] // API elements if available, empty otherwise
  }));
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
    console.error('Error fetching API lesson:', error);
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
    console.error('Error fetching API lesson script:', error);
    return [];
  }
}

/**
 * Creates a mock lesson slide for testing
 */
export function createMockSlide(
  narration: string = "This is a test slide", 
  elements: ExcalidrawElement[] = []
): LessonSlide {
  return { narration, elements };
}

/**
 * Creates mock lesson slides for testing API compatibility
 */
export function createMockApiSteps(): CanvasStep[] {
  return [
    {
      step_number: 1,
      title: "Introduction",
      explanation: "This is the first step explanation",
      narration: "Welcome to our lesson! This is the first step.",
      elements: [],
      duration: 5.0
    },
    {
      step_number: 2,
      title: "Main Concept",
      explanation: "This explains the main concept",
      narration: "Now let's dive into the main concept.",
      elements: [],
      duration: 8.0
    }
  ];
}