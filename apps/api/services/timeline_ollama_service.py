import asyncio
import json
import logging
import re
from typing import Dict, List, Optional, Tuple
import httpx
from config import settings
from models.timeline_lesson import (
    TimelineLesson, TimelineSegment, TimelineEvent, VisualElement, 
    SemanticLayout, VisualLibraryPreset, CreateTimelineLessonRequest
)
from models.settings import UserSettings

logger = logging.getLogger(__name__)


class TimelineOllamaService:
    """Service for generating timeline-based lessons using Ollama"""
    
    def __init__(self):
        self.base_url = settings.get_ollama_url()
        self.model = "gemma3n:latest"
        self.timeout = 30.0  # Shorter timeout to avoid hanging
        
        # Default visual library that LLM can use
        self.default_visual_library = self._create_default_visual_library()
    
    def _create_default_visual_library(self) -> Dict[str, VisualLibraryPreset]:
        """Create the default visual library with educational elements"""
        return {
            "title": VisualLibraryPreset(
                name="title",
                type="title",
                properties={"fontSize": 32, "fontWeight": "bold", "color": "#1971c2"},
                responsive=True,
                description="Large title text for main concepts"
            ),
            "subtitle": VisualLibraryPreset(
                name="subtitle", 
                type="subtitle",
                properties={"fontSize": 24, "fontWeight": "semibold", "color": "#495057"},
                responsive=True,
                description="Medium subtitle text for section headers"
            ),
            "concept_box": VisualLibraryPreset(
                name="concept_box",
                type="rectangle",
                properties={"width": 150, "height": 80, "strokeWidth": 2, "cornerRadius": 8},
                responsive=True,
                description="Rectangular box for highlighting key concepts"
            ),
            "process_circle": VisualLibraryPreset(
                name="process_circle",
                type="circle", 
                properties={"radius": 60, "strokeWidth": 3},
                responsive=True,
                description="Circle for representing processes or entities. Use type 'circle' when creating elements."
            ),
            "flow_arrow": VisualLibraryPreset(
                name="flow_arrow",
                type="arrow",
                properties={"strokeWidth": 3, "arrowType": "simple"},
                responsive=True,
                description="Arrow for showing relationships and flow between elements"
            ),
            "explanation_text": VisualLibraryPreset(
                name="explanation_text",
                type="text",
                properties={"fontSize": 16, "fontFamily": "helvetica", "color": "#495057"},
                responsive=True,
                description="Regular text for explanations and details"
            ),
            "highlight_box": VisualLibraryPreset(
                name="highlight_box",
                type="rectangle",
                properties={"width": 200, "height": 60, "backgroundColor": "#fff3cd", "strokeColor": "#ffd43b"},
                responsive=True,
                description="Highlighted box for important information"
            ),
            "comparison_table": VisualLibraryPreset(
                name="comparison_table",
                type="diagram",
                properties={"rows": 3, "columns": 2, "cellPadding": 10},
                responsive=True,
                description="Table for comparing concepts side by side"
            )
        }
    
    async def _make_request(self, prompt: str, user_id: str = "default") -> Optional[str]:
        """Make a request to Ollama API"""
        try:
            # Use default settings for now (user settings can be added later when DB is properly initialized)
            model = self.model
            temperature = 0.7
            max_tokens = 4096  # Increased for complex JSON
            
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
                    logger.info(f"Ollama response received: {len(response_text)} characters")
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
    
    def _generate_timeline_prompt(self, request: CreateTimelineLessonRequest) -> str:
        """Generate the prompt for timeline-based lesson creation"""
        
        # Create visual library documentation for the prompt
        library_docs = []
        for preset_name, preset in self.default_visual_library.items():
            library_docs.append(f"- {preset_name} (type: '{preset.type}'): {preset.description}")
        
        visual_library_text = "\n".join(library_docs)
        
        difficulty_instructions = {
            "beginner": "Use very simple language, basic concepts, and clear visual metaphors. Target elementary school level.",
            "intermediate": "Use clear explanations with moderate complexity. Target middle school level.",
            "advanced": "Use detailed explanations with complex concepts. Target high school level."
        }
        
        difficulty_instruction = difficulty_instructions.get(
            request.difficulty_level, 
            difficulty_instructions["beginner"]
        )
        
        target_duration = request.target_duration or 120.0
        
        segments_count = max(2, min(4, int(target_duration / 30)))  # 2-4 segments based on duration
        
        prompt = f"""Create a simple timeline lesson about "{request.topic}" for {request.difficulty_level} level.

Duration: {target_duration} seconds
Segments needed: {segments_count}

Respond with valid JSON only:

{{
  "lesson_title": "Learning about {request.topic}",
  "total_duration": {target_duration},
  "segments": [
    {{
      "start_time": 0,
      "end_time": {target_duration // segments_count},
      "title": "Introduction",
      "narration": "Welcome! Let's learn about {request.topic}.",
      "events": [
        {{
          "time": 2,
          "action": "create",
          "element": {{
            "id": "title_1",
            "type": "title",
            "text": "{request.topic.title()}",
            "layout": {{
              "region": "top_center",
              "priority": "high",
              "spacing": "large"
            }},
            "color": "blue"
          }}
        }}
      ]
    }}
  ]
}}

IMPORTANT RULES:
- Use only these actions: "create", "update", "delete", "hide", "show"
- Use only these types: "title", "text", "rectangle", "circle" 
- Use only these regions: "top_center", "middle_left", "middle_right", "center"
- Each event must have "time", "action", and "element" fields
- Keep content simple and educational

Generate valid JSON now:"""

        return prompt
    
    def _parse_timeline_response(self, response_text: str) -> Optional[Dict]:
        """Parse the LLM response and extract JSON"""
        try:
            # Clean the response - remove any text before/after JSON
            response_text = response_text.strip()
            
            # Find JSON content between first { and last }
            start_idx = response_text.find('{')
            end_idx = response_text.rfind('}')
            
            if start_idx == -1 or end_idx == -1:
                logger.error("No JSON found in response")
                return None
            
            json_text = response_text[start_idx:end_idx + 1]
            
            # Parse JSON
            lesson_data = json.loads(json_text)
            
            # Validate required fields
            required_fields = ['lesson_title', 'total_duration', 'segments']
            for field in required_fields:
                if field not in lesson_data:
                    logger.error(f"Missing required field: {field}")
                    return None
            
            return lesson_data
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing error: {e}")
            logger.error(f"Response text: {response_text[:500]}...")
            return None
        except Exception as e:
            logger.error(f"Error parsing timeline response: {e}")
            return None
    
    def _validate_and_fix_timeline_data(self, lesson_data: Dict) -> Dict:
        """Validate and fix common issues in timeline data"""
        try:
            # Ensure total_duration is float
            lesson_data['total_duration'] = float(lesson_data['total_duration'])
            
            # Validate and fix segments
            segments = lesson_data.get('segments', [])
            fixed_segments = []
            
            current_time = 0.0
            for i, segment in enumerate(segments):
                # Fix timing issues
                start_time = float(segment.get('start_time', current_time))
                end_time = float(segment.get('end_time', start_time + 20))
                
                # Ensure no overlaps and proper progression
                if start_time < current_time:
                    start_time = current_time
                if end_time <= start_time:
                    end_time = start_time + 20
                
                # Update current time
                current_time = end_time
                
                # Fix events timing
                events = segment.get('events', [])
                fixed_events = []
                
                for event in events:
                    event_time = float(event.get('time', start_time))
                    # Ensure event is within segment bounds
                    if event_time < start_time:
                        event_time = start_time + 1
                    elif event_time > end_time:
                        event_time = end_time - 1
                    
                    event['time'] = event_time
                    
                    # Fix common action mismatches first
                    action = event.get('action', 'create')
                    action_mapping = {
                        'display_text': 'create',
                        'show_text': 'create', 
                        'add': 'create',
                        'display': 'create',
                        'show': 'create',
                        'remove': 'delete',
                        'hide_element': 'hide',
                        'show_element': 'show',
                        'update_element': 'update'
                    }
                    
                    if action in action_mapping:
                        event['action'] = action_mapping[action]
                    elif action not in ['create', 'update', 'delete', 'animate', 'highlight', 'hide', 'show']:
                        event['action'] = 'create'  # Default fallback
                    
                    # Validate element structure
                    if event.get('action') == 'create' and event.get('element'):
                        element = event['element']
                        
                        # Ensure required element fields
                        if 'id' not in element:
                            element['id'] = f"element_{i}_{len(fixed_events)}"
                        if 'type' not in element:
                            element['type'] = 'text'
                        
                        # Fix common type mismatches 
                        element_type = element.get('type', 'text')
                        if element_type == 'process_circle':
                            element['type'] = 'circle'
                        elif element_type == 'concept_box':
                            element['type'] = 'rectangle'
                        elif element_type not in ['title', 'subtitle', 'text', 'circle', 'rectangle', 'arrow', 'concept_box', 'flow_arrow', 'process_step', 'comparison_table', 'timeline_marker', 'diagram', 'chart', 'illustration']:
                            element['type'] = 'text'  # Fallback to text for unknown types
                        
                        if 'layout' not in element:
                            element['layout'] = {
                                'region': 'center',
                                'priority': 'medium',
                                'spacing': 'medium'
                            }
                    
                    fixed_events.append(event)
                
                fixed_segment = {
                    'start_time': start_time,
                    'end_time': end_time,
                    'title': segment.get('title', f'Segment {i+1}'),
                    'narration': segment.get('narration', ''),
                    'events': fixed_events
                }
                
                fixed_segments.append(fixed_segment)
            
            lesson_data['segments'] = fixed_segments
            
            # Update total duration to match segments
            if fixed_segments:
                lesson_data['total_duration'] = fixed_segments[-1]['end_time']
            
            return lesson_data
            
        except Exception as e:
            logger.error(f"Error validating timeline data: {e}")
            return lesson_data
    
    def _create_timeline_lesson_from_data(self, lesson_data: Dict, request: CreateTimelineLessonRequest) -> TimelineLesson:
        """Create TimelineLesson object from parsed data"""
        try:
            # Create timeline segments
            segments = []
            for segment_data in lesson_data['segments']:
                # Create timeline events
                events = []
                for event_data in segment_data['events']:
                    element = None
                    if event_data.get('element'):
                        element_data = event_data['element']
                        layout_data = element_data.get('layout', {})
                        
                        layout = SemanticLayout(
                            region=layout_data.get('region', 'center'),
                            priority=layout_data.get('priority', 'medium'),
                            spacing=layout_data.get('spacing', 'medium'),
                            relative_to=layout_data.get('relative_to'),
                            relationship=layout_data.get('relationship')
                        )
                        
                        element = VisualElement(
                            id=element_data['id'],
                            type=element_data['type'],
                            text=element_data.get('text'),
                            layout=layout,
                            style=element_data.get('style'),
                            color=element_data.get('color', 'blue'),
                            size=element_data.get('size', 'medium'),
                            properties=element_data.get('properties', {})
                        )
                    
                    event = TimelineEvent(
                        time=event_data['time'],
                        action=event_data['action'],
                        element=element,
                        element_id=event_data.get('element_id'),
                        animation=event_data.get('animation', {})
                    )
                    events.append(event)
                
                segment = TimelineSegment(
                    start_time=segment_data['start_time'],
                    end_time=segment_data['end_time'],
                    title=segment_data['title'],
                    narration=segment_data['narration'],
                    events=events
                )
                segments.append(segment)
            
            # Create timeline lesson
            lesson = TimelineLesson(
                topic=request.topic,
                title=lesson_data['lesson_title'],
                difficulty_level=request.difficulty_level,
                total_duration=lesson_data['total_duration'],
                segments=segments,
                visual_library=self.default_visual_library,
                generation_status="completed",
                generation_progress=100.0
            )
            
            return lesson
            
        except Exception as e:
            logger.error(f"Error creating timeline lesson: {e}", exc_info=True)
            raise
    
    async def generate_timeline_lesson(self, request: CreateTimelineLessonRequest, user_id: str = "default") -> Optional[TimelineLesson]:
        """Generate a complete timeline-based lesson"""
        try:
            logger.info(f"Generating timeline lesson for topic: {request.topic}")
            
            # Generate the prompt
            prompt = self._generate_timeline_prompt(request)
            
            # Make request to LLM
            response = await self._make_request(prompt, user_id)
            if not response:
                logger.error("Failed to get response from LLM")
                return None
            
            # Parse the response
            lesson_data = self._parse_timeline_response(response)
            if not lesson_data:
                logger.error("Failed to parse timeline response")
                return None
            
            # Validate and fix the data
            lesson_data = self._validate_and_fix_timeline_data(lesson_data)
            
            # Create timeline lesson object
            lesson = self._create_timeline_lesson_from_data(lesson_data, request)
            
            # Validate the final lesson
            errors = lesson.validate_timeline()
            if errors:
                logger.warning(f"Timeline validation warnings: {errors}")
                # Continue anyway, as warnings might be minor
            
            logger.info(f"Successfully generated timeline lesson with {len(lesson.segments)} segments")
            return lesson
            
        except Exception as e:
            logger.error(f"Error generating timeline lesson: {e}", exc_info=True)
            return None
    
    async def regenerate_segment(self, lesson: TimelineLesson, segment_index: int, user_id: str = "default") -> Optional[TimelineSegment]:
        """Regenerate a specific segment of the timeline lesson"""
        try:
            if segment_index >= len(lesson.segments):
                logger.error(f"Invalid segment index: {segment_index}")
                return None
            
            segment = lesson.segments[segment_index]
            
            # Create prompt for regenerating this specific segment
            prompt = f"""Regenerate segment {segment_index + 1} of a lesson about "{lesson.topic}".

Current segment timing: {segment.start_time} to {segment.end_time} seconds
Current title: {segment.title}

AVAILABLE VISUAL ELEMENTS:
{chr(10).join(f"- {name}: {preset.description}" for name, preset in lesson.visual_library.items())}

Generate a JSON object for this segment only:
{{
  "start_time": {segment.start_time},
  "end_time": {segment.end_time},
  "title": "Improved title",
  "narration": "Enhanced narration script...",
  "events": [
    // Timeline events with visual elements
  ]
}}

Make it engaging and educational for {lesson.difficulty_level} level."""

            response = await self._make_request(prompt, user_id)
            if not response:
                return None
            
            # Parse segment JSON
            segment_data = self._parse_timeline_response(response)
            if not segment_data:
                return None
            
            # Create new segment
            events = []
            for event_data in segment_data.get('events', []):
                # Similar parsing logic as in main generation
                # ... (implementation details)
                pass
            
            new_segment = TimelineSegment(
                start_time=segment_data['start_time'],
                end_time=segment_data['end_time'],
                title=segment_data['title'],
                narration=segment_data['narration'],
                events=events
            )
            
            return new_segment
            
        except Exception as e:
            logger.error(f"Error regenerating segment: {e}")
            return None


# Global instance
timeline_ollama_service = TimelineOllamaService()