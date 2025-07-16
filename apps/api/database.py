from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional
import logging
from config import settings

logger = logging.getLogger(__name__)


class Database:
    client: Optional[AsyncIOMotorClient] = None
    database = None


db = Database()


async def connect_to_mongo():
    """Create database connection"""
    try:
        # Create Motor client
        db.client = AsyncIOMotorClient(
            settings.mongodb_url,
            serverSelectionTimeoutMS=5000,  # 5 second timeout
            connectTimeoutMS=5000,
            socketTimeoutMS=5000,
        )

        # Test connection
        await db.client.admin.command('ping')
        logger.info("Successfully connected to MongoDB")

        # Get database
        db.database = db.client[settings.database_name]

        # Initialize Beanie
        try:
            from models import UserSettings, Lesson
            await init_beanie(database=db.database, document_models=[UserSettings, Lesson])
        except ImportError as e:
            logger.error(f"Failed to import models: {e}")
            # Try importing individually
            models = []
            try:
                from models import UserSettings
                models.append(UserSettings)
                logger.info("UserSettings model imported successfully")
            except ImportError:
                logger.error("Failed to import UserSettings model")
            
            try:
                from models.lesson import Lesson
                models.append(Lesson)
                logger.info("Lesson model imported successfully")
            except ImportError:
                logger.error("Failed to import Lesson model")
            
            if models:
                await init_beanie(database=db.database, document_models=models)
                logger.info(f"Beanie initialized with {len(models)} models")
            else:
                logger.error("No models available for Beanie initialization")
                return False

        logger.info("Beanie initialized successfully")
        return True

    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        return False


async def close_mongo_connection():
    """Close database connection"""
    if db.client:
        db.client.close()
        logger.info("Disconnected from MongoDB")


async def get_database():
    """Get database instance"""
    return db.database


async def ping_database() -> dict:
    """Health check for database"""
    try:
        if not db.client:
            return {"status": "disconnected", "error": "No client"}

        result = await db.client.admin.command('ping')
        return {
            "status": "connected",
            "ping": result,
            "database": settings.database_name
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}
