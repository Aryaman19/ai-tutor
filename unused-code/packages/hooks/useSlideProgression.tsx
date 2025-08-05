import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createServiceLogger } from '@ai-tutor/utils';
import { debounce } from '@ai-tutor/utils/src/debounce';

const logger = createServiceLogger('useSlideProgression');

export interface SlideSegment {
  slideNumber: number;
  startTime: number;
  endTime: number;
  text: string;
}

export interface SlideProgressionOptions {
  /** Debounce delay for audio updates in ms */
  debounceDelay?: number;
  /** Enable enhanced logging for debugging */
  enableDebugLogging?: boolean;
}

export interface SlideProgressionState {
  currentSlideIndex: number;
  isPlaying: boolean;
  mode: 'audio' | 'visual-only' | 'idle';
  currentTime: number;
  totalDuration: number;
}

export interface UseSlideProgressionResult {
  state: SlideProgressionState;
  actions: {
    play: () => void;
    pause: () => void;
    reset: () => void;
    seekToSlide: (slideIndex: number) => void;
    seekToTime: (time: number) => void;
  };
  events: {
    onSlideChange: (callback: (slideIndex: number) => void) => () => void;
    onTimeUpdate: (callback: (time: number, slideIndex: number) => void) => () => void;
  };
}

/**
 * Unified slide progression hook that handles both audio-driven and visual-only slide progression
 * Uses debounced audio updates and smart timer-based progression for optimal performance
 */
export const useSlideProgression = (
  slideSegments: SlideSegment[],
  audioElement: HTMLAudioElement | null,
  options: SlideProgressionOptions = {}
): UseSlideProgressionResult => {
  const {
    debounceDelay = 200,
    enableDebugLogging = false
  } = options;

  // State management
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mode, setMode] = useState<'audio' | 'visual-only' | 'idle'>('idle');

  // Refs for callback management and timers
  const slideChangeCallbacks = useRef<((slideIndex: number) => void)[]>([]);
  const timeUpdateCallbacks = useRef<((time: number, slideIndex: number) => void)[]>([]);
  const visualTimerRef = useRef<NodeJS.Timeout | null>(null);
  const virtualTimeRef = useRef(0);
  const virtualTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Determine total duration
  const totalDuration = useMemo(() => {
    if (slideSegments.length === 0) return 0;
    return Math.max(...slideSegments.map(segment => segment.endTime));
  }, [slideSegments]);

  /**
   * Get slide index from time position
   */
  const getCurrentSlideFromTime = useCallback((time: number): number => {
    if (slideSegments.length === 0) return 0;
    
    const slideIndex = slideSegments.findIndex(segment => 
      time >= segment.startTime && time < segment.endTime
    );
    
    // If time is past all slides, return last slide
    if (slideIndex === -1) {
      return time >= totalDuration ? slideSegments.length - 1 : 0;
    }
    
    return slideIndex;
  }, [slideSegments, totalDuration]);

  /**
   * Get time until next slide transition
   */
  const getTimeUntilNextSlide = useCallback((fromTime: number, fromSlideIndex: number): number => {
    if (fromSlideIndex >= slideSegments.length - 1) return 0;
    
    const nextSlide = slideSegments[fromSlideIndex + 1];
    if (!nextSlide) return 0;
    
    const timeUntilNext = nextSlide.startTime - fromTime;
    return Math.max(0, timeUntilNext);
  }, [slideSegments]);

  /**
   * Debounced slide update function for audio mode
   */
  const debouncedSlideUpdate = useMemo(
    () => debounce((time: number) => {
      const expectedSlideIndex = getCurrentSlideFromTime(time);
      
      if (enableDebugLogging) {
        logger.debug('Debounced slide update check', {
          time,
          expectedSlideIndex,
          currentSlideIndex,
          needsUpdate: expectedSlideIndex !== currentSlideIndex
        });
      }
      
      if (expectedSlideIndex !== currentSlideIndex) {
        setCurrentSlideIndex(expectedSlideIndex);
        
        // Notify callbacks
        slideChangeCallbacks.current.forEach(callback => {
          try {
            callback(expectedSlideIndex);
          } catch (error) {
            logger.error('Error in slide change callback:', error);
          }
        });
        
        if (enableDebugLogging) {
          logger.debug('Slide updated via debounced audio', {
            from: currentSlideIndex,
            to: expectedSlideIndex,
            time
          });
        }
      }
    }, debounceDelay),
    [currentSlideIndex, getCurrentSlideFromTime, debounceDelay, enableDebugLogging]
  );

  /**
   * Handle slide change (unified function)
   */
  const handleSlideChange = useCallback((newSlideIndex: number, source: string) => {
    if (newSlideIndex !== currentSlideIndex && newSlideIndex >= 0 && newSlideIndex < slideSegments.length) {
      setCurrentSlideIndex(newSlideIndex);
      
      // Notify callbacks
      slideChangeCallbacks.current.forEach(callback => {
        try {
          callback(newSlideIndex);
        } catch (error) {
          logger.error('Error in slide change callback:', error);
        }
      });
      
      if (enableDebugLogging) {
        logger.debug(`Slide changed from ${source}`, {
          from: currentSlideIndex,
          to: newSlideIndex,
          source
        });
      }
    }
  }, [currentSlideIndex, slideSegments.length, enableDebugLogging]);

  /**
   * Visual-only mode: Create timer for next slide
   */
  const scheduleNextSlide = useCallback(() => {
    if (visualTimerRef.current) {
      clearTimeout(visualTimerRef.current);
    }

    const timeUntilNext = getTimeUntilNextSlide(virtualTimeRef.current, currentSlideIndex);
    
    if (timeUntilNext > 0 && currentSlideIndex < slideSegments.length - 1) {
      if (enableDebugLogging) {
        logger.debug('Scheduling next slide in visual-only mode', {
          currentSlideIndex,
          timeUntilNext: timeUntilNext * 1000,
          virtualTime: virtualTimeRef.current
        });
      }
      
      visualTimerRef.current = setTimeout(() => {
        virtualTimeRef.current = slideSegments[currentSlideIndex + 1]?.startTime || virtualTimeRef.current;
        handleSlideChange(currentSlideIndex + 1, 'visual-timer');
      }, timeUntilNext * 1000);
    }
  }, [currentSlideIndex, slideSegments, getTimeUntilNextSlide, handleSlideChange, enableDebugLogging]);

  /**
   * Virtual time ticker for visual-only mode
   */
  const startVirtualTimer = useCallback(() => {
    if (virtualTimerRef.current) {
      clearInterval(virtualTimerRef.current);
    }

    virtualTimerRef.current = setInterval(() => {
      virtualTimeRef.current += 0.1; // Update every 100ms
      setCurrentTime(virtualTimeRef.current);
      
      // Notify time update callbacks
      timeUpdateCallbacks.current.forEach(callback => {
        try {
          callback(virtualTimeRef.current, currentSlideIndex);
        } catch (error) {
          logger.error('Error in time update callback:', error);
        }
      });
    }, 100);
  }, [currentSlideIndex]);

  /**
   * Stop virtual timer
   */
  const stopVirtualTimer = useCallback(() => {
    if (virtualTimerRef.current) {
      clearInterval(virtualTimerRef.current);
      virtualTimerRef.current = null;
    }
  }, []);

  // Audio mode: Set up audio event listeners
  useEffect(() => {
    if (!audioElement || slideSegments.length === 0) {
      setMode('visual-only');
      return;
    }

    setMode('audio');

    const handleTimeUpdate = () => {
      const currentAudioTime = audioElement.currentTime;
      setCurrentTime(currentAudioTime);
      
      // Use debounced update for performance
      debouncedSlideUpdate(currentAudioTime);
      
      // Notify time update callbacks
      timeUpdateCallbacks.current.forEach(callback => {
        try {
          callback(currentAudioTime, currentSlideIndex);
        } catch (error) {
          logger.error('Error in time update callback:', error);
        }
      });
    };

    const handleAudioEnded = () => {
      setIsPlaying(false);
      setCurrentSlideIndex(slideSegments.length - 1);
    };

    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('ended', handleAudioEnded);

    if (enableDebugLogging) {
      logger.debug('Audio event listeners attached', {
        duration: audioElement.duration,
        segmentsCount: slideSegments.length
      });
    }

    return () => {
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      audioElement.removeEventListener('ended', handleAudioEnded);
    };
  }, [audioElement, slideSegments.length, debouncedSlideUpdate, currentSlideIndex, enableDebugLogging]);

  // Visual-only mode: Handle slide progression with timers
  useEffect(() => {
    if (mode === 'visual-only' && isPlaying && slideSegments.length > 0) {
      scheduleNextSlide();
      startVirtualTimer();
      
      if (enableDebugLogging) {
        logger.debug('Visual-only mode progression started', {
          currentSlideIndex,
          virtualTime: virtualTimeRef.current
        });
      }
    } else {
      if (visualTimerRef.current) {
        clearTimeout(visualTimerRef.current);
      }
      stopVirtualTimer();
    }

    return () => {
      if (visualTimerRef.current) {
        clearTimeout(visualTimerRef.current);
      }
      stopVirtualTimer();
    };
  }, [mode, isPlaying, currentSlideIndex, slideSegments.length, scheduleNextSlide, startVirtualTimer, stopVirtualTimer, enableDebugLogging]);

  // Actions
  const play = useCallback(() => {
    setIsPlaying(true);
    
    if (audioElement) {
      audioElement.play().catch(error => {
        logger.error('Audio play failed:', error);
      });
    } else if (mode === 'visual-only') {
      // Start virtual timer from current slide time
      if (slideSegments[currentSlideIndex]) {
        virtualTimeRef.current = slideSegments[currentSlideIndex].startTime;
      }
    }
    
    if (enableDebugLogging) {
      logger.debug('Playback started', { mode, currentSlideIndex });
    }
  }, [audioElement, mode, currentSlideIndex, slideSegments, enableDebugLogging]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    
    if (audioElement) {
      audioElement.pause();
    }
    
    if (enableDebugLogging) {
      logger.debug('Playback paused', { mode, currentSlideIndex });
    }
  }, [audioElement, mode, currentSlideIndex, enableDebugLogging]);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCurrentSlideIndex(0);
    setCurrentTime(0);
    virtualTimeRef.current = 0;
    
    if (audioElement) {
      audioElement.currentTime = 0;
    }
    
    if (enableDebugLogging) {
      logger.debug('Progression reset');
    }
  }, [audioElement, enableDebugLogging]);

  const seekToSlide = useCallback((slideIndex: number) => {
    if (slideIndex >= 0 && slideIndex < slideSegments.length) {
      const targetSlide = slideSegments[slideIndex];
      
      if (audioElement) {
        audioElement.currentTime = targetSlide.startTime;
      } else {
        virtualTimeRef.current = targetSlide.startTime;
        setCurrentTime(targetSlide.startTime);
      }
      
      handleSlideChange(slideIndex, 'seek-to-slide');
    }
  }, [slideSegments, audioElement, handleSlideChange]);

  const seekToTime = useCallback((time: number) => {
    if (audioElement) {
      audioElement.currentTime = time;
    } else {
      virtualTimeRef.current = time;
      setCurrentTime(time);
      const slideIndex = getCurrentSlideFromTime(time);
      handleSlideChange(slideIndex, 'seek-to-time');
    }
  }, [audioElement, getCurrentSlideFromTime, handleSlideChange]);

  // Event registration
  const onSlideChange = useCallback((callback: (slideIndex: number) => void) => {
    slideChangeCallbacks.current.push(callback);
    
    return () => {
      const index = slideChangeCallbacks.current.indexOf(callback);
      if (index > -1) {
        slideChangeCallbacks.current.splice(index, 1);
      }
    };
  }, []);

  const onTimeUpdate = useCallback((callback: (time: number, slideIndex: number) => void) => {
    timeUpdateCallbacks.current.push(callback);
    
    return () => {
      const index = timeUpdateCallbacks.current.indexOf(callback);
      if (index > -1) {
        timeUpdateCallbacks.current.splice(index, 1);
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (visualTimerRef.current) {
        clearTimeout(visualTimerRef.current);
      }
      if (virtualTimerRef.current) {
        clearInterval(virtualTimerRef.current);
      }
    };
  }, []);

  return {
    state: {
      currentSlideIndex,
      isPlaying,
      mode,
      currentTime,
      totalDuration
    },
    actions: {
      play,
      pause,
      reset,
      seekToSlide,
      seekToTime
    },
    events: {
      onSlideChange,
      onTimeUpdate
    }
  };
};

export default useSlideProgression;