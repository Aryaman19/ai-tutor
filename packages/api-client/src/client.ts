import axios from "axios";

const API_BASE_URL =
  typeof window !== "undefined"
    ? import.meta?.env?.VITE_API_URL || "http://localhost:8000"
    : process.env.API_URL || "http://localhost:8000";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request/response interceptors for logging
if (typeof window !== "undefined" && import.meta?.env?.DEV) {
  apiClient.interceptors.request.use((config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  });

  apiClient.interceptors.response.use(
    (response) => {
      console.log(`API Response: ${response.status} ${response.config.url}`);
      return response;
    },
    (error) => {
      console.error("API Error:", error.response?.data || error.message);
      return Promise.reject(error);
    }
  );
}

export default apiClient;
