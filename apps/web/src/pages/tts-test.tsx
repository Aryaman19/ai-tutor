import React, { useState, useRef, useEffect } from 'react';
import { useTTSAudio, useStreamingTTS, useTTSAvailability, useTTSSettings } from '@ai-tutor/hooks';
import { ttsApi } from '@ai-tutor/api-client';
import { Button } from '@ai-tutor/ui';
import { cn } from '@ai-tutor/utils';

const TTSTestPage = () => {
  const [testText, setTestText] = useState('Hello, this is a test of the text-to-speech system. We will generate audio and play it back to ensure everything is working correctly.');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [testMode, setTestMode] = useState<'regular' | 'streaming' | 'browser'>('regular');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [currentRegularText, setCurrentRegularText] = useState('');
  const [currentStreamingText, setCurrentStreamingText] = useState('');
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  // TTS Hooks
  const { data: ttsAvailability } = useTTSAvailability();
  const { data: ttsSettings } = useTTSSettings();
  
  // Regular TTS - only trigger when currentRegularText changes
  const regularTTS = useTTSAudio(currentRegularText, {
    voice: selectedVoice || undefined,
    autoPlay: false,
    onPlay: () => setDebugInfo(prev => ({ ...prev, regularTTS: 'playing' })),
    onEnd: () => setDebugInfo(prev => ({ ...prev, regularTTS: 'ended' })),
    onError: (error) => setDebugInfo(prev => ({ ...prev, regularTTS: `error: ${error.message}` })),
  });
  
  // Streaming TTS - only trigger when currentStreamingText changes
  const streamingTTS = useStreamingTTS(currentStreamingText, {
    voice: selectedVoice || undefined,
    autoPlay: false,
    maxChunkSize: 50,
    onPlay: () => setDebugInfo(prev => ({ ...prev, streamingTTS: 'playing' })),
    onEnd: () => setDebugInfo(prev => ({ ...prev, streamingTTS: 'ended' })),
    onError: (error) => setDebugInfo(prev => ({ ...prev, streamingTTS: `error: ${error.message}` })),
    onChunkReady: (chunk) => setDebugInfo(prev => ({ 
      ...prev, 
      streamingChunks: [...(prev.streamingChunks || []), chunk] 
    })),
  });
  
  // Load browser voices
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        setBrowserVoices(voices);
      }
    };
    
    loadVoices();
    
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);
  
  // Test API endpoint directly
  const testDirectAPI = async () => {
    try {
      setDebugInfo(prev => ({ ...prev, directAPI: 'testing...' }));
      
      // Test availability
      const availability = await ttsApi.checkAvailability();
      setDebugInfo(prev => ({ ...prev, availability }));
      
      // Test regular generation
      const result = await ttsApi.generateAudio({ text: testText, voice: selectedVoice || undefined });
      setDebugInfo(prev => ({ ...prev, directAPI: result }));
      
      // Set audio URL for manual testing
      const fullUrl = `${window.location.origin}/api/tts/audio/${result.audio_id}`;
      setAudioUrl(fullUrl);
      
      if (audioRef.current) {
        audioRef.current.src = fullUrl;
        audioRef.current.load();
      }
      
    } catch (error) {
      setDebugInfo(prev => ({ ...prev, directAPI: `error: ${error.message}` }));
    }
  };
  
  // Test browser TTS
  const testBrowserTTS = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setDebugInfo(prev => ({ ...prev, browserTTS: 'not supported' }));
      return;
    }
    
    // Stop any existing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(testText);
    
    // Set voice if selected
    if (selectedVoice) {
      const voice = browserVoices.find(v => v.name === selectedVoice);
      if (voice) {
        utterance.voice = voice;
      }
    }
    
    utterance.onstart = () => setDebugInfo(prev => ({ ...prev, browserTTS: 'started' }));
    utterance.onend = () => setDebugInfo(prev => ({ ...prev, browserTTS: 'ended' }));
    utterance.onerror = (error) => setDebugInfo(prev => ({ ...prev, browserTTS: `error: ${error.error}` }));
    
    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    
    setDebugInfo(prev => ({ ...prev, browserTTS: 'speaking...' }));
  };
  
  // Stop all TTS
  const stopAll = () => {
    // Stop regular TTS
    regularTTS.controls.stop();
    setCurrentRegularText('');
    
    // Stop streaming TTS
    streamingTTS.controls.stop();
    streamingTTS.controls.cancel();
    setCurrentStreamingText('');
    
    // Stop browser TTS
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    // Stop direct audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    setDebugInfo(prev => ({ ...prev, stopped: new Date().toISOString() }));
  };
  
  return (
    <div className="h-full overflow-y-auto">
      <div className="min-h-full bg-background">
        <div className="container mx-auto p-6 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6 text-foreground">TTS Test Page</h1>
      
      {/* Text Input */}
      <div className="mb-6">
        <label htmlFor="test-text" className="block text-sm font-medium mb-2 text-foreground">
          Test Text
        </label>
        <textarea
          id="test-text"
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          className="w-full h-32 p-3 border border-border rounded-md resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors bg-background text-foreground placeholder:text-muted-foreground"
          placeholder="Enter text to test TTS..."
        />
      </div>
      
      {/* Voice Selection */}
      <div className="mb-6">
        <label htmlFor="voice-select" className="block text-sm font-medium mb-2 text-foreground">
          Voice Selection
        </label>
        <select
          id="voice-select"
          value={selectedVoice}
          onChange={(e) => setSelectedVoice(e.target.value)}
          className="w-full p-2 border border-border rounded-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors bg-background text-foreground"
        >
          <option value="">Default Voice</option>
          <option value="en_US-lessac-medium">Piper: Lessac (Medium)</option>
          {browserVoices.map((voice) => (
            <option key={voice.name} value={voice.name}>
              Browser: {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
      </div>
      
      {/* Test Mode Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-foreground">Test Mode</label>
        <div className="flex gap-4">
          <label className="flex items-center text-foreground">
            <input
              type="radio"
              value="regular"
              checked={testMode === 'regular'}
              onChange={(e) => setTestMode(e.target.value as any)}
              className="mr-2 text-primary"
            />
            Regular TTS
          </label>
          <label className="flex items-center text-foreground">
            <input
              type="radio"
              value="streaming"
              checked={testMode === 'streaming'}
              onChange={(e) => setTestMode(e.target.value as any)}
              className="mr-2 text-primary"
            />
            Streaming TTS
          </label>
          <label className="flex items-center text-foreground">
            <input
              type="radio"
              value="browser"
              checked={testMode === 'browser'}
              onChange={(e) => setTestMode(e.target.value as any)}
              className="mr-2 text-primary"
            />
            Browser TTS
          </label>
        </div>
      </div>
      
      {/* Control Buttons */}
      <div className="mb-6 flex gap-4 flex-wrap">
        <Button
          onClick={() => {
            if (testMode === 'regular') {
              setCurrentRegularText(testText);
              // Give it a moment to process, then play
              setTimeout(() => {
                regularTTS.controls.play();
              }, 100);
            } else if (testMode === 'streaming') {
              setCurrentStreamingText(testText);
              // Give it a moment to process, then play
              setTimeout(() => {
                streamingTTS.controls.play();
              }, 100);
            } else if (testMode === 'browser') {
              testBrowserTTS();
            }
          }}
          disabled={
            (testMode === 'regular' && (regularTTS.status.isLoading || regularTTS.status.isPlaying)) ||
            (testMode === 'streaming' && (streamingTTS.status.isGenerating || streamingTTS.status.isPlaying))
          }
          className="bg-green-500 hover:bg-green-600 text-white"
        >
          {testMode === 'regular' && regularTTS.status.isLoading && '⏳ Generating...'}
          {testMode === 'regular' && regularTTS.status.isPlaying && '🔊 Playing...'}
          {testMode === 'regular' && !regularTTS.status.isLoading && !regularTTS.status.isPlaying && 'Play Regular TTS'}
          
          {testMode === 'streaming' && streamingTTS.status.isGenerating && '⏳ Generating...'}
          {testMode === 'streaming' && streamingTTS.status.isPlaying && '🔊 Playing...'}
          {testMode === 'streaming' && !streamingTTS.status.isGenerating && !streamingTTS.status.isPlaying && 'Play Streaming TTS'}
          
          {testMode === 'browser' && 'Play Browser TTS'}
        </Button>
        
        <Button
          onClick={stopAll}
          className="bg-red-500 hover:bg-red-600 text-white"
        >
          Stop All
        </Button>
        
        <Button
          onClick={() => {
            if (testMode === 'regular') {
              setCurrentRegularText(testText);
            } else if (testMode === 'streaming') {
              setCurrentStreamingText(testText);
            }
          }}
          className="bg-blue-500 hover:bg-blue-600 text-white"
        >
          Generate {testMode === 'regular' ? 'Regular' : testMode === 'streaming' ? 'Streaming' : 'Browser'} TTS
        </Button>
        
        <Button
          onClick={testDirectAPI}
          className="bg-purple-500 hover:bg-purple-600 text-white"
        >
          Test Direct API
        </Button>
      </div>
      
      {/* Direct Audio Player */}
      {audioUrl && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2 text-foreground">Direct Audio Player</h3>
          <audio
            ref={audioRef}
            controls
            className="w-full"
            preload="metadata"
            crossOrigin="anonymous"
          >
            <source src={audioUrl} type="audio/wav" />
            Your browser does not support the audio element.
          </audio>
          <p className="text-sm text-muted-foreground mt-1">
            Audio URL: <a href={audioUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{audioUrl}</a>
          </p>
        </div>
      )}
      
      {/* Current Status */}
      <div className="mb-6 bg-primary/10 p-4 rounded-lg border border-primary/20">
        <h3 className="text-lg font-semibold mb-2 text-foreground">Current Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h4 className="font-medium text-foreground">Regular TTS</h4>
            <p className="text-sm text-muted-foreground">Text: {currentRegularText ? 'Set' : 'Not set'}</p>
            <p className="text-sm text-muted-foreground">Status: {regularTTS.status.isLoading ? 'Loading' : regularTTS.status.isPlaying ? 'Playing' : 'Ready'}</p>
            <p className="text-sm text-muted-foreground">Error: {regularTTS.status.error || 'None'}</p>
          </div>
          <div>
            <h4 className="font-medium text-foreground">Streaming TTS</h4>
            <p className="text-sm text-muted-foreground">Text: {currentStreamingText ? 'Set' : 'Not set'}</p>
            <p className="text-sm text-muted-foreground">Status: {streamingTTS.status.isGenerating ? 'Generating' : streamingTTS.status.isPlaying ? 'Playing' : 'Ready'}</p>
            <p className="text-sm text-muted-foreground">Progress: {streamingTTS.status.progress}%</p>
            <p className="text-sm text-muted-foreground">Chunks: {streamingTTS.status.generatedChunks}/{streamingTTS.status.totalChunks}</p>
            <p className="text-sm text-muted-foreground">Error: {streamingTTS.status.error || 'None'}</p>
          </div>
          <div>
            <h4 className="font-medium text-foreground">Test Mode</h4>
            <p className="text-sm text-muted-foreground">Current: {testMode}</p>
            <p className="text-sm text-muted-foreground">Voice: {selectedVoice || 'Default'}</p>
            <p className="text-sm text-muted-foreground">TTS Available: {ttsAvailability?.available ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </div>
      
      {/* Status Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TTS Availability */}
        <div className="bg-card p-4 rounded-lg border border-border">
          <h3 className="text-lg font-semibold mb-2 text-foreground">TTS Availability</h3>
          <pre className="text-sm bg-background p-2 rounded border border-border overflow-auto text-foreground">
            {JSON.stringify(ttsAvailability, null, 2)}
          </pre>
        </div>
        
        {/* TTS Settings */}
        <div className="bg-card p-4 rounded-lg border border-border">
          <h3 className="text-lg font-semibold mb-2 text-foreground">TTS Settings</h3>
          <pre className="text-sm bg-background p-2 rounded border border-border overflow-auto text-foreground">
            {JSON.stringify(ttsSettings, null, 2)}
          </pre>
        </div>
        
        {/* Regular TTS Status */}
        <div className="bg-card p-4 rounded-lg border border-border">
          <h3 className="text-lg font-semibold mb-2 text-foreground">Regular TTS Status</h3>
          <pre className="text-sm bg-background p-2 rounded border border-border overflow-auto text-foreground">
            {JSON.stringify(regularTTS.status, null, 2)}
          </pre>
        </div>
        
        {/* Streaming TTS Status */}
        <div className="bg-card p-4 rounded-lg border border-border">
          <h3 className="text-lg font-semibold mb-2 text-foreground">Streaming TTS Status</h3>
          <pre className="text-sm bg-background p-2 rounded border border-border overflow-auto text-foreground">
            {JSON.stringify(streamingTTS.status, null, 2)}
          </pre>
        </div>
      </div>
      
      {/* Debug Information */}
      <div className="mt-6 bg-gray-50 p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Debug Information</h3>
        <pre className="text-sm bg-white p-2 rounded border overflow-auto max-h-96">
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TTSTestPage;