"""Floor plan generation module via Gemini API."""

from .prompt_templates import (
    get_color_coded_prompt,
    get_analysis_prompt,
    get_variation_prompt,
    ROOM_COLOR_INSTRUCTIONS,
)
from .prompt_builder import (
    PromptBuilder,
    FloorPlanRequirements,
    build_generation_prompt,
    get_variation_names,
    get_variation_description,
    LAYOUT_VARIATIONS,
    STYLE_DESCRIPTIONS,
)
from .gemini_client import (
    GeminiFloorPlanGenerator,
    GenerationConfig,
    GeneratedPlan,
    generate_floor_plans,
)
from .nanobana_client import NanobanaClient
from .response_parser import parse_floor_plan_response

__all__ = [
    # Prompt templates
    "get_color_coded_prompt",
    "get_analysis_prompt", 
    "get_variation_prompt",
    "ROOM_COLOR_INSTRUCTIONS",
    # Prompt builder
    "PromptBuilder",
    "FloorPlanRequirements",
    "build_generation_prompt",
    "get_variation_names",
    "get_variation_description",
    "LAYOUT_VARIATIONS",
    "STYLE_DESCRIPTIONS",
    # Gemini client
    "GeminiFloorPlanGenerator",
    "GenerationConfig",
    "GeneratedPlan",
    "generate_floor_plans",
    # Legacy
    "NanobanaClient",
    "parse_floor_plan_response",
]

