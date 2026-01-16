"""
Standardized color palette for room type detection.
These colors are used when generating floor plans via the nanobana API
and for segmentation analysis.
"""

from dataclasses import dataclass
from typing import Dict, Tuple
import numpy as np


@dataclass
class RoomColor:
    """Defines a room type with its associated color."""
    name: str
    hex_color: str
    rgb: Tuple[int, int, int]
    hsv_lower: Tuple[int, int, int]  # Lower bound for HSV detection
    hsv_upper: Tuple[int, int, int]  # Upper bound for HSV detection


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def rgb_to_hsv_range(rgb: Tuple[int, int, int], tolerance: int = 15) -> Tuple[Tuple[int, int, int], Tuple[int, int, int]]:
    """
    Convert RGB to HSV range with tolerance for detection.
    OpenCV uses H: 0-179, S: 0-255, V: 0-255
    """
    # Convert to numpy array and normalize
    rgb_normalized = np.array([[rgb]], dtype=np.uint8)
    
    # We'll compute approximate HSV values
    r, g, b = rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0
    max_c = max(r, g, b)
    min_c = min(r, g, b)
    diff = max_c - min_c
    
    # Hue calculation
    if diff == 0:
        h = 0
    elif max_c == r:
        h = (60 * ((g - b) / diff) + 360) % 360
    elif max_c == g:
        h = (60 * ((b - r) / diff) + 120) % 360
    else:
        h = (60 * ((r - g) / diff) + 240) % 360
    
    # Saturation
    s = 0 if max_c == 0 else (diff / max_c) * 255
    
    # Value
    v = max_c * 255
    
    # Convert to OpenCV scale (H: 0-179)
    h_cv = int(h / 2)
    s_cv = int(s)
    v_cv = int(v)
    
    # Create range with tolerance
    h_tol = tolerance
    s_tol = 50
    v_tol = 50
    
    lower = (
        max(0, h_cv - h_tol),
        max(0, s_cv - s_tol),
        max(0, v_cv - v_tol)
    )
    upper = (
        min(179, h_cv + h_tol),
        min(255, s_cv + s_tol),
        min(255, v_cv + v_tol)
    )
    
    return lower, upper


# Standard room color definitions
ROOM_COLORS_HEX: Dict[str, str] = {
    "living": "#A8D5E5",      # Light blue
    "bedroom": "#E6E6FA",     # Lavender
    "bathroom": "#98FB98",    # Mint green
    "kitchen": "#FF7F50",     # Coral
    "circulation": "#F5F5F5", # Light gray
    "storage": "#DEB887",     # Burlywood
    "outdoor": "#90EE90",     # Light green
    "dining": "#FFE4B5",      # Moccasin
    "office": "#B0C4DE",      # Light steel blue
    "garage": "#C0C0C0",      # Silver
}


def create_room_colors() -> Dict[str, RoomColor]:
    """Create RoomColor objects with HSV detection ranges."""
    room_colors = {}
    
    for name, hex_color in ROOM_COLORS_HEX.items():
        rgb = hex_to_rgb(hex_color)
        hsv_lower, hsv_upper = rgb_to_hsv_range(rgb)
        
        room_colors[name] = RoomColor(
            name=name,
            hex_color=hex_color,
            rgb=rgb,
            hsv_lower=hsv_lower,
            hsv_upper=hsv_upper
        )
    
    return room_colors


# Pre-computed room colors
ROOM_COLORS = create_room_colors()


def get_room_type_by_color(hsv_value: Tuple[int, int, int]) -> str:
    """
    Determine room type based on HSV color value.
    Returns 'unknown' if no match found.
    """
    h, s, v = hsv_value
    
    for room_type, room_color in ROOM_COLORS.items():
        lower = room_color.hsv_lower
        upper = room_color.hsv_upper
        
        if (lower[0] <= h <= upper[0] and
            lower[1] <= s <= upper[1] and
            lower[2] <= v <= upper[2]):
            return room_type
    
    return "unknown"


# Wall detection parameters
WALL_COLOR_LOWER = (0, 0, 0)      # Black walls
WALL_COLOR_UPPER = (180, 255, 50)  # Dark threshold

# Background detection
BACKGROUND_LOWER = (0, 0, 240)    # Near white
BACKGROUND_UPPER = (180, 20, 255)  # White








