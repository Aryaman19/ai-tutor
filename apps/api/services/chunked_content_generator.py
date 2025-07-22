"""
Chunked Content Generator for timeline-based LLM content creation.

This module implements token-aware chunked content generation that creates timeline events
while respecting LLM token limits and maintaining narrative continuity. It extends the
existing OllamaService patterns with timeline-specific capabilities.
"""

import asyncio
import json
import logging
import re
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
                complexity, content_type, total_estimated_content=None, total_duration=target_total_duration
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
        user_id: str = "default",
        total_chunks: int = 3
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
            chunk_data = await self._parse_chunk_response(response_text, chunk_number, chunk_config.target_duration, total_chunks)
            
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
                    topic, chunk_config, i + 1, continuity_context, user_id, progress.total_chunks
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
    
    async def _parse_chunk_response(self, response_text: str, chunk_number: int, target_duration: float = 120.0, total_chunks: int = 3) -> Dict[str, Any]:
        """Parse and validate chunk response JSON"""
        
        try:
            # Try to extract JSON from response
            response_text = response_text.strip()
            
            # Remove markdown code block syntax if present
            if '```json' in response_text:
                # Extract content between ```json and ```
                json_start = response_text.find('```json') + 7
                json_end = response_text.find('```', json_start)
                if json_end == -1:
                    json_end = len(response_text)
                response_text = response_text[json_start:json_end].strip()
                logger.info(f"Extracted JSON from markdown code block: {response_text[:100]}...")
            elif '```' in response_text:
                # Remove any remaining code block markers
                response_text = re.sub(r'```[^\n]*\n?', '', response_text)
                response_text = re.sub(r'```', '', response_text).strip()
                logger.info(f"Cleaned markdown syntax: {response_text[:100]}...")
            
            # More robust JSON extraction
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            
            if json_start >= 0 and json_end > json_start:
                json_text = response_text[json_start:json_end]
                
                # Clean up common JSON issues
                json_text = json_text.replace('\n', ' ')  # Remove newlines
                json_text = json_text.replace('\t', ' ')  # Remove tabs
                
                # Fix common trailing comma issues
                json_text = re.sub(r',\s*}', '}', json_text)  # Remove trailing commas before }
                json_text = re.sub(r',\s*]', ']', json_text)  # Remove trailing commas before ]
                
                logger.info(f"Parsing cleaned JSON: {json_text[:200]}...")
                chunk_data = json.loads(json_text)
            else:
                # Fallback: try parsing the entire response with cleaning
                clean_text = re.sub(r',\s*}', '}', response_text)
                clean_text = re.sub(r',\s*]', ']', clean_text)
                logger.info(f"Fallback parsing entire response: {clean_text[:100]}...")
                chunk_data = json.loads(clean_text)
            
            # Validate required fields
            required_fields = ["timeline_events", "chunk_summary"]
            for field in required_fields:
                if field not in chunk_data:
                    logger.warning(f"Missing required field '{field}' in chunk {chunk_number}")
                    chunk_data[field] = self._get_fallback_value(field)
            
            # Validate timeline_events structure and fix timestamps
            timeline_events = chunk_data.get("timeline_events", [])
            
            # Calculate proper chunk timing distribution
            # Each chunk should occupy its portion of the total target_duration
            chunk_duration = target_duration / total_chunks
            chunk_start_time = (chunk_number - 1) * chunk_duration
            
            logger.info(f"Chunk {chunk_number}: start_time={chunk_start_time:.1f}s, duration={chunk_duration:.1f}s")
            
            for i, event in enumerate(timeline_events):
                if not isinstance(event, dict):
                    logger.warning(f"Invalid event structure at index {i} in chunk {chunk_number}")
                    continue
                
                # Calculate event timing within the chunk
                event_spacing = chunk_duration / max(1, len(timeline_events))
                event_timestamp = chunk_start_time + (i * event_spacing)
                
                # Ensure required event fields with proper timestamp distribution
                event["timestamp"] = event_timestamp
                
                # Set reasonable duration - should not exceed event spacing
                event_duration = min(event_spacing * 0.8, 15.0)  # 80% of spacing or max 15s
                event["duration"] = event_duration
                
                if "event_type" not in event:
                    event["event_type"] = "narration"
                if "content" not in event:
                    event["content"] = f"Content for event {i + 1} in chunk {chunk_number}"
                
                logger.info(f"Fixed event {i} in chunk {chunk_number}: timestamp={event['timestamp']:.1f}s, duration={event['duration']:.1f}s")
            
            return chunk_data
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response for chunk {chunk_number}: {e}")
            logger.error(f"Raw response that failed parsing: {response_text}")
            
            # Extract any meaningful text content as fallback
            fallback_content = self._extract_meaningful_content(response_text)
            
            # Calculate proper timestamp for this chunk
            chunk_duration = target_duration / total_chunks
            chunk_start_time = (chunk_number - 1) * chunk_duration
            
            logger.info(f"Fallback for chunk {chunk_number}: timestamp={chunk_start_time:.1f}s, duration={chunk_duration:.1f}s")
            
            # Return meaningful fallback structure
            return {
                "timeline_events": [{
                    "timestamp": chunk_start_time,
                    "duration": chunk_duration,  # Use chunk's time window
                    "event_type": "narration",
                    "content": fallback_content,
                    "visual_instruction": f"VISUAL: text center '{fallback_content[:50]}' informative"
                }],
                "chunk_summary": f"Chunk {chunk_number} - extracted content from malformed response",
                "next_chunk_hint": "Continue with structured content",
                "concepts_introduced": [f"Basic concepts from chunk {chunk_number}"],
                "visual_elements_created": ["text explanation"]
            }
    
    def _extract_meaningful_content(self, response_text: str) -> str:
        """Extract meaningful educational content from malformed LLM response"""
        # Clean up the response text
        text = response_text.strip()
        
        # Remove markdown code blocks first
        text = re.sub(r'```[^\n]*\n?', '', text)
        text = re.sub(r'```', '', text)
        
        # Look for content field specifically
        content_match = re.search(r'["\']?content["\']?\s*:\s*["\']([^"\'{]+)["\']', text, re.IGNORECASE)
        if content_match:
            content = content_match.group(1).strip()
            if len(content) > 20:  # Ensure it's meaningful content
                logger.info(f"Extracted content field: {content[:50]}...")
                return content[:200] + "..." if len(content) > 200 else content
        
        # Remove JSON syntax artifacts
        text = re.sub(r'[{}"\[\]]', '', text)  # Remove JSON brackets and quotes
        text = re.sub(r'timeline_events:|chunk_summary:|content:|timestamp:|duration:|event_type:', '', text)  # Remove field names
        text = re.sub(r'\n+', ' ', text)  # Replace multiple newlines with space
        text = re.sub(r'\s+', ' ', text)  # Replace multiple spaces with single space
        
        # Extract sentences that look educational (not just metadata)
        sentences = []
        for sentence in text.split('.'):
            s = sentence.strip()
            # Filter out metadata-looking content
            if (len(s) > 20 and 
                not re.match(r'^\d+\.?\d*$', s) and  # Not just numbers
                'timestamp' not in s.lower() and 
                'duration' not in s.lower() and
                'event_type' not in s.lower()):
                sentences.append(s + '.')
        
        if sentences:
            # Take the longest few sentences as they're likely to contain good content
            meaningful_content = ' '.join(sentences[:3])
            logger.info(f"Extracted meaningful sentences: {meaningful_content[:50]}...")
            return meaningful_content[:200] + "..." if len(meaningful_content) > 200 else meaningful_content
        else:
            # Last resort fallback
            logger.warning("Could not extract meaningful content, using fallback")
            return f"Educational content about the requested topic. The system encountered a formatting issue but will continue generating structured content."
    
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