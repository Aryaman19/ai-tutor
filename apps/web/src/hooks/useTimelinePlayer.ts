import { useState, useRef, useCallback, useEffect } from 'react';
import { createComponentLogger } from '@ai-tutor/utils';

const logger = createComponentLogger('useTimelinePlayer');

// Timeline data interfaces
export interface SemanticLayout {
  region: string;
  priority: string;
  spacing: string;
  relative_to?: string;
  relationship?: string;
}

export interface VisualElement {
  id: string;
  type: string;
  text?: string;
  layout: SemanticLayout;
  style?: string;
  color?: string;
  size?: string;
  properties?: Record<string, any>;
}

export interface TimelineEvent {
  time: number;
  action: string;
  element?: VisualElement;
  element_id?: string;
  animation?: Record<string, any>;
}

export interface TimelineSegment {
  start_time: number;
  end_time: number;
  title: string;
  narration: string;
  events: TimelineEvent[];
  audio_id?: string;
  audio_url?: string;
  tts_generated?: boolean;
  tts_error?: string;
}

export interface TimelineLesson {
  id: string;
  topic: string;
  title?: string;
  difficulty_level: string;
  total_duration: number;
  segments: TimelineSegment[];
  visual_library: Record<string, any>;
  generation_status: string;
  generation_progress: number;
}

export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: any;
  seed: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: any;
  updated: number;
  link: string | null;
  locked: boolean;
  index: string;
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
}

export interface TimelinePlayerState {
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  isLoading: boolean;
  currentSegment?: TimelineSegment;
  currentSegmentIndex: number;
  visibleElements: ExcalidrawElement[];
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  hasError: boolean;
  errorMessage?: string;
}

interface UseTimelinePlayerProps {
  lesson?: TimelineLesson;
  autoPlay?: boolean;
  onTimeUpdate?: (time: number) => void;
  onSegmentChange?: (segment: TimelineSegment, index: number) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export const useTimelinePlayer = ({
  lesson,
  autoPlay = false,
  onTimeUpdate,
  onSegmentChange,
  onComplete,
  onError,
}: UseTimelinePlayerProps) => {
  // Core state
  const [state, setState] = useState<TimelinePlayerState>({
    currentTime: 0,
    totalDuration: lesson?.total_duration || 0,
    isPlaying: false,
    isLoading: false,
    currentSegmentIndex: -1,
    visibleElements: [],
    playbackRate: 1,
    volume: 1,
    isMuted: false,
    hasError: false,
  });

  // Refs for internal management
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const excalidrawAPIRef = useRef<any>(null);
  const layoutEngineRef = useRef<any>(null);

  // Initialize when lesson changes
  useEffect(() => {
    if (lesson) {
      setState(prev => ({
        ...prev,
        totalDuration: lesson.total_duration,
        currentTime: 0,
        currentSegmentIndex: -1,
        visibleElements: [],
        hasError: false,
        errorMessage: undefined,
      }));

      // Pre-load audio elements
      preloadAudioElements();
      
      if (autoPlay) {
        play();
      }
    }
  }, [lesson, autoPlay]);

  // Pre-load audio elements for all segments
  const preloadAudioElements = useCallback(() => {
    if (!lesson) return;

    // Clear existing audio elements
    audioElementsRef.current.forEach(audio => {
      audio.pause();
      audio.src = '';
    });
    audioElementsRef.current.clear();

    // Create new audio elements for segments with TTS
    lesson.segments.forEach((segment, index) => {
      if (segment.audio_url && segment.tts_generated) {
        const audio = new Audio(segment.audio_url);
        audio.preload = 'auto';
        audio.volume = state.volume;
        audio.playbackRate = state.playbackRate;
        audio.muted = state.isMuted;

        // Set up event listeners
        audio.addEventListener('loadeddata', () => {
          logger.debug(`Audio loaded for segment ${index}: ${segment.title}`);
        });

        audio.addEventListener('error', (e) => {
          logger.error(`Audio error for segment ${index} (${segment.title}):`, e);
        });

        audio.addEventListener('ended', () => {
          logger.debug(`Audio ended for segment ${index}: ${segment.title}`);
          // Audio will be managed by timeline progression, not audio events
        });

        // Important: Don't auto-progress based on audio ending
        // Timeline controls the progression, audio follows timeline

        audioElementsRef.current.set(`segment_${index}`, audio);
      }
    });
  }, [lesson, state.volume, state.playbackRate, state.isMuted, state.isPlaying, state.totalDuration]);

  // Map timeline element types to Excalidraw types
  const mapElementType = useCallback((elementType: string): string => {
    const typeMapping: Record<string, string> = {
      'title': 'text',
      'subtitle': 'text', 
      'text': 'text',
      'circle': 'ellipse',
      'rectangle': 'rectangle',
      'concept_box': 'rectangle',
      'arrow': 'arrow',
      'diagram': 'text', // Map diagrams to text for now
      'highlight_box': 'rectangle',
      'process_step': 'rectangle',
      'comparison_table': 'rectangle',
      'timeline_marker': 'ellipse',
      'chart': 'rectangle',
      'illustration': 'rectangle'
    };
    
    return typeMapping[elementType] || 'text'; // Fallback to text
  }, []);

  // Get appropriate colors for Excalidraw
  const getElementColors = useCallback((element: VisualElement) => {
    const colorMap: Record<string, { stroke: string; background: string }> = {
      'blue': { stroke: '#1971c2', background: 'transparent' },
      'green': { stroke: '#2f9e44', background: 'transparent' },
      'red': { stroke: '#e03131', background: 'transparent' },
      'orange': { stroke: '#fd7e14', background: 'transparent' },
      'purple': { stroke: '#9c36b5', background: 'transparent' },
      'yellow': { stroke: '#fab005', background: '#fff3cd' }
    };
    
    const colors = colorMap[element.color || 'blue'] || colorMap.blue;
    
    // For highlight boxes and special elements, add background
    if (element.type === 'highlight_box' || element.style === 'highlight_box') {
      colors.background = '#fff3cd';
    }
    
    return colors;
  }, []);

  // Convert visual elements to Excalidraw format
  const convertToExcalidrawElements = useCallback((visualElements: VisualElement[]): ExcalidrawElement[] => {
    if (!layoutEngineRef.current) {
      logger.warn('Layout engine not available');
      return [];
    }

    logger.debug(`Converting ${visualElements.length} visual elements to Excalidraw format`);

    return visualElements.map(element => {
      try {
        // Use semantic layout engine to convert to coordinates
        const elementInfo = {
          id: element.id,
          type: element.type,
          text: element.text,
          size: element.size || 'medium'
        };

        const coordinates = layoutEngineRef.current.convertSemanticToCoordinates(
          element.layout,
          elementInfo
        );

        // Map element type to Excalidraw type
        const excalidrawType = mapElementType(element.type);
        
        // Get appropriate colors
        const colors = getElementColors(element);

        // Adjust dimensions based on element type
        let width = coordinates.width || 100;
        let height = coordinates.height || 50;
        
        // Special handling for different element types
        if (excalidrawType === 'ellipse') {
          // For circles, make width and height equal
          const size = Math.max(width, height);
          width = size;
          height = size;
        } else if (element.type === 'title') {
          // Titles should be wider and taller
          height = Math.max(height, 40);
          if (element.text) {
            width = Math.max(width, element.text.length * 12);
          }
        }

        // Convert to Excalidraw element format
        const excalidrawElement: ExcalidrawElement = {
          id: element.id,
          type: excalidrawType as any,
          x: coordinates.x,
          y: coordinates.y,
          width: width,
          height: height,
          angle: 0,
          strokeColor: colors.stroke,
          backgroundColor: colors.background,
          fillStyle: colors.background === 'transparent' ? 'hachure' : 'solid',
          strokeWidth: element.type === 'title' ? 3 : 2,
          strokeStyle: 'solid',
          roughness: 1,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: excalidrawType === 'rectangle' ? { type: 3 } : null,
          seed: Math.floor(Math.random() * 1000000),
          versionNonce: Math.floor(Math.random() * 1000000),
          isDeleted: false,
          boundElements: null,
          updated: Date.now(),
          link: null,
          locked: false,
          index: element.id,
          text: element.text || '',
          fontSize: element.type === 'title' ? 24 : element.type === 'subtitle' ? 18 : 16,
          fontFamily: 1,
          textAlign: 'center',
          verticalAlign: 'middle',
        };

        logger.debug(`Converted element ${element.id} (${element.type} -> ${excalidrawType}) at (${coordinates.x}, ${coordinates.y})`);
        return excalidrawElement;
        
      } catch (error) {
        logger.error(`Error converting element ${element.id}:`, error);
        
        // Return a fallback element
        return {
          id: element.id,
          type: 'text',
          x: 100,
          y: 100,
          width: 200,
          height: 50,
          angle: 0,
          strokeColor: '#000000',
          backgroundColor: 'transparent',
          fillStyle: 'hachure',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roughness: 1,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: null,
          seed: Math.floor(Math.random() * 1000000),
          versionNonce: Math.floor(Math.random() * 1000000),
          isDeleted: false,
          boundElements: null,
          updated: Date.now(),
          link: null,
          locked: false,
          index: element.id,
          text: element.text || 'Error loading element',
          fontSize: 16,
          fontFamily: 1,
          textAlign: 'center',
          verticalAlign: 'middle',
        } as ExcalidrawElement;
      }
    });
  }, [mapElementType, getElementColors]);

  // Get active visual elements at current time
  const getActiveElementsAtTime = useCallback((time: number): VisualElement[] => {
    if (!lesson) {
      logger.debug('No lesson available for getting active elements');
      return [];
    }

    logger.debug(`Getting active elements at time ${time}s for lesson with ${lesson.segments?.length || 0} segments`);
    const activeElements: Map<string, VisualElement> = new Map();

    // Process all segments up to the current time
    for (const segment of lesson.segments) {
      logger.debug(`Processing segment: ${segment.title} (${segment.start_time}-${segment.end_time}s) with ${segment.events?.length || 0} events`);
      
      if (segment.start_time > time) break;

      // Process events in this segment up to current time
      for (const event of segment.events) {
        if (event.time > time) continue;

        logger.debug(`Processing event at time ${event.time}s: action=${event.action}, element_id=${event.element?.id || event.element_id}`);

        switch (event.action) {
          case 'create':
            if (event.element) {
              activeElements.set(event.element.id, event.element);
              logger.debug(`Created element: ${event.element.id} (${event.element.type})`);
            }
            break;

          case 'update':
            if (event.element_id && activeElements.has(event.element_id) && event.element) {
              activeElements.set(event.element_id, event.element);
              logger.debug(`Updated element: ${event.element_id}`);
            }
            break;

          case 'delete':
          case 'hide':
            if (event.element_id && activeElements.has(event.element_id)) {
              activeElements.delete(event.element_id);
              logger.debug(`Removed element: ${event.element_id}`);
            }
            break;

          case 'show':
            if (event.element) {
              activeElements.set(event.element.id, event.element);
              logger.debug(`Showed element: ${event.element.id}`);
            }
            break;
        }
      }
    }

    const elements = Array.from(activeElements.values());
    logger.debug(`Found ${elements.length} active elements at time ${time}s:`, elements.map(e => `${e.id}(${e.type})`));
    return elements;
  }, [lesson]);

  // Get current segment at time
  const getSegmentAtTime = useCallback((time: number): { segment: TimelineSegment; index: number } | null => {
    if (!lesson) return null;

    for (let i = 0; i < lesson.segments.length; i++) {
      const segment = lesson.segments[i];
      if (segment.start_time <= time && time <= segment.end_time) {
        return { segment, index: i };
      }
    }

    return null;
  }, [lesson]);

  // Update timeline state based on current time
  const updateTimelineState = useCallback((time: number) => {
    logger.debug(`=== Updating timeline state for time ${time}s ===`);
    
    const segmentInfo = getSegmentAtTime(time);
    logger.debug(`Current segment:`, segmentInfo ? `${segmentInfo.segment.title} (index ${segmentInfo.index})` : 'None');
    
    const activeElements = getActiveElementsAtTime(time);
    logger.debug(`Active visual elements: ${activeElements.length}`);
    
    const excalidrawElements = convertToExcalidrawElements(activeElements);
    logger.debug(`Converted to ${excalidrawElements.length} Excalidraw elements`);

    setState(prev => {
      const newState = {
        ...prev,
        currentTime: time,
        currentSegment: segmentInfo?.segment,
        currentSegmentIndex: segmentInfo?.index ?? -1,
        visibleElements: excalidrawElements,
      };

      // Trigger callbacks if segment changed
      if (segmentInfo && prev.currentSegmentIndex !== segmentInfo.index) {
        onSegmentChange?.(segmentInfo.segment, segmentInfo.index);
      }

      return newState;
    });

    // Update Excalidraw canvas
    if (excalidrawAPIRef.current) {
      try {
        // Check if we have the Excalidraw API available
        const excalidrawAPI = excalidrawAPIRef.current;
        
        if (excalidrawAPI && typeof excalidrawAPI.updateScene === 'function') {
          logger.debug(`Updating Excalidraw with ${excalidrawElements.length} elements`);
          
          excalidrawAPI.updateScene({
            elements: excalidrawElements,
            appState: {
              viewBackgroundColor: '#ffffff',
              gridSize: null,
              zenModeEnabled: true,
              viewModeEnabled: true,
            },
          });
        } else {
          // Fallback: Try to access through the div's child component
          const excalidrawDiv = excalidrawAPIRef.current as HTMLDivElement;
          if (excalidrawDiv && excalidrawDiv.querySelector) {
            // Elements will be updated through the Excalidraw component props
            logger.debug('Excalidraw API not available, elements will update through props');
          }
        }
      } catch (error) {
        logger.error('Error updating Excalidraw scene:', error);
      }
    }

    // Trigger time update callback
    onTimeUpdate?.(time);
  }, [getSegmentAtTime, getActiveElementsAtTime, convertToExcalidrawElements, onSegmentChange, onTimeUpdate]);

  // Start time update loop
  const startTimeUpdateLoop = useCallback(() => {
    if (timeUpdateIntervalRef.current) return;

    timeUpdateIntervalRef.current = setInterval(() => {
      if (state.isPlaying) {
        const newTime = Math.min(state.currentTime + 0.1, state.totalDuration);
        
        // Check if we're switching segments
        const currentSegmentInfo = getSegmentAtTime(state.currentTime);
        const newSegmentInfo = getSegmentAtTime(newTime);
        
        // Handle segment transitions
        if (currentSegmentInfo?.index !== newSegmentInfo?.index) {
          // Pause current audio
          if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current = null;
          }
          
          // Start new segment audio if available
          if (newSegmentInfo && newSegmentInfo.segment.tts_generated && newSegmentInfo.segment.audio_url) {
            const audioKey = `segment_${newSegmentInfo.index}`;
            const audio = audioElementsRef.current.get(audioKey);
            if (audio) {
              const segmentOffset = newTime - newSegmentInfo.segment.start_time;
              audio.currentTime = Math.max(0, segmentOffset);
              audio.play().catch(error => {
                logger.error('Audio transition play failed:', error);
              });
              currentAudioRef.current = audio;
              logger.debug(`Transitioned to segment ${newSegmentInfo.index} at ${newTime}s`);
            }
          }
        }
        
        updateTimelineState(newTime);

        if (newTime >= state.totalDuration) {
          pause();
          onComplete?.();
        }
      }
    }, 100); // Update every 100ms for smooth playback
  }, [state.isPlaying, state.currentTime, state.totalDuration, updateTimelineState, onComplete, getSegmentAtTime]);

  // Stop time update loop
  const stopTimeUpdateLoop = useCallback(() => {
    if (timeUpdateIntervalRef.current) {
      clearInterval(timeUpdateIntervalRef.current);
      timeUpdateIntervalRef.current = null;
    }
  }, []);

  // Player controls
  const play = useCallback(() => {
    logger.debug('Play requested');
    
    setState(prev => ({ ...prev, isPlaying: true }));
    
    // Start audio for current segment if available
    const segmentInfo = getSegmentAtTime(state.currentTime);
    if (segmentInfo && segmentInfo.segment.tts_generated && segmentInfo.segment.audio_url) {
      const audioKey = `segment_${segmentInfo.index}`;
      const audio = audioElementsRef.current.get(audioKey);
      if (audio) {
        // Calculate offset within the segment
        const segmentOffset = state.currentTime - segmentInfo.segment.start_time;
        audio.currentTime = Math.max(0, segmentOffset);
        audio.play().catch(error => {
          logger.error('Audio play failed:', error);
        });
        currentAudioRef.current = audio;
        logger.debug(`Started audio for segment ${segmentInfo.index} at offset ${segmentOffset}s`);
      } else {
        logger.debug(`No audio element found for segment ${segmentInfo.index}`);
      }
    } else {
      logger.debug('No audio available for current segment or segment not found');
    }

    startTimeUpdateLoop();
  }, [state.currentTime, getSegmentAtTime, startTimeUpdateLoop]);

  const pause = useCallback(() => {
    logger.debug('Pause requested');
    
    setState(prev => ({ ...prev, isPlaying: false }));
    
    // Pause current audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }

    stopTimeUpdateLoop();
  }, [stopTimeUpdateLoop]);

  const seekTo = useCallback((time: number) => {
    const clampedTime = Math.max(0, Math.min(time, state.totalDuration));
    logger.debug(`Seeking to time: ${clampedTime}`);

    // Pause current audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    // Update timeline state first
    updateTimelineState(clampedTime);

    // If playing, start audio for new segment
    if (state.isPlaying) {
      const segmentInfo = getSegmentAtTime(clampedTime);
      if (segmentInfo && segmentInfo.segment.tts_generated && segmentInfo.segment.audio_url) {
        const audioKey = `segment_${segmentInfo.index}`;
        const audio = audioElementsRef.current.get(audioKey);
        if (audio) {
          const segmentOffset = clampedTime - segmentInfo.segment.start_time;
          audio.currentTime = Math.max(0, segmentOffset);
          audio.play().catch(error => {
            logger.error('Audio seek play failed:', error);
          });
          currentAudioRef.current = audio;
          logger.debug(`Switched to audio for segment ${segmentInfo.index} at offset ${segmentOffset}s`);
        }
      }
    }
  }, [state.totalDuration, state.isPlaying, updateTimelineState, getSegmentAtTime]);

  const setPlaybackRate = useCallback((rate: number) => {
    setState(prev => ({ ...prev, playbackRate: rate }));
    
    // Update all audio elements
    audioElementsRef.current.forEach(audio => {
      audio.playbackRate = rate;
    });
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    setState(prev => ({ ...prev, volume: clampedVolume }));
    
    // Update all audio elements
    audioElementsRef.current.forEach(audio => {
      audio.volume = clampedVolume;
    });
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    setState(prev => ({ ...prev, isMuted: muted }));
    
    // Update all audio elements
    audioElementsRef.current.forEach(audio => {
      audio.muted = muted;
    });
  }, []);

  const reset = useCallback(() => {
    pause();
    seekTo(0);
  }, [pause, seekTo]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimeUpdateLoop();
      audioElementsRef.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioElementsRef.current.clear();
    };
  }, [stopTimeUpdateLoop]);

  return {
    // State
    ...state,
    
    // Computed state
    progressPercentage: state.totalDuration > 0 ? (state.currentTime / state.totalDuration) * 100 : 0,
    canPlay: Boolean(lesson && lesson.segments.length > 0),
    canSeek: Boolean(lesson && lesson.total_duration > 0),
    
    // Controls
    play,
    pause,
    seekTo,
    reset,
    setPlaybackRate,
    setVolume,
    setMuted,
    
    // Refs for external use
    excalidrawAPIRef,
    setLayoutEngine: (engine: any) => {
      layoutEngineRef.current = engine;
    },
    
    // Utilities
    getSegmentAtTime,
    getActiveElementsAtTime,
  };
};