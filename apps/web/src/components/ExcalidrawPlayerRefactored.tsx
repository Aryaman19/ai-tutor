import "@excalidraw/excalidraw/index.css";
import { useEffect } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { lessons, type LessonName } from "../utils/lessons/index";
import { normalizeToPlayerFormat } from "../utils/lessonAdapter";
import { createComponentLogger } from "@ai-tutor/utils";
import { cn } from "@ai-tutor/utils";

// Import our new components and hooks
import { useExcalidrawPlayer, type FlexibleLessonStep } from "../hooks/useExcalidrawPlayer";
import { ExcalidrawControls } from "./ExcalidrawControls";
import { LessonSelector } from "./LessonSelector";
import { TTSAudioPlayer } from "./TTSAudioPlayerSimple";

const logger = createComponentLogger('ExcalidrawPlayer');

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

interface ExcalidrawPlayerProps {
  mode?: 'legacy' | 'flexible';
  steps?: FlexibleLessonStep[];
  autoPlay?: boolean;
  speechRate?: number;
  speechVolume?: number;
  showControls?: boolean;
  showLessonSelector?: boolean;
  userId?: string;
  onStepChange?: (stepIndex: number) => void;
  onComplete?: () => void;
  onLessonChange?: (lessonName: string) => void;
}

export default function ExcalidrawPlayer({
  mode = 'legacy',
  steps = [],
  autoPlay = false,
  speechRate = 0.9,
  speechVolume = 0.8,
  showControls = true,
  showLessonSelector = true,
  userId,
  onStepChange,
  onComplete,
  onLessonChange,
}: ExcalidrawPlayerProps) {
  // Use our custom hook for player logic
  const {
    currentStepIndex,
    isPlaying,
    isLoading,
    currentElements,
    lessonSlides,
    selectedLessonId,
    excalidrawAPIRef,
    goToStep,
    nextStep,
    previousStep,
    play,
    pause,
    reset,
    loadApiLesson,
    setLessonSlides,
    setSelectedLessonId,
  } = useExcalidrawPlayer({
    steps: steps || [],
    autoPlay,
    onStepChange,
    onComplete,
  });

  // Handle lesson selection for legacy mode
  const handleLegacyLessonSelect = (lessonName: string, displayName: string) => {
    if (!lessons[lessonName as LessonName]) {
      logger.error('Lesson not found:', lessonName);
      return;
    }

    try {
      const slides = normalizeToPlayerFormat(lessons[lessonName as LessonName]());
      setLessonSlides(slides);
      setSelectedLessonId(lessonName);
      onLessonChange?.(displayName);
      
      if (slides.length > 0) {
        goToStep(0);
      }
      
      logger.debug('Loaded legacy lesson:', lessonName, 'with slides:', slides.length);
    } catch (error) {
      logger.error('Failed to load legacy lesson:', error);
    }
  };

  // Handle API lesson selection
  const handleApiLessonSelect = async (lessonId: string) => {
    await loadApiLesson(lessonId);
  };

  // Get current step for audio player
  const currentStep = mode === 'legacy' 
    ? lessonSlides[currentStepIndex]
    : steps[currentStepIndex];

  // Handle audio completion to advance to next step
  const handleAudioEnd = () => {
    if (isPlaying) {
      nextStep();
    }
  };

  // Auto-advance when playing
  useEffect(() => {
    if (isPlaying && !currentStep) {
      // No more steps, complete the lesson
      onComplete?.();
    }
  }, [isPlaying, currentStep, onComplete]);

  // Initialize with a default lesson if in legacy mode
  useEffect(() => {
    if (mode === 'legacy' && lessonSlides.length === 0) {
      handleLegacyLessonSelect("How Economy Works", "How Economy Works");
    }
  }, [mode, lessonSlides.length]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Custom styles */}
      <style>{excalidrawHideUIStyles}</style>

      {/* Lesson Selector */}
      {showLessonSelector && (
        <LessonSelector
          selectedLessonId={selectedLessonId}
          onLessonSelect={handleLegacyLessonSelect}
          onApiLessonSelect={handleApiLessonSelect}
          isLoading={isLoading}
        />
      )}

      {/* Main Canvas Area */}
      <div className="flex-1 relative">
        <div ref={(div) => {
          if (div) {
            // Store reference for later use
            excalidrawAPIRef.current = div;
          }
        }}>
          <Excalidraw
            initialData={{
              elements: currentElements as any,
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
          />
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-lg text-gray-700">Loading lesson...</span>
            </div>
          </div>
        )}
      </div>

      {/* Audio Player */}
      <div className="p-4 bg-gray-50 border-t">
        <TTSAudioPlayer
          currentStep={currentStep}
          userId={userId}
          speechRate={speechRate}
          speechVolume={speechVolume}
          autoPlay={isPlaying}
          onAudioEnd={handleAudioEnd}
          onAudioStart={() => logger.debug('Audio started for step', currentStepIndex)}
        />
      </div>

      {/* Controls */}
      {showControls && (
        <ExcalidrawControls
          isPlaying={isPlaying}
          currentStepIndex={currentStepIndex}
          totalSteps={mode === 'legacy' ? lessonSlides.length : steps.length}
          isLoading={isLoading}
          onPlay={play}
          onPause={pause}
          onNext={nextStep}
          onPrevious={previousStep}
          onReset={reset}
        />
      )}

      {/* Step Info */}
      {currentStep && (
        <div className="p-4 bg-gray-100 border-t">
          <h3 className="font-semibold text-lg mb-2">{currentStep.title}</h3>
          {(currentStep as any).explanation && (
            <p className="text-gray-700 text-sm">{(currentStep as any).explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}

// Export the refactored component as the default
export { ExcalidrawPlayer };