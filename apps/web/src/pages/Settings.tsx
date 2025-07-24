import React, { useState } from "react";
import { 
  useSettings, 
  useAvailableModels, 
  useBrowserVoices
} from "@ai-tutor/hooks";
import type { 
  UserSettings
} from "@ai-tutor/types";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { ModelsSettings } from "@/components/settings/ModelsSettings";
import { VoiceSettings } from "@/components/settings/VoiceSettings";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { SystemStatusSettings } from "@/components/settings/SystemStatusSettings";

const Settings: React.FC = () => {
  const { settings, updateSettings, resetSettings, isLoading, isUpdating } = useSettings();
  const { data: availableModels, refetchModels } = useAvailableModels();
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

  const renderContent = () => {
    switch (activeTab) {
      case "llm":
        return (
          <ModelsSettings
            data={formData.llm}
            availableModels={availableModels}
            onChange={(data) => updateFormData("llm", data)}
            onRefreshModels={refetchModels}
          />
        );
      case "tts":
        return (
          <VoiceSettings
            data={formData.tts}
            browserVoices={browserVoices}
            onChange={(data) => updateFormData("tts", data)}
          />
        );
      case "appearance":
        return (
          <AppearanceSettings
            data={formData.appearance}
            onChange={(data) => updateFormData("appearance", data)}
          />
        );
      case "system":
        return <SystemStatusSettings />;
      default:
        return null;
    }
  };

  return (
    <SettingsLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onSave={handleSave}
      onReset={handleReset}
      isUpdating={isUpdating}
    >
      {renderContent()}
    </SettingsLayout>
  );
};


export default Settings;