"""
Surgical Blending for Floor Plan Openings

This module provides image blending utilities for door/window editing:
- For doors: Blend only the door region to prevent "drift" in unrelated areas
- For windows: Use full new render (lighting changes are intentional)

Uses PIL/Pillow for image manipulation.
"""

import io
import re
from typing import Dict, Any, Tuple, Optional
from PIL import Image, ImageFilter, ImageDraw
import numpy as np


def surgical_blend(
    original_image: bytes,
    new_image: bytes,
    opening: Dict[str, Any],
    modified_svg: str,
    padding_px: int = 50,
    feather_radius: int = 20,
) -> bytes:
    """
    Surgically blend a new render with the original, only applying changes
    in the region around the opening.
    
    This prevents "drift" where unrelated parts of the floor plan change
    during re-rendering.
    
    Args:
        original_image: Original rendered PNG bytes
        new_image: New rendered PNG bytes (with opening)
        opening: Opening specification dict
        modified_svg: SVG with the opening (used to calculate region)
        padding_px: Padding around the opening region (in PNG pixels)
        feather_radius: Radius for feathered blending edge
        
    Returns:
        Blended PNG image bytes
    """
    # Load images
    original = Image.open(io.BytesIO(original_image)).convert('RGBA')
    new = Image.open(io.BytesIO(new_image)).convert('RGBA')
    
    # Ensure same size
    if original.size != new.size:
        new = new.resize(original.size, Image.Resampling.LANCZOS)
    
    width, height = original.size
    
    # Calculate the blend region based on opening position
    # For now, use a simple approach: blend a region around the center
    # In production, this would use the actual wall position from SVG
    
    opening_width_inches = opening.get("width_inches", 36)
    position_on_wall = opening.get("position_on_wall", 0.5)
    
    # Estimate region size (opening width + padding)
    # SVG scale: 1px = 2 inches, PNG is typically 4x scaled
    svg_to_png_scale = 4  # Approximate scale factor
    region_width = int((opening_width_inches / 2) * svg_to_png_scale + padding_px * 2)
    region_height = region_width  # Square region for simplicity
    
    # Try to extract viewBox to estimate position
    viewbox = _parse_viewbox(modified_svg)
    if viewbox:
        # Map position to PNG coordinates (approximate)
        # This is a simplified calculation - actual implementation would
        # use the wall segment data
        center_x = int(width * position_on_wall)
        center_y = int(height * 0.5)  # Default to center height
    else:
        # Fallback: center of image
        center_x = width // 2
        center_y = height // 2
    
    # Calculate blend region bounds
    x1 = max(0, center_x - region_width // 2)
    y1 = max(0, center_y - region_height // 2)
    x2 = min(width, center_x + region_width // 2)
    y2 = min(height, center_y + region_height // 2)
    
    # Create feathered mask
    mask = _create_feathered_mask(
        width, height,
        x1, y1, x2, y2,
        feather_radius
    )
    
    # Composite images using mask
    result = Image.composite(new, original, mask)
    
    # Convert back to bytes
    output = io.BytesIO()
    result.convert('RGB').save(output, format='PNG', optimize=True)
    return output.getvalue()


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
        
    Returns:
        Blended PNG image bytes
    """
    opening_type = opening.get("type", "interior_door")
    
    # Determine blending strategy
    if opening_type in ["window", "picture_window", "bay_window"]:
        # Windows affect lighting - use full render with histogram matching
        # to prevent color drift while allowing lighting changes
        matched = histogram_match(new_image, original_image)
        
        # Blend with higher weight on new image in window region
        return surgical_blend(
            original_image,
            matched,
            opening,
            modified_svg,
            padding_px=100,  # Larger region for windows
            feather_radius=40,
        )
    
    elif opening_type in ["sliding_door", "french_door"]:
        # Glass doors - larger blend region but still surgical
        return surgical_blend(
            original_image,
            new_image,
            opening,
            modified_svg,
            padding_px=80,
            feather_radius=30,
        )
    
    else:
        # Interior/exterior doors - tight surgical blend
        return surgical_blend(
            original_image,
            new_image,
            opening,
            modified_svg,
            padding_px=50,
            feather_radius=20,
        )


