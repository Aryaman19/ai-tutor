import asyncio
import hashlib
import os
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import aiofiles
import logging
from config import settings
import wave
import io

logger = logging.getLogger(__name__)


class PiperTTSService:
    """Service for generating TTS audio using Piper offline TTS"""
    
    def __init__(self):
        self.cache_dir = Path(settings.tts_cache_dir)
        self.voices_dir = Path(settings.tts_voices_dir)
        self.piper_path = settings.tts_piper_path
        self.max_cache_size = settings.max_audio_cache_size
        self.use_python_piper = True  # Use Python module instead of subprocess
        
        # Default voice configuration
        self.default_voice = "en_US-lessac-medium"
        self.voice_configs = {
            "en_US-lessac-medium": {
                "model_path": self.voices_dir / "en_US-lessac-medium.onnx",
                "config_path": self.voices_dir / "en_US-lessac-medium.onnx.json",
                "name": "Lessac (Medium Quality)",
                "language": "en_US"
            }
        }
        
        # Ensure cache directory exists
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Check if Piper TTS is available
        self._is_piper_available = None
        self._availability_checked = False
        
        logger.info(f"PiperTTSService initialized with cache dir: {self.cache_dir}")
    
    def _check_piper_availability(self) -> bool:
        """Check if Piper TTS is available and properly configured"""
        if self._availability_checked:
            return self._is_piper_available
        
        self._availability_checked = True
        
        # Check if Piper Python module is available
        if self.use_python_piper:
            try:
                import piper
                logger.info("Piper Python module is available")
            except ImportError:
                logger.warning("Piper Python module not found")
                self._is_piper_available = False
                return False
        else:
            # Check if Piper binary exists
            if not Path(self.piper_path).exists():
                logger.warning(f"Piper binary not found at: {self.piper_path}")
                self._is_piper_available = False
                return False
        
        # Check if default voice files exist
        default_config = self.voice_configs[self.default_voice]
        if not default_config["model_path"].exists():
            logger.warning(f"Default voice model not found: {default_config['model_path']}")
            self._is_piper_available = False
            return False
        
        if not default_config["config_path"].exists():
            logger.warning(f"Default voice config not found: {default_config['config_path']}")
            self._is_piper_available = False
            return False
        
        logger.info("Piper TTS is available and properly configured")
        self._is_piper_available = True
        return True
    
    def is_service_available(self) -> bool:
        """Check if the TTS service is available"""
        return self._check_piper_availability()
    
    def _generate_audio_id(self, text: str, voice: str = None) -> str:
        """Generate a unique ID for audio based on text and voice"""
        voice = voice or self.default_voice
        content = f"{text}_{voice}"
        return hashlib.sha256(content.encode()).hexdigest()
    
    def _get_audio_path(self, audio_id: str) -> Path:
        """Get the file path for an audio ID"""
        return self.cache_dir / f"{audio_id}.wav"
    
    def _get_audio_url(self, audio_id: str) -> str:
        """Get the URL path for serving audio"""
        return f"/api/tts/audio/{audio_id}"
    
    async def is_audio_cached(self, text: str, voice: str = None) -> Tuple[bool, str]:
        """Check if audio is already cached. Returns (is_cached, audio_id)"""
        audio_id = self._generate_audio_id(text, voice)
        audio_path = self._get_audio_path(audio_id)
        return audio_path.exists(), audio_id
    
    async def generate_audio(self, text: str, voice: str = None) -> Optional[str]:
        """
        Generate TTS audio for the given text.
        Returns the audio_id if successful, None if failed.
        """
        if not text.strip():
            logger.warning("Empty text provided for TTS generation")
            return None
        
        # Check if Piper TTS is available
        if not self.is_service_available():
            logger.warning("Piper TTS service is not available - cannot generate audio")
            return None
        
        voice = voice or self.default_voice
        
        # Check if audio is already cached
        is_cached, audio_id = await self.is_audio_cached(text, voice)
        if is_cached:
            logger.info(f"Audio already cached for ID: {audio_id}")
            return audio_id
        
        # Check if voice is available
        if voice not in self.voice_configs:
            logger.error(f"Voice '{voice}' not available. Using default voice.")
            voice = self.default_voice
        
        voice_config = self.voice_configs[voice]
        
        # Verify voice files exist (double-check)
        if not voice_config["model_path"].exists():
            logger.error(f"Voice model file not found: {voice_config['model_path']}")
            return None
        
        if not voice_config["config_path"].exists():
            logger.error(f"Voice config file not found: {voice_config['config_path']}")
            return None
        
        audio_path = self._get_audio_path(audio_id)
        
        try:
            if self.use_python_piper:
                # Use Python piper module
                from piper.voice import PiperVoice
                
                logger.info(f"Generating TTS audio using Python piper module: {audio_id}")
                
                # Load the voice model
                voice = PiperVoice.load(str(voice_config["model_path"]))
                
                # Generate audio
                audio_bytes = b''
                for chunk in voice.synthesize(text):
                    audio_bytes += chunk.audio_int16_bytes
                
                # Save as proper WAV file with headers
                with wave.open(str(audio_path), 'wb') as wav_file:
                    wav_file.setnchannels(1)  # mono
                    wav_file.setsampwidth(2)  # 16-bit
                    wav_file.setframerate(22050)  # from voice config
                    wav_file.writeframes(audio_bytes)
                
                logger.info(f"Successfully generated TTS audio: {audio_id}")
                
                # Clean up cache if needed
                await self._cleanup_cache()
                
                return audio_id
            else:
                # Use subprocess (original method)
                cmd = [
                    self.piper_path,
                    "--model", str(voice_config["model_path"]),
                    "--config", str(voice_config["config_path"]),
                    "--output_file", str(audio_path)
                ]
                
                logger.info(f"Generating TTS audio with command: {' '.join(cmd)}")
                
                # Run Piper TTS
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                
                stdout, stderr = await process.communicate(input=text.encode())
                
                if process.returncode == 0 and audio_path.exists():
                    logger.info(f"Successfully generated TTS audio: {audio_id}")
                    
                    # Clean up cache if needed
                    await self._cleanup_cache()
                    
                    return audio_id
                else:
                    logger.error(f"Piper TTS failed with return code {process.returncode}")
                    logger.error(f"Stderr: {stderr.decode()}")
                    
                    # Clean up failed attempt
                    if audio_path.exists():
                        audio_path.unlink()
                    
                    return None
                
        except Exception as e:
            logger.error(f"Error generating TTS audio: {e}")
            
            # Clean up failed attempt
            if audio_path.exists():
                audio_path.unlink()
            
            return None
    
    async def get_audio_file_path(self, audio_id: str) -> Optional[Path]:
        """Get the file path for an audio ID if it exists"""
        audio_path = self._get_audio_path(audio_id)
        return audio_path if audio_path.exists() else None
    
    async def delete_audio(self, audio_id: str) -> bool:
        """Delete a cached audio file"""
        audio_path = self._get_audio_path(audio_id)
        if audio_path.exists():
            try:
                audio_path.unlink()
                logger.info(f"Deleted audio file: {audio_id}")
                return True
            except Exception as e:
                logger.error(f"Error deleting audio file {audio_id}: {e}")
                return False
        return False
    
    async def clear_cache(self) -> int:
        """Clear all cached audio files. Returns number of files deleted."""
        deleted_count = 0
        try:
            for audio_file in self.cache_dir.glob("*.wav"):
                try:
                    audio_file.unlink()
                    deleted_count += 1
                except Exception as e:
                    logger.error(f"Error deleting file {audio_file}: {e}")
            
            logger.info(f"Cleared TTS cache: deleted {deleted_count} files")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Error clearing TTS cache: {e}")
            return deleted_count
    
    async def _cleanup_cache(self):
        """Clean up old cache files if cache size exceeds limit"""
        try:
            audio_files = list(self.cache_dir.glob("*.wav"))
            
            if len(audio_files) <= self.max_cache_size:
                return
            
            # Sort by modification time (oldest first)
            audio_files.sort(key=lambda f: f.stat().st_mtime)
            
            # Delete oldest files
            files_to_delete = len(audio_files) - self.max_cache_size
            for audio_file in audio_files[:files_to_delete]:
                try:
                    audio_file.unlink()
                    logger.info(f"Cleaned up old audio file: {audio_file.name}")
                except Exception as e:
                    logger.error(f"Error deleting old audio file {audio_file}: {e}")
                    
        except Exception as e:
            logger.error(f"Error during cache cleanup: {e}")
    
    async def get_available_voices(self) -> List[Dict[str, str]]:
        """Get list of available voices"""
        voices = []
        for voice_id, config in self.voice_configs.items():
            if config["model_path"].exists() and config["config_path"].exists():
                voices.append({
                    "id": voice_id,
                    "name": config["name"],
                    "language": config["language"]
                })
        return voices
    
    async def get_cache_stats(self) -> Dict[str, any]:
        """Get statistics about the TTS cache"""
        try:
            audio_files = list(self.cache_dir.glob("*.wav"))
            total_size = sum(f.stat().st_size for f in audio_files)
            
            return {
                "total_files": len(audio_files),
                "total_size_bytes": total_size,
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "cache_limit": self.max_cache_size,
                "cache_directory": str(self.cache_dir)
            }
        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return {
                "total_files": 0,
                "total_size_bytes": 0,
                "total_size_mb": 0,
                "cache_limit": self.max_cache_size,
                "cache_directory": str(self.cache_dir),
                "error": str(e)
            }
    
    async def health_check(self) -> bool:
        """Check if Piper TTS is available and working"""
        try:
            # First check basic availability
            if not self.is_service_available():
                logger.error("Piper TTS service is not available")
                return False
            
            # Test generating a short audio clip
            test_text = "Hello"
            test_audio_id = await self.generate_audio(test_text)
            
            if test_audio_id:
                # Clean up test file
                await self.delete_audio(test_audio_id)
                logger.info("Piper TTS health check passed")
                return True
            else:
                logger.error("Piper TTS health check failed: could not generate test audio")
                return False
                
        except Exception as e:
            logger.error(f"Piper TTS health check failed with exception: {e}")
            return False


# Global instance
piper_tts_service = PiperTTSService()