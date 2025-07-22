"""
Adaptive Chunk Sizer for timeline-based content generation.

This module calculates optimal chunk sizes based on content complexity, token limits,
and educational objectives. It integrates with the existing content analysis to provide
intelligent chunk boundary detection.
"""

import logging
import re
import asyncio
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum

from config import settings
from templates.timeline_prompts import ContentType, DifficultyLevel, TimelinePromptTemplates

logger = logging.getLogger(__name__)


class ChunkSize(Enum):
    """Predefined chunk size categories"""
    SMALL = "small"      # 15-20 seconds, 400-600 tokens
    MEDIUM = "medium"    # 25-35 seconds, 600-800 tokens
    LARGE = "large"      # 40-60 seconds, 800-1200 tokens


@dataclass
class ChunkSizingConfig:
    """Configuration for adaptive chunk sizing"""
    min_chunk_duration: float = 15.0
    max_chunk_duration: float = 60.0
    target_chunk_duration: float = 30.0
    min_tokens: int = 400
    max_tokens: int = 1200
    target_tokens: int = 800
    overlap_threshold: float = 0.1  # 10% overlap for continuity


@dataclass
class ComplexityMetrics:
    """Metrics for assessing content complexity"""
    concept_density: float  # 0.0-1.0, concepts per unit time
    prerequisite_load: float  # 0.0-1.0, required background knowledge
    visual_complexity: float  # 0.0-1.0, visual elements needed
    cognitive_load: float  # 0.0-1.0, mental processing required
    interaction_level: float  # 0.0-1.0, user engagement needed
    
    @property
    def overall_complexity(self) -> float:
        """Calculate weighted overall complexity score"""
        weights = {
            'concept_density': 0.25,
            'prerequisite_load': 0.20,
            'visual_complexity': 0.20,
            'cognitive_load': 0.25,
            'interaction_level': 0.10
        }
        
        return (
            self.concept_density * weights['concept_density'] +
            self.prerequisite_load * weights['prerequisite_load'] +
            self.visual_complexity * weights['visual_complexity'] +
            self.cognitive_load * weights['cognitive_load'] +
            self.interaction_level * weights['interaction_level']
        )


@dataclass
class ChunkRecommendation:
    """Recommendation for chunk sizing and structure"""
    chunk_size: ChunkSize
    target_duration: float
    target_tokens: int
    estimated_chunks_needed: int
    break_points: List[str]
    reasoning: str
    complexity_factors: List[str]
    confidence: float  # 0.0-1.0


class AdaptiveChunkSizer:
    """
    Intelligent chunk sizing based on content analysis and educational objectives.
    
    This class analyzes topics and determines optimal chunk boundaries for
    timeline-based content generation.
    """
    
    def __init__(self, config: Optional[ChunkSizingConfig] = None):
        self.config = config or ChunkSizingConfig()
        self.template_generator = TimelinePromptTemplates()
        
        # Token estimation patterns
        self.token_patterns = {
            'simple_sentence': 15,  # average tokens per simple sentence
            'complex_sentence': 25,  # average tokens per complex sentence
            'technical_term': 3,    # additional tokens for technical terms
            'visual_instruction': 10,  # tokens for visual descriptions
        }
    
    async def analyze_topic_complexity(self, topic: str, difficulty: DifficultyLevel) -> ComplexityMetrics:
        """
        Analyze topic complexity to inform chunk sizing decisions.
        
        Args:
            topic: Educational topic to analyze
            difficulty: Target difficulty level
            
        Returns:
            ComplexityMetrics with detailed analysis
        """
        try:
            # Basic complexity analysis based on topic characteristics
            concept_density = self._estimate_concept_density(topic)
            prerequisite_load = self._estimate_prerequisite_load(topic, difficulty)
            visual_complexity = self._estimate_visual_complexity(topic)
            cognitive_load = self._estimate_cognitive_load(topic, difficulty)
            interaction_level = self._estimate_interaction_level(topic)
            
            return ComplexityMetrics(
                concept_density=concept_density,
                prerequisite_load=prerequisite_load,
                visual_complexity=visual_complexity,
                cognitive_load=cognitive_load,
                interaction_level=interaction_level
            )
            
        except Exception as e:
            logger.error(f"Error analyzing topic complexity: {e}")
            # Return moderate complexity as fallback
            return ComplexityMetrics(0.5, 0.5, 0.5, 0.5, 0.5)
    
    def _estimate_concept_density(self, topic: str) -> float:
        """Estimate how many new concepts per unit time"""
        # High-density topics that introduce many concepts quickly
        high_density_patterns = [
            r'\b(compare|comparison|versus|vs\.?|difference)\b',
            r'\b(types?|kinds?|categories|classification)\b',
            r'\b(overview|introduction|survey)\b',
            r'\b(multiple|various|several|many)\b'
        ]
        
        # Low-density topics that focus on single concepts
        low_density_patterns = [
            r'\b(definition|meaning|what is)\b',
            r'\b(single|one|specific|particular)\b',
            r'\b(focus|concentrate|deep dive)\b'
        ]
        
        topic_lower = topic.lower()
        
        high_matches = sum(1 for pattern in high_density_patterns if re.search(pattern, topic_lower))
        low_matches = sum(1 for pattern in low_density_patterns if re.search(pattern, topic_lower))
        
        if high_matches > low_matches:
            return min(0.8, 0.5 + (high_matches * 0.15))
        elif low_matches > high_matches:
            return max(0.2, 0.5 - (low_matches * 0.15))
        else:
            # Base complexity on topic length and technical terms
            word_count = len(topic.split())
            technical_terms = len(re.findall(r'\b[A-Z]{2,}|\b\w{10,}\b', topic))
            
            base_density = min(0.8, 0.3 + (word_count * 0.05) + (technical_terms * 0.1))
            return base_density
    
    def _estimate_prerequisite_load(self, topic: str, difficulty: DifficultyLevel) -> float:
        """Estimate required background knowledge"""
        # Adjust base load by difficulty
        base_loads = {
            DifficultyLevel.BEGINNER: 0.2,
            DifficultyLevel.INTERMEDIATE: 0.5,
            DifficultyLevel.ADVANCED: 0.8
        }
        
        base_load = base_loads[difficulty]
        
        # High prerequisite indicators
        high_prereq_patterns = [
            r'\b(advanced|complex|sophisticated)\b',
            r'\b(requires?|needs?|depends on)\b',
            r'\b(building on|based on|assumes)\b',
            r'\b(calculus|algebra|chemistry|physics)\b'
        ]
        
        topic_lower = topic.lower()
        high_matches = sum(1 for pattern in high_prereq_patterns if re.search(pattern, topic_lower))
        
        # Increase load based on prerequisite indicators
        adjusted_load = min(1.0, base_load + (high_matches * 0.15))
        return adjusted_load
    
    def _estimate_visual_complexity(self, topic: str) -> float:
        """Estimate visual elements needed"""
        # High visual complexity patterns
        visual_patterns = [
            r'\b(diagram|chart|graph|visualization)\b',
            r'\b(process|flow|sequence|steps)\b',
            r'\b(structure|anatomy|parts|components)\b',
            r'\b(comparison|compare|contrast)\b',
            r'\b(show|demonstrate|illustrate)\b'
        ]
        
        # Low visual complexity patterns
        abstract_patterns = [
            r'\b(concept|idea|theory|principle)\b',
            r'\b(philosophy|ethics|abstract)\b',
            r'\b(definition|meaning|explanation)\b'
        ]
        
        topic_lower = topic.lower()
        
        visual_matches = sum(1 for pattern in visual_patterns if re.search(pattern, topic_lower))
        abstract_matches = sum(1 for pattern in abstract_patterns if re.search(pattern, topic_lower))
        
        if visual_matches > abstract_matches:
            return min(0.9, 0.5 + (visual_matches * 0.2))
        elif abstract_matches > visual_matches:
            return max(0.1, 0.5 - (abstract_matches * 0.15))
        else:
            return 0.5
    
    def _estimate_cognitive_load(self, topic: str, difficulty: DifficultyLevel) -> float:
        """Estimate mental processing required"""
        # Base cognitive load by difficulty
        base_loads = {
            DifficultyLevel.BEGINNER: 0.3,
            DifficultyLevel.INTERMEDIATE: 0.6,
            DifficultyLevel.ADVANCED: 0.8
        }
        
        base_load = base_loads[difficulty]
        
        # High cognitive load indicators
        high_cognitive_patterns = [
            r'\b(analysis|synthesis|evaluation)\b',
            r'\b(problem solving|critical thinking)\b',
            r'\b(complex|complicated|intricate)\b',
            r'\b(multiple|various|interconnected)\b'
        ]
        
        topic_lower = topic.lower()
        cognitive_matches = sum(1 for pattern in high_cognitive_patterns if re.search(pattern, topic_lower))
        
        return min(1.0, base_load + (cognitive_matches * 0.1))
    
    def _estimate_interaction_level(self, topic: str) -> float:
        """Estimate user engagement and interaction needed"""
        # Interactive patterns
        interactive_patterns = [
            r'\b(practice|exercise|activity)\b',
            r'\b(hands.?on|interactive|engage)\b',
            r'\b(try|attempt|experiment)\b',
            r'\b(quiz|test|check)\b'
        ]
        
        topic_lower = topic.lower()
        interactive_matches = sum(1 for pattern in interactive_patterns if re.search(pattern, topic_lower))
        
        return min(0.8, 0.2 + (interactive_matches * 0.2))
    
    def recommend_chunk_size(
        self,
        complexity: ComplexityMetrics,
        content_type: ContentType,
        total_estimated_content: Optional[int] = None,
        total_duration: Optional[float] = None
    ) -> ChunkRecommendation:
        """
        Recommend optimal chunk size based on complexity analysis.
        
        Args:
            complexity: Complexity metrics for the content
            content_type: Type of educational content
            total_estimated_content: Total content length if known
            
        Returns:
            ChunkRecommendation with sizing guidance
        """
        
        # Content type influences chunk sizing
        content_type_factors = {
            ContentType.DEFINITION: 0.8,      # Smaller chunks for definitions
            ContentType.PROCESS: 1.2,         # Larger chunks for processes
            ContentType.COMPARISON: 1.1,      # Slightly larger for comparisons
            ContentType.EXAMPLE: 0.9,         # Medium chunks for examples
            ContentType.LIST: 0.7,            # Smaller chunks for lists
            ContentType.CONCEPT_MAP: 1.3,     # Larger chunks for concept maps
            ContentType.FORMULA: 1.0,         # Standard chunks for formulas
            ContentType.STORY: 1.4,           # Larger chunks for stories
        }
        
        # Calculate base chunk size from complexity
        complexity_score = complexity.overall_complexity
        content_factor = content_type_factors[content_type]
        
        # Determine chunk size category
        adjusted_complexity = complexity_score * content_factor
        
        if adjusted_complexity < 0.4:
            chunk_size = ChunkSize.LARGE
            target_duration = 45.0
            target_tokens = 1000
        elif adjusted_complexity < 0.7:
            chunk_size = ChunkSize.MEDIUM
            target_duration = 30.0
            target_tokens = 800
        else:
            chunk_size = ChunkSize.SMALL
            target_duration = 20.0
            target_tokens = 600
        
        # Estimate number of chunks needed
        if total_estimated_content:
            estimated_chunks = max(1, total_estimated_content // target_tokens)
        elif total_duration:
            # Calculate chunks based on total duration and target chunk duration
            estimated_chunks = max(1, int(total_duration / target_duration))
            logger.info(f"Calculated {estimated_chunks} chunks based on {total_duration}s duration and {target_duration}s per chunk")
        else:
            # Default estimation based on complexity
            if complexity_score > 0.7:
                estimated_chunks = 5  # Complex topics need more chunks
            elif complexity_score > 0.4:
                estimated_chunks = 3  # Medium topics
            else:
                estimated_chunks = 2  # Simple topics
            logger.info(f"Using complexity-based chunks: {estimated_chunks} (complexity={complexity_score:.2f})")
        
        # Generate break points based on content type
        break_points = self._generate_break_points(content_type, estimated_chunks)
        
        # Generate reasoning
        complexity_factors = []
        if complexity.concept_density > 0.6:
            complexity_factors.append("high concept density")
        if complexity.visual_complexity > 0.6:
            complexity_factors.append("complex visual requirements")
        if complexity.cognitive_load > 0.7:
            complexity_factors.append("high cognitive load")
        if complexity.prerequisite_load > 0.6:
            complexity_factors.append("significant prerequisites")
        
        reasoning = f"Recommended {chunk_size.value} chunks based on {content_type.value} content type"
        if complexity_factors:
            reasoning += f" with {', '.join(complexity_factors)}"
        
        # Calculate confidence based on clear indicators
        confidence = self._calculate_confidence(complexity, content_type)
        
        return ChunkRecommendation(
            chunk_size=chunk_size,
            target_duration=target_duration,
            target_tokens=target_tokens,
            estimated_chunks_needed=estimated_chunks,
            break_points=break_points,
            reasoning=reasoning,
            complexity_factors=complexity_factors,
            confidence=confidence
        )
    
    def _generate_break_points(self, content_type: ContentType, chunk_count: int) -> List[str]:
        """Generate logical break points for content type"""
        
        break_point_templates = {
            ContentType.DEFINITION: [
                "Core definition",
                "Key characteristics",
                "Examples and applications",
                "Common misconceptions",
                "Summary and review"
            ],
            ContentType.PROCESS: [
                "Process overview",
                "Initial steps",
                "Core transformation",
                "Final stages",
                "Results and applications"
            ],
            ContentType.COMPARISON: [
                "Introduction of concepts",
                "Similarities analysis",
                "Key differences",
                "Use case scenarios",
                "Conclusion and recommendations"
            ],
            ContentType.EXAMPLE: [
                "Example introduction",
                "Context and setup",
                "Step-by-step walkthrough",
                "Results and analysis",
                "Lessons learned"
            ]
        }
        
        template = break_point_templates.get(content_type, break_point_templates[ContentType.DEFINITION])
        
        # Return appropriate number of break points
        return template[:chunk_count]
    
    def _calculate_confidence(self, complexity: ComplexityMetrics, content_type: ContentType) -> float:
        """Calculate confidence in the recommendation"""
        
        # Higher confidence for clearer patterns
        confidence_factors = []
        
        # Clear complexity signals increase confidence
        if complexity.concept_density < 0.3 or complexity.concept_density > 0.7:
            confidence_factors.append(0.2)
        if complexity.visual_complexity < 0.3 or complexity.visual_complexity > 0.7:
            confidence_factors.append(0.15)
        if complexity.cognitive_load < 0.3 or complexity.cognitive_load > 0.7:
            confidence_factors.append(0.15)
        
        # Well-understood content types increase confidence
        well_understood_types = [ContentType.DEFINITION, ContentType.PROCESS, ContentType.COMPARISON]
        if content_type in well_understood_types:
            confidence_factors.append(0.2)
        
        # Base confidence
        base_confidence = 0.6
        bonus_confidence = sum(confidence_factors)
        
        return min(1.0, base_confidence + bonus_confidence)
    
    def estimate_tokens_for_duration(self, target_duration: float, content_type: ContentType) -> int:
        """Estimate token count needed for target duration"""
        
        # Base speaking rate: ~150 words per minute = 2.5 words per second
        # Average: 1.3 tokens per word
        base_tokens_per_second = 2.5 * 1.3
        
        # Content type adjustments
        type_multipliers = {
            ContentType.DEFINITION: 1.0,      # Standard rate
            ContentType.PROCESS: 1.2,         # More descriptive
            ContentType.COMPARISON: 1.1,      # Slightly more complex
            ContentType.EXAMPLE: 0.9,         # More conversational
            ContentType.LIST: 0.8,            # Concise items
            ContentType.CONCEPT_MAP: 1.3,     # Complex descriptions
            ContentType.FORMULA: 1.1,         # Technical language
            ContentType.STORY: 0.9,           # Narrative flow
        }
        
        multiplier = type_multipliers[content_type]
        estimated_tokens = int(target_duration * base_tokens_per_second * multiplier)
        
        # Ensure within reasonable bounds
        return max(200, min(1500, estimated_tokens))
    
    def validate_chunk_boundaries(
        self,
        chunks: List[Dict[str, Any]],
        total_target_duration: float
    ) -> Tuple[bool, List[str]]:
        """
        Validate that chunk boundaries make sense for the content.
        
        Args:
            chunks: List of generated chunks to validate
            total_target_duration: Expected total duration
            
        Returns:
            Tuple of (is_valid, list_of_issues)
        """
        
        issues = []
        
        # Check total duration
        total_duration = sum(chunk.get('target_duration', 0) for chunk in chunks)
        duration_diff = abs(total_duration - total_target_duration) / total_target_duration
        
        if duration_diff > 0.2:  # More than 20% difference
            issues.append(f"Total duration mismatch: {total_duration:.1f}s vs {total_target_duration:.1f}s")
        
        # Check individual chunk sizes
        for i, chunk in enumerate(chunks):
            duration = chunk.get('target_duration', 0)
            if duration < self.config.min_chunk_duration:
                issues.append(f"Chunk {i+1} too short: {duration:.1f}s")
            elif duration > self.config.max_chunk_duration:
                issues.append(f"Chunk {i+1} too long: {duration:.1f}s")
        
        # Check for reasonable progression
        if len(chunks) > 1:
            durations = [chunk.get('target_duration', 0) for chunk in chunks]
            max_duration = max(durations)
            min_duration = min(durations)
            
            if max_duration / min_duration > 3:  # One chunk is 3x longer than another
                issues.append("Chunk durations vary too much - consider rebalancing")
        
        return len(issues) == 0, issues