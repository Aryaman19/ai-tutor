import { useState, useEffect } from 'react';
import { cn } from '@ai-tutor/utils';
import { createComponentLogger } from '@ai-tutor/utils';
import { lessons } from '../utils/lessons/index';

const logger = createComponentLogger('LessonSelector');

interface ApiLesson {
  id: string;
  topic: string;
  title: string;
  difficulty_level: string;
  created_at: string;
}

interface LessonSelectorProps {
  selectedLessonId: string;
  onLessonSelect: (lessonId: string, lessonName: string) => void;
  onApiLessonSelect: (lessonId: string) => void;
  isLoading?: boolean;
  className?: string;
}

export const LessonSelector = ({
  selectedLessonId,
  onLessonSelect,
  onApiLessonSelect,
  isLoading = false,
  className,
}: LessonSelectorProps) => {
  const [apiLessons, setApiLessons] = useState<ApiLesson[]>([]);
  const [loadingApiLessons, setLoadingApiLessons] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'legacy' | 'api'>('legacy');

  useEffect(() => {
    const fetchApiLessons = async () => {
      setLoadingApiLessons(true);
      try {
        const response = await fetch('/api/lessons?limit=20');
        if (response.ok) {
          const lessons = await response.json();
          setApiLessons(lessons);
          logger.debug('Fetched API lessons:', lessons.length);
        } else {
          logger.error('Failed to fetch API lessons:', response.status);
        }
      } catch (error) {
        logger.error('Error fetching API lessons:', error);
      } finally {
        setLoadingApiLessons(false);
      }
    };

    fetchApiLessons();
  }, []);

  const handleLegacyLessonChange = (lessonName: string) => {
    onLessonSelect(lessonName, lessonName);
  };

  const handleApiLessonChange = (lessonId: string) => {
    onApiLessonSelect(lessonId);
  };

  return (
    <div className={cn('p-4 bg-gray-50 border-b', className)}>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Lesson Source
        </label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="lessonMode"
              value="legacy"
              checked={selectedMode === 'legacy'}
              onChange={(e) => setSelectedMode(e.target.value as 'legacy' | 'api')}
              className="mr-2"
            />
            Legacy Lessons
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="lessonMode"
              value="api"
              checked={selectedMode === 'api'}
              onChange={(e) => setSelectedMode(e.target.value as 'legacy' | 'api')}
              className="mr-2"
            />
            API Lessons
          </label>
        </div>
      </div>

      {selectedMode === 'legacy' && (
        <div>
          <label htmlFor="lesson-select" className="block text-sm font-medium text-gray-700 mb-2">
            Choose a Legacy Lesson
          </label>
          <select
            id="lesson-select"
            value={selectedLessonId}
            onChange={(e) => handleLegacyLessonChange(e.target.value)}
            disabled={isLoading}
            className={cn(
              'w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm',
              'focus:outline-none focus:ring-blue-500 focus:border-blue-500',
              isLoading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <option value="">Select a lesson...</option>
            {Object.keys(lessons).map((lessonName) => (
              <option key={lessonName} value={lessonName}>
                {lessonName.charAt(0).toUpperCase() + lessonName.slice(1).replace(/([A-Z])/g, ' $1')}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedMode === 'api' && (
        <div>
          <label htmlFor="api-lesson-select" className="block text-sm font-medium text-gray-700 mb-2">
            Choose an API Lesson
          </label>
          {loadingApiLessons ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="ml-2 text-gray-600">Loading lessons...</span>
            </div>
          ) : (
            <select
              id="api-lesson-select"
              value={selectedLessonId}
              onChange={(e) => handleApiLessonChange(e.target.value)}
              disabled={isLoading}
              className={cn(
                'w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm',
                'focus:outline-none focus:ring-blue-500 focus:border-blue-500',
                isLoading && 'opacity-50 cursor-not-allowed'
              )}
            >
              <option value="">Select a lesson...</option>
              {apiLessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title} ({lesson.difficulty_level})
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
};