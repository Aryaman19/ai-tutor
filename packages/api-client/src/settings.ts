import { apiClient } from "./client";
import type { 
  UserSettings, 
  SettingsUpdateRequest, 
  SettingsValidationResult, 
  AvailableModels 
} from "@ai-tutor/types";

export const settingsApi = {
  /**
   * Get user settings
   */
  async getUserSettings(userId: string = "default"): Promise<UserSettings> {
    const response = await apiClient.get<UserSettings>(`/api/settings/`, {
      params: { user_id: userId }
    });
    return response.data;
  },

  /**
   * Create new user settings
   */
  async createUserSettings(
    settings: SettingsUpdateRequest, 
    userId: string = "default"
  ): Promise<UserSettings> {
    const response = await apiClient.post<UserSettings>(`/api/settings/`, settings, {
      params: { user_id: userId }
    });
    return response.data;
  },

  /**
   * Update user settings
   */
  async updateUserSettings(
    settings: SettingsUpdateRequest, 
    userId: string = "default"
  ): Promise<UserSettings> {
    const response = await apiClient.put<UserSettings>(`/api/settings/`, settings, {
      params: { user_id: userId }
    });
    return response.data;
  },

  /**
   * Update specific settings section
   */
  async updateSettingsSection(
    section: string, 
    sectionData: Record<string, any>, 
    userId: string = "default"
  ): Promise<UserSettings> {
    const response = await apiClient.patch<UserSettings>(`/api/settings/${section}`, sectionData, {
      params: { user_id: userId }
    });
    return response.data;
  },

  /**
   * Delete user settings
   */
  async deleteUserSettings(userId: string = "default"): Promise<{ message: string }> {
    const response = await apiClient.delete<{ message: string }>(`/api/settings/`, {
      params: { user_id: userId }
    });
    return response.data;
  },

  /**
   * Reset settings to default
   */
  async resetUserSettings(userId: string = "default"): Promise<UserSettings> {
    const response = await apiClient.get<UserSettings>(`/api/settings/reset`, {
      params: { user_id: userId }
    });
    return response.data;
  },

  /**
   * Export user settings
   */
  async exportUserSettings(userId: string = "default"): Promise<{
    user_id: string;
    export_date: string;
    settings: UserSettings;
  }> {
    const response = await apiClient.get(`/api/settings/export`, {
      params: { user_id: userId }
    });
    return response.data;
  },

  /**
   * Get available models for all providers
   */
  async getAvailableModels(): Promise<AvailableModels> {
    const response = await apiClient.get<AvailableModels>(`/api/settings/available-models`);
    return response.data;
  },

  /**
   * Get supported languages
   */
  async getSupportedLanguages(): Promise<string[]> {
    const response = await apiClient.get<{ languages: string[] }>(`/api/settings/supported-languages`);
    return response.data.languages;
  },

  /**
   * Validate LLM settings
   */
  async validateLLMSettings(llmSettings: any): Promise<SettingsValidationResult> {
    // This would call a backend validation endpoint
    // For now, return a mock response
    return {
      valid: true,
      errors: [],
      warnings: [],
      providerAvailable: true
    };
  },

  /**
   * Validate TTS settings
   */
  async validateTTSSettings(ttsSettings: any): Promise<SettingsValidationResult> {
    // This would call a backend validation endpoint
    // For now, return a mock response
    return {
      valid: true,
      errors: [],
      warnings: [],
      providerAvailable: true
    };
  },

  /**
   * Validate STT settings
   */
  async validateSTTSettings(sttSettings: any): Promise<SettingsValidationResult> {
    // This would call a backend validation endpoint
    // For now, return a mock response
    return {
      valid: true,
      errors: [],
      warnings: [],
      providerAvailable: true
    };
  },

  /**
   * Get browser voices (client-side only)
   */
  async getBrowserVoices(): Promise<string[]> {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      return new Promise((resolve) => {
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0) {
          resolve(voices.map(voice => voice.name));
        } else {
          // Wait for voices to be loaded
          speechSynthesis.onvoiceschanged = () => {
            const loadedVoices = speechSynthesis.getVoices();
            resolve(loadedVoices.map(voice => voice.name));
          };
        }
      });
    }
    return ["default"];
  },

  /**
   * Test speech synthesis (client-side only)
   */
  async testSpeechSynthesis(text: string, voice?: string): Promise<boolean> {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        
        if (voice) {
          const voices = speechSynthesis.getVoices();
          const selectedVoice = voices.find(v => v.name === voice);
          if (selectedVoice) {
            utterance.voice = selectedVoice;
          }
        }
        
        utterance.onend = () => resolve(true);
        utterance.onerror = () => resolve(false);
        
        speechSynthesis.speak(utterance);
      });
    }
    return false;
  }
};

export default settingsApi;