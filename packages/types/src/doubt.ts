export interface Doubt {
  id?: string;
  lesson_id: string;
  question: string;
  answer: string;
  canvas_data?: any;
  audio_url?: string;
  timestamp?: number;
  created_at: Date;
}
