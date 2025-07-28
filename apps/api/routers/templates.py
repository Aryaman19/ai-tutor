"""
Templates API router for educational template management
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import logging

from services.template_service import template_service, ContainerSize
from services.template_filling_service import create_template_filler, FilledTemplate
from services.ollama_service import OllamaService

logger = logging.getLogger(__name__)

router = APIRouter()

class TemplateListResponse(BaseModel):
    """Response model for template list"""
    templates: List[Dict[str, Any]]
    total: int

class ContainerSizeRequest(BaseModel):
    """Request model for container size"""
    width: int = Field(..., ge=320, le=3840, description="Container width in pixels")
    height: int = Field(..., ge=240, le=2160, description="Container height in pixels")

class TemplateRenderResponse(BaseModel):
    """Response model for rendered template"""
    templateId: str
    templateName: str
    slideIndex: int
    containerSize: Dict[str, Any]
    elements: List[Dict[str, Any]]
    metadata: Dict[str, Any]

class TopicRequest(BaseModel):
    """Request model for LLM content generation"""
    topic: str = Field(..., min_length=1, max_length=200, description="Educational topic for content generation")
    container_size: Optional[ContainerSizeRequest] = None

class FilledTemplateResponse(BaseModel):
    """Response model for LLM-filled template"""
    templateId: str
    templateName: str
    topic: str
    slideIndex: int
    filledContent: Dict[str, str]
    containerSize: Dict[str, Any]
    elements: List[Dict[str, Any]]
    metadata: Dict[str, Any]
    isFallback: bool

@router.get("/", response_model=TemplateListResponse)
async def get_templates(category: Optional[str] = Query(None, description="Filter templates by category")):
    """
    Get list of all available templates, optionally filtered by category
    
    Args:
        category: Optional category to filter by
        
    Returns:
        List of templates with metadata
    """
    try:
        if category:
            templates = template_service.get_templates_by_category(category)
        else:
            templates = template_service.get_all_templates()
        
        return TemplateListResponse(
            templates=templates,
            total=len(templates)
        )
    
    except Exception as e:
        logger.error(f"Failed to get templates: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve templates")

@router.get("/categories", response_model=Dict[str, Any])
async def get_template_categories():
    """
    Get list of all available template categories with template counts
    
    Returns:
        List of categories with metadata and template information
    """
    try:
        categories = template_service.get_available_categories()
        
        return {
            "categories": categories,
            "total": len(categories)
        }
    
    except Exception as e:
        logger.error(f"Failed to get template categories: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve template categories")

@router.get("/{template_id}", response_model=Dict[str, Any])
async def get_template(template_id: str):
    """
    Get a specific template by ID
    
    Args:
        template_id: The template identifier
        
    Returns:
        Template definition with all slides and configuration
    """
    try:
        template = template_service.get_template(template_id)
        
        if not template:
            raise HTTPException(status_code=404, detail=f"Template {template_id} not found")
        
        return template
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve template")

@router.post("/{template_id}/render", response_model=TemplateRenderResponse)
async def render_template(
    template_id: str,
    container_size: ContainerSizeRequest,
    slide_index: int = Query(0, ge=0, description="Slide index to render")
):
    """
    Render a template for specific container size with dummy data
    
    Args:
        template_id: The template identifier
        container_size: Container dimensions for responsive rendering
        slide_index: Which slide to render (default: 0)
        
    Returns:
        Rendered template with calculated element positions and sizes
    """
    try:
        container = ContainerSize(
            width=container_size.width,
            height=container_size.height
        )
        
        rendered = template_service.render_template(
            template_id=template_id,
            container_size=container,
            slide_index=slide_index
        )
        
        return TemplateRenderResponse(**rendered)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to render template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to render template")

@router.get("/{template_id}/preview")
async def preview_template(
    template_id: str,
    width: int = Query(800, ge=320, le=3840, description="Container width"),
    height: int = Query(600, ge=240, le=2160, description="Container height"),
    slide_index: int = Query(0, ge=0, description="Slide index")
):
    """
    Quick preview endpoint for template rendering (GET request)
    
    Args:
        template_id: The template identifier
        width: Container width in pixels
        height: Container height in pixels
        slide_index: Which slide to render
        
    Returns:
        Rendered template data
    """
    try:
        container = ContainerSize(width=width, height=height)
        
        rendered = template_service.render_template(
            template_id=template_id,
            container_size=container,
            slide_index=slide_index
        )
        
        return rendered
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to preview template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to preview template")

@router.get("/{template_id}/responsive-test")
async def test_responsive_breakpoints(template_id: str, slide_index: int = Query(0, ge=0)):
    """
    Test template across different responsive breakpoints
    
    Args:
        template_id: The template identifier
        slide_index: Which slide to test
        
    Returns:
        Rendered template at mobile, tablet, and desktop sizes
    """
    try:
        breakpoints = {
            "mobile": ContainerSize(375, 667),    # iPhone SE
            "tablet": ContainerSize(768, 1024),   # iPad
            "desktop": ContainerSize(1440, 900)   # Common desktop
        }
        
        results = {}
        
        for breakpoint_name, container_size in breakpoints.items():
            rendered = template_service.render_template(
                template_id=template_id,
                container_size=container_size,
                slide_index=slide_index
            )
            results[breakpoint_name] = rendered
        
        return {
            "templateId": template_id,
            "slideIndex": slide_index,
            "breakpoints": results
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to test responsive breakpoints for {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to test responsive breakpoints")

@router.post("/{template_id}/fill", response_model=FilledTemplateResponse)
async def fill_template_with_llm(
    template_id: str,
    topic_request: TopicRequest,
    slide_index: int = Query(0, ge=0, description="Slide index to fill")
):
    """
    Fill a template with LLM-generated content for a specific topic
    
    Args:
        template_id: The template identifier
        topic_request: Topic and optional container size
        slide_index: Which slide to fill (default: 0)
        
    Returns:
        Template filled with LLM-generated content and rendered elements
    """
    try:
        # Get template
        template = template_service.get_template(template_id)
        if not template:
            raise HTTPException(status_code=404, detail=f"Template {template_id} not found")
        
        # Get or create Ollama service
        try:
            ollama_service = OllamaService()
        except Exception as e:
            logger.warning(f"Failed to initialize Ollama service: {e}")
            ollama_service = None
        
        # Create template filler
        template_filler = create_template_filler(ollama_service)
        
        # Prepare container size
        container_size_dict = None
        if topic_request.container_size:
            container_size_dict = {
                "width": topic_request.container_size.width,
                "height": topic_request.container_size.height
            }
        
        # Fill template with LLM content
        filled_template = await template_filler.fill_template(
            template=template,
            topic=topic_request.topic,
            slide_index=slide_index,
            container_size=container_size_dict
        )
        
        # Create container size for rendering
        container_size = ContainerSize(
            width=topic_request.container_size.width if topic_request.container_size else 800,
            height=topic_request.container_size.height if topic_request.container_size else 600
        )
        
        # Render the filled template
        rendered = template_service.render_filled_template(
            template=template,
            filled_content=filled_template.filled_content,
            container_size=container_size,
            slide_index=slide_index
        )
        
        return FilledTemplateResponse(
            templateId=filled_template.template_id,
            templateName=template["name"],
            topic=filled_template.topic,
            slideIndex=filled_template.slide_index,
            filledContent=filled_template.filled_content,
            containerSize=rendered["containerSize"],
            elements=rendered["elements"],
            metadata={
                **filled_template.metadata,
                **rendered["metadata"]
            },
            isFallback=filled_template.is_fallback
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to fill template {template_id} with topic '{topic_request.topic}': {e}")
        raise HTTPException(status_code=500, detail="Failed to generate template content")

@router.post("/{template_id}/generate-lesson")
async def generate_lesson_from_template(
    template_id: str,
    topic_request: TopicRequest
):
    """
    Generate a complete lesson using a template and topic
    
    Args:
        template_id: The template identifier
        topic_request: Topic and optional container size
        
    Returns:
        Complete lesson with filled template and audio generation info
    """
    try:
        # Get template
        template = template_service.get_template(template_id)
        if not template:
            raise HTTPException(status_code=404, detail=f"Template {template_id} not found")
        
        # Get or create Ollama service
        try:
            ollama_service = OllamaService()
        except Exception as e:
            logger.warning(f"Failed to initialize Ollama service: {e}")
            ollama_service = None
        
        # Create template filler
        template_filler = create_template_filler(ollama_service)
        
        # Generate content for all slides in template
        filled_slides = []
        
        for slide_index in range(len(template["slides"])):
            container_size_dict = None
            if topic_request.container_size:
                container_size_dict = {
                    "width": topic_request.container_size.width,
                    "height": topic_request.container_size.height
                }
            
            filled_template = await template_filler.fill_template(
                template=template,
                topic=topic_request.topic,
                slide_index=slide_index,
                container_size=container_size_dict
            )
            
            filled_slides.append({
                "slideIndex": slide_index,
                "filledContent": filled_template.filled_content,
                "metadata": filled_template.metadata,
                "isFallback": filled_template.is_fallback
            })
        
        return {
            "templateId": template_id,
            "templateName": template["name"],
            "topic": topic_request.topic,
            "slides": filled_slides,
            "totalSlides": len(filled_slides),
            "generationComplete": True
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate lesson from template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate lesson")

@router.post("/dummy-lesson", response_model=Dict[str, Any])
async def generate_dummy_template_lesson():
    """
    Generate a dummy multi-slide lesson using templates with fallback data
    
    This endpoint creates a complete lesson using multiple templates with their
    fallback narration data, generates audio for each slide, and calculates
    proper timing for a seamless multi-slide experience.
    
    Returns:
        Complete AI tutor lesson structure with multiple slides and unified audio timing
    """
    try:
        logger.info("Starting dummy template lesson generation")
        
        # Select diverse templates from different categories
        all_templates = template_service.get_all_templates()
        
        # Filter templates by category for diversity
        categories_to_use = ["title-objective", "definition", "analogy", "examples", "mini-recap"]
        selected_templates = []
        
        for category in categories_to_use:
            category_templates = [t for t in all_templates if t.get("category") == category]
            if category_templates:
                # Take first template from each category
                selected_templates.append(category_templates[0])
        
        # Fallback: if we don't have enough diverse templates, use first 3-5 available
        if len(selected_templates) < 3:
            selected_templates = all_templates[:5]
        
        # Limit to 5 slides maximum
        selected_templates = selected_templates[:5]
        
        logger.info(f"Selected {len(selected_templates)} templates for dummy lesson")
        
        # Container size for rendering
        container_size = ContainerSize(width=1200, height=700)
        
        # Generate slides using fallback data
        slides = []
        current_time_offset = 0
        
        for slide_index, template_info in enumerate(selected_templates):
            template_id = template_info["id"]
            template = template_service.get_template(template_id)
            
            if not template:
                logger.warning(f"Template {template_id} not found, skipping")
                continue
            
            # Render template with fallback data
            rendered = template_service.render_template(
                template_id=template_id,
                container_size=container_size,
                slide_index=0  # Use first slide of each template
            )
            
            # Extract fallback data
            fallback_data = rendered["metadata"].get("fallbackData", {})
            narration = fallback_data.get("narration", f"Learning about slide {slide_index + 1}")
            heading = fallback_data.get("heading", f"Slide {slide_index + 1}")
            content = fallback_data.get("content", "Educational content")
            
            # Estimate duration based on narration text (rough estimate: 160 WPM)
            word_count = len(narration.split())
            estimated_duration = max(3.0, (word_count / 160) * 60)  # Minimum 3 seconds
            
            # Create slide data structure compatible with AITutorPlayer
            slide_data = {
                "slide_number": slide_index + 1,
                "template_id": template_id,
                "template_name": template_info["name"],
                "content_type": template_info.get("category", "educational"),
                "filled_content": {
                    "heading": heading,
                    "content": content,
                    "narration": narration
                },
                "elements": rendered["elements"],
                "narration": narration,
                "estimated_duration": estimated_duration,
                "position_offset": slide_index * (container_size.width + 100),  # Space slides horizontally
                "metadata": {
                    "slideId": f"dummy-slide-{slide_index + 1}",
                    "slideType": template_info.get("category", "educational"),
                    "fallbackData": fallback_data,
                    "templateInfo": template_info,
                    "renderInfo": rendered["metadata"]
                },
                "generation_time": 0.1,  # Mock generation time
                "status": "success"
            }
            
            slides.append(slide_data)
            current_time_offset += estimated_duration
        
        # Calculate total duration
        total_duration = sum(slide["estimated_duration"] for slide in slides)
        
        # Create lesson response compatible with AI tutor format
        lesson_response = {
            "topic": "Multi-Template Demo Lesson",
            "difficulty_level": "intermediate",
            "target_duration": total_duration,
            "total_slides": len(slides),
            "estimated_total_duration": total_duration,
            "slides": slides,
            "audio_url": None,  # Will be generated by frontend audio engine
            "audio_segments": [
                {
                    "slide_number": slide["slide_number"],
                    "text": slide["narration"],
                    "start_time": sum(slides[i]["estimated_duration"] for i in range(slide["slide_number"] - 1)),
                    "duration": slide["estimated_duration"]
                }
                for slide in slides
            ],
            "canvas_states": [],  # Will be generated by layout engine
            "generation_stats": {
                "total_templates_used": len(slides),
                "categories_used": list(set(slide["content_type"] for slide in slides)),
                "total_generation_time": len(slides) * 0.1,
                "fallback_data_used": True
            },
            "success": True
        }
        
        logger.info(f"Generated dummy lesson with {len(slides)} slides, total duration: {total_duration:.1f}s")
        
        return lesson_response
        
    except Exception as e:
        logger.error(f"Failed to generate dummy template lesson: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate dummy lesson: {str(e)}")