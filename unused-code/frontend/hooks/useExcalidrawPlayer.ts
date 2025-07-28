import { useState, useRef, useCallback } from 'react';
import type { ExcalidrawElement } from '../utils/excalidraw';
import { regenerateElementIndices, makeText, makeLabeledRectangle, COLORS } from '../utils/excalidraw';
import { normalizeToPlayerFormat, type LessonSlide, fetchApiLesson, fetchApiLessonScript } from '../utils/lessonAdapter';
import { createComponentLogger } from '@ai-tutor/utils';

const logger = createComponentLogger('useExcalidrawPlayer');

// Flexible lesson step interface
interface FlexibleLessonStep {
  step_number?: number;
  title?: string;
  explanation?: string;
  content?: string;
  narration?: string;
  elements?: ExcalidrawElement[];
  visual_elements?: any[];
  duration?: number;
}

interface UseExcalidrawPlayerProps {
  steps?: FlexibleLessonStep[];
  autoPlay?: boolean;
  onStepChange?: (stepIndex: number) => void;
  onComplete?: () => void;
}

export const useExcalidrawPlayer = ({
  steps = [],
  autoPlay = false,
  onStepChange,
  onComplete,
}: UseExcalidrawPlayerProps) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isLoading, setIsLoading] = useState(false);
  const [currentElements, setCurrentElements] = useState<ExcalidrawElement[]>([]);
  const [lessonSlides, setLessonSlides] = useState<LessonSlide[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<string>('');
  
  const excalidrawAPIRef = useRef<any>(null);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const goToStep = useCallback((stepIndex: number) => {
    if (stepIndex < 0 || stepIndex >= steps.length) return;
    
    setCurrentStepIndex(stepIndex);
    onStepChange?.(stepIndex);
    
    const step = steps[stepIndex];
    if (step?.elements) {
      setCurrentElements(step.elements);
      
      if (excalidrawAPIRef.current) {
        excalidrawAPIRef.current.updateScene({
          elements: step.elements,
          appState: {
            viewBackgroundColor: '#ffffff',
            gridSize: null,
            zenModeEnabled: true,
          },
        });
      }
    }
  }, [steps, onStepChange]);

  const nextStep = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      goToStep(nextIndex);
    } else {
      setIsPlaying(false);
      onComplete?.();
    }
  }, [currentStepIndex, steps.length, goToStep, onComplete]);

  const previousStep = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      goToStep(prevIndex);
    }
  }, [currentStepIndex, goToStep]);

  const play = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
    goToStep(0);
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }
  }, [goToStep]);

  const loadApiLesson = useCallback(async (lessonId: string) => {
    setIsLoading(true);
    try {
      logger.debug('Loading API lesson:', lessonId);
      
      const lesson = await fetchApiLesson(lessonId);
      if (!lesson) {
        throw new Error('Failed to fetch lesson');
      }

      const script = await fetchApiLessonScript(lessonId);
      const slides = normalizeToPlayerFormat(lesson);
      
      setLessonSlides(slides);
      setSelectedLessonId(lessonId);
      setCurrentStepIndex(0);
      
      if (slides.length > 0) {
        goToStep(0);
      }
      
      logger.debug('Loaded lesson with slides:', slides.length);
    } catch (error) {
      logger.error('Failed to load API lesson:', error);
    } finally {
      setIsLoading(false);
    }
  }, [goToStep]);

  return {
    // State
    currentStepIndex,
    isPlaying,
    isLoading,
    currentElements,
    lessonSlides,
    selectedLessonId,
    
    // Refs
    excalidrawAPIRef,
    animationTimeoutRef,
    
    // Actions
    goToStep,
    nextStep,
    previousStep,
    play,
    pause,
    reset,
    loadApiLesson,
    
    // Setters
    setIsPlaying,
    setCurrentElements,
    setLessonSlides,
    setSelectedLessonId,
  };
};

export type { FlexibleLessonStep };