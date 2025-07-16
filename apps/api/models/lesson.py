from datetime import datetime
from typing import Optional, List
from beanie import Document
from pydantic import BaseModel, Field
from bson import ObjectId


class CanvasStep(BaseModel):
    """Canvas step model for lesson visualization"""
    step_number: int
    title: str
    explanation: Optional[str] = None  # Primary field for explanation text
    content: Optional[str] = None  # Legacy field for backward compatibility
    narration: Optional[str] = None  # Script content for narration
    canvas_data: Optional[dict] = None
    visual_elements: Optional[List[dict]] = None
    elements: Optional[List[dict]] = None  # Excalidraw elements
    duration: Optional[float] = None  # Estimated duration in seconds
    audio_url: Optional[str] = None  # Audio file URL
    audio_id: Optional[str] = None  # TTS audio cache ID
    tts_voice: Optional[str] = None  # TTS voice used for generation
    tts_generated: Optional[bool] = None  # Whether TTS audio was generated
    tts_error: Optional[str] = None  # TTS generation error if any
    
    def get_explanation(self) -> str:
        """Get explanation text, falling back to content for backward compatibility"""
        return self.explanation or self.content or ""
        
    def migrate_content(self) -> "CanvasStep":
        """Migrate legacy content field to explanation"""
        if self.content and not self.explanation:
            return self.copy(update={"explanation": self.content})
        return self
        
    def validate_step(self) -> List[str]:
        """Validate step data and return list of errors"""
        errors = []
        if not self.title.strip():
            errors.append("Title is required")
        if self.step_number <= 0:
            errors.append("Step number must be positive")
        return errors


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
        
    def migrate_legacy_data(self) -> "Lesson":
        """Migrate legacy data to new format"""
        migrated_steps = [step.migrate_content() for step in self.steps]
        return self.copy(update={"steps": migrated_steps})
        
    def validate_lesson(self) -> List[str]:
        """Validate lesson data and return list of errors"""
        errors = []
        if not self.topic.strip():
            errors.append("Topic is required")
        if not self.steps:
            errors.append("At least one step is required")
            
        for i, step in enumerate(self.steps):
            step_errors = step.validate_step()
            if step_errors:
                errors.extend([f"Step {i+1}: {error}" for error in step_errors])
            if step.step_number != i + 1:
                errors.append(f"Step {i+1}: Step number mismatch")
                
        return errors
        
    def normalize_data(self) -> "Lesson":
        """Normalize lesson data for consistency"""
        normalized_steps = []
        for i, step in enumerate(self.steps):
            normalized_step = step.migrate_content()
            normalized_step.step_number = i + 1
            normalized_steps.append(normalized_step)
            
        return self.copy(update={
            "steps": normalized_steps,
            "title": self.title or self.topic,
            "updated_at": self.updated_at or self.created_at,
        })


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