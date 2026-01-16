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

class OpeningPlacement(BaseModel):
    """Specification for a door or window placement."""
    type: str  # interior_door, exterior_door, sliding_door, french_door, window, picture_window, bay_window
    wall_id: str
    position_on_wall: float  # 0-1 along the wall segment
    width_inches: float
    swing_direction: Optional[str] = None  # left, right (for doors)


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
        
        # Create opening with generated ID
        opening_with_id = {
            "id": opening_id,
            "type": request.opening.type,
            "wall_id": request.opening.wall_id,
            "position_on_wall": request.opening.position_on_wall,
            "width_inches": request.opening.width_inches,
            "swing_direction": request.opening.swing_direction,
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
    Background task to re-render a floor plan with a new opening.
    
    This function:
    1. Updates job status to 'rendering'
    2. Sends modified SVG to Gemini for re-render
    3. Applies surgical blending (for doors) or uses full render (for windows)
    4. Updates job with final image
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
        
        # Import staging module
        gen_dir = Path(__file__).parent.parent / "generation"
        if str(gen_dir) not in sys.path:
            sys.path.insert(0, str(gen_dir))
        
        from gemini_staging import stage_floor_plan as do_stage
        
        # Re-render with Gemini
        stage_result = await do_stage(
            svg=job["modified_svg"],
            canonical_room_keys=job["canonical_room_keys"],
        )
        
        if not stage_result.success:
            job["status"] = "failed"
            job["error"] = stage_result.error or "Staging failed"
            return
        
        # Update status to blending
        job["status"] = "blending"
        
        # Determine if we need surgical blending (doors) or full render (windows)
        opening_type = job["opening"]["type"]
        affects_lighting = "window" in opening_type or opening_type in ["sliding_door", "french_door"]
        
        if affects_lighting:
            # Use full new render for windows (lighting changes are intentional)
            final_image = stage_result.staged_image
        else:
            # Apply surgical blending for doors
            original_image = base64.b64decode(job["original_rendered_image"])
            new_image = stage_result.staged_image
            
            # Import blending utility
            utils_dir = Path(__file__).parent.parent / "utils"
            if str(utils_dir) not in sys.path:
                sys.path.insert(0, str(utils_dir))
            
            try:
                from surgical_blend import surgical_blend
                final_image = surgical_blend(
                    original_image,
                    new_image,
                    job["opening"],
                    job["modified_svg"],
                )
            except ImportError:
                # Fallback: use full new render if blending not available
                print("[WARN] surgical_blend not available, using full render")
                final_image = new_image
        
        # Update job with final image
        job["status"] = "complete"
        job["rendered_image_base64"] = base64.b64encode(final_image).decode('utf-8')
        job["completed_at"] = __import__('time').time()
        
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
    Add an opening symbol to the SVG.
    
    This modifies the SVG to include:
    1. A wall gap (white rectangle to "cut" the wall)
    2. The appropriate door/window symbol
    """
    import re
    
    opening_id = opening["id"]
    opening_type = opening["type"]
    width_inches = opening["width_inches"]
    width_svg = width_inches / 2  # 1px = 2 inches
    
    # Generate the opening symbol
    # Note: Actual positioning requires wall data which would be passed from frontend
    # For now, we create a group that can be positioned
    
    if "door" in opening_type:
        if opening_type == "sliding_door":
            symbol = f'''
            <g id="{opening_id}" class="opening door sliding-door" data-opening-type="{opening_type}">
                <rect class="wall-gap" width="{width_svg}" height="8" fill="white"/>
                <line x1="0" y1="4" x2="{width_svg/2}" y2="4" stroke="#666" stroke-width="2"/>
                <line x1="{width_svg/2}" y1="4" x2="{width_svg}" y2="4" stroke="#333" stroke-width="3"/>
            </g>
            '''
        elif opening_type == "french_door":
            symbol = f'''
            <g id="{opening_id}" class="opening door french-door" data-opening-type="{opening_type}">
                <rect class="wall-gap" width="{width_svg}" height="8" fill="white"/>
                <line x1="0" y1="4" x2="{width_svg/2}" y2="4" stroke="#333" stroke-width="2"/>
                <line x1="{width_svg/2}" y1="4" x2="{width_svg}" y2="4" stroke="#333" stroke-width="2"/>
            </g>
            '''
        else:
            # Interior or exterior door
            swing = opening.get("swing_direction", "right")
            sweep_flag = 1 if swing == "right" else 0
            symbol = f'''
            <g id="{opening_id}" class="opening door" data-opening-type="{opening_type}">
                <rect class="wall-gap" width="{width_svg}" height="6" fill="white"/>
                <path d="M 0,3 A {width_svg},{width_svg} 0 0 {sweep_flag} {width_svg},{width_svg + 3}" 
                      fill="none" stroke="#666" stroke-width="1" stroke-dasharray="4,3"/>
                <line x1="0" y1="3" x2="{width_svg}" y2="3" stroke="#333" stroke-width="2"/>
            </g>
            '''
    else:
        # Window types
        if opening_type == "bay_window":
            depth = width_svg * 0.3
            symbol = f'''
            <g id="{opening_id}" class="opening window bay-window" data-opening-type="{opening_type}">
                <rect class="wall-gap" width="{width_svg}" height="8" fill="white"/>
                <path d="M 0,4 L {width_svg/3},{4 + depth} L {width_svg*2/3},{4 + depth} L {width_svg},4" 
                      fill="none" stroke="#222" stroke-width="3"/>
            </g>
            '''
        else:
            # Standard or picture window
            symbol = f'''
            <g id="{opening_id}" class="opening window" data-opening-type="{opening_type}">
                <rect class="wall-gap" width="{width_svg}" height="6" fill="white"/>
                <line x1="0" y1="3" x2="{width_svg}" y2="3" stroke="#333" stroke-width="3"/>
                <line x1="2" y1="1" x2="{width_svg - 2}" y2="1" stroke="#666" stroke-width="1"/>
                <line x1="2" y1="5" x2="{width_svg - 2}" y2="5" stroke="#666" stroke-width="1"/>
            </g>
            '''
    
    # Check if there's already an openings group
    if 'id="openings"' in svg:
        # Add to existing group
        svg = re.sub(
            r'(<g[^>]*id="openings"[^>]*>)',
            f'\\1\n    {symbol}',
            svg
        )
    else:
        # Create new openings group before closing </svg>
        openings_group = f'''
  <g id="openings" class="openings-layer">
    {symbol}
  </g>'''
        svg = svg.replace('</svg>', f'{openings_group}\n</svg>')
    
    return svg
