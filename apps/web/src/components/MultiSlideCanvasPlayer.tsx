/**
 * MultiSlideCanvasPlayer Component
 *
 * A multi-slide canvas player with integrated audio functionality that:
 * - Loads multiple template slides with proper offsets
 * - Generates unified audio with crossfade transitions
 * - Synchronizes visual slides with audio playback
 * - Provides seekbar functionality for slide navigation
 * - Blocks playback until audio is ready
 *
 * Usage:
 * ```tsx
 * <MultiSlideCanvasPlayer
 *   slides={slideData}
 *   enableAudio={true}
 *   crossfadeDuration={500}
 *   autoPlay={false}
 *   showControls={true}
 *   onAudioReady={() => console.log('Audio ready!')}
 *   onAudioError={(error) => console.error('Audio error:', error)}
 *   onSlideChange={(index) => console.log('Slide changed:', index)}
 * />
 * ```
 *
 * Audio Features:
 * - Individual TTS generation for each slide's narration
 * - Real crossfade merging using Web Audio API
 * - Seekbar with slide markers for navigation
 * - Loading progress indicators
 * - Error handling with fallback behavior
 * - Synchronized visual slide progression
 */

import "@excalidraw/excalidraw/index.css";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { createComponentLogger } from "@ai-tutor/utils";
import { useMultiSlideAudio } from "@ai-tutor/hooks/src/useMultiSlideAudio";
import { useSlideProgression } from "@ai-tutor/hooks/src/useSlideProgression";
import { AudioSeekBar } from "@ai-tutor/ui/src/components/AudioSeekBar";

const logger = createComponentLogger("MultiSlideCanvasPlayer");

// Slide data structure from AI Tutor API
interface SlideData {
  slide_number: number;
  template_id: string;
  template_name: string;
  content_type: string;
  filled_content: Record<string, string>;
  elements: any[];
  narration: string;
  estimated_duration: number;
  position_offset: number;
  metadata: any;
  generation_time: number;
  status: string;
  error_message?: string;
}

export interface MultiSlideCanvasPlayerProps {
  slides: SlideData[];
  autoPlay?: boolean;
  showControls?: boolean;
  enableAudio?: boolean; // Enable audio generation and playback
  crossfadeDuration?: number; // Crossfade duration in milliseconds
  onSlideChange?: (slideIndex: number) => void;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onAudioReady?: () => void; // Called when audio is generated and ready
  onAudioError?: (error: string) => void; // Called when audio generation fails
  onError?: (error: Error) => void;
  className?: string;
  testMode?: boolean; // Add test mode to create simple elements
}

export const MultiSlideCanvasPlayer: React.FC<MultiSlideCanvasPlayerProps> = ({
  slides,
  autoPlay = false,
  showControls = true,
  enableAudio = true,
  crossfadeDuration = 1500,
  onSlideChange,
  onPlaybackStart,
  onPlaybackEnd,
  onAudioReady,
  onAudioError,
  onError,
  className = "",
  testMode = false,
}) => {
  // Excalidraw API
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [allSlidesLoaded, setAllSlidesLoaded] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 450 });
  const [scaleFactor, setScaleFactor] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Audio playback state
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  // Refs for POC-style management
  const accumulatedElements = useRef<any[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<any>(null);
  const slideProgressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Audio system integration
  const {
    status: audioStatus,
    slideAudioData,
    mergedAudio,
    audioElement,
    currentSlideIndex: audioSlideIndex,
    generateMultiSlideAudio,
    seekToSlide: audioSeekToSlide,
    seekToTime: audioSeekToTime,
    getCurrentSlideFromTime,
    reset: resetAudio
  } = useMultiSlideAudio();

  // Prepare slide segments for useSlideProgression
  const slideSegments = slideAudioData.map(slide => ({
    slideNumber: slide.slideNumber,
    startTime: slide.startTime,
    endTime: slide.endTime,
    text: slide.narration
  }));

  // Unified slide progression system (hybrid approach)
  const slideProgression = useSlideProgression(slideSegments, audioElement, {
    debounceDelay: 200,
    enableDebugLogging: true
  });

  // Extract progression state and actions
  const {
    state: progressionState,
    actions: progressionActions,
    events: progressionEvents
  } = slideProgression;

  // Inspect and fix dummy template elements format
  const inspectAndFixElements = useCallback((elements: any[]) => {
    logger.debug("=== ELEMENT INSPECTION ===");
    elements.forEach((el, idx) => {
      logger.debug(`Element ${idx}:`, {
        id: el.id,
        type: el.type,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        hasRequiredProps: {
          index: !!el.index,
          versionNonce: !!el.versionNonce,
          isDeleted: el.isDeleted !== undefined,
          frameId: el.frameId !== undefined,
          seed: !!el.seed,
        },
        allProps: Object.keys(el),
      });
    });

    // Try to fix missing required properties
    return elements.map((el, idx) => {
      const baseElement = {
        ...el,
        // Ensure required Excalidraw properties exist
        index: el.index || `a${idx}`,
        versionNonce: el.versionNonce || Math.floor(Math.random() * 1000000000),
        isDeleted: el.isDeleted !== undefined ? el.isDeleted : false,
        frameId: el.frameId !== undefined ? el.frameId : null,
        seed: el.seed || Math.floor(Math.random() * 1000000),
        updated: el.updated || 1,
        link: el.link || null,
        locked: el.locked !== undefined ? el.locked : false,
        customData: el.customData || null,
        // Fix other common issues
        opacity: el.opacity !== undefined ? el.opacity : 100,
        groupIds: el.groupIds || [],
        boundElements: el.boundElements || null,
        // Add stroke and fill properties
        strokeColor: el.color || el.strokeColor || "#000000",
        strokeWidth: el.strokeWidth || 1,
        strokeStyle: el.strokeStyle || "solid",
        fillStyle: el.fillStyle || "hachure",
        roughness: el.roughness || 1,
        angle: el.angle || 0,
        roundness: el.roundness || null,
      };

      // Add text-specific properties for text elements
      if (el.type === "text") {
        return {
          ...baseElement,
          // Text-specific properties
          textAlign: el.alignment || el.textAlign || "left",
          verticalAlign: el.verticalAlign || "top",
          fontFamily: el.fontFamily || 1,
          text: el.text || "",
          fontSize: el.fontSize || 20,
          baseline: el.baseline || el.fontSize || 20,
          containerId: el.containerId || null,
          originalText: el.originalText || el.text || "",
          lineHeight: el.lineHeight || 1.25,
        };
      }

      return baseElement;
    });
  }, []);

  // Load all slides at once with proper positioning (like POC)
  const loadAllSlides = useCallback(() => {
    logger.debug("Loading all slides with positioning...");

    const allElements: any[] = [];
    // Use a fixed base width for slide positioning to prevent repositioning on resize
    const baseWidth = 800; // Fixed base width for slide spacing
    let currentOffset = 0;

    slides.forEach((slide, slideIndex) => {
      const slideElements = slide.elements || [];

      if (slideElements.length === 0) {
        logger.warn(`Slide ${slideIndex} has no elements`);
        return;
      }

      // Fix elements format
      const fixedElements = inspectAndFixElements(slideElements);

      // Apply positioning offset to each element (use fixed base width for consistent spacing)
      const slideOffset = slideIndex * (baseWidth * 2); // Much larger spacing between slides
      const positionedElements = fixedElements.map((el, elementIndex) => {
        const newX = el.x + slideOffset;
        logger.debug(
          `Positioning element ${elementIndex} in slide ${slideIndex}:`,
          {
            originalX: el.x,
            slideOffset,
            newX,
            elementType: el.type,
            elementId: el.id,
          }
        );

        const uniqueId = `${el.id}_slide_${slideIndex}`;
        logger.debug(`Creating unique ID for element: ${el.id} → ${uniqueId}`);
        
        return {
          ...el,
          x: newX,
          // Make element ID unique per slide to prevent Excalidraw overwrites
          id: uniqueId,
          // Add slide metadata to elements
          customData: {
            ...el.customData,
            slideIndex,
            slideOffset,
            originalX: el.x,
            originalY: el.y,
            originalId: el.id, // Keep original ID for reference
          },
        };
      });

      allElements.push(...positionedElements);

      // Calculate offset for next slide (use fixed base width for consistent spacing)
      currentOffset = slideIndex * (baseWidth + 100);

      logger.debug(
        `Slide ${slideIndex + 1} positioned at offset ${
          currentOffset - (baseWidth + 100)
        }`,
        {
          elementsCount: positionedElements.length,
          slideOffset: currentOffset - (baseWidth + 100),
        }
      );
    });

    return allElements;
  }, [slides, inspectAndFixElements]); // Remove containerSize.width dependency

  // Move camera to specific slide position (like POC's scrollToContent)
  const moveToSlide = useCallback(
    (slideIndex: number) => {
      if (!excalidrawAPI || slideIndex >= slides.length) return;

      const slide = slides[slideIndex];
      // Use the same fixed base width as in loadAllSlides
      const baseWidth = 800;
      const slideOffset = slideIndex * (baseWidth * 2);

      logger.debug(`Moving camera to slide ${slideIndex + 1} (zero-based index: ${slideIndex})`, {
        slideOffset,
        slideTitle: slide.template_name,
        totalElements: accumulatedElements.current.length,
      });

      try {
        // Find elements for this slide
        const slideElements = accumulatedElements.current.filter(
          (el) => el.customData?.slideIndex === slideIndex
        );

        logger.debug(
          `Found ${slideElements.length} elements for slide ${slideIndex + 1} (slideIndex: ${slideIndex})`,
          {
            slideElements: slideElements.map(el => ({
              id: el.id,
              x: el.x,
              y: el.y,
              slideIndex: el.customData?.slideIndex,
              type: el.type
            }))
          }
        );

        if (slideElements.length > 0) {
          // Scroll to slide elements with animation and proper zoom
          excalidrawAPI.scrollToContent(slideElements, {
            fitToViewport: true, // Fit slide to viewport for proper zoom
            animate: true,
            duration: 800,
          });
          logger.debug(`Used scrollToContent for slide ${slideIndex + 1}`);
        } else {
          // Fallback: manual scroll to position
          logger.debug(
            `Using manual scroll to offset ${slideOffset} for slide ${
              slideIndex + 1
            }`
          );
          excalidrawAPI.updateScene({
            appState: {
              scrollX: -slideOffset,
              scrollY: 0,
            },
          });
        }

        logger.debug(`Camera moved to slide ${slideIndex + 1} successfully`);
      } catch (error) {
        logger.error(
          `Failed to move camera to slide ${slideIndex + 1}:`,
          error
        );
      }
    },
    [excalidrawAPI, slides] // Remove containerSize.width dependency
  );

  // Responsive canvas sizing with aspect ratio maintenance
  useEffect(() => {
    const updateCanvasSize = () => {
      if (!containerRef.current) return;
      
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      
      // Base canvas size (16:9 aspect ratio)
      const baseWidth = 800;
      const baseHeight = 450;
      const aspectRatio = baseWidth / baseHeight;
      
      let maxWidth, maxHeight;
      
      if (isFullscreen) {
        // Use full viewport dimensions for fullscreen
        maxWidth = window.innerWidth * 0.95;
        maxHeight = window.innerHeight * 0.95;
      } else {
        // Use container dimensions for normal mode, accounting for controls
        maxWidth = containerRect.width * 0.95;
        maxHeight = (containerRect.height - (showControls ? 80 : 0)) * 0.95;
      }
      
      // Calculate new dimensions maintaining aspect ratio
      let newWidth = maxWidth;
      let newHeight = newWidth / aspectRatio;
      
      if (newHeight > maxHeight) {
        newHeight = maxHeight;
        newWidth = newHeight * aspectRatio;
      }
      
      // Ensure minimum size
      const minWidth = 320;
      const minHeight = 180;
      
      if (newWidth < minWidth) {
        newWidth = minWidth;
        newHeight = newWidth / aspectRatio;
      }
      
      // Calculate scale factor for content scaling
      const scale = Math.min(newWidth / baseWidth, newHeight / baseHeight);
      
      setContainerSize({ width: newWidth, height: newHeight });
      setScaleFactor(scale);
      
      logger.debug("Canvas size updated", {
        containerSize: { width: containerRect.width, height: containerRect.height },
        canvasSize: { width: newWidth, height: newHeight },
        scaleFactor: scale,
        isFullscreen
      });
    };
    
    // Initial size calculation with a small delay to ensure DOM is ready
    const timer = setTimeout(updateCanvasSize, 100);
    
    // Add window resize listener for immediate response
    window.addEventListener('resize', updateCanvasSize);
    
    // Add resize observer for container changes
    const resizeObserver = new ResizeObserver(() => {
      // Use timeout to debounce rapid resize events
      clearTimeout(timer);
      setTimeout(updateCanvasSize, 50);
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    // Cleanup
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateCanvasSize);
      resizeObserver.disconnect();
    };
  }, [isFullscreen, showControls]);

  // Update Excalidraw view when container size changes to fix current slide scaling
  useEffect(() => {
    if (!excalidrawAPI || !allSlidesLoaded) return;

    // Add a small delay to ensure the canvas has been resized
    const timer = setTimeout(() => {
      logger.debug("Container size changed, updating current slide view", {
        containerSize,
        currentSlideIndex,
        scaleFactor
      });
      
      // Re-fit the current slide to the new container size
      moveToSlide(currentSlideIndex);
    }, 100);

    return () => clearTimeout(timer);
  }, [containerSize, excalidrawAPI, allSlidesLoaded, currentSlideIndex, moveToSlide, scaleFactor]);

  // Create simple test elements to verify updateScene works
  const createTestElements = useCallback(() => {
    return [
      {
        id: "test-rect-1",
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        angle: 0,
        strokeColor: "#000000",
        backgroundColor: "#ffcccc",
        fillStyle: "hachure",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: { type: 3 },
        seed: 12345,
        versionNonce: 123456789,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
        index: "a0",
        customData: null,
      },
      {
        id: "test-text-1",
        type: "text",
        x: 120,
        y: 120,
        width: 160,
        height: 60,
        angle: 0,
        strokeColor: "#000000",
        backgroundColor: "transparent",
        fillStyle: "hachure",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: 12346,
        versionNonce: 123456790,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
        text: "Test Element",
        fontSize: 20,
        fontFamily: 1,
        textAlign: "center",
        verticalAlign: "middle",
        baseline: 16,
        containerId: null,
        originalText: "Test Element",
        lineHeight: 1.25,
        index: "a1",
        customData: null,
      },
    ];
  }, []);

  // Function to regenerate fractional indices for elements (from POC)
  const regenerateIndices = useCallback((elements: any[]) => {
    return elements.map((element, index) => ({
      ...element,
      // Generate new clean fractional indices
      index: `a${(index + 1).toString(36).padStart(4, "0")}`,
      // Keep the unique slide-based ID we created earlier
      // Only regenerate ID if it doesn't already have slide suffix
      id: element.id.includes("_slide_") 
        ? element.id
        : `${element.id}_${Date.now()}_${index}`,
    }));
  }, []);

  // Debounced scene update function with index regeneration (adapted from POC)
  const debouncedUpdateScene = useCallback(
    (elements: any[], currentElements?: any[], delay = 150) => {
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
                    (origEl: any) => {
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
                  logger.warn(
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
                    logger.warn("Fallback scroll also failed:", fallbackError);
                  }
                }
              }, 50);
            }

            logger.debug(
              `Debounced scene update successful (attempt ${attempt})`
            );
          } catch (error) {
            logger.error(
              `Debounced scene update failed (attempt ${attempt}):`,
              error
            );

            // Handle fractional indices error with progressive recovery
            if (
              error instanceof Error &&
              error.message?.includes(
                "Fractional indices invariant has been compromised"
              )
            ) {
              logger.warn(
                `Fractional indices error detected on attempt ${attempt}, trying recovery...`
              );

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

                // Last resort: clear scene and rebuild
                try {
                  excalidrawAPI.updateScene({
                    elements: [],
                    appState: { viewBackgroundColor: "#fafafa" },
                  });

                  setTimeout(() => {
                    const finalElements = pendingElements.map(
                      (el: any, idx: number) => ({
                        ...el,
                        index: `clean_${idx}`,
                        id: `final_${Date.now()}_${idx}`,
                      })
                    );

                    excalidrawAPI.updateScene({
                      elements: finalElements,
                      appState: { viewBackgroundColor: "#fafafa" },
                    });
                  }, 100);
                } catch (finalError) {
                  logger.error("Final recovery attempt failed:", finalError);
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

  // Show next slide (handles timing and progression only)
  const showNextSlide = useCallback(() => {
    if (
      !excalidrawAPI ||
      currentSlideIndex >= slides.length ||
      !isPlaying ||
      !allSlidesLoaded
    ) {
      if (currentSlideIndex >= slides.length) {
        setIsPlaying(false);
        onPlaybackEnd?.();
      }
      return;
    }

    const slide = slides[currentSlideIndex];

    logger.debug(`Showing slide ${currentSlideIndex + 1}/${slides.length}`, {
      slideNumber: slide.slide_number,
      templateName: slide.template_name,
      duration: slide.estimated_duration,
      allSlidesLoaded,
    });

    // Schedule next slide based on estimated duration
    const duration = Math.max(2000, slide.estimated_duration * 1000); // Minimum 2 seconds
    slideProgressTimerRef.current = setTimeout(() => {
      setCurrentSlideIndex((prev) => {
        const nextIndex = prev + 1;
        if (nextIndex >= slides.length) {
          setIsPlaying(false);
          onPlaybackEnd?.();
          return prev; // Don't increment past the last slide
        }
        return nextIndex;
      });
    }, duration);
  }, [
    excalidrawAPI,
    currentSlideIndex,
    slides,
    isPlaying,
    allSlidesLoaded,
    onPlaybackEnd,
  ]);

  // Initialize audio generation when slides are loaded (prevent continuous loop)
  const slidesRef = useRef<typeof slides>([]);
  const hasInitializedRef = useRef(false);
  
  useEffect(() => {
    // Only trigger if slides actually changed or haven't been initialized
    const slidesChanged = JSON.stringify(slides) !== JSON.stringify(slidesRef.current);
    
    if (enableAudio && slides.length > 0 && !audioStatus.isReady && !audioStatus.isProcessing && 
        (slidesChanged || !hasInitializedRef.current)) {
      
      logger.debug("Initializing audio generation for slides", { 
        slideCount: slides.length,
        slidesChanged,
        hasInitialized: hasInitializedRef.current
      });
      
      // Mark as initialized to prevent continuous retries
      hasInitializedRef.current = true;
      slidesRef.current = slides;
      
      const audioSlides = slides.map(slide => ({
        slide_number: slide.slide_number,
        narration: slide.narration || "",
        estimated_duration: slide.estimated_duration
      }));
      
      generateMultiSlideAudio(audioSlides, {
        separatorPause: crossfadeDuration
      }).catch(error => {
        logger.error("Audio generation failed:", error);
        onAudioError?.(error instanceof Error ? error.message : 'Audio generation failed');
        // Reset initialization flag to allow retry if slides change
        hasInitializedRef.current = false;
      });
    }
  }, [slides, enableAudio, audioStatus.isReady, audioStatus.isProcessing, generateMultiSlideAudio, crossfadeDuration, onAudioError]);

  // Notify when audio is ready
  useEffect(() => {
    if (audioStatus.isReady && audioStatus.currentPhase === 'ready') {
      logger.debug("Audio is ready for playback");
      onAudioReady?.();
    }
  }, [audioStatus.isReady, audioStatus.currentPhase, onAudioReady]);

  // Set up slide progression event listeners
  useEffect(() => {
    if (!enableAudio && !audioStatus.isReady) return;

    // Listen for slide changes from the unified progression system
    const unsubscribeSlideChange = progressionEvents.onSlideChange((slideIndex) => {
      logger.debug("Slide changed via progression system", { slideIndex });
      setCurrentSlideIndex(slideIndex);
      onSlideChange?.(slideIndex);
    });

    // Listen for time updates
    const unsubscribeTimeUpdate = progressionEvents.onTimeUpdate((time, slideIndex) => {
      setCurrentAudioTime(time);
      if (slideIndex !== currentSlideIndex) {
        setCurrentSlideIndex(slideIndex);
        onSlideChange?.(slideIndex);
      }
    });

    return () => {
      if (typeof unsubscribeSlideChange === 'function') {
        unsubscribeSlideChange();
      }
      if (typeof unsubscribeTimeUpdate === 'function') {
        unsubscribeTimeUpdate();
      }
    };
  }, [enableAudio, audioStatus.isReady, progressionEvents, currentSlideIndex, onSlideChange]);

  // Sync audio time and duration for seekbar
  useEffect(() => {
    if (!enableAudio || !audioElement) return;

    const handleTimeUpdate = () => {
      setCurrentAudioTime(audioElement.currentTime);
    };

    const handleLoadedMetadata = () => {
      setAudioDuration(audioElement.duration || 0);
    };

    const handleDurationChange = () => {
      setAudioDuration(audioElement.duration || 0);
    };

    // Add event listeners
    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioElement.addEventListener('durationchange', handleDurationChange);

    // Initial sync if data is already available
    if (audioElement.duration) {
      setAudioDuration(audioElement.duration);
    }
    setCurrentAudioTime(audioElement.currentTime);

    return () => {
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audioElement.removeEventListener('durationchange', handleDurationChange);
    };
  }, [enableAudio, audioElement]);

  // Initialize slides when component mounts
  useEffect(() => {
    if (excalidrawAPI) {
      if (testMode) {
        // Test mode: use simple test elements
        logger.debug("Initializing in TEST MODE");
        const testElements = createTestElements();
        accumulatedElements.current = testElements;

        try {
          excalidrawAPI.updateScene({
            elements: testElements,
            appState: {
              viewBackgroundColor: "#fafafa",
              zoom: { value: 1 as any },
              scrollX: 0,
              scrollY: 0,
              zenModeEnabled: false,
              viewModeEnabled: true,
            },
          });
          logger.debug("Test elements loaded successfully:", testElements);
          setAllSlidesLoaded(true);
        } catch (error) {
          logger.error("Failed to load test elements:", error);
        }
        return;
      }

      if (slides.length > 0) {
        logger.debug(
          "Initializing multi-slide player with POC-style positioning",
          {
            slidesCount: slides.length,
            containerSize,
          }
        );

        // Load ALL slides at once with proper positioning
        const allElements = loadAllSlides();

        if (allElements.length === 0) {
          logger.warn(
            "No elements found in any slides! Falling back to first slide only..."
          );

          // Fallback: load just first slide
          const firstSlide = slides[0];
          if (firstSlide.elements && firstSlide.elements.length > 0) {
            const fixedElements = inspectAndFixElements(firstSlide.elements);
            const cleanedFirstSlide = regenerateIndices(fixedElements);
            accumulatedElements.current = cleanedFirstSlide;

            try {
              excalidrawAPI.updateScene({
                elements: cleanedFirstSlide,
                appState: {
                  viewBackgroundColor: "#fafafa",
                  zoom: { value: 1 as any },
                  scrollX: 0,
                  scrollY: 0,
                  zenModeEnabled: false,
                  viewModeEnabled: true,
                },
              });
              logger.debug("Fallback: First slide loaded successfully");
              setAllSlidesLoaded(true);
              setCurrentSlideIndex(0);
            } catch (error) {
              logger.error("Fallback: Failed to load first slide:", error);
            }
          }
          return;
        }

        // Clean all elements with proper indices
        const cleanedAllElements = regenerateIndices(allElements);
        accumulatedElements.current = cleanedAllElements;

        logger.debug("=== COMPREHENSIVE SLIDE POSITIONING DEBUG ===");
        logger.debug("All slides loaded with positioning:", {
          totalElements: cleanedAllElements.length,
          slidesCount: slides.length,
          containerWidth: containerSize.width,
          elementsBySlide: slides.map(
            (_, index) =>
              cleanedAllElements.filter(
                (el) => el.customData?.slideIndex === index
              ).length
          ),
        });

        // Log each slide's positioning in detail
        slides.forEach((slide, index) => {
          const slideElements = cleanedAllElements.filter(
            (el) => el.customData?.slideIndex === index
          );
          const baseWidth = 800; // Use same fixed base width
          const calculatedOffset = index * (baseWidth * 2);
          
          logger.debug(`SLIDE ${index} (${slide.template_name}):`, {
            slideIndex: index,
            templateName: slide.template_name,
            calculatedOffset,
            elementsCount: slideElements.length,
            elements: slideElements.map((el) => ({
              id: el.id,
              originalId: el.customData?.originalId,
              type: el.type,
              x: el.x,
              y: el.y,
              originalX: el.customData?.originalX,
              slideIndex: el.customData?.slideIndex,
              slideOffset: el.customData?.slideOffset
            })),
          });
        });

        // Load all elements to canvas at once
        try {
          excalidrawAPI.updateScene({
            elements: cleanedAllElements,
            appState: {
              viewBackgroundColor: "#fafafa",
              zoom: { value: 1 as any },
              scrollX: 0,
              scrollY: 0,
              zenModeEnabled: false, // Keep zen mode disabled for controls visibility
              viewModeEnabled: true,
            },
          });
          logger.debug("All slides loaded to canvas successfully");

          // Mark all slides as loaded
          setAllSlidesLoaded(true);

          // Move to first slide and ensure proper zoom
          setTimeout(() => {
            logger.debug("Initializing view - moving to first slide");
            
            // First, reset the view to origin and zoom out to see all content
            excalidrawAPI.updateScene({
              appState: {
                scrollX: 0,
                scrollY: 0,
                zoom: { value: 0.5 as any }, // Zoom out to see more content initially
              },
            });

            // Then move to first slide with proper zoom
            setTimeout(() => {
              logger.debug("Moving to slide 0 after initialization");
              moveToSlide(0);
            }, 300);
          }, 500);
        } catch (error) {
          logger.error("Failed to load all slides to canvas:", error);
        }

        setCurrentSlideIndex(0);

        // Auto-start if requested
        if (autoPlay) {
          setTimeout(() => {
            setIsPlaying(true);
            onPlaybackStart?.();
          }, 1000); // Longer delay to allow slide loading
        }
      }
    }
  }, [
    excalidrawAPI,
    slides,
    autoPlay,
    regenerateIndices,
    onPlaybackStart,
    testMode,
    createTestElements,
    loadAllSlides,
    moveToSlide,
    // Remove containerSize dependency to prevent slide reloading on resize
  ]);

  // Sync progression state with local playing state
  useEffect(() => {
    if (progressionState.isPlaying !== isPlaying) {
      setIsPlaying(progressionState.isPlaying);
    }
  }, [progressionState.isPlaying, isPlaying]);

  // Sync progression slide index with local slide index
  useEffect(() => {
    if (progressionState.currentSlideIndex !== currentSlideIndex) {
      setCurrentSlideIndex(progressionState.currentSlideIndex);
    }
  }, [progressionState.currentSlideIndex, currentSlideIndex]);

  // Handle camera movement when slide index changes
  useEffect(() => {
    if (allSlidesLoaded && excalidrawAPI) {
      moveToSlide(currentSlideIndex);
    }
  }, [currentSlideIndex, allSlidesLoaded, excalidrawAPI, moveToSlide]);

  // Check if we're in visual-only mode (audio generation failed)
  const isVisualOnlyMode = enableAudio && audioStatus.isReady && mergedAudio && !mergedAudio.mergedAudioUrl;

  // Toggle play/pause with unified progression system
  const togglePlayPause = useCallback(() => {
    // Check if audio is required and ready (but allow visual-only mode)
    if (enableAudio && !audioStatus.isReady && !isVisualOnlyMode) {
      logger.warn("Cannot play: audio not ready", { 
        audioStatus: audioStatus.currentPhase,
        isProcessing: audioStatus.isProcessing
      });
      return;
    }

    if (progressionState.isPlaying) {
      // Pause using progression system
      progressionActions.pause();
      logger.debug("Playback paused via progression system");
    } else {
      if (currentSlideIndex >= slides.length) {
        // Reset to beginning if at end
        progressionActions.reset();
        
        // Clear pending updates
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        pendingUpdateRef.current = null;

        // Move camera back to first slide
        if (excalidrawAPI && allSlidesLoaded) {
          setTimeout(() => moveToSlide(0), 100);
        }
      }
      
      // Start playback using progression system
      progressionActions.play();
      logger.debug("Playback started via progression system", {
        mode: progressionState.mode,
        currentSlide: progressionState.currentSlideIndex
      });
      
      onPlaybackStart?.();
    }
  }, [
    progressionState.isPlaying,
    progressionState.mode,
    progressionState.currentSlideIndex,
    currentSlideIndex,
    slides.length,
    excalidrawAPI,
    onPlaybackStart,
    allSlidesLoaded,
    moveToSlide,
    enableAudio,
    audioStatus.isReady,
    isVisualOnlyMode,
    progressionActions,
  ]);

  // Reset lesson with unified progression system
  const resetLesson = useCallback(() => {
    // Reset using progression system
    progressionActions.reset();
    logger.debug("Lesson reset via progression system");

    // Clear all timers
    if (slideProgressTimerRef.current) {
      clearTimeout(slideProgressTimerRef.current);
      slideProgressTimerRef.current = null;
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingUpdateRef.current = null;

    // Move camera back to first slide
    if (allSlidesLoaded) {
      moveToSlide(0);
    }
  }, [allSlidesLoaded, moveToSlide, progressionActions]);

  // Toggle fullscreen
  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'hidden'; // Prevent body scroll in fullscreen
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'unset';
    };
  }, [isFullscreen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (slideProgressTimerRef.current) {
        clearTimeout(slideProgressTimerRef.current);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Get play button text with audio status
  const getPlayButtonText = () => {
    if (enableAudio && !audioStatus.isReady) {
      if (audioStatus.isProcessing) {
        return `🔄 ${audioStatus.progress || 'Preparing audio...'}`;
      }
      if (audioStatus.error) {
        return "❌ Audio Error";
      }
      return "⏳ Loading audio...";
    }
    
    if (isPlaying) return "⏸️ Pause";
    if (currentSlideIndex === 0) return "▶️ Play";
    if (currentSlideIndex >= slides.length) return "🔄 Restart";
    return "▶️ Resume";
  };

  // Check if play button should be disabled
  const isPlayButtonDisabled = () => {
    if (slides.length === 0) return true;
    if (enableAudio && !audioStatus.isReady && !isVisualOnlyMode) return true;
    return false;
  };

  if (!slides || slides.length === 0) {
    return (
      <div className={`relative ${className}`}>
        <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">📝</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Slides Available
            </h3>
            <p className="text-gray-600 text-sm">
              Load some template slides to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Container that switches between normal and fullscreen */}
      <div
        ref={containerRef}
        className={`relative ${className} ${isFullscreen ? 'fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center' : 'h-full'}`}
      >
        {/* Fullscreen exit button */}
        {isFullscreen && (
          <div className="absolute top-4 right-4 z-10 flex space-x-2">
            <button
              onClick={handleToggleFullscreen}
              className="px-3 py-2 bg-white bg-opacity-20 text-white rounded-md hover:bg-opacity-30 transition-all duration-200 backdrop-blur-sm"
              title="Exit Fullscreen (ESC)"
            >
              ✕
            </button>
          </div>
        )}
        
        {/* Normal fullscreen button */}
        {!isFullscreen && (
          <button
            onClick={handleToggleFullscreen}
            className="absolute top-4 right-4 z-10 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 shadow-md"
            title="Enter Fullscreen"
          >
            ⛶
          </button>
        )}
        {/* Excalidraw Canvas - Responsive container */}
        <div className={`w-full h-full flex items-center justify-center ${isFullscreen ? 'bg-transparent' : 'bg-gray-50'}`}>
          <div
            className={`bg-white transition-all duration-300 overflow-hidden ${
              isFullscreen 
                ? 'shadow-2xl border border-gray-300' 
                : 'shadow-lg border border-gray-300'
            }`}
            style={{
              width: containerSize.width,
              height: containerSize.height,
            }}
          >
            <Excalidraw
              excalidrawAPI={(api) => setExcalidrawAPI(api)}
              initialData={{
                elements: [],
                appState: {
                  viewBackgroundColor: "#fafafa",
                  currentItemFontFamily: 1,
                  zenModeEnabled: false, // Keep consistent zen mode setting
                  gridModeEnabled: false,
                  viewModeEnabled: true,
                  zoom: { value: 1 as any },
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
                tools: { image: false },
                welcomeScreen: false,
              }}
              detectScroll={false}
              handleKeyboardGlobally={false}
            />
          </div>
        </div>

        {/* Player Controls */}
        {showControls && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent z-50 pointer-events-auto">
            <div className="px-6 py-4">
              {/* Audio seekbar (only show when audio is enabled and ready with audio) */}
              {enableAudio && audioStatus.isReady && mergedAudio && mergedAudio.mergedAudioUrl && (
                <div className="mb-4">
                  <AudioSeekBar
                    currentTime={currentAudioTime}
                    duration={audioDuration || mergedAudio.totalDuration}
                    isPlaying={isPlaying}
                    slideMarkers={mergedAudio.slideSegments.map((segment, index) => ({
                      slideNumber: segment.slideNumber,
                      startTime: segment.startTime,
                      endTime: segment.endTime,
                      text: segment.text
                    }))}
                    currentSlideIndex={currentSlideIndex}
                    onSeek={(time) => {
                      progressionActions.seekToTime(time);
                      audioSeekToTime(time);
                    }}
                    onSlideClick={(slideIndex) => {
                      progressionActions.seekToSlide(slideIndex);
                      audioSeekToSlide(slideIndex);
                    }}
                    showSlideMarkers={true}
                    showTimeLabels={true}
                    className="w-full"
                  />
                </div>
              )}

              {/* Visual-only mode indicator */}
              {isVisualOnlyMode && (
                <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg">
                  <div className="text-sm text-yellow-200 flex items-center gap-2">
                    <span>⚠️</span>
                    <span>TTS service unavailable - running in visual-only mode</span>
                  </div>
                </div>
              )}

              {/* Audio loading progress (show when audio is being generated) */}
              {enableAudio && audioStatus.isProcessing && (
                <div className="mb-4">
                  <div className="text-xs text-white/70 mb-2 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                    <span>{audioStatus.progress}</span>
                    <span className="text-white/50">({Math.round(audioStatus.generationProgress)}%)</span>
                  </div>
                  <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-400 to-pink-400 transition-all duration-300"
                      style={{ width: `${audioStatus.generationProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Audio error state */}
              {enableAudio && audioStatus.error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                  <div className="text-sm text-red-200 flex items-center gap-2">
                    <span>❌</span>
                    <span>Audio Error: {audioStatus.error}</span>
                  </div>
                </div>
              )}

              {/* Control buttons and info */}
              <div className="flex items-center gap-4 overflow-hidden">
                {/* Left side - Control buttons */}
                <div className="flex items-center space-x-4 flex-shrink-0">
                  {/* Play/Pause */}
                  <button
                    onClick={togglePlayPause}
                    disabled={isPlayButtonDisabled()}
                    className={`flex items-center justify-center w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full transition-colors pointer-events-auto ${
                      isPlayButtonDisabled() ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    title={enableAudio && !audioStatus.isReady ? audioStatus.progress : undefined}
                  >
                    {enableAudio && !audioStatus.isReady ? (
                      // Loading state for audio
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : progressionState.isPlaying ? (
                      <svg
                        className="w-6 h-6 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-6 h-6 text-white ml-0.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
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
                    className="flex items-center justify-center w-8 h-8 bg-white/20 hover:bg-white/30 rounded transition-colors pointer-events-auto"
                  >
                    <svg
                      className="w-4 h-4 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {/* Fullscreen toggle - only show in normal mode */}
                  {!isFullscreen && (
                    <button
                      onClick={handleToggleFullscreen}
                      className="flex items-center justify-center w-8 h-8 bg-white/20 hover:bg-white/30 rounded transition-colors pointer-events-auto"
                      title="Enter Fullscreen"
                    >
                      <span className="text-white text-sm">⛶</span>
                    </button>
                  )}
                </div>

                {/* Center spacer */}
                <div className="flex-1"></div>

                {/* Right side - Slide info */}
                <div className="flex items-center gap-2 text-white text-sm min-w-0 flex-shrink">
                  {/* Slide indicator */}
                  <div className="bg-purple-500/30 px-3 py-1 rounded-full whitespace-nowrap">
                    <span className="text-white/90 text-sm font-medium">
                      🎯 Slide {Math.min(currentSlideIndex + 1, slides.length)} /{" "}
                      {slides.length}
                    </span>
                  </div>

                  {/* Current slide info */}
                  {slides[Math.min(currentSlideIndex, slides.length - 1)] && (
                    <div className="bg-white/20 px-3 py-1 rounded-full whitespace-nowrap">
                      <span className="text-white/80 text-sm">
                        {
                          slides[Math.min(currentSlideIndex, slides.length - 1)]
                            .template_name
                        }
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        progressionState.isPlaying ? "bg-green-400" : "bg-yellow-400"
                      }`}
                    ></div>
                    <span className="text-white/80 text-xs hidden sm:inline">
                      {progressionState.isPlaying ? "Playing" : "Paused"}
                    </span>
                    {progressionState.mode !== 'idle' && (
                      <span className="text-white/60 text-xs hidden md:inline ml-1">
                        ({progressionState.mode})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default MultiSlideCanvasPlayer;
