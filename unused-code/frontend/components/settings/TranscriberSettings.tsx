import React, { useState } from "react";
import { Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Input } from "@ai-tutor/ui";
import type { STTSettings } from "@ai-tutor/types";

interface TranscriberSettingsProps {
  data?: STTSettings;
  onChange: (data: Partial<STTSettings>) => void;
}

const TranscriberSettingsComponent: React.FC<TranscriberSettingsProps> = ({ data, onChange }) => {
  const [selectedProvider, setSelectedProvider] = useState(data?.provider || "browser");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const providers = [
    { value: "browser", label: "Browser (Built-in)" },
    { value: "whisper", label: "Whisper" },
    { value: "deepgram", label: "Deepgram" },
  ];

  const whisperModels = ["whisper-1", "whisper-large-v2", "whisper-large-v3"];
  const deepgramModels = ["nova-2", "nova", "enhanced", "base"];
  
  const browserLanguages = ["en-US", "es-ES", "fr-FR", "de-DE", "it-IT", "pt-BR"];
  const whisperLanguages = ["en", "es", "fr", "de", "it", "pt", "zh", "ja", "ko", "ru", "ar"];
  const deepgramLanguages = ["en", "es", "fr", "de", "it", "pt", "zh", "ja", "ko"];

  React.useEffect(() => {
    const loadModelsAndLanguages = async () => {
      setIsLoadingModels(true);
      
      if (selectedProvider === "browser") {
        setAvailableModels(["Browser STT"]);
        setAvailableLanguages(browserLanguages);
      } else if (selectedProvider === "whisper") {
        setAvailableModels(whisperModels);
        setAvailableLanguages(whisperLanguages);
      } else if (selectedProvider === "deepgram") {
        setAvailableModels(deepgramModels);
        setAvailableLanguages(deepgramLanguages);
      }
      
      setIsLoadingModels(false);
    };

    loadModelsAndLanguages();
  }, [selectedProvider]);

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    onChange({ provider, language: "" });
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Transcriber Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <label className="block text-sm font-medium mb-2">Model</label>
            <Select
              value={data?.provider === selectedProvider ? (data as STTSettings & { model?: string })?.model || "" : ""}
              onValueChange={(value) => onChange({ model: value } as Partial<STTSettings>)}
              disabled={isLoadingModels || availableModels.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={model} value={model}>{model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoadingModels && (
              <p className="text-xs text-muted-foreground mt-1">
                Loading models...
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Language</label>
            <Select
              value={data?.language || ""}
              onValueChange={(value) => onChange({ language: value })}
              disabled={availableLanguages.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {availableLanguages.map((lang) => (
                  <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="continuous"
              checked={data?.continuous || false}
              onChange={(e) => onChange({ continuous: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="continuous" className="text-sm font-medium">
              Continuous Recognition
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="interimResults"
              checked={data?.interimResults || true}
              onChange={(e) => onChange({ interimResults: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="interimResults" className="text-sm font-medium">
              Show Interim Results
            </label>
          </div>
        </div>
      </Card>
    </div>
  );
};

export const TranscriberSettings = React.memo(TranscriberSettingsComponent);