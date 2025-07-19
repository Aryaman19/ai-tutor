import React, { useState, useEffect } from "react";
import { Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, Button } from "@ai-tutor/ui";
import type { LLMSettings, AvailableModels } from "@ai-tutor/types";

interface ModelsSettingsProps {
  data?: LLMSettings;
  availableModels?: AvailableModels;
  onChange: (data: Partial<LLMSettings>) => void;
  onRefreshModels?: () => void;
}

const ModelsSettingsComponent: React.FC<ModelsSettingsProps> = ({ data, availableModels, onChange, onRefreshModels }) => {
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  const ollamaModels = availableModels?.ollama || [];

  // Auto-select first model if no model is selected and models are available
  React.useEffect(() => {
    if (ollamaModels.length > 0 && (!data?.model || !ollamaModels.includes(data.model))) {
      onChange({ model: ollamaModels[0] });
    }
  }, [ollamaModels, data?.model, onChange]);

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
                <p className="text-xs text-red-500">
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
              Max Tokens: {data?.maxTokens || 2048}
            </label>
            <Slider
              value={[data?.maxTokens || 2048]}
              onValueChange={(value) => onChange({ maxTokens: value[0] })}
              max={8192}
              min={1}
              step={1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Maximum number of tokens to generate in response
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export const ModelsSettings = React.memo(ModelsSettingsComponent);