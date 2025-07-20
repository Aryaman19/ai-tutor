"""
Chunked Content Generator for timeline-based LLM content creation.

This module implements token-aware chunked content generation that creates timeline events
while respecting LLM token limits and maintaining narrative continuity. It extends the
existing OllamaService patterns with timeline-specific capabilities.
"""

import asyncio
import json
import logging
import time
from typing import Dict, List, Optional, Any, AsyncGenerator, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from services.ollama_service import OllamaService
from dataclasses import dataclass, asdict
from enum import Enum

import httpx
from config import settings
from models.lesson import CanvasStep
from models.settings import UserSettings
from services.adaptive_chunk_sizer import (
    AdaptiveChunkSizer, 
    ComplexityMetrics, 
    ChunkRecommendation,
    ChunkSizingConfig
)
from templates.timeline_prompts import (
    TimelinePromptTemplates,
    ContentType,
    DifficultyLevel,
    ContinuityContext,
    ChunkGenerationConfig
)

logger = logging.getLogger(__name__)


class GenerationStatus(Enum):
    """Status of chunk generation process"""
    PENDING = "pending"
    ANALYZING = "analyzing"
    GENERATING = "generating"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class ChunkGenerationResult:
    """Result of generating a single chunk"""
    chunk_id: str
    chunk_number: int
    timeline_events: List[Dict[str, Any]]
    chunk_summary: str
    next_chunk_hint: str
    concepts_introduced: List[str]
    visual_elements_created: List[str]
    generation_time: float
    token_count: int
    status: GenerationStatus
    error_message: Optional[str] = None


@dataclass
class GenerationProgress:
    """Progress tracking for multi-chunk generation"""
    total_chunks: int
    completed_chunks: int
    current_chunk: int
    status: GenerationStatus
    estimated_time_remaining: float
    current_operation: str
    errors: List[str]


class ChunkedContentGenerator:
    """
    Generate timeline-based educational content in manageable chunks.
    
    This class extends the existing OllamaService functionality to support
    chunked generation with context continuity and timeline awareness.
    """
    
    def __init__(self, ollama_service: "OllamaService"):
        self.ollama_service = ollama_service
        self.chunk_sizer = AdaptiveChunkSizer()
        self.prompt_templates = TimelinePromptTemplates()
        
        # Generation configuration
        self.max_retries = 3
        self.retry_delay = 1.0
        self.timeout = 120.0
        
        # Track generation state
        self.generation_cache: Dict[str, ChunkGenerationResult] = {}
        self.continuity_contexts: Dict[str, ContinuityContext] = {}
    
    async def analyze_and_plan_chunks(
        self,
        topic: str,
        difficulty: DifficultyLevel = DifficultyLevel.BEGINNER,
        content_type: ContentType = ContentType.DEFINITION,
        target_total_duration: float = 120.0,
        user_id: str = "default"
    ) -> Tuple[ChunkRecommendation, List[ChunkGenerationConfig]]:
        """
        Analyze topic and create chunking plan.
        
        Args:
            topic: Educational topic to cover
            difficulty: Target difficulty level
            content_type: Type of content to generate
            target_total_duration: Total duration in seconds
            user_id: User ID for personalized settings
            
        Returns:
            Tuple of (chunk_recommendation, list_of_chunk_configs)
        """
        
        logger.info(f"Analyzing topic for chunking: {topic}")
        
        try:
            # Analyze topic complexity
            complexity = await self.chunk_sizer.analyze_topic_complexity(topic, difficulty)
            
            # Get chunking recommendation
            recommendation = self.chunk_sizer.recommend_chunk_size(
                complexity, content_type, total_estimated_content=None
            )
            
            logger.info(f"Chunk recommendation: {recommendation.chunk_size.value} chunks, "
                       f"{recommendation.estimated_chunks_needed} total")
            
            # Create individual chunk configurations
            chunk_configs = []
            chunk_duration = min(
                recommendation.target_duration,
                target_total_duration / recommendation.estimated_chunks_needed
            )
            
            for i in range(recommendation.estimated_chunks_needed):
                config = ChunkGenerationConfig(
                    max_tokens=recommendation.target_tokens,
                    target_duration=chunk_duration,
                    content_type=content_type,
                    difficulty=difficulty,
                    include_visual_instructions=True,
                    maintain_continuity=i > 0  # First chunk doesn't need continuity
                )
                chunk_configs.append(config)
            
            return recommendation, chunk_configs
            
        except Exception as e:
            logger.error(f"Error analyzing topic for chunking: {e}")
            # Return fallback configuration
            fallback_recommendation = ChunkRecommendation(
                chunk_size=self.chunk_sizer.ChunkSize.MEDIUM,
                target_duration=30.0,
                target_tokens=800,
                estimated_chunks_needed=3,
                break_points=["Introduction", "Main Content", "Summary"],
                reasoning="Fallback configuration due to analysis error",
                complexity_factors=["unknown"],
                confidence=0.5
            )
            
            fallback_configs = [
                ChunkGenerationConfig(
                    max_tokens=800,
                    target_duration=30.0,
                    content_type=content_type,
                    difficulty=difficulty
                ) for _ in range(3)
            ]
            
            return fallback_recommendation, fallback_configs
    
    async def generate_chunk(
        self,
        topic: str,
        chunk_config: ChunkGenerationConfig,
        chunk_number: int,
        continuity_context: Optional[ContinuityContext] = None,
        user_id: str = "default"
    ) -> ChunkGenerationResult:
        """
        Generate a single timeline chunk with specified configuration.
        
        Args:
            topic: Educational topic to cover
            chunk_config: Configuration for this chunk
            chunk_number: Sequential chunk number (1-based)
            continuity_context: Context from previous chunks
            user_id: User ID for personalized settings
            
        Returns:
            ChunkGenerationResult with timeline events and metadata
        """
        
        start_time = time.time()
        chunk_id = f"{hash(topic)}_{chunk_number}_{int(start_time)}"
        
        logger.info(f"Generating chunk {chunk_number} for topic: {topic}")
        
        try:
            # Generate the prompt
            prompt = self.prompt_templates.get_chunk_generation_prompt(
                topic, chunk_config, continuity_context
            )
            
            logger.debug(f"Generated prompt for chunk {chunk_number}: {prompt[:200]}...")
            
            # Make LLM request with retries
            response_text = await self._make_llm_request_with_retry(
                prompt, user_id, chunk_config.max_tokens
            )
            
            if not response_text:
                raise Exception("Failed to get response from LLM")
            
            # Parse JSON response
            chunk_data = await self._parse_chunk_response(response_text, chunk_number)
            
            # Validate timeline events
            timeline_events = chunk_data.get("timeline_events", [])
            if not timeline_events:
                raise Exception("No timeline events generated")
            
            # Calculate token count (approximate)
            token_count = self._estimate_token_count(response_text)
            
            generation_time = time.time() - start_time
            
            result = ChunkGenerationResult(
                chunk_id=chunk_id,
                chunk_number=chunk_number,
                timeline_events=timeline_events,
                chunk_summary=chunk_data.get("chunk_summary", ""),
                next_chunk_hint=chunk_data.get("next_chunk_hint", ""),
                concepts_introduced=chunk_data.get("concepts_introduced", []),
                visual_elements_created=chunk_data.get("visual_elements_created", []),
                generation_time=generation_time,
                token_count=token_count,
                status=GenerationStatus.COMPLETED
            )
            
            # Cache the result
            self.generation_cache[chunk_id] = result
            
            logger.info(f"Successfully generated chunk {chunk_number} in {generation_time:.2f}s")
            return result
            
        except Exception as e:
            logger.error(f"Error generating chunk {chunk_number}: {e}")
            generation_time = time.time() - start_time
            
            return ChunkGenerationResult(
                chunk_id=chunk_id,
                chunk_number=chunk_number,
                timeline_events=[],
                chunk_summary="",
                next_chunk_hint="",
                concepts_introduced=[],
                visual_elements_created=[],
                generation_time=generation_time,
                token_count=0,
                status=GenerationStatus.FAILED,
                error_message=str(e)
            )
    
    async def generate_chunked_lesson(
        self,
        topic: str,
        difficulty: DifficultyLevel = DifficultyLevel.BEGINNER,
        content_type: ContentType = ContentType.DEFINITION,
        target_total_duration: float = 120.0,
        user_id: str = "default"
    ) -> AsyncGenerator[Tuple[GenerationProgress, Optional[ChunkGenerationResult]], None]:
        """
        Generate a complete lesson in chunks with progress updates.
        
        Args:
            topic: Educational topic to cover
            difficulty: Target difficulty level
            content_type: Type of content to generate
            target_total_duration: Total duration in seconds
            user_id: User ID for personalized settings
            
        Yields:
            Tuple of (progress_update, chunk_result_or_none)
        """
        
        logger.info(f"Starting chunked lesson generation: {topic}")
        
        try:
            # Phase 1: Analysis and planning
            progress = GenerationProgress(
                total_chunks=0,
                completed_chunks=0,
                current_chunk=0,
                status=GenerationStatus.ANALYZING,
                estimated_time_remaining=0.0,
                current_operation="Analyzing topic complexity and planning chunks",
                errors=[]
            )
            yield progress, None
            
            recommendation, chunk_configs = await self.analyze_and_plan_chunks(
                topic, difficulty, content_type, target_total_duration, user_id
            )
            
            # Update progress with plan
            progress.total_chunks = len(chunk_configs)
            progress.status = GenerationStatus.GENERATING
            progress.current_operation = f"Generating {progress.total_chunks} chunks"
            progress.estimated_time_remaining = progress.total_chunks * 8.0  # Estimate 8s per chunk
            yield progress, None
            
            # Phase 2: Generate chunks sequentially
            continuity_context = None
            
            for i, chunk_config in enumerate(chunk_configs):
                progress.current_chunk = i + 1
                progress.current_operation = f"Generating chunk {i + 1} of {progress.total_chunks}"
                
                # Estimate remaining time based on completed chunks
                if i > 0:
                    avg_time_per_chunk = sum(
                        result.generation_time for result in self.generation_cache.values()
                        if result.status == GenerationStatus.COMPLETED
                    ) / max(1, progress.completed_chunks)
                    progress.estimated_time_remaining = (progress.total_chunks - i) * avg_time_per_chunk
                
                yield progress, None
                
                # Generate the chunk
                chunk_result = await self.generate_chunk(
                    topic, chunk_config, i + 1, continuity_context, user_id
                )
                
                if chunk_result.status == GenerationStatus.COMPLETED:
                    progress.completed_chunks += 1
                    
                    # Update continuity context for next chunk
                    continuity_context = ContinuityContext(
                        previous_concepts=chunk_result.concepts_introduced,
                        visual_elements=chunk_result.visual_elements_created,
                        narrative_thread=chunk_result.chunk_summary,
                        current_timestamp=sum(config.target_duration for config in chunk_configs[:i+1]),
                        chunk_number=i + 1
                    )
                    
                    # Store context for potential future use
                    self.continuity_contexts[chunk_result.chunk_id] = continuity_context
                    
                else:
                    progress.errors.append(f"Failed to generate chunk {i + 1}: {chunk_result.error_message}")
                
                # Yield chunk result
                yield progress, chunk_result
            
            # Phase 3: Complete
            progress.status = GenerationStatus.COMPLETED
            progress.current_operation = "Generation complete"
            progress.estimated_time_remaining = 0.0
            yield progress, None
            
            logger.info(f"Completed chunked lesson generation: {progress.completed_chunks}/{progress.total_chunks} chunks")
            
        except Exception as e:
            logger.error(f"Error in chunked lesson generation: {e}")
            progress.status = GenerationStatus.FAILED
            progress.errors.append(str(e))
            progress.current_operation = "Generation failed"
            yield progress, None
    
    async def _make_llm_request_with_retry(
        self,
        prompt: str,
        user_id: str,
        max_tokens: int
    ) -> Optional[str]:
        """Make LLM request with retry logic"""
        
        for attempt in range(self.max_retries):
            try:
                # Get user settings for LLM configuration
                user_settings = await UserSettings.find_one(UserSettings.user_id == user_id)
                llm_settings = user_settings.llm if user_settings else None
                
                # Configure request
                model = llm_settings.model if llm_settings else self.ollama_service.model
                temperature = llm_settings.temperature if llm_settings else 0.7
                
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        f"{self.ollama_service.base_url}/api/generate",
                        json={
                            "model": model,
                            "prompt": prompt,
                            "stream": False,
                            "options": {
                                "temperature": temperature,
                                "num_predict": max_tokens,
                            }
                        }
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        return result.get("response", "")
                    else:
                        logger.warning(f"LLM request failed (attempt {attempt + 1}): {response.status_code}")
                        
            except Exception as e:
                logger.warning(f"LLM request error (attempt {attempt + 1}): {e}")
                
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
        
        return None
    
    async def _parse_chunk_response(self, response_text: str, chunk_number: int) -> Dict[str, Any]:
        """Parse and validate chunk response JSON"""
        
        try:
            # Try to extract JSON from response
            response_text = response_text.strip()
            
            # Handle cases where LLM includes extra text around JSON
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            
            if json_start >= 0 and json_end > json_start:
                json_text = response_text[json_start:json_end]
                chunk_data = json.loads(json_text)
            else:
                # Try parsing the entire response
                chunk_data = json.loads(response_text)
            
            # Validate required fields
            required_fields = ["timeline_events", "chunk_summary"]
            for field in required_fields:
                if field not in chunk_data:
                    logger.warning(f"Missing required field '{field}' in chunk {chunk_number}")
                    chunk_data[field] = self._get_fallback_value(field)
            
            # Validate timeline_events structure
            timeline_events = chunk_data.get("timeline_events", [])
            for i, event in enumerate(timeline_events):
                if not isinstance(event, dict):
                    logger.warning(f"Invalid event structure at index {i} in chunk {chunk_number}")
                    continue
                
                # Ensure required event fields
                if "timestamp" not in event:
                    event["timestamp"] = i * 5.0  # Default 5-second intervals
                if "duration" not in event:
                    event["duration"] = 5.0
                if "event_type" not in event:
                    event["event_type"] = "narration"
                if "content" not in event:
                    event["content"] = f"Content for event {i + 1}"
            
            return chunk_data
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response for chunk {chunk_number}: {e}")
            logger.debug(f"Raw response: {response_text[:500]}...")
            
            # Return minimal fallback structure
            return {
                "timeline_events": [{
                    "timestamp": 0.0,
                    "duration": 10.0,
                    "event_type": "narration",
                    "content": "Failed to parse content - please regenerate",
                    "visual_instruction": "VISUAL: text center 'Error: Content parsing failed' critical"
                }],
                "chunk_summary": f"Chunk {chunk_number} - parsing error",
                "next_chunk_hint": "Continue with original topic",
                "concepts_introduced": [],
                "visual_elements_created": []
            }
    
    def _get_fallback_value(self, field_name: str) -> Any:
        """Get fallback values for missing fields"""
        
        fallbacks = {
            "timeline_events": [],
            "chunk_summary": "Content summary not available",
            "next_chunk_hint": "Continue with next logical topic",
            "concepts_introduced": [],
            "visual_elements_created": []
        }
        
        return fallbacks.get(field_name, "")
    
    def _estimate_token_count(self, text: str) -> int:
        """Estimate token count for text"""
        # Rough estimation: 1.3 tokens per word on average
        word_count = len(text.split())
        return int(word_count * 1.3)
    
    async def convert_chunks_to_canvas_steps(
        self,
        chunk_results: List[ChunkGenerationResult],
        topic: str
    ) -> List[CanvasStep]:
        """
        Convert chunk results to CanvasStep format for compatibility.
        
        Args:
            chunk_results: List of generated chunk results
            topic: Original topic for context
            
        Returns:
            List of CanvasStep objects compatible with existing system
        """
        
        canvas_steps = []
        step_number = 1
        
        for chunk_result in chunk_results:
            if chunk_result.status != GenerationStatus.COMPLETED:
                continue
            
            # Convert each timeline event to a canvas step
            for event in chunk_result.timeline_events:
                step = CanvasStep(
                    step_number=step_number,
                    title=f"{topic} - Part {step_number}",
                    explanation=event.get("content", ""),
                    narration=event.get("content", ""),
                    duration=event.get("duration", 5.0),
                    visual_elements=[{
                        "type": "timeline_event",
                        "event_type": event.get("event_type", "narration"),
                        "timestamp": event.get("timestamp", 0.0),
                        "visual_instruction": event.get("visual_instruction", ""),
                        "layout_hints": event.get("layout_hints", {})
                    }]
                )
                
                canvas_steps.append(step)
                step_number += 1
        
        logger.info(f"Converted {len(chunk_results)} chunks to {len(canvas_steps)} canvas steps")
        return canvas_steps
    
    def get_generation_stats(self) -> Dict[str, Any]:
        """Get statistics about recent generation performance"""
        
        completed_chunks = [
            result for result in self.generation_cache.values()
            if result.status == GenerationStatus.COMPLETED
        ]
        
        if not completed_chunks:
            return {"status": "no_completed_generations"}
        
        avg_generation_time = sum(result.generation_time for result in completed_chunks) / len(completed_chunks)
        avg_token_count = sum(result.token_count for result in completed_chunks) / len(completed_chunks)
        total_chunks = len(self.generation_cache)
        success_rate = len(completed_chunks) / total_chunks if total_chunks > 0 else 0
        
        return {
            "total_chunks_generated": total_chunks,
            "successful_chunks": len(completed_chunks),
            "success_rate": success_rate,
            "average_generation_time": avg_generation_time,
            "average_token_count": avg_token_count,
            "cache_size": len(self.generation_cache)
        }