import { CanvasStep } from "./canvas";
import { Doubt } from "./doubt";

export interface Lesson {
  id?: string;
  topic: string;
  title?: string;
  difficulty_level?: "beginner" | "intermediate" | "advanced";
  steps: CanvasStep[];
  created_at: Date;
  doubts?: Doubt[];
}
