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

- **AI Generation**: Generate 4-12 diverse floor plans with one click using Gemini 2.0 Flash
- **10 Layout Variations**: Linear, L-shaped, open concept, split bedroom, and more
- **Dual Output**: Colored version for analysis + stylized rendered version for display
- **Edit Plans**: AI-powered image-to-image editing (add pool, open concept, expand rooms, etc.)
- **Smart Naming**: AI-generated descriptive names like "Spacious Open-Concept Ranch" with rename support
- **Two-Phase Processing**: Plans display immediately while diversity analysis runs in background
- **Real-time Progress**: Visual indicators show generation and analysis status
- **Upload Support**: Analyze your own existing floor plan images
- **Beautiful UI**: Clean, modern interface matching the Drafted.ai aesthetic

## Architecture

```
├── backend/                  # Python FastAPI backend
│   ├── api/                  # REST API endpoints
│   │   ├── routes.py         # All API routes
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
│   ├── generation/           # Gemini AI integration
│   │   ├── gemini_client.py        # API client with retry logic
│   │   └── prompt_templates.py     # Engineered prompts
│   └── utils/                # Utilities
│
├── frontend/                 # Next.js React frontend
│   ├── app/                  # Next.js app router
│   │   ├── page.tsx          # Main application
│   │   └── how-it-works/     # Documentation page
│   ├── components/           # React components
│   │   ├── layout/           # Header, Section
│   │   ├── sidebar/          # GenerationSidebar
│   │   ├── drafts/           # DraftGrid (stylized display, editable names)
│   │   ├── upload/           # DropZone
│   │   ├── visualization/    # ScatterPlot, DiversityScore
│   │   ├── generation/       # GenerationForm, GenerationProgress
│   │   ├── analysis/         # AnalysisPanel
│   │   └── EditPlanModal.tsx # AI-powered plan editing modal
│   ├── hooks/                # Custom React hooks
│   │   ├── useAnalysis.ts    # Upload/analysis state
│   │   └── useGeneration.ts  # Generation state (two-phase, edit, rename)
│   └── lib/                  # API client, types, utilities
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
GEMINI_API_KEY=your_google_ai_studio_api_key
```

**Frontend** (`frontend/.env.local` - for production):
```bash
NEXT_PUBLIC_API_URL=https://your-backend-url.onrender.com
```

Get your Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

### Usage

1. Open http://localhost:3000 in your browser
2. Choose your workflow:
   - **Generate with AI**: Configure bedrooms, bathrooms, style, count → Generate diverse plans
   - **Upload Existing**: Upload 10-20 floor plan images (PNG or JPG)
3. Watch the two-phase process:
   - Plans appear immediately after generation
   - "Generating Diversity Report" indicator shows analysis progress
4. View results: diversity score, scatter plot, and metric breakdown

## API Endpoints

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

### Smart Naming
AI generates descriptive names for each floor plan:
- Analyzes layout and features to create names like "Modern L-Shaped with Central Kitchen"
- Users can rename plans with custom names
- Names persist across sessions

### Synthetic Fallback
If Gemini API fails (rate limits, etc.), the system generates synthetic placeholder images to ensure the prototype always produces output.

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
- Google Generative AI (Gemini 2.0 Flash)
- OpenCV, scikit-image
- PyTorch (ResNet50)
- scikit-learn, UMAP
- NetworkX

**Frontend:**
- Next.js 14 (App Router)
- React 18, TypeScript
- D3.js
- TailwindCSS
- Framer Motion

## License

MIT License - Built as a prototype for [Drafted.ai](https://drafted.ai)
