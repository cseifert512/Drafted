"""
Gemini API client for floor plan generation.
Uses Google AI Studio API to generate color-coded floor plans.
"""

import os
import asyncio
import base64
import time
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
import google.generativeai as genai
from PIL import Image
import io

from dotenv import load_dotenv

load_dotenv()


@dataclass
class GenerationConfig:
    """Configuration for floor plan generation."""
    bedrooms: int = 3
    bathrooms: int = 2
    sqft: int = 2000
    style: str = "modern"
    additional_rooms: List[str] = field(default_factory=list)


@dataclass
class GeneratedPlan:
    """Result from a single floor plan generation."""
    success: bool
    plan_id: str
    image_data: Optional[bytes] = None
    prompt_used: str = ""
    variation_type: str = ""
    generation_time_ms: float = 0
    error: Optional[str] = None


class GeminiFloorPlanGenerator:
    """
    Client for generating floor plans using Google Gemini.
    
    Handles:
    - API initialization and authentication
    - Engineered prompts for color-coded output
    - Batch generation with diversity seeds
    - Retry logic and rate limiting
    """
    
    # Variation seeds for diverse generation
    VARIATION_SEEDS = [
        ("linear", "Use a LINEAR/elongated layout with rooms arranged in a row along a central corridor"),
        ("compact", "Use a COMPACT/square layout with efficient central circulation and minimal hallway space"),
        ("l_shaped", "Use an L-SHAPED layout that wraps around a corner, creating distinct wings"),
        ("open_concept", "Use an OPEN CONCEPT layout with minimal walls between living, dining, and kitchen"),
        ("split", "Use a SPLIT BEDROOM layout with the master suite on one end and other bedrooms on the opposite"),
        ("courtyard", "Use a COURTYARD-INSPIRED layout with rooms arranged around a central outdoor or open space"),
        ("traditional", "Use a TRADITIONAL layout with clearly defined rooms separated by walls and doors"),
        ("circular", "Use a CIRCULAR FLOW layout where rooms connect in a loop for easy movement"),
        ("cluster", "Use a CLUSTERED layout grouping related rooms (sleeping cluster, living cluster)"),
        ("asymmetric", "Use an ASYMMETRIC layout with an irregular, non-rectangular footprint"),
    ]
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: str = "gemini-2.0-flash-exp",
        max_retries: int = 3,
        retry_delay: float = 2.0
    ):
        """
        Initialize the Gemini client.
        
        Args:
            api_key: Google AI Studio API key (or set GEMINI_API_KEY env var)
            model_name: Gemini model to use for image generation
            max_retries: Number of retry attempts on failure
            retry_delay: Seconds to wait between retries
        """
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")
        
        self.model_name = model_name
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        
        # Configure the API
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_name)
    
    def _build_base_prompt(self, config: GenerationConfig) -> str:
        """Build the base prompt with color-coded requirements."""
        
        additional = ""
        if config.additional_rooms:
            additional = f"\n- Additional spaces: {', '.join(config.additional_rooms)}"
        
        return f"""You are an architectural floor plan generator. Generate a top-down 2D floor plan image.

STRICT VISUAL REQUIREMENTS - FOLLOW EXACTLY:
- Fill each room with SOLID, FLAT colors (absolutely NO gradients, textures, patterns, or shading):
  * Living Room / Family Room: #A8D5E5 (light blue)
  * Bedroom: #E6E6FA (lavender/light purple)
  * Bathroom: #98FB98 (mint green)
  * Kitchen: #FF7F50 (coral/orange)
  * Hallway / Corridor: #F5F5F5 (very light gray)
  * Closet / Storage / Pantry: #DEB887 (tan/burlywood)
  * Dining Room: #FFE4B5 (moccasin/light orange)
  * Office / Study: #B0C4DE (light steel blue)
  * Laundry / Utility: #D3D3D3 (light gray)
  * Garage: #C0C0C0 (silver)
- ALL walls must be BLACK (#000000), drawn as solid lines approximately 3 pixels thick
- Background MUST be pure WHITE (#FFFFFF)
- Each room should be a simple rectangle or polygon filled with its designated solid color
- DO NOT include ANY of the following:
  * Furniture, appliances, or fixtures
  * Text labels, room names, or dimensions
  * 3D perspective or isometric views
  * Shadows, gradients, or lighting effects
  * Doors (just openings in walls) or window symbols
  * Multiple floors - single floor only
  * Decorative elements or landscaping

FLOOR PLAN PROGRAM REQUIREMENTS:
- {config.bedrooms} bedroom(s)
- {config.bathrooms} bathroom(s)
- Approximately {config.sqft} square feet total
- Architectural style: {config.style}{additional}

Generate a clean, simple, color-coded architectural floor plan viewed from directly above."""

    def _build_variation_prompt(
        self, 
        base_prompt: str, 
        variation_type: str,
        variation_instruction: str
    ) -> str:
        """Add variation seed to the base prompt."""
        return f"""{base_prompt}

LAYOUT VARIATION REQUIREMENT:
{variation_instruction}

Create a unique floor plan that clearly demonstrates this layout approach. Make the layout distinctly different from conventional arrangements."""

    async def generate_single(
        self,
        config: GenerationConfig,
        variation_index: int = 0,
        plan_id: Optional[str] = None
    ) -> GeneratedPlan:
        """
        Generate a single floor plan.
        
        Args:
            config: Generation configuration
            variation_index: Which variation seed to use
            plan_id: Optional ID for the plan
            
        Returns:
            GeneratedPlan with image data
        """
        import uuid
        
        if plan_id is None:
            plan_id = f"gen_{uuid.uuid4().hex[:8]}"
        
        # Get variation seed
        variation_type, variation_instruction = self.VARIATION_SEEDS[
            variation_index % len(self.VARIATION_SEEDS)
        ]
        
        # Build prompt
        base_prompt = self._build_base_prompt(config)
        full_prompt = self._build_variation_prompt(
            base_prompt, 
            variation_type, 
            variation_instruction
        )
        
        start_time = time.time()
        
        # Retry loop
        last_error = None
        for attempt in range(self.max_retries):
            try:
                # Generate image using Gemini
                response = await asyncio.to_thread(
                    self.model.generate_content,
                    full_prompt,
                    generation_config=genai.types.GenerationConfig(
                        candidate_count=1,
                        temperature=0.9,  # Higher for more variation
                    )
                )
                
                # Extract image from response
                if response.parts:
                    for part in response.parts:
                        if hasattr(part, 'inline_data') and part.inline_data:
                            image_data = part.inline_data.data
                            if isinstance(image_data, str):
                                image_data = base64.b64decode(image_data)
                            
                            generation_time = (time.time() - start_time) * 1000
                            
                            return GeneratedPlan(
                                success=True,
                                plan_id=plan_id,
                                image_data=image_data,
                                prompt_used=full_prompt,
                                variation_type=variation_type,
                                generation_time_ms=generation_time
                            )
                
                # If no image in response, try to get text response and check for errors
                if response.text:
                    last_error = f"Model returned text instead of image: {response.text[:200]}"
                else:
                    last_error = "No image data in response"
                    
            except Exception as e:
                last_error = str(e)
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
        
        generation_time = (time.time() - start_time) * 1000
        
        return GeneratedPlan(
            success=False,
            plan_id=plan_id,
            prompt_used=full_prompt,
            variation_type=variation_type,
            generation_time_ms=generation_time,
            error=last_error
        )

    async def generate_batch(
        self,
        config: GenerationConfig,
        count: int = 6,
        parallel: bool = True
    ) -> List[GeneratedPlan]:
        """
        Generate multiple floor plans with diversity.
        
        Args:
            config: Generation configuration
            count: Number of plans to generate
            parallel: Whether to generate in parallel
            
        Returns:
            List of GeneratedPlan objects
        """
        import uuid
        
        # Create tasks for each plan
        tasks = []
        for i in range(count):
            plan_id = f"gen_{uuid.uuid4().hex[:8]}"
            tasks.append(
                self.generate_single(config, variation_index=i, plan_id=plan_id)
            )
        
        if parallel:
            # Run all generations in parallel (with some throttling)
            # Split into batches of 3 to avoid rate limits
            results = []
            batch_size = 3
            for i in range(0, len(tasks), batch_size):
                batch = tasks[i:i + batch_size]
                batch_results = await asyncio.gather(*batch)
                results.extend(batch_results)
                
                # Small delay between batches to avoid rate limiting
                if i + batch_size < len(tasks):
                    await asyncio.sleep(1.0)
            
            return results
        else:
            # Sequential generation
            results = []
            for task in tasks:
                result = await task
                results.append(result)
            return results

    def generate_batch_sync(
        self,
        config: GenerationConfig,
        count: int = 6
    ) -> List[GeneratedPlan]:
        """Synchronous wrapper for batch generation."""
        return asyncio.run(self.generate_batch(config, count))


# Convenience function for quick generation
def generate_floor_plans(
    bedrooms: int = 3,
    bathrooms: int = 2,
    sqft: int = 2000,
    style: str = "modern",
    count: int = 6,
    additional_rooms: Optional[List[str]] = None
) -> List[GeneratedPlan]:
    """
    Quick function to generate floor plans.
    
    Args:
        bedrooms: Number of bedrooms
        bathrooms: Number of bathrooms
        sqft: Target square footage
        style: Architectural style
        count: Number of plans to generate
        additional_rooms: Extra rooms to include
        
    Returns:
        List of GeneratedPlan objects
    """
    config = GenerationConfig(
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        sqft=sqft,
        style=style,
        additional_rooms=additional_rooms or []
    )
    
    generator = GeminiFloorPlanGenerator()
    return generator.generate_batch_sync(config, count)

