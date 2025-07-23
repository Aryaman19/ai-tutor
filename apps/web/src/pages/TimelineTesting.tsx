import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@ai-tutor/ui';
import ExcalidrawPlayer from '../components/ExcalidrawPlayer';
import { StreamingComparisonDemo } from '../components/StreamingComparisonDemo';
import { ExcalidrawPlayerProgressive } from '../components/ExcalidrawPlayerProgressive';
import type { TimelineEvent, StreamingTimelineChunk } from '@ai-tutor/types';

// API response interface
interface APITimelineEvent {
  id?: string;
  timestamp: number;
  duration: number;
  event_type: string;
  content: string;
  visual_instruction?: string;
  layout_hints?: Record<string, any>;
}

interface StreamingData {
  type: 'progress' | 'chunk' | 'complete' | 'error';
  data: any;
}

interface FullIntegrationResult {
  success: boolean;
  topic: string;
  timeline_events_count: number;
  chunks_generated: number;
  elements_generated: number;
  timeline_events: TimelineEvent[];
  performance: {
    total_time_s: number;
    memory_usage_bytes: number;
    cache_hit_rate: number;
  };
  error?: string;
}

export default function TimelineTesting() {
  const [topic, setTopic] = useState('Photosynthesis Process');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [targetDuration, setTargetDuration] = useState(120);
  const [loading, setLoading] = useState(false);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  
  const [streamingData, setStreamingData] = useState<StreamingData[]>([]);
  const [integrationResult, setIntegrationResult] = useState<FullIntegrationResult | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  
  // Timeline testing state - consolidated for Phase 5
  const [playbackMode, setPlaybackMode] = useState<'legacy' | 'phase4' | 'phase5' | 'progressive'>('progressive');
  const [currentPosition, setCurrentPosition] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMetrics, setPlaybackMetrics] = useState<any>(null);
  const [seekPerformance, setSeekPerformance] = useState<any>(null);
  const [bufferLevel, setBufferLevel] = useState(0);
  const [processingState, setProcessingState] = useState<string>('idle');
  const [audioSyncState, setAudioSyncState] = useState<any>(null);
  const [audioProcessingMetrics, setAudioProcessingMetrics] = useState<any>(null);
  const [coordinationMetrics, setCoordinationMetrics] = useState<any>(null);
  const [audioBufferStatus, setAudioBufferStatus] = useState<any>(null);
  const [audioCoordinationMode, setAudioCoordinationMode] = useState<'audio_driven' | 'visual_driven' | 'synchronized' | 'independent'>('synchronized');
  const [audioSyncTolerance, setAudioSyncTolerance] = useState(50);
  const [audioChunkEvents, setAudioChunkEvents] = useState<any[]>([]);
  const [coordinationEvents, setCoordinationEvents] = useState<any[]>([]);
  
  // Progressive streaming state
  const [streamingChunks, setStreamingChunks] = useState<StreamingTimelineChunk[]>([]);
  const [showComparisonDemo, setShowComparisonDemo] = useState(false);
  const [progressiveMode, setProgressiveMode] = useState<'traditional' | 'progressive'>('progressive');
  
  const playerRef = useRef<any>(null);

  // Convert timeline events to streaming chunks for progressive player
  const convertToStreamingChunks = (events: TimelineEvent[]): StreamingTimelineChunk[] => {
    if (events.length === 0) return [];
    
    // Group events into chunks of 2-3 events each
    const chunkSize = 2;
    const chunks: StreamingTimelineChunk[] = [];
    
    for (let i = 0; i < events.length; i += chunkSize) {
      const chunkEvents = events.slice(i, i + chunkSize);
      const chunkNumber = Math.floor(i / chunkSize) + 1;
      
      // Calculate chunk timing
      const startTime = Math.min(...chunkEvents.map(e => e.timestamp));
      const endTime = Math.max(...chunkEvents.map(e => e.timestamp + e.duration));
      const duration = endTime - startTime;
      
      const chunk: StreamingTimelineChunk = {
        chunkId: `streaming-chunk-${chunkNumber}`,
        chunkNumber,
        totalChunks: Math.ceil(events.length / chunkSize),
        status: 'ready',
        contentType: 'process',
        duration,
        timestampOffset: startTime,
        startTimeOffset: startTime,
        events: chunkEvents,
        generationParams: {
          targetDuration: duration / 1000,
          maxEvents: chunkSize,
          complexity: 'simple',
          layoutConstraints: {
            maxSimultaneousElements: 3,
            preferredStyle: 'minimal',
          },
          audioConstraints: {
            speakingRate: 150,
            pauseFrequency: 'normal',
          },
          contentFocus: {
            primaryObjective: 'Explain concept clearly',
            keyConceptsToEmphasize: [],
          },
        },
        nextChunkHints: [],
        metadata: {
          model: 'test-model',
          generatedAt: Date.now(),
          timing: {
            llmGeneration: Math.floor(50 + Math.random() * 100),
            postProcessing: Math.floor(25 + Math.random() * 50),
            validation: Math.floor(10 + Math.random() * 25),
            total: Math.floor(100 + Math.random() * 200),
          },
        },
      };
      
      chunks.push(chunk);
    }
    
    console.log(`🎯 Converted ${events.length} events to ${chunks.length} streaming chunks:`, 
      chunks.map(c => ({
        id: c.chunkId,
        startTime: c.timestampOffset,
        duration: c.duration,
        eventCount: c.events.length
      }))
    );
    
    return chunks;
  };

  // Convert API timeline event to shared type
  const convertAPIEventToTimelineEvent = (apiEvent: APITimelineEvent, index: number): TimelineEvent => {
    // Ensure we have meaningful content
    const content = apiEvent.content && apiEvent.content.trim() !== '' 
      ? apiEvent.content 
      : `Educational content for timeline event ${index + 1}. This content explains important concepts related to the topic.`;

    return {
      id: apiEvent.id || `event_${index}_${Date.now()}`,
      timestamp: apiEvent.timestamp * 1000, // API sends in seconds, convert to milliseconds
      duration: apiEvent.duration * 1000, // API sends in seconds, convert to milliseconds
      type: 'narration' as const, // Convert event_type to EventType
      semanticType: 'narration' as any, // Use narration type to avoid creating extra visual elements
      content: content, // Ensure content is never empty
      layoutHints: [
        {
          semantic: 'primary' as const,
          positioning: 'center' as const,
          importance: 'high' as const
        }
      ],
      dependencies: [],
      priority: 5,
      tags: ['generated', 'timeline'],
      metadata: {
        source: 'llm' as const,
        generatedAt: Date.now(),
        originalPrompt: apiEvent.visual_instruction || '',
        apiEventType: apiEvent.event_type
      }
    };
  };

  const startFullIntegrationTest = async () => {
    setLoading(true);
    setStreamingData([]);
    setIntegrationResult(null);
    setTimelineEvents([]);
    
    try {
      console.log('🚀 Starting full timeline integration test...');
      
      // Step 1: Generate chunked content with streaming
      const streamResponse = await fetch('/api/lesson/chunked/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic,
          difficulty_level: difficulty,
          content_type: 'process',
          target_duration: targetDuration,
          user_id: 'timeline_test'
        })
      });

      if (!streamResponse.ok) {
        const errorText = await streamResponse.text();
        console.error('❌ Streaming API failed:', {
          status: streamResponse.status,
          statusText: streamResponse.statusText,
          body: errorText
        });
        throw new Error(`Streaming failed (${streamResponse.status}): ${streamResponse.statusText}. ${errorText}`);
      }

      const reader = streamResponse.body?.getReader();
      const decoder = new TextDecoder();
      let allEvents: TimelineEvent[] = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(`✅ Streaming complete. Final timeline events: ${allEvents.length}`);
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data: StreamingData = JSON.parse(line.slice(6));
                setStreamingData(prev => [...prev, data]);

                if (data.type === 'chunk' && data.data.timeline_events) {
                  console.log(`🔍 Processing chunk ${data.data.chunk_number} with ${data.data.timeline_events.length} events:`, data.data.timeline_events);
                  
                  // Add new timeline events as they arrive and convert them
                  const newAPIEvents: APITimelineEvent[] = data.data.timeline_events.map((event: any, index: number) => {
                    console.log(`📊 Raw API event ${index}:`, {
                      timestamp: event.timestamp,
                      duration: event.duration,
                      event_type: event.event_type,
                      content: typeof event.content === 'string' ? event.content.substring(0, 50) : event.content
                    });
                    
                    return {
                      id: `${data.data.chunk_id}_${index}`,
                      timestamp: event.timestamp,
                      duration: event.duration,
                      event_type: event.event_type,
                      content: event.content,
                      visual_instruction: event.visual_instruction,
                      layout_hints: event.layout_hints
                    };
                  });
                  
                  // Convert to proper TimelineEvent format
                  const newEvents = newAPIEvents.map((apiEvent, index) => {
                    const converted = convertAPIEventToTimelineEvent(apiEvent, index);
                    console.log(`🔄 Converted event ${index}:`, {
                      id: converted.id,
                      timestamp: converted.timestamp,
                      duration: converted.duration,
                      timestampSeconds: (converted.timestamp / 1000).toFixed(1)
                    });
                    return converted;
                  });
                  
                  allEvents = [...allEvents, ...newEvents];
                  console.log(`🎯 Updated timeline events (total: ${allEvents.length}):`, 
                    allEvents.map(e => ({
                      id: e.id,
                      timestamp: e.timestamp,
                      timestampSeconds: (e.timestamp / 1000).toFixed(1),
                      duration: e.duration,
                      durationSeconds: (e.duration / 1000).toFixed(1),
                      content: typeof e.content === 'string' ? e.content.substring(0, 30) + '...' : 'object'
                    }))
                  );
                  setTimelineEvents(allEvents);
                  console.log(`📋 setTimelineEvents called with ${allEvents.length} events`);
                  
                  // Also convert to streaming chunks for progressive player
                  const chunks = convertToStreamingChunks(allEvents);
                  setStreamingChunks(chunks);
                  console.log(`📦 Created ${chunks.length} streaming chunks`);
                  
                  // Clear loading state as soon as we have timeline events
                  if (allEvents.length > 0 && loading) {
                    console.log(`🎯 Clearing loading state - timeline events are ready`);
                    setLoading(false);
                  }

                  // Update ExcalidrawPlayer with new timeline data
                  if (playerRef.current) {
                    console.log(`🎮 Calling playerRef.current.updateTimelineData with ${allEvents.length} events`);
                    playerRef.current.updateTimelineData(allEvents);
                  } else {
                    console.warn(`⚠️ playerRef.current is not available yet`);
                  }
                }
              } catch (e) {
                console.warn('❌ Failed to parse streaming data:', {
                  line: line.substring(0, 100),
                  error: e instanceof Error ? e.message : String(e)
                });
                // Add to streaming data as error for user feedback
                setStreamingData(prev => [...prev, {
                  type: 'error',
                  data: { error: `Parse error: ${line.substring(0, 50)}...` }
                }]);
              }
            }
          }
        }
      }

      // Step 2: Run full integration test
      console.log('📊 Running full integration test...');
      setIntegrationLoading(true);
      const integrationResponse = await fetch('/api/integration/full-timeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic,
          difficulty_level: difficulty,
          target_duration: targetDuration,
          canvas_size: { width: 1200, height: 800 },
          enable_timeline_layout: true,
          enable_smart_elements: true,
          enable_collision_detection: true,
          layout_mode: 'responsive',
          user_id: 'timeline_test'
        })
      });

      if (!integrationResponse.ok) {
        const errorText = await integrationResponse.text();
        throw new Error(`Integration API error (${integrationResponse.status}): ${errorText}`);
      }

      const responseText = await integrationResponse.text();
      let integrationData;
      try {
        integrationData = JSON.parse(responseText);
        setIntegrationResult(integrationData);
        console.log('✅ Full integration test completed:', integrationData);
      } catch (parseError) {
        console.error('Failed to parse integration response:', responseText);
        throw new Error(`Invalid JSON response from integration API: ${parseError}`);
      } finally {
        setIntegrationLoading(false);
      }
      
    } catch (error) {
      console.error('❌ Integration test failed:', error);
      
      // Determine error type for better user feedback
      let errorMessage = 'Unknown error occurred';
      let errorDetails = '';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('Failed to fetch')) {
          errorDetails = 'Check if the backend server is running on port 8000';
        } else if (error.message.includes('Streaming failed')) {
          errorDetails = 'The lesson generation API returned an error. Check the backend logs.';
        } else if (error.message.includes('Parse error')) {
          errorDetails = 'Received invalid data from the API. The response format may have changed.';
        }
      }
      
      setStreamingData(prev => [...prev, {
        type: 'error',
        data: { 
          error: errorMessage,
          details: errorDetails,
          timestamp: new Date().toISOString()
        }
      }]);
      
      // Also add to integration result for user visibility
      setIntegrationResult({
        success: false,
        topic,
        timeline_events_count: 0,
        chunks_generated: 0,
        elements_generated: 0,
        timeline_events: [],
        performance: {
          total_time_s: 0,
          memory_usage_bytes: 0,
          cache_hit_rate: 0
        },
        error: `${errorMessage}${errorDetails ? ` (${errorDetails})` : ''}`
      });
    } finally {
      // Only reset loading if we don't have timeline events yet
      // If we have events, loading was already cleared earlier
      if (timelineEvents.length === 0) {
        setLoading(false);
      }
      setIntegrationLoading(false);
    }
  };

  const seekToTimestamp = (timestamp: number) => {
    console.log(`🎯 Seeking to timestamp: ${timestamp}ms (${(timestamp / 1000).toFixed(1)}s)`);
    console.log(`🔧 Player reference available:`, !!playerRef.current);
    console.log(`📋 Timeline events count:`, timelineEvents.length);
    
    if (playerRef.current) {
      // Log available timeline events for debugging
      if (timelineEvents.length > 0) {
        console.log(`📊 Available timeline events:`, timelineEvents.map(e => ({
          id: e.id,
          timestamp: e.timestamp,
          timestampSeconds: (e.timestamp / 1000).toFixed(1),
          content: typeof e.content === 'string' ? e.content.substring(0, 30) + '...' : 'object'
        })));
      }
      
      console.log(`🚀 Calling playerRef.current.seekToTimestamp(${timestamp})`);
      playerRef.current.seekToTimestamp(timestamp);
      console.log(`✅ Seek call completed`);
    } else {
      console.warn('⚠️ Player reference not available for seeking');
    }
  };

  // Phase 4 Enhanced Timeline Functions
  const seekToPosition = async (position: number) => {
    console.log(`🎯 Phase 4 seek to position: ${position}ms (${(position / 1000).toFixed(1)}s)`);
    
    if (playerRef.current && playerRef.current.seekToPosition) {
      try {
        await playerRef.current.seekToPosition(position, { smooth: true });
        setCurrentPosition(position);
        console.log(`✅ Phase 4 seek completed successfully`);
      } catch (error) {
        console.error('❌ Phase 4 seek failed:', error);
        seekToTimestamp(position);
      }
    } else {
      console.warn('⚠️ Phase 4 seek not available, falling back to basic seek');
      seekToTimestamp(position);
    }
  };

  const updatePlaybackSpeed = (speed: number) => {
    console.log(`🎛️ Updating playback speed to: ${speed}x`);
    
    if (playerRef.current && playerRef.current.setPlaybackSpeed) {
      playerRef.current.setPlaybackSpeed(speed);
      setPlaybackSpeed(speed);
      console.log(`✅ Playback speed changed successfully`);
    } else {
      console.warn('⚠️ Phase 4 playback speed control not available');
    }
  };

  const refreshMetrics = () => {
    if (playerRef.current && (playbackMode === 'phase4' || playbackMode === 'phase5')) {
      if (playerRef.current.getPlaybackMetrics) {
        const metrics = playerRef.current.getPlaybackMetrics();
        setPlaybackMetrics(metrics);
        setCurrentPosition(metrics.currentPosition || 0);
        setBufferLevel(metrics.bufferLevel || 0);
      }
      
      if (playerRef.current.getSeekPerformanceMetrics) {
        const seekMetrics = playerRef.current.getSeekPerformanceMetrics();
        setSeekPerformance(seekMetrics);
      }
    }
  };

  const optimizeMemory = async () => {
    console.log('🧹 Starting memory optimization...');
    
    if (playerRef.current && playerRef.current.optimizeMemory) {
      try {
        await playerRef.current.optimizeMemory();
        console.log('✅ Memory optimization completed successfully');
        refreshMetrics();
      } catch (error) {
        console.error('❌ Memory optimization failed:', error);
      }
    } else {
      console.warn('⚠️ Memory optimization not available');
    }
  };

  const resetTimeline = () => {
    console.log('🔄 Resetting timeline...');
    
    if (playerRef.current && playerRef.current.resetTimeline) {
      playerRef.current.resetTimeline();
      setCurrentPosition(0);
      setIsPlaying(false);
      setPlaybackMetrics(null);
      setSeekPerformance(null);
      console.log('✅ Timeline reset completed');
    } else {
      console.warn('⚠️ Timeline reset not available');
    }
  };

  const togglePlayback = () => {
    console.log(`🎬 Toggling playback: ${isPlaying ? 'pause' : 'play'}`);
    
    if (playerRef.current) {
      if (isPlaying) {
        playerRef.current.pauseTimeline();
      } else {
        playerRef.current.playTimeline();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handlePlaybackStateChange = (state: string) => {
    setIsPlaying(state === 'playing');
    setProcessingState(state);
    console.log(`🎵 Playback state changed to: ${state}`);
  };

  const handleSeekComplete = (result: any) => {
    setCurrentPosition(result.position);
    console.log('🎯 Seek completed:', {
      position: `${(result.position / 1000).toFixed(1)}s`,
      seekTime: `${result.seekTime?.toFixed(1)}ms`,
      eventsExecuted: result.eventsToExecute?.length || 0
    });
    refreshMetrics();
  };

  // Phase 5 Audio Synchronization Functions
  const updateAudioCoordinationMode = (mode: 'audio_driven' | 'visual_driven' | 'synchronized' | 'independent') => {
    console.log(`🎵 Changing audio coordination mode to: ${mode}`);
    
    if (playerRef.current && playerRef.current.setAudioCoordinationMode) {
      playerRef.current.setAudioCoordinationMode(mode);
      setAudioCoordinationMode(mode);
      console.log(`✅ Audio coordination mode changed successfully`);
    } else {
      console.warn('⚠️ Phase 5 audio coordination mode control not available');
    }
  };

  const refreshAudioMetrics = () => {
    if (playerRef.current && playbackMode === 'phase5') {
      if (playerRef.current.getAudioSyncMetrics) {
        const metrics = playerRef.current.getAudioSyncMetrics();
        setAudioSyncState(metrics);
        console.log('🎵 Audio sync metrics updated:', metrics);
      }
      
      if (playerRef.current.getAudioProcessingMetrics) {
        const metrics = playerRef.current.getAudioProcessingMetrics();
        setAudioProcessingMetrics(metrics);
        console.log('🎛️ Audio processing metrics updated:', metrics);
      }
      
      if (playerRef.current.getCoordinationMetrics) {
        const metrics = playerRef.current.getCoordinationMetrics();
        setCoordinationMetrics(metrics);
        console.log('🤝 Coordination metrics updated:', metrics);
      }
      
      if (playerRef.current.getAudioBufferStatus) {
        const status = playerRef.current.getAudioBufferStatus();
        setAudioBufferStatus(status);
        console.log('📊 Audio buffer status updated:', status);
      }
    }
  };

  const testAudioSynchronization = () => {
    if (!timelineEvents.length) {
      console.warn('⚠️ No timeline events available for audio sync testing');
      return;
    }
    
    console.log('🎵 Testing audio synchronization...');
    
    // Test sync at different positions
    const totalDuration = Math.max(...timelineEvents.map(e => e.timestamp + e.duration));
    const testPositions = [0, totalDuration * 0.25, totalDuration * 0.5, totalDuration * 0.75];
    
    let positionIndex = 0;
    const testInterval = setInterval(() => {
      if (positionIndex >= testPositions.length) {
        clearInterval(testInterval);
        console.log('✅ Audio synchronization test completed');
        return;
      }
      
      const position = testPositions[positionIndex];
      console.log(`🎯 Testing audio sync at position: ${(position/1000).toFixed(1)}s`);
      
      if (playerRef.current && playerRef.current.syncAudioToPosition) {
        const syncResult = playerRef.current.syncAudioToPosition(position);
        console.log('🎵 Audio sync result:', syncResult);
      }
      
      positionIndex++;
    }, 2000); // Test every 2 seconds
  };

  const requestAudioGeneration = async () => {
    if (!timelineEvents.length) {
      console.warn('⚠️ No timeline events available for audio generation');
      return;
    }
    
    console.log('🎤 Requesting immediate audio generation...');
    
    const audioEvents = timelineEvents.filter(e => e.type === 'narration').slice(0, 3); // First 3 audio events
    const chunkIds = audioEvents.map(e => `audio_${e.id}`);
    
    if (playerRef.current && playerRef.current.requestAudioChunkGeneration) {
      try {
        const results = await playerRef.current.requestAudioChunkGeneration(chunkIds);
        console.log('✅ Audio generation results:', results);
        
        // Update metrics after generation
        setTimeout(refreshAudioMetrics, 1000);
      } catch (error) {
        console.error('❌ Audio generation failed:', error);
      }
    } else {
      console.warn('⚠️ Audio chunk generation not available');
    }
  };

  const clearAudioBuffer = () => {
    console.log('🧹 Clearing audio buffer...');
    
    if (playerRef.current && playerRef.current.clearAudioBuffer) {
      playerRef.current.clearAudioBuffer();
      setAudioBufferStatus({
        totalChunks: 0,
        bufferedChunks: 0,
        processingChunks: 0,
        pendingChunks: 0,
        memoryUsage: 0,
        bufferUtilization: 0,
      });
      console.log('✅ Audio buffer cleared');
    } else {
      console.warn('⚠️ Audio buffer clearing not available');
    }
  };

  const resetAudioCoordination = () => {
    console.log('🔄 Resetting audio coordination...');
    
    if (playerRef.current && playerRef.current.resetAudioCoordination) {
      playerRef.current.resetAudioCoordination();
      setAudioSyncState(null);
      setAudioProcessingMetrics(null);
      setCoordinationMetrics(null);
      setAudioChunkEvents([]);
      setCoordinationEvents([]);
      console.log('✅ Audio coordination reset completed');
    } else {
      console.warn('⚠️ Audio coordination reset not available');
    }
  };

  // Phase 5 Event Handlers
  const handleAudioSyncStateChange = (state: any) => {
    setAudioSyncState(state);
    console.log('🎵 Audio sync state changed:', state);
  };

  const handleAudioProcessingMetrics = (metrics: any) => {
    setAudioProcessingMetrics(metrics);
    console.log('🎛️ Audio processing metrics updated:', metrics);
  };

  const handleCoordinationEvent = (event: any) => {
    setCoordinationEvents(prev => [...prev.slice(-9), event]); // Keep last 10 events
    console.log('🤝 Coordination event:', event);
  };

  const handleAudioChunkReady = (chunk: any) => {
    setAudioChunkEvents(prev => [...prev.slice(-9), chunk]); // Keep last 10 chunks
    console.log('🎤 Audio chunk ready:', chunk);
  };

  const testRandomSeeks = async () => {
    if (!timelineEvents.length) {
      console.warn('⚠️ No timeline events available for seek testing');
      return;
    }
    
    const totalDuration = Math.max(...timelineEvents.map(e => e.timestamp + e.duration));
    const positions = Array.from({ length: 5 }, () => Math.random() * totalDuration);
    
    console.log('🎯 Testing random seek positions:', positions.map(p => `${(p/1000).toFixed(1)}s`));
    
    const startTime = performance.now();
    
    for (let i = 0; i < positions.length; i++) {
      const position = positions[i];
      console.log(`🎪 Seek test ${i + 1}/5: ${(position/1000).toFixed(1)}s`);
      await seekToPosition(position);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const totalTime = performance.now() - startTime;
    console.log(`✅ Random seek test completed in ${totalTime.toFixed(1)}ms`);
    console.log(`📈 Average seek time: ${(totalTime / positions.length).toFixed(1)}ms per seek`);
  };

  // Auto-refresh metrics when Phase 4 or 5 is enabled
  useEffect(() => {
    if ((playbackMode === 'phase4' || playbackMode === 'phase5') && timelineEvents.length > 0) {
      const interval = setInterval(refreshMetrics, 1000);
      return () => clearInterval(interval);
    }
  }, [playbackMode, timelineEvents.length]);

  const playTimeline = () => {
    if (playerRef.current) {
      playerRef.current.playTimeline();
    }
  };

  const pauseTimeline = () => {
    if (playerRef.current) {
      playerRef.current.pauseTimeline();
    }
  };

  // Phase 5 metrics refresh effect
  useEffect(() => {
    if (playbackMode !== 'phase5') {
      return;
    }
    
    // Refresh metrics every 2 seconds when Phase 5 is active
    const metricsInterval = setInterval(() => {
      refreshAudioMetrics();
    }, 2000);
    
    return () => clearInterval(metricsInterval);
  }, [playbackMode]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6 pb-12">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-blue-200">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xl">🚀</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Comprehensive Timeline Testing - Phase 5 ⭐
              </h1>
              <p className="text-gray-600">
                Complete AI Tutor testing: Topic → Chunked Generation → Timeline Layout → Visual Display → Audio Synchronization
              </p>
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800 text-sm">
              <strong>Testing Flow:</strong> Enter a topic → LLM generates streaming chunked data → 
              Timeline layout engine processes events → ExcalidrawPlayer visualizes in real-time
            </p>
          </div>
        </div>

        {/* Configuration Panel */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">🔧 Test Configuration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Learning Topic
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter topic to learn..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Difficulty Level
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Duration (seconds)
              </label>
              <input
                type="number"
                value={targetDuration}
                onChange={(e) => setTargetDuration(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="60"
                max="300"
              />
            </div>
          </div>

          <div className="mt-6">
            <Button
              onClick={startFullIntegrationTest}
              disabled={loading || integrationLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50"
            >
              {(loading || integrationLoading) ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>
                    {loading ? 'Generating Content...' : 'Running Integration Test...'}
                  </span>
                </div>
              ) : (
                <span>🚀 Start Full Timeline Integration Test</span>
              )}
            </Button>
          </div>
        </div>

        {/* Timeline Mode Configuration Panel */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">🎯 Timeline Mode Configuration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timeline Mode
              </label>
              <div className="flex gap-2">
                <Button 
                  onClick={() => setPlaybackMode('progressive')}
                  variant={playbackMode === 'progressive' ? 'default' : 'outline'}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Progressive 🚀
                </Button>
                <Button 
                  onClick={() => setPlaybackMode('phase5')}
                  variant={playbackMode === 'phase5' ? 'default' : 'outline'}
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Phase 5 ⭐
                </Button>
                <Button 
                  onClick={() => setPlaybackMode('phase4')}
                  variant={playbackMode === 'phase4' ? 'default' : 'outline'}
                  size="sm"
                >
                  Phase 4
                </Button>
                <Button 
                  onClick={() => setPlaybackMode('legacy')}
                  variant={playbackMode === 'legacy' ? 'default' : 'outline'}
                  size="sm"
                >
                  Legacy
                </Button>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {playbackMode === 'progressive' && 'YouTube-style Progressive Streaming (NEW!)'}
                {playbackMode === 'phase5' && 'Latest: Audio + Visual Synchronization'}
                {playbackMode === 'phase4' && 'Timeline Control & Playback'}
                {playbackMode === 'legacy' && 'Basic Timeline Display'}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Playback Speed: {playbackSpeed}x
              </label>
              <div className="flex gap-1">
                {[0.5, 1.0, 1.5, 2.0].map(speed => (
                  <Button
                    key={speed}
                    onClick={() => updatePlaybackSpeed(speed)}
                    variant={playbackSpeed === speed ? 'default' : 'outline'}
                    size="sm"
                  >
                    {speed}x
                  </Button>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                System Actions
              </label>
              <div className="flex gap-2">
                <Button onClick={optimizeMemory} variant="outline" size="sm">
                  🧹 Memory
                </Button>
                <Button onClick={resetTimeline} variant="outline" size="sm">
                  🔄 Reset
                </Button>
                <Button 
                  onClick={() => setShowComparisonDemo(!showComparisonDemo)} 
                  variant="outline" 
                  size="sm"
                  className="bg-green-50 hover:bg-green-100 text-green-700"
                >
                  📊 Compare
                </Button>
              </div>
            </div>
          </div>
          
          {/* Timeline Metrics Display */}
          {(playbackMode === 'phase4' || playbackMode === 'phase5') && (playbackMetrics || seekPerformance) && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-800 mb-2">📊 Timeline Metrics ({playbackMode})</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-blue-600">Position</p>
                  <p className="font-mono">{(currentPosition / 1000).toFixed(1)}s</p>
                </div>
                <div>
                  <p className="text-blue-600">Buffer Level</p>
                  <p className="font-mono">{(bufferLevel / 1000).toFixed(1)}s</p>
                </div>
                <div>
                  <p className="text-blue-600">Processing</p>
                  <p className="font-mono">{processingState}</p>
                </div>
                {seekPerformance && (
                  <div>
                    <p className="text-blue-600">Avg Seek</p>
                    <p className="font-mono">{seekPerformance.averageSeekTime?.toFixed(1)}ms</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Timeline Controls */}
        {timelineEvents.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">🎮 Timeline Controls</h2>
            
            <div className="flex flex-wrap gap-3 mb-4">
              <Button onClick={togglePlayback} className={isPlaying ? "bg-orange-600 hover:bg-orange-700" : "bg-green-600 hover:bg-green-700"}>
                {isPlaying ? "⏸️ Pause" : "▶️ Play"}
              </Button>
              <Button onClick={() => (playbackMode === 'phase4' || playbackMode === 'phase5') ? seekToPosition(0) : seekToTimestamp(0)} className="bg-blue-600 hover:bg-blue-700">
                ⏮️ Start
              </Button>
              {(playbackMode === 'phase4' || playbackMode === 'phase5') && (
                <Button onClick={testRandomSeeks} className="bg-purple-600 hover:bg-purple-700">
                  🎯 Test Seeks
                </Button>
              )}
              <Button onClick={refreshMetrics} variant="outline">
                📊 Refresh
              </Button>
            </div>
            
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Quick Seek:</p>
              <div className="flex flex-wrap gap-2">
                {/* Generate seek buttons based on actual timeline events */}
                {timelineEvents.length > 0 
                  ? timelineEvents.map((event, index) => {
                      const timestampSeconds = (event.timestamp / 1000).toFixed(1);
                      console.log(`🔘 Seek button ${index}: ${timestampSeconds}s (${event.timestamp}ms)`);
                      return (
                        <Button
                          key={event.id}
                          onClick={() => {
                            console.log(`🎯 Clicked seek button: ${timestampSeconds}s (${event.timestamp}ms)`);
                            (playbackMode === 'phase4' || playbackMode === 'phase5') ? seekToPosition(event.timestamp) : seekToTimestamp(event.timestamp);
                          }}
                          variant="outline"
                          size="sm"
                        >
                          {timestampSeconds}s
                        </Button>
                      );
                    })
                  : [0, 2000, 5000, 10000, 15000, 20000].map(timestamp => (
                      <Button
                        key={timestamp}
                        onClick={() => seekToTimestamp(timestamp)}
                        variant="outline"
                        size="sm"
                      >
                        {timestamp / 1000}s
                      </Button>
                    ))
                }
              </div>
            </div>
          </div>
        )}

        {/* Phase 5 Audio Integration & Synchronization Panel */}
        {playbackMode === 'phase5' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">🎵 Phase 5: Audio Integration & Synchronization</h2>
            
            {/* Audio Explanation */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
              <p className="text-purple-800 text-sm">
                <strong>Phase 5 Features:</strong> Real-time audio generation synchronized with visual timeline events. 
                Test audio-visual coordination, sync tolerance, and streaming audio buffer performance.
              </p>
            </div>
            
            {/* Basic Audio Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-800 text-sm">🎛️ Audio Settings</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Coordination Mode
                    <span className="text-gray-500 text-xs ml-1">(How audio & visuals sync)</span>
                  </label>
                  <select
                    value={audioCoordinationMode}
                    onChange={(e) => updateAudioCoordinationMode(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="synchronized">Synchronized (Recommended)</option>
                    <option value="audio_driven">Audio Driven</option>
                    <option value="visual_driven">Visual Driven</option>
                    <option value="independent">Independent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sync Tolerance: {audioSyncTolerance}ms
                    <span className="text-gray-500 text-xs ml-1">(Acceptable timing difference)</span>
                  </label>
                  <div className="flex gap-1">
                    {[25, 50, 100, 200].map(tolerance => (
                      <Button
                        key={tolerance}
                        onClick={() => setAudioSyncTolerance(tolerance)}
                        variant={audioSyncTolerance === tolerance ? 'default' : 'outline'}
                        size="sm"
                      >
                        {tolerance}ms
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-gray-800 text-sm">🧪 Audio Testing</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quick Tests</label>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={testAudioSynchronization} variant="outline" size="sm">
                      🎵 Sync Test
                    </Button>
                    <Button onClick={requestAudioGeneration} variant="outline" size="sm">
                      🎤 Generate Audio
                    </Button>
                    <Button onClick={refreshAudioMetrics} variant="outline" size="sm">
                      📊 Refresh Metrics
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">System Controls</label>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={resetAudioCoordination} variant="outline" size="sm">
                      🔄 Reset Audio
                    </Button>
                    <Button onClick={clearAudioBuffer} variant="outline" size="sm">
                      🧹 Clear Buffer
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 5 Metrics Display */}
            {playbackMode === 'phase5' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Audio Sync Metrics */}
                  {audioSyncState && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-sm text-gray-700 mb-2">🎵 Audio Sync State</h4>
                      <div className="space-y-1 text-xs text-gray-600">
                        <div>Timeline: {Math.round(audioSyncState.timelinePosition)}ms</div>
                        <div>Audio: {Math.round(audioSyncState.audioPosition)}ms</div>
                        <div>Offset: {Math.round(audioSyncState.syncOffset)}ms</div>
                        <div>State: <span className={audioSyncState.state === 'synced' ? 'text-green-600' : 'text-amber-600'}>{audioSyncState.state}</span></div>
                        <div>Confidence: {Math.round(audioSyncState.confidence * 100)}%</div>
                      </div>
                    </div>
                  )}

                  {/* Audio Buffer Status */}
                  {audioBufferStatus && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-sm text-gray-700 mb-2">📊 Buffer Status</h4>
                      <div className="space-y-1 text-xs text-gray-600">
                        <div>Total Chunks: {audioBufferStatus.totalChunks}</div>
                        <div>Buffered: {audioBufferStatus.bufferedChunks}</div>
                        <div>Processing: {audioBufferStatus.processingChunks}</div>
                        <div>Memory: {Math.round(audioBufferStatus.memoryUsage / 1024)}KB</div>
                        <div>Utilization: {Math.round(audioBufferStatus.bufferUtilization * 100)}%</div>
                      </div>
                    </div>
                  )}

                  {/* Coordination Metrics */}
                  {coordinationMetrics && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-sm text-gray-700 mb-2">🤝 Coordination</h4>
                      <div className="space-y-1 text-xs text-gray-600">
                        <div>Sync Events: {coordinationMetrics.totalSyncEvents}</div>
                        <div>Success Rate: {Math.round(coordinationMetrics.successfulSyncs / Math.max(1, coordinationMetrics.totalSyncEvents) * 100)}%</div>
                        <div>Avg Accuracy: {Math.round(coordinationMetrics.averageSyncAccuracy)}ms</div>
                        <div>Mode: {audioCoordinationMode}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Recent Events */}
                {(audioChunkEvents.length > 0 || coordinationEvents.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {audioChunkEvents.length > 0 && (
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-semibold text-sm text-gray-700 mb-2">🎤 Recent Audio Chunks</h4>
                        <div className="space-y-1 text-xs text-gray-600 max-h-32 overflow-y-auto">
                          {audioChunkEvents.slice(-5).map((chunk, i) => (
                            <div key={i}>
                              <span className="text-blue-600">Chunk {i + 1}:</span> {chunk.id || 'Generated'}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {coordinationEvents.length > 0 && (
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-semibold text-sm text-gray-700 mb-2">🤝 Coordination Events</h4>
                        <div className="space-y-1 text-xs text-gray-600 max-h-32 overflow-y-auto">
                          {coordinationEvents.slice(-5).map((event, i) => (
                            <div key={i}>
                              <span className="text-green-600">{event.type}:</span> {Math.round(event.position)}ms
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ExcalidrawPlayer - Main Visualization */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b">
            <h2 className="text-xl font-semibold text-gray-900">📊 Timeline Visualization</h2>
            <p className="text-gray-600 text-sm mt-1">
              Real-time visualization of timeline events with {playbackMode} layout engine
            </p>
            {/* Status indicator */}
            <div className="mt-2">
              {loading && (
                <div className="flex items-center gap-2 text-blue-600 text-sm">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span>Generating lesson content...</span>
                </div>
              )}
              {!loading && timelineEvents.length === 0 && (
                <div className="text-amber-600 text-sm">
                  📝 Click "Start Full Timeline Integration Test" to generate content
                </div>
              )}
              {!loading && timelineEvents.length > 0 && !integrationLoading && (
                <div className="text-green-600 text-sm">
                  ✅ {timelineEvents.length} timeline events loaded ({playbackMode} mode)
                </div>
              )}
              {integrationLoading && (
                <div className="flex items-center gap-2 text-purple-600 text-sm">
                  <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                  <span>Running integration test...</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="h-[600px] relative">
            {/* Loading overlay */}
            {loading && (
              <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-10">
                <div className="text-center">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-700 font-medium">Generating Timeline Content</p>
                  <p className="text-gray-500 text-sm mt-1">This may take a few moments...</p>
                </div>
              </div>
            )}
            
            {/* Empty state */}
            {!loading && timelineEvents.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <div className="text-6xl mb-4">🎥</div>
                  <h3 className="text-lg font-medium text-gray-700 mb-2">No Timeline Content Yet</h3>
                  <p className="text-sm">Generate a lesson above to see the interactive timeline visualization</p>
                </div>
              </div>
            )}
            
            {/* Player Selection */}
            <div className={`w-full h-full ${timelineEvents.length === 0 ? 'invisible' : 'visible'}`}>
              {playbackMode === 'progressive' ? (
                // Progressive Streaming Player
                <ExcalidrawPlayerProgressive
                  chunks={streamingChunks}
                  autoPlay={false}
                  showControls={true}
                  showBufferBar={true}
                  showLoadingIndicators={true}
                  streamingConfig={{
                    minStartBuffer: 2000,    // Start with 2 seconds
                    targetBuffer: 8000,      // Maintain 8 seconds ahead
                    autoStart: false
                  }}
                  width={1200}
                  height={600}
                  onPlaybackStart={() => {
                    console.log('🚀 Progressive playback started');
                    setIsPlaying(true);
                  }}
                  onPlaybackEnd={() => {
                    console.log('✅ Progressive playback ended');
                    setIsPlaying(false);
                  }}
                  onSeek={(position) => {
                    console.log(`🎯 Progressive seek to: ${position}ms`);
                    setCurrentPosition(position);
                  }}
                  onError={(error) => {
                    console.error('❌ Progressive player error:', error);
                  }}
                  className="w-full h-full"
                />
              ) : (
                // Legacy ExcalidrawPlayer
                <ExcalidrawPlayer
                  ref={playerRef}
                  mode={playbackMode}
                  enableTimelineLayout={true}
                  timelineEvents={timelineEvents}
                  canvasSize={{ width: 1200, height: 600 }}
                  enablePhase4Timeline={playbackMode === 'phase4' || playbackMode === 'phase5'}
                  enableAdvancedSeek={true}
                  enableContentBuffering={true}
                  enableMemoryOptimization={true}
                  seekResponseTarget={100}
                  // Phase 5 Audio Integration & Synchronization props
                  enablePhase5Audio={playbackMode === 'phase5'}
                  enableTimelineAudioSync={true}
                  enableStreamingAudioBuffer={true}
                  enableAudioVisualCoordination={true}
                  audioCoordinationMode={audioCoordinationMode}
                  audioSyncTolerance={audioSyncTolerance}
                  audioBufferAheadTime={2000}
                  audioSeekResponseTarget={100}
                  enableAudioScrubbing={true}
                  audioFadeDuration={150}
                  // Phase 5 Audio callbacks
                  onAudioSyncStateChange={handleAudioSyncStateChange}
                  onAudioProcessingMetrics={handleAudioProcessingMetrics}
                  onCoordinationEvent={handleCoordinationEvent}
                  onAudioChunkReady={handleAudioChunkReady}
                  bufferSize={15000}
                  onTimelineSeek={(timestamp: number) => {
                    setCurrentPosition(timestamp);
                    console.log(`Seeked to: ${timestamp}ms`);
                  }}
                  onPlaybackStateChange={handlePlaybackStateChange}
                  onSeekComplete={handleSeekComplete}
                  className="w-full h-full"
                />
              )}
            </div>
          </div>
        </div>

        {/* Streaming Data Display */}
        {streamingData.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">📡 Streaming Data</h2>
            
            <div className="space-y-2 max-h-60 overflow-y-auto bg-gray-50 p-4 rounded-lg">
              {streamingData.slice(-10).map((data, index) => (
                <div
                  key={index}
                  className={`p-2 rounded text-sm ${
                    data.type === 'progress' ? 'bg-blue-100 text-blue-800' :
                    data.type === 'chunk' ? 'bg-green-100 text-green-800' :
                    data.type === 'complete' ? 'bg-purple-100 text-purple-800' :
                    'bg-red-100 text-red-800'
                  }`}
                >
                  <strong className="uppercase">{data.type}:</strong>
                  {data.type === 'chunk' && (
                    <span> Chunk {data.data.chunk_number} - {data.data.timeline_events?.length || 0} events</span>
                  )}
                  {data.type === 'progress' && (
                    <span> {data.data.completed_chunks}/{data.data.total_chunks} chunks</span>
                  )}
                  {data.type === 'error' && (
                    <div className="mt-2">
                      <span className="block">{data.data.error}</span>
                      {data.data.details && (
                        <span className="text-xs block mt-1 opacity-80">{data.data.details}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Integration Results */}
        {integrationResult && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">📊 Integration Results</h2>
            
            {integrationResult.success ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-800">Timeline Events</h3>
                    <p className="text-2xl font-bold text-blue-600">
                      {integrationResult.timeline_events_count}
                    </p>
                  </div>
                  
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-semibold text-green-800">Chunks Generated</h3>
                    <p className="text-2xl font-bold text-green-600">
                      {integrationResult.chunks_generated}
                    </p>
                  </div>
                  
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h3 className="font-semibold text-purple-800">Visual Elements</h3>
                    <p className="text-2xl font-bold text-purple-600">
                      {integrationResult.elements_generated}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <h3 className="font-semibold text-orange-800">Processing Time</h3>
                    <p className="text-2xl font-bold text-orange-600">
                      {integrationResult.performance.total_time_s.toFixed(2)}s
                    </p>
                  </div>
                  
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <h3 className="font-semibold text-indigo-800">Cache Hit Rate</h3>
                    <p className="text-2xl font-bold text-indigo-600">
                      {(integrationResult.performance.cache_hit_rate * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-800 mb-2">✅ Integration Successful</h3>
                  <p className="text-green-700">
                    Full timeline integration completed successfully! All three phases are working together:
                    Phase 1 (Timeline Events), Phase 2 (Chunked Generation), and Phase 3 (Responsive Layout Engine).
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-red-800 mb-2">❌ Integration Failed</h3>
                <p className="text-red-700">
                  {integrationResult.error || 'Unknown integration error occurred'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Timeline Events List */}
        {timelineEvents.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">📋 Timeline Events</h2>
            
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {timelineEvents.map((event, index) => (
                <div
                  key={event.id}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                  onClick={() => (playbackMode === 'phase4' || playbackMode === 'phase5') ? seekToPosition(event.timestamp) : seekToTimestamp(event.timestamp)}
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {typeof event.content === 'string' 
                        ? event.content.substring(0, 60) + (event.content.length > 60 ? '...' : '')
                        : JSON.stringify(event.content).substring(0, 60) + '...'
                      }
                    </p>
                    <p className="text-sm text-gray-600">
                      {event.type} • Duration: {(event.duration / 1000).toFixed(1)}s • Start: {(event.timestamp / 1000).toFixed(1)}s
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-blue-600">
                      {(event.timestamp / 1000).toFixed(1)}s
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progressive Streaming Comparison Demo */}
        {showComparisonDemo && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">🚀 Progressive Streaming Comparison Demo</h2>
              <Button 
                onClick={() => setShowComparisonDemo(false)} 
                variant="outline" 
                size="sm"
              >
                ✕ Close Demo
              </Button>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-800 text-sm">
                <strong>Interactive Demo:</strong> Compare traditional "wait for all chunks" loading vs 
                YouTube-style progressive streaming. The progressive system starts playing immediately 
                when minimum content is ready, while the traditional system waits for everything to load.
              </p>
            </div>
            
            <StreamingComparisonDemo />
          </div>
        )}

      </div>
    </div>
  );
}