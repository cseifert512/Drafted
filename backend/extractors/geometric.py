"""
Geometric Feature Extractor
Extracts basic geometric measurements from floor plan images.
"""

import cv2
import numpy as np
from typing import List, Dict, Any

from .base import BaseExtractor, FeatureVector
from utils.color_palette import ROOM_COLORS
from utils.image_processing import (
    bgr_to_hsv,
    create_mask_by_color_range,
    find_contours,
    get_contour_properties,
    detect_walls,
    resize_image
)


class GeometricExtractor(BaseExtractor):
    """
    Extracts basic geometric features from floor plan images.
    
    Features extracted:
    - Bounding box dimensions and aspect ratio
    - Total footprint area
    - Wall-to-space ratio
    - Room regularity metrics
    - Perimeter characteristics
    """
    
    def __init__(self, min_room_area: int = 500):
        super().__init__(name="geometric")
        self.min_room_area = min_room_area
    
    def detect_floor_plan_bounds(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Detect the overall bounding box of the floor plan.
        """
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Threshold to separate floor plan from background
        _, binary = cv2.threshold(gray, 250, 255, cv2.THRESH_BINARY_INV)
        
        # Find contours
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return {
                "x": 0, "y": 0, "width": image.shape[1], "height": image.shape[0],
                "area": image.shape[0] * image.shape[1], "aspect_ratio": image.shape[1] / max(image.shape[0], 1)
            }
        
        # Get combined bounding rect
        all_points = np.vstack(contours)
        x, y, w, h = cv2.boundingRect(all_points)
        
        return {
            "x": x, "y": y, "width": w, "height": h,
            "area": w * h, "aspect_ratio": w / max(h, 1)
        }
    
    def compute_wall_metrics(self, image: np.ndarray) -> Dict[str, float]:
        """
        Compute metrics related to walls.
        """
        h, w = image.shape[:2]
        total_pixels = h * w
        
        # Detect walls
        wall_mask = detect_walls(image)
        wall_pixels = np.sum(wall_mask > 0)
        
        # Wall ratio
        wall_ratio = wall_pixels / max(total_pixels, 1)
        
        # Wall connectivity - find number of connected wall segments
        num_labels, labels = cv2.connectedComponents(wall_mask)
        wall_segments = num_labels - 1  # Subtract background
        
        # Compute wall thickness estimate
        if wall_pixels > 0:
            # Use distance transform
            dist = cv2.distanceTransform(wall_mask, cv2.DIST_L2, 5)
            avg_thickness = np.mean(dist[dist > 0]) * 2 if np.sum(dist > 0) > 0 else 0
        else:
            avg_thickness = 0
        
        return {
            "wall_ratio": wall_ratio,
            "wall_segments": wall_segments / 50,  # Normalized
            "avg_wall_thickness": avg_thickness / max(h, w)
        }
    
    def compute_room_regularity(self, image: np.ndarray) -> Dict[str, float]:
        """
        Compute metrics for room shape regularity.
        """
        hsv = bgr_to_hsv(image)
        
        all_compactness = []
        all_rectangularity = []
        all_areas = []
        
        for room_type, room_color in ROOM_COLORS.items():
            mask = create_mask_by_color_range(hsv, room_color.hsv_lower, room_color.hsv_upper)
            
            # Clean up
            kernel = np.ones((5, 5), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            
            contours = find_contours(mask)
            
            for contour in contours:
                props = get_contour_properties(contour)
                
                if props["area"] < self.min_room_area:
                    continue
                
                all_areas.append(props["area"])
                all_compactness.append(props["compactness"])
                
                # Rectangularity: how well the shape fills its bounding box
                bbox = props["bounding_box"]
                bbox_area = bbox["width"] * bbox["height"]
                rectangularity = props["area"] / max(bbox_area, 1)
                all_rectangularity.append(rectangularity)
        
        if not all_areas:
            return {
                "mean_compactness": 0,
                "std_compactness": 0,
                "mean_rectangularity": 0,
                "std_rectangularity": 0,
                "area_uniformity": 0
            }
        
        # Area uniformity: how similar room sizes are (low variance = high uniformity)
        area_std = np.std(all_areas) / max(np.mean(all_areas), 1)
        area_uniformity = 1 / (1 + area_std)  # Convert to 0-1 scale
        
        return {
            "mean_compactness": np.mean(all_compactness),
            "std_compactness": np.std(all_compactness),
            "mean_rectangularity": np.mean(all_rectangularity),
            "std_rectangularity": np.std(all_rectangularity),
            "area_uniformity": area_uniformity
        }
    
    def compute_perimeter_metrics(self, image: np.ndarray) -> Dict[str, float]:
        """
        Compute metrics related to the floor plan perimeter.
        """
        h, w = image.shape[:2]
        
        # Get floor plan bounds
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(gray, 250, 255, cv2.THRESH_BINARY_INV)
        
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return {
                "perimeter_complexity": 0,
                "convexity_ratio": 1,
                "edge_count_normalized": 0
            }
        
        # Get largest contour (main floor plan outline)
        main_contour = max(contours, key=cv2.contourArea)
        
        perimeter = cv2.arcLength(main_contour, True)
        area = cv2.contourArea(main_contour)
        
        # Perimeter complexity (ratio of perimeter to minimum possible for area)
        if area > 0:
            min_perimeter = 2 * np.sqrt(np.pi * area)  # Circle has minimum perimeter
            perimeter_complexity = perimeter / max(min_perimeter, 1)
        else:
            perimeter_complexity = 1
        
        # Convexity ratio
        hull = cv2.convexHull(main_contour)
        hull_area = cv2.contourArea(hull)
        convexity_ratio = area / max(hull_area, 1)
        
        # Approximate polygon to count edges
        epsilon = 0.02 * perimeter
        approx = cv2.approxPolyDP(main_contour, epsilon, True)
        edge_count = len(approx)
        
        return {
            "perimeter_complexity": min(perimeter_complexity / 3, 1),  # Normalize to ~0-1
            "convexity_ratio": convexity_ratio,
            "edge_count_normalized": edge_count / 50  # Normalize
        }
    
    def extract(self, image: np.ndarray) -> FeatureVector:
        """
        Extract geometric features from floor plan.
        """
        image = resize_image(image, max_size=1024)
        h, w = image.shape[:2]
        
        # Get bounds
        bounds = self.detect_floor_plan_bounds(image)
        
        # Get wall metrics
        wall_metrics = self.compute_wall_metrics(image)
        
        # Get regularity metrics
        regularity = self.compute_room_regularity(image)
        
        # Get perimeter metrics
        perimeter = self.compute_perimeter_metrics(image)
        
        # Build feature vector
        features = [
            # Bounds features
            bounds["width"] / w,  # Normalized width
            bounds["height"] / h,  # Normalized height
            bounds["aspect_ratio"] / 3,  # Normalized (assume max ratio ~3)
            bounds["area"] / (h * w),  # Fill ratio
            
            # Wall features
            wall_metrics["wall_ratio"],
            wall_metrics["wall_segments"],
            wall_metrics["avg_wall_thickness"],
            
            # Regularity features
            regularity["mean_compactness"],
            regularity["std_compactness"],
            regularity["mean_rectangularity"],
            regularity["std_rectangularity"],
            regularity["area_uniformity"],
            
            # Perimeter features
            perimeter["perimeter_complexity"],
            perimeter["convexity_ratio"],
            perimeter["edge_count_normalized"],
        ]
        
        return FeatureVector(
            name=self.name,
            values=np.array(features, dtype=np.float32),
            metadata={
                "bounds": bounds,
                "wall_metrics": wall_metrics,
                "regularity": regularity,
                "perimeter": perimeter
            }
        )
    
    def get_feature_names(self) -> List[str]:
        """Return feature names."""
        return [
            "normalized_width",
            "normalized_height",
            "aspect_ratio",
            "fill_ratio",
            "wall_ratio",
            "wall_segments",
            "avg_wall_thickness",
            "mean_compactness",
            "std_compactness",
            "mean_rectangularity",
            "std_rectangularity",
            "area_uniformity",
            "perimeter_complexity",
            "convexity_ratio",
            "edge_count_normalized",
        ]
