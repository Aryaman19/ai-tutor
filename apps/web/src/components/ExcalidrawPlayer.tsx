import "@excalidraw/excalidraw/index.css";
import { useState, useRef, useEffect, useCallback } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
// Using any for now - will fix typing later
type ExcalidrawImperativeAPI = any;
import type { ExcalidrawElement } from "../utils/excalidraw";
import { lessons } from "../utils/lessons";

import { 
  normalizeToPlayerFormat, 
  type LessonSlide,
  fetchApiLesson,
  fetchApiLessonScript,
  createMockApiSteps
} from "../utils/lessonAdapter";

export default function ExcalidrawPlayer() {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<string>("How Economy Works");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const lessonScriptRef = useRef<LessonSlide[]>([]);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const accumulatedElements = useRef<ExcalidrawElement[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<{
    elements: ExcalidrawElement[];
    currentElements: ExcalidrawElement[];
  } | null>(null);

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
      updated: Date.now()
    }));
  }, []);

  // Debounced scene update function with index regeneration
  const debouncedUpdateScene = useCallback(
    (elements: ExcalidrawElement[], currentElements: ExcalidrawElement[], delay = 150) => {
      // Clear any existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Store the pending update
      pendingUpdateRef.current = { elements, currentElements };

      // Set up new debounced timer
      debounceTimerRef.current = setTimeout(() => {
        if (!excalidrawAPI || !pendingUpdateRef.current) return;

        const {
          elements: pendingElements,
          currentElements: pendingCurrentElements,
        } = pendingUpdateRef.current;

        // First attempt: try with clean indices
        const cleanElements = regenerateIndices(pendingElements);

        const attemptUpdate = (elementsToUpdate: ExcalidrawElement[], attempt = 1) => {
          try {
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
                  const scrollElements = pendingCurrentElements.map(
                    (origEl) => {
                      const cleanEl = elementsToUpdate.find(
                        (el) =>
                          el.type === origEl.type &&
                          el.x === origEl.x &&
                          el.y === origEl.y
                      );
                      return cleanEl || origEl;
                    }
                  );

                  excalidrawAPI.scrollToContent(scrollElements, {
                    fitToViewport: false,
                    animate: true,
                    duration: 600,
                  });
                } catch (scrollError) {
                  console.warn(
                    "Scroll after debounced update failed:",
                    scrollError
                  );
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
              }, 50);
            }

            console.log(
              `Debounced scene update successful (attempt ${attempt})`
            );
          } catch (error: any) {
            console.error(
              `Debounced scene update failed (attempt ${attempt}):`,
              error
            );

            // Handle fractional indices error with progressive recovery
            if (
              error.message?.includes(
                "Fractional indices invariant has been compromised"
              )
            ) {
              console.warn(
                `Fractional indices error detected on attempt ${attempt}, trying recovery...`
              );

              if (attempt < 3) {
                // Try again with even cleaner indices after a delay
                setTimeout(() => {
                  const regenElements = regenerateIndices(pendingElements).map(
                    (el, idx) => ({
                      ...el,
                      index: `b${Date.now()}_${idx
                        .toString(36)
                        .padStart(3, "0")}`,
                      id: `clean_${Date.now()}_${Math.random()
                        .toString(36)
                        .substr(2, 9)}`,
                    })
                  );
                  attemptUpdate(regenElements, attempt + 1);
                }, 200 * attempt); // Progressive delay
              } else {
                console.error("All recovery attempts failed");

                // Last resort: clear scene and rebuild
                try {
                  excalidrawAPI.updateScene({
                    elements: [],
                    appState: { viewBackgroundColor: "#fafafa" },
                  });

                  setTimeout(() => {
                    const finalElements = pendingElements.map((el, idx) => ({
                      ...el,
                      index: `clean_${idx}`,
                      id: `final_${Date.now()}_${idx}`,
                    }));

                    excalidrawAPI.updateScene({
                      elements: finalElements,
                      appState: { viewBackgroundColor: "#fafafa" },
                    });
                  }, 100);
                } catch (finalError) {
                  console.error("Final recovery attempt failed:", finalError);
                }
              }
            }
          }
        };

        // Start the update attempt
        attemptUpdate(cleanElements);

        // Clear the pending update
        pendingUpdateRef.current = null;
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

  const playNextStep = useCallback(() => {
    if (
      !excalidrawAPI ||
      currentStepIndex >= lessonScriptRef.current.length ||
      !isPlaying
    ) {
      if (currentStepIndex >= lessonScriptRef.current.length) {
        setIsPlaying(false);
      }
      return;
    }

    const step = lessonScriptRef.current[currentStepIndex];
    const currentElements = step.elements;

    // Clean the new elements before adding them
    const cleanedCurrentElements = regenerateIndices(currentElements);

    // Add new elements to accumulated elements
    accumulatedElements.current.push(...cleanedCurrentElements);

    // Use debounced update instead of direct update
    debouncedUpdateScene(accumulatedElements.current, cleanedCurrentElements);

    // Play narration
    if (step.narration && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(step.narration);
      utterance.rate = 0.9; // Slightly slower for better comprehension
      utterance.volume = 0.8;

      speechRef.current = utterance;

      utterance.onend = () => {
        setCurrentStepIndex((prev) => prev + 1);
      };

      utterance.onerror = (event) => {
        console.error("Speech synthesis error:", event);
        setCurrentStepIndex((prev) => prev + 1); // Continue even if speech fails
      };

      window.speechSynthesis.speak(utterance);
    } else {
      // If no speech synthesis, just move to next step after a delay
      setTimeout(() => {
        setCurrentStepIndex((prev) => prev + 1);
      }, 2000);
    }
  }, [
    excalidrawAPI,
    currentStepIndex,
    isPlaying,
    debouncedUpdateScene,
    regenerateIndices,
  ]);

  const handleLessonChange = useCallback(
    async (lessonName: string) => {
      setIsLoading(true);
      stopCurrentNarration();
      setIsPlaying(false);
      setCurrentStepIndex(0);
      accumulatedElements.current = [];

      // Clear any pending debounced updates
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      pendingUpdateRef.current = null;

      try {
        let slides: LessonSlide[] = [];
        
        // Check if it's a local lesson or API lesson
        if (lessonName.startsWith('api:')) {
          // API lesson format: "api:lessonId"
          const lessonId = lessonName.replace('api:', '');
          slides = await fetchApiLesson(lessonId);
        } else if (lessonName === 'Test API Format') {
          // Test API format compatibility
          const mockSteps = createMockApiSteps();
          slides = normalizeToPlayerFormat(mockSteps);
        } else {
          // Local lesson
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

        // Initialize with first slide using debounced update
        setTimeout(() => {
          if (excalidrawAPI && lessonScriptRef.current[0]) {
            const firstSlideElements = lessonScriptRef.current[0].elements;
            const cleanedFirstSlide = regenerateIndices(firstSlideElements);
            accumulatedElements.current = [...cleanedFirstSlide];

            // Use debounced update for initial load too
            debouncedUpdateScene(
              accumulatedElements.current,
              cleanedFirstSlide,
              100
            );
          }
          setIsLoading(false);
        }, 100);
      } catch (error) {
        console.error("Error loading lesson:", error);
        setIsLoading(false);
      }
    },
    [excalidrawAPI, stopCurrentNarration, debouncedUpdateScene, regenerateIndices]
  );

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      stopCurrentNarration();
      setIsPlaying(false);
    } else {
      if (currentStepIndex >= lessonScriptRef.current.length) {
        // Restart from beginning if at end
        setCurrentStepIndex(0);
        accumulatedElements.current = [];

        // Clear pending updates
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
  }, [isPlaying, currentStepIndex, stopCurrentNarration, excalidrawAPI]);

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
    pendingUpdateRef.current = null;

    if (excalidrawAPI && lessonScriptRef.current[0]) {
      const firstSlideElements = lessonScriptRef.current[0].elements;
      const cleanedFirstSlide = regenerateIndices(firstSlideElements);
      accumulatedElements.current = [...cleanedFirstSlide];

      // Use debounced update for reset
      debouncedUpdateScene(accumulatedElements.current, cleanedFirstSlide, 100);
    }
  }, [excalidrawAPI, stopCurrentNarration, debouncedUpdateScene, regenerateIndices]);

  // Initialize lesson on mount
  useEffect(() => {
    console.log("Initializing lesson:", selectedLesson);
    const lessonFn = lessons[selectedLesson as keyof typeof lessons];
    if (lessonFn) {
      try {
        const rawData = lessonFn();
        lessonScriptRef.current = normalizeToPlayerFormat(rawData);
        console.log("Lesson loaded successfully:", lessonScriptRef.current.length, "slides");
        console.log("First slide:", lessonScriptRef.current[0]);
      } catch (error) {
        console.error("Error loading lesson:", error);
      }
    } else {
      console.error("Lesson not found:", selectedLesson);
    }
  }, [selectedLesson]);

  // Auto-initialize first slide when API becomes available
  useEffect(() => {
    if (excalidrawAPI) {
      console.log("Excalidraw API available, checking lesson...");
      
      if (lessonScriptRef.current.length > 0) {
        console.log("Auto-initializing first slide");
        const firstSlideElements = lessonScriptRef.current[0].elements;
        console.log("First slide elements:", firstSlideElements);
        const cleanedFirstSlide = regenerateIndices(firstSlideElements);
        accumulatedElements.current = [...cleanedFirstSlide];

        // Use debounced update for initial load
        debouncedUpdateScene(accumulatedElements.current, cleanedFirstSlide, 100);
      } else {
        console.log("No lesson loaded, creating test element");
        // Create multiple test elements to verify Excalidraw is working
        const testElements = [
          {
            id: "test-text-1",
            type: "text",
            x: 50,
            y: 50,
            width: 300,
            height: 30,
            angle: 0,
            strokeColor: "#ff0000", // Bright red
            backgroundColor: "transparent",
            fillStyle: "solid",
            strokeWidth: 2,
            strokeStyle: "solid",
            roughness: 1,
            opacity: 1,
            groupIds: [],
            frameId: null,
            roundness: null,
            seed: Math.floor(Math.random() * 1000),
            versionNonce: Math.floor(Math.random() * 1000),
            isDeleted: false,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: false,
            index: "a0001",
            text: "TEST TEXT - Should be visible!",
            fontSize: 24,
            fontFamily: 1,
            textAlign: "left",
            verticalAlign: "top",
            baseline: 24,
            containerId: null,
            originalText: "TEST TEXT - Should be visible!"
          },
          {
            id: "test-rect-1",
            type: "rectangle",
            x: 50,
            y: 100,
            width: 200,
            height: 100,
            angle: 0,
            strokeColor: "#0000ff", // Bright blue
            backgroundColor: "#ffff00", // Yellow background
            fillStyle: "solid",
            strokeWidth: 3,
            strokeStyle: "solid",
            roughness: 1,
            opacity: 1,
            groupIds: [],
            frameId: null,
            roundness: { type: 3 },
            seed: Math.floor(Math.random() * 1000),
            versionNonce: Math.floor(Math.random() * 1000),
            isDeleted: false,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: false,
            index: "a0002"
          }
        ];
        
        try {
          console.log("Adding test elements:", testElements);
          excalidrawAPI.updateScene({
            elements: testElements,
            appState: { 
              viewBackgroundColor: "#ffffff",
              currentItemStrokeColor: "#000000",
              currentItemBackgroundColor: "transparent",
            },
          });
          console.log("Test elements added successfully");
          
          // Also try to scroll to the content to make sure it's visible
          setTimeout(() => {
            try {
              excalidrawAPI.scrollToContent(testElements, {
                fitToViewport: true,
                animate: false,
              });
              console.log("Scrolled to test content");
            } catch (scrollError) {
              console.warn("Failed to scroll to content:", scrollError);
            }
          }, 100);
        } catch (error) {
          console.error("Failed to add test elements:", error);
        }
      }
    }
  }, [excalidrawAPI, debouncedUpdateScene, regenerateIndices]);

  // Handle step progression with slight delay to work with debouncing
  useEffect(() => {
    if (isPlaying && currentStepIndex < lessonScriptRef.current.length) {
      const timer = setTimeout(() => {
        playNextStep();
      }, 200); // Increased delay to work better with debouncing
      return () => clearTimeout(timer);
    }
  }, [isPlaying, currentStepIndex, playNextStep]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCurrentNarration();
      // Clear debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [stopCurrentNarration]);

  const getPlayButtonText = () => {
    if (isPlaying) return "⏸️ Pause";
    if (currentStepIndex === 0) return "▶️ Play";
    if (currentStepIndex >= lessonScriptRef.current.length) return "🔄 Restart";
    return "▶️ Resume";
  };

  return (
    <div style={{ height: "600px", width: "900px" }}>
      <div
        style={{
          marginBottom: "10px",
          display: "flex",
          gap: "10px",
          alignItems: "center",
        }}
      >
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
          <option value="Test API Format">Test API Format</option>
        </select>

        <button
          onClick={togglePlayPause}
          disabled={isLoading}
          style={{ padding: "5px 15px" }}
        >
          {getPlayButtonText()}
        </button>

        <button
          onClick={resetLesson}
          disabled={isLoading}
          style={{ padding: "5px 15px" }}
        >
          🔄 Reset
        </button>

        <button
          onClick={() => {
            if (excalidrawAPI) {
              // Test our helper functions
              const { makeText, makeLabeledRectangle } = require('../utils/excalidraw');
              
              const testTitle = makeText({
                x: 100,
                y: 50,
                text: "Test Our Helpers!",
                fontSize: 32,
                color: "#1971c2",
                bold: true,
              });
              
              const testRect = makeLabeledRectangle({
                x: 100,
                y: 100,
                width: 200,
                height: 80,
                label: "Helper Test",
                fillColor: "#51cf66",
                shapeColor: "#1971c2",
              });
              
              const testElements = [testTitle, ...testRect];
              console.log("Testing our helper functions:", testElements);
              
              excalidrawAPI.updateScene({
                elements: testElements,
                appState: { viewBackgroundColor: "#ffffff" },
              });
              
              setTimeout(() => {
                excalidrawAPI.scrollToContent(testElements, {
                  fitToViewport: true,
                  animate: false,
                });
              }, 100);
            }
          }}
          style={{ padding: "5px 15px" }}
        >
          🔧 Test Helpers
        </button>

        <button
          onClick={() => {
            if (excalidrawAPI) {
              // Try the exact format from Excalidraw examples
              const workingElements = [
                {
                  "type": "rectangle",
                  "version": 1,
                  "versionNonce": 1234567890,
                  "isDeleted": false,
                  "id": "test_rect_1",
                  "fillStyle": "solid",
                  "strokeWidth": 2,
                  "strokeStyle": "solid",
                  "roughness": 1,
                  "opacity": 100,
                  "angle": 0,
                  "x": 100,
                  "y": 100,
                  "strokeColor": "#1e1e1e",
                  "backgroundColor": "#ffc9c9",
                  "width": 200,
                  "height": 100,
                  "seed": 1,
                  "groupIds": [],
                  "frameId": null,
                  "roundness": {
                    "type": 3
                  },
                  "boundElements": [],
                  "updated": 1,
                  "link": null,
                  "locked": false,
                  "index": "a0"
                },
                {
                  "type": "text",
                  "version": 1,
                  "versionNonce": 1234567891,
                  "isDeleted": false,
                  "id": "test_text_1",
                  "fillStyle": "solid",
                  "strokeWidth": 2,
                  "strokeStyle": "solid",
                  "roughness": 1,
                  "opacity": 100,
                  "angle": 0,
                  "x": 120,
                  "y": 130,
                  "strokeColor": "#1e1e1e",
                  "backgroundColor": "transparent",
                  "width": 160,
                  "height": 40,
                  "seed": 2,
                  "groupIds": [],
                  "frameId": null,
                  "roundness": null,
                  "boundElements": [],
                  "updated": 1,
                  "link": null,
                  "locked": false,
                  "fontSize": 20,
                  "fontFamily": 1,
                  "text": "HELLO WORLD!",
                  "textAlign": "center",
                  "verticalAlign": "middle",
                  "containerId": null,
                  "originalText": "HELLO WORLD!",
                  "lineHeight": 1.25,
                  "baseline": 18,
                  "index": "a1"
                }
              ];
              
              console.log("Adding working format elements:", workingElements);
              excalidrawAPI.updateScene({
                elements: workingElements,
                appState: { 
                  viewBackgroundColor: "#ffffff",
                },
              });
              
              // Force fit to viewport
              setTimeout(() => {
                excalidrawAPI.scrollToContent(workingElements, {
                  fitToViewport: true,
                  animate: false,
                });
              }, 100);
            }
          }}
          style={{ padding: "5px 15px" }}
        >
          🧪 Manual Test
        </button>

        <span style={{ fontSize: "14px", color: "#666" }}>
          Step {Math.min(currentStepIndex + 1, lessonScriptRef.current.length)}{" "}
          of {lessonScriptRef.current.length}
        </span>

        {isLoading && <span style={{ color: "#666" }}>Loading...</span>}
      </div>

      <Excalidraw
        excalidrawAPI={(api) => {
          console.log("Excalidraw API ready:", api);
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