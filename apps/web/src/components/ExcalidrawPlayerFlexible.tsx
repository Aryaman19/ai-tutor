import "@excalidraw/excalidraw/index.css";
import { useState, useRef, useEffect, useCallback } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "../utils/excalidraw";
import { regenerateElementIndices, makeText, makeLabeledRectangle, COLORS } from "../utils/excalidraw";

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

interface ExcalidrawPlayerFlexibleProps {
  steps?: FlexibleLessonStep[];
  autoPlay?: boolean;
  speechRate?: number;
  speechVolume?: number;
  testMode?: boolean;
  onStepChange?: (stepIndex: number) => void;
  onComplete?: () => void;
}

export default function ExcalidrawPlayerFlexible({
  steps = [],
  autoPlay = false,
  speechRate = 0.9,
  speechVolume = 0.8,
  testMode = false,
  onStepChange,
  onComplete,
}: ExcalidrawPlayerFlexibleProps) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const accumulatedElements = useRef<ExcalidrawElement[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Function to generate basic Excalidraw elements from lesson step data
  const generateElementsFromStep = useCallback((step: FlexibleLessonStep, stepIndex: number): ExcalidrawElement[] => {
    const elements: ExcalidrawElement[] = [];
    const yStart = 50 + (stepIndex * 200); // Offset each step vertically
    
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
      // Split long content into chunks for better display
      const maxCharsPerLine = 80;
      const lines = content.split('\n').flatMap(line => {
        if (line.length <= maxCharsPerLine) return [line];
        // Split long lines into chunks
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
    
    // Add visual elements if they exist as text descriptions
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
    
    // Add a separator box for each step
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
      // Generate new clean fractional indices
      index: `a${(index + 1).toString(36).padStart(4, "0")}`,
      // Ensure unique IDs to prevent conflicts
      id: element.id.includes(":")
        ? `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        : element.id,
      // Update version nonce to trigger re-render
      versionNonce: Math.floor(Math.random() * 2147483647),
      updated: Date.now(),
      // Fix element format for Excalidraw
      version: element.version || 1,
      opacity: typeof element.opacity === 'number' && element.opacity <= 1 ? element.opacity * 100 : (element.opacity || 100),
      boundElements: element.boundElements || [],
    }));
  }, []);

  // Debounced scene update function with index regeneration
  const debouncedUpdateScene = useCallback(
    (elements: ExcalidrawElement[], currentElements: ExcalidrawElement[], delay = 150) => {
      // Clear any existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set up new debounced timer
      debounceTimerRef.current = setTimeout(() => {
        if (!excalidrawAPI) return;

        try {
          // Clean the elements
          const cleanElements = regenerateIndices(elements);

          // Update the scene with cleaned elements
          excalidrawAPI.updateScene({
            elements: cleanElements,
            appState: { viewBackgroundColor: "#fafafa" },
          });

          // Scroll to new content with animation
          if (currentElements && currentElements.length > 0) {
            setTimeout(() => {
              try {
                excalidrawAPI.scrollToContent(cleanElements, {
                  fitToViewport: false,
                  animate: true,
                  duration: 600,
                });
              } catch (scrollError) {
                console.warn("Scroll failed:", scrollError);
              }
            }, 50);
          }

          console.log("Scene update successful");
        } catch (error) {
          console.error("Scene update failed:", error);
          
          // Fallback: clear and rebuild
          try {
            excalidrawAPI.updateScene({
              elements: [],
              appState: { viewBackgroundColor: "#fafafa" },
            });

            setTimeout(() => {
              const fallbackElements = elements.map((el, idx) => ({
                ...el,
                index: `fallback_${idx}`,
                id: `fallback_${Date.now()}_${idx}`,
                version: 1,
                opacity: 100,
                boundElements: [],
              }));

              excalidrawAPI.updateScene({
                elements: fallbackElements,
                appState: { viewBackgroundColor: "#fafafa" },
              });
            }, 100);
          } catch (finalError) {
            console.error("Fallback update failed:", finalError);
          }
        }
      }, delay);
    },
    [excalidrawAPI, regenerateIndices]
  );

  const stopCurrentNarration = useCallback(() => {
    if (speechRef.current) {
      window.speechSynthesis.cancel();
      speechRef.current = null;
    }
  }, []);

  const getNarrationText = useCallback((step: FlexibleLessonStep): string => {
    return step.narration || step.explanation || step.content || `Step ${step.step_number || 'Unknown'}: ${step.title || 'Untitled'}`;
  }, []);

  const playNextStep = useCallback(() => {
    if (!excalidrawAPI || currentStepIndex >= steps.length || !isPlaying) {
      if (currentStepIndex >= steps.length) {
        setIsPlaying(false);
        onComplete?.();
      }
      return;
    }

    const step = steps[currentStepIndex];
    let currentElements = step.elements || [];
    
    // If no elements exist, generate them from the step data
    if (currentElements.length === 0) {
      currentElements = generateElementsFromStep(step, currentStepIndex);
      console.log(`Generated ${currentElements.length} elements for step ${currentStepIndex + 1}`);
    }
    
    // Debug logging
    console.log(`PlayNextStep - Step ${currentStepIndex + 1}:`, step);
    console.log(`Elements found:`, currentElements.length);
    console.log(`Visual elements:`, step.visual_elements);
    console.log(`Step data:`, { title: step.title, explanation: step.explanation, narration: step.narration });

    // Clean the new elements before adding them
    const cleanedCurrentElements = regenerateIndices(currentElements);

    // Add new elements to accumulated elements (or replace if it's the first step)
    if (currentStepIndex === 0) {
      accumulatedElements.current = [...cleanedCurrentElements];
    } else {
      accumulatedElements.current.push(...cleanedCurrentElements);
    }

    // Use debounced update
    debouncedUpdateScene(accumulatedElements.current, cleanedCurrentElements);

    // Notify step change
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
        console.error("Speech synthesis error:", event);
        setCurrentStepIndex((prev) => prev + 1);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      // If no speech synthesis or muted, just move to next step after a delay
      setTimeout(() => {
        setCurrentStepIndex((prev) => prev + 1);
      }, testMode ? 1000 : 2000);
    }
  }, [
    excalidrawAPI,
    currentStepIndex,
    steps.length,
    isPlaying,
    debouncedUpdateScene,
    regenerateIndices,
    getNarrationText,
    speechRate,
    speechVolume,
    isMuted,
    testMode,
    onStepChange,
    onComplete,
  ]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      stopCurrentNarration();
      setIsPlaying(false);
    } else {
      if (currentStepIndex >= steps.length) {
        // Restart from beginning if at end
        setCurrentStepIndex(0);
        accumulatedElements.current = [];
        if (excalidrawAPI) {
          excalidrawAPI.updateScene({
            elements: [],
            appState: { viewBackgroundColor: "#fafafa" },
          });
        }
      }
      setIsPlaying(true);
    }
  }, [isPlaying, currentStepIndex, steps.length, stopCurrentNarration, excalidrawAPI]);

  const resetLesson = useCallback(() => {
    stopCurrentNarration();
    setIsPlaying(false);
    setCurrentStepIndex(0);
    accumulatedElements.current = [];

    // Clear pending debounced updates
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (excalidrawAPI && steps.length > 0) {
      let firstStepElements = steps[0].elements || [];
      // Generate elements if none exist
      if (firstStepElements.length === 0) {
        firstStepElements = generateElementsFromStep(steps[0], 0);
      }
      const cleanedFirstStep = regenerateIndices(firstStepElements);
      accumulatedElements.current = [...cleanedFirstStep];

      // Use debounced update for reset
      debouncedUpdateScene(accumulatedElements.current, cleanedFirstStep, 100);
    }
  }, [excalidrawAPI, stopCurrentNarration, debouncedUpdateScene, regenerateIndices, generateElementsFromStep, steps]);

  const goToStep = useCallback((stepIndex: number) => {
    if (stepIndex < 0 || stepIndex >= steps.length) return;
    
    stopCurrentNarration();
    setCurrentStepIndex(stepIndex);
    
    // Rebuild elements up to this step
    accumulatedElements.current = [];
    for (let i = 0; i <= stepIndex; i++) {
      let stepElements = steps[i].elements || [];
      // Generate elements if none exist
      if (stepElements.length === 0) {
        stepElements = generateElementsFromStep(steps[i], i);
      }
      const cleanedElements = regenerateIndices(stepElements);
      accumulatedElements.current.push(...cleanedElements);
    }

    // Update scene
    debouncedUpdateScene(accumulatedElements.current, accumulatedElements.current, 100);
  }, [steps, stopCurrentNarration, debouncedUpdateScene, regenerateIndices, generateElementsFromStep]);

  // Initialize first step when steps are available
  useEffect(() => {
    if (excalidrawAPI && steps.length > 0 && currentStepIndex === 0) {
      let firstStepElements = steps[0].elements || [];
      // Generate elements if none exist
      if (firstStepElements.length === 0) {
        firstStepElements = generateElementsFromStep(steps[0], 0);
      }
      if (firstStepElements.length > 0) {
        const cleanedFirstStep = regenerateIndices(firstStepElements);
        accumulatedElements.current = [...cleanedFirstStep];
        debouncedUpdateScene(accumulatedElements.current, cleanedFirstStep, 100);
      }
    }
  }, [excalidrawAPI, steps, debouncedUpdateScene, regenerateIndices, generateElementsFromStep]);

  // Handle step progression
  useEffect(() => {
    if (isPlaying && currentStepIndex < steps.length) {
      const timer = setTimeout(() => {
        playNextStep();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, currentStepIndex, steps.length, playNextStep]);

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
    if (isPlaying) return "⏸️ Pause";
    if (currentStepIndex === 0) return "▶️ Play";
    if (currentStepIndex >= steps.length) return "🔄 Restart";
    return "▶️ Resume";
  };

  if (!steps.length) {
    return (
      <div style={{ height: "600px", width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#666", fontSize: "18px" }}>No lesson steps available</p>
      </div>
    );
  }

  return (
    <div style={{ height: "600px", width: "100%" }}>
      <div
        style={{
          marginBottom: "10px",
          display: "flex",
          gap: "10px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={togglePlayPause}
          style={{ padding: "8px 16px", fontSize: "14px" }}
        >
          {getPlayButtonText()}
        </button>

        <button
          onClick={resetLesson}
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

        <button
          onClick={() => {
            if (excalidrawAPI) {
              const testElements = [
                {
                  id: "test-hello-world",
                  type: "text",
                  x: 100,
                  y: 100,
                  width: 200,
                  height: 50,
                  angle: 0,
                  strokeColor: "#000000",
                  backgroundColor: "#ff0000",
                  fillStyle: "solid",
                  strokeWidth: 2,
                  strokeStyle: "solid",
                  roughness: 1,
                  opacity: 100,
                  groupIds: [],
                  frameId: null,
                  roundness: null,
                  seed: 12345,
                  versionNonce: 67890,
                  isDeleted: false,
                  boundElements: [],
                  updated: Date.now(),
                  link: null,
                  locked: false,
                  index: "a0001",
                  version: 1,
                  text: "Hello World!",
                  fontSize: 28,
                  fontFamily: 1,
                  textAlign: "left",
                  verticalAlign: "top",
                  baseline: 28,
                  originalText: "Hello World!",
                  lineHeight: 1.25,
                  containerId: null,
                }
              ];
              
              excalidrawAPI.updateScene({
                elements: testElements,
                appState: { viewBackgroundColor: "#fafafa" },
              });
              console.log("Manual test elements added");
            }
          }}
          style={{ padding: "8px 16px", fontSize: "14px", backgroundColor: "#4CAF50", color: "white" }}
        >
          🧪 Manual Test
        </button>

        <button
          onClick={() => {
            console.log("=== DEBUG: Current Steps Data ===");
            console.log("Steps length:", steps.length);
            steps.forEach((step, index) => {
              console.log(`Step ${index + 1}:`, {
                title: step.title,
                elements: step.elements?.length || 0,
                visual_elements: step.visual_elements?.length || 0,
                explanation: !!step.explanation,
                narration: !!step.narration,
                step_number: step.step_number
              });
            });
            if (steps[currentStepIndex]) {
              console.log("Current step full data:", steps[currentStepIndex]);
            }
          }}
          style={{ padding: "8px 16px", fontSize: "14px", backgroundColor: "#2196F3", color: "white" }}
        >
          🔍 Debug Data
        </button>

        <button
          onClick={() => {
            if (excalidrawAPI && steps.length > 0) {
              const testStep = steps[currentStepIndex] || steps[0];
              const generatedElements = generateElementsFromStep(testStep, currentStepIndex);
              const cleanedElements = regenerateIndices(generatedElements);
              
              excalidrawAPI.updateScene({
                elements: cleanedElements,
                appState: { viewBackgroundColor: "#fafafa" },
              });
              console.log(`Generated ${cleanedElements.length} elements for current step`);
              console.log("Generated elements:", cleanedElements);
            }
          }}
          style={{ padding: "8px 16px", fontSize: "14px", backgroundColor: "#9C27B0", color: "white" }}
        >
          🎨 Test Generated
        </button>

        <span style={{ fontSize: "14px", color: "#666" }}>
          Step {Math.min(currentStepIndex + 1, steps.length)} of {steps.length}
        </span>

        {steps[currentStepIndex] && (
          <span style={{ fontSize: "14px", color: "#333", fontWeight: "500" }}>
            {steps[currentStepIndex].title || `Step ${steps[currentStepIndex].step_number || currentStepIndex + 1}`}
          </span>
        )}

        {/* Step navigation */}
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
            disabled={currentStepIndex >= steps.length - 1}
            style={{ 
              padding: "4px 8px", 
              fontSize: "12px",
              opacity: currentStepIndex >= steps.length - 1 ? 0.5 : 1
            }}
          >
            Next →
          </button>
        </div>
      </div>

      <Excalidraw
        excalidrawAPI={(api) => {
          console.log("Excalidraw API ready for flexible player");
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