from fastapi import APIRouter, HTTPException, Query
from typing import Optional, Dict, Any
from models.settings import UserSettings, LLMSettings, TTSSettings, STTSettings, LanguageSettings, AppearanceSettings, LessonSettings, NotificationSettings, UserProfile
from pydantic import BaseModel, Field
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter()


class SettingsUpdateRequest(BaseModel):
    """Request model for updating specific settings sections"""
    profile: Optional[UserProfile] = None
    llm: Optional[LLMSettings] = None
    tts: Optional[TTSSettings] = None
    stt: Optional[STTSettings] = None
    language: Optional[LanguageSettings] = None
    appearance: Optional[AppearanceSettings] = None
    lessons: Optional[LessonSettings] = None
    notifications: Optional[NotificationSettings] = None


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


@router.get("/", response_model=SettingsResponse)
async def get_user_settings(
    user_id: str = Query(default="default", description="User identifier")
):
    """Get user settings"""
    try:
        settings = await UserSettings.find_one(UserSettings.user_id == user_id)
        
        if not settings:
            # Create default settings for new user
            settings = UserSettings(user_id=user_id)
            await settings.save()
            logger.info(f"Created default settings for user: {user_id}")
        
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
    
    except Exception as e:
        logger.error(f"Error getting settings for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=SettingsResponse)
async def create_user_settings(
    settings_data: SettingsUpdateRequest,
    user_id: str = Query(default="default", description="User identifier")
):
    """Create or replace user settings"""
    try:
        # Check if settings already exist
        existing_settings = await UserSettings.find_one(UserSettings.user_id == user_id)
        
        if existing_settings:
            raise HTTPException(
                status_code=409, 
                detail=f"Settings already exist for user {user_id}. Use PUT to update."
            )
        
        # Create new settings
        settings = UserSettings(user_id=user_id)
        
        # Update with provided data
        if settings_data.profile:
            settings.profile = settings_data.profile
        if settings_data.llm:
            settings.llm = settings_data.llm
        if settings_data.tts:
            settings.tts = settings_data.tts
        if settings_data.stt:
            settings.stt = settings_data.stt
        if settings_data.language:
            settings.language = settings_data.language
        if settings_data.appearance:
            settings.appearance = settings_data.appearance
        if settings_data.lessons:
            settings.lessons = settings_data.lessons
        if settings_data.notifications:
            settings.notifications = settings_data.notifications
        
        await settings.save()
        logger.info(f"Created settings for user: {user_id}")
        
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
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating settings for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/", response_model=SettingsResponse)
async def update_user_settings(
    settings_data: SettingsUpdateRequest,
    user_id: str = Query(default="default", description="User identifier")
):
    """Update user settings"""
    try:
        settings = await UserSettings.find_one(UserSettings.user_id == user_id)
        
        if not settings:
            # Create new settings if they don't exist
            settings = UserSettings(user_id=user_id)
        
        # Update with provided data
        if settings_data.profile:
            settings.profile = settings_data.profile
        if settings_data.llm:
            settings.llm = settings_data.llm
        if settings_data.tts:
            settings.tts = settings_data.tts
        if settings_data.stt:
            settings.stt = settings_data.stt
        if settings_data.language:
            settings.language = settings_data.language
        if settings_data.appearance:
            settings.appearance = settings_data.appearance
        if settings_data.lessons:
            settings.lessons = settings_data.lessons
        if settings_data.notifications:
            settings.notifications = settings_data.notifications
        
        await settings.save()
        logger.info(f"Updated settings for user: {user_id}")
        
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
    
    except Exception as e:
        logger.error(f"Error updating settings for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{section}", response_model=SettingsResponse)
async def update_settings_section(
    section: str,
    section_data: Dict[str, Any],
    user_id: str = Query(default="default", description="User identifier")
):
    """Update a specific settings section"""
    try:
        settings = await UserSettings.find_one(UserSettings.user_id == user_id)
        
        if not settings:
            settings = UserSettings(user_id=user_id)
        
        # Update specific section
        if section == "profile":
            settings.profile = UserProfile(**section_data)
        elif section == "llm":
            settings.llm = LLMSettings(**section_data)
        elif section == "tts":
            settings.tts = TTSSettings(**section_data)
        elif section == "stt":
            settings.stt = STTSettings(**section_data)
        elif section == "language":
            settings.language = LanguageSettings(**section_data)
        elif section == "appearance":
            settings.appearance = AppearanceSettings(**section_data)
        elif section == "lessons":
            settings.lessons = LessonSettings(**section_data)
        elif section == "notifications":
            settings.notifications = NotificationSettings(**section_data)
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"Unknown settings section: {section}"
            )
        
        await settings.save()
        logger.info(f"Updated {section} settings for user: {user_id}")
        
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
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating {section} settings for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/")
async def delete_user_settings(
    user_id: str = Query(default="default", description="User identifier")
):
    """Delete user settings"""
    try:
        settings = await UserSettings.find_one(UserSettings.user_id == user_id)
        
        if not settings:
            raise HTTPException(
                status_code=404, 
                detail=f"Settings not found for user: {user_id}"
            )
        
        await settings.delete()
        logger.info(f"Deleted settings for user: {user_id}")
        
        return {"message": f"Settings deleted for user: {user_id}"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting settings for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reset")
async def reset_user_settings(
    user_id: str = Query(default="default", description="User identifier")
):
    """Reset user settings to default"""
    try:
        settings = await UserSettings.find_one(UserSettings.user_id == user_id)
        
        if settings:
            await settings.delete()
        
        # Create new default settings
        settings = UserSettings(user_id=user_id)
        await settings.save()
        
        logger.info(f"Reset settings to default for user: {user_id}")
        
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
    
    except Exception as e:
        logger.error(f"Error resetting settings for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export")
async def export_user_settings(
    user_id: str = Query(default="default", description="User identifier")
):
    """Export user settings for backup"""
    try:
        settings = await UserSettings.find_one(UserSettings.user_id == user_id)
        
        if not settings:
            raise HTTPException(
                status_code=404, 
                detail=f"Settings not found for user: {user_id}"
            )
        
        # Remove sensitive data from export
        export_data = settings.dict()
        
        # Remove API keys and sensitive information
        if "api_key" in export_data.get("llm", {}):
            export_data["llm"]["api_key"] = None
        if "api_key" in export_data.get("tts", {}):
            export_data["tts"]["api_key"] = None
        if "api_key" in export_data.get("stt", {}):
            export_data["stt"]["api_key"] = None
        
        return {
            "user_id": user_id,
            "export_date": datetime.now().isoformat(),
            "settings": export_data
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting settings for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/available-models")
async def get_available_models():
    """Get available models for each provider"""
    try:
        from services.settings_service import SettingsService
        models = await SettingsService.get_available_models()
        return models
    except Exception as e:
        logger.error(f"Error getting available models: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/supported-languages")
async def get_supported_languages():
    """Get supported languages"""
    try:
        from services.settings_service import SettingsService
        languages = await SettingsService.get_supported_languages()
        return {"languages": languages}
    except Exception as e:
        logger.error(f"Error getting supported languages: {e}")
        raise HTTPException(status_code=500, detail=str(e))