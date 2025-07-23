/**
 * Streaming utilities for progressive video playback
 */

// Legacy streaming components
export { ChunkCoordinator } from './chunk-coordinator';
export { TimelineContentProcessor } from './timeline-content-processor';
export { TimelineEventScheduler } from './timeline-event-scheduler';

// Progressive streaming components (YouTube-style)
export { ProgressiveBufferManager } from './progressive-buffer-manager';
export { StreamingPlaybackController } from './streaming-playback-controller';
export { ProgressiveAudioManager } from './progressive-audio-manager';
export { AdaptiveBufferController } from './adaptive-buffer-controller';

// Types
export type {
  ChunkCoordinationOptions,
  ChunkProcessingStatus,
  TimelineCoordinationState,
} from './chunk-coordinator';

export type {
  ProcessingState,
  BufferStrategy,
  MemoryConfig,
  ProcessingMetrics,
  ContentProcessorConfig,
} from './timeline-content-processor';

export type {
  BufferRegion,
  ProgressiveBufferConfig,
  PlaybackReadiness,
  ProgressiveBufferEvents,
} from './progressive-buffer-manager';

export type {
  PlaybackState,
  BufferingStrategy,
  PlaybackEvents,
  StreamingControllerConfig,
  PlaybackMetrics,
} from './streaming-playback-controller';

export type {
  AudioChunk,
  ProgressiveAudioConfig,
  AudioPlaybackState,
  ProgressiveAudioEvents,
} from './progressive-audio-manager';

export type {
  NetworkInfo,
  DevicePerformance,
  UserBehavior,
  AdaptiveBufferStrategy,
  AdaptationReason,
  AdaptiveBufferEvents,
  AdaptiveBufferConfig,
} from './adaptive-buffer-controller';