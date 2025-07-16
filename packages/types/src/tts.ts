// TTS-specific types for Piper and other TTS providers

export interface TTSGenerateRequest {
  text: string;
  voice?: string;
}

export interface TTSGenerateResponse {
  audio_id: string;
  audio_url: string;
  cached: boolean;
  text: string;
  voice: string;
}

export interface TTSVoiceInfo {
  id: string;
  name: string;
  language: string;
}

export interface TTSBatchRequest {
  texts: string[];
  voice?: string;
}

export interface TTSBatchResult {
  index: number;
  text: string;
  audio_id?: string;
  audio_url?: string;
  cached?: boolean;
  voice?: string;
  error?: string;
}

export interface TTSBatchResponse {
  results: TTSBatchResult[];
  total: number;
  success: number;
  failed: number;
}

export interface TTSCacheStatistics {
  total_files: number;
  total_size_bytes: number;
  total_size_mb: number;
  cache_limit: number;
  cache_directory: string;
}

export interface TTSHealthCheck {
  status: 'healthy' | 'unhealthy';
  service: string;
  healthy: boolean;
  error?: string;
}

export interface TTSAudioStatus {
  isGenerating: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  progress: number;
  currentTime: number;
  duration: number;
}

export interface TTSAudioOptions {
  voice?: string;
  autoPlay?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

export interface LessonTTSStatus {
  lesson_id: string;
  total_steps: number;
  steps_with_narration: number;
  steps_with_tts: number;
  steps_with_errors: number;
  completion_percentage: number;
  step_details: {
    step_number: number;
    title: string;
    has_narration: boolean;
    tts_generated: boolean;
    audio_url?: string;
    tts_voice?: string;
    tts_error?: string;
  }[];
}

export type TTSProviderType = 'browser' | 'piper' | 'elevenlabs' | 'openai';

export interface TTSProviderConfig {
  provider: TTSProviderType;
  label: string;
  requiresApiKey: boolean;
  offlineCapable: boolean;
  description?: string;
}