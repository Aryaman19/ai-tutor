/**
 * Progressive Audio Manager
 * 
 * Handles progressive streaming of audio content with synchronized playback,
 * background loading, and seamless transitions between audio chunks.
 */

import type { TimelineEvent } from '@ai-tutor/types';
import { createUtilLogger } from '../logger';

const logger = createUtilLogger('ProgressiveAudioManager');

/**
 * Audio chunk data
 */
export interface AudioChunk {
  id: string;
  startTime: number;
  endTime: number;
  audioUrl?: string;
  audioData?: ArrayBuffer;
  text: string;
  ssml?: string;
  status: 'loading' | 'ready' | 'error';
  priority: 'low' | 'medium' | 'high';
  // TTS timing metadata
  estimatedDuration?: number;
  measuredDuration?: number;
  voice?: string;
  timingAccuracy?: number; // 0-1 confidence in timing accuracy
}

/**
 * Audio streaming configuration
 */
export interface ProgressiveAudioConfig {
  /** Minimum audio buffer before starting playback (milliseconds) */
  minAudioBuffer: number;
  
  /** Target audio buffer to maintain (milliseconds) */
  targetAudioBuffer: number;
  
  /** Enable audio preloading */
  enablePreloading: boolean;
  
  /** Audio quality settings */
  quality: {
    /** Sample rate (Hz) */
    sampleRate: number;
    
    /** Bit rate (kbps) */
    bitRate: number;
    
    /** Audio format */
    format: 'mp3' | 'wav' | 'ogg' | 'aac';
  };
  
  /** Crossfade between chunks (milliseconds) */
  crossfadeDuration: number;
  
  /** Volume settings */
  volume: {
    /** Master volume (0-1) */
    master: number;
    
    /** Enable automatic volume normalization */
    autoNormalize: boolean;
  };
}

/**
 * Default audio configuration
 */
const DEFAULT_AUDIO_CONFIG: ProgressiveAudioConfig = {
  minAudioBuffer: 3000,
  targetAudioBuffer: 10000,
  enablePreloading: true,
  quality: {
    sampleRate: 44100,
    bitRate: 128,
    format: 'mp3',
  },
  crossfadeDuration: 200,
  volume: {
    master: 1.0,
    autoNormalize: true,
  },
};

/**
 * Audio playback state
 */
export type AudioPlaybackState = 'stopped' | 'playing' | 'paused' | 'buffering' | 'error';

/**
 * Audio events
 */
export interface ProgressiveAudioEvents {
  'stateChanged': { 
    oldState: AudioPlaybackState; 
    newState: AudioPlaybackState; 
  };
  
  'chunkLoaded': { 
    chunk: AudioChunk; 
    totalLoaded: number; 
  };
  
  'chunkStarted': { 
    chunk: AudioChunk; 
    position: number; 
  };
  
  'chunkEnded': { 
    chunk: AudioChunk; 
    position: number; 
  };
  
  'bufferUnderrun': { 
    position: number; 
    availableBuffer: number; 
  };
  
  'error': { 
    error: Error; 
    chunk?: AudioChunk; 
  };
  
  'durationUpdated': {
    chunk: AudioChunk;
    oldDuration: number;
    newDuration: number;
    timingAccuracy: number;
  };
  
  'timelineRecalibrated': {
    adjustments: Array<{
      chunkId: string;
      oldStartTime: number;
      newStartTime: number;
      oldEndTime: number;
      newEndTime: number;
    }>;
    totalDuration: number;
  };
}

/**
 * Progressive Audio Manager
 * Handles YouTube-style progressive audio streaming
 */
export class ProgressiveAudioManager {
  private config: ProgressiveAudioConfig;
  private eventHandlers = new Map<string, Array<(data: any) => void>>();
  
  // Audio context and nodes
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private currentAudioBuffer: AudioBuffer | null = null;
  private audioSources = new Map<string, AudioBufferSourceNode>();
  
  // Audio chunks and buffering
  private audioChunks = new Map<string, AudioChunk>();
  private loadingChunks = new Set<string>();
  private currentPosition = 0;
  private playbackState: AudioPlaybackState = 'stopped';
  
  // Playback tracking
  private playbackStartTime = 0;
  private pausedAt = 0;
  private isPlaying = false;
  
  // Background loading
  private preloadQueue: string[] = [];
  private maxConcurrentLoads = 3;
  private currentLoads = 0;

  constructor(config: Partial<ProgressiveAudioConfig> = {}) {
    this.config = { ...DEFAULT_AUDIO_CONFIG, ...config };
    
    this.initializeAudioContext();
    
    logger.info('Progressive Audio Manager initialized', {
      minBuffer: this.config.minAudioBuffer,
      targetBuffer: this.config.targetAudioBuffer,
      quality: this.config.quality,
    });
  }

  /**
   * Add audio events from timeline chunks
   */
  async addAudioEvents(events: TimelineEvent[]): Promise<void> {
    const audioEvents = events.filter(event => 
      event.type === 'narration' || event.type === 'audio'
    );
    
    for (const event of audioEvents) {
      await this.addAudioChunk(event);
    }
  }

  /**
   * Add single audio chunk
   */
  async addAudioChunk(event: TimelineEvent): Promise<void> {
    if (!event.content?.audio) return;
    
    const audioContent = event.content.audio;
    const chunk: AudioChunk = {
      id: event.id,
      startTime: event.timestamp,
      endTime: event.timestamp + event.duration,
      audioUrl: audioContent.audioUrl,
      text: audioContent.text,
      ssml: audioContent.ssml,
      status: 'loading',
      priority: this.calculateChunkPriority(event.timestamp),
    };
    
    this.audioChunks.set(chunk.id, chunk);
    
    // Start loading if high priority or within target buffer
    if (chunk.priority === 'high' || this.shouldPreload(chunk)) {
      await this.loadAudioChunk(chunk);
    } else {
      this.queueForPreloading(chunk.id);
    }
    
    this.emit('chunkLoaded', { 
      chunk, 
      totalLoaded: Array.from(this.audioChunks.values()).filter(c => c.status === 'ready').length 
    });
  }
  
  /**
   * Update audio chunk with measured duration from TTS system
   */
  updateChunkDuration(chunkId: string, measuredDuration: number, voice?: string): void {
    const chunk = this.audioChunks.get(chunkId);
    if (!chunk) {
      logger.warn(`Cannot update duration for unknown chunk: ${chunkId}`);
      return;
    }
    
    const oldDuration = chunk.endTime - chunk.startTime;
    const durationDifference = Math.abs(measuredDuration - oldDuration);
    const significantChange = durationDifference > oldDuration * 0.15; // 15% threshold
    
    // Update chunk metadata
    chunk.measuredDuration = measuredDuration;
    if (voice) chunk.voice = voice;
    
    // Calculate timing accuracy
    const accuracy = chunk.estimatedDuration ? 
      Math.min(1.0, chunk.estimatedDuration / measuredDuration) : 
      0.5;
    chunk.timingAccuracy = accuracy;
    
    logger.debug(`Updated chunk duration`, {
      chunkId,
      estimatedDuration: oldDuration,
      measuredDuration,
      accuracy,
      significantChange
    });
    
    this.emit('durationUpdated', {
      chunk,
      oldDuration,
      newDuration: measuredDuration,
      timingAccuracy: accuracy
    });
    
    // Trigger timeline recalibration if significant change
    if (significantChange) {
      setTimeout(() => this.recalibrateTimeline(), 100);
    }
  }
  
  /**
   * Recalibrate timeline with measured audio durations
   * Adjusts chunk timing to prevent overlaps and gaps
   */
  recalibrateTimeline(): void {
    logger.debug('Recalibrating timeline with measured durations');
    
    const chunks = Array.from(this.audioChunks.values())
      .sort((a, b) => a.startTime - b.startTime);
    
    const adjustments: Array<{
      chunkId: string;
      oldStartTime: number;
      newStartTime: number;
      oldEndTime: number;
      newEndTime: number;
    }> = [];
    
    let currentTime = 0;
    
    for (const chunk of chunks) {
      const originalStart = chunk.startTime;
      const originalEnd = chunk.endTime;
      const originalDuration = originalEnd - originalStart;
      
      // Use measured duration if available and significantly different
      let adjustedDuration = originalDuration;
      if (chunk.measuredDuration) {
        const durationDifference = Math.abs(chunk.measuredDuration - originalDuration);
        if (durationDifference > originalDuration * 0.2) { // 20% threshold
          adjustedDuration = chunk.measuredDuration;
        }
      }
      
      // Adjust start time to prevent overlaps
      const newStartTime = Math.max(chunk.startTime, currentTime);
      const newEndTime = newStartTime + adjustedDuration;
      
      // Update chunk timing if changed
      if (newStartTime !== originalStart || newEndTime !== originalEnd) {
        chunk.startTime = newStartTime;
        chunk.endTime = newEndTime;
        
        adjustments.push({
          chunkId: chunk.id,
          oldStartTime: originalStart,
          newStartTime,
          oldEndTime: originalEnd,
          newEndTime
        });
        
        logger.debug(`Adjusted chunk timing`, {
          chunkId: chunk.id,
          oldStart: originalStart,
          newStart: newStartTime,
          oldDuration: originalDuration,
          newDuration: adjustedDuration
        });
      }
      
      currentTime = newEndTime;
    }
    
    if (adjustments.length > 0) {
      logger.info(`Timeline recalibrated with ${adjustments.length} adjustments`, {
        totalDuration: currentTime
      });
      
      this.emit('timelineRecalibrated', {
        adjustments,
        totalDuration: currentTime
      });
      
      // If currently playing, we may need to reschedule chunks
      if (this.isPlaying) {
        this.rescheduleUpcomingChunks();
      }
    }
  }
  
  /**
   * Get timing accuracy statistics for all chunks
   */
  getTimingAccuracyStats(): {
    averageAccuracy: number;
    chunksWithMeasuredDuration: number;
    totalChunks: number;
    confidenceScore: number;
  } {
    const chunks = Array.from(this.audioChunks.values());
    const chunksWithMeasured = chunks.filter(c => c.measuredDuration !== undefined);
    
    if (chunksWithMeasured.length === 0) {
      return {
        averageAccuracy: 0.5,
        chunksWithMeasuredDuration: 0,
        totalChunks: chunks.length,
        confidenceScore: 0.0
      };
    }
    
    const totalAccuracy = chunksWithMeasured.reduce((sum, chunk) => sum + (chunk.timingAccuracy || 0.5), 0);
    const averageAccuracy = totalAccuracy / chunksWithMeasured.length;
    const confidenceScore = chunksWithMeasured.length / chunks.length;
    
    return {
      averageAccuracy,
      chunksWithMeasuredDuration: chunksWithMeasured.length,
      totalChunks: chunks.length,
      confidenceScore
    };
  }
  
  /**
   * Reschedule upcoming chunks after timeline recalibration
   */
  private rescheduleUpcomingChunks(): void {
    if (!this.isPlaying || !this.audioContext) return;
    
    const currentPosition = this.getCurrentPosition();
    const upcomingChunks = Array.from(this.audioChunks.values())
      .filter(chunk => chunk.startTime > currentPosition)
      .sort((a, b) => a.startTime - b.startTime);
    
    // Stop any scheduled audio sources for upcoming chunks
    for (const chunk of upcomingChunks) {
      const source = this.audioSources.get(chunk.id);
      if (source) {
        try {
          source.stop();
        } catch (e) {
          // Source might already be stopped
        }
        this.audioSources.delete(chunk.id);
      }
    }
    
    // Reschedule upcoming chunks with new timing
    this.scheduleAudioChunks(currentPosition).catch(error => {
      logger.error('Error rescheduling chunks after recalibration', { error });
    });
  }

  /**
   * Start audio playback
   */
  async play(startPosition: number = 0): Promise<boolean> {
    if (!this.audioContext) {
      await this.initializeAudioContext();
    }
    
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    this.currentPosition = startPosition;
    
    // Check if we have enough buffer to start
    const availableBuffer = this.getAvailableBuffer(startPosition);
    
    if (availableBuffer < this.config.minAudioBuffer) {
      this.changeState('buffering');
      
      // Wait for sufficient buffer
      const hasBuffer = await this.waitForBuffer(startPosition, this.config.minAudioBuffer);
      
      if (!hasBuffer) {
        this.changeState('error');
        return false;
      }
    }
    
    // Start playback
    this.playbackStartTime = this.audioContext!.currentTime - (startPosition / 1000);
    this.isPlaying = true;
    this.changeState('playing');
    
    // Schedule audio chunks
    await this.scheduleAudioChunks(startPosition);
    
    // Start background preloading
    this.startBackgroundLoading();
    
    return true;
  }

  /**
   * Pause audio playback
   */
  pause(): void {
    if (!this.isPlaying) return;
    
    this.isPlaying = false;
    this.pausedAt = this.getCurrentPosition();
    
    // Stop all current audio sources
    for (const source of this.audioSources.values()) {
      try {
        source.stop();
      } catch (error) {
        // Source might already be stopped
      }
    }
    this.audioSources.clear();
    
    this.changeState('paused');
  }

  /**
   * Resume audio playback
   */
  async resume(): Promise<boolean> {
    if (this.playbackState !== 'paused') return false;
    
    return this.play(this.pausedAt);
  }

  /**
   * Stop audio playback
   */
  stop(): void {
    this.isPlaying = false;
    this.currentPosition = 0;
    this.pausedAt = 0;
    
    // Stop all audio sources
    for (const source of this.audioSources.values()) {
      try {
        source.stop();
      } catch (error) {
        // Source might already be stopped
      }
    }
    this.audioSources.clear();
    
    this.changeState('stopped');
  }

  /**
   * Seek to specific position
   */
  async seek(position: number): Promise<boolean> {
    const wasPlaying = this.isPlaying;
    
    if (this.isPlaying) {
      this.pause();
    }
    
    this.currentPosition = position;
    
    // Check buffer availability at new position
    const availableBuffer = this.getAvailableBuffer(position);
    
    if (availableBuffer < this.config.minAudioBuffer) {
      this.changeState('buffering');
      
      const hasBuffer = await this.waitForBuffer(position, this.config.minAudioBuffer);
      
      if (!hasBuffer) {
        return false;
      }
    }
    
    if (wasPlaying) {
      return this.play(position);
    }
    
    return true;
  }

  /**
   * Get current playback position
   */
  getCurrentPosition(): number {
    if (!this.isPlaying || !this.audioContext) {
      return this.currentPosition;
    }
    
    const elapsed = (this.audioContext.currentTime - this.playbackStartTime) * 1000;
    return Math.max(0, elapsed);
  }

  /**
   * Get available buffer at position
   */
  getAvailableBuffer(position: number): number {
    let bufferEnd = position;
    
    // Find continuous buffer from position
    const sortedChunks = Array.from(this.audioChunks.values())
      .filter(chunk => chunk.status === 'ready')
      .sort((a, b) => a.startTime - b.startTime);
    
    for (const chunk of sortedChunks) {
      if (chunk.startTime <= position && chunk.endTime > bufferEnd) {
        bufferEnd = chunk.endTime;
      } else if (chunk.startTime > bufferEnd) {
        break;
      }
    }
    
    return Math.max(0, bufferEnd - position);
  }

  /**
   * Get buffered regions for visualization
   */
  getBufferedRegions(): Array<{ startTime: number; endTime: number }> {
    return Array.from(this.audioChunks.values())
      .filter(chunk => chunk.status === 'ready')
      .map(chunk => ({
        startTime: chunk.startTime,
        endTime: chunk.endTime,
      }))
      .sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Set master volume
   */
  setVolume(volume: number): void {
    this.config.volume.master = Math.max(0, Math.min(1, volume));
    
    if (this.masterGainNode) {
      this.masterGainNode.gain.setValueAtTime(
        this.config.volume.master,
        this.audioContext!.currentTime
      );
    }
  }

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.config.volume.master;
  }

  /**
   * Get current playback state
   */
  getState(): AudioPlaybackState {
    return this.playbackState;
  }

  /**
   * Event handling
   */
  on<K extends keyof ProgressiveAudioEvents>(
    event: K,
    handler: (data: ProgressiveAudioEvents[K]) => void
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off<K extends keyof ProgressiveAudioEvents>(
    event: K,
    handler: (data: ProgressiveAudioEvents[K]) => void
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Cleanup and shutdown
   */
  shutdown(): void {
    this.stop();
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.audioChunks.clear();
    this.loadingChunks.clear();
    this.eventHandlers.clear();
    
    logger.info('Progressive Audio Manager shutdown complete');
  }

  // ========== Private Methods ==========

  /**
   * Initialize Web Audio API context
   */
  private async initializeAudioContext(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.config.quality.sampleRate,
      });
      
      // Create master gain node
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.connect(this.audioContext.destination);
      this.masterGainNode.gain.setValueAtTime(
        this.config.volume.master,
        this.audioContext.currentTime
      );
      
      logger.debug('Audio context initialized', {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state,
      });
    } catch (error) {
      logger.error('Failed to initialize audio context', error);
      throw error;
    }
  }

  /**
   * Load audio chunk data
   */
  private async loadAudioChunk(chunk: AudioChunk): Promise<void> {
    if (this.loadingChunks.has(chunk.id) || chunk.status === 'ready') {
      return;
    }
    
    this.loadingChunks.add(chunk.id);
    
    try {
      if (chunk.audioUrl) {
        // Load from URL
        const response = await fetch(chunk.audioUrl);
        chunk.audioData = await response.arrayBuffer();
      } else {
        // Generate audio from text (placeholder - would integrate with TTS service)
        chunk.audioData = await this.generateTextToSpeech(chunk.text, chunk.ssml);
      }
      
      chunk.status = 'ready';
      logger.debug('Audio chunk loaded', { chunkId: chunk.id, duration: chunk.endTime - chunk.startTime });
      
    } catch (error) {
      chunk.status = 'error';
      logger.error('Failed to load audio chunk', { chunkId: chunk.id, error });
      this.emit('error', { error: error as Error, chunk });
    } finally {
      this.loadingChunks.delete(chunk.id);
    }
  }

  /**
   * Generate TTS audio (placeholder implementation)
   */
  private async generateTextToSpeech(text: string, ssml?: string): Promise<ArrayBuffer> {
    // This would integrate with your TTS service (e.g., Ollama TTS)
    // For now, return a placeholder silent audio buffer
    
    if (!this.audioContext) {
      throw new Error('Audio context not initialized');
    }
    
    const duration = text.length * 0.1; // Rough estimate: 100ms per character
    const sampleRate = this.audioContext.sampleRate;
    const samples = Math.floor(duration * sampleRate);
    
    const audioBuffer = this.audioContext.createBuffer(1, samples, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    // Generate simple tone for demo (replace with actual TTS)
    for (let i = 0; i < samples; i++) {
      channelData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.1;
    }
    
    // Convert to ArrayBuffer format
    const buffer = new ArrayBuffer(samples * 4);
    const view = new Float32Array(buffer);
    view.set(channelData);
    
    return buffer;
  }

  /**
   * Schedule audio chunks for playback
   */
  private async scheduleAudioChunks(startPosition: number): Promise<void> {
    if (!this.audioContext || !this.masterGainNode) return;
    
    const relevantChunks = Array.from(this.audioChunks.values())
      .filter(chunk => 
        chunk.status === 'ready' && 
        chunk.endTime > startPosition &&
        chunk.startTime < startPosition + this.config.targetAudioBuffer
      )
      .sort((a, b) => a.startTime - b.startTime);
    
    for (const chunk of relevantChunks) {
      await this.scheduleAudioChunk(chunk, startPosition);
    }
  }

  /**
   * Schedule single audio chunk
   */
  private async scheduleAudioChunk(chunk: AudioChunk, startPosition: number): Promise<void> {
    if (!this.audioContext || !this.masterGainNode || !chunk.audioData) return;
    
    try {
      // Decode audio data
      const audioBuffer = await this.audioContext.decodeAudioData(chunk.audioData.slice(0));
      
      // Create audio source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Create gain node for crossfading
      const gainNode = this.audioContext.createGain();
      source.connect(gainNode);
      gainNode.connect(this.masterGainNode);
      
      // Calculate timing
      const chunkStartTime = Math.max(0, chunk.startTime - startPosition) / 1000;
      const playbackTime = this.audioContext.currentTime + chunkStartTime;
      
      // Apply crossfading
      if (this.config.crossfadeDuration > 0) {
        const crossfadeTime = this.config.crossfadeDuration / 1000;
        
        gainNode.gain.setValueAtTime(0, playbackTime);
        gainNode.gain.linearRampToValueAtTime(1, playbackTime + crossfadeTime);
        
        const endTime = playbackTime + (chunk.endTime - chunk.startTime) / 1000;
        gainNode.gain.setValueAtTime(1, endTime - crossfadeTime);
        gainNode.gain.linearRampToValueAtTime(0, endTime);
      }
      
      // Schedule playback
      source.start(playbackTime);
      source.stop(playbackTime + audioBuffer.duration);
      
      // Track source
      this.audioSources.set(chunk.id, source);
      
      // Event handlers
      source.onended = () => {
        this.audioSources.delete(chunk.id);
        this.emit('chunkEnded', { chunk, position: chunk.endTime });
      };
      
      this.emit('chunkStarted', { chunk, position: chunk.startTime });
      
    } catch (error) {
      logger.error('Failed to schedule audio chunk', { chunkId: chunk.id, error });
    }
  }

  /**
   * Wait for sufficient buffer
   */
  private async waitForBuffer(position: number, requiredBuffer: number): Promise<boolean> {
    const maxWaitTime = 5000; // 5 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const availableBuffer = this.getAvailableBuffer(position);
      
      if (availableBuffer >= requiredBuffer) {
        return true;
      }
      
      // Trigger loading of needed chunks
      await this.loadRequiredChunks(position, requiredBuffer);
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
  }

  /**
   * Load chunks required for position and buffer
   */
  private async loadRequiredChunks(position: number, buffer: number): Promise<void> {
    const endPosition = position + buffer;
    
    const requiredChunks = Array.from(this.audioChunks.values())
      .filter(chunk => 
        chunk.status === 'loading' &&
        chunk.startTime < endPosition &&
        chunk.endTime > position
      )
      .sort((a, b) => a.startTime - b.startTime);
    
    // Load chunks concurrently with limit
    const loadPromises = requiredChunks
      .slice(0, this.maxConcurrentLoads)
      .map(chunk => this.loadAudioChunk(chunk));
    
    await Promise.allSettled(loadPromises);
  }

  /**
   * Calculate chunk priority based on position
   */
  private calculateChunkPriority(chunkStartTime: number): 'low' | 'medium' | 'high' {
    const distance = Math.abs(chunkStartTime - this.currentPosition);
    
    if (distance <= this.config.minAudioBuffer) {
      return 'high';
    } else if (distance <= this.config.targetAudioBuffer) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Check if chunk should be preloaded
   */
  private shouldPreload(chunk: AudioChunk): boolean {
    if (!this.config.enablePreloading) return false;
    
    const distance = chunk.startTime - this.currentPosition;
    return distance <= this.config.targetAudioBuffer;
  }

  /**
   * Queue chunk for background preloading
   */
  private queueForPreloading(chunkId: string): void {
    if (!this.preloadQueue.includes(chunkId)) {
      this.preloadQueue.push(chunkId);
    }
  }

  /**
   * Start background loading
   */
  private startBackgroundLoading(): void {
    const processQueue = async () => {
      while (this.preloadQueue.length > 0 && this.currentLoads < this.maxConcurrentLoads) {
        const chunkId = this.preloadQueue.shift();
        if (chunkId) {
          const chunk = this.audioChunks.get(chunkId);
          if (chunk && chunk.status === 'loading') {
            this.currentLoads++;
            this.loadAudioChunk(chunk).finally(() => {
              this.currentLoads--;
            });
          }
        }
      }
      
      if (this.isPlaying) {
        setTimeout(processQueue, 1000); // Check every second
      }
    };
    
    processQueue();
  }

  /**
   * Change playback state and emit events
   */
  private changeState(newState: AudioPlaybackState): void {
    const oldState = this.playbackState;
    
    if (oldState === newState) return;
    
    this.playbackState = newState;
    this.emit('stateChanged', { oldState, newState });
    
    logger.debug('Audio state changed', { from: oldState, to: newState });
  }

  /**
   * Emit event to handlers
   */
  private emit<K extends keyof ProgressiveAudioEvents>(
    event: K,
    data: ProgressiveAudioEvents[K]
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          logger.error('Error in audio event handler', { event, error });
        }
      });
    }
  }
}

export default ProgressiveAudioManager;