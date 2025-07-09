import { apiClient } from "./client";
import type { HealthStatus } from "@ai-tutor/types";

export const healthApi = {
  async checkBasicHealth(): Promise<{ status: string; message: string }> {
    try {
      const response = await apiClient.get("/api/health/");
      return response.data;
    } catch (error) {
      throw new Error("Backend is not responding");
    }
  },

  async checkDetailedHealth(): Promise<HealthStatus> {
    try {
      const response = await apiClient.get("/api/health/detailed");
      return response.data;
    } catch (error) {
      throw new Error("Failed to get detailed health status");
    }
  },

  async testOllama(): Promise<any> {
    try {
      const response = await apiClient.get("/api/health/ollama");
      return response.data;
    } catch (error) {
      throw new Error("Failed to test Ollama connection");
    }
  },

  async testDatabase(): Promise<any> {
    try {
      const response = await apiClient.get("/api/health/database");
      return response.data;
    } catch (error) {
      throw new Error("Failed to test database connection");
    }
  },

  async testTTS(): Promise<any> {
    try {
      const response = await apiClient.get("/api/health/tts");
      return response.data;
    } catch (error) {
      throw new Error("Failed to test TTS providers");
    }
  },
};
