"""
FastAPI routes for Drafted.ai floor plan generation.

These routes use Drafted's production model for floor plan generation,
which offers precise room control and seed-based editing.
"""

import os
import sys
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Add editing module to path
EDITING_DIR = Path(__file__).parent.parent.parent / "editing"
if str(EDITING_DIR) not in sys.path:
    sys.path.insert(0, str(EDITING_DIR))

router = APIRouter(prefix="/drafted", tags=["Drafted Generation"])


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class RoomSpecRequest(BaseModel):
    room_type: str
    size: str  # S, M, L, XL


class DraftedGenerateRequest(BaseModel):
    rooms: List[RoomSpecRequest]
    target_sqft: Optional[int] = None
    num_steps: int = 30
    guidance_scale: float = 7.5
    seed: Optional[int] = None


class DraftedValidateRequest(BaseModel):
    rooms: List[RoomSpecRequest]
    target_sqft: Optional[int] = None


class DraftedEditRequest(BaseModel):
    original: Dict[str, Any]  # Contains plan_id, seed_used, prompt_used
    add_rooms: Optional[List[RoomSpecRequest]] = None
    remove_rooms: Optional[List[str]] = None
    resize_rooms: Optional[Dict[str, str]] = None
    adjust_sqft: Optional[int] = None


# =============================================================================
# LAZY INITIALIZATION
# =============================================================================

_integration = None


def get_integration():
    """Lazy-load the Drafted integration."""
    global _integration
    if _integration is None:
        try:
            from api_integration import DraftedAPIIntegration
            _integration = DraftedAPIIntegration()
        except ImportError as e:
            raise HTTPException(
                status_code=500,
                detail=f"Drafted integration not available: {e}"
            )
    return _integration


# =============================================================================
# ROUTES
# =============================================================================

@router.get("/status")
async def get_drafted_status():
    """Check if Drafted API is available and configured."""
    try:
        integration = get_integration()
        return {
            "available": integration.is_available,
            "endpoint_configured": bool(os.getenv("DRAFTED_API_ENDPOINT")),
        }
    except Exception as e:
        return {
            "available": False,
            "error": str(e),
        }


@router.get("/options")
async def get_drafted_options():
    """
    Get available room types and sizes for the frontend.
    
    Returns all room types from rooms.json with their sizes,
    display names, colors, and sqft ranges.
    
    This endpoint works even if the Runpod endpoint isn't configured.
    """
    import json
    
    # Try to use integration first
    try:
        integration = get_integration()
        return integration.get_room_options()
    except Exception:
        pass
    
    # Fallback: Load directly from rooms.json
    try:
        rooms_path = EDITING_DIR / "rooms.json"
        with open(rooms_path) as f:
            schema = json.load(f)
        
        room_types = []
        for key, room_def in schema.get("types", {}).items():
            # Skip hidden rooms
            if room_def.get("prompt", {}).get("hidden", False):
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
            
            if sizes:  # Only include rooms with sizes
                room_types.append({
                    "key": key,
                    "display": room_def.get("display", key),
                    "icon": room_def.get("icon"),
                    "sizes": sizes,
                    "colors": room_def.get("colors", {}),
                    "is_heated": room_def.get("is_heated", True)
                })
        
        return {
            "room_types": room_types,
            "size_labels": {
                "S": "Small",
                "M": "Medium",
                "L": "Large",
                "XL": "Extra Large"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load room options: {e}")


@router.post("/validate")
async def validate_drafted_config(request: DraftedValidateRequest):
    """
    Validate a generation configuration.
    
    Checks:
    - Token count against 77 token CLIP limit
    - Room type validity
    - Size availability for each room type
    
    Returns validation status, token count, estimated sqft, and warnings.
    """
    # Try using full integration
    try:
        integration = get_integration()
        config = integration.build_config_from_request(
            rooms=[{"room_type": r.room_type, "size": r.size} for r in request.rooms],
            target_sqft=request.target_sqft,
        )
        return integration.validate_config(config)
    except Exception:
        pass
    
    # Fallback: Simple validation
    import json
    
    rooms_path = EDITING_DIR / "rooms.json"
    with open(rooms_path) as f:
        schema = json.load(f)
    
    warnings = []
    estimated_sqft = 0
    
    for room in request.rooms:
        room_def = schema.get("types", {}).get(room.room_type)
        if not room_def:
            warnings.append(f"Unknown room type: {room.room_type}")
            continue
        
        size_def = room_def.get("sizes", {}).get(room.size)
        if not size_def:
            warnings.append(f"Invalid size '{room.size}' for {room.room_type}")
            continue
        
        # Add midpoint sqft
        min_sqft = size_def.get("area_min_sqft", 0)
        max_sqft = size_def.get("area_max_sqft", 0)
        estimated_sqft += (min_sqft + max_sqft) / 2
    
    # Apply 15% markup for walls/hallways
    estimated_sqft = int(estimated_sqft * 1.15)
    
    # Estimate token count (rough)
    token_count = len(request.rooms) * 3 + 5  # Rough estimate
    
    return {
        "valid": len(warnings) == 0 and token_count <= 77,
        "token_count": token_count,
        "token_limit": 77,
        "estimated_sqft": request.target_sqft or estimated_sqft,
        "warnings": warnings,
        "prompt_preview": f"area = {estimated_sqft} sqft\n..." if not warnings else ""
    }


@router.post("/generate")
async def generate_drafted_plan(request: DraftedGenerateRequest):
    """
    Generate a floor plan using Drafted's production model.
    
    Returns:
    - Image (base64 JPEG)
    - SVG vector output
    - Room data with sqft and dimensions
    - Seed used (for editing)
    - Prompt used (for editing)
    """
    integration = get_integration()
    
    if not integration.is_available:
        raise HTTPException(
            status_code=503,
            detail="Drafted API not configured. Set DRAFTED_API_ENDPOINT environment variable."
        )
    
    try:
        config = integration.build_config_from_request(
            rooms=[{"room_type": r.room_type, "size": r.size} for r in request.rooms],
            target_sqft=request.target_sqft,
            num_steps=request.num_steps,
            guidance_scale=request.guidance_scale,
            seed=request.seed,
        )
        
        # Validate first
        validation = integration.validate_config(config)
        if not validation["valid"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid configuration: {', '.join(validation['warnings'])}"
            )
        
        result = await integration.generate(config)
        
        # Debug logging
        print(f"[DEBUG] Generate result keys: {list(result.keys())}")
        print(f"[DEBUG] success={result.get('success')}, has_image={bool(result.get('image_base64'))}, has_svg={bool(result.get('svg'))}, rooms={len(result.get('rooms', []))}")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[ERROR] Generation failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate/batch")
async def generate_drafted_batch(
    request: DraftedGenerateRequest,
    count: int = 4
):
    """
    Generate multiple floor plans with different seeds.
    
    Each plan uses a random seed for variety while maintaining
    the same room configuration.
    """
    integration = get_integration()
    
    if not integration.is_available:
        raise HTTPException(
            status_code=503,
            detail="Drafted API not configured"
        )
    
    try:
        config = integration.build_config_from_request(
            rooms=[{"room_type": r.room_type, "size": r.size} for r in request.rooms],
            target_sqft=request.target_sqft,
            num_steps=request.num_steps,
            guidance_scale=request.guidance_scale,
        )
        
        return await integration.generate_batch(config, count=min(count, 10))
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/edit")
async def edit_drafted_plan(request: DraftedEditRequest):
    """
    Edit a floor plan using seed-based editing.
    
    Uses the same seed as the original plan with a modified prompt
    to produce a similar but adapted layout.
    
    Supported edits:
    - add_rooms: Add new rooms
    - remove_rooms: Remove existing rooms
    - resize_rooms: Change room sizes
    - adjust_sqft: Increase/decrease total area
    """
    integration = get_integration()
    
    if not integration.is_available:
        raise HTTPException(
            status_code=503,
            detail="Drafted API not configured"
        )
    
    try:
        add_rooms = None
        if request.add_rooms:
            add_rooms = [
                {"room_type": r.room_type, "size": r.size}
                for r in request.add_rooms
            ]
        
        return await integration.edit_plan(
            original_result=request.original,
            add_rooms=add_rooms,
            remove_rooms=request.remove_rooms,
            resize_rooms=request.resize_rooms,
            adjust_sqft=request.adjust_sqft,
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# ROOMS DATA ENDPOINT
# =============================================================================

@router.get("/rooms")
async def get_rooms_json():
    """
    Get the complete rooms.json schema.
    
    Useful for debugging or building custom UIs.
    """
    import json
    
    rooms_path = EDITING_DIR / "rooms.json"
    if not rooms_path.exists():
        raise HTTPException(status_code=404, detail="rooms.json not found")
    
    with open(rooms_path) as f:
        return json.load(f)

