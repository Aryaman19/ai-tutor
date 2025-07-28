/**
 * MultiSlideCanvasPlayer Component
 *
 * A multi-slide canvas player based on the POC approach that:
 * - Loads multiple template slides with proper offsets
 * - Uses timer-based progression system
 * - Shows slide transitions smoothly
 * - No audio integration - just visual progression
 */

import "@excalidraw/excalidraw/index.css";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { createComponentLogger } from "@ai-tutor/utils";

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
  width?: number;
  height?: number;
  onSlideChange?: (slideIndex: number) => void;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onError?: (error: Error) => void;
  className?: string;
  testMode?: boolean; // Add test mode to create simple elements
}

export const MultiSlideCanvasPlayer: React.FC<MultiSlideCanvasPlayerProps> = ({
  slides,
  autoPlay = false,
  showControls = true,
  width = 1200,
  height = 700,
  onSlideChange,
  onPlaybackStart,
  onPlaybackEnd,
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
  const [containerSize, setContainerSize] = useState({ width, height });

  // Refs for POC-style management
  const accumulatedElements = useRef<any[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<any>(null);
  const slideProgressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    let currentOffset = 0;

    slides.forEach((slide, slideIndex) => {
      const slideElements = slide.elements || [];

      if (slideElements.length === 0) {
        logger.warn(`Slide ${slideIndex} has no elements`);
        return;
      }

      // Fix elements format
      const fixedElements = inspectAndFixElements(slideElements);

      // Apply positioning offset to each element (much larger spacing)
      const slideOffset = slideIndex * (containerSize.width * 2); // Much larger spacing between slides
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

      // Calculate offset for next slide (use slide's position_offset or default spacing)
      // For now, let's use a simple calculation
      currentOffset = slideIndex * (containerSize.width + 100);

      logger.debug(
        `Slide ${slideIndex + 1} positioned at offset ${
          currentOffset - (containerSize.width + 100)
        }`,
        {
          elementsCount: positionedElements.length,
          slideOffset: currentOffset - (containerSize.width + 100),
        }
      );
    });

    return allElements;
  }, [slides, inspectAndFixElements, containerSize.width]);

  // Move camera to specific slide position (like POC's scrollToContent)
  const moveToSlide = useCallback(
    (slideIndex: number) => {
      if (!excalidrawAPI || slideIndex >= slides.length) return;

      const slide = slides[slideIndex];
      const slideOffset = slideIndex * (containerSize.width * 2);

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
    [excalidrawAPI, slides, containerSize.width]
  );

  // Container size observer for responsive behavior
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width: newWidth, height: newHeight } = entry.contentRect;

        setContainerSize((prevSize) => {
          if (prevSize.width !== newWidth || prevSize.height !== newHeight) {
            logger.debug("Container size changed", {
              from: prevSize,
              to: { width: newWidth, height: newHeight },
            });
            return { width: newWidth, height: newHeight };
          }
          return prevSize;
        });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

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

  // Show next slide (updated to use camera movement)
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

    // Move camera to current slide position
    moveToSlide(currentSlideIndex);

    // Notify slide change
    onSlideChange?.(currentSlideIndex);

    // Schedule next slide based on estimated duration
    const duration = Math.max(2000, slide.estimated_duration * 1000); // Minimum 2 seconds
    slideProgressTimerRef.current = setTimeout(() => {
      setCurrentSlideIndex((prev) => prev + 1);
    }, duration);
  }, [
    excalidrawAPI,
    currentSlideIndex,
    slides,
    isPlaying,
    allSlidesLoaded,
    moveToSlide,
    onSlideChange,
    onPlaybackEnd,
  ]);

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
              zenModeEnabled: true,
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
                  zenModeEnabled: true,
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
          const calculatedOffset = index * (containerSize.width * 2);
          
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
              zenModeEnabled: true,
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
    containerSize,
  ]);

  // Handle slide progression
  useEffect(() => {
    if (isPlaying && currentSlideIndex < slides.length) {
      const timer = setTimeout(() => {
        showNextSlide();
      }, 200); // Small delay to work better with debouncing
      return () => clearTimeout(timer);
    }
  }, [isPlaying, currentSlideIndex, showNextSlide]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      if (slideProgressTimerRef.current) {
        clearTimeout(slideProgressTimerRef.current);
        slideProgressTimerRef.current = null;
      }
    } else {
      if (currentSlideIndex >= slides.length) {
        // Restart from beginning if at end
        setCurrentSlideIndex(0);
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
      onPlaybackStart?.();
    }
  }, [
    isPlaying,
    currentSlideIndex,
    slides.length,
    excalidrawAPI,
    onPlaybackStart,
  ]);

  // Reset lesson
  const resetLesson = useCallback(() => {
    setIsPlaying(false);
    setCurrentSlideIndex(0);

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

  // Get play button text
  const getPlayButtonText = () => {
    if (isPlaying) return "⏸️ Pause";
    if (currentSlideIndex === 0) return "▶️ Play";
    if (currentSlideIndex >= slides.length) return "🔄 Restart";
    return "▶️ Resume";
  };

  if (!slides || slides.length === 0) {
    return (
      <div className={`relative ${className}`} style={{ width, height }}>
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
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ height }}
    >
      {/* Excalidraw Canvas */}
      <div
        className="w-full h-full overflow-hidden"
        style={{ position: "relative" }}
      >
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

      {/* Player Controls */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent z-50 pointer-events-auto">
          <div className="px-6 py-4">
            {/* Control buttons and info */}
            <div className="flex items-center gap-4 overflow-hidden">
              {/* Left side - Control buttons */}
              <div className="flex items-center space-x-4 flex-shrink-0">
                {/* Play/Pause */}
                <button
                  onClick={togglePlayPause}
                  className="flex items-center justify-center w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full transition-colors pointer-events-auto"
                >
                  {isPlaying ? (
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
                      isPlaying ? "bg-green-400" : "bg-yellow-400"
                    }`}
                  ></div>
                  <span className="text-white/80 text-xs hidden sm:inline">
                    {isPlaying ? "Playing" : "Paused"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiSlideCanvasPlayer;
