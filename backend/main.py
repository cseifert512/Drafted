"""
Floor Plan Diversity Analyzer - Backend API
Main FastAPI application entry point
"""

# Load environment variables from .env file FIRST
from dotenv import load_dotenv
load_dotenv()

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes import router

# Try to import Drafted routes (may fail if editing module not set up)
try:
    from api.drafted_routes import router as drafted_router
    DRAFTED_AVAILABLE = True
except ImportError as e:
    print(f"[WARN] Drafted routes not available: {e}")
    DRAFTED_AVAILABLE = False

app = FastAPI(
    title="Floor Plan Diversity Analyzer",
    description="Analyze geometric diversity across AI-generated floor plans",
    version="1.0.0"
)

# Configure CORS for frontend (local and production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://drafted.site",
        "https://www.drafted.site",
        "https://drafted-diversity-frontend.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api")

# Include Drafted routes if available
if DRAFTED_AVAILABLE:
    app.include_router(drafted_router, prefix="/api")
    print("[OK] Drafted routes enabled")

# Mount static files for door/window assets
EDITING_DIR = Path(__file__).parent.parent / "editing"
DOORWINDOW_ASSETS_DIR = EDITING_DIR / "doorwindow_assets"
if DOORWINDOW_ASSETS_DIR.exists():
    app.mount(
        "/static/doorwindow_assets",
        StaticFiles(directory=str(DOORWINDOW_ASSETS_DIR)),
        name="doorwindow_assets"
    )
    print(f"[OK] Door/window assets mounted from {DOORWINDOW_ASSETS_DIR}")


@app.get("/")
async def root():
    return {
        "message": "Floor Plan Diversity Analyzer API",
        "docs": "/docs",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "drafted_available": DRAFTED_AVAILABLE if 'DRAFTED_AVAILABLE' in dir() else False,
    }

