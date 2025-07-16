from typing import List, Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from services.tts_service import piper_tts_service
import logging

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
        if not piper_tts_service.is_service_available():
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
        is_available = piper_tts_service.is_service_available()
        
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
        is_available = piper_tts_service.is_service_available()
        
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