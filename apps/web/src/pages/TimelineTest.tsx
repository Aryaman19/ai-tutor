import React, { useState, useEffect } from 'react';
import { Plus, RefreshCw, Trash2, Play, Volume2, Loader2 } from 'lucide-react';
import { TimelinePlayer } from '../components/TimelinePlayer';
import { type TimelineLesson } from '../hooks/useTimelinePlayer';
import { createComponentLogger } from '@ai-tutor/utils';

const logger = createComponentLogger('TimelineTest');

// Real API functions
const timelineAPI = {
  async createTimelineLesson(request: { topic: string; difficulty_level: string; target_duration?: number }): Promise<TimelineLesson> {
    logger.info('Creating timeline lesson:', request);
    
    const response = await fetch('http://localhost:8000/api/timeline-lesson', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create timeline lesson: ${error}`);
    }
    
    const lesson = await response.json();
    return lesson;
  },

  async getTimelineLessons(): Promise<TimelineLesson[]> {
    logger.info('Fetching timeline lessons');
    
    const response = await fetch('http://localhost:8000/api/timeline-lessons');
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch timeline lessons: ${error}`);
    }
    
    const lessons = await response.json();
    return lessons;
  },

  async getTimelineLesson(id: string): Promise<TimelineLesson> {
    logger.info('Fetching timeline lesson:', id);
    
    const response = await fetch(`http://localhost:8000/api/timeline-lesson/${id}`);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch timeline lesson: ${error}`);
    }
    
    const lesson = await response.json();
    return lesson;
  },

  async getGenerationProgress(id: string) {
    const response = await fetch(`http://localhost:8000/api/timeline-lesson/${id}/progress`);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch progress: ${error}`);
    }
    
    return await response.json();
  },

  async generateTTS(id: string, voice?: string) {
    logger.info('Generating TTS for lesson:', id);
    
    const url = `http://localhost:8000/api/timeline-lesson/${id}/generate-tts`;
    const body = voice ? JSON.stringify({ voice }) : undefined;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: voice ? { 'Content-Type': 'application/json' } : {},
      body,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to generate TTS: ${error}`);
    }
    
    return await response.json();
  }
};

export const TimelineTest: React.FC = () => {
  const [lessons, setLessons] = useState<TimelineLesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<TimelineLesson | undefined>();
  const [isCreating, setIsCreating] = useState(false);
  const [isGeneratingTTS, setIsGeneratingTTS] = useState<string | null>(null); // lesson ID being processed
  const [formData, setFormData] = useState({
    topic: '',
    difficulty_level: 'beginner',
    target_duration: 120
  });

  // Load existing lessons on mount
  useEffect(() => {
    loadLessons();
  }, []);

  const loadLessons = async () => {
    try {
      const fetchedLessons = await timelineAPI.getTimelineLessons();
      setLessons(fetchedLessons);
    } catch (error) {
      logger.error('Failed to load lessons:', error);
    }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.topic.trim()) return;

    setIsCreating(true);
    try {
      const newLesson = await timelineAPI.createTimelineLesson(formData);
      setLessons(prev => [...prev, newLesson]);
      setSelectedLesson(newLesson);
      
      // Start polling for generation progress
      pollGenerationProgress(newLesson.id);
      
      // Reset form
      setFormData({
        topic: '',
        difficulty_level: 'beginner',
        target_duration: 120
      });
    } catch (error) {
      logger.error('Failed to create lesson:', error);
    } finally {
      setIsCreating(false);
    }
  };

  // Poll for generation progress and update lesson
  const pollGenerationProgress = async (lessonId: string) => {
    const poll = async () => {
      try {
        const progress = await timelineAPI.getGenerationProgress(lessonId);
        
        // Update lesson in state
        setLessons(prev => prev.map(lesson => 
          lesson.id === lessonId 
            ? { ...lesson, generation_status: progress.status, generation_progress: progress.progress }
            : lesson
        ));
        
        // Update selected lesson if it's the one being generated
        setSelectedLesson(prev => 
          prev?.id === lessonId 
            ? { ...prev, generation_status: progress.status, generation_progress: progress.progress }
            : prev
        );
        
        // If completed, fetch the full lesson with segments
        if (progress.status === 'completed') {
          const fullLesson = await timelineAPI.getTimelineLesson(lessonId);
          setLessons(prev => prev.map(lesson => 
            lesson.id === lessonId ? fullLesson : lesson
          ));
          setSelectedLesson(prev => 
            prev?.id === lessonId ? fullLesson : prev
          );
          return; // Stop polling
        }
        
        // Continue polling if not completed
        if (progress.status === 'generating') {
          setTimeout(poll, 2000); // Poll every 2 seconds
        }
      } catch (error) {
        logger.error('Failed to fetch generation progress:', error);
      }
    };
    
    poll();
  };

  const handleDeleteLesson = (lessonId: string) => {
    setLessons(prev => prev.filter(lesson => lesson.id !== lessonId));
    if (selectedLesson?.id === lessonId) {
      setSelectedLesson(undefined);
    }
  };

  const handleGenerateTTS = async (lessonId: string) => {
    if (isGeneratingTTS) return; // Prevent multiple generations
    
    setIsGeneratingTTS(lessonId);
    try {
      logger.info(`Generating TTS for lesson ${lessonId}`);
      const result = await timelineAPI.generateTTS(lessonId);
      
      logger.info('TTS generation result:', result);
      
      // Refresh the lesson to get updated audio URLs
      const updatedLesson = await timelineAPI.getTimelineLesson(lessonId);
      
      // Update lesson in state
      setLessons(prev => prev.map(lesson => 
        lesson.id === lessonId ? updatedLesson : lesson
      ));
      
      // Update selected lesson if it's the one we generated TTS for
      if (selectedLesson?.id === lessonId) {
        setSelectedLesson(updatedLesson);
      }
      
      logger.info(`TTS generation completed: ${result.segments_with_tts}/${result.total_segments} segments`);
    } catch (error) {
      logger.error('Failed to generate TTS:', error);
    } finally {
      setIsGeneratingTTS(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Timeline System Test</h1>
            <p className="text-gray-600">Test the new timeline-based lesson system</p>
          </div>
          <button
            onClick={loadLessons}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          {/* Create Lesson Form */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-3">Create Timeline Lesson</h3>
            <form onSubmit={handleCreateLesson} className="space-y-3">
              <input
                type="text"
                placeholder="Enter lesson topic..."
                value={formData.topic}
                onChange={(e) => setFormData(prev => ({ ...prev, topic: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              
              <select
                value={formData.difficulty_level}
                onChange={(e) => setFormData(prev => ({ ...prev, difficulty_level: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Duration (seconds)</label>
                <input
                  type="number"
                  min="60"
                  max="600"
                  value={formData.target_duration}
                  onChange={(e) => setFormData(prev => ({ ...prev, target_duration: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={isCreating || !formData.topic.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-lg transition-colors"
              >
                {isCreating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Create Lesson
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Lessons List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Timeline Lessons</h3>
              {lessons.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <p>No timeline lessons yet.</p>
                  <p className="text-sm">Create one above to get started!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {lessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedLesson?.id === lesson.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedLesson(lesson)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{lesson.title || lesson.topic}</h4>
                          <p className="text-sm text-gray-600">{lesson.difficulty_level}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              lesson.generation_status === 'completed' ? 'bg-green-100 text-green-800' :
                              lesson.generation_status === 'generating' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {lesson.generation_status}
                            </span>
                            {lesson.generation_status !== 'completed' && (
                              <span className="text-xs text-gray-500">
                                {Math.round(lesson.generation_progress)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {selectedLesson?.id === lesson.id && (
                            <Play size={14} className="text-blue-500" />
                          )}
                          
                          {/* TTS Generation Button */}
                          {lesson.generation_status === 'completed' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGenerateTTS(lesson.id);
                              }}
                              disabled={isGeneratingTTS === lesson.id}
                              className="p-1 hover:bg-green-100 rounded transition-colors disabled:opacity-50"
                              title={
                                lesson.segments?.some(s => s.tts_generated) 
                                  ? "Regenerate audio" 
                                  : "Generate audio"
                              }
                            >
                              {isGeneratingTTS === lesson.id ? (
                                <Loader2 size={14} className="text-green-500 animate-spin" />
                              ) : (
                                <Volume2 size={14} className={
                                  lesson.segments?.some(s => s.tts_generated) 
                                    ? "text-green-600" 
                                    : "text-gray-500"
                                } />
                              )}
                            </button>
                          )}
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLesson(lesson.id);
                            }}
                            className="p-1 hover:bg-red-100 rounded transition-colors"
                            title="Delete lesson"
                          >
                            <Trash2 size={14} className="text-red-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Timeline Player */}
        <div className="flex-1">
          <TimelinePlayer
            lesson={selectedLesson}
            autoPlay={false}
            onComplete={() => {
              console.log('Timeline lesson completed!');
            }}
            onError={(error) => {
              console.error('Timeline player error:', error);
            }}
          />
        </div>
      </div>
    </div>
  );
};