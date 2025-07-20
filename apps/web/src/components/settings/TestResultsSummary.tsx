import React from "react";
import type { LLMCapabilityTest } from "@ai-tutor/types";

interface TestResultsSummaryProps {
  capabilityTests: LLMCapabilityTest[];
}

export const TestResultsSummary: React.FC<TestResultsSummaryProps> = ({
  capabilityTests
}) => {
  const getTestStatus = (testName: string) => {
    return capabilityTests.find(t => t.name === testName);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'passed':
        return 'text-emerald-600';
      case 'failed':
        return 'text-destructive';
      case 'running':
        return 'text-primary';
      default:
        return 'text-muted-foreground';
    }
  };

  const streamingTest = getTestStatus('Streaming Support');
  const speedTest = getTestStatus('Response Speed');

  return (
    <div className="space-y-3">
      <h4 className="font-medium">Test Results</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-3 rounded-md bg-secondary/20">
          <div className="text-sm font-medium mb-1">Streaming Support</div>
          <div className={`text-lg ${getStatusColor(streamingTest?.status)}`}>
            {streamingTest?.status === 'passed' && '✅ Supported'}
            {streamingTest?.status === 'failed' && '❌ Not Supported'}
            {streamingTest?.status === 'running' && '🔄 Testing...'}
            {streamingTest?.status === 'pending' && '⏳ Not Tested'}
          </div>
        </div>
        
        <div className="p-3 rounded-md bg-secondary/20">
          <div className="text-sm font-medium mb-1">Response Speed</div>
          <div className={`text-lg ${getStatusColor(speedTest?.status)}`}>
            {speedTest?.status === 'passed' && 
              `${speedTest?.duration?.toFixed(0)}ms`}
            {speedTest?.status === 'running' && '🔄 Testing...'}
            {speedTest?.status === 'pending' && '⏳ Not Tested'}
          </div>
        </div>
      </div>
    </div>
  );
};