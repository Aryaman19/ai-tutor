export interface AISettings {
  llm: {
    provider: string;
    model: string;
    endpoint?: string;
    temperature: number;
    maxTokens: number;
  };
  tts: {
    provider: string;
    voice: string;
    speed: number;
    volume: number;
    language: string;
  };
  stt: {
    provider: string;
    language: string;
    continuous: boolean;
  };
  language: {
    primary: string;
    secondary?: string;
    autoDetect: boolean;
  };
}
