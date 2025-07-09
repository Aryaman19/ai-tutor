from beanie import Document
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class LLMSettings(BaseModel):
    provider: str = "ollama"
    model: str = "gemma2:3b"
    endpoint: Optional[str] = "http://localhost:11434"
    temperature: float = 0.7
    max_tokens: int = 2048


class TTSSettings(BaseModel):
    provider: str = "browser"
    voice: str = "default"
    speed: float = 1.0
    volume: float = 0.9
    language: str = "en-US"


class STTSettings(BaseModel):
    provider: str = "browser"
    language: str = "en-US"
    continuous: bool = False


class LanguageSettings(BaseModel):
    primary: str = "en-US"
    secondary: Optional[str] = None
    auto_detect: bool = False


class ContentSettings(BaseModel):
    difficulty: str = "beginner"
    lesson_length: str = "medium"
    visual_style: str = "detailed"


class UserSettings(Document):
    user_id: str = "default"  # For now, single user system
    llm: LLMSettings = Field(default_factory=LLMSettings)
    tts: TTSSettings = Field(default_factory=TTSSettings)
    stt: STTSettings = Field(default_factory=STTSettings)
    language: LanguageSettings = Field(default_factory=LanguageSettings)
    content: ContentSettings = Field(default_factory=ContentSettings)

    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    class Settings:
        collection = "user_settings"
