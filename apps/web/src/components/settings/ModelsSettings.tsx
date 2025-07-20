import React, { useState, useEffect } from "react";
import { Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, Button } from "@ai-tutor/ui";
import type { LLMSettings, AvailableModels, LLMCapabilityTest, StreamingMetrics } from "@ai-tutor/types";
import { useLLMTest } from "../../hooks/useLLMTest";

interface ModelsSettingsProps {
  data?: LLMSettings;
  availableModels?: AvailableModels;
  onChange: (data: Partial<LLMSettings>) => void;
  onRefreshModels?: () => void;
}

const ModelsSettingsComponent: React.FC<ModelsSettingsProps> = ({ data, availableModels, onChange, onRefreshModels }) => {
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  const ollamaModels = availableModels?.ollama || [];
  
  // Initialize LLM testing hook with current model
  const {
    state,
    testPrompt,
    setTestPrompt,
    testStreaming,
    testNonStreaming, 
    testModelFeatures,
    getModelFeatures,
    runAllTests,
    resetTests,
    isAnyTestRunning,
    capabilityTests
  } = useLLMTest(data?.model, "ollama");

  // Auto-select first model if no model is selected and models are available
  React.useEffect(() => {
    if (ollamaModels.length > 0 && (!data?.model || !ollamaModels.includes(data.model))) {
      onChange({ model: ollamaModels[0] });
    }
  }, [ollamaModels, data?.model, onChange]);


  // Helper function to get streaming quality display
  const getStreamingQuality = (metrics?: StreamingMetrics) => {
    if (!metrics) return { icon: '⏳', text: 'Not Tested', color: 'text-muted-foreground' };
    
    if (!metrics.real_streaming) {
      return { icon: '❌', text: 'Not Streaming', color: 'text-destructive' };
    }
    
    const quality = metrics.content_quality?.quality || 'fair';
    switch (quality) {
      case 'good':
        return { icon: '✅', text: 'Excellent', color: 'text-emerald-600' };
      case 'fair':
        return { icon: '⚠️', text: 'Good', color: 'text-amber-600' };
      case 'poor':
        return { icon: '❌', text: 'Poor', color: 'text-destructive' };
      default:
        return { icon: '⏳', text: 'Unknown', color: 'text-muted-foreground' };
    }
  };

  // Helper function to format streaming metrics for display
  const formatStreamingMetrics = (metrics?: StreamingMetrics) => {
    if (!metrics) return null;
    
    return {
      firstTokenLatency: `${((metrics.first_token_latency || 0) * 1000).toFixed(0)}ms`,
      tokensPerSecond: `${(metrics.tokens_per_second || 0).toFixed(1)} tokens/s`,
      chunkCount: metrics.chunk_count || 0,
      avgChunkDelay: `${((metrics.average_chunk_delay || 0) * 1000).toFixed(0)}ms`,
      contentQuality: metrics.content_quality?.quality || 'unknown'
    };
  };

  // Helper function to safely format numbers
  const safeNumber = (value: any, defaultValue: number = 0): number => {
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  };

  // Helper function to safely format large numbers
  const formatLargeNumber = (value: any, defaultValue: number = 0): string => {
    const num = safeNumber(value, defaultValue);
    return num.toLocaleString();
  };

  // Calculate dynamic max tokens based on detected context length
  const getMaxTokensLimit = () => {
    if (state.features?.contextLength) {
      // Allow up to 75% of context length for max tokens (leaving room for input)
      return Math.min(Math.floor(state.features.contextLength * 0.75), 32768);
    }
    return 8192; // Default fallback
  };

  const getRecommendedMaxTokens = () => {
    if (state.features?.contextLength) {
      // Recommend 25% of context length as a reasonable default
      return Math.min(Math.floor(state.features.contextLength * 0.25), 4096);
    }
    return 2048; // Default fallback
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Models Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Provider</label>
            <Select value="ollama" onValueChange={() => {}} disabled>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ollama">Ollama (Local)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Currently only Ollama is supported
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Model</label>
            <Select
              value={data?.model || ""}
              onValueChange={(value) => onChange({ model: value })}
              disabled={isLoadingModels || ollamaModels.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={ollamaModels.length === 0 ? "No models available" : "Select model"} />
              </SelectTrigger>
              <SelectContent>
                {ollamaModels.map((model: string) => (
                  <SelectItem key={model} value={model}>{model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoadingModels && (
              <p className="text-xs text-muted-foreground mt-1">
                Loading available models...
              </p>
            )}
            {!isLoadingModels && ollamaModels.length === 0 && (
              <div className="space-y-2 mt-1">
                <p className="text-xs text-destructive">
                  No Ollama models found. Make sure Ollama is running and has models installed.
                </p>
                {onRefreshModels && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefreshModels}
                    className="text-xs h-7"
                  >
                    Check Again
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Generation Parameters</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Temperature: {data?.temperature || 0.7}
            </label>
            <Slider
              value={[data?.temperature || 0.7]}
              onValueChange={(value) => onChange({ temperature: value[0] })}
              max={2}
              min={0}
              step={0.1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Higher values make output more random, lower values more focused
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Max Tokens: {data?.maxTokens || getRecommendedMaxTokens()}
            </label>
            <Slider
              value={[data?.maxTokens || getRecommendedMaxTokens()]}
              onValueChange={(value) => onChange({ maxTokens: value[0] })}
              max={getMaxTokensLimit()}
              min={1}
              step={1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Maximum number of tokens to generate in response
              {state.features?.contextLength && (
                <span className="block mt-1">
                  Context: {formatLargeNumber(state.features.contextLength)} tokens • Max: {formatLargeNumber(getMaxTokensLimit())} tokens
                </span>
              )}
            </p>
          </div>
        </div>
      </Card>

      {/* Model Testing Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Model Testing</h3>
          {!data?.model && (
            <div className="text-sm text-muted-foreground">Select a model to test</div>
          )}
        </div>
        
        {!data?.model ? (
          <div className="text-center py-8 text-muted-foreground">
            <div className="text-4xl mb-2">🔬</div>
            <p>Select a model above to test its capabilities</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Advanced Testing Header */}
            <div className="border-l-4 border-primary pl-4">
              <h4 className="font-semibold text-primary">🔬 Advanced Testing Suite</h4>
              <p className="text-sm text-muted-foreground">Comprehensive analysis with detailed metrics and insights</p>
            </div>
            
            {/* Test Configuration */}
            <div className="p-4 rounded-lg border border-border bg-muted/30">
              <h5 className="font-medium mb-3">Test Configuration</h5>
              <div className="space-y-4">
                <div>
                  <label htmlFor="test-prompt" className="block text-sm font-medium mb-2">
                    Test Prompt
                  </label>
                  <textarea
                    id="test-prompt"
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    disabled={isAnyTestRunning}
                    className="w-full h-20 p-3 border border-border rounded-md resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors bg-background text-foreground placeholder:text-muted-foreground"
                    placeholder="Enter a test prompt to evaluate the model..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Testing model: <strong>{data.model}</strong>
                  </p>
                </div>
                
                {/* Advanced Test Actions */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Button
                    onClick={testStreaming}
                    disabled={isAnyTestRunning}
                    variant="default"
                    size="sm"
                    className="flex flex-col items-center p-3 h-auto"
                  >
                    <span className="text-lg mb-1">🌊</span>
                    <span className="text-xs">{isAnyTestRunning && state.currentTest === 'streaming' ? 'Testing...' : 'Streaming'}</span>
                  </Button>
                  <Button
                    onClick={testNonStreaming}
                    disabled={isAnyTestRunning}
                    variant="outline"
                    size="sm"
                    className="flex flex-col items-center p-3 h-auto"
                  >
                    <span className="text-lg mb-1">⚡</span>
                    <span className="text-xs">{isAnyTestRunning && state.currentTest === 'non-streaming' ? 'Testing...' : 'Response'}</span>
                  </Button>
                  <Button
                    onClick={runAllTests}
                    disabled={isAnyTestRunning}
                    variant="secondary"
                    size="sm"
                    className="flex flex-col items-center p-3 h-auto"
                  >
                    <span className="text-lg mb-1">🔬</span>
                    <span className="text-xs">{isAnyTestRunning ? 'Running...' : 'All Tests'}</span>
                  </Button>
                  <Button
                    onClick={resetTests}
                    disabled={isAnyTestRunning}
                    variant="ghost"
                    size="sm"
                    className="flex flex-col items-center p-3 h-auto"
                  >
                    <span className="text-lg mb-1">🔄</span>
                    <span className="text-xs">Reset</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Test Results Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 rounded-md bg-secondary/20">
                <div className="text-sm font-medium mb-1">Streaming Support</div>
                <div className={`text-lg ${
                  capabilityTests.find(t => t.name === 'Streaming Support')?.status === 'passed' 
                    ? 'text-emerald-600' 
                    : capabilityTests.find(t => t.name === 'Streaming Support')?.status === 'failed'
                    ? 'text-destructive'
                    : capabilityTests.find(t => t.name === 'Streaming Support')?.status === 'running'
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }`}>
                  {capabilityTests.find(t => t.name === 'Streaming Support')?.status === 'passed' && '✅ Supported'}
                  {capabilityTests.find(t => t.name === 'Streaming Support')?.status === 'failed' && '❌ Not Supported'}
                  {capabilityTests.find(t => t.name === 'Streaming Support')?.status === 'running' && '🔄 Testing...'}
                  {capabilityTests.find(t => t.name === 'Streaming Support')?.status === 'pending' && '⏳ Not Tested'}
                </div>
              </div>
              
              <div className="p-3 rounded-md bg-secondary/20">
                <div className="text-sm font-medium mb-1">Response Speed</div>
                <div className={`text-lg ${
                  capabilityTests.find(t => t.name === 'Response Speed')?.status === 'passed' 
                    ? 'text-emerald-600' 
                    : capabilityTests.find(t => t.name === 'Response Speed')?.status === 'running'
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }`}>
                  {capabilityTests.find(t => t.name === 'Response Speed')?.status === 'passed' && 
                    `${capabilityTests.find(t => t.name === 'Response Speed')?.duration?.toFixed(0)}ms`}
                  {capabilityTests.find(t => t.name === 'Response Speed')?.status === 'running' && '🔄 Testing...'}
                  {capabilityTests.find(t => t.name === 'Response Speed')?.status === 'pending' && '⏳ Not Tested'}
                </div>
              </div>
              
              <div className="p-3 rounded-md bg-secondary/20">
                <div className="text-sm font-medium mb-1">Overall Status</div>
                <div className={`text-lg ${
                  capabilityTests.filter(t => t.status === 'passed').length === capabilityTests.length && capabilityTests.length > 0
                    ? 'text-emerald-600'
                    : capabilityTests.some(t => t.status === 'running')
                    ? 'text-primary'
                    : capabilityTests.some(t => t.status === 'failed')
                    ? 'text-amber-600'
                    : 'text-muted-foreground'
                }`}>
                  {capabilityTests.some(t => t.status === 'running') && '🔄 Testing...'}
                  {!capabilityTests.some(t => t.status === 'running') && 
                   capabilityTests.filter(t => t.status === 'passed').length === capabilityTests.length && 
                   capabilityTests.length > 0 && '✅ All Tests Passed'}
                  {!capabilityTests.some(t => t.status === 'running') && 
                   capabilityTests.some(t => t.status === 'failed') && 
                   `⚠️ ${capabilityTests.filter(t => t.status === 'passed').length}/${capabilityTests.length} Passed`}
                  {!capabilityTests.some(t => t.status === 'running') && 
                   !capabilityTests.some(t => t.status === 'passed') && 
                   !capabilityTests.some(t => t.status === 'failed') && '⏳ Ready to Test'}
                </div>
              </div>
            </div>


            {/* Detailed Streaming Metrics */}
            {state.lastTestResult?.streamingMetrics && (
              <div className="space-y-3">
                <h4 className="font-medium">Streaming Performance Analysis</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-background border border-border rounded-md">
                    <h5 className="font-medium mb-3 text-sm">Response Timing</h5>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>First Token Latency:</span>
                        <span className="font-mono">{formatStreamingMetrics(state.lastTestResult.streamingMetrics)?.firstTokenLatency}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Average Chunk Delay:</span>
                        <span className="font-mono">{formatStreamingMetrics(state.lastTestResult.streamingMetrics)?.avgChunkDelay}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Chunks:</span>
                        <span className="font-mono">{state.lastTestResult.streamingMetrics.chunk_count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Streaming Speed:</span>
                        <span className="font-mono">{formatStreamingMetrics(state.lastTestResult.streamingMetrics)?.tokensPerSecond}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-background border border-border rounded-md">
                    <h5 className="font-medium mb-3 text-sm">Quality Assessment</h5>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Real Streaming:</span>
                          <span className={`font-medium ${state.lastTestResult.streamingMetrics.real_streaming ? 'text-emerald-600' : 'text-destructive'}`}>
                            {state.lastTestResult.streamingMetrics.real_streaming ? '✅ Yes' : '❌ No'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Content Quality:</span>
                          <span className={`font-medium ${
                            state.lastTestResult.streamingMetrics.content_quality.quality === 'good' ? 'text-emerald-600' :
                            state.lastTestResult.streamingMetrics.content_quality.quality === 'fair' ? 'text-amber-600' : 'text-destructive'
                          }`}>
                            {state.lastTestResult.streamingMetrics.content_quality.quality.charAt(0).toUpperCase() + 
                             state.lastTestResult.streamingMetrics.content_quality.quality.slice(1)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Final Length:</span>
                          <span className="font-mono">{safeNumber(state.lastTestResult.streamingMetrics.content_quality.final_length)} chars</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Reason:</span>
                          <span className="text-muted-foreground text-xs">
                            {state.lastTestResult.streamingMetrics.content_quality.reason.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Chunk Timing Visualization */}
                  {state.lastTestResult.streamingMetrics.chunk_times.length > 0 && (
                    <div className="p-4 bg-background border border-border rounded-md">
                      <h5 className="font-medium mb-3 text-sm">Chunk Timing Pattern</h5>
                      <div className="flex items-end gap-1 h-16">
                        {state.lastTestResult.streamingMetrics.chunk_times.slice(0, 20).map((time, index) => (
                          <div
                            key={index}
                            className="bg-blue-500 rounded-t min-w-[3px] flex-1"
                            style={{ 
                              height: `${Math.min((time * 1000 / 200) * 100, 100)}%`,
                              opacity: 0.7 + (index / 20) * 0.3
                            }}
                            title={`Chunk ${index + 1}: ${(time * 1000).toFixed(0)}ms`}
                          />
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        Inter-chunk delays (first 20 chunks) • Lower bars = faster streaming
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Last Test Result */}
              {state.lastTestResult && (
                <div className="space-y-3">
                  <h4 className="font-medium">Test Response</h4>
                  <div className="p-4 bg-background border border-border rounded-md">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`font-medium ${state.lastTestResult.success ? 'text-emerald-600' : 'text-destructive'}`}>
                        {state.lastTestResult.success ? '✅ Success' : '❌ Failed'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {state.lastTestResult.responseTime.toFixed(2)}s • {state.lastTestResult.streaming ? 'Streaming' : 'Standard'}
                      </div>
                    </div>
                    
                    {state.lastTestResult.response && (
                      <div className="text-sm bg-secondary/20 p-3 rounded">
                        <div className="font-medium mb-1">Response:</div>
                        <div className="text-muted-foreground">
                          {state.lastTestResult.response.length > 200 
                            ? `${state.lastTestResult.response.substring(0, 200)}...` 
                            : state.lastTestResult.response}
                        </div>
                      </div>
                    )}
                    
                    {state.lastTestResult.error && (
                      <div className="text-sm bg-destructive/10 border border-destructive/20 p-3 rounded">
                        <div className="font-medium text-destructive mb-1">Error:</div>
                        <div className="text-destructive/80">{state.lastTestResult.error}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {state.error && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
                  <div className="font-medium text-destructive mb-1">Error</div>
                  <div className="text-destructive/80">{state.error}</div>
                </div>
              )}
            </div>
          )}
      </Card>
    </div>
  );
};

export const ModelsSettings = React.memo(ModelsSettingsComponent);