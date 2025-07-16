from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from typing import List
import os


class Settings(BaseSettings):
    # API Configuration
    app_name: str = Field(default="AI Tutor API", description="Application name")
    app_version: str = Field(default="1.0.0", description="Application version")
    debug: bool = Field(default=False, description="Enable debug mode")

    # Database
    mongodb_url: str = Field(default="mongodb://localhost:27017", description="MongoDB connection URL")
    database_name: str = Field(default="ai_tutor", description="Database name")

    # Ollama Configuration
    ollama_url: str = Field(default="http://localhost:11434", description="Ollama service URL")
    ollama_host: str = Field(default="localhost:11434", description="Ollama host and port")
    ollama_timeout: int = Field(default=30, ge=1, le=300, description="Ollama request timeout in seconds")

    # TTS Configuration
    tts_cache_dir: str = Field(default="static/audio", description="TTS audio cache directory")
    max_audio_cache_size: int = Field(default=1000, ge=1, description="Maximum cached audio files")
    tts_voices_dir: str = Field(default="voices", description="TTS voice models directory")
    tts_piper_path: str = Field(default="piper", description="Path to Piper TTS binary or Python module")

    # CORS - Parse comma-separated string to list
    cors_origins: str = Field(default="http://localhost:3000,http://localhost:5173", description="CORS origins (comma-separated)")

    # Environment detection
    environment: str = Field(default="development", description="Application environment")

    @field_validator('environment')
    @classmethod
    def validate_environment(cls, v):
        allowed_environments = ['development', 'production', 'docker', 'testing']
        if v not in allowed_environments:
            raise ValueError(f'Environment must be one of: {allowed_environments}')
        return v

    @field_validator('mongodb_url')
    @classmethod
    def validate_mongodb_url(cls, v):
        if not v.startswith('mongodb://'):
            raise ValueError('MongoDB URL must start with mongodb://')
        return v

    @field_validator('ollama_url')
    @classmethod
    def validate_ollama_url(cls, v):
        if not v.startswith('http'):
            raise ValueError('Ollama URL must start with http:// or https://')
        return v

    class Config:
        env_file = ".env"
        case_sensitive = False
        # Allow extra fields to be ignored instead of causing errors
        extra = "ignore"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Convert comma-separated CORS origins to list"""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    # Helper methods (not Pydantic fields)
    def is_container(self) -> bool:
        """Check if running in a container"""
        return os.path.exists("/.dockerenv") or os.environ.get("CONTAINER") == "true"

    def get_ollama_host(self) -> str:
        """Get appropriate Ollama host for environment"""
        if self.is_container():
            # In Docker, use the configured host or fallback
            return self.ollama_host
        return self.ollama_host

    def get_ollama_url(self) -> str:
        """Get complete Ollama URL for environment"""
        if self.is_container():
            # Use the configured URL or build from host
            if self.ollama_url.startswith("http"):
                return self.ollama_url
            return f"http://{self.ollama_host}"
        return self.ollama_url


settings = Settings()
