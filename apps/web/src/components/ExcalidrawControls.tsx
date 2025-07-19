import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { cn } from '@ai-tutor/utils';

interface ExcalidrawControlsProps {
  isPlaying: boolean;
  currentStepIndex: number;
  totalSteps: number;
  isLoading?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onReset: () => void;
  className?: string;
}

export const ExcalidrawControls = ({
  isPlaying,
  currentStepIndex,
  totalSteps,
  isLoading = false,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onReset,
  className,
}: ExcalidrawControlsProps) => {
  const canGoNext = currentStepIndex < totalSteps - 1;
  const canGoPrevious = currentStepIndex > 0;

  return (
    <div className={cn('flex items-center gap-2 p-4 bg-white border-t', className)}>
      {/* Previous Step */}
      <button
        onClick={onPrevious}
        disabled={!canGoPrevious || isLoading}
        className={cn(
          'p-2 rounded-full transition-colors',
          canGoPrevious && !isLoading
            ? 'bg-blue-500 hover:bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        )}
        title="Previous Step"
      >
        <SkipBack size={20} />
      </button>

      {/* Play/Pause */}
      <button
        onClick={isPlaying ? onPause : onPlay}
        disabled={isLoading || totalSteps === 0}
        className={cn(
          'p-3 rounded-full transition-colors',
          !isLoading && totalSteps > 0
            ? 'bg-green-500 hover:bg-green-600 text-white'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        )}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isLoading ? (
          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause size={24} />
        ) : (
          <Play size={24} />
        )}
      </button>

      {/* Next Step */}
      <button
        onClick={onNext}
        disabled={!canGoNext || isLoading}
        className={cn(
          'p-2 rounded-full transition-colors',
          canGoNext && !isLoading
            ? 'bg-blue-500 hover:bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        )}
        title="Next Step"
      >
        <SkipForward size={20} />
      </button>

      {/* Reset */}
      <button
        onClick={onReset}
        disabled={isLoading}
        className={cn(
          'p-2 rounded-full transition-colors ml-2',
          !isLoading
            ? 'bg-orange-500 hover:bg-orange-600 text-white'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        )}
        title="Reset to Beginning"
      >
        <RotateCcw size={20} />
      </button>

      {/* Step Counter */}
      <div className="ml-4 text-sm text-gray-600">
        Step {currentStepIndex + 1} of {totalSteps}
      </div>
    </div>
  );
};