"""
Parser for extracting structured data from nanobana API responses.
"""

import re
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass


@dataclass
class ParsedRoom:
    """Parsed room information."""
    name: str
    type: str
    area_sqft: float
    dimensions: Optional[Tuple[float, float]] = None


@dataclass
class ParsedAdjacency:
    """Parsed room adjacency."""
    room: str
    connects_to: List[str]


@dataclass
class ParsedFloorPlanData:
    """Complete parsed floor plan data."""
    rooms: List[ParsedRoom]
    adjacencies: List[ParsedAdjacency]
    metrics: Dict[str, Any]
    raw_text: str


def parse_floor_plan_response(response_text: str) -> Optional[ParsedFloorPlanData]:
    """
    Parse structured data from a floor plan generation response.
    
    Looks for data in the format:
    ---FLOOR_PLAN_DATA---
    ROOMS:
    - living: 450 sqft, 18' x 25'
    ...
    ADJACENCIES:
    - living connects to: kitchen, dining, hallway
    ...
    METRICS:
    - total_sqft: 2400
    ...
    ---END_DATA---
    
    Args:
        response_text: The raw text response from the API
        
    Returns:
        ParsedFloorPlanData or None if parsing fails
    """
    if not response_text:
        return None
    
    # Extract the data block
    data_match = re.search(
        r'---FLOOR_PLAN_DATA---(.+?)---END_DATA---',
        response_text,
        re.DOTALL
    )
    
    if not data_match:
        # Try alternative formats
        return _parse_freeform_response(response_text)
    
    data_block = data_match.group(1)
    
    rooms = _parse_rooms_section(data_block)
    adjacencies = _parse_adjacencies_section(data_block)
    metrics = _parse_metrics_section(data_block)
    
    return ParsedFloorPlanData(
        rooms=rooms,
        adjacencies=adjacencies,
        metrics=metrics,
        raw_text=response_text
    )


def _parse_rooms_section(data_block: str) -> List[ParsedRoom]:
    """Parse the ROOMS section."""
    rooms = []
    
    # Find ROOMS section
    rooms_match = re.search(
        r'ROOMS:\s*\n((?:[-•]\s*.+\n?)+)',
        data_block,
        re.IGNORECASE
    )
    
    if not rooms_match:
        return rooms
    
    rooms_text = rooms_match.group(1)
    
    # Parse each room line
    # Format: - room_type: area sqft, width' x length'
    room_pattern = r'[-•]\s*([^:]+):\s*(\d+(?:\.\d+)?)\s*(?:sq\s*ft|sqft)'
    dim_pattern = r"(\d+(?:\.\d+)?)['\"]?\s*x\s*(\d+(?:\.\d+)?)['\"]?"
    
    for line in rooms_text.split('\n'):
        room_match = re.search(room_pattern, line, re.IGNORECASE)
        if room_match:
            name = room_match.group(1).strip()
            area = float(room_match.group(2))
            
            # Try to get dimensions
            dimensions = None
            dim_match = re.search(dim_pattern, line)
            if dim_match:
                dimensions = (float(dim_match.group(1)), float(dim_match.group(2)))
            
            # Determine room type from name
            room_type = _classify_room_type(name)
            
            rooms.append(ParsedRoom(
                name=name,
                type=room_type,
                area_sqft=area,
                dimensions=dimensions
            ))
    
    return rooms


def _parse_adjacencies_section(data_block: str) -> List[ParsedAdjacency]:
    """Parse the ADJACENCIES section."""
    adjacencies = []
    
    # Find ADJACENCIES section
    adj_match = re.search(
        r'ADJACENCIES:\s*\n((?:[-•]\s*.+\n?)+)',
        data_block,
        re.IGNORECASE
    )
    
    if not adj_match:
        return adjacencies
    
    adj_text = adj_match.group(1)
    
    # Parse each adjacency line
    # Format: - room connects to: room1, room2, room3
    adj_pattern = r'[-•]\s*([^:]+?)(?:\s+connects?\s+to\s*:\s*|\s*->\s*)(.+)'
    
    for line in adj_text.split('\n'):
        match = re.search(adj_pattern, line, re.IGNORECASE)
        if match:
            room = match.group(1).strip()
            connections = [c.strip() for c in match.group(2).split(',')]
            connections = [c for c in connections if c]
            
            adjacencies.append(ParsedAdjacency(
                room=room,
                connects_to=connections
            ))
    
    return adjacencies


def _parse_metrics_section(data_block: str) -> Dict[str, Any]:
    """Parse the METRICS section."""
    metrics = {}
    
    # Find METRICS section
    metrics_match = re.search(
        r'METRICS:\s*\n((?:[-•]\s*.+\n?)+)',
        data_block,
        re.IGNORECASE
    )
    
    if not metrics_match:
        return metrics
    
    metrics_text = metrics_match.group(1)
    
    # Parse each metric
    # Format: - metric_name: value
    metric_pattern = r'[-•]\s*([^:]+):\s*(.+)'
    
    for line in metrics_text.split('\n'):
        match = re.search(metric_pattern, line)
        if match:
            key = match.group(1).strip().lower().replace(' ', '_')
            value_str = match.group(2).strip()
            
            # Try to convert to number
            try:
                if '.' in value_str:
                    value = float(value_str)
                else:
                    value = int(re.search(r'\d+', value_str).group())
            except (ValueError, AttributeError):
                value = value_str
            
            metrics[key] = value
    
    return metrics


def _parse_freeform_response(response_text: str) -> Optional[ParsedFloorPlanData]:
    """
    Attempt to parse room and adjacency information from freeform text.
    Used as fallback when structured format is not present.
    """
    rooms = []
    adjacencies = []
    metrics = {}
    
    # Look for room mentions with areas
    area_pattern = r'(\w+(?:\s+\w+)?)\s*(?:room|space|area)?\s*[:\-]?\s*(?:approximately|about|~)?\s*(\d+)\s*(?:sq\.?\s*ft\.?|sqft|square feet)'
    
    for match in re.finditer(area_pattern, response_text, re.IGNORECASE):
        name = match.group(1).strip()
        area = float(match.group(2))
        room_type = _classify_room_type(name)
        
        rooms.append(ParsedRoom(
            name=name,
            type=room_type,
            area_sqft=area
        ))
    
    # Look for total square footage
    total_match = re.search(
        r'total\s*(?:area|sqft|square footage)[:\s]*(\d+)',
        response_text,
        re.IGNORECASE
    )
    if total_match:
        metrics['total_sqft'] = int(total_match.group(1))
    
    # Look for bedroom/bathroom counts
    bed_match = re.search(r'(\d+)\s*bed(?:room)?s?', response_text, re.IGNORECASE)
    if bed_match:
        metrics['bedroom_count'] = int(bed_match.group(1))
    
    bath_match = re.search(r'(\d+(?:\.\d+)?)\s*bath(?:room)?s?', response_text, re.IGNORECASE)
    if bath_match:
        metrics['bathroom_count'] = float(bath_match.group(1))
    
    if not rooms and not metrics:
        return None
    
    return ParsedFloorPlanData(
        rooms=rooms,
        adjacencies=adjacencies,
        metrics=metrics,
        raw_text=response_text
    )


def _classify_room_type(name: str) -> str:
    """Classify a room name into a standard type."""
    name_lower = name.lower()
    
    type_mappings = {
        'living': ['living', 'family', 'great room', 'lounge'],
        'bedroom': ['bedroom', 'bed', 'master', 'guest room'],
        'bathroom': ['bathroom', 'bath', 'powder', 'restroom', 'toilet', 'wc'],
        'kitchen': ['kitchen', 'kitchenette'],
        'dining': ['dining', 'breakfast', 'eat-in'],
        'circulation': ['hallway', 'hall', 'corridor', 'entry', 'foyer', 'mudroom'],
        'storage': ['closet', 'storage', 'pantry', 'utility', 'laundry'],
        'outdoor': ['patio', 'deck', 'porch', 'balcony', 'terrace'],
        'office': ['office', 'study', 'den', 'library', 'workspace'],
        'garage': ['garage', 'carport'],
    }
    
    for room_type, keywords in type_mappings.items():
        if any(kw in name_lower for kw in keywords):
            return room_type
    
    return 'unknown'


def extract_adjacency_graph(parsed_data: ParsedFloorPlanData) -> Dict[str, List[str]]:
    """
    Convert parsed adjacencies to a graph representation.
    
    Returns:
        Dictionary mapping room names to lists of connected rooms
    """
    graph = {}
    
    for adj in parsed_data.adjacencies:
        room = adj.room.lower()
        if room not in graph:
            graph[room] = []
        
        for connected in adj.connects_to:
            connected_lower = connected.lower()
            graph[room].append(connected_lower)
            
            # Add reverse connection
            if connected_lower not in graph:
                graph[connected_lower] = []
            if room not in graph[connected_lower]:
                graph[connected_lower].append(room)
    
    return graph




