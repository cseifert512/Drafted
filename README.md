# Floor Plan Diversity Analyzer

A prototype tool for analyzing geometric diversity across AI-generated floor plans. Built to demonstrate the need for diversity governance in AI-generated architectural designs.

## Overview

This tool:
1. **Generates** diverse floor plans using Google Gemini AI, OR accepts uploaded images
2. Extracts geometric features (plan topology, massing, circulation)
3. Computes diversity metrics between them
4. Visualizes clustering on a scatter plot
5. Outputs a diversity score (0-1 scale)

## Live Demo

- **Frontend**: [https://drafted.site](https://drafted.site)
- **Backend API**: [https://drafted-diversity-api.onrender.com](https://drafted-diversity-api.onrender.com)

## Key Features

### Floor Plan Generation
- **Drafted.ai Integration**: Generate precise floor plans using Drafted's production diffusion model with room-level control
- **Seed-Based Editing**: Edit plans by modifying the prompt while keeping the same seed for consistent variations
- **Room Configuration**: Specify exact room types (30+ options) and sizes (S/M/L/XL) with CLIP-validated prompts
- **SVG Output**: Vector floor plans with color-coded rooms for easy parsing and editing

### Diversity Analysis (Gemini)
- **AI Generation**: Generate 4-12 diverse floor plans with one click using Gemini 2.0 Flash
- **10 Layout Variations**: Linear, L-shaped, open concept, split bedroom, and more
- **Dual Output**: Colored version for analysis + stylized rendered version for display
- **Edit Plans**: AI-powered image-to-image editing (add pool, open concept, expand rooms, etc.)
- **Smart Naming**: AI-generated descriptive names like "Spacious Open-Concept Ranch" with rename support

### 🆕 Door & Window Editor
- **80+ SVG Assets**: Comprehensive library of door and window symbols organized by category
- **Asset Categories**: Interior doors (single, double, bifold), exterior doors, sliding doors, French doors, garage doors, windows
- **CAD-Style Placement**: Click walls to place openings with drag-to-define width
- **Wall Detection**: Automatic wall segment extraction from SVG for precise placement
- **Photorealistic Re-rendering**: Gemini-powered img2img to render placed doors/windows realistically
- **Surgical Blending**: AI-validated compositing that only modifies the door/window area
- **Validation Pipeline**: Automatic rejection and retry of hallucinated outputs

### 🆕 Photorealistic Staging
- **Gemini Flash 3.0**: Transform schematic floor plans into photorealistic top-down renders
- **Smart Aspect Ratios**: Automatic selection of optimal canvas size (1:1, 4:3, 3:4, 16:9, 9:16)
- **Room-Aware Prompts**: Custom staging prompts based on room types (kitchen, bedroom, etc.)
- **High-Fidelity Output**: Furniture, flooring, materials, and lighting rendered per room

### Editor & Tools
- **Floor Plan Editor**: Interactive SVG editor with drag-and-drop room manipulation
- **Hybrid Mode**: Edit rooms visually, then regenerate with AI to refine the layout
- **Room Palette**: Add rooms from a categorized palette with proper sizing
- **Grid Snapping**: Precise room placement with configurable grid
- **Wall Highlight Layer**: Visual feedback when hovering over placeable walls

### 🆕 Tutorial System
- **Interactive Onboarding**: Step-by-step tutorials for new users
- **Spotlight Highlighting**: Focus attention on specific UI elements
- **Contextual Tooltips**: Inline guidance during editing workflows

### Dev Mode (Debugging)
- **Model Transparency**: Toggle-activated developer mode to understand AI behavior
- **Visual Comparison**: Side-by-side, overlay, and slider views comparing before/after edits
- **JPEG/SVG Toggle**: Switch between raster and vector views for each plan
- **Room Deltas**: Color-coded table showing added, removed, and modified rooms
- **Prompt Diff**: Line-by-line comparison of original vs edited prompts with syntax highlighting
- **Generation Metadata**: Seeds, timing, model parameters, and area analysis

### 🆕 Advanced Dev Mode Analytics
- **Batch Runner**: Generate multiple plans with same config for statistical analysis
- **Consistency Metrics**: Analyze area, position, and room count consistency across batches
- **Adjacency Graph**: Visualize room connectivity and topology
- **Difference Heatmap**: Pixel-level comparison between before/after edits
- **Position Scatter**: Plot room centroid distributions across generations
- **Size Distribution**: Box plots showing room size variance
- **Sensitivity Matrix**: Analyze model sensitivity to parameter changes
- **Room Overlay View**: Superimpose room polygons from multiple plans
- **Linked SVG Viewer**: Synchronized pan/zoom for detailed SVG comparison
- **Rejected Generations**: View Gemini outputs that failed validation with failure reasons

### General
- **Two-Phase Processing**: Plans display immediately while diversity analysis runs in background
- **Real-time Progress**: Visual indicators show generation and analysis status
- **Upload Support**: Analyze your own existing floor plan images
- **Beautiful UI**: Clean, modern interface matching the Drafted.ai aesthetic

## Architecture

```
├── backend/                  # Python FastAPI backend
│   ├── api/                  # REST API endpoints
│   │   ├── routes.py         # Gemini generation routes
│   │   ├── drafted_routes.py # Drafted.ai generation + opening routes
│   │   └── schemas.py        # Pydantic models
│   ├── extractors/           # Feature extraction modules
│   │   ├── color_segmentation.py   # Room detection via color
│   │   ├── geometric.py            # Shape/size metrics
│   │   ├── graph_topology.py       # Adjacency analysis
│   │   ├── cnn_embeddings.py       # Deep learning features
│   │   └── circulation.py          # Path analysis
│   ├── diversity/            # Diversity computation
│   │   ├── metrics.py              # Individual metrics
│   │   ├── aggregator.py           # Combined score
│   │   └── visualization.py        # Scatter plot data
│   ├── generation/           # AI generation modules
│   │   ├── gemini_client.py        # Gemini API client with retry logic
│   │   ├── gemini_staging.py       # Photorealistic staging (img2img)
│   │   ├── prompt_templates.py     # Engineered prompts
│   │   ├── prompt_builder.py       # Dynamic prompt construction
│   │   └── response_parser.py      # Parse Gemini responses
│   └── utils/                # Utilities
│       ├── surgical_blend.py       # Door/window compositing
│       └── validate_generation.py  # Hallucination detection
│
├── editing/                  # Drafted.ai integration module
│   ├── api_integration.py    # FastAPI integration layer
│   ├── drafted_client.py     # Runpod endpoint client
│   ├── svg_parser.py         # SVG floor plan parser
│   ├── clip_tokenizer.py     # CLIP token validation
│   ├── rooms.json            # Room type definitions (30+ types)
│   └── doorwindow_assets/    # Door & window SVG library
│       ├── manifest.json           # Asset metadata
│       └── *.svg                   # 80+ door/window assets
│
├── frontend/                 # Next.js React frontend
│   ├── app/                  # Next.js app router
│   │   ├── page.tsx          # Main generation page
│   │   ├── editor/           # Floor plan editor page
│   │   └── how-it-works/     # Documentation page
│   ├── components/           # React components
│   │   ├── layout/           # Header, Section
│   │   ├── drafted/          # Drafted generation components
│   │   ├── editor/           # Floor plan editor components
│   │   │   ├── OpeningPlacementModal.tsx  # Door/window picker
│   │   │   ├── OpeningPreviewOverlay.tsx  # Placement preview
│   │   │   ├── WallHighlightLayer.tsx     # Wall selection UI
│   │   │   └── ...
│   │   ├── dev/              # Dev mode debugging components
│   │   │   ├── BatchRunner.tsx           # Batch generation
│   │   │   ├── ConsistencyMetrics.tsx    # Statistical analysis
│   │   │   ├── AdjacencyGraph.tsx        # Room connectivity
│   │   │   ├── DifferenceHeatmap.tsx     # Visual diff
│   │   │   ├── PositionScatter.tsx       # Position analysis
│   │   │   ├── SizeDistribution.tsx      # Size box plots
│   │   │   ├── SensitivityMatrix.tsx     # Parameter sensitivity
│   │   │   ├── RoomOverlayView.tsx       # Room overlay
│   │   │   ├── LinkedSVGViewer.tsx       # Linked pan/zoom
│   │   │   └── ...
│   │   ├── tutorial/         # Onboarding components
│   │   │   ├── TutorialOverlay.tsx
│   │   │   ├── TutorialSpotlight.tsx
│   │   │   └── TutorialTooltip.tsx
│   │   ├── sidebar/          # GenerationSidebar
│   │   ├── drafts/           # DraftGrid
│   │   ├── upload/           # DropZone
│   │   ├── visualization/    # ScatterPlot, DiversityScore
│   │   ├── generation/       # GenerationForm, GenerationProgress
│   │   ├── analysis/         # AnalysisPanel
│   │   └── providers/        # React context providers
│   ├── contexts/             # React contexts
│   │   ├── DevModeContext.tsx    # Dev mode state management
│   │   ├── TutorialContext.tsx   # Tutorial state management
│   │   └── ThemeContext.tsx      # Theme state management
│   ├── hooks/                # Custom React hooks
│   │   ├── useAnalysis.ts        # Upload/analysis state
│   │   ├── useGeneration.ts      # Gemini generation state
│   │   ├── useDraftedGeneration.ts  # Drafted generation state
│   │   ├── useFloorPlanEditor.ts    # Editor state management
│   │   ├── useOpeningEditor.ts      # Door/window placement
│   │   └── useOpeningDrag.ts        # CAD-style drag placement
│   └── lib/                  # API client, types, utilities
│       ├── drafted-api.ts        # Drafted API client
│       ├── drafted-types.ts      # TypeScript types
│       ├── editor/               # Editor utilities
│       │   ├── wallDetection.ts      # Extract walls from SVG
│       │   ├── openingDetection.ts   # Detect existing openings
│       │   ├── coordinateMapping.ts  # SVG↔PNG coordinate transforms
│       │   ├── assetManifest.ts      # Door/window asset types
│       │   └── svgOpenings.ts        # Opening SVG manipulation
│       └── dev/                  # Dev mode utilities
│           ├── batchAnalysis.ts      # Batch statistics
│           ├── deltaUtils.ts         # Room delta calculations
│           └── promptDiff.ts         # Prompt comparison logic
│
├── debug_blend/              # Debug output for opening edits
│
└── render.yaml               # Render deployment blueprint
```

## Features Extracted

| Dimension | Features | Method |
|-----------|----------|--------|
| Spatial Topology | Room adjacencies, connectivity | Color segmentation + graph analysis |
| Massing | Room sizes, aspect ratios, footprint | Contour analysis |
| Circulation | Path depth, corridor efficiency | Skeleton analysis |
| Program Distribution | Room type counts, zoning | Color classification |
| Overall Pattern | High-level embedding | ResNet50 CNN |

## Diversity Metrics

1. **Coverage Score** - Convex hull area in reduced feature space
2. **Dispersion Score** - Mean pairwise distance between plans
3. **Cluster Entropy** - Shannon entropy of cluster assignments
4. **Graph Diversity** - Average edit distance between topology graphs

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- pip / npm or pnpm
- Google AI Studio API key

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file with your API key
echo GEMINI_API_KEY=your_api_key_here > .env

# Run the server
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run the development server
npm run dev
```

### Environment Variables

**Backend** (`backend/.env`):
```bash
# Required for Gemini generation (diversity analysis)
GEMINI_API_KEY=your_google_ai_studio_api_key

# Optional: For Drafted.ai generation (precise room control)
DRAFTED_API_ENDPOINT=https://api.runpod.ai/v2/your-endpoint-id

# Optional: Enable debug output for door/window blending
DEBUG_BLEND=true
```

**Frontend** (`frontend/.env.local` - for production):
```bash
NEXT_PUBLIC_API_URL=https://your-backend-url.onrender.com
```

Get your Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

For Drafted.ai integration, you'll need access to a Runpod endpoint running the Drafted diffusion model.

### Usage

1. Open http://localhost:3000 in your browser
2. Choose your workflow:
   - **Generate with AI**: Configure rooms with precise sizes → Generate floor plans
   - **Upload Existing**: Upload 10-20 floor plan images (PNG or JPG) for diversity analysis
3. Edit plans:
   - Click "Edit" on any plan to add/remove/resize rooms
   - Use seed-based editing to maintain layout coherence
4. **Add Doors & Windows**:
   - Enable opening mode in the editor
   - Hover over walls to highlight them
   - Click to place a door or window from the asset library
   - Choose swing direction for doors
   - Wait for photorealistic re-render
5. Use the Editor (`/editor`):
   - Drag and drop rooms from the palette
   - Resize rooms with handles
   - Switch to hybrid mode to regenerate with AI
6. Enable Dev Mode:
   - Toggle "DEV" in the header for debugging tools
   - Compare before/after plans visually
   - Inspect room deltas and prompt changes
   - Run batch generations for statistical analysis

## API Endpoints

### Gemini Generation (Diversity Analysis)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate` | POST | Generate floor plans with Gemini AI |
| `/api/generate/options` | GET | Get available generation options |
| `/api/upload` | POST | Upload floor plan images |
| `/api/plans` | GET | List uploaded plans |
| `/api/plans/{id}` | DELETE | Delete a plan |
| `/api/analyze` | POST | Run diversity analysis |
| `/api/plan/{id}/thumbnail` | GET | Get plan thumbnail |
| `/api/plan/{id}/stylized` | GET | Get stylized (rendered) version of plan |
| `/api/plan/{id}/edit` | POST | Edit plan with AI (image-to-image) |
| `/api/plan/{id}/rename` | PATCH | Rename a plan |
| `/health` | GET | Health check |

### Drafted.ai Generation (Precise Control)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/drafted/status` | GET | Check if Drafted API is available |
| `/api/drafted/options` | GET | Get available room types and sizes |
| `/api/drafted/validate` | POST | Validate generation config (token count) |
| `/api/drafted/generate` | POST | Generate a floor plan with room specs |
| `/api/drafted/generate/batch` | POST | Generate multiple plans with different seeds |
| `/api/drafted/edit` | POST | Edit plan using seed-based editing |
| `/api/drafted/rooms` | GET | Get complete rooms.json schema |
| `/api/drafted/stage` | POST | Stage floor plan SVG to photorealistic render |
| `/api/drafted/generate-and-stage` | POST | Generate + stage in one call |

### Door & Window Openings

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/drafted/doorwindow-assets` | GET | Get door/window asset manifest |
| `/api/drafted/openings/add` | POST | Add door/window to floor plan |
| `/api/drafted/openings/status/{job_id}` | GET | Poll opening render status |
| `/api/drafted/openings/{plan_id}/{opening_id}` | DELETE | Remove an opening |

### Debug Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/drafted/debug/blend-jobs` | GET | List debug blend jobs |
| `/api/drafted/debug/blend-jobs/{job_id}/{filename}` | GET | Get debug file (PNG/SVG) |
| `/api/drafted/debug/opening-job/{job_id}` | GET | Get detailed opening job debug info |

### Generation Request Example

```json
POST /api/generate
{
  "bedrooms": 3,
  "bathrooms": 2,
  "sqft": 2000,
  "style": "modern",
  "count": 6,
  "additional_rooms": ["office", "mudroom"],
  "skip_analysis": false
}
```

### Analysis Request Example

```json
POST /api/analyze
{
  "plan_ids": ["gen_abc123", "gen_def456", "gen_ghi789"]
}
```

### Edit Plan Request Example

```json
POST /api/plan/gen_abc123/edit
{
  "instruction": "Add a pool to the backyard"
}
```

Response includes a new plan with both colored and stylized versions.

### Add Opening Request Example

```json
POST /api/drafted/openings/add
{
  "plan_id": "plan_abc123",
  "svg": "<svg>...</svg>",
  "cropped_svg": "<svg>...</svg>",
  "rendered_image_base64": "...",
  "opening": {
    "type": "interior_door",
    "wall_id": "wall_R001_R002",
    "position_on_wall": 0.5,
    "width_inches": 36,
    "swing_direction": "right",
    "wall_coords": {
      "start_x": 100,
      "start_y": 200,
      "end_x": 200,
      "end_y": 200
    }
  },
  "canonical_room_keys": ["living", "kitchen", "bedroom"],
  "asset_info": {
    "filename": "door_interior_single_36.svg",
    "category": "DoorInteriorSingle",
    "display_name": "36\" Interior Door",
    "description": "Standard interior swing door"
  }
}
```

## Color-Coded Floor Plans

For best results, floor plans use these room colors:

| Room Type | Color | Hex |
|-----------|-------|-----|
| Living | Light blue | #A8D5E5 |
| Bedroom | Lavender | #E6E6FA |
| Bathroom | Mint green | #98FB98 |
| Kitchen | Coral | #FF7F50 |
| Hallway | Light gray | #F5F5F5 |
| Storage | Burlywood | #DEB887 |
| Outdoor | Light green | #90EE90 |

## Door & Window Assets

The `editing/doorwindow_assets/` folder contains 80+ SVG assets:

| Category | Asset Types | Sizes |
|----------|-------------|-------|
| Interior Single | Standard swing doors | 28", 30", 32", 36" |
| Interior Double | Double swing doors | 56", 60", 64", 72" |
| Interior Bifold | Bifold closet doors | 20"-96" |
| Exterior Single | Entry doors | 30"-42" |
| Exterior Double | Double entry doors | 60"-72" |
| Exterior Sliding | Sliding glass doors | 60"-168" |
| Exterior Bifold | Folding patio doors | 192"-252" |
| Garage Single | Single garage doors | 8ft |
| Garage Double | Double garage doors | 16ft |
| Windows | Standard windows | 16"-196" |

## Gemini AI Integration

The `backend/generation/` module includes:

### Prompt Engineering
Carefully crafted prompts ensure Gemini outputs analyzable floor plans:
- Strict color palette enforcement for room detection
- 10 layout variation strategies (linear, L-shaped, courtyard, etc.)
- Response modality set to IMAGE for direct image generation

### Layout Variations
Each generated plan uses a different layout strategy:
1. **Linear** - Rooms arranged along a corridor
2. **Compact** - Efficient square footprint
3. **L-Shaped** - Two distinct wings
4. **Open Concept** - Minimal interior walls
5. **Split Bedroom** - Master on opposite end
6. **Courtyard** - Rooms around central space
7. **Cluster** - Grouped by function
8. **Circular Flow** - Loop circulation
9. **Front-to-Back** - Public to private gradient
10. **Offset** - Staggered room positions

### Dual Output Processing
Each generated plan produces two versions:
- **Colored Version**: Color-coded rooms for feature extraction and analysis
- **Stylized Version**: Professional architectural rendering for display

### AI-Powered Editing
Edit existing plans using natural language instructions:
- Image-to-image modification via Gemini
- Quick edits: Add pool, open concept, expand rooms, add office, etc.
- Custom instructions for any modification
- Preserves original plan while creating new edited version

### Photorealistic Staging
Transform schematic floor plans into photorealistic renders:
- Uses Gemini Flash 3.0 for img2img transformation
- Automatic aspect ratio optimization
- Room-specific materials and furniture
- Preserves wall geometry and openings

### Smart Naming
AI generates descriptive names for each floor plan:
- Analyzes layout and features to create names like "Modern L-Shaped with Central Kitchen"
- Users can rename plans with custom names
- Names persist across sessions

### Synthetic Fallback
If Gemini API fails (rate limits, etc.), the system generates synthetic placeholder images to ensure the prototype always produces output.

## Drafted.ai Integration

The `editing/` module provides integration with Drafted's production diffusion model for precise floor plan generation.

### Room Configuration

Generate floor plans with exact room specifications:

```json
POST /api/drafted/generate
{
  "rooms": [
    { "room_type": "primary_bedroom", "size": "M" },
    { "room_type": "primary_bathroom", "size": "M" },
    { "room_type": "kitchen", "size": "L" },
    { "room_type": "living", "size": "L" },
    { "room_type": "garage", "size": "M" }
  ],
  "num_steps": 30,
  "guidance_scale": 7.5
}
```

### Available Room Types

The system supports 30+ room types organized by category:

| Category | Room Types |
|----------|------------|
| Primary Suite | primary_bedroom, primary_bathroom, primary_closet |
| Bedrooms | bedroom (multiple allowed) |
| Bathrooms | bathroom (multiple allowed) |
| Living Spaces | living, family_room, den, sunroom |
| Dining | dining, nook |
| Kitchen | kitchen, pantry, bar |
| Utility | laundry, mudroom, storage, garage |
| Outdoor | outdoor_living, front_porch, pool |
| Flex | office, rec_room, theater, gym, foyer |

### Seed-Based Editing

Edit existing plans while maintaining layout coherence:

```json
POST /api/drafted/edit
{
  "original": {
    "plan_id": "plan_123",
    "seed_used": 42,
    "prompt_used": "area = 2500 sqft\nprimary_bedroom = ..."
  },
  "add_rooms": [{ "room_type": "office", "size": "M" }],
  "remove_rooms": ["garage"],
  "resize_rooms": { "kitchen": "XL" }
}
```

### CLIP Token Validation

Prompts are validated against CLIP's 77-token limit before generation to ensure the model receives complete instructions.

## Dev Mode (Debugging)

A toggle-activated developer mode that provides transparency into the AI generation and editing process.

### Enabling Dev Mode

1. Click the **DEV** toggle in the header (next to the Drafted logo)
2. The toggle turns coral when active with a pulsing green indicator
3. Edit any floor plan to capture comparison data
4. The Dev Mode panel opens automatically after edits

### Features

#### Visual Comparison
- **Side-by-Side**: View original and edited plans next to each other
- **Overlay**: Stack plans with adjustable opacity
- **Slider**: Interactive before/after reveal slider
- **Format Toggle**: Switch between JPEG and SVG views independently

#### Room Deltas
Shows a detailed breakdown of room changes:
- **Added** (green): New rooms in the edited plan
- **Removed** (red): Rooms deleted from the original
- **Modified** (yellow): Rooms with changed size or area
- Summary statistics: count changes and total area delta

#### Prompt Comparison
- Side-by-side view of original vs edited prompts
- Line-by-line diff with syntax highlighting
- Token count display for each prompt
- Copy-to-clipboard functionality

#### Metadata
- Seed values (original and edited)
- Generation timing
- Model parameters (steps, guidance scale)
- Area analysis and room counts

#### Batch Analysis (Advanced)
- Run N generations with identical config
- Statistical analysis: mean, std dev, quartiles
- Consistency scoring across batches
- Export data for external analysis

#### Opening Edit Debugging
- View annotated input PNG (blue box + red boundary)
- See rejected Gemini generations with failure reasons
- Inspect Gemini prompt used for door/window editing
- Track validation metrics (red marker detection, outside-bbox artifacts)

### Architecture

```
frontend/
  contexts/
    DevModeContext.tsx      # Global state with localStorage persistence
    TutorialContext.tsx     # Tutorial state management
  components/
    dev/
      DevModeToggle.tsx     # Header toggle button
      DevModePanel.tsx      # Main debugging panel
      DevCompareView.tsx    # Visual plan comparison
      RoomDeltaView.tsx     # Room changes table
      PromptCompareView.tsx # Prompt diff display
      ImageFormatToggle.tsx # JPEG/SVG switcher
      BatchRunner.tsx       # Batch generation UI
      ConsistencyMetrics.tsx # Statistical displays
      AdjacencyGraph.tsx    # Room connectivity graph
      DifferenceHeatmap.tsx # Pixel diff visualization
      PositionScatter.tsx   # Centroid scatter plot
      SizeDistribution.tsx  # Box plot charts
      SensitivityMatrix.tsx # Parameter sensitivity
      RoomOverlayView.tsx   # Room polygon overlay
      LinkedSVGViewer.tsx   # Synchronized pan/zoom
  lib/
    dev/
      batchAnalysis.ts      # Batch statistics calculations
      deltaUtils.ts         # Room delta calculations
      promptDiff.ts         # Prompt comparison logic
```

## Deployment (Render)

This project includes a `render.yaml` Blueprint for easy deployment:

1. Fork this repository
2. Create a new Blueprint on [Render](https://render.com)
3. Connect your GitHub repo
4. Set the `GEMINI_API_KEY` environment variable in the backend service
5. Set `NEXT_PUBLIC_API_URL` in the frontend to your backend URL

### Services Created
- **drafted-diversity-api**: Python FastAPI backend
- **drafted-diversity-frontend**: Next.js frontend

## Tech Stack

**Backend:**
- FastAPI
- Google Generative AI (Gemini 2.0 Flash, Gemini 3 Pro Image Preview)
- OpenCV, scikit-image
- PyTorch (ResNet50)
- scikit-learn, UMAP
- NetworkX
- Pillow (PIL) for image processing
- CairoSVG for SVG rendering

**Frontend:**
- Next.js 14 (App Router)
- React 18, TypeScript
- D3.js
- TailwindCSS
- Framer Motion
- Lucide React (icons)

## Future Roadmap

See `editing/FEATURE_ROADMAP.md` for planned features:
- Smart Suggestions Panel
- Magnetic Snapping Visual Feedback
- Design Themes (Modern Farmhouse, Mid-Century, etc.)
- Favorites & Collections
- Gamification (Design Score + Achievements)

## License

MIT License - Built as a prototype for [Drafted.ai](https://drafted.ai)
