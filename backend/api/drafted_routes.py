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
# OPENING (DOOR/WINDOW) MODELS
# =============================================================================

class WallCoordinates(BaseModel):
    """Wall segment coordinates in SVG space."""
    start_x: float
    start_y: float
    end_x: float
    end_y: float


class OpeningPlacement(BaseModel):
    """Specification for a door or window placement."""
    type: str  # interior_door, exterior_door, sliding_door, french_door, window, picture_window, bay_window
    wall_id: str
    position_on_wall: float  # 0-1 along the wall segment
    width_inches: float
    swing_direction: Optional[str] = None  # left, right (for doors)
    wall_coords: Optional[WallCoordinates] = None  # Actual wall coordinates for surgical blending


class AddOpeningRequest(BaseModel):
    """Request to add a door or window to a floor plan."""
    plan_id: str
    svg: str
    cropped_svg: str
    rendered_image_base64: str
    opening: OpeningPlacement
    canonical_room_keys: List[str]


class OpeningJobResponse(BaseModel):
    """Response from adding an opening - includes job ID for polling."""
    success: bool
    job_id: str
    status: str  # pending, rendering, blending, complete, failed
    preview_overlay_svg: str
    modified_svg: str
    rendered_image_base64: Optional[str] = None
    error: Optional[str] = None


class OpeningStatusResponse(BaseModel):
    """Response from polling opening render status."""
    job_id: str
    status: str
    rendered_image_base64: Optional[str] = None
    raw_png_base64: Optional[str] = None  # PNG sent to Gemini (for debug)
    gemini_prompt: Optional[str] = None   # Prompt sent to Gemini (for debug)
    error: Optional[str] = None


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
        if not result.get('success'):
            print(f"[ERROR] Generation failed: {result.get('error', 'Unknown error')}")
        
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
            
            if result.gemini_prompt:
                response["gemini_prompt"] = result.gemini_prompt
            
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


# =============================================================================
# OPENING (DOOR/WINDOW) ROUTES
# =============================================================================

# In-memory job storage (replace with Redis in production)
_opening_jobs: Dict[str, Dict[str, Any]] = {}


def _generate_job_id() -> str:
    """Generate a unique job ID."""
    import uuid
    return f"opening-{uuid.uuid4().hex[:12]}"


def _generate_opening_id() -> str:
    """Generate a unique opening ID."""
    import uuid
    import time
    return f"opening-{int(time.time())}-{uuid.uuid4().hex[:8]}"


@router.post("/openings/add", response_model=OpeningJobResponse)
async def add_opening(request: AddOpeningRequest):
    """
    Add a door or window opening to a floor plan.
    
    This endpoint:
    1. Validates the opening placement
    2. Modifies the SVG to include the opening symbol
    3. Queues a background re-render job
    4. Returns immediately with a job ID for polling
    
    The actual Gemini re-render happens asynchronously.
    """
    import asyncio
    import re
    
    try:
        # Generate IDs
        job_id = _generate_job_id()
        opening_id = _generate_opening_id()
        
        # Parse SVG to extract wall segments
        from svg_parser import SVGParser
        parser = SVGParser()
        
        # Extract viewBox for preview overlay
        viewbox_match = re.search(r'viewBox="([^"]+)"', request.svg)
        if not viewbox_match:
            raise HTTPException(status_code=400, detail="SVG missing viewBox attribute")
        
        viewbox_parts = viewbox_match.group(1).split()
        viewbox = {
            "x": float(viewbox_parts[0]),
            "y": float(viewbox_parts[1]),
            "width": float(viewbox_parts[2]),
            "height": float(viewbox_parts[3]),
        }
        
        # Create opening with generated ID (including wall coordinates for surgical blending)
        opening_with_id = {
            "id": opening_id,
            "type": request.opening.type,
            "wall_id": request.opening.wall_id,
            "position_on_wall": request.opening.position_on_wall,
            "width_inches": request.opening.width_inches,
            "swing_direction": request.opening.swing_direction,
            "wall_coords": {
                "start_x": request.opening.wall_coords.start_x,
                "start_y": request.opening.wall_coords.start_y,
                "end_x": request.opening.wall_coords.end_x,
                "end_y": request.opening.wall_coords.end_y,
            } if request.opening.wall_coords else None,
        }
        
        # Generate preview overlay SVG (simple symbol for immediate display)
        preview_overlay_svg = _generate_preview_overlay(opening_with_id, viewbox)
        
        # Modify the source SVG to include the opening
        modified_svg = _add_opening_to_svg(request.svg, opening_with_id)
        
        # Create job record
        job = {
            "job_id": job_id,
            "plan_id": request.plan_id,
            "status": "pending",
            "opening": opening_with_id,
            "original_svg": request.svg,
            "modified_svg": modified_svg,
            "cropped_svg": request.cropped_svg,
            "original_rendered_image": request.rendered_image_base64,
            "canonical_room_keys": request.canonical_room_keys,
            "preview_overlay_svg": preview_overlay_svg,
            "rendered_image_base64": None,
            "error": None,
            "created_at": __import__('time').time(),
        }
        
        # Store job
        _opening_jobs[job_id] = job
        
        # Queue background render (non-blocking)
        asyncio.create_task(_process_opening_render(job_id))
        
        return OpeningJobResponse(
            success=True,
            job_id=job_id,
            status="pending",
            preview_overlay_svg=preview_overlay_svg,
            modified_svg=modified_svg,
            rendered_image_base64=None,
            error=None,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[ERROR] Add opening failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/openings/status/{job_id}", response_model=OpeningStatusResponse)
async def get_opening_status(job_id: str):
    """
    Poll the status of an opening render job.
    
    Returns:
    - status: pending, rendering, blending, complete, or failed
    - rendered_image_base64: The final image (only when status is complete)
    - error: Error message (only when status is failed)
    """
    if job_id not in _opening_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    job = _opening_jobs[job_id]
    
    return OpeningStatusResponse(
        job_id=job_id,
        status=job["status"],
        rendered_image_base64=job.get("rendered_image_base64"),
        raw_png_base64=job.get("raw_png_base64"),
        gemini_prompt=job.get("gemini_prompt"),
        error=job.get("error"),
    )


@router.delete("/openings/{plan_id}/{opening_id}")
async def remove_opening(plan_id: str, opening_id: str):
    """
    Remove an opening from a floor plan.
    
    This removes the opening from the SVG and triggers a re-render.
    """
    # Find jobs for this plan
    plan_jobs = [j for j in _opening_jobs.values() if j["plan_id"] == plan_id]
    
    if not plan_jobs:
        raise HTTPException(status_code=404, detail=f"No openings found for plan {plan_id}")
    
    # Find the job with this opening
    target_job = None
    for job in plan_jobs:
        if job["opening"]["id"] == opening_id:
            target_job = job
            break
    
    if not target_job:
        raise HTTPException(status_code=404, detail=f"Opening {opening_id} not found")
    
    # Remove from storage
    del _opening_jobs[target_job["job_id"]]
    
    return {"success": True, "message": f"Opening {opening_id} removed"}


async def _process_opening_render(job_id: str):
    """
    Background task to edit a floor plan to add an opening.
    
    NEW APPROACH (prompt-based):
    1. Takes the ALREADY RENDERED floor plan PNG
    2. Annotates it with BLUE BOX (opening location) and RED BOUNDARY (edit limit)
    3. Sends to Gemini with explicit instructions
    4. Returns Gemini's output directly (NO surgical blending needed)
    
    The SVG is still modified and saved for vector export, but the PNG
    edit happens via the annotation + prompt approach.
    """
    import base64
    import sys
    from pathlib import Path
    
    if job_id not in _opening_jobs:
        return
    
    job = _opening_jobs[job_id]
    
    try:
        # Update status
        job["status"] = "rendering"
        
        # Import required modules
        gen_dir = Path(__file__).parent.parent / "generation"
        utils_dir = Path(__file__).parent.parent / "utils"
        if str(gen_dir) not in sys.path:
            sys.path.insert(0, str(gen_dir))
        if str(utils_dir) not in sys.path:
            sys.path.insert(0, str(utils_dir))
        
        from gemini_staging import edit_floor_plan_with_opening
        from surgical_blend import annotate_png_for_opening_edit
        
        print(f"[RENDER] Starting prompt-based opening edit for job {job_id}")
        print(f"[RENDER] Opening type: {job['opening']['type']}")
        print(f"[RENDER] Wall coords: {job['opening'].get('wall_coords')}")
        
        # DEBUG: Save modified SVG to debug folder
        debug_dir = Path(__file__).parent.parent.parent / "debug_blend" / job_id
        debug_dir.mkdir(parents=True, exist_ok=True)
        
        # Save modified SVG (for vector export reference)
        modified_svg = job["modified_svg"]
        svg_path = debug_dir / "00_modified_svg.svg"
        with open(svg_path, 'w', encoding='utf-8') as f:
            f.write(modified_svg)
        print(f"[DEBUG] Saved modified SVG to: {svg_path}")
        
        # =====================================================================
        # NEW APPROACH: Annotate the ORIGINAL rendered PNG, don't re-render SVG
        # =====================================================================
        
        # Get the original rendered floor plan PNG
        original_png = base64.b64decode(job["original_rendered_image"])
        print(f"[RENDER] Original PNG size: {len(original_png)} bytes")
        
        # Use the CROPPED SVG for coordinate transformation - this has the viewBox
        # that matches the rendered PNG (after process_svg_to_png adjusted it)
        # Fall back to original_svg only if cropped_svg is not available
        svg_for_coords = job.get("cropped_svg") or job.get("original_svg", modified_svg)
        print(f"[RENDER] Using {'cropped_svg' if job.get('cropped_svg') else 'original_svg'} for coordinates")
        
        # Step 1: Annotate the PNG with blue box and red boundary
        print(f"[RENDER] Annotating PNG with blue box and red boundary...")
        annotated_png, annotation_metadata = annotate_png_for_opening_edit(
            original_png=original_png,
            opening=job["opening"],
            svg=svg_for_coords,
            boundary_padding_px=30,  # Expand room boundary slightly
            job_id=job_id,
        )
        
        if "error" in annotation_metadata:
            job["status"] = "failed"
            job["error"] = f"Annotation failed: {annotation_metadata['error']}"
            return
        
        print(f"[RENDER] Annotation complete. Blue box at: {annotation_metadata.get('blue_box_center_png')}")
        print(f"[RENDER] Room: {annotation_metadata.get('room_id')}")
        
        # Save annotated PNG for debugging
        annotated_path = debug_dir / "01_annotated_input.png"
        with open(annotated_path, 'wb') as f:
            f.write(annotated_png)
        print(f"[DEBUG] Saved annotated PNG to: {annotated_path}")
        
        # Also save in job for API response (for debugging)
        job["raw_png_base64"] = base64.b64encode(annotated_png).decode('utf-8')
        
        # Step 2: Send annotated PNG to Gemini with opening-specific prompt
        print(f"[RENDER] Sending to Gemini for prompt-based edit...")
        edit_result = await edit_floor_plan_with_opening(
            annotated_png=annotated_png,
            opening=job["opening"],
        )
        
        # Save the prompt used
        if edit_result.prompt_used:
            job["gemini_prompt"] = edit_result.prompt_used
            print(f"[RENDER] Prompt length: {len(edit_result.prompt_used)} chars")
        
        if not edit_result.success:
            job["status"] = "failed"
            job["error"] = edit_result.error or "Gemini edit failed"
            print(f"[RENDER] Edit failed: {edit_result.error}")
            return
        
        # Step 3: Use Gemini's output directly (NO surgical blending needed!)
        final_image = edit_result.edited_image
        print(f"[RENDER] Edit complete! Final image: {len(final_image)} bytes")
        
        # Save final image for debugging
        final_path = debug_dir / "02_gemini_output.png"
        with open(final_path, 'wb') as f:
            f.write(final_image)
        print(f"[DEBUG] Saved final image to: {final_path}")
        
        # Update job with final image
        job["status"] = "complete"
        job["rendered_image_base64"] = base64.b64encode(final_image).decode('utf-8')
        job["completed_at"] = __import__('time').time()
        job["edit_elapsed_seconds"] = edit_result.elapsed_seconds
        
        print(f"[RENDER] Job {job_id} complete in {edit_result.elapsed_seconds:.1f}s")
        
    except Exception as e:
        import traceback
        print(f"[ERROR] Opening render failed for job {job_id}: {e}")
        traceback.print_exc()
        job["status"] = "failed"
        job["error"] = str(e)


def _generate_preview_overlay(opening: Dict[str, Any], viewbox: Dict[str, float]) -> str:
    """
    Generate a simple SVG overlay showing the opening symbol.
    This is displayed immediately while the full render is processing.
    """
    opening_type = opening["type"]
    position = opening["position_on_wall"]
    width_inches = opening["width_inches"]
    
    # SVG scale: 1px = 2 inches
    width_svg = width_inches / 2
    
    # Simple placeholder - actual position would need wall data
    # For now, return a generic symbol that will be positioned by the frontend
    if "door" in opening_type:
        symbol = f'''
        <g class="opening-preview door-preview" opacity="0.8">
            <rect x="0" y="-3" width="{width_svg}" height="6" fill="white" stroke="#f97316" stroke-width="2"/>
            <path d="M 0,0 A {width_svg},{width_svg} 0 0 1 {width_svg},{width_svg}" 
                  fill="none" stroke="#f97316" stroke-width="1.5" stroke-dasharray="4,3"/>
        </g>
        '''
    else:
        symbol = f'''
        <g class="opening-preview window-preview" opacity="0.8">
            <rect x="0" y="-3" width="{width_svg}" height="6" fill="white" stroke="#0ea5e9" stroke-width="2"/>
            <line x1="0" y1="0" x2="{width_svg}" y2="0" stroke="#0ea5e9" stroke-width="3"/>
        </g>
        '''
    
    return f'''<svg xmlns="http://www.w3.org/2000/svg" 
        viewBox="{viewbox['x']} {viewbox['y']} {viewbox['width']} {viewbox['height']}"
        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;">
        {symbol}
    </svg>'''


def _add_opening_to_svg(svg: str, opening: Dict[str, Any]) -> str:
    """
    Add an opening symbol to the SVG using the EXACT Drafted convention:
    - <g> with transform and data-role="opening-asset" attributes
    - <image> with embedded base64 SVG graphic
    
    This matches how Drafted natively renders doors/windows in SVG output.
    """
    import re
    import math
    import base64
    
    opening_id = opening["id"]
    opening_type = opening["type"]
    width_inches = opening["width_inches"]
    length_px = width_inches / 2  # 1px = 2 inches (Drafted SVG scale)
    position_on_wall = opening.get("position_on_wall", 0.5)
    wall_coords = opening.get("wall_coords")
    
    if not wall_coords:
        print("[SVG] WARNING: No wall_coords provided, cannot place opening")
        return svg
    
    # Extract wall coordinates
    start_x = wall_coords["start_x"]
    start_y = wall_coords["start_y"]
    end_x = wall_coords["end_x"]
    end_y = wall_coords["end_y"]
    
    # Calculate wall direction and angle
    wall_dx = end_x - start_x
    wall_dy = end_y - start_y
    wall_length = math.sqrt(wall_dx * wall_dx + wall_dy * wall_dy)
    wall_angle_rad = math.atan2(wall_dy, wall_dx)
    wall_angle_deg = math.degrees(wall_angle_rad)
    
    # The embedded window/door SVG is drawn HORIZONTALLY by default.
    # To make it parallel to the wall, rotate it by the wall's angle.
    rotation_deg = wall_angle_deg
    
    # Normalized wall direction vector
    dir_x = wall_dx / wall_length if wall_length > 0 else 1
    dir_y = wall_dy / wall_length if wall_length > 0 else 0
    
    # Normal vector (perpendicular to wall) for wall gap
    normal_x = -dir_y
    normal_y = dir_x
    
    # Calculate opening center position on wall
    center_x = start_x + wall_dx * position_on_wall
    center_y = start_y + wall_dy * position_on_wall
    
    # Calculate opening start/end points along wall for the wall gap
    half_width = length_px / 2
    open_start_x = center_x - dir_x * half_width
    open_start_y = center_y - dir_y * half_width
    open_end_x = center_x + dir_x * half_width
    open_end_y = center_y + dir_y * half_width
    
    print(f"[SVG] Adding {opening_type} (Drafted format)")
    print(f"[SVG]   Center: ({center_x:.3f}, {center_y:.3f})")
    print(f"[SVG]   Rotation: {rotation_deg:.3f} degrees (parallel to wall)")
    print(f"[SVG]   Width: {width_inches} inches, Length: {length_px} px")
    
    # Determine opening kind for data attributes
    if "door" in opening_type:
        opening_kind = "door-interior-single" if "interior" in opening_type else "door-exterior-single"
        if "sliding" in opening_type:
            opening_kind = "door-sliding-glass"
        elif "french" in opening_type:
            opening_kind = "door-french"
        data_type = "door"
        is_exterior = "exterior" in opening_type or opening_type == "sliding_door"
    else:
        opening_kind = "window"
        if "picture" in opening_type:
            opening_kind = "window-picture"
        elif "bay" in opening_type:
            opening_kind = "window-bay"
        data_type = "window"
        is_exterior = True  # Windows are exterior
    
    # Generate the embedded SVG for the opening asset
    # These match the Drafted convention: white background, black strokes
    base_svg = _generate_opening_base_svg(opening_type, width_inches)
    base64_svg = base64.b64encode(base_svg.encode('utf-8')).decode('utf-8')
    
    # Calculate image positioning
    # The image is placed at the center, with width = length_px and small height
    img_width = length_px
    img_height = length_px * 0.375  # Aspect ratio from Drafted (3.75/10 ≈ 0.375)
    img_x = center_x - img_width / 2
    img_y = center_y - img_height / 2
    
    # Create the opening asset group matching Drafted convention exactly
    # Note: Drafted uses both href AND xlink:href for SVG 1.x/2.x compatibility
    opening_group = f'''
        <g transform="rotate({rotation_deg:.3f} {center_x:.3f} {center_y:.3f})" 
           data-role="opening-asset" 
           data-opening-type="{data_type}" 
           data-opening-kind="{opening_kind}" 
           data-width-in="{width_inches}" 
           data-length-px="{length_px:.0f}" 
           data-anchor="center" 
           data-flip-y="false" 
           data-room-a="OUTSIDE" 
           data-room-b="INTERIOR"
           data-door-exterior="{str(is_exterior).lower()}"
           id="{opening_id}">
            <image href="data:image/svg+xml;base64,{base64_svg}" 
                   xlink:href="data:image/svg+xml;base64,{base64_svg}"
                   x="{img_x:.3f}" 
                   y="{img_y:.3f}" 
                   width="{img_width:.3f}" 
                   height="{img_height:.3f}" 
                   preserveAspectRatio="xMidYMid meet"/>
        </g>'''
    
    # Ensure SVG has xlink namespace for embedded images
    if 'xmlns:xlink' not in svg:
        svg = svg.replace(
            'xmlns="http://www.w3.org/2000/svg"',
            'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
        )
    
    # === CREATE WALL GAP (white polygon to "break" the wall) ===
    # This goes in the "walls-openings-white" group to mask/cut the wall
    gap_half_thickness = 4  # Wall thickness / 2 (walls are ~8px thick)
    gap_points = [
        (open_start_x - normal_x * gap_half_thickness, open_start_y - normal_y * gap_half_thickness),
        (open_end_x - normal_x * gap_half_thickness, open_end_y - normal_y * gap_half_thickness),
        (open_end_x + normal_x * gap_half_thickness, open_end_y + normal_y * gap_half_thickness),
        (open_start_x + normal_x * gap_half_thickness, open_start_y + normal_y * gap_half_thickness),
    ]
    gap_polygon_points = " ".join([f"{p[0]:.3f},{p[1]:.3f}" for p in gap_points])
    wall_gap = f'<polygon points="{gap_polygon_points}" fill="white" stroke="none" data-opening-id="{opening_id}"/>'
    
    print(f"[SVG] Wall gap polygon: {gap_polygon_points}")
    
    # Add wall gap to walls-openings-white group (creates the "break" in the wall)
    if '<g id="walls-openings-white"' in svg:
        # Insert into existing walls-openings-white group
        svg = re.sub(
            r'(<g id="walls-openings-white"[^>]*>)',
            f'\\1\n        {wall_gap}',
            svg
        )
    else:
        # If no walls-openings-white group exists, create one before walls-exterior
        if '<g id="walls-exterior">' in svg:
            svg = svg.replace(
                '<g id="walls-exterior">',
                f'<g id="walls-openings-white">\n        {wall_gap}\n        </g>\n        <g id="walls-exterior">'
            )
    
    # Find or create opening-assets group
    if '<g id="opening-assets">' in svg:
        # Insert into existing opening-assets group
        svg = svg.replace(
            '<g id="opening-assets">',
            f'<g id="opening-assets">{opening_group}'
        )
    elif '</svg>' in svg:
        # Create opening-assets group before </svg>
        svg = svg.replace(
            '</svg>',
            f'    <g id="opening-assets">{opening_group}\n    </g>\n</svg>'
        )
    
    print(f"[SVG] Successfully added opening with wall gap in Drafted format")
    return svg


def _generate_opening_base_svg(opening_type: str, width_inches: int) -> str:
    """
    Generate the base SVG content for an opening asset.
    This SVG will be base64-encoded and embedded in the <image> tag.
    
    Matches the Drafted convention:
    - White background rectangles
    - Black stroke outlines
    - Proper frame elements for windows
    - Swing arcs for doors
    """
    # SVG dimensions based on width (8px per inch is Drafted's scale for embedded SVGs)
    svg_width = width_inches * 8
    svg_height = 60  # Standard height for opening assets
    
    if "window" in opening_type:
        # Window SVG matching Drafted's window_single_casement format
        frame_width = 10
        panel_margin = 4
        panel_height = 32
        
        svg_content = f'''<svg width="{svg_width + 2}" height="{svg_height}" viewBox="0 0 {svg_width + 2} {svg_height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="window_{opening_type}_{width_inches}in">
<rect x="1" y="1" width="{svg_width}" height="{svg_height - 2}" fill="white"/>
<rect x="1" y="1" width="{svg_width}" height="{svg_height - 2}" stroke="black" stroke-width="2"/>
<rect id="windowFrame01" x="1" y="1" width="{frame_width}" height="{svg_height - 2}" fill="white" stroke="black" stroke-width="2"/>
<g id="windowContainer">
<g id="windowPanel">
<rect x="{frame_width + 1}" y="{panel_margin + 1}" width="{svg_width - 2 * frame_width - 2}" height="{panel_height}" stroke="black" stroke-width="2"/>
<rect id="windowMullion01" x="{frame_width + 1}" y="{panel_margin + 1}" width="16" height="{panel_height}" fill="white" stroke="black" stroke-width="2"/>
<rect id="windowGlass" x="{frame_width + 17}" y="{panel_margin + 15}" width="{svg_width - 2 * frame_width - 34}" height="4" fill="white" stroke="black" stroke-width="2"/>
<rect id="windowMullion02" x="{svg_width - frame_width - 15}" y="{panel_margin + 1}" width="16" height="{panel_height}" fill="white" stroke="black" stroke-width="2"/>
</g>
</g>
<rect id="windowFrame02" x="{svg_width - frame_width + 1}" y="1" width="{frame_width}" height="{svg_height - 2}" fill="white" stroke="black" stroke-width="2"/>
</g>
</svg>'''
    
    elif "sliding" in opening_type:
        # Sliding door SVG
        svg_height = 80
        svg_content = f'''<svg width="{svg_width + 2}" height="{svg_height}" viewBox="0 0 {svg_width + 2} {svg_height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="door_sliding_{width_inches}in">
<rect id="doorOpening" x="1" y="1" width="{svg_width}" height="{svg_height - 2}" fill="#f0f0f0" stroke="none"/>
<rect x="1" y="1" width="{svg_width // 2}" height="{svg_height - 2}" fill="none" stroke="black" stroke-width="2"/>
<rect x="{svg_width // 2 + 1}" y="1" width="{svg_width // 2}" height="{svg_height - 2}" fill="none" stroke="black" stroke-width="3"/>
<line x1="{svg_width // 2}" y1="10" x2="{svg_width // 2}" y2="{svg_height - 10}" stroke="black" stroke-width="1"/>
</g>
</svg>'''
    
    else:
        # Standard door SVG with swing arc (matching Drafted's door_interiorSingleSwing format)
        svg_height = 300  # Doors need more height for swing arc
        swing_radius = svg_width - 35  # Radius for swing arc
        
        svg_content = f'''<svg width="{svg_width + 2}" height="{svg_height}" viewBox="0 0 {svg_width + 2} {svg_height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="door_single_{width_inches}in">
<rect id="doorOpening" x="34.25" y="{svg_height - 45}" width="{svg_width - 33}" height="37.5" stroke-width="0.5" fill="#fffdf5" stroke="none"/>
<path id="doorSwing" d="M {svg_width - 10} {svg_height - 44} C {svg_width - 10} {(svg_height - 44) // 2} {svg_width // 2} 8 35 8" stroke="black" stroke-width="6" stroke-dasharray="20 20"/>
<g id="doorFrame_interior">
<rect id="doorTrim_outside" x="1" y="{svg_height - 8}" width="32" height="8" fill="#3F3F3F" stroke="black" stroke-width="2"/>
<rect id="doorTrim_inside" x="1" y="{svg_height - 52}" width="32" height="8" fill="#3F3F3F" stroke="black" stroke-width="2"/>
<rect id="doorJamb" x="35" y="{svg_height - 44}" width="36" height="8" transform="rotate(90 35 {svg_height - 44})" fill="#3F3F3F" stroke="black" stroke-width="2"/>
</g>
<rect id="doorPanel" x="36" y="8" width="8" height="{svg_height - 52}" fill="#3F3F3F" stroke="black" stroke-width="2"/>
</g>
</svg>'''
    
    return svg_content


# =============================================================================
# DEBUG ENDPOINTS
# =============================================================================

@router.get("/debug/blend-jobs")
async def list_blend_debug_jobs():
    """
    List all debug blend jobs (when DEBUG_BLEND=true).
    
    To enable debug mode, set environment variable:
    SET DEBUG_BLEND=true (Windows) or export DEBUG_BLEND=true (Unix)
    """
    debug_dir = Path(__file__).parent.parent.parent / "debug_blend"
    
    if not debug_dir.exists():
        return {
            "enabled": os.environ.get("DEBUG_BLEND", "false").lower() == "true",
            "message": "No debug output yet. Set DEBUG_BLEND=true and try an opening operation.",
            "jobs": []
        }
    
    jobs = []
    for job_dir in sorted(debug_dir.iterdir(), reverse=True):
        if job_dir.is_dir():
            files = list(job_dir.glob("*.png"))
            jobs.append({
                "job_id": job_dir.name,
                "files": [f.name for f in sorted(files)],
                "file_count": len(files),
            })
    
    return {
        "enabled": os.environ.get("DEBUG_BLEND", "false").lower() == "true",
        "debug_dir": str(debug_dir),
        "jobs": jobs[:10],  # Last 10 jobs
    }


@router.get("/debug/blend-jobs/{job_id}/{filename}")
async def get_blend_debug_file(job_id: str, filename: str):
    """
    Get a specific debug file from a blend job.
    Supports both .png and .svg files.
    """
    from fastapi.responses import FileResponse
    
    debug_dir = Path(__file__).parent.parent.parent / "debug_blend"
    filepath = debug_dir / job_id / filename
    
    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"Debug file not found: {job_id}/{filename}")
    
    # Determine media type
    if filename.endswith('.svg'):
        media_type = "image/svg+xml"
    elif filename.endswith('.png'):
        media_type = "image/png"
    else:
        media_type = "application/octet-stream"
    
    return FileResponse(filepath, media_type=media_type)


@router.get("/debug/opening-job/{job_id}")
async def get_opening_job_debug(job_id: str):
    """
    Get detailed debug info for an opening job, including the modified SVG content.
    """
    if job_id not in _opening_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    job = _opening_jobs[job_id]
    
    # Check for openings group in the modified SVG
    has_openings = 'id="openings"' in job.get("modified_svg", "")
    
    # Find opening symbols
    import re
    opening_symbols = re.findall(r'<g[^>]*class="opening[^"]*"[^>]*>', job.get("modified_svg", ""))
    
    # Check debug files
    debug_dir = Path(__file__).parent.parent.parent / "debug_blend" / job_id
    debug_files = []
    if debug_dir.exists():
        debug_files = [f.name for f in debug_dir.glob("*")]
    
    return {
        "job_id": job_id,
        "status": job.get("status"),
        "opening": job.get("opening"),
        "has_openings_group": has_openings,
        "opening_symbols_found": len(opening_symbols),
        "opening_symbols": opening_symbols[:5],  # First 5
        "debug_files": debug_files,
        "svg_length": len(job.get("modified_svg", "")),
        "error": job.get("error"),
    }
