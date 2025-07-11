import React, { useState } from "react";
import { Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, Input } from "@ai-tutor/ui";
import type { TTSSettings } from "@ai-tutor/types";

interface VoiceSettingsProps {
  data?: TTSSettings;
  browserVoices?: string[];
  onChange: (data: Partial<TTSSettings>) => void;
}

const VoiceSettingsComponent: React.FC<VoiceSettingsProps> = ({ data, browserVoices, onChange }) => {
  const [selectedProvider, setSelectedProvider] = useState(data?.provider || "browser");
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  const providers = [
    { value: "browser", label: "Browser (Built-in)" },
    { value: "elevenlabs", label: "ElevenLabs" },
    { value: "openai", label: "OpenAI" },
  ];

  const elevenLabsVoices = ["Rachel", "Domi", "Bella", "Antoni", "Elli", "Josh"];
  const openAIVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

  React.useEffect(() => {
    const loadVoices = async () => {
      setIsLoadingVoices(true);
      
      if (selectedProvider === "browser") {
        const voices = browserVoices || ["Default"];
        setAvailableVoices(voices);
      } else if (selectedProvider === "elevenlabs") {
        setAvailableVoices(elevenLabsVoices);
      } else if (selectedProvider === "openai") {
        setAvailableVoices(openAIVoices);
      }
      
      setIsLoadingVoices(false);
    };

    loadVoices();
  }, [selectedProvider, browserVoices]);

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    onChange({ provider, voice: "" });
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Voice Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Provider</label>
            <Select
              value={selectedProvider}
              onValueChange={handleProviderChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Voice</label>
            <Select
              value={data?.voice || ""}
              onValueChange={(value) => onChange({ voice: value })}
              disabled={isLoadingVoices || availableVoices.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent>
                {availableVoices.map((voice) => (
                  <SelectItem key={voice} value={voice}>{voice}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoadingVoices && (
              <p className="text-xs text-muted-foreground mt-1">
                Loading voices...
              </p>
            )}
          </div>
        </div>
        
        {selectedProvider !== "browser" && (
          <div className="mt-4">
            <label className="block text-sm font-medium mb-2">API Key</label>
            <Input
              type="password"
              value={data?.apiKey || ""}
              onChange={(e) => onChange({ apiKey: e.target.value })}
              placeholder={`Enter your ${selectedProvider} API key`}
            />
          </div>
        )}
        
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Speed: {data?.speed || 1.0}
            </label>
            <Slider
              value={[data?.speed || 1.0]}
              onValueChange={(value) => onChange({ speed: value[0] })}
              max={4}
              min={0.25}
              step={0.25}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Adjust speaking speed
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Volume: {data?.volume || 1.0}
            </label>
            <Slider
              value={[data?.volume || 1.0]}
              onValueChange={(value) => onChange({ volume: value[0] })}
              max={1}
              min={0}
              step={0.1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Adjust volume level
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export const VoiceSettings = React.memo(VoiceSettingsComponent);