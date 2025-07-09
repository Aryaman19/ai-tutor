export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    ollama: {
      status: string;
      url?: string;
      models?: any[];
      error?: string;
    };
    database: {
      status: string;
      ping?: any;
      database?: string;
      error?: string;
    };
    tts: Record<string, any>;
  };
  system: {
    platform: string;
    python_version: string;
    is_container: boolean;
    environment: string;
    ollama_host: string;
  };
}
