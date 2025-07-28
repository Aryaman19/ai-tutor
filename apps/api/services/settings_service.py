from typing import Optional, Dict, Any, List
from models.settings import UserSettings, LLMSettings, TTSSettings, STTSettings, LanguageSettings
import logging
import asyncio
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class SettingsService:
    """Service layer for settings management and validation"""
    
    @staticmethod
    async def validate_llm_settings(llm_settings: LLMSettings) -> Dict[str, Any]:
        """Validate LLM settings and check connectivity"""
        validation_result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "provider_available": False
        }
        
        try:
            # Basic validation
            if not llm_settings.model:
                validation_result["errors"].append("Model name is required")
                validation_result["valid"] = False
            
            # Validate timing
            if llm_settings.timing not in ["short", "medium", "long"]:
                validation_result["errors"].append("Timing must be 'short', 'medium', or 'long'")
                validation_result["valid"] = False
            
            # Validate difficulty
            if llm_settings.difficulty not in ["easy", "intermediate", "advanced"]:
                validation_result["errors"].append("Difficulty must be 'easy', 'intermediate', or 'advanced'")
                validation_result["valid"] = False
            
            # Provider-specific validation
            if llm_settings.provider == "ollama":
                validation_result["provider_available"] = await SettingsService._check_ollama_model(llm_settings.model)
                if not validation_result["provider_available"]:
                    validation_result["warnings"].append(f"Ollama model '{llm_settings.model}' not available")
            
            elif llm_settings.provider in ["openai", "anthropic"]:
                if not llm_settings.api_key:
                    validation_result["errors"].append(f"API key required for {llm_settings.provider}")
                    validation_result["valid"] = False
                else:
                    validation_result["provider_available"] = await SettingsService._check_external_api(
                        llm_settings.provider, llm_settings.api_key
                    )
            
        except Exception as e:
            logger.error(f"Error validating LLM settings: {e}")
            validation_result["errors"].append(f"Validation error: {str(e)}")
            validation_result["valid"] = False
        
        return validation_result
    
    @staticmethod
    async def validate_tts_settings(tts_settings: TTSSettings) -> Dict[str, Any]:
        """Validate TTS settings and check availability"""
        validation_result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "provider_available": False
        }
        
        try:
            # Basic validation
            if tts_settings.speed < 0.25 or tts_settings.speed > 4.0:
                validation_result["errors"].append("Speed must be between 0.25 and 4.0")
                validation_result["valid"] = False
            
            if tts_settings.volume < 0 or tts_settings.volume > 1:
                validation_result["errors"].append("Volume must be between 0 and 1")
                validation_result["valid"] = False
            
            if tts_settings.pitch < 0 or tts_settings.pitch > 2:
                validation_result["errors"].append("Pitch must be between 0 and 2")
                validation_result["valid"] = False
            
            # Provider-specific validation
            if tts_settings.provider == "browser":
                validation_result["provider_available"] = True  # Browser TTS is always available
            
            elif tts_settings.provider in ["elevenlabs", "openai"]:
                if not tts_settings.api_key:
                    validation_result["errors"].append(f"API key required for {tts_settings.provider}")
                    validation_result["valid"] = False
                else:
                    validation_result["provider_available"] = await SettingsService._check_external_api(
                        tts_settings.provider, tts_settings.api_key
                    )
            
        except Exception as e:
            logger.error(f"Error validating TTS settings: {e}")
            validation_result["errors"].append(f"Validation error: {str(e)}")
            validation_result["valid"] = False
        
        return validation_result
    
    @staticmethod
    async def validate_stt_settings(stt_settings: STTSettings) -> Dict[str, Any]:
        """Validate STT settings and check availability"""
        validation_result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "provider_available": False
        }
        
        try:
            # Basic validation
            if stt_settings.confidence_threshold < 0 or stt_settings.confidence_threshold > 1:
                validation_result["errors"].append("Confidence threshold must be between 0 and 1")
                validation_result["valid"] = False
            
            if stt_settings.max_alternatives < 1 or stt_settings.max_alternatives > 5:
                validation_result["errors"].append("Max alternatives must be between 1 and 5")
                validation_result["valid"] = False
            
            # Provider-specific validation
            if stt_settings.provider == "browser":
                validation_result["provider_available"] = True  # Browser STT is always available
            
            elif stt_settings.provider in ["whisper", "deepgram"]:
                if not stt_settings.api_key:
                    validation_result["errors"].append(f"API key required for {stt_settings.provider}")
                    validation_result["valid"] = False
                else:
                    validation_result["provider_available"] = await SettingsService._check_external_api(
                        stt_settings.provider, stt_settings.api_key
                    )
            
        except Exception as e:
            logger.error(f"Error validating STT settings: {e}")
            validation_result["errors"].append(f"Validation error: {str(e)}")
            validation_result["valid"] = False
        
        return validation_result
    
    @staticmethod
    async def validate_language_settings(language_settings: LanguageSettings) -> Dict[str, Any]:
        """Validate language settings"""
        validation_result = {
            "valid": True,
            "errors": [],
            "warnings": []
        }
        
        try:
            # Check if primary language is supported
            if language_settings.primary not in language_settings.available_languages:
                validation_result["errors"].append(f"Primary language '{language_settings.primary}' not supported")
                validation_result["valid"] = False
            
            # Check if secondary language is supported (if provided)
            if language_settings.secondary and language_settings.secondary not in language_settings.available_languages:
                validation_result["errors"].append(f"Secondary language '{language_settings.secondary}' not supported")
                validation_result["valid"] = False
            
            # Check if primary and secondary are the same
            if language_settings.secondary and language_settings.primary == language_settings.secondary:
                validation_result["warnings"].append("Primary and secondary languages are the same")
            
        except Exception as e:
            logger.error(f"Error validating language settings: {e}")
            validation_result["errors"].append(f"Validation error: {str(e)}")
            validation_result["valid"] = False
        
        return validation_result
    
    @staticmethod
    async def get_available_models() -> Dict[str, List[str]]:
        """Get available models for each provider"""
        models = {
            "ollama": await SettingsService._get_ollama_models(),
            "openai": ["gpt-4", "gpt-3.5-turbo", "gpt-4-turbo"],
            "anthropic": ["claude-3-sonnet", "claude-3-haiku", "claude-3-opus"],
            "browser_tts": await SettingsService._get_browser_voices(),
            "elevenlabs": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
            "openai_tts": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
        }
        
        return models
    
    @staticmethod
    async def get_supported_languages() -> List[str]:
        """Get list of supported languages"""
        return [
            "en", "es", "fr", "de", "it", "pt", "zh", "ja", "ko", "ru", "ar", "hi", "th", "vi", "nl", "pl", "sv", "no", "da", "fi"
        ]
    
    @staticmethod
    async def backup_settings(user_id: str) -> Optional[Dict[str, Any]]:
        """Create a backup of user settings"""
        try:
            settings = await UserSettings.find_one(UserSettings.user_id == user_id)
            if not settings:
                return None
            
            backup = {
                "user_id": user_id,
                "backup_date": datetime.now().isoformat(),
                "settings": settings.dict()
            }
            
            # Remove sensitive data
            if "api_key" in backup["settings"].get("llm", {}):
                backup["settings"]["llm"]["api_key"] = "[REDACTED]"
            if "api_key" in backup["settings"].get("tts", {}):
                backup["settings"]["tts"]["api_key"] = "[REDACTED]"
            if "api_key" in backup["settings"].get("stt", {}):
                backup["settings"]["stt"]["api_key"] = "[REDACTED]"
            
            return backup
        
        except Exception as e:
            logger.error(f"Error backing up settings for user {user_id}: {e}")
            return None
    
    @staticmethod
    async def _check_ollama_model(model_name: str) -> bool:
        """Check if Ollama model is available"""
        try:
            # Get actual available models from Ollama
            available_models = await SettingsService._get_ollama_models()
            return model_name in available_models
        except Exception as e:
            logger.error(f"Error checking Ollama model {model_name}: {e}")
            return False
    
    @staticmethod
    async def _check_external_api(provider: str, api_key: str) -> bool:
        """Check if external API is accessible"""
        try:
            # This would make a test API call to validate the key
            # For now, return True if api_key is provided
            return bool(api_key and len(api_key) > 10)
        except Exception as e:
            logger.error(f"Error checking {provider} API: {e}")
            return False
    
    @staticmethod
    async def _get_ollama_models() -> List[str]:
        """Get available Ollama models from Ollama API"""
        try:
            from services.connection_service import ConnectionService
            ollama_status = await ConnectionService.test_ollama_connection()
            
            if ollama_status["status"] == "connected" and "models" in ollama_status:
                # Extract model names from the API response
                models = []
                for model in ollama_status["models"]:
                    if isinstance(model, dict) and "name" in model:
                        models.append(model["name"])
                    elif isinstance(model, str):
                        models.append(model)
                return models
            else:
                logger.warning("Ollama not connected, returning empty models list")
                # Return empty list if Ollama is not available
                return []
                
        except Exception as e:
            logger.error(f"Error getting Ollama models: {e}")
            # Return empty list on error
            return []
    
    @staticmethod
    async def _get_browser_voices() -> List[str]:
        """Get available browser voices"""
        try:
            # This would be determined by the browser, return common ones
            return ["default", "male", "female", "en-US-male", "en-US-female", "en-GB-male", "en-GB-female"]
        except Exception as e:
            logger.error(f"Error getting browser voices: {e}")
            return ["default"]