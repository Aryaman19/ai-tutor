import { useState, useRef, useEffect } from 'react';
import { useTTSAudio, useStreamingTTS, useTTSAvailability, useTTSSettings } from '@ai-tutor/hooks';
import { ttsApi } from '@ai-tutor/api-client';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@ai-tutor/ui';

const TTSTestPage = () => {
  const [testText, setTestText] = useState('Hello, this is a test of the text-to-speech system. We will generate audio and play it back to ensure everything is working correctly.');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [testMode, setTestMode] = useState<'regular' | 'streaming' | 'browser'>('regular');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [streamingDebug, setStreamingDebug] = useState<any>({
    playbackAttempts: [],
    audioErrors: [],
    lastPlayTrigger: null,
  });
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
    onPlay: () => setDebugInfo((prev: any) => ({ ...prev, regularTTS: 'playing' })),
    onEnd: () => setDebugInfo((prev: any) => ({ ...prev, regularTTS: 'ended' })),
    onError: (error: any) => setDebugInfo((prev: any) => ({ ...prev, regularTTS: `error: ${error.message}` })),
  });
  
  // Streaming TTS - only trigger when currentStreamingText changes
  const streamingTTS = useStreamingTTS(currentStreamingText, {
    voice: selectedVoice || undefined,
    autoPlay: false,
    maxChunkSize: 50,
    onPlay: () => {
      setDebugInfo((prev: any) => ({ ...prev, streamingTTS: 'playing' }));
      setStreamingDebug((prev: any) => ({
        ...prev,
        playbackAttempts: [...prev.playbackAttempts, {
          type: 'onPlay_callback',
          timestamp: new Date().toISOString(),
          success: true
        }]
      }));
    },
    onEnd: () => setDebugInfo((prev: any) => ({ ...prev, streamingTTS: 'ended' })),
    onError: (error: any) => {
      setDebugInfo((prev: any) => ({ ...prev, streamingTTS: `error: ${error.message}` }));
      setStreamingDebug((prev: any) => ({
        ...prev,
        audioErrors: [...prev.audioErrors, {
          type: 'hook_error',
          message: error.message,
          timestamp: new Date().toISOString()
        }]
      }));
    },
    onChunkReady: (chunk: any) => {
      setDebugInfo((prev: any) => {
        const existingChunks = prev.streamingChunks || [];
        // Only add if chunk doesn't already exist
        if (!existingChunks.find((c: any) => c.chunk_id === chunk.chunk_id && c.index === chunk.index)) {
          return {
            ...prev,
            streamingChunks: [...existingChunks, chunk]
          };
        }
        return prev;
      });
      
      // Log chunk ready for debugging
      setStreamingDebug((prev: any) => ({
        ...prev,
        lastChunkReady: {
          chunkId: chunk.chunk_id,
          index: chunk.index,
          isReady: chunk.is_ready,
          hasAudioUrl: !!chunk.audio_url,
          timestamp: new Date().toISOString()
        }
      }));
    },
  });
  
  // Helper function to attempt streaming TTS playback with retry logic
  const attemptStreamingPlayback = (triggerType: string, retryCount = 0, maxRetries = 3) => {
    const timestamp = new Date().toISOString();
    
    setStreamingDebug((prev: any) => ({
      ...prev,
      lastPlayTrigger: {
        type: triggerType,
        timestamp,
        retryCount,
        result: 'attempting...'
      }
    }));

    // Check if we have chunks ready
    const hasReadyChunks = streamingTTS.chunks && 
      streamingTTS.chunks.length > 0 && 
      streamingTTS.chunks.some((audioChunk: any) => audioChunk.chunk?.is_ready);
    
    if (!hasReadyChunks && retryCount < maxRetries) {
      // Wait and retry
      setStreamingDebug((prev: any) => ({
        ...prev,
        lastPlayTrigger: {
          ...prev.lastPlayTrigger,
          result: `no ready chunks, retrying in 200ms (${retryCount + 1}/${maxRetries})`
        }
      }));
      
      setTimeout(() => {
        attemptStreamingPlayback(triggerType, retryCount + 1, maxRetries);
      }, 200);
      return;
    }

    if (!hasReadyChunks) {
      setStreamingDebug((prev: any) => ({
        ...prev,
        lastPlayTrigger: {
          ...prev.lastPlayTrigger,
          result: 'failed - no ready chunks after max retries'
        },
        audioErrors: [...prev.audioErrors, {
          type: 'playback_error',
          message: 'No ready chunks available for playback',
          timestamp
        }]
      }));
      return;
    }

    // Try to play
    try {
      streamingTTS.controls.play();
      setStreamingDebug((prev: any) => ({
        ...prev,
        lastPlayTrigger: {
          ...prev.lastPlayTrigger,
          result: 'play() called successfully'
        }
      }));
    } catch (error: any) {
      setStreamingDebug((prev: any) => ({
        ...prev,
        lastPlayTrigger: {
          ...prev.lastPlayTrigger,
          result: `error calling play(): ${error.message}`
        },
        audioErrors: [...prev.audioErrors, {
          type: 'play_call_error',
          message: error.message,
          timestamp
        }]
      }));
    }
  };

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
      setDebugInfo((prev: any) => ({ ...prev, directAPI: 'testing...' }));
      
      // Test availability
      const availability = await ttsApi.checkAvailability();
      setDebugInfo((prev: any) => ({ ...prev, availability }));
      
      // Test regular generation
      const result = await ttsApi.generateAudio({ text: testText, voice: selectedVoice || undefined });
      setDebugInfo((prev: any) => ({ ...prev, directAPI: result }));
      
      // Set audio URL for manual testing
      const fullUrl = `${window.location.origin}/api/tts/audio/${result.audio_id}`;
      setAudioUrl(fullUrl);
      
      if (audioRef.current) {
        audioRef.current.src = fullUrl;
        audioRef.current.load();
      }
      
    } catch (error) {
      setDebugInfo((prev: any) => ({ ...prev, directAPI: `error: ${(error as any).message}` }));
    }
  };
  
  // Test browser TTS
  const testBrowserTTS = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setDebugInfo((prev: any) => ({ ...prev, browserTTS: 'not supported' }));
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
    
    utterance.onstart = () => setDebugInfo((prev: any) => ({ ...prev, browserTTS: 'started' }));
    utterance.onend = () => setDebugInfo((prev: any) => ({ ...prev, browserTTS: 'ended' }));
    utterance.onerror = (error) => setDebugInfo((prev: any) => ({ ...prev, browserTTS: `error: ${error.error}` }));
    
    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    
    setDebugInfo((prev: any) => ({ ...prev, browserTTS: 'speaking...' }));
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
    
    // Clear streaming chunks and update debug info
    setDebugInfo((prev: any) => ({ 
      ...prev, 
      stopped: new Date().toISOString(),
      streamingChunks: []
    }));
    
    // Clear streaming debug info
    setStreamingDebug({
      playbackAttempts: [],
      audioErrors: [],
      lastPlayTrigger: {
        type: 'stop_all_button',
        timestamp: new Date().toISOString(),
        result: 'all stopped and cleared'
      }
    });
  };
  
  return (
    <div className="h-full overflow-y-auto">
      <div className="min-h-full bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="container mx-auto p-6 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6 text-foreground">TTS Test Page</h1>
      
      {/* Test Configuration */}
      <Card className="mb-6 shadow-lg border-0 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Test Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Text Input */}
          <div>
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
          <div>
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
          <div>
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
        </CardContent>
      </Card>
      
      {/* Control Buttons */}
      <Card className="mb-6 shadow-lg border-0 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
        <Button
          onClick={() => {
            if (testMode === 'regular') {
              setCurrentRegularText(testText);
              // Give it a moment to process, then play
              setTimeout(() => {
                regularTTS.controls.play();
              }, 100);
            } else if (testMode === 'streaming') {
              // Clear previous streaming chunks and debug info
              setDebugInfo((prev: any) => ({ ...prev, streamingChunks: [] }));
              setStreamingDebug({
                playbackAttempts: [],
                audioErrors: [],
                lastPlayTrigger: null,
              });
              setCurrentStreamingText(testText);
              // Use the improved playback function
              setTimeout(() => {
                attemptStreamingPlayback('play_button_click');
              }, 100);
            } else if (testMode === 'browser') {
              testBrowserTTS();
            }
          }}
          disabled={
            (testMode === 'regular' && (regularTTS.status.isLoading || regularTTS.status.isPlaying)) ||
            (testMode === 'streaming' && (streamingTTS.status.isGenerating || streamingTTS.status.isPlaying))
          }
          variant="default"
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
          variant="destructive"
        >
          Stop All
        </Button>
        
        <Button
          onClick={() => {
            if (testMode === 'regular') {
              setCurrentRegularText(testText);
            } else if (testMode === 'streaming') {
              // Clear previous streaming chunks
              setDebugInfo((prev: any) => ({ ...prev, streamingChunks: [] }));
              setCurrentStreamingText(testText);
            }
          }}
          variant="secondary"
        >
          Generate {testMode === 'regular' ? 'Regular' : testMode === 'streaming' ? 'Streaming' : 'Browser'} TTS
        </Button>
        
        <Button
          onClick={testDirectAPI}
          variant="outline"
        >
          Test Direct API
        </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Streaming TTS Controls */}
      {testMode === 'streaming' && (
        <Card className="mb-6 shadow-lg border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Streaming TTS Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              <Button
                onClick={() => attemptStreamingPlayback('dedicated_play_button')}
                disabled={!streamingTTS.chunks || streamingTTS.chunks.length === 0 || !streamingTTS.chunks.some((audioChunk: any) => audioChunk.chunk?.is_ready)}
                variant="default"
                className="flex items-center gap-2"
              >
                {streamingTTS.status.isPlaying ? '🔊 Playing...' : '▶️ Play Available Chunks'}
              </Button>
              
              <Button
                onClick={() => {
                  streamingTTS.controls.stop();
                  setStreamingDebug((prev: any) => ({
                    ...prev,
                    lastPlayTrigger: {
                      type: 'stop_button_click',
                      timestamp: new Date().toISOString(),
                      result: 'stop called'
                    }
                  }));
                }}
                disabled={!streamingTTS.status.isPlaying}
                variant="destructive"
              >
                🛑 Stop
              </Button>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Ready Chunks: {streamingTTS.chunks ? 
                  streamingTTS.chunks.filter((audioChunk: any) => audioChunk.chunk?.is_ready).length : 0} / {streamingTTS.chunks?.length || 0}</span>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Status: {
                  streamingTTS.status.isPlaying ? 'Playing' :
                  streamingTTS.status.isGenerating ? 'Generating' :
                  streamingTTS.chunks && streamingTTS.chunks.length > 0 ? 'Ready to Play' :
                  'No Chunks'
                }</span>
              </div>
            </div>
            
            {streamingTTS.chunks && streamingTTS.chunks.length > 0 && (
              <div className="mt-4 text-sm">
                <div className="flex gap-4 flex-wrap">
                  <span>Generation Progress: {streamingTTS.status.progress}%</span>
                  <span>Total Chunks: {streamingTTS.status.totalChunks}</span>
                  <span>Generated: {streamingTTS.status.generatedChunks}</span>
                  {streamingTTS.status.error && (
                    <span className="text-destructive">Error: {streamingTTS.status.error}</span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
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
      <Card className="mb-6 shadow-lg border-0 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Current Status</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
      
      {/* Streaming TTS Detailed Debug */}
      {testMode === 'streaming' && (
        <Card className="mb-6 shadow-lg border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Streaming TTS Debug Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h4 className="font-medium text-foreground mb-2">Playback State</h4>
                  <p className="text-sm text-muted-foreground">Is Playing: {streamingTTS.status.isPlaying ? 'Yes' : 'No'}</p>
                  <p className="text-sm text-muted-foreground">Is Generating: {streamingTTS.status.isGenerating ? 'Yes' : 'No'}</p>
                  <p className="text-sm text-muted-foreground">Is Streaming: {streamingTTS.isStreaming ? 'Yes' : 'No'}</p>
                  <p className="text-sm text-muted-foreground">Progress: {streamingTTS.status.progress}%</p>
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">Chunks Info</h4>
                  <p className="text-sm text-muted-foreground">Generated: {streamingTTS.status.generatedChunks}</p>
                  <p className="text-sm text-muted-foreground">Total Expected: {streamingTTS.status.totalChunks}</p>
                  <p className="text-sm text-muted-foreground">Audio Elements: {streamingTTS.chunks?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Error: {streamingTTS.status.error || 'None'}</p>
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">Controls Available</h4>
                  <p className="text-sm text-muted-foreground">Play Available: {typeof streamingTTS.controls.play === 'function' ? 'Yes' : 'No'}</p>
                  <p className="text-sm text-muted-foreground">Stop Available: {typeof streamingTTS.controls.stop === 'function' ? 'Yes' : 'No'}</p>
                  <p className="text-sm text-muted-foreground">Cancel Available: {typeof streamingTTS.controls.cancel === 'function' ? 'Yes' : 'No'}</p>
                </div>
              </div>
              
              {streamingTTS.chunks && streamingTTS.chunks.length > 0 && (
                <div>
                  <h4 className="font-medium text-foreground mb-2">Audio Chunks Details</h4>
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {streamingTTS.chunks.map((audioChunk: any, index: number) => (
                      <div key={index} className="text-xs bg-background p-2 rounded border border-border">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <span>Index: {audioChunk.chunk?.index ?? 'N/A'}</span>
                          <span>Ready: {audioChunk.chunk?.is_ready ? 'Yes' : 'No'}</span>
                          <span>Loaded: {audioChunk.isLoaded ? 'Yes' : 'No'}</span>
                          <span>Audio: {audioChunk.audioElement ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          ID: {audioChunk.chunk?.chunk_id?.substring(0, 8) || 'N/A'}...
                        </div>
                        {audioChunk.chunk?.audio_url && (
                          <div className="mt-1 text-muted-foreground truncate">
                            URL: {audioChunk.chunk.audio_url}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Enhanced Debug Info */}
              <div>
                <h4 className="font-medium text-foreground mb-2">Debug Events</h4>
                <div className="max-h-32 overflow-y-auto">
                  <div className="text-xs space-y-1">
                    {streamingDebug.lastChunkReady && (
                      <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded">
                        <strong>Last Chunk Ready:</strong> Index {streamingDebug.lastChunkReady.index} 
                        ({streamingDebug.lastChunkReady.isReady ? 'Ready' : 'Not Ready'}) 
                        at {new Date(streamingDebug.lastChunkReady.timestamp).toLocaleTimeString()}
                      </div>
                    )}
                    {streamingDebug.lastPlayTrigger && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                        <strong>Last Play Trigger:</strong> {streamingDebug.lastPlayTrigger.type} 
                        at {new Date(streamingDebug.lastPlayTrigger.timestamp).toLocaleTimeString()}
                        {streamingDebug.lastPlayTrigger.result && ` - ${streamingDebug.lastPlayTrigger.result}`}
                      </div>
                    )}
                    {streamingDebug.audioErrors.length > 0 && (
                      <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded">
                        <strong>Recent Errors:</strong>
                        {streamingDebug.audioErrors.slice(-3).map((error: any, idx: number) => (
                          <div key={idx} className="text-xs mt-1">
                            {error.type}: {error.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
      <div className="mt-6 bg-card p-4 rounded-lg border border-border">
        <h3 className="text-lg font-semibold mb-2 text-foreground">Debug Information</h3>
        <pre className="text-sm bg-background p-2 rounded border border-border overflow-auto max-h-96 text-foreground">
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TTSTestPage;