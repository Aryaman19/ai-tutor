import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@ai-tutor/ui';
import { ExcalidrawPlayerProgressive } from '../components/ExcalidrawPlayerProgressive';
import type { TimelineEvent, StreamingTimelineChunk } from '@ai-tutor/types';

// Error Boundary Component for Production
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('AI Tutor Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-gray-600 mb-4">The AI Tutor encountered an error. Please refresh the page to try again.</p>
            <Button onClick={() => window.location.reload()}>
              🔄 Refresh Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

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

function AITutorContent() {
  // Core AI Tutor State
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [targetDuration, setTargetDuration] = useState(120);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Content State
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [streamingChunks, setStreamingChunks] = useState<StreamingTimelineChunk[]>([]);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [error, setError] = useState<string>('');
  
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  
  const playerRef = useRef<any>(null);

  // Convert timeline events to streaming chunks for progressive player
  const convertToStreamingChunks = (events: TimelineEvent[]): StreamingTimelineChunk[] => {
    if (events.length === 0) return [];
    
    // Group events into chunks of 2-3 events each for better streaming
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
        chunkId: `chunk-${chunkNumber}`,
        chunkNumber,
        totalChunks: Math.ceil(events.length / chunkSize),
        status: 'ready',
        contentType: 'definition',
        duration,
        timestampOffset: startTime,
        startTimeOffset: startTime,
        events: chunkEvents,
        generationParams: {
          targetDuration: duration / 1000,
          maxEvents: chunkSize,
          complexity: difficulty === 'beginner' ? 'simple' : difficulty === 'advanced' ? 'complex' : 'medium',
          layoutConstraints: {
            maxSimultaneousElements: 3,
            preferredStyle: 'balanced',
          },
          audioConstraints: {
            speakingRate: 150,
            pauseFrequency: 'normal',
          },
          contentFocus: {
            primaryObjective: `Learn about ${topic}`,
            keyConceptsToEmphasize: [],
          },
        },
        nextChunkHints: [],
        metadata: {
          model: 'gemma3n',
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
    
    return chunks;
  };

  // Convert API timeline event to shared type
  const convertAPIEventToTimelineEvent = (apiEvent: APITimelineEvent, index: number): TimelineEvent => {
    const content = apiEvent.content && apiEvent.content.trim() !== '' 
      ? apiEvent.content 
      : `Educational content about ${topic}`;

    return {
      id: apiEvent.id || `event_${index}_${Date.now()}`,
      timestamp: apiEvent.timestamp * 1000, // Convert to milliseconds
      duration: apiEvent.duration * 1000, // Convert to milliseconds
      type: 'narration' as const,
      semanticType: 'definition',
      content: content,
      layoutHints: [
        {
          semantic: 'primary' as const,
          positioning: 'center' as const,
          importance: 'high' as const
        }
      ],
      dependencies: [],
      priority: 5,
      tags: ['ai-generated', 'educational'],
      metadata: {
        source: 'llm' as const,
        generatedAt: Date.now(),
        originalPrompt: apiEvent.visual_instruction || '',
        topic: topic,
        difficulty: difficulty
      }
    };
  };

  const generateLesson = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic to learn about');
      return;
    }

    setIsGenerating(true);
    setError('');
    setTimelineEvents([]);
    setStreamingChunks([]);
    setGenerationProgress('Starting lesson generation...');
    
    try {
      const streamResponse = await fetch('/api/lesson/chunked/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic,
          difficulty_level: difficulty,
          content_type: 'definition',
          target_duration: targetDuration,
          user_id: 'ai_tutor_user'
        })
      });

      if (!streamResponse.ok) {
        const errorText = await streamResponse.text();
        throw new Error(`Failed to generate lesson: ${streamResponse.status} ${streamResponse.statusText}. ${errorText}`);
      }

      const reader = streamResponse.body?.getReader();
      const decoder = new TextDecoder();
      let allEvents: TimelineEvent[] = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            setGenerationProgress('Lesson generation complete!');
            setTimeout(() => setGenerationProgress(''), 2000);
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data: StreamingData = JSON.parse(line.slice(6));

                if (data.type === 'progress') {
                  const progress = data.data;
                  setGenerationProgress(
                    `Generating lesson... ${progress.completed_chunks}/${progress.total_chunks} chunks`
                  );
                }

                if (data.type === 'chunk' && data.data.timeline_events) {
                  setGenerationProgress(
                    `Processing chunk ${data.data.chunk_number}...`
                  );
                  
                  // Convert API events to timeline events
                  const newAPIEvents: APITimelineEvent[] = data.data.timeline_events.map((event: any, index: number) => ({
                    id: `${data.data.chunk_id}_${index}`,
                    timestamp: event.timestamp,
                    duration: event.duration,
                    event_type: event.event_type,
                    content: event.content,
                    visual_instruction: event.visual_instruction,
                    layout_hints: event.layout_hints
                  }));
                  
                  const newEvents = newAPIEvents.map((apiEvent, index) => 
                    convertAPIEventToTimelineEvent(apiEvent, index)
                  );
                  
                  allEvents = [...allEvents, ...newEvents];
                  setTimelineEvents(allEvents);
                  
                  // Convert to streaming chunks for progressive player
                  const chunks = convertToStreamingChunks(allEvents);
                  setStreamingChunks(chunks);
                }

                if (data.type === 'error') {
                  throw new Error(data.data.error || 'Unknown error occurred');
                }

              } catch (parseError) {
                console.warn('Failed to parse streaming data:', parseError);
              }
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Lesson generation failed:', error);
      
      let errorMessage = 'Failed to generate lesson';
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Unable to connect to the AI service. Please check if the server is running.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
      setGenerationProgress('');
    } finally {
      setIsGenerating(false);
    }
  };

  const resetLesson = () => {
    setTimelineEvents([]);
    setStreamingChunks([]);
    setIsPlaying(false);
    setCurrentPosition(0);
    setError('');
    setGenerationProgress('');
  };

  const handlePlaybackStart = () => {
    setIsPlaying(true);
  };

  const handlePlaybackEnd = () => {
    setIsPlaying(false);
  };

  const handleSeek = (position: number) => {
    setCurrentPosition(position);
  };

  const handleError = (error: Error) => {
    console.error('Player error:', error);
    setError(`Playback error: ${error.message}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🤖 AI Tutor
          </h1>
          <p className="text-xl text-gray-600">
            Learn any topic with AI-generated lessons and interactive visuals
          </p>
        </div>

        {/* Lesson Configuration */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">📚 Create Your Lesson</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Topic Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                What would you like to learn? *
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                placeholder="e.g., Photosynthesis, Solar System, Democracy..."
                disabled={isGenerating}
              />
            </div>
            
            {/* Difficulty Level */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Difficulty Level
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                disabled={isGenerating}
              >
                <option value="beginner">🟢 Beginner (Simple explanation)</option>
                <option value="intermediate">🟡 Intermediate (Balanced detail)</option>
                <option value="advanced">🔴 Advanced (In-depth analysis)</option>
              </select>
            </div>
            
            {/* Lesson Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lesson Duration
              </label>
              <select
                value={targetDuration}
                onChange={(e) => setTargetDuration(Number(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                disabled={isGenerating}
              >
                <option value={60}>⚡ Quick (1 minute)</option>
                <option value={120}>📖 Standard (2 minutes)</option>
                <option value={180}>📚 Detailed (3 minutes)</option>
                <option value={300}>🎓 Comprehensive (5 minutes)</option>
              </select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-4">
            <Button
              onClick={generateLesson}
              disabled={isGenerating || !topic.trim()}
              className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-4 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 text-lg"
            >
              {isGenerating ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Generating Your Lesson...</span>
                </div>
              ) : (
                <span>🚀 Generate AI Lesson</span>
              )}
            </Button>
            
            {(timelineEvents.length > 0 || error) && (
              <Button
                onClick={resetLesson}
                variant="outline"
                className="px-6 py-4 text-lg"
                disabled={isGenerating}
              >
                🔄 New Lesson
              </Button>
            )}
          </div>

          {/* Progress indicator */}
          {generationProgress && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-blue-800 font-medium">{generationProgress}</span>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <span className="text-red-600 text-xl">⚠️</span>
                <span className="text-red-800 font-medium">{error}</span>
              </div>
            </div>
          )}
        </div>

        {/* Lesson Player */}
        {streamingChunks.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-8">
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">
                    🎥 {topic}
                  </h2>
                  <p className="text-gray-600 mt-1">
                    {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} level • {Math.ceil(targetDuration / 60)} minute lesson
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">
                    {streamingChunks.length} segments ready
                  </div>
                  <div className="text-xs text-gray-400">
                    {isPlaying ? '▶️ Playing' : '⏸️ Paused'}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Progressive Player */}
            <div className="h-[700px] relative">
              <ExcalidrawPlayerProgressive
                chunks={streamingChunks}
                autoPlay={false}
                showControls={true}
                showBufferBar={true}
                showLoadingIndicators={true}
                streamingConfig={{
                  minStartBuffer: 2000,    // Start playing with 2 seconds buffered
                  targetBuffer: 8000,      // Maintain 8 seconds ahead
                  autoStart: false         // Manual start for better UX
                }}
                width={1200}
                height={700}
                onPlaybackStart={handlePlaybackStart}
                onPlaybackEnd={handlePlaybackEnd}
                onSeek={handleSeek}
                onError={handleError}
                className="w-full h-full"
              />
            </div>
          </div>
        )}

        {/* Lesson Summary */}
        {timelineEvents.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              📋 Lesson Overview
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {timelineEvents.length}
                </div>
                <div className="text-sm text-blue-800 font-medium">
                  Learning Segments
                </div>
              </div>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-600">
                  {Math.ceil(targetDuration / 60)}
                </div>
                <div className="text-sm text-green-800 font-medium">
                  Minutes Duration
                </div>
              </div>
              
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-purple-600">
                  {streamingChunks.length}
                </div>
                <div className="text-sm text-purple-800 font-medium">
                  Interactive Chunks
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-gray-800">Lesson Content:</h3>
              {timelineEvents.slice(0, 5).map((event, index) => (
                <div
                  key={event.id}
                  className="p-3 bg-gray-50 rounded-lg border-l-4 border-blue-500"
                >
                  <div className="font-medium text-gray-900 mb-1">
                    Segment {index + 1}
                  </div>
                  <div className="text-gray-700 text-sm">
                    {typeof event.content === 'string' 
                      ? event.content.substring(0, 120) + (event.content.length > 120 ? '...' : '')
                      : 'Interactive content'
                    }
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Duration: {(event.duration / 1000).toFixed(1)}s • 
                    Start: {(event.timestamp / 1000).toFixed(1)}s
                  </div>
                </div>
              ))}
              
              {timelineEvents.length > 5 && (
                <div className="text-center py-2">
                  <span className="text-gray-500 text-sm">
                    ... and {timelineEvents.length - 5} more segments
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isGenerating && streamingChunks.length === 0 && !error && (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <div className="text-6xl mb-4">🎓</div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">
              Ready to Learn Something New?
            </h3>
            <p className="text-gray-600 text-lg mb-6">
              Enter any topic above and our AI will create a personalized lesson with interactive visuals and narration.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-500">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-700 mb-1">🧬 Science Topics</div>
                <div>Photosynthesis, DNA, Climate Change</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-700 mb-1">📚 History & Culture</div>
                <div>Ancient Egypt, World Wars, Renaissance</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-700 mb-1">💡 Technology</div>
                <div>AI, Blockchain, Quantum Computing</div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// Main export with Error Boundary
export default function AITutor() {
  return (
    <ErrorBoundary>
      <AITutorContent />
    </ErrorBoundary>
  );
}