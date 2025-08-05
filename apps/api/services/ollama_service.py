import asyncio
import logging
import httpx
from typing import Dict, List, Optional, AsyncGenerator, Tuple
from config import settings
from models.lesson import CanvasStep
from models.settings import UserSettings

logger = logging.getLogger(__name__)

# Import chunked generation components - moved after logger definition
# Note: chunked_content_generator moved to unused-code/
try:
    from templates.timeline_prompts import ContentType, DifficultyLevel
    CHUNKED_GENERATION_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Chunked generation not available: {e}")
    CHUNKED_GENERATION_AVAILABLE = False


class OllamaService:
    """Service for interacting with Ollama AI model"""
    
    def __init__(self):
        self.base_url = settings.get_ollama_url()
        self.model = "gemma3n:latest"  # Use the available model
        self.timeout = 60.0
        
        # Chunked content generator moved to unused-code during refactoring
        # Chunked generation functionality disabled for now
        self.chunked_generator = None
        
    async def _make_request(self, prompt: str, user_id: str = "default") -> Optional[str]:
        """Make a request to Ollama API with user settings"""
        try:
            # Get user's LLM settings
            user_settings = await UserSettings.find_one(UserSettings.user_id == user_id)
            llm_settings = user_settings.llm if user_settings else None
            
            # Use settings or defaults
            model = llm_settings.model if llm_settings else self.model
            temperature = 0.7  # Default temperature
            max_tokens = 16384  # Default max tokens (16k)
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
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
                    response_text = result.get("response", "")
                    if not response_text or response_text.strip() == "":
                        logger.warning(f"Empty response from Ollama for prompt: {prompt[:50]}...")
                        logger.debug(f"Full Ollama response: {result}")
                    return response_text
                else:
                    logger.error(f"Ollama API error: {response.status_code} - {response.text}")
                    return None
                    
        except httpx.RequestError as e:
            logger.error(f"Request error: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            return None
    
    async def generate_eli5_lesson(self, topic: str, difficulty_level: str = "beginner", user_id: str = "default") -> Optional[List[CanvasStep]]:
        """Generate ELI5 lesson steps for a given topic"""
        
        difficulty_prompts = {
            "beginner": "Explain this like I'm 5 years old, using very simple language and examples",
            "intermediate": "Explain this at a middle school level with clear examples",
            "advanced": "Explain this at a high school level with detailed examples"
        }
        
        difficulty_instruction = difficulty_prompts.get(difficulty_level, difficulty_prompts["beginner"])
        
        prompt = f"""
{difficulty_instruction}. Break down the topic "{topic}" into exactly 5 clear, sequential steps that build upon each other.

For each step, provide:
1. A clear, engaging title
2. A detailed explanation that is appropriate for the difficulty level
3. A narration script for AI voice-over (conversational, engaging tone)
4. Simple examples or analogies when possible

TTS-AWARE NARRATION GUIDELINES:
- Target 140-160 words per minute speaking rate
- Write naturally for speech: use contractions, shorter sentences
- Avoid complex punctuation that doesn't translate to speech
- Include natural pauses with periods or commas
- Consider pronunciation of technical terms
- Each narration segment should be 15-30 seconds when spoken

Format your response as follows:
Step 1: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over, conversational tone, 20-40 words for natural 15-30 second duration]

Step 2: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over, conversational tone, 20-40 words for natural 15-30 second duration]

Step 3: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over, conversational tone, 20-40 words for natural 15-30 second duration]

Step 4: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over, conversational tone, 20-40 words for natural 15-30 second duration]

Step 5: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over, conversational tone, 20-40 words for natural 15-30 second duration]

Keep each step concise but informative, and make sure the progression is logical and easy to follow. The narration should be engaging and sound natural when spoken aloud. Focus on natural speech patterns and comfortable pacing.
"""
        
        response = await self._make_request(prompt, user_id)
        
        if not response:
            return None
            
        return self._parse_lesson_steps(response)
    
    def _parse_lesson_steps(self, response: str) -> List[CanvasStep]:
        """Parse the Ollama response into CanvasStep objects with explanation and narration"""
        steps = []
        lines = response.strip().split('\n')
        
        current_step = None
        current_explanation = []
        current_narration = []
        step_number = 1
        parsing_mode = None  # 'explanation' or 'narration'
        
        for line in lines:
            line = line.strip()
            
            if line.startswith(f"Step {step_number}:"):
                # Save previous step if exists
                if current_step and (current_explanation or current_narration):
                    explanation_text = '\n'.join(current_explanation).strip() if current_explanation else ""
                    narration_text = '\n'.join(current_narration).strip() if current_narration else ""
                    
                    steps.append(CanvasStep(
                        step_number=step_number - 1,
                        title=current_step,
                        explanation=explanation_text,
                        content=explanation_text or narration_text,  # Legacy field for backward compatibility
                        narration=narration_text,
                        duration=self._estimate_duration(narration_text, voice=None) if narration_text else None
                    ))
                
                # Start new step
                current_step = line.replace(f"Step {step_number}:", "").strip()
                current_explanation = []
                current_narration = []
                parsing_mode = None
                step_number += 1
                
            elif line.startswith("EXPLANATION:"):
                parsing_mode = 'explanation'
                explanation_content = line.replace("EXPLANATION:", "").strip()
                if explanation_content:
                    current_explanation.append(explanation_content)
                    
            elif line.startswith("NARRATION:"):
                parsing_mode = 'narration'
                narration_content = line.replace("NARRATION:", "").strip()
                if narration_content:
                    current_narration.append(narration_content)
                    
            elif line and current_step:
                if parsing_mode == 'explanation':
                    current_explanation.append(line)
                elif parsing_mode == 'narration':
                    current_narration.append(line)
                else:
                    # Default to explanation if no mode specified
                    current_explanation.append(line)
        
        # Add the last step
        if current_step and (current_explanation or current_narration):
            explanation_text = '\n'.join(current_explanation).strip() if current_explanation else ""
            narration_text = '\n'.join(current_narration).strip() if current_narration else ""
            
            steps.append(CanvasStep(
                step_number=step_number - 1,
                title=current_step,
                explanation=explanation_text,
                content=explanation_text or narration_text,  # Legacy field for backward compatibility
                narration=narration_text,
                duration=self._estimate_duration(narration_text) if narration_text else None
            ))
        
        # If parsing failed, create a fallback single step
        if not steps:
            steps.append(CanvasStep(
                step_number=1,
                title="Understanding the Topic",
                explanation=response,
                content=response,  # Legacy field for backward compatibility
                narration=response,
                duration=self._estimate_duration(response, voice=None)
            ))
        
        return steps
    
    def _estimate_duration(self, text: str, voice: str = None) -> float:
        """Estimate the duration of speech for given text in seconds using TTS calibration"""
        if not text:
            return 0.0
        
        # Try to use TTS service calibration if available
        try:
            from services.tts_service import piper_tts_service
            if hasattr(piper_tts_service, 'estimate_duration_with_calibration'):
                return piper_tts_service.estimate_duration_with_calibration(text, voice)
        except Exception as e:
            logger.warning(f"Could not use TTS calibration for duration estimation: {e}")
        
        # Fallback to improved estimation
        words = len(text.split())
        if words == 0:
            return max(len(text) * 0.05, 1.0)  # 50ms per character, minimum 1 second
        
        # More conservative baseline (150 WPM instead of 180)
        words_per_minute = 150
        duration_minutes = words / words_per_minute
        duration_seconds = duration_minutes * 60
        
        # Add buffer time for pauses, punctuation, and TTS processing
        buffer_factor = 1.3  # 30% buffer
        
        return max(duration_seconds * buffer_factor, 1.0)  # Minimum 1 second
    
    async def generate_doubt_answer(self, question: str, lesson_topic: str, user_id: str = "default") -> Optional[str]:
        """Generate an answer for a doubt/question about the lesson"""
        
        prompt = f"""
You are explaining the topic "{lesson_topic}" to a student. They have asked this question: "{question}"

Please provide a clear, helpful answer that:
1. Directly addresses their question
2. Relates back to the main topic
3. Uses simple language and examples
4. Encourages further learning

Answer:
"""
        
        return await self._make_request(prompt)
    
    async def generate_content(self, prompt: str, user_id: str = "default", max_tokens: int = 200, **kwargs) -> Optional[Dict[str, str]]:
        """Generate content using the LLM with a given prompt"""
        try:
            # Extract response_format from kwargs if provided
            response_format = kwargs.get('response_format', None)
            
            # Modify prompt if JSON format is requested
            if response_format == "json":
                prompt = f"{prompt}\n\nPlease respond in valid JSON format."
            
            response_text = await self._make_request(prompt, user_id)
            if response_text:
                content = response_text.strip()
                
                # If JSON format was requested, try to parse and return
                if response_format == "json":
                    if not content or content.strip() == "":
                        logger.warning("Empty response received when JSON format was requested")
                        return {
                            "content": "",
                            "status": "failed",
                            "error": "Empty response from LLM"
                        }
                    
                    try:
                        import json
                        # Clean up markdown code blocks if present
                        cleaned_content = self._extract_json_from_markdown(content)
                        json_data = json.loads(cleaned_content)
                        return {
                            "content": json_data,
                            "status": "success",
                            "format": "json"
                        }
                    except json.JSONDecodeError as e:
                        # If JSON parsing fails, return as text
                        logger.warning(f"JSON parsing failed: {e}. Content: {content[:100]}...")
                        return {
                            "content": content,
                            "status": "success", 
                            "format": "text",
                            "warning": "Requested JSON format but response is not valid JSON"
                        }
                else:
                    return {
                        "content": content,
                        "status": "success"
                    }
            else:
                return {
                    "content": "",
                    "status": "failed",
                    "error": "No response from LLM"
                }
        except Exception as e:
            logger.error(f"Failed to generate content: {e}")
            return {
                "content": "",
                "status": "failed",
                "error": str(e)
            }
    
    async def generate_visual_script(self, topic: str, difficulty_level: str = "beginner", user_id: str = "default") -> Optional[List[CanvasStep]]:
        """Generate a visual lesson script with narration and drawing instructions"""
        
        difficulty_prompts = {
            "beginner": "Explain this like I'm 5 years old, using very simple language and visual examples",
            "intermediate": "Explain this at a middle school level with clear visual demonstrations",
            "advanced": "Explain this at a high school level with detailed visual explanations"
        }
        
        difficulty_instruction = difficulty_prompts.get(difficulty_level, difficulty_prompts["beginner"])
        
        prompt = f"""
{difficulty_instruction}. Create a visual lesson script for "{topic}" that can be drawn step-by-step on a whiteboard or canvas.

Break this into exactly 5 sequential steps that build upon each other visually. For each step:
1. Provide a clear, engaging title
2. Write explanation text for reading
3. Write narration script that sounds natural when spoken (conversational, engaging)
4. Describe what visual elements should be drawn (shapes, arrows, text, diagrams)

TTS-AWARE NARRATION GUIDELINES:
- Target 140-160 words per minute speaking rate
- Write for natural speech: use contractions, shorter sentences
- Each narration should be 20-40 words for 15-30 second duration
- Avoid complex punctuation that doesn't translate to speech
- Include natural pauses and emphasis points
- Consider pronunciation of technical terms

Think about visual concepts like:
- Simple shapes (rectangles, circles, arrows)
- Flow diagrams and connections
- Labels and annotations
- Progressive building of concepts
- Clear visual metaphors and analogies

Format your response as follows:
Step 1: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over - natural, conversational tone, 20-40 words]
VISUAL_ELEMENTS: [Describe what to draw: shapes, text, arrows, positioning]

Step 2: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over - natural, conversational tone, 20-40 words]
VISUAL_ELEMENTS: [Describe what to draw: shapes, text, arrows, positioning]

[Continue for all 5 steps...]

Focus on topics that can be effectively visualized through simple drawings. Make the narration engaging and the visual descriptions clear enough that someone could recreate the drawings.
"""
        
        response = await self._make_request(prompt, user_id)
        
        if not response:
            return None
            
        return self._parse_visual_script(response)
    
    def _parse_visual_script(self, response: str) -> List[CanvasStep]:
        """Parse the visual script response into CanvasStep objects"""
        steps = []
        lines = response.strip().split('\n')
        
        current_step = None
        current_explanation = []
        current_narration = []
        current_visual_elements = []
        step_number = 1
        parsing_mode = None
        
        for line in lines:
            line = line.strip()
            
            if line.startswith(f"Step {step_number}:"):
                # Save previous step if exists
                if current_step and (current_explanation or current_narration):
                    explanation_text = '\n'.join(current_explanation).strip() if current_explanation else ""
                    narration_text = '\n'.join(current_narration).strip() if current_narration else ""
                    visual_elements_text = '\n'.join(current_visual_elements).strip() if current_visual_elements else ""
                    
                    steps.append(CanvasStep(
                        step_number=step_number - 1,
                        title=current_step,
                        explanation=explanation_text,
                        content=explanation_text or narration_text,  # Legacy field for backward compatibility
                        narration=narration_text,
                        visual_elements=[{"description": visual_elements_text}] if visual_elements_text else [],
                        duration=self._estimate_duration(narration_text, voice=None) if narration_text else None
                    ))
                
                # Start new step
                current_step = line.replace(f"Step {step_number}:", "").strip()
                current_explanation = []
                current_narration = []
                current_visual_elements = []
                parsing_mode = None
                step_number += 1
                
            elif line.startswith("EXPLANATION:"):
                parsing_mode = 'explanation'
                explanation_content = line.replace("EXPLANATION:", "").strip()
                if explanation_content:
                    current_explanation.append(explanation_content)
                    
            elif line.startswith("NARRATION:"):
                parsing_mode = 'narration'
                narration_content = line.replace("NARRATION:", "").strip()
                if narration_content:
                    current_narration.append(narration_content)
                    
            elif line.startswith("VISUAL_ELEMENTS:"):
                parsing_mode = 'visual_elements'
                visual_content = line.replace("VISUAL_ELEMENTS:", "").strip()
                if visual_content:
                    current_visual_elements.append(visual_content)
                    
            elif line and current_step:
                if parsing_mode == 'explanation':
                    current_explanation.append(line)
                elif parsing_mode == 'narration':
                    current_narration.append(line)
                elif parsing_mode == 'visual_elements':
                    current_visual_elements.append(line)
                else:
                    # Default to explanation if no mode specified
                    current_explanation.append(line)
        
        # Add the last step
        if current_step and (current_explanation or current_narration):
            explanation_text = '\n'.join(current_explanation).strip() if current_explanation else ""
            narration_text = '\n'.join(current_narration).strip() if current_narration else ""
            visual_elements_text = '\n'.join(current_visual_elements).strip() if current_visual_elements else ""
            
            steps.append(CanvasStep(
                step_number=step_number - 1,
                title=current_step,
                explanation=explanation_text,
                content=explanation_text or narration_text,  # Legacy field for backward compatibility
                narration=narration_text,
                visual_elements=[{"description": visual_elements_text}] if visual_elements_text else [],
                duration=self._estimate_duration(narration_text) if narration_text else None
            ))
        
        # If parsing failed, create a fallback single step
        if not steps:
            steps.append(CanvasStep(
                step_number=1,
                title="Understanding the Topic",
                explanation=response,
                content=response,  # Legacy field for backward compatibility
                narration=response,
                visual_elements=[{"description": "Simple diagram or visual representation"}],
                duration=self._estimate_duration(response, voice=None)
            ))
        
        return steps
    
    async def health_check(self) -> bool:
        """Check if Ollama service is available"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                return response.status_code == 200
        except:
            return False
    
    async def test_llm_capability(self, model: str, prompt: str, streaming: bool = False, 
                                  temperature: float = 0.7, max_tokens: int = 150) -> Dict:
        """Test LLM capabilities including streaming support and feature detection"""
        import time
        
        start_time = time.time()
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                request_data = {
                    "model": model,
                    "prompt": prompt,
                    "stream": streaming,
                    "options": {
                        "temperature": temperature,
                        "num_predict": max_tokens,
                    }
                }
                
                if streaming:
                    response = await self._test_streaming_response(client, request_data)
                else:
                    response = await self._test_non_streaming_response(client, request_data)
                
                end_time = time.time()
                response_time = end_time - start_time
                
                # Get base features and update with actual streaming test result
                features = await self._detect_model_features(model)
                features["streaming"] = response.get("streaming_supported", streaming)
                
                return {
                    "success": True,
                    "response": response.get("response", ""),
                    "responseTime": response_time,
                    "tokenCount": response.get("token_count"),
                    "streaming": streaming,
                    "streamingMetrics": response.get("streaming_metrics"),
                    "streamingSupported": response.get("streaming_supported", streaming),
                    "features": features
                }
                
        except Exception as e:
            end_time = time.time()
            response_time = end_time - start_time
            
            return {
                "success": False,
                "error": str(e),
                "responseTime": response_time,
                "streaming": streaming
            }
    
    async def _test_streaming_response(self, client: httpx.AsyncClient, request_data: Dict) -> Dict:
        """Test streaming response functionality with real-time monitoring"""
        import time
        import asyncio
        
        try:
            start_time = time.time()
            response = await client.post(
                f"{self.base_url}/api/generate",
                json=request_data
            )
            
            if response.status_code == 200:
                if request_data["stream"]:
                    # Enhanced streaming validation with real-time monitoring
                    full_response = ""
                    chunk_count = 0
                    chunk_times = []
                    chunk_sizes = []
                    first_chunk_time = None
                    last_chunk_time = start_time
                    progressive_content = []
                    
                    async for line in response.aiter_lines():
                        if line.strip():
                            chunk_time = time.time()
                            
                            try:
                                import json
                                chunk = json.loads(line)
                                
                                if "response" in chunk and chunk["response"]:
                                    chunk_content = chunk["response"]
                                    full_response += chunk_content
                                    
                                    # Record streaming metrics
                                    chunk_count += 1
                                    chunk_sizes.append(len(chunk_content))
                                    progressive_content.append(chunk_content)
                                    
                                    if first_chunk_time is None:
                                        first_chunk_time = chunk_time
                                    
                                    # Calculate inter-chunk delay
                                    inter_chunk_delay = chunk_time - last_chunk_time
                                    chunk_times.append(inter_chunk_delay)
                                    last_chunk_time = chunk_time
                                    
                                    # Small delay to allow real-time monitoring
                                    await asyncio.sleep(0.001)
                                
                                # Check if streaming is complete
                                if chunk.get("done", False):
                                    break
                                    
                            except json.JSONDecodeError:
                                continue
                    
                    # Calculate streaming quality metrics
                    total_time = time.time() - start_time
                    first_token_latency = (first_chunk_time - start_time) if first_chunk_time else 0
                    avg_chunk_delay = sum(chunk_times) / len(chunk_times) if chunk_times else 0
                    total_tokens = sum(chunk_sizes)
                    tokens_per_second = total_tokens / total_time if total_time > 0 else 0
                    
                    # Validate actual streaming behavior
                    is_real_streaming = self._validate_streaming_behavior(
                        chunk_count, chunk_times, first_token_latency, total_time
                    )
                    
                    # Check content progression quality
                    content_quality = self._analyze_content_progression(progressive_content)
                    
                    return {
                        "response": full_response,
                        "streaming_supported": is_real_streaming,
                        "streaming_metrics": {
                            "chunk_count": chunk_count,
                            "first_token_latency": first_token_latency,
                            "average_chunk_delay": avg_chunk_delay,
                            "total_time": total_time,
                            "tokens_per_second": tokens_per_second,
                            "chunk_times": chunk_times[:10],  # First 10 for analysis
                            "content_quality": content_quality,
                            "real_streaming": is_real_streaming
                        }
                    }
                else:
                    result = response.json()
                    return {
                        "response": result.get("response", ""),
                        "streaming_supported": False
                    }
            else:
                raise Exception(f"HTTP {response.status_code}: {response.text}")
                
        except Exception as e:
            # If streaming fails, try non-streaming fallback
            try:
                request_data["stream"] = False
                fallback_response = await client.post(
                    f"{self.base_url}/api/generate",
                    json=request_data
                )
                
                if fallback_response.status_code == 200:
                    result = fallback_response.json()
                    return {
                        "response": result.get("response", ""),
                        "streaming_supported": False,
                        "streaming_error": str(e)
                    }
                else:
                    raise Exception(f"Both streaming and fallback failed: {str(e)}")
            except Exception as fallback_error:
                raise Exception(f"Streaming failed: {str(e)}, Fallback failed: {str(fallback_error)}")
    
    def _validate_streaming_behavior(self, chunk_count: int, chunk_times: list, 
                                   first_token_latency: float, total_time: float) -> bool:
        """Validate if response demonstrates real streaming behavior"""
        
        # Must have multiple chunks for streaming
        if chunk_count < 2:
            return False
        
        # First token should arrive relatively quickly (not buffered)
        if first_token_latency > 5.0:  # More than 5 seconds suggests buffering
            return False
        
        # Should have reasonable inter-chunk delays (not all at once)
        if chunk_times:
            # Check if chunks arrive progressively (not all at once)
            quick_chunks = sum(1 for delay in chunk_times if delay < 0.1)  # Less than 100ms
            if quick_chunks == len(chunk_times):
                # All chunks arrived too quickly - likely buffered
                return False
            
            # Check for consistent streaming pattern
            avg_delay = sum(chunk_times) / len(chunk_times)
            if avg_delay > 2.0:  # Average delay too high
                return False
        
        # Streaming should be reasonably efficient
        if total_time > 30.0:  # More than 30 seconds is too slow
            return False
        
        return True
    
    def _analyze_content_progression(self, progressive_content: list) -> Dict:
        """Analyze the quality of content progression in streaming"""
        if not progressive_content:
            return {"quality": "poor", "reason": "no_content"}
        
        total_chunks = len(progressive_content)
        
        # Check for meaningful progression
        cumulative_lengths = []
        current_length = 0
        for chunk in progressive_content:
            current_length += len(chunk)
            cumulative_lengths.append(current_length)
        
        # Good streaming should show steady progression
        if total_chunks < 3:
            quality = "poor"
            reason = "too_few_chunks"
        elif cumulative_lengths[-1] < 10:  # Less than 10 characters total
            quality = "poor" 
            reason = "content_too_short"
        else:
            # Check for steady growth pattern
            growth_rates = []
            for i in range(1, len(cumulative_lengths)):
                if cumulative_lengths[i-1] > 0:
                    growth_rate = cumulative_lengths[i] / cumulative_lengths[i-1]
                    growth_rates.append(growth_rate)
            
            if growth_rates and min(growth_rates) > 1.0:  # Always growing
                quality = "good"
                reason = "steady_progression"
            else:
                quality = "fair"
                reason = "irregular_progression"
        
        return {
            "quality": quality,
            "reason": reason,
            "chunk_count": total_chunks,
            "final_length": cumulative_lengths[-1] if cumulative_lengths else 0,
            "progression_pattern": cumulative_lengths[:5]  # First 5 for analysis
        }
    
    async def _test_non_streaming_response(self, client: httpx.AsyncClient, request_data: Dict) -> Dict:
        """Test non-streaming response functionality"""
        response = await client.post(
            f"{self.base_url}/api/generate",
            json=request_data
        )
        
        if response.status_code == 200:
            result = response.json()
            return {
                "response": result.get("response", ""),
                "token_count": result.get("eval_count"),
                "streaming_supported": True  # Assume streaming works if non-streaming works
            }
        else:
            raise Exception(f"HTTP {response.status_code}: {response.text}")
    
    async def _detect_model_features(self, model: str) -> Dict:
        """Detect model capabilities and features"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Get model info
                response = await client.post(
                    f"{self.base_url}/api/show",
                    json={"name": model}
                )
                
                if response.status_code == 200:
                    model_info = response.json()
                    logger.info(f"Model info for {model}: {model_info}")
                    
                    # Extract features from model info with fallbacks
                    context_length = await self._extract_context_length(model_info, model)
                    max_tokens = self._infer_max_tokens_from_model(model, context_length)
                    
                    features = {
                        "streaming": None,  # Will be determined by actual testing
                        "contextLength": context_length,
                        "multimodal": False,  # Remove unreliable detection
                        "functionCalling": False,  # Most local models don't support this
                        "visionSupport": False,  # Remove unreliable detection
                        "codeGeneration": False,  # Remove unreliable detection
                        "maxTokens": max_tokens,
                        "temperature": True,
                        "topP": True,
                        "frequencyPenalty": False,  # Ollama doesn't support these
                        "presencePenalty": False
                    }
                    
                    logger.info(f"Detected features for {model}: {features}")
                    return features
                else:
                    # Return default features if model info can't be retrieved
                    return self._get_default_features()
                    
        except Exception:
            return self._get_default_features()
    
    async def _extract_context_length(self, model_info: Dict, model_name: str) -> int:
        """Extract context length from model info and tags"""
        logger.info(f"Extracting context length for model: {model_name}")
        try:
            # First try to find context length in model_info from /api/show
            if "parameters" in model_info:
                params = model_info["parameters"]
                if "context_length" in params:
                    value = params["context_length"]
                    if value is not None:
                        return int(value)
                if "num_ctx" in params:
                    value = params["num_ctx"]
                    if value is not None:
                        return int(value)
            
            # Check model details for context info
            if "model_info" in model_info:
                info = model_info["model_info"]
                if isinstance(info, dict):
                    # Look for context-related fields
                    for key in ["context_length", "max_context", "ctx_len", "context_size"]:
                        if key in info:
                            value = info[key]
                            if value is not None:
                                return int(value)
            
            # Try to get info from Ollama tags API
            model_tags_info = await self.get_model_details_from_tags(model_name)
            if model_tags_info:
                # Check for context length in model details/tags
                if "details" in model_tags_info:
                    details = model_tags_info["details"]
                    for key in ["context_length", "num_ctx", "max_context"]:
                        if key in details:
                            value = details[key]
                            if value is not None:
                                return int(value)
                
                # Check model name/tag for known patterns
                tag_context = self._infer_context_from_model_tag(model_tags_info)
                if tag_context > 0:
                    return tag_context
            
            # Fallback to model name-based inference
            context_length = self._infer_context_from_model_name(model_name)
            logger.info(f"Using model name inference for {model_name}: {context_length} tokens")
            return context_length
            
        except (ValueError, TypeError) as e:
            logger.warning(f"Error extracting context length: {e}")
            return self._infer_context_from_model_name(model_name)
    
    def _infer_context_from_model_tag(self, model_tags_info: Dict) -> int:
        """Infer context length from model tag information"""
        try:
            # Check model name and size from tags
            model_name = model_tags_info.get("name", "").lower()
            model_size = model_tags_info.get("size", 0)
            
            # Known context lengths for popular models
            model_context_map = {
                "llama": {"32k": 32768, "16k": 16384, "8k": 8192, "4k": 4096},
                "gemma3n": {"default": 32768},  # Gemma 3n models default to 32k
                "gemma3": {"default": 32768},   # Gemma 3 models default to 32k
                "gemma2": {"8k": 8192, "default": 8192},  # Gemma 2 models default to 8k
                "gemma": {"32k": 32768, "8k": 8192, "2k": 2048, "default": 8192},
                "phi": {"16k": 16384, "4k": 4096},
                "mistral": {"32k": 32768, "8k": 8192},
                "codellama": {"16k": 16384, "4k": 4096},
                "deepseek": {"32k": 32768, "16k": 16384},
                "qwen": {"32k": 32768, "8k": 8192},
            }
            
            # Check for context indicators in model name
            for model_type, contexts in model_context_map.items():
                if model_type in model_name:
                    # First check for specific context indicators
                    for context_indicator, context_length in contexts.items():
                        if context_indicator != "default" and context_indicator in model_name:
                            return context_length
                    # If no specific indicator found, use default if available
                    if "default" in contexts:
                        return contexts["default"]
            
            # Infer based on model size (rough estimates)
            if model_size > 0:
                size_gb = model_size / (1024 * 1024 * 1024)  # Convert to GB
                if size_gb > 40:  # Large models (70B+)
                    return 8192
                elif size_gb > 15:  # Medium models (13B-70B)
                    return 4096
                elif size_gb > 5:  # Small models (7B-13B)
                    return 4096
                else:  # Very small models
                    return 2048
            
            return 0  # No inference possible
            
        except Exception as e:
            logger.warning(f"Error inferring context from model tag: {e}")
            return 0
    
    def _infer_context_from_model_name(self, model_name: str) -> int:
        """Infer context length from model name patterns"""
        model_lower = model_name.lower()
        
        # Check for explicit context length indicators
        context_patterns = {
            "32k": 32768, "16k": 16384, "8k": 8192, "4k": 4096, "2k": 2048,
            "32768": 32768, "16384": 16384, "8192": 8192, "4096": 4096, "2048": 2048
        }
        
        for pattern, context_length in context_patterns.items():
            if pattern in model_lower:
                return context_length
        
        # Model family defaults with specific variants
        if any(x in model_lower for x in ["llama3", "llama-3"]):
            return 8192  # Llama 3 typically has 8k context
        elif "llama" in model_lower:
            return 4096  # Older Llama models
        elif any(x in model_lower for x in ["gemma3n", "gemma-3n", "gemma3"]):
            return 32768  # Gemma 3n models support 32k context
        elif "gemma2" in model_lower:
            return 8192  # Gemma 2 models have 8k context
        elif "gemma" in model_lower:
            return 8192  # Original Gemma models typically have 8k context
        elif any(x in model_lower for x in ["phi3", "phi-3"]):
            return 16384  # Phi-3 has longer context
        elif "phi" in model_lower:
            return 4096  # Older Phi models
        elif "mistral" in model_lower:
            return 8192  # Mistral typically 8k
        elif "qwen" in model_lower:
            return 8192  # Qwen typically 8k
        elif any(x in model_lower for x in ["codellama", "code-llama"]):
            return 16384  # Code Llama often has longer context
        else:
            return 4096  # Conservative default
    
    
    def _infer_max_tokens_from_model(self, model: str, context_length: int) -> int:
        """Infer reasonable max tokens based on model and context length"""
        model_lower = model.lower()
        
        # For most models, max output is typically 25-50% of context length
        # but with reasonable minimums and maximums
        base_max = min(context_length // 2, 4096)  # Up to half context, max 4096
        
        # Model-specific adjustments
        if "7b" in model_lower or "8b" in model_lower:
            return min(base_max, 4096)
        elif "13b" in model_lower or "14b" in model_lower:
            return min(base_max, 8192)
        elif "30b" in model_lower or "34b" in model_lower:
            return min(base_max, 8192)
        elif "70b" in model_lower:
            return min(base_max, 8192)
        elif "gemma" in model_lower:
            return min(base_max, 8192)
        elif "llama" in model_lower:
            return min(base_max, 4096)
        else:
            return min(base_max, 2048)  # Conservative default
    
    def _extract_json_from_markdown(self, content: str) -> str:
        """Extract JSON content from markdown code blocks"""
        import re
        
        # Remove leading/trailing whitespace
        content = content.strip()
        
        # Pattern to match markdown code blocks with optional language identifier
        # Matches: ```json\n{...}\n``` or ```\n{...}\n```
        markdown_pattern = r'```(?:json)?\s*\n?(.*?)\n?```'
        
        # Try to find JSON in markdown code blocks
        matches = re.findall(markdown_pattern, content, re.DOTALL | re.IGNORECASE)
        if matches:
            # Use the first match (largest code block)
            json_content = matches[0].strip()
            logger.debug(f"Extracted JSON from markdown: {json_content[:100]}...")
            return json_content
        
        # If no markdown blocks found, try to extract JSON-like content
        # Look for content between first { and last }
        start_idx = content.find('{')
        end_idx = content.rfind('}')
        
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            json_content = content[start_idx:end_idx + 1]
            logger.debug(f"Extracted JSON from braces: {json_content[:100]}...")
            return json_content
        
        # Return original content if no extraction possible
        logger.debug("No JSON extraction possible, returning original content")
        return content
    
    def _get_default_features(self) -> Dict:
        """Get default feature set for unknown models"""
        return {
            "streaming": None,  # Will be determined by actual testing
            "contextLength": 4096,
            "multimodal": False,
            "functionCalling": False,
            "visionSupport": False,
            "codeGeneration": False,
            "maxTokens": 2048,
            "temperature": True,
            "topP": True,
            "frequencyPenalty": False,
            "presencePenalty": False
        }
    
    async def get_available_models(self) -> List[str]:
        """Get list of available models from Ollama"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    models = []
                    for model in data.get("models", []):
                        models.append(model.get("name", ""))
                    return models
                else:
                    return []
        except Exception:
            return []

    async def get_model_details_from_tags(self, model_name: str) -> Dict:
        """Get detailed model information from Ollama tags API"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    for model in data.get("models", []):
                        if model.get("name") == model_name:
                            return model
                    return {}
                else:
                    return {}
        except Exception:
            return {}
    
    # Chunked Content Generation Methods
    
    async def generate_chunked_lesson(
        self,
        topic: str,
        difficulty_level: str = "beginner",
        content_type: str = "definition",
        target_duration: float = 120.0,
        user_id: str = "default"
    ) -> AsyncGenerator[Tuple[Dict, Optional[Dict]], None]:
        """
        Generate lesson using chunked content generation with progress updates.
        
        Args:
            topic: Educational topic to cover
            difficulty_level: beginner, intermediate, or advanced
            content_type: Type of content (definition, process, comparison, etc.)
            target_duration: Total target duration in seconds
            user_id: User ID for personalized settings
            
        Yields:
            Tuple of (progress_dict, chunk_result_dict_or_none)
        """
        
        if not self.chunked_generator:
            logger.error("Chunked generation not available")
            yield {
                "status": "error",
                "error": "Chunked generation not available",
                "total_chunks": 0,
                "completed_chunks": 0
            }, None
            return
        
        try:
            # Convert string parameters to enums
            difficulty_enum = self._string_to_difficulty(difficulty_level)
            content_type_enum = self._string_to_content_type(content_type)
            
            logger.info(f"Starting chunked lesson generation: {topic}")
            
            # Generate chunked lesson with progress updates
            async for progress, chunk_result in self.chunked_generator.generate_chunked_lesson(
                topic=topic,
                difficulty=difficulty_enum,
                content_type=content_type_enum,
                target_total_duration=target_duration,
                user_id=user_id
            ):
                # Convert progress to dict for JSON serialization
                progress_dict = {
                    "status": progress.status.value,
                    "total_chunks": progress.total_chunks,
                    "completed_chunks": progress.completed_chunks,
                    "current_chunk": progress.current_chunk,
                    "estimated_time_remaining": progress.estimated_time_remaining,
                    "current_operation": progress.current_operation,
                    "errors": progress.errors
                }
                
                # Convert chunk result to dict if available
                chunk_dict = None
                if chunk_result:
                    chunk_dict = {
                        "chunk_id": chunk_result.chunk_id,
                        "chunk_number": chunk_result.chunk_number,
                        "timeline_events": chunk_result.timeline_events,
                        "chunk_summary": chunk_result.chunk_summary,
                        "next_chunk_hint": chunk_result.next_chunk_hint,
                        "concepts_introduced": chunk_result.concepts_introduced,
                        "visual_elements_created": chunk_result.visual_elements_created,
                        "generation_time": chunk_result.generation_time,
                        "token_count": chunk_result.token_count,
                        "status": chunk_result.status.value,
                        "error_message": chunk_result.error_message
                    }
                
                yield progress_dict, chunk_dict
                
        except Exception as e:
            logger.error(f"Error in chunked lesson generation: {e}")
            yield {
                "status": "failed",
                "error": str(e),
                "total_chunks": 0,
                "completed_chunks": 0
            }, None
    
    async def convert_chunks_to_canvas_steps(
        self,
        chunk_results: List[Dict],
        topic: str
    ) -> List[CanvasStep]:
        """
        Convert chunk generation results to CanvasStep format for compatibility.
        
        Args:
            chunk_results: List of chunk result dictionaries
            topic: Original topic for context
            
        Returns:
            List of CanvasStep objects
        """
        
        if not self.chunked_generator:
            logger.warning("Chunked generator not available, returning empty list")
            return []
        
        try:
            # Note: Chunked generation functionality moved to unused-code/
            # This advanced feature is not used in the current simplified flow
            logger.info("Chunked generation requested but feature moved to unused-code/")
            return []
            
        except Exception as e:
            logger.error(f"Error converting chunks to canvas steps: {e}")
            return []
    
    def get_chunked_generation_stats(self) -> Dict:
        """Get statistics about chunked content generation performance"""
        
        if not self.chunked_generator:
            return {"status": "unavailable", "reason": "chunked_generation_not_available"}
        
        try:
            return self.chunked_generator.get_generation_stats()
        except Exception as e:
            logger.error(f"Error getting generation stats: {e}")
            return {"status": "error", "error": str(e)}
    
    def _string_to_difficulty(self, difficulty_str: str) -> 'DifficultyLevel':
        """Convert string difficulty to DifficultyLevel enum"""
        difficulty_map = {
            "beginner": DifficultyLevel.BEGINNER,
            "intermediate": DifficultyLevel.INTERMEDIATE,
            "advanced": DifficultyLevel.ADVANCED
        }
        return difficulty_map.get(difficulty_str.lower(), DifficultyLevel.BEGINNER)
    
    def _string_to_content_type(self, content_type_str: str) -> 'ContentType':
        """Convert string content type to ContentType enum"""
        content_type_map = {
            "definition": ContentType.DEFINITION,
            "process": ContentType.PROCESS,
            "comparison": ContentType.COMPARISON,
            "example": ContentType.EXAMPLE,
            "list": ContentType.LIST,
            "concept_map": ContentType.CONCEPT_MAP,
            "formula": ContentType.FORMULA,
            "story": ContentType.STORY
        }
        return content_type_map.get(content_type_str.lower(), ContentType.DEFINITION)
    
    async def analyze_topic_for_chunking(
        self,
        topic: str,
        difficulty_level: str = "beginner",
        content_type: str = "definition",
        target_duration: float = 120.0,
        user_id: str = "default"
    ) -> Dict:
        """
        Analyze topic and provide chunking recommendations without generating content.
        
        Args:
            topic: Educational topic to analyze
            difficulty_level: Target difficulty level
            content_type: Type of content to generate
            target_duration: Target total duration
            user_id: User ID for personalized settings
            
        Returns:
            Dictionary with chunking analysis and recommendations
        """
        
        if not self.chunked_generator:
            return {
                "status": "unavailable",
                "reason": "chunked_generation_not_available"
            }
        
        try:
            # Convert string parameters to enums
            difficulty_enum = self._string_to_difficulty(difficulty_level)
            content_type_enum = self._string_to_content_type(content_type)
            
            logger.info(f"Analyzing topic for chunking: {topic}")
            
            # Get chunking analysis
            recommendation, chunk_configs = await self.chunked_generator.analyze_and_plan_chunks(
                topic=topic,
                difficulty=difficulty_enum,
                content_type=content_type_enum,
                target_total_duration=target_duration,
                user_id=user_id
            )
            
            # Convert to serializable format
            return {
                "status": "success",
                "recommendation": {
                    "chunk_size": recommendation.chunk_size.value,
                    "target_duration": recommendation.target_duration,
                    "target_tokens": recommendation.target_tokens,
                    "estimated_chunks_needed": recommendation.estimated_chunks_needed,
                    "break_points": recommendation.break_points,
                    "reasoning": recommendation.reasoning,
                    "complexity_factors": recommendation.complexity_factors,
                    "confidence": recommendation.confidence
                },
                "chunk_configs": [
                    {
                        "max_tokens": config.max_tokens,
                        "target_duration": config.target_duration,
                        "content_type": config.content_type.value,
                        "difficulty": config.difficulty.value,
                        "include_visual_instructions": config.include_visual_instructions,
                        "maintain_continuity": config.maintain_continuity
                    }
                    for config in chunk_configs
                ]
            }
            
        except Exception as e:
            logger.error(f"Error analyzing topic for chunking: {e}")
            return {
                "status": "error",
                "error": str(e)
            }


# Global instance
ollama_service = OllamaService()