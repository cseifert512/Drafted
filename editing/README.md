# Drafted.ai Floor Plan Generation & Editing

This module provides integration with **Drafted's production floor plan model** hosted on Runpod.

## Architecture

```
editing/
├── drafted_client.py      # Core API client for Drafted model
├── clip_tokenizer.py      # 77-token CLIP limit enforcement
├── svg_parser.py          # SVG + room data parsing
├── api_integration.py     # FastAPI integration layer
├── rooms.json             # Room type catalog (sizes, colors, prompts)
├── editing.md             # Original documentation from Drafted
├── test_drafted.py        # Test script
└── README.md              # This file
```

## Key Differences from Gemini

| Feature | Previous (Gemini) | Drafted Model |
|---------|------------------|---------------|
| **API** | Google AI Studio | Runpod endpoint |
| **Output** | Just image | Image + SVG + Room data |
| **Prompt format** | Natural language | Structured room list |
| **Token limit** | ~8K | **77 tokens (CLIP)** |
| **Editing** | Image-to-image | **Seed-based** (same seed + modified prompt) |
| **Room control** | Approximate | Precise sqft ranges |

## Quick Start

### 1. Set Environment Variable

```bash
# Add to your .env file
DRAFTED_API_ENDPOINT=https://your-runpod-endpoint/generate
```

### 2. Test the Client

```bash
cd editing
python test_drafted.py
```

### 3. Generate a Floor Plan

```python
from editing.drafted_client import (
    DraftedFloorPlanClient,
    RoomSpec,
    GenerationConfig
)

# Create client
client = DraftedFloorPlanClient()

# Define rooms
config = GenerationConfig(
    rooms=[
        RoomSpec("primary_bedroom", "M"),   # Medium primary suite
        RoomSpec("primary_bathroom", "M"),   # Spa-sized bath
        RoomSpec("primary_closet", "L"),     # Showroom closet
        RoomSpec("bedroom", "M"),
        RoomSpec("bathroom", "S"),
        RoomSpec("living", "M"),
        RoomSpec("kitchen", "M"),
    ],
    num_steps=30,
    guidance_scale=7.5,
    seed=42,  # Optional: fix seed for reproducibility
)

# Generate
result = await client.generate(config)

if result.success:
    # Save image
    with open("plan.jpg", "wb") as f:
        f.write(result.image_bytes)
    
    # Access room data
    for room in result.rooms:
        print(f"{room.room_type}: {room.area_sqft} sqft")
```

## Prompt Format

Drafted's model uses a specific prompt format:

```
area = 4487 sqft

primary bed = suite
primary bath = spa
primary closet = showroom
bed + closet = standard
bed + closet = standard
bath = powder
dining = everyday
garage = tandem
kitchen = galley
laundry = hatch
living = lounge
office = workroom
outdoor living = terrace
pantry = shelf
pool = lap
```

### Room Ordering (Critical!)

Rooms MUST be ordered by priority:
1. `primary bed` (primary_bedroom)
2. `primary bath` (primary_bathroom)
3. `primary closet` (primary_closet)
4. `bar`
5. `bath` (bathroom)
6. `bed + closet` (bedroom)
7. ...rest alphabetically by priority

### Size Tokens

Each room type has specific size tokens (NOT S/M/L/XL):

| Room Type | S | M | L | XL |
|-----------|---|---|---|-----|
| primary_bedroom | Intimate | Retreat | Suite | Presidential |
| primary_bathroom | Ensuite | Spa | Oasis | Sanctuary |
| primary_closet | Petite | Gallery | Showroom | Atelier |
| kitchen | Compact | Galley | Island | Chef's |
| living | Snug | Lounge | Great | Pavilion |
| office | Study | Workroom | Atelier | Library |

See `rooms.json` for complete mapping.

## Seed-Based Editing

Unlike Gemini's image-to-image editing, Drafted uses **seed-based editing**:

```python
# Generate original
original = await client.generate(config)
print(f"Seed: {original.seed_used}")  # e.g., 12345

# Edit by modifying prompt with SAME seed
edited = await client.edit_with_seed(
    original,
    add_rooms=[RoomSpec("office", "M")],
    adjust_sqft=500,  # Add 500 sqft
)

# Result: Similar layout but adapted with new room
```

This works because the diffusion model produces **similar designs** when using the same seed with slightly different prompts.

## API Integration

To add Drafted endpoints to your FastAPI backend:

```python
# In backend/api/routes.py

from editing.api_integration import DraftedAPIIntegration

drafted = DraftedAPIIntegration()

@router.get("/drafted/options")
async def get_drafted_options():
    """Get available room types and sizes."""
    return drafted.get_room_options()

@router.post("/drafted/generate")
async def generate_drafted_plan(request: DraftedGenerateRequest):
    """Generate a floor plan using Drafted model."""
    config = drafted.build_config_from_request(
        rooms=request.rooms,
        target_sqft=request.target_sqft,
        seed=request.seed
    )
    return await drafted.generate(config)

@router.post("/drafted/edit")
async def edit_drafted_plan(request: DraftedEditRequest):
    """Edit a floor plan using seed-based editing."""
    return await drafted.edit_plan(
        original_result=request.original,
        add_rooms=request.add_rooms,
        remove_rooms=request.remove_rooms,
        adjust_sqft=request.adjust_sqft
    )
```

## Token Limit (77 Tokens)

The model uses CLIP tokenization with a **77 token limit**. The prompt builder validates this:

```python
from editing.clip_tokenizer import validate_prompt, count_tokens

prompt = builder.build_prompt(config)
is_valid, count, message = validate_prompt(prompt)

if not is_valid:
    print(f"WARNING: {message}")
    # Consider removing lower-priority rooms
```

## Response Format

Generation returns rich data:

```json
{
  "id": "20260114_173535_602604_4fd309",
  "prompt": "area = 2500 sqft\nprimary bed = retreat\n...",
  "image_jpg_base64": "/9j/4AAQ...",
  "num_steps": 30,
  "guidance_scale": 7.5,
  "seed": 42,
  "elapsed_s": 2.26,
  "output": {
    "ok": true,
    "svg": "<svg>...</svg>",
    "rooms": [
      {
        "room_type": "primary_bedroom",
        "canonical_key": "primary_bedroom",
        "area_sqft": 167.33,
        "width_inches": 144.0,
        "height_inches": 186.0
      }
    ],
    "total_area_sqft": 903.03
  }
}
```

## Files Reference

### `rooms.json`
Complete catalog of room types with:
- Display names and icons
- Size definitions (S/M/L/XL) with sqft ranges
- Prompt tokens for each size
- Priority for prompt ordering
- Training/UI colors

### `drafted_client.py`
- `RoomsCatalog`: Loads and queries rooms.json
- `DraftedPromptBuilder`: Builds prompts with correct format
- `DraftedFloorPlanClient`: Async API client

### `clip_tokenizer.py`
- `count_tokens()`: Count CLIP tokens in text
- `validate_prompt()`: Check against 77 token limit
- `truncate_prompt()`: Safely truncate if needed

### `svg_parser.py`
- `SVGParser`: Extract room polygons from SVG
- `svg_to_png()`: Convert SVG to PNG (requires cairosvg)

### `api_integration.py`
- `DraftedAPIIntegration`: High-level integration class
- `create_drafted_routes()`: FastAPI route factory

## Next Steps

1. **Frontend Integration**: Update React components to use new room selection UI
2. **Edit History**: Track edit chains with seed + prompt history
3. **Canvas Editor**: Interactive room manipulation (drag, resize)
4. **Batch Diversity**: Generate multiple plans with different seeds








