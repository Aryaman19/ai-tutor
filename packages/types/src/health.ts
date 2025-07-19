export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaService {
  status: "healthy" | "degraded" | "unhealthy" | "connected" | "disconnected" | "available" | "unavailable";
  url?: string;
  models?: OllamaModel[];
  error?: string;
}

export interface DatabaseService {
  status: "healthy" | "degraded" | "unhealthy" | "connected" | "disconnected";
  ping?: number;
  database?: string;
  error?: string;
}

export interface TTSProvider {
  status: "available" | "unavailable" | "healthy" | "degraded" | "error";
  provider?: string;
  voices?: string[];
  voices_count?: number;
  note?: string;
  error?: string;
}

export interface SystemInfo {
  platform: string;
  python_version: string;
  is_container: boolean;
  environment: string;
  ollama_host: string;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    ollama: OllamaService;
    database: DatabaseService;
    tts: Record<string, TTSProvider>;
  };
  system: SystemInfo;
}

export interface BrowserVoices {
  voices: string[];
  default?: string;
}
