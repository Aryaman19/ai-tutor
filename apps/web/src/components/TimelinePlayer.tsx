import "@excalidraw/excalidraw/index.css";
import { useEffect, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { Play, Pause, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { cn } from "@ai-tutor/utils";
import { useTimelinePlayer, type TimelineLesson } from "../hooks/useTimelinePlayer";
import { semanticLayoutEngine } from "../utils/semanticLayout";

// Custom CSS to hide Excalidraw UI elements
const excalidrawHideUIStyles = `
  .excalidraw .App-menu,
  .excalidraw .App-toolbar,
  .excalidraw .ToolIcon,
  .excalidraw .zen-mode-transition,
  .excalidraw .panelColumn,
  .excalidraw .App-menu_top,
  .excalidraw .App-menu_bottom,
  .excalidraw .App-menu_left,
  .excalidraw .App-menu_right,
  .excalidraw .FixedSideContainer,
  .excalidraw .layer-ui__wrapper,
  .excalidraw .island {
    display: none !important;
    visibility: hidden !important;
  }
  
  .excalidraw .excalidraw-canvas,
  .excalidraw .excalidraw__canvas {
    cursor: default !important;
    user-select: none !important;
  }
  
  .excalidraw canvas {
    pointer-events: none !important;
    cursor: default !important;
    user-select: none !important;
  }
`;

interface TimelinePlayerProps {
  lesson?: TimelineLesson;
  autoPlay?: boolean;
  className?: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export const TimelinePlayer = ({
  lesson,
  autoPlay = false,
  className,
  onComplete,
  onError,
}: TimelinePlayerProps) => {
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Debug lesson data
  console.log('TimelinePlayer received lesson:', lesson ? {
    id: lesson.id,
    title: lesson.title,
    segments: lesson.segments?.length || 0,
    totalDuration: lesson.total_duration,
    generationStatus: lesson.generation_status
  } : 'No lesson');

  const {
    // State
    currentTime,
    totalDuration,
    isPlaying,
    isLoading,
    currentSegment,
    currentSegmentIndex,
    visibleElements,
    playbackRate,
    volume,
    isMuted,
    hasError,
    errorMessage,
    progressPercentage,
    canPlay,
    canSeek,

    // Controls
    play,
    pause,
    seekTo,
    reset,
    setPlaybackRate,
    setVolume,
    setMuted,

    // Refs
    excalidrawAPIRef,
    setLayoutEngine,

    // Utilities
    getSegmentAtTime,
  } = useTimelinePlayer({
    lesson,
    autoPlay,
    onTimeUpdate: (time) => {
      // Handle time updates if needed
    },
    onSegmentChange: (segment, index) => {
      console.log(`Segment changed to: ${segment.title} (${index})`);
    },
    onComplete,
    onError,
  });

  // Debug visible elements
  console.log('TimelinePlayer visibleElements:', visibleElements?.length || 0, visibleElements);

  // Initialize layout engine
  useEffect(() => {
    semanticLayoutEngine.updateCanvasSize(canvasSize);
    setLayoutEngine(semanticLayoutEngine);
  }, [canvasSize, setLayoutEngine]);

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      const container = document.querySelector('.timeline-canvas-container');
      if (container) {
        const rect = container.getBoundingClientRect();
        setCanvasSize({
          width: rect.width,
          height: rect.height,
        });
      }
    };

    handleResize(); // Initial size
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle seek bar interaction
  const handleSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canSeek) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * totalDuration;
    seekTo(newTime);
  };

  // Handle playback rate change
  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
  };

  // Skip to next/previous segment
  const skipToNextSegment = () => {
    if (!lesson || currentSegmentIndex >= lesson.segments.length - 1) return;
    const nextSegment = lesson.segments[currentSegmentIndex + 1];
    seekTo(nextSegment.start_time);
  };

  const skipToPreviousSegment = () => {
    if (!lesson || currentSegmentIndex <= 0) return;
    const prevSegment = lesson.segments[currentSegmentIndex - 1];
    seekTo(prevSegment.start_time);
  };

  if (hasError) {
    return (
      <div className={cn('flex flex-col h-full bg-red-50 border border-red-200 rounded-lg', className)}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-red-600 text-lg font-semibold mb-2">Timeline Player Error</div>
            <div className="text-red-500 text-sm">{errorMessage || 'An unknown error occurred'}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className={cn('flex flex-col h-full bg-gray-50 border border-gray-200 rounded-lg', className)}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-gray-600 text-lg font-semibold mb-2">No Lesson Loaded</div>
            <div className="text-gray-500 text-sm">Please select or create a timeline lesson to begin</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-white border border-gray-200 rounded-lg overflow-hidden', className)}>
      {/* Custom styles */}
      <style>{excalidrawHideUIStyles}</style>

      {/* Header with lesson info */}
      <div className="bg-gray-50 border-b border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg text-gray-800">{lesson.title || lesson.topic}</h3>
            <div className="text-sm text-gray-600">
              {currentSegment ? `${currentSegment.title} (${currentSegmentIndex + 1}/${lesson.segments.length})` : 'Ready to play'}
            </div>
          </div>
          <div className="text-sm text-gray-500">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative timeline-canvas-container">
        <div ref={(div) => {
          if (div && excalidrawAPIRef.current !== div) {
            excalidrawAPIRef.current = div;
          }
        }}>
          <Excalidraw
            key={`timeline-${currentTime}-${visibleElements.length}`} // Force re-render when elements change
            initialData={{
              elements: visibleElements as any,
              appState: {
                viewBackgroundColor: '#ffffff',
                gridSize: null as any,
                zenModeEnabled: true,
                viewModeEnabled: true,
              },
            }}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                saveAsImage: false,
                clearCanvas: false,
                export: false,
                toggleTheme: false,
              },
            }}
            excalidrawAPI={(api) => {
              console.log('Excalidraw API received:', api ? 'Available' : 'Not available');
              if (api && excalidrawAPIRef.current !== api) {
                excalidrawAPIRef.current = api;
                console.log('Excalidraw API set in ref');
              }
            }}
            onChange={(elements, appState) => {
              console.log('Excalidraw onChange:', elements?.length || 0, 'elements');
            }}
          />
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-lg text-gray-700">Loading timeline...</span>
            </div>
          </div>
        )}

        {/* Generation Status */}
        {lesson.generation_status !== 'completed' && (
          <div className="absolute top-4 right-4 bg-blue-100 border border-blue-200 rounded-lg p-3">
            <div className="text-sm font-medium text-blue-800">
              {lesson.generation_status === 'generating' ? 'Generating...' : 'Pending Generation'}
            </div>
            <div className="text-xs text-blue-600">
              Progress: {Math.round(lesson.generation_progress)}%
            </div>
          </div>
        )}
      </div>

      {/* Seek Bar */}
      <div className="px-4 py-2 border-t border-gray-200">
        <div 
          className="relative w-full h-2 bg-gray-200 rounded-full cursor-pointer hover:bg-gray-300 transition-colors"
          onClick={handleSeekBarClick}
        >
          <div 
            className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all duration-100"
            style={{ width: `${progressPercentage}%` }}
          />
          {/* Segment markers */}
          {lesson.segments.map((segment, index) => {
            const segmentStartPercent = (segment.start_time / totalDuration) * 100;
            return (
              <div
                key={index}
                className="absolute top-0 h-full w-0.5 bg-gray-400"
                style={{ left: `${segmentStartPercent}%` }}
                title={segment.title}
              />
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-gray-50 border-t border-gray-200 p-4">
        <div className="flex items-center justify-between">
          {/* Playback Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
              className="p-2 rounded-full hover:bg-gray-200 transition-colors"
              title="Reset to beginning"
            >
              <RotateCcw size={20} />
            </button>

            <button
              onClick={skipToPreviousSegment}
              disabled={currentSegmentIndex <= 0}
              className="p-2 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Previous segment"
            >
              <SkipBack size={20} />
            </button>

            <button
              onClick={isPlaying ? pause : play}
              disabled={!canPlay}
              className={cn(
                'p-3 rounded-full transition-colors',
                isPlaying
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white',
                !canPlay && 'opacity-50 cursor-not-allowed'
              )}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>

            <button
              onClick={skipToNextSegment}
              disabled={!lesson || currentSegmentIndex >= lesson.segments.length - 1}
              className="p-2 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Next segment"
            >
              <SkipForward size={20} />
            </button>
          </div>

          {/* Playback Settings */}
          <div className="flex items-center gap-4">
            {/* Playback Rate */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Speed:</span>
              <select
                value={playbackRate}
                onChange={(e) => handlePlaybackRateChange(Number(e.target.value))}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value={0.5}>0.5x</option>
                <option value={0.75}>0.75x</option>
                <option value={1}>1x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
              </select>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMuted(!isMuted)}
                className="p-1 rounded hover:bg-gray-200 transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-16"
                title="Volume"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};