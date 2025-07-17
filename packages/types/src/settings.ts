export interface LLMSettings {
  provider: string;
  model: string;
  endpoint?: string;
  apiKey?: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

export interface TTSSettings {
  provider: string;
  voice: string;
  apiKey?: string;
  speed: number;
  volume: number;
  pitch: number;
  language: string;
  voiceSettings: Record<string, any>;
  streaming?: boolean;
}

export interface PiperVoice {
  id: string;
  name: string;
  language: string;
}

export interface TTSAudioGenerationRequest {
  text: string;
  voice?: string;
}

export interface TTSAudioGenerationResponse {
  audio_id: string;
  audio_url: string;
  cached: boolean;
  text: string;
  voice: string;
}

export interface TTSCacheStats {
  total_files: number;
  total_size_bytes: number;
  total_size_mb: number;
  cache_limit: number;
  cache_directory: string;
}

export interface TTSHealthStatus {
  status: 'healthy' | 'unhealthy';
  service: string;
  healthy: boolean;
  error?: string;
}

export interface STTSettings {
  provider: string;
  apiKey?: string;
  language: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  confidenceThreshold: number;
}

export interface LanguageSettings {
  primary: string;
  secondary?: string;
  autoDetect: boolean;
  availableLanguages: string[];
}

export interface AppearanceSettings {
  theme: string;
  colorScheme: string;
  fontSize: string;
  compactMode: boolean;
  animations: boolean;
}

export interface LessonSettings {
  defaultDifficulty: string;
  preferredContentTypes: string[];
  sessionDuration: number;
  breakReminders: boolean;
  progressTracking: boolean;
}

export interface NotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  lessonReminders: boolean;
  progressUpdates: boolean;
}

export interface UserProfile {
  name: string;
  email?: string;
  avatarUrl?: string;
  bio?: string;
  learningGoals: string[];
}

export interface UserSettings {
  userId: string;
  profile: UserProfile;
  llm: LLMSettings;
  tts: TTSSettings;
  stt: STTSettings;
  language: LanguageSettings;
  appearance: AppearanceSettings;
  lessons: LessonSettings;
  notifications: NotificationSettings;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsUpdateRequest {
  profile?: Partial<UserProfile>;
  llm?: Partial<LLMSettings>;
  tts?: Partial<TTSSettings>;
  stt?: Partial<STTSettings>;
  language?: Partial<LanguageSettings>;
  appearance?: Partial<AppearanceSettings>;
  lessons?: Partial<LessonSettings>;
  notifications?: Partial<NotificationSettings>;
}

export interface SettingsValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  providerAvailable?: boolean;
}

export interface AvailableModels {
  ollama: string[];
  openai: string[];
  anthropic: string[];
  browserTts: string[];
  elevenlabs: string[];
  openaiTts: string[];
  piperTts: PiperVoice[];
}

// Legacy interface for backward compatibility
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
