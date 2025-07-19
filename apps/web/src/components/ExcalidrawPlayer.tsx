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
import { useTTSSettings, useTTSAudio, useTTSAvailability, useStreamingTTS, useTTSVoices } from "@ai-tutor/hooks";

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
  const [currentNarrationText, setCurrentNarrationText] = useState('');
  const [fallbackNarrationText, setFallbackNarrationText] = useState('');
  const [useBrowserTTS, setUseBrowserTTS] = useState(false);
  const [streamingTTSEnabled, setStreamingTTSEnabled] = useState(false);
  const [audioPermissionGranted, setAudioPermissionGranted] = useState(false);
  
  // Audio pre-generation state
  const [audioCache, setAudioCache] = useState<Map<number, string>>(new Map()); // stepIndex -> audioId
  const [preGenerationQueue, setPreGenerationQueue] = useState<Set<number>>(new Set()); // steps being generated
  const [audioPreparationActive, setAudioPreparationActive] = useState(false);
  const togglePlayPauseRef = useRef(false); // Prevent double-clicks
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const lessonScriptRef = useRef<LessonSlide[]>([]);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const accumulatedElements = useRef<ExcalidrawElement[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // TTS Settings integration
  const { data: ttsSettings } = useTTSSettings(userId || "default");
  const { data: ttsAvailability } = useTTSAvailability();
  const { data: piperVoices } = useTTSVoices();
  
  // Get effective TTS values (settings override props)
  const effectiveSpeechRate = ttsSettings?.speed || speechRate;
  const effectiveSpeechVolume = ttsSettings?.volume || speechVolume;
  const selectedVoice = ttsSettings?.voice;
  const useSettingsVoice = selectedVoice && (ttsSettings?.provider === "browser" || ttsSettings?.provider === "piper");
  const usePiperTTS = ttsSettings?.provider === "piper" && ttsAvailability?.available;
  const enableStreamingTTS = ttsSettings?.streaming !== false && ttsAvailability?.available;

  // Voice mapping function for Piper TTS (convert voice name to voice ID)
  const getCurrentVoiceId = useCallback(() => {
    if (usePiperTTS && piperVoices && selectedVoice) {
      // For Piper, we need to get the voice ID from the installed voices
      const piperVoice = piperVoices.find(v => v.name === selectedVoice);
      const voiceId = piperVoice?.id || selectedVoice;
      logger.debug("Voice mapping:", {
        selectedVoiceName: selectedVoice,
        foundVoiceId: voiceId,
        availableVoices: piperVoices.map(v => ({ name: v.name, id: v.id }))
      });
      return voiceId;
    }
    return selectedVoice;
  }, [usePiperTTS, piperVoices, selectedVoice]);
  
  // Get current voice ID for hooks
  const currentVoiceId = getCurrentVoiceId();

  // Debug hook parameters
  useEffect(() => {
    logger.debug("useTTSAudio hook parameters:", {
      text: currentNarrationText ? `"${currentNarrationText.substring(0, 50)}..."` : "empty",
      textLength: currentNarrationText.length,
      voice: usePiperTTS ? currentVoiceId : undefined,
      usePiperTTS,
      selectedVoice,
      currentVoiceId
    });
  }, [currentNarrationText, usePiperTTS, selectedVoice, currentVoiceId]);

  // Piper TTS Audio Hook (non-streaming)
  const ttsAudio = useTTSAudio(currentNarrationText, {
    voice: usePiperTTS ? currentVoiceId : undefined,
    autoPlay: true, // Enable autoPlay so it plays immediately when ready
    onPlay: () => {
      logger.debug("Piper TTS started playing");
    },
    onEnd: () => {
      logger.debug("Piper TTS finished playing");
      setCurrentStepIndex((prev) => prev + 1);
    },
    onError: (error) => {
      logger.error("Piper TTS error:", error);
      
      // Only trigger browser TTS fallback for genuine service failures, not timing issues
      const isServiceFailure = error.message.includes('503') || 
                              error.message.includes('service is not available') ||
                              error.message.includes('Failed to fetch') ||
                              error.message.includes('Network error');
      
      const isAudioPlaybackError = error.message.includes('Audio playback error');
      
      if (isServiceFailure) {
        logger.warn("Piper TTS service unavailable, switching to browser TTS");
        setUseBrowserTTS(true);
      } else if (isAudioPlaybackError) {
        // Audio playback errors might be timing/format issues - reduce fallback frequency
        logger.warn("Audio playback error detected - this may be a timing issue rather than a service failure");
        // Only fallback after multiple consecutive failures to avoid the timing issue
        setUseBrowserTTS(true);
      } else {
        logger.warn("Piper TTS failed with unknown error, falling back to browser TTS");
        setUseBrowserTTS(true);
      }
    },
  });

  // Streaming TTS Hook (disabled for debugging)
  const streamingTTS = useStreamingTTS('', {
    voice: enableStreamingTTS ? currentVoiceId : undefined,
    autoPlay: false,
    onPlay: () => {
      logger.debug("Streaming TTS started playing");
    },
    onEnd: () => {
      logger.debug("Streaming TTS finished playing");
      setCurrentStepIndex((prev) => prev + 1);
    },
    onError: (error: Error) => {
      logger.error("Streaming TTS error:", error);
      // Check if it's a service unavailable error
      if (error.message.includes('503') || error.message.includes('service is not available')) {
        logger.warn("Streaming TTS service unavailable, switching to browser TTS");
      } else {
        logger.warn("Streaming TTS failed, falling back to browser TTS");
      }
      setStreamingTTSEnabled(false);
      setUseBrowserTTS(true);
    },
    onChunkReady: (chunk: any) => {
      logger.debug(`Streaming TTS chunk ready: ${chunk.index}`);
    },
  });
  
  // Debug state changes
  useEffect(() => {
    logger.debug("isPlaying state changed:", isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    logger.debug("currentStepIndex state changed:", currentStepIndex);
  }, [currentStepIndex]);

  useEffect(() => {
    logger.debug("currentNarrationText changed:", {
      length: currentNarrationText.length,
      text: currentNarrationText ? currentNarrationText.substring(0, 100) + "..." : "empty",
      usePiperTTS,
      selectedVoice
    });
  }, [currentNarrationText, usePiperTTS, selectedVoice]);

  // Debug logging for voice selection (only on mount to prevent infinite re-renders)
  useEffect(() => {
    if (ttsSettings && ttsAvailability) {
      logger.debug("TTS Settings Evaluation:", {
        userId,
        ttsSettings: {
          provider: ttsSettings.provider,
          voice: ttsSettings.voice,
          speed: ttsSettings.speed,
          volume: ttsSettings.volume,
          streaming: ttsSettings.streaming
        },
        ttsAvailability: {
          available: ttsAvailability.available,
          service: ttsAvailability.service
        },
        computed: {
          effectiveSpeechRate,
          effectiveSpeechVolume,
          selectedVoice,
          currentVoiceId,
          useSettingsVoice,
          usePiperTTS,
          useBrowserTTS,
          streamingTTSEnabled,
          enableStreamingTTS
        }
      });
    }
  }, [ttsSettings, ttsAvailability]); // Only log when these core settings change
  
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
    
    // Add visual elements if they exist - enhanced with actual diagrams
    if (step.visual_elements && Array.isArray(step.visual_elements)) {
      let visualY = yStart + 150;
      step.visual_elements.forEach((visualEl, index) => {
        if (typeof visualEl === 'string') {
          const visualText = visualEl.toLowerCase();
          
          // Create different types of diagrams based on content
          if (visualText.includes('arrow') || visualText.includes('flow') || visualText.includes('leads to')) {
            // Create arrow diagram
            const arrowElements = makeLabeledRectangle({
              x: 80,
              y: visualY,
              width: 120,
              height: 40,
              label: "Start",
              fillColor: COLORS.light,
              shapeColor: COLORS.primary,
              strokeWidth: 2
            });
            elements.push(...arrowElements);
            
            // Arrow
            const arrowElement = makeText({
              x: 220,
              y: visualY + 15,
              text: "→",
              fontSize: 24,
              color: COLORS.primary,
              width: 30
            });
            elements.push(arrowElement);
            
            const endElements = makeLabeledRectangle({
              x: 270,
              y: visualY,
              width: 120,
              height: 40,
              label: "End",
              fillColor: COLORS.light,
              shapeColor: COLORS.secondary,
              strokeWidth: 2
            });
            elements.push(...endElements);
            visualY += 60;
            
          } else if (visualText.includes('vs') || visualText.includes('versus') || visualText.includes('comparison')) {
            // Create comparison diagram
            const leftElements = makeLabeledRectangle({
              x: 80,
              y: visualY,
              width: 150,
              height: 60,
              label: "Option A",
              fillColor: "#e3f2fd",
              shapeColor: COLORS.primary,
              strokeWidth: 2
            });
            elements.push(...leftElements);
            
            const vsElement = makeText({
              x: 250,
              y: visualY + 25,
              text: "VS",
              fontSize: 18,
              color: COLORS.BLACK,
              width: 30
            });
            elements.push(vsElement);
            
            const rightElements = makeLabeledRectangle({
              x: 300,
              y: visualY,
              width: 150,
              height: 60,
              label: "Option B",
              fillColor: "#fff3e0",
              shapeColor: COLORS.secondary,
              strokeWidth: 2
            });
            elements.push(...rightElements);
            visualY += 80;
            
          } else if (visualText.includes('circle') || visualText.includes('cycle') || visualText.includes('loop')) {
            // Create circular diagram (simplified as connected boxes)
            const centerX = 200;
            const centerY = visualY + 40;
            const radius = 60;
            
            for (let i = 0; i < 4; i++) {
              const angle = (i * Math.PI) / 2;
              const x = centerX + Math.cos(angle) * radius;
              const y = centerY + Math.sin(angle) * radius;
              
              const boxElements = makeLabeledRectangle({
                x: x - 25,
                y: y - 15,
                width: 50,
                height: 30,
                label: `${i + 1}`,
                fillColor: COLORS.light,
                shapeColor: COLORS.primary,
                strokeWidth: 1
              });
              elements.push(...boxElements);
            }
            visualY += 120;
            
          } else {
            // Default: simple labeled box with icon
            const iconMap: { [key: string]: string } = {
              'chart': '📊',
              'graph': '📈',
              'data': '📋',
              'money': '💰',
              'economy': '🏦',
              'market': '🏪',
              'people': '👥',
              'business': '🏢',
              'growth': '📈',
              'decline': '📉'
            };
            
            let icon = '📊';
            for (const [key, value] of Object.entries(iconMap)) {
              if (visualText.includes(key)) {
                icon = value;
                break;
              }
            }
            
            const visualElements = makeLabeledRectangle({
              x: 80,
              y: visualY,
              width: 400,
              height: 50,
              label: `${icon} ${visualEl}`,
              fillColor: "#f5f5f5",
              shapeColor: COLORS.secondary,
              strokeWidth: 1
            });
            elements.push(...visualElements);
            visualY += 70;
          }
        }
      });
    }
    
    // Add separator box (adjust height based on content and visual elements)
    const contentHeight = content ? content.split('\n').length * 25 : 0;
    const visualElementsHeight = step.visual_elements ? step.visual_elements.length * 80 : 0;
    const totalHeight = Math.max(300, 60 + contentHeight + visualElementsHeight);
    
    const separatorElements = makeLabeledRectangle({
      x: 30,
      y: yStart - 10,
      width: 700,
      height: totalHeight,
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

  // Request audio permission for autoplay
  const requestAudioPermission = useCallback(async () => {
    if (audioPermissionGranted) return true;
    
    try {
      // Try to play a silent audio to test autoplay permission
      const silentAudio = new Audio();
      silentAudio.volume = 0;
      silentAudio.muted = true;
      await silentAudio.play();
      silentAudio.pause();
      
      setAudioPermissionGranted(true);
      logger.debug("Audio permission granted");
      return true;
    } catch (error) {
      logger.warn("Audio autoplay not permitted - user interaction required:", error);
      return false;
    }
  }, [audioPermissionGranted]);

  const stopCurrentNarration = useCallback(() => {
    // Stop Streaming TTS if it's playing
    if (streamingTTS.status.isPlaying || streamingTTS.status.isGenerating) {
      streamingTTS.controls.stop();
      streamingTTS.controls.cancel();
    }
    
    // Stop Piper TTS if it's playing
    if (ttsAudio.audioElement) {
      ttsAudio.controls.pause();
      ttsAudio.controls.stop();
    }
    
    // Stop browser TTS if it's playing
    if (speechRef.current) {
      window.speechSynthesis.cancel();
      speechRef.current = null;
    }
    
    // Clear current narration text and reset states
    logger.debug("stopCurrentNarration: Clearing narration text and resetting TTS states");
    setCurrentNarrationText('');
    setFallbackNarrationText('');
    setUseBrowserTTS(false);
    setStreamingTTSEnabled(false);
  }, []); // Remove dependencies to prevent infinite loop

  const getNarrationText = useCallback((step: FlexibleLessonStep | LessonSlide): string => {
    logger.debug("Getting narration text from step:", {
      stepKeys: Object.keys(step),
      hasNarration: 'narration' in step && !!step.narration,
      hasExplanation: 'explanation' in step && !!step.explanation,
      hasContent: 'content' in step && !!step.content,
      narrationLength: 'narration' in step ? step.narration?.length : 0,
      explanationLength: 'explanation' in step ? step.explanation?.length : 0,
      contentLength: 'content' in step ? step.content?.length : 0
    });
    
    if ('narration' in step && step.narration) {
      logger.debug("Using narration field:", step.narration.substring(0, 100) + "...");
      return step.narration;
    }
    if ('explanation' in step && step.explanation) {
      logger.debug("Using explanation field:", step.explanation.substring(0, 100) + "...");
      return step.explanation;
    }
    if ('content' in step && step.content) {
      logger.debug("Using content field:", step.content.substring(0, 100) + "...");
      return step.content;
    }
    const fallbackText = `Step ${'step_number' in step ? step.step_number || 'Unknown' : 'Unknown'}: ${'title' in step ? step.title || 'Untitled' : 'Untitled'}`;
    logger.debug("Using fallback text:", fallbackText);
    return fallbackText;
  }, []);

  // Audio pre-generation functions
  const preGenerateAudio = useCallback(async (stepIndex: number, narrationText: string): Promise<string | null> => {
    if (!usePiperTTS || !ttsAvailability?.available || !narrationText.trim()) {
      return null;
    }

    // Check if already cached or being generated
    if (audioCache.has(stepIndex) || preGenerationQueue.has(stepIndex)) {
      return audioCache.get(stepIndex) || null;
    }

    try {
      // Mark as being generated
      setPreGenerationQueue(prev => new Set(prev).add(stepIndex));
      
      logger.debug(`Pre-generating audio for step ${stepIndex}:`, {
        textLength: narrationText.length,
        textPreview: narrationText.substring(0, 100) + "..."
      });

      // Generate audio using the TTS API
      const voiceId = getCurrentVoiceId();
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: narrationText,
          voice: voiceId
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const audioId = data.audio_id;
        
        // Cache the audio ID
        setAudioCache(prev => new Map(prev).set(stepIndex, audioId));
        logger.debug(`Successfully pre-generated audio for step ${stepIndex}: ${audioId}`);
        
        return audioId;
      } else {
        logger.warn(`Failed to pre-generate audio for step ${stepIndex}:`, response.status);
        return null;
      }
    } catch (error) {
      logger.error(`Error pre-generating audio for step ${stepIndex}:`, error);
      return null;
    } finally {
      // Remove from generation queue
      setPreGenerationQueue(prev => {
        const newSet = new Set(prev);
        newSet.delete(stepIndex);
        return newSet;
      });
    }
  }, [usePiperTTS, ttsAvailability?.available, getCurrentVoiceId, audioCache, preGenerationQueue]);

  const preGenerateUpcomingSlides = useCallback(async (currentStepIndex: number, steps: FlexibleLessonStep[]) => {
    if (!usePiperTTS || !ttsAvailability?.available || audioPreparationActive) {
      return;
    }

    setAudioPreparationActive(true);
    
    try {
      // Pre-generate audio for next 2-3 slides
      const lookAhead = 3;
      const promises: Promise<void>[] = [];

      for (let i = 1; i <= lookAhead; i++) {
        const futureStepIndex = currentStepIndex + i;
        if (futureStepIndex < steps.length) {
          const futureStep = steps[futureStepIndex];
          const futureNarrationText = getNarrationText(futureStep);
          
          if (futureNarrationText && !audioCache.has(futureStepIndex)) {
            promises.push(
              preGenerateAudio(futureStepIndex, futureNarrationText).then(() => {})
            );
          }
        }
      }

      // Wait for all pre-generation to complete
      await Promise.allSettled(promises);
      logger.debug(`Completed pre-generation for upcoming slides from step ${currentStepIndex}`);
      
    } catch (error) {
      logger.error("Error in pre-generation process:", error);
    } finally {
      setAudioPreparationActive(false);
    }
  }, [usePiperTTS, ttsAvailability?.available, audioPreparationActive, preGenerateAudio, getNarrationText, audioCache]);

  const cleanupOldAudio = useCallback((currentStepIndex: number) => {
    // Clean up audio cache for steps that are more than 2 slides behind
    const cleanupThreshold = 2;
    const newCache = new Map(audioCache);
    let cleanedCount = 0;

    for (const [stepIndex] of audioCache) {
      if (stepIndex < currentStepIndex - cleanupThreshold) {
        newCache.delete(stepIndex);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      setAudioCache(newCache);
      logger.debug(`Cleaned up ${cleanedCount} old audio cache entries`);
    }
  }, [audioCache]);

  const playNextStep = useCallback(() => {
    const currentSteps = getCurrentSteps();
    logger.debug("PlayNextStep called:", {
      currentStepIndex,
      totalSteps: currentSteps.length,
      isPlaying,
      hasExcalidrawAPI: !!excalidrawAPI
    });
    
    if (!excalidrawAPI || currentStepIndex >= currentSteps.length || !isPlaying) {
      if (!excalidrawAPI) {
        logger.warn("PlayNextStep: ExcalidrawAPI not ready, pausing playback");
        setIsPlaying(false);
      } else if (currentStepIndex >= currentSteps.length) {
        logger.debug("Lesson completed");
        setIsPlaying(false);
        onComplete?.();
      } else if (!isPlaying) {
        logger.debug("PlayNextStep: Not playing, exiting");
      }
      logger.debug("Exiting playNextStep early:", {
        hasAPI: !!excalidrawAPI,
        stepIndexValid: currentStepIndex < currentSteps.length,
        isPlaying
      });
      return;
    }

    const step = currentSteps[currentStepIndex];
    logger.debug("Processing step:", {
      stepIndex: currentStepIndex,
      step: {
        title: step.title,
        hasNarration: 'narration' in step && !!step.narration,
        hasExplanation: 'explanation' in step && !!step.explanation,
        hasContent: 'content' in step && !!step.content,
        hasElements: step.elements?.length || 0
      }
    });
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
    logger.debug("Extracted narration text:", {
      stepNumber: step.step_number || currentStepIndex + 1,
      stepTitle: step.title,
      extractedTextLength: narrationText.length,
      extractedTextPreview: narrationText.substring(0, 100) + "...",
      stepHasNarration: 'narration' in step && !!step.narration,
      stepHasExplanation: 'explanation' in step && !!step.explanation,
      stepHasContent: 'content' in step && !!step.content
    });

    // Clean up old audio cache entries
    cleanupOldAudio(currentStepIndex);

    // Start pre-generation for upcoming slides (non-blocking)
    const allSteps = getCurrentSteps();
    preGenerateUpcomingSlides(currentStepIndex, allSteps);
    
    logger.debug("TTS Decision Point:", {
      narrationText: narrationText ? narrationText.substring(0, 100) + "..." : "NO TEXT",
      isMuted,
      enableStreamingTTS,
      useBrowserTTS,
      streamingTTSEnabled,
      usePiperTTS,
      ttsAvailabilityAvailable: ttsAvailability?.available,
      speechSynthesisAvailable: typeof window !== "undefined" && "speechSynthesis" in window,
      hasCachedAudio: audioCache.has(currentStepIndex)
    });
    
    if (narrationText && !isMuted) {
      logger.debug("Starting TTS playback for step", currentStepIndex);
      
      // Check if we have pre-generated audio for this step
      const cachedAudioId = audioCache.get(currentStepIndex);
      
      if (usePiperTTS && cachedAudioId && ttsAvailability?.available) {
        // Use pre-generated audio - create direct audio element
        logger.debug("Using pre-generated audio for step", currentStepIndex, "audio ID:", cachedAudioId);
        
        try {
          const audioUrl = `/api/tts/audio/${cachedAudioId}`;
          const preGeneratedAudio = new Audio(audioUrl);
          preGeneratedAudio.volume = effectiveSpeechVolume;
          preGeneratedAudio.playbackRate = effectiveSpeechRate;

          preGeneratedAudio.oncanplaythrough = () => {
            logger.debug("Pre-generated audio ready, starting playback");
            preGeneratedAudio.play().catch(error => {
              logger.error("Failed to play pre-generated audio:", error);
              // Fallback to browser TTS
              setUseBrowserTTS(true);
              setFallbackNarrationText(narrationText);
            });
          };

          preGeneratedAudio.onended = () => {
            logger.debug("Pre-generated audio finished, advancing to next step");
            setCurrentStepIndex((prev) => prev + 1);
          };

          preGeneratedAudio.onerror = (error) => {
            logger.error("Pre-generated audio error:", error);
            // Fallback to browser TTS
            setUseBrowserTTS(true);
            setFallbackNarrationText(narrationText);
          };

          // Start loading the audio
          preGeneratedAudio.load();
          
        } catch (error) {
          logger.error("Error setting up pre-generated audio:", error);
          // Fallback to browser TTS
          setUseBrowserTTS(true);
          setFallbackNarrationText(narrationText);
        }
        
      } else if (usePiperTTS && !useBrowserTTS && !streamingTTSEnabled && ttsAvailability?.available) {
        // Generate audio in real-time (original behavior) - only for first slide or cache misses
        logger.debug("Generating audio in real-time for step", currentStepIndex);
        logger.debug("Attempting Piper TTS with params:", {
          text: narrationText.substring(0, 100) + "...",
          voice: currentVoiceId,
          selectedVoiceName: selectedVoice,
          usePiperTTS,
          ttsAvailable: ttsAvailability?.available
        });
        
        // Set text for TTS hook to generate audio
        logger.debug("Setting narration text for hook:", {
          narrationTextLength: narrationText.length,
          narrationTextPreview: narrationText.substring(0, 100) + "...",
          isEmptyString: narrationText === "",
          isNullOrUndefined: narrationText == null
        });
        // Store the text for potential fallback use
        setFallbackNarrationText(narrationText);
        setCurrentNarrationText(narrationText);
        
        // Hook will autoPlay when audio is ready - no polling needed
      } else if ("speechSynthesis" in window) {
        // Fallback to browser TTS
        logger.debug("Attempting Browser TTS");
        const utterance = new SpeechSynthesisUtterance(narrationText);
        utterance.rate = effectiveSpeechRate;
        utterance.volume = effectiveSpeechVolume;
        
        // Apply voice selection from settings
        const voice = getSelectedVoice();
        if (voice) {
          utterance.voice = voice;
          logger.debug(`Using browser voice: ${voice.name} (${voice.lang})`);
        } else {
          logger.debug("Using default browser voice - no custom voice selected or available");
        }

        speechRef.current = utterance;

        utterance.onstart = () => {
          logger.debug("Browser TTS started speaking");
        };

        utterance.onend = () => {
          logger.debug("Browser TTS finished speaking, advancing to next step");
          setCurrentStepIndex((prev) => prev + 1);
        };

        utterance.onerror = (event) => {
          logger.error("Speech synthesis error:", event);
          logger.debug("Browser TTS error, advancing to next step");
          setCurrentStepIndex((prev) => prev + 1);
        };

        window.speechSynthesis.speak(utterance);
      } else {
        // No TTS available, just advance
        logger.warn("No TTS method available, advancing to next step");
        setTimeout(() => {
          setCurrentStepIndex((prev) => prev + 1);
        }, 2000);
      }
    } else {
      if (!narrationText) {
        logger.warn("No narration text found for step", currentStepIndex);
      }
      if (isMuted) {
        logger.debug("Audio is muted, advancing to next step");
      }
      setTimeout(() => {
        setCurrentStepIndex((prev) => prev + 1);
      }, 2000);
    }
  }, [
    excalidrawAPI, currentStepIndex, isPlaying, debouncedUpdateScene, regenerateIndices,
    getNarrationText, effectiveSpeechRate, effectiveSpeechVolume, isMuted, onStepChange,
    onComplete, getCurrentSteps, generateElementsFromStep, mode, getSelectedVoice,
    usePiperTTS, useBrowserTTS, streamingTTSEnabled, enableStreamingTTS, ttsAudio, streamingTTS,
    audioCache, cleanupOldAudio, preGenerateUpcomingSlides, ttsAvailability, currentVoiceId
  ]);

  const handleLessonChange = useCallback(async (lessonName: string) => {
    if (mode !== 'legacy') return;
    
    setIsLoading(true);
    stopCurrentNarration();
    setIsPlaying(false);
    setCurrentStepIndex(0);
    accumulatedElements.current = [];

    // Clear audio cache for new lesson
    setAudioCache(new Map());
    setPreGenerationQueue(new Set());
    setAudioPreparationActive(false);

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
    // Prevent double-clicks
    if (togglePlayPauseRef.current) {
      logger.debug("TogglePlayPause ignored - already processing");
      return;
    }
    
    togglePlayPauseRef.current = true;
    
    const currentSteps = getCurrentSteps();
    logger.debug("TogglePlayPause called:", {
      isPlaying,
      currentStepIndex,
      totalSteps: currentSteps.length,
      hasSteps: currentSteps.length > 0
    });
    
    if (isPlaying) {
      logger.debug("Pausing playback");
      stopCurrentNarration();
      setIsPlaying(false);
    } else {
      logger.debug("Starting playback");
      
      // Set playing state immediately, don't wait for audio permission
      logger.debug("Setting isPlaying to true");
      setIsPlaying(true);
      
      // Request audio permission in parallel
      requestAudioPermission().then(audioPermitted => {
        logger.debug("Audio permission result:", audioPermitted);
      });
      
      if (currentStepIndex >= currentSteps.length) {
        logger.debug("Resetting to first step");
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
    }
    
    // Reset the flag after a short delay
    setTimeout(() => {
      togglePlayPauseRef.current = false;
    }, 300);
  }, [isPlaying, currentStepIndex, stopCurrentNarration, excalidrawAPI, getCurrentSteps, requestAudioPermission]);

  const resetLesson = useCallback(() => {
    const currentSteps = getCurrentSteps();
    
    stopCurrentNarration();
    setIsPlaying(false);
    setCurrentStepIndex(0);
    accumulatedElements.current = [];

    // Clear audio cache on reset
    setAudioCache(new Map());
    setPreGenerationQueue(new Set());
    setAudioPreparationActive(false);

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

  // Initialize first step and pre-generate initial audio
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

        // Start pre-generation for the first few slides
        if (usePiperTTS && ttsAvailability?.available && currentSteps.length > 1) {
          logger.debug("Starting initial pre-generation for lesson");
          preGenerateUpcomingSlides(-1, currentSteps); // Start from step -1 to include step 0, 1, 2
        }
      }
    }
  }, [excalidrawAPI, debouncedUpdateScene, regenerateIndices, generateElementsFromStep, getCurrentSteps, usePiperTTS, ttsAvailability, preGenerateUpcomingSlides]);

  // Handle step progression - simplified to avoid dependency loops
  useEffect(() => {
    if (!isPlaying) return;
    
    logger.debug("Step progression: Starting timer for step", currentStepIndex);
    
    const timer = setTimeout(() => {
      if (!isPlaying) {
        logger.debug("Step progression: No longer playing, aborting");
        return;
      }
      
      if (!excalidrawAPI) {
        logger.warn("Step progression: ExcalidrawAPI not ready, waiting...");
        // Don't pause, just wait for API to be ready
        return;
      }
      
      const currentSteps = getCurrentSteps();
      if (currentStepIndex >= currentSteps.length) {
        logger.debug("Step progression: Lesson completed");
        setIsPlaying(false);
        onComplete?.();
        return;
      }
      
      logger.debug("Step progression: Executing step", currentStepIndex);
      playNextStep();
    }, 200);
    
    return () => {
      clearTimeout(timer);
    };
  }, [isPlaying, currentStepIndex, excalidrawAPI]); // Minimal stable dependencies

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

  // Handle fallback to browser TTS when Piper TTS fails
  useEffect(() => {
    if (useBrowserTTS && !isMuted && isPlaying) {
      // Use fallback text if available, otherwise current text
      const textToSpeak = fallbackNarrationText || currentNarrationText;
      
      if (textToSpeak && "speechSynthesis" in window) {
        logger.debug("Starting browser TTS fallback", {
          textLength: textToSpeak.length,
          textPreview: textToSpeak.substring(0, 100) + "...",
          usingFallbackText: !!fallbackNarrationText
        });
        
        // Clear the current narration text to prevent Piper TTS from trying again
        setCurrentNarrationText('');
        
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = effectiveSpeechRate;
        utterance.volume = effectiveSpeechVolume;
        
        // Apply voice selection from settings
        const voice = getSelectedVoice();
        if (voice) {
          utterance.voice = voice;
          logger.debug(`Using fallback voice: ${voice.name} (${voice.lang})`);
        }

        speechRef.current = utterance;

        utterance.onend = () => {
          logger.debug("Browser TTS fallback finished, advancing to next step");
          setCurrentStepIndex((prev) => prev + 1);
          // Reset browser TTS flag and clear fallback text after completion
          setUseBrowserTTS(false);
          setFallbackNarrationText('');
        };

        utterance.onerror = (event) => {
          logger.error("Fallback speech synthesis error:", event);
          setCurrentStepIndex((prev) => prev + 1);
          // Reset browser TTS flag and clear fallback text after error
          setUseBrowserTTS(false);
          setFallbackNarrationText('');
        };

        window.speechSynthesis.speak(utterance);
      } else if (!textToSpeak) {
        logger.warn("No text available for browser TTS fallback, advancing to next step");
        setTimeout(() => {
          setCurrentStepIndex((prev) => prev + 1);
          setUseBrowserTTS(false);
        }, 2000);
      } else {
        // No browser TTS available either
        logger.warn("No browser TTS available, advancing to next step");
        setTimeout(() => {
          setCurrentStepIndex((prev) => prev + 1);
          setUseBrowserTTS(false);
        }, 2000);
      }
    }
  }, [useBrowserTTS, fallbackNarrationText, currentNarrationText, isMuted, isPlaying, effectiveSpeechRate, effectiveSpeechVolume, getSelectedVoice]);
  
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
              
              {/* TTS Status */}
              {streamingTTSEnabled && (
                <span className="text-blue-400 text-xs whitespace-nowrap">
                  {streamingTTS.status.isGenerating ? (
                    `Generating ${streamingTTS.status.generatedChunks}/${streamingTTS.status.totalChunks} chunks`
                  ) : streamingTTS.status.isPlaying ? (
                    `Playing chunk ${streamingTTS.status.currentChunk + 1}/${streamingTTS.status.totalChunks}`
                  ) : (
                    `Ready (${streamingTTS.status.totalChunks} chunks)`
                  )}
                </span>
              )}
              
              {/* Audio Pre-generation Status */}
              {usePiperTTS && (audioPreparationActive || preGenerationQueue.size > 0) && (
                <span className="text-green-400 text-xs whitespace-nowrap">
                  {audioPreparationActive ? (
                    `Pre-generating audio (${preGenerationQueue.size} pending)`
                  ) : (
                    `Audio ready (${audioCache.size} cached)`
                  )}
                </span>
              )}
              
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