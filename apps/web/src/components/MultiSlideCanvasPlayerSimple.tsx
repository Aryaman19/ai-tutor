/**
 * MultiSlideCanvasPlayerSimple Component
 *
 * A simplified multi-slide canvas player with simple audio functionality that:
 * - Loads multiple template slides with proper offsets
 * - Uses simple audio player for merged audio files
 * - Synchronizes visual slides with audio playback
 * - Provides clean interface without complex audio merging
 *
 * This replaces the complex useMultiSlideAudio system with SimpleAudioPlayer
 */

import "@excalidraw/excalidraw/index.css";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { createComponentLogger } from "@ai-tutor/utils";
import { SimpleAudioPlayer, type AudioSegment } from "./SimpleAudioPlayer";

const logger = createComponentLogger("MultiSlideCanvasPlayerSimple");

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

export interface MultiSlideCanvasPlayerSimpleProps {
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
  onSlideChange?: (slideIndex: number) => void;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onError?: (error: Error) => void;
  className?: string;
  testMode?: boolean; // Add test mode to create simple elements
}

export const MultiSlideCanvasPlayerSimple: React.FC<MultiSlideCanvasPlayerSimpleProps> = ({
  slides,
  existingAudioSegments,
  mergedAudioUrl,
  autoPlay = false,
  showControls = true,
  enableAudio = true,
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
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [allSlidesLoaded, setAllSlidesLoaded] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 450 });

  // Refs for element management
  const accumulatedElements = useRef<any[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert audio segments to SimpleAudioPlayer format
  const audioSegments: AudioSegment[] = (existingAudioSegments || []).map(segment => ({
    slide_number: segment.slide_number,
    start_time: segment.start_time,
    end_time: segment.end_time,
    text: segment.text
  }));

  // Visual-only mode detection
  const isVisualOnlyMode = !enableAudio || !mergedAudioUrl || audioSegments.length === 0;

  // Debug logging
  useEffect(() => {
    logger.debug("MultiSlideCanvasPlayerSimple initialized", {
      slidesCount: slides.length,
      audioSegmentsCount: audioSegments.length,
      mergedAudioUrl,
      enableAudio,
      isVisualOnlyMode
    });
  }, [slides.length, audioSegments.length, mergedAudioUrl, enableAudio, isVisualOnlyMode]);

  // Inspect and fix elements format
  const inspectAndFixElements = useCallback((elements: any[]) => {
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
        opacity: el.opacity !== undefined ? el.opacity : 100,
        groupIds: el.groupIds || [],
        boundElements: el.boundElements || null,
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

  // Load all slides at once with proper positioning
  const loadAllSlides = useCallback(() => {
    logger.debug("Loading all slides with positioning...");

    const allElements: any[] = [];
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

      // Apply positioning offset to each element
      const slideOffset = slideIndex * (baseWidth * 2); // Large spacing between slides
      const positionedElements = fixedElements.map((el) => ({
        ...el,
        x: el.x + slideOffset,
      }));

      allElements.push(...positionedElements);
    });

    accumulatedElements.current = allElements;
    setAllSlidesLoaded(true);

    // Update Excalidraw scene if API is ready
    if (excalidrawAPI && allElements.length > 0) {
      try {
        excalidrawAPI.updateScene({
          elements: allElements,
          appState: { viewBackgroundColor: "#fafafa" },
        });

        // Scroll to first slide
        scrollToSlide(0);
        
        logger.debug("All slides loaded successfully", { elementCount: allElements.length });
      } catch (error) {
        logger.error("Error updating scene with all slides:", error);
        onError?.(new Error("Failed to load slides"));
      }
    }
  }, [slides, excalidrawAPI, inspectAndFixElements, onError]);

  // Scroll to specific slide
  const scrollToSlide = useCallback((slideIndex: number) => {
    if (!excalidrawAPI || !allSlidesLoaded) return;

    const baseWidth = 800;
    const slideOffset = slideIndex * (baseWidth * 2);
    
    try {
      // Find elements for this slide
      const slideElements = accumulatedElements.current.filter(el => {
        const elementSlideIndex = Math.floor((el.x - (el.x % (baseWidth * 2))) / (baseWidth * 2));
        return elementSlideIndex === slideIndex;
      });

      if (slideElements.length > 0) {
        excalidrawAPI.scrollToContent(slideElements, {
          fitToViewport: false,
          animate: true,
          duration: 600,
        });
      }
    } catch (error) {
      logger.error(`Error scrolling to slide ${slideIndex}:`, error);
    }
  }, [excalidrawAPI, allSlidesLoaded]);

  // Handle slide change from audio player
  const handleSlideChange = useCallback((slideIndex: number) => {
    logger.debug(`Slide change requested: ${slideIndex}`);
    
    setCurrentSlideIndex(slideIndex);
    scrollToSlide(slideIndex);
    onSlideChange?.(slideIndex);
  }, [scrollToSlide, onSlideChange]);

  // Handle container resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load slides when Excalidraw API is ready
  useEffect(() => {
    if (excalidrawAPI && slides.length > 0) {
      loadAllSlides();
    }
  }, [excalidrawAPI, slides, loadAllSlides]);

  // Check if player is ready
  const isPlayButtonDisabled = () => {
    if (slides.length === 0) return true;
    if (!allSlidesLoaded) return true; // Ensure canvas elements are loaded
    if (enableAudio && isVisualOnlyMode) return false; // Allow visual-only mode
    return false;
  };

  const getPlayButtonText = () => {
    if (slides.length === 0) return "No slides available";
    if (!allSlidesLoaded) return "Loading slides...";
    if (isVisualOnlyMode) return "Visual mode ready";
    return "Ready to play";
  };

  return (
    <div className={`flex flex-col h-full ${className}`} ref={containerRef}>
      {/* Canvas Area */}
      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0">
          <Excalidraw
            ref={(api) => setExcalidrawAPI(api)}
            initialData={{
              elements: [],
              appState: {
                viewBackgroundColor: "#fafafa",
                gridSize: null,
                zenModeEnabled: false,
                isLoading: false,
              },
              scrollToContent: true,
            }}
            renderTopRightUI={() => (
              <div className="flex items-center space-x-2 mr-4">
                <div className="text-sm text-gray-600 bg-white px-2 py-1 rounded shadow">
                  Slide {currentSlideIndex + 1} of {slides.length}
                </div>
                <div className="text-xs text-gray-500 bg-white px-2 py-1 rounded shadow">
                  {getPlayButtonText()}
                </div>
              </div>
            )}
          />
        </div>
      </div>

      {/* Audio Controls */}
      {showControls && !isVisualOnlyMode && mergedAudioUrl && (
        <div className="border-t border-gray-200 p-4 bg-white">
          <SimpleAudioPlayer
            audioUrl={mergedAudioUrl}
            audioSegments={audioSegments}
            onSlideChange={handleSlideChange}
            onPlaybackStart={onPlaybackStart}
            onPlaybackEnd={onPlaybackEnd}
            onError={onError}
            autoPlay={autoPlay}
            className="w-full"
          />
        </div>
      )}

      {/* Visual-only mode indicator */}
      {showControls && isVisualOnlyMode && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
            <span>📖</span>
            <span>Visual-only mode - No audio available</span>
            <div className="flex space-x-2 ml-4">
              <button
                onClick={() => handleSlideChange(Math.max(0, currentSlideIndex - 1))}
                disabled={currentSlideIndex === 0}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => handleSlideChange(Math.min(slides.length - 1, currentSlideIndex + 1))}
                disabled={currentSlideIndex === slides.length - 1}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-500 p-2 bg-gray-100 border-t">
          Slides: {slides.length} | Elements loaded: {allSlidesLoaded ? 'Yes' : 'No'} | 
          Audio segments: {audioSegments.length} | Visual-only: {isVisualOnlyMode ? 'Yes' : 'No'}
        </div>
      )}
    </div>
  );
};

export default MultiSlideCanvasPlayerSimple;