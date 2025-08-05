import { useState, useCallback, useRef, useEffect } from 'react';
import { createServiceLogger } from '@ai-tutor/utils';
import { AudioEngine, type UnifiedAudioResult, type AudioEngineOptions } from '@ai-tutor/utils/src/audio/unified-audio-engine';
import { AudioMerger, type AudioSegment, type MergedAudioResult as AudioMergerResult } from '@ai-tutor/utils/src/audio/audio-merger';
import { ttsApi } from '@ai-tutor/api-client';
import { useTTSSettings } from './useSettings';

const logger = createServiceLogger('useMultiSlideAudio');

export interface SlideAudioData {
  slideNumber: number;
  narration: string;
  estimatedDuration: number;
  actualDuration?: number;
  startTime: number;
  endTime: number;
  audioId?: string;
  audioUrl?: string;
}

export interface MultiSlideAudioStatus {
  isProcessing: boolean;
  isReady: boolean;
  error: string | null;
  progress: string;
  currentPhase: 'idle' | 'generating' | 'merging' | 'ready' | 'error';
  generationProgress: number; // 0-100
}

export interface AudioMergeResult {
  mergedAudioUrl: string;
  totalDuration: number;
  slideSegments: Array<{
    slideNumber: number;
    startTime: number;
    endTime: number;
    text: string;
  }>;
}

export interface UseMultiSlideAudioResult {
  status: MultiSlideAudioStatus;
  slideAudioData: SlideAudioData[];
  mergedAudio: AudioMergeResult | null;
  audioElement: HTMLAudioElement | null;
  currentSlideIndex: number;
  generateMultiSlideAudio: (slides: Array<{ 
    slide_number: number; 
    narration: string; 
    estimated_duration: number; 
  }>, options?: Partial<AudioEngineOptions>) => Promise<void>;
  loadExistingAudio: (audioSegments: Array<{
    slide_number: number;
    text: string;
    start_time: number;
    duration: number;
    end_time: number;
    audio_id?: string;
    audio_url?: string;
  }>) => void;
  loadMergedAudio: (mergedAudioUrl: string, audioSegments: Array<{
    slide_number: number;
    text: string;
    start_time: number;
    duration: number;
    end_time: number;
  }>) => void;
  seekToSlide: (slideIndex: number) => void;
  seekToTime: (time: number) => void;
  getCurrentSlideFromTime: (time: number) => number;
  reset: () => void;
}

/**
 * Hook for generating and managing multi-slide audio with crossfade and seekbar functionality
 * Provides unified audio generation, merging, and playback control for slide presentations
 */
export const useMultiSlideAudio = (): UseMultiSlideAudioResult => {
  const [status, setStatus] = useState<MultiSlideAudioStatus>({
    isProcessing: false,
    isReady: false,
    error: null,
    progress: '',
    currentPhase: 'idle',
    generationProgress: 0
  });
  
  const [slideAudioData, setSlideAudioData] = useState<SlideAudioData[]>([]);
  const [mergedAudio, setMergedAudio] = useState<AudioMergeResult | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const { data: ttsSettings } = useTTSSettings();

  /**
   * Check if any slides have successful audio generation
   */
  const hasAnyValidAudio = useCallback((audioData: SlideAudioData[]): boolean => {
    return audioData.some(slide => slide.audioId && slide.audioUrl);
  }, []);
  
  /**
   * Generate individual audio files for each slide
   */
  const generateIndividualAudios = useCallback(async (
    slides: Array<{ slide_number: number; narration: string; estimated_duration: number }>,
    audioEngine: AudioEngine
  ): Promise<SlideAudioData[]> => {
    logger.debug('Generating individual audio files', { slideCount: slides.length });
    
    const slideAudioResults: SlideAudioData[] = [];
    let currentTime = 0;
    
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      
      setStatus(prev => ({
        ...prev,
        progress: `Generating audio for slide ${i + 1}/${slides.length}`,
        generationProgress: (i / slides.length) * 60 // First 60% for individual generation
      }));
      
      if (!slide.narration || !slide.narration.trim()) {
        logger.warn(`Slide ${slide.slide_number} has no narration, skipping`);
        
        // Still create entry with estimated duration for consistency
        const slideData: SlideAudioData = {
          slideNumber: slide.slide_number,
          narration: '',
          estimatedDuration: slide.estimated_duration,
          actualDuration: slide.estimated_duration,
          startTime: currentTime,
          endTime: currentTime + slide.estimated_duration,
          audioId: undefined,
          audioUrl: undefined
        };
        
        slideAudioResults.push(slideData);
        currentTime += slide.estimated_duration;
        continue;
      }
      
      try {
        logger.debug(`Generating TTS for slide ${slide.slide_number}`, {
          textLength: slide.narration.length,
          textPreview: slide.narration.substring(0, 50) + '...'
        });
        
        let response;
        try {
          response = await ttsApi.generateAudio({
            text: slide.narration.trim(),
            voice: ttsSettings?.voice
          });
        } catch (ttsError: any) {
          // Check if it's a 503 error (service unavailable)
          if (ttsError.response?.status === 503) {
            logger.warn(`Piper TTS unavailable for slide ${slide.slide_number}, skipping audio for this slide`);
            throw new Error(`TTS service unavailable for slide ${slide.slide_number}`);
          } else {
            throw ttsError; // Re-throw non-503 errors
          }
        }
        
        if (!response.audio_url || !response.audio_id) {
          throw new Error(`TTS generation failed for slide ${slide.slide_number}`);
        }
        
        // Get actual duration by estimating from text (TTS service provides this)
        const actualDuration = audioEngine.estimateTextDuration ? 
          audioEngine['estimateTextDuration'](slide.narration.trim()) : 
          slide.estimated_duration * 1000; // Convert to ms if needed
        
        const slideData: SlideAudioData = {
          slideNumber: slide.slide_number,
          narration: slide.narration.trim(),
          estimatedDuration: slide.estimated_duration,
          actualDuration: actualDuration / 1000, // Store in seconds
          startTime: currentTime,
          endTime: currentTime + (actualDuration / 1000),
          audioId: response.audio_id,
          audioUrl: response.audio_url
        };
        
        slideAudioResults.push(slideData);
        currentTime += (actualDuration / 1000);
        
        logger.debug(`Generated audio for slide ${slide.slide_number}`, {
          audioId: response.audio_id,
          actualDuration: actualDuration / 1000,
          estimatedDuration: slide.estimated_duration
        });
        
      } catch (error) {
        logger.error(`Failed to generate audio for slide ${slide.slide_number}:`, error);
        
        // Add failed slide with estimated duration to maintain timing
        const slideData: SlideAudioData = {
          slideNumber: slide.slide_number,
          narration: slide.narration.trim(),
          estimatedDuration: slide.estimated_duration,
          actualDuration: slide.estimated_duration,
          startTime: currentTime,
          endTime: currentTime + slide.estimated_duration,
          audioId: undefined,
          audioUrl: undefined
        };
        
        slideAudioResults.push(slideData);
        currentTime += slide.estimated_duration;
      }
    }
    
    logger.debug('Individual audio generation complete', {
      totalSlides: slideAudioResults.length,
      successfulSlides: slideAudioResults.filter(s => s.audioId).length,
      totalDuration: currentTime
    });
    
    logger.debug('Individual audio generation complete', {
      totalSlides: slideAudioResults.length,
      successfulSlides: slideAudioResults.filter(s => s.audioId).length,
      totalDuration: currentTime,
      hasAnyAudio: hasAnyValidAudio(slideAudioResults)
    });
    
    return slideAudioResults;
  }, [ttsSettings?.voice, hasAnyValidAudio]);
  
  /**
   * Merge individual audio files with crossfade using Web Audio API
   */
  const mergeAudioWithCrossfade = useCallback(async (
    slideAudios: SlideAudioData[],
    crossfadeDuration: number = 1500
  ): Promise<AudioMergeResult> => {
    logger.debug('Starting audio merge with real crossfade', { 
      slideCount: slideAudios.length,
      crossfadeDuration 
    });
    
    setStatus(prev => ({
      ...prev,
      progress: 'Merging audio files with crossfade...',
      generationProgress: 80
    }));
    
    const validAudios = slideAudios.filter(s => s.audioId && s.audioUrl);
    
    if (validAudios.length === 0) {
      logger.warn('No valid audio files to merge, creating visual-only presentation');
      
      // Create a visual-only result with estimated timing
      const visualSegments = slideAudios.map((slide, index) => ({
        slideNumber: slide.slideNumber,
        startTime: slide.startTime,
        endTime: slide.endTime,
        text: slide.narration || 'No narration available'
      }));
      
      const totalDuration = slideAudios.reduce((sum, slide) => 
        Math.max(sum, slide.endTime), 0
      );
      
      return {
        mergedAudioUrl: '', // No audio URL for visual-only mode
        totalDuration,
        slideSegments: visualSegments
      };
    }
    
    if (validAudios.length === 1) {
      // Single audio file, no merging needed
      const singleAudio = validAudios[0];
      return {
        mergedAudioUrl: singleAudio.audioUrl!,
        totalDuration: singleAudio.actualDuration || singleAudio.estimatedDuration,
        slideSegments: [{
          slideNumber: singleAudio.slideNumber,
          startTime: 0,
          endTime: singleAudio.actualDuration || singleAudio.estimatedDuration,
          text: singleAudio.narration
        }]
      };
    }
    
    // Check if Web Audio API is supported
    if (!AudioMerger.isSupported()) {
      logger.warn('Web Audio API not supported, falling back to first audio file');
      const firstAudio = validAudios[0];
      return {
        mergedAudioUrl: firstAudio.audioUrl!,
        totalDuration: firstAudio.actualDuration || firstAudio.estimatedDuration,
        slideSegments: [{
          slideNumber: firstAudio.slideNumber,
          startTime: 0,
          endTime: firstAudio.actualDuration || firstAudio.estimatedDuration,
          text: firstAudio.narration
        }]
      };
    }
    
    try {
      // Create AudioMerger instance
      const audioMerger = new AudioMerger({
        crossfadeDuration: crossfadeDuration / 1000, // Convert ms to seconds
        outputSampleRate: 44100,
        outputFormat: 'wav',
        fadeType: 'exponential'
      });
      
      // Prepare audio segments for merger
      const audioSegments: AudioSegment[] = validAudios.map(audio => ({
        audioUrl: audio.audioUrl!,
        slideNumber: audio.slideNumber,
        text: audio.narration,
        duration: audio.actualDuration || audio.estimatedDuration
      }));
      
      setStatus(prev => ({
        ...prev,
        progress: 'Processing audio with Web Audio API...',
        generationProgress: 85
      }));
      
      // Perform actual audio merging with crossfade
      const mergedResult = await audioMerger.mergeWithCrossfade(audioSegments);
      
      // Update slide timing data based on merged result
      slideAudios.forEach((slideAudio, index) => {
        const segment = mergedResult.segments.find(s => s.slideNumber === slideAudio.slideNumber);
        if (segment) {
          slideAudio.startTime = segment.startTime;
          slideAudio.endTime = segment.endTime;
        }
      });
      
      // Clean up AudioMerger resources
      audioMerger.dispose();
      
      const result: AudioMergeResult = {
        mergedAudioUrl: mergedResult.audioUrl,
        totalDuration: mergedResult.totalDuration,
        slideSegments: mergedResult.segments
      };
      
      logger.debug('Real audio merge with crossfade complete', {
        totalDuration: result.totalDuration,
        segmentCount: result.slideSegments.length,
        audioBlobSize: mergedResult.audioBlob.size
      });
      
      return result;
      
    } catch (error) {
      logger.error('Audio merge failed, falling back to first audio:', error);
      
      // Fallback to first audio file if merge fails
      const firstAudio = validAudios[0];
      return {
        mergedAudioUrl: firstAudio.audioUrl!,
        totalDuration: firstAudio.actualDuration || firstAudio.estimatedDuration,
        slideSegments: [{
          slideNumber: firstAudio.slideNumber,
          startTime: 0,
          endTime: firstAudio.actualDuration || firstAudio.estimatedDuration,
          text: firstAudio.narration
        }]
      };
    }
  }, []);
  
  /**
   * Main function to generate complete multi-slide audio system
   */
  const generateMultiSlideAudio = useCallback(async (
    slides: Array<{ slide_number: number; narration: string; estimated_duration: number }>,
    options: Partial<AudioEngineOptions> = {}
  ) => {
    if (!slides || slides.length === 0) {
      logger.warn('No slides provided for audio generation');
      return;
    }
    
    setStatus({
      isProcessing: true,
      isReady: false,
      error: null,
      progress: 'Initializing audio generation...',
      currentPhase: 'generating',
      generationProgress: 0
    });
    
    try {
      logger.debug('Starting multi-slide audio generation', { 
        slideCount: slides.length,
        options 
      });
      
      // Create AudioEngine with settings
      const engineOptions: AudioEngineOptions = {
        voice: options.voice || ttsSettings?.voice,
        speed: options.speed ?? ttsSettings?.speed ?? 1.0,
        volume: options.volume ?? ttsSettings?.volume ?? 1.0,
        separatorPause: options.separatorPause ?? 500,
        ...options
      };
      
      const engine = new AudioEngine(engineOptions);
      audioEngineRef.current = engine;
      
      // Phase 1: Generate individual audio files
      setStatus(prev => ({ ...prev, progress: 'Generating individual slide audio files...' }));
      const audioData = await generateIndividualAudios(slides, engine);
      setSlideAudioData(audioData);
      
      // Phase 2: Merge with crossfade
      setStatus(prev => ({ 
        ...prev, 
        progress: 'Merging audio files...',
        currentPhase: 'merging',
        generationProgress: 70
      }));
      
      const mergedResult = await mergeAudioWithCrossfade(audioData, options.separatorPause);
      setMergedAudio(mergedResult);
      
      // Phase 3: Create audio element for merged audio playback (if audio exists)
      setStatus(prev => ({ 
        ...prev, 
        progress: 'Preparing audio player...',
        generationProgress: 95
      }));
      
      // Create audio element with merged audio file (if available)
      if (mergedResult.mergedAudioUrl) {
        const audio = new Audio(mergedResult.mergedAudioUrl);
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';
        
        // Add event listeners for time tracking and slide synchronization
        const handleTimeUpdate = () => {
          const currentTime = audio.currentTime;
          const slideIndex = getCurrentSlideFromTime(currentTime);
          setCurrentSlideIndex(slideIndex);
        };
        
        audio.addEventListener('timeupdate', handleTimeUpdate);
        
        // Store cleanup function
        audio.addEventListener('ended', () => {
          setCurrentSlideIndex(audioData.length - 1);
        });
        
        setAudioElement(audio);
        
        logger.debug('Audio element created for merged audio', {
          audioUrl: mergedResult.mergedAudioUrl,
          duration: mergedResult.totalDuration
        });
      } else {
        logger.debug('No audio available, running in visual-only mode');
        setAudioElement(null);
      }
      
      setStatus({
        isProcessing: false,
        isReady: true,
        error: null,
        progress: 'Multi-slide audio ready!',
        currentPhase: 'ready',
        generationProgress: 100
      });
      
      logger.debug('Multi-slide audio generation complete', {
        totalSlides: audioData.length,
        successfulSlides: audioData.filter(s => s.audioId).length,
        totalDuration: mergedResult.totalDuration
      });
      
    } catch (error) {
      logger.error('Multi-slide audio generation failed', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      setStatus({
        isProcessing: false,
        isReady: false,
        error: errorMessage,
        progress: '',
        currentPhase: 'error',
        generationProgress: 0
      });
    }
  }, [ttsSettings, generateIndividualAudios, mergeAudioWithCrossfade]);
  
  /**
   * Seek to a specific slide by setting audio time
   */
  const seekToSlide = useCallback((slideIndex: number) => {
    if (!audioElement || !slideAudioData[slideIndex]) {
      logger.warn('Cannot seek: audio not ready or invalid slide index', { slideIndex });
      return;
    }
    
    const slideData = slideAudioData[slideIndex];
    audioElement.currentTime = slideData.startTime;
    setCurrentSlideIndex(slideIndex);
    
    logger.debug('Seeked to slide', { slideIndex, startTime: slideData.startTime });
  }, [audioElement, slideAudioData]);
  
  /**
   * Seek to specific time in merged audio
   */
  const seekToTime = useCallback((time: number) => {
    if (!audioElement) {
      logger.warn('Cannot seek: audio element not ready');
      return;
    }
    
    audioElement.currentTime = time;
    const slideIndex = getCurrentSlideFromTime(time);
    setCurrentSlideIndex(slideIndex);
    
    logger.debug('Seeked to time', { time, slideIndex });
  }, [audioElement]);
  
  /**
   * Get slide index from current audio time
   */
  const getCurrentSlideFromTime = useCallback((time: number): number => {
    if (!slideAudioData.length) return 0;
    
    const slideIndex = slideAudioData.findIndex(slide => 
      time >= slide.startTime && time < slide.endTime
    );
    
    return slideIndex >= 0 ? slideIndex : slideAudioData.length - 1;
  }, [slideAudioData]);
  
  /**
   * Reset all audio data and state
   */
  /**
   * Load existing audio segments from lesson data (backend-generated)
   */
  const loadExistingAudio = useCallback((audioSegments: Array<{
    slide_number: number;
    text: string;
    start_time: number;
    duration: number;
    end_time: number;
    audio_id?: string;
    audio_url?: string;
  }>) => {
    logger.debug('Loading existing audio segments from lesson data', { segmentCount: audioSegments.length });
    
    // Convert backend audio segments to SlideAudioData format
    const slideAudioData: SlideAudioData[] = audioSegments.map(segment => ({
      slideNumber: segment.slide_number,
      narration: segment.text,
      estimatedDuration: segment.duration,
      actualDuration: segment.duration,
      startTime: segment.start_time,
      endTime: segment.end_time,
      audioId: segment.audio_id,
      audioUrl: segment.audio_url
    }));
    
    setSlideAudioData(slideAudioData);
    
    // Create merged audio result from segments
    const mergedAudioResult: AudioMergeResult = {
      mergedAudioUrl: '', // We don't have a merged URL yet - frontend will use individual files
      totalDuration: Math.max(...audioSegments.map(s => s.end_time)),
      slideSegments: audioSegments.map(segment => ({
        slideNumber: segment.slide_number,
        startTime: segment.start_time,
        endTime: segment.end_time,
        text: segment.text
      }))
    };
    
    setMergedAudio(mergedAudioResult);
    
    // Mark as ready if we have valid audio segments
    const hasValidAudio = audioSegments.some(segment => segment.audio_url);
    setStatus({
      isProcessing: false,
      isReady: true,
      error: null,
      progress: hasValidAudio ? 'Audio loaded from lesson data' : 'Visual-only mode (no audio)',
      currentPhase: 'ready',
      generationProgress: 100
    });
    
    logger.debug('Successfully loaded existing audio segments', {
      totalSlides: slideAudioData.length,
      hasValidAudio,
      totalDuration: mergedAudioResult.totalDuration
    });
  }, []);

  /**
   * Load merged audio from backend with segment timing information
   */
  const loadMergedAudio = useCallback((mergedAudioUrl: string, audioSegments: Array<{
    slide_number: number;
    text: string;
    start_time: number;
    duration: number;
    end_time: number;
  }>) => {
    logger.debug('Loading merged audio from backend', { 
      mergedAudioUrl, 
      segmentCount: audioSegments.length 
    });
    
    // Convert backend audio segments to SlideAudioData format
    const slideAudioData: SlideAudioData[] = audioSegments.map(segment => ({
      slideNumber: segment.slide_number,
      narration: segment.text,
      estimatedDuration: segment.duration,
      actualDuration: segment.duration,
      startTime: segment.start_time,
      endTime: segment.end_time,
      audioId: undefined, // Individual audio IDs not needed for merged audio
      audioUrl: mergedAudioUrl // All segments point to the same merged audio file
    }));
    
    setSlideAudioData(slideAudioData);
    
    // Create merged audio result with the actual merged URL
    const mergedAudioResult: AudioMergeResult = {
      mergedAudioUrl: mergedAudioUrl,
      totalDuration: Math.max(...audioSegments.map(s => s.end_time)),
      slideSegments: audioSegments.map(segment => ({
        slideNumber: segment.slide_number,
        startTime: segment.start_time,
        endTime: segment.end_time,
        text: segment.text
      }))
    };
    
    setMergedAudio(mergedAudioResult);
    
    // Set up audio element for merged audio
    if (audioElement) {
      audioElement.src = mergedAudioUrl;
      audioElement.load();
    }
    
    // Mark as ready
    setStatus({
      isProcessing: false,
      isReady: true,
      error: null,
      progress: 'Merged audio loaded successfully',
      currentPhase: 'ready',
      generationProgress: 100
    });
    
    logger.debug('Successfully loaded merged audio', {
      totalSlides: slideAudioData.length,
      totalDuration: mergedAudioResult.totalDuration,
      mergedUrl: mergedAudioUrl
    });
  }, [audioElement]);

  const reset = useCallback(() => {
    if (audioElement) {
      audioElement.pause();
      audioElement.removeEventListener('timeupdate', () => {});
      setAudioElement(null);
    }
    
    if (audioEngineRef.current) {
      audioEngineRef.current.reset();
    }
    
    setSlideAudioData([]);
    setMergedAudio(null);
    setCurrentSlideIndex(0);
    setStatus({
      isProcessing: false,
      isReady: false,
      error: null,
      progress: '',
      currentPhase: 'idle',
      generationProgress: 0
    });
    
    audioEngineRef.current = null;
    
    logger.debug('Multi-slide audio reset');
  }, [audioElement]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
        audioElement.removeEventListener('timeupdate', () => {});
      }
    };
  }, [audioElement]);
  
  return {
    status,
    slideAudioData,
    mergedAudio,
    audioElement,
    currentSlideIndex,
    generateMultiSlideAudio,
    loadExistingAudio,
    loadMergedAudio,
    seekToSlide,
    seekToTime,
    getCurrentSlideFromTime,
    reset
  };
};

export default useMultiSlideAudio;