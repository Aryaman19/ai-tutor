from datetime import datetime
from typing import List, Optional, Dict, Any
import logging
import asyncio
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from bson import ObjectId
import json

from models.timeline_lesson import (
    TimelineLesson, 
    TimelineLessonResponse, 
    CreateTimelineLessonRequest, 
    UpdateTimelineLessonRequest,
    TimelineGenerationProgress,
    TimelineSegment,
    VisualElement
)
from services.timeline_ollama_service import timeline_ollama_service
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

# Store for tracking generation progress
generation_progress_store: Dict[str, TimelineGenerationProgress] = {}


@router.post("/timeline-lesson", response_model=TimelineLessonResponse)
async def create_timeline_lesson(request: CreateTimelineLessonRequest, background_tasks: BackgroundTasks):
    """Create a new timeline lesson and start generation in background"""
    try:
        # Create lesson in database immediately with pending status
        lesson = TimelineLesson(
            topic=request.topic,
            title=request.topic,  # Will be updated after generation
            difficulty_level=request.difficulty_level,
            total_duration=request.target_duration or 120.0,
            segments=[],  # Will be populated during generation
            generation_status="pending",
            generation_progress=0.0,
            created_at=datetime.utcnow()
        )
        
        await lesson.insert()
        lesson_id = str(lesson.id)
        
        # Initialize progress tracking
        generation_progress_store[lesson_id] = TimelineGenerationProgress(
            lesson_id=lesson_id,
            status="pending",
            progress=0.0,
            current_step="Initializing generation...",
            segments_completed=0,
            total_segments=0
        )
        
        # Start background generation
        background_tasks.add_task(generate_timeline_lesson_background, lesson_id, request)
        
        # Return immediate response
        return TimelineLessonResponse(
            id=lesson_id,
            topic=lesson.topic,
            title=lesson.title,
            difficulty_level=lesson.difficulty_level,
            total_duration=lesson.total_duration,
            segments=lesson.segments,
            visual_library=lesson.visual_library,
            created_at=lesson.created_at,
            updated_at=lesson.updated_at,
            generation_status=lesson.generation_status,
            generation_progress=lesson.generation_progress,
            legacy_lesson_id=lesson.legacy_lesson_id
        )
        
    except Exception as e:
        logger.error(f"Error creating timeline lesson: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to create timeline lesson"
        )


async def generate_timeline_lesson_background(lesson_id: str, request: CreateTimelineLessonRequest):
    """Background task for generating timeline lesson content"""
    try:
        # Update progress
        progress = generation_progress_store.get(lesson_id)
        if progress:
            progress.status = "generating"
            progress.current_step = "Generating lesson structure..."
            progress.progress = 10.0
        
        # Update lesson status
        lesson = await TimelineLesson.get(ObjectId(lesson_id))
        if lesson:
            await lesson.update({"$set": {
                "generation_status": "generating",
                "generation_progress": 10.0
            }})
        
        # Generate the timeline lesson
        generated_lesson = await timeline_ollama_service.generate_timeline_lesson(request)
        
        if not generated_lesson:
            raise Exception("Failed to generate timeline lesson content")
        
        # Update progress
        if progress:
            progress.progress = 60.0
            progress.current_step = "Processing visual elements..."
            progress.total_segments = len(generated_lesson.segments)
        
        # Update the lesson with generated content
        if lesson:
            await lesson.update({"$set": {
                "title": generated_lesson.title,
                "total_duration": generated_lesson.total_duration,
                "segments": [segment.dict() for segment in generated_lesson.segments],
                "visual_library": {k: v.dict() for k, v in generated_lesson.visual_library.items()},
                "generation_status": "completed",
                "generation_progress": 100.0,
                "updated_at": datetime.utcnow()
            }})
        
        # Final progress update
        if progress:
            progress.status = "completed"
            progress.progress = 100.0
            progress.current_step = "Generation completed"
            progress.segments_completed = len(generated_lesson.segments)
        
        logger.info(f"Successfully generated timeline lesson {lesson_id}")
        
    except Exception as e:
        logger.error(f"Error in background lesson generation: {e}", exc_info=True)
        
        # Update progress with error
        progress = generation_progress_store.get(lesson_id)
        if progress:
            progress.status = "failed"
            progress.error_message = str(e)
        
        # Update lesson status
        lesson = await TimelineLesson.get(ObjectId(lesson_id))
        if lesson:
            await lesson.update({"$set": {
                "generation_status": "failed",
                "updated_at": datetime.utcnow()
            }})


@router.get("/timeline-lesson/{lesson_id}/progress")
async def get_generation_progress(lesson_id: str):
    """Get real-time generation progress for a lesson"""
    try:
        progress = generation_progress_store.get(lesson_id)
        if not progress:
            # Check if lesson exists and get its status
            if ObjectId.is_valid(lesson_id):
                lesson = await TimelineLesson.get(ObjectId(lesson_id))
                if lesson:
                    return {
                        "lesson_id": lesson_id,
                        "status": lesson.generation_status,
                        "progress": lesson.generation_progress,
                        "current_step": f"Status: {lesson.generation_status}",
                    }
            
            raise HTTPException(status_code=404, detail="Progress not found")
        
        return progress.dict()
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting generation progress: {e}")
        raise HTTPException(status_code=500, detail="Failed to get progress")


@router.get("/timeline-lessons", response_model=List[TimelineLessonResponse])
async def get_timeline_lessons(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None, description="Filter by generation status")
):
    """Get all timeline lessons with pagination and filtering"""
    try:
        query = {}
        if status:
            query["generation_status"] = status
        
        lessons = await TimelineLesson.find(query).skip(offset).limit(limit).sort(-TimelineLesson.created_at).to_list()
        
        return [
            TimelineLessonResponse(
                id=str(lesson.id),
                topic=lesson.topic,
                title=lesson.title,
                difficulty_level=lesson.difficulty_level,
                total_duration=lesson.total_duration,
                segments=lesson.segments,
                visual_library=lesson.visual_library,
                created_at=lesson.created_at,
                updated_at=lesson.updated_at,
                generation_status=lesson.generation_status,
                generation_progress=lesson.generation_progress,
                legacy_lesson_id=lesson.legacy_lesson_id
            )
            for lesson in lessons
        ]
        
    except Exception as e:
        logger.error(f"Error fetching timeline lessons: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch timeline lessons"
        )


@router.get("/timeline-lesson/{lesson_id}", response_model=TimelineLessonResponse)
async def get_timeline_lesson(lesson_id: str):
    """Get a specific timeline lesson by ID"""
    try:
        if not ObjectId.is_valid(lesson_id):
            raise HTTPException(status_code=400, detail="Invalid lesson ID")
        
        lesson = await TimelineLesson.get(ObjectId(lesson_id))
        
        if not lesson:
            raise HTTPException(status_code=404, detail="Timeline lesson not found")
        
        return TimelineLessonResponse(
            id=str(lesson.id),
            topic=lesson.topic,
            title=lesson.title,
            difficulty_level=lesson.difficulty_level,
            total_duration=lesson.total_duration,
            segments=lesson.segments,
            visual_library=lesson.visual_library,
            created_at=lesson.created_at,
            updated_at=lesson.updated_at,
            generation_status=lesson.generation_status,
            generation_progress=lesson.generation_progress,
            legacy_lesson_id=lesson.legacy_lesson_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching timeline lesson: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch timeline lesson"
        )


@router.get("/timeline-lesson/{lesson_id}/segment/{time}")
async def get_segment_at_time(lesson_id: str, time: float):
    """Get the timeline segment active at a specific time"""
    try:
        if not ObjectId.is_valid(lesson_id):
            raise HTTPException(status_code=400, detail="Invalid lesson ID")
        
        lesson = await TimelineLesson.get(ObjectId(lesson_id))
        if not lesson:
            raise HTTPException(status_code=404, detail="Timeline lesson not found")
        
        segment = lesson.get_segment_at_time(time)
        if not segment:
            raise HTTPException(status_code=404, detail=f"No segment found at time {time}")
        
        return {
            "segment": segment.dict(),
            "lesson_id": lesson_id,
            "time": time
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting segment at time: {e}")
        raise HTTPException(status_code=500, detail="Failed to get segment")


@router.get("/timeline-lesson/{lesson_id}/elements/{time}")
async def get_elements_at_time(lesson_id: str, time: float):
    """Get all visual elements that should be visible at a specific time"""
    try:
        if not ObjectId.is_valid(lesson_id):
            raise HTTPException(status_code=400, detail="Invalid lesson ID")
        
        lesson = await TimelineLesson.get(ObjectId(lesson_id))
        if not lesson:
            raise HTTPException(status_code=404, detail="Timeline lesson not found")
        
        elements = lesson.get_active_elements_at_time(time)
        
        return {
            "elements": [element.dict() for element in elements],
            "lesson_id": lesson_id,
            "time": time,
            "count": len(elements)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting elements at time: {e}")
        raise HTTPException(status_code=500, detail="Failed to get elements")


@router.put("/timeline-lesson/{lesson_id}", response_model=TimelineLessonResponse)
async def update_timeline_lesson(lesson_id: str, request: UpdateTimelineLessonRequest):
    """Update a timeline lesson"""
    try:
        lesson_obj_id = ErrorHandler.validate_object_id(lesson_id, "timeline lesson")
        lesson = await TimelineLesson.get(lesson_obj_id)
        
        if not lesson:
            raise ErrorHandler.handle_not_found("Timeline lesson", lesson_id)
        
        # Update fields
        update_data = {}
        if request.title is not None:
            update_data["title"] = request.title
        if request.difficulty_level is not None:
            update_data["difficulty_level"] = request.difficulty_level
        if request.segments is not None:
            update_data["segments"] = [segment.dict() for segment in request.segments]
        if request.visual_library is not None:
            update_data["visual_library"] = {k: v.dict() for k, v in request.visual_library.items()}
        
        if update_data:
            update_data["updated_at"] = datetime.utcnow()
            await lesson.update({"$set": update_data})
            
            # Refresh lesson from database
            lesson = await TimelineLesson.get(lesson_obj_id)
        
        return TimelineLessonResponse(
            id=str(lesson.id),
            topic=lesson.topic,
            title=lesson.title,
            difficulty_level=lesson.difficulty_level,
            total_duration=lesson.total_duration,
            segments=lesson.segments,
            visual_library=lesson.visual_library,
            created_at=lesson.created_at,
            updated_at=lesson.updated_at,
            generation_status=lesson.generation_status,
            generation_progress=lesson.generation_progress,
            legacy_lesson_id=lesson.legacy_lesson_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise ErrorHandler.handle_service_error("update timeline lesson", e)


@router.delete("/timeline-lesson/{lesson_id}")
async def delete_timeline_lesson(lesson_id: str):
    """Delete a timeline lesson"""
    try:
        lesson_obj_id = ErrorHandler.validate_object_id(lesson_id, "timeline lesson")
        lesson = await TimelineLesson.get(lesson_obj_id)
        
        if not lesson:
            raise ErrorHandler.handle_not_found("Timeline lesson", lesson_id)
        
        await lesson.delete()
        
        # Clean up progress tracking
        if lesson_id in generation_progress_store:
            del generation_progress_store[lesson_id]
        
        return {"message": "Timeline lesson deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise ErrorHandler.handle_service_error("delete timeline lesson", e)


@router.post("/timeline-lesson/{lesson_id}/regenerate-segment/{segment_index}")
async def regenerate_timeline_segment(lesson_id: str, segment_index: int):
    """Regenerate a specific segment of the timeline lesson"""
    try:
        lesson_obj_id = ErrorHandler.validate_object_id(lesson_id, "timeline lesson")
        lesson = await TimelineLesson.get(lesson_obj_id)
        
        if not lesson:
            raise ErrorHandler.handle_not_found("Timeline lesson", lesson_id)
        
        if segment_index < 0 or segment_index >= len(lesson.segments):
            raise HTTPException(status_code=400, detail="Invalid segment index")
        
        # Regenerate the segment
        new_segment = await timeline_ollama_service.regenerate_segment(lesson, segment_index)
        
        if not new_segment:
            raise HTTPException(status_code=500, detail="Failed to regenerate segment")
        
        # Update the lesson
        lesson.segments[segment_index] = new_segment
        await lesson.update({"$set": {
            "segments": [segment.dict() for segment in lesson.segments],
            "updated_at": datetime.utcnow()
        }})
        
        return {
            "message": "Segment regenerated successfully",
            "segment_index": segment_index,
            "segment": new_segment.dict()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error regenerating segment: {e}")
        raise HTTPException(status_code=500, detail="Failed to regenerate segment")


@router.post("/timeline-lesson/{lesson_id}/generate-tts")
async def generate_timeline_lesson_tts(lesson_id: str, voice: Optional[str] = None):
    """Generate TTS audio for all segments in a timeline lesson"""
    try:
        if not TTS_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="TTS service is not available"
            )
        
        lesson_obj_id = ErrorHandler.validate_object_id(lesson_id, "timeline lesson")
        lesson = await TimelineLesson.get(lesson_obj_id)
        
        if not lesson:
            raise ErrorHandler.handle_not_found("Timeline lesson", lesson_id)
        
        if not lesson.segments:
            raise HTTPException(status_code=400, detail="Lesson has no segments to generate TTS for")
        
        logger.info(f"Generating TTS for {len(lesson.segments)} segments in lesson {lesson_id}")
        
        # Generate TTS for each segment
        updated_segments = []
        successful_generations = 0
        
        for i, segment in enumerate(lesson.segments):
            if not segment.narration:
                # Skip segments without narration
                logger.warning(f"Segment {i} has no narration, skipping TTS generation")
                updated_segments.append(segment)
                continue
            
            try:
                logger.info(f"Generating TTS for segment {i}: '{segment.title}'")
                
                # Generate TTS audio
                audio_id = await piper_tts_service.generate_audio(segment.narration, voice)
                
                if audio_id:
                    # Update segment with TTS metadata
                    audio_url = piper_tts_service._get_audio_url(audio_id)
                    segment.audio_id = audio_id
                    segment.audio_url = audio_url
                    segment.tts_voice = voice or piper_tts_service.default_voice
                    segment.tts_generated = True
                    segment.tts_error = None
                    successful_generations += 1
                    logger.info(f"Successfully generated TTS for segment {i}")
                else:
                    # Mark as failed
                    segment.tts_generated = False
                    segment.tts_error = "Failed to generate TTS audio"
                    logger.error(f"Failed to generate TTS for segment {i}")
                
                updated_segments.append(segment)
                
            except Exception as e:
                # Mark as failed with error
                segment.tts_generated = False
                segment.tts_error = str(e)
                updated_segments.append(segment)
                logger.error(f"Error generating TTS for segment {i}: {e}")
        
        # Update lesson with TTS metadata
        await lesson.update({"$set": {
            "segments": [segment.dict() for segment in updated_segments],
            "updated_at": datetime.utcnow()
        }})
        
        logger.info(f"TTS generation completed: {successful_generations}/{len(lesson.segments)} segments successful")
        
        return {
            "message": "TTS generation completed",
            "lesson_id": lesson_id,
            "segments_with_tts": successful_generations,
            "total_segments": len(updated_segments),
            "success_rate": f"{successful_generations}/{len(updated_segments)}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating timeline lesson TTS: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate timeline lesson TTS"
        )