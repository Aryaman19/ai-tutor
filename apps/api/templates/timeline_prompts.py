"""
Timeline-based LLM prompt templates for chunked content generation.

This module provides structured prompts for generating timeline-aware educational content
that can be processed in chunks while maintaining narrative flow and visual continuity.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum


class ContentType(Enum):
    """Types of educational content for timeline generation"""
    DEFINITION = "definition"
    PROCESS = "process"
    COMPARISON = "comparison"
    EXAMPLE = "example"
    LIST = "list"
    CONCEPT_MAP = "concept_map"
    FORMULA = "formula"
    STORY = "story"


class DifficultyLevel(Enum):
    """Educational difficulty levels"""
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


@dataclass
class ContinuityContext:
    """Context from previous chunks for maintaining narrative flow"""
    previous_concepts: List[str]
    visual_elements: List[Dict[str, Any]]
    narrative_thread: str
    current_timestamp: float
    chunk_number: int


@dataclass
class ChunkGenerationConfig:
    """Configuration for chunked content generation"""
    max_tokens: int = 800
    target_duration: float = 30.0  # seconds
    content_type: ContentType = ContentType.DEFINITION
    difficulty: DifficultyLevel = DifficultyLevel.BEGINNER
    include_visual_instructions: bool = True
    maintain_continuity: bool = True


class TimelinePromptTemplates:
    """Template generator for timeline-based content creation"""
    
    @staticmethod
    def get_chunk_generation_prompt(
        topic: str,
        chunk_config: ChunkGenerationConfig,
        continuity_context: Optional[ContinuityContext] = None
    ) -> str:
        """
        Generate a prompt for creating a timeline chunk with specific constraints.
        
        Args:
            topic: The educational topic to cover
            chunk_config: Configuration for chunk generation
            continuity_context: Context from previous chunks for continuity
            
        Returns:
            Formatted prompt string for LLM generation
        """
        
        # Base instruction based on difficulty
        difficulty_instructions = {
            DifficultyLevel.BEGINNER: "Explain this like I'm 10 years old, using very simple language and relatable examples",
            DifficultyLevel.INTERMEDIATE: "Explain this at a middle school level with clear examples and some technical terms",
            DifficultyLevel.ADVANCED: "Explain this at a high school level with detailed examples and proper terminology"
        }
        
        # Content type specific instructions
        content_type_instructions = {
            ContentType.DEFINITION: "Focus on clearly defining key concepts and their relationships",
            ContentType.PROCESS: "Break down the process into clear, sequential steps",
            ContentType.COMPARISON: "Highlight similarities and differences between concepts",
            ContentType.EXAMPLE: "Provide concrete, relatable examples to illustrate the concept",
            ContentType.LIST: "Organize information into clear, logical lists or categories",
            ContentType.CONCEPT_MAP: "Show how different concepts connect and relate to each other",
            ContentType.FORMULA: "Explain the formula components and their practical applications",
            ContentType.STORY: "Present the information as an engaging narrative or story"
        }
        
        # Build continuity section if context provided
        continuity_section = ""
        if continuity_context and chunk_config.maintain_continuity:
            continuity_section = f"""
CONTINUITY CONTEXT:
- Previous concepts covered: {', '.join(continuity_context.previous_concepts)}
- Current timeline position: {continuity_context.current_timestamp:.1f}s
- Chunk number: {continuity_context.chunk_number}
- Narrative thread: {continuity_context.narrative_thread}

Continue naturally from the previous content while introducing new concepts.
"""
        
        # Visual instruction section
        visual_section = ""
        if chunk_config.include_visual_instructions:
            visual_section = """
For each timeline event, include visual instructions using this format:
VISUAL: [type: text|rectangle|arrow|ellipse|flowchart|callout] [position: center|left|right|top|bottom] [content: description] [importance: critical|high|medium|low]

Examples:
VISUAL: text center "Key Concept: Photosynthesis" critical
VISUAL: rectangle left "Inputs: CO2 + H2O + Sunlight" high
VISUAL: arrow center "Process Flow" medium
"""
        
        # Build the complete prompt
        prompt = f"""
{difficulty_instructions[chunk_config.difficulty]}. 

Topic: "{topic}"
Content Type: {content_type_instructions[chunk_config.content_type]}

CONSTRAINTS:
- Target duration: {chunk_config.target_duration:.1f} seconds of content
- Maximum tokens: {chunk_config.max_tokens}
- Keep content focused and engaging
- Use conversational tone for narration

TTS-AWARE TIMING GUIDELINES:
- For narration: aim for 140-160 words per minute of speaking time
- Account for natural pauses between sentences (0.5-1 second)
- Short phrases (under 5 words) need minimum 2 seconds
- Complex technical terms require extra time for clear pronunciation
- Plan timing with actual speech patterns, not just word count
- Include brief pauses for emphasis and comprehension

{continuity_section}

FORMAT YOUR RESPONSE as a JSON object with this structure:
{{
  "timeline_events": [
    {{
      "timestamp": 0.0,
      "duration": 5.0,
      "event_type": "narration",
      "content": "Spoken content for this time segment",
      "word_count": 12,
      "estimated_speaking_time": 4.8,
      "visual_instruction": "VISUAL: text center 'Main Title' critical",
      "layout_hints": {{
        "semantic": "primary",
        "positioning": "center",
        "importance": "critical"
      }}
    }},
    {{
      "timestamp": 5.0,
      "duration": 8.0,
      "event_type": "visual",
      "content": "Description of visual element",
      "word_count": 6,
      "estimated_speaking_time": 2.4,
      "visual_instruction": "VISUAL: rectangle left 'Concept Box' high",
      "layout_hints": {{
        "semantic": "supporting",
        "positioning": "left",
        "importance": "high"
      }}
    }}
  ],
  "chunk_summary": "Brief summary of concepts covered in this chunk",
  "next_chunk_hint": "Suggested direction for the next chunk",
  "concepts_introduced": ["concept1", "concept2"],
  "visual_elements_created": ["element1", "element2"]
}}

{visual_section}

Generate timeline events that naturally flow together and can be presented sequentially with proper timing.

IMPORTANT TIMING NOTES:
- Calculate word_count for each content segment
- Set estimated_speaking_time based on 150 words per minute baseline
- Ensure duration allows for comfortable speech pacing plus small buffer
- For very short content (under 3 seconds estimated), increase duration to minimum 3 seconds
- Account for natural speech patterns and pauses in your timing
"""
        
        return prompt.strip()
    
    @staticmethod
    def get_continuity_analysis_prompt(previous_chunks: List[Dict[str, Any]]) -> str:
        """
        Generate prompt for analyzing previous chunks to extract continuity context.
        
        Args:
            previous_chunks: List of previously generated chunk data
            
        Returns:
            Prompt for extracting continuity information
        """
        
        chunks_text = "\n\n".join([
            f"CHUNK {i+1}:\n{chunk.get('chunk_summary', 'No summary')}\nConcepts: {chunk.get('concepts_introduced', [])}"
            for i, chunk in enumerate(previous_chunks)
        ])
        
        return f"""
Analyze the following educational content chunks and extract continuity information:

{chunks_text}

Extract and return a JSON object with:
{{
  "previous_concepts": ["list of all concepts introduced so far"],
  "narrative_thread": "main storyline or progression of ideas",
  "visual_elements": ["list of visual elements that should be referenced"],
  "logical_next_topics": ["suggested topics to cover next"],
  "knowledge_level": "current complexity level reached"
}}

Focus on maintaining educational progression and avoiding repetition.
"""
    
    @staticmethod
    def get_adaptive_sizing_prompt(topic: str, estimated_complexity: float) -> str:
        """
        Generate prompt for determining optimal chunk size based on topic complexity.
        
        Args:
            topic: Educational topic to analyze
            estimated_complexity: Initial complexity estimate (0.0-1.0)
            
        Returns:
            Prompt for chunk sizing analysis
        """
        
        return f"""
Analyze the educational topic "{topic}" and determine optimal chunking strategy.

Current complexity estimate: {estimated_complexity:.2f} (0.0 = very simple, 1.0 = very complex)

Consider:
1. Concept density - how many new ideas need to be introduced
2. Prerequisite knowledge - what foundation is needed
3. Visual complexity - how many visual elements are needed
4. Natural break points - where the topic can be logically divided

Return a JSON object with:
{{
  "recommended_chunk_size": "small|medium|large",
  "estimated_chunks_needed": 3,
  "target_duration_per_chunk": 25.0,
  "complexity_factors": ["factor1", "factor2"],
  "suggested_break_points": ["point1", "point2"],
  "visual_density": "low|medium|high"
}}

Base recommendations:
- Small chunks: 15-20 seconds, simple concepts, minimal visuals
- Medium chunks: 25-35 seconds, moderate concepts, some visuals  
- Large chunks: 40-60 seconds, complex concepts, rich visuals
"""


# Predefined prompt templates for common scenarios
QUICK_DEFINITION_TEMPLATE = """
Provide a clear, {difficulty}-level definition of "{topic}" in exactly {duration} seconds of narration.

Include:
1. Simple definition
2. One clear example
3. Why it matters

Format as JSON with timeline_events array.
"""

PROCESS_EXPLANATION_TEMPLATE = """
Explain the process of "{topic}" as a {difficulty}-level timeline.

Break into logical steps with:
1. Clear sequence
2. Visual cues for each step
3. Smooth transitions

Target {duration} seconds total. Format as JSON with timeline_events array.
"""

COMPARISON_TEMPLATE = """
Compare and contrast {topic} at a {difficulty} level.

Structure:
1. Introduce both concepts
2. Key similarities
3. Important differences
4. When to use each

Target {duration} seconds. Format as JSON with timeline_events array.
"""


def get_template_for_content_type(content_type: ContentType) -> str:
    """Get the appropriate template for a given content type"""
    
    templates = {
        ContentType.DEFINITION: QUICK_DEFINITION_TEMPLATE,
        ContentType.PROCESS: PROCESS_EXPLANATION_TEMPLATE,
        ContentType.COMPARISON: COMPARISON_TEMPLATE,
        # Add more templates as needed
    }
    
    return templates.get(content_type, QUICK_DEFINITION_TEMPLATE)