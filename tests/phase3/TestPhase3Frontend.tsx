import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@ai-tutor/ui';

// Phase 3 testing interfaces
interface TimelineLayoutResult {
  status: string;
  elements?: any[];
  performance?: {
    layoutTime: number;
    elementCount: number;
    cacheSize: number;
  };
  regions?: {
    id: string;
    name: string;
    occupancy: number;
    capacity: number;
  }[];
  error?: string;
}

interface SeekTestResult {
  timestamp: number;
  seekTime: number;
  elementsCount: number;
  success: boolean;
  error?: string;
}

interface CollisionTestResult {
  collisionCount: number;
  resolvedCollisions: number;
  performance: number;
  success: boolean;
}

interface SmartElementResult {
  elementType: string;
  complexity: number;
  templateUsed: string;
  generationTime: number;
  success: boolean;
}

interface IntegrationTestResult {
  testName: string;
  phases: {
    phase1Events: number;
    phase2Chunks: number;
    phase3Elements: number;
  };
  performance: {
    totalTime: number;
    avgSeekTime: number;
    memoryUsage: number;
  };
  success: boolean;
  error?: string;
}

export default function TestPhase3() {
  const [topic, setTopic] = useState('Photosynthesis Process');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [canvasWidth, setCanvasWidth] = useState(1200);
  const [canvasHeight, setCanvasHeight] = useState(800);
  const [layoutMode, setLayoutMode] = useState('responsive');
  
  const [layoutResult, setLayoutResult] = useState<TimelineLayoutResult | null>(null);
  const [seekResults, setSeekResults] = useState<SeekTestResult[]>([]);
  const [collisionResult, setCollisionResult] = useState<CollisionTestResult | null>(null);
  const [smartElementResults, setSmartElementResults] = useState<SmartElementResult[]>([]);
  const [integrationResult, setIntegrationResult] = useState<IntegrationTestResult | null>(null);
  
  const [loading, setLoading] = useState<string | null>(null);
  const [selectedSemanticTypes, setSelectedSemanticTypes] = useState<string[]>(['definition', 'process', 'comparison']);

  const semanticTypeOptions = [
    'definition', 'process', 'comparison', 'example', 
    'list', 'concept_map', 'formula', 'story'
  ];

  // Test 1: Timeline Layout Engine
  const testTimelineLayoutEngine = async () => {
    setLoading('timeline-layout');
    try {
      const response = await fetch('/api/test/timeline-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          difficulty_level: difficulty,
          canvas_size: { width: canvasWidth, height: canvasHeight },
          layout_mode: layoutMode,
          semantic_types: selectedSemanticTypes
        })
      });
      
      const result = await response.json();
      setLayoutResult(result);
    } catch (error) {
      console.error('Timeline layout test failed:', error);
      setLayoutResult({ 
        status: 'error', 
        error: 'Timeline layout test failed' 
      });
    } finally {
      setLoading(null);
    }
  };

  // Test 2: Timeline Seek Performance
  const testTimelineSeek = async () => {
    setLoading('seek-test');
    try {
      const timestamps = [0, 1000, 2500, 5000, 7500, 10000]; // Test different timestamps
      const results: SeekTestResult[] = [];

      for (const timestamp of timestamps) {
        const response = await fetch('/api/test/timeline-seek', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic,
            timestamp,
            canvas_size: { width: canvasWidth, height: canvasHeight }
          })
        });
        
        const result = await response.json();
        results.push({
          timestamp,
          seekTime: result.seek_time || 0,
          elementsCount: result.elements_count || 0,
          success: result.success || false,
          error: result.error
        });
      }

      setSeekResults(results);
    } catch (error) {
      console.error('Timeline seek test failed:', error);
    } finally {
      setLoading(null);
    }
  };

  // Test 3: Collision Detection & Avoidance
  const testCollisionDetection = async () => {
    setLoading('collision-test');
    try {
      const response = await fetch('/api/test/collision-detection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          element_count: 50, // Test with many elements
          canvas_size: { width: canvasWidth, height: canvasHeight },
          enable_avoidance: true
        })
      });
      
      const result = await response.json();
      setCollisionResult({
        collisionCount: result.collision_count || 0,
        resolvedCollisions: result.resolved_collisions || 0,
        performance: result.performance_ms || 0,
        success: result.success || false
      });
    } catch (error) {
      console.error('Collision detection test failed:', error);
      setCollisionResult({
        collisionCount: 0,
        resolvedCollisions: 0,
        performance: 0,
        success: false
      });
    } finally {
      setLoading(null);
    }
  };

  // Test 4: Smart Element Factory
  const testSmartElementFactory = async () => {
    setLoading('smart-elements');
    try {
      const results: SmartElementResult[] = [];

      for (const semanticType of selectedSemanticTypes) {
        const response = await fetch('/api/test/smart-elements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            semantic_type: semanticType,
            complexity: difficulty,
            canvas_size: { width: canvasWidth, height: canvasHeight },
            content: `Test ${semanticType} content for ${topic}`
          })
        });
        
        const result = await response.json();
        results.push({
          elementType: semanticType,
          complexity: result.complexity || 0,
          templateUsed: result.template_used || 'unknown',
          generationTime: result.generation_time || 0,
          success: result.success || false
        });
      }

      setSmartElementResults(results);
    } catch (error) {
      console.error('Smart element factory test failed:', error);
    } finally {
      setLoading(null);
    }
  };

  // Test 5: Full Integration Test (Phase 1 + 2 + 3)
  const testFullIntegration = async () => {
    setLoading('integration-test');
    try {
      const response = await fetch('/api/test/full-timeline-integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          difficulty_level: difficulty,
          target_duration: 60, // 1 minute test lesson
          canvas_size: { width: canvasWidth, height: canvasHeight },
          enable_timeline_layout: true,
          enable_smart_elements: true,
          layout_mode: layoutMode
        })
      });
      
      const result = await response.json();
      setIntegrationResult({
        testName: `Full Integration: ${topic}`,
        phases: {
          phase1Events: result.phase1_events || 0,
          phase2Chunks: result.phase2_chunks || 0,
          phase3Elements: result.phase3_elements || 0
        },
        performance: {
          totalTime: result.total_time || 0,
          avgSeekTime: result.avg_seek_time || 0,
          memoryUsage: result.memory_usage || 0
        },
        success: result.success || false,
        error: result.error
      });
    } catch (error) {
      console.error('Full integration test failed:', error);
      setIntegrationResult({
        testName: `Full Integration: ${topic}`,
        phases: { phase1Events: 0, phase2Chunks: 0, phase3Elements: 0 },
        performance: { totalTime: 0, avgSeekTime: 0, memoryUsage: 0 },
        success: false,
        error: 'Integration test failed'
      });
    } finally {
      setLoading(null);
    }
  };

  const handleSemanticTypeChange = (type: string) => {
    setSelectedSemanticTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h1 className="text-2xl font-bold text-blue-900 mb-2">
          🔬 Phase 3 Timeline Layout Engine Testing
        </h1>
        <p className="text-blue-700">
          Test the new responsive layout regions, collision detection, smart element factory, and full timeline integration.
        </p>
      </div>

      {/* Configuration Panel */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">🔧 Test Configuration</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Topic
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter test topic..."
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
              Layout Mode
            </label>
            <select
              value={layoutMode}
              onChange={(e) => setLayoutMode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="responsive">Responsive</option>
              <option value="fixed">Fixed</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Canvas Width
            </label>
            <input
              type="number"
              value={canvasWidth}
              onChange={(e) => setCanvasWidth(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="800"
              max="2400"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Canvas Height
            </label>
            <input
              type="number"
              value={canvasHeight}
              onChange={(e) => setCanvasHeight(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="600"
              max="1600"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Semantic Types to Test
          </label>
          <div className="flex flex-wrap gap-2">
            {semanticTypeOptions.map((type) => (
              <label key={type} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedSemanticTypes.includes(type)}
                  onChange={() => handleSemanticTypeChange(type)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm capitalize">{type.replace('_', ' ')}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Test Actions */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">🧪 Test Actions</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Button
            onClick={testTimelineLayoutEngine}
            disabled={loading === 'timeline-layout'}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading === 'timeline-layout' ? 'Testing...' : '🎯 Test Layout Engine'}
          </Button>
          
          <Button
            onClick={testTimelineSeek}
            disabled={loading === 'seek-test'}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading === 'seek-test' ? 'Testing...' : '⚡ Test Timeline Seek'}
          </Button>
          
          <Button
            onClick={testCollisionDetection}
            disabled={loading === 'collision-test'}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading === 'collision-test' ? 'Testing...' : '🔍 Test Collision Detection'}
          </Button>
          
          <Button
            onClick={testSmartElementFactory}
            disabled={loading === 'smart-elements'}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {loading === 'smart-elements' ? 'Testing...' : '🎨 Test Smart Elements'}
          </Button>
          
          <Button
            onClick={testFullIntegration}
            disabled={loading === 'integration-test'}
            className="bg-red-600 hover:bg-red-700 md:col-span-2"
          >
            {loading === 'integration-test' ? 'Testing...' : '🚀 Full Integration Test'}
          </Button>
        </div>
      </div>

      {/* Results Panels */}
      
      {/* Timeline Layout Results */}
      {layoutResult && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">🎯 Timeline Layout Engine Results</h2>
          
          {layoutResult.status === 'success' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-800">Elements Generated</h3>
                  <p className="text-2xl font-bold text-blue-600">
                    {layoutResult.elements?.length || 0}
                  </p>
                </div>
                
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-green-800">Layout Time</h3>
                  <p className="text-2xl font-bold text-green-600">
                    {layoutResult.performance?.layoutTime || 0}ms
                  </p>
                </div>
                
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-purple-800">Cache Size</h3>
                  <p className="text-2xl font-bold text-purple-600">
                    {layoutResult.performance?.cacheSize || 0}
                  </p>
                </div>
              </div>
              
              {layoutResult.regions && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-800 mb-2">Region Utilization</h3>
                  <div className="space-y-2">
                    {layoutResult.regions.map((region, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="text-sm">{region.name}</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-32 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{
                                width: `${(region.occupancy / region.capacity) * 100}%`
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-600">
                            {region.occupancy}/{region.capacity}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-red-700">
                Test failed: {layoutResult.error || 'Unknown error'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Timeline Seek Results */}
      {seekResults.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">⚡ Timeline Seek Performance</h2>
          
          <div className="space-y-3">
            {seekResults.map((result, index) => (
              <div key={index} className={`flex justify-between items-center p-3 rounded-lg ${
                result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center space-x-4">
                  <span className="font-medium">
                    {(result.timestamp / 1000).toFixed(1)}s
                  </span>
                  <span className="text-sm text-gray-600">
                    {result.elementsCount} elements
                  </span>
                </div>
                <div className="text-right">
                  <span className={`font-bold ${
                    result.success ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {result.seekTime.toFixed(2)}ms
                  </span>
                  {result.error && (
                    <div className="text-xs text-red-500 mt-1">
                      {result.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 bg-blue-50 p-3 rounded-lg">
            <p className="text-blue-700">
              <strong>Average Seek Time:</strong> {
                (seekResults.reduce((sum, r) => sum + r.seekTime, 0) / seekResults.length).toFixed(2)
              }ms
            </p>
          </div>
        </div>
      )}

      {/* Collision Detection Results */}
      {collisionResult && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">🔍 Collision Detection Results</h2>
          
          {collisionResult.success ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="font-semibold text-yellow-800">Initial Collisions</h3>
                <p className="text-2xl font-bold text-yellow-600">
                  {collisionResult.collisionCount}
                </p>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-800">Resolved</h3>
                <p className="text-2xl font-bold text-green-600">
                  {collisionResult.resolvedCollisions}
                </p>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-800">Resolution Time</h3>
                <p className="text-2xl font-bold text-blue-600">
                  {collisionResult.performance.toFixed(2)}ms
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-red-700">
                Collision detection test failed
              </p>
            </div>
          )}
        </div>
      )}

      {/* Smart Element Factory Results */}
      {smartElementResults.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">🎨 Smart Element Factory Results</h2>
          
          <div className="space-y-3">
            {smartElementResults.map((result, index) => (
              <div key={index} className={`p-4 rounded-lg border ${
                result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold capitalize">
                      {result.elementType.replace('_', ' ')}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Template: {result.templateUsed} | Complexity: {result.complexity}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`font-bold ${
                      result.success ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {result.generationTime.toFixed(2)}ms
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Integration Results */}
      {integrationResult && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">🚀 Full Integration Test Results</h2>
          
          {integrationResult.success ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-800">Phase 1 Events</h3>
                  <p className="text-2xl font-bold text-blue-600">
                    {integrationResult.phases.phase1Events}
                  </p>
                </div>
                
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-green-800">Phase 2 Chunks</h3>
                  <p className="text-2xl font-bold text-green-600">
                    {integrationResult.phases.phase2Chunks}
                  </p>
                </div>
                
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-purple-800">Phase 3 Elements</h3>
                  <p className="text-2xl font-bold text-purple-600">
                    {integrationResult.phases.phase3Elements}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-orange-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-orange-800">Total Processing Time</h3>
                  <p className="text-2xl font-bold text-orange-600">
                    {(integrationResult.performance.totalTime / 1000).toFixed(2)}s
                  </p>
                </div>
                
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-indigo-800">Avg Seek Time</h3>
                  <p className="text-2xl font-bold text-indigo-600">
                    {integrationResult.performance.avgSeekTime.toFixed(2)}ms
                  </p>
                </div>
                
                <div className="bg-pink-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-pink-800">Memory Usage</h3>
                  <p className="text-2xl font-bold text-pink-600">
                    {(integrationResult.performance.memoryUsage / (1024 * 1024)).toFixed(2)}MB
                  </p>
                </div>
              </div>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-800 mb-2">✅ Integration Success</h3>
                <p className="text-green-700">
                  All phases integrated successfully! The timeline layout engine is working with 
                  chunked content generation and semantic analysis.
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
    </div>
  );
}