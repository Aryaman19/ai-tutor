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
                generated_content = await self._call_llm(prompt, element_constraints)
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
            # Call Ollama service
            response = await self.ollama_service.generate_content(
                prompt=prompt,
                max_tokens=min(constraints.get("maxChars", 300) * 2, 1000),  # Rough token estimate
                temperature=0.7,
                model="gemma2:3b"  # Use the model from CLAUDE.md
            )
            
            # Extract and validate content
            content = response.get("response", "").strip()
            
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