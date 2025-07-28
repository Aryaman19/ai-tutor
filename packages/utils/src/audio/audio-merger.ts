import { createServiceLogger } from '../logger';

const logger = createServiceLogger('AudioMerger');

export interface AudioSegment {
  audioUrl: string;
  slideNumber: number;
  text: string;
  duration: number;
  startTime?: number;
  endTime?: number;
}

export interface MergedAudioResult {
  audioBlob: Blob;
  audioUrl: string;
  totalDuration: number;
  segments: Array<{
    slideNumber: number;
    startTime: number;
    endTime: number;
    text: string;
  }>;
}

export interface CrossfadeOptions {
  crossfadeDuration: number; // Duration in seconds
  outputSampleRate: number;
  outputFormat: 'wav' | 'mp3';
  fadeType: 'linear' | 'exponential' | 'logarithmic';
}

/**
 * AudioMerger class for combining multiple audio files with crossfade transitions
 * Uses Web Audio API for high-quality audio processing
 */
export class AudioMerger {
  private audioContext: AudioContext | null = null;
  private options: CrossfadeOptions;

  constructor(options: Partial<CrossfadeOptions> = {}) {
    this.options = {
      crossfadeDuration: 1.5, // 1500ms default for smoother transitions
      outputSampleRate: 44100,
      outputFormat: 'wav',
      fadeType: 'exponential',
      ...options
    };

    logger.debug('AudioMerger initialized', { options: this.options });
  }

  /**
   * Initialize Web Audio API context
   */
  private async initializeAudioContext(): Promise<void> {
    if (this.audioContext) return;

    try {
      // Use existing AudioContext or create new one
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.options.outputSampleRate
      });

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      logger.debug('AudioContext initialized', {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state
      });
    } catch (error) {
      logger.error('Failed to initialize AudioContext:', error);
      throw new Error('Web Audio API not supported or failed to initialize');
    }
  }

  /**
   * Load audio file as AudioBuffer
   */
  private async loadAudioBuffer(audioUrl: string): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    try {
      logger.debug('Loading audio buffer', { audioUrl });

      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      logger.debug('Audio buffer loaded', {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels
      });

      return audioBuffer;
    } catch (error) {
      logger.error('Failed to load audio buffer:', error);
      throw new Error(`Failed to load audio from ${audioUrl}: ${error}`);
    }
  }

  /**
   * Create fade curve for crossfade transition
   */
  private createFadeCurve(length: number, fadeIn: boolean): Float32Array {
    const curve = new Float32Array(length);
    const { fadeType } = this.options;

    for (let i = 0; i < length; i++) {
      const progress = i / (length - 1);
      let value: number;

      switch (fadeType) {
        case 'linear':
          value = fadeIn ? progress : 1 - progress;
          break;
        case 'exponential':
          value = fadeIn ? Math.pow(progress, 2) : Math.pow(1 - progress, 2);
          break;
        case 'logarithmic':
          value = fadeIn ? Math.log10(1 + 9 * progress) : Math.log10(1 + 9 * (1 - progress));
          break;
        default:
          value = fadeIn ? progress : 1 - progress;
      }

      curve[i] = Math.max(0, Math.min(1, value));
    }

    return curve;
  }

  /**
   * Apply crossfade between two audio buffers
   */
  private applyCrossfade(
    buffer1: AudioBuffer,
    buffer2: AudioBuffer,
    crossfadeSeconds: number
  ): AudioBuffer {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    const sampleRate = this.audioContext.sampleRate;
    const crossfadeSamples = Math.floor(crossfadeSeconds * sampleRate);
    
    // Calculate output buffer length
    const totalLength = buffer1.length + buffer2.length - crossfadeSamples;
    const numberOfChannels = Math.max(buffer1.numberOfChannels, buffer2.numberOfChannels);

    // Create output buffer
    const outputBuffer = this.audioContext.createBuffer(
      numberOfChannels,
      totalLength,
      sampleRate
    );

    // Create fade curves
    const fadeOutCurve = this.createFadeCurve(crossfadeSamples, false);
    const fadeInCurve = this.createFadeCurve(crossfadeSamples, true);

    logger.debug('Applying crossfade', {
      buffer1Length: buffer1.length / sampleRate,
      buffer2Length: buffer2.length / sampleRate,
      crossfadeSeconds,
      totalDuration: totalLength / sampleRate
    });

    // Process each channel
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const outputData = outputBuffer.getChannelData(channel);
      
      // Get input channel data (use channel 0 if input has fewer channels)
      const buffer1Data = buffer1.getChannelData(Math.min(channel, buffer1.numberOfChannels - 1));
      const buffer2Data = buffer2.getChannelData(Math.min(channel, buffer2.numberOfChannels - 1));

      // Copy first buffer (before crossfade)
      const buffer1PreCrossfade = buffer1.length - crossfadeSamples;
      for (let i = 0; i < buffer1PreCrossfade; i++) {
        outputData[i] = buffer1Data[i];
      }

      // Apply crossfade
      for (let i = 0; i < crossfadeSamples; i++) {
        const buffer1Index = buffer1PreCrossfade + i;
        const buffer2Index = i;
        const outputIndex = buffer1PreCrossfade + i;

        const sample1 = buffer1Data[buffer1Index] * fadeOutCurve[i];
        const sample2 = buffer2Data[buffer2Index] * fadeInCurve[i];

        outputData[outputIndex] = sample1 + sample2;
      }

      // Copy second buffer (after crossfade)
      const buffer2PostCrossfade = crossfadeSamples;
      const outputPostCrossfade = buffer1PreCrossfade + crossfadeSamples;
      
      for (let i = buffer2PostCrossfade; i < buffer2.length; i++) {
        const outputIndex = outputPostCrossfade + (i - buffer2PostCrossfade);
        outputData[outputIndex] = buffer2Data[i];
      }
    }

    return outputBuffer;
  }

  /**
   * Convert AudioBuffer to Blob
   */
  private audioBufferToBlob(audioBuffer: AudioBuffer, format: 'wav' | 'mp3' = 'wav'): Blob {
    if (format === 'mp3') {
      throw new Error('MP3 encoding not implemented yet. Use WAV format.');
    }

    // Convert to WAV format
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const bytesPerSample = 2; // 16-bit
    const byteRate = sampleRate * numberOfChannels * bytesPerSample;
    const blockAlign = numberOfChannels * bytesPerSample;
    const dataSize = length * numberOfChannels * bytesPerSample;
    const headerSize = 44;
    
    const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM format chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // 16-bit
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Audio data
    let offset = headerSize;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
        const intSample = Math.floor(sample * 0x7FFF);
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Merge multiple audio segments with crossfade transitions
   */
  async mergeWithCrossfade(audioSegments: AudioSegment[]): Promise<MergedAudioResult> {
    if (!audioSegments || audioSegments.length === 0) {
      throw new Error('No audio segments provided');
    }

    logger.debug('Starting audio merge process', { 
      segmentCount: audioSegments.length,
      crossfadeDuration: this.options.crossfadeDuration
    });

    await this.initializeAudioContext();

    try {
      // Load all audio buffers
      const audioBuffers: AudioBuffer[] = [];
      for (const segment of audioSegments) {
        const buffer = await this.loadAudioBuffer(segment.audioUrl);
        audioBuffers.push(buffer);
      }

      if (audioBuffers.length === 1) {
        // Single audio file, no merging needed
        const singleBuffer = audioBuffers[0];
        const audioBlob = this.audioBufferToBlob(singleBuffer, this.options.outputFormat);
        const audioUrl = URL.createObjectURL(audioBlob);

        return {
          audioBlob,
          audioUrl,
          totalDuration: singleBuffer.duration,
          segments: [{
            slideNumber: audioSegments[0].slideNumber,
            startTime: 0,
            endTime: singleBuffer.duration,
            text: audioSegments[0].text
          }]
        };
      }

      // Merge multiple buffers with crossfade
      let mergedBuffer = audioBuffers[0];
      const segments = [];
      let currentTime = 0;
      const crossfadeSeconds = this.options.crossfadeDuration;

      // First segment
      segments.push({
        slideNumber: audioSegments[0].slideNumber,
        startTime: currentTime,
        endTime: currentTime + mergedBuffer.duration - crossfadeSeconds,
        text: audioSegments[0].text
      });
      currentTime += mergedBuffer.duration - crossfadeSeconds;

      // Merge remaining buffers
      for (let i = 1; i < audioBuffers.length; i++) {
        logger.debug(`Merging buffer ${i + 1}/${audioBuffers.length}`);
        
        const currentBuffer = audioBuffers[i];
        mergedBuffer = this.applyCrossfade(mergedBuffer, currentBuffer, crossfadeSeconds);

        // Add segment info
        const segmentDuration = currentBuffer.duration - (i < audioBuffers.length - 1 ? crossfadeSeconds : 0);
        segments.push({
          slideNumber: audioSegments[i].slideNumber,
          startTime: currentTime,
          endTime: currentTime + segmentDuration,
          text: audioSegments[i].text
        });
        currentTime += segmentDuration;
      }

      // Convert final buffer to blob
      const audioBlob = this.audioBufferToBlob(mergedBuffer, this.options.outputFormat);
      const audioUrl = URL.createObjectURL(audioBlob);

      const result: MergedAudioResult = {
        audioBlob,
        audioUrl,
        totalDuration: mergedBuffer.duration,
        segments
      };

      logger.debug('Audio merge completed', {
        totalDuration: result.totalDuration,
        segmentCount: result.segments.length,
        audioBlobSize: audioBlob.size
      });

      return result;

    } catch (error) {
      logger.error('Audio merge failed:', error);
      throw new Error(`Audio merge failed: ${error}`);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
      logger.debug('AudioContext disposed');
    }
  }

  /**
   * Check if Web Audio API is supported
   */
  static isSupported(): boolean {
    return !!(window.AudioContext || (window as any).webkitAudioContext);
  }

  /**
   * Get estimated merge time for progress tracking
   */
  static estimateMergeTime(segmentCount: number, avgDuration: number): number {
    // Rough estimate: ~100ms per second of audio to process
    return segmentCount * avgDuration * 0.1;
  }
}

export default AudioMerger;