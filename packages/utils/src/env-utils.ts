// packages/types/src/env-utils.ts
import type { Environment, EnvironmentConfig } from "@ai-tutor/types";
import { createUtilLogger } from "./logger";

/**
 * Universal environment variable getter
 * Works in both browser (Vite) and Node.js (build time) environments
 */
export const getEnvironmentVariable = (
  key: string,
  fallback?: string
): string | undefined => {
  let value: string | undefined;

  // 1. Try import.meta.env (Vite/browser environment)
  if (typeof import.meta !== "undefined" && import.meta.env) {
    value = import.meta.env[key];
  }

  // 2. Try process.env (Node.js environment)
  if (!value && typeof process !== "undefined" && process.env) {
    value = process.env[key];
  }

  // 3. Try window.env (runtime browser environment)
  if (!value && typeof window !== "undefined" && (window as any).env) {
    value = (window as any).env[key];
  }

  // 4. Try global scope for SSR/universal environments
  if (!value && typeof globalThis !== "undefined" && (globalThis as any).env) {
    value = (globalThis as any).env[key];
  }

  return value || fallback;
};

/**
 * Get API base URL with environment-specific fallbacks
 */
export const getApiBaseUrl = (): string => {
  return (
    getEnvironmentVariable("VITE_API_URL") ||
    "" // Use relative URLs by default for local dev with proxy
  );
};

/**
 * Helper function to construct API URLs
 * @param path - API path (e.g., '/api/lesson/123')
 * @returns Full API URL
 */
export const getApiUrl = (path: string): string => {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}${path}`;
};

/**
 * Detect current environment
 */
export const getCurrentEnvironment = (): Environment => {
  const nodeEnv = getEnvironmentVariable("NODE_ENV");
  const viteMode = getEnvironmentVariable("MODE");
  const dockerEnv = getEnvironmentVariable("ENVIRONMENT");

  if (dockerEnv === "docker") return "docker";
  if (nodeEnv === "production" || viteMode === "production")
    return "production";
  if (nodeEnv === "test") return "test";
  return "development";
};

/**
 * Check if running in development mode
 */
export const isDevelopment = (): boolean => {
  const env = getCurrentEnvironment();
  const viteDev = getEnvironmentVariable("DEV");
  return env === "development" || viteDev === "true";
};

/**
 * Check if running in production mode
 */
export const isProduction = (): boolean => {
  const env = getCurrentEnvironment();
  const viteProd = getEnvironmentVariable("PROD");
  return env === "production" || viteProd === "true";
};

/**
 * Check if running in Docker container
 */
export const isDocker = (): boolean => {
  return (
    getCurrentEnvironment() === "docker" ||
    getEnvironmentVariable("CONTAINER") === "true" ||
    getEnvironmentVariable("ENVIRONMENT") === "docker"
  );
};

/**
 * Check if debug mode is enabled
 */
export const isDebugMode = (): boolean => {
  const debug = getEnvironmentVariable("DEBUG");
  return debug === "true" || isDevelopment();
};

/**
 * Get complete environment configuration
 */
export const getEnvironmentConfig = (): EnvironmentConfig => {
  const environment = getCurrentEnvironment();

  return {
    apiUrl: getApiBaseUrl(),
    environment,
    isDevelopment: isDevelopment(),
    isProduction: isProduction(),
    isDocker: isDocker(),
    debug: isDebugMode(),
  };
};

/**
 * Log environment information (development only)
 */
export const logEnvironmentInfo = (): void => {
  if (!isDevelopment()) return;

  const logger = createUtilLogger('EnvUtils');
  const config = getEnvironmentConfig();
  logger.info("🌍 Environment Configuration:", {
    ...config,
    variables: {
      NODE_ENV: getEnvironmentVariable("NODE_ENV"),
      MODE: getEnvironmentVariable("MODE"),
      VITE_API_URL: getEnvironmentVariable("VITE_API_URL"),
      ENVIRONMENT: getEnvironmentVariable("ENVIRONMENT"),
    },
  });
};
