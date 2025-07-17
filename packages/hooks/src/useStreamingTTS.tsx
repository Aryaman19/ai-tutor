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
}

export interface StreamingTTSOptions {
  voice?: string;
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
  });

  const audioChunksRef = useRef<AudioChunk[]>([]);
  const currentPlayingIndexRef = useRef<number>(-1);
  const isStreamingRef = useRef<boolean>(false);
  const shouldAutoPlayRef = useRef<boolean>(false);
  const { data: ttsSettings } = useTTSSettings();

  // Get the voice to use (from options, settings, or default)
  const voice = options.voice || ttsSettings?.voice || undefined;
  const maxChunkSize = options.maxChunkSize || 200;

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
          
          // Set up audio element event listeners
          audioElement.addEventListener('canplaythrough', () => {
            const audioChunk = audioChunksRef.current.find(ac => ac.chunk.chunk_id === chunk.chunk_id);
            if (audioChunk) {
              audioChunk.isLoaded = true;
              
              // Try to start playback if we should auto-play and this is the first chunk
              if (shouldAutoPlayRef.current && chunk.index === 0) {
                shouldAutoPlayRef.current = false; // Only auto-play once
                playAudio();
              }
            }
          });

          audioElement.addEventListener('ended', () => {
            // Move to next chunk
            playNextChunk();
          });

          audioElement.addEventListener('error', (e) => {
            logger.error(`Audio error for chunk ${chunk.index}:`, e);
            // Try to continue with next chunk
            playNextChunk();
          });
        }

        // Add chunk to our collection
        const audioChunk: AudioChunk = {
          chunk,
          audioElement,
          isLoaded: !chunk.is_ready, // If not ready, mark as "loaded" to skip
          hasPlayed: false,
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
    if (chunks.length === 0) {
      return;
    }

    // Find the next chunk to play
    let nextIndex = currentPlayingIndexRef.current + 1;
    if (nextIndex >= chunks.length) {
      nextIndex = 0; // Restart from beginning
    }

    const nextChunk = chunks[nextIndex];
    if (!nextChunk || !nextChunk.chunk.is_ready || !nextChunk.audioElement || !nextChunk.isLoaded) {
      // Wait for chunk to be ready
      if (nextChunk && nextChunk.chunk.is_ready && nextChunk.audioElement) {
        // Audio is ready but not loaded yet, wait a bit
        setTimeout(() => playAudio(), 100);
      }
      return;
    }

    currentPlayingIndexRef.current = nextIndex;
    nextChunk.hasPlayed = true;

    setStatus(prev => ({
      ...prev,
      isPlaying: true,
      currentChunk: nextIndex,
      playbackProgress: chunks.length > 0 ? ((nextIndex + 1) / chunks.length) * 100 : 0,
    }));

    nextChunk.audioElement.play().catch(error => {
      logger.error(`Failed to play chunk ${nextIndex}:`, error);
      // Try next chunk
      playNextChunk();
    });

    options.onPlay?.();
  }, [options]);

  // Play next chunk
  const playNextChunk = useCallback(() => {
    const chunks = audioChunksRef.current;
    const nextIndex = currentPlayingIndexRef.current + 1;

    if (nextIndex >= chunks.length) {
      // Reached end of all chunks
      setStatus(prev => ({
        ...prev,
        isPlaying: false,
        currentChunk: chunks.length - 1,
        playbackProgress: 100,
      }));
      options.onEnd?.();
      return;
    }

    // Continue with next chunk
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
    const currentChunk = audioChunksRef.current[currentPlayingIndexRef.current];
    if (currentChunk?.audioElement) {
      currentChunk.audioElement.pause();
      currentChunk.audioElement.currentTime = 0;
    }

    currentPlayingIndexRef.current = -1;
    setStatus(prev => ({
      ...prev,
      isPlaying: false,
      currentChunk: 0,
      playbackProgress: 0,
    }));
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

  // Auto-generate when text changes
  useEffect(() => {
    if (text?.trim()) {
      generateStreamingAudio();
    }
  }, [text, generateStreamingAudio]);

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
      cancel: cancelStreaming,
      regenerate: generateStreamingAudio,
    },
    chunks: audioChunksRef.current.map(ac => ac.chunk),
    isStreaming: isStreamingRef.current,
  };
};

export default useStreamingTTS;