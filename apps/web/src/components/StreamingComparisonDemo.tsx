/**
 * Streaming Comparison Demo
 * 
 * Demonstrates the difference between old "wait for all" loading
 * and new YouTube-style progressive streaming.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { ExcalidrawPlayerProgressive } from './ExcalidrawPlayerProgressive';
import { useExcalidrawPlayer } from '../hooks/useExcalidrawPlayer';
import type { StreamingTimelineChunk } from '@ai-tutor/types';
import { createComponentLogger } from '@ai-tutor/utils';

const logger = createComponentLogger('StreamingComparisonDemo');

/**
 * Mock chunk generator for demo purposes
 */
const createMockChunk = (chunkNumber: number, delay: number): StreamingTimelineChunk => {
  const startTime = (chunkNumber - 1) * 10000; // 10 seconds per chunk
  const duration = 10000;
  
  return {
    chunkId: `demo-chunk-${chunkNumber}`,
    chunkNumber,
    totalChunks: 8, // Will be updated by demo
    status: 'ready',
    contentType: 'process',
    duration,
    timestampOffset: startTime,
    startTimeOffset: startTime,
    events: [
      {
        id: `visual-${chunkNumber}`,
        type: 'visual',
        timestamp: startTime,
        duration: duration,
        content: {
          visual: {
            action: 'create',
            elementType: 'text',
            properties: {
              text: `Chunk ${chunkNumber} Content`,
              size: 'medium',
              color: 'primary'
            }
          },
        },
        layoutHints: [],
        dependencies: [],
      },
      {
        id: `narration-${chunkNumber}`,
        type: 'narration',
        timestamp: startTime,
        duration: duration,
        content: {
          audio: {
            text: `This is the narration for chunk ${chunkNumber}. Content is being streamed progressively.`,
          },
        },
        layoutHints: [],
        dependencies: [],
      },
    ],
    generationParams: {
      targetDuration: duration / 1000,
      maxEvents: 2,
      complexity: 'simple',
      layoutConstraints: {
        maxSimultaneousElements: 2,
        preferredStyle: 'minimal',
      },
      audioConstraints: {
        speakingRate: 150,
        pauseFrequency: 'normal',
      },
      contentFocus: {
        primaryObjective: 'Demo progressive streaming',
        keyConceptsToEmphasize: [`chunk-${chunkNumber}`],
      },
    },
    nextChunkHints: [],
    metadata: {
      model: 'demo-model',
      generatedAt: Date.now(),
      timing: {
        llmGeneration: Math.floor(delay * 0.7),
        postProcessing: Math.floor(delay * 0.2),
        validation: Math.floor(delay * 0.1),
        total: Math.floor(delay),
      },
    },
  };
};

/**
 * Streaming Comparison Demo Component
 */
export const StreamingComparisonDemo: React.FC = () => {
  const [demoMode, setDemoMode] = useState<'traditional' | 'progressive'>('progressive');
  const [chunks, setChunks] = useState<StreamingTimelineChunk[]>([]);
  const [isGeneratingChunks, setIsGeneratingChunks] = useState(false);
  const [chunkGenerationProgress, setChunkGenerationProgress] = useState(0);
  const [totalChunks] = useState(8);
  
  // Traditional player hook
  const traditionalPlayer = useExcalidrawPlayer({
    steps: [], // Will be populated when all chunks are ready
    autoPlay: false,
  });
  
  // Generate chunks with realistic delays
  const generateChunks = useCallback(async () => {
    setIsGeneratingChunks(true);
    setChunks([]);
    setChunkGenerationProgress(0);
    
    logger.info('Starting chunk generation demo', { totalChunks });
    
    const newChunks: StreamingTimelineChunk[] = [];
    
    for (let i = 1; i <= totalChunks; i++) {
      // Simulate realistic chunk generation delays (2-5 seconds each)
      const delay = 2000 + Math.random() * 3000;
      
      logger.debug('Generating chunk', { chunkNumber: i, delay });
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      const chunk = createMockChunk(i, delay);
      newChunks.push(chunk);
      
      // In progressive mode, add chunks as they become available
      if (demoMode === 'progressive') {
        setChunks(prev => [...prev, chunk]);
      }
      
      setChunkGenerationProgress(i / totalChunks);
      
      logger.debug('Chunk generated', { chunkNumber: i, totalReady: newChunks.length });
    }
    
    // In traditional mode, add all chunks at once
    if (demoMode === 'traditional') {
      setChunks(newChunks);
      
      // Convert chunks to steps format for traditional player
      const steps = newChunks.map((chunk, index) => ({
        step_number: index + 1,
        title: `Step ${index + 1}`,
        explanation: `Content from chunk ${chunk.chunkNumber}`,
        elements: chunk.events
          .filter(e => e.type === 'visual' && typeof e.content === 'object' && e.content?.visual)
          .map(e => {
            const content = e.content as any;
            const visual = content.visual;
            // Create a simple text element from the visual instruction
            return {
              id: `text-${e.id}`,
              type: 'text',
              x: 100,
              y: 100,
              width: 200,
              height: 40,
              text: visual?.properties?.text || 'Text content',
              fontSize: 16,
              fontFamily: 1,
              textAlign: 'left',
              verticalAlign: 'top',
              strokeColor: '#000000',
              backgroundColor: 'transparent',
              fillStyle: 'hachure',
              strokeWidth: 1,
              strokeStyle: 'solid',
              roughness: 1,
              opacity: 100,
              angle: 0,
              strokeSharpness: 'sharp',
              seed: Math.floor(Math.random() * 1000000),
              groupIds: [],
              roundness: null,
              boundElements: null,
              updated: Date.now(),
              link: null,
              locked: false,
            };
          }),
      }));
      
      traditionalPlayer.setLessonSlides(steps as any);
    }
    
    setIsGeneratingChunks(false);
    logger.info('Chunk generation complete', { totalGenerated: newChunks.length });
  }, [totalChunks, demoMode, traditionalPlayer]);
  
  // Reset when demo mode changes
  useEffect(() => {
    setChunks([]);
    setChunkGenerationProgress(0);
    traditionalPlayer.setLessonSlides([]);
  }, [demoMode, traditionalPlayer]);
  
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Video Streaming Comparison Demo
        </h1>
        <p className="text-gray-600 text-lg">
          Compare traditional "wait for all chunks" loading vs YouTube-style progressive streaming
        </p>
      </div>
      
      {/* Mode Selection */}
      <div className="mb-8">
        <div className="flex space-x-4 p-4 bg-gray-100 rounded-lg">
          <button
            onClick={() => setDemoMode('traditional')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              demoMode === 'traditional'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Traditional Loading
          </button>
          <button
            onClick={() => setDemoMode('progressive')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              demoMode === 'progressive'
                ? 'bg-green-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Progressive Streaming
          </button>
        </div>
        
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold mb-2">
            {demoMode === 'traditional' ? 'Traditional Loading' : 'Progressive Streaming'}
          </h3>
          <p className="text-sm text-gray-700">
            {demoMode === 'traditional'
              ? 'Waits for all content to load before showing anything. User sees loading screen until everything is ready.'
              : 'Starts playing immediately when minimum content is available. Shows buffer progress and loads content in background.'}
          </p>
        </div>
      </div>
      
      {/* Generation Controls */}
      <div className="mb-8">
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <h3 className="font-semibold">Content Generation</h3>
            <p className="text-sm text-gray-600">
              Simulates realistic chunk generation with 2-5 second delays per chunk
            </p>
          </div>
          <div className="flex items-center space-x-4">
            {isGeneratingChunks && (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">
                  Generating... {Math.round(chunkGenerationProgress * 100)}%
                </span>
              </div>
            )}
            <button
              onClick={generateChunks}
              disabled={isGeneratingChunks}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isGeneratingChunks ? 'Generating...' : 'Start Demo'}
            </button>
          </div>
        </div>
        
        {/* Progress Bar */}
        {isGeneratingChunks && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${chunkGenerationProgress * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Chunk Generation Progress</span>
              <span>{Math.round(chunkGenerationProgress * totalChunks)} / {totalChunks} chunks</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Player Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Traditional Player */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Traditional Player</h3>
            <div className="text-sm text-gray-500">
              Chunks loaded: {chunks.length} / {totalChunks}
            </div>
          </div>
          
          <div className="border rounded-lg overflow-hidden">
            {demoMode === 'traditional' ? (
              <div className="relative">
                {traditionalPlayer.isLoading || isGeneratingChunks || chunks.length < totalChunks ? (
                  <div className="w-full h-96 bg-gray-100 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                      <div className="text-gray-600 mb-2">
                        {isGeneratingChunks 
                          ? 'Generating content...' 
                          : chunks.length < totalChunks 
                            ? 'Waiting for all chunks to load...'
                            : 'Loading player...'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {chunks.length} / {totalChunks} chunks ready
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-green-50 text-center">
                    <div className="text-green-600 font-medium">
                      ✅ All content loaded! Player ready.
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      User waited {totalChunks * 3.5} seconds on average
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-gray-100 text-center text-gray-500">
                Switch to "Traditional Loading" to see this mode
              </div>
            )}
          </div>
        </div>
        
        {/* Progressive Player */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Progressive Player</h3>
            <div className="text-sm text-gray-500">
              Chunks available: {chunks.length} / {totalChunks}
            </div>
          </div>
          
          <div className="border rounded-lg overflow-hidden">
            {demoMode === 'progressive' ? (
              <ExcalidrawPlayerProgressive
                chunks={chunks}
                autoPlay={false}
                showControls={true}
                showBufferBar={true}
                showLoadingIndicators={true}
                streamingConfig={{
                  minStartBuffer: 2000,
                  targetBuffer: 8000,
                  autoStart: false,
                }}
                width={400}
                height={300}
                onPlaybackStart={() => logger.info('Progressive playback started')}
                onPlaybackEnd={() => logger.info('Progressive playback ended')}
                onSeek={(position) => logger.debug('Progressive seek', { position })}
                onError={(error) => logger.error('Progressive player error', error)}
              />
            ) : (
              <div className="p-4 bg-gray-100 text-center text-gray-500 h-96 flex items-center justify-center">
                Switch to "Progressive Streaming" to see this mode
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Comparison Stats */}
      {chunks.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold text-blue-900">Time to First Play</h4>
            <div className="mt-2">
              <div className="text-sm text-gray-600">Traditional:</div>
              <div className="text-lg font-medium text-blue-800">
                ~{totalChunks * 3.5}s (wait for all)
              </div>
            </div>
            <div className="mt-2">
              <div className="text-sm text-gray-600">Progressive:</div>
              <div className="text-lg font-medium text-green-600">
                ~2s (minimum buffer)
              </div>
            </div>
          </div>
          
          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-semibold text-green-900">User Experience</h4>
            <div className="mt-2 space-y-2 text-sm">
              <div>
                <span className="font-medium">Traditional:</span> Loading screen blocking
              </div>
              <div>
                <span className="font-medium">Progressive:</span> Immediate engagement
              </div>
            </div>
          </div>
          
          <div className="p-4 bg-purple-50 rounded-lg">
            <h4 className="font-semibold text-purple-900">Memory Usage</h4>
            <div className="mt-2 text-sm">
              <div>
                <span className="font-medium">Traditional:</span> All chunks in memory
              </div>
              <div>
                <span className="font-medium">Progressive:</span> Smart cleanup & buffering
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Key Benefits */}
      <div className="mt-8 p-6 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg">
        <h3 className="text-xl font-semibold mb-4">Key Benefits of Progressive Streaming</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="font-medium">Immediate Playback</div>
                <div className="text-sm text-gray-600">Starts playing as soon as minimum content is ready</div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="font-medium">Background Loading</div>
                <div className="text-sm text-gray-600">Loads future content while playing current content</div>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="font-medium">Smart Seeking</div>
                <div className="text-sm text-gray-600">Immediate seeking to buffered regions, smooth loading for others</div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="font-medium">Memory Efficient</div>
                <div className="text-sm text-gray-600">Automatic cleanup of old content, adaptive buffer management</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreamingComparisonDemo;