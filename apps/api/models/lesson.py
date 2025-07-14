from datetime import datetime
from typing import Optional, List
from beanie import Document
from pydantic import BaseModel, Field
from bson import ObjectId


class CanvasStep(BaseModel):
    """Canvas step model for lesson visualization"""
    step_number: int
    title: str
    explanation: Optional[str] = None  # New field for explanation text
    content: Optional[str] = None  # Legacy field for backward compatibility
    narration: Optional[str] = None  # Script content for narration
    canvas_data: Optional[dict] = None
    visual_elements: Optional[List[dict]] = None
    elements: Optional[List[dict]] = None  # Excalidraw elements
    duration: Optional[float] = None  # Estimated duration in seconds
    
    def get_explanation(self) -> str:
        """Get explanation text, falling back to content for backward compatibility"""
        return self.explanation or self.content or ""


class Doubt(BaseModel):
    """Doubt model for lesson Q&A"""
    id: str = Field(default_factory=lambda: str(ObjectId()))
    question: str
    answer: str
    canvas_data: Optional[dict] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Lesson(Document):
    """Lesson database model"""
    topic: str
    title: Optional[str] = None
    difficulty_level: Optional[str] = "beginner"
    steps: List[CanvasStep] = Field(default_factory=list)
    doubts: Optional[List[Doubt]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Settings:
        name = "lessons"
        
    def dict(self, **kwargs):
        """Override dict method to include id field"""
        data = super().dict(**kwargs)
        if self.id:
            data['id'] = str(self.id)
        return data


class LessonResponse(BaseModel):
    """Response model for lesson API"""
    id: str
    topic: str
    title: Optional[str] = None
    difficulty_level: Optional[str] = "beginner"
    steps: List[CanvasStep] = Field(default_factory=list)
    doubts: Optional[List[Doubt]] = Field(default_factory=list)
    created_at: datetime
    updated_at: Optional[datetime] = None


class CreateLessonRequest(BaseModel):
    """Request model for creating lesson"""
    topic: str
    difficulty_level: Optional[str] = "beginner"


class UpdateLessonRequest(BaseModel):
    """Request model for updating lesson"""
    title: Optional[str] = None
    difficulty_level: Optional[str] = None
    steps: Optional[List[CanvasStep]] = None
    doubts: Optional[List[Doubt]] = None