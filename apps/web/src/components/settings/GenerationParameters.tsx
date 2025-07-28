import React from "react";
import { Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ai-tutor/ui";
import type { LLMSettings } from "@ai-tutor/types";

interface GenerationParametersProps {
  data?: LLMSettings;
  onChange: (data: Partial<LLMSettings>) => void;
}

const timingOptions = [
  { value: 'short', label: 'Short (3-5 minutes)', duration: '3-5 minutes' },
  { value: 'medium', label: 'Medium (5-10 minutes)', duration: '5-10 minutes' },
  { value: 'long', label: 'Long (15-20 minutes)', duration: '15-20 minutes' }
] as const;

const difficultyOptions = [
  { value: 'easy', label: 'Easy', description: 'Basic concepts and introductory content' },
  { value: 'intermediate', label: 'Intermediate', description: 'Moderate complexity and depth' },
  { value: 'advanced', label: 'Advanced', description: 'Complex topics and detailed analysis' }
] as const;

export const GenerationParameters: React.FC<GenerationParametersProps> = ({
  data,
  onChange
}) => {
  const selectedTiming = data?.timing || 'short';
  const selectedDifficulty = data?.difficulty || 'intermediate';

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Content Settings</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Video Timing
          </label>
          <Select
            value={selectedTiming}
            onValueChange={(value: 'short' | 'medium' | 'long') => onChange({ timing: value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select timing" />
            </SelectTrigger>
            <SelectContent>
              {timingOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div>
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.duration}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Controls the length of generated educational content
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">
            Difficulty Level
          </label>
          <Select
            value={selectedDifficulty}
            onValueChange={(value: 'easy' | 'intermediate' | 'advanced') => onChange({ difficulty: value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select difficulty" />
            </SelectTrigger>
            <SelectContent>
              {difficultyOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div>
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Determines the complexity and depth of content explanation
          </p>
        </div>
      </div>
    </Card>
  );
};