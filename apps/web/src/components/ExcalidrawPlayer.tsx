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
import { cn } from "@ai-tutor/utils";
import { useTTSSettings } from "@ai-tutor/hooks";

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
  speechRate?: number; // Optional fallback, will use settings if userId provided
  speechVolume?: number; // Optional fallback, will use settings if userId provided
  showControls?: boolean;
  showLessonSelector?: boolean;
  
  // Settings integration
  userId?: string; // When provided, will use TTS settings from user preferences
  
  // Callbacks
  onStepChange?: (stepIndex: number) => void;
  onComplete?: () => void;
  onLessonChange?: (lessonName: string) => void;
}

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
  .excalidraw .layer-ui__wrapper__top-left,
  .excalidraw .layer-ui__wrapper__top-right,
  .excalidraw .layer-ui__wrapper__top,
  .excalidraw .layer-ui__wrapper__bottom-left,
  .excalidraw .layer-ui__wrapper__bottom-right,
  .excalidraw .layer-ui__wrapper__footer-left,
  .excalidraw .layer-ui__wrapper__footer-center,
  .excalidraw .layer-ui__wrapper__footer-right,
  .excalidraw .help-icon,
  .excalidraw .welcome-screen-menu-trigger,
  .excalidraw .App-menu__left,
  .excalidraw .App-menu__right,
  .excalidraw .main-menu-trigger,
  .excalidraw .hamburger-menu,
  .excalidraw .zoom-actions,
  .excalidraw .ZoomActions,
  .excalidraw [data-testid="main-menu-trigger"],
  .excalidraw [data-testid="help-icon"],
  .excalidraw [title="Help"],
  .excalidraw [title="Library"],
  .excalidraw [title="Menu"],
  .excalidraw .HamburgerMenuButton,
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
  
  /* Allow mouse events on container while preventing canvas interactions */
  .excalidraw {
    pointer-events: auto !important;
  }
  
  .excalidraw {
    user-select: none !important;
  }
  
  .excalidraw * {
    -webkit-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
    user-select: none !important;
  }
`;

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
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<string>("How Economy Works");
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControlsState, setShowControlsState] = useState(true);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const lessonScriptRef = useRef<LessonSlide[]>([]);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const accumulatedElements = useRef<ExcalidrawElement[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // TTS Settings integration
  const { data: ttsSettings } = useTTSSettings(userId || "default");
  
  // Get effective TTS values (settings override props)
  const effectiveSpeechRate = ttsSettings?.speed || speechRate;
  const effectiveSpeechVolume = ttsSettings?.volume || speechVolume;
  const selectedVoice = ttsSettings?.voice;
  const useSettingsVoice = userId && ttsSettings?.provider === "browser" && selectedVoice;
  
  // Debug logging for voice selection
  logger.debug("TTS Settings:", {
    userId,
    ttsSettings,
    effectiveSpeechRate,
    effectiveSpeechVolume,
    selectedVoice,
    useSettingsVoice
  });
  
  // Voice selection helper with validation and fallback
  const getSelectedVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (!useSettingsVoice || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return null;
    }
    
    const voices = window.speechSynthesis.getVoices();
    
    // Handle case where voices haven't loaded yet
    if (voices.length === 0) {
      logger.debug("Voices not loaded yet, using default voice");
      return null;
    }
    
    // Try to find exact match first
    let voice = voices.find(v => v.name === selectedVoice);
    
    if (!voice) {
      // Try case-insensitive match
      voice = voices.find(v => v.name.toLowerCase() === selectedVoice?.toLowerCase());
    }
    
    if (!voice) {
      // Try partial match
      voice = voices.find(v => v.name.toLowerCase().includes(selectedVoice?.toLowerCase() || ""));
    }
    
    if (!voice) {
      logger.warn(`Selected voice "${selectedVoice}" not found. Available voices:`, voices.map(v => v.name));
      logger.debug("Falling back to default voice");
      return null;
    }
    
    logger.debug(`Selected voice: ${voice.name} (${voice.lang})`);
    return voice;
  }, [useSettingsVoice, selectedVoice]);
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
      utterance.rate = effectiveSpeechRate;
      utterance.volume = effectiveSpeechVolume;
      
      // Apply voice selection from settings
      const voice = getSelectedVoice();
      if (voice) {
        utterance.voice = voice;
        logger.debug(`Using voice: ${voice.name} (${voice.lang})`);
      } else {
        logger.debug("Using default voice - no custom voice selected or available");
      }

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
    getNarrationText, effectiveSpeechRate, effectiveSpeechVolume, isMuted, onStepChange,
    onComplete, getCurrentSteps, generateElementsFromStep, mode, getSelectedVoice
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

  // Handle fullscreen functionality
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Handle controls auto-hide
  const resetHideControlsTimer = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    setShowControlsState(true);
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControlsState(false);
    }, 3000);
  }, []);


  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
        return; // Don't handle shortcuts when typing in inputs
      }
      
      switch (event.code) {
        case 'Space':
          event.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          goToStep(currentStepIndex - 1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          goToStep(currentStepIndex + 1);
          break;
        case 'KeyR':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            resetLesson();
          }
          break;
        case 'KeyM':
          event.preventDefault();
          setIsMuted(!isMuted);
          break;
        case 'KeyF':
          event.preventDefault();
          toggleFullscreen();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [togglePlayPause, goToStep, currentStepIndex, resetLesson, isMuted, toggleFullscreen]);

  // Inject CSS to hide UI elements
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = excalidrawHideUIStyles;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  // Handle canvas mouse events for auto-hide
  useEffect(() => {
    const attachCanvasEvents = () => {
      const canvasContainer = canvasContainerRef.current;
      if (!canvasContainer) return;

      const handleCanvasMouseMove = () => {
        resetHideControlsTimer();
      };

      // Add event listeners to canvas container
      canvasContainer.addEventListener('mousemove', handleCanvasMouseMove);

      return () => {
        canvasContainer.removeEventListener('mousemove', handleCanvasMouseMove);
      };
    };

    // Delay attachment to ensure Excalidraw is mounted
    const timer = setTimeout(attachCanvasEvents, 100);
    const cleanup = attachCanvasEvents();

    return () => {
      clearTimeout(timer);
      if (cleanup) cleanup();
    };
  }, [resetHideControlsTimer]);

  // Initialize auto-hide on component mount
  useEffect(() => {
    resetHideControlsTimer();
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, [resetHideControlsTimer]);
  
  // Handle voice loading for browsers that load voices asynchronously
  useEffect(() => {
    if (useSettingsVoice && typeof window !== "undefined" && "speechSynthesis" in window) {
      const handleVoicesChanged = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          logger.debug(`Voices loaded: ${voices.length} voices available`);
        }
      };
      
      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
      };
    }
  }, [useSettingsVoice]);

  return (
    <div 
      className={cn(
        "relative bg-black rounded-lg overflow-hidden shadow-2xl",
        isFullscreen ? "fixed inset-0 z-50 rounded-none" : ""
      )}
      style={{ 
        height: isFullscreen ? "100vh" : "600px", 
        width: isFullscreen ? "100vw" : (mode === 'legacy' ? "900px" : "100%")
      }}
      onMouseMove={resetHideControlsTimer}
    >
      {/* Lesson Selector at Top (if applicable) */}
      {mode === 'legacy' && showLessonSelector && showControls && showControlsState && (
        <div className="absolute top-4 left-4 z-30 transition-opacity duration-300">
          <select
            value={selectedLesson}
            onChange={(e) => handleLessonChange(e.target.value)}
            disabled={isLoading}
            className="bg-black/70 text-white border border-white/20 rounded px-3 py-2 text-sm backdrop-blur-sm"
          >
            {Object.keys(lessons).map((key) => (
              <option key={key} value={key} className="bg-black text-white">
                {key}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute top-4 right-4 z-30">
          <div className="bg-black/70 text-white px-3 py-2 rounded backdrop-blur-sm text-sm">
            Loading...
          </div>
        </div>
      )}

      {/* Main Excalidraw Canvas */}
      <div ref={canvasContainerRef} className="w-full h-full relative">
        <Excalidraw
          excalidrawAPI={(api) => {
            setExcalidrawAPI(api);
          }}
          initialData={{
            elements: [],
            appState: {
              viewBackgroundColor: "#fafafa",
              currentItemFontFamily: 1,
              zenModeEnabled: true,
              gridModeEnabled: false,
              isLoading: false,
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
        />
      </div>

      {/* Video Player Controls at Bottom */}
      {showControls && (
        <div 
          className={cn(
            "absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/90 to-transparent pt-5 transition-all duration-300",
            showControlsState ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none"
          )}
        >
          {/* Progress Bar */}
          <div className="px-4 pb-2">
            <div className="flex items-center gap-2 text-white text-sm mb-2">
              <span className="min-w-0 flex-1 truncate">
                {currentSteps[currentStepIndex]?.title || `Step ${currentSteps[currentStepIndex]?.step_number || currentStepIndex + 1}`}
              </span>
              <span className="text-white/70 whitespace-nowrap">
                {Math.min(currentStepIndex + 1, currentSteps.length)} / {currentSteps.length}
              </span>
            </div>
            <div className="relative w-full h-1 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-300 ease-out"
                style={{ 
                  width: `${((currentStepIndex + (isPlaying ? 0.5 : 0)) / Math.max(currentSteps.length, 1)) * 100}%` 
                }}
              />
              {/* Interactive step markers */}
              {currentSteps.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToStep(index)}
                  className="absolute top-1/2 w-3 h-3 bg-white rounded-full transform -translate-y-1/2 -translate-x-1/2 hover:scale-125 transition-transform shadow-lg border-none cursor-pointer"
                  style={{ left: `${(index / Math.max(currentSteps.length - 1, 1)) * 100}%` }}
                  title={`Go to step ${index + 1}: ${currentSteps[index]?.title || 'Untitled'}`}
                />
              ))}
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between px-4 pb-4">
            {/* Left Controls */}
            <div className="flex items-center gap-3">
              {/* Previous Button */}
              <button
                onClick={() => goToStep(currentStepIndex - 1)}
                disabled={currentStepIndex === 0}
                className="text-white hover:text-blue-400 disabled:text-white/30 disabled:cursor-not-allowed transition-colors p-1 bg-transparent border-none flex items-center justify-center"
                title="Previous step"
              >
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 010 1.414zm-6 0a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L5.414 10l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Play/Pause Button */}
              <button
                onClick={togglePlayPause}
                disabled={isLoading}
                className="bg-white text-black hover:bg-gray-200 disabled:bg-gray-500 disabled:cursor-not-allowed rounded-full p-3 transition-all hover:scale-105 shadow-lg border-none flex items-center justify-center"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 002 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                ) : currentStepIndex >= currentSteps.length ? (
                  <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              {/* Next Button */}
              <button
                onClick={() => goToStep(currentStepIndex + 1)}
                disabled={currentStepIndex >= currentSteps.length - 1}
                className="text-white hover:text-blue-400 disabled:text-white/30 disabled:cursor-not-allowed transition-colors p-1 bg-transparent border-none flex items-center justify-center"
                title="Next step"
              >
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414zm6 0a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L14.586 10l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-3">
              {/* Reset Button */}
              <button
                onClick={resetLesson}
                disabled={isLoading}
                className="text-white hover:text-blue-400 disabled:text-white/30 disabled:cursor-not-allowed transition-colors p-2 bg-transparent border-none flex items-center justify-center"
                title="Reset to beginning"
              >
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Mute Button */}
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="text-white hover:text-blue-400 transition-colors p-2 bg-transparent border-none flex items-center justify-center"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.972 7.972 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              
              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="text-white hover:text-blue-400 transition-colors p-2 bg-transparent border-none flex items-center justify-center"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? (
                  <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}