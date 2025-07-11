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
    // This would call a backend endpoint that returns available models
    // For now, return a mock response
    return {
      ollama: ["gemma2:3b", "llama3:8b", "mistral:7b", "codellama:7b", "phi3:3.8b"],
      openai: ["gpt-4", "gpt-3.5-turbo", "gpt-4-turbo", "gpt-4o"],
      anthropic: ["claude-3-sonnet", "claude-3-haiku", "claude-3-opus", "claude-3-5-sonnet"],
      browserTts: ["default", "male", "female", "en-US-male", "en-US-female", "en-GB-male", "en-GB-female"],
      elevenlabs: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
      openaiTts: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
    };
  },

  /**
   * Get supported languages
   */
  async getSupportedLanguages(): Promise<string[]> {
    // This would call a backend endpoint that returns supported languages
    // For now, return a mock response
    return [
      "en", "es", "fr", "de", "it", "pt", "zh", "ja", "ko", "ru", 
      "ar", "hi", "th", "vi", "nl", "pl", "sv", "no", "da", "fi"
    ];
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