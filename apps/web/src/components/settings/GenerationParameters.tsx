import React from "react";
import { Card, Slider } from "@ai-tutor/ui";
import type { LLMSettings } from "@ai-tutor/types";

interface GenerationParametersProps {
  data?: LLMSettings;
  onChange: (data: Partial<LLMSettings>) => void;
  contextLength?: number;
}

export const GenerationParameters: React.FC<GenerationParametersProps> = ({
  data,
  onChange,
  contextLength
}) => {
  const getMaxTokensLimit = () => {
    if (contextLength) {
      return Math.min(Math.floor(contextLength * 0.75), 32768);
    }
    return 8192;
  };

  const getRecommendedMaxTokens = () => {
    if (contextLength) {
      return Math.min(Math.floor(contextLength * 0.25), 4096);
    }
    return 2048;
  };

  const formatLargeNumber = (value: number): string => {
    return value.toLocaleString();
  };

  return (
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
            {contextLength && (
              <span className="block mt-1">
                Context: {formatLargeNumber(contextLength)} tokens • Max: {formatLargeNumber(getMaxTokensLimit())} tokens
              </span>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
};