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
    
    # Validate the original prompt is present
    original_prompt = request.original.get("prompt_used", "")
    original_seed = request.original.get("seed_used", 0)
    
    print(f"[DEBUG] /edit endpoint received:")
    print(f"[DEBUG]   plan_id: {request.original.get('plan_id')}")
    print(f"[DEBUG]   seed_used: {original_seed}")
    print(f"[DEBUG]   prompt_used length: {len(original_prompt)} chars")
    print(f"[DEBUG]   prompt_used preview: {original_prompt[:200] if original_prompt else 'EMPTY!'}...")
    print(f"[DEBUG]   add_rooms: {request.add_rooms}")
    print(f"[DEBUG]   remove_rooms: {request.remove_rooms}")
    print(f"[DEBUG]   resize_rooms: {request.resize_rooms}")
    print(f"[DEBUG]   adjust_sqft: {request.adjust_sqft}")
    
    if not original_prompt:
        raise HTTPException(
            status_code=400,
            detail="Original prompt is required for editing. The plan may not have been properly saved."
        )
    
    # Count rooms in original prompt
    original_room_lines = [l for l in original_prompt.split("\n") if l.strip() and "=" in l and "area" not in l.lower()]
    print(f"[DEBUG]   Original prompt has {len(original_room_lines)} room lines")
    
    try:
        add_rooms = None
        if request.add_rooms:
            add_rooms = [
                {"room_type": r.room_type, "size": r.size}
                for r in request.add_rooms
            ]
        
        result = await integration.edit_plan(
            original_result=request.original,
            add_rooms=add_rooms,
            remove_rooms=request.remove_rooms,
            resize_rooms=request.resize_rooms,
            adjust_sqft=request.adjust_sqft,
        )
        
        # Log comparison
        print(f"[DEBUG] Edit complete: prompt had {len(original_room_lines)} rooms, result has {len(result.get('rooms', []))} rooms")
        
        return result
        
    except Exception as e:
        import traceback
        print(f"[ERROR] Edit failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# STAGING ENDPOINT (Gemini Flash 3.0 Photorealistic Rendering)
# =============================================================================

class StageRequest(BaseModel):
    """Request to stage a floor plan into a photorealistic render."""
    svg: str  # The floor plan SVG
    room_keys: Optional[List[str]] = None  # Canonical room keys for prompt customization


@router.post("/stage")
async def stage_floor_plan(request: StageRequest):
    """
    Stage a floor plan SVG into a photorealistic render using Gemini.
    
    This uses img2img to transform the schematic SVG into a photorealistic
    top-down visualization with furniture, flooring, and materials.
    
    Returns:
    - staged_image_base64: The photorealistic rendered image
    - elapsed_seconds: Time taken for the operation
    """
    import base64
    import sys
    from pathlib import Path
    
    # Add generation module to path
    gen_dir = Path(__file__).parent.parent / "generation"
    if str(gen_dir) not in sys.path:
        sys.path.insert(0, str(gen_dir))
    
    try:
        from gemini_staging import stage_floor_plan as do_stage
        
        print(f"[INFO] Staging floor plan with {len(request.room_keys or [])} room keys...")
        
        result = await do_stage(
            svg=request.svg,
            canonical_room_keys=request.room_keys,
        )
        
        if result.success:
            response = {
                "success": True,
                "staged_image_mime": "image/png",
                "elapsed_seconds": result.elapsed_seconds,
                "aspect_ratio": result.aspect_ratio,
            }
            
            if result.staged_image:
                response["staged_image_base64"] = base64.b64encode(result.staged_image).decode('utf-8')
            
            if result.raw_png:
                response["raw_png_base64"] = base64.b64encode(result.raw_png).decode('utf-8')
            
            if result.cropped_svg:
                response["cropped_svg"] = result.cropped_svg
            
            print(f"[OK] Staging complete in {result.elapsed_seconds:.1f}s")
            return response
        else:
            print(f"[WARN] Staging returned error: {result.error}")
            # If Gemini staging failed but we have raw PNG, return that as fallback
            if result.raw_png:
                return {
                    "success": True,
                    "staged_image_base64": base64.b64encode(result.raw_png).decode('utf-8'),
                    "staged_image_mime": "image/png",
                    "elapsed_seconds": result.elapsed_seconds,
                    "note": f"Returning schematic PNG (Gemini staging failed: {result.error})",
                }
            raise HTTPException(status_code=500, detail=f"Staging failed: {result.error}")
            
    except HTTPException:
        raise
    except ValueError as e:
        # Common error: GEMINI_API_KEY not set
        error_msg = str(e)
        print(f"[WARN] Staging config error: {error_msg}")
        
        # Fallback: just convert SVG to PNG without Gemini
        try:
            from gemini_staging import process_svg_to_png
            import time
            start_time = time.time()
            
            result = process_svg_to_png(request.svg)
            elapsed = time.time() - start_time
            
            return {
                "success": True,
                "staged_image_base64": base64.b64encode(result["png_buffer"]).decode('utf-8'),
                "staged_image_mime": "image/png",
                "elapsed_seconds": elapsed,
                "aspect_ratio": result["aspect_ratio"],
                "cropped_svg": result.get("cropped_svg"),
                "note": f"Returning schematic PNG ({error_msg})",
            }
        except Exception as fallback_error:
            print(f"[ERROR] Fallback PNG conversion also failed: {fallback_error}")
            raise HTTPException(status_code=500, detail=f"Staging failed: {error_msg}")
            
    except Exception as e:
        import traceback
        print(f"[ERROR] Staging failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Staging failed: {e}")


@router.post("/generate-and-stage")
async def generate_and_stage_plan(request: DraftedGenerateRequest):
    """
    Generate a floor plan AND stage it in one call.
    
    This combines:
    1. Floor plan generation via Drafted's model
    2. Photorealistic staging via Gemini Flash 3.0
    
    Returns all data from both steps.
    """
    # First, generate the floor plan
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
        
        # Generate
        gen_result = await integration.generate(config)
        
        if not gen_result.get("success") or not gen_result.get("svg"):
            return gen_result  # Return generation result even if no SVG
        
        # Extract room keys for staging prompt
        room_keys = [r.room_type for r in request.rooms]
        
        # Now stage the SVG
        import sys
        from pathlib import Path
        
        gen_dir = Path(__file__).parent.parent / "generation"
        if str(gen_dir) not in sys.path:
            sys.path.insert(0, str(gen_dir))
        
        from gemini_staging import stage_floor_plan as do_stage
        
        stage_result = await do_stage(
            svg=gen_result["svg"],
            canonical_room_keys=room_keys,
        )
        
        # Add staging results to response
        import base64
        
        if stage_result.success:
            gen_result["staged"] = {
                "success": True,
                "elapsed_seconds": stage_result.elapsed_seconds,
                "aspect_ratio": stage_result.aspect_ratio,
            }
            
            if stage_result.staged_image:
                gen_result["staged"]["image_base64"] = base64.b64encode(stage_result.staged_image).decode('utf-8')
                gen_result["staged"]["image_mime"] = "image/png"
            
            if stage_result.cropped_svg:
                gen_result["staged"]["cropped_svg"] = stage_result.cropped_svg
        else:
            gen_result["staged"] = {
                "success": False,
                "error": stage_result.error,
            }
        
        return gen_result
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[ERROR] Generate and stage failed: {e}")
        traceback.print_exc()
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

