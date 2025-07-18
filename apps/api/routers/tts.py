from typing import List, Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from services.tts_service import piper_tts_service
from services.voice_repository import voice_repository_service
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter()


class TTSGenerateRequest(BaseModel):
    text: str
    voice: Optional[str] = None


class TTSGenerateResponse(BaseModel):
    audio_id: str
    audio_url: str
    cached: bool
    text: str
    voice: str


class TTSVoiceResponse(BaseModel):
    id: str
    name: str
    language: str


class TTSCacheStatsResponse(BaseModel):
    total_files: int
    total_size_bytes: int
    total_size_mb: float
    cache_limit: int
    cache_directory: str


class TTSStreamingRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    max_chunk_size: Optional[int] = 200


class TTSStreamingChunkResponse(BaseModel):
    chunk_id: str
    audio_id: Optional[str]
    audio_url: Optional[str]
    index: int
    text: str
    is_ready: bool
    error: Optional[str] = None


class VoiceMetadataResponse(BaseModel):
    id: str
    name: str
    language: str
    language_code: str
    country: str
    quality: str
    size_mb: float
    description: str
    sample_rate: int
    is_downloaded: bool
    is_downloading: bool
    download_progress: float


class VoiceDownloadRequest(BaseModel):
    voice_id: str


class VoiceDownloadResponse(BaseModel):
    success: bool
    message: str
    voice_id: str


class VoiceDeleteResponse(BaseModel):
    success: bool
    message: str
    voice_id: str


@router.post("/tts/generate", response_model=TTSGenerateResponse)
async def generate_tts_audio(request: TTSGenerateRequest):
    """Generate TTS audio for the given text"""
    try:
        if not request.text.strip():
            raise HTTPException(
                status_code=400,
                detail="Text cannot be empty"
            )
        
        # Check if Piper TTS service is available
        if not await piper_tts_service.is_service_available():
            raise HTTPException(
                status_code=503,
                detail="Piper TTS service is not available. Please use browser TTS as fallback."
            )
        
        # Check if audio is already cached
        is_cached, audio_id = await piper_tts_service.is_audio_cached(
            request.text, request.voice
        )
        
        if not is_cached:
            # Generate new audio
            audio_id = await piper_tts_service.generate_audio(
                request.text, request.voice
            )
            
            if not audio_id:
                raise HTTPException(
                    status_code=503,
                    detail="Failed to generate TTS audio. Piper TTS service may be unavailable."
                )
        
        # Get the audio URL
        audio_url = piper_tts_service._get_audio_url(audio_id)
        
        # Use the provided voice or default
        voice = request.voice or piper_tts_service.default_voice
        
        return TTSGenerateResponse(
            audio_id=audio_id,
            audio_url=audio_url,
            cached=is_cached,
            text=request.text,
            voice=voice
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating TTS audio: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate TTS audio"
        )


@router.post("/tts/generate-streaming")
async def generate_streaming_tts_audio(request: TTSStreamingRequest):
    """Generate streaming TTS audio for the given text"""
    try:
        if not request.text.strip():
            raise HTTPException(
                status_code=400,
                detail="Text cannot be empty"
            )
        
        # Check if Piper TTS service is available
        if not await piper_tts_service.is_service_available():
            raise HTTPException(
                status_code=503,
                detail="Piper TTS service is not available. Please use browser TTS as fallback."
            )
        
        async def generate_stream():
            """Generate streaming response"""
            async for chunk in piper_tts_service.generate_streaming_audio(
                request.text, 
                request.voice, 
                request.max_chunk_size
            ):
                # Convert chunk to response format
                chunk_response = TTSStreamingChunkResponse(
                    chunk_id=chunk.chunk_id,
                    audio_id=chunk.audio_id,
                    audio_url=piper_tts_service._get_audio_url(chunk.audio_id) if chunk.audio_id else None,
                    index=chunk.index,
                    text=chunk.text,
                    is_ready=chunk.is_ready,
                    error=chunk.error
                )
                
                # Yield as JSON lines
                yield f"data: {chunk_response.model_dump_json()}\n\n"
            
            # Send end signal
            yield "data: {\"type\": \"end\"}\n\n"
        
        return StreamingResponse(
            generate_stream(),
            media_type="text/plain",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating streaming TTS audio: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate streaming TTS audio"
        )


@router.get("/tts/audio/{audio_id}")
async def get_tts_audio(audio_id: str):
    """Serve TTS audio file"""
    try:
        # Validate audio_id format (should be SHA256 hash)
        if len(audio_id) != 64 or not all(c in '0123456789abcdef' for c in audio_id):
            raise HTTPException(
                status_code=400,
                detail="Invalid audio ID format"
            )
        
        # Get audio file path
        audio_path = await piper_tts_service.get_audio_file_path(audio_id)
        
        if not audio_path:
            raise HTTPException(
                status_code=404,
                detail="Audio file not found"
            )
        
        # Validate audio file exists and has content
        if not audio_path.exists():
            raise HTTPException(
                status_code=404,
                detail="Audio file not found"
            )
        
        # Check if file has valid size (not empty)
        if audio_path.stat().st_size == 0:
            raise HTTPException(
                status_code=500,
                detail="Audio file is empty"
            )
        
        # Return the audio file
        return FileResponse(
            path=audio_path,
            media_type="audio/wav",
            filename=f"{audio_id}.wav",
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving TTS audio: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to serve TTS audio"
        )


@router.delete("/tts/audio/{audio_id}")
async def delete_tts_audio(audio_id: str):
    """Delete a specific TTS audio file"""
    try:
        # Validate audio_id format
        if len(audio_id) != 64 or not all(c in '0123456789abcdef' for c in audio_id):
            raise HTTPException(
                status_code=400,
                detail="Invalid audio ID format"
            )
        
        # Delete the audio file
        deleted = await piper_tts_service.delete_audio(audio_id)
        
        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Audio file not found"
            )
        
        return {"message": "Audio file deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting TTS audio: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete TTS audio"
        )


@router.delete("/tts/cache")
async def clear_tts_cache():
    """Clear all TTS cache files"""
    try:
        deleted_count = await piper_tts_service.clear_cache()
        
        return {
            "message": f"TTS cache cleared successfully",
            "deleted_files": deleted_count
        }
        
    except Exception as e:
        logger.error(f"Error clearing TTS cache: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to clear TTS cache"
        )


@router.get("/tts/voices", response_model=List[TTSVoiceResponse])
async def get_available_voices():
    """Get list of available TTS voices"""
    try:
        voices = await piper_tts_service.get_available_voices()
        
        # If no voices are available (e.g., not running in Docker), return a default response
        if not voices:
            logger.warning("No Piper voices found - returning default voice info")
            return [{
                "id": "en_US-lessac-medium",
                "name": "Lessac (Medium Quality) - Not Available",
                "language": "en_US"
            }]
        
        return voices
        
    except Exception as e:
        logger.error(f"Error getting available voices: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get available voices"
        )


@router.get("/tts/cache/stats", response_model=TTSCacheStatsResponse)
async def get_cache_stats():
    """Get TTS cache statistics"""
    try:
        stats = await piper_tts_service.get_cache_stats()
        return stats
        
    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get cache statistics"
        )


@router.get("/tts/availability")
async def tts_availability_check():
    """Check TTS service availability (fast check)"""
    try:
        is_available = await piper_tts_service.is_service_available()
        
        return {
            "available": is_available,
            "service": "Piper TTS",
            "message": "Service available" if is_available else "Piper TTS dependencies not found"
        }
        
    except Exception as e:
        logger.error(f"Error checking TTS availability: {e}")
        return {
            "available": False,
            "service": "Piper TTS",
            "error": str(e)
        }


@router.get("/tts/health")
async def tts_health_check():
    """Check TTS service health"""
    try:
        # Check basic service availability first
        is_available = await piper_tts_service.is_service_available()
        
        if not is_available:
            return {
                "status": "unavailable",
                "service": "Piper TTS",
                "healthy": False,
                "available": False,
                "message": "Piper TTS dependencies not found. Service unavailable."
            }
        
        # If available, do full health check
        is_healthy = await piper_tts_service.health_check()
        
        return {
            "status": "healthy" if is_healthy else "unhealthy",
            "service": "Piper TTS",
            "healthy": is_healthy,
            "available": True
        }
        
    except Exception as e:
        logger.error(f"Error checking TTS health: {e}")
        return {
            "status": "error",
            "service": "Piper TTS",
            "healthy": False,
            "available": False,
            "error": str(e)
        }


# Batch generation endpoint for lesson integration
@router.post("/tts/generate-batch")
async def generate_batch_tts(request: dict):
    """Generate TTS audio for multiple text chunks"""
    try:
        texts = request.get("texts", [])
        voice = request.get("voice")
        
        if not texts or not isinstance(texts, list):
            raise HTTPException(
                status_code=400,
                detail="texts must be a non-empty list"
            )
        
        results = []
        
        for i, text in enumerate(texts):
            if not text or not text.strip():
                results.append({
                    "index": i,
                    "text": text,
                    "error": "Empty text"
                })
                continue
            
            try:
                # Check if audio is already cached
                is_cached, audio_id = await piper_tts_service.is_audio_cached(text, voice)
                
                if not is_cached:
                    # Generate new audio
                    audio_id = await piper_tts_service.generate_audio(text, voice)
                    
                    if not audio_id:
                        results.append({
                            "index": i,
                            "text": text,
                            "error": "Failed to generate audio"
                        })
                        continue
                
                # Get the audio URL
                audio_url = piper_tts_service._get_audio_url(audio_id)
                
                results.append({
                    "index": i,
                    "text": text,
                    "audio_id": audio_id,
                    "audio_url": audio_url,
                    "cached": is_cached,
                    "voice": voice or piper_tts_service.default_voice
                })
                
            except Exception as e:
                logger.error(f"Error generating audio for text {i}: {e}")
                results.append({
                    "index": i,
                    "text": text,
                    "error": str(e)
                })
        
        return {
            "results": results,
            "total": len(texts),
            "success": len([r for r in results if "audio_id" in r]),
            "failed": len([r for r in results if "error" in r])
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in batch TTS generation: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate batch TTS audio"
        )


# Voice Management Endpoints

@router.get("/tts/voices/available", response_model=List[VoiceMetadataResponse])
async def get_available_voices_from_repository(force_refresh: bool = False):
    """Get list of available voices from repository"""
    try:
        voices = await voice_repository_service.get_available_voices(force_refresh=force_refresh)
        return [
            VoiceMetadataResponse(
                id=voice.id,
                name=voice.name,
                language=voice.language,
                language_code=voice.language_code,
                country=voice.country,
                quality=voice.quality,
                size_mb=voice.size_mb,
                description=voice.description,
                sample_rate=voice.sample_rate,
                is_downloaded=voice.is_downloaded,
                is_downloading=voice.is_downloading,
                download_progress=voice.download_progress
            )
            for voice in voices
        ]
    except Exception as e:
        logger.error(f"Error getting available voices: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get available voices"
        )


@router.get("/tts/voices/installed", response_model=List[VoiceMetadataResponse])
async def get_installed_voices():
    """Get list of installed voices"""
    try:
        voices = await voice_repository_service.get_installed_voices()
        return [
            VoiceMetadataResponse(
                id=voice.id,
                name=voice.name,
                language=voice.language,
                language_code=voice.language_code,
                country=voice.country,
                quality=voice.quality,
                size_mb=voice.size_mb,
                description=voice.description,
                sample_rate=voice.sample_rate,
                is_downloaded=voice.is_downloaded,
                is_downloading=voice.is_downloading,
                download_progress=voice.download_progress
            )
            for voice in voices
        ]
    except Exception as e:
        logger.error(f"Error getting installed voices: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get installed voices"
        )


@router.post("/tts/voices/download", response_model=VoiceDownloadResponse)
async def download_voice(request: VoiceDownloadRequest):
    """Download a voice from repository"""
    try:
        voice_id = request.voice_id
        
        # Check if voice is already downloaded
        if voice_repository_service._is_voice_downloaded(voice_id):
            return VoiceDownloadResponse(
                success=True,
                message=f"Voice {voice_id} is already downloaded",
                voice_id=voice_id
            )
        
        # Check if voice is already downloading
        if voice_repository_service.is_voice_downloading(voice_id):
            return VoiceDownloadResponse(
                success=False,
                message=f"Voice {voice_id} is already being downloaded",
                voice_id=voice_id
            )
        
        # Start download
        success = await voice_repository_service.download_voice(voice_id)
        
        if success:
            # Refresh TTS service voice configurations
            await piper_tts_service.refresh_voice_configurations()
            
            return VoiceDownloadResponse(
                success=True,
                message=f"Voice {voice_id} downloaded successfully",
                voice_id=voice_id
            )
        else:
            return VoiceDownloadResponse(
                success=False,
                message=f"Failed to download voice {voice_id}",
                voice_id=voice_id
            )
            
    except Exception as e:
        logger.error(f"Error downloading voice {request.voice_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download voice: {str(e)}"
        )


@router.delete("/tts/voices/{voice_id}", response_model=VoiceDeleteResponse)
async def delete_voice(voice_id: str):
    """Delete an installed voice"""
    try:
        # Check if voice is currently downloading
        if voice_repository_service.is_voice_downloading(voice_id):
            return VoiceDeleteResponse(
                success=False,
                message=f"Cannot delete voice {voice_id}: download in progress",
                voice_id=voice_id
            )
        
        # Delete the voice
        success = await voice_repository_service.delete_voice(voice_id)
        
        if success:
            # Refresh TTS service voice configurations
            await piper_tts_service.refresh_voice_configurations()
            
            return VoiceDeleteResponse(
                success=True,
                message=f"Voice {voice_id} deleted successfully",
                voice_id=voice_id
            )
        else:
            return VoiceDeleteResponse(
                success=False,
                message=f"Voice {voice_id} not found or already deleted",
                voice_id=voice_id
            )
            
    except Exception as e:
        logger.error(f"Error deleting voice {voice_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete voice: {str(e)}"
        )


@router.get("/tts/voices/{voice_id}/progress")
async def get_voice_download_progress(voice_id: str):
    """Get download progress for a voice"""
    try:
        progress = voice_repository_service.get_download_progress(voice_id)
        is_downloading = voice_repository_service.is_voice_downloading(voice_id)
        is_downloaded = voice_repository_service._is_voice_downloaded(voice_id)
        
        return {
            "voice_id": voice_id,
            "progress": progress,
            "is_downloading": is_downloading,
            "is_downloaded": is_downloaded
        }
        
    except Exception as e:
        logger.error(f"Error getting download progress for voice {voice_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get download progress: {str(e)}"
        )