"""
Diversity Aggregator
Combines individual metrics into a final diversity score.
"""

import numpy as np
from typing import Dict, List, Optional, Tuple
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

try:
    import umap
    UMAP_AVAILABLE = True
except ImportError:
    UMAP_AVAILABLE = False

from .metrics import compute_all_metrics


class DiversityAggregator:
    """
    Aggregates feature vectors from multiple floor plans and computes
    a combined diversity score.
    """
    
    # Default weights for combining metrics
    DEFAULT_WEIGHTS = {
        "coverage": 0.25,
        "dispersion": 0.30,
        "cluster_entropy": 0.25,
        "graph_diversity": 0.20,
    }
    
    def __init__(
        self,
        weights: Optional[Dict[str, float]] = None,
        reduction_method: str = "pca"
    ):
        """
        Initialize the aggregator.
        
        Args:
            weights: Custom weights for each metric (should sum to 1)
            reduction_method: "pca" or "umap" for dimensionality reduction
        """
        self.weights = weights or self.DEFAULT_WEIGHTS
        self.reduction_method = reduction_method
        
        # Normalize weights to sum to 1
        total = sum(self.weights.values())
        self.weights = {k: v / total for k, v in self.weights.items()}
        
        self.scaler = StandardScaler()
        self.reducer = None
    
    def reduce_dimensions(
        self,
        feature_vectors: np.ndarray,
        n_components: int = 2
    ) -> np.ndarray:
        """
        Reduce feature vectors to lower dimensions for visualization.
        
        Args:
            feature_vectors: N x D array of feature vectors
            n_components: Target dimensionality (usually 2 for scatter plot)
            
        Returns:
            N x n_components array of reduced features
        """
        n_samples, n_features = feature_vectors.shape
        
        # Need at least n_components samples
        if n_samples < n_components:
            # Pad with zeros
            reduced = np.zeros((n_samples, n_components))
            reduced[:, :min(n_features, n_components)] = feature_vectors[:, :n_components]
            return reduced
        
        # Standardize features
        scaled = self.scaler.fit_transform(feature_vectors)
        
        # Handle case where we have fewer features than components
        actual_components = min(n_components, n_features, n_samples)
        
        if self.reduction_method == "umap" and UMAP_AVAILABLE and n_samples >= 4:
            # UMAP for non-linear reduction
            n_neighbors = min(15, n_samples - 1)
            self.reducer = umap.UMAP(
                n_components=actual_components,
                n_neighbors=n_neighbors,
                min_dist=0.1,
                metric='euclidean',
                random_state=42
            )
            reduced = self.reducer.fit_transform(scaled)
        else:
            # PCA for linear reduction
            self.reducer = PCA(n_components=actual_components)
            reduced = self.reducer.fit_transform(scaled)
        
        # Pad if needed
        if actual_components < n_components:
            padded = np.zeros((n_samples, n_components))
            padded[:, :actual_components] = reduced
            return padded
        
        return reduced
    
    def compute_diversity_score(
        self,
        feature_vectors: np.ndarray,
        adjacency_matrices: Optional[List[np.ndarray]] = None
    ) -> Tuple[float, Dict[str, float], np.ndarray]:
        """
        Compute the overall diversity score.
        
        Args:
            feature_vectors: N x D array where N is number of plans
            adjacency_matrices: Optional list of room adjacency matrices
            
        Returns:
            Tuple of (overall_score, individual_metrics, reduced_points)
        """
        n_samples = len(feature_vectors)
        
        if n_samples < 2:
            return 0.0, {k: 0.0 for k in self.weights}, feature_vectors[:, :2] if feature_vectors.shape[1] >= 2 else np.zeros((n_samples, 2))
        
        # Reduce dimensions for visualization and coverage computation
        reduced_points = self.reduce_dimensions(feature_vectors, n_components=2)
        
        # Compute all metrics
        metrics = compute_all_metrics(
            feature_vectors,
            reduced_points,
            adjacency_matrices
        )
        
        # Weighted combination
        overall_score = sum(
            self.weights.get(metric, 0) * score
            for metric, score in metrics.items()
        )
        
        # Clamp to [0, 1]
        overall_score = max(0.0, min(1.0, overall_score))
        
        return overall_score, metrics, reduced_points
    
    def get_metric_breakdown(self, metrics: Dict[str, float]) -> List[Dict]:
        """
        Format metrics for display with weights and contributions.
        """
        breakdown = []
        
        for metric, score in metrics.items():
            weight = self.weights.get(metric, 0)
            contribution = weight * score
            
            breakdown.append({
                "name": metric,
                "display_name": metric.replace("_", " ").title(),
                "score": round(score, 3),
                "weight": round(weight, 2),
                "contribution": round(contribution, 3)
            })
        
        # Sort by contribution
        breakdown.sort(key=lambda x: x["contribution"], reverse=True)
        
        return breakdown
    
    def analyze_cluster_assignments(
        self,
        reduced_points: np.ndarray,
        n_clusters: int = 3
    ) -> np.ndarray:
        """
        Assign plans to clusters for visualization.
        
        Args:
            reduced_points: N x 2 array of reduced features
            n_clusters: Number of clusters to identify
            
        Returns:
            Array of cluster assignments
        """
        from sklearn.cluster import KMeans
        
        n_samples = len(reduced_points)
        
        if n_samples < n_clusters:
            # Not enough samples, assign each to own cluster
            return np.arange(n_samples)
        
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        clusters = kmeans.fit_predict(reduced_points)
        
        return clusters


def quick_diversity_score(feature_vectors: np.ndarray) -> float:
    """
    Quick diversity score computation without full analysis.
    Useful for real-time feedback.
    """
    if len(feature_vectors) < 2:
        return 0.0
    
    # Simple dispersion-based score
    from scipy.spatial import distance
    
    distances = distance.pdist(feature_vectors, metric='euclidean')
    
    if len(distances) == 0:
        return 0.0
    
    mean_dist = np.mean(distances)
    
    # Normalize by max distance in set
    max_dist = np.max(distances)
    
    if max_dist == 0:
        return 0.0
    
    return float(min(mean_dist / max_dist, 1.0))









