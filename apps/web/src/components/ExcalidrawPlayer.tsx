import "@excalidraw/excalidraw/index.css";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { PlayIcon, PauseIcon, RotateCcwIcon, VolumeXIcon, Volume2Icon } from "lucide-react";
import { Button } from "@ai-tutor/ui";
import { Card, CardContent } from "@ai-tutor/ui";
import { cn } from "@ai-tutor/utils";
import type { ExcalidrawElement, LessonStep } from "../utils/excalidraw";
import { regenerateElementIndices } from "../utils/excalidraw";
import { generateSampleLesson } from "../utils/testData";

interface ExcalidrawPlayerProps {
  steps: LessonStep[];
  className?: string;
  autoPlay?: boolean;
  speechRate?: number;
  speechVolume?: number;
  testMode?: boolean;
}

const ExcalidrawPlayer: React.FC<ExcalidrawPlayerProps> = ({
  steps,
  className,
  autoPlay = false,
  speechRate = 1,
  speechVolume = 1,
  testMode = false
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [accumulatedElements, setAccumulatedElements] = useState<ExcalidrawElement[]>([]);
  
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<{elements: ExcalidrawElement[], currentElements: ExcalidrawElement[]} | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // Use test data if test mode is enabled
  const actualSteps = testMode ? generateSampleLesson() : steps;

  // Reset when steps or test mode changes
  useEffect(() => {
    console.log('[ExcalidrawPlayer] Resetting due to steps/testMode change');
    setCurrentStepIndex(0);
    setAccumulatedElements([]);
    setIsPlaying(false);
    speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [testMode, steps]);

  // Force reset currentStepIndex if it's out of bounds
  useEffect(() => {
    if (currentStepIndex >= actualSteps.length && actualSteps.length > 0) {
      console.log('[ExcalidrawPlayer] Current step index out of bounds, resetting to 0');
      setCurrentStepIndex(0);
    }
  }, [currentStepIndex, actualSteps.length]);

  // Initialize speech synthesis
  useEffect(() => {
    if ('speechSynthesis' in window) {
      // Load voices
      const loadVoices = () => {
        const voices = speechSynthesis.getVoices();
        console.log('Available voices:', voices.length);
      };
      
      speechSynthesis.addEventListener('voiceschanged', loadVoices);
      loadVoices();
      
      return () => {
        speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      };
    }
  }, []);

  // Sophisticated debounced scene update (from POC)
  const updateExcalidrawScene = useCallback((elements: ExcalidrawElement[], currentElements: ExcalidrawElement[] = [], delay = 150) => {
    if (!excalidrawAPI) return;

    // Clear any existing timer
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Store the pending update
    pendingUpdateRef.current = { elements, currentElements };

    // Set up new debounced timer
    debounceTimeoutRef.current = setTimeout(() => {
      if (!excalidrawAPI || !pendingUpdateRef.current) return;

      const { elements: pendingElements, currentElements: pendingCurrentElements } = pendingUpdateRef.current;

      // First attempt: try with clean indices
      const cleanElements = regenerateElementIndices(pendingElements);

      const attemptUpdate = (elementsToUpdate: ExcalidrawElement[], attempt = 1) => {
        try {
          console.log(`Attempting scene update (attempt ${attempt}) with ${elementsToUpdate.length} elements`);
          
          // Update the scene with cleaned elements
          excalidrawAPI.updateScene({
            elements: elementsToUpdate,
            appState: { viewBackgroundColor: "#fafafa" },
          });

          // Scroll to new content with animation (also debounced)
          if (pendingCurrentElements && pendingCurrentElements.length > 0) {
            setTimeout(() => {
              try {
                // Find corresponding elements in cleaned array for scrolling
                const scrollElements = pendingCurrentElements.map((origEl) => {
                  const cleanEl = elementsToUpdate.find(
                    (el) =>
                      el.type === origEl.type &&
                      el.x === origEl.x &&
                      el.y === origEl.y
                  );
                  return cleanEl || origEl;
                });

                excalidrawAPI.scrollToContent(scrollElements, {
                  fitToViewport: false,
                  animate: true,
                  duration: 600,
                });
              } catch (scrollError) {
                console.warn("Scroll after debounced update failed:", scrollError);
                // Fallback scroll to all elements
                try {
                  excalidrawAPI.scrollToContent(elementsToUpdate, {
                    fitToViewport: true,
                    animate: true,
                    duration: 600,
                  });
                } catch (fallbackError) {
                  console.warn("Fallback scroll also failed:", fallbackError);
                }
              }
            }, 300);
          }

          retryCountRef.current = 0;
          console.log("Scene update successful");
        } catch (error: any) {
          console.warn(`Scene update attempt ${attempt} failed:`, error);
          
          if (attempt < maxRetries) {
            const delay = attempt * 500;
            console.log(`Retrying in ${delay}ms...`);
            setTimeout(() => {
              // Try with completely regenerated elements
              const freshElements = regenerateElementIndices(pendingElements);
              attemptUpdate(freshElements, attempt + 1);
            }, delay);
          } else {
            console.error("Max retry attempts reached. Clearing scene and rebuilding...");
            try {
              excalidrawAPI.updateScene({ elements: [] });
              setTimeout(() => {
                const freshElements = regenerateElementIndices(pendingElements);
                attemptUpdate(freshElements, 1);
              }, 1000);
            } catch (clearError) {
              console.error("Failed to clear and rebuild scene:", clearError);
            }
          }
        }
      };

      attemptUpdate(cleanElements);
    }, delay);
  }, [excalidrawAPI]);

  // Auto-play on mount if enabled
  useEffect(() => {
    if (autoPlay && actualSteps.length > 0) {
      setIsPlaying(true);
    }
  }, [autoPlay, actualSteps]);

  // Initialize first step when API is ready
  useEffect(() => {
    if (excalidrawAPI && actualSteps.length > 0 && currentStepIndex === 0) {
      console.log('[ExcalidrawPlayer] Initializing first step');
      const firstStep = actualSteps[0];
      if (firstStep.elements && firstStep.elements.length > 0) {
        const initialElements = firstStep.elements as ExcalidrawElement[];
        setAccumulatedElements(initialElements);
        updateExcalidrawScene(initialElements, initialElements, 100);
      }
    }
  }, [excalidrawAPI, actualSteps, currentStepIndex, updateExcalidrawScene]);

  // Update accumulated elements when step changes
  useEffect(() => {
    if (actualSteps.length === 0) return;

    const currentStep = actualSteps[currentStepIndex];
    if (!currentStep) return;

    console.log(`[ExcalidrawPlayer] Processing step ${currentStepIndex}:`, {
      title: currentStep.title,
      hasElements: !!currentStep.elements,
      elementsCount: currentStep.elements?.length || 0,
      elements: currentStep.elements
    });

    // Add current step elements to accumulated elements
    let newElements: ExcalidrawElement[] = [];
    let currentStepElements: ExcalidrawElement[] = [];
    
    if (currentStep.elements && currentStep.elements.length > 0) {
      currentStepElements = currentStep.elements as ExcalidrawElement[];
      
      // For step 0, start fresh. For other steps, accumulate
      if (currentStepIndex === 0) {
        newElements = [...currentStepElements];
      } else {
        newElements = [...accumulatedElements, ...currentStepElements];
      }
      
      setAccumulatedElements(newElements);
      
      console.log(`[ExcalidrawPlayer] Step ${currentStepIndex}: Added ${currentStepElements.length} elements. Total: ${newElements.length}`);
    } else {
      console.log(`[ExcalidrawPlayer] No elements found in step ${currentStepIndex}`);
      newElements = [...accumulatedElements];
    }

    // Use the new signature with current step elements for scrolling
    updateExcalidrawScene(newElements, currentStepElements);
  }, [currentStepIndex, actualSteps, updateExcalidrawScene, accumulatedElements]);

  // Speech synthesis
  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window) || isMuted || !text.trim()) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      // Cancel any ongoing speech
      speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = speechRate;
      utterance.volume = speechVolume;
      
      // Try to use a clear English voice
      const voices = speechSynthesis.getVoices();
      const englishVoice = voices.find(voice => 
        voice.lang.startsWith('en') && 
        (voice.name.includes('Google') || voice.name.includes('Microsoft'))
      ) || voices.find(voice => voice.lang.startsWith('en'));
      
      if (englishVoice) {
        utterance.voice = englishVoice;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };

      utterance.onerror = (event) => {
        console.warn('Speech synthesis error:', event);
        setIsSpeaking(false);
        resolve();
      };

      speechSynthRef.current = utterance;
      speechSynthesis.speak(utterance);
    });
  }, [speechRate, speechVolume, isMuted]);

  // Play current step
  const playCurrentStep = useCallback(async () => {
    if (currentStepIndex >= actualSteps.length) {
      setIsPlaying(false);
      return;
    }

    const currentStep = actualSteps[currentStepIndex];
    if (!currentStep) return;

    // Speak the narration (fallback to explanation or content for backward compatibility)
    const textToSpeak = currentStep.narration || currentStep.explanation || currentStep.content;
    if (textToSpeak) {
      await speak(textToSpeak);
    }

    // Auto-advance to next step if playing
    if (isPlaying && currentStepIndex < actualSteps.length - 1) {
      setTimeout(() => {
        setCurrentStepIndex(prev => prev + 1);
      }, 1000); // Brief pause between steps
    } else if (currentStepIndex >= actualSteps.length - 1) {
      setIsPlaying(false);
    }
  }, [currentStepIndex, actualSteps, isPlaying, speak]);

  // Handle play/pause
  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
      speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      setIsPlaying(true);
    }
  };

  // Handle reset
  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
    setAccumulatedElements([]);
    speechSynthesis.cancel();
    setIsSpeaking(false);
    
    if (excalidrawAPI) {
      try {
        excalidrawAPI.updateScene({ elements: [] });
      } catch (error) {
        console.warn("Error clearing scene on reset:", error);
      }
    }
  };

  // Handle mute toggle
  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    if (!isMuted) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // Auto-play effect
  useEffect(() => {
    if (isPlaying) {
      playCurrentStep();
    }
  }, [isPlaying, currentStepIndex, playCurrentStep]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      speechSynthesis.cancel();
    };
  }, []);

  if (actualSteps.length === 0) {
    console.log('[ExcalidrawPlayer] No steps provided');
    return (
      <Card className="w-full h-96">
        <CardContent className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">No lesson content available</p>
        </CardContent>
      </Card>
    );
  }

  const currentStep = actualSteps[currentStepIndex];
  const progress = ((currentStepIndex + 1) / actualSteps.length) * 100;

  console.log('[ExcalidrawPlayer] Initialized with steps:', {
    stepsCount: actualSteps.length,
    currentStepIndex,
    stepsWithElements: actualSteps.filter(step => step.elements && step.elements.length > 0).length,
    testMode,
    firstStepElements: actualSteps[0]?.elements?.length || 0,
    currentStep: currentStep?.title,
    currentStepElements: currentStep?.elements?.length || 0
  });

  return (
    <div className={cn("w-full", className)}>
      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Button
                onClick={handlePlayPause}
                size="sm"
                variant={isPlaying ? "secondary" : "default"}
              >
                {isPlaying ? (
                  <PauseIcon className="h-4 w-4" />
                ) : (
                  <PlayIcon className="h-4 w-4" />
                )}
                {isPlaying ? "Pause" : "Play"}
              </Button>
              
              <Button onClick={handleReset} size="sm" variant="outline">
                <RotateCcwIcon className="h-4 w-4" />
                Reset
              </Button>
              
              <Button onClick={handleMuteToggle} size="sm" variant="outline">
                {isMuted ? (
                  <VolumeXIcon className="h-4 w-4" />
                ) : (
                  <Volume2Icon className="h-4 w-4" />
                )}
                {isMuted ? "Unmute" : "Mute"}
              </Button>
            </div>
            
            <div className="text-sm text-muted-foreground">
              Step {currentStepIndex + 1} of {actualSteps.length}
              {testMode && (
                <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                  TEST MODE
                </span>
              )}
              {isSpeaking && (
                <span className="ml-2 text-primary animate-pulse">
                  Speaking...
                </span>
              )}
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-secondary rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          {/* Current step info */}
          {currentStep && (
            <div className="mt-4">
              <h3 className="font-semibold text-sm mb-2">
                {currentStep.title}
              </h3>
              <p className="text-sm text-muted-foreground line-clamp-3">
                {currentStep.narration || currentStep.explanation || currentStep.content}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Excalidraw Canvas */}
      <Card className="overflow-hidden">
        <div style={{ height: "600px", width: "100%" }}>
          <Excalidraw
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            initialData={{
              elements: [],
              appState: {
                viewBackgroundColor: "#fafafa",
                currentItemFontFamily: 1,
                zenModeEnabled: false,
                gridModeEnabled: false,
              },
            }}
            viewModeEnabled={true}
            theme="light"
          />
        </div>
      </Card>
    </div>
  );
};

export default ExcalidrawPlayer;