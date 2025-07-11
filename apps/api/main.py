from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import os
import logging
from contextlib import asynccontextmanager

from config import settings
from database import connect_to_mongo, close_mongo_connection

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"Container mode: {settings.is_container()}")

    # Create static directories
    os.makedirs(settings.tts_cache_dir, exist_ok=True)

    # Connect to MongoDB
    db_connected = await connect_to_mongo()
    if not db_connected:
        logger.warning(
            "Failed to connect to MongoDB - some features may not work")

    yield

    # Shutdown
    await close_mongo_connection()
    logger.info("Application shutdown complete")

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI Tutor powered by Gemma 3n",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Basic routes for testing


@app.get("/")
async def root():
    return {
        "message": f"Welcome to {settings.app_name}",
        "version": settings.app_version,
        "status": "running"
    }


@app.get("/api/health/")
async def basic_health():
    return {
        "status": "healthy",
        "message": "AI Tutor API is running",
        "version": settings.app_version
    }

# Import and include routers after app creation
try:
    from routers.health import router as health_router
    app.include_router(health_router, prefix="/api/health", tags=["health"])
except ImportError:
    logger.warning("Health router not found - will use basic endpoints only")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level="info"
    )
