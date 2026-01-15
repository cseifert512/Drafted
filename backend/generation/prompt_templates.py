"""
Prompt templates for generating analyzable floor plans via nanobana API.

These prompts are engineered to "trick" the model into outputting
floor plans in formats that are easy to computationally analyze.
"""

from typing import Dict, List, Optional
from utils.color_palette import ROOM_COLORS_HEX


# Standard color instructions to include in all prompts
ROOM_COLOR_INSTRUCTIONS = """
Use these EXACT solid fill colors for each room type:
- Living/Family Room: #A8D5E5 (light blue)
- Bedroom: #E6E6FA (lavender)
- Bathroom: #98FB98 (mint green)
- Kitchen: #FF7F50 (coral)
- Hallway/Corridor: #F5F5F5 (light gray)
- Storage/Closet: #DEB887 (burlywood)
- Outdoor/Patio: #90EE90 (light green)
- Dining Room: #FFE4B5 (moccasin)
- Office/Study: #B0C4DE (light steel blue)
- Garage: #C0C0C0 (silver)

Walls must be BLACK (#000000) with consistent 3px thickness.
Background must be WHITE (#FFFFFF).
Do NOT add furniture, textures, patterns, or shadows.
Each room should be a solid color fill.
"""


STRUCTURED_OUTPUT_INSTRUCTIONS = """
After the floor plan image, provide this structured data:

---FLOOR_PLAN_DATA---
ROOMS:
- [room_type]: [area_sqft] sqft, [width]' x [length]'
- ...

ADJACENCIES:
- [room1] connects to: [room2], [room3]
- ...

METRICS:
- total_sqft: [number]
- bedroom_count: [number]
- bathroom_count: [number]
- stories: [number]
---END_DATA---
"""


def get_color_coded_prompt(
    bedrooms: int = 3,
    bathrooms: int = 2,
    sqft: int = 2000,
    style: str = "modern",
    additional_rooms: Optional[List[str]] = None,
    include_structured_output: bool = True
) -> str:
    """
    Generate a prompt for a color-coded floor plan.
    
    Args:
        bedrooms: Number of bedrooms
        bathrooms: Number of bathrooms
        sqft: Target square footage
        style: Architectural style (modern, traditional, etc.)
        additional_rooms: Extra rooms to include (office, mudroom, etc.)
        include_structured_output: Whether to request structured data
        
    Returns:
        Complete prompt string
    """
    extra_rooms = ""
    if additional_rooms:
        extra_rooms = f"\nInclude these additional spaces: {', '.join(additional_rooms)}"
    
    prompt = f"""Generate a {style} floor plan with the following specifications:

REQUIREMENTS:
- {bedrooms} bedroom(s)
- {bathrooms} bathroom(s)
- Approximately {sqft} square feet total
- Single story layout{extra_rooms}

VISUAL REQUIREMENTS:
{ROOM_COLOR_INSTRUCTIONS}

LAYOUT GUIDELINES:
- Create a logical room arrangement with good flow
- Place wet rooms (kitchen, bathrooms) near each other for plumbing efficiency
- Ensure bedrooms have privacy from living spaces
- Include adequate circulation space (hallways)
- Add closets/storage where appropriate

Output a clean, top-down architectural floor plan view.
"""
    
    if include_structured_output:
        prompt += f"\n{STRUCTURED_OUTPUT_INSTRUCTIONS}"
    
    return prompt


def get_analysis_prompt(image_description: str = "") -> str:
    """
    Generate a prompt to analyze an existing floor plan.
    Used to extract structured data from plans that weren't generated
    with our color scheme.
    
    Args:
        image_description: Optional description of the floor plan
        
    Returns:
        Analysis prompt string
    """
    return f"""Analyze this floor plan and provide detailed information.

{f'Context: {image_description}' if image_description else ''}

Please identify and describe:

1. ROOM INVENTORY:
   List each room with its approximate size and function.

2. SPATIAL RELATIONSHIPS:
   Describe which rooms connect to each other.

3. CIRCULATION:
   Describe the flow through the space and any hallways/corridors.

4. ZONING:
   Identify public vs private zones, wet vs dry areas.

5. KEY METRICS:
   - Estimated total square footage
   - Number of bedrooms
   - Number of bathrooms
   - Any notable features

Format your response with clear headers for each section.
"""


def get_variation_prompt(
    base_description: str,
    variation_type: str = "layout",
    constraints: Optional[Dict] = None
) -> str:
    """
    Generate a prompt to create variations of an existing plan.
    Useful for exploring design diversity.
    
    Args:
        base_description: Description of the base floor plan
        variation_type: Type of variation ("layout", "size", "style", "circulation")
        constraints: Things to keep the same
        
    Returns:
        Variation prompt string
    """
    variation_instructions = {
        "layout": "Rearrange the room positions while keeping the same program",
        "size": "Scale the plan up or down while maintaining proportions",
        "style": "Apply a different architectural style to the layout",
        "circulation": "Modify the hallways and room connections",
        "massing": "Change the overall footprint shape",
        "program": "Swap room functions or add/remove rooms",
    }
    
    instruction = variation_instructions.get(
        variation_type, 
        "Create a meaningfully different version"
    )
    
    constraint_text = ""
    if constraints:
        constraint_items = [f"- {k}: {v}" for k, v in constraints.items()]
        constraint_text = f"\n\nKEEP THESE THE SAME:\n" + "\n".join(constraint_items)
    
    return f"""Create a variation of this floor plan:

BASE PLAN DESCRIPTION:
{base_description}

VARIATION TYPE: {variation_type}
{instruction}
{constraint_text}

VISUAL REQUIREMENTS:
{ROOM_COLOR_INSTRUCTIONS}

Generate a floor plan that is clearly different from the original
while still meeting the basic requirements.
"""


def get_batch_diversity_prompt(
    count: int = 5,
    bedrooms: int = 3,
    bathrooms: int = 2,
    sqft: int = 2000
) -> str:
    """
    Generate a prompt requesting multiple diverse floor plans at once.
    
    Args:
        count: Number of variations to generate
        bedrooms: Number of bedrooms
        bathrooms: Number of bathrooms
        sqft: Target square footage
        
    Returns:
        Batch prompt string
    """
    return f"""Generate {count} DISTINCTLY DIFFERENT floor plan concepts for:
- {bedrooms} bedrooms, {bathrooms} bathrooms
- Approximately {sqft} square feet

Each plan should explore a DIFFERENT approach:
1. Linear/elongated layout
2. Compact/square layout  
3. L-shaped or courtyard layout
4. Split bedroom layout (master separate)
5. Open concept vs traditional room divisions

For each plan, vary:
- Room positions and arrangements
- Circulation patterns
- Entry/exit locations
- Proportions and massing

{ROOM_COLOR_INSTRUCTIONS}

Number each plan clearly (Plan 1, Plan 2, etc.)
"""


def get_style_specific_prompt(
    style: str,
    bedrooms: int = 3,
    bathrooms: int = 2,
    sqft: int = 2000
) -> str:
    """
    Generate style-specific floor plan prompts.
    
    Args:
        style: Architectural style
        bedrooms: Number of bedrooms
        bathrooms: Number of bathrooms
        sqft: Target square footage
        
    Returns:
        Style-specific prompt string
    """
    style_characteristics = {
        "modern": """
- Open floor plan with minimal walls
- Large windows and indoor-outdoor flow
- Clean geometric shapes
- Integrated kitchen/living/dining
""",
        "traditional": """
- Defined rooms with clear boundaries
- Formal living and dining rooms
- Central hallway circulation
- Symmetrical layout preferred
""",
        "craftsman": """
- Built-in features and nooks
- Central fireplace as focal point
- Flow between living spaces
- Covered front porch entry
""",
        "farmhouse": """
- Large kitchen as heart of home
- Mudroom entry sequence
- Open living areas
- Connection to outdoor spaces
""",
        "mid_century": """
- Post-and-beam structure expression
- Floor-to-ceiling windows
- Integration with landscape
- Flexible open spaces
""",
        "mediterranean": """
- Courtyard or atrium spaces
- Formal entry/foyer
- Indoor-outdoor living emphasis
- Tile and archway elements
"""
    }
    
    characteristics = style_characteristics.get(style.lower(), "")
    
    return f"""Generate a {style.upper()} style floor plan:

PROGRAM:
- {bedrooms} bedrooms, {bathrooms} bathrooms
- Approximately {sqft} square feet

STYLE CHARACTERISTICS:
{characteristics}

{ROOM_COLOR_INSTRUCTIONS}

Ensure the layout strongly reflects {style} architectural principles.
"""





