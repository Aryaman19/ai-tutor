from fastapi import APIRouter, HTTPException
from services.connection_service import ConnectionService
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/")
async def health_check():
    """Basic health check"""
    return {
        "status": "healthy",
        "message": "AI Tutor API is running",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }


@router.get("/detailed")
async def detailed_health_check():
    """Comprehensive health check"""
    try:
        # Test all connections
        ollama_status = await ConnectionService.test_ollama_connection()
        db_status = await ConnectionService.test_database_connection()
        tts_status = await ConnectionService.test_tts_providers()
        system_info = await ConnectionService.get_system_info()

        # Determine overall health
        overall_status = "healthy"
        if ollama_status["status"] != "connected":
            overall_status = "degraded"
        if db_status["status"] != "connected":
            overall_status = "unhealthy"

        return {
            "status": overall_status,
            "timestamp": datetime.now().isoformat(),
            "services": {
                "ollama": ollama_status,
                "database": db_status,
                "tts": tts_status
            },
            "system": system_info
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ollama")
async def test_ollama():
    """Test Ollama connection specifically"""
    return await ConnectionService.test_ollama_connection()


@router.get("/database")
async def test_database():
    """Test database connection specifically"""
    return await ConnectionService.test_database_connection()


@router.get("/tts")
async def test_tts():
    """Test TTS providers"""
    return await ConnectionService.test_tts_providers()
