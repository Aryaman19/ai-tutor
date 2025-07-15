import "@excalidraw/excalidraw/index.css";
import { useState, useRef, useEffect, useCallback } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "../utils/excalidraw";
import { regenerateElementIndices, makeText, makeLabeledRectangle, COLORS } from "../utils/excalidraw";
import { lessons } from "../utils/lessons";
import { 
  normalizeToPlayerFormat, 
  type LessonSlide,
  fetchApiLesson,
  fetchApiLessonScript
} from "../utils/lessonAdapter";
import { createComponentLogger } from "@ai-tutor/utils";

// Using any for now - will fix typing later
type ExcalidrawImperativeAPI = any;

// Flexible lesson step interface that works with existing data
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

interface ExcalidrawPlayerProps {
  // Legacy mode props (for backward compatibility)
  mode?: 'legacy' | 'flexible';
  steps?: FlexibleLessonStep[];
  
  // Config props
  autoPlay?: boolean;
  speechRate?: number;
  speechVolume?: number;
  showControls?: boolean;
  showLessonSelector?: boolean;
  
  // Callbacks
  onStepChange?: (stepIndex: number) => void;
  onComplete?: () => void;
  onLessonChange?: (lessonName: string) => void;
}

const logger = createComponentLogger('ExcalidrawPlayer');

export default function ExcalidrawPlayer({
  mode = 'legacy',
  steps = [],
  autoPlay = false,
  speechRate = 0.9,
  speechVolume = 0.8,
  showControls = true,
  showLessonSelector = true,
  onStepChange,
  onComplete,
  onLessonChange,
}: ExcalidrawPlayerProps) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<string>("How Economy Works");
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const lessonScriptRef = useRef<LessonSlide[]>([]);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const accumulatedElements = useRef<ExcalidrawElement[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<{
    elements: ExcalidrawElement[];
    currentElements: ExcalidrawElement[];
  } | null>(null);

  // Get current steps based on mode
  const getCurrentSteps = useCallback((): FlexibleLessonStep[] => {
    if (mode === 'flexible') {
      return steps;
    }
    return lessonScriptRef.current.map((slide, index) => ({
      step_number: index + 1,
      title: slide.title,
      narration: slide.narration,
      elements: slide.elements,
    }));
  }, [mode, steps]);

  // Function to generate basic Excalidraw elements from lesson step data
  const generateElementsFromStep = useCallback((step: FlexibleLessonStep, stepIndex: number): ExcalidrawElement[] => {
    const elements: ExcalidrawElement[] = [];
    const yStart = 50 + (stepIndex * 200);
    
    // Add step title
    if (step.title) {
      const titleElement = makeText({
        x: 50,
        y: yStart,
        text: `${step.step_number || stepIndex + 1}. ${step.title}`,
        fontSize: 24,
        color: COLORS.primary,
        bold: true,
        width: 500
      });
      elements.push(titleElement);
    }
    
    // Add explanation content
    const content = step.explanation || step.content || step.narration;
    if (content) {
      const maxCharsPerLine = 80;
      const lines = content.split('\n').flatMap(line => {
        if (line.length <= maxCharsPerLine) return [line];
        const chunks = [];
        for (let i = 0; i < line.length; i += maxCharsPerLine) {
          chunks.push(line.substring(i, i + maxCharsPerLine));
        }
        return chunks;
      });
      
      lines.forEach((line, lineIndex) => {
        if (line.trim()) {
          const textElement = makeText({
            x: 70,
            y: yStart + 40 + (lineIndex * 25),
            text: line.trim(),
            fontSize: 16,
            color: COLORS.BLACK,
            width: 600
          });
          elements.push(textElement);
        }
      });
    }
    
    // Add visual elements if they exist
    if (step.visual_elements && Array.isArray(step.visual_elements)) {
      step.visual_elements.forEach((visualEl, index) => {
        if (typeof visualEl === 'string') {
          const visualElement = makeText({
            x: 50,
            y: yStart + 150 + (index * 30),
            text: `📊 ${visualEl}`,
            fontSize: 14,
            color: COLORS.secondary,
            width: 500
          });
          elements.push(visualElement);
        }
      });
    }
    
    // Add separator box
    const separatorElements = makeLabeledRectangle({
      x: 30,
      y: yStart - 10,
      width: 700,
      height: Math.max(180, 60 + (content ? content.split('\n').length * 25 : 0)),
      label: "",
      fillColor: stepIndex % 2 === 0 ? COLORS.light : "#f8f9fa",
      shapeColor: COLORS.primary,
      strokeWidth: 1
    });
    
    return [...separatorElements, ...elements];
  }, []);

  // Function to regenerate fractional indices for elements
  const regenerateIndices = useCallback((elements: ExcalidrawElement[]): ExcalidrawElement[] => {
    return elements.map((element, index) => ({
      ...element,
      index: `a${(index + 1).toString(36).padStart(4, "0")}`,
      id: element.id.includes(":")
        ? `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        : element.id,
      versionNonce: Math.floor(Math.random() * 2147483647),
      updated: Date.now(),
      version: element.version || 1,
      opacity: typeof element.opacity === 'number' && element.opacity <= 1 ? element.opacity * 100 : (element.opacity || 100),
      boundElements: element.boundElements || [],
    }));
  }, []);

  // Debounced scene update function
  const debouncedUpdateScene = useCallback(
    (elements: ExcalidrawElement[], currentElements: ExcalidrawElement[], delay = 150) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (mode === 'legacy') {
        pendingUpdateRef.current = { elements, currentElements };
      }

      debounceTimerRef.current = setTimeout(() => {
        if (!excalidrawAPI) return;

        const elementsToUpdate = mode === 'legacy' && pendingUpdateRef.current 
          ? pendingUpdateRef.current.elements 
          : elements;

        const attemptUpdate = (cleanElements: ExcalidrawElement[], attempt = 1) => {
          try {
            excalidrawAPI.updateScene({
              elements: cleanElements,
              appState: { viewBackgroundColor: "#fafafa" },
            });

            // Scroll to content
            if (currentElements && currentElements.length > 0) {
              setTimeout(() => {
                try {
                  excalidrawAPI.scrollToContent(cleanElements, {
                    fitToViewport: false,
                    animate: true,
                    duration: 600,
                  });
                } catch (scrollError) {
                  logger.warn("Scroll failed:", scrollError);
                }
              }, 50);
            }
          } catch (error: any) {
            logger.error(`Scene update failed (attempt ${attempt}):`, error);

            if (error.message?.includes("Fractional indices invariant") && attempt < 3) {
              setTimeout(() => {
                const regenElements = regenerateIndices(elementsToUpdate).map(
                  (el, idx) => ({
                    ...el,
                    index: `b${Date.now()}_${idx.toString(36).padStart(3, "0")}`,
                    id: `clean_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  })
                );
                attemptUpdate(regenElements, attempt + 1);
              }, 200 * attempt);
            } else if (attempt >= 3) {
              // Final fallback
              try {
                excalidrawAPI.updateScene({
                  elements: [],
                  appState: { viewBackgroundColor: "#fafafa" },
                });
                setTimeout(() => {
                  const finalElements = elementsToUpdate.map((el, idx) => ({
                    ...el,
                    index: `final_${idx}`,
                    id: `final_${Date.now()}_${idx}`,
                  }));
                  excalidrawAPI.updateScene({
                    elements: finalElements,
                    appState: { viewBackgroundColor: "#fafafa" },
                  });
                }, 100);
              } catch (finalError) {
                logger.error("Final recovery failed:", finalError);
              }
            }
          }
        };

        const cleanElements = regenerateIndices(elementsToUpdate);
        attemptUpdate(cleanElements);

        if (mode === 'legacy') {
          pendingUpdateRef.current = null;
        }
      }, delay);
    },
    [excalidrawAPI, regenerateIndices, mode]
  );

  const stopCurrentNarration = useCallback(() => {
    if (speechRef.current) {
      window.speechSynthesis.cancel();
      speechRef.current = null;
    }
  }, []);

  const getNarrationText = useCallback((step: FlexibleLessonStep | LessonSlide): string => {
    if ('narration' in step && step.narration) return step.narration;
    if ('explanation' in step && step.explanation) return step.explanation;
    if ('content' in step && step.content) return step.content;
    return `Step ${'step_number' in step ? step.step_number || 'Unknown' : 'Unknown'}: ${'title' in step ? step.title || 'Untitled' : 'Untitled'}`;
  }, []);

  const playNextStep = useCallback(() => {
    const currentSteps = getCurrentSteps();
    
    if (!excalidrawAPI || currentStepIndex >= currentSteps.length || !isPlaying) {
      if (currentStepIndex >= currentSteps.length) {
        setIsPlaying(false);
        onComplete?.();
      }
      return;
    }

    const step = currentSteps[currentStepIndex];
    let currentElements = step.elements || [];
    
    // Generate elements if none exist
    if (currentElements.length === 0) {
      currentElements = generateElementsFromStep(step, currentStepIndex);
    }

    const cleanedCurrentElements = regenerateIndices(currentElements);

    // Handle accumulation based on mode
    if (mode === 'legacy') {
      accumulatedElements.current.push(...cleanedCurrentElements);
    } else {
      if (currentStepIndex === 0) {
        accumulatedElements.current = [...cleanedCurrentElements];
      } else {
        accumulatedElements.current.push(...cleanedCurrentElements);
      }
    }

    debouncedUpdateScene(accumulatedElements.current, cleanedCurrentElements);
    onStepChange?.(currentStepIndex);

    // Play narration if not muted
    const narrationText = getNarrationText(step);
    if (narrationText && "speechSynthesis" in window && !isMuted) {
      const utterance = new SpeechSynthesisUtterance(narrationText);
      utterance.rate = speechRate;
      utterance.volume = speechVolume;

      speechRef.current = utterance;

      utterance.onend = () => {
        setCurrentStepIndex((prev) => prev + 1);
      };

      utterance.onerror = (event) => {
        logger.error("Speech synthesis error:", event);
        setCurrentStepIndex((prev) => prev + 1);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => {
        setCurrentStepIndex((prev) => prev + 1);
      }, 2000);
    }
  }, [
    excalidrawAPI, currentStepIndex, isPlaying, debouncedUpdateScene, regenerateIndices,
    getNarrationText, speechRate, speechVolume, isMuted, onStepChange,
    onComplete, getCurrentSteps, generateElementsFromStep, mode
  ]);

  const handleLessonChange = useCallback(async (lessonName: string) => {
    if (mode !== 'legacy') return;
    
    setIsLoading(true);
    stopCurrentNarration();
    setIsPlaying(false);
    setCurrentStepIndex(0);
    accumulatedElements.current = [];

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingUpdateRef.current = null;

    try {
      let slides: LessonSlide[] = [];
      
      if (lessonName.startsWith('api:')) {
        const lessonId = lessonName.replace('api:', '');
        slides = await fetchApiLesson(lessonId);
      } else {
        const lessonFn = lessons[lessonName as keyof typeof lessons];
        if (lessonFn) {
          const rawData = lessonFn();
          slides = normalizeToPlayerFormat(rawData);
        }
      }
      
      lessonScriptRef.current = slides;

      if (excalidrawAPI) {
        excalidrawAPI.updateScene({
          elements: [],
          appState: { viewBackgroundColor: "#fafafa" },
        });
      }

      setSelectedLesson(lessonName);
      onLessonChange?.(lessonName);

      setTimeout(() => {
        if (excalidrawAPI && lessonScriptRef.current[0]) {
          const firstSlideElements = lessonScriptRef.current[0].elements;
          const cleanedFirstSlide = regenerateIndices(firstSlideElements);
          accumulatedElements.current = [...cleanedFirstSlide];
          debouncedUpdateScene(accumulatedElements.current, cleanedFirstSlide, 100);
        }
        setIsLoading(false);
      }, 100);
    } catch (error) {
      logger.error("Error loading lesson:", error);
      setIsLoading(false);
    }
  }, [excalidrawAPI, stopCurrentNarration, debouncedUpdateScene, regenerateIndices, mode, onLessonChange]);

  const togglePlayPause = useCallback(() => {
    const currentSteps = getCurrentSteps();
    
    if (isPlaying) {
      stopCurrentNarration();
      setIsPlaying(false);
    } else {
      if (currentStepIndex >= currentSteps.length) {
        setCurrentStepIndex(0);
        accumulatedElements.current = [];
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        pendingUpdateRef.current = null;
        if (excalidrawAPI) {
          excalidrawAPI.updateScene({
            elements: [],
            appState: { viewBackgroundColor: "#fafafa" },
          });
        }
      }
      setIsPlaying(true);
    }
  }, [isPlaying, currentStepIndex, stopCurrentNarration, excalidrawAPI, getCurrentSteps]);

  const resetLesson = useCallback(() => {
    const currentSteps = getCurrentSteps();
    
    stopCurrentNarration();
    setIsPlaying(false);
    setCurrentStepIndex(0);
    accumulatedElements.current = [];

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingUpdateRef.current = null;

    if (excalidrawAPI && currentSteps.length > 0) {
      let firstStepElements = currentSteps[0].elements || [];
      if (firstStepElements.length === 0) {
        firstStepElements = generateElementsFromStep(currentSteps[0], 0);
      }
      const cleanedFirstStep = regenerateIndices(firstStepElements);
      accumulatedElements.current = [...cleanedFirstStep];
      debouncedUpdateScene(accumulatedElements.current, cleanedFirstStep, 100);
    }
  }, [excalidrawAPI, stopCurrentNarration, debouncedUpdateScene, regenerateIndices, generateElementsFromStep, getCurrentSteps]);

  const goToStep = useCallback((stepIndex: number) => {
    const currentSteps = getCurrentSteps();
    if (stepIndex < 0 || stepIndex >= currentSteps.length) return;
    
    stopCurrentNarration();
    setCurrentStepIndex(stepIndex);
    
    accumulatedElements.current = [];
    for (let i = 0; i <= stepIndex; i++) {
      let stepElements = currentSteps[i].elements || [];
      if (stepElements.length === 0) {
        stepElements = generateElementsFromStep(currentSteps[i], i);
      }
      const cleanedElements = regenerateIndices(stepElements);
      accumulatedElements.current.push(...cleanedElements);
    }

    debouncedUpdateScene(accumulatedElements.current, accumulatedElements.current, 100);
  }, [stopCurrentNarration, debouncedUpdateScene, regenerateIndices, generateElementsFromStep, getCurrentSteps]);

  // Initialize lesson on mount (legacy mode)
  useEffect(() => {
    if (mode === 'legacy') {
      const lessonFn = lessons[selectedLesson as keyof typeof lessons];
      if (lessonFn) {
        try {
          const rawData = lessonFn();
          lessonScriptRef.current = normalizeToPlayerFormat(rawData);
        } catch (error) {
          logger.error("Error loading lesson:", error);
        }
      }
    }
  }, [selectedLesson, mode]);

  // Initialize first step
  useEffect(() => {
    if (excalidrawAPI) {
      const currentSteps = getCurrentSteps();
      if (currentSteps.length > 0 && currentStepIndex === 0) {
        let firstStepElements = currentSteps[0].elements || [];
        if (firstStepElements.length === 0) {
          firstStepElements = generateElementsFromStep(currentSteps[0], 0);
        }
        if (firstStepElements.length > 0) {
          const cleanedFirstStep = regenerateIndices(firstStepElements);
          accumulatedElements.current = [...cleanedFirstStep];
          debouncedUpdateScene(accumulatedElements.current, cleanedFirstStep, 100);
        }
      }
    }
  }, [excalidrawAPI, debouncedUpdateScene, regenerateIndices, generateElementsFromStep, getCurrentSteps]);

  // Handle step progression
  useEffect(() => {
    const currentSteps = getCurrentSteps();
    if (isPlaying && currentStepIndex < currentSteps.length) {
      const timer = setTimeout(() => {
        playNextStep();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, currentStepIndex, playNextStep, getCurrentSteps]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCurrentNarration();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [stopCurrentNarration]);

  const getPlayButtonText = () => {
    const currentSteps = getCurrentSteps();
    if (isPlaying) return "⏸️ Pause";
    if (currentStepIndex === 0) return "▶️ Play";
    if (currentStepIndex >= currentSteps.length) return "🔄 Restart";
    return "▶️ Resume";
  };

  const currentSteps = getCurrentSteps();

  if (currentSteps.length === 0) {
    return (
      <div style={{ height: "600px", width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#666", fontSize: "18px" }}>No lesson steps available</p>
      </div>
    );
  }

  return (
    <div style={{ height: "600px", width: mode === 'legacy' ? "900px" : "100%" }}>
      {showControls && (
        <div style={{
          marginBottom: "10px",
          display: "flex",
          gap: "10px",
          alignItems: "center",
          flexWrap: "wrap",
        }}>
          {mode === 'legacy' && showLessonSelector && (
            <select
              value={selectedLesson}
              onChange={(e) => handleLessonChange(e.target.value)}
              disabled={isLoading}
              style={{ padding: "5px 10px" }}
            >
              {Object.keys(lessons).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={togglePlayPause}
            disabled={isLoading}
            style={{ padding: "8px 16px", fontSize: "14px" }}
          >
            {getPlayButtonText()}
          </button>

          <button
            onClick={resetLesson}
            disabled={isLoading}
            style={{ padding: "8px 16px", fontSize: "14px" }}
          >
            🔄 Reset
          </button>

          <button
            onClick={() => setIsMuted(!isMuted)}
            style={{ 
              padding: "8px 16px", 
              fontSize: "14px",
              backgroundColor: isMuted ? "#ff6b6b" : "#51cf66"
            }}
          >
            {isMuted ? "🔇 Unmute" : "🔊 Mute"}
          </button>

          <span style={{ fontSize: "14px", color: "#666" }}>
            Step {Math.min(currentStepIndex + 1, currentSteps.length)} of {currentSteps.length}
          </span>

          {currentSteps[currentStepIndex] && (
            <span style={{ fontSize: "14px", color: "#333", fontWeight: "500" }}>
              {currentSteps[currentStepIndex].title || `Step ${currentSteps[currentStepIndex].step_number || currentStepIndex + 1}`}
            </span>
          )}

          <div style={{ display: "flex", gap: "5px", marginLeft: "10px" }}>
            <button
              onClick={() => goToStep(currentStepIndex - 1)}
              disabled={currentStepIndex === 0}
              style={{ 
                padding: "4px 8px", 
                fontSize: "12px",
                opacity: currentStepIndex === 0 ? 0.5 : 1
              }}
            >
              ← Prev
            </button>
            <button
              onClick={() => goToStep(currentStepIndex + 1)}
              disabled={currentStepIndex >= currentSteps.length - 1}
              style={{ 
                padding: "4px 8px", 
                fontSize: "12px",
                opacity: currentStepIndex >= currentSteps.length - 1 ? 0.5 : 1
              }}
            >
              Next →
            </button>
          </div>

          {isLoading && <span style={{ color: "#666" }}>Loading...</span>}
        </div>
      )}

      <Excalidraw
        excalidrawAPI={(api) => {
          setExcalidrawAPI(api);
        }}
        initialData={{
          elements: [],
          appState: {
            viewBackgroundColor: "#fafafa",
            currentItemFontFamily: 1,
            zenModeEnabled: false,
            gridModeEnabled: false,
            isLoading: false,
          },
        }}
        viewModeEnabled={true}
        theme="light"
      />
    </div>
  );
}