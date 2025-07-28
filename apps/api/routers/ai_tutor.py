"""
AI Tutor Router

REST API endpoints for generating structured educational lessons using:
- 9-section lesson structure 
- Intelligent template selection
- LLM-powered content generation
- Integrated audio narration
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional
import logging
import asyncio
from services.ai_tutor_service import AITutorService
from services.lesson_structure_service import lesson_structure_service
from services.template_service import ContainerSize

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-tutor", tags=["AI Tutor"])

# Pydantic models for request/response
class LessonRequest(BaseModel):
    topic: str = Field(..., description="The educational topic to generate a lesson for")
    difficulty_level: str = Field("intermediate", description="Difficulty level: beginner, intermediate, or advanced")
    target_duration: float = Field(120, description="Target lesson duration in seconds")
    container_size: Optional[Dict[str, int]] = Field(
        default={"width": 1200, "height": 800}, 
        description="Container size for responsive template rendering"
    )

class GeneratedSlideResponse(BaseModel):
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

class LessonResponse(BaseModel):
    success: bool
    topic: str
    difficulty_level: str
    target_duration: float
    total_slides: int
    estimated_total_duration: float
    slides: List[GeneratedSlideResponse]
    audio_url: Optional[str] = None
    audio_segments: Optional[List[Dict[str, Any]]] = None
    canvas_states: Optional[List[Dict[str, Any]]] = None
    generation_stats: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class ProgressUpdate(BaseModel):
    status: str
    current_slide: int
    total_slides: int
    progress: float
    message: str
    error: Optional[str] = None

# Global AI tutor service instance
ai_tutor_service = AITutorService()

@router.post("/generate", response_model=LessonResponse)
async def generate_ai_tutor_lesson(request: LessonRequest):
    """
    Generate a complete AI tutor lesson with 9-section structure
    
    This endpoint creates a structured educational lesson that includes:
    - Title + Objective
    - Context / Motivation  
    - Analogy
    - Definition
    - Step-by-step Explanation / Theory
    - Examples
    - Common mistakes
    - Mini Recap
    - Some things to ponder
    
    The system intelligently selects appropriate templates for each section
    and uses LLM to generate contextual content.
    """
    
    logger.info(f"Generating AI tutor lesson for topic: {request.topic}")
    
    try:
        # Validate request parameters
        if not request.topic.strip():
            raise HTTPException(status_code=400, detail="Topic cannot be empty")
        
        if request.difficulty_level not in ["beginner", "intermediate", "advanced"]:
            raise HTTPException(
                status_code=400, 
                detail="Difficulty level must be 'beginner', 'intermediate', or 'advanced'"
            )
        
        if request.target_duration < 30 or request.target_duration > 600:
            raise HTTPException(
                status_code=400, 
                detail="Target duration must be between 30 and 600 seconds"
            )
        
        # Create container size object
        container_size = ContainerSize(
            width=request.container_size.get("width", 1200),
            height=request.container_size.get("height", 800)
        )
        
        # Generate lesson using AI tutor service
        generated_slides = []
        final_result = None
        
        async for progress_update, slide_result in ai_tutor_service.generate_ai_tutor_lesson(
            topic=request.topic.strip(),
            difficulty_level=request.difficulty_level,
            target_duration=request.target_duration,
            container_size=container_size
        ):
            # Log progress updates
            logger.debug(f"Lesson generation progress: {progress_update}")
            
            # Collect completed slides
            if slide_result:
                generated_slides.append(slide_result)
            
            # Check for completion
            if progress_update.get("progress", 0) >= 1.0:
                final_result = progress_update
                break
        
        # Validate generation results
        if not generated_slides:
            raise HTTPException(
                status_code=500, 
                detail="No slides were generated successfully"
            )
        
        # Calculate generation statistics
        total_generation_time = sum(slide.generation_time for slide in generated_slides)
        successful_slides = [slide for slide in generated_slides if slide.status == "success"]
        failed_slides = [slide for slide in generated_slides if slide.status == "failed"]
        
        generation_stats = {
            "total_generation_time": total_generation_time,
            "successful_slides": len(successful_slides),
            "failed_slides": len(failed_slides),
            "success_rate": len(successful_slides) / len(generated_slides) if generated_slides else 0,
            "average_slide_time": total_generation_time / len(generated_slides) if generated_slides else 0,
            "template_usage": {},
            "content_types_used": [slide.content_type for slide in generated_slides],
            "fallback_data_used": any(
                slide.filled_content and any(
                    "fallback" in str(content).lower() for content in slide.filled_content.values()
                ) for slide in generated_slides
            )
        }
        
        # Count template usage
        for slide in generated_slides:
            template_id = slide.template_id
            if template_id not in generation_stats["template_usage"]:
                generation_stats["template_usage"][template_id] = 0
            generation_stats["template_usage"][template_id] += 1
        
        # Convert slides to response format
        response_slides = [
            GeneratedSlideResponse(
                slide_number=slide.slide_number,
                template_id=slide.template_id,
                template_name=slide.template_name,
                content_type=slide.content_type,
                filled_content=slide.filled_content,
                elements=slide.elements,
                narration=slide.narration,
                estimated_duration=slide.estimated_duration,
                position_offset=slide.position_offset,
                metadata=slide.metadata,
                generation_time=slide.generation_time,
                status=slide.status,
                error_message=slide.error_message
            )
            for slide in generated_slides
        ]
        
        # Create successful response
        return LessonResponse(
            success=True,
            topic=request.topic,
            difficulty_level=request.difficulty_level,
            target_duration=request.target_duration,
            total_slides=len(generated_slides),
            estimated_total_duration=sum(slide.estimated_duration for slide in generated_slides),
            slides=response_slides,
            generation_stats=generation_stats
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI tutor lesson generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Lesson generation failed: {str(e)}"
        )

@router.get("/structure/{topic}")
async def analyze_lesson_structure(
    topic: str,
    difficulty_level: str = "intermediate",
    target_duration: float = 120
):
    """
    Analyze a topic and return the planned lesson structure without generating content
    
    Useful for previewing what sections will be included and their estimated timing
    before committing to full lesson generation.
    """
    
    logger.info(f"Analyzing lesson structure for topic: {topic}")
    
    try:
        # Validate parameters
        if not topic.strip():
            raise HTTPException(status_code=400, detail="Topic cannot be empty")
        
        if difficulty_level not in ["beginner", "intermediate", "advanced"]:
            raise HTTPException(
                status_code=400, 
                detail="Difficulty level must be 'beginner', 'intermediate', or 'advanced'"
            )
        
        # Generate lesson structure
        lesson_structure = await lesson_structure_service.analyze_topic_structure(
            topic=topic.strip(),
            difficulty_level=difficulty_level,
            target_duration=target_duration
        )
        
        # Format response
        return {
            "success": True,
            "topic": lesson_structure.topic,
            "difficulty_level": lesson_structure.difficulty_level,
            "total_slides": lesson_structure.total_slides,
            "estimated_total_duration": lesson_structure.estimated_total_duration,
            "teaching_strategy": lesson_structure.teaching_strategy,
            "content_flow": lesson_structure.content_flow,
            "slides": [
                {
                    "slide_number": slide.slide_number,
                    "template_id": slide.template_id,
                    "template_name": slide.template_name,
                    "content_type": slide.content_type,
                    "estimated_duration": slide.estimated_duration,
                    "priority": slide.priority,
                    "layout_hints": slide.layout_hints
                }
                for slide in lesson_structure.slides
            ]
        }
        
    except Exception as e:
        logger.error(f"Lesson structure analysis failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Structure analysis failed: {str(e)}"
        )

@router.get("/templates/categories")
async def get_template_categories():
    """Get available template categories for lesson sections"""
    
    try:
        from services.template_service import template_service
        categories = template_service.get_available_categories()
        
        return {
            "success": True,
            "categories": categories
        }
        
    except Exception as e:
        logger.error(f"Failed to get template categories: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get template categories: {str(e)}"
        )

@router.get("/health")
async def health_check():
    """Health check endpoint for AI tutor service"""
    
    try:
        # Check if lesson structure service is working
        from services.lesson_structure_service import lesson_structure_service
        from services.template_service import template_service
        from services.ollama_service import ollama_service
        
        # Basic checks
        template_count = len(template_service.templates_cache)
        section_count = len(lesson_structure_service.lesson_sections)
        
        return {
            "status": "healthy",
            "service": "ai-tutor",
            "components": {
                "lesson_structure_service": "available",
                "template_service": f"available ({template_count} templates)",
                "ollama_service": "available",
                "ai_tutor_service": "available"
            },
            "lesson_sections": section_count,
            "supported_difficulties": ["beginner", "intermediate", "advanced"],
            "max_duration": 600,
            "min_duration": 30
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "service": "ai-tutor",
            "error": str(e)
        }