"""
Surgical Blending for Floor Plan Openings

This module provides image blending utilities for door/window editing:
- For doors: Blend only the door region to prevent "drift" in unrelated areas
- For windows: Use full new render (lighting changes are intentional)

Uses PIL/Pillow for image manipulation.
"""

import io
import os
import re
import time
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
from PIL import Image, ImageFilter, ImageDraw, ImageFont
import numpy as np

# Debug mode - set to True to save debug visualizations
DEBUG_BLEND = os.environ.get("DEBUG_BLEND", "false").lower() == "true"
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
    Surgically blend a new render with the original, only applying changes
    in the region around the opening.
    
    This prevents "drift" where unrelated parts of the floor plan change
    during re-rendering.
    
    Args:
        original_image: Original rendered PNG bytes
        new_image: New rendered PNG bytes (with opening)
        opening: Opening specification dict (with wall_coords if available)
        modified_svg: SVG with the opening (used to calculate region)
        padding_px: Padding around the opening region (in PNG pixels)
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
    
    # Check if we have actual wall coordinates
    wall_coords = opening.get("wall_coords")
    
    if wall_coords and viewbox:
        # Use ACCURATE coordinate mapping from wall segment data
        center_x, center_y, region_width, region_height = _calculate_blend_region_from_wall(
            wall_coords=wall_coords,
            opening=opening,
            viewbox=viewbox,
            png_width=width,
            png_height=height,
            padding_px=padding_px,
        )
        print(f"[BLEND] Using wall coordinates: center=({center_x}, {center_y}), region=({region_width}x{region_height})")
    else:
        # Fallback to estimation (less accurate)
        print("[BLEND] Warning: No wall coordinates, using estimation")
        opening_width_inches = opening.get("width_inches", 36)
        position_on_wall = opening.get("position_on_wall", 0.5)
        
        # Estimate region size
        svg_to_png_scale = 4
        region_width = int((opening_width_inches / 2) * svg_to_png_scale + padding_px * 2)
        region_height = region_width
        
        if viewbox:
            center_x = int(width * position_on_wall)
            center_y = int(height * 0.5)
        else:
            center_x = width // 2
            center_y = height // 2
    
    # Calculate blend region bounds
    x1 = max(0, center_x - region_width // 2)
    y1 = max(0, center_y - region_height // 2)
    x2 = min(width, center_x + region_width // 2)
    y2 = min(height, center_y + region_height // 2)
    
    print(f"[BLEND] Blend region: ({x1}, {y1}) to ({x2}, {y2})")
    
    # Debug: Save image with blend region highlighted
    if DEBUG_BLEND:
        debug_region = original.copy().convert('RGB')
        draw = ImageDraw.Draw(debug_region)
        # Draw red rectangle for blend region
        draw.rectangle([x1, y1, x2, y2], outline='red', width=3)
        # Draw green crosshair at center
        draw.line([center_x - 20, center_y, center_x + 20, center_y], fill='green', width=2)
        draw.line([center_x, center_y - 20, center_x, center_y + 20], fill='green', width=2)
        # Add text label
        try:
            draw.text((10, 10), f"Opening: {opening.get('type', 'unknown')}", fill='red')
            draw.text((10, 30), f"Center: ({center_x}, {center_y})", fill='red')
            draw.text((10, 50), f"Region: ({x1},{y1}) to ({x2},{y2})", fill='red')
            if wall_coords:
                draw.text((10, 70), f"Wall: ({wall_coords.get('start_x', 0):.0f},{wall_coords.get('start_y', 0):.0f}) to ({wall_coords.get('end_x', 0):.0f},{wall_coords.get('end_y', 0):.0f})", fill='red')
        except:
            pass  # Font issues on some systems
        _save_debug_image(debug_region, "03_blend_region", job_id)
    
    # Create feathered mask
    mask = _create_feathered_mask(
        width, height,
        x1, y1, x2, y2,
        feather_radius
    )
    
    # Debug: Save mask
    _save_debug_image(mask, "04_blend_mask", job_id)
    
    # Composite images using mask
    result = Image.composite(new, original, mask)
    
    # Debug: Save result and comparison
    _save_debug_image(result, "05_blended_result", job_id)
    
    # Create side-by-side comparison
    if DEBUG_BLEND:
        comparison = _create_comparison_image(original, new, result, mask, x1, y1, x2, y2)
        _save_debug_image(comparison, "06_comparison", job_id)
    
    # Convert back to bytes
    output = io.BytesIO()
    result.convert('RGB').save(output, format='PNG', optimize=True)
    return output.getvalue()


def _create_comparison_image(
    original: Image.Image,
    new: Image.Image,
    result: Image.Image,
    mask: Image.Image,
    x1: int, y1: int, x2: int, y2: int
) -> Image.Image:
    """Create a side-by-side comparison image for debugging."""
    # Scale down for comparison
    scale = 0.5
    w = int(original.width * scale)
    h = int(original.height * scale)
    
    # Create comparison canvas (2x2 grid)
    canvas = Image.new('RGB', (w * 2, h * 2), 'white')
    
    # Resize images
    orig_small = original.convert('RGB').resize((w, h), Image.Resampling.LANCZOS)
    new_small = new.convert('RGB').resize((w, h), Image.Resampling.LANCZOS)
    result_small = result.convert('RGB').resize((w, h), Image.Resampling.LANCZOS)
    mask_rgb = mask.convert('RGB').resize((w, h), Image.Resampling.LANCZOS)
    
    # Add blend region highlight to originals
    draw_orig = ImageDraw.Draw(orig_small)
    draw_new = ImageDraw.Draw(new_small)
    sx1, sy1 = int(x1 * scale), int(y1 * scale)
    sx2, sy2 = int(x2 * scale), int(y2 * scale)
    draw_orig.rectangle([sx1, sy1, sx2, sy2], outline='red', width=2)
    draw_new.rectangle([sx1, sy1, sx2, sy2], outline='red', width=2)
    
    # Paste into canvas
    canvas.paste(orig_small, (0, 0))
    canvas.paste(new_small, (w, 0))
    canvas.paste(mask_rgb, (0, h))
    canvas.paste(result_small, (w, h))
    
    # Add labels
    draw = ImageDraw.Draw(canvas)
    try:
        draw.text((5, 5), "ORIGINAL", fill='red')
        draw.text((w + 5, 5), "NEW RENDER", fill='red')
        draw.text((5, h + 5), "BLEND MASK", fill='red')
        draw.text((w + 5, h + 5), "RESULT", fill='green')
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
    Smart blending that chooses the best strategy based on opening type.
    
    - Doors: Surgical blend (only door region)
    - Windows with lighting: Full render with histogram matching
    - Sliding/French doors: Hybrid (larger blend region)
    
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
    print(f"[SMART_BLEND] Strategy for {opening_type}, job={job_id}")
    
    # Determine blending strategy
    if opening_type in ["window", "picture_window", "bay_window"]:
        # Windows affect lighting - use full render with histogram matching
        # to prevent color drift while allowing lighting changes
        print(f"[SMART_BLEND] Using window strategy: histogram match + 100px region")
        matched = histogram_match(new_image, original_image)
        
        # Debug: Save histogram matched image
        if DEBUG_BLEND and job_id:
            matched_img = Image.open(io.BytesIO(matched))
            _save_debug_image(matched_img, "02b_histogram_matched", job_id)
        
        # Blend with higher weight on new image in window region
        return surgical_blend(
            original_image,
            matched,
            opening,
            modified_svg,
            padding_px=100,  # Larger region for windows
            feather_radius=40,
            job_id=job_id,
        )
    
    elif opening_type in ["sliding_door", "french_door"]:
        # Glass doors - larger blend region but still surgical
        print(f"[SMART_BLEND] Using glass door strategy: 80px region")
        return surgical_blend(
            original_image,
            new_image,
            opening,
            modified_svg,
            padding_px=80,
            feather_radius=30,
            job_id=job_id,
        )
    
    else:
        # Interior/exterior doors - tight surgical blend
        print(f"[SMART_BLEND] Using door strategy: 50px region")
        return surgical_blend(
            original_image,
            new_image,
            opening,
            modified_svg,
            padding_px=50,
            feather_radius=20,
            job_id=job_id,
        )


