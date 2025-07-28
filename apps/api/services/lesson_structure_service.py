"""
Lesson Structure Analysis Service

This service generates structured educational lessons using the 9-section format:
1. Title + Objective
2. Context / Motivation  
3. Analogy
4. Definition
5. Step-by-step Explanation / Theory
6. Examples
7. Common mistakes
8. Mini Recap
9. Some things to ponder

Each section maps to specific templates and includes LLM content generation.
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
    """Service for generating structured 9-section educational lessons"""
    
    def __init__(self):
        # 9-section lesson structure with precise template mapping
        self.lesson_sections = [
            {
                "content_type": "title-objective",
                "name": "Title + Objective",
                "template_id": "title-objective-1",
                "base_duration": 10,
                "priority": 1,
                "required": True,
                "description": "Lesson title and clear learning objectives"
            },
            {
                "content_type": "context-motivation", 
                "name": "Context / Motivation",
                "template_id": "context-motivation-1",
                "base_duration": 15,
                "priority": 1,
                "required": True,
                "description": "Why this topic matters and real-world relevance"
            },
            {
                "content_type": "analogy",
                "name": "Analogy", 
                "template_id": "analogy-1",
                "base_duration": 20,
                "priority": 2,
                "required": True,
                "description": "Relatable comparison to help understanding"
            },
            {
                "content_type": "definition",
                "name": "Definition",
                "template_id": "definition-1", 
                "base_duration": 15,
                "priority": 1,
                "required": True,
                "description": "Clear definition of key concepts"
            },
            {
                "content_type": "step-by-step",
                "name": "Step-by-step Explanation / Theory",
                "template_id": "step-by-step-1",
                "base_duration": 30,
                "priority": 1,
                "required": True,
                "description": "Detailed explanation or process breakdown"
            },
            {
                "content_type": "examples",
                "name": "Examples",
                "template_id": "examples-1",
                "base_duration": 25,
                "priority": 1,
                "required": True,
                "description": "Concrete examples and applications"
            },
            {
                "content_type": "common-mistakes",
                "name": "Common mistakes",
                "template_id": "common-mistakes-1",
                "base_duration": 15,
                "priority": 2,
                "required": True,
                "description": "Common pitfalls and how to avoid them"
            },
            {
                "content_type": "mini-recap",
                "name": "Mini Recap",
                "template_id": "mini-recap-1", 
                "base_duration": 10,
                "priority": 1,
                "required": True,
                "description": "Summary of key points covered"
            },
            {
                "content_type": "things-to-ponder",
                "name": "Some things to ponder",
                "template_id": "things-to-ponder-1",
                "base_duration": 10,
                "priority": 2,
                "required": True,
                "description": "Thought-provoking questions and extensions"
            }
        ]
        
        self.difficulty_multipliers = {
            "beginner": 0.8,      # Shorter, simpler explanations
            "intermediate": 1.0,   # Standard timing
            "advanced": 1.3       # More detailed, longer explanations
        }
    
    async def analyze_topic_structure(
        self, 
        topic: str, 
        difficulty_level: str, 
        target_duration: float
    ) -> LessonStructure:
        """Generate structured 9-section lesson for the given topic"""
        logger.info(f"Generating 9-section lesson structure for: {topic}")
        
        # Get topic analysis to inform content generation
        topic_analysis = await self._analyze_topic_for_sections(
            topic, difficulty_level, target_duration
        )
        
        # Determine which sections to include based on duration
        selected_sections = self._select_sections_for_duration(
            target_duration, difficulty_level, topic_analysis
        )
        
        # Generate slide structures for selected sections
        slide_structures = await self._generate_slide_structures(
            topic, difficulty_level, target_duration, selected_sections, topic_analysis
        )
        
        total_duration = sum(slide.estimated_duration for slide in slide_structures)
        
        return LessonStructure(
            topic=topic,
            difficulty_level=difficulty_level,
            total_slides=len(slide_structures),
            estimated_total_duration=total_duration,
            slides=slide_structures,
            teaching_strategy=topic_analysis.get("strategy", "structured"),
            content_flow=[slide.content_type for slide in slide_structures]
        )
    
    async def _analyze_topic_for_sections(
        self, topic: str, difficulty_level: str, target_duration: float
    ) -> Dict[str, Any]:
        """Analyze topic to inform 9-section lesson structure"""
        prompt = f"""
        Analyze the educational topic "{topic}" for a {difficulty_level} level lesson.
        Target duration: {target_duration} seconds.
        
        This will be structured as a 9-section lesson:
        1. Title + Objective
        2. Context / Motivation  
        3. Analogy
        4. Definition
        5. Step-by-step Explanation / Theory
        6. Examples
        7. Common mistakes
        8. Mini Recap
        9. Some things to ponder
        
        Analyze:
        1. Topic complexity (1-5 scale)
        2. Key concepts to cover
        3. Best teaching approach
        4. What analogies might work well
        5. Common misconceptions students have
        6. Real-world applications/motivation
        7. Practical examples that would help
        
        Respond in JSON format:
        {{
            "complexity": 3,
            "key_concepts": ["concept1", "concept2"],
            "teaching_approach": "visual", 
            "good_analogies": ["analogy suggestion"],
            "common_misconceptions": ["misconception1"],
            "real_world_relevance": "why this matters",
            "good_examples": ["example1", "example2"],
            "strategy": "structured",
            "reasoning": "analysis explanation"
        }}
        """
        
        try:
            response = await ollama_service._make_request(prompt, "system")
            
            if response:
                try:
                    # Clean up markdown code blocks if present
                    cleaned_content = self._extract_json_from_markdown(response)
                    return json.loads(cleaned_content)
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse LLM response as JSON: {response[:100]}...")
                    return self._fallback_topic_analysis(topic, difficulty_level)
            else:
                return self._fallback_topic_analysis(topic, difficulty_level)
                
        except Exception as e:
            logger.warning(f"LLM topic analysis failed: {e}")
            return self._fallback_topic_analysis(topic, difficulty_level)
    
    def _fallback_topic_analysis(self, topic: str, difficulty_level: str) -> Dict[str, Any]:
        """Fallback topic analysis when LLM fails"""
        complexity_map = {"beginner": 2, "intermediate": 3, "advanced": 4}
        
        return {
            "complexity": complexity_map.get(difficulty_level, 3),
            "key_concepts": [topic],
            "teaching_approach": "structured",
            "good_analogies": [f"Think of {topic} like..."],
            "common_misconceptions": [f"Students often confuse {topic} with..."],
            "real_world_relevance": f"{topic} helps us understand everyday phenomena",
            "good_examples": [f"A common example of {topic} is..."],
            "strategy": "structured",
            "reasoning": "Fallback analysis based on heuristics"
        }
    
    def _select_sections_for_duration(
        self, target_duration: float, difficulty_level: str, topic_analysis: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Select which lesson sections to include based on target duration"""
        
        # For short lessons (< 90 seconds), use core sections only
        if target_duration < 90:
            core_sections = ["title-objective", "definition", "examples", "mini-recap"]
            return [section for section in self.lesson_sections 
                   if section["content_type"] in core_sections]
        
        # For medium lessons (90-180 seconds), add context and analogy
        elif target_duration < 180:
            medium_sections = ["title-objective", "context-motivation", "definition", 
                             "examples", "common-mistakes", "mini-recap"]
            return [section for section in self.lesson_sections 
                   if section["content_type"] in medium_sections]
        
        # For longer lessons (180+ seconds), use all 9 sections
        else:
            return self.lesson_sections.copy()
    
    async def _generate_slide_structures(
        self, 
        topic: str, 
        difficulty_level: str, 
        target_duration: float,
        selected_sections: List[Dict[str, Any]], 
        topic_analysis: Dict[str, Any]
    ) -> List[SlideStructure]:
        """Generate slide structures for selected sections"""
        
        slides = []
        difficulty_multiplier = self.difficulty_multipliers.get(difficulty_level, 1.0)
        
        # Calculate total base duration for scaling
        total_base_duration = sum(
            section["base_duration"] * difficulty_multiplier 
            for section in selected_sections
        )
        
        # Scale durations to fit target
        duration_scale = target_duration / total_base_duration if total_base_duration > 0 else 1.0
        
        for i, section in enumerate(selected_sections):
            base_duration = section["base_duration"] * difficulty_multiplier
            scaled_duration = base_duration * duration_scale
            
            # Intelligently select the best template for this section
            selected_template = self._select_optimal_template(
                section, topic, difficulty_level, topic_analysis
            )
            
            # Generate content prompts for this section
            content_prompts = self._generate_section_prompts(
                section["content_type"], topic, difficulty_level, topic_analysis
            )
            
            slide = SlideStructure(
                slide_number=i + 1,
                template_id=selected_template["id"],
                template_name=selected_template["name"],
                content_type=section["content_type"],
                estimated_duration=max(8.0, scaled_duration),  # Minimum 8 seconds
                content_prompts=content_prompts,
                layout_hints={
                    "slide_position": i,
                    "total_slides": len(selected_sections),
                    "section_description": section["description"],
                    "template_variant": selected_template.get("templateVariant", 1)
                },
                priority=section["priority"]
            )
            slides.append(slide)
        
        return slides
    
    def _select_optimal_template(
        self, 
        section: Dict[str, Any], 
        topic: str, 
        difficulty_level: str, 
        topic_analysis: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Select the optimal template for a lesson section"""
        
        # Calculate content complexity based on topic analysis
        complexity = topic_analysis.get("complexity", 3)
        
        # Try intelligent template selection first
        selected_template = template_service.select_best_template(
            category=section["content_type"],
            topic=topic,
            difficulty_level=difficulty_level,
            content_complexity=complexity,
            topic_analysis=topic_analysis
        )
        
        if selected_template:
            logger.debug(f"Intelligently selected template {selected_template['id']} for {section['content_type']}")
            return selected_template
        
        # Fallback to default template from section configuration  
        default_template = template_service.get_template_with_fallback(
            primary_template_id=section["template_id"],
            category=section["content_type"],
            topic=topic,
            difficulty_level=difficulty_level
        )
        
        logger.debug(f"Using fallback template {default_template['id']} for {section['content_type']}")
        return default_template
    
    def _generate_section_prompts(
        self, 
        section_type: str, 
        topic: str, 
        difficulty_level: str, 
        topic_analysis: Dict[str, Any]
    ) -> Dict[str, str]:
        """Generate LLM prompts for each section type"""
        
        base_context = f"Topic: {topic}. Difficulty: {difficulty_level}."
        key_concepts = ", ".join(topic_analysis.get("key_concepts", [topic]))
        
        # Section-specific prompts that map to the 9-section structure
        # NOTE: These prompts are no longer used since we switched to using template's built-in llmPrompts
        # Keeping for potential future use or reference
        section_prompts = {
            "title-objective": {
                "heading": f"{base_context} Create a clear, engaging lesson title about {topic} (max 60 chars).",
                "content": f"{base_context} Write 1-2 specific learning objectives. What will students be able to do/understand after this lesson about {topic}?"
            },
            "context-motivation": {
                "heading": f"{base_context} Create a heading about why {topic} matters.",
                "content": f"{base_context} Real-world relevance: {topic_analysis.get('real_world_relevance', f'Why {topic} is important')}. Explain why students should care about learning {topic}. Include practical applications."
            },
            "analogy": {
                "heading": f"{base_context} Create a heading for an analogy about {topic}.",
                "content": f"{base_context} Good analogies: {', '.join(topic_analysis.get('good_analogies', []))}. Create a relatable analogy to help students understand {topic}. Compare it to something familiar."
            },
            "definition": {
                "heading": f"{base_context} Create a heading for defining {topic}.",
                "content": f"{base_context} Key concepts: {key_concepts}. Provide a clear, concise definition of {topic} with essential characteristics. Avoid jargon."
            },
            "step-by-step": {
                "heading": f"{base_context} Create a heading for the step-by-step explanation of {topic}.",
                "content": f"{base_context} Break down {topic} into 3-5 clear, logical steps or explain the core theory. Make it easy to follow for {difficulty_level} learners."
            },
            "examples": {
                "heading": f"{base_context} Create a heading for examples of {topic}.",
                "content": f"{base_context} Good examples: {', '.join(topic_analysis.get('good_examples', []))}. Provide 2-3 concrete, relatable examples that illustrate {topic} clearly."
            },
            "common-mistakes": {
                "heading": f"{base_context} Create a heading about common mistakes with {topic}.",
                "content": f"{base_context} Common misconceptions: {', '.join(topic_analysis.get('common_misconceptions', []))}. List 2-3 common mistakes students make with {topic} and how to avoid them."
            },
            "mini-recap": {
                "heading": f"{base_context} Create a heading for summarizing {topic}.",
                "content": f"{base_context} Summarize the 3-4 most important points about {topic} that students should remember. Keep it concise but comprehensive."
            },
            "things-to-ponder": {
                "heading": f"{base_context} Create a heading for thinking deeper about {topic}.",
                "content": f"{base_context} Pose 2-3 thought-provoking questions about {topic} that encourage deeper thinking or connection to other concepts."
            }
        }
        
        return section_prompts.get(section_type, {
            "heading": f"{base_context} Create an appropriate heading for {section_type}.",
            "content": f"{base_context} Create relevant content for {section_type} about {topic}."
        })
    
    def _get_section_by_type(self, content_type: str) -> Optional[Dict[str, Any]]:
        """Get section configuration by content type"""
        for section in self.lesson_sections:
            if section["content_type"] == content_type:
                return section
        return None
    
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