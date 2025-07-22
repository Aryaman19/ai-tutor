import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@ai-tutor/ui';
import ExcalidrawPlayer from '../components/ExcalidrawPlayer';
import type { TimelineEvent } from '@ai-tutor/types';

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
  
  const [streamingData, setStreamingData] = useState<StreamingData[]>([]);
  const [integrationResult, setIntegrationResult] = useState<FullIntegrationResult | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  
  // Phase 4 testing state
  const [phase4Enabled, setPhase4Enabled] = useState(true);
  const [playbackMode, setPlaybackMode] = useState<'legacy' | 'phase4'>('phase4');
  const [currentPosition, setCurrentPosition] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMetrics, setPlaybackMetrics] = useState<any>(null);
  const [seekPerformance, setSeekPerformance] = useState<any>(null);
  const [bufferLevel, setBufferLevel] = useState(0);
  const [processingState, setProcessingState] = useState<string>('idle');
  
  const playerRef = useRef<any>(null);

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
        throw new Error(`Streaming failed: ${streamResponse.status}`);
      }

      const reader = streamResponse.body?.getReader();
      const decoder = new TextDecoder();
      let allEvents: TimelineEvent[] = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data: StreamingData = JSON.parse(line.slice(6));
                setStreamingData(prev => [...prev, data]);

                if (data.type === 'chunk' && data.data.timeline_events) {
                  console.log(`🔍 Processing chunk ${data.data.chunk_number} with events:`, data.data.timeline_events);
                  
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
                      durationSeconds: (e.duration / 1000).toFixed(1)
                    }))
                  );
                  setTimelineEvents(allEvents);

                  // Update ExcalidrawPlayer with new timeline data
                  if (playerRef.current) {
                    playerRef.current.updateTimelineData(allEvents);
                  }
                }
              } catch (e) {
                console.warn('Failed to parse streaming data:', line);
              }
            }
          }
        }
      }

      // Step 2: Run full integration test
      console.log('📊 Running full integration test...');
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
      }
      
    } catch (error) {
      console.error('❌ Integration test failed:', error);
      setStreamingData(prev => [...prev, {
        type: 'error',
        data: { error: error instanceof Error ? error.message : 'Unknown error' }
      }]);
    } finally {
      setLoading(false);
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
    if (playerRef.current && phase4Enabled) {
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

  // Auto-refresh metrics when Phase 4 is enabled
  useEffect(() => {
    if (phase4Enabled && timelineEvents.length > 0) {
      const interval = setInterval(refreshMetrics, 1000);
      return () => clearInterval(interval);
    }
  }, [phase4Enabled, timelineEvents.length]);

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
                Timeline Integration Testing
              </h1>
              <p className="text-gray-600">
                Test the complete flow: Topic → Chunked Generation → Timeline Layout → Visual Display
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
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Testing Full Integration...</span>
                </div>
              ) : (
                <span>🚀 Start Full Timeline Integration Test</span>
              )}
            </Button>
          </div>
        </div>

        {/* Phase 4 Configuration Panel */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">🚀 Phase 4: Timeline Control & Playback</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phase 4 Mode
              </label>
              <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    setPhase4Enabled(true);
                    setPlaybackMode('phase4');
                  }}
                  variant={phase4Enabled ? 'default' : 'outline'}
                  size="sm"
                >
                  Phase 4
                </Button>
                <Button 
                  onClick={() => {
                    setPhase4Enabled(false);
                    setPlaybackMode('legacy');
                  }}
                  variant={!phase4Enabled ? 'default' : 'outline'}
                  size="sm"
                >
                  Legacy
                </Button>
              </div>
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
              </div>
            </div>
          </div>
          
          {/* Phase 4 Metrics Display */}
          {phase4Enabled && (playbackMetrics || seekPerformance) && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-800 mb-2">📊 Phase 4 Metrics</h3>
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
              <Button onClick={() => phase4Enabled ? seekToPosition(0) : seekToTimestamp(0)} className="bg-blue-600 hover:bg-blue-700">
                ⏮️ Start
              </Button>
              {phase4Enabled && (
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
                            phase4Enabled ? seekToPosition(event.timestamp) : seekToTimestamp(event.timestamp);
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

        {/* ExcalidrawPlayer - Main Visualization */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b">
            <h2 className="text-xl font-semibold text-gray-900">📊 Timeline Visualization</h2>
            <p className="text-gray-600 text-sm mt-1">
              Real-time visualization of timeline events with Phase 3 layout engine
            </p>
          </div>
          
          <div className="h-[600px]">
            <ExcalidrawPlayer
              ref={playerRef}
              mode={playbackMode}
              enableTimelineLayout={true}
              timelineEvents={timelineEvents}
              canvasSize={{ width: 1200, height: 600 }}
              enablePhase4Timeline={phase4Enabled}
              enableAdvancedSeek={true}
              enableContentBuffering={true}
              enableMemoryOptimization={true}
              seekResponseTarget={100}
              bufferSize={15000}
              onTimelineSeek={(timestamp: number) => {
                setCurrentPosition(timestamp);
                console.log(`Seeked to: ${timestamp}ms`);
              }}
              onPlaybackStateChange={handlePlaybackStateChange}
              onSeekComplete={handleSeekComplete}
              className="w-full h-full"
            />
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
                    <span> {data.data.error}</span>
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
                  onClick={() => phase4Enabled ? seekToPosition(event.timestamp) : seekToTimestamp(event.timestamp)}
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

      </div>
    </div>
  );
}