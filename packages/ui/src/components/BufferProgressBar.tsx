/**
 * Buffer Progress Bar Component
 * 
 * YouTube-style buffer visualization showing loaded content regions
 * with gray bars on the timeline/seekbar.
 */

import React from 'react';
import type { BufferRegion } from '@ai-tutor/utils/streaming';

export interface BufferProgressBarProps {
  /** Total duration in milliseconds */
  duration: number;
  
  /** Current playback position in milliseconds */
  position: number;
  
  /** Buffered regions to display */
  bufferedRegions: BufferRegion[];
  
  /** Width of the progress bar in pixels */
  width?: number;
  
  /** Height of the progress bar in pixels */
  height?: number;
  
  /** Enable interactive seeking */
  interactive?: boolean;
  
  /** Callback when user seeks */
  onSeek?: (position: number) => void;
  
  /** Custom styling */
  className?: string;
  
  /** Show position indicator */
  showPosition?: boolean;
  
  /** Show hover preview */
  showHoverPreview?: boolean;
  
  /** Custom colors */
  colors?: {
    /** Background color */
    background?: string;
    /** Buffered region color (YouTube-style gray) */
    buffered?: string;
    /** Played region color */
    played?: string;
    /** Position indicator color */
    position?: string;
    /** Hover preview color */
    hover?: string;
  };
}

/**
 * Default colors matching YouTube's style
 */
const DEFAULT_COLORS = {
  background: '#404040',
  buffered: '#757575',
  played: '#ff0000',
  position: '#ffffff',
  hover: '#ffffff80',
};

/**
 * Buffer Progress Bar Component
 * Displays YouTube-style buffer visualization with interactive seeking
 */
export const BufferProgressBar: React.FC<BufferProgressBarProps> = ({
  duration,
  position,
  bufferedRegions,
  width = 400,
  height = 8,
  interactive = true,
  onSeek,
  className = '',
  showPosition = true,
  showHoverPreview = true,
  colors = DEFAULT_COLORS,
}) => {
  const [isHovering, setIsHovering] = React.useState(false);
  const [hoverPosition, setHoverPosition] = React.useState(0);
  const progressBarRef = React.useRef<HTMLDivElement>(null);
  
  const finalColors = { ...DEFAULT_COLORS, ...colors };
  
  // Convert time to pixel position
  const timeToPixel = React.useCallback((time: number): number => {
    if (duration === 0) return 0;
    return (time / duration) * width;
  }, [duration, width]);
  
  // Convert pixel position to time
  const pixelToTime = React.useCallback((pixel: number): number => {
    return (pixel / width) * duration;
  }, [width, duration]);
  
  // Handle mouse events for seeking
  const handleMouseMove = React.useCallback((event: React.MouseEvent) => {
    if (!progressBarRef.current) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const clampedX = Math.max(0, Math.min(x, width));
    
    setHoverPosition(clampedX);
  }, [width]);
  
  const handleMouseEnter = React.useCallback(() => {
    if (interactive && showHoverPreview) {
      setIsHovering(true);
    }
  }, [interactive, showHoverPreview]);
  
  const handleMouseLeave = React.useCallback(() => {
    setIsHovering(false);
  }, []);
  
  const handleClick = React.useCallback((event: React.MouseEvent) => {
    if (!interactive || !onSeek) return;
    
    event.preventDefault();
    const seekTime = pixelToTime(hoverPosition);
    onSeek(seekTime);
  }, [interactive, onSeek, pixelToTime, hoverPosition]);
  
  // Calculate current position pixel
  const positionPixel = timeToPixel(position);
  
  // Sort buffered regions for rendering
  const sortedRegions = React.useMemo(() => {
    return [...bufferedRegions]
      .filter(region => region.status === 'ready')
      .sort((a, b) => a.startTime - b.startTime);
  }, [bufferedRegions]);
  
  return (
    <div className={`relative ${className}`}>
      {/* Main progress bar container */}
      <div
        ref={progressBarRef}
        className="relative cursor-pointer"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          backgroundColor: finalColors.background,
          borderRadius: `${height / 2}px`,
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {/* Buffered regions (YouTube-style gray bars) */}
        {sortedRegions.map((region, index) => {
          const startPixel = timeToPixel(region.startTime);
          const endPixel = timeToPixel(region.endTime);
          const regionWidth = Math.max(1, endPixel - startPixel);
          
          return (
            <div
              key={`buffer-${index}-${region.startTime}`}
              className="absolute top-0"
              style={{
                left: `${startPixel}px`,
                width: `${regionWidth}px`,
                height: `${height}px`,
                backgroundColor: finalColors.buffered,
                borderRadius: `${height / 2}px`,
              }}
            />
          );
        })}
        
        {/* Played region (red bar up to current position) */}
        {position > 0 && (
          <div
            className="absolute top-0 left-0"
            style={{
              width: `${positionPixel}px`,
              height: `${height}px`,
              backgroundColor: finalColors.played,
              borderRadius: `${height / 2}px`,
            }}
          />
        )}
        
        {/* Current position indicator */}
        {showPosition && (
          <div
            className="absolute top-0 transform -translate-x-1/2"
            style={{
              left: `${positionPixel}px`,
              width: '3px',
              height: `${height}px`,
              backgroundColor: finalColors.position,
              borderRadius: '1px',
              boxShadow: '0 0 2px rgba(0,0,0,0.5)',
            }}
          />
        )}
        
        {/* Hover preview indicator */}
        {isHovering && showHoverPreview && (
          <div
            className="absolute top-0 transform -translate-x-1/2 pointer-events-none"
            style={{
              left: `${hoverPosition}px`,
              width: '2px',
              height: `${height}px`,
              backgroundColor: finalColors.hover,
              borderRadius: '1px',
            }}
          />
        )}
      </div>
      
      {/* Hover tooltip */}
      {isHovering && showHoverPreview && (
        <div
          className="absolute bottom-full mb-2 transform -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap"
          style={{
            left: `${hoverPosition}px`,
          }}
        >
          {formatTime(pixelToTime(hoverPosition))}
        </div>
      )}
    </div>
  );
};

/**
 * Format time in milliseconds to readable string
 */
function formatTime(timeMs: number): string {
  const totalSeconds = Math.floor(timeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default BufferProgressBar;