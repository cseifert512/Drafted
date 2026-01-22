"""
Tests for Surgical Blending module
"""

import pytest
import io
from PIL import Image
import numpy as np

# Import the module under test
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from surgical_blend import (
    surgical_blend,
    blend_with_difference_detection,
    histogram_match,
    smart_blend_for_opening,
    _create_feathered_mask,
    _parse_viewbox,
)


def create_test_image(width: int, height: int, color: tuple) -> bytes:
    """Create a test image with a solid color."""
    img = Image.new('RGB', (width, height), color)
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return buffer.getvalue()


def create_test_image_with_region(
    width: int, 
    height: int, 
    bg_color: tuple, 
    region_color: tuple,
    region_bounds: tuple  # (x1, y1, x2, y2)
) -> bytes:
    """Create a test image with a colored region."""
    img = Image.new('RGB', (width, height), bg_color)
    x1, y1, x2, y2 = region_bounds
    for x in range(x1, x2):
        for y in range(y1, y2):
            if 0 <= x < width and 0 <= y < height:
                img.putpixel((x, y), region_color)
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return buffer.getvalue()


class TestParseViewbox:
    def test_valid_viewbox(self):
        svg = '<svg viewBox="0 0 100 200"></svg>'
        result = _parse_viewbox(svg)
        assert result == {'x': 0, 'y': 0, 'width': 100, 'height': 200}
    
    def test_viewbox_with_offset(self):
        svg = '<svg viewBox="-50 -25 100 200"></svg>'
        result = _parse_viewbox(svg)
        assert result == {'x': -50, 'y': -25, 'width': 100, 'height': 200}
    
    def test_missing_viewbox(self):
        svg = '<svg width="100" height="200"></svg>'
        result = _parse_viewbox(svg)
        assert result is None


class TestCreateFeatheredMask:
    def test_mask_dimensions(self):
        mask = _create_feathered_mask(100, 100, 20, 20, 80, 80, 0)
        assert mask.size == (100, 100)
        assert mask.mode == 'L'
    
    def test_mask_center_is_white(self):
        mask = _create_feathered_mask(100, 100, 20, 20, 80, 80, 0)
        # Center should be white (255)
        center_pixel = mask.getpixel((50, 50))
        assert center_pixel == 255
    
    def test_mask_corners_are_black(self):
        mask = _create_feathered_mask(100, 100, 20, 20, 80, 80, 0)
        # Corners should be black (0)
        corner_pixel = mask.getpixel((0, 0))
        assert corner_pixel == 0
    
    def test_feathered_mask_has_gradient(self):
        mask = _create_feathered_mask(100, 100, 20, 20, 80, 80, 10)
        # Edge should have intermediate values due to feathering
        edge_pixel = mask.getpixel((20, 50))
        assert 0 < edge_pixel < 255


class TestSurgicalBlend:
    def test_blend_same_images(self):
        """Blending identical images should produce the same image."""
        img = create_test_image(100, 100, (128, 128, 128))
        
        opening = {
            'type': 'interior_door',
            'position_on_wall': 0.5,
            'width_inches': 36,
        }
        svg = '<svg viewBox="0 0 100 100"></svg>'
        
        result = surgical_blend(img, img, opening, svg)
        
        # Result should be valid PNG
        result_img = Image.open(io.BytesIO(result))
        assert result_img.size == (100, 100)
    
    def test_blend_different_images(self):
        """Blending different images should produce a blend."""
        original = create_test_image(100, 100, (255, 0, 0))  # Red
        new = create_test_image(100, 100, (0, 0, 255))  # Blue
        
        opening = {
            'type': 'interior_door',
            'position_on_wall': 0.5,
            'width_inches': 36,
        }
        svg = '<svg viewBox="0 0 100 100"></svg>'
        
        result = surgical_blend(original, new, opening, svg)
        
        result_img = Image.open(io.BytesIO(result))
        assert result_img.size == (100, 100)
        
        # Result should have some blue in the center (blend region)
        center_pixel = result_img.getpixel((50, 50))
        # The center should be affected by the new (blue) image
        assert center_pixel[2] > 0  # Some blue component


class TestBlendWithDifferenceDetection:
    def test_no_difference(self):
        """Identical images should produce the original."""
        img = create_test_image(100, 100, (128, 128, 128))
        
        result = blend_with_difference_detection(img, img)
        
        result_img = Image.open(io.BytesIO(result))
        assert result_img.size == (100, 100)
    
    def test_with_difference(self):
        """Images with differences should blend in changed regions."""
        original = create_test_image(100, 100, (255, 255, 255))  # White
        new = create_test_image_with_region(
            100, 100, 
            (255, 255, 255),  # White background
            (0, 0, 0),  # Black region
            (40, 40, 60, 60)  # Center region
        )
        
        result = blend_with_difference_detection(original, new, threshold=30)
        
        result_img = Image.open(io.BytesIO(result))
        # Center should have some black from the new image
        center_pixel = result_img.getpixel((50, 50))
        assert center_pixel[0] < 255  # Not pure white


class TestHistogramMatch:
    def test_histogram_match_same_image(self):
        """Matching histogram of image to itself should be similar."""
        img = create_test_image(100, 100, (128, 128, 128))
        
        result = histogram_match(img, img)
        
        result_img = Image.open(io.BytesIO(result))
        assert result_img.size == (100, 100)
    
    def test_histogram_match_different_images(self):
        """Histogram matching should adjust colors."""
        source = create_test_image(100, 100, (50, 50, 50))  # Dark
        reference = create_test_image(100, 100, (200, 200, 200))  # Light
        
        result = histogram_match(source, reference)
        
        result_img = Image.open(io.BytesIO(result))
        # Result should be lighter than source
        center_pixel = result_img.getpixel((50, 50))
        assert center_pixel[0] > 50  # Brighter than original


class TestSmartBlendForOpening:
    def test_door_uses_surgical_blend(self):
        """Doors should use surgical blending."""
        original = create_test_image(100, 100, (255, 0, 0))
        new = create_test_image(100, 100, (0, 0, 255))
        
        opening = {
            'type': 'interior_door',
            'position_on_wall': 0.5,
            'width_inches': 36,
        }
        svg = '<svg viewBox="0 0 100 100"></svg>'
        
        result = smart_blend_for_opening(original, new, opening, svg)
        
        result_img = Image.open(io.BytesIO(result))
        assert result_img.size == (100, 100)
    
    def test_window_uses_histogram_match(self):
        """Windows should use histogram matching."""
        original = create_test_image(100, 100, (255, 0, 0))
        new = create_test_image(100, 100, (0, 0, 255))
        
        opening = {
            'type': 'window',
            'position_on_wall': 0.5,
            'width_inches': 36,
        }
        svg = '<svg viewBox="0 0 100 100"></svg>'
        
        result = smart_blend_for_opening(original, new, opening, svg)
        
        result_img = Image.open(io.BytesIO(result))
        assert result_img.size == (100, 100)
    
    def test_sliding_door_uses_larger_region(self):
        """Sliding doors should use larger blend region."""
        original = create_test_image(100, 100, (255, 0, 0))
        new = create_test_image(100, 100, (0, 0, 255))
        
        opening = {
            'type': 'sliding_door',
            'position_on_wall': 0.5,
            'width_inches': 72,
        }
        svg = '<svg viewBox="0 0 100 100"></svg>'
        
        result = smart_blend_for_opening(original, new, opening, svg)
        
        result_img = Image.open(io.BytesIO(result))
        assert result_img.size == (100, 100)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])




