"""
AI Tutor Service

This service orchestrates the complete AI tutor lesson generation workflow:
1. Analyzes topic and creates lesson structure
2. Generates content for each slide using templates
3. Creates unified audio with crossfading
4. Calculates slide timing and positioning
5. Handles slide verification and fallback content
"""
import json
import logging
import asyncio
import time
import re
from typing import Dict, List, Any, Optional, AsyncGenerator, Tuple
from dataclasses import dataclass, asdict
from services.lesson_structure_service import lesson_structure_service, LessonStructure, SlideStructure
from services.template_service import template_service, ContainerSize
from services.template_filling_service import create_template_filler
from services.ollama_service import ollama_service

logger = logging.getLogger(__name__)

@dataclass
class GeneratedSlide:
    """Single generated slide with all data"""
    slide_number: int
    template_id: str
    template_name: str
    content_type: str
    filled_content: Dict[str, str]
    elements: List[Dict[str, Any]]
    narration: str
    estimated_duration: float
    position_offset: float  # horizontal position for multi-slide layout
    metadata: Dict[str, Any]
    generation_time: float
    status: str  # "success", "partial", "failed"
    error_message: Optional[str] = None

@dataclass
class AITutorLesson:
    """Complete AI tutor lesson with all slides"""
    topic: str
    difficulty_level: str
    target_duration: float
    lesson_structure: LessonStructure
    slides: List[GeneratedSlide]
    total_slides: int
    estimated_total_duration: float
    audio_url: Optional[str] = None
    audio_segments: List[Dict[str, Any]] = None
    canvas_states: List[Dict[str, Any]] = None
    generation_stats: Dict[str, Any] = None
    success: bool = False
    error: Optional[str] = None

class AITutorService:
    """Service for generating complete AI tutor lessons"""
    
    def __init__(self):
        self.slide_width = 1200  # Standard slide width
        self.slide_spacing = 100  # Space between slides
        self.crossfade_duration = 1.5  # 1500ms crossfade between audio segments for smoother transitions
        
    async def generate_ai_tutor_lesson(
        self, 
        topic: str, 
        difficulty_level: str, 
        target_duration: float,
        container_size: Optional[ContainerSize] = None
    ) -> AsyncGenerator[Tuple[Dict[str, Any], Optional[GeneratedSlide]], None]:
        """
        Generate complete AI tutor lesson with real-time progress updates
        
        Yields: (progress_update, slide_result) tuples
        """
        start_time = time.time()
        logger.info(f"Starting AI tutor lesson generation: {topic}")
        
        try:
            # Phase 1: Analyze lesson structure
            yield await self._progress_update("Analyzing lesson structure...", 0, 1), None
            
            lesson_structure = await lesson_structure_service.analyze_topic_structure(
                topic, difficulty_level, target_duration
            )
            
            total_slides = lesson_structure.total_slides
            logger.info(f"Lesson structure created: {total_slides} slides")
            
            # Phase 2: Generate slides one by one
            generated_slides = []
            container = container_size or ContainerSize(width=1200, height=800)
            
            for i, slide_structure in enumerate(lesson_structure.slides):
                progress = (i + 1) / total_slides
                yield await self._progress_update(
                    f"Generating slide {i+1}/{total_slides}: {slide_structure.content_type}", 
                    progress, total_slides
                ), None
                
                slide_result = await self._generate_single_slide(
                    slide_structure, i, total_slides, container
                )
                
                generated_slides.append(slide_result)
                
                # Yield the completed slide
                yield await self._progress_update(
                    f"Completed slide {i+1}/{total_slides}", 
                    progress, total_slides
                ), slide_result
            
            # Phase 3: Generate unified audio
            yield await self._progress_update("Creating unified audio...", 0.9, total_slides), None
            
            audio_result = await self._generate_unified_audio(generated_slides)
            
            # Phase 4: Calculate final timing and positioning
            yield await self._progress_update("Finalizing lesson...", 0.95, total_slides), None
            
            final_lesson = await self._finalize_lesson(
                topic, difficulty_level, target_duration, lesson_structure,
                generated_slides, audio_result, start_time
            )
            
            # Final completion update
            yield await self._progress_update("Lesson generation complete!", 1.0, total_slides), None
            
            # Properly terminate the async generator
            return
            
        except Exception as e:
            logger.error(f"AI tutor lesson generation failed: {e}")
            yield {
                "status": "error",
                "current_slide": 0,
                "total_slides": 0,
                "progress": 0.0,
                "message": f"Generation failed: {str(e)}",
                "error": str(e)
            }, None
            return
    
    async def _generate_single_slide(
        self, 
        slide_structure: SlideStructure, 
        slide_index: int, 
        total_slides: int,
        container_size: ContainerSize
    ) -> GeneratedSlide:
        """Generate a single slide with content, elements, and narration"""
        start_time = time.time()
        
        try:
            # Calculate horizontal position for this slide
            position_offset = slide_index * (self.slide_width + self.slide_spacing)
            
            # Test template rendering first with fallback content
            logger.debug(f"Testing template {slide_structure.template_id} before content generation")
            try:
                test_content = {"heading": "Test Title", "content": "Test content for validation"}
                test_result = template_service.render_template_with_content(
                    template_id=slide_structure.template_id,
                    filled_content=test_content,
                    container_size=container_size,
                    slide_index=0,
                    position_offset=0
                )
                logger.debug(f"Template test for {slide_structure.template_id}", {
                    "success": bool(test_result and test_result.get("elements")),
                    "elements_count": len(test_result.get("elements", [])) if test_result else 0
                })
            except Exception as test_error:
                logger.error(f"Template test failed for {slide_structure.template_id}: {test_error}")
            
            # Generate content using LLM
            filled_content = await self._generate_slide_content(slide_structure)
            
            # Verify and add fallback content if needed
            filled_content = self._verify_and_add_fallback(filled_content, slide_structure)
            
            # Get template and render elements
            elements = await self._render_slide_elements(
                slide_structure.template_id, filled_content, container_size, position_offset
            )
            
            # Generate narration
            narration = await self._generate_slide_narration(filled_content, slide_structure)
            
            generation_time = time.time() - start_time
            
            return GeneratedSlide(
                slide_number=slide_structure.slide_number,
                template_id=slide_structure.template_id,
                template_name=slide_structure.template_name,
                content_type=slide_structure.content_type,
                filled_content=filled_content,
                elements=elements,
                narration=narration,
                estimated_duration=slide_structure.estimated_duration,
                position_offset=position_offset,
                metadata={
                    "layout_hints": slide_structure.layout_hints,
                    "priority": slide_structure.priority,
                    "content_prompts": slide_structure.content_prompts
                },
                generation_time=generation_time,
                status="success"
            )
            
        except Exception as e:
            logger.error(f"Failed to generate slide {slide_index + 1}: {e}")
            return GeneratedSlide(
                slide_number=slide_structure.slide_number,
                template_id=slide_structure.template_id,
                template_name=slide_structure.template_name,
                content_type=slide_structure.content_type,
                filled_content={},
                elements=[],
                narration="",
                estimated_duration=slide_structure.estimated_duration,
                position_offset=slide_index * (self.slide_width + self.slide_spacing),
                metadata={"error": True},
                generation_time=time.time() - start_time,
                status="failed",
                error_message=str(e)
            )
    
    async def _generate_slide_content(self, slide_structure: SlideStructure) -> Dict[str, str]:
        """Generate content for slide using enhanced template filling system"""
        
        # Get template for constraints
        template = template_service.get_template(slide_structure.template_id)
        if not template:
            logger.error(f"Template {slide_structure.template_id} not found")
            return self._get_fallback_content(slide_structure)
        
        # Create template filler with ollama service
        from services.template_filling_service import create_template_filler
        template_filler = create_template_filler(ollama_service)
        
        try:
            # Extract topic and difficulty from prompts (they contain this context)
            topic = self._extract_topic_from_prompts(slide_structure.content_prompts)
            difficulty_level = self._extract_difficulty_from_prompts(slide_structure.content_prompts)
            
            logger.debug(f"Generating content for slide {slide_structure.slide_number}", {
                "content_type": slide_structure.content_type,
                "template_id": slide_structure.template_id,
                "topic": topic,
                "difficulty": difficulty_level
            })
            
            # Use template's built-in LLM prompts (including narration)
            filled_template = await template_filler.fill_template(
                template=template,
                topic=topic,
                slide_index=0,
                container_size={"width": self.slide_width, "height": 800}
            )
            
            logger.debug(f"Content generated successfully for slide {slide_structure.slide_number}", {
                "is_fallback": filled_template.is_fallback,
                "generation_method": filled_template.metadata.get("generation_method"),
                "content_keys": list(filled_template.filled_content.keys())
            })
            
            return filled_template.filled_content
            
        except Exception as e:
            logger.error(f"Enhanced content generation failed for slide {slide_structure.slide_number}: {e}")
            return self._get_fallback_content(slide_structure)
    
    def _extract_topic_from_prompts(self, content_prompts: Dict[str, str]) -> str:
        """Extract topic from content prompts"""
        for prompt in content_prompts.values():
            # Look for "Topic: " pattern in prompts
            if "Topic: " in prompt:
                topic_start = prompt.find("Topic: ") + 7
                topic_end = prompt.find(".", topic_start)
                if topic_end != -1:
                    return prompt[topic_start:topic_end].strip()
        return "Educational Topic"
    
    def _extract_difficulty_from_prompts(self, content_prompts: Dict[str, str]) -> str:
        """Extract difficulty level from content prompts"""
        for prompt in content_prompts.values():
            # Look for "Difficulty: " pattern in prompts
            if "Difficulty: " in prompt:
                difficulty_start = prompt.find("Difficulty: ") + 12
                difficulty_end = prompt.find(".", difficulty_start)
                if difficulty_end != -1:
                    difficulty = prompt[difficulty_start:difficulty_end].strip()
                    if difficulty in ["beginner", "intermediate", "advanced"]:
                        return difficulty
        return "intermediate"
    
    def _get_fallback_content(self, slide_structure: SlideStructure) -> Dict[str, str]:
        """Get fallback content when all generation methods fail"""
        
        fallback_content_map = {
            "title-objective": {
                "heading": f"Learning About {slide_structure.content_type.replace('-', ' ').title()}",
                "content": "By the end of this lesson, you will understand the key concepts and be able to apply what you've learned."
            },
            "context-motivation": {
                "heading": "Why This Matters",
                "content": "Understanding this topic is important for building a strong foundation in the subject and has practical applications in real-world scenarios."
            },
            "analogy": {
                "heading": "Think of It Like This",
                "content": "To help you understand this concept, imagine it like something familiar from everyday life that shares similar characteristics."
            },
            "definition": {
                "heading": "What Is It?",
                "content": "This concept can be defined as a fundamental principle that helps us understand how things work in this domain."
            },
            "step-by-step": {
                "heading": "How It Works",
                "content": "Let's break this down into clear, manageable steps: First, we identify the key components. Then, we examine how they interact. Finally, we see the overall result."
            },
            "examples": {
                "heading": "Real Examples",
                "content": "Here are some concrete examples that demonstrate this concept in action and help illustrate the key principles we've discussed."
            },
            "common-mistakes": {
                "heading": "Watch Out For These",
                "content": "Students often make certain mistakes when learning this topic. Being aware of these common pitfalls will help you avoid them."
            },
            "mini-recap": {
                "heading": "Key Takeaways",
                "content": "Let's review the most important points: we've covered the definition, seen examples, and learned how to apply the concepts correctly."
            },
            "things-to-ponder": {
                "heading": "Think About This",
                "content": "Consider how this concept connects to other things you've learned. What questions does it raise? How might you use this knowledge in the future?"
            }
        }
        
        return fallback_content_map.get(slide_structure.content_type, {
            "heading": "Educational Content",
            "content": "Important information about this topic will be covered to help you learn effectively."
        })
    
    def _verify_and_add_fallback(
        self, filled_content: Dict[str, str], slide_structure: SlideStructure
    ) -> Dict[str, str]:
        """Verify content and add fallback for missing/invalid content"""
        
        # First try to get template-specific fallback data
        template_fallback = {}
        try:
            template_data = template_service.get_template_prompts_and_fallbacks(
                slide_structure.template_id, 0
            )
            template_fallback = template_data.get("fallbacks", {})
        except Exception as e:
            logger.warning(f"Failed to get template fallbacks: {e}")
        
        # Generic fallback content if template fallback not available
        generic_fallback = {
            "title-objective": {
                "heading": slide_structure.content_type.replace("-", " ").title(),
                "content": "Learning objectives will be covered in this lesson."
            },
            "definition": {
                "heading": "Definition",
                "content": "Key definition and explanation will be provided."
            },
            "process": {
                "heading": "Process Steps", 
                "content": "Step-by-step process will be explained."
            },
            "example": {
                "heading": "Example",
                "content": "Concrete example will be demonstrated."
            },
            "formula": {
                "heading": "Formula",
                "content": "Key formula and variables will be explained."
            },
            "comparison": {
                "heading": "Comparison",
                "content": "Key differences will be highlighted."
            },
            "concept-map": {
                "heading": "Concept Overview",
                "content": "Relationships between concepts will be shown."
            },
            "summary": {
                "heading": "Summary",
                "content": "Key takeaways from this lesson."
            }
        }
        
        # Use template fallback first, then generic fallback
        slide_fallback = template_fallback if template_fallback else generic_fallback.get(
            slide_structure.content_type, {
                "heading": "Content",
                "content": "Content will be provided."
            }
        )
        
        # Add fallback for empty or missing content
        for field_name, fallback_text in slide_fallback.items():
            if not filled_content.get(field_name) or len(filled_content[field_name].strip()) < 5:
                filled_content[field_name] = fallback_text
                logger.info(f"Added fallback content for {field_name} from {'template' if template_fallback else 'generic'}")
        
        return filled_content
    
    async def _render_slide_elements(
        self, 
        template_id: str, 
        filled_content: Dict[str, str],
        container_size: ContainerSize,
        position_offset: float
    ) -> List[Dict[str, Any]]:
        """Render slide elements using template service"""
        try:
            logger.debug(f"Rendering elements for template {template_id}", {
                "filled_content": filled_content,
                "position_offset": position_offset,
                "container_size": {"width": container_size.width, "height": container_size.height}
            })
            
            # Use the template service directly to render with content and position offset
            result = template_service.render_template_with_content(
                template_id=template_id,
                filled_content=filled_content,
                container_size=container_size,
                slide_index=0,
                position_offset=position_offset
            )
            
            logger.debug(f"Template render result for {template_id}", {
                "result_type": type(result).__name__,
                "has_elements": "elements" in result if result else False,
                "elements_count": len(result.get("elements", [])) if result else 0,
                "result_keys": list(result.keys()) if result else None,
                "elements_preview": result.get("elements", [])[:1] if result and result.get("elements") else None
            })
            
            if result and result.get("elements"):
                elements = result["elements"]
                logger.debug(f"Successfully rendered {len(elements)} elements for template {template_id}")
                return elements
            else:
                logger.warning(f"No elements rendered for template {template_id}", {
                    "result": result,
                    "has_result": bool(result),
                    "result_elements": result.get("elements") if result else None
                })
                
                # Fallback: try to get template without content filling
                try:
                    fallback_result = template_service.get_template(template_id)
                    if fallback_result and fallback_result.get("elements"):
                        logger.info(f"Using fallback template elements for {template_id}")
                        # Adjust position offset for fallback elements
                        fallback_elements = fallback_result["elements"]
                        for element in fallback_elements:
                            if "x" in element:
                                element["x"] += position_offset
                        return fallback_elements
                except Exception as fallback_error:
                    logger.error(f"Fallback template fetch failed for {template_id}: {fallback_error}")
                
                return []
                
        except Exception as e:
            logger.error(f"Failed to render elements for template {template_id}: {e}", exc_info=True)
            
            # Last resort fallback: try to get basic template
            try:
                logger.info(f"Attempting last resort fallback for template {template_id}")
                fallback_result = template_service.get_template(template_id)
                if fallback_result and fallback_result.get("elements"):
                    logger.info(f"Last resort fallback successful for {template_id}")
                    fallback_elements = fallback_result["elements"]
                    for element in fallback_elements:
                        if "x" in element:
                            element["x"] += position_offset
                    return fallback_elements
            except Exception:
                pass
                
            return []
    
    def _sanitize_text_for_tts(self, text: str) -> str:
        """Sanitize text for TTS by removing markdown formatting and problematic characters"""
        if not text:
            return text
        
        # Remove emojis and other Unicode symbols that TTS may read aloud
        # This pattern matches most Unicode emoji characters
        text = re.sub(r'[\U0001F600-\U0001F64F]', '', text)  # Emoticons
        text = re.sub(r'[\U0001F300-\U0001F5FF]', '', text)  # Symbols & pictographs
        text = re.sub(r'[\U0001F680-\U0001F6FF]', '', text)  # Transport & map symbols
        text = re.sub(r'[\U0001F1E0-\U0001F1FF]', '', text)  # Flags (iOS)
        text = re.sub(r'[\U00002702-\U000027B0]', '', text)  # Dingbats
        text = re.sub(r'[\U000024C2-\U0001F251]', '', text)  # Enclosed characters
        
        # Remove common problematic prefixes that TTS reads aloud
        text = re.sub(r'^(NARRATION|Narration):\s*', '', text, flags=re.IGNORECASE | re.MULTILINE)
        text = re.sub(r'^(EXPLANATION|Explanation):\s*', '', text, flags=re.IGNORECASE | re.MULTILINE)
        text = re.sub(r'^Step\s+\d+:\s*', '', text, flags=re.IGNORECASE | re.MULTILINE)
        
        # Remove markdown bold formatting
        text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
        
        # Remove markdown italic formatting
        text = re.sub(r'\*(.*?)\*', r'\1', text)
        
        # Remove markdown underscores
        text = re.sub(r'__(.*?)__', r'\1', text)
        text = re.sub(r'_(.*?)_', r'\1', text)
        
        # Clean up colons that aren't part of proper sentences
        # Keep colons that are followed by a space and lowercase letter (likely definitions)
        # Remove colons at the end of lines or followed by markdown
        text = re.sub(r':\s*\*\*', ': ', text)  # Remove colon before bold
        text = re.sub(r':\s*\*', ': ', text)    # Remove colon before italic
        text = re.sub(r':\s*$', '.', text, flags=re.MULTILINE)  # Replace colon at end of line with period
        
        # Remove extra hash symbols from markdown headers
        text = re.sub(r'^#+\s*', '', text, flags=re.MULTILINE)
        
        # Remove markdown code blocks
        text = re.sub(r'```[^`]*```', '', text, flags=re.DOTALL)
        text = re.sub(r'`([^`]*)`', r'\1', text)
        
        # Remove markdown links but keep the text
        text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
        
        # Clean up bullet points - replace markdown bullets with periods for better speech flow
        text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)
        
        # Clean up multiple spaces and normalize whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove extra periods and normalize sentence endings
        text = re.sub(r'\.{2,}', '.', text)
        text = re.sub(r'\s*\.\s*\.', '.', text)
        
        # Clean up common TTS problematic sequences
        text = text.replace('e.g.', 'for example')
        text = text.replace('i.e.', 'that is')
        text = text.replace('etc.', 'and so on')
        
        return text.strip()
    
    async def _generate_slide_narration(
        self, filled_content: Dict[str, str], slide_structure: SlideStructure
    ) -> str:
        """Generate narration text for the slide using dedicated narration field"""
        
        # First priority: Use the dedicated narration field if available
        if "narration" in filled_content and filled_content["narration"]:
            raw_narration = filled_content["narration"].strip()
            if raw_narration:
                # Sanitize the dedicated narration text for TTS
                narration = self._sanitize_text_for_tts(raw_narration)
                
                # Ensure proper sentence ending
                if narration and not narration.endswith(('.', '!', '?')):
                    narration += "."
                
                logger.debug(f"Using dedicated narration field: {narration[:100]}...")
                return narration
        
        logger.warning(f"No narration field found for slide {slide_structure.slide_number}, falling back to content combination")
        
        # Fallback: Combine key content fields only if narration field is missing/empty
        content_parts = []
        
        if "heading" in filled_content and filled_content["heading"]:
            # Sanitize heading before adding
            sanitized_heading = self._sanitize_text_for_tts(filled_content["heading"])
            content_parts.append(sanitized_heading)
            
        if "content" in filled_content and filled_content["content"]:
            # Sanitize content before adding
            sanitized_content = self._sanitize_text_for_tts(filled_content["content"])
            content_parts.append(sanitized_content)
        
        # Don't add all other fields - only use heading and content as fallback
        # This prevents the verbose combination of every template field
        
        if not content_parts:
            return f"This slide covers {slide_structure.content_type.replace('-', ' ')}."
        
        # Create natural narration flow from key fields only
        narration = ". ".join(content_parts)
        
        # Apply final sanitization to the complete narration
        narration = self._sanitize_text_for_tts(narration)
        
        # Ensure proper sentence ending
        if narration and not narration.endswith(('.', '!', '?')):
            narration += "."
            
        logger.debug(f"Generated fallback narration: {narration[:100]}...")
        return narration
    
    async def _generate_unified_audio(self, slides: List[GeneratedSlide]) -> Dict[str, Any]:
        """Generate unified audio file with crossfading"""
        # For now, simulate audio generation
        # TODO: Integrate with actual audio engine when TTS is available
        
        audio_segments = []
        current_time = 0.0
        
        for slide in slides:
            if slide.narration:
                segment = {
                    "slide_number": slide.slide_number,
                    "text": slide.narration,
                    "start_time": current_time,
                    "duration": slide.estimated_duration,
                    "end_time": current_time + slide.estimated_duration
                }
                audio_segments.append(segment)
                current_time += slide.estimated_duration - self.crossfade_duration
        
        total_duration = audio_segments[-1]["end_time"] if audio_segments else 0.0
        
        return {
            "audio_url": f"/api/audio/lesson-{int(time.time())}.mp3",  # Placeholder
            "total_duration": total_duration,
            "segments": audio_segments,
            "crossfade_duration": self.crossfade_duration,
            "status": "generated"
        }
    
    async def _finalize_lesson(
        self,
        topic: str,
        difficulty_level: str,
        target_duration: float,
        lesson_structure: LessonStructure,
        slides: List[GeneratedSlide],
        audio_result: Dict[str, Any],
        start_time: float
    ) -> AITutorLesson:
        """Finalize lesson with all components"""
        
        # Calculate canvas states for timeline
        canvas_states = []
        for slide in slides:
            if slide.elements:
                canvas_state = {
                    "timestamp": 0,  # Will be updated with audio timing
                    "duration": slide.estimated_duration * 1000,  # Convert to ms
                    "elements": slide.elements,
                    "viewBox": {
                        "x": slide.position_offset,
                        "y": 0,
                        "width": self.slide_width,
                        "height": 800,
                        "zoom": 1.0
                    },
                    "metadata": {
                        "slide_number": slide.slide_number,
                        "content_type": slide.content_type,
                        "template_id": slide.template_id
                    }
                }
                canvas_states.append(canvas_state)
        
        # Calculate generation statistics
        successful_slides = len([s for s in slides if s.status == "success"])
        total_generation_time = time.time() - start_time
        
        generation_stats = {
            "total_generation_time": total_generation_time,
            "slides_generated": len(slides),
            "successful_slides": successful_slides,
            "success_rate": successful_slides / len(slides) if slides else 0,
            "average_slide_time": total_generation_time / len(slides) if slides else 0,
            "total_elements": sum(len(s.elements) for s in slides),
            "estimated_duration": sum(s.estimated_duration for s in slides)
        }
        
        success = successful_slides >= len(slides) * 0.8  # 80% success rate threshold
        
        return AITutorLesson(
            topic=topic,
            difficulty_level=difficulty_level,
            target_duration=target_duration,
            lesson_structure=lesson_structure,
            slides=slides,
            total_slides=len(slides),
            estimated_total_duration=audio_result.get("total_duration", 0),
            audio_url=audio_result.get("audio_url"),
            audio_segments=audio_result.get("segments", []),
            canvas_states=canvas_states,
            generation_stats=generation_stats,
            success=success,
            error=None if success else f"Only {successful_slides}/{len(slides)} slides generated successfully"
        )
    
    async def _progress_update(
        self, message: str, progress: float, total_slides: int
    ) -> Dict[str, Any]:
        """Create progress update"""
        return {
            "status": "generating",
            "message": message,
            "progress": progress,
            "current_slide": int(progress * total_slides) if total_slides > 0 else 0,
            "total_slides": total_slides,
            "timestamp": time.time()
        }

# Global instance
ai_tutor_service = AITutorService()