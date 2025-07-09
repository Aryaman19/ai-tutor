from fastapi import APIRouter
from datetime import datetime

router = APIRouter()


@router.get("/")
async def get_lessons():
    """Get all lessons - placeholder"""
    return [
        {
            "id": "lesson-1",
            "topic": "Quantum Physics",
            "title": "Understanding Quantum Physics",
            "created_at": datetime.now().isoformat()
        },
        {
            "id": "lesson-2",
            "topic": "Machine Learning",
            "title": "Introduction to Machine Learning",
            "created_at": datetime.now().isoformat()
        }
    ]


@router.get("/{lesson_id}")
async def get_lesson(lesson_id: str):
    """Get specific lesson - placeholder"""
    return {
        "id": lesson_id,
        "topic": "Sample Topic",
        "title": "Sample Lesson",
        "created_at": datetime.now().isoformat(),
        "doubts": []
    }
