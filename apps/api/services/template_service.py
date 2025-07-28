"""
Template Service for managing educational templates and responsive layouts
"""
import json
import os
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

@dataclass
class ContainerSize:
    width: int
    height: int
    
    @property
    def breakpoint(self) -> str:
        """Determine responsive breakpoint based on width"""
        if self.width < 768:
            return "mobile"
        elif self.width < 1024:
            return "tablet"
        else:
            return "desktop"

@dataclass
class TemplateElement:
    """Represents a rendered template element with calculated positions"""
    id: str
    type: str
    x: float
    y: float
    width: float
    height: float
    text: str
    fontSize: int
    alignment: str
    color: str = "#1971c2"
    backgroundColor: str = "transparent"

class TemplateService:
    """Service for loading and processing educational templates"""
    
    def __init__(self):
        self.templates_cache: Dict[str, Dict] = {}
        self.templates_dir = Path(__file__).parent.parent / "data" / "templates"
        self._load_templates()
    
    def _load_templates(self):
        """Load all template files into cache"""
        try:
            # First try to load from categorized templates file
            categorized_file = self.templates_dir / "complete_categorized_templates.json"
            basic_file = self.templates_dir / "basic_templates.json"
            
            templates_loaded = False
            
            if basic_file.exists():
                with open(basic_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                for template in data.get("templates", []):
                    self.templates_cache[template["id"]] = template
                    
                logger.info(f"Loaded {len(self.templates_cache)} basic templates")
                templates_loaded = True
                
            elif categorized_file.exists():
                with open(categorized_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                for template in data.get("templates", []):
                    self.templates_cache[template["id"]] = template
                    
                logger.info(f"Loaded {len(self.templates_cache)} basic templates")
                templates_loaded = True
            
            if not templates_loaded:
                logger.warning(f"No template files found in: {self.templates_dir}")
                
        except Exception as e:
            logger.error(f"Failed to load templates: {e}")
    
    def get_all_templates(self) -> List[Dict]:
        """Get list of all available templates with metadata"""
        return [
            {
                "id": template["id"],
                "name": template["name"],
                "description": template["description"],
                "category": template.get("category", "misc"),
                "templateVariant": template.get("templateVariant", 1),
                "slideCount": len(template["slides"])
            }
            for template in self.templates_cache.values()
        ]
    
    def get_templates_by_category(self, category: str) -> List[Dict]:
        """Get templates filtered by category"""
        return [
            {
                "id": template["id"],
                "name": template["name"],
                "description": template["description"],
                "category": template.get("category", "misc"),
                "templateVariant": template.get("templateVariant", 1),
                "slideCount": len(template["slides"])
            }
            for template in self.templates_cache.values()
            if template.get("category", "misc") == category
        ]
    
    def get_available_categories(self) -> List[Dict]:
        """Get list of all available template categories with counts"""
        categories = {}
        for template in self.templates_cache.values():
            category = template.get("category", "misc")
            if category not in categories:
                categories[category] = {
                    "name": category,
                    "displayName": category.replace("-", " ").title(),
                    "count": 0,
                    "templates": []
                }
            categories[category]["count"] += 1
            categories[category]["templates"].append({
                "id": template["id"],
                "name": template["name"],
                "templateVariant": template.get("templateVariant", 1)
            })
        
        return list(categories.values())
    
    def get_template(self, template_id: str) -> Optional[Dict]:
        """Get a specific template by ID"""
        return self.templates_cache.get(template_id)
    
    def select_best_template(
        self, 
        category: str, 
        topic: str, 
        difficulty_level: str, 
        content_complexity: int = 3,
        topic_analysis: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict]:
        """
        Intelligently select the best template for a given category and context
        
        Args:
            category: Template category (e.g., "definition", "examples")
            topic: The lesson topic
            difficulty_level: "beginner", "intermediate", or "advanced"
            content_complexity: 1-5 scale of content complexity
            topic_analysis: Optional analysis from LLM with topic insights
        
        Returns:
            Best template dict or None if no suitable template found
        """
        
        available_templates = self.get_templates_by_category(category)
        if not available_templates:
            logger.warning(f"No templates found for category: {category}")
            return None
        
        if len(available_templates) == 1:
            return available_templates[0]
        
        # Score each template based on suitability
        scored_templates = []
        
        for template in available_templates:
            score = self._calculate_template_score(
                template, topic, difficulty_level, content_complexity, topic_analysis
            )
            scored_templates.append((template, score))
        
        # Sort by score (highest first) and return best match
        scored_templates.sort(key=lambda x: x[1], reverse=True)
        best_template = scored_templates[0][0]
        
        logger.debug(f"Selected template {best_template['id']} for category {category} with score {scored_templates[0][1]}")
        return best_template
    
    def _calculate_template_score(
        self, 
        template: Dict, 
        topic: str, 
        difficulty_level: str, 
        content_complexity: int,
        topic_analysis: Optional[Dict[str, Any]]
    ) -> float:
        """Calculate suitability score for a template"""
        
        score = 0.0
        
        # Base score for having the template
        score += 10.0
        
        # Prefer newer template variants (higher templateVariant numbers)
        variant = template.get("templateVariant", 1)
        score += variant * 2.0
        
        # Difficulty level matching
        difficulty_preferences = {
            "beginner": {"simple": 5.0, "clean": 4.0, "basic": 3.0},
            "intermediate": {"balanced": 5.0, "standard": 4.0, "detailed": 3.0},
            "advanced": {"comprehensive": 5.0, "detailed": 4.0, "complex": 3.0}
        }
        
        template_name_lower = template.get("name", "").lower()
        template_desc_lower = template.get("description", "").lower()
        
        for keyword, bonus in difficulty_preferences.get(difficulty_level, {}).items():
            if keyword in template_name_lower or keyword in template_desc_lower:
                score += bonus
        
        # Content complexity matching
        complexity_keywords = {
            1: ["simple", "basic", "clean"],
            2: ["clear", "standard"],
            3: ["balanced", "detailed"],
            4: ["comprehensive", "advanced"],
            5: ["complex", "detailed", "thorough"]
        }
        
        for keyword in complexity_keywords.get(content_complexity, []):
            if keyword in template_name_lower or keyword in template_desc_lower:
                score += 3.0
        
        # Topic-specific scoring
        if topic_analysis:
            teaching_approach = topic_analysis.get("teaching_approach", "").lower()
            
            # Visual approach preferences
            if teaching_approach == "visual":
                visual_keywords = ["visual", "diagram", "chart", "graphic"]
                for keyword in visual_keywords:
                    if keyword in template_name_lower or keyword in template_desc_lower:
                        score += 4.0
            
            # Step-by-step approach preferences
            elif teaching_approach == "step-by-step":
                process_keywords = ["step", "process", "sequential", "ordered"]
                for keyword in process_keywords:
                    if keyword in template_name_lower or keyword in template_desc_lower:
                        score += 4.0
            
            # Example-driven approach preferences
            elif teaching_approach == "example-driven":
                example_keywords = ["example", "case", "instance", "sample"]
                for keyword in example_keywords:
                    if keyword in template_name_lower or keyword in template_desc_lower:
                        score += 4.0
        
        # Category-specific preferences
        category_preferences = {
            "title-objective": ["clean", "simple", "clear"],
            "definition": ["clear", "concise", "focused"],
            "examples": ["practical", "concrete", "relatable"],
            "step-by-step": ["sequential", "ordered", "process"],
            "analogy": ["visual", "comparison", "relatable"],
            "common-mistakes": ["warning", "caution", "avoid"],
            "mini-recap": ["summary", "concise", "key"],
            "things-to-ponder": ["thought", "question", "reflection"]
        }
        
        template_category = template.get("category", "")
        for keyword in category_preferences.get(template_category, []):
            if keyword in template_name_lower or keyword in template_desc_lower:
                score += 2.0
        
        return score
    
    def get_template_with_fallback(
        self, 
        primary_template_id: str, 
        category: str,
        topic: str = "",
        difficulty_level: str = "intermediate"
    ) -> Dict:
        """
        Get template with intelligent fallback if primary template is not available
        
        Args:
            primary_template_id: Preferred template ID
            category: Template category as fallback
            topic: Topic for context-aware fallback selection
            difficulty_level: Difficulty level for fallback selection
        
        Returns:
            Template dict (either primary or best fallback)
        """
        
        # Try to get primary template
        primary_template = self.get_template(primary_template_id)
        if primary_template:
            return primary_template
        
        logger.warning(f"Primary template {primary_template_id} not found, using fallback")
        
        # Use intelligent selection for fallback
        fallback_template = self.select_best_template(
            category=category,
            topic=topic,
            difficulty_level=difficulty_level,
            content_complexity=3  # Default complexity
        )
        
        if fallback_template:
            return fallback_template
        
        # Last resort: get any template from category
        available_templates = self.get_templates_by_category(category)
        if available_templates:
            logger.warning(f"Using first available template in category {category}")
            return available_templates[0]
        
        # Final fallback: use first available template of any category
        if self.templates_cache:
            logger.error(f"No templates in category {category}, using any available template")
            return list(self.templates_cache.values())[0]
        
        raise ValueError(f"No templates available for fallback from {primary_template_id}")
    
    def render_template(
        self, 
        template_id: str, 
        container_size: ContainerSize,
        slide_index: int = 0
    ) -> Dict[str, Any]:
        """Render a template for specific container size with dummy data"""
        
        template = self.get_template(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")
        
        if slide_index >= len(template["slides"]):
            raise ValueError(f"Slide index {slide_index} out of range")
        
        slide = template["slides"][slide_index]
        
        # Get responsive configuration
        breakpoint = container_size.breakpoint
        responsive_config = slide.get("responsive", {}).get(breakpoint, {})
        
        # Merge base layout with responsive overrides
        layout = self._merge_layout_config(slide["layout"], responsive_config)
        
        # Calculate elements with fallback data
        elements = self._calculate_elements(
            layout, 
            slide.get("fallbackData", slide.get("dummyData", {})), 
            container_size
        )
        
        return {
            "templateId": template_id,
            "templateName": template["name"],
            "slideIndex": slide_index,
            "containerSize": {
                "width": container_size.width,
                "height": container_size.height,
                "breakpoint": breakpoint
            },
            "elements": [self._element_to_dict(el) for el in elements],
            "metadata": {
                "slideId": slide["id"],
                "slideType": slide["type"],
                "fallbackData": slide.get("fallbackData", slide.get("dummyData", {}))
            }
        }
    
    def render_filled_template(
        self, 
        template: Dict,
        filled_content: Dict[str, str],
        container_size: ContainerSize,
        slide_index: int = 0
    ) -> Dict[str, Any]:
        """Render a template using LLM-filled content"""
        
        if slide_index >= len(template["slides"]):
            raise ValueError(f"Slide index {slide_index} out of range")
        
        slide = template["slides"][slide_index]
        
        # Get responsive configuration
        breakpoint = container_size.breakpoint
        responsive_config = slide.get("responsive", {}).get(breakpoint, {})
        
        # Merge base layout with responsive overrides
        layout = self._merge_layout_config(slide["layout"], responsive_config)
        
        # Calculate elements with filled content
        elements = self._calculate_elements(
            layout, 
            filled_content, 
            container_size
        )
        
        return {
            "templateId": template["id"],
            "templateName": template["name"],
            "slideIndex": slide_index,
            "containerSize": {
                "width": container_size.width,
                "height": container_size.height,
                "breakpoint": breakpoint
            },
            "elements": [self._element_to_dict(el) for el in elements],
            "metadata": {
                "slideId": slide["id"],
                "slideType": slide["type"],
                "filledContent": filled_content
            }
        }
    
    def _merge_layout_config(self, base_layout: Dict, responsive_overrides: Dict) -> Dict:
        """Merge base layout with responsive configuration"""
        merged = {}
        
        for element_type, config in base_layout.items():
            merged[element_type] = config.copy()
            
            # Apply responsive overrides
            if element_type in responsive_overrides:
                merged[element_type].update(responsive_overrides[element_type])
        
        return merged
    
    def _calculate_elements(
        self, 
        layout: Dict, 
        dummy_data: Dict, 
        container_size: ContainerSize
    ) -> List[TemplateElement]:
        """Calculate element positions and sizes based on layout and container"""
        
        elements = []
        
        # Calculate responsive font sizes
        base_font_size = self._calculate_base_font_size(container_size)
        
        # Process heading
        if "heading" in layout and "heading" in dummy_data:
            heading_element = self._create_heading_element(
                layout["heading"],
                dummy_data["heading"],
                container_size,
                base_font_size
            )
            elements.append(heading_element)
        
        # Process content
        if "content" in layout and "content" in dummy_data:
            content_element = self._create_content_element(
                layout["content"],
                dummy_data["content"],
                container_size,
                base_font_size,
                heading_height=elements[0].height + elements[0].y if elements else 0
            )
            elements.append(content_element)
        
        return elements
    
    def _calculate_base_font_size(self, container_size: ContainerSize) -> int:
        """Calculate responsive base font size"""
        # Base font size calculation based on container width
        if container_size.width < 768:  # Mobile
            return max(14, min(18, container_size.width // 30))
        elif container_size.width < 1024:  # Tablet
            return max(16, min(20, container_size.width // 45))
        else:  # Desktop
            return max(18, min(24, container_size.width // 60))
    
    def _create_heading_element(
        self,
        config: Dict,
        text: str,
        container_size: ContainerSize,
        base_font_size: int
    ) -> TemplateElement:
        """Create heading element with calculated position and size"""
        
        # Font size mapping
        font_size_map = {
            "small": int(base_font_size * 1.2),
            "medium": int(base_font_size * 1.5),
            "large": int(base_font_size * 1.8),
            "xlarge": int(base_font_size * 2.2),
            "xxlarge": int(base_font_size * 2.6)
        }
        
        font_size = font_size_map.get(config.get("fontSize", "large"), base_font_size * 2)
        
        # Truncate text if needed
        max_chars = config.get("maxChars", 50)
        display_text = self._truncate_text(text, max_chars)
        
        # Calculate dimensions
        char_width = font_size * 0.6
        text_width = len(display_text) * char_width
        text_height = font_size * 1.4
        
        # Calculate position based on configuration
        padding = max(20, container_size.width * 0.05)
        
        if config["position"] == "center-top":
            x = (container_size.width - text_width) / 2
            y = padding + font_size * 0.5
        elif config["position"] == "left-top":
            x = padding
            y = padding + font_size * 0.5
        else:  # default center
            x = (container_size.width - text_width) / 2
            y = padding + font_size * 0.5
        
        return TemplateElement(
            id="heading",
            type="text",
            x=max(padding, x),
            y=y,
            width=min(text_width, container_size.width - 2 * padding),
            height=text_height,
            text=display_text,
            fontSize=font_size,
            alignment=config.get("alignment", "center"),
            color="#1971c2"
        )
    
    def _create_content_element(
        self,
        config: Dict,
        text: str,
        container_size: ContainerSize,
        base_font_size: int,
        heading_height: float = 0
    ) -> TemplateElement:
        """Create content element with calculated position and size"""
        
        font_size = base_font_size
        
        # Truncate text if needed
        max_chars = config.get("maxChars", 300)
        display_text = self._truncate_text(text, max_chars)
        
        # Handle bullet points formatting
        if config.get("format") == "bullets":
            display_text = self._format_bullets(display_text)
        
        # Calculate dimensions with text wrapping
        char_width = font_size * 0.6
        line_height = font_size * 1.6
        
        padding = max(20, container_size.width * 0.05)
        max_width = container_size.width - 2 * padding
        
        # Calculate text wrapping
        chars_per_line = int(max_width / char_width)
        lines = self._calculate_wrapped_lines(display_text, chars_per_line)
        
        text_width = min(max_width, max(len(line) for line in lines) * char_width)
        text_height = len(lines) * line_height
        
        # Calculate position
        if config["position"] == "center-middle":
            x = (container_size.width - text_width) / 2
            y = max(heading_height + 30, (container_size.height - text_height) / 2)
        elif config["position"] in ["left-middle", "left-content"]:
            x = padding
            y = heading_height + 30 if heading_height > 0 else padding + font_size
        elif config["position"] == "full-content":
            x = padding
            y = heading_height + 30 if heading_height > 0 else padding + font_size
        else:  # default
            x = padding
            y = heading_height + 30 if heading_height > 0 else padding + font_size
        
        return TemplateElement(
            id="content",
            type="text",
            x=x,
            y=y,
            width=text_width,
            height=text_height,
            text="\n".join(lines),
            fontSize=font_size,
            alignment=config.get("alignment", "left"),
            color="#374151"
        )
    
    def _truncate_text(self, text: str, max_chars: int) -> str:
        """Truncate text while preserving word boundaries"""
        if len(text) <= max_chars:
            return text
        
        truncated = text[:max_chars]
        last_space = truncated.rfind(' ')
        
        if last_space > max_chars * 0.7:  # If space is reasonably close to end
            return truncated[:last_space] + "..."
        
        return truncated + "..."
    
    def _format_bullets(self, text: str) -> str:
        """Ensure bullet points are properly formatted"""
        lines = text.split('\n')
        formatted_lines = []
        
        for line in lines:
            line = line.strip()
            if line and not line.startswith('•') and not line.startswith('-'):
                line = f"• {line}"
            formatted_lines.append(line)
        
        return '\n'.join(formatted_lines)
    
    def _calculate_wrapped_lines(self, text: str, chars_per_line: int) -> List[str]:
        """Calculate text wrapping for display"""
        if '\n' in text:
            # Handle existing line breaks (like bullet points)
            paragraphs = text.split('\n')
            lines = []
            for paragraph in paragraphs:
                if len(paragraph) <= chars_per_line:
                    lines.append(paragraph)
                else:
                    lines.extend(self._wrap_single_line(paragraph, chars_per_line))
            return lines
        else:
            return self._wrap_single_line(text, chars_per_line)
    
    def _wrap_single_line(self, text: str, chars_per_line: int) -> List[str]:
        """Wrap a single line of text"""
        words = text.split()
        lines = []
        current_line = ""
        
        for word in words:
            if len(current_line + " " + word) <= chars_per_line:
                current_line = current_line + " " + word if current_line else word
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word
        
        if current_line:
            lines.append(current_line)
        
        return lines
    
    def _element_to_dict(self, element: TemplateElement) -> Dict:
        """Convert TemplateElement to dictionary for JSON response"""
        return {
            "id": element.id,
            "type": element.type,
            "x": element.x,
            "y": element.y,
            "width": element.width,
            "height": element.height,
            "text": element.text,
            "fontSize": element.fontSize,
            "alignment": element.alignment,
            "color": element.color,
            "backgroundColor": element.backgroundColor
        }
    
    def get_template_prompts_and_fallbacks(self, template_id: str, slide_index: int = 0) -> Dict[str, Dict[str, str]]:
        """Get LLM prompts and fallback data for a template slide"""
        template = self.get_template(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")
        
        if slide_index >= len(template["slides"]):
            raise ValueError(f"Slide index {slide_index} out of range")
        
        slide = template["slides"][slide_index]
        
        # Extract LLM prompts and fallback data
        llm_prompts = slide.get("llmPrompts", {})
        fallback_data = slide.get("fallbackData", {})
        
        return {
            "prompts": llm_prompts,
            "fallbacks": fallback_data
        }
    
    def render_template_with_content(
        self,
        template_id: str,
        filled_content: Dict[str, str],
        container_size: ContainerSize,
        slide_index: int = 0,
        position_offset: float = 0.0
    ) -> Dict[str, Any]:
        """Render template with provided content and optional position offset"""
        template = self.get_template(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")
        
        if slide_index >= len(template["slides"]):
            raise ValueError(f"Slide index {slide_index} out of range")
        
        slide = template["slides"][slide_index]
        
        # Get responsive configuration
        breakpoint = container_size.breakpoint
        responsive_config = slide.get("responsive", {}).get(breakpoint, {})
        
        # Merge base layout with responsive overrides
        layout = self._merge_layout_config(slide["layout"], responsive_config)
        
        # Calculate elements with filled content
        elements = self._calculate_elements(
            layout, 
            filled_content, 
            container_size
        )
        
        # Apply position offset for multi-slide layout
        if position_offset > 0:
            for element in elements:
                element.x += position_offset
        
        return {
            "templateId": template["id"],
            "templateName": template["name"],
            "slideIndex": slide_index,
            "containerSize": {
                "width": container_size.width,
                "height": container_size.height,
                "breakpoint": breakpoint
            },
            "elements": [self._element_to_dict(el) for el in elements],
            "metadata": {
                "slideId": slide["id"],
                "slideType": slide["type"],
                "filledContent": filled_content,
                "positionOffset": position_offset
            }
        }

# Global service instance
template_service = TemplateService()