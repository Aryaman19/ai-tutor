/**
 * UnifiedPlayer Component
 * 
 * A new player that uses AudioEngine and LayoutEngine for synchronized playback
 * with instant seeking capabilities and canvas synchronization
 */

import "@excalidraw/excalidraw/index.css";
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import { createComponentLogger } from '@ai-tutor/utils';
import { AudioEngine } from '@ai-tutor/utils/src/audio/unified-audio-engine';
import { LayoutEngine } from '@ai-tutor/utils/src/excalidraw/layout-engine';
import type { UnifiedAudioResult, NarrationSegment } from '@ai-tutor/utils/src/audio/unified-audio-engine';
import type { CanvasState } from '@ai-tutor/utils/src/excalidraw/layout-engine';

const logger = createComponentLogger('UnifiedPlayer');

/**
 * Validate audio URL format (supports both absolute and relative URLs)
 */
const isValidAudioUrl = (url: string): boolean => {
  try {
    // Check if it's an absolute URL
    new URL(url);
    return true;
  } catch {
    // If not absolute, check if it's a valid relative URL pattern
    if (url.startsWith('/')) {
      // Relative URL starting with / - should be a valid path
      const pathPattern = /^\/[a-zA-Z0-9\/_\-\.]+$/;
      return pathPattern.test(url);
    }
    return false;
  }
};

export interface UnifiedPlayerProps {
  /** AudioEngine instance with generated audio */
  audioEngine: AudioEngine | null;
  
  /** LayoutEngine instance with canvas states */
  layoutEngine: LayoutEngine | null;
  
  /** Unified audio result for playback */
  unifiedAudioResult: UnifiedAudioResult | null;
  
  /** Canvas states for timeline rendering */
  canvasStates: CanvasState[];
  
  /** Auto-start playback when ready */
  autoPlay?: boolean;
  
  /** Show player controls */
  showControls?: boolean;
  
  /** Player dimensions */
  width?: number;
  height?: number;
  
  /** Event handlers */
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onSeek?: (position: number) => void;
  onError?: (error: Error) => void;
  
  /** Custom styling */
  className?: string;
}

export const UnifiedPlayer: React.FC<UnifiedPlayerProps> = ({
  audioEngine,
  layoutEngine,
  unifiedAudioResult,
  canvasStates,
  autoPlay = false,
  showControls = true,
  width = 1200,
  height = 700,
  onPlaybackStart,
  onPlaybackEnd,
  onSeek,
  onError,
  className = '',
}) => {
  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [currentElements, setCurrentElements] = useState<any[]>([]);
  const [currentViewBox, setCurrentViewBox] = useState({ x: 0, y: 0, width, height, zoom: 1 });
  
  // Audio state
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);
  
  // Refs
  const animationFrameRef = useRef<number>();
  const lastPositionUpdateRef = useRef<number>(0);
  const audioInitializedRef = useRef<boolean>(false);
  const onPlaybackStartRef = useRef(onPlaybackStart);
  const onPlaybackEndRef = useRef(onPlaybackEnd);
  const onErrorRef = useRef(onError);
  
  // Update callback refs
  useEffect(() => {
    onPlaybackStartRef.current = onPlaybackStart;
    onPlaybackEndRef.current = onPlaybackEnd;
    onErrorRef.current = onError;
  }, [onPlaybackStart, onPlaybackEnd, onError]);
  
  // Initialize audio element when unified audio result is available
  useEffect(() => {
    if (unifiedAudioResult && unifiedAudioResult.isReady && !audioInitializedRef.current) {
      audioInitializedRef.current = true;
      logger.debug('Initializing audio element', {
        audioId: unifiedAudioResult.audioId,
        audioUrl: unifiedAudioResult.audioUrl,
        totalDuration: unifiedAudioResult.totalDuration
      });
      
      // Validate audio URL before creating audio element
      if (!unifiedAudioResult.audioUrl || unifiedAudioResult.audioUrl.trim() === '') {
        const error = new Error('Audio URL is empty or invalid');
        logger.error('Cannot create audio element: invalid URL', {
          audioId: unifiedAudioResult.audioId,
          audioUrl: unifiedAudioResult.audioUrl,
          isReady: unifiedAudioResult.isReady
        });
        onErrorRef.current?.(error);
        audioInitializedRef.current = false; // Reset to allow retry
        return;
      }
      
      // Validate URL format (allow both absolute and relative URLs)
      const isValidUrl = isValidAudioUrl(unifiedAudioResult.audioUrl);
      if (!isValidUrl) {
        const error = new Error(`Invalid audio URL format: ${unifiedAudioResult.audioUrl}`);
        logger.error('Cannot create audio element: malformed URL', {
          audioId: unifiedAudioResult.audioId,
          audioUrl: unifiedAudioResult.audioUrl,
          isAbsolute: unifiedAudioResult.audioUrl.startsWith('http'),
          isRelative: unifiedAudioResult.audioUrl.startsWith('/')
        });
        onErrorRef.current?.(error);
        audioInitializedRef.current = false; // Reset to allow retry
        return;
      }
      
      // Create audio element from URL
      const audio = new Audio(unifiedAudioResult.audioUrl);
      
      // Set audio properties for better compatibility
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      
      // Add additional properties for better error handling
      if (audio.canPlayType) {
        logger.debug('Audio format support check', {
          mp3: audio.canPlayType('audio/mpeg'),
          wav: audio.canPlayType('audio/wav'),
          ogg: audio.canPlayType('audio/ogg')
        });
      }
      
      // Set up event listeners using refs to prevent callback changes from causing re-initialization
      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration * 1000); // Convert to milliseconds
        setIsAudioLoaded(true);
        logger.debug('Audio loaded', { duration: audio.duration });
      });
      
      audio.addEventListener('timeupdate', () => {
        const newPosition = audio.currentTime * 1000; // Convert to milliseconds
        setCurrentPosition(newPosition);
      });
      
      audio.addEventListener('play', () => {
        setIsPlaying(true);
        onPlaybackStartRef.current?.();
      });
      
      audio.addEventListener('pause', () => {
        setIsPlaying(false);
      });
      
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentPosition(0);
        onPlaybackEndRef.current?.();
      });
      
      audio.addEventListener('error', (e) => {
        // Get more detailed error information from the audio element
        const audioElement = e.target as HTMLAudioElement;
        let errorMessage = 'Unknown audio error';
        
        if (audioElement && audioElement.error) {
          const mediaError = audioElement.error;
          switch (mediaError.code) {
            case MediaError.MEDIA_ERR_ABORTED:
              errorMessage = 'Audio loading was aborted';
              break;
            case MediaError.MEDIA_ERR_NETWORK:
              errorMessage = 'Network error while loading audio';
              break;
            case MediaError.MEDIA_ERR_DECODE:
              errorMessage = 'Audio decoding error';
              break;
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
              errorMessage = 'Audio format not supported';
              break;
            default:
              errorMessage = `Media error (code: ${mediaError.code})`;
          }
          
          if (mediaError.message) {
            errorMessage += `: ${mediaError.message}`;
          }
        } else {
          errorMessage = `Audio error event: ${e.type}`;
        }
        
        const error = new Error(`Audio playback error: ${errorMessage}`);
        logger.error('Audio error details', {
          error: errorMessage,
          audioSrc: audioElement.src,
          readyState: audioElement.readyState,
          networkState: audioElement.networkState,
          errorCode: audioElement.error?.code,
          errorMessage: audioElement.error?.message
        });
        onErrorRef.current?.(error);
      });
      
      setAudioElement(audio);
      
      // Cleanup on unmount
      return () => {
        logger.debug('Cleaning up audio element');
        audio.pause();
        audio.src = '';
        setAudioElement(null);
        setIsAudioLoaded(false);
        audioInitializedRef.current = false;
      };
    }
  }, [unifiedAudioResult]);
  
  // Player controls
  const handlePlay = useCallback(async () => {
    logger.debug('Play button clicked', { 
      hasAudioElement: !!audioElement, 
      isReady, 
      audioSrc: audioElement?.src,
      audioReadyState: audioElement?.readyState,
      audioDuration: audioElement?.duration
    });
    
    if (!audioElement || !isReady) {
      logger.warn('Cannot play: audio not ready', { hasAudio: !!audioElement, isReady });
      return;
    }
    
    try {
      // Check if audio source is still valid
      if (!audioElement.src || audioElement.src === '') {
        throw new Error('Audio source is empty or invalid');
      }
      
      // Ensure audio is loaded
      if (audioElement.readyState < 2) {
        logger.debug('Audio not loaded yet, loading...', {
          readyState: audioElement.readyState,
          networkState: audioElement.networkState,
          src: audioElement.src
        });
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            audioElement.removeEventListener('canplay', onCanPlay);
            audioElement.removeEventListener('error', onAudioError);
            reject(new Error('Audio loading timeout after 10 seconds'));
          }, 10000);
          
          const onCanPlay = () => {
            clearTimeout(timeout);
            audioElement.removeEventListener('canplay', onCanPlay);
            audioElement.removeEventListener('error', onAudioError);
            resolve(true);
          };
          const onAudioError = (e: any) => {
            clearTimeout(timeout);
            audioElement.removeEventListener('canplay', onCanPlay);
            audioElement.removeEventListener('error', onAudioError);
            const target = e.target as HTMLAudioElement;
            const errorMsg = target?.error ? 
              `Media error ${target.error.code}: ${target.error.message || 'Unknown'}` : 
              'Unknown audio loading error';
            reject(new Error(errorMsg));
          };
          audioElement.addEventListener('canplay', onCanPlay);
          audioElement.addEventListener('error', onAudioError);
          audioElement.load();
        });
      }
      
      await audioElement.play();
      logger.debug('Playback started successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown play error';
      logger.error('Play failed', { 
        error: errorMessage, 
        audioSrc: audioElement?.src,
        readyState: audioElement?.readyState,
        networkState: audioElement?.networkState
      });
      onErrorRef.current?.(new Error(`Play failed: ${errorMessage}`));
    }
  }, [audioElement, isReady]);
  
  const handlePause = useCallback(() => {
    if (audioElement) {
      audioElement.pause();
      logger.debug('Playback paused');
    }
  }, [audioElement]);
  
  const handleStop = useCallback(() => {
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      setCurrentPosition(0);
      logger.debug('Playback stopped');
    }
  }, [audioElement]);
  
  const handleSeek = useCallback((position: number) => {
    if (!audioElement || !isReady) return;
    
    const timeInSeconds = position / 1000;
    audioElement.currentTime = timeInSeconds;
    setCurrentPosition(position);
    onSeek?.(position);
    
    logger.debug('Seeked to position', { position, timeInSeconds });
  }, [audioElement, isReady, onSeek]);

  // Set ready state when both audio and canvas are available
  useEffect(() => {
    const ready = isAudioLoaded && canvasStates.length > 0 && audioEngine && layoutEngine;
    setIsReady(!!ready);
    
    if (ready) {
      logger.debug('UnifiedPlayer ready', {
        audioLoaded: isAudioLoaded,
        canvasStatesCount: canvasStates.length,
        totalDuration: duration
      });
      
      if (autoPlay && !isPlaying) {
        setTimeout(() => handlePlay(), 500); // Small delay for smooth UX
      }
    }
  }, [isAudioLoaded, canvasStates.length, audioEngine, layoutEngine, duration, autoPlay, isPlaying, handlePlay]);
  
  // Update canvas elements based on current position
  useEffect(() => {
    if (!layoutEngine || canvasStates.length === 0) return;
    
    const currentState = layoutEngine.getStateAtTime(currentPosition);
    
    if (currentState) {
      setCurrentElements(currentState.elements);
      setCurrentViewBox(currentState.viewBox);
      
      // Log only when state changes (not continuously)
      const now = Date.now();
      if (now - lastPositionUpdateRef.current > 1000) { // Log every second
        logger.debug('Canvas state updated', {
          timestamp: currentState.timestamp,
          elementsCount: currentState.elements.length,
          title: currentState.metadata?.title
        });
        lastPositionUpdateRef.current = now;
      }
    }
  }, [currentPosition, layoutEngine, canvasStates]);
  
  // Format time for display
  const formatTime = useCallback((timeMs: number): string => {
    const totalSeconds = Math.floor(timeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);
  
  // Get current segment info
  const currentSegment = useMemo(() => {
    if (!audioEngine) return null;
    return audioEngine.getSegmentAtTime(currentPosition);
  }, [audioEngine, currentPosition]);
  
  // Hide Excalidraw UI and disable interactions
  useEffect(() => {
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
        overflow: hidden !important;
      }
      
      .excalidraw {
        --ui-pointerEvents: none !important;
        pointer-events: none !important;
      }
      
      .excalidraw canvas {
        pointer-events: none !important;
        user-select: none !important;
      }
      
      .excalidraw .excalidraw-wrapper {
        pointer-events: none !important;
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  
  if (!isReady) {
    return (
      <div className={`relative ${className}`} style={{ width, height }}>
        <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Preparing Unified Player</h3>
            <p className="text-gray-600 text-sm">
              Loading audio and canvas synchronization...
            </p>
            <div className="mt-4 space-y-1 text-xs text-gray-500">
              <div>Audio: {isAudioLoaded ? '✅ Ready' : '⏳ Loading'}</div>
              <div>Canvas: {canvasStates.length > 0 ? `✅ ${canvasStates.length} states` : '⏳ Processing'}</div>
              <div>Engines: {audioEngine && layoutEngine ? '✅ Ready' : '⏳ Initializing'}</div>
              {unifiedAudioResult && (
                <div className="mt-2 text-xs text-blue-600">
                  Audio URL: {unifiedAudioResult.audioUrl ? '✅' : '❌'} | ID: {unifiedAudioResult.audioId}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      {/* Excalidraw Canvas */}
      <div className="w-full h-full overflow-hidden" style={{ position: 'relative' }}>
        <Excalidraw
          initialData={{
            elements: currentElements,
            appState: {
              viewBackgroundColor: '#ffffff',
              zenModeEnabled: true,
              gridSize: undefined,
              viewModeEnabled: true,
              zoom: { value: currentViewBox.zoom as any },
              scrollX: -currentViewBox.x,
              scrollY: -currentViewBox.y,
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
          detectScroll={false}
          handleKeyboardGlobally={false}
        />
      </div>
      
      {/* Player Controls */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent z-50 pointer-events-auto">
          <div className="px-6 py-4">
            {/* Progress Bar with Instant Seeking */}
            <div className="mb-4">
              <div className="relative w-full h-2 bg-white/20 rounded-full overflow-hidden">
                {/* Progress */}
                <div
                  className="absolute h-full bg-gradient-to-r from-blue-400 to-purple-400 transition-all duration-100"
                  style={{ width: `${(currentPosition / duration) * 100}%` }}
                />
                
                {/* Seek handle - click anywhere to seek */}
                <input
                  type="range"
                  min="0"
                  max={Math.max(duration, 1)}
                  value={currentPosition}
                  onChange={(e) => handleSeek(parseInt(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer pointer-events-auto"
                  style={{ margin: 0, padding: 0 }}
                />
              </div>
              
              {/* Time display */}
              <div className="flex justify-between text-xs text-white/70 mt-1">
                <span>{formatTime(currentPosition)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
            
            {/* Control buttons and info */}
            <div className="flex items-center gap-4 overflow-hidden">
              {/* Left side - Control buttons */}
              <div className="flex items-center space-x-4 flex-shrink-0">
                {/* Play/Pause */}
                <button
                  onClick={isPlaying ? handlePause : handlePlay}
                  className="flex items-center justify-center w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full transition-colors pointer-events-auto"
                >
                  {isPlaying ? (
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                
                {/* Stop */}
                <button
                  onClick={handleStop}
                  className="flex items-center justify-center w-8 h-8 bg-white/20 hover:bg-white/30 rounded transition-colors pointer-events-auto"
                >
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              
              {/* Center spacer */}
              <div className="flex-1"></div>
              
              {/* Right side - Current segment info */}
              <div className="flex items-center gap-2 text-white text-sm min-w-0 flex-shrink">
                {currentSegment && (
                  <div className="bg-white/20 px-2 py-1 rounded-full whitespace-nowrap">
                    <span className="text-white/80 text-xs">
                      {currentSegment.metadata?.contentType || 'Content'}
                    </span>
                  </div>
                )}
                
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <div className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"></div>
                  <span className="text-white/80 text-xs hidden sm:inline">Instant Seek</span>
                  <span className="text-white/80 text-xs sm:hidden">Ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedPlayer;