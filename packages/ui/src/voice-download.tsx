import React, { useState, useEffect } from 'react';
import { Button } from './button';
import { Card } from './card';
import { Badge } from './badge';
import { Dialog } from './dialog';
import { ScrollArea } from './scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

// Types for voice download - defined locally to avoid circular dependencies
interface VoiceMetadata {
  id: string;
  name: string;
  language: string;
  language_code?: string;
  country?: string;
  quality?: string;
  size_mb?: number;
  description?: string;
  sample_rate?: number;
  is_downloaded: boolean;
  is_downloading?: boolean;
  download_progress?: number;
}

interface VoiceDownloadProgress {
  voice_id: string;
  progress: number;
  is_downloading: boolean;
  is_downloaded: boolean;
}

interface VoiceDownloadProps {
  onVoiceDownloaded?: (voiceId: string) => void;
  onVoiceDeleted?: (voiceId: string) => void;
  className?: string;
}

interface VoicesByLanguage {
  [language: string]: VoiceMetadata[];
}

export function VoiceDownload({ onVoiceDownloaded, onVoiceDeleted, className }: VoiceDownloadProps) {
  const [voices, setVoices] = useState<VoiceMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [downloadingVoices, setDownloadingVoices] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number>>(new Map());

  const fetchVoices = async () => {
    try {
      setLoading(true);
      setError(null);
      // For now, return mock data - this will be replaced with actual API calls in the consuming app
      const mockVoices: VoiceMetadata[] = [
        {
          id: 'en_US-lessac-medium',
          name: 'Lessac (Medium)',
          language: 'EN',
          language_code: 'en_US',
          country: 'US',
          quality: 'medium',
          size_mb: 45.2,
          description: 'English US voice - Lessac (Medium)',
          sample_rate: 22050,
          is_downloaded: true,
          is_downloading: false,
          download_progress: 0
        }
      ];
      setVoices(mockVoices);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch voices');
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

      // Mock download progress - this will be replaced with actual API calls
      const simulateDownload = () => {
        let progress = 0;
        const interval = setInterval(() => {
          progress += 10;
          setDownloadProgress(prev => new Map(prev).set(voiceId, progress));
          
          if (progress >= 100) {
            clearInterval(interval);
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
            
            onVoiceDownloaded?.(voiceId);
          }
        }, 200);
      };

      simulateDownload();
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
      // Mock delete - this will be replaced with actual API calls
      setVoices(prev => prev.map(voice => 
        voice.id === voiceId ? { ...voice, is_downloaded: false } : voice
      ));
      onVoiceDeleted?.(voiceId);
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading voices...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className || ''}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Voice Downloads</h2>
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
          <Button onClick={fetchVoices} variant="outline">
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="text-red-600">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <div className="ml-auto">
              <Button
                onClick={() => setError(null)}
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-800"
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
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">
                {language}
              </h3>
              <div className="grid gap-3">
                {languageVoices.map((voice) => {
                  const isDownloading = downloadingVoices.has(voice.id);
                  const progress = downloadProgress.get(voice.id) || 0;

                  return (
                    <Card key={voice.id} className="p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h4 className="font-medium">{voice.name}</h4>
                            <Badge className={getVoiceQualityColor(voice.quality)}>
                              {voice.quality || 'Unknown'}
                            </Badge>
                            {voice.is_downloaded && (
                              <Badge className="bg-green-100 text-green-800">
                                Downloaded
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
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
                            <div className="flex items-center space-x-2">
                              <div className="w-24 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <span className="text-sm text-gray-600">{Math.round(progress)}%</span>
                            </div>
                          ) : voice.is_downloaded ? (
                            <Button
                              onClick={() => handleDelete(voice.id)}
                              variant="destructive"
                              size="sm"
                            >
                              Delete
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleDownload(voice.id)}
                              size="sm"
                            >
                              Download
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
        <div className="text-center py-12 text-gray-500">
          <p>No voices available. Check your internet connection and try refreshing.</p>
        </div>
      )}
    </div>
  );
}