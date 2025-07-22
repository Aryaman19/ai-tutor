/**
 * @ai-tutor/types - Shared Type Definitions
 */

// Canvas and Lesson types
export * from './src/canvas';
export * from './src/doubt';
export * from './src/env';
export * from './src/health';
export * from './src/lesson';
export * from './src/settings';
export * from './src/tts';

// Timeline types
export * from './src/timeline/TimelineEvent';
export * from './src/timeline/StreamingTimelineChunk';

// Additional types for pre-generation pipeline
export interface ChunkGenerationRequest {
  chunkId: string;
  topic: string;
  chunkNumber: number;
  totalChunks: number;
  context?: any;
  priority?: number;
  timestamp?: number;
  dependencies?: string[];
  config?: any;
}