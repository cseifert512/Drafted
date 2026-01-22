"""
Generation Validation for Floor Plan Edits

This module validates Gemini's output to detect hallucinations and reject bad generations.
It runs AFTER Gemini returns but BEFORE compositing, allowing for automatic retry.

CURRENT CHECKS:
1. RED MARKER RESIDUE - The red edit marker should be completely replaced by Gemini.
   If red pixels remain in the output bbox, the generation failed.
   
2. ARTIFACT LEAKAGE - Content should not appear outside the edit region.
   If originally-white pixels (background) become non-white outside the bbox,
   Gemini hallucinated content where it shouldn't (% of white pixels).

3. OVERSIZED GENERATION - The generated element shouldn't be much larger than requested.
   If the area of changed pixels outside the bbox exceeds 200% of the bbox area,
   Gemini generated something way too big (e.g., huge window when small one requested).

EXTENSIBILITY:
Add new check functions following the pattern:
    def _check_xxx(original, output, bbox, **kwargs) -> Dict[str, Any]
    Returns: {"passed": bool, "metric_name": value, ...}
    
Then add the check to validate_generation() with appropriate threshold handling.

THRESHOLDS:
All thresholds are defined as module-level constants for easy tuning.
Adjust based on observed false positives/negatives.
"""

import io
from typing import Dict, Any, Optional, List, Tuple
from PIL import Image
import numpy as np


# =============================================================================
# CONFIGURATION - Tune these thresholds based on observed failures
# =============================================================================

# --- Red Marker Detection ---
# The marker is solid red (255, 0, 0) with semi-transparent fill
# We look for pixels with high red, low green, low blue
RED_R_MIN = 200       # Red channel minimum
RED_G_MAX = 80        # Green channel maximum  
RED_B_MAX = 80        # Blue channel maximum
RED_PIXEL_THRESHOLD_PCT = 0.5  # If >0.5% of bbox pixels are red, reject

# --- Artifact / Change Detection ---
# We check if ANY pixels outside the bbox changed significantly.
# A pixel "changed significantly" if any RGB channel changed by > this threshold.
# This allows subtle lighting shifts but catches actual content appearing.
SIGNIFICANT_CHANGE_THRESHOLD = 50  # Any channel must change by >50 to count

# --- Artifact / Contamination Detection ---
# If more than this % of pixels outside the bbox changed, reject
CONTAMINATION_THRESHOLD_PCT = 0.5  # If >0.5% of outside pixels changed, reject

# --- Oversized Generation Detection ---
# If Gemini generates a window/door much larger than requested, we detect it by
# comparing the area of changed pixels (outside bbox) to the bbox area itself.
# If changes outside bbox > X% of bbox area, the generation is oversized.
OVERSIZED_AREA_THRESHOLD_PCT = 200.0  # If changes outside bbox > 200% of bbox area, reject

# --- Debug Mode ---
# Set to True to save debug visualizations of validation failures
DEBUG_VALIDATION = True


# =============================================================================
# VALIDATION RESULT
# =============================================================================

class ValidationResult:
    """
    Result of generation validation.
    
    Attributes:
        is_valid: Whether the generation passed all checks
        rejection_reason: Human-readable reason if rejected (None if valid)
        metrics: Dict of all computed metrics for debugging/logging
        failed_check: Name of the check that failed (None if valid)
    """
    
    def __init__(
        self,
        is_valid: bool,
        rejection_reason: Optional[str] = None,
        metrics: Optional[Dict[str, Any]] = None,
        failed_check: Optional[str] = None,
    ):
        self.is_valid = is_valid
        self.rejection_reason = rejection_reason
        self.metrics = metrics or {}
        self.failed_check = failed_check

    def __repr__(self):
        if self.is_valid:
            return f"ValidationResult(valid=True, metrics={self.metrics})"
        return f"ValidationResult(valid=False, reason='{self.rejection_reason}', metrics={self.metrics})"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "is_valid": self.is_valid,
            "rejection_reason": self.rejection_reason,
            "metrics": self.metrics,
            "failed_check": self.failed_check,
        }


# =============================================================================
# MAIN VALIDATION FUNCTION
# =============================================================================

def validate_generation(
    original_png: bytes,
    gemini_output_png: bytes,
    bbox: Dict[str, int],
    opening_type: str = "unknown",
    job_id: str = "",
) -> ValidationResult:
    """
    Validate Gemini's generation output for hallucinations.
    
    This is the main entry point. It runs all validation checks and returns
    the first failure encountered, or success if all checks pass.
    
    Args:
        original_png: The original floor plan PNG BEFORE annotation (clean image)
        gemini_output_png: Gemini's raw output PNG
        bbox: Bounding box dict with x1, y1, x2, y2 defining the edit region
        opening_type: Type of opening being placed (for logging context)
        job_id: Job identifier for debug output
        
    Returns:
        ValidationResult with is_valid flag and rejection details if invalid
    """
    print(f"[VALIDATION] Starting validation for {opening_type} (job: {job_id})")
    
    # Load images
    try:
        original = Image.open(io.BytesIO(original_png)).convert('RGB')
        output = Image.open(io.BytesIO(gemini_output_png)).convert('RGB')
    except Exception as e:
        return ValidationResult(
            is_valid=False,
            rejection_reason=f"Failed to load images: {e}",
            failed_check="image_load",
        )
    
    # Ensure same dimensions (resize output if needed)
    if output.size != original.size:
        print(f"[VALIDATION] Resizing output from {output.size} to {original.size}")
        output = output.resize(original.size, Image.Resampling.LANCZOS)
    
    # Collect all metrics
    metrics = {
        "image_size": original.size,
        "bbox": bbox,
        "opening_type": opening_type,
    }
    
    # -------------------------------------------------------------------------
    # CHECK 1: Red marker residue in the edit bbox
    # The red box annotation should be completely replaced by Gemini
    # -------------------------------------------------------------------------
    print(f"[VALIDATION] Check 1: Red marker residue...")
    red_check = _check_red_residue(output, bbox)
    metrics["red_pixel_pct"] = red_check["red_pct"]
    metrics["red_pixel_count"] = red_check["red_pixels"]
    
    if not red_check["passed"]:
        reason = (
            f"Red marker residue detected: {red_check['red_pct']:.2f}% of bbox pixels "
            f"are red ({red_check['red_pixels']:,} pixels). "
            f"Gemini failed to replace the edit marker."
        )
        print(f"[VALIDATION] FAILED: {reason}")
        
        # Save debug visualization if enabled
        if DEBUG_VALIDATION and job_id:
            _save_validation_debug(output, bbox, "red_residue", job_id, red_check)
        
        return ValidationResult(
            is_valid=False,
            rejection_reason=reason,
            metrics=metrics,
            failed_check="red_residue",
        )
    
    print(f"[VALIDATION] Check 1 PASSED: {red_check['red_pct']:.3f}% red pixels (threshold: {RED_PIXEL_THRESHOLD_PCT}%)")
    
    # -------------------------------------------------------------------------
    # CHECK 2: Artifact leakage outside the edit region
    # White background pixels outside bbox should remain white
    # -------------------------------------------------------------------------
    print(f"[VALIDATION] Check 2: Artifact leakage outside bbox...")
    artifact_check = _check_artifact_leakage(original, output, bbox)
    metrics["white_contamination_pct"] = artifact_check["contamination_pct"]
    metrics["contaminated_pixel_count"] = artifact_check["contaminated_pixels"]
    metrics["total_white_outside_bbox"] = artifact_check["total_white_outside"]
    
    if not artifact_check["passed"]:
        reason = (
            f"Artifact leakage detected: {artifact_check['contamination_pct']:.2f}% of white pixels "
            f"outside bbox changed ({artifact_check['contaminated_pixels']:,} pixels). "
            f"Gemini added content outside the edit region."
        )
        print(f"[VALIDATION] FAILED: {reason}")
        
        # Save debug visualization if enabled
        if DEBUG_VALIDATION and job_id:
            _save_validation_debug(output, bbox, "artifact_leakage", job_id, artifact_check)
        
        return ValidationResult(
            is_valid=False,
            rejection_reason=reason,
            metrics=metrics,
            failed_check="artifact_leakage",
        )
    
    print(f"[VALIDATION] Check 2 PASSED: {artifact_check['contamination_pct']:.3f}% contamination (threshold: {CONTAMINATION_THRESHOLD_PCT}%)")
    
    # -------------------------------------------------------------------------
    # CHECK 3: Oversized generation detection
    # If changes outside bbox are much larger than the bbox itself,
    # Gemini generated something way too big (e.g., huge window when small one requested)
    # -------------------------------------------------------------------------
    print(f"[VALIDATION] Check 3: Oversized generation check...")
    oversized_check = _check_oversized_generation(original, output, bbox)
    metrics["change_area_vs_bbox_pct"] = oversized_check["area_ratio_pct"]
    metrics["changed_pixels_outside_bbox"] = oversized_check["changed_pixels"]
    metrics["bbox_area"] = oversized_check["bbox_area"]
    
    if not oversized_check["passed"]:
        reason = (
            f"Oversized generation detected: Changes outside bbox are {oversized_check['area_ratio_pct']:.1f}% "
            f"of bbox area ({oversized_check['changed_pixels']:,} changed pixels vs {oversized_check['bbox_area']:,} bbox pixels). "
            f"Gemini generated something much larger than requested (threshold: {OVERSIZED_AREA_THRESHOLD_PCT}%)."
        )
        print(f"[VALIDATION] FAILED: {reason}")
        
        # Save debug visualization if enabled
        if DEBUG_VALIDATION and job_id:
            _save_validation_debug(output, bbox, "oversized_generation", job_id, oversized_check)
        
        return ValidationResult(
            is_valid=False,
            rejection_reason=reason,
            metrics=metrics,
            failed_check="oversized_generation",
        )
    
    print(f"[VALIDATION] Check 3 PASSED: {oversized_check['area_ratio_pct']:.1f}% of bbox area (threshold: {OVERSIZED_AREA_THRESHOLD_PCT}%)")
    
    # -------------------------------------------------------------------------
    # All checks passed
    # -------------------------------------------------------------------------
    print(f"[VALIDATION] All checks PASSED for job {job_id}")
    
    return ValidationResult(
        is_valid=True,
        metrics=metrics,
    )


# =============================================================================
# INDIVIDUAL CHECK FUNCTIONS
# =============================================================================

def _check_red_residue(
    output_img: Image.Image,
    bbox: Dict[str, int],
) -> Dict[str, Any]:
    """
    Check if red marker pixels remain in the output within the bbox.
    
    The red marker is drawn with RGB approximately (255, 0, 0).
    We detect pixels with high red and low green/blue channels.
    
    Args:
        output_img: Gemini's output image (PIL Image, RGB mode)
        bbox: Bounding box dict with x1, y1, x2, y2
        
    Returns:
        Dict with:
            - passed: bool - whether the check passed
            - red_pct: float - percentage of bbox pixels that are red
            - red_pixels: int - count of red pixels
            - total_pixels: int - total pixels in bbox
    """
    # Extract bbox region
    x1 = max(0, int(bbox["x1"]))
    y1 = max(0, int(bbox["y1"]))
    x2 = min(output_img.width, int(bbox["x2"]))
    y2 = min(output_img.height, int(bbox["y2"]))
    
    region = output_img.crop((x1, y1, x2, y2))
    
    # Convert to numpy for analysis
    arr = np.array(region, dtype=np.float32)
    
    # Detect "marker red" pixels: high R, low G, low B
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    
    is_red = (r > RED_R_MIN) & (g < RED_G_MAX) & (b < RED_B_MAX)
    
    total_pixels = is_red.size
    red_pixels = int(np.sum(is_red))
    red_pct = (red_pixels / total_pixels) * 100 if total_pixels > 0 else 0.0
    
    return {
        "passed": red_pct < RED_PIXEL_THRESHOLD_PCT,
        "red_pct": red_pct,
        "red_pixels": red_pixels,
        "total_pixels": total_pixels,
    }


def _check_artifact_leakage(
    original_img: Image.Image,
    output_img: Image.Image,
    bbox: Dict[str, int],
) -> Dict[str, Any]:
    """
    Check if ANY pixels outside the bbox changed significantly.
    
    Simple and strict: if pixels outside the edit region changed substantially,
    reject the generation. Period.
    
    Args:
        original_img: Original floor plan (PIL Image, RGB mode)
        output_img: Gemini's output (PIL Image, RGB mode)
        bbox: Bounding box dict with x1, y1, x2, y2
        
    Returns:
        Dict with:
            - passed: bool - whether the check passed
            - changed_pixels: int - count of significantly changed pixels outside bbox
            - total_outside: int - total pixels outside bbox
            - change_pct: float - percentage of outside pixels that changed
    """
    # Convert to numpy
    original_arr = np.array(original_img, dtype=np.float32)
    output_arr = np.array(output_img, dtype=np.float32)
    
    h, w = original_arr.shape[:2]
    
    # Extract bbox coordinates (clamped to image bounds)
    x1 = max(0, int(bbox["x1"]))
    y1 = max(0, int(bbox["y1"]))
    x2 = min(w, int(bbox["x2"]))
    y2 = min(h, int(bbox["y2"]))
    
    # Create mask for OUTSIDE the bbox
    outside_mask = np.ones((h, w), dtype=bool)
    outside_mask[y1:y2, x1:x2] = False  # Exclude the bbox region
    
    total_outside = int(np.sum(outside_mask))
    
    if total_outside == 0:
        return {
            "passed": True,
            "changed_pixels": 0,
            "total_outside": 0,
            "change_pct": 0.0,
            "contamination_pct": 0.0,
            "total_white_outside": 0,
        }
    
    # Calculate per-pixel difference (max of RGB channel differences)
    diff = np.abs(original_arr - output_arr)
    max_diff = np.max(diff, axis=2)  # Max difference across R, G, B channels
    
    # A pixel "changed significantly" if any channel changed by > threshold
    significant_change = max_diff > SIGNIFICANT_CHANGE_THRESHOLD
    
    # Count pixels that changed significantly OUTSIDE the bbox
    changed_outside = significant_change & outside_mask
    changed_pixels = int(np.sum(changed_outside))
    
    # Calculate percentage
    change_pct = (changed_pixels / total_outside) * 100
    
    # STRICT: If more than threshold% of outside pixels changed, reject
    # This is very strict but prevents artifacts
    return {
        "passed": change_pct < CONTAMINATION_THRESHOLD_PCT,
        "changed_pixels": changed_pixels,
        "total_outside": total_outside,
        "change_pct": change_pct,
        # Legacy keys for compatibility
        "contamination_pct": change_pct,
        "contaminated_pixels": changed_pixels,
        "total_white_outside": total_outside,
    }


def _check_oversized_generation(
    original_img: Image.Image,
    output_img: Image.Image,
    bbox: Dict[str, int],
) -> Dict[str, Any]:
    """
    Check if Gemini generated something much larger than the intended edit area.
    
    This catches cases where a small window is requested but Gemini generates
    a huge one that extends far beyond the bbox. We compare the area of changed
    pixels (outside the bbox) to the bbox area itself.
    
    Logic:
    1. Calculate the bbox area (the intended edit region)
    2. Count ANY pixels that changed significantly OUTSIDE the bbox
    3. If changed_pixels > OVERSIZED_AREA_THRESHOLD_PCT of bbox_area, reject
    
    Args:
        original_img: Original floor plan (PIL Image, RGB mode)
        output_img: Gemini's output (PIL Image, RGB mode)
        bbox: Bounding box dict with x1, y1, x2, y2
        
    Returns:
        Dict with:
            - passed: bool - whether the check passed
            - area_ratio_pct: float - changed pixels as % of bbox area
            - changed_pixels: int - count of pixels changed outside bbox
            - bbox_area: int - area of the bbox in pixels
    """
    # Convert to numpy
    original_arr = np.array(original_img, dtype=np.float32)
    output_arr = np.array(output_img, dtype=np.float32)
    
    h, w = original_arr.shape[:2]
    
    # Extract bbox coordinates (clamped to image bounds)
    x1 = max(0, int(bbox["x1"]))
    y1 = max(0, int(bbox["y1"]))
    x2 = min(w, int(bbox["x2"]))
    y2 = min(h, int(bbox["y2"]))
    
    # Calculate bbox area
    bbox_area = (x2 - x1) * (y2 - y1)
    
    if bbox_area == 0:
        return {
            "passed": True,
            "area_ratio_pct": 0.0,
            "changed_pixels": 0,
            "bbox_area": 0,
        }
    
    # Create mask for OUTSIDE the bbox
    outside_mask = np.ones((h, w), dtype=bool)
    outside_mask[y1:y2, x1:x2] = False  # Exclude the bbox region
    
    # Calculate per-pixel difference (max of RGB channel differences)
    diff = np.abs(original_arr - output_arr)
    max_diff = np.max(diff, axis=2)  # Max difference across R, G, B channels
    
    # A pixel "changed significantly" if any channel changed by > threshold
    significant_change = max_diff > SIGNIFICANT_CHANGE_THRESHOLD
    
    # Pixels that changed significantly OUTSIDE bbox
    # (This represents the area of "extra" content Gemini added)
    changed_outside = outside_mask & significant_change
    changed_pixels = int(np.sum(changed_outside))
    
    # Compare to bbox area - what % of the bbox area is the extra content?
    area_ratio_pct = (changed_pixels / bbox_area) * 100
    
    return {
        "passed": area_ratio_pct < OVERSIZED_AREA_THRESHOLD_PCT,
        "area_ratio_pct": area_ratio_pct,
        "changed_pixels": changed_pixels,
        "bbox_area": bbox_area,
    }


# =============================================================================
# DEBUG VISUALIZATION
# =============================================================================

def _save_validation_debug(
    output_img: Image.Image,
    bbox: Dict[str, int],
    failure_type: str,
    job_id: str,
    check_result: Dict[str, Any],
) -> None:
    """
    Save debug visualization showing why validation failed.
    
    Args:
        output_img: The image that failed validation
        bbox: The edit bounding box
        failure_type: Type of failure ("red_residue" or "artifact_leakage")
        job_id: Job ID for file naming
        check_result: Results from the failed check
    """
    from pathlib import Path
    from PIL import ImageDraw
    
    debug_dir = Path(__file__).parent.parent.parent / "debug_blend" / job_id
    debug_dir.mkdir(parents=True, exist_ok=True)
    
    # Create annotated copy
    debug_img = output_img.copy()
    draw = ImageDraw.Draw(debug_img)
    
    # Draw bbox outline
    x1, y1, x2, y2 = bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]
    draw.rectangle([x1, y1, x2, y2], outline=(255, 255, 0), width=3)
    
    # Add failure info as text
    try:
        text = f"VALIDATION FAILED: {failure_type}"
        draw.text((10, 10), text, fill=(255, 0, 0))
    except Exception:
        pass  # Font issues shouldn't break validation
    
    # Save
    filename = f"99_validation_failed_{failure_type}.png"
    filepath = debug_dir / filename
    debug_img.save(filepath)
    print(f"[VALIDATION] Debug image saved: {filepath}")


# =============================================================================
# FUTURE CHECK STUBS - Implement as needed
# =============================================================================

def _check_dimension_mismatch(
    original_img: Image.Image,
    output_img: Image.Image,
) -> Dict[str, Any]:
    """
    Check if Gemini returned an image with wrong dimensions/aspect ratio.
    
    TODO: Implement if this becomes an issue.
    
    Returns:
        Dict with passed and dimension info
    """
    original_size = original_img.size
    output_size = output_img.size
    
    matched = original_size == output_size
    
    return {
        "passed": matched,  # Currently we resize, so this always passes after resize
        "original_size": original_size,
        "output_size": output_size,
    }


def _check_color_palette_shift(
    original_img: Image.Image,
    output_img: Image.Image,
    bbox: Dict[str, int],
) -> Dict[str, Any]:
    """
    Check if the overall color palette shifted significantly.
    
    TODO: Implement if Gemini starts changing the floor plan's color scheme.
    Could use histogram comparison or dominant color extraction.
    
    Returns:
        Dict with passed and color shift metrics
    """
    pass


def _check_structural_similarity(
    original_img: Image.Image,
    output_img: Image.Image,
    bbox: Dict[str, int],
) -> Dict[str, Any]:
    """
    Check if content outside bbox remained structurally similar.
    
    TODO: Implement using SSIM if more sophisticated comparison is needed.
    This would catch cases where furniture/walls are subtly altered.
    
    Returns:
        Dict with passed and SSIM score
    """
    pass

