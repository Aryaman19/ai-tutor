import React, { useState, useEffect } from 'react';
import { Button, Card, Badge, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ai-tutor/ui';
import { ttsApi } from '@ai-tutor/api-client';
import type { VoiceMetadata } from '@ai-tutor/types';
import { useQueryClient } from '@tanstack/react-query';

interface VoiceDownloadManagerProps {
  onVoiceDownloaded?: (voiceId: string) => void;
  onVoiceDeleted?: (voiceId: string) => void;
  className?: string;
}

interface VoicesByLanguage {
  [language: string]: VoiceMetadata[];
}

export function VoiceDownloadManager({ onVoiceDownloaded, onVoiceDeleted, className }: VoiceDownloadManagerProps) {
  const [voices, setVoices] = useState<VoiceMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [downloadingVoices, setDownloadingVoices] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number>>(new Map());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const fetchVoices = async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);
      
      
      // Use force_refresh parameter for backend cache invalidation
      const url = forceRefresh ? 
        `/api/tts/voices/available?force_refresh=true` : 
        `/api/tts/voices/available`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const availableVoices = await response.json();
      
      setVoices(availableVoices);
    } catch (err) {
      console.error('Error fetching voices:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch voices from API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVoices();
  }, []);

  const handleDownload = async (voiceId: string) => {
    try {
      setDownloadingVoices(prev => new Set(prev).add(voiceId));
      setDownloadProgress(prev => new Map(prev).set(voiceId, 0));

      // Start download
      const response = await ttsApi.downloadVoice(voiceId);
      if (response.success) {
        // Poll for progress
        ttsApi.pollVoiceDownloadProgress(voiceId, (progress) => {
          setDownloadProgress(prev => new Map(prev).set(voiceId, progress.progress));
          
          if (progress.is_downloaded) {
            setDownloadingVoices(prev => {
              const newSet = new Set(prev);
              newSet.delete(voiceId);
              return newSet;
            });
            setDownloadProgress(prev => {
              const newMap = new Map(prev);
              newMap.delete(voiceId);
              return newMap;
            });
            
            // Update voice in list
            setVoices(prev => prev.map(voice => 
              voice.id === voiceId ? { ...voice, is_downloaded: true } : voice
            ));
            
            // Invalidate TTS voices cache so the dropdown updates
            queryClient.invalidateQueries({ queryKey: ["tts-voices"] });
            
            // Show success message
            const voiceName = voices.find(v => v.id === voiceId)?.name || voiceId;
            setSuccessMessage(`✅ ${voiceName} downloaded successfully!`);
            setTimeout(() => setSuccessMessage(null), 5000);
            
            onVoiceDownloaded?.(voiceId);
          }
        });
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      console.error('Download error:', err);
      setError(err instanceof Error ? err.message : 'Failed to download voice');
      setDownloadingVoices(prev => {
        const newSet = new Set(prev);
        newSet.delete(voiceId);
        return newSet;
      });
    }
  };

  const handleDelete = async (voiceId: string) => {
    try {
      const response = await ttsApi.deleteVoice(voiceId);
      if (response.success) {
        // Update voice in list
        setVoices(prev => prev.map(voice => 
          voice.id === voiceId ? { ...voice, is_downloaded: false } : voice
        ));
        
        // Invalidate TTS voices cache so the dropdown updates
        queryClient.invalidateQueries({ queryKey: ["tts-voices"] });
        
        // Show success message
        const voiceName = voices.find(v => v.id === voiceId)?.name || voiceId;
        setSuccessMessage(`🗑️ ${voiceName} deleted successfully!`);
        setTimeout(() => setSuccessMessage(null), 5000);
        
        onVoiceDeleted?.(voiceId);
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete voice');
    }
  };

  const groupVoicesByLanguage = (voices: VoiceMetadata[]): VoicesByLanguage => {
    return voices.reduce((acc, voice) => {
      const language = voice.language;
      if (!acc[language]) {
        acc[language] = [];
      }
      acc[language].push(voice);
      return acc;
    }, {} as VoicesByLanguage);
  };

  const filteredVoices = selectedLanguage === 'all' 
    ? voices 
    : voices.filter(voice => voice.language === selectedLanguage);

  const voicesByLanguage = groupVoicesByLanguage(filteredVoices);
  const languages = ['all', ...new Set(voices.map(v => v.language))];

  const getVoiceQualityColor = (quality: string | undefined) => {
    if (!quality) return 'bg-blue-100 text-blue-800';
    
    switch (quality.toLowerCase()) {
      case 'high': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className || ''}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2 text-foreground">Loading voices...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className || ''}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Voice Downloads</h2>
        <div className="flex items-center space-x-2">
          <Select
            value={selectedLanguage}
            onValueChange={setSelectedLanguage}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {languages.map(lang => (
                <SelectItem key={lang} value={lang}>
                  {lang === 'all' ? 'All Languages' : lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => fetchVoices(true)} variant="outline">
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
          <div className="flex">
            <div className="text-destructive">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-destructive">Error</h3>
              <p className="text-sm text-destructive/80 mt-1">{error}</p>
            </div>
            <div className="ml-auto">
              <Button
                onClick={() => setError(null)}
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive/80"
              >
                ×
              </Button>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <div className="text-green-600">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">{successMessage}</p>
            </div>
            <div className="ml-auto">
              <Button
                onClick={() => setSuccessMessage(null)}
                variant="ghost"
                size="sm"
                className="text-green-600 hover:text-green-700"
              >
                ×
              </Button>
            </div>
          </div>
        </div>
      )}

      <ScrollArea className="h-96">
        <div className="space-y-6">
          {Object.entries(voicesByLanguage).map(([language, languageVoices]) => (
            <div key={language} className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
                {language}
              </h3>
              <div className="grid gap-3">
                {languageVoices.map((voice) => {
                  const isDownloading = downloadingVoices.has(voice.id);
                  const progress = downloadProgress.get(voice.id) || 0;

                  return (
                    <Card key={voice.id} className="p-4 hover:shadow-md transition-shadow bg-card border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h4 className="font-medium text-foreground">{voice.name}</h4>
                            <Badge className={getVoiceQualityColor(voice.quality)}>
                              {voice.quality || 'Unknown'}
                            </Badge>
                            {voice.is_downloaded && (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                                Downloaded
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>{voice.description || 'No description available'}</p>
                            <div className="flex items-center space-x-4">
                              <span>Size: {voice.size_mb || 'Unknown'}MB</span>
                              <span>Sample Rate: {voice.sample_rate || 'Unknown'}Hz</span>
                              <span>Country: {voice.country || 'Unknown'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-2">
                          {isDownloading ? (
                            <div className="flex flex-col items-end space-y-2">
                              <div className="flex items-center space-x-2">
                                <div className="w-24 bg-secondary rounded-full h-2">
                                  <div
                                    className="bg-primary h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium text-primary">{Math.round(progress)}%</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {progress < 100 ? 'Downloading...' : 'Finalizing...'}
                              </div>
                            </div>
                          ) : voice.is_downloaded ? (
                            <Button
                              onClick={() => handleDelete(voice.id)}
                              variant="outline"
                              size="sm"
                              className="p-2 h-8 w-8 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                              title="Delete voice"
                            >
                              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 012-2v1a1 1 0 001 1h6a1 1 0 001-1V3a2 2 0 012 2v1H4V5zM3 8a1 1 0 011-1h12a1 1 0 110 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V9a1 1 0 01-1-1z" clipRule="evenodd" />
                              </svg>
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleDownload(voice.id)}
                              variant="outline"
                              size="sm"
                              className="p-2 h-8 w-8 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                              title="Download voice"
                            >
                              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {voices.length === 0 && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No voices available.</p>
          <p className="text-sm mt-2">Check console for debugging information.</p>
          <Button onClick={() => fetchVoices()} className="mt-4">
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}