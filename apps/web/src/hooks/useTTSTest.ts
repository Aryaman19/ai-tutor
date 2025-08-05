import { useState, useRef, useEffect } from 'react';
import { useStreamingTTS, useTTSAvailability } from '@ai-tutor/hooks';
import { ttsApi } from '@ai-tutor/api-client';
import type { VoiceMetadata } from '@ai-tutor/types';

interface StreamingDebugInfo {
  playbackAttempts: Array<{
    type: string;
    timestamp: string;
    details?: any;
  }>;
  audioErrors: Array<{
    error: string;
    timestamp: string;
  }>;
  lastPlayTrigger: string | null;
}

export const useTTSTest = () => {
  // State
  const [testText, setTestText] = useState(
    'Hello, this is a test of the text-to-speech system. We will generate audio and play it back to ensure everything is working correctly.'
  );
  const [selectedVoice, setSelectedVoice] = useState('');
  const [testMode, setTestMode] = useState<'regular' | 'streaming' | 'browser'>('regular');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [streamingDebug, setStreamingDebug] = useState<StreamingDebugInfo>({
    playbackAttempts: [],
    audioErrors: [],
    lastPlayTrigger: null,
  });
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [piperVoices, setPiperVoices] = useState<VoiceMetadata[]>([]);
  const [currentRegularText, setCurrentRegularText] = useState('');
  const [currentStreamingText, setCurrentStreamingText] = useState('');

  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  // TTS Hooks
  const { data: ttsAvailability } = useTTSAvailability();

  // Simplified regular TTS (using browser TTS)
  const regularTTS = {
    status: { isReady: true },
    controls: {
      play: () => Promise.resolve(),
      pause: () => {},
      stop: () => {},
      seek: () => {},
      setVolume: () => {},
    },
    regenerate: () => {},
    audioElement: null,
  };

  // Streaming TTS Hook
  const streamingTTS = useStreamingTTS(currentStreamingText, {
    voice: selectedVoice || undefined,
    autoPlay: false,
    maxChunkSize: 50,
    onPlay: () => {
      setDebugInfo((prev: Record<string, any>) => ({ ...prev, streamingTTS: 'playing' }));
      setStreamingDebug((prev: StreamingDebugInfo) => ({
        ...prev,
        playbackAttempts: [...prev.playbackAttempts, {
          type: 'onPlay_callback',
          timestamp: new Date().toISOString(),
        }],
      }));
    },
    onEnd: () => {
      setDebugInfo((prev: Record<string, any>) => ({ ...prev, streamingTTS: 'ended' }));
      setStreamingDebug((prev: StreamingDebugInfo) => ({
        ...prev,
        playbackAttempts: [...prev.playbackAttempts, {
          type: 'onEnd_callback',
          timestamp: new Date().toISOString(),
        }],
      }));
    },
    onError: (error: any) => {
      setDebugInfo((prev: Record<string, any>) => ({ ...prev, streamingTTS: `error: ${error.message}` }));
      setStreamingDebug((prev: StreamingDebugInfo) => ({
        ...prev,
        audioErrors: [...prev.audioErrors, {
          error: error.message,
          timestamp: new Date().toISOString(),
        }],
      }));
    },
    onChunkReady: (chunk: any) => {
      setDebugInfo((prev: Record<string, any>) => ({ 
        ...prev, 
        streamingChunk: `Chunk ${chunk.index}: ${chunk.text?.substring(0, 30)}...` 
      }));
    },
  });

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices();
        setBrowserVoices(voices);
      }
    };

    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
      return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    }
  }, []);

  // Load Piper voices
  useEffect(() => {
    const loadPiperVoices = async () => {
      try {
        // Simplified - just use empty array for now
        setPiperVoices([]);
      } catch (error) {
        // Failed to load Piper voices
      }
    };

    loadPiperVoices();
  }, []);

  // Test functions
  const testRegularTTS = () => {
    setCurrentRegularText(testText);
    setStreamingDebug((prev: StreamingDebugInfo) => ({
      ...prev,
      lastPlayTrigger: `Regular TTS - ${new Date().toISOString()}`,
    }));
  };

  const testStreamingTTS = () => {
    setCurrentStreamingText(testText);
    setStreamingDebug((prev: StreamingDebugInfo) => ({
      ...prev,
      lastPlayTrigger: `Streaming TTS - ${new Date().toISOString()}`,
    }));
  };

  const testBrowserTTS = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setDebugInfo((prev: Record<string, any>) => ({ ...prev, browserTTS: 'not supported' }));
      return;
    }

    // Stop any existing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(testText);
    
    if (selectedVoice) {
      const voice = browserVoices.find(v => v.name === selectedVoice);
      if (voice) {
        utterance.voice = voice;
      }
    }

    utterance.onstart = () => setDebugInfo((prev: Record<string, any>) => ({ ...prev, browserTTS: 'playing' }));
    utterance.onend = () => setDebugInfo((prev: Record<string, any>) => ({ ...prev, browserTTS: 'ended' }));
    utterance.onerror = (error) => setDebugInfo((prev: Record<string, any>) => ({ ...prev, browserTTS: `error: ${error.error}` }));

    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    
    setStreamingDebug((prev: StreamingDebugInfo) => ({
      ...prev,
      lastPlayTrigger: `Browser TTS - ${new Date().toISOString()}`,
    }));
  };

  const stopAllAudio = () => {
    // Stop streaming TTS
    if (streamingTTS?.controls?.stop) {
      streamingTTS.controls.stop();
    }

    // Stop browser TTS
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Reset texts to stop hooks
    setCurrentRegularText('');
    setCurrentStreamingText('');
    
    setDebugInfo({});
  };

  const clearDebugInfo = () => {
    setDebugInfo({});
    setStreamingDebug({
      playbackAttempts: [],
      audioErrors: [],
      lastPlayTrigger: null,
    });
  };

  return {
    // State
    testText,
    setTestText,
    selectedVoice,
    setSelectedVoice,
    testMode,
    setTestMode,
    audioUrl,
    setAudioUrl,
    debugInfo,
    streamingDebug,
    browserVoices,
    piperVoices,
    
    // TTS data
    ttsAvailability,
    regularTTS,
    streamingTTS,
    
    // Refs
    audioRef,
    speechRef,
    
    // Actions
    testRegularTTS,
    testStreamingTTS,
    testBrowserTTS,
    stopAllAudio,
    clearDebugInfo,
  };
};