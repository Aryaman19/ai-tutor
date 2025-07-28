"""
Lesson Structure Analysis Service

This service analyzes topics and determines optimal lesson structure including:
- Number of slides needed
- Template selection for each slide
- Content distribution across slides
- Timing calculations for each slide
"""
import json
import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from services.template_service import template_service
from services.ollama_service import ollama_service

logger = logging.getLogger(__name__)

@dataclass
class SlideStructure:
    """Structure for individual slide"""
    slide_number: int
    template_id: str
    template_name: str
    content_type: str
    estimated_duration: float  # in seconds
    content_prompts: Dict[str, str]  # prompts for LLM content generation
    layout_hints: Dict[str, Any]
    priority: int  # 1=essential, 2=important, 3=optional

@dataclass
class LessonStructure:
    """Complete lesson structure"""
    topic: str
    difficulty_level: str
    total_slides: int
    estimated_total_duration: float
    slides: List[SlideStructure]
    teaching_strategy: str
    content_flow: List[str]  # ordered list of content types

class LessonStructureService:
    """Service for analyzing topics and generating lesson structures"""
    
    def __init__(self):
        self.template_categories = {
            "title-objective": {"priority": 1, "base_duration": 15, "required": True},
            "definition": {"priority": 1, "base_duration": 30, "required": True}, 
            "process": {"priority": 2, "base_duration": 45, "required": False},
            "example": {"priority": 2, "base_duration": 35, "required": False},
            "comparison": {"priority": 3, "base_duration": 40, "required": False},
            "concept-map": {"priority": 2, "base_duration": 50, "required": False},
            "list": {"priority": 2, "base_duration": 25, "required": False},
            "formula": {"priority": 2, "base_duration": 35, "required": False},
            "summary": {"priority": 1, "base_duration": 20, "required": True}
        }
        
        self.difficulty_multipliers = {
            "beginner": 1.0,
            "intermediate": 1.2, 
            "advanced": 1.5
        }
    
    async def analyze_topic_structure(
        self, 
        topic: str, 
        difficulty_level: str, 
        target_duration: float
    ) -> LessonStructure:
        """Analyze topic and generate optimal lesson structure"""
        logger.info(f"Analyzing lesson structure for: {topic}")
        
        # Get topic complexity analysis from LLM
        complexity_analysis = await self._analyze_topic_complexity(
            topic, difficulty_level, target_duration
        )
        
        # Determine required slide types based on topic
        required_slide_types = await self._determine_slide_types(
            topic, difficulty_level, complexity_analysis
        )
        
        # Calculate slide distribution and timing
        slide_structures = await self._calculate_slide_distribution(
            topic, difficulty_level, target_duration, required_slide_types
        )
        
        # Optimize slide order for pedagogical flow
        optimized_slides = self._optimize_slide_order(slide_structures)
        
        total_duration = sum(slide.estimated_duration for slide in optimized_slides)
        
        return LessonStructure(
            topic=topic,
            difficulty_level=difficulty_level,
            total_slides=len(optimized_slides),
            estimated_total_duration=total_duration,
            slides=optimized_slides,
            teaching_strategy=complexity_analysis.get("strategy", "progressive"),
            content_flow=[slide.content_type for slide in optimized_slides]
        )
    
    async def _analyze_topic_complexity(
        self, topic: str, difficulty_level: str, target_duration: float
    ) -> Dict[str, Any]:
        """Analyze topic complexity using LLM"""
        prompt = f"""
        Analyze the educational topic "{topic}" for {difficulty_level} level learners.
        Target lesson duration: {target_duration} seconds.
        
        Determine:
        1. Topic complexity (1-5 scale)
        2. Key concepts that need explanation
        3. Prerequisites students should know
        4. Best teaching strategy (visual, step-by-step, example-driven, etc.)
        5. Whether topic needs: definitions, processes, examples, comparisons, formulas
        6. Estimated cognitive load (low/medium/high)
        
        Respond in JSON format:
        {{
            "complexity": 3,
            "key_concepts": ["concept1", "concept2"],
            "prerequisites": ["prereq1"], 
            "strategy": "visual",
            "needs_definitions": true,
            "needs_processes": false,
            "needs_examples": true,
            "needs_comparisons": false,
            "needs_formulas": false,
            "cognitive_load": "medium",
            "reasoning": "explanation of analysis"
        }}
        """
        
        try:
            response = await ollama_service.generate_content(
                prompt=prompt,
                user_id="system",
                response_format="json"
            )
            
            if response and response.get("content"):
                content = response["content"]
                
                # If generate_content already parsed JSON, use it directly
                if response.get("format") == "json" and isinstance(content, dict):
                    return content
                
                # Otherwise, try to parse as JSON string
                if isinstance(content, str):
                    try:
                        # Clean up markdown code blocks if present
                        cleaned_content = self._extract_json_from_markdown(content)
                        return json.loads(cleaned_content)
                    except json.JSONDecodeError:
                        logger.warning(f"Failed to parse LLM response as JSON: {content[:100]}...")
                        return self._fallback_complexity_analysis(topic, difficulty_level)
                
                # If content is neither dict nor string, use fallback
                return self._fallback_complexity_analysis(topic, difficulty_level)
            else:
                # Fallback analysis
                return self._fallback_complexity_analysis(topic, difficulty_level)
                
        except Exception as e:
            logger.warning(f"LLM complexity analysis failed: {e}")
            return self._fallback_complexity_analysis(topic, difficulty_level)
    
    def _fallback_complexity_analysis(self, topic: str, difficulty_level: str) -> Dict[str, Any]:
        """Fallback complexity analysis when LLM fails"""
        complexity_map = {"beginner": 2, "intermediate": 3, "advanced": 4}
        
        # Simple heuristics based on topic keywords
        needs_formulas = any(word in topic.lower() for word in 
                           ["equation", "formula", "calculate", "math", "physics"])
        needs_processes = any(word in topic.lower() for word in 
                            ["process", "how to", "steps", "method", "procedure"])
        needs_examples = not needs_formulas  # Most topics benefit from examples
        
        return {
            "complexity": complexity_map.get(difficulty_level, 3),
            "key_concepts": [topic],
            "prerequisites": [],
            "strategy": "progressive",
            "needs_definitions": True,
            "needs_processes": needs_processes,
            "needs_examples": needs_examples, 
            "needs_comparisons": False,
            "needs_formulas": needs_formulas,
            "cognitive_load": difficulty_level,
            "reasoning": "Fallback analysis based on heuristics"
        }
    
    async def _determine_slide_types(
        self, topic: str, difficulty_level: str, analysis: Dict[str, Any]
    ) -> List[str]:
        """Determine what types of slides are needed"""
        slide_types = ["title-objective"]  # Always start with title
        
        # Add content slides based on analysis
        if analysis.get("needs_definitions", True):
            slide_types.append("definition")
            
        if analysis.get("needs_processes", False):
            slide_types.append("process")
            
        if analysis.get("needs_examples", True):
            slide_types.append("example")
            
        if analysis.get("needs_formulas", False):
            slide_types.append("formula")
            
        if analysis.get("needs_comparisons", False):
            slide_types.append("comparison")
            
        # Add concept map for complex topics
        if analysis.get("complexity", 3) >= 4:
            slide_types.append("concept-map")
            
        # Always end with summary
        slide_types.append("summary")
        
        return slide_types
    
    async def _calculate_slide_distribution(
        self, 
        topic: str, 
        difficulty_level: str, 
        target_duration: float,
        slide_types: List[str]
    ) -> List[SlideStructure]:
        """Calculate timing and distribution for slides"""
        slides = []
        difficulty_multiplier = self.difficulty_multipliers.get(difficulty_level, 1.0)
        
        # Calculate base durations
        total_base_duration = sum(
            self.template_categories[slide_type]["base_duration"] * difficulty_multiplier
            for slide_type in slide_types
        )
        
        # Scale to target duration
        duration_scale = target_duration / total_base_duration if total_base_duration > 0 else 1.0
        
        for i, slide_type in enumerate(slide_types):
            template_info = self.template_categories[slide_type]
            base_duration = template_info["base_duration"] * difficulty_multiplier
            scaled_duration = base_duration * duration_scale
            
            # Get template for this slide type
            template_id = self._get_template_id_for_type(slide_type)
            template_name = self._get_template_name_for_type(slide_type)
            
            slide = SlideStructure(
                slide_number=i + 1,
                template_id=template_id,
                template_name=template_name,
                content_type=slide_type,
                estimated_duration=max(10.0, scaled_duration),  # Minimum 10 seconds
                content_prompts=self._generate_content_prompts(slide_type, topic, difficulty_level),
                layout_hints={"slide_position": i, "total_slides": len(slide_types)},
                priority=template_info["priority"]
            )
            slides.append(slide)
        
        return slides
    
    async def _select_template_for_type(self, slide_type: str) -> Optional[Dict[str, Any]]:
        """Select appropriate template for slide type"""
        try:
            templates = template_service.get_templates_by_category(slide_type)
            if templates:
                # For now, select first template in category
                # TODO: Add more sophisticated selection logic
                return templates[0]
        except Exception as e:
            logger.warning(f"Failed to get template for {slide_type}: {e}")
        
        return None
    
    def _generate_content_prompts(
        self, slide_type: str, topic: str, difficulty_level: str
    ) -> Dict[str, str]:
        """Generate LLM prompts for each content field in the slide"""
        base_context = f"Topic: {topic}. Difficulty: {difficulty_level}."
        
        prompt_templates = {
            "title-objective": {
                "heading": f"{base_context} Create a clear, engaging lesson title (max 65 chars).",
                "content": f"{base_context} Write 1-2 clear learning objectives students will achieve."
            },
            "definition": {
                "heading": f"{base_context} Create a heading for the main definition section.",
                "content": f"{base_context} Provide a clear, concise definition with key characteristics."
            },
            "process": {
                "heading": f"{base_context} Create a heading for the process/steps section.",
                "content": f"{base_context} Break down into 3-5 clear, sequential steps."
            },
            "example": {
                "heading": f"{base_context} Create a heading for the example section.",
                "content": f"{base_context} Provide a concrete, relatable example with explanation."
            },
            "formula": {
                "heading": f"{base_context} Create a heading for the formula section.",
                "content": f"{base_context} Present the key formula with variable explanations."
            },
            "comparison": {
                "heading": f"{base_context} Create a heading for the comparison section.",
                "content": f"{base_context} Compare 2-3 related concepts highlighting differences."
            },
            "concept-map": {
                "heading": f"{base_context} Create a heading for the concept overview.",
                "content": f"{base_context} Show relationships between key concepts and ideas."
            },
            "summary": {
                "heading": f"{base_context} Create a heading for the lesson summary.",
                "content": f"{base_context} Summarize 3-4 key takeaways students should remember."
            }
        }
        
        return prompt_templates.get(slide_type, {
            "heading": f"{base_context} Create an appropriate heading.",
            "content": f"{base_context} Create relevant content for this section."
        })
    
    def _optimize_slide_order(self, slides: List[SlideStructure]) -> List[SlideStructure]:
        """Optimize slide order for pedagogical effectiveness"""
        # Define optimal teaching sequence
        optimal_order = [
            "title-objective",
            "definition", 
            "example",
            "process",
            "formula",
            "concept-map",
            "comparison",
            "summary"
        ]
        
        # Sort slides based on optimal order
        sorted_slides = []
        for content_type in optimal_order:
            for slide in slides:
                if slide.content_type == content_type:
                    sorted_slides.append(slide)
        
        # Update slide numbers
        for i, slide in enumerate(sorted_slides):
            slide.slide_number = i + 1
            slide.layout_hints["slide_position"] = i
            slide.layout_hints["total_slides"] = len(sorted_slides)
        
        return sorted_slides
    
    def _get_template_id_for_type(self, slide_type: str) -> str:
        """Map slide content type to existing template ID"""
        template_mapping = {
            "title-objective": "title-objective-1",
            "definition": "definition-1", 
            "process": "step-by-step-1",
            "example": "examples-1",  # Note: using 'examples' not 'example'
            "formula": "definition-2",  # Use definition template for formulas
            "comparison": "definition-3",  # Use definition template for comparisons
            "concept-map": "analogy-1",  # Use analogy template for concept maps
            "summary": "mini-recap-1"  # Use mini-recap instead of summary
        }
        return template_mapping.get(slide_type, "title-objective-1")
    
    def _get_template_name_for_type(self, slide_type: str) -> str:
        """Map slide content type to template display name"""
        template_names = {
            "title-objective": "Clean Title & Objective",
            "definition": "Definition", 
            "process": "Step by Step",
            "example": "Examples",
            "formula": "Formula",
            "comparison": "Comparison",
            "concept-map": "Concept Map",
            "summary": "Mini Recap"
        }
        return template_names.get(slide_type, slide_type.title())
    
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

# Global instance
lesson_structure_service = LessonStructureService()