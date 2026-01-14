"""
Floor Plan Diversity Analyzer - Backend API
Main FastAPI application entry point
"""

# Load environment variables from .env file FIRST
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

