"""
Prompt builder for generating analyzable floor plans.
Contains engineered prompts designed to output color-coded, computationally analyzable floor plans.
"""

from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from utils.color_palette import ROOM_COLORS_HEX


@dataclass
class FloorPlanRequirements:
    """User requirements for floor plan generation."""
    bedrooms: int
    bathrooms: int
    sqft: int
    style: str
    stories: int = 1
    additional_rooms: List[str] = None
    
    def __post_init__(self):
        if self.additional_rooms is None:
            self.additional_rooms = []


# Architectural style descriptions
STYLE_DESCRIPTIONS = {
    "modern": "Clean lines, open spaces, minimalist aesthetic with large windows and flowing rooms",
    "traditional": "Classic room separation, formal living and dining areas, defined spaces",
    "farmhouse": "Open kitchen as the heart, mudroom entry, practical layout with character",
    "craftsman": "Built-in features, central fireplace location, connected indoor-outdoor flow",
    "mediterranean": "Courtyard influence, arched openings, indoor-outdoor living emphasis",
    "contemporary": "Asymmetric layouts, unique angles, bold geometric shapes",
    "ranch": "Single-story spread, easy flow between rooms, attached garage emphasis",
    "colonial": "Symmetrical design, center hall, formal room arrangement",
    "mid_century": "Post-and-beam expression, walls of glass, integration with landscape",
    "minimalist": "Essential spaces only, maximum efficiency, clean and uncluttered",
}

# Layout variation strategies
LAYOUT_VARIATIONS = [
    {
        "name": "linear",
        "description": "LINEAR/elongated layout",
        "instruction": "Arrange all rooms along a single axis or central corridor. The plan should be notably longer than it is wide, with rooms flowing in sequence.",
    },
    {
        "name": "compact",
        "description": "COMPACT/square layout", 
        "instruction": "Create a tight, efficient square or nearly-square footprint. Minimize hallway space by using a central hub or stacked room arrangement.",
    },
    {
        "name": "l_shaped",
        "description": "L-SHAPED layout",
        "instruction": "Design an L-shaped footprint with two distinct wings meeting at a corner. Use the corner as a transition or living space.",
    },
    {
        "name": "open_concept",
        "description": "OPEN CONCEPT layout",
        "instruction": "Minimize interior walls between living, dining, and kitchen areas. Create one large flowing space for the main living areas.",
    },
    {
        "name": "split_bedroom",
        "description": "SPLIT BEDROOM layout",
        "instruction": "Place the master bedroom suite on one end of the home and secondary bedrooms on the opposite end for maximum privacy.",
    },
    {
        "name": "courtyard",
        "description": "COURTYARD layout",
        "instruction": "Arrange rooms around a central courtyard or open space. Create a U-shape or partial enclosure around this central area.",
    },
    {
        "name": "cluster",
        "description": "CLUSTERED layout",
        "instruction": "Group related rooms into distinct clusters: a sleeping wing, a living wing, and a service wing. Connect clusters with clear circulation.",
    },
    {
        "name": "circular_flow",
        "description": "CIRCULAR FLOW layout",
        "instruction": "Design rooms that connect in a loop, allowing movement through the home without dead ends. Create multiple path options.",
    },
    {
        "name": "front_back",
        "description": "FRONT-TO-BACK layout",
        "instruction": "Organize the plan with public rooms at the front and private rooms at the back. Create a clear gradient from social to intimate spaces.",
    },
    {
        "name": "offset",
        "description": "OFFSET/staggered layout",
        "instruction": "Stagger room positions so walls don't align. Create visual interest with offset volumes and unexpected spatial relationships.",
    },
]


def get_color_palette_prompt() -> str:
    """Generate the color palette section of the prompt."""
    return """ROOM COLOR PALETTE - USE THESE EXACT COLORS:
Each room type MUST be filled with its designated solid color. No exceptions.

  * Living Room / Family Room / Great Room: #A8D5E5 (light blue)
  * Bedroom (all bedrooms): #E6E6FA (lavender purple)
  * Bathroom (all bathrooms): #98FB98 (mint green)
  * Kitchen: #FF7F50 (coral orange)
  * Hallway / Corridor / Entry: #F5F5F5 (very light gray)
  * Closet / Storage / Pantry / Laundry: #DEB887 (tan/burlywood)
  * Dining Room / Breakfast Nook: #FFE4B5 (moccasin/peach)
  * Office / Study / Den: #B0C4DE (light steel blue)
  * Garage: #C0C0C0 (silver gray)
  * Outdoor / Patio / Porch: #90EE90 (light green)"""


def get_visual_requirements_prompt() -> str:
    """Generate the strict visual requirements section."""
    return """STRICT VISUAL REQUIREMENTS:

1. VIEW: Top-down orthographic view ONLY (looking straight down at the floor)

2. WALLS: 
   - All walls must be BLACK (#000000)
   - Consistent thickness throughout (approximately 3-4 pixels)
   - Clean, straight lines

3. ROOM FILLS:
   - Each room filled with SOLID, FLAT color
   - NO gradients, shadows, or shading
   - NO textures or patterns
   - Colors must match the palette exactly

4. BACKGROUND:
   - Pure WHITE (#FFFFFF) outside the floor plan

5. DO NOT INCLUDE:
   - Furniture, appliances, or fixtures
   - Text, labels, or dimensions
   - Door swings or window symbols
   - 3D effects or perspective
   - Shadows or lighting
   - Landscaping or exterior features
   - Multiple floors
   - Decorative elements"""


def build_generation_prompt(
    requirements: FloorPlanRequirements,
    variation_index: int = 0,
    include_variation: bool = True
) -> str:
    """
    Build a complete generation prompt.
    
    Args:
        requirements: Floor plan requirements
        variation_index: Which layout variation to use
        include_variation: Whether to include variation instructions
        
    Returns:
        Complete prompt string
    """
    # Get style description
    style_desc = STYLE_DESCRIPTIONS.get(
        requirements.style.lower(), 
        STYLE_DESCRIPTIONS["modern"]
    )
    
    # Build additional rooms string
    additional = ""
    if requirements.additional_rooms:
        additional = f"\n- Additional rooms: {', '.join(requirements.additional_rooms)}"
    
    # Base prompt
    prompt = f"""Generate a 2D architectural floor plan image.

{get_color_palette_prompt()}

{get_visual_requirements_prompt()}

FLOOR PLAN PROGRAM:
- Bedrooms: {requirements.bedrooms}
- Bathrooms: {requirements.bathrooms}
- Total area: approximately {requirements.sqft} square feet
- Style: {requirements.style.title()} - {style_desc}{additional}
- Stories: {requirements.stories} (show only main floor)"""

    # Add variation if requested
    if include_variation:
        variation = LAYOUT_VARIATIONS[variation_index % len(LAYOUT_VARIATIONS)]
        prompt += f"""

LAYOUT APPROACH - {variation['description']}:
{variation['instruction']}

Make this layout approach clearly visible in your design. The floor plan should distinctly embody this layout strategy."""

    prompt += """

Generate the floor plan now. Output only the image, no text."""

    return prompt


def build_diversity_check_prompt(existing_descriptions: List[str]) -> str:
    """
    Build a prompt that asks for a plan different from existing ones.
    
    Args:
        existing_descriptions: Brief descriptions of already-generated plans
        
    Returns:
        Additional prompt text to encourage diversity
    """
    if not existing_descriptions:
        return ""
    
    existing_list = "\n".join(f"- {desc}" for desc in existing_descriptions)
    
    return f"""

DIVERSITY REQUIREMENT:
The following floor plan layouts have already been generated:
{existing_list}

Create a floor plan that is DISTINCTLY DIFFERENT from all of the above. 
Use a different room arrangement, circulation pattern, and overall shape."""


def build_refinement_prompt(
    original_prompt: str,
    issue: str
) -> str:
    """
    Build a prompt to refine/fix a generation that had issues.
    
    Args:
        original_prompt: The original prompt used
        issue: Description of the issue to fix
        
    Returns:
        Refined prompt
    """
    return f"""{original_prompt}

IMPORTANT CORRECTION NEEDED:
The previous generation had this issue: {issue}

Please fix this by:
- Ensuring all rooms are filled with SOLID colors from the palette
- Making sure walls are clearly BLACK lines
- Removing any 3D effects, furniture, or labels
- Using a pure white background

Generate a corrected floor plan now."""


class PromptBuilder:
    """
    Builder class for constructing generation prompts.
    Supports chaining and customization.
    """
    
    def __init__(self):
        self.requirements: Optional[FloorPlanRequirements] = None
        self.variation_index: int = 0
        self.include_variation: bool = True
        self.diversity_descriptions: List[str] = []
        self.custom_instructions: List[str] = []
    
    def with_requirements(
        self,
        bedrooms: int,
        bathrooms: int,
        sqft: int,
        style: str = "modern",
        additional_rooms: Optional[List[str]] = None
    ) -> "PromptBuilder":
        """Set the floor plan requirements."""
        self.requirements = FloorPlanRequirements(
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            sqft=sqft,
            style=style,
            additional_rooms=additional_rooms or []
        )
        return self
    
    def with_variation(self, index: int) -> "PromptBuilder":
        """Set which layout variation to use."""
        self.variation_index = index
        return self
    
    def without_variation(self) -> "PromptBuilder":
        """Disable layout variation instructions."""
        self.include_variation = False
        return self
    
    def avoiding(self, descriptions: List[str]) -> "PromptBuilder":
        """Add descriptions of plans to avoid duplicating."""
        self.diversity_descriptions = descriptions
        return self
    
    def with_instruction(self, instruction: str) -> "PromptBuilder":
        """Add a custom instruction."""
        self.custom_instructions.append(instruction)
        return self
    
    def build(self) -> str:
        """Build the final prompt."""
        if not self.requirements:
            raise ValueError("Requirements must be set before building prompt")
        
        prompt = build_generation_prompt(
            self.requirements,
            self.variation_index,
            self.include_variation
        )
        
        # Add diversity avoidance
        if self.diversity_descriptions:
            prompt += build_diversity_check_prompt(self.diversity_descriptions)
        
        # Add custom instructions
        if self.custom_instructions:
            prompt += "\n\nADDITIONAL REQUIREMENTS:"
            for instruction in self.custom_instructions:
                prompt += f"\n- {instruction}"
        
        return prompt
    
    def reset(self) -> "PromptBuilder":
        """Reset the builder to initial state."""
        self.__init__()
        return self


def get_variation_names() -> List[str]:
    """Get list of all variation type names."""
    return [v["name"] for v in LAYOUT_VARIATIONS]


def get_variation_description(index: int) -> str:
    """Get human-readable description of a variation."""
    variation = LAYOUT_VARIATIONS[index % len(LAYOUT_VARIATIONS)]
    return variation["description"]








