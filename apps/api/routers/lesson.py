from datetime import datetime
from typing import List, Optional, Dict, Any, AsyncGenerator
import logging
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from bson import ObjectId
from models.lesson import (
    Lesson, 
    LessonResponse, 
    CreateLessonRequest, 
    UpdateLessonRequest
)
from services.ollama_service import ollama_service
from utils.error_handler import ErrorHandler

# Optional TTS service import
try:
    from services.tts_service import piper_tts_service
    TTS_AVAILABLE = True
except ImportError as e:
    logger = logging.getLogger(__name__)
    logger.warning(f"TTS service not available: {e}")
    piper_tts_service = None
    TTS_AVAILABLE = False

logger = logging.getLogger(__name__)
router = APIRouter()


# ============ Phase 2: Chunked Generation Models ============

class ChunkedGenerationRequest(BaseModel):
    """Request for chunked lesson generation"""
    topic: str = Field(..., description="Educational topic to cover")
    difficulty_level: str = Field("beginner", description="Difficulty level: beginner, intermediate, advanced")
    content_type: str = Field("definition", description="Content type: definition, process, comparison, example, list, concept_map, formula, story")
    target_duration: float = Field(120.0, description="Target total duration in seconds")
    user_id: str = Field("default", description="User ID for personalized settings")


class TimelineEventResponse(BaseModel):
    """Timeline event in the response"""
    timestamp: float
    duration: float
    event_type: str
    content: str
    visual_instruction: Optional[str] = None
    layout_hints: Optional[Dict[str, Any]] = None


class ChunkGenerationProgressResponse(BaseModel):
    """Progress update for chunk generation"""
    status: str
    total_chunks: int
    completed_chunks: int
    current_chunk: int
    estimated_time_remaining: float
    current_operation: str
    errors: List[str]


class ChunkResultResponse(BaseModel):
    """Individual chunk generation result"""
    chunk_id: str
    chunk_number: int
    timeline_events: List[TimelineEventResponse]
    chunk_summary: str
    next_chunk_hint: str
    concepts_introduced: List[str]
    visual_elements_created: List[str]
    generation_time: float
    token_count: int
    status: str
    error_message: Optional[str] = None


class ChunkedGenerationResponse(BaseModel):
    """Complete chunked generation response"""
    lesson_id: Optional[str] = None
    topic: str
    total_chunks: int
    chunks: List[ChunkResultResponse]
    generation_stats: Dict[str, Any]
    success: bool
    error: Optional[str] = None


class TopicAnalysisRequest(BaseModel):
    """Request for topic complexity analysis"""
    topic: str = Field(..., description="Educational topic to analyze")
    difficulty_level: str = Field("beginner", description="Target difficulty level")
    content_type: str = Field("definition", description="Type of content to generate")
    target_duration: float = Field(120.0, description="Target total duration")
    user_id: str = Field("default", description="User ID for settings")


class ChunkRecommendationResponse(BaseModel):
    """Chunk sizing recommendation"""
    chunk_size: str
    target_duration: float
    target_tokens: int
    estimated_chunks_needed: int
    break_points: List[str]
    reasoning: str
    complexity_factors: List[str]
    confidence: float


class ChunkConfigResponse(BaseModel):
    """Individual chunk configuration"""
    max_tokens: int
    target_duration: float
    content_type: str
    difficulty: str
    include_visual_instructions: bool
    maintain_continuity: bool


class TopicAnalysisResponse(BaseModel):
    """Topic analysis and chunking recommendations"""
    status: str
    recommendation: Optional[ChunkRecommendationResponse] = None
    chunk_configs: Optional[List[ChunkConfigResponse]] = None
    error: Optional[str] = None


class GenerationStatsResponse(BaseModel):
    """Generation performance statistics"""
    status: str
    total_chunks_generated: Optional[int] = None
    successful_chunks: Optional[int] = None
    success_rate: Optional[float] = None
    average_generation_time: Optional[float] = None
    average_token_count: Optional[float] = None
    cache_size: Optional[int] = None
    error: Optional[str] = None


@router.post("/lesson", response_model=LessonResponse)
async def create_lesson(request: CreateLessonRequest):
    """Create a new lesson immediately (without content)"""
    try:
        # Create lesson in database immediately
        lesson = Lesson(
            topic=request.topic,
            title=request.topic,  # Default title to topic
            difficulty_level=request.difficulty_level,
            steps=[],  # Empty steps initially
            created_at=datetime.utcnow()
        )
        
        await lesson.insert()
        
        # Return response
        return LessonResponse(
            id=str(lesson.id),
            topic=lesson.topic,
            title=lesson.title,
            difficulty_level=lesson.difficulty_level,
            steps=lesson.steps,
            doubts=lesson.doubts or [],
            created_at=lesson.created_at,
            updated_at=lesson.updated_at
        )
        
    except Exception as e:
        print(f"Error creating lesson: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to create lesson"
        )


@router.post("/lesson/{lesson_id}/generate", response_model=LessonResponse)
async def generate_lesson_content(lesson_id: str):
    """Generate content for an existing lesson"""
    try:
        if not ObjectId.is_valid(lesson_id):
            raise HTTPException(status_code=400, detail="Invalid lesson ID")
        
        lesson = await Lesson.get(ObjectId(lesson_id))
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        
        # Generate lesson steps using Ollama
        steps = await ollama_service.generate_eli5_lesson(
            topic=lesson.topic,
            difficulty_level=lesson.difficulty_level,
            user_id="default"  # TODO: Add user authentication
        )
        
        if not steps:
            raise HTTPException(
                status_code=503, 
                detail="Failed to generate lesson content. AI service may be unavailable."
            )
        
        # Update lesson with generated content
        await lesson.update({"$set": {
            "steps": steps,
            "updated_at": datetime.utcnow()
        }})
        
        # Refresh lesson from database
        lesson = await Lesson.get(ObjectId(lesson_id))
        
        return LessonResponse(
            id=str(lesson.id),
            topic=lesson.topic,
            title=lesson.title,
            difficulty_level=lesson.difficulty_level,
            steps=lesson.steps,
            doubts=lesson.doubts or [],
            created_at=lesson.created_at,
            updated_at=lesson.updated_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise ErrorHandler.handle_service_error("generate lesson content", e)


@router.get("/lessons", response_model=List[LessonResponse])
async def get_lessons(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """Get all lessons with pagination"""
    try:
        lessons = await Lesson.find().skip(offset).limit(limit).sort(-Lesson.created_at).to_list()
        
        return [
            LessonResponse(
                id=str(lesson.id),
                topic=lesson.topic,
                title=lesson.title,
                difficulty_level=lesson.difficulty_level,
                steps=lesson.steps,
                doubts=lesson.doubts or [],
                created_at=lesson.created_at,
                updated_at=lesson.updated_at
            )
            for lesson in lessons
        ]
        
    except Exception as e:
        print(f"Error fetching lessons: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch lessons"
        )


@router.get("/lesson/{lesson_id}", response_model=LessonResponse)
async def get_lesson(lesson_id: str):
    """Get a specific lesson by ID"""
    try:
        if not ObjectId.is_valid(lesson_id):
            raise HTTPException(status_code=400, detail="Invalid lesson ID")
        
        lesson = await Lesson.get(ObjectId(lesson_id))
        
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        
        return LessonResponse(
            id=str(lesson.id),
            topic=lesson.topic,
            title=lesson.title,
            difficulty_level=lesson.difficulty_level,
            steps=lesson.steps,
            doubts=lesson.doubts or [],
            created_at=lesson.created_at,
            updated_at=lesson.updated_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching lesson: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch lesson"
        )


@router.put("/lesson/{lesson_id}", response_model=LessonResponse)
async def update_lesson(lesson_id: str, request: UpdateLessonRequest):
    """Update a lesson"""
    try:
        lesson_obj_id = ErrorHandler.validate_object_id(lesson_id, "lesson")
        lesson = await Lesson.get(lesson_obj_id)
        
        if not lesson:
            raise ErrorHandler.handle_not_found("Lesson", lesson_id)
        
        # Update fields
        update_data = {}
        if request.title is not None:
            update_data["title"] = request.title
        if request.difficulty_level is not None:
            update_data["difficulty_level"] = request.difficulty_level
        if request.steps is not None:
            update_data["steps"] = request.steps
        if request.doubts is not None:
            update_data["doubts"] = request.doubts
        
        if update_data:
            update_data["updated_at"] = datetime.utcnow()
            await lesson.update({"$set": update_data})
            
            # Refresh lesson from database
            lesson = await Lesson.get(lesson_obj_id)
        
        return LessonResponse(
            id=str(lesson.id),
            topic=lesson.topic,
            title=lesson.title,
            difficulty_level=lesson.difficulty_level,
            steps=lesson.steps,
            doubts=lesson.doubts or [],
            created_at=lesson.created_at,
            updated_at=lesson.updated_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise ErrorHandler.handle_service_error("update lesson", e)


@router.delete("/lesson/{lesson_id}")
async def delete_lesson(lesson_id: str):
    """Delete a lesson"""
    try:
        lesson_obj_id = ErrorHandler.validate_object_id(lesson_id, "lesson")
        lesson = await Lesson.get(lesson_obj_id)
        
        if not lesson:
            raise ErrorHandler.handle_not_found("Lesson", lesson_id)
        
        await lesson.delete()
        
        return {"message": "Lesson deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise ErrorHandler.handle_service_error("delete lesson", e)


@router.post("/lesson/{lesson_id}/generate-script", response_model=LessonResponse)
async def generate_lesson_script(lesson_id: str):
    """Generate visual script content for an existing lesson with narration and visual elements"""
    try:
        lesson_obj_id = ErrorHandler.validate_object_id(lesson_id, "lesson")
        lesson = await Lesson.get(lesson_obj_id)
        if not lesson:
            raise ErrorHandler.handle_not_found("Lesson", lesson_id)
        
        # Generate visual script using Ollama
        steps = await ollama_service.generate_visual_script(
            topic=lesson.topic,
            difficulty_level=lesson.difficulty_level,
            user_id="default"  # TODO: Add user authentication
        )
        
        if not steps:
            raise ErrorHandler.handle_service_unavailable(
                "AI", "Failed to generate lesson script"
            )
        
        # Update lesson with generated script content
        await lesson.update({"$set": {
            "steps": steps,
            "updated_at": datetime.utcnow()
        }})
        
        # Refresh lesson from database
        lesson = await Lesson.get(ObjectId(lesson_id))
        
        return LessonResponse(
            id=str(lesson.id),
            topic=lesson.topic,
            title=lesson.title,
            difficulty_level=lesson.difficulty_level,
            steps=lesson.steps,
            doubts=lesson.doubts or [],
            created_at=lesson.created_at,
            updated_at=lesson.updated_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating lesson script: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate lesson script"
        )


@router.get("/lesson/{lesson_id}/script")
async def get_lesson_script(lesson_id: str):
    """Get the compiled script for the entire lesson"""
    try:
        if not ObjectId.is_valid(lesson_id):
            raise HTTPException(status_code=400, detail="Invalid lesson ID")
        
        lesson = await Lesson.get(ObjectId(lesson_id))
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        
        # Compile the script from lesson steps
        script = {
            "lesson_id": str(lesson.id),
            "topic": lesson.topic,
            "title": lesson.title,
            "total_duration": sum(step.duration or 0 for step in lesson.steps),
            "steps": [
                {
                    "step_number": step.step_number,
                    "title": step.title,
                    "narration": step.narration or step.explanation,
                    "visual_elements": step.visual_elements or [],
                    "duration": step.duration,
                    "elements": step.elements or []
                }
                for step in lesson.steps
            ]
        }
        
        return script
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting lesson script: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get lesson script"
        )


@router.post("/lesson/{lesson_id}/generate-tts", response_model=LessonResponse)
async def generate_lesson_tts(lesson_id: str, voice: Optional[str] = None):
    """Generate TTS audio for all steps in a lesson"""
    try:
        if not TTS_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="TTS service is not available"
            )
        
        if not ObjectId.is_valid(lesson_id):
            raise HTTPException(status_code=400, detail="Invalid lesson ID")
        
        lesson = await Lesson.get(ObjectId(lesson_id))
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        
        if not lesson.steps:
            raise HTTPException(status_code=400, detail="Lesson has no steps to generate TTS for")
        
        # Generate TTS for each step
        updated_steps = []
        for step in lesson.steps:
            if not step.narration:
                # Skip steps without narration
                updated_steps.append(step)
                continue
            
            try:
                # Generate TTS audio
                audio_id = await piper_tts_service.generate_audio(step.narration, voice)
                
                if audio_id:
                    # Update step with TTS metadata
                    audio_url = piper_tts_service._get_audio_url(audio_id)
                    updated_step = step.copy(update={
                        "audio_id": audio_id,
                        "audio_url": audio_url,
                        "tts_voice": voice or piper_tts_service.default_voice,
                        "tts_generated": True,
                        "tts_error": None
                    })
                else:
                    # Mark as failed
                    updated_step = step.copy(update={
                        "tts_generated": False,
                        "tts_error": "Failed to generate TTS audio"
                    })
                
                updated_steps.append(updated_step)
                
            except Exception as e:
                # Mark as failed with error
                updated_step = step.copy(update={
                    "tts_generated": False,
                    "tts_error": str(e)
                })
                updated_steps.append(updated_step)
        
        # Update lesson with TTS metadata
        await lesson.update({"$set": {
            "steps": updated_steps,
            "updated_at": datetime.utcnow()
        }})
        
        # Refresh lesson from database
        lesson = await Lesson.get(ObjectId(lesson_id))
        
        return LessonResponse(
            id=str(lesson.id),
            topic=lesson.topic,
            title=lesson.title,
            difficulty_level=lesson.difficulty_level,
            steps=lesson.steps,
            doubts=lesson.doubts or [],
            created_at=lesson.created_at,
            updated_at=lesson.updated_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating lesson TTS: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate lesson TTS"
        )


@router.get("/lesson/{lesson_id}/tts-status")
async def get_lesson_tts_status(lesson_id: str):
    """Get TTS generation status for a lesson"""
    try:
        if not TTS_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="TTS service is not available"
            )
        
        if not ObjectId.is_valid(lesson_id):
            raise HTTPException(status_code=400, detail="Invalid lesson ID")
        
        lesson = await Lesson.get(ObjectId(lesson_id))
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        
        # Calculate TTS statistics
        total_steps = len(lesson.steps)
        steps_with_narration = len([s for s in lesson.steps if s.narration])
        steps_with_tts = len([s for s in lesson.steps if s.tts_generated])
        steps_with_errors = len([s for s in lesson.steps if s.tts_error])
        
        step_details = []
        for step in lesson.steps:
            step_details.append({
                "step_number": step.step_number,
                "title": step.title,
                "has_narration": bool(step.narration),
                "tts_generated": step.tts_generated,
                "audio_url": step.audio_url,
                "tts_voice": step.tts_voice,
                "tts_error": step.tts_error
            })
        
        return {
            "lesson_id": str(lesson.id),
            "total_steps": total_steps,
            "steps_with_narration": steps_with_narration,
            "steps_with_tts": steps_with_tts,
            "steps_with_errors": steps_with_errors,
            "completion_percentage": (steps_with_tts / steps_with_narration * 100) if steps_with_narration > 0 else 0,
            "step_details": step_details
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting lesson TTS status: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get lesson TTS status"
        )


# ============ Phase 2: Chunked Generation Endpoints ============

@router.post("/lesson/chunked", response_model=ChunkedGenerationResponse)
async def generate_chunked_lesson(request: ChunkedGenerationRequest):
    """Generate a lesson using chunked content generation with real-time progress"""
    try:
        logger.info(f"Starting chunked lesson generation: {request.topic}")
        
        # Collect all chunks as they're generated
        chunks = []
        final_progress = None
        
        async for progress, chunk_result in ollama_service.generate_chunked_lesson(
            topic=request.topic,
            difficulty_level=request.difficulty_level,
            content_type=request.content_type,
            target_duration=request.target_duration,
            user_id=request.user_id
        ):
            final_progress = progress
            
            if chunk_result:
                # Convert timeline events to response format
                timeline_events = [
                    TimelineEventResponse(
                        timestamp=event.get("timestamp", 0.0),
                        duration=event.get("duration", 5.0),
                        event_type=event.get("event_type", "narration"),
                        content=event.get("content", ""),
                        visual_instruction=event.get("visual_instruction"),
                        layout_hints=event.get("layout_hints")
                    )
                    for event in chunk_result["timeline_events"]
                ]
                
                chunk_response = ChunkResultResponse(
                    chunk_id=chunk_result["chunk_id"],
                    chunk_number=chunk_result["chunk_number"],
                    timeline_events=timeline_events,
                    chunk_summary=chunk_result["chunk_summary"],
                    next_chunk_hint=chunk_result["next_chunk_hint"],
                    concepts_introduced=chunk_result["concepts_introduced"],
                    visual_elements_created=chunk_result["visual_elements_created"],
                    generation_time=chunk_result["generation_time"],
                    token_count=chunk_result["token_count"],
                    status=chunk_result["status"],
                    error_message=chunk_result.get("error_message")
                )
                chunks.append(chunk_response)
        
        # Get generation statistics
        stats = ollama_service.get_chunked_generation_stats()
        
        # Determine success based on final progress
        success = final_progress and final_progress.get("status") == "completed"
        error_message = None
        if not success and final_progress:
            error_message = "; ".join(final_progress.get("errors", []))
        
        return ChunkedGenerationResponse(
            topic=request.topic,
            total_chunks=len(chunks),
            chunks=chunks,
            generation_stats=stats,
            success=success,
            error=error_message
        )
        
    except Exception as e:
        logger.error(f"Error in chunked lesson generation: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate chunked lesson: {str(e)}"
        )


@router.post("/lesson/chunked/stream")
async def stream_chunked_lesson_generation(request: ChunkedGenerationRequest):
    """Stream chunked lesson generation with real-time progress updates"""
    
    async def generate():
        try:
            import json
            
            async for progress, chunk_result in ollama_service.generate_chunked_lesson(
                topic=request.topic,
                difficulty_level=request.difficulty_level,
                content_type=request.content_type,
                target_duration=request.target_duration,
                user_id=request.user_id
            ):
                # Send progress update
                progress_data = {
                    "type": "progress",
                    "data": progress
                }
                yield f"data: {json.dumps(progress_data)}\n\n"
                
                # Send chunk result if available
                if chunk_result:
                    # Convert timeline events for JSON serialization
                    timeline_events = [
                        {
                            "timestamp": event.get("timestamp", 0.0),
                            "duration": event.get("duration", 5.0),
                            "event_type": event.get("event_type", "narration"),
                            "content": event.get("content", ""),
                            "visual_instruction": event.get("visual_instruction"),
                            "layout_hints": event.get("layout_hints")
                        }
                        for event in chunk_result["timeline_events"]
                    ]
                    
                    chunk_data = {
                        "type": "chunk",
                        "data": {
                            **chunk_result,
                            "timeline_events": timeline_events
                        }
                    }
                    yield f"data: {json.dumps(chunk_data)}\n\n"
            
            # Send completion signal
            completion_data = {
                "type": "complete",
                "data": {"message": "Generation completed"}
            }
            yield f"data: {json.dumps(completion_data)}\n\n"
            
        except Exception as e:
            logger.error(f"Error in streaming chunked generation: {e}")
            error_data = {
                "type": "error",
                "data": {"error": str(e)}
            }
            yield f"data: {json.dumps(error_data)}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        }
    )


@router.post("/lesson/analyze-chunking", response_model=TopicAnalysisResponse)
async def analyze_topic_for_chunking(request: TopicAnalysisRequest):
    """Analyze topic complexity and provide chunking recommendations"""
    try:
        logger.info(f"Analyzing topic for chunking: {request.topic}")
        
        result = await ollama_service.analyze_topic_for_chunking(
            topic=request.topic,
            difficulty_level=request.difficulty_level,
            content_type=request.content_type,
            target_duration=request.target_duration,
            user_id=request.user_id
        )
        
        if result["status"] == "success":
            recommendation = ChunkRecommendationResponse(**result["recommendation"])
            chunk_configs = [
                ChunkConfigResponse(**config) 
                for config in result["chunk_configs"]
            ]
            
            return TopicAnalysisResponse(
                status="success",
                recommendation=recommendation,
                chunk_configs=chunk_configs
            )
        else:
            return TopicAnalysisResponse(
                status="error",
                error=result.get("error", "Analysis failed")
            )
        
    except Exception as e:
        logger.error(f"Error analyzing topic for chunking: {e}")
        return TopicAnalysisResponse(
            status="error",
            error=str(e)
        )


@router.get("/lesson/generation-stats", response_model=GenerationStatsResponse)
async def get_generation_statistics():
    """Get chunked generation performance statistics"""
    try:
        logger.info("Getting generation statistics")
        
        stats = ollama_service.get_chunked_generation_stats()
        
        if stats.get("status") == "unavailable":
            return GenerationStatsResponse(
                status="unavailable",
                error=stats.get("reason", "Chunked generation not available")
            )
        elif stats.get("status") == "error":
            return GenerationStatsResponse(
                status="error",
                error=stats.get("error", "Unknown error")
            )
        elif stats.get("status") == "no_completed_generations":
            return GenerationStatsResponse(
                status="no_data",
                error="No completed generations to analyze"
            )
        else:
            return GenerationStatsResponse(
                status="success",
                total_chunks_generated=stats.get("total_chunks_generated"),
                successful_chunks=stats.get("successful_chunks"),
                success_rate=stats.get("success_rate"),
                average_generation_time=stats.get("average_generation_time"),
                average_token_count=stats.get("average_token_count"),
                cache_size=stats.get("cache_size")
            )
        
    except Exception as e:
        logger.error(f"Error getting generation statistics: {e}")
        return GenerationStatsResponse(
            status="error",
            error=str(e)
        )


@router.post("/lesson/{lesson_id}/convert-from-chunks")
async def convert_chunks_to_lesson(lesson_id: str, chunks: List[Dict[str, Any]]):
    """Convert chunked generation results to standard lesson format"""
    try:
        lesson_obj_id = ErrorHandler.validate_object_id(lesson_id, "lesson")
        lesson = await Lesson.get(lesson_obj_id)
        
        if not lesson:
            raise ErrorHandler.handle_not_found("Lesson", lesson_id)
        
        # Convert chunks to CanvasStep format
        canvas_steps = await ollama_service.convert_chunks_to_canvas_steps(
            chunks, lesson.topic
        )
        
        if not canvas_steps:
            raise HTTPException(
                status_code=400,
                detail="Failed to convert chunks to canvas steps"
            )
        
        # Update lesson with converted steps
        await lesson.update({"$set": {
            "steps": canvas_steps,
            "updated_at": datetime.utcnow()
        }})
        
        # Refresh lesson from database
        lesson = await Lesson.get(lesson_obj_id)
        
        return LessonResponse(
            id=str(lesson.id),
            topic=lesson.topic,
            title=lesson.title,
            difficulty_level=lesson.difficulty_level,
            steps=lesson.steps,
            doubts=lesson.doubts or [],
            created_at=lesson.created_at,
            updated_at=lesson.updated_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error converting chunks to lesson: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to convert chunks: {str(e)}"
        )