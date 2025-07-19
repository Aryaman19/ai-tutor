import asyncio
import hashlib
import os
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple, AsyncGenerator
import aiofiles
import logging
from config import settings
import wave
import io
import re
from dataclasses import dataclass
from .voice_repository import voice_repository_service

logger = logging.getLogger(__name__)

@dataclass
class TextChunk:
    """Represents a chunk of text for streaming TTS"""
    text: str
    index: int
    chunk_id: str
    
@dataclass
class StreamingAudioChunk:
    """Represents a generated audio chunk for streaming"""
    chunk_id: str
    audio_id: str
    index: int
    text: str
    is_ready: bool = False
    error: Optional[str] = None


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
        self.voice_configs = {}
        
        # Ensure cache directory exists
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Check if Piper TTS is available
        self._is_piper_available = None
        self._availability_checked = False
        
        logger.info(f"PiperTTSService initialized with cache dir: {self.cache_dir}")
    
    async def _load_voice_configurations(self):
        """Load voice configurations from installed voices"""
        try:
            # Get installed voices from repository service
            installed_voices = await voice_repository_service.get_installed_voices()
            logger.info(f"Found {len(installed_voices)} installed voices from repository")
            
            # Clear existing configurations
            self.voice_configs.clear()
            
            # Add configurations for installed voices
            for voice in installed_voices:
                model_path = self.voices_dir / f"{voice.id}.onnx"
                config_path = self.voices_dir / f"{voice.id}.onnx.json"
                
                logger.debug(f"Configuring voice {voice.id}: model={model_path.exists()}, config={config_path.exists()}")
                
                # Load audio configuration from the voice config file
                sample_rate = 22050  # default fallback
                if config_path.exists():
                    try:
                        import json
                        with open(config_path, 'r') as f:
                            config_data = json.load(f)
                            if 'audio' in config_data and 'sample_rate' in config_data['audio']:
                                sample_rate = config_data['audio']['sample_rate']
                                logger.debug(f"Voice {voice.id} sample rate: {sample_rate}")
                    except Exception as e:
                        logger.warning(f"Could not read sample rate from {config_path}: {e}")
                
                self.voice_configs[voice.id] = {
                    "model_path": model_path,
                    "config_path": config_path,
                    "name": voice.name,
                    "language": voice.language_code,
                    "sample_rate": sample_rate
                }
            
            # Ensure default voice exists, if not use first available
            if self.default_voice not in self.voice_configs and self.voice_configs:
                self.default_voice = list(self.voice_configs.keys())[0]
                logger.info(f"Default voice not found, using: {self.default_voice}")
            
            logger.info(f"Loaded {len(self.voice_configs)} voice configurations: {list(self.voice_configs.keys())}")
            
        except Exception as e:
            logger.error(f"Error loading voice configurations: {e}")
            # Fallback to default configuration if available
            default_model = self.voices_dir / "en_US-lessac-medium.onnx"
            default_config = self.voices_dir / "en_US-lessac-medium.onnx.json"
            
            if default_model.exists() and default_config.exists():
                self.voice_configs = {
                    "en_US-lessac-medium": {
                        "model_path": default_model,
                        "config_path": default_config,
                        "name": "Lessac (Medium Quality)",
                        "language": "en_US",
                        "sample_rate": 22050
                    }
                }
                logger.info("Loaded fallback default voice configuration")
    
    async def refresh_voice_configurations(self):
        """Refresh voice configurations after voices are downloaded or deleted"""
        self._availability_checked = False
        await self._load_voice_configurations()
        logger.info(f"Voice configurations refreshed: {len(self.voice_configs)} voices loaded")
    
    async def _check_piper_availability(self) -> bool:
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
        
        # Load voice configurations
        await self._load_voice_configurations()
        
        # Check if any voices are available
        if not self.voice_configs:
            logger.warning("No voice configurations found")
            self._is_piper_available = False
            return False
        
        # Check if default voice files exist
        if self.default_voice in self.voice_configs:
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
    
    async def is_service_available(self) -> bool:
        """Check if the TTS service is available"""
        return await self._check_piper_availability()
    
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
        if not await self.is_service_available():
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
                from piper import PiperVoice
                
                logger.info(f"Generating TTS audio using Python piper module: {audio_id}")
                
                # Load the voice model
                piper_voice = PiperVoice.load(str(voice_config["model_path"]))
                
                # Generate audio
                audio_bytes = b''
                for chunk in piper_voice.synthesize(text, syn_config=None):
                    audio_bytes += chunk.audio_int16_bytes
                
                # Get the correct sample rate from voice configuration
                sample_rate = voice_config.get("sample_rate", 22050)
                
                # Validate audio data
                if not audio_bytes:
                    logger.error("No audio data generated by Piper TTS")
                    return None
                
                if len(audio_bytes) < 100:  # Minimum reasonable audio size
                    logger.warning(f"Generated audio seems too short: {len(audio_bytes)} bytes")
                
                # Save as proper WAV file with headers
                try:
                    with wave.open(str(audio_path), 'wb') as wav_file:
                        wav_file.setnchannels(1)  # mono
                        wav_file.setsampwidth(2)  # 16-bit
                        wav_file.setframerate(sample_rate)  # use voice-specific sample rate
                        wav_file.writeframes(audio_bytes)
                    
                    # Validate the generated WAV file
                    if not audio_path.exists() or audio_path.stat().st_size == 0:
                        logger.error(f"Generated WAV file is empty or doesn't exist: {audio_path}")
                        return None
                    
                    logger.debug(f"Generated WAV file: {audio_path.stat().st_size} bytes, sample rate: {sample_rate} Hz")
                    
                except wave.Error as e:
                    logger.error(f"Error creating WAV file: {e}")
                    # Clean up failed attempt
                    if audio_path.exists():
                        audio_path.unlink()
                    return None
                
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
        # Ensure voice configurations are loaded
        await self._load_voice_configurations()
        
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
            if not await self.is_service_available():
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

    def _split_text_into_chunks(self, text: str, max_chunk_size: int = 200) -> List[TextChunk]:
        """Split text into optimal chunks for streaming TTS"""
        if not text.strip():
            return []
        
        # First, split by sentences
        sentence_endings = r'[.!?]+\s*'
        sentences = re.split(sentence_endings, text.strip())
        sentences = [s.strip() for s in sentences if s.strip()]
        
        chunks = []
        current_chunk = ""
        chunk_index = 0
        
        for sentence in sentences:
            # If adding this sentence would exceed max size, finalize current chunk
            if current_chunk and len(current_chunk) + len(sentence) + 1 > max_chunk_size:
                chunk_id = hashlib.sha256(f"{current_chunk}_{chunk_index}".encode()).hexdigest()[:16]
                chunks.append(TextChunk(
                    text=current_chunk.strip(),
                    index=chunk_index,
                    chunk_id=chunk_id
                ))
                current_chunk = sentence
                chunk_index += 1
            else:
                if current_chunk:
                    current_chunk += " " + sentence
                else:
                    current_chunk = sentence
        
        # Add the last chunk if it exists
        if current_chunk.strip():
            chunk_id = hashlib.sha256(f"{current_chunk}_{chunk_index}".encode()).hexdigest()[:16]
            chunks.append(TextChunk(
                text=current_chunk.strip(),
                index=chunk_index,
                chunk_id=chunk_id
            ))
        
        logger.info(f"Split text into {len(chunks)} chunks")
        return chunks

    async def _generate_chunk_batch(self, chunks: List[TextChunk], voice: str = None) -> List[StreamingAudioChunk]:
        """Generate audio for multiple chunks in parallel"""
        voice = voice or self.default_voice
        
        async def generate_single_chunk(chunk: TextChunk) -> StreamingAudioChunk:
            try:
                audio_id = await self.generate_audio(chunk.text, voice)
                return StreamingAudioChunk(
                    chunk_id=chunk.chunk_id,
                    audio_id=audio_id,
                    index=chunk.index,
                    text=chunk.text,
                    is_ready=audio_id is not None,
                    error=None if audio_id else "Generation failed"
                )
            except Exception as e:
                logger.error(f"Error generating chunk {chunk.chunk_id}: {e}")
                return StreamingAudioChunk(
                    chunk_id=chunk.chunk_id,
                    audio_id=None,
                    index=chunk.index,
                    text=chunk.text,
                    is_ready=False,
                    error=str(e)
                )
        
        # Generate all chunks in parallel
        tasks = [generate_single_chunk(chunk) for chunk in chunks]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        streaming_chunks = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Exception generating chunk {i}: {result}")
                streaming_chunks.append(StreamingAudioChunk(
                    chunk_id=chunks[i].chunk_id,
                    audio_id=None,
                    index=chunks[i].index,
                    text=chunks[i].text,
                    is_ready=False,
                    error=str(result)
                ))
            else:
                streaming_chunks.append(result)
        
        return streaming_chunks

    async def generate_streaming_audio(self, text: str, voice: str = None, max_chunk_size: int = 200) -> AsyncGenerator[StreamingAudioChunk, None]:
        """
        Generate streaming TTS audio for the given text.
        Yields StreamingAudioChunk objects as they become available.
        """
        if not text.strip():
            logger.warning("Empty text provided for streaming TTS generation")
            return
        
        # Check if Piper TTS is available
        if not await self.is_service_available():
            logger.warning("Piper TTS service is not available - cannot generate streaming audio")
            return
        
        # Split text into chunks
        chunks = self._split_text_into_chunks(text, max_chunk_size)
        if not chunks:
            logger.warning("No chunks generated from text")
            return
        
        # Generate audio chunks in parallel but yield them in order
        logger.info(f"Generating streaming audio for {len(chunks)} chunks")
        
        # Start generation for all chunks
        generation_tasks = {}
        for chunk in chunks:
            task = asyncio.create_task(self._generate_single_chunk_async(chunk, voice))
            generation_tasks[chunk.index] = task
        
        # Yield chunks in order as they complete
        yielded_indices = set()
        pending_results = {}
        
        while len(yielded_indices) < len(chunks):
            # Check all pending tasks
            for index, task in list(generation_tasks.items()):
                if index in yielded_indices:
                    continue
                    
                if task.done():
                    try:
                        result = await task
                        pending_results[index] = result
                        del generation_tasks[index]
                    except Exception as e:
                        logger.error(f"Error in streaming generation task {index}: {e}")
                        pending_results[index] = StreamingAudioChunk(
                            chunk_id=chunks[index].chunk_id,
                            audio_id=None,
                            index=index,
                            text=chunks[index].text,
                            is_ready=False,
                            error=str(e)
                        )
                        del generation_tasks[index]
            
            # Yield any ready results in order
            next_index = len(yielded_indices)
            if next_index in pending_results:
                yield pending_results[next_index]
                yielded_indices.add(next_index)
                del pending_results[next_index]
            else:
                # Wait a bit before checking again
                await asyncio.sleep(0.1)
    
    async def _generate_single_chunk_async(self, chunk: TextChunk, voice: str = None) -> StreamingAudioChunk:
        """Generate audio for a single chunk asynchronously"""
        try:
            audio_id = await self.generate_audio(chunk.text, voice)
            return StreamingAudioChunk(
                chunk_id=chunk.chunk_id,
                audio_id=audio_id,
                index=chunk.index,
                text=chunk.text,
                is_ready=audio_id is not None,
                error=None if audio_id else "Generation failed"
            )
        except Exception as e:
            logger.error(f"Error generating chunk {chunk.chunk_id}: {e}")
            return StreamingAudioChunk(
                chunk_id=chunk.chunk_id,
                audio_id=None,
                index=chunk.index,
                text=chunk.text,
                is_ready=False,
                error=str(e)
            )


# Global instance
piper_tts_service = PiperTTSService()