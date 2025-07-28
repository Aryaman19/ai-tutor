from beanie import Document
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime


class LLMSettings(BaseModel):
    """LLM Configuration Settings"""
    provider: str = Field(default="ollama", description="LLM provider (ollama, openai, anthropic, etc.)")
    model: str = Field(default="gemma2:3b", description="Model name")
    endpoint: Optional[str] = Field(default=None, description="Custom API endpoint")
    api_key: Optional[str] = Field(default=None, description="API key for external providers")
    timing: str = Field(default="short", description="Content timing (short, medium, long)")
    difficulty: str = Field(default="intermediate", description="Content difficulty (easy, intermediate, advanced)")


class TTSSettings(BaseModel):
    """Text-to-Speech Configuration Settings"""
    provider: str = Field(default="browser", description="TTS provider (browser, elevenlabs, openai, etc.)")
    voice: str = Field(default="default", description="Voice ID or name")
    api_key: Optional[str] = Field(default=None, description="API key for external providers")
    speed: float = Field(default=1.0, ge=0.25, le=4.0, description="Speech speed")
    volume: float = Field(default=1.0, ge=0.0, le=1.0, description="Speech volume")
    pitch: float = Field(default=1.0, ge=0.0, le=2.0, description="Speech pitch")
    language: str = Field(default="en-US", description="Language for TTS")
    voice_settings: Dict[str, Any] = Field(default_factory=dict, description="Provider-specific voice settings")


class STTSettings(BaseModel):
    """Speech-to-Text Configuration Settings"""
    provider: str = Field(default="browser", description="STT provider (browser, whisper, deepgram, etc.)")
    api_key: Optional[str] = Field(default=None, description="API key for external providers")
    language: str = Field(default="en-US", description="Language for STT")
    continuous: bool = Field(default=False, description="Enable continuous recognition")
    interim_results: bool = Field(default=True, description="Show interim results")
    max_alternatives: int = Field(default=1, ge=1, le=5, description="Maximum alternative results")
    confidence_threshold: float = Field(default=0.7, ge=0.0, le=1.0, description="Minimum confidence threshold")


class LanguageSettings(BaseModel):
    """Language Preferences"""
    primary: str = Field(default="en", description="Primary language code")
    secondary: Optional[str] = Field(default=None, description="Secondary language code")
    auto_detect: bool = Field(default=True, description="Auto-detect language")
    available_languages: List[str] = Field(default_factory=lambda: ["en", "es", "fr", "de", "it", "pt", "zh", "ja", "ko"], description="Available languages")


class AppearanceSettings(BaseModel):
    """Appearance and UI Settings"""
    theme: str = Field(default="system", description="Theme preference (light, dark, system)")
    color_scheme: str = Field(default="default", description="Color scheme")
    font_size: str = Field(default="medium", description="Font size preference")
    compact_mode: bool = Field(default=False, description="Enable compact UI mode")
    animations: bool = Field(default=True, description="Enable animations")


class LessonSettings(BaseModel):
    """Lesson and Learning Preferences"""
    default_difficulty: str = Field(default="intermediate", description="Default lesson difficulty")
    preferred_content_types: List[str] = Field(default_factory=lambda: ["explanation", "examples", "exercises"], description="Preferred content types")
    session_duration: int = Field(default=30, ge=5, le=180, description="Preferred session duration in minutes")
    break_reminders: bool = Field(default=True, description="Enable break reminders")
    progress_tracking: bool = Field(default=True, description="Enable progress tracking")


class NotificationSettings(BaseModel):
    """Notification Preferences"""
    email_notifications: bool = Field(default=True, description="Enable email notifications")
    push_notifications: bool = Field(default=True, description="Enable push notifications")
    lesson_reminders: bool = Field(default=True, description="Enable lesson reminders")
    progress_updates: bool = Field(default=True, description="Enable progress updates")


class UserProfile(BaseModel):
    """User Profile Information"""
    name: str = Field(default="", description="User's full name")
    email: Optional[str] = Field(default=None, description="User's email address")
    avatar_url: Optional[str] = Field(default=None, description="User's avatar URL")
    bio: Optional[str] = Field(default=None, description="User's bio")
    learning_goals: List[str] = Field(default_factory=list, description="User's learning goals")


class UserSettings(Document):
    """User Settings Document"""
    user_id: str = Field(default="default", description="User identifier")
    profile: UserProfile = Field(default_factory=UserProfile, description="User profile")
    llm: LLMSettings = Field(default_factory=LLMSettings, description="LLM configuration")
    tts: TTSSettings = Field(default_factory=TTSSettings, description="TTS configuration")
    stt: STTSettings = Field(default_factory=STTSettings, description="STT configuration")
    language: LanguageSettings = Field(default_factory=LanguageSettings, description="Language preferences")
    appearance: AppearanceSettings = Field(default_factory=AppearanceSettings, description="Appearance settings")
    lessons: LessonSettings = Field(default_factory=LessonSettings, description="Lesson preferences")
    notifications: NotificationSettings = Field(default_factory=NotificationSettings, description="Notification settings")
    
    created_at: datetime = Field(default_factory=datetime.now, description="Creation timestamp")
    updated_at: datetime = Field(default_factory=datetime.now, description="Last update timestamp")
    
    class Settings:
        collection = "user_settings"
        indexes = [
            "user_id",
            "updated_at",
        ]
    
    def update_timestamp(self):
        """Update the updated_at timestamp"""
        self.updated_at = datetime.now()
    
    async def save(self, **kwargs):
        """Override save to update timestamp"""
        self.update_timestamp()
        return await super().save(**kwargs)
    
    async def replace(self, **kwargs):
        """Override replace to update timestamp"""
        self.update_timestamp()
        return await super().replace(**kwargs)