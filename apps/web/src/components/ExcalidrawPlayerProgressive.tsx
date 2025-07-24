/**
 * ExcalidrawPlayer with Progressive Streaming
 * 
 * Simplified YouTube-style progressive loading video player
 */

import "@excalidraw/excalidraw/index.css";
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { StreamingTimelineChunk, TimelineEvent } from '@ai-tutor/types';
import { createComponentLogger } from '@ai-tutor/utils';
import { useTTSSettings, useTTSAudio, useTTSAvailability, useStreamingTTS, useTTSVoices } from "@ai-tutor/hooks";
import SimpleAudioTimeline from './SimpleAudioTimeline';

// Phase 5 Audio Integration Components
import {
  TimelineAudioSync,
  type AudioTimelinePosition,
  type TimelineAudioSyncConfig
} from '@ai-tutor/utils/src/audio/timeline-audio-sync';
import {
  StreamingAudioProcessor,
  type AudioBufferConfig,
  type StreamingAudioChunk as ProcessorAudioChunk
} from '@ai-tutor/utils/src/audio/streaming-audio-processor';
import {
  AudioVisualCoordinator,
  type CoordinationConfig,
  type CoordinationMode
} from '@ai-tutor/utils/src/audio/audio-visual-coordinator';

// Advanced Timeline Features (Phase 3-4)
import { 
  createTimelineLayoutEngine,
  type TimelineLayoutEngine 
} from '@ai-tutor/utils/src/excalidraw/semantic-layout/timeline-layout-engine';
import { 
  createSmartElementFactory,
  type SmartElementFactory 
} from '@ai-tutor/utils/src/excalidraw/elements/smart-element-factory';
import { 
  SeekOptimizer 
} from '@ai-tutor/utils/src/streaming/seek-optimizer';
import { 
  TimelineEventScheduler 
} from '@ai-tutor/utils/src/streaming/timeline-event-scheduler';

const logger = createComponentLogger('ExcalidrawPlayerProgressive');

// Enhanced Player Configuration
interface EnhancedPlayerConfig {
  // Audio Synchronization
  audioSync: {
    enabled: boolean;
    maxDesyncTolerance: number;
    compensationSpeed: number;
    enableCrossfade: boolean;
  };
  
  // Timeline Features
  timeline: {
    enableAdvancedSeeking: boolean;
    seekOptimization: boolean;
    maxSeekTime: number;
    enableSmartElements: boolean;
  };
  
  // Visual Enhancements
  visual: {
    enableSemanticLayout: boolean;
    adaptiveQuality: boolean;
    smoothTransitions: boolean;
    collisionDetection: boolean;
  };
  
  // Performance
  performance: {
    bufferAheadTime: number;
    maxConcurrentElements: number;
    enablePredictiveLoading: boolean;
    memoryOptimization: boolean;
  };
}

const DEFAULT_ENHANCED_CONFIG: EnhancedPlayerConfig = {
  audioSync: {
    enabled: true,
    maxDesyncTolerance: 100, // 100ms
    compensationSpeed: 0.3,
    enableCrossfade: true,
  },
  timeline: {
    enableAdvancedSeeking: true,
    seekOptimization: true,
    maxSeekTime: 100, // 100ms target
    enableSmartElements: true,
  },
  visual: {
    enableSemanticLayout: true,
    adaptiveQuality: true,
    smoothTransitions: true,
    collisionDetection: true,
  },
  performance: {
    bufferAheadTime: 5000, // 5 seconds
    maxConcurrentElements: 10,
    enablePredictiveLoading: true,
    memoryOptimization: true,
  },
};

export interface ExcalidrawPlayerProgressiveProps {
  /** Timeline chunks to stream */
  chunks?: StreamingTimelineChunk[];
  
  /** Auto-start playback when ready */
  autoPlay?: boolean;
  
  /** Show player controls */
  showControls?: boolean;
  
  /** Show buffer visualization */
  showBufferBar?: boolean;
  
  /** Show loading indicators */
  showLoadingIndicators?: boolean;
  
  /** Progressive streaming configuration */
  streamingConfig?: {
    minStartBuffer?: number;
    targetBuffer?: number;
    autoStart?: boolean;
  };
  
  /** Enhanced player configuration */
  enhancedConfig?: Partial<EnhancedPlayerConfig>;
  
  /** Event handlers */
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onSeek?: (position: number) => void;
  
  /** Use simple audio timeline mode instead of canvas */
  useSimpleAudioMode?: boolean;
  
  /** Direct lesson steps for fallback (when chunks don't have proper structure) */
  lessonSteps?: Array<{
    step_number: number;
    title: string;
    narration: string;
    duration?: number;
  }>;
  onError?: (error: Error) => void;
  onSyncStatusChange?: (status: AudioTimelinePosition) => void;
  onElementsChange?: (elements: any[]) => void;
  
  /** Custom styling */
  className?: string;
  
  /** Player dimensions */
  width?: number;
  height?: number;
}

/**
 * Progressive ExcalidrawPlayer Component
 * Simplified implementation for demo purposes
 */
export const ExcalidrawPlayerProgressive: React.FC<ExcalidrawPlayerProgressiveProps> = ({
  chunks = [],
  autoPlay = false,
  showControls = true,
  showBufferBar = true,
  showLoadingIndicators = true,
  useSimpleAudioMode = false,
  lessonSteps = [],
  streamingConfig = {},
  enhancedConfig = {},
  onPlaybackStart,
  onPlaybackEnd,
  onSeek,
  onError,
  onSyncStatusChange,
  onElementsChange,
  className = '',
  width = 800,
  height = 600,
}) => {
  // Enhanced configuration
  const config = useMemo(() => ({ ...DEFAULT_ENHANCED_CONFIG, ...enhancedConfig }), [enhancedConfig]);
  
  // Core player state
  const [currentElements, setCurrentElements] = useState<any[]>([]);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [bufferedRegions, setBufferedRegions] = useState<Array<{start: number; end: number}>>([]);
  
  // Progressive loading state
  const [isWaitingForData, setIsWaitingForData] = useState(false);
  const [expectedDataPosition, setExpectedDataPosition] = useState(0);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
  
  // Enhanced audio state
  const [currentNarrationText, setCurrentNarrationText] = useState('');
  const [audioQueue, setAudioQueue] = useState<Array<{id: string; text: string; startTime: number; duration: number}>>([]);
  const [audioSyncStatus, setAudioSyncStatus] = useState<AudioTimelinePosition | null>(null);
  const [coordinationMode, setCoordinationMode] = useState<CoordinationMode>('synchronized');
  const [completedAudioSegments, setCompletedAudioSegments] = useState<Set<string>>(new Set());
  
  // Advanced timeline state
  const [seekPerformance, setSeekPerformance] = useState({ averageTime: 0, lastSeekTime: 0 });
  const [elementCache, setElementCache] = useState(new Map<string, any>());
  const [layoutEngine, setLayoutEngine] = useState<TimelineLayoutEngine | null>(null);
  
  // Component references
  const audioSyncRef = useRef<TimelineAudioSync | null>(null);
  const audioProcessorRef = useRef<StreamingAudioProcessor | null>(null);
  const coordinatorRef = useRef<AudioVisualCoordinator | null>(null);
  const seekOptimizerRef = useRef<SeekOptimizer | null>(null);
  const smartElementFactoryRef = useRef<SmartElementFactory | null>(null);
  
  // TTS Settings and capabilities
  const { data: ttsSettings } = useTTSSettings("default");
  const { data: ttsAvailability } = useTTSAvailability();
  const { data: piperVoices } = useTTSVoices();
  
  // Get current voice settings
  const selectedVoice = ttsSettings?.voice;
  const usePiperTTS = ttsSettings?.provider === "piper" && ttsAvailability?.available;
  const useBrowserTTS = ttsSettings?.provider === "browser" && !usePiperTTS;
  
  // Get current voice ID for TTS
  const getCurrentVoiceId = useCallback(() => {
    if (!usePiperTTS) return undefined;
    return selectedVoice && piperVoices?.find((v: any) => v.id === selectedVoice) ? selectedVoice : undefined;
  }, [usePiperTTS, selectedVoice, piperVoices]);
  
  const currentVoiceId = getCurrentVoiceId();
  
  // TTS Audio Hook for current narration
  const ttsAudio = useTTSAudio(currentNarrationText, {
    voice: currentVoiceId,
    autoPlay: false, // We'll control playback manually
    onPlay: () => {
      logger.debug("TTS audio started playing");
      setAudioSyncStatus(prev => prev ? { ...prev, state: 'synced' as const } : null);
    },
    onEnd: () => {
      logger.debug("TTS audio finished playing");
      // Mark current audio segment as completed to prevent repetition
      const currentAudio = audioQueue.find(audio => 
        currentPosition >= audio.startTime && 
        currentPosition < (audio.startTime + audio.duration)
      );
      if (currentAudio) {
        logger.debug(`Marking audio segment as completed: ${currentAudio.id}`);
        setCompletedAudioSegments(prev => new Set([...prev, currentAudio.id]));
      }
    },
    onError: (error) => {
      logger.error("TTS audio error:", error);
      // Don't propagate TTS errors as fatal - continue with visual-only mode
      logger.warn("Continuing in visual-only mode due to audio error");
      setAudioSyncStatus(prev => prev ? { ...prev, state: 'error' as const } : null);
    },
  });
  
  // Streaming TTS Hook for progressive audio generation
  const streamingTTS = useStreamingTTS('', {
    voice: currentVoiceId,
    autoPlay: false,
    onPlay: () => {
      logger.debug("Streaming TTS started playing");
    },
    onEnd: () => {
      logger.debug("Streaming TTS finished playing");
    },
    onError: (error) => {
      logger.error("Streaming TTS error:", error);
      // Don't propagate streaming TTS errors as fatal - continue with visual-only mode
      logger.warn("Continuing in visual-only mode due to streaming audio error");
    },
  });
  
  // Initialize Phase 5 Audio Components
  useEffect(() => {
    if (config.audioSync.enabled) {
      // Initialize Timeline Audio Sync
      const audioSyncConfig: Partial<TimelineAudioSyncConfig> = {
        syncTolerance: config.audioSync.maxDesyncTolerance,
        seekResponseTarget: config.timeline.maxSeekTime,
        predictiveLoading: config.performance.enablePredictiveLoading,
        bufferAheadTime: config.performance.bufferAheadTime,
        maxConcurrentChunks: 5,
        quality: {
          sampleRate: 22050,
          bitDepth: 16,
          highPrecisionTiming: true,
        },
        performance: {
          enableCompression: true,
          memoryCleanupInterval: 30000,
          maxCacheSize: 50 * 1024 * 1024,
        },
        correction: {
          enableDriftCorrection: true,
          driftThreshold: config.audioSync.maxDesyncTolerance,
          maxCorrectionStep: 25,
        },
      };
      
      audioSyncRef.current = new TimelineAudioSync(audioSyncConfig);
      
      // Set up event handlers
      audioSyncRef.current.on('positionSynced', (data: any) => {
        setAudioSyncStatus(data.syncPosition);
        onSyncStatusChange?.(data.syncPosition);
      });
      
      audioSyncRef.current.on('syncError', (error: any) => {
        logger.error('Audio sync error:', error);
        onError?.(new Error(error.message || 'Audio sync error'));
      });
      
      // Initialize Streaming Audio Processor
      const bufferConfig: Partial<AudioBufferConfig> = {
        maxBufferSize: 25 * 1024 * 1024, // 25MB
        minBufferAhead: config.performance.bufferAheadTime,
        optimalBufferAhead: config.performance.bufferAheadTime * 2,
      };
      
      audioProcessorRef.current = new StreamingAudioProcessor(
        bufferConfig,
        {
          syncTolerance: config.audioSync.maxDesyncTolerance,
          seekResponseTarget: config.timeline.maxSeekTime,
          predictiveLoading: config.performance.enablePredictiveLoading,
          bufferAheadTime: config.performance.bufferAheadTime,
          maxConcurrentChunks: 5,
          quality: {
            sampleRate: 22050,
            bitDepth: 16,
            highPrecisionTiming: true,
          },
          performance: {
            enableCompression: true,
            memoryCleanupInterval: 30000,
            maxCacheSize: 50 * 1024 * 1024,
          },
          correction: {
            enableDriftCorrection: true,
            driftThreshold: config.audioSync.maxDesyncTolerance,
            maxCorrectionStep: 25,
          },
        }
      );
      
      // Initialize Audio-Visual Coordinator
      const coordinationConfig: Partial<CoordinationConfig> = {
        defaultMode: coordinationMode,
        audioCompletionTolerance: config.audioSync.maxDesyncTolerance,
        synchronization: {
          enableSyncCorrection: true,
          syncCorrectionThreshold: config.audioSync.maxDesyncTolerance * 0.75,
          maxSyncCorrection: config.audioSync.maxDesyncTolerance * 2,
        },
        scrubbing: {
          enableAudioScrubbing: config.timeline.enableAdvancedSeeking,
          scrubbingResponseTarget: config.timeline.maxSeekTime,
          audioFadeDuration: 150,
        },
      };
      
      coordinatorRef.current = new AudioVisualCoordinator(
        coordinationConfig,
        {
          syncTolerance: config.audioSync.maxDesyncTolerance,
          seekResponseTarget: config.timeline.maxSeekTime,
          predictiveLoading: config.performance.enablePredictiveLoading,
          bufferAheadTime: config.performance.bufferAheadTime,
          maxConcurrentChunks: 5,
          quality: { sampleRate: 22050, bitDepth: 16, highPrecisionTiming: true },
          performance: { enableCompression: true, memoryCleanupInterval: 30000, maxCacheSize: 50 * 1024 * 1024 },
          correction: { enableDriftCorrection: true, driftThreshold: config.audioSync.maxDesyncTolerance, maxCorrectionStep: 25 },
        }
      );
      
      // Initialize Seek Optimizer if enabled
      if (config.timeline.seekOptimization) {
        seekOptimizerRef.current = new SeekOptimizer({
          seekResponseTarget: config.timeline.maxSeekTime,
          enablePredictiveSeek: true,
          cacheKeyframes: true,
          optimizationLevel: 'high',
        } as any);
      }
      
      logger.debug('Phase 5 audio components initialized');
    }
    
    return () => {
      // Cleanup Phase 5 components
      audioSyncRef.current?.shutdown();
      audioProcessorRef.current?.shutdown();
      coordinatorRef.current?.shutdown();
      seekOptimizerRef.current?.shutdown();
    };
  }, [config, coordinationMode, onSyncStatusChange, onError]);
  
  // Initialize with chunks (Enhanced Version)
  useEffect(() => {
    if (chunks.length > 0) {
      // Convert chunks to timeline events for Phase 5 processing
      const timelineEvents: TimelineEvent[] = chunks.flatMap(chunk => 
        chunk.events.map(event => ({
          id: `${chunk.chunkId}_${event.id || 'event'}`,
          timestamp: event.timestamp || chunk.startTimeOffset || 0,
          duration: event.duration || 3000,
          type: 'narration' as const,
          semanticType: chunk.contentType || 'definition',
          content: extractAudioText(event) || 'Audio content',
          layoutHints: [{
            semantic: 'primary' as const,
            positioning: 'center' as const,
            importance: 'high' as const
          }],
          dependencies: [],
          priority: 5,
          tags: ['ai-generated', 'educational'],
          metadata: {
            source: 'llm' as const,
            generatedAt: Date.now(),
            originalPrompt: '',
            topic: '',
            difficulty: 'intermediate'
          }
        }))
      );
      
      // Calculate duration based on timeline events
      const estimatedDuration = timelineEvents.reduce((total, event) => 
        Math.max(total, event.timestamp + event.duration), 0);
      setDuration(estimatedDuration);
      
      // Initialize Phase 5 audio processing
      if (config.audioSync.enabled && audioSyncRef.current && audioProcessorRef.current) {
        audioSyncRef.current.loadAudioEvents(timelineEvents);
        audioProcessorRef.current.processTimelineEvents(timelineEvents);
      }
      
      // Create enhanced audio queue with Phase 5 integration
      const audioItems = timelineEvents.map(event => ({
        id: event.id,
        text: typeof event.content === 'string' ? event.content : 'Audio content',
        startTime: event.timestamp,
        duration: event.duration
      }));
      setAudioQueue(audioItems);
      
      // Reset completed audio segments when new content is loaded
      setCompletedAudioSegments(new Set());
      
      // Create buffered regions based on timeline events
      const regions = chunks.map((chunk, index) => {
        const chunkEvents = timelineEvents.filter(event => event.id.startsWith(chunk.chunkId));
        if (chunkEvents.length === 0) return { start: 0, end: 0 };
        
        const start = Math.min(...chunkEvents.map(e => e.timestamp));
        const end = Math.max(...chunkEvents.map(e => e.timestamp + e.duration));
        return { start, end };
      }).filter(region => region.end > region.start);
      setBufferedRegions(regions);
      
      setIsPlayerReady(true);
      
      logger.debug('Enhanced chunks loaded', { 
        chunkCount: chunks.length, 
        timelineEvents: timelineEvents.length,
        estimatedDuration, 
        audioQueueSize: audioItems.length,
        phase5Enabled: config.audioSync.enabled
      });
    }
  }, [chunks, config, ttsSettings]);
  
  // Helper functions
  const extractAudioText = useCallback((event: any) => {
    if (typeof event.content === 'string' && event.content.trim()) {
      return event.content.trim();
    }
    if (event.content && typeof event.content === 'object') {
      if ('audio' in event.content && event.content.audio && event.content.audio.text) {
        return event.content.audio.text;
      }
      if ('visual' in event.content && event.content.visual && event.content.visual.properties?.text) {
        return event.content.visual.properties.text;
      }
    }
    return null;
  }, []);
  
  const estimateTextDuration = useCallback((text: string): number => {
    // More accurate duration estimation based on TTS settings
    const words = text.split(/\s+/).length;
    const characters = text.length;
    
    // Base speaking rate (words per minute)
    let wordsPerMinute = 150;
    
    // Adjust for TTS speed settings
    if (ttsSettings?.speed) {
      // TTS speed is typically 0.5-2.0 multiplier
      wordsPerMinute = wordsPerMinute * ttsSettings.speed;
    }
    
    // Calculate duration from words
    const wordBasedDuration = (words / wordsPerMinute) * 60 * 1000;
    
    // Also consider character-based estimation for very short or long texts
    const charactersPerSecond = (wordsPerMinute * 5) / 60; // ~5 chars per word
    const charBasedDuration = (characters / charactersPerSecond) * 1000;
    
    // Use the longer of the two estimates, with minimum bounds
    const estimatedDuration = Math.max(wordBasedDuration, charBasedDuration);
    
    // Minimum 1.5 seconds, maximum reasonable bound
    return Math.max(Math.min(estimatedDuration, 30000), 1500);
  }, [ttsSettings?.speed]);
  
  const calculateAudioDuration = useCallback((chunks: StreamingTimelineChunk[]): number => {
    return chunks.reduce((totalDuration, chunk) => {
      const chunkDuration = chunk.events.reduce((sum, event) => {
        const text = extractAudioText(event);
        return text ? sum + estimateTextDuration(text) : sum;
      }, 0);
      return totalDuration + chunkDuration;
    }, 0);
  }, [extractAudioText, estimateTextDuration]);
  
  // Update elements and audio based on current position
  useEffect(() => {
    if (!isPlayerReady) return;
    
    logger.debug('Updating elements for position', { 
      currentPosition, 
      isPlaying, 
      chunksCount: chunks.length,
      audioQueueSize: audioQueue.length
    });
    
    // Note: Current narration text is now handled by the sequential audio effect below
    // to prevent duplicate audio generation and ensure proper timeline progression
    
    // Generate visual elements based on timeline progression
    const allElements: any[] = [];
    let accumulatedTime = 0;
    
    // Track which events should be visible now
    const visibleEventTexts: string[] = [];
    
    for (const chunk of chunks) {
      // Calculate chunk timing based on audio queue
      const chunkAudioItems = audioQueue.filter(audio => audio.id.startsWith(chunk.chunkId));
      const chunkStartTime = chunkAudioItems.length > 0 ? Math.min(...chunkAudioItems.map(a => a.startTime)) : accumulatedTime;
      const chunkEndTime = chunkAudioItems.length > 0 ? Math.max(...chunkAudioItems.map(a => a.startTime + a.duration)) : chunkStartTime + chunk.duration;
      
      // Show content progressively - only show events that have started
      chunk.events.forEach((event, eventIndex) => {
        const eventAudio = audioQueue.find(audio => audio.id === `${chunk.chunkId}-${eventIndex}`);
        const eventStartTime = eventAudio?.startTime || chunkStartTime;
        const eventEndTime = eventAudio ? eventStartTime + eventAudio.duration : eventStartTime + 3000; // 3s default
        
        // Show event if its time has come (with small lookahead for smooth transitions)
        const shouldShowEvent = currentPosition >= eventStartTime - 500; // 500ms lookahead
        
        if (shouldShowEvent) {
          let elementText = extractAudioText(event) || `Event ${eventIndex + 1}`;
          
          // Truncate long text for display
          if (elementText.length > 120) {
            elementText = elementText.substring(0, 120) + '...';
          }
          
          visibleEventTexts.push(elementText);
          
          const elementId = `element-${chunk.chunkId}-${eventIndex}`;
          const elementY = 100 + (allElements.length * 80); // More spacing between elements
          
          // Create properly formatted Excalidraw element
          const element = {
            id: elementId,
            type: 'text' as const,
            x: 50,
            y: elementY,
            width: 700,
            height: 60,
            angle: 0,
            strokeColor: eventAudio && currentPosition >= eventStartTime && currentPosition < eventEndTime ? '#2563eb' : '#374151', // Blue if currently speaking
            backgroundColor: 'transparent',
            fillStyle: 'solid' as const,
            strokeWidth: 1,
            strokeStyle: 'solid' as const,
            roughness: 1,
            opacity: eventAudio && currentPosition >= eventStartTime && currentPosition < eventEndTime ? 100 : 70, // Highlight current
            strokeSharpness: 'sharp' as const,
            seed: Math.floor(Math.random() * 1000000),
            groupIds: [],
            roundness: { type: 'round' as const } as any,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: false,
            text: elementText,
            fontSize: eventAudio && currentPosition >= eventStartTime && currentPosition < eventEndTime ? 20 : 16, // Larger if current
            fontFamily: 1,
            textAlign: 'left' as const,
            verticalAlign: 'top' as const,
            versionNonce: Math.floor(Math.random() * 1000000),
            isDeleted: false,
            customData: null,
          };
          
          allElements.push(element);
        }
      });
      
      accumulatedTime = chunkEndTime;
    }
    
    // Find current audio for logging purposes
    const currentAudioForLogging = audioQueue.find(audio => 
      currentPosition >= audio.startTime && 
      currentPosition < (audio.startTime + audio.duration)
    );
    
    logger.debug('Generated elements', { 
      elementCount: allElements.length, 
      visibleEventCount: visibleEventTexts.length,
      currentAudioId: currentAudioForLogging?.id,
      position: currentPosition
    });
    
    setCurrentElements(allElements);
  }, [currentPosition, isPlayerReady, isPlaying, chunks, audioQueue, currentNarrationText, extractAudioText]);
  
  // Enhanced Excalidraw scene update with Phase 5 integration
  useEffect(() => {
    logger.debug('Enhanced elements changed', { 
      elementCount: currentElements.length,
      phase5Enabled: config.audioSync.enabled,
      hasLayoutEngine: !!layoutEngine
    });
    
    // Trigger element change callback for parent component integration
    onElementsChange?.(currentElements);
  }, [currentElements, config.audioSync.enabled, layoutEngine, onElementsChange]);
  
  // Progressive loading detection - check if we need more data
  useEffect(() => {
    if (!isPlaying || !audioQueue.length) return;
    
    // Check if we're approaching the end of available data
    const currentChunkEndTime = Math.max(...audioQueue.map(a => a.startTime + a.duration));
    const timeToEndOfData = currentChunkEndTime - currentPosition;
    const needsMoreData = timeToEndOfData < 2000; // Need more data if less than 2 seconds remaining
    
    // Check if current position exceeds available data
    const hasDataForPosition = audioQueue.some(audio => 
      currentPosition >= audio.startTime && 
      currentPosition < (audio.startTime + audio.duration)
    );
    
    if (!hasDataForPosition && isPlaying && currentPosition > 0) {
      logger.debug('Waiting for data at position', { currentPosition, currentChunkEndTime });
      setIsWaitingForData(true);
      setExpectedDataPosition(currentPosition);
      setIsPlaying(false);
      setShouldAutoPlay(true);
    } else if (isWaitingForData && hasDataForPosition) {
      logger.debug('Data became available, resuming playback');
      setIsWaitingForData(false);
      if (shouldAutoPlay) {
        setIsPlaying(true);
        setShouldAutoPlay(false);
      }
    }
  }, [currentPosition, audioQueue, isPlaying, isWaitingForData, shouldAutoPlay]);

  // Intelligent timeline progression
  useEffect(() => {
    if (!isPlaying || isWaitingForData) return;
    
    const interval = setInterval(() => {
      setCurrentPosition(prev => {
        // Find current audio segment
        const currentAudio = audioQueue.find(audio => 
          prev >= audio.startTime && 
          prev < (audio.startTime + audio.duration)
        );
        
        let increment = 100; // Default 100ms increments
        
        // If we have audio playing, sync with audio progress
        if (currentAudio && usePiperTTS && ttsAudio.status?.isPlaying) {
          // Audio is playing, advance more naturally
          increment = 200; // Slightly faster when audio is active
        } else if (currentAudio && usePiperTTS && ttsAudio.status?.isGenerating) {
          // Audio is loading, slow down timeline
          increment = 50;
        } else if (!currentAudio) {
          // No audio for this segment, advance faster through visual-only content
          increment = 300;
        }
        
        const newPosition = prev + increment;
        
        if (newPosition >= duration) {
          setIsPlaying(false);
          onPlaybackEnd?.();
          return duration;
        }
        
        return newPosition;
      });
    }, 100); // Check every 100ms but vary the increment
    
    return () => clearInterval(interval);
  }, [isPlaying, isWaitingForData, duration, audioQueue, usePiperTTS, ttsAudio.status, onPlaybackEnd]);
  
  // Sequential audio playback - find and play the correct audio segment
  useEffect(() => {
    if (!isPlaying || !usePiperTTS) return;
    
    // Find the current audio segment that should be playing
    const currentAudio = audioQueue.find(audio => 
      currentPosition >= audio.startTime && 
      currentPosition < (audio.startTime + audio.duration)
    );
    
    if (currentAudio && currentAudio.text !== currentNarrationText) {
      // Check if this audio segment has already been completed
      if (completedAudioSegments.has(currentAudio.id)) {
        logger.debug('Sequential audio: Skipping already completed segment', { 
          audioId: currentAudio.id, 
          position: currentPosition,
          text: currentAudio.text.substring(0, 50) + '...' 
        });
        // Don't retrigger completed audio - just clear current narration
        setCurrentNarrationText('');
        return;
      }
      
      logger.debug('Sequential audio: Moving to next audio segment', { 
        audioId: currentAudio.id, 
        position: currentPosition,
        startTime: currentAudio.startTime,
        text: currentAudio.text.substring(0, 50) + '...' 
      });
      
      // Update narration text - this will trigger TTS generation
      setCurrentNarrationText(currentAudio.text);
      
      // Once TTS is ready, it will auto-play due to the next effect
    } else if (!currentAudio && currentNarrationText) {
      logger.debug('Sequential audio: No audio for current position, stopping');
      setCurrentNarrationText('');
    }
  }, [isPlaying, currentPosition, audioQueue, usePiperTTS, currentNarrationText, completedAudioSegments]);

  // Control TTS playback based on timeline state
  useEffect(() => {
    if (!currentNarrationText || !usePiperTTS) return;
    
    // Wait for TTS audio to be ready before trying to play
    if (isPlaying && ttsAudio.controls.play && ttsAudio.status && !ttsAudio.status.isGenerating && !ttsAudio.status.error) {
      if (!ttsAudio.status.isPlaying) {
        logger.debug('Starting TTS audio playback for current segment', {
          text: currentNarrationText.substring(0, 30) + '...',
          position: currentPosition,
          status: ttsAudio.status
        });
        try {
          ttsAudio.controls.play();
        } catch (error) {
          logger.warn('Failed to start TTS audio playback:', error);
        }
      }
    } else if (!isPlaying && ttsAudio.controls.pause && ttsAudio.status?.isPlaying) {
      logger.debug('Pausing TTS audio playback');
      try {
        ttsAudio.controls.pause();
      } catch (error) {
        logger.warn('Failed to pause TTS audio playback:', error);
      }
    }
  }, [isPlaying, currentNarrationText, currentPosition, usePiperTTS, ttsAudio]);

  // Player control handlers
  const handlePlay = useCallback(async () => {
    logger.debug('Starting playback', { 
      hasNarration: !!currentNarrationText,
      piperEnabled: usePiperTTS,
      hasAudioControls: !!ttsAudio.controls.play,
      audioStatus: ttsAudio.status
    });
    
    // Reset completed audio segments when starting fresh playback
    if (currentPosition === 0) {
      setCompletedAudioSegments(new Set());
    }
    
    setIsPlaying(true);
    onPlaybackStart?.();
    
    // Start audio playback if available, but don't fail if audio doesn't work
    if (currentNarrationText && usePiperTTS && ttsAudio.controls.play) {
      try {
        logger.debug('Attempting to start TTS audio playback');
        await ttsAudio.controls.play();
        logger.debug('TTS audio playback started successfully');
      } catch (error) {
        logger.warn('Audio playback failed, continuing in visual-only mode:', error);
        // Continue with visual playback even if audio fails
      }
    } else {
      logger.debug('No audio available, starting visual-only playback', {
        noNarration: !currentNarrationText,
        piperDisabled: !usePiperTTS,
        noControls: !ttsAudio.controls.play
      });
    }
  }, [onPlaybackStart, currentNarrationText, usePiperTTS, ttsAudio]);
  
  const handlePause = useCallback(() => {
    setIsPlaying(false);
    
    // Pause audio playback if available
    if (ttsAudio.controls.pause) {
      try {
        ttsAudio.controls.pause();
      } catch (error) {
        logger.error('Failed to pause audio playback:', error);
      }
    }
  }, [ttsAudio]);
  
  const handleSeek = useCallback(async (position: number) => {
    setCurrentPosition(position);
    onSeek?.(position);
  }, [onSeek]);
  
  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setCurrentPosition(0);
  }, []);
  
  // Debug function to force content display
  const handleForceDisplay = useCallback(() => {
    logger.debug('Force displaying content', { chunksAvailable: chunks.length });
    if (chunks.length > 0) {
      // Create a simple test element
      const testElements = [{
        id: 'test-element',
        type: 'text' as const,
        x: 100,
        y: 100,
        width: 400,
        height: 50,
        angle: 0,
        strokeColor: '#000000',
        backgroundColor: 'transparent',
        fillStyle: 'solid' as const,
        strokeWidth: 2,
        strokeStyle: 'solid' as const,
        roughness: 1,
        opacity: 100,
        strokeSharpness: 'sharp' as const,
        seed: Math.floor(Math.random() * 1000000),
        groupIds: [],
        roundness: { type: 'round' as const } as any,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        text: `Test Content - Chunks Available: ${chunks.length}`,
        fontSize: 20,
        fontFamily: 1,
        textAlign: 'left' as const,
        verticalAlign: 'top' as const,
        versionNonce: Math.floor(Math.random() * 1000000),
        isDeleted: false,
        customData: null,
      }];
      
      setCurrentElements(testElements);
    }
  }, [chunks]);
  
  // Hide Excalidraw UI elements after mount
  useEffect(() => {
    const hideExcalidrawUI = () => {
      const style = document.createElement('style');
      style.textContent = `
        .excalidraw .App-menu,
        .excalidraw .App-toolbar,
        .excalidraw .App-toolbar-content,
        .excalidraw .layer-ui__wrapper,
        .excalidraw .App-menu_top,
        .excalidraw .App-menu_bottom,
        .excalidraw .App-menu_left,
        .excalidraw .App-menu_right,
        .excalidraw .zen-mode-transition,
        .excalidraw [data-testid="toolbar"],
        .excalidraw [data-testid="main-menu-trigger"],
        .excalidraw .welcome-screen-decor,
        .excalidraw .welcome-screen-menu,
        .excalidraw .App-top-bar,
        .excalidraw .fix-scroll-through-y,
        .excalidraw .floating-toolbar {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
        
        .excalidraw .App {
          position: relative !important;
        }
        
        .excalidraw {
          --ui-pointerEvents: none !important;
        }
      `;
      document.head.appendChild(style);
      
      return () => {
        document.head.removeChild(style);
      };
    };
    
    const cleanup = hideExcalidrawUI();
    return cleanup;
  }, []);

  // Format time for display
  const formatTime = useCallback((timeMs: number): string => {
    const totalSeconds = Math.floor(timeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);
  
  // Enhanced playability check
  const canPlay = useMemo(() => {
    const basicReady = isPlayerReady && chunks.length > 0;
    
    if (!config.audioSync.enabled) {
      return basicReady;
    }
    
    // Phase 5 readiness check
    const phase5Ready = audioSyncRef.current && audioProcessorRef.current && coordinatorRef.current;
    return basicReady && phase5Ready;
  }, [isPlayerReady, chunks.length, config.audioSync.enabled]);
  
  // Performance and status indicators
  const performanceStats = useMemo(() => {
    if (!config.audioSync.enabled) {
      return null;
    }
    
    return {
      audioSync: audioSyncStatus,
      seekPerformance,
      bufferStatus: audioProcessorRef.current?.getBufferStatus(),
      coordinationMode,
    };
  }, [audioSyncStatus, seekPerformance, coordinationMode, config.audioSync.enabled]);
  
  // Simple Audio Mode - create segments from chunks
  const audioSegments = useMemo(() => {
    if (!useSimpleAudioMode) return [];
    
    logger.debug('Creating audio segments from chunks:', { 
      chunksCount: chunks.length,
      chunks: chunks.map(c => ({ 
        id: c.chunkId, 
        contentType: c.contentType,
        eventsCount: c.events?.length || 0,
        events: c.events?.map(e => ({ type: e.event_type, hasContent: !!e.content })) || []
      }))
    });
    
    // First try to extract from events with narration type
    let segments = chunks.flatMap((chunk, chunkIndex) => 
      (chunk.events || [])
        .filter(event => event.event_type === 'narration' && event.content)
        .map((event, eventIndex) => ({
          id: `${chunk.chunkId}-${eventIndex}`,
          text: typeof event.content === 'string' ? event.content : 'Audio content',
          title: `${chunk.contentType || 'Step'} ${chunkIndex + 1} - Part ${eventIndex + 1}`,
          duration: event.duration ? event.duration / 1000 : undefined
        }))
    );
    
    // Fallback 1: If no narration events found, create segments from chunk content directly
    if (segments.length === 0) {
      logger.debug('No narration events found, creating segments from chunk content');
      segments = chunks.map((chunk, chunkIndex) => {
        // Try to extract text from the chunk
        let text = '';
        if (chunk.content) {
          text = typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
        } else if (chunk.events && chunk.events.length > 0) {
          // Use first event with content
          const firstEvent = chunk.events.find(e => e.content);
          text = firstEvent ? (typeof firstEvent.content === 'string' ? firstEvent.content : 'Event content') : 'No content';
        } else {
          text = `Content for ${chunk.contentType || 'step'} ${chunkIndex + 1}`;
        }
        
        return {
          id: chunk.chunkId,
          text,
          title: `${chunk.contentType || 'Step'} ${chunkIndex + 1}`,
          duration: undefined
        };
      }).filter(segment => segment.text.trim().length > 0);
    }
    
    // Fallback 2: If still no segments and we have lesson steps, use those
    if (segments.length === 0 && lessonSteps.length > 0) {
      logger.debug('No segments from chunks, using direct lesson steps');
      segments = lessonSteps
        .filter(step => step.narration && step.narration.trim().length > 0)
        .map(step => ({
          id: `step-${step.step_number}`,
          text: step.narration,
          title: step.title || `Step ${step.step_number}`,
          duration: step.duration
        }));
    }
    
    // Fallback 3: Create test segments for demonstration if no content found
    if (segments.length === 0 && chunks.length === 0) {
      logger.debug('Creating test segments for demonstration');
      segments = [
        {
          id: 'test-1',
          text: 'Hello and welcome to this lesson! Today we will explore an interesting topic together.',
          title: 'Introduction',
          duration: undefined
        },
        {
          id: 'test-2', 
          text: 'Let me explain the key concepts step by step so you can understand them clearly.',
          title: 'Key Concepts',
          duration: undefined
        },
        {
          id: 'test-3',
          text: 'Now let us look at some practical examples to see how this works in real life.',
          title: 'Examples',
          duration: undefined
        }
      ];
    }
    
    logger.debug('Created audio segments:', { 
      segmentsCount: segments.length,
      segments: segments.map(s => ({ id: s.id, title: s.title, textLength: s.text.length }))
    });
    
    return segments;
  }, [chunks, useSimpleAudioMode, lessonSteps]);

  // If using simple audio mode, render the audio timeline instead of canvas
  if (useSimpleAudioMode) {
    return (
      <div className={`${className}`}>
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">Simple Audio Mode</h3>
          <p className="text-sm text-blue-600">
            Canvas is disabled. Testing audio playback with streaming TTS.
          </p>
        </div>
        
        <SimpleAudioTimeline
          segments={audioSegments}
          voice={getCurrentVoiceId()}
          className="w-full"
          onSegmentChange={(index) => {
            logger.debug(`Switched to segment ${index}`);
          }}
          onPlaybackComplete={() => {
            logger.debug('All audio segments completed');
            onPlaybackEnd?.();
          }}
        />
        
        {/* Debug Info */}
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded text-sm">
          <details>
            <summary className="cursor-pointer font-medium text-gray-700">Debug Info</summary>
            <div className="mt-2 space-y-1 text-xs text-gray-600">
              <div>Total Chunks: {chunks.length}</div>
              <div>Audio Segments: {audioSegments.length}</div>
              <div>Lesson Steps: {lessonSteps.length}</div>
              <div>Voice: {getCurrentVoiceId()}</div>
              <div>Segments: {audioSegments.map(s => s.title).join(', ')}</div>
              {audioSegments.length > 0 && (
                <div>First segment text: "{audioSegments[0].text.substring(0, 100)}..."</div>
              )}
            </div>
          </details>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`relative ${className} ${config.visual.smoothTransitions ? 'transition-all duration-300' : ''}`} 
         style={{ width, height }}
         data-enhanced={config.audioSync.enabled}
         data-coordination-mode={coordinationMode}>
      {/* Excalidraw Canvas */}
      <div className="w-full h-full" style={{
        // Hide all Excalidraw UI elements
        ['--excalidraw-ui-display' as any]: 'none',
      }}>
        <Excalidraw
          initialData={{
            elements: currentElements,
            appState: {
              viewBackgroundColor: '#ffffff',
              zenModeEnabled: true,
              gridSize: undefined,
              viewModeEnabled: true,
            },
          }}
          viewModeEnabled={true}
          theme="light"
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
              saveAsImage: false,
              clearCanvas: false,
              changeViewBackgroundColor: false,
              toggleTheme: false,
            },
            tools: {
              image: false,
            },
            welcomeScreen: false,
          }}
        />
      </div>
      
      {/* Enhanced Loading Indicators */}
      {showLoadingIndicators && !isPlayerReady && (
        <div className="absolute top-4 right-4 bg-black/80 px-3 py-2 rounded-lg z-50">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-white text-sm">
              {config.audioSync.enabled ? 'Initializing Enhanced Player...' : 'Loading...'}
            </span>
          </div>
        </div>
      )}
      
      {/* Enhanced Progressive Loading Screen */}
      {isWaitingForData && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
            <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {config.audioSync.enabled ? 'Optimizing Audio-Visual Sync' : 'Loading Next Content'}
            </h3>
            <p className="text-gray-600 mb-4">
              {config.audioSync.enabled 
                ? 'Preparing synchronized educational content with perfect audio-visual timing...'
                : 'Generating more educational content for your lesson...'
              }
            </p>
            <div className="text-sm text-gray-500 space-y-1">
              <div>Position: {(expectedDataPosition / 1000).toFixed(1)}s</div>
              {config.audioSync.enabled && performanceStats?.bufferStatus && (
                <div className="text-xs">
                  Buffer: {performanceStats.bufferStatus.bufferedChunks}/{performanceStats.bufferStatus.totalChunks} chunks
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Player Controls */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent z-50">
          <div className="px-8 py-6">
            <div className="flex flex-col space-y-4 max-w-full mx-auto">
            {/* Buffer Progress Bar */}
            {showBufferBar && (
              <div className="relative w-full h-3 bg-white/20 rounded-full overflow-hidden mx-2">
                {/* Buffered regions */}
                {bufferedRegions.map((region, index) => (
                  <div
                    key={index}
                    className="absolute h-full bg-white/40"
                    style={{
                      left: `${(region.start / duration) * 100}%`,
                      width: `${((region.end - region.start) / duration) * 100}%`
                    }}
                  />
                ))}
                {/* Current position */}
                <div
                  className="absolute h-full bg-white transition-all duration-100"
                  style={{
                    width: `${(currentPosition / duration) * 100}%`
                  }}
                />
                {/* Seek handle */}
                <input
                  type="range"
                  min="0"
                  max={Math.max(duration, 1)} // Prevent division by zero
                  value={currentPosition}
                  onChange={(e) => handleSeek(parseInt(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  style={{ margin: 0, padding: 0, background: 'transparent' }}
                />
              </div>
            )}
            
            {/* Control Buttons and Time Display */}
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center space-x-4">
                {/* Play/Pause Button */}
                <button
                  onClick={isPlaying ? handlePause : handlePlay}
                  disabled={!canPlay}
                  className="flex items-center justify-center w-10 h-10 bg-white/20 hover:bg-white/30 disabled:bg-white/10 disabled:cursor-not-allowed rounded-full transition-colors"
                >
                  {isPlaying ? (
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                
                {/* Stop Button */}
                <button
                  onClick={handleStop}
                  className="flex items-center justify-center w-8 h-8 bg-white/20 hover:bg-white/30 rounded transition-colors"
                >
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                  </svg>
                </button>
                
                {/* Debug Button */}
                <button
                  onClick={handleForceDisplay}
                  className="flex items-center justify-center px-3 py-1 bg-red-500/80 hover:bg-red-600/80 rounded text-xs text-white transition-colors"
                  title="Force display content (debug)"
                >
                  Test
                </button>
                
                {/* Time Display */}
                <div className="text-white text-sm font-mono">
                  {formatTime(currentPosition)} / {formatTime(duration)}
                </div>
              </div>
              
              {/* Enhanced Status Indicator */}
              <div className="flex items-center space-x-3 text-white text-sm">
                <div className="flex items-center space-x-1">
                  <span>Segments:</span>
                  <span className="font-medium">{chunks.length}</span>
                </div>
                
                {config.audioSync.enabled && performanceStats && (
                  <>
                    {/* Audio Sync Status */}
                    {audioSyncStatus && (
                      <div className="flex items-center space-x-1">
                        <div className={`w-2 h-2 rounded-full ${
                          audioSyncStatus.state === 'synced' ? 'bg-green-400' : 
                          audioSyncStatus.confidence > 0.7 ? 'bg-yellow-400' : 'bg-red-400'
                        }`}></div>
                        <span className="text-xs">
                          Sync: {Math.round(Math.abs(audioSyncStatus.syncOffset))}ms
                        </span>
                      </div>
                    )}
                    
                    {/* Seek Performance */}
                    {config.timeline.seekOptimization && seekPerformance.lastSeekTime > 0 && (
                      <div className="flex items-center space-x-1 text-xs">
                        <span>Seek: {Math.round(seekPerformance.lastSeekTime)}ms</span>
                        <div className={`w-2 h-2 rounded-full ${
                          seekPerformance.lastSeekTime <= config.timeline.maxSeekTime ? 'bg-green-400' : 'bg-yellow-400'
                        }`}></div>
                      </div>
                    )}
                  </>
                )}
                
                {isWaitingForData && (
                  <div className="flex items-center space-x-1 text-yellow-300">
                    <div className="w-2 h-2 bg-yellow-300 rounded-full animate-pulse"></div>
                    <span className="text-xs">
                      {config.audioSync.enabled ? 'Buffering...' : 'Loading...'}
                    </span>
                  </div>
                )}
                
                {/* Audio Status Indicator */}
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full ${
                    currentNarrationText && usePiperTTS && ttsAudio.status && !ttsAudio.status.error
                      ? 'bg-green-400' // Audio working
                      : 'bg-gray-400'   // Visual-only mode
                  }`}></div>
                  <span className="text-xs">
                    {currentNarrationText && usePiperTTS && ttsAudio.status && !ttsAudio.status.error 
                      ? 'Audio' 
                      : 'Visual'}
                  </span>
                </div>
                
                {/* Phase 5 Mode Indicator */}
                {config.audioSync.enabled && (
                  <div className="flex items-center space-x-1 text-blue-300">
                    <div className="w-2 h-2 bg-blue-300 rounded-full"></div>
                    <span className="text-xs">Enhanced</span>
                  </div>
                )}
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Enhanced Initial Loading Overlay */}
      {!isPlayerReady && (
        <div className="absolute inset-0 bg-white flex items-center justify-center z-40">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-gray-600 text-sm text-center">
              {config.audioSync.enabled ? (
                <>
                  <div>Initializing Enhanced Player</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Loading advanced audio-visual synchronization...
                  </div>
                </>
              ) : (
                'Preparing content...'
              )}
            </div>
            {config.audioSync.enabled && (
              <div className="flex items-center space-x-2 text-xs text-blue-600">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Phase 5 Enhanced Mode</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExcalidrawPlayerProgressive;