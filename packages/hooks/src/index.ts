/**
 * Shared React hooks for AI Tutor
 */

// TTS Audio hooks
export { 
  useTTSAudio,
  useTTSVoices,
  useTTSCache,
  useBatchTTS,
  useTTSAvailability,
  useTTSHealth,
  useLessonTTS
} from './useTTSAudio';

export type {
  TTSAudioStatus,
  TTSAudioOptions
} from './useTTSAudio';

// Streaming TTS hook
export { useStreamingTTS } from './useStreamingTTS';

// Settings hooks
export { 
  useTTSSettings,
  useSettings,
  usePersonalizationSettings,
  useInteractionSettings,
  useAppearanceSettings 
} from './useSettings';

// Theme hook
export { useTheme } from './useTheme';

// Health monitoring hook
export { useHealthMonitoring } from './useHealthMonitoring';

// Browser voices hook
export { 
  useAvailableModels,
  useBrowserVoices 
} from './useSettings';