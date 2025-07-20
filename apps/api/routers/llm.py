from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import logging

from services.ollama_service import ollama_service

logger = logging.getLogger(__name__)

router = APIRouter()

class LLMTestRequest(BaseModel):
    prompt: str
    model: str
    provider: str = "ollama"
    streaming: Optional[bool] = False
    temperature: Optional[float] = 0.7
    maxTokens: Optional[int] = 150

class StreamingMetrics(BaseModel):
    chunk_count: int
    first_token_latency: float
    average_chunk_delay: float
    total_time: float
    tokens_per_second: float
    chunk_times: List[float]
    content_quality: Dict[str, Any]
    real_streaming: bool

class LLMTestResponse(BaseModel):
    success: bool
    response: Optional[str] = None
    responseTime: float
    tokenCount: Optional[int] = None
    streaming: bool
    streamingSupported: Optional[bool] = None
    streamingMetrics: Optional[StreamingMetrics] = None
    error: Optional[str] = None
    features: Optional[Dict[str, Any]] = None

class LLMFeaturesResponse(BaseModel):
    streaming: Optional[bool]  # None = not tested, bool = actual test result
    contextLength: int
    multimodal: bool
    functionCalling: bool
    visionSupport: bool
    codeGeneration: bool
    maxTokens: int
    temperature: bool
    topP: bool
    frequencyPenalty: bool
    presencePenalty: bool

class AvailableModelsResponse(BaseModel):
    models: List[str]
    provider: str = "ollama"

@router.post("/test", response_model=LLMTestResponse)
async def test_llm_capability(request: LLMTestRequest):
    """Test LLM capabilities including streaming support and feature detection"""
    try:
        logger.info(f"Testing LLM capability for model: {request.model}, streaming: {request.streaming}")
        
        if request.provider.lower() != "ollama":
            raise HTTPException(
                status_code=400, 
                detail=f"Provider '{request.provider}' not supported. Only 'ollama' is currently supported."
            )
        
        # Validate model is available
        available_models = await ollama_service.get_available_models()
        if request.model not in available_models:
            raise HTTPException(
                status_code=400,
                detail=f"Model '{request.model}' not available. Available models: {available_models}"
            )
        
        result = await ollama_service.test_llm_capability(
            model=request.model,
            prompt=request.prompt,
            streaming=request.streaming,
            temperature=request.temperature,
            max_tokens=request.maxTokens
        )
        
        return LLMTestResponse(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing LLM capability: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/features/{model}", response_model=LLMFeaturesResponse)
async def get_model_features(model: str):
    """Get detailed feature information for a specific model"""
    try:
        logger.info(f"Getting features for model: {model}")
        
        # Validate model is available
        available_models = await ollama_service.get_available_models()
        if model not in available_models:
            raise HTTPException(
                status_code=404,
                detail=f"Model '{model}' not found. Available models: {available_models}"
            )
        
        features = await ollama_service._detect_model_features(model)
        return LLMFeaturesResponse(**features)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting model features: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/models", response_model=AvailableModelsResponse)
async def get_available_models():
    """Get list of available LLM models"""
    try:
        logger.info("Getting available models")
        
        models = await ollama_service.get_available_models()
        return AvailableModelsResponse(models=models)
        
    except Exception as e:
        logger.error(f"Error getting available models: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/test/streaming/{model}")
async def test_streaming_capability(model: str, prompt: str = "Hello, test streaming response"):
    """Quick test to check if a model supports streaming"""
    try:
        logger.info(f"Testing streaming capability for model: {model}")
        
        # Validate model is available
        available_models = await ollama_service.get_available_models()
        if model not in available_models:
            raise HTTPException(
                status_code=404,
                detail=f"Model '{model}' not found. Available models: {available_models}"
            )
        
        result = await ollama_service.test_llm_capability(
            model=model,
            prompt=prompt,
            streaming=True,
            temperature=0.7,
            max_tokens=50
        )
        
        return {
            "model": model,
            "streamingSupported": result.get("success", False) and result.get("streaming", False),
            "responseTime": result.get("responseTime", 0),
            "error": result.get("error")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing streaming capability: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/health")
async def llm_health_check():
    """Check if LLM service (Ollama) is available"""
    try:
        is_healthy = await ollama_service.health_check()
        return {
            "status": "healthy" if is_healthy else "unhealthy",
            "service": "ollama",
            "healthy": is_healthy,
            "message": "Ollama service is reachable" if is_healthy else "Ollama service is not reachable"
        }
    except Exception as e:
        logger.error(f"Error checking LLM health: {e}", exc_info=True)
        return {
            "status": "unhealthy",
            "service": "ollama", 
            "healthy": False,
            "error": str(e)
        }