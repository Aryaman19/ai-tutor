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
