"""
Template Filling Service for LLM-powered content generation
"""
import json
import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

@dataclass
class FilledTemplate:
    """Represents a template filled with LLM-generated content"""
    template_id: str
    topic: str
    slide_index: int
    filled_content: Dict[str, str]
    metadata: Dict[str, Any]
    is_fallback: bool = False

class TemplateFiller:
    """Service for filling templates with LLM-generated content"""
    
    def __init__(self, ollama_service=None):
        self.ollama_service = ollama_service
        
    async def fill_template(
        self, 
        template: Dict, 
        topic: str, 
        slide_index: int = 0,
        container_size: Optional[Dict] = None
    ) -> FilledTemplate:
        """
        Fill a template with LLM-generated content for a specific topic
        
        Args:
            template: Template definition with placeholders and prompts
            topic: The educational topic to generate content for
            slide_index: Which slide to fill (default: 0)
            container_size: Optional container size for responsive constraints
            
        Returns:
            FilledTemplate with generated content
        """
        
        if slide_index >= len(template["slides"]):
            raise ValueError(f"Slide index {slide_index} out of range")
        
        slide = template["slides"][slide_index]
        
        # Get responsive constraints if container size provided
        constraints = self._get_responsive_constraints(slide, container_size)
        
        try:
            # Generate content using LLM
            filled_content = await self._generate_content_with_llm(
                slide, topic, constraints
            )
            
            return FilledTemplate(
                template_id=template["id"],
                topic=topic,
                slide_index=slide_index,
                filled_content=filled_content,
                metadata={
                    "generation_method": "llm",
                    "template_name": template["name"],
                    "constraints": constraints,
                    "slide_id": slide["id"]
                },
                is_fallback=False
            )
            
        except Exception as e:
            logger.error(f"Failed to generate LLM content for template {template['id']}: {e}")
            
            # Fall back to fallback data
            return self._create_fallback_template(template, topic, slide_index)
    
    async def fill_template_with_prompts(
        self,
        template: Dict,
        content_prompts: Dict[str, str],
        topic: str,
        difficulty_level: str = "intermediate",
        slide_index: int = 0,
        container_size: Optional[Dict] = None
    ) -> FilledTemplate:
        """
        Fill a template using structured content prompts from lesson structure service
        
        Args:
            template: Template definition 
            content_prompts: Generated prompts for each content field
            topic: The educational topic
            difficulty_level: Difficulty level for content generation
            slide_index: Which slide to fill (default: 0)
            container_size: Optional container size for responsive constraints
            
        Returns:
            FilledTemplate with generated content
        """
        
        if slide_index >= len(template["slides"]):
            raise ValueError(f"Slide index {slide_index} out of range")
        
        slide = template["slides"][slide_index]
        
        # Get responsive constraints
        constraints = self._get_responsive_constraints(slide, container_size)
        
        try:
            # Generate content using structured prompts
            filled_content = await self._generate_content_from_structured_prompts(
                content_prompts, constraints, difficulty_level
            )
            
            return FilledTemplate(
                template_id=template["id"],
                topic=topic,
                slide_index=slide_index,
                filled_content=filled_content,
                metadata={
                    "generation_method": "structured_prompts",
                    "template_name": template["name"],
                    "constraints": constraints,
                    "slide_id": slide["id"],
                    "difficulty_level": difficulty_level
                },
                is_fallback=False
            )
            
        except Exception as e:
            logger.error(f"Failed to generate content from structured prompts for template {template['id']}: {e}")
            
            # Fall back to fallback data
            return self._create_fallback_template(template, topic, slide_index)
    
    def _get_responsive_constraints(
        self, 
        slide: Dict, 
        container_size: Optional[Dict]
    ) -> Dict[str, Any]:
        """Get responsive constraints based on container size"""
        
        if not container_size:
            # Use desktop defaults
            return self._extract_constraints(slide["layout"])
        
        # Determine breakpoint
        width = container_size.get("width", 800)
        if width < 768:
            breakpoint = "mobile"
        elif width < 1024:
            breakpoint = "tablet"
        else:
            breakpoint = "desktop"
        
        # Merge base layout with responsive overrides
        layout = slide["layout"].copy()
        responsive_overrides = slide.get("responsive", {}).get(breakpoint, {})
        
        for element_type, overrides in responsive_overrides.items():
            if element_type in layout:
                layout[element_type].update(overrides)
        
        return self._extract_constraints(layout)
    
    def _extract_constraints(self, layout: Dict) -> Dict[str, Any]:
        """Extract character and line constraints from layout"""
        constraints = {}
        
        for element_type, config in layout.items():
            constraints[element_type] = {
                "maxChars": config.get("maxChars", 300),
                "maxLines": config.get("maxLines", 5),
                "format": config.get("format", "text")
            }
        
        return constraints
    
    async def _generate_content_with_llm(
        self, 
        slide: Dict, 
        topic: str, 
        constraints: Dict
    ) -> Dict[str, str]:
        """Generate content using LLM for each placeholder"""
        
        placeholders = slide.get("placeholders", {})
        llm_prompts = slide.get("llmPrompts", {})
        filled_content = {}
        
        for placeholder_key, placeholder_value in placeholders.items():
            if placeholder_key in llm_prompts:
                # Get the prompt template
                prompt_template = llm_prompts[placeholder_key]
                
                # Get constraints for this element
                element_constraints = constraints.get(placeholder_key, {})
                
                # Build the actual prompt
                prompt = self._build_prompt(
                    prompt_template, 
                    topic, 
                    element_constraints
                )
                
                # Generate content with LLM
                raw_content = await self._call_llm(prompt, element_constraints)
                
                # Sanitize the LLM output immediately to remove markdown formatting
                generated_content = self._sanitize_llm_output(raw_content)
                filled_content[placeholder_key] = generated_content
                
                logger.debug(f"Generated content for {placeholder_key}: {generated_content[:100]}...")
            else:
                # No prompt defined, use fallback
                fallback_data = slide.get("fallbackData", {})
                filled_content[placeholder_key] = fallback_data.get(
                    placeholder_key, 
                    f"[No content generated for {placeholder_key}]"
                )
        
        return filled_content
    
    async def _generate_content_from_structured_prompts(
        self,
        content_prompts: Dict[str, str],
        constraints: Dict[str, Any],
        difficulty_level: str
    ) -> Dict[str, str]:
        """
        Generate content using structured prompts from lesson structure service
        
        Args:
            content_prompts: Dict with field names as keys and prompts as values
            constraints: Responsive constraints for content generation
            difficulty_level: Difficulty level for tailoring content complexity
            
        Returns:
            Dict with field names as keys and generated content as values
        """
        filled_content = {}
        
        for field_name, prompt in content_prompts.items():
            try:
                # Get constraints for this specific field
                field_constraints = constraints.get(field_name, {
                    "maxChars": self._get_default_max_chars(field_name),
                    "maxLines": self._get_default_max_lines(field_name),
                    "format": "text"
                })
                
                # Enhance prompt with difficulty and constraints
                enhanced_prompt = self._enhance_prompt_with_constraints(
                    prompt, field_constraints, difficulty_level
                )
                
                # Generate content with LLM
                generated_content = await self._call_llm_with_retry(
                    enhanced_prompt, field_constraints, field_name
                )
                
                filled_content[field_name] = generated_content
                logger.debug(f"Generated {field_name}: {generated_content[:50]}...")
                
            except Exception as e:
                logger.error(f"Failed to generate content for {field_name}: {e}")
                
                # Use fallback content
                filled_content[field_name] = self._get_fallback_content(field_name)
        
        return filled_content
    
    def _get_default_max_chars(self, field_name: str) -> int:
        """Get default character limits based on field type"""
        char_limits = {
            "heading": 60,
            "title": 60,
            "content": 280,
            "body": 280,
            "text": 280,
            "description": 200,
            "summary": 150,
            "objective": 120
        }
        return char_limits.get(field_name, 200)
    
    def _get_default_max_lines(self, field_name: str) -> int:
        """Get default line limits based on field type"""
        line_limits = {
            "heading": 1,
            "title": 1,
            "content": 5,
            "body": 5,
            "text": 4,
            "description": 3,
            "summary": 3,
            "objective": 2
        }
        return line_limits.get(field_name, 3)
    
    def _enhance_prompt_with_constraints(
        self,
        prompt: str,
        constraints: Dict[str, Any],
        difficulty_level: str
    ) -> str:
        """Enhance prompt with constraints and difficulty-specific instructions"""
        
        enhanced_prompt = prompt
        
        # Add character limit instruction
        max_chars = constraints.get("maxChars", 200)
        enhanced_prompt += f" Keep response under {max_chars} characters."
        
        # Add line limit instruction
        max_lines = constraints.get("maxLines", 3)
        if max_lines == 1:
            enhanced_prompt += " Provide a single line response."
        else:
            enhanced_prompt += f" Use maximum {max_lines} lines."
        
        # Add difficulty-specific instructions
        difficulty_instructions = {
            "beginner": " Use simple language and avoid jargon. Be clear and concise.",
            "intermediate": " Use clear explanations with appropriate technical terms.",
            "advanced": " Provide detailed explanations with precise terminology."
        }
        
        enhanced_prompt += difficulty_instructions.get(difficulty_level, "")
        
        # Add strict topic adherence instruction to prevent off-topic content
        enhanced_prompt += " IMPORTANT: Stay strictly on the given topic. Do not include unrelated examples, analogies, or information from other subjects."
        
        # Add strong formatting instruction to prevent markdown
        enhanced_prompt += " CRITICAL: Respond with plain text only. Do not use markdown formatting, asterisks (*), underscores (_), hash symbols (#), or any special formatting symbols. Do not include character counts or word counts in your response."
        
        # Add format instructions
        format_type = constraints.get("format", "text")
        if format_type == "bullets":
            enhanced_prompt += " Format as bullet points using • symbols."
        
        return enhanced_prompt
    
    def _sanitize_llm_output(self, content: str) -> str:
        """Sanitize LLM output by removing markdown formatting and metadata immediately after generation"""
        if not content:
            return content
        
        # Remove character count annotations like "(116 characters)", "(XXX words)", etc.
        content = re.sub(r'\(\d+\s*(characters?|words?|chars?)\)', '', content, flags=re.IGNORECASE)
        
        # Remove markdown bold formatting
        content = re.sub(r'\*\*(.*?)\*\*', r'\1', content)
        
        # Remove markdown italic formatting (single asterisks)
        content = re.sub(r'\*(.*?)\*', r'\1', content)
        
        # Remove any remaining standalone asterisks
        content = re.sub(r'\*+', '', content)
        
        # Remove markdown underscores
        content = re.sub(r'__(.*?)__', r'\1', content)
        content = re.sub(r'_(.*?)_', r'\1', content)
        
        # Remove markdown headers
        content = re.sub(r'^#+\s*', '', content, flags=re.MULTILINE)
        
        # Remove markdown code blocks
        content = re.sub(r'```[^`]*```', '', content, flags=re.DOTALL)
        content = re.sub(r'`([^`]*)`', r'\1', content)
        
        # Remove markdown links but keep the text
        content = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', content)
        
        # Clean up colons followed by formatting artifacts
        content = re.sub(r':\s*\*\*', ': ', content)
        content = re.sub(r':\s*\*', ': ', content)
        content = re.sub(r':\s*#+', ': ', content)
        
        # Remove any remaining formatting artifacts
        content = re.sub(r'[\*_#`~\[\]]+', '', content)
        
        # Clean up multiple colons
        content = re.sub(r':{2,}', ':', content)
        
        # Remove "Option X" style prefixes that often come with formatting
        content = re.sub(r'^(Option\s+\d+\s*[:\-\(]*\s*(Concise|Brief|Short|Long|Detailed)?\s*[:\-\)]*\s*)', '', content, flags=re.IGNORECASE)
        
        # Normalize whitespace
        content = re.sub(r'\s+', ' ', content)
        
        # Remove leading/trailing punctuation artifacts
        content = re.sub(r'^[:\-\*\s]+', '', content)
        content = re.sub(r'[:\-\*\s]+$', '', content)
        
        return content.strip()
    
    async def _call_llm_with_retry(
        self,
        prompt: str,
        constraints: Dict[str, Any],
        field_name: str,
        max_retries: int = 2
    ) -> str:
        """Call LLM with retry logic for better reliability and topic adherence"""
        
        original_prompt = prompt
        
        for attempt in range(max_retries + 1):
            try:
                # Enhance prompt with topic focus on retries
                if attempt > 0:
                    focused_prompt = f"{original_prompt} Focus strictly on the specified topic. Avoid unrelated content or examples from other domains."
                    raw_content = await self._call_llm(focused_prompt, constraints)
                else:
                    raw_content = await self._call_llm(prompt, constraints)
                
                # Sanitize the LLM output immediately to remove markdown formatting
                content = self._sanitize_llm_output(raw_content)
                
                logger.debug(f"Generated content for {field_name}: '{content}' (length: {len(content)})")
                
                # Validate content quality and topic relevance
                if self._is_content_acceptable(content, field_name):
                    logger.debug(f"Content accepted for {field_name}")
                    return content
                else:
                    logger.warning(f"Content quality check failed for {field_name}, attempt {attempt + 1}. Content: '{content}'")
                    if attempt == max_retries:
                        logger.warning(f"All attempts failed for {field_name}, using fallback content")
                        # Use fallback instead of potentially bad content on final attempt
                        return self._get_fallback_content(field_name)
                    
            except Exception as e:
                if attempt == max_retries:
                    logger.error(f"LLM generation completely failed for {field_name}: {e}")
                    return self._get_fallback_content(field_name)
                logger.warning(f"LLM call failed for {field_name}, attempt {attempt + 1}: {e}")
                
        return self._get_fallback_content(field_name)
    
    def _is_content_acceptable(self, content: str, field_name: str) -> bool:
        """Check if generated content meets quality standards - relaxed for better success rate"""
        
        if not content or content.strip() == "":
            return False
        
        # More relaxed placeholder check - only reject obvious placeholders
        obvious_placeholders = [
            "{{", "}}", "placeholder", "TODO", "TBD",
            "insert here", "add here", "fill in", "[REPLACE"
        ]
        
        content_lower = content.lower()
        for indicator in obvious_placeholders:
            if indicator in content_lower:
                return False
        
        # Check for obvious off-topic content indicators
        # These are common signs of content contamination from different topics
        off_topic_indicators = [
            "dna", "genetic", "biology", "chromosome",  # Biology terms when not relevant
            "cooking", "recipe", "ingredient",  # Cooking terms when not relevant
            "weather", "climate", "temperature",  # Weather terms when not relevant
            "sports", "football", "basketball",  # Sports terms when not relevant
        ]
        
        # Only flag as off-topic if multiple indicators are present (avoids false positives)
        off_topic_count = sum(1 for indicator in off_topic_indicators if indicator in content_lower)
        if off_topic_count >= 2:
            logger.warning(f"Content appears off-topic for {field_name}: {content[:100]}...")
            return False
        
        # Check for remaining markdown formatting after sanitization (should be rare now)
        if '**' in content or content.count('*') > 3:  # Increased threshold since we pre-sanitize
            logger.warning(f"Content contains excessive markdown formatting for {field_name}: {content[:50]}...")
            return False
        
        # Much more relaxed minimum length requirements
        min_lengths = {
            "heading": 3,  # Reduced from 5
            "title": 3,    # Reduced from 5  
            "content": 10,  # Reduced from 20
            "body": 10,     # Reduced from 20
            "text": 5       # Reduced from 15
        }
        
        min_length = min_lengths.get(field_name, 3)  # More lenient default
        if len(content.strip()) < min_length:
            return False
        
        return True
    
    def _get_fallback_content(self, field_name: str) -> str:
        """Get high-quality fallback content when LLM generation fails"""
        # Improved fallback content that's more engaging and specific
        fallback_content = {
            "heading": "Key Learning Concepts",
            "title": "Understanding the Topic",
            "content": "This section covers essential information that builds your understanding of the key concepts step by step.",
            "body": "Important educational content is presented here to support effective learning and comprehension.",
            "text": "Essential information about the core concepts.",
            "description": "Detailed explanation of the fundamental principles.",
            "summary": "Key takeaways that reinforce your understanding.",
            "objective": "Students will gain clear understanding of essential concepts."
        }
        
        logger.info(f"Using improved fallback content for {field_name}")
        return fallback_content.get(field_name, "Quality educational content supports effective learning.")
    
    def _build_prompt(
        self, 
        prompt_template: str, 
        topic: str, 
        constraints: Dict
    ) -> str:
        """Build the actual LLM prompt from template and constraints"""
        
        # Replace topic placeholder
        prompt = prompt_template.replace("{{TOPIC}}", topic)
        
        # Replace constraint placeholders
        prompt = prompt.replace("{maxChars}", str(constraints.get("maxChars", 300)))
        prompt = prompt.replace("{maxLines}", str(constraints.get("maxLines", 5)))
        
        # Add additional formatting instructions based on format
        format_type = constraints.get("format", "text")
        if format_type == "bullets":
            prompt += " Use bullet points with • symbols."
        
        return prompt
    
    async def _call_llm(self, prompt: str, constraints: Dict) -> str:
        """Call the LLM service to generate content"""
        
        if not self.ollama_service:
            raise Exception("No LLM service available")
        
        try:
            # Add constraints to the prompt to guide generation
            max_chars = constraints.get("maxChars", 300)
            enhanced_prompt = f"{prompt} Keep your response under {max_chars} characters and make it clear and direct."
            
            # Call Ollama service using the correct method
            response_text = await self.ollama_service._make_request(enhanced_prompt, "system")
            
            if not response_text or not response_text.strip():
                logger.warning(f"Empty or None response from Ollama for prompt: {prompt[:50]}...")
                raise Exception("Empty response from LLM")
            
            content = response_text.strip()
            
            # Validate against constraints
            validated_content = self._validate_and_trim_content(content, constraints)
            
            return validated_content
            
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            raise Exception(f"Failed to generate content: {str(e)}")
    
    def _validate_and_trim_content(self, content: str, constraints: Dict) -> str:
        """Validate and trim content to fit constraints"""
        
        max_chars = constraints.get("maxChars", 300)
        max_lines = constraints.get("maxLines", 5)
        format_type = constraints.get("format", "text")
        
        # Handle bullet point formatting
        if format_type == "bullets":
            lines = content.split('\n')
            bullet_lines = []
            
            for line in lines[:max_lines]:  # Limit number of bullets
                line = line.strip()
                if line:
                    # Ensure bullet format
                    if not line.startswith('•') and not line.startswith('-'):
                        line = f"• {line}"
                    bullet_lines.append(line)
            
            content = '\n'.join(bullet_lines)
        else:
            # Handle regular text formatting
            lines = content.split('\n')
            if len(lines) > max_lines:
                content = '\n'.join(lines[:max_lines])
        
        # Trim to character limit while preserving word boundaries
        if len(content) > max_chars:
            # Find last space before the limit
            trimmed = content[:max_chars]
            last_space = trimmed.rfind(' ')
            
            if last_space > max_chars * 0.7:  # If space is reasonably close
                content = trimmed[:last_space] + "..."
            else:
                content = trimmed + "..."
        
        return content
    
    def _create_fallback_template(
        self, 
        template: Dict, 
        topic: str, 
        slide_index: int
    ) -> FilledTemplate:
        """Create a fallback template using fallback data"""
        
        slide = template["slides"][slide_index]
        fallback_data = slide.get("fallbackData", {})
        
        # Use fallback data as-is since it no longer contains brackets
        filled_content = fallback_data.copy()
        
        return FilledTemplate(
            template_id=template["id"],
            topic=topic,
            slide_index=slide_index,
            filled_content=filled_content,
            metadata={
                "generation_method": "fallback",
                "template_name": template["name"],
                "slide_id": slide["id"],
                "reason": "LLM generation failed"
            },
            is_fallback=True
        )

# Factory function for service creation
def create_template_filler(ollama_service=None) -> TemplateFiller:
    """Create a TemplateFiller instance with optional LLM service"""
    return TemplateFiller(ollama_service=ollama_service)