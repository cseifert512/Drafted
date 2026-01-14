"""
Diversity Metrics
Implements various diversity measures for floor plan comparison.
"""

import numpy as np
from typing import Dict, List, Optional
from scipy.spatial import distance
from scipy.stats import entropy
from sklearn.neighbors import NearestNeighbors
from sklearn.cluster import KMeans


def compute_coverage_score(
    reduced_points: np.ndarray,
    n_bins: int = 10,
    normalize: bool = True
) -> float:
    """
    Compute coverage score: how well the plans cover the feature space.
    
    Uses a grid-based approach to measure how many cells are occupied.
    Higher score = better coverage across the space.
    
    Args:
        reduced_points: N x 2 array of reduced features
        n_bins: Number of bins per dimension
        normalize: Whether to normalize to [0, 1]
        
    Returns:
        Coverage score
    """
    if len(reduced_points) < 2:
        return 0.0
    
    # Compute bounds
    mins = reduced_points.min(axis=0)
    maxs = reduced_points.max(axis=0)
    
    # Handle edge case of zero range
    ranges = maxs - mins
    ranges[ranges == 0] = 1
    
    # Normalize points to [0, 1]
    normalized = (reduced_points - mins) / ranges
    
    # Create grid and count occupied cells
    bins = np.floor(normalized * (n_bins - 1e-6)).astype(int)
    bins = np.clip(bins, 0, n_bins - 1)
    
    # Count unique cells
    cell_ids = bins[:, 0] * n_bins + bins[:, 1]
    n_occupied = len(np.unique(cell_ids))
    
    # Max possible is min(n_samples, n_bins^2)
    max_occupied = min(len(reduced_points), n_bins * n_bins)
    
    if normalize:
        return n_occupied / max_occupied
    else:
        return float(n_occupied)


def compute_dispersion_score(
    feature_vectors: np.ndarray,
    metric: str = 'euclidean'
) -> float:
    """
    Compute dispersion score: how spread out the plans are.
    
    Based on average pairwise distance, normalized by max distance.
    Higher score = more spread out.
    
    Args:
        feature_vectors: N x D array of feature vectors
        metric: Distance metric to use
        
    Returns:
        Dispersion score in [0, 1]
    """
    if len(feature_vectors) < 2:
        return 0.0
    
    # Compute pairwise distances
    distances = distance.pdist(feature_vectors, metric=metric)
    
    if len(distances) == 0 or np.max(distances) == 0:
        return 0.0
    
    # Mean distance relative to max
    mean_dist = np.mean(distances)
    max_dist = np.max(distances)
    
    # Also consider variance to reward even spread
    dist_var = np.var(distances)
    normalized_var = dist_var / (max_dist ** 2 + 1e-6)
    
    # Combine mean distance (wants to be high) and variance (wants to be low)
    # This rewards even distribution
    base_score = mean_dist / max_dist
    variance_penalty = 0.2 * min(normalized_var, 1)
    
    return float(min(max(base_score - variance_penalty, 0), 1))


def compute_cluster_entropy(
    reduced_points: np.ndarray,
    n_clusters: int = 3
) -> float:
    """
    Compute cluster entropy: how evenly distributed across clusters.
    
    Higher entropy = more even distribution (better diversity).
    
    Args:
        reduced_points: N x 2 array of reduced features
        n_clusters: Number of clusters to form
        
    Returns:
        Normalized entropy score in [0, 1]
    """
    n_samples = len(reduced_points)
    
    if n_samples < 2:
        return 0.0
    
    # Limit clusters to number of samples
    actual_clusters = min(n_clusters, n_samples)
    
    if actual_clusters < 2:
        return 0.0
    
    # Cluster the points
    kmeans = KMeans(n_clusters=actual_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(reduced_points)
    
    # Count samples per cluster
    unique, counts = np.unique(labels, return_counts=True)
    
    # Compute entropy of cluster distribution
    probabilities = counts / counts.sum()
    cluster_entropy = entropy(probabilities, base=2)
    
    # Normalize by maximum possible entropy (uniform distribution)
    max_entropy = np.log2(actual_clusters)
    
    if max_entropy == 0:
        return 0.0
    
    return float(cluster_entropy / max_entropy)


def compute_graph_diversity(
    adjacency_matrices: Optional[List[np.ndarray]] = None,
    feature_vectors: Optional[np.ndarray] = None
) -> float:
    """
    Compute graph diversity: how different the room connectivity patterns are.
    
    If adjacency matrices provided, compares graph structures.
    Otherwise, falls back to a subset of feature-based diversity.
    
    Args:
        adjacency_matrices: List of N x N adjacency matrices
        feature_vectors: Fallback feature vectors if no graphs
        
    Returns:
        Graph diversity score in [0, 1]
    """
    # If we have adjacency matrices, compare them
    if adjacency_matrices and len(adjacency_matrices) >= 2:
        return _compare_adjacency_matrices(adjacency_matrices)
    
    # Fallback: use feature vectors with nearest neighbor distance
    if feature_vectors is not None and len(feature_vectors) >= 2:
        return _compute_nn_diversity(feature_vectors)
    
    return 0.0


def _compare_adjacency_matrices(matrices: List[np.ndarray]) -> float:
    """Compare adjacency matrices for structural diversity."""
    n = len(matrices)
    
    if n < 2:
        return 0.0
    
    # Compute pairwise graph edit distances (simplified)
    total_diff = 0
    count = 0
    
    for i in range(n):
        for j in range(i + 1, n):
            # Normalize matrices to same size if needed
            m1, m2 = matrices[i], matrices[j]
            
            # Get max size
            max_size = max(m1.shape[0], m2.shape[0])
            
            # Pad matrices to same size
            padded1 = np.zeros((max_size, max_size))
            padded2 = np.zeros((max_size, max_size))
            
            padded1[:m1.shape[0], :m1.shape[1]] = m1
            padded2[:m2.shape[0], :m2.shape[1]] = m2
            
            # Compare (binary difference)
            diff = np.abs(padded1 - padded2)
            normalized_diff = diff.sum() / (max_size * max_size)
            
            total_diff += normalized_diff
            count += 1
    
    if count == 0:
        return 0.0
    
    # Average difference
    avg_diff = total_diff / count
    
    # Convert to diversity score (higher diff = more diverse)
    return float(min(avg_diff * 2, 1.0))  # Scale up since differences tend to be small


def _compute_nn_diversity(feature_vectors: np.ndarray) -> float:
    """Compute diversity based on nearest neighbor distances."""
    n = len(feature_vectors)
    
    if n < 2:
        return 0.0
    
    # Fit nearest neighbors
    k = min(3, n - 1)
    nn = NearestNeighbors(n_neighbors=k + 1)  # +1 because point is its own neighbor
    nn.fit(feature_vectors)
    
    distances, _ = nn.kneighbors(feature_vectors)
    
    # Get mean distance to k nearest neighbors (excluding self)
    nn_distances = distances[:, 1:k+1]  # Skip first column (self)
    mean_nn_dist = np.mean(nn_distances)
    
    # Normalize by dataset spread
    all_dists = distance.pdist(feature_vectors)
    max_dist = np.max(all_dists) if len(all_dists) > 0 else 1
    
    if max_dist == 0:
        return 0.0
    
    # Higher nearest-neighbor distance = more diversity
    return float(min(mean_nn_dist / max_dist * 2, 1.0))


def compute_all_metrics(
    feature_vectors: np.ndarray,
    reduced_points: np.ndarray,
    adjacency_matrices: Optional[List[np.ndarray]] = None
) -> Dict[str, float]:
    """
    Compute all diversity metrics at once.
    
    Args:
        feature_vectors: N x D array of feature vectors
        reduced_points: N x 2 array of reduced features
        adjacency_matrices: Optional list of adjacency matrices
        
    Returns:
        Dictionary of metric name -> score
    """
    return {
        "coverage": compute_coverage_score(reduced_points),
        "dispersion": compute_dispersion_score(feature_vectors),
        "cluster_entropy": compute_cluster_entropy(reduced_points),
        "graph_diversity": compute_graph_diversity(adjacency_matrices, feature_vectors),
    }


def compute_quick_diversity(feature_vectors: np.ndarray) -> float:
    """
    Quick diversity estimate for real-time feedback.
    
    Uses only dispersion for speed.
    """
    return compute_dispersion_score(feature_vectors)


# Utility functions for metric interpretation

def get_metric_description(metric_name: str) -> str:
    """Get human-readable description of a metric."""
    descriptions = {
        "coverage": "How well the plans cover the feature space",
        "dispersion": "How spread out the plans are in feature space",
        "cluster_entropy": "How evenly distributed across different styles",
        "graph_diversity": "How different the room connectivity patterns are",
    }
    return descriptions.get(metric_name, "Unknown metric")


def get_metric_icon(metric_name: str) -> str:
    """Get icon name for a metric (for frontend)."""
    icons = {
        "coverage": "grid",
        "dispersion": "scatter",
        "cluster_entropy": "pie",
        "graph_diversity": "network",
    }
    return icons.get(metric_name, "chart")
