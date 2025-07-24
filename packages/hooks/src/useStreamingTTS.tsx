import { useState, useEffect, useRef, useCallback } from "react";
import { ttsApi, type TTSStreamingRequest, type TTSStreamingChunk } from "@ai-tutor/api-client";
import { toast } from "sonner";
import { createServiceLogger } from "@ai-tutor/utils";
import { useTTSSettings } from "./useSettings";

const logger = createServiceLogger('useStreamingTTS');

export interface StreamingTTSStatus {
  isGenerating: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  progress: number;
  totalChunks: number;
  currentChunk: number;
  generatedChunks: number;
  playbackProgress: number;
  hasCompleted: boolean; // Track if playback has completed naturally
  totalPlayAttempts: number; // Track total play attempts for safety
}

export interface StreamingTTSOptions {
  voice?: string;
  speed?: number;
  volume?: number;
  autoPlay?: boolean;
  maxChunkSize?: number;
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  onChunkReady?: (chunk: TTSStreamingChunk) => void;
}

interface AudioChunk {
  chunk: TTSStreamingChunk;
  audioElement: HTMLAudioElement | null;
  isLoaded: boolean;
  hasPlayed: boolean;
  playCount: number; // Track how many times this chunk has been played
  actualDuration?: number; // Measured duration of audio playback
  estimatedDuration?: number; // Estimated duration for timing calculations
}

export const useStreamingTTS = (text: string, options: StreamingTTSOptions = {}) => {
  const [status, setStatus] = useState<StreamingTTSStatus>({
    isGenerating: false,
    isPlaying: false,
    isLoading: false,
    error: null,
    progress: 0,
    totalChunks: 0,
    currentChunk: 0,
    generatedChunks: 0,
    playbackProgress: 0,
    hasCompleted: false,
    totalPlayAttempts: 0,
  });

  const audioChunksRef = useRef<AudioChunk[]>([]);
  const currentPlayingIndexRef = useRef<number>(-1);
  const isStreamingRef = useRef<boolean>(false);
  const shouldAutoPlayRef = useRef<boolean>(false);
  const { data: ttsSettings } = useTTSSettings();

  // Get the voice to use (from options, settings, or default)
  const voice = options.voice || ttsSettings?.voice || undefined;
  const maxChunkSize = options.maxChunkSize || 200;
  
  // Get speed and volume from options or settings
  const speed = options.speed ?? ttsSettings?.speed ?? 1.0;
  const volume = options.volume ?? ttsSettings?.volume ?? 1.0;

  // Reset state when text changes
  useEffect(() => {
    if (text !== audioChunksRef.current[0]?.chunk?.text) {
      audioChunksRef.current = [];
      currentPlayingIndexRef.current = -1;
      isStreamingRef.current = false;
      setStatus(prev => ({
        ...prev,
        isGenerating: false,
        isPlaying: false,
        isLoading: false,
        error: null,
        progress: 0,
        totalChunks: 0,
        currentChunk: 0,
        generatedChunks: 0,
        playbackProgress: 0,
        hasCompleted: false,
        totalPlayAttempts: 0,
      }));
    }
  }, [text]);

  // Generate streaming audio
  const generateStreamingAudio = useCallback(async () => {
    if (!text?.trim()) {
      logger.warn("Empty text provided for streaming TTS generation");
      return;
    }

    if (isStreamingRef.current) {
      logger.info("Streaming already in progress");
      return;
    }

    isStreamingRef.current = true;
    audioChunksRef.current = [];
    currentPlayingIndexRef.current = -1;
    shouldAutoPlayRef.current = options.autoPlay ?? false;

    setStatus(prev => ({
      ...prev,
      isGenerating: true,
      error: null,
      progress: 0,
      totalChunks: 0,
      currentChunk: 0,
      generatedChunks: 0,
      playbackProgress: 0,
    }));

    try {
      const request: TTSStreamingRequest = {
        text,
        voice,
        max_chunk_size: maxChunkSize,
      };

      const streamGenerator = await ttsApi.generateStreamingAudio(request);
      
      for await (const chunk of streamGenerator) {
        if (!isStreamingRef.current) {
          // Streaming was cancelled
          break;
        }

        logger.debug(`Received chunk ${chunk.index}: ${chunk.text.substring(0, 50)}...`);

        // Create audio element for this chunk
        let audioElement: HTMLAudioElement | null = null;
        if (chunk.is_ready && chunk.audio_id) {
          audioElement = ttsApi.createAudioElement(chunk.audio_id);
          
          // Apply speed and volume settings
          audioElement.playbackRate = speed;
          audioElement.volume = volume;
          
          // Set up audio element event listeners
          audioElement.addEventListener('canplaythrough', () => {
            const audioChunk = audioChunksRef.current.find(ac => ac.chunk.chunk_id === chunk.chunk_id);
            if (audioChunk) {
              audioChunk.isLoaded = true;
              logger.debug(`Audio chunk ${chunk.index} is loaded and ready to play`);
              
              // Try to start playback if we should auto-play and this is the first chunk
              if (shouldAutoPlayRef.current && chunk.index === 0) {
                shouldAutoPlayRef.current = false; // Only auto-play once
                playAudio();
              }
            }
          });

          audioElement.addEventListener('loadeddata', () => {
            const audioChunk = audioChunksRef.current.find(ac => ac.chunk.chunk_id === chunk.chunk_id);
            if (audioChunk) {
              audioChunk.isLoaded = true;
              logger.debug(`Audio chunk ${chunk.index} data loaded`);
            }
          });

          audioElement.addEventListener('ended', () => {
            logger.debug(`Audio chunk ${chunk.index} ended`);
            
            const chunks = audioChunksRef.current;
            const currentIndex = currentPlayingIndexRef.current;
            
            // Always stop playback when audio ends naturally - no automatic progression
            // This prevents the repetition issue where short audio tries to fill long timeline
            logger.debug(`Audio chunk ${currentIndex} completed naturally - stopping playback`);
            setStatus(prev => ({
              ...prev,
              isPlaying: false,
              playbackProgress: 100,
              hasCompleted: true,
            }));
            options.onEnd?.();
          });

          audioElement.addEventListener('error', (e) => {
            logger.error(`Audio error for chunk ${chunk.index}:`, e);
            // Stop playback on error instead of trying to continue
            setStatus(prev => ({
              ...prev,
              isPlaying: false,
              error: `Audio playback error: ${e.message || 'Unknown error'}`,
            }));
            options.onError?.(new Error(`Audio playback failed: ${e.message || 'Unknown error'}`));
          });

          // Force load the audio
          audioElement.load();
        }

        // Add chunk to our collection
        const audioChunk: AudioChunk = {
          chunk,
          audioElement,
          isLoaded: false, // Will be set to true by canplaythrough event
          hasPlayed: false,
          playCount: 0, // Initialize play count
          actualDuration: undefined,
          estimatedDuration: undefined,
        };

        audioChunksRef.current.push(audioChunk);
        audioChunksRef.current.sort((a, b) => a.chunk.index - b.chunk.index);

        // Update status
        setStatus(prev => ({
          ...prev,
          totalChunks: Math.max(prev.totalChunks, chunk.index + 1),
          generatedChunks: prev.generatedChunks + 1,
          progress: prev.totalChunks > 0 ? (prev.generatedChunks / prev.totalChunks) * 100 : 0,
        }));

        // Notify about chunk ready
        options.onChunkReady?.(chunk);
      }

      setStatus(prev => ({
        ...prev,
        isGenerating: false,
        progress: 100,
      }));

    } catch (error) {
      logger.error("Streaming TTS generation failed:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      setStatus(prev => ({
        ...prev,
        isGenerating: false,
        error: errorMessage,
      }));

      options.onError?.(error instanceof Error ? error : new Error(errorMessage));
      
      // Show user-friendly error message
      if (errorMessage.includes('503') || errorMessage.includes('service is not available')) {
        toast.error('Piper TTS service is unavailable. Please use browser voice in settings.');
      } else {
        toast.error('Failed to generate streaming speech');
      }
    } finally {
      isStreamingRef.current = false;
    }
  }, [text, voice, maxChunkSize, options]);

  // Play audio from current position
  const playAudio = useCallback(() => {
    const chunks = audioChunksRef.current;
    logger.debug(`playAudio called with ${chunks.length} chunks`);
    
    if (chunks.length === 0) {
      logger.debug("No chunks available to play");
      return;
    }
    
    // Safety check: prevent excessive play attempts
    const maxTotalAttempts = 100; // Prevent runaway loops
    if (status.totalPlayAttempts >= maxTotalAttempts) {
      logger.error(`Maximum play attempts (${maxTotalAttempts}) exceeded - stopping to prevent infinite loop`);
      setStatus(prev => ({
        ...prev,
        error: "Playback stopped due to excessive retry attempts",
        isPlaying: false
      }));
      return;
    }
    
    // Increment play attempt counter
    setStatus(prev => ({
      ...prev,
      totalPlayAttempts: prev.totalPlayAttempts + 1
    }));

    // Find the next chunk to play
    let nextIndex = currentPlayingIndexRef.current + 1;
    if (nextIndex >= chunks.length) {
      // End of playback - don't restart automatically
      logger.debug("Reached end of all chunks - stopping playback");
      setStatus(prev => ({
        ...prev,
        isPlaying: false,
        playbackProgress: 100,
        hasCompleted: true,
      }));
      options.onEnd?.();
      return;
    }

    const nextChunk = chunks[nextIndex];
    logger.debug(`Attempting to play chunk ${nextIndex}:`, {
      exists: !!nextChunk,
      isReady: nextChunk?.chunk.is_ready,
      hasAudioElement: !!nextChunk?.audioElement,
      isLoaded: nextChunk?.isLoaded,
      playCount: nextChunk?.playCount || 0,
      audioSrc: nextChunk?.audioElement?.src
    });

    if (!nextChunk || !nextChunk.chunk.is_ready || !nextChunk.audioElement || !nextChunk.isLoaded) {
      // Wait for chunk to be ready, but with a limit to prevent infinite loops
      const maxRetries = 50; // 5 seconds maximum wait (50 * 100ms)
      const currentRetries = nextChunk?.playCount || 0;
      
      if (currentRetries < maxRetries && nextChunk && nextChunk.chunk.is_ready && nextChunk.audioElement) {
        // Audio is ready but not loaded yet, wait a bit
        logger.debug(`Audio chunk ${nextIndex} is ready but not loaded, waiting... (retry ${currentRetries + 1}/${maxRetries})`);
        if (nextChunk) nextChunk.playCount = currentRetries + 1;
        setTimeout(() => playAudio(), 100);
      } else {
        logger.warn(`Cannot play chunk ${nextIndex} - conditions not met or max retries exceeded`);
        // End playback instead of trying to continue
        setStatus(prev => ({
          ...prev,
          isPlaying: false,
          error: "Audio chunk could not be loaded after maximum retries",
          hasCompleted: true,
        }));
        options.onEnd?.();
      }
      return;
    }

    // Prevent replay - if chunk has already been played, end playback instead of repeating
    if (nextChunk.hasPlayed && (nextChunk.playCount || 0) > 0) {
      logger.debug(`Chunk ${nextIndex} has already been played, ending playback to prevent repetition`);
      setStatus(prev => ({
        ...prev,
        isPlaying: false,
        playbackProgress: 100,
        hasCompleted: true,
      }));
      options.onEnd?.();
      return;
    }

    logger.debug(`Playing chunk ${nextIndex}`);
    currentPlayingIndexRef.current = nextIndex;
    nextChunk.hasPlayed = true;
    nextChunk.playCount = (nextChunk.playCount || 0) + 1;

    setStatus(prev => ({
      ...prev,
      isPlaying: true,
      currentChunk: nextIndex,
      playbackProgress: chunks.length > 0 ? ((nextIndex + 1) / chunks.length) * 100 : 0,
    }));

    // Reset audio to beginning before playing
    nextChunk.audioElement.currentTime = 0;
    
    nextChunk.audioElement.play().catch(error => {
      logger.error(`Failed to play chunk ${nextIndex}:`, error);
      // End playback on play error instead of trying to continue
      setStatus(prev => ({
        ...prev,
        isPlaying: false,
        error: `Failed to play audio: ${error.message || 'Unknown error'}`,
        hasCompleted: true,
      }));
      options.onError?.(error instanceof Error ? error : new Error(`Play failed: ${error}`));
    });

    options.onPlay?.();
  }, [options]);

  // Play next chunk - but only if explicitly called, not automatically
  const playNextChunk = useCallback(() => {
    const chunks = audioChunksRef.current;
    const nextIndex = currentPlayingIndexRef.current + 1;

    if (nextIndex >= chunks.length) {
      // Reached end of all chunks - stop playback completely
      logger.debug("All chunks have finished playing - ending playback");
      setStatus(prev => ({
        ...prev,
        isPlaying: false,
        currentChunk: chunks.length > 0 ? chunks.length - 1 : 0,
        playbackProgress: 100,
        hasCompleted: true,
      }));
      options.onEnd?.();
      return;
    }

    // Continue with next chunk only if manually triggered
    playAudio();
  }, [playAudio, options]);

  // Pause audio
  const pauseAudio = useCallback(() => {
    const currentChunk = audioChunksRef.current[currentPlayingIndexRef.current];
    if (currentChunk?.audioElement) {
      currentChunk.audioElement.pause();
    }

    setStatus(prev => ({
      ...prev,
      isPlaying: false,
    }));

    options.onPause?.();
  }, [options]);

  // Stop audio
  const stopAudio = useCallback(() => {
    const chunks = audioChunksRef.current;
    
    // Stop all audio elements
    chunks.forEach(audioChunk => {
      if (audioChunk.audioElement) {
        audioChunk.audioElement.pause();
        audioChunk.audioElement.currentTime = 0;
      }
    });

    currentPlayingIndexRef.current = -1;
    setStatus(prev => ({
      ...prev,
      isPlaying: false,
      currentChunk: 0,
      playbackProgress: 0,
    }));
  }, []);
  
  // Restart playback from beginning (for manual restart)
  const restartPlayback = useCallback(() => {
    logger.debug("Restarting playback from beginning");
    
    // Stop all current audio
    stopAudio();
    
    // Reset all chunk states
    audioChunksRef.current.forEach(audioChunk => {
      audioChunk.hasPlayed = false;
      audioChunk.playCount = 0;
      if (audioChunk.audioElement) {
        audioChunk.audioElement.currentTime = 0;
      }
    });
    
    // Reset to beginning and clear safety counters
    currentPlayingIndexRef.current = -1;
    setStatus(prev => ({
      ...prev,
      hasCompleted: false,
      totalPlayAttempts: 0,
      error: null,
      playbackProgress: 0,
      currentChunk: 0
    }));
    
    // Start playback
    playAudio();
  }, [stopAudio, playAudio]);
  
  // Get timing accuracy statistics
  const getTimingStats = useCallback(() => {
    const chunks = audioChunksRef.current;
    const chunksWithDuration = chunks.filter(c => c.actualDuration && c.estimatedDuration);
    
    if (chunksWithDuration.length === 0) {
      return {
        averageAccuracy: 0.5,
        totalChunks: chunks.length,
        measuredChunks: 0,
        totalActualDuration: 0,
        totalEstimatedDuration: 0
      };
    }
    
    const accuracies = chunksWithDuration.map(c => 
      Math.min(1.0, c.estimatedDuration! / c.actualDuration!)
    );
    
    const averageAccuracy = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
    const totalActualDuration = chunksWithDuration.reduce((sum, c) => sum + c.actualDuration!, 0);
    const totalEstimatedDuration = chunksWithDuration.reduce((sum, c) => sum + c.estimatedDuration!, 0);
    
    return {
      averageAccuracy,
      totalChunks: chunks.length,
      measuredChunks: chunksWithDuration.length,
      totalActualDuration,
      totalEstimatedDuration,
      timingError: Math.abs(totalEstimatedDuration - totalActualDuration)
    };
  }, []);

  // Cancel streaming
  const cancelStreaming = useCallback(() => {
    isStreamingRef.current = false;
    stopAudio();
    setStatus(prev => ({
      ...prev,
      isGenerating: false,
      isPlaying: false,
      error: null,
    }));
  }, [stopAudio]);

  // Auto-generate when text or voice changes
  useEffect(() => {
    if (text?.trim()) {
      generateStreamingAudio();
    }
  }, [text, voice]); // Depend on text and voice
  
  // Update audio settings for all chunks when speed or volume changes
  useEffect(() => {
    audioChunksRef.current.forEach(audioChunk => {
      if (audioChunk.audioElement) {
        audioChunk.audioElement.playbackRate = speed;
        audioChunk.audioElement.volume = volume;
      }
    });
  }, [speed, volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelStreaming();
      // Clean up audio elements
      audioChunksRef.current.forEach(chunk => {
        if (chunk.audioElement) {
          chunk.audioElement.pause();
          chunk.audioElement.src = '';
        }
      });
      audioChunksRef.current = [];
    };
  }, [cancelStreaming]);

  return {
    status,
    controls: {
      play: playAudio,
      pause: pauseAudio,
      stop: stopAudio,
      restart: restartPlayback,
      cancel: cancelStreaming,
      regenerate: generateStreamingAudio,
    },
    timingStats: getTimingStats(),
    chunks: audioChunksRef.current,
    isStreaming: isStreamingRef.current,
  };
};

export default useStreamingTTS;