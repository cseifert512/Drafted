"""
Visualization data generator for the frontend.
"""

import numpy as np
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict


@dataclass
class ScatterPoint:
    """A point in the scatter plot."""
    id: str
    x: float
    y: float
    cluster: int
    label: str
    metadata: Dict[str, Any]


@dataclass
class ClusterInfo:
    """Information about a cluster."""
    id: int
    centroid_x: float
    centroid_y: float
    size: int
    color: str


@dataclass 
class VisualizationData:
    """Complete visualization data for frontend."""
    points: List[Dict]
    clusters: List[Dict]
    diversity_score: float
    metric_breakdown: List[Dict]
    bounds: Dict[str, float]


class VisualizationGenerator:
    """
    Generates visualization data for the React frontend.
    """
    
    # Color palette for clusters
    CLUSTER_COLORS = [
        "#4361ee",  # Blue
        "#f72585",  # Pink
        "#4cc9f0",  # Cyan
        "#7209b7",  # Purple
        "#3a0ca3",  # Deep blue
        "#f77f00",  # Orange
        "#06d6a0",  # Teal
        "#ef476f",  # Red-pink
    ]
    
    def __init__(self):
        pass
    
    def generate(
        self,
        plan_ids: List[str],
        plan_names: List[str],
        reduced_points: np.ndarray,
        cluster_assignments: np.ndarray,
        diversity_score: float,
        metric_breakdown: List[Dict],
        plan_metadata: Optional[List[Dict]] = None
    ) -> VisualizationData:
        """
        Generate complete visualization data.
        
        Args:
            plan_ids: Unique identifiers for each plan
            plan_names: Display names for each plan
            reduced_points: N x 2 array of reduced feature coordinates
            cluster_assignments: Array of cluster IDs for each plan
            diversity_score: Overall diversity score
            metric_breakdown: List of metric details
            plan_metadata: Optional additional metadata per plan
            
        Returns:
            VisualizationData object ready for frontend
        """
        n_plans = len(plan_ids)
        
        # Generate scatter points
        points = []
        for i in range(n_plans):
            point = ScatterPoint(
                id=plan_ids[i],
                x=float(reduced_points[i, 0]),
                y=float(reduced_points[i, 1]),
                cluster=int(cluster_assignments[i]),
                label=plan_names[i],
                metadata=plan_metadata[i] if plan_metadata else {}
            )
            points.append(asdict(point))
        
        # Generate cluster info
        unique_clusters = sorted(set(cluster_assignments))
        clusters = []
        
        for cluster_id in unique_clusters:
            mask = cluster_assignments == cluster_id
            cluster_points = reduced_points[mask]
            
            cluster_info = ClusterInfo(
                id=int(cluster_id),
                centroid_x=float(np.mean(cluster_points[:, 0])),
                centroid_y=float(np.mean(cluster_points[:, 1])),
                size=int(np.sum(mask)),
                color=self.CLUSTER_COLORS[cluster_id % len(self.CLUSTER_COLORS)]
            )
            clusters.append(asdict(cluster_info))
        
        # Compute bounds for the plot
        x_min, x_max = float(np.min(reduced_points[:, 0])), float(np.max(reduced_points[:, 0]))
        y_min, y_max = float(np.min(reduced_points[:, 1])), float(np.max(reduced_points[:, 1]))
        
        # Add padding
        x_padding = (x_max - x_min) * 0.1 or 0.5
        y_padding = (y_max - y_min) * 0.1 or 0.5
        
        bounds = {
            "x_min": x_min - x_padding,
            "x_max": x_max + x_padding,
            "y_min": y_min - y_padding,
            "y_max": y_max + y_padding
        }
        
        return VisualizationData(
            points=points,
            clusters=clusters,
            diversity_score=diversity_score,
            metric_breakdown=metric_breakdown,
            bounds=bounds
        )
    
    def to_json(self, vis_data: VisualizationData) -> Dict:
        """Convert visualization data to JSON-serializable dict."""
        return {
            "points": vis_data.points,
            "clusters": vis_data.clusters,
            "diversityScore": vis_data.diversity_score,
            "metricBreakdown": vis_data.metric_breakdown,
            "bounds": vis_data.bounds
        }
    
    def generate_empty(self) -> Dict:
        """Generate empty visualization data for no plans."""
        return {
            "points": [],
            "clusters": [],
            "diversityScore": 0.0,
            "metricBreakdown": [],
            "bounds": {
                "x_min": -1,
                "x_max": 1,
                "y_min": -1,
                "y_max": 1
            }
        }


def generate_comparison_data(
    plan_ids: List[str],
    feature_dicts: List[Dict[str, Any]]
) -> Dict:
    """
    Generate data for comparing individual plan features.
    
    Args:
        plan_ids: List of plan identifiers
        feature_dicts: List of feature dictionaries for each plan
        
    Returns:
        Comparison data for frontend
    """
    if not feature_dicts:
        return {"plans": [], "features": []}
    
    # Get all feature names
    all_features = set()
    for fd in feature_dicts:
        all_features.update(fd.keys())
    
    all_features = sorted(all_features)
    
    # Build comparison matrix
    plans_data = []
    for i, (plan_id, features) in enumerate(zip(plan_ids, feature_dicts)):
        plan_data = {
            "id": plan_id,
            "features": {
                feat: features.get(feat, 0)
                for feat in all_features
            }
        }
        plans_data.append(plan_data)
    
    return {
        "plans": plans_data,
        "featureNames": all_features
    }




