import { apiClient } from './client';

export interface TTSGenerateRequest {
  text: string;
  voice?: string;
}

export interface TTSGenerateResponse {
  audio_id: string;
  audio_url: string;
  cached: boolean;
  text: string;
  voice: string;
}

export interface TTSVoice {
  id: string;
  name: string;
  language: string;
}

export interface TTSCacheStats {
  total_files: number;
  total_size_bytes: number;
  total_size_mb: number;
  cache_limit: number;
  cache_directory: string;
}

export interface TTSBatchRequest {
  texts: string[];
  voice?: string;
}

export interface TTSBatchResult {
  index: number;
  text: string;
  audio_id?: string;
  audio_url?: string;
  cached?: boolean;
  voice?: string;
  error?: string;
}

export interface TTSBatchResponse {
  results: TTSBatchResult[];
  total: number;
  success: number;
  failed: number;
}

export interface TTSHealthResponse {
  status: 'healthy' | 'unhealthy' | 'unavailable' | 'error';
  service: string;
  healthy: boolean;
  available?: boolean;
  message?: string;
  error?: string;
}

export interface TTSAvailabilityResponse {
  available: boolean;
  service: string;
  message?: string;
  error?: string;
}

export interface TTSStreamingRequest {
  text: string;
  voice?: string;
  max_chunk_size?: number;
}

export interface TTSStreamingChunk {
  chunk_id: string;
  audio_id: string | null;
  audio_url: string | null;
  index: number;
  text: string;
  is_ready: boolean;
  error?: string;
}

export interface VoiceMetadata {
  id: string;
  name: string;
  language: string;
  language_code: string;
  country: string;
  quality: string;
  size_mb: number;
  description: string;
  sample_rate: number;
  is_downloaded: boolean;
  is_downloading: boolean;
  download_progress: number;
}

export interface VoiceDownloadRequest {
  voice_id: string;
}

export interface VoiceDownloadResponse {
  success: boolean;
  message: string;
  voice_id: string;
}

export interface VoiceDeleteResponse {
  success: boolean;
  message: string;
  voice_id: string;
}

export interface VoiceDownloadProgress {
  voice_id: string;
  progress: number;
  is_downloading: boolean;
  is_downloaded: boolean;
}

export const ttsApi = {
  /**
   * Generate TTS audio for a text chunk
   */
  async generateAudio(request: TTSGenerateRequest): Promise<TTSGenerateResponse> {
    const response = await apiClient.post<TTSGenerateResponse>('/api/tts/generate', request);
    return response.data;
  },

  /**
   * Generate TTS audio for multiple text chunks
   */
  async generateBatchAudio(request: TTSBatchRequest): Promise<TTSBatchResponse> {
    const response = await apiClient.post<TTSBatchResponse>('/api/tts/generate-batch', request);
    return response.data;
  },

  /**
   * Get TTS audio file URL
   */
  getAudioUrl(audioId: string): string {
    return `${apiClient.defaults.baseURL}/api/tts/audio/${audioId}`;
  },

  /**
   * Delete a specific TTS audio file
   */
  async deleteAudio(audioId: string): Promise<void> {
    await apiClient.delete(`/api/tts/audio/${audioId}`);
  },

  /**
   * Clear all TTS cache
   */
  async clearCache(): Promise<{ message: string; deleted_files: number }> {
    const response = await apiClient.delete<{ message: string; deleted_files: number }>('/api/tts/cache');
    return response.data;
  },

  /**
   * Get available TTS voices
   */
  async getAvailableVoices(): Promise<TTSVoice[]> {
    const response = await apiClient.get<TTSVoice[]>('/api/tts/voices');
    return response.data;
  },

  /**
   * Get TTS cache statistics
   */
  async getCacheStats(): Promise<TTSCacheStats> {
    const response = await apiClient.get<TTSCacheStats>('/api/tts/cache/stats');
    return response.data;
  },

  /**
   * Check TTS service availability (fast check)
   */
  async checkAvailability(): Promise<TTSAvailabilityResponse> {
    const response = await apiClient.get<TTSAvailabilityResponse>('/api/tts/availability');
    return response.data;
  },

  /**
   * Check TTS service health
   */
  async checkHealth(): Promise<TTSHealthResponse> {
    const response = await apiClient.get<TTSHealthResponse>('/api/tts/health');
    return response.data;
  },

  /**
   * Generate TTS for an entire lesson
   */
  async generateLessonTTS(lessonId: string, voice?: string): Promise<any> {
    const params = voice ? { voice } : {};
    const response = await apiClient.post(`/api/lesson/${lessonId}/generate-tts`, {}, { params });
    return response.data;
  },

  /**
   * Get TTS generation status for a lesson
   */
  async getLessonTTSStatus(lessonId: string): Promise<any> {
    const response = await apiClient.get(`/api/lesson/${lessonId}/tts-status`);
    return response.data;
  },

  /**
   * Preload audio file for caching
   */
  async preloadAudio(audioId: string): Promise<void> {
    try {
      const audio = new Audio(this.getAudioUrl(audioId));
      audio.preload = 'auto';
      
      return new Promise((resolve, reject) => {
        audio.addEventListener('canplaythrough', () => resolve());
        audio.addEventListener('error', (e) => reject(e));
        audio.load();
      });
    } catch (error) {
      console.warn('Failed to preload audio:', error);
    }
  },

  /**
   * Create an audio element with proper configuration
   */
  createAudioElement(audioId: string): HTMLAudioElement {
    const audio = new Audio(this.getAudioUrl(audioId));
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    return audio;
  },

  /**
   * Check if an audio file exists and is accessible
   */
  async checkAudioAvailability(audioId: string): Promise<boolean> {
    try {
      const response = await fetch(this.getAudioUrl(audioId), { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  },

  /**
   * Generate streaming TTS audio for a text chunk
   */
  async generateStreamingAudio(request: TTSStreamingRequest): Promise<AsyncGenerator<TTSStreamingChunk, void, unknown>> {
    const response = await fetch(`${apiClient.defaults.baseURL}/api/tts/generate-streaming`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader available');
    }

    const decoder = new TextDecoder();
    
    return (async function* () {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'end') {
                  return;
                }
                yield parsed as TTSStreamingChunk;
              } catch (e) {
                console.warn('Failed to parse streaming chunk:', data, e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    })();
  },

  // Voice Management Methods

  /**
   * Get available voices from repository
   */
  async getAvailableVoicesFromRepository(): Promise<VoiceMetadata[]> {
    const response = await apiClient.get<VoiceMetadata[]>('/api/tts/voices/available');
    return response.data;
  },

  /**
   * Get installed voices
   */
  async getInstalledVoices(): Promise<VoiceMetadata[]> {
    const response = await apiClient.get<VoiceMetadata[]>('/api/tts/voices/installed');
    return response.data;
  },

  /**
   * Download a voice
   */
  async downloadVoice(voiceId: string): Promise<VoiceDownloadResponse> {
    const response = await apiClient.post<VoiceDownloadResponse>('/api/tts/voices/download', {
      voice_id: voiceId
    });
    return response.data;
  },

  /**
   * Delete a voice
   */
  async deleteVoice(voiceId: string): Promise<VoiceDeleteResponse> {
    const response = await apiClient.delete<VoiceDeleteResponse>(`/api/tts/voices/${voiceId}`);
    return response.data;
  },

  /**
   * Get download progress for a voice
   */
  async getVoiceDownloadProgress(voiceId: string): Promise<VoiceDownloadProgress> {
    const response = await apiClient.get<VoiceDownloadProgress>(`/api/tts/voices/${voiceId}/progress`);
    return response.data;
  },

  /**
   * Poll voice download progress
   */
  async pollVoiceDownloadProgress(voiceId: string, onProgress: (progress: VoiceDownloadProgress) => void): Promise<void> {
    const pollInterval = 1000; // 1 second
    const maxPolls = 300; // 5 minutes max
    let polls = 0;

    const poll = async () => {
      try {
        const progress = await this.getVoiceDownloadProgress(voiceId);
        onProgress(progress);

        if (progress.is_downloaded || !progress.is_downloading) {
          return;
        }

        polls++;
        if (polls >= maxPolls) {
          console.warn(`Voice download polling timed out for ${voiceId}`);
          return;
        }

        setTimeout(poll, pollInterval);
      } catch (error) {
        console.error(`Error polling voice download progress for ${voiceId}:`, error);
      }
    };

    poll();
  }
};

export default ttsApi;