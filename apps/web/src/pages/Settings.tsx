import React, { useState } from "react";
import { 
  useSettings, 
  useAvailableModels, 
  useSupportedLanguages, 
  useBrowserVoices 
} from "@ai-tutor/hooks";
import { 
  Card, 
  Button, 
  Input, 
  Select, 
  Slider, 
  ScrollArea 
} from "@ai-tutor/ui";
import { 
  SettingsIcon, 
  UserIcon, 
  MicIcon, 
  VolumeIcon, 
  BrainIcon, 
  GlobeIcon, 
  PaletteIcon, 
  BookIcon, 
  BellIcon,
  SaveIcon,
  RotateCcwIcon,
} from "lucide-react";
import { cn } from "@ai-tutor/utils";
import type { 
  UserSettings, 
  LLMSettings, 
  TTSSettings, 
  STTSettings, 
  LanguageSettings, 
  AppearanceSettings, 
  LessonSettings, 
  NotificationSettings, 
  UserProfile 
} from "@ai-tutor/types";

const Settings: React.FC = () => {
  const { settings, updateSettings, resetSettings, isLoading, isUpdating } = useSettings();
  const { data: availableModels } = useAvailableModels();
  const { data: supportedLanguages } = useSupportedLanguages();
  const { data: browserVoices } = useBrowserVoices();

  const [activeTab, setActiveTab] = useState<string>("profile");
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
    { id: "profile", label: "Profile", icon: UserIcon },
    { id: "llm", label: "AI Models", icon: BrainIcon },
    { id: "tts", label: "Text-to-Speech", icon: VolumeIcon },
    { id: "stt", label: "Speech-to-Text", icon: MicIcon },
    { id: "language", label: "Languages", icon: GlobeIcon },
    { id: "appearance", label: "Appearance", icon: PaletteIcon },
    { id: "lessons", label: "Learning", icon: BookIcon },
    { id: "notifications", label: "Notifications", icon: BellIcon },
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
        <ScrollArea className="flex-1 p-6">
          {activeTab === "profile" && (
            <ProfileSettings
              data={formData.profile}
              onChange={(data) => updateFormData("profile", data)}
            />
          )}

          {activeTab === "llm" && (
            <LLMSettings
              data={formData.llm}
              availableModels={availableModels}
              onChange={(data) => updateFormData("llm", data)}
            />
          )}

          {activeTab === "tts" && (
            <TTSSettings
              data={formData.tts}
              browserVoices={browserVoices}
              onChange={(data) => updateFormData("tts", data)}
            />
          )}

          {activeTab === "stt" && (
            <STTSettings
              data={formData.stt}
              supportedLanguages={supportedLanguages}
              onChange={(data) => updateFormData("stt", data)}
            />
          )}

          {activeTab === "language" && (
            <LanguageSettings
              data={formData.language}
              supportedLanguages={supportedLanguages}
              onChange={(data) => updateFormData("language", data)}
            />
          )}

          {activeTab === "appearance" && (
            <AppearanceSettings
              data={formData.appearance}
              onChange={(data) => updateFormData("appearance", data)}
            />
          )}

          {activeTab === "lessons" && (
            <LessonSettings
              data={formData.lessons}
              onChange={(data) => updateFormData("lessons", data)}
            />
          )}

          {activeTab === "notifications" && (
            <NotificationSettings
              data={formData.notifications}
              onChange={(data) => updateFormData("notifications", data)}
            />
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

// Profile Settings Component
const ProfileSettings: React.FC<{
  data?: UserProfile;
  onChange: (data: Partial<UserProfile>) => void;
}> = ({ data, onChange }) => {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Full Name</label>
            <Input
              value={data?.name || ""}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Enter your full name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <Input
              type="email"
              value={data?.email || ""}
              onChange={(e) => onChange({ email: e.target.value })}
              placeholder="Enter your email"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium mb-2">Bio</label>
          <Input
            value={data?.bio || ""}
            onChange={(e) => onChange({ bio: e.target.value })}
            placeholder="Tell us about yourself"
          />
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Learning Goals</h3>
        <p className="text-sm text-muted-foreground mb-4">
          What would you like to achieve with your learning?
        </p>
        <div className="space-y-2">
          {(data?.learningGoals || []).map((goal, index) => (
            <div key={index} className="flex items-center space-x-2">
              <Input
                value={goal}
                onChange={(e) => {
                  const newGoals = [...(data?.learningGoals || [])];
                  newGoals[index] = e.target.value;
                  onChange({ learningGoals: newGoals });
                }}
                placeholder="Enter a learning goal"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newGoals = (data?.learningGoals || []).filter((_, i) => i !== index);
                  onChange({ learningGoals: newGoals });
                }}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newGoals = [...(data?.learningGoals || []), ""];
              onChange({ learningGoals: newGoals });
            }}
          >
            Add Goal
          </Button>
        </div>
      </Card>
    </div>
  );
};

// LLM Settings Component
const LLMSettings: React.FC<{
  data?: LLMSettings;
  availableModels?: any;
  onChange: (data: Partial<LLMSettings>) => void;
}> = ({ data, availableModels, onChange }) => {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">AI Model Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Provider</label>
            <Select
              value={data?.provider || "ollama"}
              onValueChange={(value) => onChange({ provider: value })}
            >
              <option value="ollama">Ollama (Local)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Model</label>
            <Select
              value={data?.model || "gemma2:3b"}
              onValueChange={(value) => onChange({ model: value })}
            >
              {availableModels?.ollama?.map((model: string) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </Select>
          </div>
        </div>
        
        {data?.provider !== "ollama" && (
          <div className="mt-4">
            <label className="block text-sm font-medium mb-2">API Key</label>
            <Input
              type="password"
              value={data?.apiKey || ""}
              onChange={(e) => onChange({ apiKey: e.target.value })}
              placeholder="Enter your API key"
            />
          </div>
        )}
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
          </div>
        </div>
      </Card>
    </div>
  );
};

// TTS Settings Component
const TTSSettings: React.FC<{
  data?: TTSSettings;
  browserVoices?: string[];
  onChange: (data: Partial<TTSSettings>) => void;
}> = ({ data, browserVoices, onChange }) => {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Text-to-Speech Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Provider</label>
            <Select
              value={data?.provider || "browser"}
              onValueChange={(value) => onChange({ provider: value })}
            >
              <option value="browser">Browser (Built-in)</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="openai">OpenAI</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Voice</label>
            <Select
              value={data?.voice || "default"}
              onValueChange={(value) => onChange({ voice: value })}
            >
              {browserVoices?.map((voice) => (
                <option key={voice} value={voice}>{voice}</option>
              ))}
            </Select>
          </div>
        </div>
        
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
          </div>
        </div>
      </Card>
    </div>
  );
};

// STT Settings Component
const STTSettings: React.FC<{
  data?: STTSettings;
  supportedLanguages?: string[];
  onChange: (data: Partial<STTSettings>) => void;
}> = ({ data, supportedLanguages, onChange }) => {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Speech-to-Text Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Provider</label>
            <Select
              value={data?.provider || "browser"}
              onValueChange={(value) => onChange({ provider: value })}
            >
              <option value="browser">Browser (Built-in)</option>
              <option value="whisper">Whisper</option>
              <option value="deepgram">Deepgram</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Language</label>
            <Select
              value={data?.language || "en-US"}
              onValueChange={(value) => onChange({ language: value })}
            >
              {supportedLanguages?.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </Select>
          </div>
        </div>
        
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

// Language Settings Component
const LanguageSettings: React.FC<{
  data?: LanguageSettings;
  supportedLanguages?: string[];
  onChange: (data: Partial<LanguageSettings>) => void;
}> = ({ data, supportedLanguages, onChange }) => {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Language Preferences</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Primary Language</label>
            <Select
              value={data?.primary || "en"}
              onValueChange={(value) => onChange({ primary: value })}
            >
              {supportedLanguages?.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Secondary Language</label>
            <Select
              value={data?.secondary || ""}
              onValueChange={(value) => onChange({ secondary: value })}
            >
              <option value="">None</option>
              {supportedLanguages?.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </Select>
          </div>
        </div>
        
        <div className="mt-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="autoDetect"
              checked={data?.autoDetect || true}
              onChange={(e) => onChange({ autoDetect: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="autoDetect" className="text-sm font-medium">
              Auto-detect Language
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
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Appearance & Display</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Theme</label>
            <Select
              value={data?.theme || "system"}
              onValueChange={(value) => onChange({ theme: value })}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Font Size</label>
            <Select
              value={data?.fontSize || "medium"}
              onValueChange={(value) => onChange({ fontSize: value })}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </Select>
          </div>
        </div>
        
        <div className="mt-4 space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="compactMode"
              checked={data?.compactMode || false}
              onChange={(e) => onChange({ compactMode: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="compactMode" className="text-sm font-medium">
              Compact Mode
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="animations"
              checked={data?.animations !== false}
              onChange={(e) => onChange({ animations: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="animations" className="text-sm font-medium">
              Enable Animations
            </label>
          </div>
        </div>
      </Card>
    </div>
  );
};

// Lesson Settings Component
const LessonSettings: React.FC<{
  data?: LessonSettings;
  onChange: (data: Partial<LessonSettings>) => void;
}> = ({ data, onChange }) => {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Learning Preferences</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Default Difficulty</label>
            <Select
              value={data?.defaultDifficulty || "intermediate"}
              onValueChange={(value) => onChange({ defaultDifficulty: value })}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Session Duration: {data?.sessionDuration || 30} minutes
            </label>
            <Slider
              value={[data?.sessionDuration || 30]}
              onValueChange={(value) => onChange({ sessionDuration: value[0] })}
              max={180}
              min={5}
              step={5}
              className="w-full"
            />
          </div>
        </div>
        
        <div className="mt-4 space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="breakReminders"
              checked={data?.breakReminders !== false}
              onChange={(e) => onChange({ breakReminders: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="breakReminders" className="text-sm font-medium">
              Break Reminders
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="progressTracking"
              checked={data?.progressTracking !== false}
              onChange={(e) => onChange({ progressTracking: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="progressTracking" className="text-sm font-medium">
              Progress Tracking
            </label>
          </div>
        </div>
      </Card>
    </div>
  );
};

// Notification Settings Component
const NotificationSettings: React.FC<{
  data?: NotificationSettings;
  onChange: (data: Partial<NotificationSettings>) => void;
}> = ({ data, onChange }) => {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Notification Preferences</h3>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="emailNotifications"
              checked={data?.emailNotifications !== false}
              onChange={(e) => onChange({ emailNotifications: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="emailNotifications" className="text-sm font-medium">
              Email Notifications
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="pushNotifications"
              checked={data?.pushNotifications !== false}
              onChange={(e) => onChange({ pushNotifications: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="pushNotifications" className="text-sm font-medium">
              Push Notifications
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="lessonReminders"
              checked={data?.lessonReminders !== false}
              onChange={(e) => onChange({ lessonReminders: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="lessonReminders" className="text-sm font-medium">
              Lesson Reminders
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="progressUpdates"
              checked={data?.progressUpdates !== false}
              onChange={(e) => onChange({ progressUpdates: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="progressUpdates" className="text-sm font-medium">
              Progress Updates
            </label>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Settings;