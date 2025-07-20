from fastapi import FastAPI, HTTPException, Request, Response
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
    os.makedirs(settings.tts_voices_dir, exist_ok=True)

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

# CORS middleware with explicit configuration
logger.info(f"Configuring CORS with origins: {settings.cors_origins_list}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Additional middleware to handle CORS preflight requests
@app.middleware("http")
async def cors_handler(request: Request, call_next):
    """Handle CORS preflight requests explicitly"""
    if request.method == "OPTIONS":
        response = Response()
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response
    
    response = await call_next(request)
    
    # Ensure CORS headers are present on all responses
    origin = request.headers.get("Origin")
    if origin and origin in settings.cors_origins_list:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    elif not origin:
        # For same-origin requests or development
        response.headers["Access-Control-Allow-Origin"] = "*"
    
    return response

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

try:
    from routers.settings import router as settings_router
    app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
    logger.info("Settings router registered successfully")
except ImportError as e:
    logger.error(f"Settings router import failed: {e}")
    logger.warning("Settings endpoints will not be available")
except Exception as e:
    logger.error(f"Failed to register settings router: {e}")
    logger.warning("Settings endpoints will not be available")

try:
    from routers.lesson import router as lesson_router
    app.include_router(lesson_router, prefix="/api", tags=["lessons"])
    logger.info("Lesson router registered successfully")
except ImportError as e:
    logger.error(f"Lesson router import failed: {e}")
    logger.warning("Lesson endpoints will not be available")
except Exception as e:
    logger.error(f"Failed to register lesson router: {e}")
    logger.warning("Lesson endpoints will not be available")

try:
    from routers.tts import router as tts_router
    app.include_router(tts_router, prefix="/api", tags=["tts"])
    logger.info("TTS router registered successfully")
except ImportError as e:
    logger.error(f"TTS router import failed: {e}")
    logger.warning("TTS endpoints will not be available")
except Exception as e:
    logger.error(f"Failed to register TTS router: {e}")
    logger.warning("TTS endpoints will not be available")

try:
    from routers.timeline_lesson import router as timeline_lesson_router
    app.include_router(timeline_lesson_router, prefix="/api", tags=["timeline-lessons"])
    logger.info("Timeline lesson router registered successfully")
except ImportError as e:
    logger.error(f"Timeline lesson router import failed: {e}")
    logger.warning("Timeline lesson endpoints will not be available")
except Exception as e:
    logger.error(f"Failed to register timeline lesson router: {e}")
    logger.warning("Timeline lesson endpoints will not be available")

# Mount static files for audio serving
try:
    app.mount("/static", StaticFiles(directory="static"), name="static")
    logger.info("Static files mounted at /static")
except Exception as e:
    logger.warning(f"Failed to mount static files: {e}")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level="info"
    )
