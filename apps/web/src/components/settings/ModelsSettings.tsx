import React, { useState, useEffect } from "react";
import type { LLMSettings, AvailableModels } from "@ai-tutor/types";
import { useLLMTest } from "../../hooks/useLLMTest";
import { ModelConfiguration } from "./ModelConfiguration";
import { GenerationParameters } from "./GenerationParameters";
import { ModelTesting } from "./ModelTesting";

interface ModelsSettingsProps {
  data?: LLMSettings;
  availableModels?: AvailableModels;
  onChange: (data: Partial<LLMSettings>) => void;
  onRefreshModels?: () => void;
}

const ModelsSettingsComponent: React.FC<ModelsSettingsProps> = ({
  data,
  availableModels,
  onChange,
  onRefreshModels
}) => {
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  const ollamaModels = availableModels?.ollama || [];
  
  // Initialize LLM testing hook with current model
  const {
    state,
    testPrompt,
    setTestPrompt,
    testStreaming,
    testNonStreaming,
    resetTests,
    isAnyTestRunning,
    capabilityTests
  } = useLLMTest(data?.model, "ollama");

  // Auto-select first model if no model is selected and models are available
  useEffect(() => {
    if (ollamaModels.length > 0 && (!data?.model || !ollamaModels.includes(data.model))) {
      onChange({ model: ollamaModels[0] });
    }
  }, [ollamaModels, data?.model, onChange]);

  return (
    <div className="space-y-6">
      <ModelConfiguration
        data={data}
        availableModels={availableModels}
        onChange={onChange}
        onRefreshModels={onRefreshModels}
        isLoadingModels={isLoadingModels}
      />

      <GenerationParameters
        data={data}
        onChange={onChange}
      />

      <ModelTesting
        modelName={data?.model}
        state={state}
        testPrompt={testPrompt}
        setTestPrompt={setTestPrompt}
        testStreaming={testStreaming}
        testNonStreaming={testNonStreaming}
        resetTests={resetTests}
        isAnyTestRunning={isAnyTestRunning}
        capabilityTests={capabilityTests}
      />
    </div>
  );
};

export const ModelsSettings = React.memo(ModelsSettingsComponent);