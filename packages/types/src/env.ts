// Global environment variable types
declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
    readonly VITE_APP_TITLE?: string;
    readonly MODE: string;
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly SSR: boolean;
    readonly BASE_URL: string;
    readonly [key: string]: any;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
    readonly hot?: {
      readonly data: any;
      accept(): void;
      accept(cb: (mod: any) => void): void;
      accept(dep: string, cb: (mod: any) => void): void;
      accept(deps: string[], cb: (mods: any[]) => void): void;
      dispose(cb: () => void): void;
      decline(): void;
      invalidate(): void;
    };
  }

  // Node.js process environment types
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: "development" | "production" | "test";
      API_URL?: string;
      VITE_API_URL?: string;
      MONGODB_URL?: string;
      OLLAMA_HOST?: string;
      ENVIRONMENT?: string;
      DEBUG?: string;
      [key: string]: string | undefined;
    }
  }

  // Browser window environment (for runtime injection)
  interface Window {
    env?: {
      [key: string]: string;
    };
  }
}

// Environment helper types
export type Environment = "development" | "production" | "test" | "docker";
export type BuildMode = "development" | "production";

// Environment configuration interface
export interface EnvironmentConfig {
  apiUrl: string;
  environment: Environment;
  isDevelopment: boolean;
  isProduction: boolean;
  isDocker: boolean;
  debug: boolean;
}

export {};
