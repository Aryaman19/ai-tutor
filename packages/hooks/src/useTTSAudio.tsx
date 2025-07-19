import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ttsApi, type TTSGenerateRequest, type TTSVoice } from "@ai-tutor/api-client";
import { toast } from "sonner";
import { createServiceLogger } from "@ai-tutor/utils";
import { useTTSSettings } from "./useSettings";

const logger = createServiceLogger('useTTSAudio');

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
  speed?: number;
  volume?: number;
  autoPlay?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

export const useTTSAudio = (text: string, options: TTSAudioOptions = {}) => {
  const [status, setStatus] = useState<TTSAudioStatus>({
    isGenerating: false,
    isPlaying: false,
    isLoading: false,
    error: null,
    progress: 0,
    currentTime: 0,
    duration: 0,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const queryClient = useQueryClient();
  const { data: ttsSettings } = useTTSSettings();

  // Get the voice to use (from options, settings, or default)
  const voice = options.voice || ttsSettings?.voice || undefined;
  
  // Get speed and volume from options or settings
  const speed = options.speed ?? ttsSettings?.speed ?? 1.0;
  const volume = options.volume ?? ttsSettings?.volume ?? 1.0;

  // Generate TTS audio
  const generateMutation = useMutation({
    mutationFn: (request: TTSGenerateRequest) => ttsApi.generateAudio(request),
    onMutate: () => {
      logger.debug("TTS mutation starting");
      setStatus(prev => ({ ...prev, isGenerating: true, error: null }));
    },
    onSuccess: (response) => {
      logger.debug("TTS mutation success:", {
        audioId: response.audio_id,
        audioUrl: response.audio_url,
        cached: response.cached,
        voice: response.voice
      });
      setStatus(prev => ({ ...prev, isGenerating: false }));
      
      // Create and configure audio element
      const audio = ttsApi.createAudioElement(response.audio_id);
      logger.debug("Created audio element:", {
        audioSrc: audio.src,
        audioId: response.audio_id
      });
      audioRef.current = audio;
      setAudioElement(audio); // Update state to trigger re-render
      
      // Apply speed and volume settings
      audio.playbackRate = speed;
      audio.volume = volume;
      
      // Set up event listeners
      audio.addEventListener('loadstart', () => {
        setStatus(prev => ({ ...prev, isLoading: true }));
      });
      
      audio.addEventListener('loadedmetadata', () => {
        setStatus(prev => ({ 
          ...prev, 
          isLoading: false, 
          duration: audio.duration 
        }));
      });
      
      audio.addEventListener('timeupdate', () => {
        setStatus(prev => ({ 
          ...prev, 
          currentTime: audio.currentTime,
          progress: audio.duration ? (audio.currentTime / audio.duration) * 100 : 0
        }));
      });
      
      audio.addEventListener('play', () => {
        setStatus(prev => ({ ...prev, isPlaying: true }));
        options.onPlay?.();
      });
      
      audio.addEventListener('pause', () => {
        setStatus(prev => ({ ...prev, isPlaying: false }));
        options.onPause?.();
      });
      
      audio.addEventListener('ended', () => {
        setStatus(prev => ({ ...prev, isPlaying: false }));
        options.onEnd?.();
      });
      
      audio.addEventListener('error', (e) => {
        const error = new Error(`Audio playback error: ${e.message || 'Unknown error'}`);
        setStatus(prev => ({ 
          ...prev, 
          isPlaying: false, 
          isLoading: false,
          error: error.message 
        }));
        options.onError?.(error);
        logger.error('Audio playback error:', error);
      });
      
      // Auto-play if requested
      if (options.autoPlay) {
        audio.play().catch(error => {
          logger.error('Auto-play failed:', error);
          setStatus(prev => ({ ...prev, error: 'Auto-play failed' }));
        });
      }
    },
    onError: (error: Error) => {
      logger.error('TTS mutation failed:', {
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name
      });
      setStatus(prev => ({ 
        ...prev, 
        isGenerating: false, 
        error: error.message 
      }));
      options.onError?.(error);
      logger.error('TTS generation failed:', error);
      
      // Check if it's a 503 error (service unavailable)
      if (error.message.includes('503') || error.message.includes('service is not available')) {
        toast.error('Piper TTS service is unavailable. Please use browser voice in settings.');
      } else {
        toast.error('Failed to generate speech');
      }
    },
  });

  // Generate audio when text changes
  useEffect(() => {
    logger.debug("useTTSAudio useEffect triggered:", {
      hasText: !!text,
      textLength: text?.length || 0,
      textTrimmed: text?.trim()?.length || 0,
      voice,
      willMutate: !!(text && text.trim())
    });
    
    // Clear previous audio element when text changes
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setAudioElement(null);
    
    if (text && text.trim()) {
      logger.debug("Triggering TTS mutation with:", { text: text.substring(0, 100) + "...", voice });
      generateMutation.mutate({ text, voice });
    } else {
      logger.debug("Skipping TTS mutation - no valid text");
    }
  }, [text, voice]);
  
  // Update audio settings when speed or volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
      audioRef.current.volume = volume;
    }
  }, [speed, volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      setAudioElement(null);
    };
  }, []);

  // Audio controls
  const play = useCallback(async () => {
    if (audioRef.current) {
      try {
        await audioRef.current.play();
      } catch (error) {
        logger.error('Play failed:', error);
        setStatus(prev => ({ ...prev, error: 'Play failed' }));
      }
    }
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
    }
  }, []);

  return {
    status,
    controls: {
      play,
      pause,
      stop,
      seek,
      setVolume,
    },
    regenerate: () => generateMutation.mutate({ text, voice }),
    audioElement: audioElement, // Use state instead of ref for reactivity
  };
};

// Hook for managing TTS voices
export const useTTSVoices = () => {
  return useQuery({
    queryKey: ["tts-voices"],
    queryFn: () => ttsApi.getAvailableVoices(),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
  });
};

// Hook for TTS cache management
export const useTTSCache = () => {
  const queryClient = useQueryClient();

  const statsQuery = useQuery({
    queryKey: ["tts-cache-stats"],
    queryFn: () => ttsApi.getCacheStats(),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  const clearCacheMutation = useMutation({
    mutationFn: () => ttsApi.clearCache(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["tts-cache-stats"] });
      toast.success(`Cache cleared: ${result.deleted_files} files deleted`);
    },
    onError: (error: Error) => {
      logger.error('Failed to clear cache:', error);
      toast.error('Failed to clear TTS cache');
    },
  });

  return {
    stats: statsQuery.data,
    isLoading: statsQuery.isLoading,
    error: statsQuery.error,
    clearCache: clearCacheMutation.mutate,
    isClearing: clearCacheMutation.isPending,
    refetch: statsQuery.refetch,
  };
};

// Hook for batch TTS generation
export const useBatchTTS = () => {
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<any[]>([]);

  const generateBatchMutation = useMutation({
    mutationFn: (request: { texts: string[]; voice?: string }) => 
      ttsApi.generateBatchAudio(request),
    onMutate: (variables) => {
      setProgress({ current: 0, total: variables.texts.length });
      setResults([]);
    },
    onSuccess: (response) => {
      setProgress({ current: response.total, total: response.total });
      setResults(response.results);
      
      if (response.failed > 0) {
        toast.warning(`Batch TTS completed with ${response.failed} failures`);
      } else {
        toast.success(`Batch TTS completed successfully`);
      }
    },
    onError: (error: Error) => {
      logger.error('Batch TTS failed:', error);
      toast.error('Batch TTS generation failed');
    },
  });

  return {
    generateBatch: generateBatchMutation.mutate,
    isGenerating: generateBatchMutation.isPending,
    progress,
    results,
    error: generateBatchMutation.error,
    reset: () => {
      setProgress({ current: 0, total: 0 });
      setResults([]);
    },
  };
};

// Hook for TTS availability monitoring (fast check)
export const useTTSAvailability = () => {
  return useQuery({
    queryKey: ["tts-availability"],
    queryFn: () => ttsApi.checkAvailability(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 2 * 60 * 1000, // Check every 2 minutes
    refetchOnWindowFocus: false,
  });
};

// Hook for TTS health monitoring
export const useTTSHealth = () => {
  return useQuery({
    queryKey: ["tts-health"],
    queryFn: () => ttsApi.checkHealth(),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 60 * 1000, // Check every minute
    refetchOnWindowFocus: false,
  });
};

// Hook for lesson-specific TTS
export const useLessonTTS = (lessonId: string) => {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["lesson-tts-status", lessonId],
    queryFn: () => ttsApi.getLessonTTSStatus(lessonId),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!lessonId,
  });

  const generateMutation = useMutation({
    mutationFn: (voice?: string) => ttsApi.generateLessonTTS(lessonId, voice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson-tts-status", lessonId] });
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      toast.success("Lesson TTS generated successfully");
    },
    onError: (error: Error) => {
      logger.error('Lesson TTS generation failed:', error);
      toast.error('Failed to generate lesson TTS');
    },
  });

  return {
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    error: statusQuery.error,
    generateTTS: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
    refetch: statusQuery.refetch,
  };
};

export default useTTSAudio;