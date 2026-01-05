"""
Geometric Feature Extractor
Extracts shape and size metrics from floor plans.
"""

import cv2
import numpy as np
from typing import List, Tuple
from scipy import ndimage

from .base import BaseExtractor, FeatureVector
from utils.image_processing import (
    detect_walls,
    resize_image,
    find_contours,
    get_contour_properties
)


class GeometricExtractor(BaseExtractor):
    """
    Extracts geometric features from the floor plan structure.
    
    Features extracted:
    - Overall footprint shape metrics
    - Wall density and distribution
    - Symmetry measures
    - Spatial moments
    """
    
    def __init__(self):
        super().__init__(name="geometric")
    
    def extract_footprint_features(self, image: np.ndarray) -> dict:
        """
        Extract features from the overall floor plan footprint.
        """
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Threshold to get the floor plan area (non-white areas)
        _, binary = cv2.threshold(gray, 250, 255, cv2.THRESH_BINARY_INV)
        
        # Find the outer contour (footprint)
        contours = find_contours(binary)
        
        if not contours:
            return {
                "footprint_area": 0,
                "footprint_perimeter": 0,
                "footprint_compactness": 0,
                "footprint_aspect_ratio": 1,
                "footprint_extent": 0,
                "footprint_solidity": 0
            }
        
        # Get the largest contour as the footprint
        largest = max(contours, key=cv2.contourArea)
        props = get_contour_properties(largest)
        
        total_pixels = image.shape[0] * image.shape[1]
        
        return {
            "footprint_area": props["area"] / total_pixels,
            "footprint_perimeter": props["perimeter"] / (2 * (image.shape[0] + image.shape[1])),
            "footprint_compactness": props["compactness"],
            "footprint_aspect_ratio": props["aspect_ratio"],
            "footprint_extent": props["extent"],
            "footprint_solidity": props["solidity"]
        }
    
    def extract_wall_features(self, image: np.ndarray) -> dict:
        """
        Extract features from wall structure.
        """
        wall_mask = detect_walls(image)
        total_pixels = image.shape[0] * image.shape[1]
        
        # Wall density
        wall_pixels = np.sum(wall_mask > 0)
        wall_density = wall_pixels / total_pixels
        
        # Wall orientation analysis using Hough lines
        edges = cv2.Canny(wall_mask, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, 50, minLineLength=30, maxLineGap=10)
        
        horizontal_count = 0
        vertical_count = 0
        diagonal_count = 0
        total_wall_length = 0
        
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                length = np.sqrt((x2-x1)**2 + (y2-y1)**2)
                total_wall_length += length
                
                # Classify by angle
                if x2 - x1 == 0:
                    angle = 90
                else:
                    angle = abs(np.degrees(np.arctan((y2-y1)/(x2-x1))))
                
                if angle < 15:
                    horizontal_count += 1
                elif angle > 75:
                    vertical_count += 1
                else:
                    diagonal_count += 1
        
        total_lines = max(horizontal_count + vertical_count + diagonal_count, 1)
        
        return {
            "wall_density": wall_density,
            "horizontal_wall_ratio": horizontal_count / total_lines,
            "vertical_wall_ratio": vertical_count / total_lines,
            "diagonal_wall_ratio": diagonal_count / total_lines,
            "wall_orthogonality": (horizontal_count + vertical_count) / total_lines,
            "total_wall_length_normalized": total_wall_length / (image.shape[0] + image.shape[1])
        }
    
    def extract_symmetry_features(self, image: np.ndarray) -> dict:
        """
        Measure symmetry of the floor plan.
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        
        # Horizontal symmetry (flip left-right)
        flipped_h = cv2.flip(gray, 1)
        h_diff = np.abs(gray.astype(float) - flipped_h.astype(float))
        h_symmetry = 1 - (np.mean(h_diff) / 255)
        
        # Vertical symmetry (flip top-bottom)
        flipped_v = cv2.flip(gray, 0)
        v_diff = np.abs(gray.astype(float) - flipped_v.astype(float))
        v_symmetry = 1 - (np.mean(v_diff) / 255)
        
        # Rotational symmetry (180 degrees)
        rotated = cv2.rotate(gray, cv2.ROTATE_180)
        r_diff = np.abs(gray.astype(float) - rotated.astype(float))
        r_symmetry = 1 - (np.mean(r_diff) / 255)
        
        return {
            "horizontal_symmetry": h_symmetry,
            "vertical_symmetry": v_symmetry,
            "rotational_symmetry": r_symmetry,
            "overall_symmetry": (h_symmetry + v_symmetry + r_symmetry) / 3
        }
    
    def extract_spatial_moments(self, image: np.ndarray) -> dict:
        """
        Extract Hu moments for shape characterization.
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(gray, 250, 255, cv2.THRESH_BINARY_INV)
        
        # Compute Hu moments (rotation/scale invariant)
        moments = cv2.moments(binary)
        hu_moments = cv2.HuMoments(moments).flatten()
        
        # Log transform for better numerical properties
        hu_log = -np.sign(hu_moments) * np.log10(np.abs(hu_moments) + 1e-10)
        
        return {f"hu_moment_{i}": float(hu_log[i]) for i in range(7)}
    
    def extract(self, image: np.ndarray) -> FeatureVector:
        """
        Extract all geometric features.
        """
        image = resize_image(image, max_size=1024)
        
        # Extract all feature groups
        footprint = self.extract_footprint_features(image)
        walls = self.extract_wall_features(image)
        symmetry = self.extract_symmetry_features(image)
        moments = self.extract_spatial_moments(image)
        
        # Combine all features
        all_features = {}
        all_features.update(footprint)
        all_features.update(walls)
        all_features.update(symmetry)
        all_features.update(moments)
        
        # Create feature vector
        feature_names = self.get_feature_names()
        values = [all_features.get(name, 0) for name in feature_names]
        
        return FeatureVector(
            name=self.name,
            values=np.array(values, dtype=np.float32),
            metadata=all_features
        )
    
    def get_feature_names(self) -> List[str]:
        """Return feature names."""
        return [
            # Footprint features
            "footprint_area",
            "footprint_perimeter",
            "footprint_compactness",
            "footprint_aspect_ratio",
            "footprint_extent",
            "footprint_solidity",
            # Wall features
            "wall_density",
            "horizontal_wall_ratio",
            "vertical_wall_ratio",
            "diagonal_wall_ratio",
            "wall_orthogonality",
            "total_wall_length_normalized",
            # Symmetry features
            "horizontal_symmetry",
            "vertical_symmetry",
            "rotational_symmetry",
            "overall_symmetry",
            # Hu moments
            "hu_moment_0",
            "hu_moment_1",
            "hu_moment_2",
            "hu_moment_3",
            "hu_moment_4",
            "hu_moment_5",
            "hu_moment_6",
        ]

