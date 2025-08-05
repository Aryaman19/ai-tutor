/**
 * Template Testing Page
 * 
 * A development tool for testing and previewing educational templates
 * with responsive layout adjustments and live Excalidraw rendering
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Excalidraw } from '@excalidraw/excalidraw';
import { getApiUrl } from '@ai-tutor/utils';
import TemplateSelector from '../components/templates/TemplateSelector';


interface TemplateElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  alignment: string;
  color: string;
  backgroundColor: string;
}

interface RenderedTemplate {
  templateId: string;
  templateName: string;
  slideIndex: number;
  containerSize: {
    width: number;
    height: number;
    breakpoint: string;
  };
  elements: TemplateElement[];
  metadata: {
    slideId: string;
    slideType: string;
    fallbackData?: {
      heading: string;
      content: string;
      narration: string;
    };
    filledContent?: {
      heading: string;
      content: string;
      narration: string;
    };
  };
}


const TemplateTest: React.FC = () => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [slideIndex, setSlideIndex] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 450 });
  const [scaleFactor, setScaleFactor] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTemplateDetails, setShowTemplateDetails] = useState(false);
  
  // Refs for responsive canvas
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Fetch available templates
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const response = await fetch(getApiUrl('/api/templates/'));
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }
      return response.json();
    }
  });

  // Fetch rendered template (fallback preview)
  const { data: renderedTemplate, isLoading: renderLoading } = useQuery({
    queryKey: ['template-render', selectedTemplateId, slideIndex],
    queryFn: async (): Promise<RenderedTemplate> => {
      if (!selectedTemplateId) {
        throw new Error('No template selected');
      }

      const response = await fetch(getApiUrl(`/api/templates/${selectedTemplateId}/render`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          width: 800,
          height: 600
        })
      });

      if (!response.ok) {
        throw new Error('Failed to render template');
      }

      return response.json();
    },
    enabled: !!selectedTemplateId
  });

  // Auto-select first template when templates load
  useEffect(() => {
    if (templatesData?.templates?.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(templatesData.templates[0].id);
    }
  }, [templatesData, selectedTemplateId]);

  // Responsive canvas sizing
  useEffect(() => {
    const updateCanvasSize = () => {
      if (!canvasContainerRef.current) return;
      
      const container = canvasContainerRef.current;
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
        // Use container dimensions for normal mode
        maxWidth = containerRect.width * 0.8;
        maxHeight = containerRect.height * 0.8;
      }
      
      // Calculate new dimensions maintaining aspect ratio (no maximum limit)
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
      
      setCanvasSize({ width: newWidth, height: newHeight });
      setScaleFactor(scale);
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
    
    if (canvasContainerRef.current) {
      resizeObserver.observe(canvasContainerRef.current);
    }
    
    // Cleanup
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateCanvasSize);
      resizeObserver.disconnect();
    };
  }, [isFullscreen]);

  // Convert template elements to Excalidraw elements with responsive scaling
  const convertToExcalidrawElements = useCallback((elements: TemplateElement[]) => {
    return elements.map((element, index) => ({
      id: `template-${element.id}-${index}`,
      type: 'text' as const,
      x: element.x * scaleFactor,
      y: element.y * scaleFactor,
      width: element.width * scaleFactor,
      height: element.height * scaleFactor,
      angle: 0,
      strokeColor: element.color,
      backgroundColor: element.backgroundColor,
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
      fontSize: Math.round(element.fontSize * scaleFactor),
      fontFamily: 1, // Virgil
      textAlign: element.alignment as 'left' | 'center' | 'right',
      verticalAlign: 'top' as const,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      customData: undefined,
      version: 1,
      index: `${index}` as any,
      frameId: null,
      containerId: null,
      originalText: element.text,
      autoResize: true,
      lineHeight: 1.25 as any
    }));
  }, [scaleFactor]);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setSlideIndex(0); // Reset to first slide
  };

  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

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

  // Use rendered template data
  const currentTemplate = renderedTemplate;

  const excalidrawElements = currentTemplate 
    ? convertToExcalidrawElements(currentTemplate.elements)
    : [];

  // Trigger canvas resize when content changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (canvasContainerRef.current) {
        const container = canvasContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        
        const baseWidth = 800;
        const baseHeight = 450;
        const aspectRatio = baseWidth / baseHeight;
        
        const maxWidth = containerRect.width * 0.8;
        const maxHeight = containerRect.height * 0.8;
        
        let newWidth = maxWidth;
        let newHeight = newWidth / aspectRatio;
        
        if (newHeight > maxHeight) {
          newHeight = maxHeight;
          newWidth = newHeight * aspectRatio;
        }
        
        const minWidth = 320;
        const minHeight = 180;
        if (newWidth < minWidth) {
          newWidth = minWidth;
          newHeight = newWidth / aspectRatio;
        }
        
        const scale = Math.min(newWidth / baseWidth, newHeight / baseHeight);
        
        setCanvasSize({ width: newWidth, height: newHeight });
        setScaleFactor(scale);
      }
    }, 200);
    
    return () => clearTimeout(timer);
  }, [selectedTemplateId, currentTemplate]);

  if (templatesLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Template Browser</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
              Browse and preview educational templates
            </p>
          </div>
          
          {currentTemplate && (
            <div className="text-right">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {currentTemplate.templateName}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <TemplateSelector
            templates={templatesData?.templates || []}
            selectedTemplateId={selectedTemplateId}
            onTemplateChange={handleTemplateChange}
            disabled={templatesLoading}
          />
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 overflow-hidden">
        {renderLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Rendering template...
              </p>
            </div>
          </div>
        ) : currentTemplate ? (
          <>
            {/* Fullscreen overlay */}
            {isFullscreen && (
              <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
                <div 
                  ref={canvasContainerRef}
                  className="relative flex items-center justify-center w-full h-full"
                >
                  {/* Fullscreen controls */}
                  <div className="absolute top-4 right-4 z-10 flex space-x-2">
                    <button
                      onClick={handleToggleFullscreen}
                      className="px-3 py-2 bg-white bg-opacity-20 text-white rounded-md hover:bg-opacity-30 transition-all duration-200 backdrop-blur-sm"
                      title="Exit Fullscreen (ESC)"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div 
                    className="bg-white shadow-2xl border border-gray-300 transition-all duration-300"
                    style={{ 
                      width: canvasSize.width,
                      height: canvasSize.height
                    }}
                  >
                    <Excalidraw
                      key={`${selectedTemplateId}-${slideIndex}-${scaleFactor}-fullscreen`}
                      initialData={{
                        elements: excalidrawElements,
                        appState: {
                          viewBackgroundColor: '#ffffff',
                          zenModeEnabled: true,
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
              </div>
            )}
            
            {/* Normal view */}
            <div className="h-full flex">
              {/* Canvas Preview */}
              <div 
                ref={!isFullscreen ? canvasContainerRef : undefined}
                className="flex-1 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center relative"
              >
                {/* Fullscreen button */}
                <button
                  onClick={handleToggleFullscreen}
                  className="absolute top-4 right-4 z-10 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 shadow-md"
                  title="Enter Fullscreen"
                >
                  ⛶
                </button>
                
                <div 
                  className="bg-white shadow-lg border border-gray-300 transition-all duration-300"
                  style={{ 
                    width: canvasSize.width,
                    height: canvasSize.height
                  }}
                >
                <Excalidraw
                  key={`${selectedTemplateId}-${slideIndex}-${scaleFactor}`}
                  initialData={{
                    elements: excalidrawElements,
                    appState: {
                      viewBackgroundColor: '#ffffff',
                      zenModeEnabled: true,
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

            {/* Metadata Panel */}
            <div className={`bg-gray-50 dark:bg-gray-800 overflow-y-auto transition-all duration-300 ${
              showTemplateDetails ? 'w-80' : 'w-12'
            }`}>
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  {showTemplateDetails && (
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Template Details</h3>
                  )}
                  <button
                    onClick={() => setShowTemplateDetails(!showTemplateDetails)}
                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    title={showTemplateDetails ? "Hide Details" : "Show Details"}
                  >
                    {showTemplateDetails ? '→' : '←'}
                  </button>
                </div>
                
                {showTemplateDetails && (
                  <div className="space-y-4">
                    {/* Template Info */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Template</h4>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <div><strong>ID:</strong> {currentTemplate.templateId}</div>
                        <div><strong>Name:</strong> {currentTemplate.templateName}</div>
                        <div><strong>Slide:</strong> {currentTemplate.slideIndex + 1}</div>
                        <div><strong>Scale:</strong> {Math.round(scaleFactor * 100)}%</div>
                      </div>
                    </div>

                    {/* Content Type Info */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Content Type</h4>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <div><strong>Mode:</strong> Fallback</div>
                        <div><strong>Breakpoint:</strong> {currentTemplate.containerSize.breakpoint}</div>
                        <div><strong>Canvas:</strong> {Math.round(canvasSize.width)}×{Math.round(canvasSize.height)}</div>
                      </div>
                    </div>

                    {/* Elements */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Elements ({currentTemplate.elements.length})</h4>
                      <div className="space-y-2">
                        {currentTemplate.elements.map((element, index) => (
                          <div key={index} className="bg-white dark:bg-gray-700 p-2 rounded border border-gray-200 dark:border-gray-600 text-xs">
                            <div className="text-gray-900 dark:text-gray-100"><strong>Type:</strong> {element.type}</div>
                            <div className="text-gray-900 dark:text-gray-100"><strong>Position:</strong> ({Math.round(element.x)}, {Math.round(element.y)})</div>
                            <div className="text-gray-900 dark:text-gray-100"><strong>Size:</strong> {Math.round(element.width)}×{Math.round(element.height)}</div>
                            <div className="text-gray-900 dark:text-gray-100"><strong>Font:</strong> {element.fontSize}px</div>
                            <div className="mt-1 text-gray-600 dark:text-gray-400 break-words">
                              <strong>Text:</strong> {element.text.substring(0, 50)}...
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Content Data */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Fallback Data
                      </h4>
                      <div className="bg-white dark:bg-gray-700 p-2 rounded border border-gray-200 dark:border-gray-600 text-xs">
                        {(() => {
                          const contentData = currentTemplate.metadata.fallbackData;
                          
                          if (!contentData) return <div className="text-gray-900 dark:text-gray-100">No content data available</div>;
                          
                          return (
                            <>
                              <div className="mb-2">
                                <strong className="text-gray-900 dark:text-gray-100">Heading:</strong>
                                <div className="text-gray-600 dark:text-gray-400 mt-1">{contentData.heading}</div>
                              </div>
                              <div className="mb-2">
                                <strong className="text-gray-900 dark:text-gray-100">Content:</strong>
                                <div className="text-gray-600 dark:text-gray-400 mt-1">{contentData.content?.substring(0, 100)}...</div>
                              </div>
                              <div>
                                <strong className="text-gray-900 dark:text-gray-100">Narration:</strong>
                                <div className="text-gray-600 dark:text-gray-400 mt-1">{contentData.narration?.substring(0, 100)}...</div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <div className="text-6xl mb-4">📐</div>
              <p>Select a template to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateTest;