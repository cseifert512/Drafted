"""
Color Segmentation Extractor
Detects rooms by their fill colors and extracts spatial features.
"""

import cv2
import numpy as np
from typing import List, Dict, Any
from dataclasses import dataclass

from .base import BaseExtractor, FeatureVector
from utils.color_palette import ROOM_COLORS, get_room_type_by_color
from utils.image_processing import (
    bgr_to_hsv,
    create_mask_by_color_range,
    find_contours,
    get_contour_properties,
    resize_image
)


@dataclass
class DetectedRoom:
    """Represents a detected room in the floor plan."""
    room_type: str
    area: float
    perimeter: float
    centroid: tuple
    bounding_box: dict
    aspect_ratio: float
    compactness: float
    contour: np.ndarray


class ColorSegmentationExtractor(BaseExtractor):
    """
    Extracts features based on color-coded room detection.
    
    Features extracted:
    - Room count by type
    - Total area by room type (normalized)
    - Room size distribution statistics
    - Spatial distribution metrics
    """
    
    def __init__(self, min_room_area: int = 500):
        super().__init__(name="color_segmentation")
        self.min_room_area = min_room_area
        self.room_types = list(ROOM_COLORS.keys())
    
    def detect_rooms(self, image: np.ndarray) -> List[DetectedRoom]:
        """
        Detect all rooms in the image by their colors.
        """
        hsv = bgr_to_hsv(image)
        detected_rooms = []
        
        for room_type, room_color in ROOM_COLORS.items():
            # Create mask for this room type
            mask = create_mask_by_color_range(
                hsv,
                room_color.hsv_lower,
                room_color.hsv_upper
            )
            
            # Clean up mask
            kernel = np.ones((5, 5), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            
            # Find contours (rooms)
            contours = find_contours(mask)
            
            for contour in contours:
                props = get_contour_properties(contour)
                
                # Filter out small noise
                if props["area"] < self.min_room_area:
                    continue
                
                detected_rooms.append(DetectedRoom(
                    room_type=room_type,
                    area=props["area"],
                    perimeter=props["perimeter"],
                    centroid=(props["centroid"]["x"], props["centroid"]["y"]),
                    bounding_box=props["bounding_box"],
                    aspect_ratio=props["aspect_ratio"],
                    compactness=props["compactness"],
                    contour=contour
                ))
        
        return detected_rooms
    
    def extract(self, image: np.ndarray) -> FeatureVector:
        """
        Extract color segmentation features from floor plan.
        """
        # Resize for consistent analysis
        image = resize_image(image, max_size=1024)
        total_pixels = image.shape[0] * image.shape[1]
        
        # Detect rooms
        rooms = self.detect_rooms(image)
        
        # Initialize feature containers
        room_counts = {rt: 0 for rt in self.room_types}
        room_areas = {rt: 0.0 for rt in self.room_types}
        all_areas = []
        all_aspect_ratios = []
        all_compactness = []
        centroids = []
        
        for room in rooms:
            room_counts[room.room_type] += 1
            room_areas[room.room_type] += room.area
            all_areas.append(room.area)
            all_aspect_ratios.append(room.aspect_ratio)
            all_compactness.append(room.compactness)
            centroids.append(room.centroid)
        
        # Build feature vector
        features = []
        
        # Room counts (normalized by total rooms)
        total_rooms = max(len(rooms), 1)
        for rt in self.room_types:
            features.append(room_counts[rt] / total_rooms)
        
        # Room areas (normalized by total area)
        total_area = sum(all_areas) if all_areas else 1
        for rt in self.room_types:
            features.append(room_areas[rt] / total_area)
        
        # Size distribution statistics
        if all_areas:
            features.append(np.mean(all_areas) / total_pixels)  # Mean room size
            features.append(np.std(all_areas) / total_pixels)   # Size variance
            features.append(np.min(all_areas) / total_pixels)   # Min size
            features.append(np.max(all_areas) / total_pixels)   # Max size
        else:
            features.extend([0, 0, 0, 0])
        
        # Shape statistics
        if all_aspect_ratios:
            features.append(np.mean(all_aspect_ratios))
            features.append(np.std(all_aspect_ratios))
        else:
            features.extend([1, 0])
        
        if all_compactness:
            features.append(np.mean(all_compactness))
        else:
            features.append(0)
        
        # Spatial distribution (centroid spread)
        if len(centroids) > 1:
            centroids_arr = np.array(centroids)
            centroid_std = np.std(centroids_arr, axis=0)
            features.append(centroid_std[0] / image.shape[1])  # X spread
            features.append(centroid_std[1] / image.shape[0])  # Y spread
        else:
            features.extend([0, 0])
        
        # Total room count (normalized)
        features.append(total_rooms / 20)  # Assume max ~20 rooms
        
        return FeatureVector(
            name=self.name,
            values=np.array(features, dtype=np.float32),
            metadata={
                "total_rooms": total_rooms,
                "room_counts": room_counts,
                "detected_rooms": [
                    {
                        "type": r.room_type,
                        "area": r.area,
                        "centroid": r.centroid,
                        "aspect_ratio": r.aspect_ratio
                    }
                    for r in rooms
                ]
            }
        )
    
    def get_feature_names(self) -> List[str]:
        """Return feature names for interpretation."""
        names = []
        
        # Room count features
        for rt in self.room_types:
            names.append(f"count_{rt}")
        
        # Area features  
        for rt in self.room_types:
            names.append(f"area_{rt}")
        
        # Statistics
        names.extend([
            "mean_room_size",
            "std_room_size",
            "min_room_size",
            "max_room_size",
            "mean_aspect_ratio",
            "std_aspect_ratio",
            "mean_compactness",
            "centroid_spread_x",
            "centroid_spread_y",
            "total_rooms_normalized"
        ])
        
        return names

