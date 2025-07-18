import React, { useState } from "react";
import { Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, Input, Button } from "@ai-tutor/ui";
import type { TTSSettings } from "@ai-tutor/types";
import { useTTSVoices } from "@ai-tutor/hooks";
import { VoiceDownloadManager } from "../voice/VoiceDownloadManager";
import { useQueryClient } from "@tanstack/react-query";

interface VoiceSettingsProps {
  data?: TTSSettings;
  browserVoices?: string[];
  onChange: (data: Partial<TTSSettings>) => void;
}

const VoiceSettingsComponent: React.FC<VoiceSettingsProps> = ({ data, browserVoices, onChange }) => {
  const [selectedProvider, setSelectedProvider] = useState(data?.provider || "browser");
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isVoiceManagerOpen, setIsVoiceManagerOpen] = useState(false);
  const [voiceRefreshTrigger, setVoiceRefreshTrigger] = useState(0);

  // Get Piper voices from API
  const { data: piperVoices, isLoading: isPiperVoicesLoading, refetch: refetchVoices } = useTTSVoices();
  const queryClient = useQueryClient();

  const providers = [
    { value: "browser", label: "Browser (Built-in)" },
    { value: "piper", label: "Piper (Offline)" },
  ];

  React.useEffect(() => {
    const loadVoices = async () => {
      setIsLoadingVoices(true);
      
      if (selectedProvider === "browser") {
        const voices = browserVoices || ["Default"];
        setAvailableVoices(voices);
      } else if (selectedProvider === "piper") {
        const voices = piperVoices?.map(voice => voice.name) || ["Lessac (Medium Quality)"];
        setAvailableVoices(voices);
      }
      
      setIsLoadingVoices(false);
    };

    loadVoices();
  }, [selectedProvider, browserVoices, piperVoices, voiceRefreshTrigger]);

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    onChange({ provider, voice: "" });
  };

  const handleVoiceDownloaded = (voiceId: string) => {
    // Invalidate and refetch TTS voices query cache
    queryClient.invalidateQueries({ queryKey: ["tts-voices"] });
    refetchVoices();
    // Refresh voice list after download
    setVoiceRefreshTrigger(prev => prev + 1);
  };

  const handleVoiceDeleted = (voiceId: string) => {
    // Invalidate and refetch TTS voices query cache
    queryClient.invalidateQueries({ queryKey: ["tts-voices"] });
    refetchVoices();
    // Refresh voice list after deletion
    setVoiceRefreshTrigger(prev => prev + 1);
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
              disabled={isLoadingVoices || availableVoices.length === 0 || (selectedProvider === "piper" && isPiperVoicesLoading)}
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
            {(isLoadingVoices || (selectedProvider === "piper" && isPiperVoicesLoading)) && (
              <p className="text-xs text-muted-foreground mt-1">
                Loading voices...
              </p>
            )}
          </div>
        </div>
        
        
        {selectedProvider === "piper" && (
          <div className="mt-4">
            <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <h4 className="font-medium text-foreground">Piper TTS - Offline Voice Engine</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    High-quality offline text-to-speech that runs locally on your device. 
                    No internet required and your privacy is protected.
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="shrink-0"
                  onClick={() => setIsVoiceManagerOpen(true)}
                >
                  Browse Voices
                </Button>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <span>📥</span>
                  <span>Download additional voices to expand your library</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Voice Manager Modal */}
        {isVoiceManagerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background border border-border rounded-lg shadow-xl max-w-4xl max-h-[80vh] w-full mx-4 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-xl font-semibold text-foreground">Voice Manager</h2>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setIsVoiceManagerOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ×
                </Button>
              </div>
              <div className="p-4">
                <VoiceDownloadManager 
                  onVoiceDownloaded={handleVoiceDownloaded}
                  onVoiceDeleted={handleVoiceDeleted}
                  className="max-h-[60vh] overflow-y-auto"
                />
              </div>
            </div>
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