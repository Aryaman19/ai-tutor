from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()


class DoubtRequest(BaseModel):
    lesson_id: str
    question: str
    video_timestamp: float = None
    context: str = None


@router.post("/")
async def create_doubt(request: DoubtRequest):
    """Create a doubt - placeholder"""
    return {
        "id": "doubt-123",
        "lesson_id": request.lesson_id,
        "question": request.question,
        "answer": f"Great question about '{request.question}'. This is a placeholder response.",
        "created_at": datetime.now().isoformat()
    }
