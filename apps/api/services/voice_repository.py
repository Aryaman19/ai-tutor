import asyncio
import aiohttp
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from config import settings

logger = logging.getLogger(__name__)

@dataclass
class VoiceMetadata:
    """Metadata for a Piper TTS voice"""
    id: str
    name: str
    language: str
    language_code: str
    country: str
    quality: str
    size_mb: float
    description: str
    sample_rate: int
    model_url: str
    config_url: str
    is_downloaded: bool = False
    is_downloading: bool = False
    download_progress: float = 0.0


class VoiceRepositoryService:
    """Service for managing Piper TTS voices from Hugging Face repository"""
    
    def __init__(self):
        self.voices_dir = Path(settings.tts_voices_dir)
        self.voices_dir.mkdir(parents=True, exist_ok=True)
        
        # Hugging Face repository URLs
        self.hf_repo_url = "https://huggingface.co/rhasspy/piper-voices"
        self.hf_api_url = "https://huggingface.co/api/models/rhasspy/piper-voices"
        self.hf_files_url = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
        
        # Cache for voice metadata
        self._voice_cache: Optional[List[VoiceMetadata]] = None
        self._cache_timestamp = 0
        self._cache_duration = 3600  # 1 hour
        
        # Download tracking
        self._download_progress: Dict[str, float] = {}
        self._downloading_voices: Dict[str, asyncio.Task] = {}
        
        logger.info("VoiceRepositoryService initialized")
    
    async def get_available_voices(self, force_refresh: bool = False) -> List[VoiceMetadata]:
        """Get list of available voices from Hugging Face repository"""
        import time
        
        current_time = time.time()
        
        # Use cached data if available and not expired
        if (not force_refresh and 
            self._voice_cache and 
            current_time - self._cache_timestamp < self._cache_duration):
            return self._voice_cache
        
        try:
            # Fetch voice metadata from Hugging Face
            voices = await self._fetch_voices_from_hf()
            
            # Update cache
            self._voice_cache = voices
            self._cache_timestamp = current_time
            
            logger.info(f"Fetched {len(voices)} voices from repository")
            return voices
            
        except Exception as e:
            logger.error(f"Error fetching voices from repository: {e}")
            # Return cached data if available, otherwise empty list
            return self._voice_cache or []
    
    async def _fetch_voices_from_hf(self) -> List[VoiceMetadata]:
        """Fetch voice metadata from Hugging Face repository"""
        voices = []
        
        try:
            # For now, return a curated list of real Piper voices that are known to exist
            # This is more reliable than trying to scrape the HF API which has rate limits
            voice_definitions = [
                {
                    "id": "en_US-lessac-medium",
                    "name": "Lessac (Medium)",
                    "language": "EN",
                    "language_code": "en_US",
                    "country": "US",
                    "quality": "medium",
                    "size_mb": 45.2,
                    "description": "English US voice - Clear and natural",
                    "sample_rate": 22050,
                    "model_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
                    "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
                },
                {
                    "id": "en_US-amy-medium",
                    "name": "Amy (Medium)",
                    "language": "EN",
                    "language_code": "en_US",
                    "country": "US",
                    "quality": "medium",
                    "size_mb": 42.8,
                    "description": "English US voice - Warm and friendly",
                    "sample_rate": 22050,
                    "model_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx",
                    "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json"
                },
                {
                    "id": "en_US-danny-low",
                    "name": "Danny (Low)",
                    "language": "EN",
                    "language_code": "en_US",
                    "country": "US",
                    "quality": "low",
                    "size_mb": 28.5,
                    "description": "English US voice - Compact size",
                    "sample_rate": 22050,
                    "model_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/danny/low/en_US-danny-low.onnx",
                    "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/danny/low/en_US-danny-low.onnx.json"
                },
                {
                    "id": "en_GB-alan-medium",
                    "name": "Alan (Medium)",
                    "language": "EN",
                    "language_code": "en_GB",
                    "country": "GB",
                    "quality": "medium",
                    "size_mb": 46.1,
                    "description": "English UK voice - British accent",
                    "sample_rate": 22050,
                    "model_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx",
                    "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json"
                },
                {
                    "id": "en_US-ryan-high",
                    "name": "Ryan (High)",
                    "language": "EN",
                    "language_code": "en_US",
                    "country": "US",
                    "quality": "high",
                    "size_mb": 52.3,
                    "description": "English US voice - High quality male",
                    "sample_rate": 22050,
                    "model_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx",
                    "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx.json"
                },
                {
                    "id": "en_US-kathleen-low",
                    "name": "Kathleen (Low)",
                    "language": "EN",
                    "language_code": "en_US",
                    "country": "US",
                    "quality": "low",
                    "size_mb": 29.1,
                    "description": "English US voice - Compact female",
                    "sample_rate": 22050,
                    "model_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kathleen/low/en_US-kathleen-low.onnx",
                    "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kathleen/low/en_US-kathleen-low.onnx.json"
                },
                {
                    "id": "en_GB-jenny_dioco-medium",
                    "name": "Jenny (Medium)",
                    "language": "EN",
                    "language_code": "en_GB",
                    "country": "GB",
                    "quality": "medium",
                    "size_mb": 44.7,
                    "description": "English UK voice - Clear female",
                    "sample_rate": 22050,
                    "model_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx",
                    "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx.json"
                }
            ]
            
            for voice_def in voice_definitions:
                voice = VoiceMetadata(
                    id=voice_def["id"],
                    name=voice_def["name"],
                    language=voice_def["language"],
                    language_code=voice_def["language_code"],
                    country=voice_def["country"],
                    quality=voice_def["quality"],
                    size_mb=voice_def["size_mb"],
                    description=voice_def["description"],
                    sample_rate=voice_def["sample_rate"],
                    model_url=voice_def["model_url"],
                    config_url=voice_def["config_url"],
                    is_downloaded=self._is_voice_downloaded(voice_def["id"]),
                    is_downloading=False,
                    download_progress=0.0
                )
                voices.append(voice)
            
            logger.info(f"Created {len(voices)} voice definitions")
            return voices
            
        except Exception as e:
            logger.error(f"Error creating voice definitions: {e}")
            return []
    
    async def _process_language_directory(self, session: aiohttp.ClientSession, 
                                        language_code: str, voices: List[VoiceMetadata]):
        """Process a language directory to extract voice metadata"""
        try:
            # Get files in the language directory
            async with session.get(f"{self.hf_api_url}/tree/main/{language_code}") as response:
                if response.status != 200:
                    return
                
                data = await response.json()
                
                # Group files by voice name
                voice_files = {}
                for item in data:
                    if item.get('type') == 'file' and item.get('path'):
                        file_path = item['path']
                        # Extract voice name from path (e.g., en_US/lessac/medium/en_US-lessac-medium.onnx)
                        path_parts = file_path.split('/')
                        if len(path_parts) >= 4:
                            voice_name = path_parts[1]  # e.g., lessac
                            quality = path_parts[2]     # e.g., medium
                            voice_id = f"{language_code}-{voice_name}-{quality}"
                            
                            if voice_id not in voice_files:
                                voice_files[voice_id] = {
                                    'language_code': language_code,
                                    'voice_name': voice_name,
                                    'quality': quality,
                                    'model_file': None,
                                    'config_file': None
                                }
                            
                            # Check file type
                            if file_path.endswith('.onnx'):
                                voice_files[voice_id]['model_file'] = file_path
                                voice_files[voice_id]['size_mb'] = item.get('size', 0) / (1024 * 1024)
                            elif file_path.endswith('.onnx.json'):
                                voice_files[voice_id]['config_file'] = file_path
                
                # Create VoiceMetadata objects
                for voice_id, voice_data in voice_files.items():
                    if voice_data['model_file'] and voice_data['config_file']:
                        voice_metadata = await self._create_voice_metadata(
                            session, voice_id, voice_data
                        )
                        if voice_metadata:
                            voices.append(voice_metadata)
            
        except Exception as e:
            logger.error(f"Error processing language directory {language_code}: {e}")
    
    async def _create_voice_metadata(self, session: aiohttp.ClientSession, 
                                   voice_id: str, voice_data: Dict) -> Optional[VoiceMetadata]:
        """Create VoiceMetadata object from voice data"""
        try:
            # Parse language and country from language_code
            language_code = voice_data['language_code']
            if '_' in language_code:
                language, country = language_code.split('_', 1)
            else:
                language = language_code
                country = ''
            
            # Create readable name
            voice_name = voice_data['voice_name'].title()
            quality = voice_data['quality'].title()
            name = f"{voice_name} ({quality})"
            
            # Get sample rate from config file
            sample_rate = 22050  # Default
            try:
                config_url = f"{self.hf_files_url}/{voice_data['config_file']}"
                async with session.get(config_url) as response:
                    if response.status == 200:
                        config_data = await response.json()
                        sample_rate = config_data.get('audio', {}).get('sample_rate', 22050)
            except Exception:
                pass  # Use default
            
            return VoiceMetadata(
                id=voice_id,
                name=name,
                language=language.upper(),
                language_code=language_code,
                country=country.upper(),
                quality=quality.lower(),
                size_mb=round(voice_data.get('size_mb', 0), 1),
                description=f"{language.upper()} voice - {name}",
                sample_rate=sample_rate,
                model_url=f"{self.hf_files_url}/{voice_data['model_file']}",
                config_url=f"{self.hf_files_url}/{voice_data['config_file']}",
                is_downloaded=False,
                is_downloading=False,
                download_progress=0.0
            )
            
        except Exception as e:
            logger.error(f"Error creating voice metadata for {voice_id}: {e}")
            return None
    
    def _is_voice_downloaded(self, voice_id: str) -> bool:
        """Check if a voice is already downloaded"""
        model_path = self.voices_dir / f"{voice_id}.onnx"
        config_path = self.voices_dir / f"{voice_id}.onnx.json"
        
        model_exists = model_path.exists()
        config_exists = config_path.exists()
        
        logger.debug(f"Checking voice {voice_id}: model={model_exists} ({model_path}), config={config_exists} ({config_path})")
        
        return model_exists and config_exists
    
    async def download_voice(self, voice_id: str) -> bool:
        """Download a voice and return success status"""
        if voice_id in self._downloading_voices:
            logger.info(f"Voice {voice_id} is already being downloaded")
            return False
        
        if self._is_voice_downloaded(voice_id):
            logger.info(f"Voice {voice_id} is already downloaded")
            return True
        
        # Get voice metadata
        voices = await self.get_available_voices()
        voice_metadata = next((v for v in voices if v.id == voice_id), None)
        
        if not voice_metadata:
            logger.error(f"Voice {voice_id} not found in repository")
            return False
        
        # Start download task
        download_task = asyncio.create_task(self._download_voice_files(voice_metadata))
        self._downloading_voices[voice_id] = download_task
        
        try:
            result = await download_task
            # Invalidate cache after successful download
            if result:
                self._voice_cache = None
                logger.info(f"Voice cache invalidated after downloading {voice_id}")
            return result
        finally:
            # Clean up
            if voice_id in self._downloading_voices:
                del self._downloading_voices[voice_id]
            if voice_id in self._download_progress:
                del self._download_progress[voice_id]
    
    async def _download_voice_files(self, voice_metadata: VoiceMetadata) -> bool:
        """Download voice model and config files"""
        voice_id = voice_metadata.id
        model_path = self.voices_dir / f"{voice_id}.onnx"
        config_path = self.voices_dir / f"{voice_id}.onnx.json"
        
        logger.info(f"Starting download for voice: {voice_id}")
        
        try:
            async with aiohttp.ClientSession() as session:
                # Download model file
                self._download_progress[voice_id] = 0.0
                success = await self._download_file(
                    session, voice_metadata.model_url, model_path, voice_id, weight=0.8
                )
                
                if not success:
                    return False
                
                # Download config file
                self._download_progress[voice_id] = 80.0
                success = await self._download_file(
                    session, voice_metadata.config_url, config_path, voice_id, weight=0.2
                )
                
                if success:
                    self._download_progress[voice_id] = 100.0
                    logger.info(f"Successfully downloaded voice: {voice_id}")
                    return True
                else:
                    # Clean up partial download
                    if model_path.exists():
                        model_path.unlink()
                    return False
                    
        except Exception as e:
            logger.error(f"Error downloading voice {voice_id}: {e}")
            # Clean up partial download
            if model_path.exists():
                model_path.unlink()
            if config_path.exists():
                config_path.unlink()
            return False
    
    async def _download_file(self, session: aiohttp.ClientSession, url: str, 
                           file_path: Path, voice_id: str, weight: float = 1.0) -> bool:
        """Download a single file with progress tracking"""
        try:
            async with session.get(url) as response:
                if response.status != 200:
                    logger.error(f"Failed to download {url}: {response.status}")
                    return False
                
                total_size = int(response.headers.get('content-length', 0))
                downloaded = 0
                
                with open(file_path, 'wb') as f:
                    async for chunk in response.content.iter_chunked(8192):
                        f.write(chunk)
                        downloaded += len(chunk)
                        
                        if total_size > 0:
                            progress = (downloaded / total_size) * weight * 100
                            self._download_progress[voice_id] = min(
                                self._download_progress.get(voice_id, 0) + progress, 
                                100.0
                            )
                
                return True
                
        except Exception as e:
            logger.error(f"Error downloading file {url}: {e}")
            return False
    
    async def delete_voice(self, voice_id: str) -> bool:
        """Delete a downloaded voice"""
        if voice_id in self._downloading_voices:
            logger.error(f"Cannot delete voice {voice_id}: download in progress")
            return False
        
        model_path = self.voices_dir / f"{voice_id}.onnx"
        config_path = self.voices_dir / f"{voice_id}.onnx.json"
        
        deleted = False
        
        try:
            if model_path.exists():
                model_path.unlink()
                deleted = True
                logger.info(f"Deleted model file: {model_path}")
            
            if config_path.exists():
                config_path.unlink()
                deleted = True
                logger.info(f"Deleted config file: {config_path}")
            
            if deleted:
                # Invalidate cache after successful deletion
                self._voice_cache = None
                logger.info(f"Successfully deleted voice: {voice_id} and invalidated cache")
            else:
                logger.warning(f"No files found to delete for voice: {voice_id}")
            
            return deleted
            
        except Exception as e:
            logger.error(f"Error deleting voice {voice_id}: {e}")
            return False
    
    async def get_installed_voices(self) -> List[VoiceMetadata]:
        """Get list of installed voices"""
        # Force refresh to get latest file status
        voices = await self.get_available_voices(force_refresh=True)
        return [v for v in voices if v.is_downloaded]
    
    def get_download_progress(self, voice_id: str) -> float:
        """Get download progress for a voice"""
        return self._download_progress.get(voice_id, 0.0)
    
    def is_voice_downloading(self, voice_id: str) -> bool:
        """Check if a voice is currently being downloaded"""
        return voice_id in self._downloading_voices


# Global instance
voice_repository_service = VoiceRepositoryService()