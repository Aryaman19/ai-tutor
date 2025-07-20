import React from "react";
import { Card, Button } from "@ai-tutor/ui";
import type { LLMTestingState, LLMTestResponse, LLMCapabilityTest } from "@ai-tutor/types";
import { TestResultsSummary } from "./TestResultsSummary";
import { StreamingMetrics } from "./StreamingMetrics";

interface ModelTestingProps {
  modelName?: string;
  state: LLMTestingState;
  testPrompt: string;
  setTestPrompt: (prompt: string) => void;
  testStreaming: () => void;
  testNonStreaming: () => void;
  resetTests: () => void;
  isAnyTestRunning: boolean;
  capabilityTests: LLMCapabilityTest[];
}

export const ModelTesting: React.FC<ModelTestingProps> = ({
  modelName,
  state,
  testPrompt,
  setTestPrompt,
  testStreaming,
  testNonStreaming,
  resetTests,
  isAnyTestRunning,
  capabilityTests
}) => {
  if (!modelName) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Model Testing</h3>
          <div className="text-sm text-muted-foreground">Select a model to test</div>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <div className="text-4xl mb-2">🔬</div>
          <p>Select a model above to test its capabilities</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Model Testing</h3>
      </div>
      
      <div className="space-y-6">
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
                Testing model: <strong>{modelName}</strong>
              </p>
            </div>
            
            {/* Test Actions */}
            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={testStreaming}
                disabled={isAnyTestRunning}
                variant="default"
                size="sm"
                className="flex items-center gap-2 px-4 py-2"
              >
                <span>🌊</span>
                <span>{isAnyTestRunning && state.currentTest === 'streaming' ? 'Testing...' : 'Test Streaming'}</span>
              </Button>
              <Button
                onClick={testNonStreaming}
                disabled={isAnyTestRunning}
                variant="outline"
                size="sm"
                className="flex items-center gap-2 px-4 py-2"
              >
                <span>⚡</span>
                <span>{isAnyTestRunning && state.currentTest === 'non-streaming' ? 'Testing...' : 'Test Response'}</span>
              </Button>
              <Button
                onClick={resetTests}
                disabled={isAnyTestRunning}
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 px-4 py-2"
              >
                <span>🔄</span>
                <span>Reset</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Test Results Summary */}
        <TestResultsSummary capabilityTests={capabilityTests} />

        {/* Detailed Streaming Metrics */}
        {state.lastTestResult?.streamingMetrics && (
          <StreamingMetrics metrics={state.lastTestResult.streamingMetrics} />
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
    </Card>
  );
};