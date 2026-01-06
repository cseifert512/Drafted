"""
FastAPI routes for the Floor Plan Diversity Analyzer.
"""

import os
import uuid
import time
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import numpy as np

from .schemas import (
    AnalysisResponse,
    UploadResponse,
    ErrorResponse,
    PlanFeatures,
    RoomInfo,
    DiversityResult,
    MetricBreakdown,
    VisualizationResult,
    ScatterPoint,
    ClusterInfo,
    PlotBounds,
    GenerationRequest,
    GenerationResponse,
    GeneratedPlanInfo,
    GenerationOptionsResponse,
    StyleOption,
)
from extractors import (
    ExtractorPipeline,
    ColorSegmentationExtractor,
    GeometricExtractor,
    GraphTopologyExtractor,
    CNNEmbeddingExtractor,
    CirculationExtractor,
)
from diversity import DiversityAggregator, VisualizationGenerator
from utils import load_image_from_bytes, encode_image_to_base64

router = APIRouter()

# In-memory storage for uploaded plans (for prototype)
# In production, use a proper database
uploaded_plans = {}


def get_interpretation(score: float) -> str:
    """Generate human-readable interpretation of diversity score."""
    if score >= 0.8:
        return "Excellent diversity - plans show highly varied spatial arrangements and program distributions"
    elif score >= 0.6:
        return "Good diversity - plans demonstrate meaningful variation across key architectural dimensions"
    elif score >= 0.4:
        return "Moderate diversity - some variation exists but plans share common patterns"
    elif score >= 0.2:
        return "Low diversity - plans are fairly similar with limited variation"
    else:
        return "Very low diversity - plans are nearly identical, consider expanding design exploration"


@router.post("/upload", response_model=UploadResponse)
async def upload_plans(files: List[UploadFile] = File(...)):
    """
    Upload floor plan images for analysis.
    
    Accepts PNG, JPG, or JPEG images.
    Returns IDs for each uploaded plan.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    
    if len(files) > 30:
        raise HTTPException(status_code=400, detail="Maximum 30 files allowed per upload")
    
    plan_ids = []
    
    for file in files:
        # Validate file type
        if not file.content_type in ["image/png", "image/jpeg", "image/jpg"]:
            continue
        
        # Read file content
        content = await file.read()
        
        # Generate unique ID
        plan_id = f"plan_{uuid.uuid4().hex[:8]}"
        
        # Store in memory
        uploaded_plans[plan_id] = {
            "id": plan_id,
            "filename": file.filename,
            "content": content,
            "content_type": file.content_type,
        }
        
        plan_ids.append(plan_id)
    
    if not plan_ids:
        raise HTTPException(
            status_code=400, 
            detail="No valid image files found. Please upload PNG or JPG images."
        )
    
    return UploadResponse(
        success=True,
        uploaded_count=len(plan_ids),
        plan_ids=plan_ids,
        message=f"Successfully uploaded {len(plan_ids)} floor plan(s)"
    )


@router.get("/plans")
async def list_plans():
    """List all uploaded plans."""
    plans = [
        {
            "id": p["id"],
            "filename": p["filename"],
        }
        for p in uploaded_plans.values()
    ]
    return {"plans": plans, "count": len(plans)}


@router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str):
    """Delete a specific plan."""
    if plan_id not in uploaded_plans:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    del uploaded_plans[plan_id]
    return {"success": True, "message": f"Plan {plan_id} deleted"}


@router.delete("/plans")
async def delete_all_plans():
    """Delete all uploaded plans."""
    count = len(uploaded_plans)
    uploaded_plans.clear()
    return {"success": True, "message": f"Deleted {count} plans"}


class AnalyzeRequest(BaseModel):
    """Request body for analysis."""
    plan_ids: Optional[List[str]] = None


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_plans(request: Optional[AnalyzeRequest] = None):
    """
    Analyze uploaded floor plans for diversity.
    
    If plan_ids is not provided, analyzes all uploaded plans.
    Returns diversity score, metrics breakdown, and visualization data.
    """
    start_time = time.time()
    
    # Extract plan_ids from request body
    plan_ids = request.plan_ids if request else None
    
    # Get plans to analyze
    if plan_ids:
        plans_to_analyze = {
            pid: uploaded_plans[pid] 
            for pid in plan_ids 
            if pid in uploaded_plans
        }
    else:
        plans_to_analyze = uploaded_plans
    
    if len(plans_to_analyze) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least 2 floor plans are required for diversity analysis"
        )
    
    # Initialize extractors
    # Use lightweight CNN for faster processing in prototype
    try:
        from extractors.cnn_embeddings import LightweightCNNExtractor
        cnn_extractor = LightweightCNNExtractor()
    except Exception:
        cnn_extractor = CNNEmbeddingExtractor(output_dim=64)
    
    pipeline = ExtractorPipeline([
        ColorSegmentationExtractor(),
        GeometricExtractor(),
        GraphTopologyExtractor(),
        cnn_extractor,
        CirculationExtractor(),
    ])
    
    # Extract features from each plan
    all_features = []
    plan_features_list = []
    adjacency_matrices = []
    
    for plan_id, plan_data in plans_to_analyze.items():
        try:
            # Load image
            image = load_image_from_bytes(plan_data["content"])
            
            # Extract features
            features_dict = pipeline.extract_all(image)
            
            # Combine into single vector
            combined_vector = pipeline.get_combined_vector(features_dict)
            all_features.append(combined_vector)
            
            # Get room info from color segmentation
            color_features = features_dict.get("color_segmentation")
            rooms = []
            room_count = 0
            
            if color_features and "detected_rooms" in color_features.metadata:
                for room in color_features.metadata["detected_rooms"]:
                    rooms.append(RoomInfo(
                        type=room["type"],
                        area=room["area"],
                        centroid={"x": room["centroid"][0], "y": room["centroid"][1]},
                        aspect_ratio=room["aspect_ratio"]
                    ))
                room_count = color_features.metadata.get("total_rooms", len(rooms))
            
            # Get adjacency matrix from graph topology
            graph_features = features_dict.get("graph_topology")
            if graph_features and "adjacency_list" in graph_features.metadata:
                # Convert adjacency list to matrix
                adj_list = graph_features.metadata["adjacency_list"]
                n_rooms = len(adj_list)
                adj_matrix = np.zeros((n_rooms, n_rooms))
                
                node_ids = list(adj_list.keys())
                for i, node in enumerate(node_ids):
                    for neighbor in adj_list[node]:
                        if neighbor in node_ids:
                            j = node_ids.index(neighbor)
                            adj_matrix[i, j] = 1
                            adj_matrix[j, i] = 1
                
                adjacency_matrices.append(adj_matrix)
            
            plan_features_list.append(PlanFeatures(
                plan_id=plan_id,
                room_count=room_count,
                rooms=rooms,
                feature_vector=combined_vector.tolist(),
                metadata={
                    "filename": plan_data["filename"],
                    "extractors": list(features_dict.keys())
                }
            ))
            
        except Exception as e:
            print(f"Error processing plan {plan_id}: {e}")
            # Add empty features for failed plans
            plan_features_list.append(PlanFeatures(
                plan_id=plan_id,
                room_count=0,
                rooms=[],
                feature_vector=[],
                metadata={"error": str(e)}
            ))
    
    # Stack feature vectors
    if not all_features:
        raise HTTPException(
            status_code=500,
            detail="Failed to extract features from any plans"
        )
    
    # Pad vectors to same length
    max_len = max(len(f) for f in all_features)
    padded_features = []
    for f in all_features:
        if len(f) < max_len:
            padded = np.pad(f, (0, max_len - len(f)), mode='constant')
        else:
            padded = f
        padded_features.append(padded)
    
    feature_matrix = np.array(padded_features)
    
    # Compute diversity
    aggregator = DiversityAggregator()
    diversity_score, metrics, reduced_points = aggregator.compute_diversity_score(
        feature_matrix,
        adjacency_matrices if adjacency_matrices else None
    )
    
    # Get metric breakdown
    metric_breakdown = aggregator.get_metric_breakdown(metrics)
    
    # Get cluster assignments
    n_clusters = min(3, len(plans_to_analyze))
    clusters = aggregator.analyze_cluster_assignments(reduced_points, n_clusters)
    
    # Generate visualization
    viz_gen = VisualizationGenerator()
    plan_ids_list = list(plans_to_analyze.keys())
    plan_names = [plans_to_analyze[pid]["filename"] for pid in plan_ids_list]
    
    viz_data = viz_gen.generate(
        plan_ids_list,
        plan_names,
        reduced_points,
        clusters,
        diversity_score,
        metric_breakdown
    )
    
    # Build response
    processing_time = (time.time() - start_time) * 1000
    
    return AnalysisResponse(
        success=True,
        plan_count=len(plans_to_analyze),
        plans=plan_features_list,
        diversity=DiversityResult(
            score=round(diversity_score, 3),
            metrics=[
                MetricBreakdown(**m) for m in metric_breakdown
            ],
            interpretation=get_interpretation(diversity_score)
        ),
        visualization=VisualizationResult(
            points=[ScatterPoint(**p) for p in viz_data.points],
            clusters=[ClusterInfo(**c) for c in viz_data.clusters],
            bounds=PlotBounds(**viz_data.bounds)
        ),
        processing_time_ms=round(processing_time, 2)
    )


@router.get("/plan/{plan_id}/thumbnail")
async def get_plan_thumbnail(plan_id: str):
    """Get a base64-encoded thumbnail of a plan."""
    if plan_id not in uploaded_plans:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    plan_data = uploaded_plans[plan_id]
    image = load_image_from_bytes(plan_data["content"])
    
    # Resize for thumbnail
    from utils import resize_image
    thumbnail = resize_image(image, max_size=256)
    
    base64_data = encode_image_to_base64(thumbnail)
    
    return {
        "plan_id": plan_id,
        "thumbnail": f"data:image/png;base64,{base64_data}"
    }


@router.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "plans_in_memory": len(uploaded_plans)
    }


# =============================================================================
# GENERATION ENDPOINTS
# =============================================================================

@router.get("/generate/options", response_model=GenerationOptionsResponse)
async def get_generation_options():
    """Get available options for floor plan generation."""
    from generation import STYLE_DESCRIPTIONS, LAYOUT_VARIATIONS
    
    styles = [
        StyleOption(id=style_id, name=style_id.replace("_", " ").title(), description=desc)
        for style_id, desc in STYLE_DESCRIPTIONS.items()
    ]
    
    additional_rooms = [
        "office", "study", "mudroom", "laundry", "pantry", 
        "bonus room", "home theater", "gym", "wine cellar",
        "guest suite", "in-law suite", "workshop", "playroom"
    ]
    
    variation_types = [v["name"] for v in LAYOUT_VARIATIONS]
    
    return GenerationOptionsResponse(
        styles=styles,
        additional_room_options=additional_rooms,
        variation_types=variation_types,
        limits={
            "bedrooms": {"min": 1, "max": 10},
            "bathrooms": {"min": 1, "max": 10},
            "sqft": {"min": 500, "max": 10000},
            "count": {"min": 1, "max": 20}
        }
    )


@router.post("/generate", response_model=GenerationResponse)
async def generate_floor_plans(request: GenerationRequest):
    """
    Generate floor plans using Gemini AI.
    
    Generates multiple diverse floor plans based on the specified requirements.
    Automatically runs diversity analysis on the generated plans.
    """
    import asyncio
    start_time = time.time()
    
    # Import generation modules
    try:
        from generation import GeminiFloorPlanGenerator, GenerationConfig
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Generation module not available: {e}"
        )
    
    # Check for API key
    import os
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(
            status_code=400,
            detail="GEMINI_API_KEY environment variable not set. Please configure your API key."
        )
    
    # Initialize generator
    try:
        generator = GeminiFloorPlanGenerator()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initialize generator: {e}"
        )
    
    # Create generation config
    config = GenerationConfig(
        bedrooms=request.bedrooms,
        bathrooms=request.bathrooms,
        sqft=request.sqft,
        style=request.style,
        additional_rooms=request.additional_rooms or []
    )
    
    # Generate plans
    try:
        results = await generator.generate_batch(config, count=request.count)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Generation failed: {e}"
        )
    
    # Process results and store in memory
    plan_ids = []
    plans_info = []
    successful_count = 0
    failed_count = 0
    
    for result in results:
        thumbnail_b64 = None
        
        if result.success and result.image_data:
            # Store generated plan in memory
            uploaded_plans[result.plan_id] = {
                "id": result.plan_id,
                "filename": f"{result.variation_type}_{result.plan_id}.png",
                "content": result.image_data,
                "content_type": "image/png",
                "generated": True,
                "variation_type": result.variation_type,
                "config": {
                    "bedrooms": request.bedrooms,
                    "bathrooms": request.bathrooms,
                    "sqft": request.sqft,
                    "style": request.style
                }
            }
            plan_ids.append(result.plan_id)
            successful_count += 1
            
            # Generate thumbnail for immediate response
            try:
                image = load_image_from_bytes(result.image_data)
                from utils import resize_image
                thumb = resize_image(image, max_size=256)
                thumbnail_b64 = f"data:image/png;base64,{encode_image_to_base64(thumb)}"
            except Exception as e:
                print(f"Failed to generate thumbnail: {e}")
        else:
            failed_count += 1
        
        plans_info.append(GeneratedPlanInfo(
            plan_id=result.plan_id,
            variation_type=result.variation_type,
            generation_time_ms=result.generation_time_ms,
            success=result.success,
            error=result.error,
            thumbnail=thumbnail_b64
        ))
    
    total_time = (time.time() - start_time) * 1000
    
    # If we have at least 2 successful plans and analysis not skipped, run analysis
    analysis_result = None
    if successful_count >= 2 and not request.skip_analysis:
        try:
            print(f"Running analysis on {len(plan_ids)} plans...")
            # Call the analyze endpoint logic directly
            analysis_result = await analyze_plans(plan_ids)
            print(f"Analysis complete!")
        except Exception as e:
            import traceback
            print(f"Analysis after generation failed: {e}")
            traceback.print_exc()
            # Continue without analysis
    
    print(f"Returning response: {successful_count} generated, {failed_count} failed")
    
    return GenerationResponse(
        success=successful_count > 0,
        generated_count=successful_count,
        failed_count=failed_count,
        plan_ids=plan_ids,
        plans_info=plans_info,
        analysis=analysis_result,
        total_generation_time_ms=round(total_time, 2),
        message=f"Generated {successful_count} of {request.count} floor plans" + 
                (f" ({failed_count} failed)" if failed_count > 0 else "")
    )


@router.post("/generate/single")
async def generate_single_plan(
    bedrooms: int = 3,
    bathrooms: int = 2,
    sqft: int = 2000,
    style: str = "modern",
    variation_index: int = 0
):
    """
    Generate a single floor plan with a specific variation.
    
    Useful for regenerating or adding individual plans.
    """
    try:
        from generation import GeminiFloorPlanGenerator, GenerationConfig
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Generation module not available: {e}"
        )
    
    import os
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(
            status_code=400,
            detail="GEMINI_API_KEY environment variable not set"
        )
    
    generator = GeminiFloorPlanGenerator()
    config = GenerationConfig(
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        sqft=sqft,
        style=style
    )
    
    result = await generator.generate_single(config, variation_index=variation_index)
    
    if result.success and result.image_data:
        uploaded_plans[result.plan_id] = {
            "id": result.plan_id,
            "filename": f"{result.variation_type}_{result.plan_id}.png",
            "content": result.image_data,
            "content_type": "image/png",
            "generated": True,
            "variation_type": result.variation_type
        }
        
        # Get thumbnail
        image = load_image_from_bytes(result.image_data)
        from utils import resize_image
        thumbnail = resize_image(image, max_size=256)
        base64_thumb = encode_image_to_base64(thumbnail)
        
        return {
            "success": True,
            "plan_id": result.plan_id,
            "variation_type": result.variation_type,
            "generation_time_ms": result.generation_time_ms,
            "thumbnail": f"data:image/png;base64,{base64_thumb}"
        }
    else:
        raise HTTPException(
            status_code=500,
            detail=result.error or "Generation failed"
        )

