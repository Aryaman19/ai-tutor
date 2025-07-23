/**
 * Streaming Loading Indicator Component
 * 
 * Non-blocking loading indicators for progressive streaming.
 * Shows different states: background loading, buffering, seeking.
 */

import React from 'react';
import type { LoadingState } from '@ai-tutor/hooks';

export interface StreamingLoadingIndicatorProps {
  /** Loading state from useProgressiveStreaming */
  loadingState: LoadingState;
  
  /** Position of the loading indicator */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  
  /** Size of the loading indicator */
  size?: 'small' | 'medium' | 'large';
  
  /** Show background loading progress */
  showBackgroundProgress?: boolean;
  
  /** Show text descriptions */
  showText?: boolean;
  
  /** Custom styling */
  className?: string;
  
  /** Custom colors */
  colors?: {
    primary?: string;
    secondary?: string;
    background?: string;
    text?: string;
  };
}

/**
 * Default colors
 */
const DEFAULT_COLORS = {
  primary: '#ff0000',
  secondary: '#ffffff',
  background: 'rgba(0, 0, 0, 0.8)',
  text: '#ffffff',
};

/**
 * Size configurations
 */
const SIZE_CONFIG = {
  small: { spinner: 16, text: 'text-xs', padding: 'px-2 py-1' },
  medium: { spinner: 24, text: 'text-sm', padding: 'px-3 py-2' },
  large: { spinner: 32, text: 'text-base', padding: 'px-4 py-2' },
};

/**
 * Position configurations
 */
const POSITION_CONFIG = {
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'center': 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2',
};

/**
 * Streaming Loading Indicator Component
 * Provides non-intrusive loading feedback for progressive streaming
 */
export const StreamingLoadingIndicator: React.FC<StreamingLoadingIndicatorProps> = ({
  loadingState,
  position = 'top-right',
  size = 'medium',
  showBackgroundProgress = true,
  showText = true,
  className = '',
  colors = DEFAULT_COLORS,
}) => {
  const finalColors = { ...DEFAULT_COLORS, ...colors };
  const sizeConfig = SIZE_CONFIG[size];
  const positionClasses = POSITION_CONFIG[position];
  
  // Determine what to show based on loading state
  const shouldShow = loadingState.isInitialLoading || 
                     loadingState.isBuffering || 
                     loadingState.isSeeking ||
                     (showBackgroundProgress && loadingState.backgroundProgress < 1 && loadingState.backgroundProgress > 0);
  
  if (!shouldShow) return null;
  
  // Determine loading type and message
  const getLoadingInfo = (): { type: string; message: string; showSpinner: boolean; showProgress: boolean } => {
    if (loadingState.isInitialLoading) {
      return {
        type: 'initial',
        message: loadingState.loadingReason || 'Loading content...',
        showSpinner: true,
        showProgress: false,
      };
    }
    
    if (loadingState.isBuffering) {
      return {
        type: 'buffering',
        message: 'Buffering...',
        showSpinner: true,
        showProgress: false,
      };
    }
    
    if (loadingState.isSeeking) {
      return {
        type: 'seeking',
        message: 'Seeking...',
        showSpinner: true,
        showProgress: false,
      };
    }
    
    // Background loading
    return {
      type: 'background',
      message: `Loading ${Math.round(loadingState.backgroundProgress * 100)}%`,
      showSpinner: false,
      showProgress: true,
    };
  };
  
  const loadingInfo = getLoadingInfo();
  
  return (
    <div
      className={`fixed z-50 ${positionClasses} ${className}`}
      style={{ pointerEvents: 'none' }}
    >
      <div
        className={`flex items-center space-x-2 rounded-lg ${sizeConfig.padding}`}
        style={{
          backgroundColor: loadingInfo.type === 'background' 
            ? 'rgba(0, 0, 0, 0.6)' 
            : finalColors.background,
          backdropFilter: 'blur(4px)',
        }}
      >
        {/* Spinner */}
        {loadingInfo.showSpinner && (
          <div className="flex-shrink-0">
            <Spinner size={sizeConfig.spinner} color={finalColors.primary} />
          </div>
        )}
        
        {/* Progress bar for background loading */}
        {loadingInfo.showProgress && showBackgroundProgress && (
          <div className="flex-shrink-0">
            <CircularProgress
              progress={loadingState.backgroundProgress}
              size={sizeConfig.spinner}
              color={finalColors.primary}
              backgroundColor={finalColors.secondary}
            />
          </div>
        )}
        
        {/* Text */}
        {showText && (
          <span
            className={`${sizeConfig.text} font-medium`}
            style={{ color: finalColors.text }}
          >
            {loadingInfo.message}
            {loadingState.estimatedReadyTime && (
              <span className="opacity-75 ml-1">
                (~{Math.ceil(loadingState.estimatedReadyTime / 1000)}s)
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Spinner Component
 */
interface SpinnerProps {
  size: number;
  color: string;
}

const Spinner: React.FC<SpinnerProps> = ({ size, color }) => (
  <div
    className="animate-spin rounded-full border-2 border-solid border-current border-r-transparent"
    style={{
      width: `${size}px`,
      height: `${size}px`,
      color,
    }}
  />
);

/**
 * Circular Progress Component
 */
interface CircularProgressProps {
  progress: number; // 0-1
  size: number;
  color: string;
  backgroundColor: string;
}

const CircularProgress: React.FC<CircularProgressProps> = ({
  progress,
  size,
  color,
  backgroundColor,
}) => {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);
  
  return (
    <div style={{ width: `${size}px`, height: `${size}px` }}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={backgroundColor}
          strokeWidth="2"
          fill="none"
          opacity="0.3"
        />
        
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth="2"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.3s ease-in-out',
          }}
        />
      </svg>
    </div>
  );
};

/**
 * Buffering Dots Indicator (alternative to spinner)
 */
export const BufferingDots: React.FC<{ color?: string }> = ({ 
  color = '#ffffff' 
}) => (
  <div className="flex space-x-1">
    {[0, 1, 2].map((index) => (
      <div
        key={index}
        className="w-2 h-2 rounded-full animate-pulse"
        style={{
          backgroundColor: color,
          animationDelay: `${index * 0.2}s`,
          animationDuration: '1.2s',
        }}
      />
    ))}
  </div>
);

export default StreamingLoadingIndicator;