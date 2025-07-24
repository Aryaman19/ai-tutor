import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { useStreamingTTS } from '@ai-tutor/hooks';
import { createServiceLogger } from '@ai-tutor/utils';

const logger = createServiceLogger('SimpleAudioTimeline');

interface AudioSegment {
  id: string;
  text: string;
  title: string;
  duration?: number;
}

interface SimpleAudioTimelineProps {
  segments: AudioSegment[];
  voice?: string;
  className?: string;
  onSegmentChange?: (segmentIndex: number) => void;
  onPlaybackComplete?: () => void;
}

export const SimpleAudioTimeline: React.FC<SimpleAudioTimelineProps> = ({
  segments,
  voice,
  className = '',
  onSegmentChange,
  onPlaybackComplete
}) => {
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [speed, setSpeed] = useState(1.0);

  const currentSegment = segments[currentSegmentIndex];
  const currentText = currentSegment?.text || '';

  // Debug logging for text changes
  useEffect(() => {
    if (currentText) {
      logger.debug(`SimpleAudioTimeline: Text changed to "${currentText.substring(0, 50)}..."`, {
        segmentIndex: currentSegmentIndex,
        textLength: currentText.length,
        voice
      });
    }
  }, [currentText, currentSegmentIndex, voice]);

  // Use streaming TTS for current segment
  const streamingTTS = useStreamingTTS(currentText, {
    voice,
    speed,
    volume,
    autoPlay: false,
    onPlay: () => {
      logger.debug(`Started playing segment ${currentSegmentIndex}: ${currentSegment?.title}`);
      setIsPlaying(true);
    },
    onPause: () => {
      logger.debug(`Paused segment ${currentSegmentIndex}`);
      setIsPlaying(false);
    },
    onEnd: () => {
      logger.debug(`Completed segment ${currentSegmentIndex}`);
      setIsPlaying(false);
      
      // Auto-advance to next segment
      if (currentSegmentIndex < segments.length - 1) {
        logger.debug(`Auto-advancing to segment ${currentSegmentIndex + 1}`);
        setCurrentSegmentIndex(prev => prev + 1);
      } else {
        logger.debug('All segments completed');
        onPlaybackComplete?.();
      }
    },
    onError: (error) => {
      logger.error(`Audio error in segment ${currentSegmentIndex}:`, error);
      setIsPlaying(false);
    }
  });

  // Notify parent of segment changes
  useEffect(() => {
    onSegmentChange?.(currentSegmentIndex);
  }, [currentSegmentIndex, onSegmentChange]);

  // Format time in MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate total progress
  const totalProgress = segments.length > 0 ? 
    ((currentSegmentIndex + (streamingTTS.status.playbackProgress / 100)) / segments.length) * 100 : 0;

  // Control handlers
  const handlePlay = useCallback(() => {
    if (streamingTTS.status.isPlaying) {
      streamingTTS.controls.pause();
    } else {
      streamingTTS.controls.play();
    }
  }, [streamingTTS]);

  const handleStop = useCallback(() => {
    streamingTTS.controls.stop();
    setIsPlaying(false);
  }, [streamingTTS]);

  const handlePrevious = useCallback(() => {
    if (currentSegmentIndex > 0) {
      streamingTTS.controls.stop();
      setCurrentSegmentIndex(prev => prev - 1);
    }
  }, [currentSegmentIndex, streamingTTS]);

  const handleNext = useCallback(() => {
    if (currentSegmentIndex < segments.length - 1) {
      streamingTTS.controls.stop();
      setCurrentSegmentIndex(prev => prev + 1);
    }
  }, [currentSegmentIndex, segments.length, streamingTTS]);

  const handleRestart = useCallback(() => {
    setCurrentSegmentIndex(0);
    streamingTTS.controls.restart();
  }, [streamingTTS]);

  if (segments.length === 0) {
    return (
      <div className={`p-4 bg-gray-100 rounded-lg ${className}`}>
        <div className="text-center">
          <h3 className="font-semibold text-gray-700 mb-2">No Audio Segments Available</h3>
          <p className="text-gray-500 text-sm mb-4">
            No narration content found in the lesson. This could mean:
          </p>
          <ul className="text-sm text-gray-600 text-left max-w-md mx-auto space-y-1">
            <li>• The lesson is still generating</li>
            <li>• The lesson has no narration content</li>
            <li>• There's an issue with the data structure</li>
          </ul>
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-sm text-yellow-700">
              <strong>Debug:</strong> Check the browser console for chunk/segment creation logs
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
      {/* Current Segment Info */}
      <div className="p-4 border-b border-gray-100">
        <h3 className="font-semibold text-lg text-gray-800 mb-1">
          {currentSegment?.title || `Segment ${currentSegmentIndex + 1}`}
        </h3>
        <p className="text-sm text-gray-600 mb-2">
          {currentSegment?.text.substring(0, 100)}{currentSegment?.text.length > 100 ? '...' : ''}
        </p>
        <div className="flex items-center text-xs text-gray-500 space-x-4">
          <span>Segment {currentSegmentIndex + 1} of {segments.length}</span>
          {streamingTTS.status.error && (
            <span className="text-red-500">Error: {streamingTTS.status.error}</span>
          )}
          {streamingTTS.status.isGenerating && (
            <span className="text-blue-500 animate-pulse">🔄 Generating audio...</span>
          )}
          {streamingTTS.status.totalChunks > 0 && !streamingTTS.status.isGenerating && (
            <span className="text-green-500">✅ Ready ({streamingTTS.status.totalChunks} chunks)</span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="p-4">
        <div className="relative h-2 bg-gray-200 rounded-full mb-4">
          {/* Total Progress */}
          <div 
            className="absolute h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${totalProgress}%` }}
          />
          {/* Current Segment Progress */}
          <div 
            className="absolute h-full bg-blue-300 rounded-full transition-all duration-100"
            style={{ 
              left: `${(currentSegmentIndex / segments.length) * 100}%`,
              width: `${(streamingTTS.status.playbackProgress / 100) * (100 / segments.length)}%`
            }}
          />
        </div>

        {/* Time Display */}
        <div className="flex justify-between text-sm text-gray-500 mb-4">
          <span>
            {streamingTTS.status.currentChunk + 1} / {streamingTTS.status.totalChunks} chunks
          </span>
          <span>
            Progress: {Math.round(streamingTTS.status.playbackProgress)}%
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center justify-center space-x-4 mb-4">
          {/* Previous */}
          <button
            onClick={handlePrevious}
            disabled={currentSegmentIndex === 0}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SkipBack size={20} />
          </button>

          {/* Play/Pause */}
          <button
            onClick={handlePlay}
            disabled={streamingTTS.status.isGenerating}
            className="p-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
          >
            {streamingTTS.status.isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>

          {/* Stop */}
          <button
            onClick={handleStop}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200"
          >
            <Square size={20} />
          </button>

          {/* Next */}
          <button
            onClick={handleNext}
            disabled={currentSegmentIndex === segments.length - 1}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SkipForward size={20} />
          </button>
        </div>

        {/* Advanced Controls */}
        <div className="flex items-center justify-between space-x-4">
          {/* Volume */}
          <div className="flex items-center space-x-2">
            <Volume2 size={16} className="text-gray-500" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-xs text-gray-500 w-8">{Math.round(volume * 100)}%</span>
          </div>

          {/* Speed */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Speed:</span>
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value={0.5}>0.5x</option>
              <option value={0.75}>0.75x</option>
              <option value={1.0}>1.0x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={2.0}>2.0x</option>
            </select>
          </div>

          {/* Restart */}
          <button
            onClick={handleRestart}
            className="text-sm text-blue-500 hover:text-blue-700 px-2 py-1 rounded"
          >
            Restart
          </button>
        </div>
      </div>

      {/* Segment List */}
      <div className="border-t border-gray-100 max-h-48 overflow-y-auto">
        {segments.map((segment, index) => (
          <div
            key={segment.id}
            onClick={() => {
              streamingTTS.controls.stop();
              setCurrentSegmentIndex(index);
            }}
            className={`p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${
              index === currentSegmentIndex ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h4 className="font-medium text-sm text-gray-800">
                  {segment.title || `Segment ${index + 1}`}
                </h4>
                <p className="text-xs text-gray-600 mt-1">
                  {segment.text.substring(0, 80)}{segment.text.length > 80 ? '...' : ''}
                </p>
              </div>
              <div className="text-xs text-gray-400 ml-2">
                {index === currentSegmentIndex && streamingTTS.status.isPlaying && (
                  <span className="text-blue-500">Playing</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SimpleAudioTimeline;