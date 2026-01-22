"""
Drafted.ai Floor Plan Generation & Editing Module

This module provides integration with Drafted's production floor plan model.

Example usage:
    from editing import DraftedFloorPlanClient, RoomSpec, GenerationConfig
    
    client = DraftedFloorPlanClient()
    config = GenerationConfig(
        rooms=[
            RoomSpec("primary_bedroom", "M"),
            RoomSpec("living", "M"),
            RoomSpec("kitchen", "M"),
        ]
    )
    result = await client.generate(config)
"""

from .drafted_client import (
    DraftedFloorPlanClient,
    DraftedPromptBuilder,
    RoomsCatalog,
    RoomSpec,
    GenerationConfig,
    GenerationResult,
    GeneratedRoom,
    create_default_config,
)

from .clip_tokenizer import (
    count_tokens,
    validate_prompt,
    truncate_prompt,
    get_tokenizer_info,
    MAX_TOKENS,
)

from .svg_parser import (
    SVGParser,
    ParsedFloorPlan,
    RoomPolygon,
    svg_to_png,
    format_room_summary,
)

from .api_integration import (
    DraftedAPIIntegration,
    create_drafted_routes,
)

__all__ = [
    # Client
    "DraftedFloorPlanClient",
    "DraftedPromptBuilder", 
    "RoomsCatalog",
    "RoomSpec",
    "GenerationConfig",
    "GenerationResult",
    "GeneratedRoom",
    "create_default_config",
    
    # Tokenizer
    "count_tokens",
    "validate_prompt",
    "truncate_prompt",
    "get_tokenizer_info",
    "MAX_TOKENS",
    
    # SVG Parser
    "SVGParser",
    "ParsedFloorPlan",
    "RoomPolygon",
    "svg_to_png",
    "format_room_summary",
    
    # API Integration
    "DraftedAPIIntegration",
    "create_drafted_routes",
]

__version__ = "0.1.0"








