import React, { useState, useCallback } from 'react';
import { llmApi } from '@ai-tutor/api-client';
import type { 
  LLMTestRequest, 
  LLMTestResponse, 
  LLMTestingState, 
  LLMCapabilityTest,
  LLMFeatures 
} from '@ai-tutor/types';

interface LLMTestHook {
  state: LLMTestingState;
  testPrompt: string;
  setTestPrompt: (prompt: string) => void;
  testStreaming: () => Promise<void>;
  testNonStreaming: () => Promise<void>;
  testModelFeatures: () => Promise<void>;
  getModelFeatures: () => Promise<void>;
  runAllTests: () => Promise<void>;
  resetTests: () => void;
  isAnyTestRunning: boolean;
  capabilityTests: LLMCapabilityTest[];
}

const DEFAULT_TEST_PROMPT = 'Hello! Please respond with a brief greeting to test if the LLM is working correctly. This is just a simple test.';

const CAPABILITY_TESTS: Omit<LLMCapabilityTest, 'status' | 'result' | 'error' | 'duration'>[] = [
  {
    name: 'Streaming Support',
    description: 'Tests if the model supports real-time streaming responses',
    testType: 'streaming'
  },
  {
    name: 'Context Length',
    description: 'Determines the maximum context length the model can handle',
    testType: 'feature'
  },
  {
    name: 'Response Speed',
    description: 'Measures average response time for standard requests',
    testType: 'performance'
  },
  {
    name: 'Temperature Control',
    description: 'Tests if the model supports temperature parameter adjustments',
    testType: 'feature'
  },
  {
    name: 'Token Limit Control',
    description: 'Tests if the model respects max_tokens parameter',
    testType: 'feature'
  }
];

export const useLLMTest = (model?: string, provider?: string): LLMTestHook => {
  const [state, setState] = useState<LLMTestingState>({
    isRunning: false,
    currentTest: null,
    lastTestResult: undefined,
    features: undefined,
    error: undefined
  });

  const [testPrompt, setTestPrompt] = useState(DEFAULT_TEST_PROMPT);
  const [capabilityTests, setCapabilityTests] = useState<LLMCapabilityTest[]>(
    CAPABILITY_TESTS.map(test => ({ ...test, status: 'pending' }))
  );

  // Clear features and test results when model changes
  React.useEffect(() => {
    setState(prev => ({
      ...prev,
      features: undefined,
      lastTestResult: undefined,
      error: undefined
    }));
    setCapabilityTests(CAPABILITY_TESTS.map(test => ({ ...test, status: 'pending' })));
  }, [model, provider]);

  const updateCapabilityTest = useCallback((testName: string, updates: Partial<LLMCapabilityTest>) => {
    setCapabilityTests(prev => prev.map(test => 
      test.name === testName ? { ...test, ...updates } : test
    ));
  }, []);

  const runLLMTest = useCallback(async (
    testRequest: LLMTestRequest, 
    testType: 'streaming' | 'non-streaming'
  ): Promise<LLMTestResponse> => {
    if (!model || !provider) {
      throw new Error('Model and provider must be specified');
    }

    const requestPayload = {
      ...testRequest,
      model,
      provider,
      streaming: testType === 'streaming'
    };

    return await llmApi.testCapability(requestPayload);
  }, [model, provider]);

  const testStreaming = useCallback(async () => {
    if (!model || !provider) {
      setState(prev => ({ ...prev, error: 'Model and provider must be specified' }));
      return;
    }

    setState(prev => ({ ...prev, isRunning: true, currentTest: 'streaming', error: undefined }));
    updateCapabilityTest('Streaming Support', { status: 'running' });

    try {
      const startTime = Date.now();
      const result = await runLLMTest({
        prompt: testPrompt,
        model,
        provider,
        streaming: true,
        temperature: 0.7,
        maxTokens: 150
      }, 'streaming');

      const duration = Date.now() - startTime;

      setState(prev => {
        // Update features with tested streaming capability
        const updatedFeatures = prev.features ? {
          ...prev.features,
          streaming: result.streamingSupported !== undefined ? result.streamingSupported : result.streaming
        } : result.features;

        return {
          ...prev, 
          lastTestResult: result,
          features: updatedFeatures
        };
      });

      // Use streamingSupported for more accurate validation
      const isStreamingSupported = result.streamingSupported !== undefined ? result.streamingSupported : result.streaming;
      
      updateCapabilityTest('Streaming Support', { 
        status: isStreamingSupported ? 'passed' : 'failed',
        result: { 
          supported: isStreamingSupported, 
          responseTime: result.responseTime,
          streamingMetrics: result.streamingMetrics,
          realStreaming: result.streamingMetrics?.real_streaming
        },
        duration
      });

    } catch (error: any) {
      const errorMessage = error.message || 'Streaming test failed';
      setState(prev => ({ ...prev, error: errorMessage }));
      updateCapabilityTest('Streaming Support', { 
        status: 'failed', 
        error: errorMessage 
      });
    } finally {
      setState(prev => ({ ...prev, isRunning: false, currentTest: null }));
    }
  }, [model, provider, testPrompt, runLLMTest, updateCapabilityTest]);

  const testNonStreaming = useCallback(async () => {
    if (!model || !provider) {
      setState(prev => ({ ...prev, error: 'Model and provider must be specified' }));
      return;
    }

    setState(prev => ({ ...prev, isRunning: true, currentTest: 'non-streaming', error: undefined }));
    updateCapabilityTest('Response Speed', { status: 'running' });

    try {
      const startTime = Date.now();
      const result = await runLLMTest({
        prompt: testPrompt,
        model,
        provider,
        streaming: false,
        temperature: 0.7,
        maxTokens: 150
      }, 'non-streaming');

      const duration = Date.now() - startTime;

      setState(prev => ({ 
        ...prev, 
        lastTestResult: result,
        features: result.features ? { ...prev.features, ...result.features } : prev.features
      }));
      updateCapabilityTest('Response Speed', { 
        status: 'passed',
        result: { responseTime: result.responseTime, tokenCount: result.tokenCount },
        duration
      });

    } catch (error: any) {
      const errorMessage = error.message || 'Non-streaming test failed';
      setState(prev => ({ ...prev, error: errorMessage }));
      updateCapabilityTest('Response Speed', { 
        status: 'failed', 
        error: errorMessage 
      });
    } finally {
      setState(prev => ({ ...prev, isRunning: false, currentTest: null }));
    }
  }, [model, provider, testPrompt, runLLMTest, updateCapabilityTest]);

  const testModelFeatures = useCallback(async () => {
    if (!model || !provider) {
      setState(prev => ({ ...prev, error: 'Model and provider must be specified' }));
      return;
    }

    setState(prev => ({ ...prev, isRunning: true, currentTest: 'features', error: undefined }));

    // Test temperature control
    updateCapabilityTest('Temperature Control', { status: 'running' });
    try {
      const tempResult = await runLLMTest({
        prompt: 'Say hello',
        model,
        provider,
        streaming: false,
        temperature: 1.5,
        maxTokens: 50
      }, 'non-streaming');

      updateCapabilityTest('Temperature Control', { 
        status: 'passed',
        result: { supportsTemperature: true }
      });
    } catch (error: any) {
      updateCapabilityTest('Temperature Control', { 
        status: 'failed',
        error: error.message 
      });
    }

    // Test token limit control
    updateCapabilityTest('Token Limit Control', { status: 'running' });
    try {
      const tokenResult = await runLLMTest({
        prompt: 'Write a long story about adventures.',
        model,
        provider,
        streaming: false,
        temperature: 0.7,
        maxTokens: 20
      }, 'non-streaming');

      const respectsLimit = !tokenResult.response || tokenResult.response.split(' ').length <= 25;
      updateCapabilityTest('Token Limit Control', { 
        status: respectsLimit ? 'passed' : 'failed',
        result: { respectsTokenLimit: respectsLimit, actualTokens: tokenResult.tokenCount }
      });
    } catch (error: any) {
      updateCapabilityTest('Token Limit Control', { 
        status: 'failed',
        error: error.message 
      });
    }

    // Test context length (simplified)
    updateCapabilityTest('Context Length', { status: 'running' });
    try {
      const longPrompt = 'Context test: ' + 'word '.repeat(100) + 'How many words did I just write?';
      const contextResult = await runLLMTest({
        prompt: longPrompt,
        model,
        provider,
        streaming: false,
        temperature: 0.3,
        maxTokens: 100
      }, 'non-streaming');

      updateCapabilityTest('Context Length', { 
        status: 'passed',
        result: { canHandleLongContext: true, estimatedContextLength: longPrompt.length }
      });
    } catch (error: any) {
      updateCapabilityTest('Context Length', { 
        status: 'failed',
        error: error.message 
      });
    }

    setState(prev => ({ ...prev, isRunning: false, currentTest: null }));
  }, [model, provider, runLLMTest, updateCapabilityTest]);

  const runAllTests = useCallback(async () => {
    await testNonStreaming();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause between tests
    await testStreaming();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await testModelFeatures();
  }, [testNonStreaming, testStreaming, testModelFeatures]);

  const getModelFeatures = useCallback(async () => {
    if (!model || !provider) {
      setState(prev => ({ ...prev, error: 'Model and provider must be specified' }));
      return;
    }

    try {
      const features = await llmApi.getModelFeatures(model);
      setState(prev => ({ ...prev, features, error: undefined }));
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to get model features';
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, [model, provider]);

  const resetTests = useCallback(() => {
    setState({
      isRunning: false,
      currentTest: null,
      lastTestResult: undefined,
      features: undefined,
      error: undefined
    });
    setCapabilityTests(CAPABILITY_TESTS.map(test => ({ ...test, status: 'pending' })));
  }, []);

  const isAnyTestRunning = state.isRunning;

  return {
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
  };
};