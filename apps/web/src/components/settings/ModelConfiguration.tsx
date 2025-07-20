import React from "react";
import { Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button } from "@ai-tutor/ui";
import type { LLMSettings, AvailableModels } from "@ai-tutor/types";

interface ModelConfigurationProps {
  data?: LLMSettings;
  availableModels?: AvailableModels;
  onChange: (data: Partial<LLMSettings>) => void;
  onRefreshModels?: () => void;
  isLoadingModels?: boolean;
}

export const ModelConfiguration: React.FC<ModelConfigurationProps> = ({
  data,
  availableModels,
  onChange,
  onRefreshModels,
  isLoadingModels = false
}) => {
  const ollamaModels = availableModels?.ollama || [];

  return (
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
  );
};