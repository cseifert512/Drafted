# Floor Plan Diversity Analyzer

A prototype tool for analyzing geometric diversity across AI-generated floor plans. Built to demonstrate the need for diversity governance in AI-generated architectural designs.

## Overview

This tool:
1. **Generates** diverse floor plans using Google Gemini AI, OR accepts uploaded images
2. Extracts geometric features (plan topology, massing, circulation)
3. Computes diversity metrics between them
4. Visualizes clustering on a scatter plot
5. Outputs a diversity score (0-1 scale)

## Key Features

- **AI Generation**: Generate 4-12 diverse floor plans with one click using Gemini
- **10 Layout Variations**: Linear, L-shaped, open concept, split bedroom, and more
- **Automatic Analysis**: Generated plans are immediately analyzed for diversity
- **Upload Support**: Analyze your own existing floor plan images

## Architecture

```
├── backend/                  # Python FastAPI backend
│   ├── api/                  # REST API endpoints
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
│   ├── generation/           # Nanobana API integration
│   └── utils/                # Utilities
│
└── frontend/                 # Next.js React frontend
    ├── app/                  # Next.js app router
    ├── components/           # React components
    │   ├── layout/           # Header, Hero, Section
    │   ├── upload/           # DropZone, PlanGallery
    │   ├── visualization/    # ScatterPlot, DiversityScore
    │   ├── cards/            # PlanCard, ScoreCard
    │   └── analysis/         # AnalysisPanel
    ├── hooks/                # Custom React hooks
    └── lib/                  # API client, types, utilities
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

- Python 3.10+
- Node.js 18+
- pip / npm or pnpm

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

# Run the server
uvicorn main:app --reload --port 8000
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

Create a `.env` file in the `backend/` directory:

```bash
# Required for AI generation
GEMINI_API_KEY=your_google_ai_studio_api_key
```

Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

### Usage

1. Open http://localhost:3000 in your browser
2. Choose your workflow:
   - **Generate with AI**: Configure bedrooms, style, count → Generate diverse plans
   - **Upload Existing**: Upload 10-20 floor plan images (PNG or JPG)
3. View results: diversity score, scatter plot, and metric breakdown

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

### Generation Request Example

```json
POST /api/generate
{
  "bedrooms": 3,
  "bathrooms": 2,
  "sqft": 2000,
  "style": "modern",
  "count": 6,
  "additional_rooms": ["office", "mudroom"]
}
```

## Color-Coded Floor Plans

For best results, generate floor plans with these room colors:

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
- Negative prompting to avoid furniture, 3D views, labels

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

See `prompt_builder.py` for the complete prompt engineering system.

## Tech Stack

**Backend:**
- FastAPI
- Google Generative AI (Gemini)
- OpenCV, scikit-image
- PyTorch (ResNet50)
- scikit-learn, UMAP
- NetworkX

**Frontend:**
- Next.js 14
- React, TypeScript
- D3.js
- TailwindCSS
- Framer Motion

## License

MIT License - Built as a prototype for Drafted.ai

