import httpx
import asyncio
import logging
from typing import Dict, Any
from config import settings
from database import ping_database

logger = logging.getLogger(__name__)


class ConnectionService:

    @staticmethod
    async def test_ollama_connection() -> Dict[str, Any]:
        """Test Ollama connection and get available models"""
        try:
            # Get Ollama URL based on environment
            ollama_url = settings.get_ollama_url()

            async with httpx.AsyncClient(timeout=10.0) as client:
                # Test basic connection
                response = await client.get(f"{ollama_url}/api/tags")

                if response.status_code == 200:
                    models = response.json()
                    return {
                        "status": "connected",
                        "url": ollama_url,
                        "models": models.get("models", []),
                        "count": len(models.get("models", []))
                    }
                else:
                    return {
                        "status": "error",
                        "url": ollama_url,
                        "error": f"HTTP {response.status_code}"
                    }

        except httpx.ConnectError:
            return {
                "status": "disconnected",
                "url": ollama_url,
                "error": "Connection refused - is Ollama running?"
            }
        except Exception as e:
            return {
                "status": "error",
                "url": ollama_url,
                "error": str(e)
            }

    @staticmethod
    async def test_database_connection() -> Dict[str, Any]:
        """Test MongoDB connection"""
        return await ping_database()

    @staticmethod
    async def test_tts_providers() -> Dict[str, Any]:
        """Test available TTS providers"""
        providers = {}

        # Test Browser TTS (always available in frontend)
        providers["browser"] = {
            "status": "available",
            "note": "Available in frontend via Web Speech API"
        }

        # Test Edge TTS
        try:
            import edge_tts
            providers["edge"] = {"status": "available"}
        except ImportError:
            providers["edge"] = {"status": "unavailable",
                                 "error": "Module not installed"}

        # Test gTTS
        try:
            from gtts import gTTS
            providers["google"] = {"status": "available"}
        except ImportError:
            providers["google"] = {
                "status": "unavailable", "error": "Module not installed"}

        # Test pyttsx3
        try:
            import pyttsx3
            engine = pyttsx3.init()
            voices = engine.getProperty('voices')
            providers["local"] = {
                "status": "available",
                "voices_count": len(voices) if voices else 0
            }
        except Exception as e:
            providers["local"] = {"status": "error", "error": str(e)}

        return providers

    @staticmethod
    async def get_system_info() -> Dict[str, Any]:
        """Get system information"""
        import platform
        import os

        return {
            "platform": platform.platform(),
            "python_version": platform.python_version(),
            "is_container": settings.is_container(),
            "environment": settings.environment,
            "working_directory": os.getcwd(),
            "ollama_host": settings.get_ollama_host(),
            "ollama_url": settings.get_ollama_url(),
        }
