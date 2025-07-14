import asyncio
import httpx
from typing import Dict, List, Optional
from config import settings
from models.lesson import CanvasStep


class OllamaService:
    """Service for interacting with Ollama AI model"""
    
    def __init__(self):
        self.base_url = settings.get_ollama_url()
        self.model = "gemma3n:latest"  # Use the available model
        self.timeout = 60.0
        
    async def _make_request(self, prompt: str) -> Optional[str]:
        """Make a request to Ollama API"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False
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
    
    async def generate_eli5_lesson(self, topic: str, difficulty_level: str = "beginner") -> Optional[List[CanvasStep]]:
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
3. Simple examples or analogies when possible

Format your response as follows:
Step 1: [Title]
[Detailed explanation]

Step 2: [Title]
[Detailed explanation]

Step 3: [Title]
[Detailed explanation]

Step 4: [Title]
[Detailed explanation]

Step 5: [Title]
[Detailed explanation]

Keep each step concise but informative, and make sure the progression is logical and easy to follow.
"""
        
        response = await self._make_request(prompt)
        
        if not response:
            return None
            
        return self._parse_lesson_steps(response)
    
    def _parse_lesson_steps(self, response: str) -> List[CanvasStep]:
        """Parse the Ollama response into CanvasStep objects"""
        steps = []
        lines = response.strip().split('\n')
        
        current_step = None
        current_content = []
        step_number = 1
        
        for line in lines:
            line = line.strip()
            
            if line.startswith(f"Step {step_number}:"):
                # Save previous step if exists
                if current_step and current_content:
                    steps.append(CanvasStep(
                        step_number=step_number - 1,
                        title=current_step,
                        content='\n'.join(current_content).strip()
                    ))
                
                # Start new step
                current_step = line.replace(f"Step {step_number}:", "").strip()
                current_content = []
                step_number += 1
                
            elif line and current_step:
                current_content.append(line)
        
        # Add the last step
        if current_step and current_content:
            steps.append(CanvasStep(
                step_number=step_number - 1,
                title=current_step,
                content='\n'.join(current_content).strip()
            ))
        
        # If parsing failed, create a fallback single step
        if not steps:
            steps.append(CanvasStep(
                step_number=1,
                title="Understanding the Topic",
                content=response
            ))
        
        return steps
    
    async def generate_doubt_answer(self, question: str, lesson_topic: str) -> Optional[str]:
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