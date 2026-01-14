"""
API Integration Layer for Drafted Floor Plan Generation.

This module provides the bridge between the Drafted client and
the existing FastAPI backend routes. It can be imported into
backend/api/routes.py to add Drafted generation endpoints.
"""

import os
import sys
import json
import asyncio
from typing import Dict, List, Optional, Any
from pathlib import Path

# Ensure editing module is importable
EDITING_DIR = Path(__file__).parent
if str(EDITING_DIR) not in sys.path:
    sys.path.insert(0, str(EDITING_DIR))

from drafted_client import (
    DraftedFloorPlanClient,
    DraftedPromptBuilder,
    RoomsCatalog,
    RoomSpec,
    GenerationConfig,
    GenerationResult,
    create_default_config
)
from svg_parser import SVGParser, ParsedFloorPlan, format_room_summary
from clip_tokenizer import validate_prompt, count_tokens


class DraftedAPIIntegration:
    """
    Integration layer for Drafted floor plan generation.
    
    Provides methods that can be called from FastAPI routes
    to generate, edit, and manage floor plans using Drafted's model.
    """
    
    def __init__(self, endpoint_url: Optional[str] = None):
        """
        Initialize the integration.
        
        Args:
            endpoint_url: Runpod endpoint URL (or DRAFTED_API_ENDPOINT env var)
        """
        self.endpoint_url = endpoint_url or os.getenv("DRAFTED_API_ENDPOINT")
        self.catalog = RoomsCatalog()
        self.prompt_builder = DraftedPromptBuilder(self.catalog)
        self.svg_parser = SVGParser(self.catalog.schema)
        
        # Only initialize client if endpoint is available
        self._client = None
    
    @property
    def client(self) -> DraftedFloorPlanClient:
        """Lazy-load the Drafted client."""
        if self._client is None:
            if not self.endpoint_url:
                raise ValueError(
                    "DRAFTED_API_ENDPOINT not configured. "
                    "Set the environment variable to your Runpod endpoint."
                )
            self._client = DraftedFloorPlanClient(self.endpoint_url)
        return self._client
    
    @property
    def is_available(self) -> bool:
        """Check if Drafted API is configured and available."""
        return bool(self.endpoint_url)
    
    def get_room_options(self) -> Dict[str, Any]:
        """
        Get available room types and sizes for the frontend.
        
        Returns dict with room types, their display names, sizes, and descriptions.
        """
        options = {
            "room_types": [],
            "size_labels": {
                "S": "Small",
                "M": "Medium", 
                "L": "Large",
                "XL": "Extra Large"
            }
        }
        
        for room_type in self.catalog.get_all_room_types(include_hidden=False):
            room_def = self.catalog.get_room_type(room_type)
            if not room_def:
                continue
            
            sizes = []
            for size_key, size_def in room_def.get("sizes", {}).items():
                sizes.append({
                    "key": size_key,
                    "user_name": size_def.get("user_name", size_key),
                    "description": size_def.get("description", ""),
                    "sqft_range": [
                        size_def.get("area_min_sqft", 0),
                        size_def.get("area_max_sqft", 0)
                    ]
                })
            
            options["room_types"].append({
                "key": room_type,
                "display": room_def.get("display", room_type),
                "icon": room_def.get("icon"),
                "sizes": sizes,
                "colors": room_def.get("colors", {}),
                "is_heated": room_def.get("is_heated", True)
            })
        
        return options
    
    def build_config_from_request(
        self,
        rooms: List[Dict[str, str]],
        target_sqft: Optional[int] = None,
        num_steps: int = 30,
        guidance_scale: float = 7.5,
        seed: Optional[int] = None,
        resolution: int = 768
    ) -> GenerationConfig:
        """
        Build a GenerationConfig from an API request.
        
        Args:
            rooms: List of {"room_type": str, "size": str} dicts
            target_sqft: Optional total sqft (calculated if None)
            num_steps: Diffusion steps
            guidance_scale: CFG scale
            seed: Random seed (None for random)
            resolution: Output resolution
            
        Returns:
            GenerationConfig ready for generation
        """
        room_specs = [
            RoomSpec(room_type=r["room_type"], size=r["size"])
            for r in rooms
        ]
        
        return GenerationConfig(
            rooms=room_specs,
            target_sqft=target_sqft,
            num_steps=num_steps,
            guidance_scale=guidance_scale,
            seed=seed,
            resolution=resolution
        )
    
    def validate_config(self, config: GenerationConfig) -> Dict[str, Any]:
        """
        Validate a generation config before sending to API.
        
        Returns dict with validation results and warnings.
        """
        prompt = self.prompt_builder.build_prompt(config)
        is_valid, token_count, message = validate_prompt(prompt)
        
        warnings = []
        if not is_valid:
            warnings.append(f"Prompt has {token_count} tokens, exceeds 77 token limit")
        
        # Check for invalid room types
        for room in config.rooms:
            if not self.catalog.get_room_type(room.room_type):
                warnings.append(f"Unknown room type: {room.room_type}")
            elif room.size not in self.catalog.get_available_sizes(room.room_type):
                warnings.append(f"Invalid size '{room.size}' for {room.room_type}")
        
        estimated_sqft = self.catalog.calculate_total_sqft(config.rooms)
        
        return {
            "valid": len(warnings) == 0,
            "token_count": token_count,
            "token_limit": 77,
            "estimated_sqft": estimated_sqft,
            "warnings": warnings,
            "prompt_preview": prompt
        }
    
    async def generate(
        self,
        config: GenerationConfig,
        plan_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate a floor plan.
        
        Returns API-friendly dict with image, SVG, rooms, and metadata.
        """
        result = await self.client.generate(config, plan_id)
        return self._format_result(result)
    
    async def generate_batch(
        self,
        config: GenerationConfig,
        count: int = 6,
        max_concurrent: int = 3
    ) -> List[Dict[str, Any]]:
        """Generate multiple floor plans."""
        results = await self.client.generate_batch(config, count, max_concurrent)
        return [self._format_result(r) for r in results]
    
    async def edit_plan(
        self,
        original_result: Dict[str, Any],
        add_rooms: Optional[List[Dict[str, str]]] = None,
        remove_rooms: Optional[List[str]] = None,
        resize_rooms: Optional[Dict[str, str]] = None,
        adjust_sqft: Optional[int] = None,
        plan_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Edit an existing floor plan using seed-based editing.
        
        Args:
            original_result: The original generation result dict
            add_rooms: Rooms to add [{"room_type": str, "size": str}]
            remove_rooms: Room types to remove
            resize_rooms: Dict of room_type -> new_size
            adjust_sqft: Change in total sqft
            plan_id: Optional ID for edited plan
            
        Returns:
            Edited plan result dict
        """
        # Reconstruct GenerationResult for client
        original = GenerationResult(
            success=original_result.get("success", True),
            plan_id=original_result.get("plan_id", ""),
            prompt_used=original_result.get("prompt_used", ""),
            seed_used=original_result.get("seed_used", 0)
        )
        
        # Convert room dicts to RoomSpecs
        add_specs = None
        if add_rooms:
            add_specs = [
                RoomSpec(room_type=r["room_type"], size=r["size"])
                for r in add_rooms
            ]
        
        result = await self.client.edit_with_seed(
            original,
            add_rooms=add_specs,
            remove_rooms=remove_rooms,
            resize_rooms=resize_rooms,
            adjust_sqft=adjust_sqft,
            plan_id=plan_id
        )
        
        return self._format_result(result)
    
    def _format_result(self, result: GenerationResult) -> Dict[str, Any]:
        """Convert GenerationResult to API-friendly dict."""
        import base64
        
        response = {
            "success": result.success,
            "plan_id": result.plan_id,
            "error": result.error,
            "seed_used": result.seed_used,
            "prompt_used": result.prompt_used,
            "elapsed_seconds": result.elapsed_seconds,
            "total_area_sqft": result.total_area_sqft,
        }
        
        # Image data
        if result.image_bytes:
            response["image_base64"] = base64.b64encode(result.image_bytes).decode('utf-8')
            response["image_mime"] = "image/jpeg"
        
        # SVG data
        if result.svg:
            response["svg"] = result.svg
            
            # Parse SVG for additional data
            parsed = self.svg_parser.parse(result.svg, [
                {
                    "room_type": r.room_type,
                    "canonical_key": r.canonical_key,
                    "area_sqft": r.area_sqft,
                    "width_inches": r.width_inches,
                    "height_inches": r.height_inches
                }
                for r in result.rooms
            ])
            response["svg_parsed"] = {
                "width": parsed.svg_width,
                "height": parsed.svg_height,
                "viewbox": parsed.viewbox
            }
        
        # Room data
        response["rooms"] = [
            {
                "room_type": r.room_type,
                "canonical_key": r.canonical_key,
                "area_sqft": r.area_sqft,
                "width_inches": r.width_inches,
                "height_inches": r.height_inches,
                "display_name": self.catalog.get_display_name(r.room_type)
            }
            for r in result.rooms
        ]
        
        return response


# FastAPI route handlers (to be imported into routes.py)

def create_drafted_routes(integration: DraftedAPIIntegration):
    """
    Create FastAPI route handlers for Drafted generation.
    
    Usage in routes.py:
        from editing.api_integration import DraftedAPIIntegration, create_drafted_routes
        
        drafted = DraftedAPIIntegration()
        drafted_routes = create_drafted_routes(drafted)
        
        @router.get("/drafted/options")
        async def get_options():
            return drafted_routes["get_options"]()
    """
    
    async def get_options():
        return integration.get_room_options()
    
    async def generate(
        rooms: List[Dict[str, str]],
        target_sqft: Optional[int] = None,
        num_steps: int = 30,
        guidance_scale: float = 7.5,
        seed: Optional[int] = None
    ):
        config = integration.build_config_from_request(
            rooms=rooms,
            target_sqft=target_sqft,
            num_steps=num_steps,
            guidance_scale=guidance_scale,
            seed=seed
        )
        
        validation = integration.validate_config(config)
        if not validation["valid"]:
            return {"error": "Invalid configuration", "details": validation}
        
        return await integration.generate(config)
    
    async def validate(rooms: List[Dict[str, str]], target_sqft: Optional[int] = None):
        config = integration.build_config_from_request(rooms=rooms, target_sqft=target_sqft)
        return integration.validate_config(config)
    
    async def edit(
        original_plan: Dict[str, Any],
        add_rooms: Optional[List[Dict[str, str]]] = None,
        remove_rooms: Optional[List[str]] = None,
        resize_rooms: Optional[Dict[str, str]] = None,
        adjust_sqft: Optional[int] = None
    ):
        return await integration.edit_plan(
            original_plan,
            add_rooms=add_rooms,
            remove_rooms=remove_rooms,
            resize_rooms=resize_rooms,
            adjust_sqft=adjust_sqft
        )
    
    return {
        "get_options": get_options,
        "generate": generate,
        "validate": validate,
        "edit": edit,
        "is_available": lambda: integration.is_available
    }


# Example usage
if __name__ == "__main__":
    import asyncio
    
    async def main():
        integration = DraftedAPIIntegration()
        
        print("Drafted API Integration")
        print("=" * 50)
        print(f"Available: {integration.is_available}")
        print()
        
        # Get room options
        options = integration.get_room_options()
        print(f"Room types available: {len(options['room_types'])}")
        for rt in options["room_types"][:5]:
            print(f"  - {rt['display']}: {len(rt['sizes'])} sizes")
        print("  ...")
        print()
        
        # Test config building
        rooms = [
            {"room_type": "primary_bedroom", "size": "M"},
            {"room_type": "primary_bathroom", "size": "M"},
            {"room_type": "primary_closet", "size": "M"},
            {"room_type": "bedroom", "size": "M"},
            {"room_type": "bathroom", "size": "S"},
            {"room_type": "living", "size": "M"},
            {"room_type": "kitchen", "size": "M"},
            {"room_type": "dining", "size": "M"},
            {"room_type": "garage", "size": "M"},
        ]
        
        config = integration.build_config_from_request(rooms)
        validation = integration.validate_config(config)
        
        print("Config Validation:")
        print(f"  Valid: {validation['valid']}")
        print(f"  Tokens: {validation['token_count']}/77")
        print(f"  Est. sqft: {validation['estimated_sqft']}")
        if validation['warnings']:
            print(f"  Warnings: {validation['warnings']}")
        print()
        
        print("Prompt Preview:")
        print("-" * 40)
        print(validation['prompt_preview'])
        print("-" * 40)
        
        # Test generation if endpoint is available
        if integration.is_available:
            print("\nTesting generation...")
            result = await integration.generate(config)
            print(f"Success: {result['success']}")
            print(f"Rooms: {len(result.get('rooms', []))}")
            print(f"Total area: {result.get('total_area_sqft', 0)} sqft")
    
    asyncio.run(main())

