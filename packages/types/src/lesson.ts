import { Doubt } from "./doubt";

export type DifficultyLevel = "beginner" | "intermediate" | "advanced";

// Re-export for compatibility
export type { AITutorSlide as Slide };

export interface AITutorSlide {
  slide_number: number;
  template_id: string;
  template_name: string;
  content_type: string;
  filled_content: Record<string, string>;
  elements: any[];
  narration: string;
  estimated_duration: number;
  position_offset: number;
  metadata: Record<string, any>;
  generation_time: number;
  status: string;
  error_message?: string;
}

export interface Lesson {
  id?: string;
  topic: string;
  title?: string;
  difficulty_level?: DifficultyLevel;
  slides: AITutorSlide[];
  merged_audio_url?: string;
  audio_duration?: number;
  created_at: Date;
  updated_at?: Date;
  doubts?: Doubt[];
}

// Helper functions for lesson data consistency
export function validateLessonData(lesson: Lesson): string[] {
  const errors: string[] = [];
  
  if (!lesson.topic.trim()) {
    errors.push("Topic is required");
  }
  
  if (lesson.slides.length === 0) {
    errors.push("At least one slide is required");
  }
  
  lesson.slides.forEach((slide, index) => {
    if (!slide.narration.trim()) {
      errors.push(`Slide ${index + 1}: Narration is required`);
    }
    if (slide.slide_number !== index + 1) {
      errors.push(`Slide ${index + 1}: Slide number mismatch`);
    }
    if (!slide.template_id.trim()) {
      errors.push(`Slide ${index + 1}: Template ID is required`);
    }
  });
  
  return errors;
}

export function normalizeLessonData(lesson: Lesson): Lesson {
  return {
    ...lesson,
    difficulty_level: lesson.difficulty_level || "beginner",
    title: lesson.title || lesson.topic,
    updated_at: lesson.updated_at || lesson.created_at,
    slides: lesson.slides.map((slide, index) => ({
      ...slide,
      slide_number: index + 1,
    })),
  };
}

export function getTotalEstimatedDuration(lesson: Lesson): number {
  return lesson.slides.reduce((total, slide) => total + slide.estimated_duration, 0);
}
