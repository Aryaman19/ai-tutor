from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from beanie import Document
from pydantic import BaseModel, Field
from bson import ObjectId


class AITutorSlide(BaseModel):
    """AI Tutor slide model for lesson visualization"""
    slide_number: int
    template_id: str
    template_name: str
    content_type: str
    filled_content: Dict[str, str]
    elements: List[Dict[str, Any]]
    narration: str
    estimated_duration: float
    position_offset: float
    metadata: Dict[str, Any]
    generation_time: float
    status: str
    error_message: Optional[str] = None
        
    def validate_slide(self) -> List[str]:
        """Validate slide data and return list of errors"""
        errors = []
        if self.slide_number <= 0:
            errors.append("Slide number must be positive")
        if not self.template_id.strip():
            errors.append("Template ID is required")
        if not self.narration.strip():
            errors.append("Narration is required")
        return errors


# Compatibility alias for legacy code that still uses CanvasStep
CanvasStep = AITutorSlide


# Generation status types
GenerationStatus = Literal["pending", "generating", "completed", "failed"]


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
    generation_status: GenerationStatus = "pending"  # Track lesson generation progress
    slides: List[AITutorSlide] = Field(default_factory=list)
    merged_audio_url: Optional[str] = None  # URL to the merged audio file
    audio_duration: Optional[float] = None  # Total duration of merged audio in seconds
    audio_segments: Optional[List[Dict[str, Any]]] = None  # Slide timing information for seekbar
    audio_generated: bool = False  # Whether audio has been generated for this lesson
    generation_error: Optional[str] = None  # Error message if generation failed
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
        
    def get_total_estimated_duration(self) -> float:
        """Calculate total estimated duration from all slides"""
        return sum(slide.estimated_duration for slide in self.slides)
        
    def validate_lesson(self) -> List[str]:
        """Validate lesson data and return list of errors"""
        errors = []
        if not self.topic.strip():
            errors.append("Topic is required")
        if not self.slides:
            errors.append("At least one slide is required")
            
        for i, slide in enumerate(self.slides):
            slide_errors = slide.validate_slide()
            if slide_errors:
                errors.extend([f"Slide {i+1}: {error}" for error in slide_errors])
            if slide.slide_number != i + 1:
                errors.append(f"Slide {i+1}: Slide number mismatch")
                
        return errors
        
    def normalize_data(self) -> "Lesson":
        """Normalize lesson data for consistency"""
        normalized_slides = []
        for i, slide in enumerate(self.slides):
            # Ensure slide numbers are sequential
            slide.slide_number = i + 1
            normalized_slides.append(slide)
            
        return self.copy(update={
            "slides": normalized_slides,
            "title": self.title or self.topic,
            "updated_at": self.updated_at or self.created_at,
        })


class LessonResponse(BaseModel):
    """Response model for lesson API"""
    id: str
    topic: str
    title: Optional[str] = None
    difficulty_level: Optional[str] = "beginner"
    generation_status: GenerationStatus = "pending"
    slides: List[AITutorSlide] = Field(default_factory=list)
    merged_audio_url: Optional[str] = None
    audio_duration: Optional[float] = None
    audio_segments: Optional[List[Dict[str, Any]]] = None
    audio_generated: bool = False
    generation_error: Optional[str] = None
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
    generation_status: Optional[GenerationStatus] = None
    slides: Optional[List[AITutorSlide]] = None
    merged_audio_url: Optional[str] = None
    audio_duration: Optional[float] = None
    audio_segments: Optional[List[Dict[str, Any]]] = None
    audio_generated: Optional[bool] = None
    generation_error: Optional[str] = None
    doubts: Optional[List[Doubt]] = None