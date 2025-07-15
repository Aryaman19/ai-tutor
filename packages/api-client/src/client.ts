import axios from "axios";
import { getApiBaseUrl, isDevelopment, createServiceLogger } from "@ai-tutor/utils";

const logger = createServiceLogger('ApiClient');

// Create API client with environment-aware base URL
export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add development-only interceptors
if (isDevelopment()) {
  apiClient.interceptors.request.use((config) => {
    logger.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  });

  apiClient.interceptors.response.use(
    (response) => {
      logger.debug(`API Response: ${response.status} ${response.config.url}`);
      return response;
    },
    (error) => {
      logger.error("API Error:", error.response?.data || error.message);
      return Promise.reject(error);
    }
  );
}

export default apiClient;
