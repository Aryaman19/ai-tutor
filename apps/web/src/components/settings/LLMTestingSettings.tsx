import React, { useState, useEffect } from "react";
import { Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button, Slider } from "@ai-tutor/ui";
import type { LLMSettings, AvailableModels, LLMCapabilityTest } from "@ai-tutor/types";
import { useLLMTest } from "../../hooks/useLLMTest";

interface LLMTestingSettingsProps {
  data?: LLMSettings;
  availableModels?: AvailableModels;
}

const LLMTestingSettingsComponent: React.FC<LLMTestingSettingsProps> = ({ data, availableModels }) => {
  const [selectedModel, setSelectedModel] = useState(data?.model || "");
  const [showFeatureDetails, setShowFeatureDetails] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  
  const ollamaModels = availableModels?.ollama || [];
  
  // Initialize with first available model if none selected
  useEffect(() => {
    if (ollamaModels.length > 0 && !selectedModel) {
      setSelectedModel(ollamaModels[0]);
    }
  }, [ollamaModels, selectedModel]);

  const {
    state,
    testPrompt,
    setTestPrompt,
    testStreaming,
    testNonStreaming, 
    testModelFeatures,
    runAllTests,
    resetTests,
    isAnyTestRunning,
    capabilityTests
  } = useLLMTest(selectedModel, "ollama");

  const getTestStatusIcon = (test: LLMCapabilityTest) => {
    switch (test.status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'passed': return '✅';
      case 'failed': return '❌';
      default: return '⏳';
    }
  };

  const getTestStatusColor = (test: LLMCapabilityTest) => {
    switch (test.status) {
      case 'passed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'running': return 'text-blue-600';
      default: return 'text-muted-foreground';
    }
  };

  const getOverallStatus = () => {
    const passedTests = capabilityTests.filter(t => t.status === 'passed').length;
    const failedTests = capabilityTests.filter(t => t.status === 'failed').length;
    const runningTests = capabilityTests.filter(t => t.status === 'running').length;
    
    if (runningTests > 0) return { status: 'running', text: 'Testing in progress...', color: 'text-blue-600' };
    if (failedTests > 0) return { status: 'partial', text: `${passedTests}/${capabilityTests.length} tests passed`, color: 'text-yellow-600' };
    if (passedTests === capabilityTests.length && passedTests > 0) return { status: 'passed', text: 'All tests passed', color: 'text-green-600' };
    return { status: 'pending', text: 'Ready to test', color: 'text-muted-foreground' };
  };

  const overallStatus = getOverallStatus();

  return (
    <div className="space-y-6">
      {/* Model Selection */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">LLM Testing</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Test Model</label>
            <Select
              value={selectedModel}
              onValueChange={setSelectedModel}
              disabled={isAnyTestRunning}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select model to test" />
              </SelectTrigger>
              <SelectContent>
                {ollamaModels.map((model: string) => (
                  <SelectItem key={model} value={model}>{model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ollamaModels.length === 0 && (
              <p className="text-xs text-red-500 mt-1">
                No models available. Make sure Ollama is running with models installed.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Overall Status</label>
            <div className={`p-3 rounded-md bg-secondary/20 ${overallStatus.color}`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {overallStatus.status === 'running' ? '🔄' : 
                   overallStatus.status === 'passed' ? '✅' : 
                   overallStatus.status === 'partial' ? '⚠️' : '⏳'}
                </span>
                <span className="font-medium">{overallStatus.text}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Test Configuration */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Test Configuration</h3>
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
              className="w-full h-24 p-3 border border-border rounded-md resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors bg-background text-foreground placeholder:text-muted-foreground"
              placeholder="Enter a test prompt to evaluate the model..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              This prompt will be used to test streaming, response quality, and other capabilities
            </p>
          </div>
        </div>
      </Card>

      {/* Capability Tests */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Capability Tests</h3>
        
        {/* Quick Actions */}
        <div className="flex gap-3 mb-6">
          <Button
            onClick={runAllTests}
            disabled={isAnyTestRunning || !selectedModel || ollamaModels.length === 0}
            variant="default"
          >
            {isAnyTestRunning ? 'Testing...' : 'Run All Tests'}
          </Button>
          <Button
            onClick={testStreaming}
            disabled={isAnyTestRunning || !selectedModel}
            variant="outline"
          >
            Test Streaming
          </Button>
          <Button
            onClick={testNonStreaming}
            disabled={isAnyTestRunning || !selectedModel}
            variant="outline"
          >
            Test Response
          </Button>
          <Button
            onClick={resetTests}
            disabled={isAnyTestRunning}
            variant="ghost"
          >
            Reset
          </Button>
        </div>

        {/* Individual Test Results */}
        <div className="space-y-3">
          {capabilityTests.map((test, index) => (
            <div key={index} className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div className="flex items-center gap-3 flex-1">
                <span className="text-xl">{getTestStatusIcon(test)}</span>
                <div className="flex-1">
                  <h4 className={`font-medium ${getTestStatusColor(test)}`}>
                    {test.name}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {test.description}
                  </p>
                  {test.error && (
                    <p className="text-xs text-red-500 mt-1">
                      Error: {test.error}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-medium ${getTestStatusColor(test)}`}>
                  {test.status.charAt(0).toUpperCase() + test.status.slice(1)}
                </div>
                {test.duration !== undefined && (
                  <div className="text-xs text-muted-foreground">
                    {test.duration.toFixed(0)}ms
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Feature Detection Results */}
      {state.features && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Detected Features</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFeatureDetails(!showFeatureDetails)}
            >
              {showFeatureDetails ? 'Hide Details' : 'Show Details'}
            </Button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-md bg-secondary/20">
              <div className="text-sm font-medium">Streaming</div>
              <div className={`text-lg ${state.features.streaming ? 'text-green-600' : 'text-red-600'}`}>
                {state.features.streaming ? '✅ Supported' : '❌ Not Supported'}
              </div>
            </div>
            <div className="p-3 rounded-md bg-secondary/20">
              <div className="text-sm font-medium">Context Length</div>
              <div className="text-lg text-foreground">
                {state.features.contextLength.toLocaleString()} tokens
              </div>
            </div>
            <div className="p-3 rounded-md bg-secondary/20">
              <div className="text-sm font-medium">Code Generation</div>
              <div className={`text-lg ${state.features.codeGeneration ? 'text-green-600' : 'text-muted-foreground'}`}>
                {state.features.codeGeneration ? '✅ Good' : '⚪ Basic'}
              </div>
            </div>
          </div>

          {showFeatureDetails && (
            <div className="mt-4 p-4 bg-background border border-border rounded-md">
              <h4 className="font-medium mb-3">Advanced Features</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex justify-between">
                  <span>Vision Support:</span>
                  <span className={state.features.visionSupport ? 'text-green-600' : 'text-muted-foreground'}>
                    {state.features.visionSupport ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Multimodal:</span>
                  <span className={state.features.multimodal ? 'text-green-600' : 'text-muted-foreground'}>
                    {state.features.multimodal ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Function Calling:</span>
                  <span className={state.features.functionCalling ? 'text-green-600' : 'text-muted-foreground'}>
                    {state.features.functionCalling ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Temperature Control:</span>
                  <span className={state.features.temperature ? 'text-green-600' : 'text-muted-foreground'}>
                    {state.features.temperature ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Max Tokens:</span>
                  <span className="text-foreground">{state.features.maxTokens}</span>
                </div>
                <div className="flex justify-between">
                  <span>Top-P Control:</span>
                  <span className={state.features.topP ? 'text-green-600' : 'text-muted-foreground'}>
                    {state.features.topP ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Last Test Result */}
      {state.lastTestResult && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Last Test Result</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDebugInfo(!showDebugInfo)}
            >
              {showDebugInfo ? 'Hide Debug' : 'Show Debug'}
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="p-3 rounded-md bg-secondary/20">
              <div className="text-sm font-medium">Status</div>
              <div className={`text-lg ${state.lastTestResult.success ? 'text-green-600' : 'text-red-600'}`}>
                {state.lastTestResult.success ? '✅ Success' : '❌ Failed'}
              </div>
            </div>
            <div className="p-3 rounded-md bg-secondary/20">
              <div className="text-sm font-medium">Response Time</div>
              <div className="text-lg text-foreground">
                {state.lastTestResult.responseTime.toFixed(2)}s
              </div>
            </div>
            <div className="p-3 rounded-md bg-secondary/20">
              <div className="text-sm font-medium">Mode</div>
              <div className="text-lg text-foreground">
                {state.lastTestResult.streaming ? 'Streaming' : 'Standard'}
              </div>
            </div>
          </div>

          {state.lastTestResult.response && (
            <div className="p-4 bg-background border border-border rounded-md">
              <h4 className="font-medium mb-2">Response</h4>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {state.lastTestResult.response}
              </p>
            </div>
          )}

          {state.lastTestResult.error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <h4 className="font-medium text-red-800 mb-2">Error</h4>
              <p className="text-sm text-red-700">
                {state.lastTestResult.error}
              </p>
            </div>
          )}

          {showDebugInfo && (
            <div className="mt-4 p-4 bg-background border border-border rounded-md">
              <h4 className="font-medium mb-2">Debug Information</h4>
              <pre className="text-xs text-muted-foreground overflow-auto max-h-40">
                {JSON.stringify(state.lastTestResult, null, 2)}
              </pre>
            </div>
          )}
        </Card>
      )}

      {state.error && (
        <Card className="p-6 border-red-200 bg-red-50">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
          <p className="text-red-700">{state.error}</p>
        </Card>
      )}
    </div>
  );
};

export const LLMTestingSettings = React.memo(LLMTestingSettingsComponent);