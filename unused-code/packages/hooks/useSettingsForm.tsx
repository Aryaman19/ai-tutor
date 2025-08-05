import { useState, useEffect } from 'react';
import type { UserSettings } from '@ai-tutor/types';
import { useSettings } from './useSettings';

interface UseSettingsFormOptions {
  onSave?: (settings: Partial<UserSettings>) => void;
  onReset?: () => void;
  autoSave?: boolean;
  debounceMs?: number;
}

export function useSettingsForm(options: UseSettingsFormOptions = {}) {
  const { settings, updateSettings, resetSettings, isLoading, isUpdating } = useSettings();
  const [formData, setFormData] = useState<Partial<UserSettings>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Sync form data with settings
  useEffect(() => {
    if (settings) {
      setFormData(settings);
      setIsDirty(false);
    }
  }, [settings]);

  // Update form data for specific sections
  const updateFormData = <T extends keyof UserSettings>(
    section: T,
    data: Partial<UserSettings[T]>
  ) => {
    setFormData(prev => {
      const currentSection = prev[section] || {};
      const updatedSection = { ...currentSection, ...data };
      const newData = {
        ...prev,
        [section]: updatedSection
      };
      
      setIsDirty(true);
      return newData;
    });
  };

  // Save form data
  const handleSave = async () => {
    if (options.onSave) {
      options.onSave(formData);
    } else {
      await updateSettings(formData);
    }
    setIsDirty(false);
  };

  // Reset form data
  const handleReset = () => {
    if (options.onReset) {
      options.onReset();
    } else {
      resetSettings();
    }
    setIsDirty(false);
  };

  // Validate form data
  const validateForm = () => {
    const errors: Record<string, string> = {};

    // Basic validation
    if (formData.llm?.temperature !== undefined && (formData.llm.temperature < 0 || formData.llm.temperature > 2)) {
      errors.temperature = 'Temperature must be between 0 and 2';
    }

    if (formData.llm?.maxTokens !== undefined && (formData.llm.maxTokens < 1 || formData.llm.maxTokens > 8192)) {
      errors.maxTokens = 'Max tokens must be between 1 and 8192';
    }

    if (formData.tts?.speed !== undefined && (formData.tts.speed < 0.25 || formData.tts.speed > 4)) {
      errors.speed = 'Speed must be between 0.25 and 4';
    }

    if (formData.tts?.volume !== undefined && (formData.tts.volume < 0 || formData.tts.volume > 1)) {
      errors.volume = 'Volume must be between 0 and 1';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  };

  // Check if form has unsaved changes
  const hasUnsavedChanges = () => {
    return isDirty;
  };

  return {
    formData,
    setFormData,
    updateFormData,
    handleSave,
    handleReset,
    validateForm,
    hasUnsavedChanges,
    isDirty,
    isLoading,
    isUpdating
  };
}