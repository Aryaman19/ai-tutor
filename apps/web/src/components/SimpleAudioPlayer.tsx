import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PlayIcon, PauseIcon, VolumeIcon, Volume2Icon, SkipBackIcon, SkipForwardIcon } from 'lucide-react';
import { createComponentLogger } from '@ai-tutor/utils';

const logger = createComponentLogger('SimpleAudioPlayer');

export interface AudioSegment {
  slide_number: number;
  start_time: number;
  end_time: number;
  text: string;
}

export interface SimpleAudioPlayerProps {
  audioUrl: string;
  audioSegments: AudioSegment[];
  onSlideChange?: (slideIndex: number) => void;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onError?: (error: Error) => void;
  autoPlay?: boolean;
  className?: string;
}

export interface SimpleAudioPlayerState {
  isPlaying: boolean;
  isLoading: boolean;
  isReady: boolean;
  currentTime: number;
  duration: number;
  currentSlideIndex: number;
  volume: number;
  isMuted: boolean;
  error: string | null;
}

export const SimpleAudioPlayer: React.FC<SimpleAudioPlayerProps> = ({
  audioUrl,
  audioSegments,
  onSlideChange,
  onPlaybackStart,
  onPlaybackEnd,
  onError,
  autoPlay = false,
  className = ''
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<SimpleAudioPlayerState>({
    isPlaying: false,
    isLoading: true,
    isReady: false,
    currentTime: 0,
    duration: 0,
    currentSlideIndex: 0,
    volume: 1,
    isMuted: false,
    error: null
  });

  // Get current slide based on time
  const getCurrentSlideIndex = useCallback((time: number): number => {
    if (!audioSegments.length) return 0;
    
    const slideIndex = audioSegments.findIndex(segment => 
      time >= segment.start_time && time < segment.end_time
    );
    
    return slideIndex >= 0 ? slideIndex : audioSegments.length - 1;
  }, [audioSegments]);

  // Initialize audio element
  useEffect(() => {
    if (!audioUrl || !audioRef.current) return;

    const audio = audioRef.current;
    
    logger.debug('Initializing simple audio player', { 
      audioUrl, 
      segmentCount: audioSegments.length,
      segments: audioSegments.map(s => ({
        slide: s.slide_number,
        start: s.start_time,
        end: s.end_time,
        text: s.text.substring(0, 50) + '...'
      }))
    });
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    // Set up audio source
    audio.src = audioUrl;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';

    const handleLoadStart = () => {
      logger.debug('Audio load started');
      setState(prev => ({ ...prev, isLoading: true }));
    };

    const handleCanPlay = () => {
      logger.debug('Audio can play');
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        isReady: true,
        duration: audio.duration || 0
      }));
      
      if (autoPlay) {
        audio.play().catch(err => {
          logger.error('Auto-play failed:', err);
          setState(prev => ({ ...prev, error: 'Auto-play failed' }));
        });
      }
    };

    const handleTimeUpdate = () => {
      const currentTime = audio.currentTime;
      const slideIndex = getCurrentSlideIndex(currentTime);
      
      // Debug logging around slide transitions
      const isNearTransition = Math.abs(currentTime - 13.059) < 0.5 || Math.abs(currentTime - 26.617) < 0.5;
      
      if (Math.floor(currentTime) % 2 === 0 || isNearTransition) {
        logger.debug('🎵 Audio time update', { 
          currentTime: currentTime.toFixed(2), 
          slideIndex, 
          totalSegments: audioSegments.length,
          currentSegment: audioSegments[slideIndex],
          audioPaused: audio.paused,
          audioEnded: audio.ended,
          isNearTransition
        });
      }
      
      setState(prev => {
        const newState = { ...prev, currentTime };
        
        // Only update slide index if it changed
        if (slideIndex !== prev.currentSlideIndex) {
          logger.debug('Slide change detected', { 
            from: prev.currentSlideIndex, 
            to: slideIndex, 
            currentTime: currentTime.toFixed(2),
            segment: audioSegments[slideIndex]
          });
          newState.currentSlideIndex = slideIndex;
          
          // Defer the callback to avoid state update during render
          setTimeout(() => onSlideChange?.(slideIndex), 0);
        }
        
        return newState;
      });
    };

    const handlePlay = () => {
      logger.debug('Audio play started');
      setState(prev => ({ ...prev, isPlaying: true }));
      onPlaybackStart?.();
    };

    const handlePause = () => {
      logger.warn('🔴 Audio paused - check if this was expected!', { 
        currentTime: audio.currentTime,
        duration: audio.duration,
        ended: audio.ended,
        paused: audio.paused 
      });
      setState(prev => ({ ...prev, isPlaying: false }));
    };

    const handleEnded = () => {
      logger.debug('✅ Audio ended naturally', { 
        currentTime: audio.currentTime,
        duration: audio.duration 
      });
      setState(prev => ({ 
        ...prev, 
        isPlaying: false,
        currentSlideIndex: audioSegments.length - 1
      }));
      onPlaybackEnd?.();
    };

    const handleError = (e: Event) => {
      const error = new Error(`Audio loading failed: ${(e as any).message || 'Unknown error'}`);
      logger.error('❌ Audio error:', error, {
        currentTime: audio.currentTime,
        duration: audio.duration,
        networkState: audio.networkState,
        readyState: audio.readyState,
        error: audio.error
      });
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        isReady: false, 
        error: error.message 
      }));
      onError?.(error);
    };

    const handleDurationChange = () => {
      setState(prev => ({ ...prev, duration: audio.duration || 0 }));
    };

    const handleVolumeChange = () => {
      setState(prev => ({ 
        ...prev, 
        volume: audio.volume,
        isMuted: audio.muted
      }));
    };

    // Add event listeners
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('volumechange', handleVolumeChange);

    // Load the audio
    audio.load();

    // Cleanup
    return () => {
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [audioUrl, autoPlay, getCurrentSlideIndex, onSlideChange, onPlaybackStart, onPlaybackEnd, onError, audioSegments.length]);

  // Play/pause toggle
  const togglePlayPause = useCallback(async () => {
    if (!audioRef.current || !state.isReady) {
      logger.warn('Cannot play: audio not ready', { 
        audioExists: !!audioRef.current, 
        isReady: state.isReady 
      });
      return;
    }

    try {
      if (state.isPlaying) {
        logger.debug('▶️ Pausing audio manually');
        audioRef.current.pause();
      } else {
        logger.debug('▶️ Starting audio playback', {
          currentTime: audioRef.current.currentTime,
          duration: audioRef.current.duration,
          src: audioRef.current.src
        });
        await audioRef.current.play();
      }
    } catch (error) {
      logger.error('❌ Play/pause error:', error);
      setState(prev => ({ ...prev, error: 'Playback failed' }));
    }
  }, [state.isPlaying, state.isReady]);

  // Seek to specific time
  const seekTo = useCallback((time: number) => {
    if (!audioRef.current || !state.isReady) return;
    
    audioRef.current.currentTime = Math.max(0, Math.min(time, state.duration));
  }, [state.isReady, state.duration]);

  // Seek to specific slide
  const seekToSlide = useCallback((slideIndex: number) => {
    if (!audioSegments[slideIndex]) return;
    
    const segment = audioSegments[slideIndex];
    seekTo(segment.start_time);
  }, [audioSegments, seekTo]);

  // Skip forward/backward
  const skipForward = useCallback(() => {
    seekTo(state.currentTime + 10);
  }, [state.currentTime, seekTo]);

  const skipBackward = useCallback(() => {
    seekTo(state.currentTime - 10);
  }, [state.currentTime, seekTo]);

  // Volume control
  const setVolume = useCallback((volume: number) => {
    if (!audioRef.current) return;
    
    audioRef.current.volume = Math.max(0, Math.min(1, volume));
  }, []);

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    
    audioRef.current.muted = !audioRef.current.muted;
  }, []);

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  return (
    <div className={`flex flex-col space-y-4 ${className}`}>
      {/* Hidden audio element */}
      <audio ref={audioRef} />
      
      {/* Error display */}
      {state.error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="text-sm">Audio Error: {state.error}</p>
        </div>
      )}
      
      {/* Progress bar */}
      <div className="w-full">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
          <span>{formatTime(state.currentTime)}</span>
          <span>{formatTime(state.duration)}</span>
        </div>
        <div 
          className="w-full h-2 bg-gray-200 rounded-full cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickPercent = clickX / rect.width;
            seekTo(clickPercent * state.duration);
          }}
        >
          <div 
            className="h-2 bg-blue-600 rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex items-center justify-center space-x-4">
        {/* Skip backward */}
        <button
          onClick={skipBackward}
          disabled={!state.isReady}
          className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Skip backward 10s"
        >
          <SkipBackIcon className="w-5 h-5" />
        </button>
        
        {/* Play/Pause */}
        <button
          onClick={togglePlayPause}
          disabled={!state.isReady || state.isLoading}
          className="p-3 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title={state.isPlaying ? 'Pause' : 'Play'}
        >
          {state.isLoading ? (
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : state.isPlaying ? (
            <PauseIcon className="w-6 h-6" />
          ) : (
            <PlayIcon className="w-6 h-6" />
          )}
        </button>
        
        {/* Skip forward */}
        <button
          onClick={skipForward}
          disabled={!state.isReady}
          className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Skip forward 10s"
        >
          <SkipForwardIcon className="w-5 h-5" />
        </button>
        
        {/* Volume control */}
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleMute}
            className="p-2 rounded-full hover:bg-gray-100"
            title={state.isMuted ? 'Unmute' : 'Mute'}
          >
            {state.isMuted || state.volume === 0 ? (
              <VolumeIcon className="w-5 h-5" />
            ) : (
              <Volume2Icon className="w-5 h-5" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={state.isMuted ? 0 : state.volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20"
            title="Volume"
          />
        </div>
      </div>
      
      {/* Current slide info */}
      {audioSegments.length > 0 && (
        <div className="text-center text-sm text-gray-600">
          <p>
            Slide {state.currentSlideIndex + 1} of {audioSegments.length}
            {audioSegments[state.currentSlideIndex] && (
              <span className="block mt-1 text-xs text-gray-500">
                {audioSegments[state.currentSlideIndex].text.substring(0, 100)}
                {audioSegments[state.currentSlideIndex].text.length > 100 ? '...' : ''}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
};

export default SimpleAudioPlayer;