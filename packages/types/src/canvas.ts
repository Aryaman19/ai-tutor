export type ViewMode = "video" | "notes" | "mindmap" | "quiz";

export interface CanvasStep {
  step_number: number;
  title: string;
  explanation?: string;  // New field
  content?: string;      // Legacy field for backward compatibility
  narration?: string;
  visual_elements?: string[] | any[];
  elements?: any[];      // Excalidraw elements
  audio_url?: string;
  canvas_data?: any;
  duration?: number;
}
