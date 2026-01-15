"""
Drafted.ai Floor Plan Generation Client

Connects to Drafted's production model hosted on Runpod.
Handles prompt construction, generation, and seed-based editing.
"""

import os
import asyncio
import base64
import json
import time
from typing import List, Optional, Dict, Any, Tuple
from dataclasses import dataclass, field
from pathlib import Path
import httpx

# Load rooms schema
ROOMS_SCHEMA_PATH = Path(__file__).parent / "rooms.json"


@dataclass
class RoomSpec:
    """Specification for a single room in the floor plan."""
    room_type: str  # Key from rooms.json (e.g., "primary_bedroom", "kitchen")
    size: str  # S, M, L, XL
    
    
@dataclass
class GenerationConfig:
    """Configuration for floor plan generation."""
    rooms: List[RoomSpec] = field(default_factory=list)
    target_sqft: Optional[int] = None  # If None, calculated from rooms
    
    # Generation parameters
    num_steps: int = 30
    guidance_scale: float = 7.5
    seed: Optional[int] = None  # Random if None
    resolution: int = 768


@dataclass 
class GeneratedRoom:
    """Room data from generation response."""
    room_type: str
    canonical_key: str
    area_sqft: float
    width_inches: float
    height_inches: float


@dataclass
class GenerationResult:
    """Result from floor plan generation."""
    success: bool
    plan_id: str
    
    # Image data
    image_base64: Optional[str] = None
    image_bytes: Optional[bytes] = None
    
    # Structured output
    svg: Optional[str] = None
    rooms: List[GeneratedRoom] = field(default_factory=list)
    total_area_sqft: float = 0.0
    
    # Request info
    prompt_used: str = ""
    seed_used: int = 0
    elapsed_seconds: float = 0.0
    
    # Error handling
    error: Optional[str] = None


class RoomsCatalog:
    """
    Manages the rooms.json schema for prompt generation.
    
    Handles:
    - Loading and caching room definitions
    - Mapping sizes (S/M/L/XL) to prompt_name tokens
    - Calculating sqft from room specs
    - Ordering rooms by priority
    """
    
    def __init__(self, schema_path: Optional[Path] = None):
        self.schema_path = schema_path or ROOMS_SCHEMA_PATH
        self._schema: Optional[Dict] = None
        
    @property
    def schema(self) -> Dict:
        """Lazy load the rooms schema."""
        if self._schema is None:
            with open(self.schema_path, 'r') as f:
                self._schema = json.load(f)
        return self._schema
    
    @property
    def types(self) -> Dict[str, Dict]:
        """Get all room type definitions."""
        return self.schema.get("types", {})
    
    def get_room_type(self, key: str) -> Optional[Dict]:
        """Get a room type definition by key."""
        return self.types.get(key)
    
    def get_prompt_name(self, room_type: str, size: str) -> Optional[str]:
        """
        Get the prompt token for a room type and size.
        
        Args:
            room_type: Key from rooms.json (e.g., "primary_bedroom")
            size: S, M, L, or XL
            
        Returns:
            Prompt name token (e.g., "suite", "spa") or None if not found
        """
        room_def = self.get_room_type(room_type)
        if not room_def:
            return None
            
        sizes = room_def.get("sizes", {})
        size_def = sizes.get(size.upper())
        if not size_def:
            return None
            
        return size_def.get("prompt_name")
    
    def get_display_name(self, room_type: str) -> str:
        """Get human-readable display name for a room type."""
        room_def = self.get_room_type(room_type)
        if room_def:
            return room_def.get("display", room_type)
        return room_type
    
    def get_prompt_key(self, room_type: str) -> str:
        """
        Get the key to use in prompts.
        
        Some rooms have name_override in prompt config.
        """
        room_def = self.get_room_type(room_type)
        if not room_def:
            return room_type
            
        prompt_config = room_def.get("prompt", {})
        override = prompt_config.get("name_override")
        if override:
            return override.lower()
        
        # Convert key to prompt format (e.g., "primary_bedroom" -> "primary bed")
        return room_type.replace("_", " ").replace("bedroom", "bed").replace("bathroom", "bath")
    
    def get_priority(self, room_type: str) -> int:
        """Get sort priority for a room type (lower = earlier in prompt)."""
        room_def = self.get_room_type(room_type)
        if not room_def:
            return 99
        return room_def.get("prompt", {}).get("priority", 99)
    
    def is_hidden(self, room_type: str) -> bool:
        """Check if room type should be hidden from prompts."""
        room_def = self.get_room_type(room_type)
        if not room_def:
            return True
        return room_def.get("prompt", {}).get("hidden", False)
    
    def get_sqft_range(self, room_type: str, size: str) -> Tuple[float, float]:
        """Get min/max sqft for a room type and size."""
        room_def = self.get_room_type(room_type)
        if not room_def:
            return (0, 0)
            
        size_def = room_def.get("sizes", {}).get(size.upper(), {})
        return (
            size_def.get("area_min_sqft", 0),
            size_def.get("area_max_sqft", 0)
        )
    
    def get_sqft_midpoint(self, room_type: str, size: str) -> float:
        """Get midpoint sqft for a room type and size."""
        min_sqft, max_sqft = self.get_sqft_range(room_type, size)
        return (min_sqft + max_sqft) / 2
    
    def calculate_total_sqft(self, rooms: List[RoomSpec], markup: float = 1.15) -> int:
        """
        Calculate total sqft from room specs.
        
        Uses midpoint of each room's size range, then applies
        markup for hallways/walls (default 15%).
        """
        total = 0.0
        for room in rooms:
            total += self.get_sqft_midpoint(room.room_type, room.size)
        return int(total * markup)
    
    def sort_rooms_by_priority(self, rooms: List[RoomSpec]) -> List[RoomSpec]:
        """
        Sort rooms by prompt priority (required ordering).
        
        STRICT ordering (critical for model adherence):
        1. primary_bedroom (primary bed) - priority 0
        2. primary_bathroom (primary bath) - priority 1
        3. primary_closet - priority 2
        4. EVERYTHING ELSE ALPHABETICALLY by prompt key - priority 99
        """
        # Strict priority mapping - PRIMARY rooms first, then alphabetical
        strict_priorities = {
            "primary_bedroom": 0,    # Primary bed FIRST
            "primary_bathroom": 1,   # Primary bath SECOND
            "primary_closet": 2,     # Primary closet THIRD
        }
        
        def get_sort_key(room: RoomSpec) -> tuple:
            priority = strict_priorities.get(room.room_type, 99)
            prompt_key = self.get_prompt_key(room.room_type)
            return (priority, prompt_key)
        
        return sorted(rooms, key=get_sort_key)
    
    def get_all_room_types(self, include_hidden: bool = False) -> List[str]:
        """Get list of all available room types."""
        return [
            key for key, room_def in self.types.items()
            if include_hidden or not room_def.get("prompt", {}).get("hidden", False)
        ]
    
    def get_available_sizes(self, room_type: str) -> List[str]:
        """Get available sizes for a room type."""
        room_def = self.get_room_type(room_type)
        if not room_def:
            return []
        return list(room_def.get("sizes", {}).keys())


class DraftedPromptBuilder:
    """
    Builds prompts for Drafted's production model.
    
    Handles:
    - Room ordering by priority
    - Token counting (77 token CLIP limit)
    - Prompt name mapping from sizes
    - Total area calculation
    """
    
    MAX_TOKENS = 77  # CLIP tokenization limit
    
    def __init__(self, catalog: Optional[RoomsCatalog] = None):
        self.catalog = catalog or RoomsCatalog()
    
    def build_prompt(self, config: GenerationConfig) -> str:
        """
        Build a generation prompt from config.
        
        Format:
            area = XXXX sqft
            
            primary bed = suite
            primary bath = spa
            ...
        """
        lines = []
        
        # Calculate or use provided sqft
        sqft = config.target_sqft
        if sqft is None:
            sqft = self.catalog.calculate_total_sqft(config.rooms)
        
        lines.append(f"area = {sqft} sqft")
        lines.append("")  # Blank line after area
        
        # Sort rooms by priority
        sorted_rooms = self.catalog.sort_rooms_by_priority(config.rooms)
        
        # Build room lines
        for room in sorted_rooms:
            if self.catalog.is_hidden(room.room_type):
                continue
                
            prompt_key = self.catalog.get_prompt_key(room.room_type)
            prompt_name = self.catalog.get_prompt_name(room.room_type, room.size)
            
            if prompt_name:
                lines.append(f"{prompt_key} = {prompt_name.lower()}")
        
        prompt = "\n".join(lines)
        
        # Validate token count
        token_count = self.estimate_tokens(prompt)
        if token_count > self.MAX_TOKENS:
            print(f"[WARN] Prompt has ~{token_count} tokens, exceeds {self.MAX_TOKENS} limit")
        
        return prompt
    
    def estimate_tokens(self, text: str) -> int:
        """
        Estimate CLIP token count.
        
        This is a rough estimate - for accurate counting,
        use a proper CLIP tokenizer.
        
        CLIP BPE typically: ~1 token per 4 chars for English text
        """
        # Simple estimation: split on whitespace and special chars
        # Real implementation should use tiktoken or transformers
        words = text.replace("=", " ").replace("\n", " ").split()
        return len(words) + 2  # +2 for start/end tokens
    
    def modify_prompt_for_edit(
        self,
        original_prompt: str,
        add_rooms: Optional[List[RoomSpec]] = None,
        remove_rooms: Optional[List[str]] = None,
        resize_rooms: Optional[Dict[str, str]] = None,
        adjust_sqft: Optional[int] = None
    ) -> str:
        """
        Modify an existing prompt for seed-based editing.
        
        Args:
            original_prompt: The original generation prompt
            add_rooms: Rooms to add
            remove_rooms: Room types to remove
            resize_rooms: Dict of room_type -> new_size
            adjust_sqft: New total sqft (or delta if prefixed with +/-)
            
        Returns:
            Modified prompt for use with same seed
        """
        print(f"[DEBUG] modify_prompt_for_edit called")
        print(f"[DEBUG] Original prompt:\n{original_prompt}")
        print(f"[DEBUG] add_rooms={add_rooms}, remove_rooms={remove_rooms}, resize_rooms={resize_rooms}, adjust_sqft={adjust_sqft}")
        
        lines = original_prompt.strip().split("\n")
        
        # Parse existing prompt
        sqft_line = lines[0] if lines else "area = 2000 sqft"
        room_lines = [l for l in lines[1:] if l.strip() and "=" in l]
        
        print(f"[DEBUG] Parsed {len(room_lines)} room lines from original prompt")
        
        # Parse current sqft for auto-adjustment
        current_sqft = int(sqft_line.split("=")[1].strip().replace("sqft", "").strip())
        sqft_delta = 0  # Track sqft changes from room modifications
        
        # Remove rooms and track sqft delta
        if remove_rooms:
            before_count = len(room_lines)
            new_room_lines = []
            for line in room_lines:
                should_remove = any(r.lower() in line.lower() for r in remove_rooms)
                if should_remove:
                    # Estimate sqft reduction for removed room
                    room_type, size = self._parse_room_line(line)
                    if room_type and size:
                        sqft_delta -= self.catalog.get_sqft_midpoint(room_type, size)
                else:
                    new_room_lines.append(line)
            room_lines = new_room_lines
            print(f"[DEBUG] Removed {before_count - len(room_lines)} rooms, sqft_delta={sqft_delta}")
        
        # Resize rooms and track sqft delta
        if resize_rooms:
            new_room_lines = []
            for line in room_lines:
                modified = False
                for room_type, new_size in resize_rooms.items():
                    if room_type.lower().replace("_", " ") in line.lower():
                        # Get old size sqft
                        _, old_size = self._parse_room_line(line)
                        old_sqft = self.catalog.get_sqft_midpoint(room_type, old_size) if old_size else 0
                        new_sqft = self.catalog.get_sqft_midpoint(room_type, new_size)
                        sqft_delta += (new_sqft - old_sqft)
                        
                        prompt_key = line.split("=")[0].strip()
                        prompt_name = self.catalog.get_prompt_name(room_type, new_size)
                        if prompt_name:
                            new_room_lines.append(f"{prompt_key} = {prompt_name.lower()}")
                            modified = True
                            break
                if not modified:
                    new_room_lines.append(line)
            room_lines = new_room_lines
        
        # Add rooms and track sqft delta
        if add_rooms:
            for room in add_rooms:
                prompt_key = self.catalog.get_prompt_key(room.room_type)
                prompt_name = self.catalog.get_prompt_name(room.room_type, room.size)
                if prompt_name:
                    room_lines.append(f"{prompt_key} = {prompt_name.lower()}")
                    # Add sqft for new room
                    sqft_delta += self.catalog.get_sqft_midpoint(room.room_type, room.size)
                    print(f"[DEBUG] Added room: {prompt_key} = {prompt_name.lower()}")
        
        # Calculate final sqft
        if adjust_sqft is not None:
            # Explicit sqft adjustment overrides auto-calculation
            new_sqft = adjust_sqft if adjust_sqft > 0 else current_sqft + adjust_sqft
        else:
            # Auto-adjust based on room changes (apply 15% markup for walls/hallways)
            new_sqft = current_sqft + int(sqft_delta * 1.15)
        
        sqft_line = f"area = {new_sqft} sqft"
        print(f"[DEBUG] Sqft: {current_sqft} -> {new_sqft} (delta: {sqft_delta})")
        
        # RE-SORT rooms by priority to maintain correct ordering
        # This is critical for model adherence!
        sorted_room_lines = self._sort_room_lines_by_priority(room_lines)
        
        final_prompt = sqft_line + "\n\n" + "\n".join(sorted_room_lines)
        print(f"[DEBUG] Final modified prompt ({len(sorted_room_lines)} rooms):\n{final_prompt}")
        
        return final_prompt
    
    def _parse_room_line(self, line: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Parse a room line back to room_type and size.
        
        Args:
            line: Prompt line like "primary bed = suite"
            
        Returns:
            Tuple of (room_type, size) or (None, None) if not parseable
        """
        if "=" not in line:
            return None, None
        
        prompt_key = line.split("=")[0].strip().lower()
        prompt_name = line.split("=")[1].strip().lower()
        
        # Map prompt keys back to room types
        key_to_type = {
            "primary bed": "primary_bedroom",
            "primary bath": "primary_bathroom",
            "primary closet": "primary_closet",
            "bed + closet": "bedroom",
            "bedroom + closet": "bedroom",
        }
        
        # Try exact match first
        room_type = key_to_type.get(prompt_key)
        
        if not room_type:
            # Try to find matching room type from catalog
            for rt_key in self.catalog.get_all_room_types(include_hidden=True):
                rt_prompt_key = self.catalog.get_prompt_key(rt_key)
                if rt_prompt_key.lower() == prompt_key:
                    room_type = rt_key
                    break
        
        if not room_type:
            return None, None
        
        # Find size from prompt_name
        room_def = self.catalog.get_room_type(room_type)
        if not room_def:
            return room_type, None
        
        for size_key, size_def in room_def.get("sizes", {}).items():
            if size_def.get("prompt_name", "").lower() == prompt_name:
                return room_type, size_key
        
        return room_type, None
    
    def _sort_room_lines_by_priority(self, room_lines: List[str]) -> List[str]:
        """
        Sort room lines by priority based on prompt key.
        
        STRICT ordering (critical for model adherence):
        1. primary bed - priority 0
        2. primary bath - priority 1
        3. primary closet - priority 2
        4. EVERYTHING ELSE ALPHABETICALLY - priority 99
        """
        def get_priority(line: str) -> tuple:
            prompt_key = line.split("=")[0].strip().lower()
            
            # STRICT priority mapping - PRIMARY rooms first, then alphabetical
            strict_priorities = {
                "primary bed": 0,           # Primary bed FIRST
                "primary bath": 1,          # Primary bath SECOND
                "primary closet": 2,        # Primary closet THIRD
            }
            
            # Check for strict priority match
            if prompt_key in strict_priorities:
                priority = strict_priorities[prompt_key]
            else:
                # EVERYTHING ELSE goes alphabetically after primary rooms
                priority = 99
            
            # Return tuple of (priority, alphabetical key) for stable sorting
            return (priority, prompt_key)
        
        return sorted(room_lines, key=get_priority)


class DraftedFloorPlanClient:
    """
    Client for Drafted's production floor plan model.
    
    Features:
    - Generation with structured room prompts
    - Seed-based editing (same seed + modified prompt)
    - SVG and room data parsing
    - Async/await support
    """
    
    def __init__(
        self,
        endpoint_url: Optional[str] = None,
        timeout: float = 120.0
    ):
        """
        Initialize the Drafted client.
        
        Args:
            endpoint_url: Runpod endpoint URL (or set DRAFTED_API_ENDPOINT env var)
            timeout: Request timeout in seconds
        """
        self.endpoint_url = endpoint_url or os.getenv("DRAFTED_API_ENDPOINT")
        if not self.endpoint_url:
            raise ValueError(
                "DRAFTED_API_ENDPOINT environment variable not set. "
                "Set it to your Runpod endpoint URL."
            )
        
        self.timeout = timeout
        self.catalog = RoomsCatalog()
        self.prompt_builder = DraftedPromptBuilder(self.catalog)
    
    async def generate(
        self,
        config: GenerationConfig,
        plan_id: Optional[str] = None
    ) -> GenerationResult:
        """
        Generate a floor plan from configuration.
        
        Args:
            config: Generation configuration with rooms and parameters
            plan_id: Optional ID for the plan (auto-generated if None)
            
        Returns:
            GenerationResult with image, SVG, and room data
        """
        import uuid
        
        if plan_id is None:
            plan_id = f"drafted_{uuid.uuid4().hex[:8]}"
        
        # Build prompt
        prompt = self.prompt_builder.build_prompt(config)
        
        # Prepare request payload
        payload = {
            "prompt": prompt,
            "num_steps": config.num_steps,
            "guidance_scale": config.guidance_scale,
            "resolution": config.resolution,
        }
        
        # Add seed if specified
        if config.seed is not None:
            payload["seed"] = config.seed
        
        start_time = time.time()
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.endpoint_url,
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )
                
                if response.status_code != 200:
                    return GenerationResult(
                        success=False,
                        plan_id=plan_id,
                        prompt_used=prompt,
                        error=f"API error {response.status_code}: {response.text}"
                    )
                
                data = response.json()
                elapsed = time.time() - start_time
                
                # Parse response
                return self._parse_response(data, plan_id, prompt, elapsed)
                
        except Exception as e:
            return GenerationResult(
                success=False,
                plan_id=plan_id,
                prompt_used=prompt,
                elapsed_seconds=time.time() - start_time,
                error=str(e)
            )
    
    def _parse_response(
        self,
        data: Dict[str, Any],
        plan_id: str,
        prompt: str,
        elapsed: float
    ) -> GenerationResult:
        """Parse the API response into a GenerationResult."""
        
        # Debug: Log raw response keys
        print(f"[DEBUG] Runpod response keys: {list(data.keys())}")
        
        # Extract image - try multiple field names
        image_b64 = (
            data.get("image_jpg_base64") or 
            data.get("image_base64") or
            data.get("image") or
            data.get("output", {}).get("image_jpg_base64") or
            data.get("output", {}).get("image_base64") or
            data.get("output", {}).get("image")
        )
        image_bytes = None
        if image_b64:
            try:
                # Handle if it's already bytes or has data URI prefix
                if isinstance(image_b64, str):
                    if image_b64.startswith("data:"):
                        image_b64 = image_b64.split(",", 1)[1]
                    image_bytes = base64.b64decode(image_b64)
                elif isinstance(image_b64, bytes):
                    image_bytes = image_b64
            except Exception as e:
                print(f"[WARN] Failed to decode image: {e}")
        
        # Extract output section - might be nested or at root level
        output = data.get("output", {})
        if not output:
            # Some APIs return data at root level
            output = data
        
        # Parse rooms
        rooms = []
        for room_data in output.get("rooms", []):
            rooms.append(GeneratedRoom(
                room_type=room_data.get("room_type", ""),
                canonical_key=room_data.get("canonical_key", ""),
                area_sqft=room_data.get("area_sqft", 0),
                width_inches=room_data.get("width_inches", 0),
                height_inches=room_data.get("height_inches", 0),
            ))
        
        # Extract SVG - try multiple locations
        svg = output.get("svg") or data.get("svg")
        
        # Calculate total area
        total_area = output.get("total_area_sqft", 0) or data.get("total_area_sqft", 0)
        if not total_area and rooms:
            total_area = sum(r.area_sqft for r in rooms)
        
        # Extract seed
        seed = data.get("seed", 0) or output.get("seed", 0)
        
        # Success if we have any meaningful output (image, svg, or rooms)
        has_content = (image_bytes is not None) or svg or len(rooms) > 0
        is_ok = output.get("ok", True) if isinstance(output.get("ok"), bool) else True
        success = is_ok and has_content
        
        # Debug log
        print(f"[DEBUG] Generation result: success={success}, has_image={image_bytes is not None}, has_svg={bool(svg)}, rooms={len(rooms)}")
        
        return GenerationResult(
            success=success,
            plan_id=plan_id,
            image_base64=image_b64 if isinstance(image_b64, str) else None,
            image_bytes=image_bytes,
            svg=svg,
            rooms=rooms,
            total_area_sqft=total_area,
            prompt_used=prompt,
            seed_used=seed,
            elapsed_seconds=data.get("elapsed_s", elapsed) or elapsed,
            error=output.get("error") or data.get("error")
        )
    
    async def edit_with_seed(
        self,
        original_result: GenerationResult,
        add_rooms: Optional[List[RoomSpec]] = None,
        remove_rooms: Optional[List[str]] = None,
        resize_rooms: Optional[Dict[str, str]] = None,
        adjust_sqft: Optional[int] = None,
        plan_id: Optional[str] = None
    ) -> GenerationResult:
        """
        Edit a floor plan using the same seed with a modified prompt.
        
        This is Drafted's editing paradigm - keeping the seed constant
        while modifying the prompt produces similar but adapted designs.
        
        Args:
            original_result: The original generation result (need seed + prompt)
            add_rooms: Rooms to add to the design
            remove_rooms: Room types to remove
            resize_rooms: Dict mapping room_type -> new_size
            adjust_sqft: Change in total sqft
            plan_id: Optional ID for the edited plan
            
        Returns:
            GenerationResult with the edited floor plan
        """
        import uuid
        
        if plan_id is None:
            plan_id = f"edit_{uuid.uuid4().hex[:8]}"
        
        print(f"[DEBUG] edit_with_seed: original seed={original_result.seed_used}")
        print(f"[DEBUG] edit_with_seed: original prompt has {len(original_result.prompt_used.split(chr(10)))} lines")
        
        # Modify the original prompt
        modified_prompt = self.prompt_builder.modify_prompt_for_edit(
            original_result.prompt_used,
            add_rooms=add_rooms,
            remove_rooms=remove_rooms,
            resize_rooms=resize_rooms,
            adjust_sqft=adjust_sqft
        )
        
        # Count rooms in the modified prompt for comparison
        prompt_room_lines = [l for l in modified_prompt.split("\n") if l.strip() and "=" in l and "area" not in l.lower()]
        print(f"[DEBUG] Modified prompt has {len(prompt_room_lines)} room lines")
        
        # Use same seed for similar design
        payload = {
            "prompt": modified_prompt,
            "num_steps": 30,
            "guidance_scale": 7.5,
            "seed": original_result.seed_used,  # KEY: Same seed!
            "resolution": 768,
        }
        
        start_time = time.time()
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.endpoint_url,
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )
                
                if response.status_code != 200:
                    return GenerationResult(
                        success=False,
                        plan_id=plan_id,
                        prompt_used=modified_prompt,
                        seed_used=original_result.seed_used,
                        error=f"API error {response.status_code}: {response.text}"
                    )
                
                data = response.json()
                elapsed = time.time() - start_time
                
                # Log raw response rooms count
                output = data.get("output", data)
                raw_rooms = output.get("rooms", [])
                print(f"[DEBUG] API response has {len(raw_rooms)} rooms in output.rooms")
                print(f"[DEBUG] Room types in response: {[r.get('room_type') for r in raw_rooms]}")
                
                return self._parse_response(data, plan_id, modified_prompt, elapsed)
                
        except Exception as e:
            return GenerationResult(
                success=False,
                plan_id=plan_id,
                prompt_used=modified_prompt,
                seed_used=original_result.seed_used,
                elapsed_seconds=time.time() - start_time,
                error=str(e)
            )
    
    async def generate_batch(
        self,
        config: GenerationConfig,
        count: int = 6,
        max_concurrent: int = 3
    ) -> List[GenerationResult]:
        """
        Generate multiple floor plans with different seeds.
        
        Args:
            config: Base configuration (seed will vary)
            count: Number of plans to generate
            max_concurrent: Maximum concurrent requests
            
        Returns:
            List of GenerationResult objects
        """
        import uuid
        import random
        
        semaphore = asyncio.Semaphore(max_concurrent)
        results: List[GenerationResult] = []
        
        async def generate_one(index: int) -> GenerationResult:
            async with semaphore:
                # Create config with unique seed
                plan_config = GenerationConfig(
                    rooms=config.rooms,
                    target_sqft=config.target_sqft,
                    num_steps=config.num_steps,
                    guidance_scale=config.guidance_scale,
                    seed=random.randint(0, 2**32 - 1),  # Random seed for diversity
                    resolution=config.resolution
                )
                
                plan_id = f"drafted_{uuid.uuid4().hex[:8]}"
                result = await self.generate(plan_config, plan_id)
                
                print(f"[{index + 1}/{count}] Generated plan: {plan_id}, success: {result.success}")
                return result
        
        tasks = [generate_one(i) for i in range(count)]
        results = await asyncio.gather(*tasks)
        
        return list(results)


# Convenience functions for quick usage

def create_default_config(
    bedrooms: int = 3,
    bathrooms: int = 2,
    style: str = "M"  # S, M, L, XL as general size
) -> GenerationConfig:
    """
    Create a sensible default configuration.
    
    Args:
        bedrooms: Number of bedrooms (1 primary + N-1 secondary)
        bathrooms: Number of bathrooms (1 primary + N-1 secondary)
        style: Overall size style (S=compact, M=standard, L=spacious, XL=grand)
    """
    rooms = []
    
    # Primary suite
    rooms.append(RoomSpec("primary_bedroom", style))
    rooms.append(RoomSpec("primary_bathroom", style))
    rooms.append(RoomSpec("primary_closet", style))
    
    # Secondary bedrooms with closets
    for _ in range(bedrooms - 1):
        rooms.append(RoomSpec("bedroom", "M"))
    
    # Secondary bathrooms
    for _ in range(bathrooms - 1):
        rooms.append(RoomSpec("bathroom", "M"))
    
    # Common rooms
    rooms.append(RoomSpec("living", style))
    rooms.append(RoomSpec("kitchen", style))
    rooms.append(RoomSpec("dining", "M"))
    rooms.append(RoomSpec("garage", "M"))
    rooms.append(RoomSpec("laundry", "S"))
    
    return GenerationConfig(rooms=rooms)


# CLI for testing
if __name__ == "__main__":
    import sys
    
    async def main():
        # Test the catalog
        catalog = RoomsCatalog()
        
        print("=== Rooms Catalog Test ===")
        print(f"Total room types: {len(catalog.get_all_room_types())}")
        print(f"Primary bedroom L prompt_name: {catalog.get_prompt_name('primary_bedroom', 'L')}")
        print(f"Kitchen M prompt_name: {catalog.get_prompt_name('kitchen', 'M')}")
        
        # Test prompt building
        builder = DraftedPromptBuilder(catalog)
        config = create_default_config(bedrooms=3, bathrooms=2, style="M")
        prompt = builder.build_prompt(config)
        
        print("\n=== Generated Prompt ===")
        print(prompt)
        print(f"\nEstimated tokens: {builder.estimate_tokens(prompt)}")
        
        # Test client (if endpoint is set)
        endpoint = os.getenv("DRAFTED_API_ENDPOINT")
        if endpoint:
            print("\n=== Testing API ===")
            client = DraftedFloorPlanClient(endpoint)
            result = await client.generate(config)
            print(f"Success: {result.success}")
            print(f"Seed: {result.seed_used}")
            print(f"Rooms: {len(result.rooms)}")
            if result.error:
                print(f"Error: {result.error}")
        else:
            print("\n[SKIP] Set DRAFTED_API_ENDPOINT to test API")
    
    asyncio.run(main())

