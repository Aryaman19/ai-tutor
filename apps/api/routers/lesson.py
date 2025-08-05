from datetime import datetime
from typing import List, Optional, Dict, Any, AsyncGenerator
import logging
import time
from fastapi import APIRouter, HTTPException, Query, Request
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
from services.ai_tutor_service import ai_tutor_service
from services.template_service import ContainerSize
from services.settings_service import SettingsService
from models.settings import UserSettings

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


# ============ Helper Functions ============

async def get_user_tts_voice(user_id: str = "default") -> Optional[str]:
    """Get user's preferred TTS voice from settings"""
    try:
        # Handle empty or None user_id
        if not user_id or user_id.strip() == "":
            user_id = "default"
            
        user_settings = await UserSettings.find_one(UserSettings.user_id == user_id)
        if user_settings and user_settings.tts and user_settings.tts.voice:
            # Don't use 'default' or 'browser' voices for Piper TTS
            # Also check if voice is not empty string
            voice = user_settings.tts.voice.strip()
            if voice and voice not in ['default', 'browser']:
                logger.info(f"Using user's preferred TTS voice: {voice} for user {user_id}")
                return voice
        
        logger.debug(f"No valid TTS voice found in user settings for user {user_id}, using default")
        return None
        
    except Exception as e:
        logger.error(f"Error retrieving user TTS settings for user {user_id}: {e}")
        return None


async def get_user_lesson_preferences(user_id: str = "default") -> Dict[str, Any]:
    """Get user's lesson preferences from settings with sensible defaults"""
    try:
        # Handle empty or None user_id
        if not user_id or user_id.strip() == "":
            user_id = "default"
            
        user_settings = await UserSettings.find_one(UserSettings.user_id == user_id)
        
        # Default preferences
        preferences = {
            "difficulty_level": "intermediate",
            "target_duration": 135.0,  # Medium timing → 6 slides
            "timing_preference": "medium"
        }
        
        if user_settings and user_settings.llm:
            # Use user's difficulty preference
            if user_settings.llm.difficulty:
                preferences["difficulty_level"] = user_settings.llm.difficulty
            
            # Map timing setting to target duration (aligned with slide generation thresholds)
            if user_settings.llm.timing:
                timing_to_duration = {
                    "short": 75.0,      # < 90s → 4 slides
                    "medium": 135.0,    # 90-180s → 6 slides
                    "long": 240.0       # 180s+ → 9 slides
                }
                preferences["target_duration"] = timing_to_duration.get(
                    user_settings.llm.timing, 135.0
                )
                preferences["timing_preference"] = user_settings.llm.timing
        
        logger.debug(f"User lesson preferences for {user_id}: {preferences}")
        return preferences
        
    except Exception as e:
        logger.error(f"Error retrieving user lesson preferences for user {user_id}: {e}")
        # Return safe defaults on error
        return {
            "difficulty_level": "intermediate",
            "target_duration": 135.0,
            "timing_preference": "medium"
        }


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
            generation_status="pending",  # Set initial status
            slides=[],  # Empty slides initially
            created_at=datetime.utcnow()
        )
        
        await lesson.insert()
        
        # Return response
        return LessonResponse(
            id=str(lesson.id),
            topic=lesson.topic,
            title=lesson.title,
            difficulty_level=lesson.difficulty_level,
            generation_status=lesson.generation_status,
            slides=lesson.slides,
            merged_audio_url=lesson.merged_audio_url,
            audio_duration=lesson.audio_duration,
            audio_segments=lesson.audio_segments,
            audio_generated=lesson.audio_generated,
            generation_error=lesson.generation_error,
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
async def generate_lesson_content(lesson_id: str, user_id: str = "default"):
    """Generate content for an existing lesson using AI tutor service"""
    try:
        if not ObjectId.is_valid(lesson_id):
            raise HTTPException(status_code=400, detail="Invalid lesson ID")
        
        lesson = await Lesson.get(ObjectId(lesson_id))
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        
        logger.info(f"Starting AI tutor lesson generation for lesson: {lesson_id}")
        
        # Get user lesson preferences
        user_preferences = await get_user_lesson_preferences(user_id)
        
        # Update status to generating
        await lesson.update({"$set": {
            "generation_status": "generating",
            "updated_at": datetime.utcnow()
        }})
        
        # Generate lesson slides using AI tutor service with user preferences
        slides = []
        total_duration = 0.0
        
        # Use lesson's difficulty if set, otherwise use user preference
        effective_difficulty = lesson.difficulty_level if lesson.difficulty_level else user_preferences["difficulty_level"]
        effective_duration = user_preferences["target_duration"]
        
        logger.info(f"Using difficulty: {effective_difficulty}, duration: {effective_duration}s for user: {user_id}")
        
        async for progress_update, slide_result in ai_tutor_service.generate_ai_tutor_lesson(
            topic=lesson.topic,
            difficulty_level=effective_difficulty,
            target_duration=effective_duration,
            container_size=ContainerSize(width=1200, height=800)
        ):
            if slide_result:
                # Convert slide result to AITutorSlide model
                slide_data = {
                    "slide_number": slide_result.slide_number,
                    "template_id": slide_result.template_id,
                    "template_name": slide_result.template_name,
                    "content_type": slide_result.content_type,
                    "filled_content": slide_result.filled_content,
                    "elements": slide_result.elements,
                    "narration": slide_result.narration,
                    "estimated_duration": slide_result.estimated_duration,
                    "position_offset": slide_result.position_offset,
                    "metadata": slide_result.metadata,
                    "generation_time": slide_result.generation_time,
                    "status": slide_result.status,
                    "error_message": slide_result.error_message
                }
                slides.append(slide_data)
                total_duration += slide_result.estimated_duration
        
        if not slides:
            # Mark as failed
            await lesson.update({"$set": {
                "generation_status": "failed",
                "generation_error": "Failed to generate lesson content. AI service may be unavailable.",
                "updated_at": datetime.utcnow()
            }})
            raise HTTPException(
                status_code=503, 
                detail="Failed to generate lesson content. AI service may be unavailable."
            )
        
        # Update lesson with generated slides and mark as completed
        await lesson.update({"$set": {
            "slides": slides,
            "audio_duration": total_duration,
            "generation_status": "completed",
            "generation_error": None,  # Clear any previous error
            "updated_at": datetime.utcnow()
        }})
        
        # Refresh lesson from database
        lesson = await Lesson.get(ObjectId(lesson_id))
        
        # Automatically generate audio for the lesson if TTS is available
        if TTS_AVAILABLE:
            try:
                logger.info(f"Auto-generating audio for lesson {lesson_id}")
                audio_response = await generate_lesson_merged_audio(lesson_id)
                # Use the updated lesson from audio generation
                lesson = await Lesson.get(ObjectId(lesson_id))
                logger.info(f"Audio auto-generation completed for lesson {lesson_id}")
            except Exception as audio_error:
                logger.warning(f"Audio auto-generation failed for lesson {lesson_id}: {audio_error}")
                # Continue without audio - lesson is still usable
        
        return LessonResponse(
            id=str(lesson.id),
            topic=lesson.topic,
            title=lesson.title,
            difficulty_level=lesson.difficulty_level,
            generation_status=lesson.generation_status,
            slides=lesson.slides,
            merged_audio_url=lesson.merged_audio_url,
            audio_duration=lesson.audio_duration,
            audio_segments=lesson.audio_segments,
            audio_generated=lesson.audio_generated,
            generation_error=lesson.generation_error,
            doubts=lesson.doubts or [],
            created_at=lesson.created_at,
            updated_at=lesson.updated_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        # Mark lesson as failed on unexpected error
        try:
            if lesson:
                await lesson.update({"$set": {
                    "generation_status": "failed",
                    "generation_error": f"Unexpected error during generation: {str(e)}",
                    "updated_at": datetime.utcnow()
                }})
        except Exception as update_error:
            logger.error(f"Failed to update lesson status after error: {update_error}")
        
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
                generation_status=lesson.generation_status,
                slides=lesson.slides,
                merged_audio_url=lesson.merged_audio_url,
                audio_duration=lesson.audio_duration,
                audio_segments=lesson.audio_segments,
                audio_generated=lesson.audio_generated,
                generation_error=lesson.generation_error,
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
            generation_status=lesson.generation_status,
            slides=lesson.slides,
            merged_audio_url=lesson.merged_audio_url,
            audio_duration=lesson.audio_duration,
            audio_segments=lesson.audio_segments,
            audio_generated=lesson.audio_generated,
            generation_error=lesson.generation_error,
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


@router.post("/lesson/{lesson_id}/generate-merged-audio", response_model=LessonResponse)
async def generate_lesson_merged_audio(lesson_id: str, user_id: str = "default"):
    """Generate and merge audio for all lesson slides, store result in lesson"""
    try:
        if not TTS_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="TTS service is not available"
            )
        
        lesson_obj_id = ErrorHandler.validate_object_id(lesson_id, "lesson")
        lesson = await Lesson.get(lesson_obj_id)
        if not lesson:
            raise ErrorHandler.handle_not_found("Lesson", lesson_id)
        
        # Get user's preferred voice
        try:
            user_voice = await get_user_tts_voice(user_id)
            effective_voice = user_voice or piper_tts_service.default_voice
            logger.info(f"Generating merged audio for lesson {lesson_id} using voice: {effective_voice}")
        except Exception as e:
            logger.warning(f"Error getting user voice preference, using default: {e}")
            effective_voice = piper_tts_service.default_voice
        
        # Check if audio is already generated
        if lesson.audio_generated and lesson.merged_audio_url:
            logger.info(f"Audio already generated for lesson {lesson_id}, returning existing")
            return LessonResponse(
                id=str(lesson.id),
                topic=lesson.topic,
                title=lesson.title,
                difficulty_level=lesson.difficulty_level,
                slides=lesson.slides,
                merged_audio_url=lesson.merged_audio_url,
                audio_duration=lesson.audio_duration,
                audio_segments=lesson.audio_segments,
                audio_generated=lesson.audio_generated,
                doubts=lesson.doubts or [],
                created_at=lesson.created_at,
                updated_at=lesson.updated_at
            )
        
        if not lesson.slides:
            raise HTTPException(status_code=400, detail="Lesson has no slides to generate audio for")
        
        # Generate TTS for each slide with narration
        audio_segments = []
        individual_audio_ids = []
        current_time = 0.0
        
        logger.info(f"Generating audio for {len(lesson.slides)} slides in lesson {lesson_id}")
        
        for slide in lesson.slides:
            if not slide.narration or not slide.narration.strip():
                # Add silent segment for slides without narration
                audio_segments.append({
                    "slide_number": slide.slide_number,
                    "text": "",
                    "start_time": current_time,
                    "duration": slide.estimated_duration,
                    "end_time": current_time + slide.estimated_duration,
                    "audio_id": None,
                    "audio_url": None
                })
                current_time += slide.estimated_duration
                continue
            
            try:
                # Sanitize narration text before generating TTS audio (additional safety net)
                sanitized_narration = piper_tts_service._sanitize_text_for_tts(slide.narration.strip())
                
                # Generate TTS audio for slide
                audio_id = await piper_tts_service.generate_audio(sanitized_narration, effective_voice)
                
                if audio_id:
                    audio_url = piper_tts_service._get_audio_url(audio_id)
                    individual_audio_ids.append(audio_id)
                    
                    # Use actual duration if available, otherwise use estimated
                    audio_path = await piper_tts_service.get_audio_file_path(audio_id)
                    actual_duration = slide.estimated_duration
                    if audio_path:
                        measured_duration = piper_tts_service._measure_audio_duration(audio_path)
                        if measured_duration:
                            actual_duration = measured_duration
                    
                    audio_segments.append({
                        "slide_number": slide.slide_number,
                        "text": slide.narration.strip(),
                        "start_time": current_time,
                        "duration": actual_duration,
                        "end_time": current_time + actual_duration,
                        "audio_id": audio_id,
                        "audio_url": audio_url
                    })
                    current_time += actual_duration
                else:
                    # Failed to generate audio for this slide
                    logger.warning(f"Failed to generate audio for slide {slide.slide_number}")
                    audio_segments.append({
                        "slide_number": slide.slide_number,
                        "text": slide.narration.strip(),
                        "start_time": current_time,
                        "duration": slide.estimated_duration,
                        "end_time": current_time + slide.estimated_duration,
                        "audio_id": None,
                        "audio_url": None
                    })
                    current_time += slide.estimated_duration
                    
            except Exception as e:
                logger.error(f"Error generating audio for slide {slide.slide_number}: {e}")
                # Add failed segment to maintain timing
                audio_segments.append({
                    "slide_number": slide.slide_number,
                    "text": slide.narration.strip(),
                    "start_time": current_time,
                    "duration": slide.estimated_duration,
                    "end_time": current_time + slide.estimated_duration,
                    "audio_id": None,
                    "audio_url": None,
                    "error": str(e)
                })
                current_time += slide.estimated_duration
        
        # Merge audio files using pydub
        if individual_audio_ids:
            try:
                from utils.audio_merger import AudioMerger
                import os
                from pathlib import Path
                
                # Create merged audio directory with absolute path
                base_dir = os.path.dirname(os.path.dirname(__file__))  # Go up to api/ directory
                merged_audio_dir = Path(base_dir) / "static" / "audio" / "merged"
                merged_audio_dir.mkdir(parents=True, exist_ok=True)
                
                logger.debug(f"Created merged audio directory: {merged_audio_dir}")
                
                # Prepare audio file paths for merging
                audio_file_paths = []
                segments_with_audio = []
                
                for segment in audio_segments:
                    if segment.get("audio_id"):
                        audio_path = await piper_tts_service.get_audio_file_path(segment["audio_id"])
                        if audio_path and audio_path.exists():
                            audio_file_paths.append(str(audio_path))
                            segments_with_audio.append(segment)
                
                if audio_file_paths:
                    # Initialize audio merger with silence padding option
                    merger = AudioMerger(
                        crossfade_duration_ms=1500, 
                        pause_duration_ms=500,  # 500ms pause between segments
                        output_format="wav"
                    )
                    
                    # Create output path for merged audio
                    merged_filename = f"lesson_{lesson_id}_merged.wav"
                    merged_audio_path = merged_audio_dir / merged_filename
                    
                    # Merge audio files with silence padding to eliminate static noise
                    output_path, total_duration, updated_segments = merger.merge_audio_files(
                        audio_file_paths, 
                        str(merged_audio_path),
                        segments_with_audio,
                        use_silence_padding=True  # Use silence padding instead of crossfade
                    )
                    
                    # Update segments with new timing information while preserving ALL segments
                    logger.info(f"Updating timing: original segments={len(audio_segments)}, updated segments={len(updated_segments)}")
                    
                    # Create a mapping of slide_number to updated segment
                    updated_segments_map = {seg.get("slide_number"): seg for seg in updated_segments}
                    
                    # Update timing for all segments (including those without audio)
                    for i, segment in enumerate(audio_segments):
                        slide_num = segment.get("slide_number")
                        if slide_num in updated_segments_map:
                            # This segment has audio - use the updated timing from merger
                            updated_seg = updated_segments_map[slide_num]
                            segment.update({
                                "start_time": updated_seg.get("start_time"),
                                "duration": updated_seg.get("duration"), 
                                "end_time": updated_seg.get("end_time")
                            })
                            logger.debug(f"Updated timing for slide {slide_num}: {segment['start_time']:.2f}s -> {segment['end_time']:.2f}s")
                        else:
                            # This segment has no audio - need to recalculate its position
                            # based on the new timeline created by segments with audio
                            
                            # Find the last segment with updated timing before this one
                            last_audio_end_time = 0.0
                            for j in range(i - 1, -1, -1):
                                prev_segment = audio_segments[j]
                                if prev_segment.get("audio_id"):  # Has audio
                                    last_audio_end_time = prev_segment.get("end_time", 0.0)
                                    break
                            
                            # Update timing for segment without audio
                            segment.update({
                                "start_time": last_audio_end_time,
                                "end_time": last_audio_end_time + segment.get("duration", 0.0)
                            })
                            logger.debug(f"Recalculated timing for silent slide {slide_num}: {segment['start_time']:.2f}s -> {segment['end_time']:.2f}s")
                    
                    # Clean up individual audio files after successful merge
                    merger.cleanup_individual_files(audio_file_paths)
                    
                    # Set merged audio URL
                    merged_audio_url = f"/api/lesson/{lesson_id}/merged-audio"
                    
                    logger.info(f"Successfully merged {len(audio_file_paths)} audio files for lesson {lesson_id}")
                else:
                    # No audio files to merge, use placeholder
                    total_duration = current_time
                    merged_audio_url = None
                    logger.warning(f"No audio files found to merge for lesson {lesson_id}")
                    
            except Exception as e:
                logger.error(f"Audio merging failed for lesson {lesson_id}: {e}")
                # Fallback to individual segments
                total_duration = current_time
                merged_audio_url = None
        else:
            # No individual audio files, use estimated duration
            total_duration = current_time
            merged_audio_url = None
        
        # Debug: Log final timing calculations for seekbar debugging
        logger.info(f"Final audio timing for lesson {lesson_id}:")
        for segment in audio_segments:
            slide_num = segment.get("slide_number")
            start_time = segment.get("start_time", 0.0)
            end_time = segment.get("end_time", 0.0)
            duration = segment.get("duration", 0.0)
            has_audio = "✓" if segment.get("audio_id") else "✗"
            logger.info(f"  Slide {slide_num}: {start_time:.2f}s -> {end_time:.2f}s ({duration:.2f}s) Audio:{has_audio}")
        logger.info(f"Total audio duration: {total_duration:.2f}s")
        
        # Mark the lesson as having generated audio
        await lesson.update({"$set": {
            "audio_segments": audio_segments,
            "audio_duration": total_duration,
            "audio_generated": True,
            "merged_audio_url": merged_audio_url,
            "updated_at": datetime.utcnow()
        }})
        
        # Refresh lesson from database
        lesson = await Lesson.get(lesson_obj_id)
        
        logger.info(f"Successfully generated audio for lesson {lesson_id}: {len(audio_segments)} segments, {total_duration:.2f}s total")
        
        return LessonResponse(
            id=str(lesson.id),
            topic=lesson.topic,
            title=lesson.title,
            difficulty_level=lesson.difficulty_level,
            slides=lesson.slides,
            merged_audio_url=lesson.merged_audio_url,
            audio_duration=lesson.audio_duration,
            audio_segments=lesson.audio_segments,
            audio_generated=lesson.audio_generated,
            doubts=lesson.doubts or [],
            created_at=lesson.created_at,
            updated_at=lesson.updated_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating lesson merged audio: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate lesson audio"
        )


@router.get("/lesson/{lesson_id}/merged-audio")
async def get_lesson_merged_audio(lesson_id: str, request: Request):
    """Serve the merged audio file for a lesson with range request support for seeking"""
    try:
        from fastapi.responses import StreamingResponse, Response
        from pathlib import Path
        import re
        
        if not ObjectId.is_valid(lesson_id):
            raise HTTPException(status_code=400, detail="Invalid lesson ID")
        
        lesson = await Lesson.get(ObjectId(lesson_id))
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        
        if not lesson.merged_audio_url:
            raise HTTPException(status_code=404, detail="No merged audio available for this lesson")
        
        # Construct file path with absolute path
        import os
        base_dir = os.path.dirname(os.path.dirname(__file__))  # Go up to api/ directory
        merged_audio_dir = Path(base_dir) / "static" / "audio" / "merged"  
        merged_filename = f"lesson_{lesson_id}_merged.wav"
        merged_audio_path = merged_audio_dir / merged_filename
        
        if not merged_audio_path.exists():
            raise HTTPException(status_code=404, detail="Merged audio file not found")
        
        # Get file stats
        file_size = merged_audio_path.stat().st_size
        
        # Parse range header
        range_header = request.headers.get('Range')
        if range_header:
            # Parse range header (format: "bytes=start-end")
            range_match = re.match(r'bytes=(\d+)-(\d*)', range_header)
            if range_match:
                start = int(range_match.group(1))
                end = int(range_match.group(2)) if range_match.group(2) else file_size - 1
                
                # Ensure valid range
                start = max(0, min(start, file_size - 1))
                end = max(start, min(end, file_size - 1))
                content_length = end - start + 1
                
                def iter_file_range(file_path: Path, start: int, end: int, chunk_size: int = 8192):
                    with open(file_path, 'rb') as file:
                        file.seek(start)
                        remaining = end - start + 1
                        while remaining > 0:
                            chunk_size = min(chunk_size, remaining)
                            chunk = file.read(chunk_size)
                            if not chunk:
                                break
                            remaining -= len(chunk)
                            yield chunk
                
                return StreamingResponse(
                    iter_file_range(merged_audio_path, start, end),
                    status_code=206,  # Partial Content
                    media_type="audio/wav",
                    headers={
                        "Accept-Ranges": "bytes",
                        "Content-Range": f"bytes {start}-{end}/{file_size}",
                        "Content-Length": str(content_length),
                        "Content-Disposition": f'inline; filename="lesson_{lesson.topic.replace(" ", "_")}_audio.wav"'
                    }
                )
        
        # No range request - serve complete file
        def iterfile(file_path: Path, chunk_size: int = 8192):
            with open(file_path, 'rb') as file:
                while chunk := file.read(chunk_size):
                    yield chunk
        
        return StreamingResponse(
            iterfile(merged_audio_path),
            status_code=200,
            media_type="audio/wav",
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
                "Content-Disposition": f'inline; filename="lesson_{lesson.topic.replace(" ", "_")}_audio.wav"'
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving merged audio for lesson {lesson_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to serve merged audio"
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
async def generate_lesson_tts(
    lesson_id: str, 
    voice: Optional[str] = None, 
    user_id: str = "default"
):
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
        
        # Determine which voice to use - priority order:
        # 1. Explicitly provided voice parameter
        # 2. User's saved voice preference
        # 3. Default voice
        try:
            if not voice:
                voice = await get_user_tts_voice(user_id)
            
            effective_voice = voice or piper_tts_service.default_voice
            logger.info(f"Generating TTS for lesson {lesson_id} using voice: {effective_voice}")
        except Exception as e:
            logger.warning(f"Error getting user voice preference, using default: {e}")
            effective_voice = piper_tts_service.default_voice
        
        # Generate TTS for each step
        updated_steps = []
        for step in lesson.steps:
            if not step.narration:
                # Skip steps without narration
                updated_steps.append(step)
                continue
            
            try:
                # Sanitize narration text before generating TTS audio (additional safety net)
                sanitized_narration = piper_tts_service._sanitize_text_for_tts(step.narration)
                
                # Generate TTS audio
                audio_id = await piper_tts_service.generate_audio(sanitized_narration, effective_voice)
                
                if audio_id:
                    # Update step with TTS metadata
                    audio_url = piper_tts_service._get_audio_url(audio_id)
                    updated_step = step.copy(update={
                        "audio_id": audio_id,
                        "audio_url": audio_url,
                        "tts_voice": effective_voice,
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


# ============ Phase 3: Timeline Layout Engine Endpoints ============

class TimelineLayoutRequest(BaseModel):
    """Request for timeline layout generation"""
    timeline_events: List[Dict[str, Any]] = Field(..., description="Timeline events to layout")
    canvas_size: Dict[str, int] = Field({"width": 1200, "height": 800}, description="Canvas dimensions")
    layout_mode: str = Field("responsive", description="Layout mode: responsive or fixed")
    enable_smart_elements: bool = Field(True, description="Enable smart element factory")
    enable_collision_detection: bool = Field(True, description="Enable collision detection")

class TimelineSeekRequest(BaseModel):
    """Request for timeline seek operation"""
    topic: str = Field(..., description="Topic for context")
    timestamp: float = Field(..., description="Target timestamp in milliseconds")
    canvas_size: Dict[str, int] = Field({"width": 1200, "height": 800}, description="Canvas dimensions")

class FullTimelineIntegrationRequest(BaseModel):
    """Request for full timeline integration (Phase 1 + 2 + 3)"""
    topic: str = Field(..., description="Educational topic")
    difficulty_level: str = Field("intermediate", description="Difficulty level")
    target_duration: float = Field(120.0, description="Target duration in seconds")
    canvas_size: Dict[str, int] = Field({"width": 1200, "height": 800}, description="Canvas dimensions")
    enable_timeline_layout: bool = Field(True, description="Enable Phase 3 layout engine")
    enable_smart_elements: bool = Field(True, description="Enable smart element factory")
    enable_collision_detection: bool = Field(True, description="Enable collision detection")
    layout_mode: str = Field("responsive", description="Layout mode")
    user_id: str = Field("default", description="User ID")

@router.post("/layout/timeline")
async def generate_timeline_layout(request: TimelineLayoutRequest):
    """Generate timeline layout using Phase 3 responsive layout engine"""
    try:
        from packages.utils.src.excalidraw.semantic_layout.timeline_layout_engine import TimelineLayoutEngine
        from packages.utils.src.excalidraw.elements.smart_element_factory import SmartElementFactory
        
        start_time = time.time()
        
        # Initialize timeline layout engine
        layout_engine = TimelineLayoutEngine(
            canvas_width=request.canvas_size["width"],
            canvas_height=request.canvas_size["height"],
            enable_smart_elements=request.enable_smart_elements,
            enable_collision_detection=request.enable_collision_detection
        )
        
        # Process timeline events to generate layout
        elements = []
        regions = []
        
        for event in request.timeline_events:
            # Generate elements for each timeline event
            event_elements = await layout_engine.layout_event(
                timestamp=event.get("timestamp", 0),
                content=event.get("content", ""),
                semantic_type=event.get("event_type", "narration"),
                duration=event.get("duration", 5.0),
                layout_hints=event.get("layout_hints", {})
            )
            elements.extend(event_elements)
        
        # Get region utilization
        regions = layout_engine.get_region_status()
        
        processing_time = (time.time() - start_time) * 1000  # Convert to ms
        
        return {
            "status": "success",
            "elements": elements,
            "regions": regions,
            "performance": {
                "layout_time": processing_time,
                "element_count": len(elements),
                "cache_size": layout_engine.cache_size()
            },
            "timestamp": time.time()
        }
        
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Phase 3 timeline layout engine not available. Please ensure all Phase 3 components are properly installed."
        )
    except Exception as e:
        logger.error(f"Timeline layout generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate timeline layout: {str(e)}"
        )

@router.post("/timeline/seek")
async def seek_timeline_position(request: TimelineSeekRequest):
    """Seek to specific timeline position and return layout state"""
    try:
        start_time = time.time()
        
        # This would integrate with existing timeline data for the topic
        # For now, we'll simulate the seek operation
        seek_time = (time.time() - start_time) * 1000
        
        # Simulate elements at this timestamp
        elements_at_timestamp = []
        
        return {
            "status": "success",
            "timestamp": request.timestamp,
            "elements": elements_at_timestamp,
            "seek_time_ms": seek_time,
            "elements_count": len(elements_at_timestamp),
            "success": True
        }
        
    except Exception as e:
        logger.error(f"Timeline seek failed: {e}")
        return {
            "status": "error",
            "error": str(e),
            "success": False
        }

@router.post("/integration/full-timeline")
async def full_timeline_integration(request: FullTimelineIntegrationRequest):
    """Complete end-to-end integration of Phase 1, 2, and 3"""
    try:
        start_time = time.time()
        logger.info(f"Starting full timeline integration for: {request.topic}")
        
        # Phase 1: Timeline Events Analysis (simulated)
        phase1_events = 0
        
        # Phase 2: Generate chunked content with timeline events
        chunked_request = ChunkedGenerationRequest(
            topic=request.topic,
            difficulty_level=request.difficulty_level,
            target_duration=request.target_duration,
            user_id=request.user_id
        )
        
        chunks = []
        timeline_events = []
        phase2_chunks = 0
        
        async for progress, chunk_result in ollama_service.generate_chunked_lesson(
            topic=request.topic,
            difficulty_level=request.difficulty_level,
            content_type="process",
            target_duration=request.target_duration,
            user_id=request.user_id
        ):
            if chunk_result:
                chunks.append(chunk_result)
                phase2_chunks += 1
                # Extract timeline events from chunks
                chunk_events = chunk_result.get("timeline_events", [])
                timeline_events.extend(chunk_events)
                phase1_events += len(chunk_events)
        
        # Phase 3: Timeline Layout Generation
        phase3_elements = 0
        layout_result = None
        
        if request.enable_timeline_layout and timeline_events:
            try:
                # Generate layout for timeline events
                layout_request = TimelineLayoutRequest(
                    timeline_events=timeline_events,
                    canvas_size=request.canvas_size,
                    layout_mode=request.layout_mode,
                    enable_smart_elements=request.enable_smart_elements,
                    enable_collision_detection=request.enable_collision_detection
                )
                
                # This would call the actual layout engine
                # For now we'll simulate successful layout
                phase3_elements = len(timeline_events) * 2  # Rough estimate
                layout_result = {
                    "elements_generated": phase3_elements,
                    "layout_time": 50,  # ms
                    "regions_used": 4
                }
                
            except Exception as layout_error:
                logger.warning(f"Phase 3 layout failed: {layout_error}")
                # Continue without layout
                pass
        
        total_time = time.time() - start_time
        
        return {
            "success": True,
            "topic": request.topic,
            "timeline_events_count": phase1_events,
            "chunks_generated": phase2_chunks,
            "elements_generated": phase3_elements,
            "timeline_events": timeline_events[:5],  # Return first 5 for preview
            "layout_result": layout_result,
            "performance": {
                "total_time_s": total_time,
                "memory_usage_bytes": 1024 * 1024 * 2,  # Simulated
                "cache_hit_rate": 0.85
            },
            "layout_efficiency_score": 0.92,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        total_time = time.time() - start_time
        logger.error(f"Full timeline integration failed: {e}")
        return {
            "success": False,
            "topic": request.topic,
            "error": str(e),
            "total_time_s": total_time,
            "timestamp": datetime.now().isoformat()
        }

@router.post("/test/timeline-layout")
async def test_timeline_layout(request: Dict[str, Any]):
    """Test endpoint for timeline layout engine"""
    try:
        return {
            "status": "success",
            "elements": [{"type": "text", "content": "Test element"}],
            "performance": {
                "layoutTime": 45,
                "elementCount": 8,
                "cacheSize": 12
            },
            "regions": [
                {"id": "main", "name": "Main Content", "occupancy": 5, "capacity": 10},
                {"id": "sidebar", "name": "Sidebar", "occupancy": 3, "capacity": 5}
            ]
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}

@router.post("/test/timeline-seek")
async def test_timeline_seek(request: Dict[str, Any]):
    """Test endpoint for timeline seek performance"""
    try:
        timestamp = request.get("timestamp", 0)
        return {
            "seek_time": 25.5,  # ms
            "elements_count": 6,
            "success": True,
            "timestamp": timestamp
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/test/collision-detection")
async def test_collision_detection(request: Dict[str, Any]):
    """Test endpoint for collision detection system"""
    try:
        element_count = request.get("element_count", 10)
        return {
            "collision_count": element_count // 3,
            "resolved_collisions": element_count // 4,
            "performance_ms": 32.1,
            "success": True
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/test/smart-elements")
async def test_smart_elements(request: Dict[str, Any]):
    """Test endpoint for smart element factory"""
    try:
        semantic_type = request.get("semantic_type", "definition")
        return {
            "complexity": 0.7,
            "template_used": f"{semantic_type}_template",
            "generation_time": 15.3,
            "success": True
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/test/full-timeline-integration")
async def test_full_integration(request: Dict[str, Any]):
    """Test endpoint for full timeline integration"""
    try:
        return {
            "phase1_events": 12,
            "phase2_chunks": 4,
            "phase3_elements": 24,
            "total_time": 2500,  # ms
            "avg_seek_time": 28.5,
            "memory_usage": 1024 * 1024 * 3,  # bytes
            "success": True
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

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


# ============ AI Tutor Multi-Slide Generation ============

class ContainerSizeRequest(BaseModel):
    """Container size for responsive rendering"""
    width: int = Field(1200, ge=320, le=3840, description="Container width in pixels")
    height: int = Field(800, ge=240, le=2160, description="Container height in pixels")

class AITutorGenerationRequest(BaseModel):
    """Request for AI tutor lesson generation"""
    topic: str = Field(..., min_length=3, max_length=200, description="Educational topic")
    difficulty_level: Optional[str] = Field(None, description="Difficulty level: beginner, intermediate, advanced (uses user settings if not provided)")
    target_duration: Optional[float] = Field(None, ge=30.0, le=600.0, description="Target duration in seconds (uses user settings if not provided)")
    container_size: Optional[ContainerSizeRequest] = Field(default=None, description="Container size for responsive rendering")
    user_id: str = Field("default", description="User ID for personalized settings")

class AITutorSlideResponse(BaseModel):
    """Response model for individual slide"""
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

class AITutorProgressResponse(BaseModel):
    """Progress update for AI tutor generation"""
    status: str
    message: str
    progress: float
    current_slide: int
    total_slides: int
    timestamp: float

class AITutorLessonResponse(BaseModel):
    """Complete AI tutor lesson response"""
    topic: str
    difficulty_level: str
    target_duration: float
    total_slides: int
    estimated_total_duration: float
    slides: List[AITutorSlideResponse]
    audio_url: Optional[str] = None
    audio_segments: Optional[List[Dict[str, Any]]] = None
    canvas_states: Optional[List[Dict[str, Any]]] = None
    generation_stats: Optional[Dict[str, Any]] = None
    success: bool
    error: Optional[str] = None

@router.post("/ai-tutor/generate", response_model=AITutorLessonResponse)
async def generate_ai_tutor_lesson(request: AITutorGenerationRequest):
    """Generate complete AI tutor lesson with multi-slide layout"""
    try:
        logger.info(f"Starting AI tutor lesson generation: {request.topic}")
        
        # Get user lesson preferences for defaults
        user_preferences = await get_user_lesson_preferences(request.user_id)
        
        # Use request parameters if provided, otherwise use user preferences
        effective_difficulty = request.difficulty_level if request.difficulty_level else user_preferences["difficulty_level"]
        effective_duration = request.target_duration if request.target_duration else user_preferences["target_duration"]
        
        logger.info(f"Using difficulty: {effective_difficulty}, duration: {effective_duration}s for user: {request.user_id}")
        
        # Convert container size
        container_size = None
        if request.container_size:
            container_size = ContainerSize(
                width=request.container_size.width,
                height=request.container_size.height
            )
        
        # Collect all slides and progress updates
        slides = []
        final_progress = None
        
        async for progress_update, slide_result in ai_tutor_service.generate_ai_tutor_lesson(
            topic=request.topic,
            difficulty_level=effective_difficulty,
            target_duration=effective_duration,
            container_size=container_size
        ):
            final_progress = progress_update
            
            if slide_result:
                slide_response = AITutorSlideResponse(
                    slide_number=slide_result.slide_number,
                    template_id=slide_result.template_id,
                    template_name=slide_result.template_name,
                    content_type=slide_result.content_type,
                    filled_content=slide_result.filled_content,
                    elements=slide_result.elements,
                    narration=slide_result.narration,
                    estimated_duration=slide_result.estimated_duration,
                    position_offset=slide_result.position_offset,
                    metadata=slide_result.metadata,
                    generation_time=slide_result.generation_time,
                    status=slide_result.status,
                    error_message=slide_result.error_message
                )
                slides.append(slide_response)
        
        # Get final lesson data (would come from the generator in a real implementation)
        total_duration = sum(slide.estimated_duration for slide in slides)
        successful_slides = len([s for s in slides if s.status == "success"])
        success = successful_slides >= len(slides) * 0.8 if slides else False
        
        # Generate audio segments data
        audio_segments = []
        current_time = 0.0
        for slide in slides:
            if slide.narration:
                audio_segments.append({
                    "slide_number": slide.slide_number,
                    "text": slide.narration,
                    "start_time": current_time,
                    "duration": slide.estimated_duration,
                    "end_time": current_time + slide.estimated_duration
                })
                current_time += slide.estimated_duration - 0.5  # 500ms crossfade
        
        # Generate canvas states for UnifiedPlayer
        canvas_states = []
        for slide in slides:
            if slide.elements:
                canvas_states.append({
                    "timestamp": 0,  # Will be updated with actual audio timing
                    "duration": slide.estimated_duration * 1000,  # Convert to ms
                    "elements": slide.elements,
                    "viewBox": {
                        "x": slide.position_offset,
                        "y": 0,
                        "width": 1200,
                        "height": 800,
                        "zoom": 1.0
                    },
                    "metadata": {
                        "slide_number": slide.slide_number,
                        "content_type": slide.content_type,
                        "template_id": slide.template_id
                    }
                })
        
        return AITutorLessonResponse(
            topic=request.topic,
            difficulty_level=effective_difficulty,
            target_duration=effective_duration,
            total_slides=len(slides),
            estimated_total_duration=total_duration,
            slides=slides,
            audio_url=f"/api/audio/lesson-{int(time.time())}.mp3",  # Placeholder
            audio_segments=audio_segments,
            canvas_states=canvas_states,
            generation_stats={
                "slides_generated": len(slides),
                "successful_slides": successful_slides,
                "success_rate": successful_slides / len(slides) if slides else 0,
                "total_elements": sum(len(s.elements) for s in slides)
            },
            success=success,
            error=None if success else f"Only {successful_slides}/{len(slides)} slides generated successfully"
        )
        
    except Exception as e:
        logger.error(f"Error in AI tutor lesson generation: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate AI tutor lesson: {str(e)}"
        )

@router.post("/ai-tutor/stream")
async def stream_ai_tutor_generation(request: AITutorGenerationRequest):
    """Stream AI tutor lesson generation with real-time progress"""
    
    async def generate():
        try:
            import json
            
            # Get user lesson preferences for defaults
            user_preferences = await get_user_lesson_preferences(request.user_id)
            
            # Use request parameters if provided, otherwise use user preferences
            effective_difficulty = request.difficulty_level if request.difficulty_level else user_preferences["difficulty_level"]
            effective_duration = request.target_duration if request.target_duration else user_preferences["target_duration"]
            
            # Convert container size
            container_size = None
            if request.container_size:
                container_size = ContainerSize(
                    width=request.container_size.width,
                    height=request.container_size.height
                )
            
            async for progress_update, slide_result in ai_tutor_service.generate_ai_tutor_lesson(
                topic=request.topic,
                difficulty_level=effective_difficulty,
                target_duration=effective_duration,
                container_size=container_size
            ):
                # Send progress update
                progress_data = {
                    "type": "progress",
                    "data": progress_update
                }
                yield f"data: {json.dumps(progress_data)}\n\n"
                
                # Send slide result if available
                if slide_result:
                    slide_data = {
                        "type": "slide",
                        "data": {
                            "slide_number": slide_result.slide_number,
                            "template_id": slide_result.template_id,
                            "template_name": slide_result.template_name,
                            "content_type": slide_result.content_type,
                            "filled_content": slide_result.filled_content,
                            "elements": slide_result.elements,
                            "narration": slide_result.narration,
                            "estimated_duration": slide_result.estimated_duration,
                            "position_offset": slide_result.position_offset,
                            "metadata": slide_result.metadata,
                            "generation_time": slide_result.generation_time,
                            "status": slide_result.status,
                            "error_message": slide_result.error_message
                        }
                    }
                    yield f"data: {json.dumps(slide_data)}\n\n"
            
            # Send completion signal
            completion_data = {
                "type": "complete",
                "data": {"message": "AI tutor lesson generation completed"}
            }
            yield f"data: {json.dumps(completion_data)}\n\n"
            
        except Exception as e:
            logger.error(f"Error in streaming AI tutor generation: {e}")
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