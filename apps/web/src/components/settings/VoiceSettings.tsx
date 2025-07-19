import React, { useState, useRef, useEffect } from "react";
import { Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, Input, Button } from "@ai-tutor/ui";
import type { TTSSettings, VoiceMetadata } from "@ai-tutor/types";
import { useTTSVoices, useTTSAudio, useStreamingTTS, useTTSAvailability } from "@ai-tutor/hooks";
import { VoiceDownloadManager } from "../voice/VoiceDownloadManager";
import { useQueryClient } from "@tanstack/react-query";
import { ttsApi } from "@ai-tutor/api-client";

interface VoiceSettingsProps {
  data?: TTSSettings;
  browserVoices?: string[];
  onChange: (data: Partial<TTSSettings>) => void;
}

const VoiceSettingsComponent: React.FC<VoiceSettingsProps> = ({ data, browserVoices, onChange }) => {
  const [selectedProvider, setSelectedProvider] = useState(data?.provider || "browser");
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isVoiceManagerOpen, setIsVoiceManagerOpen] = useState(false);
  const [voiceRefreshTrigger, setVoiceRefreshTrigger] = useState(0);
  
  // TTS Testing State
  const [testText, setTestText] = useState('Hello, this is a test of the text-to-speech system.');
  const [testMode, setTestMode] = useState<'regular' | 'streaming' | 'browser'>('regular');
  const [currentRegularText, setCurrentRegularText] = useState('');
  const [currentStreamingText, setCurrentStreamingText] = useState('');
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [piperVoicesForTest, setPiperVoicesForTest] = useState<VoiceMetadata[]>([]);
  const [browserVoicesForTest, setBrowserVoicesForTest] = useState<SpeechSynthesisVoice[]>([]);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Get Piper voices from API
  const { data: piperVoices, isLoading: isPiperVoicesLoading, refetch: refetchVoices } = useTTSVoices();
  const queryClient = useQueryClient();
  
  // TTS Testing Hooks
  const { data: ttsAvailability } = useTTSAvailability();
  
  // Get the current voice for testing - memoized to avoid stale closures
  const getCurrentVoiceForTest = React.useCallback(() => {
    if (selectedProvider === 'piper') {
      // For Piper, data?.voice should already be the voice ID
      return data?.voice;
    }
    return data?.voice;
  }, [selectedProvider, data?.voice]);
  
  // Get current voice ID for hooks
  const currentVoiceId = getCurrentVoiceForTest();
  
  // Regular TTS - only trigger when currentRegularText changes
  const regularTTS = useTTSAudio(currentRegularText, {
    voice: currentVoiceId || undefined,
    autoPlay: false,
    speed: data?.speed || 1.0,
    volume: data?.volume || 1.0,
    onPlay: () => setDebugInfo((prev: any) => ({ ...prev, regularTTS: 'playing' })),
    onEnd: () => setDebugInfo((prev: any) => ({ ...prev, regularTTS: 'ended' })),
    onError: (error: any) => setDebugInfo((prev: any) => ({ ...prev, regularTTS: `error: ${error.message}` })),
  });
  
  // Streaming TTS - only trigger when currentStreamingText changes
  const streamingTTS = useStreamingTTS(currentStreamingText, {
    voice: currentVoiceId || undefined,
    autoPlay: false,
    speed: data?.speed || 1.0,
    volume: data?.volume || 1.0,
    maxChunkSize: 50,
    onPlay: () => setDebugInfo((prev: any) => ({ ...prev, streamingTTS: 'playing' })),
    onEnd: () => setDebugInfo((prev: any) => ({ ...prev, streamingTTS: 'ended' })),
    onError: (error: any) => setDebugInfo((prev: any) => ({ ...prev, streamingTTS: `error: ${error.message}` })),
  });

  const providers = [
    { value: "browser", label: "Browser (Built-in)" },
    { value: "piper", label: "Piper (Offline)" },
  ];

  // Update the selectedProvider when data changes (e.g., from reset)
  React.useEffect(() => {
    if (data?.provider && data.provider !== selectedProvider) {
      setSelectedProvider(data.provider);
    }
  }, [data?.provider, selectedProvider]);

  React.useEffect(() => {
    const loadVoices = async () => {
      setIsLoadingVoices(true);
      
      let voices: string[] = [];
      if (selectedProvider === "browser") {
        voices = browserVoices || ["Default"];
        setAvailableVoices(voices);
      } else if (selectedProvider === "piper") {
        voices = piperVoices?.map(voice => voice.id) || ["en_US-lessac-medium"];
        setAvailableVoices(voices);
      }
      
      
      // Only auto-select first voice if:
      // 1. We have voices available AND
      // 2. Either no voice is selected OR the current voice doesn't exist in available voices AND
      // 3. The data object exists (settings have loaded) to avoid overriding during initial load AND
      // 4. For piper provider, ensure TTS voices have actually loaded (not just showing default)
      const shouldAutoSelect = voices.length > 0 && 
                              data && 
                              (!data.voice || !voices.includes(data.voice)) &&
                              (selectedProvider !== "piper" || !isPiperVoicesLoading);
      
      if (shouldAutoSelect) {
        onChange({ voice: voices[0] });
      }
      
      setIsLoadingVoices(false);
    };

    loadVoices();
  }, [selectedProvider, browserVoices, piperVoices, voiceRefreshTrigger, data?.voice, onChange]);
  
  // Load browser voices for testing
  useEffect(() => {
    const loadBrowserVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        setBrowserVoicesForTest(voices);
      }
    };
    
    loadBrowserVoices();
    
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadBrowserVoices;
    }
  }, []);

  // Load Piper voices for testing
  useEffect(() => {
    const loadPiperVoices = async () => {
      try {
        const voices = await ttsApi.getInstalledVoices();
        setPiperVoicesForTest(voices);
      } catch (error) {
        console.error('Failed to load Piper voices:', error);
      }
    };
    
    loadPiperVoices();
  }, [piperVoices]);

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    
    // Get voices for the new provider and set the first one as default
    let defaultVoice = "";
    if (provider === "browser") {
      const voices = browserVoices || ["Default"];
      defaultVoice = voices[0] || "";
    } else if (provider === "piper") {
      const voices = piperVoices?.map(voice => voice.id) || ["en_US-lessac-medium"];
      defaultVoice = voices[0] || "";
    }
    
    // Always set a valid voice when changing provider
    onChange({ provider, voice: defaultVoice });
    
    // Auto-switch test mode based on provider
    if (provider === 'piper' && testMode === 'browser') {
      setTestMode('regular'); // Default to regular for Piper
    } else if (provider === 'browser' && (testMode === 'regular' || testMode === 'streaming')) {
      setTestMode('browser'); // Switch to browser for browser provider
    }
  };

  const handleVoiceDownloaded = (voiceId: string) => {
    // Invalidate and refetch TTS voices query cache
    queryClient.invalidateQueries({ queryKey: ["tts-voices"] });
    refetchVoices();
    // Refresh voice list after download
    setVoiceRefreshTrigger(prev => prev + 1);
  };

  const handleVoiceDeleted = (voiceId: string) => {
    // Invalidate and refetch TTS voices query cache
    queryClient.invalidateQueries({ queryKey: ["tts-voices"] });
    refetchVoices();
    // Refresh voice list after deletion
    setVoiceRefreshTrigger(prev => prev + 1);
  };
  
  // TTS Testing Functions
  const testBrowserTTS = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setDebugInfo((prev: any) => ({ ...prev, browserTTS: 'not supported' }));
      return;
    }
    
    // Stop any existing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(testText);
    
    // Set voice if selected
    if (data?.voice) {
      const voice = browserVoicesForTest.find(v => v.name === data.voice);
      if (voice) {
        utterance.voice = voice;
      }
    }
    
    // Apply settings
    utterance.rate = data?.speed || 1.0;
    utterance.volume = data?.volume || 1.0;
    
    utterance.onstart = () => setDebugInfo((prev: any) => ({ ...prev, browserTTS: 'started' }));
    utterance.onend = () => setDebugInfo((prev: any) => ({ ...prev, browserTTS: 'ended' }));
    utterance.onerror = (error) => setDebugInfo((prev: any) => ({ ...prev, browserTTS: `error: ${error.error}` }));
    
    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    
    setDebugInfo((prev: any) => ({ ...prev, browserTTS: 'speaking...' }));
  };
  
  const playTTS = () => {
    const currentVoice = getCurrentVoiceForTest();
    setDebugInfo((prev: any) => ({ 
      ...prev, 
      lastPlayAttempt: {
        mode: testMode,
        voice: currentVoice,
        provider: selectedProvider,
        timestamp: new Date().toISOString()
      }
    }));
    
    if (testMode === 'regular') {
      setCurrentRegularText(testText);
      setTimeout(() => {
        regularTTS.controls.play();
      }, 100);
    } else if (testMode === 'streaming') {
      setCurrentStreamingText(testText);
      setTimeout(() => {
        streamingTTS.controls.play();
      }, 100);
    } else if (testMode === 'browser') {
      testBrowserTTS();
    }
  };
  
  const stopTTS = () => {
    // Stop regular TTS - only stop playback, don't clear text
    regularTTS.controls.stop();
    
    // Stop streaming TTS - only stop playback, don't cancel generation or clear text
    streamingTTS.controls.stop();
    
    // Stop browser TTS
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    setDebugInfo((prev: any) => ({ ...prev, stopped: new Date().toISOString() }));
  };
  
  const isPlaying = () => {
    if (testMode === 'regular') {
      return regularTTS.status.isLoading || regularTTS.status.isPlaying;
    } else if (testMode === 'streaming') {
      return streamingTTS.status.isGenerating || streamingTTS.status.isPlaying;
    }
    return false;
  };
  
  const getPlayButtonText = () => {
    if (testMode === 'regular') {
      if (regularTTS.status.isLoading) return '⏳ Generating...';
      if (regularTTS.status.isPlaying) return '🔊 Playing...';
      return 'Play Regular TTS';
    } else if (testMode === 'streaming') {
      if (streamingTTS.status.isGenerating) return '⏳ Generating...';
      if (streamingTTS.status.isPlaying) return '🔊 Playing...';
      return 'Play Streaming TTS';
    }
    return 'Play Browser TTS';
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Voice Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Provider</label>
            <Select
              value={selectedProvider}
              onValueChange={handleProviderChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Voice</label>
            <Select
              value={data?.voice || ""}
              onValueChange={(value) => onChange({ voice: value })}
              disabled={isLoadingVoices || availableVoices.length === 0 || (selectedProvider === "piper" && isPiperVoicesLoading)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent>
                {selectedProvider === "piper" ? 
                  piperVoices?.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>
                  )) :
                  availableVoices.map((voice) => (
                    <SelectItem key={voice} value={voice}>{voice}</SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
            {(isLoadingVoices || (selectedProvider === "piper" && isPiperVoicesLoading)) && (
              <p className="text-xs text-muted-foreground mt-1">
                Loading voices...
              </p>
            )}
          </div>
        </div>
        
        
        {selectedProvider === "piper" && (
          <div className="mt-4">
            <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <h4 className="font-medium text-foreground">Piper TTS - Offline Voice Engine</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    High-quality offline text-to-speech that runs locally on your device. 
                    No internet required and your privacy is protected.
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="shrink-0"
                  onClick={() => setIsVoiceManagerOpen(true)}
                >
                  Browse Voices
                </Button>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <span>📥</span>
                  <span>Download additional voices to expand your library</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Voice Manager Modal */}
        {isVoiceManagerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background border border-border rounded-lg shadow-xl max-w-4xl max-h-[80vh] w-full mx-4 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-xl font-semibold text-foreground">Voice Manager</h2>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setIsVoiceManagerOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ×
                </Button>
              </div>
              <div className="p-4">
                <VoiceDownloadManager 
                  onVoiceDownloaded={handleVoiceDownloaded}
                  onVoiceDeleted={handleVoiceDeleted}
                  className="max-h-[60vh] overflow-y-auto"
                />
              </div>
            </div>
          </div>
        )}
        
      </Card>
      
      {/* TTS Testing Section */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Voice Testing</h3>
        
        {/* Test Text Input */}
        <div className="space-y-4">
          <div>
            <label htmlFor="test-text" className="block text-sm font-medium mb-2">
              Test Text
            </label>
            <textarea
              id="test-text"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              className="w-full h-24 p-3 border border-border rounded-md resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors bg-background text-foreground placeholder:text-muted-foreground"
              placeholder="Enter text to test TTS..."
            />
          </div>
          
          {/* Test Mode Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Test Mode</label>
            <div className="flex gap-4">
              {/* Show Regular and Streaming TTS options only for Piper */}
              {selectedProvider === 'piper' && (
                <>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="regular"
                      checked={testMode === 'regular'}
                      onChange={(e) => setTestMode(e.target.value as any)}
                      className="mr-2"
                    />
                    Regular TTS
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="streaming"
                      checked={testMode === 'streaming'}
                      onChange={(e) => setTestMode(e.target.value as any)}
                      className="mr-2"
                    />
                    Streaming TTS
                  </label>
                </>
              )}
              {/* Show Browser TTS option only for Browser provider */}
              {selectedProvider === 'browser' && (
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="browser"
                    checked={testMode === 'browser'}
                    onChange={(e) => setTestMode(e.target.value as any)}
                    className="mr-2"
                  />
                  Browser TTS
                </label>
              )}
            </div>
          </div>
          
          {/* Volume and Speed Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Speed: {data?.speed || 1.0}x
              </label>
              <Slider
                value={[data?.speed || 1.0]}
                onValueChange={(value) => onChange({ speed: value[0] })}
                max={4}
                min={0.25}
                step={0.25}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Adjust speaking speed for all TTS modes
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Volume: {data?.volume || 1.0}
              </label>
              <Slider
                value={[data?.volume || 1.0]}
                onValueChange={(value) => onChange({ volume: value[0] })}
                max={1}
                min={0}
                step={0.1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Adjust volume level for all TTS modes
              </p>
            </div>
          </div>
          
          {/* Control Buttons */}
          <div className="flex gap-4">
            <Button
              onClick={playTTS}
              disabled={isPlaying()}
              variant="default"
            >
              {getPlayButtonText()}
            </Button>
            
            <Button
              onClick={stopTTS}
              variant="destructive"
            >
              Stop
            </Button>
          </div>
          
          {/* Status Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="p-3 bg-secondary/20 rounded-md">
              <h4 className="font-medium text-sm mb-1">Current Settings</h4>
              <p className="text-xs text-muted-foreground">Speed: {data?.speed || 1.0}x</p>
              <p className="text-xs text-muted-foreground">Volume: {data?.volume || 1.0}</p>
              <p className="text-xs text-muted-foreground">Voice: {
                selectedProvider === 'piper' 
                  ? piperVoices?.find(v => v.id === data?.voice)?.name || data?.voice || 'Default'
                  : data?.voice || 'Default'
              }</p>
              <p className="text-xs text-muted-foreground">Provider: {selectedProvider}</p>
            </div>
            
            <div className="p-3 bg-secondary/20 rounded-md">
              <h4 className="font-medium text-sm mb-1">Status</h4>
              <p className="text-xs text-muted-foreground">Mode: {testMode}</p>
              <p className="text-xs text-muted-foreground">TTS Available: {ttsAvailability?.available ? 'Yes' : 'No'}</p>
              {testMode === 'regular' && (
                <p className="text-xs text-muted-foreground">Regular: {regularTTS.status.isLoading ? 'Loading' : regularTTS.status.isPlaying ? 'Playing' : 'Ready'}</p>
              )}
              {testMode === 'streaming' && (
                <p className="text-xs text-muted-foreground">Streaming: {streamingTTS.status.isGenerating ? 'Generating' : streamingTTS.status.isPlaying ? 'Playing' : 'Ready'}</p>
              )}
            </div>
          </div>
          
          {/* Debug Information (Collapsible) */}
          <div className="mt-4">
            <Button
              onClick={() => setShowDebugInfo(!showDebugInfo)}
              variant="outline"
              size="sm"
            >
              {showDebugInfo ? 'Hide' : 'Show'} Debug Info
            </Button>
            
            {showDebugInfo && (
              <div className="mt-2 p-3 bg-background border border-border rounded-md">
                <h4 className="font-medium text-sm mb-2">Debug Information</h4>
                <pre className="text-xs text-muted-foreground overflow-auto max-h-40">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

export const VoiceSettings = React.memo(VoiceSettingsComponent);