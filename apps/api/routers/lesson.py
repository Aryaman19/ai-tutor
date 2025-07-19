from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId
from models.lesson import (
    Lesson, 
    LessonResponse, 
    CreateLessonRequest, 
    UpdateLessonRequest
)
from services.ollama_service import ollama_service

# Optional TTS service import
try:
    from services.tts_service import piper_tts_service
    TTS_AVAILABLE = True
except ImportError as e:
    print(f"TTS service not available: {e}")
    piper_tts_service = None
    TTS_AVAILABLE = False

router = APIRouter()


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
        print(f"Error generating lesson content: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate lesson content"
        )


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
        if not ObjectId.is_valid(lesson_id):
            raise HTTPException(status_code=400, detail="Invalid lesson ID")
        
        lesson = await Lesson.get(ObjectId(lesson_id))
        
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        
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
        print(f"Error updating lesson: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to update lesson"
        )


@router.delete("/lesson/{lesson_id}")
async def delete_lesson(lesson_id: str):
    """Delete a lesson"""
    try:
        if not ObjectId.is_valid(lesson_id):
            raise HTTPException(status_code=400, detail="Invalid lesson ID")
        
        lesson = await Lesson.get(ObjectId(lesson_id))
        
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        
        await lesson.delete()
        
        return {"message": "Lesson deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting lesson: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete lesson"
        )


@router.post("/lesson/{lesson_id}/generate-script", response_model=LessonResponse)
async def generate_lesson_script(lesson_id: str):
    """Generate visual script content for an existing lesson with narration and visual elements"""
    try:
        if not ObjectId.is_valid(lesson_id):
            raise HTTPException(status_code=400, detail="Invalid lesson ID")
        
        lesson = await Lesson.get(ObjectId(lesson_id))
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        
        # Generate visual script using Ollama
        steps = await ollama_service.generate_visual_script(
            topic=lesson.topic,
            difficulty_level=lesson.difficulty_level,
            user_id="default"  # TODO: Add user authentication
        )
        
        if not steps:
            raise HTTPException(
                status_code=503, 
                detail="Failed to generate lesson script. AI service may be unavailable."
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