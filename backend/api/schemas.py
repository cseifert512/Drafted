"""
Pydantic schemas for API request/response models.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime


class PlanMetadata(BaseModel):
    """Metadata for a single floor plan."""
    id: str
    name: str
    filename: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "plan_001",
                "name": "Modern 3BR Layout",
                "filename": "plan_001.png"
            }
        }


class RoomInfo(BaseModel):
    """Information about a detected room."""
    type: str
    area: float
    centroid: Dict[str, float]
    aspect_ratio: float


class PlanFeatures(BaseModel):
    """Extracted features for a single floor plan."""
    plan_id: str
    room_count: int
    rooms: List[RoomInfo]
    feature_vector: List[float]
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        json_schema_extra = {
            "example": {
                "plan_id": "plan_001",
                "room_count": 6,
                "rooms": [
                    {"type": "living", "area": 450.0, "centroid": {"x": 200, "y": 150}, "aspect_ratio": 1.2}
                ],
                "feature_vector": [0.1, 0.2, 0.3],
                "metadata": {"total_area": 1200}
            }
        }


class MetricBreakdown(BaseModel):
    """Breakdown of a single diversity metric."""
    name: str
    display_name: str
    score: float = Field(ge=0, le=1)
    weight: float
    contribution: float


class ScatterPoint(BaseModel):
    """A point in the scatter plot visualization."""
    id: str
    x: float
    y: float
    cluster: int
    label: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ClusterInfo(BaseModel):
    """Information about a cluster in the visualization."""
    id: int
    centroid_x: float
    centroid_y: float
    size: int
    color: str


class PlotBounds(BaseModel):
    """Bounds for the scatter plot."""
    x_min: float
    x_max: float
    y_min: float
    y_max: float


class VisualizationResult(BaseModel):
    """Complete visualization data for the frontend."""
    points: List[ScatterPoint]
    clusters: List[ClusterInfo]
    bounds: PlotBounds


class DiversityResult(BaseModel):
    """Diversity analysis results."""
    score: float = Field(ge=0, le=1, description="Overall diversity score from 0 to 1")
    metrics: List[MetricBreakdown]
    interpretation: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "score": 0.72,
                "metrics": [
                    {"name": "coverage", "display_name": "Coverage", "score": 0.8, "weight": 0.25, "contribution": 0.2}
                ],
                "interpretation": "Good diversity - plans show varied spatial arrangements"
            }
        }


class AnalysisRequest(BaseModel):
    """Request for floor plan analysis."""
    plan_ids: Optional[List[str]] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "plan_ids": ["plan_001", "plan_002", "plan_003"]
            }
        }


class AnalysisResponse(BaseModel):
    """Complete analysis response."""
    success: bool
    plan_count: int
    plans: List[PlanFeatures]
    diversity: DiversityResult
    visualization: VisualizationResult
    processing_time_ms: float
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "plan_count": 10,
                "plans": [],
                "diversity": {
                    "score": 0.72,
                    "metrics": [],
                    "interpretation": "Good diversity"
                },
                "visualization": {
                    "points": [],
                    "clusters": [],
                    "bounds": {"x_min": -1, "x_max": 1, "y_min": -1, "y_max": 1}
                },
                "processing_time_ms": 1234.5
            }
        }


class UploadResponse(BaseModel):
    """Response after uploading floor plans."""
    success: bool
    uploaded_count: int
    plan_ids: List[str]
    message: str


class ErrorResponse(BaseModel):
    """Error response."""
    success: bool = False
    error: str
    detail: Optional[str] = None


# Generation schemas
class GenerationRequest(BaseModel):
    """Request for floor plan generation."""
    bedrooms: int = Field(default=3, ge=1, le=10, description="Number of bedrooms")
    bathrooms: int = Field(default=2, ge=1, le=10, description="Number of bathrooms")
    sqft: int = Field(default=2000, ge=500, le=10000, description="Target square footage")
    style: str = Field(default="modern", description="Architectural style")
    count: int = Field(default=6, ge=1, le=20, description="Number of plans to generate")
    additional_rooms: Optional[List[str]] = Field(default=None, description="Additional rooms to include")
    skip_analysis: bool = Field(default=False, description="Skip automatic diversity analysis")
    
    class Config:
        json_schema_extra = {
            "example": {
                "bedrooms": 3,
                "bathrooms": 2,
                "sqft": 2000,
                "style": "modern",
                "count": 6,
                "additional_rooms": ["office", "mudroom"]
            }
        }


class GeneratedPlanInfo(BaseModel):
    """Information about a generated plan."""
    plan_id: str
    variation_type: str
    display_name: Optional[str] = None  # AI-generated descriptive name
    generation_time_ms: float
    success: bool
    error: Optional[str] = None
    thumbnail: Optional[str] = None  # Base64-encoded colored thumbnail (for analysis)
    stylized_thumbnail: Optional[str] = None  # Base64-encoded stylized thumbnail (for display)


class GenerationResponse(BaseModel):
    """Response from floor plan generation."""
    success: bool
    generated_count: int
    failed_count: int
    plan_ids: List[str]
    plans_info: List[GeneratedPlanInfo]
    analysis: Optional[AnalysisResponse] = None
    total_generation_time_ms: float
    message: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "generated_count": 6,
                "failed_count": 0,
                "plan_ids": ["gen_abc123", "gen_def456"],
                "plans_info": [],
                "analysis": None,
                "total_generation_time_ms": 12500,
                "message": "Successfully generated 6 floor plans"
            }
        }


class StyleOption(BaseModel):
    """Available architectural style option."""
    id: str
    name: str
    description: str


class GenerationOptionsResponse(BaseModel):
    """Available options for generation."""
    styles: List[StyleOption]
    additional_room_options: List[str]
    variation_types: List[str]
    limits: Dict[str, Dict[str, int]]


# Edit and Rename schemas
class EditPlanRequest(BaseModel):
    """Request to edit a floor plan."""
    instruction: str = Field(..., description="Edit instruction (e.g., 'Add a pool to the backyard')")
    
    class Config:
        json_schema_extra = {
            "example": {
                "instruction": "Add a pool to the backyard"
            }
        }


class EditPlanResponse(BaseModel):
    """Response from editing a floor plan."""
    success: bool
    original_plan_id: str
    new_plan_id: str
    display_name: Optional[str] = None
    thumbnail: Optional[str] = None
    stylized_thumbnail: Optional[str] = None
    message: str


class RenamePlanRequest(BaseModel):
    """Request to rename a floor plan."""
    name: str = Field(..., min_length=1, max_length=100, description="New name for the plan")
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "My Custom Floor Plan"
            }
        }


class RenamePlanResponse(BaseModel):
    """Response from renaming a floor plan."""
    success: bool
    plan_id: str
    new_name: str

