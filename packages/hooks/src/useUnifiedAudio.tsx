import { useState, useCallback, useRef } from 'react';
import { createServiceLogger } from '@ai-tutor/utils';
import { AudioEngine, type UnifiedAudioResult, type AudioEngineOptions } from '@ai-tutor/utils/src/audio/unified-audio-engine';
import { ttsApi } from '@ai-tutor/api-client';
import { useTTSSettings } from './useSettings';

const logger = createServiceLogger('useUnifiedAudio');

export interface UnifiedAudioStatus {
  isProcessing: boolean;
  isReady: boolean;
  error: string | null;
  progress: string;
}

export interface UseUnifiedAudioResult {
  status: UnifiedAudioStatus;
  audioEngine: AudioEngine | null;
  audioResult: UnifiedAudioResult | null;
  generateUnifiedAudio: (semanticData: any, options?: Partial<AudioEngineOptions>) => Promise<void>;
  reset: () => void;
  getSegmentAtTime: (timestamp: number) => any;
}

/**
 * Hook for generating unified audio using AudioEngine
 * Provides single audio file generation from semantic data with instant seeking
 */
export const useUnifiedAudio = (): UseUnifiedAudioResult => {
  const [status, setStatus] = useState<UnifiedAudioStatus>({
    isProcessing: false,
    isReady: false,
    error: null,
    progress: ''
  });
  
  const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null);
  const [audioResult, setAudioResult] = useState<UnifiedAudioResult | null>(null);
  
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const { data: ttsSettings } = useTTSSettings();
  
  const generateUnifiedAudio = useCallback(async (
    semanticData: any, 
    options: Partial<AudioEngineOptions> = {}
  ) => {
    setStatus({
      isProcessing: true,
      isReady: false,
      error: null,
      progress: 'Initializing audio engine...'
    });
    
    try {
      logger.debug('Starting unified audio generation', { 
        semanticData: typeof semanticData,
        options 
      });
      
      // Create AudioEngine with settings
      const engineOptions: AudioEngineOptions = {
        voice: options.voice || ttsSettings?.voice,
        speed: options.speed ?? ttsSettings?.speed ?? 1.0,
        volume: options.volume ?? ttsSettings?.volume ?? 1.0,
        separatorPause: options.separatorPause ?? 800,
        ...options
      };
      
      const engine = new AudioEngine(engineOptions);
      audioEngineRef.current = engine;
      setAudioEngine(engine);
      
      setStatus(prev => ({ ...prev, progress: 'Processing semantic data...' }));
      
      // Process semantic data
      const segments = engine.processSemanticData(semanticData);
      
      logger.debug('Semantic data processed', { 
        segmentsCount: segments.length,
        totalSegments: segments.length
      });
      
      if (segments.length === 0) {
        throw new Error('No narration content found in semantic data');
      }
      
      setStatus(prev => ({ ...prev, progress: 'Creating unified text...' }));
      
      // Create unified text
      const unifiedText = engine.createUnifiedText();
      
      if (!unifiedText || unifiedText.trim().length === 0) {
        throw new Error('Failed to create unified text from segments');
      }
      
      logger.debug('Unified text created', { 
        textLength: unifiedText.length,
        textPreview: unifiedText.substring(0, 100) + '...'
      });
      
      setStatus(prev => ({ ...prev, progress: 'Generating single audio file...' }));
      
      // Generate unified audio
      const result = await engine.generateUnifiedAudio(ttsApi);
      
      setAudioResult(result);
      
      setStatus({
        isProcessing: false,
        isReady: true,
        error: null,
        progress: 'Unified audio ready for instant seeking!'
      });
      
      logger.debug('Unified audio generation complete', {
        audioId: result.audioId,
        totalDuration: result.totalDuration,
        segmentsCount: result.segments.length
      });
      
    } catch (error) {
      logger.error('Unified audio generation failed', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      setStatus({
        isProcessing: false,
        isReady: false,
        error: errorMessage,
        progress: ''
      });
      
      // Don't clear the engine in case of error - might be useful for debugging
    }
  }, [ttsSettings]);
  
  const reset = useCallback(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.reset();
    }
    
    setAudioEngine(null);
    setAudioResult(null);
    setStatus({
      isProcessing: false,
      isReady: false,
      error: null,
      progress: ''
    });
    
    audioEngineRef.current = null;
    
    logger.debug('Unified audio reset');
  }, []);
  
  const getSegmentAtTime = useCallback((timestamp: number) => {
    if (!audioEngineRef.current) {
      return null;
    }
    
    return audioEngineRef.current.getSegmentAtTime(timestamp);
  }, []);
  
  return {
    status,
    audioEngine,
    audioResult,
    generateUnifiedAudio,
    reset,
    getSegmentAtTime
  };
};

export default useUnifiedAudio;