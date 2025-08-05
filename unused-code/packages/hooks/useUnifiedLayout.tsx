import { useState, useCallback, useRef } from 'react';
import { createServiceLogger } from '@ai-tutor/utils';
import { LayoutEngine, type CanvasState, type LayoutEngineOptions } from '@ai-tutor/utils/src/excalidraw/layout-engine';

const logger = createServiceLogger('useUnifiedLayout');

export interface UnifiedLayoutStatus {
  isProcessing: boolean;
  isReady: boolean;
  error: string | null;
  progress: string;
}

export interface UseUnifiedLayoutResult {
  status: UnifiedLayoutStatus;
  layoutEngine: LayoutEngine | null;
  canvasStates: CanvasState[];
  processSemanticData: (semanticData: any, audioSegments?: any[], options?: Partial<LayoutEngineOptions>) => Promise<void>;
  reset: () => void;
  getStateAtTime: (timestamp: number) => CanvasState | null;
}

/**
 * Hook for generating unified layout using LayoutEngine
 * Provides timeline-based canvas rendering with automatic element positioning
 */
export const useUnifiedLayout = (): UseUnifiedLayoutResult => {
  const [status, setStatus] = useState<UnifiedLayoutStatus>({
    isProcessing: false,
    isReady: false,
    error: null,
    progress: ''
  });
  
  const [layoutEngine, setLayoutEngine] = useState<LayoutEngine | null>(null);
  const [canvasStates, setCanvasStates] = useState<CanvasState[]>([]);
  
  const layoutEngineRef = useRef<LayoutEngine | null>(null);
  
  const processSemanticData = useCallback(async (
    semanticData: any,
    audioSegments: any[] = [],
    options: Partial<LayoutEngineOptions> = {}
  ) => {
    setStatus({
      isProcessing: true,
      isReady: false,
      error: null,
      progress: 'Initializing layout engine...'
    });
    
    try {
      logger.debug('Starting unified layout processing', { 
        semanticData: typeof semanticData,
        audioSegmentsCount: audioSegments.length,
        options 
      });
      
      // Create LayoutEngine with options
      const engineOptions: LayoutEngineOptions = {
        canvasWidth: 1200,
        canvasHeight: 700,
        elementSpacing: 80,
        fontSize: 18,
        maxElementsPerScreen: 6,
        autoScroll: true,
        animationDuration: 300,
        ...options
      };
      
      const engine = new LayoutEngine(engineOptions);
      layoutEngineRef.current = engine;
      setLayoutEngine(engine);
      
      setStatus(prev => ({ ...prev, progress: 'Processing semantic data for layout...' }));
      
      // Process semantic data with audio segments
      const states = engine.processSemanticData(semanticData, audioSegments);
      
      logger.debug('Layout processing complete', { 
        statesCount: states.length,
        totalDuration: states.reduce((max, state) => Math.max(max, state.timestamp + state.duration), 0)
      });
      
      if (states.length === 0) {
        throw new Error('No canvas states generated from semantic data');
      }
      
      setCanvasStates(states);
      
      setStatus({
        isProcessing: false,
        isReady: true,
        error: null,
        progress: `Layout ready with ${states.length} canvas states`
      });
      
      logger.debug('Unified layout processing complete', {
        statesCount: states.length,
        elementsTotal: states.reduce((total, state) => total + state.elements.length, 0)
      });
      
    } catch (error) {
      logger.error('Unified layout processing failed', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      setStatus({
        isProcessing: false,
        isReady: false,
        error: errorMessage,
        progress: ''
      });
      
      // Don't clear the engine in case of error - might be useful for debugging
    }
  }, []);
  
  const reset = useCallback(() => {
    if (layoutEngineRef.current) {
      layoutEngineRef.current.reset();
    }
    
    setLayoutEngine(null);
    setCanvasStates([]);
    setStatus({
      isProcessing: false,
      isReady: false,
      error: null,
      progress: ''
    });
    
    layoutEngineRef.current = null;
    
    logger.debug('Unified layout reset');
  }, []);
  
  const getStateAtTime = useCallback((timestamp: number): CanvasState | null => {
    if (!layoutEngineRef.current) {
      return null;
    }
    
    return layoutEngineRef.current.getStateAtTime(timestamp);
  }, []);
  
  return {
    status,
    layoutEngine,
    canvasStates,
    processSemanticData,
    reset,
    getStateAtTime
  };
};

export default useUnifiedLayout;