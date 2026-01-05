"""
Individual diversity metric calculations.
Each metric produces a score from 0 (low diversity) to 1 (high diversity).
"""

import numpy as np
from typing import List, Tuple, Optional
from scipy.spatial import ConvexHull, distance
from scipy.stats import entropy
from sklearn.cluster import KMeans, DBSCAN
from sklearn.metrics import silhouette_score
import warnings


def compute_coverage_score(
    points: np.ndarray,
    reference_area: Optional[float] = None
) -> float:
    """
    Compute diversity based on convex hull coverage in feature space.
    
    Higher coverage = more diverse designs spread across the space.
    
    Args:
        points: N x D array of feature vectors (already reduced to 2D or 3D)
        reference_area: Optional maximum expected area for normalization
        
    Returns:
        Score from 0 to 1
    """
    if len(points) < 3:
        return 0.0
    
    try:
        # Compute convex hull
        hull = ConvexHull(points)
        hull_area = hull.volume  # In 2D, volume gives area
        
        if reference_area is None:
            # Estimate reference as the bounding box area
            mins = np.min(points, axis=0)
            maxs = np.max(points, axis=0)
            reference_area = np.prod(maxs - mins) if np.prod(maxs - mins) > 0 else 1.0
        
        # Normalize to 0-1
        coverage = min(hull_area / reference_area, 1.0)
        
        return float(coverage)
    
    except Exception:
        # Hull computation can fail for degenerate cases
        return 0.0


def compute_dispersion_score(points: np.ndarray) -> float:
    """
    Compute diversity based on pairwise distances between designs.
    
    Higher average distance = more diverse designs.
    
    Args:
        points: N x D array of feature vectors
        
    Returns:
        Score from 0 to 1
    """
    if len(points) < 2:
        return 0.0
    
    # Compute pairwise distances
    distances = distance.pdist(points, metric='euclidean')
    
    if len(distances) == 0:
        return 0.0
    
    # Statistics
    mean_dist = np.mean(distances)
    max_dist = np.max(distances)
    min_dist = np.min(distances)
    
    # Normalize by max possible distance (diagonal of bounding box)
    mins = np.min(points, axis=0)
    maxs = np.max(points, axis=0)
    max_possible = np.linalg.norm(maxs - mins)
    
    if max_possible == 0:
        return 0.0
    
    # Score based on mean distance relative to max possible
    mean_score = mean_dist / max_possible
    
    # Bonus for uniformity (low variance in distances)
    dist_std = np.std(distances)
    uniformity = 1 - min(dist_std / (mean_dist + 1e-6), 1)
    
    # Combined score (weighted)
    score = 0.7 * mean_score + 0.3 * uniformity
    
    return float(min(score, 1.0))


def compute_cluster_entropy(
    points: np.ndarray,
    n_clusters: Optional[int] = None,
    method: str = "kmeans"
) -> float:
    """
    Compute diversity based on clustering analysis.
    
    Higher entropy (more uniform cluster distribution) = more diverse.
    Fewer/looser clusters = more diverse.
    
    Args:
        points: N x D array of feature vectors
        n_clusters: Number of clusters (auto-detected if None)
        method: "kmeans" or "dbscan"
        
    Returns:
        Score from 0 to 1
    """
    n_samples = len(points)
    
    if n_samples < 3:
        return 0.0
    
    if method == "kmeans":
        # Auto-determine number of clusters
        if n_clusters is None:
            n_clusters = min(max(2, n_samples // 3), 5)
        
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = kmeans.fit_predict(points)
    
    elif method == "dbscan":
        # Use DBSCAN for density-based clustering
        # Auto-tune eps based on data
        k_dist = []
        for i, p in enumerate(points):
            dists = [np.linalg.norm(p - points[j]) for j in range(len(points)) if i != j]
            if dists:
                k_dist.append(sorted(dists)[min(2, len(dists)-1)])
        
        eps = np.median(k_dist) if k_dist else 0.5
        
        dbscan = DBSCAN(eps=eps, min_samples=2)
        labels = dbscan.fit_predict(points)
    
    else:
        raise ValueError(f"Unknown clustering method: {method}")
    
    # Count samples per cluster
    unique_labels = set(labels)
    if -1 in unique_labels:  # DBSCAN noise points
        unique_labels.remove(-1)
    
    if len(unique_labels) == 0:
        # All noise or single cluster
        return 0.5
    
    cluster_counts = []
    for label in unique_labels:
        count = np.sum(labels == label)
        cluster_counts.append(count)
    
    # Compute entropy of cluster distribution
    cluster_probs = np.array(cluster_counts) / sum(cluster_counts)
    cluster_entropy = entropy(cluster_probs)
    
    # Normalize by max possible entropy (uniform distribution)
    max_entropy = np.log(len(unique_labels)) if len(unique_labels) > 1 else 1
    normalized_entropy = cluster_entropy / max_entropy if max_entropy > 0 else 0
    
    # Also consider silhouette score (lower = more spread out = more diverse)
    try:
        if len(unique_labels) > 1 and n_samples > len(unique_labels):
            silhouette = silhouette_score(points, labels)
            # Invert: low silhouette (bad clustering) = high diversity
            silhouette_contrib = (1 - silhouette) / 2
        else:
            silhouette_contrib = 0.5
    except Exception:
        silhouette_contrib = 0.5
    
    # Combine metrics
    # High entropy + low silhouette = high diversity
    score = 0.6 * normalized_entropy + 0.4 * silhouette_contrib
    
    return float(min(score, 1.0))


def compute_graph_diversity(adjacency_matrices: List[np.ndarray]) -> float:
    """
    Compute diversity based on graph edit distance between room adjacency graphs.
    
    Higher average edit distance = more structurally diverse plans.
    
    Args:
        adjacency_matrices: List of N x N adjacency matrices for each plan
        
    Returns:
        Score from 0 to 1
    """
    if len(adjacency_matrices) < 2:
        return 0.0
    
    # Compute pairwise graph distances
    distances = []
    
    for i in range(len(adjacency_matrices)):
        for j in range(i + 1, len(adjacency_matrices)):
            dist = _approximate_graph_distance(
                adjacency_matrices[i],
                adjacency_matrices[j]
            )
            distances.append(dist)
    
    if not distances:
        return 0.0
    
    # Normalize by max possible distance
    max_nodes = max(len(m) for m in adjacency_matrices)
    max_possible = max_nodes * (max_nodes - 1) / 2  # Max edge differences
    
    mean_dist = np.mean(distances)
    normalized = mean_dist / max_possible if max_possible > 0 else 0
    
    return float(min(normalized, 1.0))


def _approximate_graph_distance(adj1: np.ndarray, adj2: np.ndarray) -> float:
    """
    Approximate graph edit distance based on adjacency matrix differences.
    
    Uses simple edge difference counting (not optimal alignment).
    """
    # Pad to same size
    n1, n2 = len(adj1), len(adj2)
    max_n = max(n1, n2)
    
    padded1 = np.zeros((max_n, max_n))
    padded2 = np.zeros((max_n, max_n))
    
    padded1[:n1, :n1] = adj1
    padded2[:n2, :n2] = adj2
    
    # Count differing edges
    diff = np.abs(padded1 - padded2)
    
    # Only count upper triangle (undirected graph)
    upper_diff = np.triu(diff, k=1)
    
    return float(np.sum(upper_diff))


def compute_all_metrics(
    feature_vectors: np.ndarray,
    reduced_points: np.ndarray,
    adjacency_matrices: Optional[List[np.ndarray]] = None
) -> dict:
    """
    Compute all diversity metrics.
    
    Args:
        feature_vectors: Original high-dimensional feature vectors (N x D)
        reduced_points: Dimensionality-reduced points for visualization (N x 2)
        adjacency_matrices: Optional list of graph adjacency matrices
        
    Returns:
        Dictionary with all metric scores
    """
    metrics = {}
    
    # Coverage in reduced space
    metrics["coverage"] = compute_coverage_score(reduced_points)
    
    # Dispersion in original feature space
    metrics["dispersion"] = compute_dispersion_score(feature_vectors)
    
    # Cluster entropy
    metrics["cluster_entropy"] = compute_cluster_entropy(feature_vectors)
    
    # Graph diversity (if available)
    if adjacency_matrices and len(adjacency_matrices) >= 2:
        metrics["graph_diversity"] = compute_graph_diversity(adjacency_matrices)
    else:
        metrics["graph_diversity"] = 0.5  # Neutral score if not available
    
    return metrics

