/**
 * AITutorPlayer Component
 * 
 * A player component that renders AI-generated lessons with multiple slides
 * Based on the POC approach but adapted for AI tutor lesson data
 */

import "@excalidraw/excalidraw/index.css";
import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { createComponentLogger } from "@ai-tutor/utils";

const logger = createComponentLogger("AITutorPlayer");

export interface AITutorSlide {
  slide_number: number;
  template_id: string;
  template_name: string;
  content_type: string;
  filled_content: Record<string, string>;
  elements: any[];
  narration: string;
  estimated_duration: number;
  position_offset: number;
  metadata: Record<string, any>;
  generation_time: number;
  status: string;
  error_message?: string;
}

export interface AITutorPlayerProps {
  /** Array of generated slides to play */
  slides: AITutorSlide[];
  
  /** Auto-start playback when ready */
  autoPlay?: boolean;
  
  /** Show player controls */
  showControls?: boolean;
  
  /** Player dimensions */
  width?: number;
  height?: number;
  
  /** Event handlers */
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onSlideChange?: (slideIndex: number) => void;
  onError?: (error: Error) => void;
  
  /** Custom styling */
  className?: string;
}

export const AITutorPlayer: React.FC<AITutorPlayerProps> = ({
  slides,
  autoPlay = false,
  showControls = true,
  width = 1200,
  height = 700,
  onPlaybackStart,
  onPlaybackEnd,
  onSlideChange,
  onError,
  className = "",
}) => {
  // Player state
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [currentElements, setCurrentElements] = useState<any[]>([]);
  
  // Audio state
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isAudioReady, setIsAudioReady] = useState(false);

  // Refs
  const accumulatedElements = useRef<any[]>([]);
  const debounceTimerRef = useRef<number>();
  const pendingUpdateRef = useRef<any>(null);
  const onPlaybackStartRef = useRef(onPlaybackStart);
  const onPlaybackEndRef = useRef(onPlaybackEnd);
  const onSlideChangeRef = useRef(onSlideChange);
  const onErrorRef = useRef(onError);

  // Update callback refs
  useEffect(() => {
    onPlaybackStartRef.current = onPlaybackStart;
    onPlaybackEndRef.current = onPlaybackEnd;
    onSlideChangeRef.current = onSlideChange;
    onErrorRef.current = onError;
  }, [onPlaybackStart, onPlaybackEnd, onSlideChange, onError]);

  // Function to convert template elements to Excalidraw elements (simplified like TemplateTest)
  const regenerateIndices = useCallback((elements: any[]) => {
    // Validate that elements is an array
    if (!elements || !Array.isArray(elements)) {
      logger.warn("regenerateIndices received invalid elements:", elements);
      return [];
    }
    
    return elements.map((element, index) => {
      // Validate element has required properties
      if (!element || typeof element !== 'object') {
        logger.warn(`Element at index ${index} is invalid:`, element);
        return null;
      }
      
      // Use the same simple conversion as TemplateTest
      const convertedElement = {
        id: `aitutor-${element.id}-${index}`,
        type: 'text' as const,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        angle: 0,
        strokeColor: element.color || "#1971c2",
        backgroundColor: element.backgroundColor || "transparent",
        fillStyle: 'solid' as const,
        strokeWidth: 1,
        strokeStyle: 'solid' as const,
        roughness: 0,
        opacity: 100,
        strokeSharpness: 'sharp' as const,
        seed: Math.floor(Math.random() * 1000000),
        groupIds: [],
        roundness: null,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        text: element.text,
        fontSize: element.fontSize,
        fontFamily: 1, // Virgil
        textAlign: (element.alignment || 'left') as 'left' | 'center' | 'right',
        verticalAlign: 'top' as const,
        versionNonce: Math.floor(Math.random() * 1000000),
        isDeleted: false,
        customData: null
      };
      
      console.log(`🔧 Converted element ${index}:`, {
        original: element,
        converted: convertedElement,
        position: { x: convertedElement.x, y: convertedElement.y, width: convertedElement.width, height: convertedElement.height },
        text: convertedElement.text?.substring(0, 50)
      });
      
      return convertedElement;
    }).filter(element => element !== null); // Remove invalid elements
  }, []);

  // Debounced scene update function (from POC)
  const debouncedUpdateScene = useCallback(
    (elements: any[], currentElements: any[], delay = 150) => {
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

        const attemptUpdate = (elementsToUpdate: any[], attempt = 1) => {
          try {
            // Final validation before passing to Excalidraw
            const validElements = elementsToUpdate.filter(el => {
              const isValid = el && 
                el.id && 
                typeof el.x === 'number' && 
                typeof el.y === 'number' && 
                typeof el.width === 'number' && 
                typeof el.height === 'number' &&
                el.type;
              
              if (!isValid) {
                logger.warn("Filtering out invalid element:", el);
              }
              
              return isValid;
            });
            
            logger.debug(`Attempting to update Excalidraw scene (attempt ${attempt})`, {
              originalCount: elementsToUpdate.length,
              validCount: validElements.length,
              elements: validElements.slice(0, 3).map(el => ({
                id: el.id,
                type: el.type,
                x: el.x,
                y: el.y,
                width: el.width,
                height: el.height,
                text: el.text?.substring(0, 30)
              }))
            });

            // Add browser console logging to see what Excalidraw receives
            console.log("🎨 AITutorPlayer: About to call excalidrawAPI.updateScene", {
              elementsCount: validElements.length,
              elementsPreview: validElements.slice(0, 2).map(el => ({
                id: el.id,
                type: el.type,
                x: el.x,
                y: el.y,
                width: el.width,
                height: el.height,
                text: el.text
              })),
              hasExcalidrawAPI: !!excalidrawAPI,
              apiMethods: excalidrawAPI ? Object.getOwnPropertyNames(excalidrawAPI) : "no API"
            });

            // Update the scene with validated elements
            excalidrawAPI.updateScene({
              elements: validElements,
              appState: { 
                viewBackgroundColor: "#ffffff",
                zenModeEnabled: true,
                viewModeEnabled: true,
              },
            });

            console.log("✅ AITutorPlayer: excalidrawAPI.updateScene completed successfully");
            logger.debug(`Excalidraw scene update successful (attempt ${attempt})`);

            // Immediately scroll to show the elements
            if (validElements.length > 0) {
              try {
                excalidrawAPI.scrollToContent(validElements, {
                  fitToViewport: true,
                  animate: false,
                  duration: 0,
                });
                console.log("📍 Scrolled to content immediately after update");
              } catch (scrollError) {
                console.log("⚠️ Immediate scroll failed:", scrollError);
              }
            }

            // Scroll to new content with animation
            if (pendingCurrentElements && pendingCurrentElements.length > 0) {
              setTimeout(() => {
                try {
                  // Find corresponding elements in validated array for scrolling
                  const scrollElements = pendingCurrentElements.map(
                    (origEl: any) => {
                      const cleanEl = validElements.find(
                        (el: any) =>
                          el.type === origEl.type &&
                          el.x === origEl.x &&
                          el.y === origEl.y
                      );
                      return cleanEl || origEl;
                    }
                  ).filter(el => el); // Remove any null elements

                  if (scrollElements.length > 0) {
                    excalidrawAPI.scrollToContent(scrollElements, {
                      fitToViewport: false,
                      animate: true,
                      duration: 600,
                    });
                  }
                } catch (scrollError) {
                  logger.warn("Scroll after debounced update failed:", scrollError);
                  // Fallback scroll to all valid elements
                  try {
                    if (validElements.length > 0) {
                      excalidrawAPI.scrollToContent(validElements, {
                        fitToViewport: true,
                        animate: true,
                        duration: 600,
                      });
                    }
                  } catch (fallbackError) {
                    logger.warn("Fallback scroll also failed:", fallbackError);
                  }
                }
              }, 50);
            }

            logger.debug(`Scene update successful (attempt ${attempt})`);
          } catch (error: any) {
            logger.error(`Scene update failed (attempt ${attempt}):`, error);

            // Handle fractional indices error with progressive recovery
            if (
              error.message?.includes(
                "Fractional indices invariant has been compromised"
              )
            ) {
              logger.warn(`Fractional indices error detected on attempt ${attempt}, trying recovery...`);

              if (attempt < 3) {
                // Try again with even cleaner indices after a delay
                setTimeout(() => {
                  const regenElements = regenerateIndices(pendingElements).map(
                    (el: any, idx: number) => ({
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
                logger.error("All recovery attempts failed");
                onErrorRef.current?.(new Error("Failed to update canvas scene"));
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

  // Create mock audio for testing (since we don't have actual TTS yet)
  const createMockAudio = useCallback(() => {
    // Calculate total duration from slides
    const totalDuration = slides.reduce((sum, slide) => sum + slide.estimated_duration, 0);
    
    // Create a silent audio context for timing
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * totalDuration, audioContext.sampleRate);
    
    // Create a mock audio element that we can control
    const mockAudio = {
      currentTime: 0,
      duration: totalDuration,
      paused: true,
      play: () => Promise.resolve(),
      pause: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    
    return mockAudio as any;
  }, [slides]);

  // Initialize audio
  useEffect(() => {
    if (slides.length > 0) {
      logger.debug("AITutorPlayer received slides", {
        slidesCount: slides.length,
        slides: slides.map(slide => ({
          slideNumber: slide.slide_number,
          templateId: slide.template_id,
          contentType: slide.content_type,
          elementsCount: slide.elements?.length || 0,
          hasElements: !!slide.elements && slide.elements.length > 0,
          filledContentKeys: Object.keys(slide.filled_content || {}),
          status: slide.status
        }))
      });

      // Add browser console logging to see slide elements structure
      console.log("📊 AITutorPlayer: Received slides with elements", {
        slidesCount: slides.length,
        slideElementsDetails: slides.map((slide, index) => ({
          slideIndex: index,
          slideNumber: slide.slide_number,
          templateId: slide.template_id,
          elementsCount: slide.elements?.length || 0,
          elements: slide.elements || [],
          hasValidElements: slide.elements && slide.elements.length > 0 && slide.elements.every(el => el.type && el.x !== undefined && el.y !== undefined)
        }))
      });
      
      const mockAudio = createMockAudio();
      setAudioElement(mockAudio);
      setDuration(mockAudio.duration * 1000); // Convert to ms
      setIsAudioReady(true);
      logger.debug("Mock audio initialized", { duration: mockAudio.duration });
    }
  }, [slides, createMockAudio]);

  // Play next slide
  const playNextSlide = useCallback(() => {
    console.log("🎬 playNextSlide called", {
      hasExcalidrawAPI: !!excalidrawAPI,
      currentSlideIndex,
      totalSlides: slides.length,
      isPlaying
    });

    if (
      !excalidrawAPI ||
      currentSlideIndex >= slides.length ||
      !isPlaying
    ) {
      if (currentSlideIndex >= slides.length) {
        setIsPlaying(false);
        onPlaybackEndRef.current?.();
      }
      console.log("❌ playNextSlide early return", {
        hasExcalidrawAPI: !!excalidrawAPI,
        currentSlideIndex,
        totalSlides: slides.length,
        isPlaying
      });
      return;
    }

    const slide = slides[currentSlideIndex];
    
    // Validate slide structure
    if (!slide) {
      logger.error("No slide found at index", currentSlideIndex);
      return;
    }
    
    const slideElements = Array.isArray(slide.elements) ? slide.elements : [];

    logger.debug("Playing slide", { 
      slideNumber: slide.slide_number, 
      elementsCount: slideElements.length,
      contentType: slide.content_type,
      templateId: slide.template_id,
      filledContent: slide.filled_content,
      hasValidElements: slideElements.length > 0,
      elements: slideElements.length > 0 ? slideElements.map(el => ({
        id: el?.id,
        type: el?.type,
        x: el?.x,
        y: el?.y,
        text: el?.text?.substring(0, 50)
      })) : "NO_ELEMENTS"
    });

    // Check if we have elements to render
    if (slideElements.length === 0) {
      logger.warn("No elements to render for slide", {
        slideNumber: slide.slide_number,
        templateId: slide.template_id,
        contentType: slide.content_type,
        status: slide.status,
        filledContentKeys: Object.keys(slide.filled_content || {})
      });
      
      // Still advance to next slide even if no elements
      const slideTimeout = setTimeout(() => {
        setCurrentSlideIndex((prev) => prev + 1);
      }, 2000); // Shorter timeout for empty slides
      
      return () => clearTimeout(slideTimeout);
    }

    // Clean the new elements before adding them
    const cleanedSlideElements = regenerateIndices(slideElements);

    // Additional validation before proceeding
    if (!Array.isArray(cleanedSlideElements)) {
      logger.error("cleanedSlideElements is not an array:", cleanedSlideElements);
      return;
    }

    logger.debug("About to render elements", {
      originalElements: slideElements,
      cleanedElements: cleanedSlideElements,
      accumulatedCount: accumulatedElements.current.length
    });

    // Add browser console logging for element details
    console.log("🔍 AITutorPlayer playNextSlide: About to render elements", {
      slideNumber: slide.slide_number,
      originalElementsCount: slideElements.length,
      cleanedElementsCount: cleanedSlideElements.length,
      originalElements: slideElements,
      cleanedElements: cleanedSlideElements,
      accumulatedElementsCount: accumulatedElements.current.length
    });

    // Validate accumulated elements array before pushing
    if (!Array.isArray(accumulatedElements.current)) {
      logger.warn("accumulatedElements.current is not an array, reinitializing");
      accumulatedElements.current = [];
    }

    // Add new elements to accumulated elements with validation
    if (cleanedSlideElements.length > 0) {
      accumulatedElements.current.push(...cleanedSlideElements);
    }

    logger.debug("Elements added to accumulated", {
      newAccumulatedCount: accumulatedElements.current.length,
      elementTypes: accumulatedElements.current.map(el => el?.type || 'unknown'),
      elementPositions: accumulatedElements.current.map(el => ({x: el?.x || 0, y: el?.y || 0}))
    });

    // Final validation before updating scene
    const validAccumulatedElements = Array.isArray(accumulatedElements.current) 
      ? accumulatedElements.current.filter(el => el && typeof el === 'object')
      : [];

    const validCurrentElements = Array.isArray(cleanedSlideElements) 
      ? cleanedSlideElements.filter(el => el && typeof el === 'object')
      : [];

    logger.debug("Final validation before scene update", {
      accumulatedCount: validAccumulatedElements.length,
      currentCount: validCurrentElements.length
    });

    // Use debounced update with validated elements
    debouncedUpdateScene(validAccumulatedElements, validCurrentElements);
    setCurrentElements(validAccumulatedElements);

    // Notify slide change
    onSlideChangeRef.current?.(currentSlideIndex);

    // Simulate audio narration with timing
    if (slide.narration) {
      logger.debug("Playing narration", { text: slide.narration.substring(0, 50) + "..." });
      
      // Use the slide's estimated duration for timing
      const slideTimeout = setTimeout(() => {
        setCurrentSlideIndex((prev) => prev + 1);
      }, slide.estimated_duration * 1000); // Convert to ms

      // Store timeout for cleanup
      return () => clearTimeout(slideTimeout);
    } else {
      // If no narration, move to next slide after default delay
      const slideTimeout = setTimeout(() => {
        setCurrentSlideIndex((prev) => prev + 1);
      }, 3000); // 3 second default

      return () => clearTimeout(slideTimeout);
    }
  }, [
    excalidrawAPI,
    currentSlideIndex,
    slides,
    isPlaying,
    debouncedUpdateScene,
    regenerateIndices,
  ]);

  // Handle play/pause
  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      logger.debug("Playback paused");
    } else {
      if (currentSlideIndex >= slides.length) {
        // Restart from beginning if at end
        setCurrentSlideIndex(0);
        accumulatedElements.current = [];
        
        if (excalidrawAPI) {
          excalidrawAPI.updateScene({
            elements: [],
            appState: { viewBackgroundColor: "#ffffff" },
          });
        }
      }
      setIsPlaying(true);
      onPlaybackStartRef.current?.();
      logger.debug("Playback started");
    }
  }, [isPlaying, currentSlideIndex, slides.length, excalidrawAPI]);

  // Reset lesson
  const resetLesson = useCallback(() => {
    setIsPlaying(false);
    setCurrentSlideIndex(0);
    setCurrentPosition(0);
    accumulatedElements.current = [];

    // Clear pending debounced updates
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = undefined;
    }
    pendingUpdateRef.current = null;

    if (excalidrawAPI) {
      excalidrawAPI.updateScene({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
      });
    }

    logger.debug("Lesson reset");
  }, [excalidrawAPI]);

  // Initialize with first slide (simplified - no API needed)
  useEffect(() => {
    if (slides.length > 0) {
      logger.debug("Initializing AITutorPlayer with slides", {
        slidesCount: slides.length,
        autoPlay,
        firstSlideElements: slides[0]?.elements?.length || 0
      });

      console.log("🚀 AITutorPlayer initialization - First slide elements:", slides[0]?.elements);

      setIsLoading(false);
      
      if (autoPlay) {
        logger.debug("Auto-starting playback in 500ms");
        setTimeout(() => {
          setIsPlaying(true);
          onPlaybackStartRef.current?.();
        }, 500);
      } else {
        logger.debug("Auto-play disabled, waiting for manual start");
      }
    }
  }, [slides, autoPlay]);

  // Handle slide progression with simple timer (no Excalidraw API needed)
  useEffect(() => {
    if (isPlaying && currentSlideIndex < slides.length) {
      const currentSlide = slides[currentSlideIndex];
      const duration = currentSlide?.estimated_duration ? currentSlide.estimated_duration * 1000 : 3000;
      
      console.log(`⏰ Setting timer for slide ${currentSlideIndex + 1}, duration: ${duration}ms`);
      
      const timer = setTimeout(() => {
        if (currentSlideIndex + 1 < slides.length) {
          console.log(`➡️ Moving to slide ${currentSlideIndex + 2}`);
          setCurrentSlideIndex(prev => prev + 1);
          onSlideChangeRef.current?.(currentSlideIndex + 1);
        } else {
          console.log("🏁 Reached end of slides");
          setIsPlaying(false);
          onPlaybackEndRef.current?.();
        }
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [isPlaying, currentSlideIndex, slides]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Format time for display
  const formatTime = useCallback((timeMs: number): string => {
    const totalSeconds = Math.floor(timeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, []);

  const getPlayButtonText = () => {
    if (isPlaying) return "⏸️ Pause";
    if (currentSlideIndex === 0) return "▶️ Play";
    if (currentSlideIndex >= slides.length) return "🔄 Restart";
    return "▶️ Resume";
  };


  const currentSlide = slides[currentSlideIndex];
  const progress = slides.length > 0 ? (currentSlideIndex / slides.length) * 100 : 0;

  // Convert current slide elements directly like TemplateTest (but for current slide)
  const getCurrentSlideElements = () => {
    if (slides.length === 0) return [];
    
    // For multi-slide playback, show accumulated elements up to current slide
    if (isPlaying && currentSlideIndex > 0) {
      const allElements = [];
      for (let i = 0; i <= currentSlideIndex; i++) {
        if (slides[i] && slides[i].elements) {
          slides[i].elements.forEach((element: any, elementIndex: number) => {
            allElements.push({
              id: `slide-${i}-${element.id}-${elementIndex}`,
              type: 'text' as const,
              x: element.x + (i * 100), // Offset each slide slightly for demo
              y: element.y,
              width: element.width,
              height: element.height,
              angle: 0,
              strokeColor: element.color || "#1971c2",
              backgroundColor: element.backgroundColor || "transparent",
              fillStyle: 'solid' as const,
              strokeWidth: 1,
              strokeStyle: 'solid' as const,
              roughness: 0,
              opacity: 100,
              strokeSharpness: 'sharp' as const,
              seed: Math.floor(Math.random() * 1000000),
              groupIds: [],
              roundness: null,
              boundElements: null,
              updated: Date.now(),
              link: null,
              locked: false,
              text: element.text,
              fontSize: element.fontSize,
              fontFamily: 1, // Virgil
              textAlign: (element.alignment || 'left') as 'left' | 'center' | 'right',
              verticalAlign: 'top' as const,
              versionNonce: Math.floor(Math.random() * 1000000),
              isDeleted: false,
              customData: null
            });
          });
        }
      }
      return allElements;
    }
    
    // For initial load or single slide, just show first slide
    const slideToShow = slides[currentSlideIndex] || slides[0];
    if (!slideToShow || !slideToShow.elements) return [];
    
    return slideToShow.elements.map((element: any, index: number) => ({
      id: `aitutor-${element.id}-${index}`,
      type: 'text' as const,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      angle: 0,
      strokeColor: element.color || "#1971c2",
      backgroundColor: element.backgroundColor || "transparent",
      fillStyle: 'solid' as const,
      strokeWidth: 1,
      strokeStyle: 'solid' as const,
      roughness: 0,
      opacity: 100,
      strokeSharpness: 'sharp' as const,
      seed: Math.floor(Math.random() * 1000000),
      groupIds: [],
      roundness: null,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      text: element.text,
      fontSize: element.fontSize,
      fontFamily: 1, // Virgil
      textAlign: (element.alignment || 'left') as 'left' | 'center' | 'right',
      verticalAlign: 'top' as const,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      customData: null
    }));
  };

  const excalidrawElements = getCurrentSlideElements();

  console.log("🎨 Direct elements for Excalidraw:", excalidrawElements);

  return (
    <div className={`relative ${className}`} style={{ height }}>
      {/* Excalidraw Canvas */}
      <div className="w-full h-full overflow-hidden" style={{ position: "relative" }}>
        {slides.length > 0 ? (
          <Excalidraw
            key={`aitutor-simple-${slides.length}-${currentSlideIndex}-${isPlaying}`}
            initialData={{
              elements: excalidrawElements,
              appState: {
                viewBackgroundColor: "#ffffff",
                zenModeEnabled: true,
                viewModeEnabled: true,
                gridSize: null,
                zoom: { value: 1 },
                scrollX: 0,
                scrollY: 0,
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
            detectScroll={false}
            handleKeyboardGlobally={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-50">
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-4">📊</div>
              <div>Loading slides...</div>
            </div>
          </div>
        )}
      </div>

      {/* Player Controls */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent z-50 pointer-events-auto">
          <div className="px-6 py-4">
            {/* Progress Bar */}
            <div className="mb-4">
              <div className="relative w-full h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="absolute h-full bg-gradient-to-r from-purple-400 to-pink-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Slide info */}
              <div className="flex justify-between text-xs text-white/70 mt-1">
                <span>
                  Slide {Math.min(currentSlideIndex + 1, slides.length)} of {slides.length}
                </span>
                <span>
                  {currentSlide ? currentSlide.content_type : 'Ready to start'}
                </span>
              </div>
            </div>

            {/* Control buttons and info */}
            <div className="flex items-center gap-4 overflow-hidden">
              {/* Left side - Control buttons */}
              <div className="flex items-center space-x-4 flex-shrink-0">
                {/* Play/Pause */}
                <button
                  onClick={togglePlayPause}
                  disabled={slides.length === 0 || isLoading}
                  className="flex items-center justify-center w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full transition-colors disabled:opacity-50"
                >
                  {isPlaying ? (
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>

                {/* Reset */}
                <button
                  onClick={resetLesson}
                  disabled={slides.length === 0 || isLoading}
                  className="flex items-center justify-center w-8 h-8 bg-white/20 hover:bg-white/30 rounded transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              {/* Center spacer */}
              <div className="flex-1"></div>

              {/* Right side - Current slide info */}
              <div className="flex items-center gap-2 text-white text-sm min-w-0 flex-shrink">
                {currentSlide && (
                  <div className="bg-purple-500/30 px-2 py-1 rounded-full whitespace-nowrap">
                    <span className="text-white/90 text-xs font-medium">
                      {currentSlide.template_name}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-1 whitespace-nowrap">
                  <div className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"></div>
                  <span className="text-white/80 text-xs hidden sm:inline">
                    AI Tutor Ready
                  </span>
                  <span className="text-white/80 text-xs sm:hidden">Ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-40">
          <div className="text-center text-white">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <div>Loading lesson...</div>
          </div>
        </div>
      )}

      {/* No slides message */}
      {slides.length === 0 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-40">
          <div className="text-center text-gray-500">
            <div className="text-4xl mb-4">📚</div>
            <div>No slides to display</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AITutorPlayer;