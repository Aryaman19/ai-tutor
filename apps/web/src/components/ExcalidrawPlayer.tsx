import "@excalidraw/excalidraw/index.css";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { PlayIcon, PauseIcon, RotateCcwIcon, VolumeXIcon, Volume2Icon } from "lucide-react";
import { Button } from "@ai-tutor/ui";
import { Card, CardContent } from "@ai-tutor/ui";
import { cn } from "@ai-tutor/utils";
import type { ExcalidrawElement, LessonStep } from "../utils/excalidraw";
import { regenerateElementIndices } from "../utils/excalidraw";

interface ExcalidrawPlayerProps {
  steps: LessonStep[];
  className?: string;
  autoPlay?: boolean;
  speechRate?: number;
  speechVolume?: number;
}

const ExcalidrawPlayer: React.FC<ExcalidrawPlayerProps> = ({
  steps,
  className,
  autoPlay = false,
  speechRate = 1,
  speechVolume = 1
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

  // Auto-play on mount if enabled
  useEffect(() => {
    if (autoPlay && steps.length > 0) {
      setIsPlaying(true);
    }
  }, [autoPlay, steps]);

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

  // Update accumulated elements when step changes
  useEffect(() => {
    if (steps.length === 0) return;

    const currentStep = steps[currentStepIndex];
    if (!currentStep) return;

    // Add current step elements to accumulated elements
    let newElements = [...accumulatedElements];
    let currentStepElements: ExcalidrawElement[] = [];
    
    if (currentStep.elements && currentStep.elements.length > 0) {
      currentStepElements = currentStep.elements as ExcalidrawElement[];
      newElements = [...newElements, ...currentStepElements];
      setAccumulatedElements(newElements);
    }

    // Use the new signature with current step elements for scrolling
    updateExcalidrawScene(newElements, currentStepElements);
  }, [currentStepIndex, steps, updateExcalidrawScene]);

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
    if (currentStepIndex >= steps.length) {
      setIsPlaying(false);
      return;
    }

    const currentStep = steps[currentStepIndex];
    if (!currentStep) return;

    // Speak the narration (fallback to explanation or content for backward compatibility)
    const textToSpeak = currentStep.narration || currentStep.explanation || currentStep.content;
    if (textToSpeak) {
      await speak(textToSpeak);
    }

    // Auto-advance to next step if playing
    if (isPlaying && currentStepIndex < steps.length - 1) {
      setTimeout(() => {
        setCurrentStepIndex(prev => prev + 1);
      }, 1000); // Brief pause between steps
    } else if (currentStepIndex >= steps.length - 1) {
      setIsPlaying(false);
    }
  }, [currentStepIndex, steps, isPlaying, speak]);

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

  if (steps.length === 0) {
    return (
      <Card className="w-full h-96">
        <CardContent className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">No lesson content available</p>
        </CardContent>
      </Card>
    );
  }

  const currentStep = steps[currentStepIndex];
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

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
              Step {currentStepIndex + 1} of {steps.length}
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
        <div className="h-96 w-full">
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