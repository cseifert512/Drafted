"""
Surgical Blending for Floor Plan Openings

This module provides image blending utilities for door/window editing:
- Extract the affected ROOM POLYGON from the SVG
- Only blend within that room polygon to prevent changes in other areas
- Furniture, lighting, etc. in OTHER rooms remains untouched

Uses PIL/Pillow for image manipulation.
"""

import io
import os
import re
import time
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, List
from PIL import Image, ImageFilter, ImageDraw, ImageFont
import numpy as np

# Debug mode - set DEBUG_BLEND=true to save debug visualizations
# Temporarily enabled by default for debugging
DEBUG_BLEND = os.environ.get("DEBUG_BLEND", "true").lower() == "true"
DEBUG_OUTPUT_DIR = Path(__file__).parent.parent.parent / "debug_blend"


def _save_debug_image(img: Image.Image, name: str, job_id: str = ""):
    """Save a debug image to the debug output directory."""
    if not DEBUG_BLEND:
        return
    
    # Create debug directory
    DEBUG_OUTPUT_DIR.mkdir(exist_ok=True)
    
    # Create job-specific subdirectory
    if job_id:
        job_dir = DEBUG_OUTPUT_DIR / job_id
    else:
        job_dir = DEBUG_OUTPUT_DIR / f"blend_{int(time.time())}"
    job_dir.mkdir(exist_ok=True)
    
    # Save image
    filepath = job_dir / f"{name}.png"
    img.convert('RGB').save(filepath)
    print(f"[DEBUG_BLEND] Saved: {filepath}")


def _extract_room_polygons_from_svg(svg: str) -> List[Dict[str, Any]]:
    """
    Extract all room polygons from the SVG.
    
    Returns list of dicts with:
    - points: List of (x, y) tuples in SVG coordinates
    - room_id: Room identifier (e.g., "R001", "living_room")
    - fill: Fill color
    """
    rooms = []
    
    # Find all polygon elements with room data
    # Pattern matches: <polygon ... data-room-id="..." points="..." ...>
    polygon_pattern = r'<polygon[^>]*?(?:data-room-id="([^"]*)")?[^>]*?points="([^"]*)"[^>]*?(?:fill="([^"]*)")?[^>]*/?\s*>'
    
    for match in re.finditer(polygon_pattern, svg, re.IGNORECASE | re.DOTALL):
        room_id = match.group(1)
        points_str = match.group(2)
        fill = match.group(3) or ""
        
        # Also try to find room_id after points
        full_tag = match.group(0)
        if not room_id:
            room_id_match = re.search(r'data-room-id="([^"]*)"', full_tag)
            if room_id_match:
                room_id = room_id_match.group(1)
        if not fill:
            fill_match = re.search(r'fill="([^"]*)"', full_tag)
            if fill_match:
                fill = fill_match.group(1)
        
        # Parse points
        points = []
        for point_match in re.finditer(r'([\d.]+)[,\s]+([\d.]+)', points_str):
            x = float(point_match.group(1))
            y = float(point_match.group(2))
            points.append((x, y))
        
        if len(points) >= 3:  # Valid polygon
            rooms.append({
                "points": points,
                "room_id": room_id or f"room_{len(rooms)}",
                "fill": fill,
            })
    
    return rooms


def _find_room_containing_point(
    rooms: List[Dict[str, Any]],
    point_x: float,
    point_y: float,
) -> Optional[Dict[str, Any]]:
    """
    Find the room polygon that contains the given point.
    Uses ray casting algorithm for point-in-polygon test.
    """
    for room in rooms:
        if _point_in_polygon(point_x, point_y, room["points"]):
            return room
    return None


def _point_in_polygon(x: float, y: float, polygon: List[Tuple[float, float]]) -> bool:
    """
    Ray casting algorithm to check if point is inside polygon.
    """
    n = len(polygon)
    inside = False
    
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    
    return inside


def _polygon_to_png_coords(
    polygon_points: List[Tuple[float, float]],
    viewbox: Dict[str, float],
    png_width: int,
    png_height: int,
) -> List[Tuple[int, int]]:
    """
    Convert SVG polygon coordinates to PNG pixel coordinates.
    """
    vb_x = viewbox["x"]
    vb_y = viewbox["y"]
    vb_width = viewbox["width"]
    vb_height = viewbox["height"]
    
    scale_x = png_width / vb_width
    scale_y = png_height / vb_height
    
    png_points = []
    for svg_x, svg_y in polygon_points:
        png_x = int((svg_x - vb_x) * scale_x)
        png_y = int((svg_y - vb_y) * scale_y)
        png_points.append((png_x, png_y))
    
    return png_points


def _create_room_mask(
    png_points: List[Tuple[int, int]],
    width: int,
    height: int,
    expand_px: int = 10,
    feather_radius: int = 15,
) -> Image.Image:
    """
    Create a mask from a room polygon with optional expansion and feathering.
    
    Args:
        png_points: List of (x, y) points defining the room polygon in PNG coords
        width: Image width
        height: Image height
        expand_px: Pixels to expand the polygon outward (for edge coverage)
        feather_radius: Blur radius for soft edges
        
    Returns:
        Grayscale mask image (white = blend, black = keep original)
    """
    # Create base mask
    mask = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(mask)
    
    # Draw filled polygon
    if len(png_points) >= 3:
        draw.polygon(png_points, fill=255, outline=255)
    
    # Expand the mask slightly to ensure edge coverage
    if expand_px > 0:
        mask = mask.filter(ImageFilter.MaxFilter(size=expand_px * 2 + 1))
    
    # Feather edges
    if feather_radius > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=feather_radius))
    
    return mask


def surgical_blend(
    original_image: bytes,
    new_image: bytes,
    opening: Dict[str, Any],
    modified_svg: str,
    padding_px: int = 50,
    feather_radius: int = 20,
    job_id: str = "",
) -> bytes:
    """
    Surgically blend a new render with the original, ONLY applying changes
    within the ROOM POLYGON that contains the opening.
    
    This prevents "drift" where unrelated rooms/furniture change during re-rendering.
    
    Args:
        original_image: Original rendered PNG bytes
        new_image: New rendered PNG bytes (with opening)
        opening: Opening specification dict (with wall_coords if available)
        modified_svg: SVG with the opening (used to find room polygon)
        padding_px: Expansion of room polygon in PNG pixels
        feather_radius: Radius for feathered blending edge
        job_id: Optional job ID for debug output
        
    Returns:
        Blended PNG image bytes
    """
    # Load images
    original = Image.open(io.BytesIO(original_image)).convert('RGBA')
    new = Image.open(io.BytesIO(new_image)).convert('RGBA')
    
    # Ensure same size
    if original.size != new.size:
        print(f"[BLEND] Resizing new image from {new.size} to {original.size}")
        new = new.resize(original.size, Image.Resampling.LANCZOS)
    
    width, height = original.size
    
    # Debug: Save input images
    _save_debug_image(original, "01_original_input", job_id)
    _save_debug_image(new, "02_new_render", job_id)
    
    # Parse SVG viewBox for coordinate mapping
    viewbox = _parse_viewbox(modified_svg)
    if not viewbox:
        print("[BLEND] ERROR: Could not parse viewBox from SVG")
        return new_image  # Fallback to full new image
    
    # Get opening center in SVG coordinates
    wall_coords = opening.get("wall_coords")
    if wall_coords:
        position = opening.get("position_on_wall", 0.5)
        svg_center_x = wall_coords["start_x"] + (wall_coords["end_x"] - wall_coords["start_x"]) * position
        svg_center_y = wall_coords["start_y"] + (wall_coords["end_y"] - wall_coords["start_y"]) * position
        print(f"[BLEND] Opening center in SVG: ({svg_center_x:.1f}, {svg_center_y:.1f})")
    else:
        print("[BLEND] WARNING: No wall coordinates, using image center")
        svg_center_x = viewbox["x"] + viewbox["width"] / 2
        svg_center_y = viewbox["y"] + viewbox["height"] / 2
    
    # Extract room polygons from SVG
    rooms = _extract_room_polygons_from_svg(modified_svg)
    print(f"[BLEND] Found {len(rooms)} room polygons in SVG")
    
    # Find the room containing the opening
    target_room = _find_room_containing_point(rooms, svg_center_x, svg_center_y)
    
    if target_room:
        print(f"[BLEND] Opening is in room: {target_room['room_id']} (fill={target_room['fill']})")
        
        # Convert room polygon to PNG coordinates
        png_points = _polygon_to_png_coords(
            target_room["points"],
            viewbox,
            width,
            height,
        )
        
        # Create mask from room polygon
        mask = _create_room_mask(
            png_points,
            width,
            height,
            expand_px=padding_px,
            feather_radius=feather_radius,
        )
        
        # Debug: Save room polygon visualization
        if DEBUG_BLEND:
            debug_room = original.copy().convert('RGB')
            draw = ImageDraw.Draw(debug_room)
            # Draw room polygon outline
            if len(png_points) >= 3:
                draw.polygon(png_points, outline='red', fill=None)
                # Draw points
                for i, (px, py) in enumerate(png_points):
                    draw.ellipse([px-3, py-3, px+3, py+3], fill='blue')
            # Mark opening center
            png_center_x = int((svg_center_x - viewbox["x"]) * width / viewbox["width"])
            png_center_y = int((svg_center_y - viewbox["y"]) * height / viewbox["height"])
            draw.ellipse([png_center_x-5, png_center_y-5, png_center_x+5, png_center_y+5], fill='green')
            try:
                draw.text((10, 10), f"Room: {target_room['room_id']}", fill='red')
                draw.text((10, 30), f"Points: {len(png_points)}", fill='red')
            except:
                pass
            _save_debug_image(debug_room, "03_room_polygon", job_id)
    else:
        print("[BLEND] WARNING: Could not find room containing opening, using rectangular fallback")
        # Fallback to rectangular region around opening
        if wall_coords:
            center_x, center_y, region_width, region_height = _calculate_blend_region_from_wall(
                wall_coords=wall_coords,
                opening=opening,
                viewbox=viewbox,
                png_width=width,
                png_height=height,
                padding_px=padding_px,
            )
        else:
            center_x = width // 2
            center_y = height // 2
            region_width = region_height = int(padding_px * 4)
        
        x1 = max(0, center_x - region_width // 2)
        y1 = max(0, center_y - region_height // 2)
        x2 = min(width, center_x + region_width // 2)
        y2 = min(height, center_y + region_height // 2)
        
        mask = _create_feathered_mask(width, height, x1, y1, x2, y2, feather_radius)
    
    # Debug: Save mask
    _save_debug_image(mask, "04_blend_mask", job_id)
    
    # Composite images using mask
    result = Image.composite(new, original, mask)
    
    # Debug: Save result
    _save_debug_image(result, "05_blended_result", job_id)
    
    # Create comparison
    if DEBUG_BLEND:
        comparison = _create_room_comparison(original, new, result, mask)
        _save_debug_image(comparison, "06_comparison", job_id)
    
    # Convert back to bytes
    output = io.BytesIO()
    result.convert('RGB').save(output, format='PNG', optimize=True)
    return output.getvalue()


def _create_room_comparison(
    original: Image.Image,
    new: Image.Image,
    result: Image.Image,
    mask: Image.Image,
) -> Image.Image:
    """Create a 2x2 comparison grid for debugging."""
    scale = 0.5
    w = int(original.width * scale)
    h = int(original.height * scale)
    
    canvas = Image.new('RGB', (w * 2, h * 2), 'white')
    
    orig_small = original.convert('RGB').resize((w, h), Image.Resampling.LANCZOS)
    new_small = new.convert('RGB').resize((w, h), Image.Resampling.LANCZOS)
    result_small = result.convert('RGB').resize((w, h), Image.Resampling.LANCZOS)
    mask_rgb = mask.convert('RGB').resize((w, h), Image.Resampling.LANCZOS)
    
    canvas.paste(orig_small, (0, 0))
    canvas.paste(new_small, (w, 0))
    canvas.paste(mask_rgb, (0, h))
    canvas.paste(result_small, (w, h))
    
    draw = ImageDraw.Draw(canvas)
    try:
        draw.text((5, 5), "ORIGINAL", fill='red')
        draw.text((w + 5, 5), "NEW RENDER (full)", fill='red')
        draw.text((5, h + 5), "ROOM MASK", fill='red')
        draw.text((w + 5, h + 5), "RESULT (stitched)", fill='green')
    except:
        pass
    
    return canvas


def _calculate_blend_region_from_wall(
    wall_coords: Dict[str, float],
    opening: Dict[str, Any],
    viewbox: Dict[str, float],
    png_width: int,
    png_height: int,
    padding_px: int,
) -> Tuple[int, int, int, int]:
    """
    Calculate the blend region using actual wall coordinates.
    
    Args:
        wall_coords: Wall segment with start_x, start_y, end_x, end_y (SVG space)
        opening: Opening specification with position_on_wall, width_inches
        viewbox: SVG viewBox (x, y, width, height)
        png_width: PNG image width
        png_height: PNG image height
        padding_px: Padding around opening
        
    Returns:
        Tuple of (center_x, center_y, region_width, region_height) in PNG pixels
    """
    # Extract wall start/end in SVG coordinates
    start_x = wall_coords.get("start_x", 0)
    start_y = wall_coords.get("start_y", 0)
    end_x = wall_coords.get("end_x", 0)
    end_y = wall_coords.get("end_y", 0)
    
    # Calculate position along wall
    position = opening.get("position_on_wall", 0.5)
    
    # Opening center in SVG space
    svg_center_x = start_x + (end_x - start_x) * position
    svg_center_y = start_y + (end_y - start_y) * position
    
    # Convert SVG coordinates to PNG coordinates
    # SVG viewBox: (vb_x, vb_y, vb_width, vb_height) maps to (0, 0, png_width, png_height)
    vb_x = viewbox["x"]
    vb_y = viewbox["y"]
    vb_width = viewbox["width"]
    vb_height = viewbox["height"]
    
    # Scale factors
    scale_x = png_width / vb_width
    scale_y = png_height / vb_height
    
    # Map SVG point to PNG point
    png_center_x = int((svg_center_x - vb_x) * scale_x)
    png_center_y = int((svg_center_y - vb_y) * scale_y)
    
    # Calculate region size based on opening width and wall orientation
    opening_width_inches = opening.get("width_inches", 36)
    
    # SVG scale: 1px = 2 inches
    opening_svg_width = opening_width_inches / 2
    
    # Wall direction to determine region orientation
    wall_dx = end_x - start_x
    wall_dy = end_y - start_y
    
    # Region should extend perpendicular to wall
    if abs(wall_dx) > abs(wall_dy):
        # Horizontal wall - extend in X direction
        region_width = int(opening_svg_width * scale_x + padding_px * 2)
        region_height = int(padding_px * 4)  # Less height for horizontal walls
    else:
        # Vertical wall - extend in Y direction
        region_width = int(padding_px * 4)  # Less width for vertical walls
        region_height = int(opening_svg_width * scale_y + padding_px * 2)
    
    # Ensure minimum region size
    region_width = max(region_width, int(padding_px * 3))
    region_height = max(region_height, int(padding_px * 3))
    
    return png_center_x, png_center_y, region_width, region_height


def _parse_viewbox(svg: str) -> Optional[Dict[str, float]]:
    """Parse viewBox from SVG string."""
    match = re.search(r'viewBox="([^"]+)"', svg)
    if not match:
        return None
    
    parts = match.group(1).split()
    if len(parts) != 4:
        return None
    
    try:
        return {
            "x": float(parts[0]),
            "y": float(parts[1]),
            "width": float(parts[2]),
            "height": float(parts[3]),
        }
    except ValueError:
        return None


def _create_feathered_mask(
    width: int,
    height: int,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    feather_radius: int,
) -> Image.Image:
    """
    Create a feathered (soft-edged) mask for blending.
    
    The mask is white (255) in the blend region and black (0) outside,
    with a gradual transition at the edges.
    """
    # Create base mask (black)
    mask = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(mask)
    
    # Draw white rectangle for blend region
    draw.rectangle([x1, y1, x2, y2], fill=255)
    
    # Apply Gaussian blur for feathering
    if feather_radius > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=feather_radius))
    
    return mask


def blend_with_difference_detection(
    original_image: bytes,
    new_image: bytes,
    threshold: int = 30,
    min_area: int = 100,
) -> bytes:
    """
    Alternative blending approach: detect differences between images
    and only blend regions that have changed significantly.
    
    This is useful when you don't know exactly where the opening is,
    but want to preserve unchanged areas.
    
    Args:
        original_image: Original rendered PNG bytes
        new_image: New rendered PNG bytes
        threshold: Pixel difference threshold (0-255)
        min_area: Minimum contiguous area to consider as a change
        
    Returns:
        Blended PNG image bytes
    """
    # Load images
    original = Image.open(io.BytesIO(original_image)).convert('RGB')
    new = Image.open(io.BytesIO(new_image)).convert('RGB')
    
    # Ensure same size
    if original.size != new.size:
        new = new.resize(original.size, Image.Resampling.LANCZOS)
    
    # Convert to numpy arrays
    orig_arr = np.array(original, dtype=np.float32)
    new_arr = np.array(new, dtype=np.float32)
    
    # Calculate per-pixel difference
    diff = np.abs(orig_arr - new_arr)
    diff_gray = np.mean(diff, axis=2)  # Average across RGB channels
    
    # Create binary mask of changed regions
    change_mask = (diff_gray > threshold).astype(np.uint8) * 255
    
    # Dilate mask to include surrounding area
    from PIL import ImageFilter
    mask_img = Image.fromarray(change_mask, mode='L')
    mask_img = mask_img.filter(ImageFilter.MaxFilter(size=5))
    mask_img = mask_img.filter(ImageFilter.GaussianBlur(radius=10))
    
    # Composite
    original_rgba = original.convert('RGBA')
    new_rgba = new.convert('RGBA')
    result = Image.composite(new_rgba, original_rgba, mask_img)
    
    # Convert back to bytes
    output = io.BytesIO()
    result.convert('RGB').save(output, format='PNG', optimize=True)
    return output.getvalue()


def histogram_match(
    source_image: bytes,
    reference_image: bytes,
) -> bytes:
    """
    Match the histogram of the source image to the reference image.
    
    This helps prevent color/brightness drift when using full re-renders
    for windows (where lighting changes are expected but overall color
    should remain consistent).
    
    Args:
        source_image: Image to adjust (new render)
        reference_image: Reference image (original render)
        
    Returns:
        Adjusted PNG image bytes
    """
    # Load images
    source = Image.open(io.BytesIO(source_image)).convert('RGB')
    reference = Image.open(io.BytesIO(reference_image)).convert('RGB')
    
    # Convert to numpy
    src_arr = np.array(source, dtype=np.float32)
    ref_arr = np.array(reference, dtype=np.float32)
    
    # Match histogram for each channel
    result_arr = np.zeros_like(src_arr)
    
    for channel in range(3):
        src_channel = src_arr[:, :, channel].flatten()
        ref_channel = ref_arr[:, :, channel].flatten()
        
        # Calculate histograms
        src_hist, src_bins = np.histogram(src_channel, bins=256, range=(0, 256))
        ref_hist, ref_bins = np.histogram(ref_channel, bins=256, range=(0, 256))
        
        # Calculate CDFs
        src_cdf = np.cumsum(src_hist).astype(np.float32)
        src_cdf /= src_cdf[-1]
        
        ref_cdf = np.cumsum(ref_hist).astype(np.float32)
        ref_cdf /= ref_cdf[-1]
        
        # Create lookup table
        lookup = np.zeros(256, dtype=np.uint8)
        ref_idx = 0
        for src_idx in range(256):
            while ref_idx < 255 and ref_cdf[ref_idx] < src_cdf[src_idx]:
                ref_idx += 1
            lookup[src_idx] = ref_idx
        
        # Apply lookup
        result_channel = lookup[src_channel.astype(np.uint8)]
        result_arr[:, :, channel] = result_channel.reshape(src_arr.shape[:2])
    
    # Convert back to image
    result = Image.fromarray(result_arr.astype(np.uint8), mode='RGB')
    
    # Convert to bytes
    output = io.BytesIO()
    result.save(output, format='PNG', optimize=True)
    return output.getvalue()


def smart_blend_for_opening(
    original_image: bytes,
    new_image: bytes,
    opening: Dict[str, Any],
    modified_svg: str,
    job_id: str = "",
) -> bytes:
    """
    Smart blending that ONLY changes the room containing the opening.
    
    ALL opening types use room-polygon-based blending:
    - Extracts the room polygon from SVG
    - Only blends within that room
    - Preserves all other rooms EXACTLY as original
    
    Args:
        original_image: Original rendered PNG bytes
        new_image: New rendered PNG bytes
        opening: Opening specification dict
        modified_svg: SVG with the opening
        job_id: Optional job ID for debug output
        
    Returns:
        Blended PNG image bytes
    """
    opening_type = opening.get("type", "interior_door")
    print(f"[SMART_BLEND] Room-based blending for {opening_type}, job={job_id}")
    
    # Determine expansion/feathering based on opening type
    if opening_type in ["window", "picture_window", "bay_window"]:
        # Windows may affect lighting in room - use histogram matching first
        print(f"[SMART_BLEND] Window: histogram match + room polygon blend")
        matched = histogram_match(new_image, original_image)
        
        # Debug: Save histogram matched image
        if DEBUG_BLEND and job_id:
            matched_img = Image.open(io.BytesIO(matched))
            _save_debug_image(matched_img, "02b_histogram_matched", job_id)
        
        return surgical_blend(
            original_image,
            matched,
            opening,
            modified_svg,
            padding_px=15,   # Small expansion beyond room polygon
            feather_radius=20,
            job_id=job_id,
        )
    
    elif opening_type in ["sliding_door", "french_door"]:
        # Glass doors - similar to windows
        print(f"[SMART_BLEND] Glass door: room polygon blend")
        matched = histogram_match(new_image, original_image)
        
        return surgical_blend(
            original_image,
            matched,
            opening,
            modified_svg,
            padding_px=10,
            feather_radius=15,
            job_id=job_id,
        )
    
    else:
        # Interior/exterior doors - tight room blend
        print(f"[SMART_BLEND] Door: room polygon blend")
        return surgical_blend(
            original_image,
            new_image,
            opening,
            modified_svg,
            padding_px=5,    # Minimal expansion
            feather_radius=10,
            job_id=job_id,
        )


# =============================================================================
# PROMPT-BASED OPENING EDIT (NEW APPROACH)
# =============================================================================

def annotate_png_for_opening_edit(
    original_png: bytes,
    opening: Dict[str, Any],
    svg: str,
    boundary_padding_px: int = 20,
    job_id: str = "",
) -> Tuple[bytes, Dict[str, Any]]:
    """
    Annotate a PNG image with visual guides for Gemini opening edit.
    
    Draws:
    - BLUE BOX: Rectangle at the opening location on the wall
    - RED BOUNDARY: Polygon around the affected room (edit constraint)
    
    Args:
        original_png: Original rendered PNG bytes
        opening: Opening specification dict with wall_coords, position_on_wall, width_inches
        svg: SVG string (to extract room polygon and viewBox)
        boundary_padding_px: Padding to add around room boundary in PNG pixels
        job_id: Optional job ID for debug output
        
    Returns:
        Tuple of (annotated PNG bytes, metadata dict with coordinates)
    """
    import math
    
    # Load image
    img = Image.open(io.BytesIO(original_png)).convert('RGB')
    width, height = img.size
    draw = ImageDraw.Draw(img)
    
    # Parse viewBox from SVG
    viewbox = _parse_viewbox(svg)
    if not viewbox:
        print("[ANNOTATE] ERROR: Could not parse viewBox from SVG")
        return original_png, {"error": "No viewBox"}
    
    # Get wall coordinates
    wall_coords = opening.get("wall_coords")
    if not wall_coords:
        print("[ANNOTATE] ERROR: No wall_coords in opening")
        return original_png, {"error": "No wall_coords"}
    
    # Extract wall info
    start_x = wall_coords["start_x"]
    start_y = wall_coords["start_y"]
    end_x = wall_coords["end_x"]
    end_y = wall_coords["end_y"]
    position = opening.get("position_on_wall", 0.5)
    width_inches = opening.get("width_inches", 36)
    
    # Calculate SVG to PNG scale factors
    vb_x = viewbox["x"]
    vb_y = viewbox["y"]
    vb_width = viewbox["width"]
    vb_height = viewbox["height"]
    scale_x = width / vb_width
    scale_y = height / vb_height
    
    print(f"[ANNOTATE] PNG size: {width}x{height}")
    print(f"[ANNOTATE] ViewBox: x={vb_x:.1f}, y={vb_y:.1f}, w={vb_width:.1f}, h={vb_height:.1f}")
    print(f"[ANNOTATE] Scale factors: x={scale_x:.3f}, y={scale_y:.3f}")
    print(f"[ANNOTATE] Wall coords: ({start_x:.1f},{start_y:.1f}) -> ({end_x:.1f},{end_y:.1f})")
    print(f"[ANNOTATE] Position on wall: {position:.3f}")
    
    # Calculate opening center in SVG coordinates
    svg_center_x = start_x + (end_x - start_x) * position
    svg_center_y = start_y + (end_y - start_y) * position
    
    print(f"[ANNOTATE] Opening center in SVG: ({svg_center_x:.1f}, {svg_center_y:.1f})")
    
    # Convert to PNG coordinates
    png_center_x = int((svg_center_x - vb_x) * scale_x)
    png_center_y = int((svg_center_y - vb_y) * scale_y)
    
    print(f"[ANNOTATE] Opening center in PNG: ({png_center_x}, {png_center_y})")
    
    # Calculate wall direction for opening orientation
    wall_dx = end_x - start_x
    wall_dy = end_y - start_y
    wall_length = math.sqrt(wall_dx * wall_dx + wall_dy * wall_dy)
    
    # Normalize wall direction
    if wall_length > 0:
        dir_x = wall_dx / wall_length
        dir_y = wall_dy / wall_length
    else:
        dir_x, dir_y = 1, 0
    
    # Perpendicular direction (for box depth)
    perp_x = -dir_y
    perp_y = dir_x
    
    # Opening dimensions in SVG units (1px = 2 inches)
    opening_svg_width = width_inches / 2
    opening_svg_depth = 8  # Wall thickness + some margin (about 16 inches)
    
    # Calculate opening box corners in SVG coordinates
    half_width = opening_svg_width / 2
    half_depth = opening_svg_depth / 2
    
    # Four corners of the opening box
    box_corners_svg = [
        (svg_center_x - dir_x * half_width - perp_x * half_depth,
         svg_center_y - dir_y * half_width - perp_y * half_depth),
        (svg_center_x + dir_x * half_width - perp_x * half_depth,
         svg_center_y + dir_y * half_width - perp_y * half_depth),
        (svg_center_x + dir_x * half_width + perp_x * half_depth,
         svg_center_y + dir_y * half_width + perp_y * half_depth),
        (svg_center_x - dir_x * half_width + perp_x * half_depth,
         svg_center_y - dir_y * half_width + perp_y * half_depth),
    ]
    
    # Convert box corners to PNG coordinates
    box_corners_png = [
        (int((x - vb_x) * scale_x), int((y - vb_y) * scale_y))
        for x, y in box_corners_svg
    ]
    
    # Draw BLUE BOX for opening location (3px thick)
    BLUE = (0, 0, 255)
    for i in range(len(box_corners_png)):
        p1 = box_corners_png[i]
        p2 = box_corners_png[(i + 1) % len(box_corners_png)]
        draw.line([p1, p2], fill=BLUE, width=4)
    
    print(f"[ANNOTATE] Blue box at PNG center ({png_center_x}, {png_center_y})")
    
    # NOTE: Red boundary removed - we now only use the blue box and instruct
    # Gemini to ONLY modify the blue box area and not touch anything else.
    # This simplifies the approach and avoids issues with the red boundary
    # appearing in the output image.
    
    # Debug: Save annotated image
    if DEBUG_BLEND and job_id:
        _save_debug_image(img, "07_annotated_for_gemini", job_id)
    
    # Convert back to bytes
    output = io.BytesIO()
    img.save(output, format='PNG')
    annotated_png = output.getvalue()
    
    # Build metadata
    metadata = {
        "blue_box_center_png": (png_center_x, png_center_y),
        "blue_box_corners_png": box_corners_png,
        "opening_width_inches": width_inches,
        "viewbox": viewbox,
    }
    
    return annotated_png, metadata


def _expand_polygon(
    points: List[Tuple[int, int]],
    expand_px: int,
) -> List[Tuple[int, int]]:
    """
    Expand a polygon outward by a given number of pixels.
    Uses centroid-based expansion (simple but effective for convex-ish polygons).
    """
    import math
    
    if len(points) < 3:
        return points
    
    # Calculate centroid
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    
    expanded = []
    for px, py in points:
        # Direction from centroid to point
        dx = px - cx
        dy = py - cy
        dist = math.sqrt(dx * dx + dy * dy)
        
        if dist > 0:
            # Expand outward
            factor = (dist + expand_px) / dist
            new_x = int(cx + dx * factor)
            new_y = int(cy + dy * factor)
        else:
            new_x, new_y = px, py
        
        expanded.append((new_x, new_y))
    
    return expanded


def get_opening_description(opening: Dict[str, Any]) -> str:
    """
    Get a human-readable description of an opening type for prompts.
    
    Args:
        opening: Opening specification dict
        
    Returns:
        Detailed description string for the opening type
    """
    opening_type = opening.get("type", "interior_door")
    width_inches = opening.get("width_inches", 36)
    swing = opening.get("swing_direction", "right")
    
    descriptions = {
        "interior_door": f"a standard interior hinged door ({width_inches} inches wide) with a wooden panel, swinging {swing}",
        "exterior_door": f"an exterior entry door ({width_inches} inches wide) with solid wood or glass panel design",
        "sliding_door": f"a sliding glass door ({width_inches} inches wide) with large glass panels and a metal frame",
        "french_door": f"French double doors ({width_inches} inches wide) with glass panes and decorative frames",
        "window": f"a standard casement window ({width_inches} inches wide) with glass panes and white frame",
        "picture_window": f"a large picture window ({width_inches} inches wide) with a single fixed glass pane",
        "bay_window": f"a bay window ({width_inches} inches wide) projecting outward with multiple glass panes",
    }
    
    return descriptions.get(opening_type, f"an opening ({width_inches} inches wide)")


