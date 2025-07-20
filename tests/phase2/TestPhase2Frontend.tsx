import React, { useState } from 'react';
import { Button } from '@ai-tutor/ui';

interface TopicAnalysisResult {
  status: string;
  recommendation?: {
    chunk_size: string;
    target_duration: number;
    estimated_chunks_needed: number;
    reasoning: string;
    complexity_factors: string[];
    confidence: number;
  };
  chunk_configs?: any[];
  error?: string;
}

interface ChunkResult {
  chunk_id: string;
  chunk_number: number;
  timeline_events: any[];
  chunk_summary: string;
  generation_time: number;
  token_count: number;
  status: string;
}

interface ChunkedGenerationResult {
  topic: string;
  total_chunks: number;
  chunks: ChunkResult[];
  success: boolean;
  error?: string;
}

interface GenerationStats {
  status: string;
  total_chunks_generated?: number;
  success_rate?: number;
  average_generation_time?: number;
  error?: string;
}

export default function TestPhase2() {
  const [topic, setTopic] = useState('Photosynthesis in plants');
  const [difficulty, setDifficulty] = useState('beginner');
  const [contentType, setContentType] = useState('process');
  const [targetDuration, setTargetDuration] = useState(90);
  
  const [analysisResult, setAnalysisResult] = useState<TopicAnalysisResult | null>(null);
  const [chunkedResult, setChunkedResult] = useState<ChunkedGenerationResult | null>(null);
  const [statsResult, setStatsResult] = useState<GenerationStats | null>(null);
  
  const [loading, setLoading] = useState<string | null>(null);

  const analyzeTopicComplexity = async () => {
    setLoading('analysis');
    try {
      const response = await fetch('/api/lesson/analyze-chunking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          difficulty_level: difficulty,
          content_type: contentType,
          target_duration: targetDuration,
          user_id: 'test_user'
        })
      });
      
      const result = await response.json();
      setAnalysisResult(result);
    } catch (error) {
      console.error('Analysis failed:', error);
      setAnalysisResult({ status: 'error', error: 'Analysis failed' });
    } finally {
      setLoading(null);
    }
  };

  const generateChunkedLesson = async () => {
    setLoading('generation');
    try {
      const response = await fetch('/api/lesson/chunked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          difficulty_level: difficulty,
          content_type: contentType,
          target_duration: targetDuration,
          user_id: 'test_user'
        })
      });
      
      const result = await response.json();
      setChunkedResult(result);
    } catch (error) {
      console.error('Generation failed:', error);
      setChunkedResult({ 
        topic, 
        total_chunks: 0, 
        chunks: [], 
        success: false, 
        error: 'Generation failed' 
      });
    } finally {
      setLoading(null);
    }
  };

  const getGenerationStats = async () => {
    setLoading('stats');
    try {
      const response = await fetch('/api/lesson/generation-stats');
      const result = await response.json();
      setStatsResult(result);
    } catch (error) {
      console.error('Stats failed:', error);
      setStatsResult({ status: 'error', error: 'Failed to get stats' });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h1 className="text-2xl font-bold text-blue-900 mb-2">
          🧪 Phase 2 Features Testing
        </h1>
        <p className="text-blue-700">
          Test the newly implemented chunked content generation and analysis features.
        </p>
      </div>

      {/* Configuration Panel */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">📝 Configuration</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Topic
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter educational topic..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Difficulty Level
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content Type
            </label>
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="definition">Definition</option>
              <option value="process">Process</option>
              <option value="comparison">Comparison</option>
              <option value="example">Example</option>
              <option value="list">List</option>
              <option value="concept_map">Concept Map</option>
              <option value="formula">Formula</option>
              <option value="story">Story</option>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="30"
              max="300"
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">🚀 Actions</h2>
        
        <div className="flex flex-wrap gap-4">
          <Button
            onClick={analyzeTopicComplexity}
            disabled={loading === 'analysis'}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading === 'analysis' ? 'Analyzing...' : '🔍 Analyze Topic Complexity'}
          </Button>
          
          <Button
            onClick={generateChunkedLesson}
            disabled={loading === 'generation'}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading === 'generation' ? 'Generating...' : '⚡ Generate Chunked Lesson'}
          </Button>
          
          <Button
            onClick={getGenerationStats}
            disabled={loading === 'stats'}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading === 'stats' ? 'Loading...' : '📊 Get Generation Stats'}
          </Button>
        </div>
      </div>

      {/* Results Panels */}
      {analysisResult && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">🔍 Topic Analysis Results</h2>
          
          {analysisResult.status === 'success' && analysisResult.recommendation ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-purple-800">Recommended Chunk Size</h3>
                  <p className="text-2xl font-bold text-purple-600">
                    {analysisResult.recommendation.chunk_size}
                  </p>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-800">Estimated Chunks</h3>
                  <p className="text-2xl font-bold text-blue-600">
                    {analysisResult.recommendation.estimated_chunks_needed}
                  </p>
                </div>
                
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-green-800">Confidence</h3>
                  <p className="text-2xl font-bold text-green-600">
                    {(analysisResult.recommendation.confidence * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">Reasoning</h3>
                <p className="text-gray-700">{analysisResult.recommendation.reasoning}</p>
              </div>
              
              {analysisResult.recommendation.complexity_factors.length > 0 && (
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-yellow-800 mb-2">Complexity Factors</h3>
                  <div className="flex flex-wrap gap-2">
                    {analysisResult.recommendation.complexity_factors.map((factor, index) => (
                      <span key={index} className="bg-yellow-200 text-yellow-800 px-2 py-1 rounded text-sm">
                        {factor}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-red-700">
                Analysis failed: {analysisResult.error || 'Unknown error'}
              </p>
            </div>
          )}
        </div>
      )}

      {chunkedResult && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">⚡ Chunked Generation Results</h2>
          
          {chunkedResult.success ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-green-800">Total Chunks Generated</h3>
                  <p className="text-2xl font-bold text-green-600">
                    {chunkedResult.total_chunks}
                  </p>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-800">Total Timeline Events</h3>
                  <p className="text-2xl font-bold text-blue-600">
                    {chunkedResult.chunks.reduce((sum, chunk) => sum + chunk.timeline_events.length, 0)}
                  </p>
                </div>
              </div>
              
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-800">Generated Chunks</h3>
                {chunkedResult.chunks.map((chunk, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-gray-800">
                        Chunk {chunk.chunk_number}
                      </h4>
                      <div className="text-sm text-gray-600">
                        {chunk.generation_time.toFixed(2)}s • {chunk.token_count} tokens
                      </div>
                    </div>
                    
                    <p className="text-gray-700 mb-2">{chunk.chunk_summary}</p>
                    
                    <div className="text-sm text-gray-600">
                      {chunk.timeline_events.length} timeline events
                    </div>
                    
                    {chunk.timeline_events.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                          View Timeline Events
                        </summary>
                        <div className="mt-2 space-y-1">
                          {chunk.timeline_events.map((event, eventIndex) => (
                            <div key={eventIndex} className="bg-gray-50 p-2 rounded text-sm">
                              <div className="font-medium">
                                {event.event_type} ({event.duration}s)
                              </div>
                              <div className="text-gray-600">
                                {event.content.substring(0, 100)}...
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-red-700">
                Generation failed: {chunkedResult.error || 'Unknown error'}
              </p>
            </div>
          )}
        </div>
      )}

      {statsResult && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">📊 Generation Statistics</h2>
          
          {statsResult.status === 'success' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-800">Total Chunks</h3>
                <p className="text-2xl font-bold text-blue-600">
                  {statsResult.total_chunks_generated || 0}
                </p>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-800">Success Rate</h3>
                <p className="text-2xl font-bold text-green-600">
                  {((statsResult.success_rate || 0) * 100).toFixed(1)}%
                </p>
              </div>
              
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="font-semibold text-purple-800">Avg Generation Time</h3>
                <p className="text-2xl font-bold text-purple-600">
                  {(statsResult.average_generation_time || 0).toFixed(2)}s
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-yellow-50 p-4 rounded-lg">
              <p className="text-yellow-700">
                {statsResult.error || 'No statistics available yet - try generating some content first!'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}