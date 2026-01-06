"""
Gemini API client for floor plan generation.
Uses Google AI Studio API to generate color-coded floor plans with Imagen 3.
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
import httpx

from dotenv import load_dotenv

# Load environment variables with explicit encoding handling
try:
    load_dotenv(encoding='utf-8')
except Exception:
    # If .env has encoding issues, try to load anyway
    try:
        load_dotenv(encoding='ascii')
    except Exception:
        pass  # Continue without .env, rely on system environment variables


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
    image_data: Optional[bytes] = None  # Colored version for analysis
    stylized_image_data: Optional[bytes] = None  # Polished version for display
    display_name: Optional[str] = None  # AI-generated descriptive name
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
        retry_delay: float = 2.0,
        use_synthetic_fallback: bool = True
    ):
        """
        Initialize the Gemini client.
        
        Args:
            api_key: Google AI Studio API key (or set GEMINI_API_KEY env var)
            model_name: Gemini model to use for image generation
            max_retries: Number of retry attempts on failure
            retry_delay: Seconds to wait between retries
            use_synthetic_fallback: Generate synthetic floor plans if API fails
        """
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")
        
        self.model_name = model_name
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.use_synthetic_fallback = use_synthetic_fallback
        
        # Configure the API
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_name)
    
    def _generate_synthetic_floor_plan(
        self,
        config: GenerationConfig,
        variation_type: str
    ) -> bytes:
        """
        Generate a synthetic color-coded floor plan image.
        Used as fallback when Imagen API is not available.
        """
        import random
        from PIL import Image, ImageDraw
        
        # Room colors as defined in prompt
        ROOM_COLORS = {
            'living': '#A8D5E5',
            'bedroom': '#E6E6FA', 
            'bathroom': '#98FB98',
            'kitchen': '#FF7F50',
            'hallway': '#F5F5F5',
            'closet': '#DEB887',
            'dining': '#FFE4B5',
            'office': '#B0C4DE',
            'laundry': '#D3D3D3',
            'garage': '#C0C0C0',
        }
        
        def hex_to_rgb(hex_color):
            hex_color = hex_color.lstrip('#')
            return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
        
        # Create image
        width, height = 800, 600
        img = Image.new('RGB', (width, height), 'white')
        draw = ImageDraw.Draw(img)
        
        # Layout parameters based on variation type
        margin = 30
        wall_width = 3
        
        # Seeded random for reproducible but varied layouts
        seed = hash(f"{variation_type}_{config.bedrooms}_{config.style}")
        rng = random.Random(seed)
        
        # Generate room layout based on variation type
        rooms = []
        
        inner_w = width - 2 * margin
        inner_h = height - 2 * margin
        
        if variation_type == 'linear':
            # Rooms in a row
            num_rooms = 3 + config.bedrooms
            room_w = inner_w // num_rooms
            room_types = ['living', 'kitchen', 'dining'] + ['bedroom'] * config.bedrooms + ['bathroom'] * config.bathrooms
            rng.shuffle(room_types)
            
            for i, rt in enumerate(room_types[:num_rooms]):
                rooms.append({
                    'type': rt,
                    'x': margin + i * room_w,
                    'y': margin + rng.randint(0, inner_h // 4),
                    'w': room_w - 10,
                    'h': inner_h - rng.randint(0, inner_h // 4)
                })
                
        elif variation_type == 'compact':
            # Grid layout
            cols, rows = 3, 2
            cell_w = inner_w // cols
            cell_h = inner_h // rows
            room_types = ['living', 'kitchen', 'bathroom'] + ['bedroom'] * config.bedrooms
            
            for i, rt in enumerate(room_types[:cols*rows]):
                col = i % cols
                row = i // cols
                rooms.append({
                    'type': rt,
                    'x': margin + col * cell_w + 5,
                    'y': margin + row * cell_h + 5,
                    'w': cell_w - 10,
                    'h': cell_h - 10
                })
                
        elif variation_type == 'l_shaped':
            # L-shaped layout
            rooms.append({'type': 'living', 'x': margin, 'y': margin, 'w': inner_w * 0.6, 'h': inner_h * 0.5})
            rooms.append({'type': 'kitchen', 'x': margin + inner_w * 0.6 + 10, 'y': margin, 'w': inner_w * 0.35, 'h': inner_h * 0.5})
            rooms.append({'type': 'dining', 'x': margin, 'y': margin + inner_h * 0.5 + 10, 'w': inner_w * 0.4, 'h': inner_h * 0.45})
            
            for i in range(config.bedrooms):
                rooms.append({
                    'type': 'bedroom',
                    'x': margin + inner_w * 0.4 + 10 + i * (inner_w * 0.3),
                    'y': margin + inner_h * 0.5 + 10,
                    'w': inner_w * 0.28,
                    'h': inner_h * 0.45
                })
                
        elif variation_type == 'open_concept':
            # Large open living area
            rooms.append({'type': 'living', 'x': margin, 'y': margin, 'w': inner_w * 0.65, 'h': inner_h * 0.6})
            rooms.append({'type': 'kitchen', 'x': margin + inner_w * 0.35, 'y': margin + 10, 'w': inner_w * 0.28, 'h': inner_h * 0.35})
            
            bedroom_w = inner_w * 0.32
            for i in range(config.bedrooms):
                rooms.append({
                    'type': 'bedroom',
                    'x': margin + i * (bedroom_w + 10),
                    'y': margin + inner_h * 0.65,
                    'w': bedroom_w,
                    'h': inner_h * 0.3
                })
                
            rooms.append({'type': 'bathroom', 'x': margin + inner_w * 0.7, 'y': margin, 'w': inner_w * 0.25, 'h': inner_h * 0.3})
            
        else:
            # Default/traditional layout
            rooms.append({'type': 'living', 'x': margin, 'y': margin, 'w': inner_w * 0.45, 'h': inner_h * 0.55})
            rooms.append({'type': 'kitchen', 'x': margin + inner_w * 0.5, 'y': margin, 'w': inner_w * 0.45, 'h': inner_h * 0.35})
            rooms.append({'type': 'dining', 'x': margin + inner_w * 0.5, 'y': margin + inner_h * 0.4, 'w': inner_w * 0.45, 'h': inner_h * 0.25})
            
            # Hallway
            rooms.append({'type': 'hallway', 'x': margin, 'y': margin + inner_h * 0.58, 'w': inner_w, 'h': inner_h * 0.08})
            
            bedroom_w = inner_w / (config.bedrooms + 1)
            for i in range(config.bedrooms):
                rooms.append({
                    'type': 'bedroom',
                    'x': margin + i * bedroom_w,
                    'y': margin + inner_h * 0.68,
                    'w': bedroom_w - 10,
                    'h': inner_h * 0.28
                })
            
            rooms.append({
                'type': 'bathroom',
                'x': margin + config.bedrooms * bedroom_w,
                'y': margin + inner_h * 0.68,
                'w': bedroom_w - 10,
                'h': inner_h * 0.28
            })
        
        # Draw rooms
        for room in rooms:
            color = ROOM_COLORS.get(room['type'], '#CCCCCC')
            x, y, w, h = int(room['x']), int(room['y']), int(room['w']), int(room['h'])
            
            # Fill room
            draw.rectangle([x, y, x + w, y + h], fill=hex_to_rgb(color))
            
            # Draw walls
            draw.rectangle([x, y, x + w, y + h], outline='black', width=wall_width)
        
        # Add some door openings (gaps in walls)
        for i, room in enumerate(rooms[:-1]):
            if rng.random() > 0.3:
                x = int(room['x'] + room['w'])
                y = int(room['y'] + room['h'] * 0.4)
                draw.rectangle([x - 2, y, x + 2, y + 40], fill='white')
        
        # Save to bytes
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        return buffer.getvalue()
    
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
        Generate a single floor plan using Gemini/Imagen API.
        
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
        last_error = None
        
        # Try Gemini 2.0 Flash for image generation
        for attempt in range(self.max_retries):
            try:
                print(f"[Attempt {attempt + 1}] Generating floor plan with Gemini 2.0: {variation_type}")
                
                # Use Gemini 2.0 Flash Experimental with image output
                url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent"
                
                headers = {
                    "Content-Type": "application/json",
                }
                
                payload = {
                    "contents": [{
                        "parts": [{"text": full_prompt}]
                    }],
                    "generationConfig": {
                        "responseModalities": ["TEXT", "IMAGE"],
                        "temperature": 1.0,
                    }
                }
                
                async with httpx.AsyncClient(timeout=120.0) as client:
                    response = await client.post(
                        f"{url}?key={self.api_key}",
                        json=payload,
                        headers=headers
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        
                        # Extract image from response
                        if "candidates" in data and len(data["candidates"]) > 0:
                            candidate = data["candidates"][0]
                            if "content" in candidate and "parts" in candidate["content"]:
                                for part in candidate["content"]["parts"]:
                                    if "inlineData" in part:
                                        inline_data = part["inlineData"]
                                        if "data" in inline_data:
                                            image_data = base64.b64decode(inline_data["data"])
                                            
                                            generation_time = (time.time() - start_time) * 1000
                                            print(f"[OK] Successfully generated floor plan: {variation_type}")
                                            
                                            return GeneratedPlan(
                                                success=True,
                                                plan_id=plan_id,
                                                image_data=image_data,
                                                prompt_used=full_prompt,
                                                variation_type=variation_type,
                                                generation_time_ms=generation_time
                                            )
                        
                        # Check if we got text instead of image
                        text_response = ""
                        if "candidates" in data and len(data["candidates"]) > 0:
                            for part in data["candidates"][0].get("content", {}).get("parts", []):
                                if "text" in part:
                                    text_response = part["text"][:200]
                        
                        last_error = f"No image in response. Text: {text_response}"
                        print(f"[ERR] {last_error}")
                    else:
                        error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
                        last_error = f"API error {response.status_code}: {error_data}"
                        print(f"[ERR] {last_error}")
                        
                        # Check for rate limiting
                        if response.status_code == 429:
                            print(f"  Rate limited, waiting {self.retry_delay * (attempt + 1)}s...")
                            await asyncio.sleep(self.retry_delay * (attempt + 1))
                            continue
                    
            except Exception as e:
                last_error = str(e)
                print(f"[ERR] Gemini API error: {last_error}")
                
            if attempt < self.max_retries - 1:
                await asyncio.sleep(self.retry_delay)
        
        generation_time = (time.time() - start_time) * 1000
        
        # Fall back to synthetic generation if API fails and fallback is enabled
        if self.use_synthetic_fallback:
            try:
                print(f"[FALLBACK] Using synthetic fallback for: {variation_type}")
                synthetic_image = self._generate_synthetic_floor_plan(config, variation_type)
                
                return GeneratedPlan(
                    success=True,
                    plan_id=plan_id,
                    image_data=synthetic_image,
                    prompt_used=full_prompt,
                    variation_type=variation_type,
                    generation_time_ms=generation_time,
                    error=None
                )
            except Exception as e:
                print(f"[ERR] Synthetic fallback failed: {e}")
                last_error = f"API: {last_error}; Fallback: {e}"
        
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
        parallel: bool = False  # Default to sequential to avoid rate limits
    ) -> List[GeneratedPlan]:
        """
        Generate multiple floor plans with diversity.
        
        Args:
            config: Generation configuration
            count: Number of plans to generate
            parallel: Whether to generate in parallel (default False for API rate limits)
            
        Returns:
            List of GeneratedPlan objects
        """
        import uuid
        
        results = []
        
        for i in range(count):
            plan_id = f"gen_{uuid.uuid4().hex[:8]}"
            print(f"\n{'='*50}")
            print(f"Generating plan {i+1}/{count}")
            print(f"{'='*50}")
            
            result = await self.generate_single(config, variation_index=i, plan_id=plan_id)
            results.append(result)
            
            # Delay between generations to respect rate limits
            if i < count - 1:
                delay = 2.0 if not self.use_synthetic_fallback else 0.1
                print(f"Waiting {delay}s before next generation...")
                await asyncio.sleep(delay)
        
        return results

    def generate_batch_sync(
        self,
        config: GenerationConfig,
        count: int = 6
    ) -> List[GeneratedPlan]:
        """Synchronous wrapper for batch generation."""
        return asyncio.run(self.generate_batch(config, count))

    async def stylize_plan(self, image_data: bytes, max_retries: int = 3) -> Optional[bytes]:
        """
        Transform a color-coded floor plan into a realistic rendered floor plan.
        
        Args:
            image_data: The colored floor plan image bytes
            max_retries: Number of retry attempts for rate limiting
            
        Returns:
            Stylized image bytes, or None if failed
        """
        prompt = """Transform this color-coded floor plan into a photorealistic 3D-rendered floor plan viewed from directly above.

VISUAL STYLE REQUIREMENTS:
- Realistic wood flooring texture throughout living areas and bedrooms (light oak/beige wood grain)
- White/light gray tile texture for bathrooms and kitchen areas
- Dark gray concrete texture for garage and gym areas
- Light blue water texture for any pool areas
- Thick black walls (about 6-8 pixels) with clean edges
- Soft shadows where walls meet floors for depth

FURNITURE TO ADD (top-down view):
- Bedrooms: White beds with pillows, nightstands, dressers
- Living room: Sectional sofa, coffee table, area rug, entertainment center
- Kitchen: White counters/cabinets in L or U shape, island if space allows
- Dining area: Table with chairs
- Bathrooms: White toilet, sink/vanity, bathtub or shower
- Garage: 1-2 gray cars viewed from above
- Office: Desk, chair
- Gym (if present): Weight bench, equipment in dark gray room

IMPORTANT:
- Keep the EXACT same room layout and wall positions from the input
- Top-down orthographic view only (no perspective/angle)
- Photorealistic rendered style like high-end real estate marketing
- No text labels, dimensions, or annotations
- Warm, inviting color palette

Output a beautiful, photorealistic rendered floor plan image."""

        image_b64 = base64.b64encode(image_data).decode('utf-8')
        # Use Gemini 3 Pro Image for better rendering quality
        url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent"
        
        payload = {
            "contents": [{
                "parts": [
                    {
                        "inlineData": {
                            "mimeType": "image/png",
                            "data": image_b64
                        }
                    },
                    {"text": prompt}
                ]
            }],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"],
                "temperature": 0.7,
            }
        }
        
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    response = await client.post(
                        f"{url}?key={self.api_key}",
                        json=payload,
                        headers={"Content-Type": "application/json"}
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        
                        if "candidates" in data and len(data["candidates"]) > 0:
                            candidate = data["candidates"][0]
                            if "content" in candidate and "parts" in candidate["content"]:
                                for part in candidate["content"]["parts"]:
                                    if "inlineData" in part:
                                        inline_data = part["inlineData"]
                                        if "data" in inline_data:
                                            print("[OK] Successfully stylized floor plan")
                                            return base64.b64decode(inline_data["data"])
                        
                        print("[WARN] No image in stylize response")
                        return None
                        
                    elif response.status_code == 429:
                        # Rate limited - wait and retry
                        wait_time = (attempt + 1) * 3  # 3s, 6s, 9s
                        print(f"[WARN] Stylize rate limited, waiting {wait_time}s (attempt {attempt + 1}/{max_retries})")
                        await asyncio.sleep(wait_time)
                        continue
                    else:
                        print(f"[ERR] Stylize API error: {response.status_code}")
                        return None
                        
            except Exception as e:
                print(f"[ERR] Stylize failed: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2)
                    continue
                return None
        
        print("[ERR] Stylize failed after all retries")
        return None

    async def edit_plan(self, image_data: bytes, instruction: str) -> Optional[bytes]:
        """
        Edit a floor plan based on user instructions using image-to-image.
        
        Args:
            image_data: The original floor plan image bytes
            instruction: User's edit instruction (e.g., "Add a pool to the backyard")
            
        Returns:
            Edited image bytes, or None if failed
        """
        prompt = f"""Modify this floor plan according to the following instruction:

INSTRUCTION: {instruction}

REQUIREMENTS:
- Keep the same color coding scheme for room types:
  * Living Room: #A8D5E5 (light blue)
  * Bedroom: #E6E6FA (lavender)
  * Bathroom: #98FB98 (mint green)
  * Kitchen: #FF7F50 (coral)
  * Hallway: #F5F5F5 (light gray)
  * Pool/Outdoor: #87CEEB (sky blue)
- Maintain black walls
- Keep white background
- Apply the requested modification while preserving the overall floor plan structure
- Keep it as a clean 2D top-down floor plan
- Do NOT add furniture, text labels, or dimensions

Output the modified floor plan image."""

        try:
            image_b64 = base64.b64encode(image_data).decode('utf-8')
            
            # Use Gemini 3 Pro Image for better editing quality
            url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent"
            
            payload = {
                "contents": [{
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": "image/png",
                                "data": image_b64
                            }
                        },
                        {"text": prompt}
                    ]
                }],
                "generationConfig": {
                    "responseModalities": ["TEXT", "IMAGE"],
                    "temperature": 0.9,
                }
            }
            
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{url}?key={self.api_key}",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if "candidates" in data and len(data["candidates"]) > 0:
                        candidate = data["candidates"][0]
                        if "content" in candidate and "parts" in candidate["content"]:
                            for part in candidate["content"]["parts"]:
                                if "inlineData" in part:
                                    inline_data = part["inlineData"]
                                    if "data" in inline_data:
                                        print(f"[OK] Successfully edited floor plan: {instruction[:50]}...")
                                        return base64.b64decode(inline_data["data"])
                    
                    print("[WARN] No image in edit response")
                else:
                    print(f"[ERR] Edit API error: {response.status_code}")
                    
        except Exception as e:
            print(f"[ERR] Edit failed: {e}")
        
        return None

    async def generate_plan_name(self, image_data: bytes) -> str:
        """
        Generate a descriptive name for a floor plan using AI.
        
        Args:
            image_data: The floor plan image bytes
            
        Returns:
            A descriptive name like "Modern L-Shaped with Central Kitchen"
        """
        prompt = """Look at this floor plan and give it a descriptive name in 3-5 words.

Focus on:
- The overall layout shape (L-shaped, linear, compact, open, etc.)
- Key distinctive features (split bedrooms, central kitchen, open concept, etc.)
- The style/feel (modern, cozy, spacious, efficient, etc.)

Examples of good names:
- "Spacious Open-Concept Ranch"
- "Compact Urban Studio"
- "L-Shaped Split Bedroom"
- "Modern Courtyard Layout"
- "Traditional Central Hall"
- "Efficient Linear Design"

Respond with ONLY the name, nothing else. No quotes, no explanation."""

        try:
            image_b64 = base64.b64encode(image_data).decode('utf-8')
            
            url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent"
            
            payload = {
                "contents": [{
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": "image/png",
                                "data": image_b64
                            }
                        },
                        {"text": prompt}
                    ]
                }],
                "generationConfig": {
                    "temperature": 0.7,
                }
            }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{url}?key={self.api_key}",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if "candidates" in data and len(data["candidates"]) > 0:
                        candidate = data["candidates"][0]
                        if "content" in candidate and "parts" in candidate["content"]:
                            for part in candidate["content"]["parts"]:
                                if "text" in part:
                                    name = part["text"].strip().strip('"').strip("'")
                                    # Limit to reasonable length
                                    if len(name) > 50:
                                        name = name[:50]
                                    print(f"[OK] Generated name: {name}")
                                    return name
                    
        except Exception as e:
            print(f"[ERR] Name generation failed: {e}")
        
        # Fallback to variation type
        return "Floor Plan"


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

