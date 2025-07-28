import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@ai-tutor/ui';
import AITutorPlayer from '../components/AITutorPlayer';
import MultiSlideCanvasPlayer from '../components/MultiSlideCanvasPlayer';
import { lessonsApi, ttsApi } from '@ai-tutor/api-client';
import { createComponentLogger } from '@ai-tutor/utils';
import { AudioEngine } from '@ai-tutor/utils/src/audio/unified-audio-engine';
import { LayoutEngine } from '@ai-tutor/utils/src/excalidraw/layout-engine';
import type { TimelineEvent, StreamingTimelineChunk } from '@ai-tutor/types';

const logger = createComponentLogger('AITutor');

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

// API response interfaces
interface APITimelineEvent {
  id?: string;
  timestamp: number;
  duration: number;
  event_type: string;
  content: string;
  visual_instruction?: string;
  layout_hints?: Record<string, any>;
}

interface AITutorSlide {
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

interface AITutorLessonResponse {
  topic: string;
  difficulty_level: string;
  target_duration: number;
  total_slides: number;
  estimated_total_duration: number;
  slides: AITutorSlide[];
  audio_url?: string;
  audio_segments?: any[];
  canvas_states?: any[];
  generation_stats?: any;
  success: boolean;
  error?: string;
}

interface StreamingData {
  type: 'progress' | 'chunk' | 'complete' | 'error';
  data: any;
}

function AITutorContent() {
  // Navigation and API
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Mode Selection State
  const [mode, setMode] = useState<'interactive' | 'create'>('interactive');
  
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
  const [isStreamingComplete, setIsStreamingComplete] = useState(false);
  
  // Unified Engine State
  const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null);
  const [layoutEngine, setLayoutEngine] = useState<LayoutEngine | null>(null);
  const [unifiedAudioResult, setUnifiedAudioResult] = useState<any>(null);
  const [canvasStates, setCanvasStates] = useState<any[]>([]);
  const [isProcessingEngines, setIsProcessingEngines] = useState(false);
  const [completeSemanticData, setCompleteSemanticData] = useState<any>(null);
  
  // AI Tutor Multi-Slide State
  const [aiTutorLesson, setAiTutorLesson] = useState<AITutorLessonResponse | null>(null);
  const [isGeneratingAITutor, setIsGeneratingAITutor] = useState(false);
  const [aiTutorProgress, setAiTutorProgress] = useState<string>('');
  const [useMultiSlideMode, setUseMultiSlideMode] = useState(true);
  const [useCanvasPlayer, setUseCanvasPlayer] = useState(true);
  
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  
  const playerRef = useRef<any>(null);
  
  // Example topics for inspiration
  const exampleTopics = [
    "How do computers work?",
    "Why is the sky blue?",
    "What is photosynthesis?",
    "How do airplanes fly?",
    "What are black holes?",
    "How does the internet work?",
  ];
  
  // Lesson creation mutation
  const createLessonMutation = useMutation({
    mutationFn: (topic: string) => lessonsApi.createLesson(topic),
    onSuccess: (lesson) => {
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      navigate(`/lesson/${lesson.id}`);
    },
    onError: (error) => {
      logger.error("Error creating lesson:", error);
      setError(`Failed to create lesson: ${error}`);
    },
  });

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
  // Process complete semantic data through unified engines
  const processWithUnifiedEngines = async (semanticData: any) => {
    setIsProcessingEngines(true);
    setGenerationProgress('Processing with unified engines...');
    
    try {
      logger.debug('Processing semantic data with unified engines', { semanticData });
      
      // Step 1: Check TTS availability first
      setGenerationProgress('Checking TTS service availability...');
      try {
        const availability = await ttsApi.checkAvailability();
        logger.debug('TTS availability check', { availability });
        
        if (!availability.available) {
          const errorMessage = availability.error || availability.message || 'Unknown error';
          throw new Error(`TTS service unavailable: ${errorMessage}`);
        }
      } catch (availabilityError) {
        const errorMsg = availabilityError instanceof Error ? availabilityError.message : 'TTS availability check failed';
        logger.error('TTS availability check failed', { error: errorMsg });
        throw new Error(`Cannot generate audio: ${errorMsg}`);
      }

      // Step 2: Create and process with AudioEngine
      setGenerationProgress('Creating unified audio file...');
      const audioEng = new AudioEngine({
        voice: undefined, // Will use default from settings
        speed: 1.0,
        volume: 1.0,
        separatorPause: 800 // 800ms pause between segments
      });
      
      const audioSegments = audioEng.processSemanticData(semanticData);
      const unifiedText = audioEng.createUnifiedText();
      
      logger.debug('Audio engine processed data', { 
        segmentsCount: audioSegments.length,
        unifiedTextLength: unifiedText.length,
        textPreview: unifiedText.substring(0, 200) + '...'
      });
      
      // Validate that we have text to generate audio from
      if (!unifiedText || unifiedText.trim().length === 0) {
        throw new Error('No text content available for audio generation');
      }
      
      // Generate single audio file
      const audioResult = await audioEng.generateUnifiedAudio(ttsApi);
      
      setAudioEngine(audioEng);
      setUnifiedAudioResult(audioResult);
      
      logger.debug('Unified audio generated', { 
        audioId: audioResult.audioId,
        totalDuration: audioResult.totalDuration,
        isReady: audioResult.isReady
      });
      
      // Step 2: Create and process with LayoutEngine
      setGenerationProgress('Creating timeline-based canvas layout...');
      const layoutEng = new LayoutEngine({
        canvasWidth: 1200,
        canvasHeight: 700,
        elementSpacing: 80,
        fontSize: 18,
        maxElementsPerScreen: 6,
        autoScroll: true,
        animationDuration: 300
      });
      
      const states = layoutEng.processSemanticData(semanticData, audioSegments);
      
      setLayoutEngine(layoutEng);
      setCanvasStates(states);
      
      logger.debug('Layout engine processed data', { 
        statesCount: states.length,
        totalDuration: states.reduce((max, state) => Math.max(max, state.timestamp + state.duration), 0)
      });
      
      // Step 3: Convert to streaming chunks for player compatibility
      setGenerationProgress('Converting to player format...');
      const chunks = convertCanvasStatesToStreamingChunks(states, audioSegments);
      setStreamingChunks(chunks);
      
      // Also set timeline events for backward compatibility
      const events = convertCanvasStatesToTimelineEvents(states);
      setTimelineEvents(events);
      
      setIsStreamingComplete(true);
      setGenerationProgress('Ready to play! Audio can be seeked instantly.');
      
      logger.debug('Unified engines processing complete', { 
        chunksCount: chunks.length,
        eventsCount: events.length,
        audioReady: audioResult.isReady
      });
      
      setTimeout(() => setGenerationProgress(''), 3000);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Unified engines processing failed', error);
      setError(`Failed to process with unified engines: ${errorMessage}`);
      setGenerationProgress('');
    } finally {
      setIsProcessingEngines(false);
    }
  };

  const convertCanvasStatesToStreamingChunks = (states: any[], audioSegments: any[]): StreamingTimelineChunk[] => {
    return states.map((state, index) => ({
      chunkId: `unified-chunk-${index}`,
      chunkNumber: index + 1,
      totalChunks: states.length,
      status: 'ready' as const,
      contentType: state.metadata?.contentType || 'definition',
      duration: state.duration,
      timestampOffset: state.timestamp,
      startTimeOffset: state.timestamp,
      events: [{
        id: `unified-event-${index}`,
        timestamp: state.timestamp,
        duration: state.duration,
        type: 'narration' as const,
        semanticType: 'definition',
        content: audioSegments[index]?.text || 'Generated content',
        layoutHints: [{
          semantic: 'primary' as const,
          positioning: 'center' as const,
          importance: 'high' as const
        }],
        dependencies: [],
        priority: 5,
        tags: ['ai-generated', 'unified-engine'],
        metadata: {
          source: 'template' as const, // Use template as the closest match for unified-engine
          generatedAt: Date.now(),
          originalPrompt: '',
          topic: topic,
          difficulty: difficulty,
          canvasElements: state.elements
        }
      }],
      generationParams: {
        targetDuration: state.duration / 1000,
        maxEvents: 1,
        complexity: difficulty === 'beginner' ? 'simple' : difficulty === 'advanced' ? 'complex' : 'medium',
        layoutConstraints: {
          maxSimultaneousElements: state.elements.length,
          preferredStyle: 'balanced',
        },
        audioConstraints: {
          speakingRate: 160,
          pauseFrequency: 'normal',
        },
        contentFocus: {
          primaryObjective: `Learn about ${topic}`,
          keyConceptsToEmphasize: [],
        },
      },
      nextChunkHints: [],
      metadata: {
        model: 'unified-engine',
        generatedAt: Date.now(),
        timing: {
          llmGeneration: 0,
          postProcessing: 0,
          validation: 0,
          total: 0,
        },
        unifiedAudio: {
          audioId: unifiedAudioResult?.audioId,
          startTime: state.timestamp,
          endTime: state.timestamp + state.duration
        }
      },
    }));
  };

  const convertCanvasStatesToTimelineEvents = (states: any[]): TimelineEvent[] => {
    return states.map((state, index) => ({
      id: `unified-timeline-${index}`,
      timestamp: state.timestamp,
      duration: state.duration,
      type: 'narration' as const,
      semanticType: 'definition',
      content: state.metadata?.title || `Learning segment ${index + 1}`,
      layoutHints: [{
        semantic: 'primary' as const,
        positioning: 'center' as const,
        importance: 'high' as const
      }],
      dependencies: [],
      priority: 5,
      tags: ['ai-generated', 'unified-engine'],
      metadata: {
        source: 'template' as const, // Use template as the closest match for unified-engine
        generatedAt: Date.now(),
        originalPrompt: '',
        topic: topic,
        difficulty: difficulty,
        canvasState: state
      }
    }));
  };

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
    setIsStreamingComplete(false);
    setCompleteSemanticData(null);
    setGenerationProgress('Starting lesson generation...');
    
    try {
      // Use streaming approach with unified processing
      await generateLessonWithStreamingFallback();
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

  // Fallback method using streaming but processing complete data at the end
  const generateLessonWithStreamingFallback = async () => {
    try {
      setGenerationProgress('Using streaming approach with unified processing...');
      
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
      let allChunksData: any[] = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            setGenerationProgress('Streaming complete! Processing with unified engines...');
            
            // Build complete semantic data from chunks
            const completeData = {
              chunks: allChunksData,
              topic: topic,
              difficulty: difficulty,
              target_duration: targetDuration
            };
            
            setCompleteSemanticData(completeData);
            
            // Process with unified engines
            await processWithUnifiedEngines(completeData);
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
                    `Receiving lesson data... ${progress.completed_chunks}/${progress.total_chunks} chunks`
                  );
                }

                if (data.type === 'chunk' && data.data.timeline_events) {
                  setGenerationProgress(
                    `Received chunk ${data.data.chunk_number}...`
                  );
                  
                  // Store chunk data for later processing
                  allChunksData.push({
                    chunkId: data.data.chunk_id,
                    chunkNumber: data.data.chunk_number,
                    contentType: 'definition',
                    events: data.data.timeline_events.map((event: any, index: number) => ({
                      id: `${data.data.chunk_id}_${index}`,
                      timestamp: event.timestamp * 1000, // Convert to ms
                      duration: event.duration * 1000, // Convert to ms
                      type: 'narration',
                      content: event.content,
                      visual_instruction: event.visual_instruction,
                      layout_hints: event.layout_hints
                    }))
                  });
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
      throw error; // Re-throw to be handled by parent
    }
  };

  const resetLesson = () => {
    setTimelineEvents([]);
    setStreamingChunks([]);
    setIsStreamingComplete(false);
    setIsPlaying(false);
    setCurrentPosition(0);
    setError('');
    setGenerationProgress('');
    
    // Reset unified engine state
    setAudioEngine(null);
    setLayoutEngine(null);
    setUnifiedAudioResult(null);
    setCanvasStates([]);
    setIsProcessingEngines(false);
    setCompleteSemanticData(null);
    
    // Reset AI tutor state
    setAiTutorLesson(null);
    setIsGeneratingAITutor(false);
    setAiTutorProgress('');
  };

  // Generate AI tutor lesson with multi-slide support
  const generateAITutorLesson = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic to generate a lesson');
      return;
    }

    setIsGeneratingAITutor(true);
    setError('');
    setAiTutorProgress('Starting AI tutor lesson generation...');
    resetLesson();

    try {
      logger.debug('Starting AI tutor lesson generation', { topic, difficulty, targetDuration });

      // Call the AI tutor API
      const response = await fetch('/api/ai-tutor/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: topic.trim(),
          difficulty_level: difficulty,
          target_duration: targetDuration,
          container_size: {
            width: 1200,
            height: 800
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const lesson: AITutorLessonResponse = await response.json();
      
      logger.debug('AI tutor lesson generated successfully', { 
        lesson: {
          topic: lesson.topic,
          total_slides: lesson.total_slides,
          success: lesson.success,
          slides_count: lesson.slides?.length || 0
        }
      });

      if (!lesson.success) {
        throw new Error(lesson.error || 'AI tutor lesson generation failed');
      }

      setAiTutorLesson(lesson);
      setAiTutorProgress('AI tutor lesson generated successfully!');

      // Process the lesson for UnifiedPlayer
      await processAITutorLessonForPlayer(lesson);

    } catch (error) {
      logger.error('AI tutor lesson generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`AI tutor generation failed: ${errorMessage}`);
      setAiTutorProgress('');
    } finally {
      setIsGeneratingAITutor(false);
    }
  };

  // Generate dummy template lesson using fallback data
  const generateDummyTemplateLesson = async () => {
    setIsGeneratingAITutor(true);
    setError('');
    setAiTutorProgress('Loading dummy templates with fallback data...');
    resetLesson();

    try {
      logger.debug('Starting dummy template lesson generation');

      // Call the dummy template API
      const response = await fetch('/api/templates/dummy-lesson', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const lesson: AITutorLessonResponse = await response.json();
      
      logger.debug('Dummy template lesson generated successfully', { 
        lesson: {
          topic: lesson.topic,
          total_slides: lesson.total_slides,
          success: lesson.success,
          slides_count: lesson.slides?.length || 0,
          categories_used: lesson.generation_stats?.categories_used
        }
      });

      if (!lesson.success) {
        throw new Error(lesson.error || 'Dummy template lesson generation failed');
      }

      setAiTutorLesson(lesson);
      setAiTutorProgress('Dummy template lesson loaded successfully!');

      // Process the lesson for UnifiedPlayer
      await processAITutorLessonForPlayer(lesson);

    } catch (error) {
      logger.error('Dummy template lesson generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`Dummy template generation failed: ${errorMessage}`);
      setAiTutorProgress('');
    } finally {
      setIsGeneratingAITutor(false);
    }
  };

  // Process AI tutor lesson for UnifiedPlayer
  const processAITutorLessonForPlayer = async (lesson: AITutorLessonResponse) => {
    setIsProcessingEngines(true);
    setAiTutorProgress('Setting up unified player...');

    try {
      // Create AudioEngine with slide narrations
      const slides = lesson.slides.map(slide => ({
        narration: slide.narration,
        duration: slide.estimated_duration * 1000, // Convert to ms
        slideNumber: slide.slide_number
      }));

      logger.debug('Creating AudioEngine for multi-slide lesson', { slidesCount: slides.length });

      const audioEngineInstance = new AudioEngine({
        voice: 'default',
        speed: 1.0,
        volume: 1.0,
        separatorPause: 500 // 500ms crossfade
      });

      // Process slide narrations
      audioEngineInstance.processSlideNarrations(slides);

      // Create mock unified audio result (since we don't have actual TTS)
      const mockAudioResult = {
        audioUrl: lesson.audio_url || '/api/audio/mock-lesson.mp3',
        audioId: `ai-tutor-${Date.now()}`,
        totalDuration: lesson.estimated_total_duration * 1000, // Convert to ms
        segments: audioEngineInstance.getSegments(),
        isReady: true
      };

      setAudioEngine(audioEngineInstance);
      setUnifiedAudioResult(mockAudioResult);

      // Create LayoutEngine and set up canvas states
      const layoutEngineInstance = new LayoutEngine({
        canvasWidth: 1200,
        canvasHeight: 800,
        elementSpacing: 80,
        fontSize: 16,
        maxElementsPerScreen: 8,
        autoScroll: true,
        animationDuration: 300
      });

      // Convert lesson canvas states
      const canvasStatesData = lesson.canvas_states || [];
      
      // Update timing for canvas states based on audio segments
      const processedStates = canvasStatesData.map((state, index) => {
        const audioSegment = mockAudioResult.segments[index];
        return {
          ...state,
          timestamp: audioSegment ? audioSegment.startTime : index * 5000,
          duration: audioSegment ? audioSegment.duration : 5000,
        };
      });

      layoutEngineInstance.setCanvasStates(processedStates);
      setLayoutEngine(layoutEngineInstance);
      setCanvasStates(processedStates);

      logger.debug('AI tutor lesson processed for UnifiedPlayer', {
        audioReady: !!mockAudioResult.isReady,
        canvasStatesCount: processedStates.length,
        totalDuration: mockAudioResult.totalDuration
      });

      setAiTutorProgress('Ready to play AI tutor lesson!');
      setIsStreamingComplete(true);

    } catch (error) {
      logger.error('Failed to process AI tutor lesson for player:', error);
      setError(`Failed to set up player: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessingEngines(false);
    }
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            🤖 AI Tutor
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Learn any topic with AI-generated lessons and interactive visuals
          </p>
        </div>

        {/* Lesson Configuration */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">📚 Create Your Lesson</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Topic Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What would you like to learn? *
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                placeholder="e.g., Photosynthesis, Solar System, Democracy..."
                disabled={isGeneratingAITutor}
              />
              
              {/* Example topics */}
              <div className="mt-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">💡 Try these examples:</p>
                <div className="flex flex-wrap gap-2">
                  {exampleTopics.map((example, index) => (
                    <button
                      key={index}
                      onClick={() => setTopic(example)}
                      className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full transition-colors duration-200 disabled:opacity-50"
                      disabled={isGeneratingAITutor}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
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
                disabled={isGenerating || createLessonMutation.isPending}
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
                disabled={isGenerating || createLessonMutation.isPending}
              >
                <option value={60}>⚡ Quick (1 minute)</option>
                <option value={120}>📖 Standard (2 minutes)</option>
                <option value={180}>📚 Detailed (3 minutes)</option>
                <option value={300}>🎓 Comprehensive (5 minutes)</option>
              </select>
            </div>
          </div>



          {/* Canvas Player Mode Toggle */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              🎨 Canvas Player Mode
            </label>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setUseCanvasPlayer(false)}
                className={`flex-1 px-4 py-2 rounded-md font-medium transition-all duration-200 text-sm ${
                  !useCanvasPlayer
                    ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
                disabled={isGeneratingAITutor}
              >
                🤖 AI Tutor Player
              </button>
              <button
                onClick={() => setUseCanvasPlayer(true)}
                className={`flex-1 px-4 py-2 rounded-md font-medium transition-all duration-200 text-sm ${
                  useCanvasPlayer
                    ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-600 dark:text-orange-400'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
                disabled={isGeneratingAITutor}
              >
                🎨 Multi-Slide Canvas
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {useCanvasPlayer 
                ? "🎨 POC-style multi-slide canvas player with timer-based progression"
                : "🤖 Standard AI tutor player with audio synchronization"
              }
            </p>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={generateAITutorLesson}
              disabled={isGeneratingAITutor || !topic.trim()}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium py-4 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 text-lg"
            >
              {isGeneratingAITutor ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Generating AI Tutor Lesson...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-3">
                  <span className="text-xl">🎯</span>
                  <span>Generate AI Tutor Lesson</span>
                </div>
              )}
            </Button>
            
            <Button
              onClick={generateDummyTemplateLesson}
              disabled={isGeneratingAITutor}
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-medium py-4 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 text-lg"
              title="Load a multi-slide lesson using template fallback data without LLM generation"
            >
              {isGeneratingAITutor && aiTutorProgress.includes('dummy') ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Loading Templates...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-3">
                  <span className="text-xl">📐</span>
                  <span>Load Dummy Templates</span>
                </div>
              )}
            </Button>
            
            {(timelineEvents.length > 0 || aiTutorLesson || error) && (
              <Button
                onClick={resetLesson}
                variant="outline"
                className="px-6 py-4 text-lg"
                disabled={isGenerating || createLessonMutation.isPending || isGeneratingAITutor}
              >
                🔄 New Lesson
              </Button>
            )}
          </div>

          {/* Progress indicator */}
          {(generationProgress || aiTutorProgress || isGeneratingAITutor) && (
            <div className={`mt-4 p-4 ${
              aiTutorProgress || isGeneratingAITutor
                ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800' 
                : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
            } rounded-lg`}>
              <div className="flex items-center space-x-3">
                <div className={`w-5 h-5 border-2 ${
                  aiTutorProgress || isGeneratingAITutor
                    ? 'border-purple-600 dark:border-purple-400' 
                    : 'border-blue-600 dark:border-blue-400'
                } border-t-transparent rounded-full animate-spin`}></div>
                <span className={`${
                  aiTutorProgress || isGeneratingAITutor
                    ? 'text-purple-800 dark:text-purple-200' 
                    : 'text-blue-800 dark:text-blue-200'
                } font-medium text-lg`}>
                  {aiTutorProgress || generationProgress || 'Generating AI Tutor Lesson...'}
                </span>
              </div>
              {isProcessingEngines && (
                <div className="mt-2 text-xs text-blue-600">
                  🔧 Unified Audio & Layout Engines working...
                </div>
              )}
              {unifiedAudioResult && (
                <div className="mt-2 text-xs text-green-600">
                  ✅ Audio ready for instant seeking • Duration: {Math.round(unifiedAudioResult.totalDuration / 1000)}s
                </div>
              )}
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

          {/* AI Tutor Lesson Info */}
          {aiTutorLesson && (
            <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-purple-900">
                  {aiTutorLesson.generation_stats?.fallback_data_used 
                    ? '📐 Dummy Template Lesson Generated' 
                    : '🎯 AI Tutor Lesson Generated'
                  }
                </h3>
                <div className="flex items-center space-x-2">
                  {aiTutorLesson.success ? (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                      ✅ Success
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                      ❌ Error
                    </span>
                  )}
                  {aiTutorLesson.generation_stats?.fallback_data_used && (
                    <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded-full">
                      📐 Template Data
                    </span>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="bg-white/50 p-3 rounded-lg">
                  <div className="text-purple-600 font-medium">Topic</div>
                  <div className="text-gray-900">{aiTutorLesson.topic}</div>
                </div>
                <div className="bg-white/50 p-3 rounded-lg">
                  <div className="text-purple-600 font-medium">Slides</div>
                  <div className="text-gray-900">{aiTutorLesson.total_slides}</div>
                </div>
                <div className="bg-white/50 p-3 rounded-lg">
                  <div className="text-purple-600 font-medium">Duration</div>
                  <div className="text-gray-900">{Math.round(aiTutorLesson.estimated_total_duration)}s</div>
                </div>
                <div className="bg-white/50 p-3 rounded-lg">
                  <div className="text-purple-600 font-medium">Difficulty</div>
                  <div className="text-gray-900 capitalize">{aiTutorLesson.difficulty_level}</div>
                </div>
              </div>

              {/* Template Categories for Dummy Lessons */}
              {aiTutorLesson.generation_stats?.fallback_data_used && aiTutorLesson.generation_stats?.categories_used && (
                <div className="mt-4">
                  <div className="text-sm font-medium text-purple-700 mb-2">Template Categories Used:</div>
                  <div className="flex flex-wrap gap-2">
                    {aiTutorLesson.generation_stats.categories_used.map((category: string, index: number) => (
                      <span 
                        key={index} 
                        className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full capitalize"
                      >
                        {category.replace('-', ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {aiTutorLesson.slides && aiTutorLesson.slides.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-medium text-purple-700 mb-2">Slide Preview:</div>
                  <div className="flex space-x-2 overflow-x-auto">
                    {aiTutorLesson.slides.slice(0, 5).map((slide, index) => (
                      <div key={slide.slide_number} className="flex-shrink-0 bg-white p-2 rounded border text-xs min-w-[120px]">
                        <div className="font-medium text-gray-900">#{slide.slide_number}</div>
                        <div className="text-gray-600 capitalize">{slide.content_type}</div>
                        <div className="text-purple-600">{slide.template_name}</div>
                        {aiTutorLesson.generation_stats?.fallback_data_used && (
                          <div className="text-orange-600 text-xs mt-1">Fallback Data</div>
                        )}
                      </div>
                    ))}
                    {aiTutorLesson.slides.length > 5 && (
                      <div className="flex-shrink-0 bg-gray-100 p-2 rounded border text-xs min-w-[60px] flex items-center justify-center">
                        +{aiTutorLesson.slides.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lesson Player */}
        {(streamingChunks.length > 0 || (aiTutorLesson && isStreamingComplete)) && (
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
                    {aiTutorLesson ? `${aiTutorLesson.total_slides} slides ready` : `${streamingChunks.length} segments ready`}
                    {unifiedAudioResult && (
                      <span className="ml-2 text-green-600">
                        • Unified Audio ✅
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {isPlaying ? '▶️ Playing' : '⏸️ Paused'}
                    {unifiedAudioResult && (
                      <span className="ml-2 text-green-500">
                        • Instant Seek Available
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Player */}
            <div className="h-[700px] relative">
              {aiTutorLesson && aiTutorLesson.slides ? (
                useCanvasPlayer ? (
                  <MultiSlideCanvasPlayer
                    slides={aiTutorLesson.slides}
                    autoPlay={false}
                    showControls={true}
                    onSlideChange={(slideIndex) => logger.debug('Canvas slide changed:', slideIndex)}
                    onPlaybackStart={handlePlaybackStart}
                    onPlaybackEnd={handlePlaybackEnd}
                    onError={handleError}
                    className="w-full h-full"
                    testMode={false} // Set to true to test with simple elements
                  />
                ) : (
                  <AITutorPlayer
                    slides={aiTutorLesson.slides}
                    autoPlay={false}
                    showControls={true}
                    width={1200}
                    height={700}
                    onPlaybackStart={handlePlaybackStart}
                    onPlaybackEnd={handlePlaybackEnd}
                    onSlideChange={(slideIndex) => logger.debug('AI tutor slide changed:', slideIndex)}
                    onError={handleError}
                    className="w-full h-full"
                  />
                )
              ) : (
                <div className="w-full h-full bg-gray-50 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {aiTutorLesson 
                        ? (useCanvasPlayer ? 'Preparing Multi-Slide Canvas Player' : 'Preparing AI Tutor Player')
                        : 'Preparing Unified Player'
                      }
                    </h3>
                    <p className="text-gray-600 mb-4">
                      {aiTutorLesson 
                        ? (useCanvasPlayer 
                          ? 'Setting up POC-style multi-slide canvas player...' 
                          : 'Setting up AI tutor lesson player...'
                        )
                        : 'Processing lesson with unified audio and layout engines...'
                      }
                    </p>
                    <div className="text-sm text-gray-500 space-y-1">
                      {aiTutorLesson ? (
                        <>
                          <div>AI Tutor Lesson: {aiTutorLesson.success ? '✅ Ready' : '⏳ Processing'}</div>
                          <div>Slides: {aiTutorLesson.slides?.length > 0 ? `✅ ${aiTutorLesson.slides.length} ready` : '⏳ Generating'}</div>
                        </>
                      ) : (
                        <>
                          <div>Audio Engine: {audioEngine ? '✅ Ready' : '⏳ Loading'}</div>
                          <div>Layout Engine: {layoutEngine ? '✅ Ready' : '⏳ Loading'}</div>
                          <div>Unified Audio: {unifiedAudioResult ? '✅ Ready' : '⏳ Generating'}</div>
                          <div>Canvas States: {canvasStates.length > 0 ? `✅ ${canvasStates.length} ready` : '⏳ Processing'}</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lesson Summary */}
        {timelineEvents.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              📋 Lesson Overview
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
                  {unifiedAudioResult ? Math.ceil(unifiedAudioResult.totalDuration / 60000) : Math.ceil(targetDuration / 60)}
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

              <div className={`border rounded-lg p-4 text-center ${
                unifiedAudioResult ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
              }`}>
                <div className={`text-3xl font-bold ${
                  unifiedAudioResult ? 'text-emerald-600' : 'text-gray-400'
                }`}>
                  {unifiedAudioResult ? '✅' : '⏳'}
                </div>
                <div className={`text-sm font-medium ${
                  unifiedAudioResult ? 'text-emerald-800' : 'text-gray-600'
                }`}>
                  Unified Audio
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
        {!isGenerating && !isGeneratingAITutor && streamingChunks.length === 0 && !aiTutorLesson && !error && (
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