"""
Gemini Flash 3.0 Staging Module for Photorealistic Floor Plan Rendering.

This module mirrors the approach from Drafted.ai's helpers.tts:
1. Parse SVG bounds from wall polygons
2. Calculate optimal aspect ratio (1:1, 4:3, 3:4, 16:9, 9:16)
3. Convert SVG to PNG with proper scaling and padding
4. Send to Gemini Flash 3.0 img2img for photorealistic rendering
5. Return the staged (rendered) image

SVG Scale: Input is 1px = 2 inches, output is 2px = 1 inch (4x scale)
Padding: 24px at input scale for breathing room
"""

import os
import re
import io
import base64
import asyncio
from typing import Optional, Dict, List, Tuple, Any
from dataclasses import dataclass
from PIL import Image
import httpx

# Try to import cairosvg for high-quality SVG to PNG conversion
try:
    import cairosvg
    # Test if Cairo library is actually available (use valid SVG with dimensions)
    cairosvg.svg2png(bytestring=b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')
    HAS_CAIROSVG = True
    print("[OK] cairosvg available with Cairo library")
except Exception as e:
    HAS_CAIROSVG = False
    print(f"[WARN] cairosvg not available: {e}")


# =============================================================================
# SVG PROCESSING CONSTANTS (from helpers.tts)
# =============================================================================

SVG_PADDING = 24  # Padding in SVG units (24px at 1px = 2 inches ≈ 4 feet)
SVG_SCALE_FACTOR = 4  # Scale factor: from 1px = 2 inches to 2px = 1 inch

# Standard aspect ratios (width:height) - best fit to minimize padding
ASPECT_RATIOS: Dict[str, Tuple[int, int]] = {
    "1:1": (1, 1),
    "4:3": (4, 3),
    "3:4": (3, 4),
    "16:9": (16, 9),
    "9:16": (9, 16),
}


# =============================================================================
# GEMINI CONFIG (from helpers.tts)
# =============================================================================

GEMINI_CONFIG = {
    # Use Gemini 3 Pro Image Preview for photorealistic rendering
    # This model supports image output via img2img transformation
    "model": "gemini-3-pro-image-preview",
    "temperature": 0.2,
    "top_k": 30,
    "top_p": 0.8,
}


# =============================================================================
# PROMPTS (from helpers.tts)
# =============================================================================

SYSTEM_PROMPT = """
You are an expert architectural rendering engine converting schematic floor plans into photorealistic, text-free, top-down visualizations.

###CRITICAL RENDERING RULES

1. PERSPECTIVE: Strictly 90-degree top-down orthographic. No isometry or tilt.
2. GEOMETRY & TRAFFIC LOCK:
 - The wall layout, windows, doors, openings are immutable constraints.
 - **Solid Black Wall Constraints:** Objects must never overlap the solid black wall lines from the input. Render walls as solid black cuts.
 - **Circulation Preservation:** You must identify all gaps in walls (doors/openings) and preserve a clear "walking path" through them.
 - Clearly outline floor edges.
 - **Do not generate staircases.** 
3. TEXT ANNIHILATION:
 - The input contains text labels. You must "paint over" these labels with the floor material of that specific room.
4. BACKGROUND: The canvas must be **RGB(255, 255, 255) Pure White**. No shadows or vignetting outside the floor plan.
5. OBJECT OUTLINES: All objects have gray outlines.
"""

BASE_PROMPT = """
Task: Render the provided image with the following instructions. Cover all text in the final output.

### Lighting
- Soft northern daylight, ambient occlusion shadows for depth, warm cozy atmosphere

### Staging and Materials
- All hallway, living spaces: lighter white oak floors
- Wood tables. vibrant coffee table books, wool rugs on lounge sets
- Bedroom: **Must preserve original doorways.**. white oak floor, white linen beds, tan rugs
[RoomSpecifics]

### FINAL POLISH
**Remove all cabinets or furniture that block doors or openings.**
**Ensure all bathrooms have exactly one toilet.**
**Ensure all bedrooms can be accessed.**
**Pure white background. Gray object outlines. Black walls. Cover ALL text labels.**
"""

# Room-specific prompts (keys must match canonical room keys)
ROOM_PROMPTS: Dict[str, str] = {
    "kitchen": "- Kitchen: White oak floor. Put white cabinets, white marble countertops and appliances against black walls only. **Leave all doorways and wall openings completely empty.**",
    "bathroom": "- Primary Bathroom & Bathrooms: Light blue-gray marble tile floor. **Only one toilet allowed per labeled bathroom.** Size and add vanity, tub/shower.",
    "primary_bathroom": "- Primary Bathroom & Bathrooms: Light blue-gray marble tile floor. **Only one toilet allowed per labeled bathroom.** Size and add vanity, tub/shower.",
    "laundry": "- Laundry: warm gray marble tile floor, cabinets, washer and dryer.",
    "dining": "- Dining: wood dining table and white chairs.",
    "primary_closet": "- Closets: White oak floor. Preserve original door. White shelves.",
    "closet": "- Closets: White oak floor. Preserve original door. White shelves.",
    "garage": "- Garage: Warm gray concrete flooring, add true to scale vehicles oriented to garage door.",
    "foyer": "- Foyer: add credenza against black walls only.",
    "front_porch": "- Front Porch: Light gray textured concrete. **Fill the exact polygon of the existing porch.**",
    "outdoor_living": "- Outdoor Living: light gray textured concrete floor, add outdoor furniture and plants.",
    "den": "- Den: bookcases, floor lamp, lounge set, dark tan rug.",
    "gym": "- Gym: dark rubber floor, add fitness equipment.",
    "office": "- Office: desk and plants.",
    "pool": "- Pool: light gray textured concrete floor, add pool and pool furniture.",
    "rec_room": "- Rec room: pool table, toys, or other recreational equipment.",
    "sunroom": "- Sunroom: rattan furniture and lots of plants.",
    "theater": "- Theater: tan carpet floor, projector screen, lounge set, indirect lighting.",
    "bar": "- Bar: bar counter, wine and furniture.",
}


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class StagingResult:
    """Result from floor plan staging."""
    success: bool
    staged_image: Optional[bytes] = None  # Photorealistic rendered image
    raw_png: Optional[bytes] = None  # Pre-processed PNG sent to Gemini
    cropped_svg: Optional[str] = None  # SVG with adjusted viewBox
    aspect_ratio: Optional[str] = None  # Best-fit aspect ratio used
    gemini_prompt: Optional[str] = None  # Full prompt sent to Gemini (system + user prompt)
    error: Optional[str] = None
    elapsed_seconds: float = 0


# =============================================================================
# SVG PARSING FUNCTIONS (from helpers.tts)
# =============================================================================

def parse_polygon_points(points_str: str) -> Optional[Dict[str, float]]:
    """
    Parse polyline/polygon points attribute and return bounds.
    Matches Python's parse_polyline_points() function from helpers.tts.
    Points format: "x1,y1 x2,y2 x3,y3 ..."
    """
    if not points_str:
        return None
    
    # Parse "x1,y1 x2,y2 x3,y3 ..." format
    coord_regex = re.compile(r'([+-]?[\d.]+)[,\s]+([+-]?[\d.]+)')
    xs = []
    ys = []
    
    for match in coord_regex.finditer(points_str):
        x, y = match.groups()
        if x is not None and y is not None:
            xs.append(float(x))
            ys.append(float(y))
    
    if not xs:
        return None
    
    return {
        "min_x": min(xs),
        "min_y": min(ys),
        "max_x": max(xs),
        "max_y": max(ys),
    }


def get_floorplan_bounds(svg: str) -> Optional[Dict[str, float]]:
    """
    Extract floorplan bounds from SVG by parsing polygon points.
    Matches helpers.tts get_floorplan_bounds_from_svg() function.
    
    Sources (in order of priority):
    1. #walls-exterior polyline/polygon
    2. ALL polygons with data-room-id attributes
    3. Fallback: #walls group polylines
    4. Final fallback: viewBox
    """
    all_bounds = []
    
    # Source 1: Look for #walls-exterior polyline/polygon
    walls_exterior_match = re.search(
        r'<g[^>]*id="walls-exterior"[^>]*>([\s\S]*?)</g>',
        svg, re.IGNORECASE
    )
    if walls_exterior_match:
        group_content = walls_exterior_match.group(1)
        for points_match in re.finditer(r'points="([^"]+)"', group_content):
            bounds = parse_polygon_points(points_match.group(1))
            if bounds:
                all_bounds.append(bounds)
    
    # Source 2: Look for ALL polygons with data-room-id
    # Pattern 1: data-room-id before points
    for match in re.finditer(
        r'<polygon[^>]*data-room-id="[^"]*"[^>]*points="([^"]+)"[^>]*/?>',
        svg
    ):
        bounds = parse_polygon_points(match.group(1))
        if bounds:
            all_bounds.append(bounds)
    
    # Pattern 2: points before data-room-id
    for match in re.finditer(
        r'<polygon[^>]*points="([^"]+)"[^>]*data-room-id="[^"]*"[^>]*/?>',
        svg
    ):
        bounds = parse_polygon_points(match.group(1))
        if bounds:
            all_bounds.append(bounds)
    
    # Combine all bounds found
    if all_bounds:
        return {
            "min_x": min(b["min_x"] for b in all_bounds),
            "min_y": min(b["min_y"] for b in all_bounds),
            "max_x": max(b["max_x"] for b in all_bounds),
            "max_y": max(b["max_y"] for b in all_bounds),
        }
    
    # Source 3: Fallback to #walls group
    walls_match = re.search(
        r'<g[^>]*id="walls"[^>]*>([\s\S]*?)</g>',
        svg, re.IGNORECASE
    )
    if walls_match:
        group_content = walls_match.group(1)
        for points_match in re.finditer(r'points="([^"]+)"', group_content):
            bounds = parse_polygon_points(points_match.group(1))
            if bounds:
                all_bounds.append(bounds)
        
        if all_bounds:
            return {
                "min_x": min(b["min_x"] for b in all_bounds),
                "min_y": min(b["min_y"] for b in all_bounds),
                "max_x": max(b["max_x"] for b in all_bounds),
                "max_y": max(b["max_y"] for b in all_bounds),
            }
    
    # Final fallback: parse viewBox
    viewbox_match = re.search(r'viewBox="([^"]+)"', svg)
    if viewbox_match:
        parts = viewbox_match.group(1).split()
        if len(parts) == 4:
            x, y, w, h = map(float, parts)
            return {
                "min_x": x,
                "min_y": y,
                "max_x": x + w,
                "max_y": y + h,
            }
    
    return None


def find_best_aspect_ratio(width: float, height: float) -> str:
    """
    Find the best aspect ratio that minimizes padding.
    Matches helpers.tts find_best_aspect_ratio() function.
    """
    if width <= 0 or height <= 0:
        return "1:1"
    
    content_ratio = width / height
    best_ratio = "1:1"
    best_score = float('inf')
    
    for name, (w, h) in ASPECT_RATIOS.items():
        target_ratio = w / h
        
        # Calculate how much padding would be needed
        if content_ratio > target_ratio:
            # Content is wider - will add vertical padding
            new_height = width / target_ratio
            padding_amount = (new_height - height) / height
        else:
            # Content is taller - will add horizontal padding
            new_width = height * target_ratio
            padding_amount = (new_width - width) / width
        
        # Score is just the padding amount (we want to minimize this)
        if padding_amount < best_score:
            best_score = padding_amount
            best_ratio = name
    
    return best_ratio


def calculate_output_dimensions(
    content_width: float,
    content_height: float,
    padding_px: int = SVG_PADDING
) -> Dict[str, Any]:
    """
    Calculate output dimensions with padding, fitted to best aspect ratio.
    Matches helpers.tts calculate_output_dimensions() function.
    """
    # Add padding to content
    padded_width = content_width + padding_px * 2
    padded_height = content_height + padding_px * 2
    
    # Find best aspect ratio
    aspect_ratio = find_best_aspect_ratio(padded_width, padded_height)
    target_w, target_h = ASPECT_RATIOS[aspect_ratio]
    target_ratio = target_w / target_h
    
    # Calculate new dimensions to fit content in chosen aspect ratio
    current_ratio = padded_width / padded_height
    
    if current_ratio > target_ratio:
        # Content is wider than target - fit to width, add vertical space
        new_width = padded_width
        new_height = padded_width / target_ratio
    else:
        # Content is taller than target - fit to height, add horizontal space
        new_height = padded_height
        new_width = padded_height * target_ratio
    
    return {
        "new_width": new_width,
        "new_height": new_height,
        "aspect_ratio": aspect_ratio,
    }


# =============================================================================
# SVG TO PNG CONVERSION
# =============================================================================

def preprocess_svg(svg: str) -> str:
    """
    Pre-process SVG for Gemini rendering.
    - Ensure proper stroke widths for thick black walls
    - Preserve all original labels, colors, doors, windows
    """
    processed = svg
    
    # Ensure walls have proper stroke-width for thick black walls
    # The SVG from the generator should already have this, but we ensure it
    
    # Add stroke-width to elements that have stroke="black" but no stroke-width
    if 'stroke="black"' in processed:
        # Only add stroke-width if not already present on the same element
        # This regex finds stroke="black" NOT followed by stroke-width within the same tag
        processed = re.sub(
            r'(<[^>]*stroke="black")(?![^>]*stroke-width)([^>]*>)',
            r'\1 stroke-width="4"\2',
            processed
        )
    
    # Ensure minimum stroke-width of 3 for walls (for visibility)
    # Replace stroke-width values less than 3 with 3 for black strokes
    def ensure_min_stroke_width(match):
        element = match.group(0)
        if 'stroke="black"' in element or "stroke='black'" in element:
            sw_match = re.search(r'stroke-width="([^"]+)"', element)
            if sw_match:
                try:
                    sw = float(sw_match.group(1))
                    if sw < 3:
                        element = element.replace(f'stroke-width="{sw_match.group(1)}"', 'stroke-width="4"')
                except ValueError:
                    pass
        return element
    
    # Apply to polygons, polylines, lines, paths, and rects
    processed = re.sub(r'<(?:polygon|polyline|line|path|rect)[^>]*>', ensure_min_stroke_width, processed)
    
    # NOTE: The SVG from the generator already has correct room labels (e.g., "Primary Bedroom", 
    # "Kitchen", etc.) - we preserve these as-is, DO NOT remove or regenerate them!
    
    return processed


# Color-to-room-type mapping based on SVG fill colors
# These match the training colors used in floor plan generation
COLOR_TO_ROOM_TYPE: Dict[str, str] = {
    # Primary suite
    'f4a460': 'Primary Bedroom',
    'ffd700': 'Primary Bathroom', 
    'daa520': 'Primary Closet',
    # Bedrooms & baths
    'ff8c00': 'Bedroom',
    'ff69b4': 'Bathroom',
    # Living spaces  
    '87ceeb': 'Living Room',
    'add8e6': 'Family Room',
    'b0e0e6': 'Den',
    'a8d5e5': 'Living Room',  # Light blue variant
    # Kitchen & dining
    '98fb98': 'Kitchen',
    '90ee90': 'Kitchen',
    'ff7f50': 'Kitchen',  # Coral/orange kitchen
    'dda0dd': 'Dining Room',
    'ee82ee': 'Nook',
    'e6e6fa': 'Bedroom',  # Lavender bedroom
    # Utility
    'd3d3d3': 'Laundry',
    'c0c0c0': 'Garage',
    'a9a9a9': 'Storage',
    'bc8f8f': 'Mudroom',
    # Flex spaces
    'f0e68c': 'Office',
    'fafad2': 'Rec Room',
    'ffe4c4': 'Theater',
    'ffdead': 'Gym',
    'ffe4b5': 'Foyer',
    # Outdoor
    '7cfc00': 'Outdoor Living',
    '9acd32': 'Front Porch',
    '00ced1': 'Pool',
    '40e0d0': 'Sunroom',
    # Pantry & bar
    'deb887': 'Pantry',
    'f5deb3': 'Bar',
}


def get_room_type_from_fill(fill: str) -> Optional[str]:
    """Get room type from fill color using color mapping."""
    if not fill:
        return None
    
    # Normalize: remove # and lowercase
    normalized = fill.lower().lstrip('#')
    
    # Direct match
    if normalized in COLOR_TO_ROOM_TYPE:
        return COLOR_TO_ROOM_TYPE[normalized]
    
    # Try fuzzy matching for close colors
    try:
        r = int(normalized[0:2], 16)
        g = int(normalized[2:4], 16)
        b = int(normalized[4:6], 16)
    except (ValueError, IndexError):
        return None
    
    best_match = None
    best_dist = 100  # Max color distance threshold
    
    for color_hex, room_type in COLOR_TO_ROOM_TYPE.items():
        try:
            cr = int(color_hex[0:2], 16)
            cg = int(color_hex[2:4], 16)
            cb = int(color_hex[4:6], 16)
        except (ValueError, IndexError):
            continue
        
        # Euclidean distance in RGB space
        dist = ((r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2) ** 0.5
        if dist < best_dist:
            best_dist = dist
            best_match = room_type
    
    return best_match


def remove_existing_text_labels(svg: str) -> str:
    """
    Remove existing text labels from SVG.
    The original SVG from the generator has generic labels like 'R001', 'R002'.
    We remove these so we can add proper room type labels.
    """
    import re
    
    cleaned = svg
    
    # Pattern 1: Simple <text>R001</text> with possible whitespace
    cleaned = re.sub(r'<text[^>]*>\s*R\d+\s*</text>', '', cleaned, flags=re.IGNORECASE)
    
    # Pattern 2: <text> with <tspan> inside: <text><tspan>R001</tspan></text>
    cleaned = re.sub(r'<text[^>]*>\s*<tspan[^>]*>\s*R\d+\s*</tspan>\s*</text>', '', cleaned, flags=re.IGNORECASE)
    
    # Pattern 3: Any <text> element whose content is ONLY "R" followed by digits (multi-line)
    cleaned = re.sub(r'<text[^>]*>[\s\n]*R\d{1,4}[\s\n]*</text>', '', cleaned, flags=re.IGNORECASE)
    
    # Pattern 4: Remove ALL text elements that contain R followed by 2-4 digits anywhere
    cleaned = re.sub(r'<text\b[^>]*>[^<]*\bR\d{2,4}\b[^<]*</text>', '', cleaned, flags=re.IGNORECASE)
    
    # Pattern 5: Remove text elements inside any group with "label" or "text" in id/class
    cleaned = re.sub(r'<g[^>]*(?:id|class)="[^"]*(?:label|text|room)[^"]*"[^>]*>[\s\S]*?</g>', '', cleaned, flags=re.IGNORECASE)
    
    # Pattern 6: Remove any standalone tspan with R001 pattern
    cleaned = re.sub(r'<tspan[^>]*>\s*R\d+\s*</tspan>', '', cleaned, flags=re.IGNORECASE)
    
    # Clean up empty groups and text elements
    cleaned = re.sub(r'<g[^>]*>\s*</g>', '', cleaned)
    cleaned = re.sub(r'<text[^>]*>\s*</text>', '', cleaned)
    
    # Log what we removed for debugging
    original_text_count = len(re.findall(r'<text', svg, re.IGNORECASE))
    cleaned_text_count = len(re.findall(r'<text', cleaned, re.IGNORECASE))
    print(f"[remove_existing_text_labels] Removed {original_text_count - cleaned_text_count} text elements")
    
    return cleaned


def add_room_labels_to_svg(svg: str) -> str:
    """
    Add text labels to each room in the SVG.
    This helps Gemini identify room types and render appropriate furniture/materials.
    
    IMPORTANT: First REMOVES existing generic labels (R001, R002, etc.)!
    
    Labels are determined by:
    1. data-room-type attribute (if present)
    2. Fill color mapping (most reliable)
    3. data-room-id (skipped if generic like R001)
    
    Labels are added at the centroid of each room polygon.
    """
    import re
    
    # First, remove existing generic text labels
    processed_svg = remove_existing_text_labels(svg)
    
    room_polygons = []
    
    # Pattern to match room polygons with their attributes
    polygon_pattern = re.compile(
        r'<polygon([^>]*)points="([^"]+)"([^>]*)/?>'
    )
    
    for match in polygon_pattern.finditer(processed_svg):
        attrs_before = match.group(1)
        points_str = match.group(2)
        attrs_after = match.group(3)
        full_attrs = attrs_before + attrs_after
        
        # Extract fill color
        fill_match = re.search(r'fill="([^"]+)"', full_attrs)
        fill = fill_match.group(1) if fill_match else None
        
        # Skip walls and non-room polygons
        if fill and fill.lower() in ('none', '#ffffff', 'white', '#000000', 'black'):
            continue
        
        # Determine room name (priority: data-room-type > fill color > data-room-id)
        room_name = None
        
        # 1. Check for explicit room type attribute
        room_type_match = re.search(r'data-room-type="([^"]+)"', full_attrs)
        if room_type_match:
            room_name = format_room_name(room_type_match.group(1))
        
        # 2. Try to determine from fill color (MOST RELIABLE)
        if not room_name and fill:
            room_name = get_room_type_from_fill(fill)
        
        # 3. Fall back to room ID (but skip generic IDs like R001)
        if not room_name:
            room_id_match = re.search(r'data-room-id="([^"]+)"', full_attrs)
            if room_id_match:
                room_id = room_id_match.group(1)
                # Skip generic IDs like R001, R002, etc.
                if not re.match(r'^R\d+$', room_id, re.IGNORECASE):
                    room_name = format_room_name(room_id)
        
        # Skip if we couldn't determine a meaningful room name
        if not room_name:
            continue
        
        # Parse polygon points to find centroid
        centroid = calculate_polygon_centroid(points_str)
        if not centroid:
            continue
        
        room_polygons.append({
            'name': room_name,
            'centroid': centroid,
        })
    
    if not room_polygons:
        print(f"[add_room_labels_to_svg] No room polygons found to label")
        return processed_svg
    
    print(f"[add_room_labels_to_svg] Adding labels for {len(room_polygons)} rooms: {[r['name'] for r in room_polygons]}")
    
    # Generate text labels SVG
    labels_svg = '\n  <!-- Room Labels for Gemini -->\n  <g id="room-labels" font-family="Arial, sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">\n'
    
    for room in room_polygons:
        cx, cy = room['centroid']
        name = room['name']
        
        # Calculate font size based on name length (larger for visibility)
        font_size = max(10, min(16, 140 // max(len(name), 1)))
        
        # Add text with white outline for visibility
        labels_svg += f'''    <text x="{cx:.1f}" y="{cy:.1f}" font-size="{font_size}" fill="#333333" stroke="white" stroke-width="4" paint-order="stroke">{name}</text>
'''
    
    labels_svg += '  </g>\n'
    
    # Insert labels before closing </svg> tag
    if '</svg>' in processed_svg:
        processed_svg = processed_svg.replace('</svg>', labels_svg + '</svg>')
    
    return processed_svg


def calculate_polygon_centroid(points_str: str) -> Optional[Tuple[float, float]]:
    """Calculate the centroid of a polygon from its points string."""
    import re
    
    coord_regex = re.compile(r'([+-]?[\d.]+)[,\s]+([+-]?[\d.]+)')
    xs = []
    ys = []
    
    for match in coord_regex.finditer(points_str):
        x, y = match.groups()
        xs.append(float(x))
        ys.append(float(y))
    
    if not xs:
        return None
    
    # Simple centroid (average of vertices)
    # For more accuracy, use the polygon centroid formula
    n = len(xs)
    if n < 3:
        return None
    
    # Polygon centroid formula
    area = 0.0
    cx = 0.0
    cy = 0.0
    
    for i in range(n):
        j = (i + 1) % n
        cross = xs[i] * ys[j] - xs[j] * ys[i]
        area += cross
        cx += (xs[i] + xs[j]) * cross
        cy += (ys[i] + ys[j]) * cross
    
    area *= 0.5
    
    if abs(area) < 1e-10:
        # Fallback to simple average if area is too small
        return (sum(xs) / n, sum(ys) / n)
    
    cx /= (6 * area)
    cy /= (6 * area)
    
    return (cx, cy)


def format_room_name(room_key: str) -> str:
    """Format a room key into a readable name (e.g., 'primary_bedroom' -> 'Primary Bedroom')."""
    # Remove common prefixes/suffixes and format
    name = room_key.replace('_', ' ').replace('-', ' ')
    
    # Capitalize each word
    name = ' '.join(word.capitalize() for word in name.split())
    
    # Handle common abbreviations
    name = name.replace('Primary ', 'Primary ')  # Keep as-is
    
    return name


def svg_to_png(
    svg: str,
    output_width: int,
    output_height: int,
    viewbox: str
) -> bytes:
    """
    Convert SVG to PNG with specified dimensions and viewBox.
    Uses cairosvg if available, falls back to svglib/reportlab, then PIL.
    """
    # Update SVG with new viewBox and dimensions
    processed_svg = svg
    
    # Update viewBox
    processed_svg = re.sub(
        r'viewBox="[^"]+"',
        f'viewBox="{viewbox}"',
        processed_svg
    )
    
    # Update width/height - ensure they exist
    if 'width=' not in processed_svg:
        processed_svg = processed_svg.replace('<svg', f'<svg width="{output_width}"', 1)
    else:
        processed_svg = re.sub(
            r'(<svg[^>]*)\swidth="[^"]+"',
            f'\\1 width="{output_width}"',
            processed_svg
        )
    
    if 'height=' not in processed_svg:
        processed_svg = processed_svg.replace('<svg', f'<svg height="{output_height}"', 1)
    else:
        processed_svg = re.sub(
            r'(<svg[^>]*)\sheight="[^"]+"',
            f'\\1 height="{output_height}"',
            processed_svg
        )
    
    if HAS_CAIROSVG:
        # Use cairosvg for high-quality rendering
        png_data = cairosvg.svg2png(
            bytestring=processed_svg.encode('utf-8'),
            output_width=output_width,
            output_height=output_height,
            dpi=300  # High DPI for quality
        )
        return png_data
    
    # Fallback: Try svglib + reportlab
    try:
        from svglib.svglib import svg2rlg
        from reportlab.graphics import renderPM
        
        # Write SVG to temp file for svglib (use utf-8 encoding for Windows compatibility)
        import tempfile
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.svg', delete=False, encoding='utf-8') as f:
                f.write(processed_svg)
                temp_path = f.name
            
            drawing = svg2rlg(temp_path)
            if drawing:
                # Scale drawing to output size
                scale_x = output_width / drawing.width if drawing.width else 1
                scale_y = output_height / drawing.height if drawing.height else 1
                drawing.width = output_width
                drawing.height = output_height
                drawing.scale(scale_x, scale_y)
                
                # Render to PNG
                png_data = renderPM.drawToString(drawing, fmt='PNG')
                print("[OK] SVG rendered using svglib/reportlab")
                return png_data
            else:
                print("[WARN] svglib returned None for drawing")
        finally:
            if temp_path:
                import os
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass  # Ignore cleanup errors
    except ImportError as e:
        print(f"[WARN] svglib/reportlab not available: {e}")
    except Exception as e:
        import traceback
        print(f"[WARN] svglib rendering failed: {e}")
        traceback.print_exc()
    
    # Final fallback: Create a simple representation
    # Parse basic shapes from SVG and draw them with PIL
    print("[WARN] Using basic PIL fallback for SVG rendering")
    return render_svg_with_pil(processed_svg, output_width, output_height)


def render_svg_with_pil(svg: str, width: int, height: int) -> bytes:
    """
    Enhanced SVG to PNG rendering using PIL.
    Handles shapes, text labels, paths (door swings), and proper stroke widths.
    """
    from PIL import ImageDraw, ImageFont
    
    img = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(img)
    
    # Parse viewBox to get coordinate mapping
    viewbox_match = re.search(r'viewBox="([^"]+)"', svg)
    if viewbox_match:
        vb = viewbox_match.group(1).split()
        if len(vb) == 4:
            vb_x, vb_y, vb_w, vb_h = map(float, vb)
            scale_x = width / vb_w if vb_w else 1
            scale_y = height / vb_h if vb_h else 1
            offset_x = -vb_x * scale_x
            offset_y = -vb_y * scale_y
        else:
            scale_x = scale_y = 1
            offset_x = offset_y = 0
    else:
        scale_x = scale_y = 1
        offset_x = offset_y = 0
    
    def transform_point(x, y):
        return (x * scale_x + offset_x, y * scale_y + offset_y)
    
    def parse_color(color_str):
        if not color_str or color_str == 'none':
            return None
        if color_str.startswith('#'):
            return color_str
        # Extended color names
        colors = {
            'black': '#000000', 'white': '#FFFFFF', 'red': '#FF0000',
            'green': '#00FF00', 'blue': '#0000FF', 'gray': '#808080',
            'lightgray': '#D3D3D3', 'darkgray': '#A9A9A9', 'grey': '#808080',
            'lightgrey': '#D3D3D3', 'darkgrey': '#A9A9A9',
            'coral': '#FF7F50', 'salmon': '#FA8072', 'pink': '#FFC0CB',
            'lavender': '#E6E6FA', 'lightblue': '#ADD8E6', 'skyblue': '#87CEEB',
            'lightgreen': '#90EE90', 'palegreen': '#98FB98', 'orange': '#FFA500',
            'gold': '#FFD700', 'khaki': '#F0E68C', 'plum': '#DDA0DD',
            'violet': '#EE82EE', 'tan': '#D2B48C', 'beige': '#F5F5DC',
        }
        return colors.get(color_str.lower(), '#000000')
    
    def get_stroke_width(element_str):
        """Extract stroke-width from element, default to scaled value."""
        sw_match = re.search(r'stroke-width="([^"]+)"', element_str)
        if sw_match:
            try:
                sw = float(sw_match.group(1))
                # Scale stroke width proportionally
                return max(1, int(sw * min(scale_x, scale_y)))
            except ValueError:
                pass
        return max(2, int(2 * min(scale_x, scale_y)))  # Default thick walls
    
    # Draw polygons (rooms)
    for match in re.finditer(r'<polygon[^>]*points="([^"]+)"[^>]*/?>', svg, re.IGNORECASE):
        points_str = match.group(1)
        element = match.group(0)
        fill_match = re.search(r'fill="([^"]+)"', element)
        stroke_match = re.search(r'stroke="([^"]+)"', element)
        stroke_width = get_stroke_width(element)
        
        fill = parse_color(fill_match.group(1)) if fill_match else None
        stroke = parse_color(stroke_match.group(1)) if stroke_match else '#000000'
        
        # Parse points
        points = []
        for coord_match in re.finditer(r'([+-]?[\d.]+)[,\s]+([+-]?[\d.]+)', points_str):
            x, y = float(coord_match.group(1)), float(coord_match.group(2))
            points.append(transform_point(x, y))
        
        if len(points) >= 3:
            if fill and fill != 'none':
                draw.polygon(points, fill=fill)
            if stroke and stroke != 'none':
                # Draw outline with proper width
                for i in range(len(points)):
                    p1 = points[i]
                    p2 = points[(i + 1) % len(points)]
                    draw.line([p1, p2], fill=stroke, width=stroke_width)
    
    # Draw rectangles (windows, doors)
    for match in re.finditer(r'<rect[^>]*/?>', svg, re.IGNORECASE):
        rect_str = match.group(0)
        x_match = re.search(r'\bx="([^"]+)"', rect_str)
        y_match = re.search(r'\by="([^"]+)"', rect_str)
        w_match = re.search(r'\bwidth="([^"]+)"', rect_str)
        h_match = re.search(r'\bheight="([^"]+)"', rect_str)
        fill_match = re.search(r'fill="([^"]+)"', rect_str)
        stroke_match = re.search(r'stroke="([^"]+)"', rect_str)
        stroke_width = get_stroke_width(rect_str)
        
        if w_match and h_match:
            x = float(x_match.group(1)) if x_match else 0
            y = float(y_match.group(1)) if y_match else 0
            w = float(w_match.group(1))
            h = float(h_match.group(1))
            
            fill = parse_color(fill_match.group(1)) if fill_match else None
            stroke = parse_color(stroke_match.group(1)) if stroke_match else None
            
            x1, y1 = transform_point(x, y)
            x2, y2 = transform_point(x + w, y + h)
            
            if fill and fill != 'none':
                draw.rectangle([x1, y1, x2, y2], fill=fill)
            if stroke and stroke != 'none':
                draw.rectangle([x1, y1, x2, y2], outline=stroke, width=stroke_width)
    
    # Draw lines/polylines (walls, paths)
    for match in re.finditer(r'<(?:polyline|line)[^>]*/?>', svg, re.IGNORECASE):
        line_str = match.group(0)
        stroke_match = re.search(r'stroke="([^"]+)"', line_str)
        stroke = parse_color(stroke_match.group(1)) if stroke_match else '#000000'
        stroke_width = get_stroke_width(line_str)
        
        if 'polyline' in line_str.lower():
            points_match = re.search(r'points="([^"]+)"', line_str)
            if points_match:
                points = []
                for coord_match in re.finditer(r'([+-]?[\d.]+)[,\s]+([+-]?[\d.]+)', points_match.group(1)):
                    x, y = float(coord_match.group(1)), float(coord_match.group(2))
                    points.append(transform_point(x, y))
                if len(points) >= 2:
                    draw.line(points, fill=stroke, width=stroke_width)
        else:
            # Line element
            x1_match = re.search(r'\bx1="([^"]+)"', line_str)
            y1_match = re.search(r'\by1="([^"]+)"', line_str)
            x2_match = re.search(r'\bx2="([^"]+)"', line_str)
            y2_match = re.search(r'\by2="([^"]+)"', line_str)
            if x1_match and y1_match and x2_match and y2_match:
                x1, y1 = transform_point(float(x1_match.group(1)), float(y1_match.group(1)))
                x2, y2 = transform_point(float(x2_match.group(1)), float(y2_match.group(1)))
                draw.line([x1, y1, x2, y2], fill=stroke, width=stroke_width)
    
    # Draw paths (door swings - simplified arc rendering)
    for match in re.finditer(r'<path[^>]*d="([^"]+)"[^>]*/?>', svg, re.IGNORECASE):
        path_d = match.group(1)
        element = match.group(0)
        stroke_match = re.search(r'stroke="([^"]+)"', element)
        stroke = parse_color(stroke_match.group(1)) if stroke_match else '#000000'
        stroke_width = get_stroke_width(element)
        
        # Parse basic path commands (M, L, A, Q, C)
        points = []
        current_x, current_y = 0, 0
        
        # Extract move and line commands
        for cmd in re.finditer(r'([MLHVCSQTAZ])([^MLHVCSQTAZ]*)', path_d, re.IGNORECASE):
            command = cmd.group(1).upper()
            params = [float(x) for x in re.findall(r'[+-]?[\d.]+', cmd.group(2))]
            
            if command == 'M' and len(params) >= 2:
                current_x, current_y = params[0], params[1]
                points.append(transform_point(current_x, current_y))
            elif command == 'L' and len(params) >= 2:
                current_x, current_y = params[0], params[1]
                points.append(transform_point(current_x, current_y))
            elif command == 'H' and len(params) >= 1:
                current_x = params[0]
                points.append(transform_point(current_x, current_y))
            elif command == 'V' and len(params) >= 1:
                current_y = params[0]
                points.append(transform_point(current_x, current_y))
            elif command == 'A' and len(params) >= 7:
                # Arc: approximate with line to endpoint
                end_x, end_y = params[5], params[6]
                # Add intermediate points for arc approximation
                mid_x = (current_x + end_x) / 2
                mid_y = (current_y + end_y) / 2
                points.append(transform_point(mid_x, mid_y))
                current_x, current_y = end_x, end_y
                points.append(transform_point(current_x, current_y))
        
        if len(points) >= 2 and stroke:
            # Check if dashed (door swing)
            is_dashed = 'stroke-dasharray' in element
            if is_dashed:
                # Draw dashed line
                for i in range(0, len(points) - 1, 2):
                    if i + 1 < len(points):
                        draw.line([points[i], points[i + 1]], fill=stroke, width=max(1, stroke_width // 2))
            else:
                draw.line(points, fill=stroke, width=stroke_width)
    
    # Draw text labels (room names)
    # Try to load a font, fall back to default if not available
    try:
        # Calculate base font size based on image dimensions
        base_font_size = max(12, int(min(width, height) / 40))
        font = ImageFont.truetype("arial.ttf", base_font_size)
        small_font = ImageFont.truetype("arial.ttf", int(base_font_size * 0.8))
    except (IOError, OSError):
        font = ImageFont.load_default()
        small_font = font
    
    for match in re.finditer(r'<text[^>]*>([^<]+)</text>', svg, re.IGNORECASE):
        text_content = match.group(1).strip()
        element = match.group(0)
        
        # Get position
        x_match = re.search(r'\bx="([^"]+)"', element)
        y_match = re.search(r'\by="([^"]+)"', element)
        
        if x_match and y_match and text_content:
            x = float(x_match.group(1))
            y = float(y_match.group(1))
            tx, ty = transform_point(x, y)
            
            # Get fill color
            fill_match = re.search(r'fill="([^"]+)"', element)
            fill = parse_color(fill_match.group(1)) if fill_match else '#333333'
            
            # Get font size from element if specified
            fs_match = re.search(r'font-size="([^"]+)"', element)
            use_font = font
            if fs_match:
                try:
                    fs = float(re.sub(r'[^0-9.]', '', fs_match.group(1)))
                    if fs < base_font_size * 0.9:
                        use_font = small_font
                except ValueError:
                    pass
            
            # Draw text with optional stroke (for visibility)
            stroke_match = re.search(r'stroke="([^"]+)"', element)
            if stroke_match:
                stroke_color = parse_color(stroke_match.group(1))
                if stroke_color:
                    # Draw outline by drawing text offset in all directions
                    for dx, dy in [(-1, -1), (-1, 1), (1, -1), (1, 1), (-1, 0), (1, 0), (0, -1), (0, 1)]:
                        draw.text((tx + dx, ty + dy), text_content, fill=stroke_color, font=use_font, anchor='mm')
            
            draw.text((tx, ty), text_content, fill=fill, font=use_font, anchor='mm')
    
    # Also handle text with tspan children
    for match in re.finditer(r'<text[^>]*>(.*?)</text>', svg, re.IGNORECASE | re.DOTALL):
        text_element = match.group(0)
        content = match.group(1)
        
        # Skip if already processed (simple text)
        if '<tspan' not in content:
            continue
        
        # Get text position
        x_match = re.search(r'\bx="([^"]+)"', text_element)
        y_match = re.search(r'\by="([^"]+)"', text_element)
        
        if x_match and y_match:
            base_x = float(x_match.group(1))
            base_y = float(y_match.group(1))
            
            # Extract tspan content
            for tspan in re.finditer(r'<tspan[^>]*>([^<]+)</tspan>', content, re.IGNORECASE):
                tspan_content = tspan.group(1).strip()
                tspan_element = tspan.group(0)
                
                # Get tspan position (may override base position)
                tx_match = re.search(r'\bx="([^"]+)"', tspan_element)
                ty_match = re.search(r'\by="([^"]+)"', tspan_element)
                
                x = float(tx_match.group(1)) if tx_match else base_x
                y = float(ty_match.group(1)) if ty_match else base_y
                
                tx, ty = transform_point(x, y)
                
                fill_match = re.search(r'fill="([^"]+)"', tspan_element) or re.search(r'fill="([^"]+)"', text_element)
                fill = parse_color(fill_match.group(1)) if fill_match else '#333333'
                
                draw.text((tx, ty), tspan_content, fill=fill, font=font, anchor='mm')
    
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return buffer.getvalue()


def process_svg_to_png(svg: str) -> Dict[str, Any]:
    """
    Full SVG to PNG processing pipeline matching helpers.tts.
    
    Returns:
        Dict with:
        - png_buffer: PNG image bytes
        - cropped_svg: SVG with adjusted viewBox
        - aspect_ratio: Best-fit aspect ratio used
    """
    # Debug: Log SVG content summary
    text_count = len(re.findall(r'<text[^>]*>', svg, re.IGNORECASE))
    polygon_count = len(re.findall(r'<polygon[^>]*>', svg, re.IGNORECASE))
    path_count = len(re.findall(r'<path[^>]*>', svg, re.IGNORECASE))
    rect_count = len(re.findall(r'<rect[^>]*>', svg, re.IGNORECASE))
    line_count = len(re.findall(r'<line[^>]*>', svg, re.IGNORECASE))
    opening_count = svg.count('class="opening')
    has_openings = 'id="openings"' in svg
    print(f"[DEBUG] SVG input: {len(svg)} chars")
    print(f"[DEBUG]   Elements: {text_count} text, {polygon_count} polygons, {path_count} paths, {rect_count} rects, {line_count} lines")
    print(f"[DEBUG]   Openings: has_openings_group={has_openings}, opening_elements={opening_count}")
    
    # Step 0: Pre-process SVG
    processed_svg = preprocess_svg(svg)
    
    # Debug: Log after preprocessing
    text_count_after = len(re.findall(r'<text[^>]*>', processed_svg, re.IGNORECASE))
    print(f"[DEBUG] After preprocessing: {text_count_after} text elements (should match input)")
    
    # Step 1: Get floorplan bounds
    bounds = get_floorplan_bounds(processed_svg)
    if not bounds:
        # Fallback: try to parse viewBox or use default dimensions
        print("[WARN] Could not determine floorplan bounds from SVG elements, using viewBox fallback")
        viewbox_match = re.search(r'viewBox="([^"]+)"', processed_svg)
        if viewbox_match:
            parts = viewbox_match.group(1).split()
            if len(parts) == 4:
                x, y, w, h = map(float, parts)
                bounds = {"min_x": x, "min_y": y, "max_x": x + w, "max_y": y + h}
        
        # If still no bounds, use width/height attributes or default
        if not bounds:
            width_match = re.search(r'width="([0-9.]+)"', processed_svg)
            height_match = re.search(r'height="([0-9.]+)"', processed_svg)
            w = float(width_match.group(1)) if width_match else 800
            h = float(height_match.group(1)) if height_match else 600
            bounds = {"min_x": 0, "min_y": 0, "max_x": w, "max_y": h}
            print(f"[WARN] Using default bounds: {bounds}")
    
    min_x = bounds["min_x"]
    min_y = bounds["min_y"]
    max_x = bounds["max_x"]
    max_y = bounds["max_y"]
    content_width = max_x - min_x
    content_height = max_y - min_y
    
    # Ensure we have valid dimensions
    if content_width <= 0 or content_height <= 0:
        print(f"[WARN] Invalid dimensions ({content_width}x{content_height}), using defaults")
        content_width = max(content_width, 800)
        content_height = max(content_height, 600)
    
    # Step 2: Calculate output dimensions with padding
    dims = calculate_output_dimensions(content_width, content_height, SVG_PADDING)
    new_width = dims["new_width"]
    new_height = dims["new_height"]
    aspect_ratio = dims["aspect_ratio"]
    
    # Step 3: Calculate final pixel dimensions (4x scale)
    output_width = round(new_width * SVG_SCALE_FACTOR)
    output_height = round(new_height * SVG_SCALE_FACTOR)
    
    # Step 4: Calculate viewBox to center content in new dimensions
    x_padding = (new_width - content_width) / 2
    y_padding = (new_height - content_height) / 2
    viewbox_x = min_x - x_padding
    viewbox_y = min_y - y_padding
    
    viewbox = f"{viewbox_x} {viewbox_y} {new_width} {new_height}"
    
    # Step 5: Convert to PNG
    png_buffer = svg_to_png(processed_svg, output_width, output_height, viewbox)
    
    # Step 6: Update SVG with new viewBox for cropped version
    cropped_svg = processed_svg
    cropped_svg = re.sub(r'viewBox="[^"]+"', f'viewBox="{viewbox}"', cropped_svg)
    cropped_svg = re.sub(r'(<svg[^>]*)\swidth="[^"]+"', f'\\1 width="{output_width}"', cropped_svg)
    cropped_svg = re.sub(r'(<svg[^>]*)\sheight="[^"]+"', f'\\1 height="{output_height}"', cropped_svg)
    
    return {
        "png_buffer": png_buffer,
        "cropped_svg": cropped_svg,
        "aspect_ratio": aspect_ratio,
        "output_width": output_width,
        "output_height": output_height,
    }


# =============================================================================
# PROMPT CONSTRUCTION
# =============================================================================

def construct_prompt(canonical_room_keys: List[str]) -> str:
    """
    Construct a prompt for the given room types.
    Room-specific prompts are inserted in the order defined in ROOM_PROMPTS.
    """
    unique_keys = set(canonical_room_keys)
    room_specific_prompts = []
    
    # Iterate over ROOM_PROMPTS keys in their defined order
    for key in ROOM_PROMPTS.keys():
        if key in unique_keys:
            room_specific_prompts.append(ROOM_PROMPTS[key])
    
    # Replace [RoomSpecifics] placeholder with the room-specific prompts
    return BASE_PROMPT.replace("[RoomSpecifics]", "\n".join(room_specific_prompts))


# =============================================================================
# GEMINI API INTEGRATION
# =============================================================================

class GeminiStaging:
    """
    Client for staging floor plans using Gemini Flash 3.0.
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        max_retries: int = 5,
        retry_delay_ms: int = 5000,
    ):
        """
        Initialize the Gemini staging client.
        
        Args:
            api_key: Gemini API key (or set GEMINI_API_KEY env var)
            max_retries: Maximum retry attempts for transient errors
            retry_delay_ms: Base delay between retries in milliseconds
        """
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not set")
        
        self.max_retries = max_retries
        self.retry_delay_ms = retry_delay_ms
    
    def _is_retryable_error(self, error: Exception) -> bool:
        """Check if the error is retryable (rate limits, server errors)."""
        message = str(error).lower()
        retryable_codes = ["429", "resource_exhausted", "500", "502", "503", "504"]
        return any(code in message for code in retryable_codes)
    
    async def _call_gemini_with_retry(
        self,
        png_base64: str,
        prompt: str,
        aspect_ratio: str,
    ) -> bytes:
        """
        Call Gemini API with exponential backoff retry.
        """
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_CONFIG['model']}:generateContent"
        
        headers = {
            "Content-Type": "application/json",
        }
        
        payload = {
            "contents": [{
                "parts": [
                    {
                        "inlineData": {
                            "mimeType": "image/png",
                            "data": png_base64,
                        }
                    },
                    {"text": SYSTEM_PROMPT + "\n\n" + prompt},
                ]
            }],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"],
                "temperature": GEMINI_CONFIG["temperature"],
                "topK": GEMINI_CONFIG["top_k"],
                "topP": GEMINI_CONFIG["top_p"],
            },
        }
        
        last_error = None
        
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=180.0) as client:
                    response = await client.post(
                        f"{url}?key={self.api_key}",
                        json=payload,
                        headers=headers,
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        
                        # Extract image from response
                        if "candidates" in data and len(data["candidates"]) > 0:
                            candidate = data["candidates"][0]
                            if "content" in candidate and "parts" in candidate["content"]:
                                for part in candidate["content"]["parts"]:
                                    if "inlineData" in part:
                                        inline_data = part["inlineData"]
                                        if "data" in inline_data:
                                            return base64.b64decode(inline_data["data"])
                        
                        raise ValueError("No staged image returned from Gemini")
                    
                    elif response.status_code == 429:
                        # Rate limited
                        last_error = Exception(f"429 Rate limited")
                        print(f"[WARN] Gemini rate limited, retrying ({attempt + 1}/{self.max_retries})")
                    else:
                        error_text = response.text[:500]
                        last_error = Exception(f"API error {response.status_code}: {error_text}")
                        
                        # Non-retryable error
                        if response.status_code < 500 and response.status_code != 429:
                            raise last_error
                        
            except Exception as e:
                last_error = e
                
                if not self._is_retryable_error(e):
                    raise
                
                print(f"[WARN] Gemini error (attempt {attempt + 1}): {e}")
            
            # Wait before retry
            if attempt < self.max_retries - 1:
                delay_sec = self.retry_delay_ms / 1000
                print(f"[INFO] Retrying in {delay_sec}s...")
                await asyncio.sleep(delay_sec)
        
        raise last_error or Exception("Failed after all retries")
    
    async def stage_floor_plan(
        self,
        svg: str,
        canonical_room_keys: Optional[List[str]] = None,
    ) -> StagingResult:
        """
        Stage a floor plan SVG into a photorealistic render.
        
        Args:
            svg: The vectorized floor plan SVG
            canonical_room_keys: List of room type keys for prompt customization
            
        Returns:
            StagingResult with staged image and metadata
        """
        import time
        start_time = time.time()
        
        try:
            # Step 1: Process SVG to PNG
            print("[INFO] Processing SVG to PNG...")
            result = process_svg_to_png(svg)
            png_buffer = result["png_buffer"]
            cropped_svg = result["cropped_svg"]
            aspect_ratio = result["aspect_ratio"]
            
            # Step 2: Construct prompt
            room_keys = canonical_room_keys or []
            prompt = construct_prompt(room_keys)
            print(f"[INFO] Constructed prompt for {len(room_keys)} room types")
            
            # Step 3: Call Gemini API
            print(f"[INFO] Calling Gemini ({GEMINI_CONFIG['model']})...")
            png_base64 = base64.b64encode(png_buffer).decode('utf-8')
            staged_image = await self._call_gemini_with_retry(
                png_base64,
                prompt,
                aspect_ratio,
            )
            
            elapsed = time.time() - start_time
            print(f"[OK] Staging complete in {elapsed:.1f}s")
            
            # Construct full prompt for debugging
            full_prompt = SYSTEM_PROMPT + "\n\n" + prompt
            
            return StagingResult(
                success=True,
                staged_image=staged_image,
                raw_png=png_buffer,
                cropped_svg=cropped_svg,
                aspect_ratio=aspect_ratio,
                gemini_prompt=full_prompt,
                elapsed_seconds=elapsed,
            )
            
        except Exception as e:
            elapsed = time.time() - start_time
            print(f"[ERR] Staging failed: {e}")
            
            return StagingResult(
                success=False,
                error=str(e),
                elapsed_seconds=elapsed,
            )


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

async def stage_floor_plan(
    svg: str,
    canonical_room_keys: Optional[List[str]] = None,
    api_key: Optional[str] = None,
) -> StagingResult:
    """
    Convenience function to stage a floor plan.
    
    Args:
        svg: The vectorized floor plan SVG
        canonical_room_keys: List of room type keys for prompt customization
        api_key: Gemini API key (optional, uses env var if not provided)
        
    Returns:
        StagingResult with staged image and metadata
    """
    client = GeminiStaging(api_key=api_key)
    return await client.stage_floor_plan(svg, canonical_room_keys)


# =============================================================================
# CLI TESTING
# =============================================================================

if __name__ == "__main__":
    import sys
    
    async def test_staging():
        # Test with a simple SVG
        test_svg = '''
        <svg viewBox="0 0 400 300" width="400" height="300" xmlns="http://www.w3.org/2000/svg">
            <rect fill="white" width="400" height="300"/>
            <g id="walls-exterior">
                <polygon points="50,50 350,50 350,250 50,250" fill="none" stroke="black" stroke-width="4"/>
            </g>
            <polygon data-room-id="living" points="50,50 200,50 200,150 50,150" fill="#A8D5E5" stroke="black"/>
            <polygon data-room-id="bedroom" points="200,50 350,50 350,150 200,150" fill="#E6E6FA" stroke="black"/>
            <polygon data-room-id="kitchen" points="50,150 150,150 150,250 50,250" fill="#FF7F50" stroke="black"/>
            <polygon data-room-id="bathroom" points="150,150 250,150 250,250 150,250" fill="#98FB98" stroke="black"/>
        </svg>
        '''
        
        print("Testing SVG processing...")
        result = process_svg_to_png(test_svg)
        print(f"  PNG size: {len(result['png_buffer'])} bytes")
        print(f"  Aspect ratio: {result['aspect_ratio']}")
        print(f"  Output dimensions: {result['output_width']}x{result['output_height']}")
        
        print("\nTesting Gemini staging...")
        staging_result = await stage_floor_plan(
            test_svg,
            canonical_room_keys=["living", "bedroom", "kitchen", "bathroom"]
        )
        
        if staging_result.success:
            print(f"[OK] Staging successful!")
            print(f"  Staged image size: {len(staging_result.staged_image)} bytes")
            print(f"  Elapsed: {staging_result.elapsed_seconds:.1f}s")
        else:
            print(f"[ERR] Staging failed: {staging_result.error}")
    
    asyncio.run(test_staging())

