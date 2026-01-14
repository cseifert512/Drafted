"""
SVG Parser for Drafted floor plan output.

Extracts room data, dimensions, and metadata from the SVG output.
Converts SVG to image formats as needed.
"""

import re
import json
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from xml.etree import ElementTree as ET


@dataclass
class RoomPolygon:
    """Parsed room polygon from SVG."""
    room_type: str
    canonical_key: str
    fill_color: str
    points: List[Tuple[float, float]]
    centroid: Tuple[float, float]
    area_sqft: float
    width_inches: float
    height_inches: float
    
    @property
    def bounds(self) -> Tuple[float, float, float, float]:
        """Get bounding box (min_x, min_y, max_x, max_y)."""
        if not self.points:
            return (0, 0, 0, 0)
        xs = [p[0] for p in self.points]
        ys = [p[1] for p in self.points]
        return (min(xs), min(ys), max(xs), max(ys))


@dataclass
class ParsedFloorPlan:
    """Fully parsed floor plan data."""
    rooms: List[RoomPolygon]
    total_area_sqft: float
    svg_width: float
    svg_height: float
    viewbox: Tuple[float, float, float, float]
    raw_svg: str
    metadata: Dict[str, Any]


class SVGParser:
    """
    Parser for Drafted SVG floor plan output.
    
    Handles:
    - Room polygon extraction
    - Color-based room type identification
    - Dimension calculation
    - Coordinate transformation
    """
    
    # SVG namespace
    SVG_NS = "{http://www.w3.org/2000/svg}"
    
    def __init__(self, rooms_schema: Optional[Dict] = None):
        """
        Initialize parser with optional rooms schema for color mapping.
        
        Args:
            rooms_schema: Loaded rooms.json data for color -> room type mapping
        """
        self.rooms_schema = rooms_schema
        self._color_map = self._build_color_map() if rooms_schema else {}
    
    def _build_color_map(self) -> Dict[str, str]:
        """Build mapping from training_hex colors to room types."""
        color_map = {}
        if not self.rooms_schema:
            return color_map
            
        types = self.rooms_schema.get("types", {})
        for room_type, room_def in types.items():
            colors = room_def.get("colors", {})
            training_hex = colors.get("training_hex")
            if training_hex:
                # Normalize to lowercase without #
                normalized = training_hex.lower().lstrip("#")
                color_map[normalized] = room_type
        
        return color_map
    
    def parse(self, svg_string: str, room_data: Optional[List[Dict]] = None) -> ParsedFloorPlan:
        """
        Parse SVG string into structured floor plan data.
        
        Args:
            svg_string: Raw SVG content
            room_data: Optional room data from API response (already parsed)
            
        Returns:
            ParsedFloorPlan with extracted room data
        """
        # Parse SVG XML
        try:
            root = ET.fromstring(svg_string)
        except ET.ParseError as e:
            return ParsedFloorPlan(
                rooms=[],
                total_area_sqft=0,
                svg_width=0,
                svg_height=0,
                viewbox=(0, 0, 0, 0),
                raw_svg=svg_string,
                metadata={"error": str(e)}
            )
        
        # Get SVG dimensions
        width = self._parse_dimension(root.get("width", "768"))
        height = self._parse_dimension(root.get("height", "768"))
        viewbox = self._parse_viewbox(root.get("viewBox", f"0 0 {width} {height}"))
        
        # Extract rooms from SVG elements
        rooms = []
        
        if room_data:
            # Use pre-parsed room data from API
            for rd in room_data:
                rooms.append(RoomPolygon(
                    room_type=rd.get("room_type", "unknown"),
                    canonical_key=rd.get("canonical_key", ""),
                    fill_color="",
                    points=[],
                    centroid=(0, 0),
                    area_sqft=rd.get("area_sqft", 0),
                    width_inches=rd.get("width_inches", 0),
                    height_inches=rd.get("height_inches", 0)
                ))
        else:
            # Parse rooms from SVG elements
            rooms = self._extract_rooms_from_svg(root)
        
        total_area = sum(r.area_sqft for r in rooms)
        
        return ParsedFloorPlan(
            rooms=rooms,
            total_area_sqft=total_area,
            svg_width=width,
            svg_height=height,
            viewbox=viewbox,
            raw_svg=svg_string,
            metadata={}
        )
    
    def _parse_dimension(self, value: str) -> float:
        """Parse SVG dimension (may have units like px, pt)."""
        match = re.match(r"([\d.]+)", value)
        if match:
            return float(match.group(1))
        return 0
    
    def _parse_viewbox(self, value: str) -> Tuple[float, float, float, float]:
        """Parse SVG viewBox attribute."""
        parts = value.split()
        if len(parts) >= 4:
            return tuple(float(p) for p in parts[:4])
        return (0, 0, 768, 768)
    
    def _extract_rooms_from_svg(self, root: ET.Element) -> List[RoomPolygon]:
        """Extract room polygons from SVG elements."""
        rooms = []
        
        # Look for rect, polygon, and path elements
        for elem in root.iter():
            tag = elem.tag.replace(self.SVG_NS, "")
            
            if tag in ("rect", "polygon", "path"):
                room = self._parse_room_element(elem, tag)
                if room:
                    rooms.append(room)
        
        return rooms
    
    def _parse_room_element(self, elem: ET.Element, tag: str) -> Optional[RoomPolygon]:
        """Parse a single room element."""
        # Get fill color
        fill = elem.get("fill", "")
        if not fill or fill == "none":
            style = elem.get("style", "")
            fill_match = re.search(r"fill:\s*([^;]+)", style)
            if fill_match:
                fill = fill_match.group(1)
        
        if not fill or fill == "none":
            return None
        
        # Normalize color
        fill_normalized = fill.lower().lstrip("#")
        
        # Look up room type from color
        room_type = self._color_map.get(fill_normalized, "unknown")
        
        # Parse geometry
        points = []
        if tag == "rect":
            x = float(elem.get("x", 0))
            y = float(elem.get("y", 0))
            w = float(elem.get("width", 0))
            h = float(elem.get("height", 0))
            points = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
        elif tag == "polygon":
            points_str = elem.get("points", "")
            points = self._parse_points(points_str)
        elif tag == "path":
            # Basic path parsing (just for bounding box)
            d = elem.get("d", "")
            points = self._parse_path_bounds(d)
        
        if not points:
            return None
        
        # Calculate properties
        centroid = self._calculate_centroid(points)
        area_px = self._calculate_polygon_area(points)
        
        # Estimate sqft (assuming some scale factor)
        # This is approximate - actual sqft comes from API
        bounds = self._get_bounds(points)
        width_px = bounds[2] - bounds[0]
        height_px = bounds[3] - bounds[1]
        
        return RoomPolygon(
            room_type=room_type,
            canonical_key=room_type,
            fill_color=fill,
            points=points,
            centroid=centroid,
            area_sqft=area_px / 10,  # Rough estimate
            width_inches=width_px,
            height_inches=height_px
        )
    
    def _parse_points(self, points_str: str) -> List[Tuple[float, float]]:
        """Parse SVG polygon points attribute."""
        points = []
        pairs = re.findall(r"([\d.]+)[,\s]+([\d.]+)", points_str)
        for x, y in pairs:
            points.append((float(x), float(y)))
        return points
    
    def _parse_path_bounds(self, d: str) -> List[Tuple[float, float]]:
        """Parse SVG path to get bounding points (simplified)."""
        points = []
        # Extract all coordinate pairs from path
        pairs = re.findall(r"([\d.]+)[,\s]+([\d.]+)", d)
        for x, y in pairs:
            points.append((float(x), float(y)))
        return points
    
    def _calculate_centroid(self, points: List[Tuple[float, float]]) -> Tuple[float, float]:
        """Calculate centroid of polygon."""
        if not points:
            return (0, 0)
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        return (sum(xs) / len(xs), sum(ys) / len(ys))
    
    def _calculate_polygon_area(self, points: List[Tuple[float, float]]) -> float:
        """Calculate area of polygon using shoelace formula."""
        if len(points) < 3:
            return 0
        
        n = len(points)
        area = 0
        for i in range(n):
            j = (i + 1) % n
            area += points[i][0] * points[j][1]
            area -= points[j][0] * points[i][1]
        
        return abs(area) / 2
    
    def _get_bounds(self, points: List[Tuple[float, float]]) -> Tuple[float, float, float, float]:
        """Get bounding box of points."""
        if not points:
            return (0, 0, 0, 0)
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        return (min(xs), min(ys), max(xs), max(ys))


def svg_to_png(svg_string: str, width: int = 768, height: int = 768) -> Optional[bytes]:
    """
    Convert SVG to PNG image.
    
    Requires cairosvg library.
    """
    try:
        import cairosvg
        return cairosvg.svg2png(
            bytestring=svg_string.encode('utf-8'),
            output_width=width,
            output_height=height
        )
    except ImportError:
        print("[WARN] cairosvg not installed - cannot convert SVG to PNG")
        return None
    except Exception as e:
        print(f"[ERR] SVG to PNG conversion failed: {e}")
        return None


def format_room_summary(floor_plan: ParsedFloorPlan) -> str:
    """Format floor plan rooms as human-readable summary."""
    lines = [f"Total Area: {floor_plan.total_area_sqft:.0f} sqft"]
    lines.append(f"Rooms: {len(floor_plan.rooms)}")
    lines.append("")
    
    for room in floor_plan.rooms:
        lines.append(f"  • {room.room_type}: {room.area_sqft:.0f} sqft")
        if room.width_inches and room.height_inches:
            w_ft = room.width_inches / 12
            h_ft = room.height_inches / 12
            lines.append(f"    ({w_ft:.1f}' × {h_ft:.1f}')")
    
    return "\n".join(lines)


# Testing
if __name__ == "__main__":
    # Load rooms schema for color mapping
    import json
    from pathlib import Path
    
    schema_path = Path(__file__).parent / "rooms.json"
    with open(schema_path) as f:
        schema = json.load(f)
    
    parser = SVGParser(schema)
    
    # Test SVG parsing
    test_svg = """
    <svg width="768" height="768" viewBox="0 0 768 768">
        <rect x="100" y="100" width="200" height="150" fill="#FD4041" />
        <rect x="100" y="260" width="200" height="100" fill="#3A6DF8" />
        <rect x="310" y="100" width="150" height="260" fill="#E94992" />
    </svg>
    """
    
    result = parser.parse(test_svg)
    print("Parsed SVG:")
    print(f"  Rooms found: {len(result.rooms)}")
    for room in result.rooms:
        print(f"    {room.room_type}: {room.fill_color}")

