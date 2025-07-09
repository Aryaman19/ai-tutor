from beanie import Document
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum


class DifficultyLevel(str, Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class CanvasStep(BaseModel):
    step_number: int
    title: str
    explanation: str
    narration: str
    visual_elements: List[str] = []
    audio_url: Optional[str] = None
    canvas_data: Optional[dict] = None
    duration: Optional[float] = None


class Lesson(Document):
    topic: str
    title: Optional[str] = None
    difficulty_level: DifficultyLevel = DifficultyLevel.BEGINNER
    steps: List[CanvasStep] = []
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    # AI generation metadata
    llm_model: Optional[str] = None
    generation_time: Optional[float] = None
    total_audio_duration: Optional[float] = None

    class Settings:
        collection = "lessons"
        indexes = [
            "topic",
            "created_at",
            "difficulty_level"
        ]
