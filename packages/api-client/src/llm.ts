import { apiClient } from "./client";
import type { 
  LLMTestRequest, 
  LLMTestResponse, 
  LLMFeatures 
} from "@ai-tutor/types";

export interface LLMApi {
  testCapability: (request: LLMTestRequest) => Promise<LLMTestResponse>;
  getModelFeatures: (model: string) => Promise<LLMFeatures>;
  getAvailableModels: () => Promise<{ models: string[]; provider: string }>;
  testStreaming: (model: string, prompt?: string) => Promise<{
    model: string;
    streamingSupported: boolean;
    responseTime: number;
    error?: string;
  }>;
  healthCheck: () => Promise<{
    status: string;
    service: string;
    healthy: boolean;
    message?: string;
    error?: string;
  }>;
}

export const llmApi: LLMApi = {
  async testCapability(request: LLMTestRequest): Promise<LLMTestResponse> {
    const response = await apiClient.post<LLMTestResponse>("/api/llm/test", request);
    return response.data;
  },

  async getModelFeatures(model: string): Promise<LLMFeatures> {
    const response = await apiClient.get<LLMFeatures>(`/api/llm/features/${model}`);
    return response.data;
  },

  async getAvailableModels(): Promise<{ models: string[]; provider: string }> {
    const response = await apiClient.get<{ models: string[]; provider: string }>("/api/llm/models");
    return response.data;
  },

  async testStreaming(model: string, prompt = "Hello, test streaming response"): Promise<{
    model: string;
    streamingSupported: boolean;
    responseTime: number;
    error?: string;
  }> {
    const response = await apiClient.post(`/api/llm/test/streaming/${model}`, { prompt });
    return response.data;
  },

  async healthCheck(): Promise<{
    status: string;
    service: string;
    healthy: boolean;
    message?: string;
    error?: string;
  }> {
    const response = await apiClient.get("/api/llm/health");
    return response.data;
  }
};