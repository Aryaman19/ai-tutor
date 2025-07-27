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
async def get_templates():
    """
    Get list of all available templates
    
    Returns:
        List of templates with metadata
    """
    try:
        templates = template_service.get_all_templates()
        
        return TemplateListResponse(
            templates=templates,
            total=len(templates)
        )
    
    except Exception as e:
        logger.error(f"Failed to get templates: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve templates")

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