import React, { useState } from "react";
import { 
  useSettings, 
  useAvailableModels, 
  useBrowserVoices,
  useTheme 
} from "@ai-tutor/hooks";
import { 
  Card, 
  Button, 
  Input, 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider, 
  ScrollArea 
} from "@ai-tutor/ui";
import { 
  SettingsIcon, 
  MicIcon, 
  VolumeIcon, 
  BrainIcon, 
  PaletteIcon, 
  SaveIcon,
  RotateCcwIcon,
  ServerIcon
} from "lucide-react";
import { cn } from "@ai-tutor/utils";
import { HealthChecker } from "@/components/HealthChecker";
import type { 
  UserSettings, 
  LLMSettings, 
  TTSSettings, 
  STTSettings, 
  AppearanceSettings
} from "@ai-tutor/types";

const Settings: React.FC = () => {
  const { settings, updateSettings, resetSettings, isLoading, isUpdating } = useSettings();
  const { data: availableModels } = useAvailableModels();
  const { data: browserVoices } = useBrowserVoices();

  const [activeTab, setActiveTab] = useState<string>("llm");
  const [formData, setFormData] = useState<Partial<UserSettings>>({});

  React.useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings(formData);
  };

  const handleReset = () => {
    resetSettings();
  };

  const updateFormData = <T extends keyof UserSettings>(
    section: T, 
    data: Partial<UserSettings[T]>
  ) => {
    setFormData(prev => {
      const currentSection = prev[section] || {};
      const updatedSection = { ...currentSection, ...data };
      return {
        ...prev,
        [section]: updatedSection
      };
    });
  };

  const tabs = [
    { id: "llm", label: "Models", icon: BrainIcon },
    { id: "tts", label: "Voice", icon: VolumeIcon },
    { id: "stt", label: "Transcriber", icon: MicIcon },
    { id: "appearance", label: "Appearance", icon: PaletteIcon },
    { id: "system", label: "System Status", icon: ServerIcon },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r bg-card">
        <div className="p-6">
          <div className="flex items-center space-x-2 mb-6">
            <SettingsIcon className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
          
          <nav className="space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors",
                    activeTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b bg-card px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {tabs.find(tab => tab.id === activeTab)?.label}
            </h2>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={isUpdating}
              >
                <RotateCcwIcon className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button
                onClick={handleSave}
                disabled={isUpdating}
                size="sm"
              >
                <SaveIcon className="h-4 w-4 mr-2" />
                {isUpdating ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full p-6">
          {activeTab === "llm" && (
            <ModelsSettings
              data={formData.llm}
              availableModels={availableModels}
              onChange={(data) => updateFormData("llm", data)}
            />
          )}

          {activeTab === "tts" && (
            <VoiceSettings
              data={formData.tts}
              browserVoices={browserVoices}
              onChange={(data) => updateFormData("tts", data)}
            />
          )}

          {activeTab === "stt" && (
            <TranscriberSettings
              data={formData.stt}
              onChange={(data) => updateFormData("stt", data)}
            />
          )}

          {activeTab === "appearance" && (
            <AppearanceSettings
              data={formData.appearance}
              onChange={(data) => updateFormData("appearance", data)}
            />
          )}

          {activeTab === "system" && (
            <SystemStatusSettings />
          )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

// Models Settings Component
const ModelsSettings: React.FC<{
  data?: LLMSettings;
  availableModels?: any;
  onChange: (data: Partial<LLMSettings>) => void;
}> = ({ data, availableModels, onChange }) => {
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  const ollamaModels = availableModels?.ollama || [
    "gemma2:3b",
    "llama3:8b", 
    "mistral:7b",
    "codellama:7b",
    "phi3:3.8b"
  ];

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
              value={data?.model || "gemma2:3b"}
              onValueChange={(value) => onChange({ model: value })}
              disabled={isLoadingModels}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
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

// Voice Settings Component
const VoiceSettings: React.FC<{
  data?: TTSSettings;
  browserVoices?: string[];
  onChange: (data: Partial<TTSSettings>) => void;
}> = ({ data, browserVoices, onChange }) => {
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
        // Use browser voices
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
    onChange({ provider, voice: "" }); // Reset voice when provider changes
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

// Transcriber Settings Component
const TranscriberSettings: React.FC<{
  data?: STTSettings;
  onChange: (data: Partial<STTSettings>) => void;
}> = ({ data, onChange }) => {
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
    onChange({ provider, language: "" }); // Reset language when provider changes
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
              value={data?.provider === selectedProvider ? (data as any)?.model || "" : ""}
              onValueChange={(value) => onChange({ model: value } as any)}
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

// Appearance Settings Component
const AppearanceSettings: React.FC<{
  data?: AppearanceSettings;
  onChange: (data: Partial<AppearanceSettings>) => void;
}> = ({ data, onChange }) => {
  const { theme, setTheme, colorScheme, setColorScheme } = useTheme();
  
  const themeOptions = [
    { value: "light", label: "Light", description: "Clean and bright interface" },
    { value: "dark", label: "Dark", description: "Easy on the eyes" },
    { value: "system", label: "System", description: "Matches your device settings" },
  ];

  const colorOptions = [
    { value: "green", label: "Green", description: "Fresh and natural", color: "bg-green-500" },
    { value: "blue", label: "Blue", description: "Calm and professional", color: "bg-blue-500" },
    { value: "purple", label: "Purple", description: "Creative and modern", color: "bg-purple-500" },
    { value: "orange", label: "Orange", description: "Warm and energetic", color: "bg-orange-500" },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Appearance & Display</h3>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Theme</label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger>
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                {themeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center space-x-2">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        - {option.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Color Scheme</label>
            <Select value={colorScheme} onValueChange={setColorScheme}>
              <SelectTrigger>
                <SelectValue placeholder="Select color scheme" />
              </SelectTrigger>
              <SelectContent>
                {colorOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center space-x-2">
                      <div className={cn("w-4 h-4 rounded-full", option.color)}></div>
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        - {option.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>
    </div>
  );
};

// System Status Settings Component
const SystemStatusSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">System Health Monitor</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Monitor the health and status of all AI Tutor services and connections.
          </p>
        </div>
        <HealthChecker />
      </div>
    </div>
  );
};

export default Settings;