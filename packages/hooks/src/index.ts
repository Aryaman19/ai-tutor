/**
 * Shared React hooks for AI Tutor
 */

// Progressive streaming hook with Phase 5 enhancement
export { useProgressiveStreaming } from './useProgressiveStreaming';

// Types for enhanced progressive streaming
export type {
  ProgressiveStreamingConfig,
  StreamingStatus,
  StreamingActions,
  StreamingRefs,
  ProgressiveStreamingHookResult,
} from './useProgressiveStreaming';

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

// Settings form hook
export { useSettingsForm } from './useSettingsForm';

// Unified engine hooks
export { useUnifiedAudio } from './useUnifiedAudio';
export { useUnifiedLayout } from './useUnifiedLayout';

// Multi-slide audio hook
export { useMultiSlideAudio } from './useMultiSlideAudio';

// Slide progression hook
export { useSlideProgression } from './useSlideProgression';

export type {
  UnifiedAudioStatus,
  UseUnifiedAudioResult
} from './useUnifiedAudio';

export type {
  UnifiedLayoutStatus,
  UseUnifiedLayoutResult
} from './useUnifiedLayout';

export type {
  SlideAudioData,
  MultiSlideAudioStatus,
  AudioMergeResult,
  UseMultiSlideAudioResult
} from './useMultiSlideAudio';

export type {
  SlideSegment,
  SlideProgressionOptions,
  SlideProgressionState,
  UseSlideProgressionResult
} from './useSlideProgression';