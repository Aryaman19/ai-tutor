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
            difficulty_level=lesson.difficulty_level
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