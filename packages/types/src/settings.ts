export interface LLMSettings {
  provider: string;
  model: string;
  endpoint?: string;
  apiKey?: string;
  timing: 'short' | 'medium' | 'long';
  difficulty: 'easy' | 'intermediate' | 'advanced';
  temperature?: number;
  maxTokens?: number;
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

// LLM Testing Types
export interface LLMTestRequest {
  prompt: string;
  model: string;
  provider: string;
  streaming?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface StreamingMetrics {
  chunk_count: number;
  first_token_latency: number;
  average_chunk_delay: number;
  total_time: number;
  tokens_per_second: number;
  chunk_times: number[];
  content_quality: {
    quality: 'good' | 'fair' | 'poor';
    reason: string;
    chunk_count: number;
    final_length: number;
    progression_pattern: number[];
  };
  real_streaming: boolean;
}

export interface LLMTestResponse {
  success: boolean;
  response?: string;
  responseTime: number;
  tokenCount?: number;
  streaming: boolean;
  streamingSupported?: boolean;
  streamingMetrics?: StreamingMetrics;
  error?: string;
  features?: LLMFeatures;
}

export interface LLMFeatures {
  streaming: boolean | null;  // null = not yet tested, boolean = actual test result
  contextLength: number;
  multimodal: boolean;
  functionCalling: boolean;
  visionSupport: boolean;
  codeGeneration: boolean;
  maxTokens: number;
  temperature: boolean;
  topP: boolean;
  frequencyPenalty: boolean;
  presencePenalty: boolean;
}

export interface LLMTestingState {
  isRunning: boolean;
  currentTest: 'streaming' | 'non-streaming' | 'features' | null;
  lastTestResult?: LLMTestResponse;
  features?: LLMFeatures;
  error?: string;
}

export interface LLMCapabilityTest {
  name: string;
  description: string;
  testType: 'streaming' | 'feature' | 'performance';
  status: 'pending' | 'running' | 'passed' | 'failed';
  result?: any;
  error?: string;
  duration?: number;
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
