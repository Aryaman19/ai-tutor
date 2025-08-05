import { createServiceLogger } from '../logger';
import type { StreamingTimelineChunk, TimelineEvent } from '@ai-tutor/types';

const logger = createServiceLogger('UnifiedAudioEngine');

export interface NarrationSegment {
  id: string;
  text: string;
  startTime: number;
  duration: number;
  slideNumber?: number;
  contentType?: string;
  metadata?: {
    chunkId?: string;
    eventId?: string;
    contentType?: string;
  };
}

export interface UnifiedAudioResult {
  audioUrl: string;
  audioId: string;
  totalDuration: number;
  segments: NarrationSegment[];
  isReady: boolean;
}

export interface AudioEngineOptions {
  voice?: string;
  speed?: number;
  volume?: number;
  separatorPause?: number; // Pause between segments in milliseconds
}

/**
 * AudioEngine class that takes complete lesson data and creates a single unified audio file
 * This enables instant seeking without buffering, like a downloaded video experience
 */
export class AudioEngine {
  private options: AudioEngineOptions;
  private segments: NarrationSegment[] = [];
  private unifiedText: string = '';
  private audioResult: UnifiedAudioResult | null = null;

  constructor(options: AudioEngineOptions = {}) {
    this.options = {
      separatorPause: 500, // 500ms pause between segments by default
      ...options
    };
    
    logger.debug('AudioEngine initialized', { options: this.options });
  }

  /**
   * Process semantic JSON data and extract narration content
   */
  processSemanticData(data: any): NarrationSegment[] {
    logger.debug('Processing semantic data', { 
      dataType: typeof data,
      hasChunks: !!data.chunks,
      chunksLength: data.chunks?.length || 0
    });

    const segments: NarrationSegment[] = [];
    let currentTime = 0;

    // Handle different data formats
    if (data.chunks && Array.isArray(data.chunks)) {
      // StreamingTimelineChunk format
      data.chunks.forEach((chunk: StreamingTimelineChunk, chunkIndex: number) => {
        if (chunk.events && Array.isArray(chunk.events)) {
          chunk.events.forEach((event: TimelineEvent, eventIndex: number) => {
            const text = this.extractNarrationText(event);
            if (text && text.trim()) {
              const duration = this.estimateTextDuration(text);
              
              segments.push({
                id: `${chunk.chunkId || chunkIndex}_${event.id || eventIndex}`,
                text: text.trim(),
                startTime: currentTime,
                duration,
                metadata: {
                  chunkId: chunk.chunkId,
                  eventId: event.id,
                  contentType: chunk.contentType || event.semanticType
                }
              });
              
              currentTime += duration + (this.options.separatorPause || 0);
            }
          });
        }
      });
    } else if (data.events && Array.isArray(data.events)) {
      // Direct events array
      data.events.forEach((event: any, index: number) => {
        const text = this.extractNarrationText(event);
        if (text && text.trim()) {
          const duration = this.estimateTextDuration(text);
          
          segments.push({
            id: `event_${index}`,
            text: text.trim(),
            startTime: currentTime,
            duration,
            metadata: {
              eventId: event.id,
              contentType: event.type || event.semanticType
            }
          });
          
          currentTime += duration + (this.options.separatorPause || 0);
        }
      });
    } else if (data.narration && typeof data.narration === 'string') {
      // Simple narration string
      const text = data.narration.trim();
      if (text) {
        segments.push({
          id: 'narration_0',
          text,
          startTime: 0,
          duration: this.estimateTextDuration(text),
          metadata: {
            contentType: 'narration'
          }
        });
      }
    }

    this.segments = segments;
    
    logger.debug('Processed semantic data', {
      segmentsCount: segments.length,
      totalDuration: segments.reduce((sum, s) => Math.max(sum, s.startTime + s.duration), 0),
      segments: segments.map(s => ({ id: s.id, textLength: s.text.length, duration: s.duration }))
    });

    return segments;
  }

  /**
   * Extract narration text from various event formats
   */
  private extractNarrationText(event: any): string | null {
    // Direct text content
    if (typeof event.content === 'string' && event.content.trim()) {
      return event.content.trim();
    }

    // Structured content with audio
    if (event.content && typeof event.content === 'object') {
      if (event.content.audio && event.content.audio.text) {
        return event.content.audio.text;
      }
      
      if (event.content.narration && typeof event.content.narration === 'string') {
        return event.content.narration;
      }
      
      // Visual content with text (fallback)
      if (event.content.visual && event.content.visual.properties?.text) {
        return event.content.visual.properties.text;
      }
    }

    // Direct narration property
    if (event.narration && typeof event.narration === 'string') {
      return event.narration;
    }

    // Text property
    if (event.text && typeof event.text === 'string') {
      return event.text;
    }

    return null;
  }

  /**
   * Estimate text duration for audio timing calculations
   */
  private estimateTextDuration(text: string): number {
    const words = text.split(/\s+/).length;
    const characters = text.length;
    
    // Base speaking rate (words per minute) adjusted for TTS
    let wordsPerMinute = 160; // Slightly faster for TTS
    
    // Adjust for speed settings
    if (this.options.speed) {
      wordsPerMinute = wordsPerMinute * this.options.speed;
    }
    
    // Calculate duration from words
    const wordBasedDuration = (words / wordsPerMinute) * 60 * 1000;
    
    // Character-based estimation for accuracy
    const charactersPerSecond = (wordsPerMinute * 5) / 60; // ~5 chars per word
    const charBasedDuration = (characters / charactersPerSecond) * 1000;
    
    // Use the longer of the two estimates, with reasonable bounds
    const estimatedDuration = Math.max(wordBasedDuration, charBasedDuration);
    
    // Minimum 1 second, maximum 30 seconds per segment
    return Math.max(Math.min(estimatedDuration, 30000), 1000);
  }

  /**
   * Create unified text by merging all narration segments
   */
  createUnifiedText(): string {
    if (this.segments.length === 0) {
      logger.warn('No segments available for unified text creation');
      return '';
    }

    // Add natural pauses between segments for better TTS flow
    const pauseMarker = '... '; // Natural pause that works well with TTS
    
    this.unifiedText = this.segments
      .map(segment => segment.text)
      .join(pauseMarker);

    logger.debug('Created unified text', {
      originalSegments: this.segments.length,
      totalCharacters: this.unifiedText.length,
      textPreview: this.unifiedText.substring(0, 200) + '...'
    });

    return this.unifiedText;
  }

  /**
   * Generate single audio file from unified text
   */
  async generateUnifiedAudio(ttsApi: any): Promise<UnifiedAudioResult> {
    if (!this.unifiedText) {
      throw new Error('No unified text available. Call createUnifiedText() first.');
    }

    logger.debug('Generating unified audio', {
      textLength: this.unifiedText.length,
      voice: this.options.voice,
      speed: this.options.speed
    });

    try {
      logger.debug('Calling TTS API', {
        textLength: this.unifiedText.length,
        voice: this.options.voice,
        textPreview: this.unifiedText.substring(0, 100) + '...'
      });

      // Use the existing TTS API to generate a single audio file
      const response = await ttsApi.generateAudio({
        text: this.unifiedText,
        voice: this.options.voice
      });

      logger.debug('TTS API response received', {
        audioId: response.audio_id,
        audioUrl: response.audio_url,
        cached: response.cached,
        hasAudioId: !!response.audio_id,
        hasAudioUrl: !!response.audio_url,
        audioUrlLength: response.audio_url?.length || 0
      });

      // Validate TTS response
      if (!response.audio_url || response.audio_url.trim() === '') {
        throw new Error('TTS API returned empty audio URL');
      }

      if (!response.audio_id || response.audio_id.trim() === '') {
        throw new Error('TTS API returned empty audio ID');
      }

      // Validate URL format (allow both absolute and relative URLs)
      const isValidUrl = this.isValidAudioUrl(response.audio_url);
      if (!isValidUrl) {
        throw new Error(`TTS API returned invalid audio URL format: ${response.audio_url}`);
      }

      // Calculate total duration based on segments
      const totalDuration = this.segments.reduce((sum, segment) => 
        Math.max(sum, segment.startTime + segment.duration), 0
      );

      // Convert relative URL to absolute URL using the TTS API client
      const absoluteAudioUrl = response.audio_url.startsWith('/') 
        ? ttsApi.getAudioUrl(response.audio_id)
        : response.audio_url;

      logger.debug('Audio URL conversion', {
        originalUrl: response.audio_url,
        absoluteUrl: absoluteAudioUrl,
        wasRelative: response.audio_url.startsWith('/')
      });

      this.audioResult = {
        audioUrl: absoluteAudioUrl,
        audioId: response.audio_id,
        totalDuration,
        segments: this.segments,
        isReady: true
      };

      logger.debug('Unified audio generated successfully', {
        audioId: response.audio_id,
        totalDuration,
        segmentsCount: this.segments.length
      });

      return this.audioResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to generate unified audio', {
        error: errorMessage,
        textLength: this.unifiedText.length,
        voice: this.options.voice
      });
      throw new Error(`Failed to generate unified audio: ${errorMessage}`);
    }
  }

  /**
   * Get segment at specific timestamp
   */
  getSegmentAtTime(timestamp: number): NarrationSegment | null {
    return this.segments.find(segment => 
      timestamp >= segment.startTime && 
      timestamp < segment.startTime + segment.duration
    ) || null;
  }

  /**
   * Get all segments
   */
  getSegments(): NarrationSegment[] {
    return [...this.segments];
  }

  /**
   * Get current audio result
   */
  getAudioResult(): UnifiedAudioResult | null {
    return this.audioResult;
  }

  /**
   * Clear all data and reset engine
   */
  reset(): void {
    this.segments = [];
    this.unifiedText = '';
    this.audioResult = null;
    
    logger.debug('AudioEngine reset');
  }

  /**
   * Validate audio URL format (supports both absolute and relative URLs)
   */
  private isValidAudioUrl(url: string): boolean {
    try {
      // Check if it's an absolute URL
      new URL(url);
      return true;
    } catch {
      // If not absolute, check if it's a valid relative URL pattern
      if (url.startsWith('/')) {
        // Relative URL starting with / - should be a valid path
        const pathPattern = /^\/[a-zA-Z0-9\/_\-\.]+$/;
        return pathPattern.test(url);
      }
      return false;
    }
  }

  /**
   * Multi-slide audio generation methods
   */
  
  /**
   * Process slide-by-slide narration content
   */
  processSlideNarrations(slides: Array<{ narration: string; duration?: number; slideNumber?: number }>): NarrationSegment[] {
    logger.debug('Processing slide narrations', { slideCount: slides.length });
    
    const segments: NarrationSegment[] = [];
    let currentTime = 0;
    
    slides.forEach((slide, index) => {
      if (slide.narration && slide.narration.trim()) {
        const duration = slide.duration || this.estimateTextDuration(slide.narration);
        
        segments.push({
          id: `slide-${slide.slideNumber || index + 1}`,
          text: slide.narration.trim(),
          startTime: currentTime,
          duration,
          slideNumber: slide.slideNumber || index + 1,
          contentType: 'slide-narration'
        });
        
        // Add separator pause (which will be replaced by crossfade)
        currentTime += duration + (this.options.separatorPause || 500);
      }
    });
    
    this.segments = segments;
    logger.debug('Created slide segments', { segmentCount: segments.length });
    
    return segments;
  }
  
  /**
   * Generate individual audio files for each slide
   */
  async generateSlideAudioFiles(ttsApi: any): Promise<Array<{
    slideNumber: number;
    audioId: string;
    audioUrl: string;
    duration: number;
    text: string;
  }>> {
    logger.debug('Generating individual slide audio files', { segmentCount: this.segments.length });
    
    const audioFiles = [];
    
    for (const segment of this.segments) {
      try {
        logger.debug(`Generating audio for slide ${segment.slideNumber}`, {
          textLength: segment.text.length,
          textPreview: segment.text.substring(0, 50) + '...'
        });
        
        const response = await ttsApi.generateAudio({
          text: segment.text,
          voice: this.options.voice
        });
        
        if (!response.audio_url || !response.audio_id) {
          throw new Error(`TTS API failed for slide ${segment.slideNumber}`);
        }
        
        audioFiles.push({
          slideNumber: segment.slideNumber || 0,
          audioId: response.audio_id,
          audioUrl: response.audio_url,
          duration: segment.duration,
          text: segment.text
        });
        
      } catch (error) {
        logger.error(`Failed to generate audio for slide ${segment.slideNumber}:`, error);
        // Continue with other slides, but mark this as failed
        audioFiles.push({
          slideNumber: segment.slideNumber || 0,
          audioId: '',
          audioUrl: '',
          duration: segment.duration,
          text: segment.text
        });
      }
    }
    
    logger.debug('Generated slide audio files', { 
      totalFiles: audioFiles.length,
      successfulFiles: audioFiles.filter(f => f.audioUrl).length
    });
    
    return audioFiles;
  }
  
  /**
   * Simulate crossfade merging (placeholder for actual audio processing)
   */
  async simulateCrossfadeMerging(
    audioFiles: Array<{
      slideNumber: number;
      audioId: string;
      audioUrl: string;
      duration: number;
      text: string;
    }>,
    crossfadeDuration: number = 500
  ): Promise<{
    unifiedAudioUrl: string;
    totalDuration: number;
    segments: Array<{
      slideNumber: number;
      startTime: number;
      endTime: number;
      text: string;
    }>;
  }> {
    logger.debug('Simulating crossfade merging', { 
      audioFileCount: audioFiles.length,
      crossfadeDuration 
    });
    
    // Calculate timing with crossfades
    const segments: any[] = [];
    let currentTime = 0;
    
    audioFiles.forEach((audioFile, index) => {
      if (audioFile.audioUrl) {
        const startTime = currentTime;
        const endTime = currentTime + audioFile.duration;
        
        segments.push({
          slideNumber: audioFile.slideNumber,
          startTime,
          endTime,
          text: audioFile.text
        });
        
        // Move to next position with crossfade overlap
        if (index < audioFiles.length - 1) {
          currentTime += audioFile.duration - crossfadeDuration;
        } else {
          currentTime += audioFile.duration;
        }
      }
    });
    
    const totalDuration = currentTime;
    
    // In a real implementation, this would be the actual merged audio URL
    const unifiedAudioUrl = `/api/audio/merged-lesson-${Date.now()}.mp3`;
    
    // Update internal segments with new timing
    this.segments = this.segments.map((segment, index) => ({
      ...segment,
      startTime: segments[index]?.startTime || segment.startTime,
      duration: segments[index] ? segments[index].endTime - segments[index].startTime : segment.duration
    }));
    
    logger.debug('Crossfade merge simulation complete', {
      totalDuration,
      segmentCount: segments.length,
      unifiedAudioUrl
    });
    
    return {
      unifiedAudioUrl,
      totalDuration,
      segments
    };
  }
  
  /**
   * Complete workflow for multi-slide audio generation
   */
  async generateMultiSlideAudio(
    slides: Array<{ narration: string; duration?: number; slideNumber?: number }>,
    ttsApi: any,
    crossfadeDuration: number = 500
  ): Promise<UnifiedAudioResult> {
    logger.debug('Starting multi-slide audio generation', { 
      slideCount: slides.length,
      crossfadeDuration 
    });
    
    // Process slide narrations into segments
    this.processSlideNarrations(slides);
    
    // Generate individual audio files
    const audioFiles = await this.generateSlideAudioFiles(ttsApi);
    
    // Simulate crossfade merging
    const mergedResult = await this.simulateCrossfadeMerging(audioFiles, crossfadeDuration);
    
    // Create unified audio result
    const result: UnifiedAudioResult = {
      audioUrl: mergedResult.unifiedAudioUrl,
      audioId: `multi-slide-${Date.now()}`,
      totalDuration: mergedResult.totalDuration,
      segments: this.segments,
      isReady: true
    };
    
    this.audioResult = result;
    
    logger.debug('Multi-slide audio generation complete', {
      audioId: result.audioId,
      totalDuration: result.totalDuration,
      segmentCount: result.segments.length
    });
    
    return result;
  }

  /**
   * Static factory method to create and process data in one call
   */
  static async createFromSemanticData(
    semanticData: any, 
    ttsApi: any, 
    options: AudioEngineOptions = {}
  ): Promise<{ engine: AudioEngine; result: UnifiedAudioResult }> {
    const engine = new AudioEngine(options);
    
    // Process the data
    engine.processSemanticData(semanticData);
    
    // Create unified text
    engine.createUnifiedText();
    
    // Generate audio
    const result = await engine.generateUnifiedAudio(ttsApi);
    
    return { engine, result };
  }
  
  /**
   * Static factory method for multi-slide audio generation
   */
  static async createFromSlides(
    slides: Array<{ narration: string; duration?: number; slideNumber?: number }>,
    ttsApi: any,
    options: AudioEngineOptions = {},
    crossfadeDuration: number = 500
  ): Promise<{ engine: AudioEngine; result: UnifiedAudioResult }> {
    const engine = new AudioEngine(options);
    
    // Generate multi-slide audio
    const result = await engine.generateMultiSlideAudio(slides, ttsApi, crossfadeDuration);
    
    return { engine, result };
  }
}

export default AudioEngine;