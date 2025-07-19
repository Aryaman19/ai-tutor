import asyncio
import httpx
from typing import Dict, List, Optional
from config import settings
from models.lesson import CanvasStep
from models.settings import UserSettings


class OllamaService:
    """Service for interacting with Ollama AI model"""
    
    def __init__(self):
        self.base_url = settings.get_ollama_url()
        self.model = "gemma3n:latest"  # Use the available model
        self.timeout = 60.0
        
    async def _make_request(self, prompt: str, user_id: str = "default") -> Optional[str]:
        """Make a request to Ollama API with user settings"""
        try:
            # Get user's LLM settings
            user_settings = await UserSettings.find_one(UserSettings.user_id == user_id)
            llm_settings = user_settings.llm if user_settings else None
            
            # Use settings or defaults
            model = llm_settings.model if llm_settings else self.model
            temperature = llm_settings.temperature if llm_settings else 0.7
            max_tokens = llm_settings.max_tokens if llm_settings else 2048
            
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
                    return result.get("response", "")
                else:
                    print(f"Ollama API error: {response.status_code} - {response.text}")
                    return None
                    
        except httpx.RequestError as e:
            print(f"Request error: {e}")
            return None
        except Exception as e:
            print(f"Unexpected error: {e}")
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

Format your response as follows:
Step 1: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over, conversational tone]

Step 2: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over, conversational tone]

Step 3: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over, conversational tone]

Step 4: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over, conversational tone]

Step 5: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over, conversational tone]

Keep each step concise but informative, and make sure the progression is logical and easy to follow. The narration should be engaging and sound natural when spoken aloud.
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
                        duration=self._estimate_duration(narration_text) if narration_text else None
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
                duration=self._estimate_duration(response)
            ))
        
        return steps
    
    def _estimate_duration(self, text: str) -> float:
        """Estimate the duration of speech for given text in seconds"""
        if not text:
            return 0.0
        
        # Average speaking rate is about 150-200 words per minute
        # We'll use 180 words per minute as a baseline
        words = len(text.split())
        words_per_minute = 180
        duration_minutes = words / words_per_minute
        duration_seconds = duration_minutes * 60
        
        # Add some buffer time for pauses and pacing
        return max(duration_seconds * 1.2, 2.0)  # Minimum 2 seconds
    
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

Think about visual concepts like:
- Simple shapes (rectangles, circles, arrows)
- Flow diagrams and connections
- Labels and annotations
- Progressive building of concepts
- Clear visual metaphors and analogies

Format your response as follows:
Step 1: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over - natural, conversational tone]
VISUAL_ELEMENTS: [Describe what to draw: shapes, text, arrows, positioning]

Step 2: [Title]
EXPLANATION: [Detailed explanation for reading]
NARRATION: [Script for voice-over - natural, conversational tone]
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
                        duration=self._estimate_duration(narration_text) if narration_text else None
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
                duration=self._estimate_duration(response)
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


# Global instance
ollama_service = OllamaService()