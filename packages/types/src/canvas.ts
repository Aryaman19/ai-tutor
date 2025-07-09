export type ViewMode = "video" | "notes" | "mindmap" | "quiz";

export interface CanvasStep {
  step_number: number;
  title: string;
  explanation: string;
  narration: string;
  visual_elements: string[];
  audio_url?: string;
  canvas_data?: any;
  duration?: number;
}
