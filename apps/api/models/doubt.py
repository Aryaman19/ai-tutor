from beanie import Document
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId


class Doubt(Document):
    lesson_id: str
    question: str
    answer: str
    canvas_data: Optional[dict] = None
    audio_url: Optional[str] = None
    # Video timestamp when question was asked
    timestamp: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.now)

    # AI generation metadata
    response_time: Optional[float] = None
    llm_model: Optional[str] = None

    class Settings:
        collection = "doubts"
        indexes = [
            "lesson_id",
            "created_at"
        ]
