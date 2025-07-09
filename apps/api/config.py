from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # API Configuration
    app_name: str = "AI Tutor API"
    app_version: str = "1.0.0"
    debug: bool = False

    # Database
    mongodb_url: str = "mongodb://localhost:27017"
    database_name: str = "ai_tutor"

    # Ollama Configuration
    ollama_url: str = "http://localhost:11434"
    ollama_timeout: int = 30

    # TTS Configuration
    tts_cache_dir: str = "static/audio"
    max_audio_cache_size: int = 1000

    # CORS
    cors_origins: List[str] = [
        "http://localhost:3000", "http://localhost:5173"]

    # Environment detection
    environment: str = "development"

    class Config:
        env_file = ".env"
        case_sensitive = False
        # Allow extra fields to be ignored instead of causing errors
        extra = "ignore"

    # Helper methods (not Pydantic fields)
    def is_container(self) -> bool:
        """Check if running in a container"""
        return os.path.exists("/.dockerenv") or os.environ.get("CONTAINER") == "true"

    def get_ollama_host(self) -> str:
        """Get appropriate Ollama host for environment"""
        if self.is_container():
            # In Docker, try host networking or docker compose service name
            return os.environ.get("OLLAMA_HOST", "host.docker.internal:11434")
        return self.ollama_url.replace("http://", "").replace("https://", "")

    def get_ollama_url(self) -> str:
        """Get complete Ollama URL for environment"""
        if self.is_container():
            host = os.environ.get("OLLAMA_HOST", "host.docker.internal:11434")
            return f"http://{host}"
        return self.ollama_url


settings = Settings()
