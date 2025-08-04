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
import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { createComponentLogger, getApiUrl } from "@ai-tutor/utils";
// Removed complex useSlideProgression - using simple audio player instead
import { SimpleAudioPlayer, type AudioSegment } from "./SimpleAudioPlayer";

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
  existingAudioSegments?: Array<{
    slide_number: number;
    text: string;
    start_time: number;
    duration: number;
    end_time: number;
    audio_id?: string;
    audio_url?: string;
  }>; // Pre-generated audio segments from backend
  mergedAudioUrl?: string; // Pre-merged audio file URL from backend
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
  existingAudioSegments,
  mergedAudioUrl,
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
  const [containerSize, setContainerSize] = useState({
    width: 800,
    height: 450,
  });
  const [scaleFactor, setScaleFactor] = useState(1);

  // Audio playback state
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  // Refs for POC-style management
  const accumulatedElements = useRef<any[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<any>(null);
  const slideProgressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isLoadingElementsRef = useRef<boolean>(false); // Prevent clearing during loading
  const apiRef = useRef<any>(null); // Store API reference for interceptor

  // Simple audio state management (replacing complex useMultiSlideAudio)
  const [audioReady, setAudioReady] = useState(false);

  // Convert existingAudioSegments to SimpleAudioPlayer format (memoized to prevent re-renders)
  const audioSegments: AudioSegment[] = useMemo(() => {
    return (existingAudioSegments || []).map((segment) => ({
      slide_number: segment.slide_number,
      start_time: segment.start_time,
      end_time: segment.end_time,
      text: segment.text,
    }));
  }, [existingAudioSegments]);

  // Visual-only mode detection (memoized to prevent re-renders)
  const isVisualOnlyMode = useMemo(() => {
    return !enableAudio || !mergedAudioUrl || audioSegments.length === 0;
  }, [enableAudio, mergedAudioUrl, audioSegments.length]);

  // Debug: Log audio setup
  logger.debug("Simple audio setup", {
    enableAudio,
    mergedAudioUrl,
    audioSegmentsCount: audioSegments.length,
    isVisualOnlyMode,
    audioReady,
  });

  // Simple audio initialization
  useEffect(() => {
    if (enableAudio && mergedAudioUrl && audioSegments.length > 0) {
      setAudioReady(true);
      logger.debug("Audio ready with merged URL", {
        mergedAudioUrl,
        segmentCount: audioSegments.length,
      });
    } else if (!enableAudio || isVisualOnlyMode) {
      setAudioReady(true); // Allow visual-only mode
      logger.debug("Visual-only mode ready");
    }
  }, [enableAudio, mergedAudioUrl, audioSegments.length, isVisualOnlyMode]);

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

  // Validate that elements are properly loaded
  const validateElementsLoaded = useCallback(() => {
    // Protect against clearing during loading process
    if (isLoadingElementsRef.current) {
      logger.debug("🔒 Skipping validation during loading process", {
        isLoading: isLoadingElementsRef.current,
      });
      return true; // Don't interfere with loading process
    }

    const elements = accumulatedElements.current;
    if (!elements || elements.length === 0) {
      logger.debug("⚠️ No elements loaded yet", {
        elementsLength: elements?.length || 0,
        isLoading: isLoadingElementsRef.current,
      });
      return false;
    }

    // Check that all elements have required properties
    const validElements = elements.every(
      (el) =>
        el.id &&
        el.type &&
        typeof el.x === "number" &&
        typeof el.y === "number" &&
        el.versionNonce &&
        el.index
    );

    if (!validElements) {
      logger.warn("Some elements are missing required properties");
      return false;
    }

    logger.debug(`All ${elements.length} elements validated successfully`);
    return true;
  }, []);

  // Load all slides at once with proper positioning (simplified)
  const loadAllSlides = useCallback(() => {
    logger.debug("Loading all slides with positioning (simplified)...");

    const allElements: any[] = [];
    const baseWidth = 800; // Fixed base width for slide spacing

    slides.forEach((slide, slideIndex) => {
      const slideElements = slide.elements || [];

      if (slideElements.length === 0) {
        logger.warn(`Slide ${slideIndex} has no elements`);
        return;
      }

      logger.debug(`Processing slide ${slideIndex} with ${slideElements.length} elements`);

      // Fix elements format
      const fixedElements = inspectAndFixElements(slideElements);

      // Apply positioning offset to each element
      const slideOffset = slideIndex * (baseWidth * 2); 
      const positionedElements = fixedElements.map((el, elementIndex) => {
        const newX = el.x + slideOffset;
        const uniqueId = `${el.id}_slide_${slideIndex}`;

        const elementWithMetadata = {
          ...el,
          x: newX,
          id: uniqueId,
          // ALWAYS add slide metadata - this is critical
          customData: {
            ...el.customData,
            slideIndex, // This is the key field for filtering
            slideOffset,
            originalX: el.x,
            originalY: el.y,
            originalId: el.id,
          },
        };

        logger.debug(`Element ${elementIndex} in slide ${slideIndex}:`, {
          id: uniqueId,
          slideIndex: elementWithMetadata.customData.slideIndex,
          originalX: el.x,
          newX,
        });

        return elementWithMetadata;
      });

      allElements.push(...positionedElements);
    });

    logger.debug(`loadAllSlides completed with ${allElements.length} total elements`, {
      elementsPerSlide: slides.map((_, idx) => 
        allElements.filter(el => el.customData?.slideIndex === idx).length
      ),
    });

    return allElements;
  }, [slides, inspectAndFixElements]);

  // Move camera to specific slide position (like POC's scrollToContent)
  const moveToSlide = useCallback(
    (slideIndex: number) => {
      if (!excalidrawAPI || slideIndex >= slides.length) return;

      const slide = slides[slideIndex];
      // Use the same fixed base width as in loadAllSlides
      const baseWidth = 800;
      const slideOffset = slideIndex * (baseWidth * 2);

      logger.debug(
        `Moving camera to slide ${
          slideIndex + 1
        } (zero-based index: ${slideIndex})`,
        {
          slideOffset,
          slideTitle: slide.template_name,
          totalElements: accumulatedElements.current.length,
        }
      );

      try {
        // Debug: Log what's actually in accumulatedElements
        logger.debug("🔍 Current accumulated elements:", {
          totalElements: accumulatedElements.current.length,
          elements: accumulatedElements.current.map((el, idx) => ({
            index: idx,
            id: el.id,
            x: el.x,
            y: el.y,
            slideIndex: el.customData?.slideIndex,
            type: el.type,
            hasCustomData: !!el.customData,
            fullCustomData: el.customData,
          })),
        });

        // SAFETY CHECK: If elements are missing slideIndex, assign them to slide 0
        const elementsWithSlideIndex = accumulatedElements.current.map((el, idx) => {
          if (el.customData?.slideIndex === undefined) {
            logger.warn(`Element ${idx} missing slideIndex, assigning to slide 0:`, {
              id: el.id,
              type: el.type,
            });
            return {
              ...el,
              customData: {
                ...el.customData,
                slideIndex: 0, // Default to slide 0
              },
            };
          }
          return el;
        });

        // Update accumulatedElements if we made changes
        if (elementsWithSlideIndex.some((el, idx) => 
          el.customData?.slideIndex !== accumulatedElements.current[idx]?.customData?.slideIndex
        )) {
          logger.debug("Updated elements with missing slideIndex");
          accumulatedElements.current = elementsWithSlideIndex;
        }

        // Find elements for this slide
        const slideElements = accumulatedElements.current.filter(
          (el) => el.customData?.slideIndex === slideIndex
        );

        logger.debug(
          `Found ${slideElements.length} elements for slide ${
            slideIndex + 1
          } (slideIndex: ${slideIndex})`,
          {
            targetSlideIndex: slideIndex,
            slideElements: slideElements.map((el) => ({
              id: el.id,
              x: el.x,
              y: el.y,
              slideIndex: el.customData?.slideIndex,
              type: el.type,
            })),
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
            elements: accumulatedElements.current, // PRESERVE ELEMENTS!
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

      // Use container dimensions with minimal padding
      const maxWidth = containerRect.width - 40; // 20px padding on each side
      const maxHeight = containerRect.height - 40; // 20px padding top and bottom

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
        containerSize: {
          width: containerRect.width,
          height: containerRect.height,
        },
        canvasSize: { width: newWidth, height: newHeight },
        scaleFactor: scale,
      });
    };

    // Initial size calculation with a small delay to ensure DOM is ready
    const timer = setTimeout(updateCanvasSize, 100);

    // Add window resize listener for immediate response
    window.addEventListener("resize", updateCanvasSize);

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
      window.removeEventListener("resize", updateCanvasSize);
      resizeObserver.disconnect();
    };
  }, [showControls]);

  // Update Excalidraw view when container size changes to fix current slide scaling
  useEffect(() => {
    if (!excalidrawAPI || !allSlidesLoaded) return;

    // Add a small delay to ensure the canvas has been resized
    const timer = setTimeout(() => {
      logger.debug("Container size changed, updating current slide view", {
        containerSize,
        currentSlideIndex,
        scaleFactor,
      });

      // Re-fit the current slide to the new container size
      moveToSlide(currentSlideIndex);
    }, 100);

    return () => clearTimeout(timer);
  }, [
    containerSize,
    excalidrawAPI,
    allSlidesLoaded,
    currentSlideIndex,
    moveToSlide,
    scaleFactor,
  ]);

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

  // Function to regenerate fractional indices for elements (preserve slideIndex)
  const regenerateIndices = useCallback((elements: any[]) => {
    return elements.map((element, index) => {
      const regenerated = {
        ...element,
        // Generate new clean fractional indices
        index: `a${(index + 1).toString(36).padStart(4, "0")}`,
        // Keep the unique slide-based ID we created earlier
        // Only regenerate ID if it doesn't already have slide suffix
        id: element.id.includes("_slide_")
          ? element.id
          : `${element.id}_${Date.now()}_${index}`,
        // PRESERVE customData including slideIndex
        customData: {
          ...element.customData,
          // Ensure slideIndex is preserved
          slideIndex: element.customData?.slideIndex ?? 0, // Default to slide 0 if missing
        },
      };

      logger.debug(`Regenerated indices for element ${index}:`, {
        originalId: element.id,
        newId: regenerated.id,
        slideIndex: regenerated.customData.slideIndex,
        preservedCustomData: !!element.customData,
      });

      return regenerated;
    });
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

  // Memoized callback for audio slide changes to prevent re-renders
  const handleAudioSlideChange = useCallback(
    (slideIndex: number) => {
      logger.debug("🎯 Slide change callback called", { slideIndex });
      // Only move the canvas - don't update currentSlideIndex to prevent re-renders
      moveToSlide(slideIndex);
      onSlideChange?.(slideIndex);
    },
    [moveToSlide, onSlideChange]
  );

  // Initialize audio - either from existing segments or generate new
  const slidesRef = useRef<typeof slides>([]);
  const hasInitializedRef = useRef(false);

  // Removed complex audio initialization - using simple audio player instead

  // Removed duplicate canvas initialization - handled in useLayoutEffect only

  // Notify when audio is ready
  useEffect(() => {
    if (audioReady) {
      logger.debug("Audio is ready for playback");
      onAudioReady?.();
    }
  }, [audioReady, onAudioReady]);

  // Set up slide progression event listeners
  useEffect(() => {
    if (!enableAudio && !audioReady) return;

    // Simple slide change handler - just call callback when currentSlideIndex changes
    // (No complex progression system needed)
  }, [enableAudio, audioReady, currentSlideIndex, onSlideChange]);

  // Simple audio time sync (handled by SimpleAudioPlayer)
  // No complex audio element management needed

  // Initialize slides when component mounts (using useLayoutEffect for synchronous loading)
  useLayoutEffect(() => {
    // Guard: Skip if slides are already loaded to prevent re-initialization
    if (allSlidesLoaded && accumulatedElements.current.length > 0) {
      logger.debug("🔒 Slides already loaded, skipping initialization", {
        elementsCount: accumulatedElements.current.length,
        allSlidesLoaded,
      });
      return;
    }

    // Guard: Skip if no excalidrawAPI yet - will be handled when API becomes available
    if (!excalidrawAPI) {
      logger.debug("⏳ No ExcalidrawAPI yet, waiting for API to become available");
      return;
    }

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

          // Validate test elements before marking as loaded
          if (validateElementsLoaded()) {
            setAllSlidesLoaded(true);
            logger.debug("Test mode: slides marked as loaded after validation");
          } else {
            logger.error("Test mode: element validation failed");
            setAllSlidesLoaded(false);
          }
        } catch (error) {
          logger.error("Failed to load test elements:", error);
        }
        return;
      }

      if (slides.length > 0) {
        logger.debug(
          "🎬 Initializing multi-slide player (simplified)",
          {
            slidesCount: slides.length,
            currentElementsCount: accumulatedElements.current.length,
            allSlidesLoaded,
          }
        );

        // Load ALL slides at once with proper positioning
        const allElements = loadAllSlides();
        logger.debug("🔍 loadAllSlides() returned:", {
          elementsCount: allElements.length,
          slidesCount: slides.length,
          firstElementSample: allElements[0]
            ? {
                id: allElements[0].id,
                type: allElements[0].type,
                x: allElements[0].x,
                y: allElements[0].y,
              }
            : null,
        });

        if (allElements.length === 0) {
          logger.warn(
            "No elements found in any slides! Falling back to first slide only..."
          );

          // Fallback: load just first slide with explicit slideIndex
          const firstSlide = slides[0];
          if (firstSlide.elements && firstSlide.elements.length > 0) {
            logger.debug("Fallback: processing first slide elements", {
              elementsCount: firstSlide.elements.length,
            });

            const fixedElements = inspectAndFixElements(firstSlide.elements);
            
            // CRITICAL: Add slideIndex metadata to fallback elements
            const elementsWithSlideIndex = fixedElements.map((el, idx) => {
              const elementWithSlideData = {
                ...el,
                id: `${el.id}_slide_0`, // Ensure unique ID
                customData: {
                  ...el.customData,
                  slideIndex: 0, // EXPLICITLY set to slide 0
                  slideOffset: 0,
                  originalX: el.x,
                  originalY: el.y,
                  originalId: el.id,
                },
              };

              logger.debug(`Fallback element ${idx}:`, {
                id: elementWithSlideData.id,
                slideIndex: elementWithSlideData.customData.slideIndex,
                type: el.type,
              });

              return elementWithSlideData;
            });

            const cleanedFirstSlide = regenerateIndices(elementsWithSlideIndex);
            accumulatedElements.current = cleanedFirstSlide;

            logger.debug("Fallback elements stored:", {
              elementsCount: cleanedFirstSlide.length,
              slideIndexes: cleanedFirstSlide.map(el => el.customData?.slideIndex),
            });

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

              // Validate elements before marking as loaded
              if (validateElementsLoaded()) {
                setAllSlidesLoaded(true);
                setCurrentSlideIndex(0);
                logger.debug(
                  "Fallback: slide marked as loaded after validation"
                );
              } else {
                logger.error("Fallback: element validation failed");
                setAllSlidesLoaded(false);
              }
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
              slideOffset: el.customData?.slideOffset,
            })),
          });
        });

        // Store elements BEFORE updating canvas to prevent race conditions
        accumulatedElements.current = cleanedAllElements;
        logger.debug("🔒 Elements stored in ref:", {
          elementsCount: accumulatedElements.current.length,
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
              viewModeEnabled: false, // CHANGED: Disable view mode to allow element interaction
            },
          });
          logger.debug("✅ All slides loaded to canvas successfully");
          
          // Debug: Check what Excalidraw actually received
          setTimeout(() => {
            const currentScene = excalidrawAPI.getSceneElements();
            logger.debug("🔍 Excalidraw scene verification:", {
              elementsInScene: currentScene.length,
              firstElement: currentScene[0] ? {
                id: currentScene[0].id,
                type: currentScene[0].type,
                x: currentScene[0].x,
                y: currentScene[0].y,
                opacity: currentScene[0].opacity,
                isDeleted: currentScene[0].isDeleted,
              } : null,
            });
          }, 100);

          // Validate all elements before marking as loaded
          if (validateElementsLoaded()) {
            setAllSlidesLoaded(true);
            logger.debug("✅ All slides marked as loaded after validation", {
              elementsCount: accumulatedElements.current.length,
            });
          } else {
            logger.error("❌ Main loading: element validation failed");
            setAllSlidesLoaded(false);
            return; // Don't proceed with view initialization if validation failed
          }

          // Move to first slide and ensure proper zoom
          setTimeout(() => {
            logger.debug("Initializing view - moving to first slide");

            // First, reset the view to origin and zoom out to see all content
            // CRITICAL: Must preserve elements when updating appState only
            excalidrawAPI.updateScene({
              elements: accumulatedElements.current, // PRESERVE ELEMENTS!
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

        // Auto-start if requested (using current prop values)
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
    slides, // Essential: need to re-run when slides data changes
    testMode, // Essential: affects which code path to take
    // Removed volatile callbacks that cause unnecessary re-runs:
    // - autoPlay, onPlaybackStart (can be handled inside effect)
    // - regenerateIndices, createTestElements, loadAllSlides, moveToSlide, validateElementsLoaded (useCallback deps)
  ]);

  // No complex progression state sync needed - using simple state management

  // Set up API reference when available with interceptor
  useLayoutEffect(() => {
    if (!excalidrawAPI) {
      logger.debug("🔧 API not yet available, waiting...");
      return;
    }

    logger.debug("🔧 Excalidraw API available, setting up interceptor...", {
      hasExistingElements: accumulatedElements.current.length > 0,
      currentSlide: currentSlideIndex,
      apiMethods: Object.keys(excalidrawAPI),
    });

    // Store the API reference
    apiRef.current = excalidrawAPI;

    // Create interceptor for updateScene to track ALL calls with stack traces
    const originalUpdateScene = excalidrawAPI.updateScene;
    const interceptedUpdateScene = (sceneData: any) => {
      const elementsCount = sceneData?.elements?.length || 0;
      const stackTrace = new Error().stack?.split('\n').slice(1, 8).map(line => line.trim()).join('\n') || 'No stack trace';
      
      logger.debug("📝 updateScene INTERCEPTED", {
        elementsCount,
        elementsPreview: sceneData?.elements?.slice(0, 3).map((el: any) => ({
          id: el.id?.substring(0, 12),
          type: el.type,
          slideIndex: el.customData?.slideIndex,
          x: el.x,
          y: el.y
        })) || [],
        appState: sceneData?.appState ? {
          viewBackgroundColor: sceneData.appState.viewBackgroundColor,
          scrollX: sceneData.appState.scrollX,
          scrollY: sceneData.appState.scrollY,
          zoom: sceneData.appState.zoom?.value,
          viewModeEnabled: sceneData.appState.viewModeEnabled,
          zenModeEnabled: sceneData.appState.zenModeEnabled
        } : null,
        stackTrace
      });

      // Special warning for empty scene updates
      if (elementsCount === 0) {
        logger.warn("⚠️ SCENE CLEARING DETECTED!", {
          timestamp: new Date().toISOString(),
          currentAccumulatedElements: accumulatedElements.current.length,
          currentSlideIndex,
          allSlidesLoaded,
          stackTrace,
          sceneDataKeys: Object.keys(sceneData || {}),
          appStateKeys: sceneData?.appState ? Object.keys(sceneData.appState) : null
        });
      }

      // Track element count changes
      const currentSceneElements = apiRef.current?.getSceneElements() || [];
      if (currentSceneElements.length > 0 && elementsCount === 0) {
        logger.error("🚨 CRITICAL: Non-empty scene being cleared!", {
          beforeCount: currentSceneElements.length,
          afterCount: elementsCount,
          stackTrace
        });
      }

      return originalUpdateScene(sceneData);
    };

    // Replace the updateScene method
    excalidrawAPI.updateScene = interceptedUpdateScene;

    // If we have elements loaded but canvas is empty, restore them
    if (accumulatedElements.current.length > 0) {
      const currentScene = excalidrawAPI.getSceneElements();
      if (currentScene.length === 0) {
        logger.debug("🔄 Canvas empty but we have elements, restoring...", {
          totalElements: accumulatedElements.current.length,
          currentSlide: currentSlideIndex,
        });
        
        // Use our intercepted method to restore
        interceptedUpdateScene({
          elements: accumulatedElements.current,
          appState: {
            viewBackgroundColor: "#fafafa",
            viewModeEnabled: true,
          },
        });
      }
    }

    // Cleanup function to restore original method
    return () => {
      if (excalidrawAPI && originalUpdateScene) {
        excalidrawAPI.updateScene = originalUpdateScene;
        logger.debug("🔧 updateScene interceptor removed");
      }
    };
  }, [excalidrawAPI, currentSlideIndex]);

  // Handle excalidrawAPI changes - ONLY restore if elements exist and slides are loaded
  useEffect(() => {
    // Only restore if we have both the API and elements AND slides are marked as loaded
    // AND we're not currently in the middle of initialization
    if (excalidrawAPI && accumulatedElements.current.length > 0 && allSlidesLoaded) {
      logger.debug("🔧 ExcalidrawAPI restoration (slides already loaded)", {
        elementsCount: accumulatedElements.current.length,
        allSlidesLoaded,
      });
      
      try {
        // Simple restoration without changing view state
        excalidrawAPI.updateScene({
          elements: accumulatedElements.current,
          appState: {
            viewBackgroundColor: "#fafafa",
            viewModeEnabled: true,
          },
        });

        logger.debug("✅ Elements restored via excalidrawAPI effect");
      } catch (error) {
        logger.error("❌ Failed to restore elements via excalidrawAPI effect:", error);
      }
    } else {
      logger.debug("⏳ ExcalidrawAPI effect skipped", {
        hasAPI: !!excalidrawAPI,
        hasElements: accumulatedElements.current.length > 0,
        slidesLoaded: allSlidesLoaded,
      });
    }
  }, [excalidrawAPI, allSlidesLoaded]); // Depend on both API and slides loaded state

  // Handle camera movement when slide index changes
  useEffect(() => {
    if (allSlidesLoaded && excalidrawAPI) {
      moveToSlide(currentSlideIndex);
    }
  }, [currentSlideIndex, allSlidesLoaded, excalidrawAPI, moveToSlide]);

  // Check if we're in visual-only mode (audio generation failed)
  // Use simple visual-only mode detection (audio system already defined above)

  // Debug visual-only mode decision
  logger.debug("Visual-only mode check", {
    enableAudio,
    audioReady,
    mergedAudioUrl,
    audioSegmentsCount: audioSegments.length,
    isVisualOnlyMode,
  });

  // Simple toggle play/pause (no complex progression system)
  const togglePlayPause = useCallback(() => {
    logger.debug("Play button clicked", {
      enableAudio,
      audioReady,
      isVisualOnlyMode,
    });

    // Check if audio is required and ready (but allow visual-only mode)
    if (enableAudio && !audioReady && !isVisualOnlyMode) {
      logger.warn("Cannot play: audio not ready");
      return;
    }

    // Simple play/pause toggle
    setIsPlaying(!isPlaying);

    if (!isPlaying) {
      onPlaybackStart?.();
    }
  }, [enableAudio, audioReady, isVisualOnlyMode, isPlaying, onPlaybackStart]);

  // Simple reset lesson
  const resetLesson = useCallback(() => {
    setIsPlaying(false);
    setCurrentSlideIndex(0);
    logger.debug("Lesson reset");

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
  }, [allSlidesLoaded, moveToSlide]);

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

  // Get play button text with simple audio and canvas status
  const getPlayButtonText = () => {
    if (!allSlidesLoaded) {
      return "⏳ Loading slides...";
    }

    if (isVisualOnlyMode) {
      return "📖 Visual mode ready";
    }

    if (enableAudio && !audioReady) {
      return "⏳ Loading audio...";
    }

    return "▶️ Ready to play";
  };

  // Check if play button should be disabled
  const isPlayButtonDisabled = () => {
    if (slides.length === 0) return true;
    if (!allSlidesLoaded) return true; // Ensure canvas elements are loaded
    if (enableAudio && !isVisualOnlyMode && !audioReady) return true;
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
      {/* Canvas Container */}
      <div
        ref={containerRef}
        className={`relative ${className} overflow-hidden`}
      >
        {/* Canvas Container */}
        <div className="w-full h-full flex items-start pt-4 justify-center">
          <div
            className="relative overflow-hidden excalidraw-container"
            style={{
              width: containerSize.width,
              height: containerSize.height,
            }}
          >
            <style>
              {`
                .excalidraw-container .App-menu_top,
                .excalidraw-container .App-toolbar,
                .excalidraw-container .App-bottom-bar,
                .excalidraw-container .App-menu_bottom,
                .excalidraw-container .ToolIcon,
                .excalidraw-container .zoom-indicator,
                .excalidraw-container .zen-mode-transition,
                .excalidraw-container .exit-zen-mode,
                .excalidraw-container .App-menu_top__left,
                .excalidraw-container .App-menu_top__right,
                .excalidraw-container .Island,
                .excalidraw-container .Stack,
                .excalidraw-container .App-toolbar-content,
                .excalidraw-container .welcome-screen-center,
                .excalidraw-container .layer-ui__wrapper,
                .excalidraw-container [data-testid="main-menu-trigger"],
                .excalidraw-container [data-testid="exit-zen-mode"],
                .excalidraw-container [data-testid="zoom-reset"],
                .excalidraw-container .App-menu-item,
                .excalidraw-container .App-toolbar__divider {
                  display: none !important;
                  visibility: hidden !important;
                  opacity: 0 !important;
                }
                .excalidraw-container .excalidraw {
                  pointer-events: auto !important;
                }
                .excalidraw-container canvas {
                  pointer-events: auto !important;
                }
              `}
            </style>
            <Excalidraw
              excalidrawAPI={(api) => setExcalidrawAPI(api)}
              initialData={{
                elements: [],
                appState: {
                  viewBackgroundColor: "#fafafa",
                  currentItemFontFamily: 1,
                  zenModeEnabled: false, // CHANGED: Disable zen mode initially
                  gridModeEnabled: false,
                  viewModeEnabled: false, // CHANGED: Disable view mode initially
                  zoom: { value: 1 as any },
                  scrollX: 0,
                  scrollY: 0,
                  theme: "light",
                },
              }}
              viewModeEnabled={false} // CHANGED: Allow editing mode
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
                dockedSidebarBreakpoint: 0,
              }}
              isCollaborating={false}
              renderTopRightUI={() => null}
              detectScroll={false}
              handleKeyboardGlobally={false}
            />

            {/* Audio Player Controls - Overlaid on canvas bottom */}
            {showControls &&
              enableAudio &&
              mergedAudioUrl &&
              audioSegments.length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-50 pointer-events-auto">
                  <div className="px-4 py-3">
                    <SimpleAudioPlayer
                      audioUrl={mergedAudioUrl ? getApiUrl(mergedAudioUrl) : ''}
                      audioSegments={audioSegments}
                      onSlideChange={handleAudioSlideChange}
                      onPlaybackStart={onPlaybackStart}
                      onPlaybackEnd={onPlaybackEnd}
                      onError={onError}
                      autoPlay={autoPlay}
                      className="w-full"
                    />
                  </div>
                </div>
              )}

            {/* Visual-only mode indicator */}
            {showControls && isVisualOnlyMode && (
              <div className="absolute bottom-4 left-4 right-4 z-50">
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg backdrop-blur-sm">
                  <div className="text-sm text-yellow-300 flex items-center gap-2">
                    <span>⚠️</span>
                    <span>
                      TTS service unavailable - running in visual-only mode
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default MultiSlideCanvasPlayer;
