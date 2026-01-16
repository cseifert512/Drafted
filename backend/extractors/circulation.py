"""
Circulation Analysis Extractor
Analyzes movement paths and accessibility in floor plans.
"""

import cv2
import numpy as np
from typing import List, Dict, Tuple
from scipy import ndimage
from collections import deque

from .base import BaseExtractor, FeatureVector
from utils.color_palette import ROOM_COLORS
from utils.image_processing import (
    bgr_to_hsv,
    create_mask_by_color_range,
    detect_walls,
    resize_image
)


class CirculationExtractor(BaseExtractor):
    """
    Extracts circulation and accessibility features.
    
    Features extracted:
    - Circulation area ratio
    - Path connectivity
    - Dead end count
    - Corridor efficiency
    - Depth from entry
    - Accessibility metrics
    """
    
    def __init__(self):
        super().__init__(name="circulation")
    
    def detect_circulation_areas(self, image: np.ndarray) -> np.ndarray:
        """
        Detect areas designated as circulation (hallways, corridors).
        """
        hsv = bgr_to_hsv(image)
        
        # Get circulation color range
        circ_color = ROOM_COLORS.get("circulation")
        if circ_color:
            mask = create_mask_by_color_range(
                hsv,
                circ_color.hsv_lower,
                circ_color.hsv_upper
            )
        else:
            # Fallback: detect light gray areas
            mask = create_mask_by_color_range(
                hsv,
                (0, 0, 200),
                (180, 30, 255)
            )
        
        # Clean up
        kernel = np.ones((5, 5), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        
        return mask
    
    def compute_skeleton(self, mask: np.ndarray) -> np.ndarray:
        """
        Compute the skeleton (medial axis) of the circulation areas.
        """
        from skimage.morphology import skeletonize
        
        binary = (mask > 0).astype(np.uint8)
        skeleton = skeletonize(binary)
        
        return (skeleton * 255).astype(np.uint8)
    
    def count_endpoints_and_junctions(self, skeleton: np.ndarray) -> Tuple[int, int]:
        """
        Count endpoints (dead ends) and junctions in the skeleton.
        """
        # Kernel for counting neighbors
        kernel = np.array([[1, 1, 1],
                          [1, 10, 1],
                          [1, 1, 1]], dtype=np.uint8)
        
        # Convolve to count neighbors
        binary = (skeleton > 0).astype(np.uint8)
        neighbor_count = cv2.filter2D(binary, -1, kernel)
        
        # Only consider skeleton pixels
        neighbor_count = neighbor_count * binary
        
        # Endpoints have 1 neighbor (value = 11 after convolution)
        endpoints = np.sum((neighbor_count == 11))
        
        # Junctions have 3+ neighbors (value >= 13)
        junctions = np.sum((neighbor_count >= 13))
        
        return endpoints, junctions
    
    def compute_depth_map(self, traversable_mask: np.ndarray) -> np.ndarray:
        """
        Compute depth from assumed entry point (bottom or left edge).
        Uses distance transform.
        """
        # Invert mask (walls become obstacles)
        traversable = (traversable_mask > 0).astype(np.uint8)
        
        # Find entry points (bottom edge that's traversable)
        h, w = traversable.shape
        entry_mask = np.zeros_like(traversable)
        
        # Check bottom row for entry
        bottom_entries = np.where(traversable[-1, :] > 0)[0]
        if len(bottom_entries) > 0:
            entry_mask[-1, bottom_entries] = 1
        else:
            # Fallback: left edge
            left_entries = np.where(traversable[:, 0] > 0)[0]
            if len(left_entries) > 0:
                entry_mask[left_entries, 0] = 1
            else:
                # No clear entry, use first traversable point
                traversable_points = np.where(traversable > 0)
                if len(traversable_points[0]) > 0:
                    entry_mask[traversable_points[0][0], traversable_points[1][0]] = 1
        
        # Compute distance from entry
        if np.sum(entry_mask) == 0:
            return np.zeros_like(traversable, dtype=np.float32)
        
        # Use BFS-based distance
        dist = np.full(traversable.shape, np.inf)
        dist[entry_mask > 0] = 0
        
        queue = deque()
        for y, x in zip(*np.where(entry_mask > 0)):
            queue.append((y, x))
        
        while queue:
            y, x = queue.popleft()
            current_dist = dist[y, x]
            
            for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w:
                    if traversable[ny, nx] > 0 and dist[ny, nx] > current_dist + 1:
                        dist[ny, nx] = current_dist + 1
                        queue.append((ny, nx))
        
        # Replace inf with -1 for unreachable
        dist[np.isinf(dist)] = -1
        
        return dist.astype(np.float32)
    
    def extract_circulation_features(self, image: np.ndarray) -> Dict[str, float]:
        """
        Extract all circulation-related features.
        """
        h, w = image.shape[:2]
        total_pixels = h * w
        
        # Detect walls and non-wall areas
        wall_mask = detect_walls(image)
        traversable = cv2.bitwise_not(wall_mask)
        
        # Detect dedicated circulation areas
        circulation_mask = self.detect_circulation_areas(image)
        
        features = {}
        
        # Circulation area ratio
        circ_area = np.sum(circulation_mask > 0)
        features["circulation_area_ratio"] = circ_area / total_pixels
        
        # Traversable area ratio
        traversable_area = np.sum(traversable > 0)
        features["traversable_area_ratio"] = traversable_area / total_pixels
        
        # Circulation efficiency (circulation vs total traversable)
        if traversable_area > 0:
            features["circulation_efficiency"] = circ_area / traversable_area
        else:
            features["circulation_efficiency"] = 0
        
        # Skeleton analysis
        if circ_area > 100:  # Only if meaningful circulation exists
            skeleton = self.compute_skeleton(circulation_mask)
            skeleton_length = np.sum(skeleton > 0)
            
            endpoints, junctions = self.count_endpoints_and_junctions(skeleton)
            
            features["corridor_length_ratio"] = skeleton_length / max(h + w, 1)
            features["dead_end_count"] = endpoints / 10  # Normalize
            features["junction_count"] = junctions / 10
            
            # Branching factor
            if endpoints > 0:
                features["branching_factor"] = junctions / endpoints
            else:
                features["branching_factor"] = 0
        else:
            features["corridor_length_ratio"] = 0
            features["dead_end_count"] = 0
            features["junction_count"] = 0
            features["branching_factor"] = 0
        
        # Depth analysis
        depth_map = self.compute_depth_map(traversable)
        valid_depths = depth_map[depth_map >= 0]
        
        if len(valid_depths) > 0:
            features["max_depth"] = np.max(valid_depths) / max(h, w)
            features["mean_depth"] = np.mean(valid_depths) / max(h, w)
            features["depth_variance"] = np.var(valid_depths) / (max(h, w) ** 2)
        else:
            features["max_depth"] = 0
            features["mean_depth"] = 0
            features["depth_variance"] = 0
        
        # Accessibility (percentage of area reachable)
        reachable = np.sum(depth_map >= 0)
        features["accessibility"] = reachable / max(traversable_area, 1)
        
        # Compactness of circulation
        if circ_area > 0:
            circ_contours, _ = cv2.findContours(
                circulation_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            if circ_contours:
                total_perimeter = sum(cv2.arcLength(c, True) for c in circ_contours)
                features["circulation_compactness"] = (4 * np.pi * circ_area) / (total_perimeter ** 2 + 1)
            else:
                features["circulation_compactness"] = 0
        else:
            features["circulation_compactness"] = 0
        
        return features
    
    def extract(self, image: np.ndarray) -> FeatureVector:
        """
        Extract circulation features from floor plan.
        """
        image = resize_image(image, max_size=1024)
        
        features = self.extract_circulation_features(image)
        
        feature_names = self.get_feature_names()
        values = [features.get(name, 0) for name in feature_names]
        
        return FeatureVector(
            name=self.name,
            values=np.array(values, dtype=np.float32),
            metadata=features
        )
    
    def get_feature_names(self) -> List[str]:
        """Return feature names."""
        return [
            "circulation_area_ratio",
            "traversable_area_ratio",
            "circulation_efficiency",
            "corridor_length_ratio",
            "dead_end_count",
            "junction_count",
            "branching_factor",
            "max_depth",
            "mean_depth",
            "depth_variance",
            "accessibility",
            "circulation_compactness",
        ]









