from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from beanie import Document
from pydantic import BaseModel, Field, validator
from bson import ObjectId


class SemanticLayout(BaseModel):
    """Semantic layout information for responsive positioning"""
    region: str = Field(..., description="Layout region like 'top_center', 'middle_left'")
    priority: str = Field(default="medium", description="Layout priority: high, medium, low")
    spacing: str = Field(default="medium", description="Spacing around element: large, medium, small")
    relative_to: Optional[str] = Field(default=None, description="Element ID to position relative to")
    relationship: Optional[str] = Field(default=None, description="Relationship like 'below_with_spacing'")
    
    @validator('region')
    def validate_region(cls, v):
        valid_regions = [
            'top_left', 'top_center', 'top_right',
            'middle_left', 'center', 'middle_right',
            'bottom_left', 'bottom_center', 'bottom_right'
        ]
        if v not in valid_regions:
            raise ValueError(f'Region must be one of: {valid_regions}')
        return v


class VisualElement(BaseModel):
    """Visual element with semantic layout"""
    id: str = Field(..., description="Unique element identifier")
    type: str = Field(..., description="Element type: title, circle, rectangle, arrow, text, etc.")
    text: Optional[str] = Field(default=None, description="Text content of the element")
    layout: SemanticLayout = Field(..., description="Semantic layout information")
    style: Optional[str] = Field(default=None, description="Style preset name")
    color: Optional[str] = Field(default="blue", description="Element color")
    size: Optional[str] = Field(default="medium", description="Element size: small, medium, large")
    properties: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional element properties")
    
    @validator('type')
    def validate_type(cls, v):
        valid_types = [
            'title', 'subtitle', 'text', 'circle', 'rectangle', 'arrow', 
            'concept_box', 'flow_arrow', 'process_step', 'comparison_table',
            'timeline_marker', 'diagram', 'chart', 'illustration'
        ]
        if v not in valid_types:
            raise ValueError(f'Element type must be one of: {valid_types}')
        return v


class TimelineEvent(BaseModel):
    """Event that occurs at a specific time in the timeline"""
    time: float = Field(..., description="Time in seconds from lesson start", ge=0)
    action: str = Field(..., description="Action to perform: create, update, delete, animate, highlight")
    element: Optional[VisualElement] = Field(default=None, description="Element data for create/update actions")
    element_id: Optional[str] = Field(default=None, description="Element ID for update/delete/animate actions")
    animation: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Animation properties")
    
    @validator('action')
    def validate_action(cls, v):
        valid_actions = ['create', 'update', 'delete', 'animate', 'highlight', 'hide', 'show']
        if v not in valid_actions:
            raise ValueError(f'Action must be one of: {valid_actions}')
        return v
    
    @validator('element_id')
    def validate_element_references(cls, v, values):
        action = values.get('action')
        element = values.get('element')
        
        if action == 'create' and not element:
            raise ValueError('Create action requires element data')
        if action in ['update', 'delete', 'animate', 'highlight'] and not v:
            raise ValueError(f'{action} action requires element_id')
        
        return v


class TimelineSegment(BaseModel):
    """A segment of the timeline with narration and visual events"""
    start_time: float = Field(..., description="Segment start time in seconds", ge=0)
    end_time: float = Field(..., description="Segment end time in seconds", gt=0)
    title: str = Field(..., description="Segment title for navigation")
    narration: str = Field(..., description="Narration script for this segment")
    events: List[TimelineEvent] = Field(default_factory=list, description="Visual events in this segment")
    
    # TTS metadata
    audio_id: Optional[str] = Field(default=None, description="Generated TTS audio ID")
    audio_url: Optional[str] = Field(default=None, description="Audio file URL")
    tts_voice: Optional[str] = Field(default=None, description="TTS voice used")
    tts_generated: Optional[bool] = Field(default=False, description="Whether TTS was generated")
    tts_error: Optional[str] = Field(default=None, description="TTS generation error")
    
    @validator('end_time')
    def validate_end_time(cls, v, values):
        start_time = values.get('start_time', 0)
        if v <= start_time:
            raise ValueError('end_time must be greater than start_time')
        return v
    
    @validator('events')
    def validate_events_timing(cls, v, values):
        start_time = values.get('start_time', 0)
        end_time = values.get('end_time', float('inf'))
        
        for event in v:
            if not (start_time <= event.time <= end_time):
                raise ValueError(f'Event at time {event.time} is outside segment bounds [{start_time}, {end_time}]')
        
        return v


class VisualLibraryPreset(BaseModel):
    """Preset configuration for visual elements"""
    name: str = Field(..., description="Preset name")
    type: str = Field(..., description="Element type this preset applies to")
    properties: Dict[str, Any] = Field(..., description="Default properties for this preset")
    responsive: bool = Field(default=True, description="Whether this preset is responsive")
    description: Optional[str] = Field(default=None, description="Preset description for LLM")


class TimelineLesson(Document):
    """Timeline-based lesson model"""
    topic: str = Field(..., description="Lesson topic")
    title: Optional[str] = Field(default=None, description="Lesson title")
    difficulty_level: str = Field(default="beginner", description="Difficulty level")
    total_duration: float = Field(..., description="Total lesson duration in seconds", gt=0)
    
    # Timeline data
    segments: List[TimelineSegment] = Field(default_factory=list, description="Timeline segments")
    visual_library: Dict[str, VisualLibraryPreset] = Field(
        default_factory=dict, 
        description="Visual library presets available for this lesson"
    )
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default=None)
    generation_status: str = Field(default="pending", description="Generation status: pending, generating, completed, failed")
    generation_progress: float = Field(default=0.0, description="Generation progress percentage", ge=0, le=100)
    
    # Legacy compatibility
    legacy_lesson_id: Optional[str] = Field(default=None, description="Reference to original lesson if migrated")
    
    class Settings:
        name = "timeline_lessons"
    
    def dict(self, **kwargs):
        """Override dict method to include id field"""
        data = super().dict(**kwargs)
        if self.id:
            data['id'] = str(self.id)
        return data
    
    def get_segment_at_time(self, time: float) -> Optional[TimelineSegment]:
        """Get the segment that contains the given time"""
        for segment in self.segments:
            if segment.start_time <= time <= segment.end_time:
                return segment
        return None
    
    def get_active_elements_at_time(self, time: float) -> List[VisualElement]:
        """Get all visual elements that should be visible at the given time"""
        active_elements = {}
        
        # Process all events up to the given time
        for segment in self.segments:
            if segment.start_time > time:
                break
                
            for event in segment.events:
                if event.time > time:
                    continue
                    
                if event.action == 'create' and event.element:
                    active_elements[event.element.id] = event.element
                elif event.action == 'update' and event.element_id in active_elements and event.element:
                    # Update existing element
                    active_elements[event.element_id] = event.element
                elif event.action in ['delete', 'hide'] and event.element_id in active_elements:
                    del active_elements[event.element_id]
                elif event.action == 'show' and event.element:
                    active_elements[event.element.id] = event.element
        
        return list(active_elements.values())
    
    def validate_timeline(self) -> List[str]:
        """Validate the timeline structure and return list of errors"""
        errors = []
        
        if not self.segments:
            errors.append("Timeline must have at least one segment")
            return errors
        
        # Check segment timing
        self.segments.sort(key=lambda s: s.start_time)
        
        for i, segment in enumerate(self.segments):
            # Check for gaps or overlaps
            if i > 0:
                prev_segment = self.segments[i-1]
                if segment.start_time < prev_segment.end_time:
                    errors.append(f"Segment {i+1} overlaps with previous segment")
                elif segment.start_time > prev_segment.end_time:
                    errors.append(f"Gap between segment {i} and {i+1}")
            
            # Validate segment timing matches total duration
            if i == len(self.segments) - 1:  # Last segment
                if segment.end_time != self.total_duration:
                    errors.append(f"Last segment end time ({segment.end_time}) doesn't match total duration ({self.total_duration})")
        
        # Validate element references
        created_elements = set()
        for segment in self.segments:
            for event in segment.events:
                if event.action == 'create' and event.element:
                    if event.element.id in created_elements:
                        errors.append(f"Element {event.element.id} created multiple times")
                    created_elements.add(event.element.id)
                elif event.action in ['update', 'delete', 'animate'] and event.element_id:
                    if event.element_id not in created_elements:
                        errors.append(f"Event references non-existent element {event.element_id}")
        
        return errors
    
    def estimate_generation_time(self) -> float:
        """Estimate how long this lesson will take to generate"""
        # Base time for LLM generation
        base_time = 30.0  # seconds
        
        # Add time based on content complexity
        duration_factor = self.total_duration / 60.0  # minutes
        segment_factor = len(self.segments) * 2.0  # seconds per segment
        
        # Add time for TTS generation
        total_narration_length = sum(len(segment.narration) for segment in self.segments)
        tts_factor = total_narration_length / 100.0  # rough estimate
        
        return base_time + duration_factor + segment_factor + tts_factor


class TimelineLessonResponse(BaseModel):
    """Response model for timeline lesson API"""
    id: str
    topic: str
    title: Optional[str]
    difficulty_level: str
    total_duration: float
    segments: List[TimelineSegment]
    visual_library: Dict[str, VisualLibraryPreset]
    created_at: datetime
    updated_at: Optional[datetime]
    generation_status: str
    generation_progress: float
    legacy_lesson_id: Optional[str]


class CreateTimelineLessonRequest(BaseModel):
    """Request model for creating timeline lesson"""
    topic: str = Field(..., description="Lesson topic")
    difficulty_level: str = Field(default="beginner", description="Difficulty level")
    target_duration: Optional[float] = Field(default=120.0, description="Target duration in seconds")
    visual_style: Optional[str] = Field(default="educational", description="Visual style preference")


class UpdateTimelineLessonRequest(BaseModel):
    """Request model for updating timeline lesson"""
    title: Optional[str] = None
    difficulty_level: Optional[str] = None
    segments: Optional[List[TimelineSegment]] = None
    visual_library: Optional[Dict[str, VisualLibraryPreset]] = None


class TimelineGenerationProgress(BaseModel):
    """Model for tracking timeline lesson generation progress"""
    lesson_id: str
    status: str  # pending, generating, completed, failed
    progress: float  # 0-100
    current_step: str
    estimated_remaining: Optional[float] = None
    error_message: Optional[str] = None
    segments_completed: int = 0
    total_segments: int = 0