import React, { useState, useEffect, useCallback, useRef } from 'react';

export interface SlideMarker {
  slideNumber: number;
  startTime: number;
  endTime: number;
  text: string;
}

export interface AudioSeekBarProps {
  /** Current playback time in seconds */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Slide markers for navigation */
  slideMarkers?: SlideMarker[];
  /** Current active slide index */
  currentSlideIndex?: number;
  /** Called when user seeks to a specific time */
  onSeek?: (time: number) => void;
  /** Called when user clicks on a slide marker */
  onSlideClick?: (slideIndex: number) => void;
  /** Additional CSS classes */
  className?: string;
  /** Show slide markers */
  showSlideMarkers?: boolean;
  /** Show time labels */
  showTimeLabels?: boolean;
}

/**
 * AudioSeekBar component with slide navigation functionality
 * Provides seekbar with slide markers for multi-slide audio playback
 */
export const AudioSeekBar: React.FC<AudioSeekBarProps> = ({
  currentTime = 0,
  duration = 0,
  isPlaying = false,
  slideMarkers = [],
  currentSlideIndex = 0,
  onSeek,
  onSlideClick,
  className = '',
  showSlideMarkers = true,
  showTimeLabels = true
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const seekBarRef = useRef<HTMLDivElement>(null);

  // Calculate progress percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const displayTime = isDragging ? dragTime : currentTime;
  const displayProgress = isDragging ? (dragTime / duration) * 100 : progress;

  /**
   * Convert pixel position to time
   */
  const pixelToTime = useCallback((clientX: number): number => {
    if (!seekBarRef.current) return 0;
    
    const rect = seekBarRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return percent * duration;
  }, [duration]);

  /**
   * Handle mouse down on seekbar
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!duration) return;
    
    const time = pixelToTime(e.clientX);
    setIsDragging(true);
    setDragTime(time);
    
    // Prevent text selection
    e.preventDefault();
  }, [duration, pixelToTime]);

  /**
   * Handle mouse move during drag
   */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const time = pixelToTime(e.clientX);
    setDragTime(time);
  }, [isDragging, pixelToTime]);

  /**
   * Handle mouse up to complete seek
   */
  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    
    setIsDragging(false);
    onSeek?.(dragTime);
  }, [isDragging, dragTime, onSeek]);

  /**
   * Handle slide marker click
   */
  const handleSlideMarkerClick = useCallback((slideIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onSlideClick?.(slideIndex);
  }, [onSlideClick]);

  // Add global mouse event listeners during drag
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  /**
   * Format time in MM:SS format
   */
  const formatTime = useCallback((timeInSeconds: number): string => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  /**
   * Get slide marker position as percentage
   */
  const getSlideMarkerPosition = useCallback((startTime: number): number => {
    return duration > 0 ? (startTime / duration) * 100 : 0;
  }, [duration]);

  return (
    <div className={`audio-seekbar ${className}`}>
      {/* Time labels */}
      {showTimeLabels && (
        <div className="flex justify-between text-xs text-white/70 mb-2">
          <span>{formatTime(displayTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      )}

      {/* Seekbar container */}
      <div 
        ref={seekBarRef}
        className="relative w-full h-2 bg-white/20 rounded-full cursor-pointer group"
        onMouseDown={handleMouseDown}
      >
        {/* Progress bar */}
        <div 
          className="absolute h-full bg-gradient-to-r from-purple-400 to-pink-400 rounded-full transition-all duration-100"
          style={{ width: `${Math.max(0, Math.min(100, displayProgress))}%` }}
        />

        {/* Slide markers */}
        {showSlideMarkers && slideMarkers.map((marker, index) => {
          const position = getSlideMarkerPosition(marker.startTime);
          const isActive = index === currentSlideIndex;
          
          return (
            <div
              key={`marker-${marker.slideNumber}`}
              className={`absolute top-0 h-full w-0.5 transform -translate-x-px cursor-pointer transition-all duration-200 ${
                isActive 
                  ? 'bg-yellow-400 shadow-lg' 
                  : 'bg-white/60 hover:bg-white/80'
              }`}
              style={{ left: `${position}%` }}
              onClick={(e) => handleSlideMarkerClick(index, e)}
              title={`Slide ${marker.slideNumber}: ${marker.text.substring(0, 50)}...`}
            >
              {/* Slide number indicator */}
              <div 
                className={`absolute -top-6 left-1/2 transform -translate-x-1/2 px-1 py-0.5 text-xs rounded transition-all duration-200 ${
                  isActive
                    ? 'bg-yellow-400 text-black font-bold'
                    : 'bg-white/20 text-white/80 opacity-0 group-hover:opacity-100'
                }`}
              >
                {marker.slideNumber}
              </div>
            </div>
          );
        })}

        {/* Playhead */}
        <div 
          className="absolute top-1/2 w-4 h-4 bg-white rounded-full shadow-lg transform -translate-y-1/2 -translate-x-2 transition-all duration-100 cursor-grab active:cursor-grabbing"
          style={{ left: `${Math.max(0, Math.min(100, displayProgress))}%` }}
        >
          {/* Playhead inner circle */}
          <div className="absolute inset-0.5 bg-purple-500 rounded-full"></div>
        </div>
      </div>

      {/* Current slide info */}
      {slideMarkers[currentSlideIndex] && (
        <div className="mt-2 text-xs text-white/80">
          <span className="font-medium">
            Slide {slideMarkers[currentSlideIndex].slideNumber}:
          </span>
          {' '}
          <span className="opacity-80">
            {slideMarkers[currentSlideIndex].text.substring(0, 100)}
            {slideMarkers[currentSlideIndex].text.length > 100 ? '...' : ''}
          </span>
        </div>
      )}
    </div>
  );
};

export default AudioSeekBar;