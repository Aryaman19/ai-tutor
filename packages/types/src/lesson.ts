import { CanvasStep, migrateStepContent } from "./canvas";
import { Doubt } from "./doubt";

export type DifficultyLevel = "beginner" | "intermediate" | "advanced";

export interface Lesson {
  id?: string;
  topic: string;
  title?: string;
  difficulty_level?: DifficultyLevel;
  steps: CanvasStep[];
  created_at: Date;
  updated_at?: Date;
  doubts?: Doubt[];
}

// Helper functions for lesson data consistency
export function migrateLessonData(lesson: Lesson): Lesson {
  return {
    ...lesson,
    steps: lesson.steps.map(migrateStepContent),
  };
}

export function validateLessonData(lesson: Lesson): string[] {
  const errors: string[] = [];
  
  if (!lesson.topic.trim()) {
    errors.push("Topic is required");
  }
  
  if (lesson.steps.length === 0) {
    errors.push("At least one step is required");
  }
  
  lesson.steps.forEach((step, index) => {
    if (!step.title.trim()) {
      errors.push(`Step ${index + 1}: Title is required`);
    }
    if (step.step_number !== index + 1) {
      errors.push(`Step ${index + 1}: Step number mismatch`);
    }
  });
  
  return errors;
}

export function normalizeLessonData(lesson: Lesson): Lesson {
  return {
    ...migrateLessonData(lesson),
    difficulty_level: lesson.difficulty_level || "beginner",
    title: lesson.title || lesson.topic,
    updated_at: lesson.updated_at || lesson.created_at,
    steps: lesson.steps.map((step, index) => ({
      ...step,
      step_number: index + 1,
    })),
  };
}
