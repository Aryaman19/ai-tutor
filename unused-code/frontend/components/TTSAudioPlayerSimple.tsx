import { useEffect, useCallback, useState } from 'react';
import { Volume2, VolumeX, Settings } from 'lucide-react';
import { cn } from '@ai-tutor/utils';
import type { FlexibleLessonStep } from '../hooks/useExcalidrawPlayer';

interface TTSAudioPlayerProps {
  currentStep?: FlexibleLessonStep;
  userId?: string;
  speechRate?: number;
  speechVolume?: number;
  autoPlay?: boolean;
  onAudioEnd?: () => void;
  onAudioStart?: () => void;
  className?: string;
}

export const TTSAudioPlayer = ({
  currentStep,
  userId,
  speechRate = 1,
  speechVolume = 0.8,
  autoPlay = true,
  onAudioEnd,
  onAudioStart,
  className,
}: TTSAudioPlayerProps) => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Play narration for current step using browser TTS
  const playCurrentNarration = useCallback(() => {
    if (!currentStep || typeof window === 'undefined' || !window.speechSynthesis) return;

    const textToSpeak = currentStep.narration || currentStep.content || currentStep.explanation;
    if (!textToSpeak) return;

    // Stop any existing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = speechRate;
    utterance.volume = speechVolume;

    utterance.onstart = () => {
      setIsSpeaking(true);
      onAudioStart?.();
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      onAudioEnd?.();
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      onAudioEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  }, [currentStep, speechRate, speechVolume, onAudioStart, onAudioEnd]);

  // Auto-play when step changes
  useEffect(() => {
    if (autoPlay && currentStep) {
      // Small delay to ensure UI is updated
      const timeout = setTimeout(() => {
        playCurrentNarration();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [currentStep, autoPlay, playCurrentNarration]);

  const handleToggleAudio = () => {
    if (isSpeaking) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
    } else {
      playCurrentNarration();
    }
  };

  const hasNarration = currentStep && (
    currentStep.narration || 
    currentStep.content || 
    currentStep.explanation
  );

  if (!hasNarration) {
    return (
      <div className={cn('flex items-center gap-2 text-gray-400', className)}>
        <VolumeX size={20} />
        <span className="text-sm">No narration available</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Audio Control Button */}
      <button
        onClick={handleToggleAudio}
        className={cn(
          'p-2 rounded-full transition-colors',
          isSpeaking
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-blue-500 hover:bg-blue-600 text-white'
        )}
        title={isSpeaking ? 'Stop Narration' : 'Play Narration'}
      >
        {isSpeaking ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      {/* Audio Status */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        {isSpeaking && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>Playing narration...</span>
          </div>
        )}
        
        {!isSpeaking && hasNarration && (
          <span>Narration ready</span>
        )}
      </div>

      {/* Settings Indicator */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <Settings size={14} />
        <span>Rate: {speechRate.toFixed(1)}x</span>
        <span>Vol: {Math.round(speechVolume * 100)}%</span>
      </div>
    </div>
  );
};