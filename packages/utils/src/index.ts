export * from './logger';

// Phase 5 Audio Integration & Synchronization
export { 
  TimelineAudioSync, 
  createTimelineAudioSync,
  type AudioSyncOptions,
  type AudioTimelinePosition,
  type TimelineAudioChunk,
  type AudioSeekInfo
} from './audio/timeline-audio-sync';

export { 
  StreamingAudioProcessor,
  type AudioBufferConfig,
  type StreamingAudioChunk,
  type AudioProcessingMetrics,
  type AudioGenerationRequest
} from './audio/streaming-audio-processor';

export { 
  AudioVisualCoordinator,
  type CoordinationConfig,
  type CoordinationMode,
  type AVSyncEvent,
  type CoordinationMetrics
} from './audio/audio-visual-coordinator';

export { 
  AudioMerger,
  type AudioSegment,
  type MergedAudioResult,
  type CrossfadeOptions
} from './audio/audio-merger';

// Utility functions
export { debounce, throttle } from './debounce';

// Advanced Timeline Features (Phase 3-4)
export { 
  createTimelineLayoutEngine,
  type TimelineLayoutEngine 
} from './excalidraw/semantic-layout/timeline-layout-engine';

export { 
  createSmartElementFactory,
  type SmartElementFactory 
} from './excalidraw/elements/smart-element-factory';

export { 
  SeekOptimizer 
} from './streaming/seek-optimizer';

export { 
  TimelineEventScheduler 
} from './streaming/timeline-event-scheduler';

// Streaming utilities
export { 
  ChunkCoordinator 
} from './streaming/chunk-coordinator';

export { 
  TimelineContentProcessor 
} from './streaming/timeline-content-processor';