from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from services.tts_service import piper_tts_service
from services.voice_repository import voice_repository_service
from utils.error_handler import ErrorHandler
import logging
import json
import time
import asyncio

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


# Voice Calibration Models
class VoiceCalibrationRequest(BaseModel):
    voice_id: str = Field(..., description="Voice ID to calibrate")
    sample_texts: List[str] = Field(default=[
        "Hello, this is a test of the voice calibration system.",
        "The quick brown fox jumps over the lazy dog.",
        "Testing, one, two, three. Can you hear me clearly?",
        "This sample helps calibrate the speaking rate and timing accuracy.",
        "Artificial intelligence and machine learning are transforming our world."
    ], description="Sample texts for calibration measurement")
    force_recalibration: bool = Field(False, description="Force recalibration even if data exists")


class VoiceCalibrationSample(BaseModel):
    text: str
    word_count: int
    character_count: int
    estimated_duration: float
    measured_duration: float
    words_per_minute: float
    characters_per_second: float


class VoiceCalibrationResult(BaseModel):
    voice_id: str
    words_per_minute: float
    characters_per_second: float
    sample_count: int
    confidence_score: float
    last_updated: str
    calibration_samples: List[VoiceCalibrationSample]


class VoiceCalibrationResponse(BaseModel):
    success: bool
    voice_id: str
    result: Optional[VoiceCalibrationResult] = None
    error: Optional[str] = None
    calibration_time_ms: Optional[float] = None


class CalibrationStatsResponse(BaseModel):
    total_calibrated_voices: int
    overall_confidence: float
    voices: Dict[str, Dict[str, Any]]


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
            # Sanitize text before generating audio (additional safety net)
            sanitized_text = piper_tts_service._sanitize_text_for_tts(request.text)
            
            # Generate new audio
            audio_id = await piper_tts_service.generate_audio(
                sanitized_text, request.voice
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
        raise ErrorHandler.handle_service_error("generate TTS audio", e)


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
        raise ErrorHandler.handle_service_error("generate streaming TTS audio", e)


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
        raise ErrorHandler.handle_service_error("serve TTS audio", e)


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
        raise ErrorHandler.handle_service_error("delete TTS audio", e)


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
        raise ErrorHandler.handle_service_error("get available voices", e)


# Removed duplicate endpoint - using the one at line 479 for voice metadata


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
                # Sanitize text before processing (additional safety net)
                sanitized_text = piper_tts_service._sanitize_text_for_tts(text)
                
                # Check if audio is already cached
                is_cached, audio_id = await piper_tts_service.is_audio_cached(sanitized_text, voice)
                
                if not is_cached:
                    # Generate new audio
                    audio_id = await piper_tts_service.generate_audio(sanitized_text, voice)
                    
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
                language_code=getattr(voice, 'language_code', voice.language),
                country=getattr(voice, 'country', 'Unknown'),
                quality=getattr(voice, 'quality', 'medium'),
                size_mb=getattr(voice, 'size_mb', 0.0),
                description=getattr(voice, 'description', f"{voice.name} voice"),
                sample_rate=getattr(voice, 'sample_rate', 22050),
                is_downloaded=getattr(voice, 'is_downloaded', False),
                is_downloading=getattr(voice, 'is_downloading', False),
                download_progress=getattr(voice, 'download_progress', 0.0)
            )
            for voice in voices
        ]
    except Exception as e:
        raise ErrorHandler.handle_service_error("get available voices", e)


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
        raise ErrorHandler.handle_service_error("get installed voices", e)


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


# Voice Calibration Endpoints

@router.post("/tts/voices/{voice_id}/calibrate", response_model=VoiceCalibrationResponse)
async def calibrate_voice(voice_id: str, request: VoiceCalibrationRequest):
    """Calibrate a voice for accurate timing by measuring actual TTS output"""
    try:
        start_time = time.time()
        
        # Check if TTS service is available
        if not await piper_tts_service.is_service_available():
            return VoiceCalibrationResponse(
                success=False,
                voice_id=voice_id,
                error="Piper TTS service is not available"
            )
        
        # Check if voice exists
        available_voices = await piper_tts_service.get_available_voices()
        voice_exists = any(v['id'] == voice_id for v in available_voices)
        
        if not voice_exists:
            return VoiceCalibrationResponse(
                success=False,
                voice_id=voice_id,
                error=f"Voice {voice_id} not found or not installed"
            )
        
        # Check if calibration already exists and force_recalibration is False
        calibration_stats = piper_tts_service.get_calibration_stats()
        if not request.force_recalibration and voice_id in calibration_stats.get('voices', {}):
            existing_cal = calibration_stats['voices'][voice_id]
            if existing_cal.get('confidence_score', 0) >= 0.5:
                logger.info(f"Using existing calibration for voice {voice_id}")
                
                calibration_time = (time.time() - start_time) * 1000
                return VoiceCalibrationResponse(
                    success=True,
                    voice_id=voice_id,
                    result=VoiceCalibrationResult(
                        voice_id=voice_id,
                        words_per_minute=existing_cal['words_per_minute'],
                        characters_per_second=existing_cal['characters_per_second'],
                        sample_count=existing_cal['sample_count'],
                        confidence_score=existing_cal['confidence_score'],
                        last_updated=existing_cal['last_updated'],
                        calibration_samples=[]
                    ),
                    calibration_time_ms=calibration_time
                )
        
        logger.info(f"Starting voice calibration for {voice_id} with {len(request.sample_texts)} samples")
        
        # Generate audio samples and measure durations
        calibration_samples = []
        
        for text in request.sample_texts:
            if not text.strip():
                continue
            
            try:
                # Sanitize text before processing (additional safety net)
                sanitized_text = piper_tts_service._sanitize_text_for_tts(text)
                
                # Generate audio and measure duration
                audio_id = await piper_tts_service.generate_audio(sanitized_text, voice_id)
                
                if not audio_id:
                    logger.warning(f"Failed to generate audio for sample: {text[:50]}...")
                    continue
                
                # Get measured duration
                audio_path = piper_tts_service._get_audio_path(audio_id)
                measured_duration = piper_tts_service._measure_audio_duration(audio_path)
                
                if not measured_duration:
                    logger.warning(f"Failed to measure duration for sample: {text[:50]}...")
                    continue
                
                # Calculate metrics
                word_count = len(text.split())
                character_count = len(text)
                estimated_duration = piper_tts_service.estimate_duration_with_calibration(text, voice_id)
                
                if word_count > 0 and measured_duration > 0:
                    words_per_minute = (word_count / measured_duration) * 60
                    characters_per_second = character_count / measured_duration
                    
                    calibration_samples.append(VoiceCalibrationSample(
                        text=text,
                        word_count=word_count,
                        character_count=character_count,
                        estimated_duration=estimated_duration,
                        measured_duration=measured_duration,
                        words_per_minute=words_per_minute,
                        characters_per_second=characters_per_second
                    ))
                    
                    logger.debug(f"Calibration sample: {word_count} words, {measured_duration:.2f}s, {words_per_minute:.1f} WPM")
                
            except Exception as e:
                logger.error(f"Error processing calibration sample: {e}")
                continue
        
        if not calibration_samples:
            return VoiceCalibrationResponse(
                success=False,
                voice_id=voice_id,
                error="No valid calibration samples could be generated"
            )
        
        # Get final calibration result from TTS service
        final_stats = piper_tts_service.get_calibration_stats()
        voice_stats = final_stats.get('voices', {}).get(voice_id, {})
        
        if not voice_stats:
            return VoiceCalibrationResponse(
                success=False,
                voice_id=voice_id,
                error="Calibration completed but no statistics available"
            )
        
        calibration_time = (time.time() - start_time) * 1000
        
        result = VoiceCalibrationResult(
            voice_id=voice_id,
            words_per_minute=voice_stats['words_per_minute'],
            characters_per_second=voice_stats['characters_per_second'],
            sample_count=voice_stats['sample_count'],
            confidence_score=voice_stats['confidence_score'],
            last_updated=voice_stats['last_updated'],
            calibration_samples=calibration_samples
        )
        
        logger.info(f"Voice calibration completed for {voice_id}: {result.words_per_minute:.1f} WPM, confidence {result.confidence_score:.2f}")
        
        return VoiceCalibrationResponse(
            success=True,
            voice_id=voice_id,
            result=result,
            calibration_time_ms=calibration_time
        )
        
    except Exception as e:
        logger.error(f"Error calibrating voice {voice_id}: {e}")
        return VoiceCalibrationResponse(
            success=False,
            voice_id=voice_id,
            error=str(e)
        )


@router.get("/tts/voices/{voice_id}/calibration")
async def get_voice_calibration(voice_id: str):
    """Get existing calibration data for a voice"""
    try:
        calibration_stats = piper_tts_service.get_calibration_stats()
        voice_stats = calibration_stats.get('voices', {}).get(voice_id)
        
        if not voice_stats:
            raise HTTPException(
                status_code=404,
                detail=f"No calibration data found for voice {voice_id}"
            )
        
        return {
            "voice_id": voice_id,
            "words_per_minute": voice_stats['words_per_minute'],
            "characters_per_second": voice_stats['characters_per_second'],
            "sample_count": voice_stats['sample_count'],
            "confidence_score": voice_stats['confidence_score'],
            "last_updated": voice_stats['last_updated']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting calibration for voice {voice_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get calibration data: {str(e)}"
        )


@router.get("/tts/calibration/stats", response_model=CalibrationStatsResponse)
async def get_calibration_stats():
    """Get overall calibration statistics for all voices"""
    try:
        stats = piper_tts_service.get_calibration_stats()
        return CalibrationStatsResponse(
            total_calibrated_voices=stats['total_calibrated_voices'],
            overall_confidence=stats['overall_confidence'],
            voices=stats['voices']
        )
        
    except Exception as e:
        logger.error(f"Error getting calibration stats: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get calibration statistics: {str(e)}"
        )


@router.post("/tts/calibration/auto-calibrate")
async def auto_calibrate_all_voices():
    """Automatically calibrate all installed voices"""
    try:
        # Get all installed voices
        available_voices = await piper_tts_service.get_available_voices()
        
        if not available_voices:
            return {
                "success": False,
                "message": "No voices available for calibration",
                "results": []
            }
        
        results = []
        
        # Calibrate each voice with default samples
        for voice in available_voices:
            voice_id = voice['id']
            
            try:
                # Use default calibration request
                calibration_request = VoiceCalibrationRequest(
                    voice_id=voice_id,
                    force_recalibration=False
                )
                
                # Calibrate the voice
                result = await calibrate_voice(voice_id, calibration_request)
                
                results.append({
                    "voice_id": voice_id,
                    "voice_name": voice['name'],
                    "success": result.success,
                    "words_per_minute": result.result.words_per_minute if result.result else None,
                    "confidence_score": result.result.confidence_score if result.result else None,
                    "error": result.error
                })
                
                # Small delay between calibrations to avoid overwhelming the system
                await asyncio.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Error calibrating voice {voice_id}: {e}")
                results.append({
                    "voice_id": voice_id,
                    "voice_name": voice['name'],
                    "success": False,
                    "error": str(e)
                })
        
        successful_calibrations = len([r for r in results if r['success']])
        
        return {
            "success": True,
            "message": f"Auto-calibration completed: {successful_calibrations}/{len(results)} voices calibrated successfully",
            "results": results,
            "total_voices": len(results),
            "successful_calibrations": successful_calibrations
        }
        
    except Exception as e:
        logger.error(f"Error in auto-calibration: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Auto-calibration failed: {str(e)}"
        )


@router.post("/tts/test-timing-fix")
async def test_timing_fix():
    """Test endpoint to verify the TTS timing fix works correctly"""
    try:
        # Test samples with different lengths and complexities
        test_samples = [
            "Hello, this is a short test.",
            "This is a medium length sentence to test the timing accuracy of our text-to-speech system.",
            "This is a much longer sentence that contains more complex words and technical terminology like artificial intelligence, machine learning, and natural language processing to test how well our calibration system handles longer content with varying complexity."
        ]
        
        results = []
        
        for i, text in enumerate(test_samples):
            try:
                # Sanitize text before processing (additional safety net)
                sanitized_text = piper_tts_service._sanitize_text_for_tts(text)
                
                # Get estimated duration
                estimated_duration = piper_tts_service.estimate_duration_with_calibration(sanitized_text)
                
                # Generate actual TTS audio
                audio_id = await piper_tts_service.generate_audio(sanitized_text)
                
                if not audio_id:
                    results.append({
                        "sample": i + 1,
                        "text": text[:50] + "...",
                        "error": "Failed to generate TTS audio"
                    })
                    continue
                
                # Measure actual duration
                audio_path = piper_tts_service._get_audio_path(audio_id)
                measured_duration = piper_tts_service._measure_audio_duration(audio_path)
                
                if not measured_duration:
                    results.append({
                        "sample": i + 1,
                        "text": text[:50] + "...",
                        "error": "Failed to measure audio duration"
                    })
                    continue
                
                # Calculate accuracy metrics
                word_count = len(text.split())
                char_count = len(text)
                timing_accuracy = min(1.0, estimated_duration / measured_duration) if measured_duration > 0 else 0
                actual_wpm = (word_count / measured_duration) * 60 if measured_duration > 0 else 0
                
                results.append({
                    "sample": i + 1,
                    "text": text[:50] + "...",
                    "word_count": word_count,
                    "character_count": char_count,
                    "estimated_duration_seconds": round(estimated_duration, 2),
                    "measured_duration_seconds": round(measured_duration, 2),
                    "timing_accuracy": round(timing_accuracy, 3),
                    "actual_words_per_minute": round(actual_wpm, 1),
                    "timing_error_percent": round(abs(estimated_duration - measured_duration) / measured_duration * 100, 1) if measured_duration > 0 else None,
                    "audio_id": audio_id
                })
                
            except Exception as e:
                logger.error(f"Error testing sample {i + 1}: {e}")
                results.append({
                    "sample": i + 1,
                    "text": text[:50] + "...",
                    "error": str(e)
                })
        
        # Get overall calibration stats
        calibration_stats = piper_tts_service.get_calibration_stats()
        
        # Calculate overall accuracy
        successful_results = [r for r in results if "timing_accuracy" in r]
        overall_accuracy = sum(r["timing_accuracy"] for r in successful_results) / len(successful_results) if successful_results else 0
        
        return {
            "success": True,
            "message": "TTS timing fix test completed",
            "overall_timing_accuracy": round(overall_accuracy, 3),
            "successful_samples": len(successful_results),
            "total_samples": len(test_samples),
            "calibration_stats": calibration_stats,
            "sample_results": results,
            "timing_improvements": {
                "before_fix": "Fixed 180 WPM estimation with 20% buffer",
                "after_fix": "Voice-specific calibration with measured durations",
                "key_improvements": [
                    "Actual audio duration measurement",
                    "Voice-specific speaking rate calibration",
                    "Improved estimation accuracy",
                    "Timeline synchronization fixes",
                    "Automatic recalibration system"
                ]
            }
        }
        
    except Exception as e:
        logger.error(f"Error in timing fix test: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Timing fix test failed: {str(e)}"
        )