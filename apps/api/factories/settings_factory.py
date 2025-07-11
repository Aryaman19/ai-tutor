from typing import Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel
from models.settings import UserSettings, UserProfile, LLMSettings, TTSSettings, STTSettings, LanguageSettings, AppearanceSettings, LessonSettings, NotificationSettings


class SettingsResponse(BaseModel):
    """Response model for settings"""
    user_id: str
    profile: UserProfile
    llm: LLMSettings
    tts: TTSSettings
    stt: STTSettings
    language: LanguageSettings
    appearance: AppearanceSettings
    lessons: LessonSettings
    notifications: NotificationSettings
    created_at: datetime
    updated_at: datetime


class SettingsResponseFactory:
    """Factory for creating consistent settings responses"""
    
    @staticmethod
    def create_response(settings: UserSettings) -> SettingsResponse:
        """Create a standard settings response"""
        return SettingsResponse(
            user_id=settings.user_id,
            profile=settings.profile,
            llm=settings.llm,
            tts=settings.tts,
            stt=settings.stt,
            language=settings.language,
            appearance=settings.appearance,
            lessons=settings.lessons,
            notifications=settings.notifications,
            created_at=settings.created_at,
            updated_at=settings.updated_at
        )
    
    @staticmethod
    def create_export_response(settings: UserSettings) -> Dict[str, Any]:
        """Create a settings export response with sensitive data removed"""
        export_data = settings.dict()
        
        # Remove sensitive data from export
        sensitive_fields = ['api_key', 'apiKey', 'secret', 'token', 'password']
        
        def remove_sensitive_data(obj: Dict[str, Any]) -> Dict[str, Any]:
            """Recursively remove sensitive data from nested dictionaries"""
            cleaned = {}
            for key, value in obj.items():
                if any(sensitive_field in key.lower() for sensitive_field in sensitive_fields):
                    cleaned[key] = None
                elif isinstance(value, dict):
                    cleaned[key] = remove_sensitive_data(value)
                else:
                    cleaned[key] = value
            return cleaned
        
        cleaned_data = remove_sensitive_data(export_data)
        
        return {
            "user_id": settings.user_id,
            "export_date": datetime.now().isoformat(),
            "settings": cleaned_data
        }
    
    @staticmethod
    def create_section_response(settings: UserSettings, section: str) -> Dict[str, Any]:
        """Create a response for a specific settings section"""
        base_response = SettingsResponseFactory.create_response(settings)
        
        # Return only the requested section data along with metadata
        section_data = getattr(base_response, section, None)
        if section_data is None:
            raise ValueError(f"Unknown settings section: {section}")
        
        return {
            "user_id": settings.user_id,
            "section": section,
            "data": section_data,
            "updated_at": settings.updated_at
        }
    
    @staticmethod
    def create_error_response(error: str, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Create a standardized error response"""
        response = {
            "error": error,
            "timestamp": datetime.now().isoformat()
        }
        
        if details:
            response["details"] = details
        
        return response
    
    @staticmethod
    def create_success_response(message: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Create a standardized success response"""
        response = {
            "success": True,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }
        
        if data:
            response["data"] = data
        
        return response