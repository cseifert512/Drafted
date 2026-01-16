"""
Base class for feature extractors.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import numpy as np


@dataclass
class FeatureVector:
    """
    Container for extracted features from a floor plan.
    """
    name: str  # Extractor name
    values: np.ndarray  # Feature values as numpy array
    metadata: Dict[str, Any] = field(default_factory=dict)  # Additional info
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dictionary."""
        return {
            "name": self.name,
            "values": self.values.tolist(),
            "dimension": len(self.values),
            "metadata": self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "FeatureVector":
        """Create from dictionary."""
        return cls(
            name=data["name"],
            values=np.array(data["values"]),
            metadata=data.get("metadata", {})
        )


class BaseExtractor(ABC):
    """
    Abstract base class for all feature extractors.
    Each extractor analyzes a floor plan image and returns a FeatureVector.
    """
    
    def __init__(self, name: str):
        self.name = name
    
    @abstractmethod
    def extract(self, image: np.ndarray) -> FeatureVector:
        """
        Extract features from a floor plan image.
        
        Args:
            image: BGR image as numpy array (OpenCV format)
            
        Returns:
            FeatureVector containing the extracted features
        """
        pass
    
    @abstractmethod
    def get_feature_names(self) -> List[str]:
        """
        Return the names/labels for each feature in the vector.
        Useful for interpretation and visualization.
        """
        pass
    
    def preprocess(self, image: np.ndarray) -> np.ndarray:
        """
        Optional preprocessing step. Override in subclasses if needed.
        """
        return image
    
    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(name='{self.name}')"


class ExtractorPipeline:
    """
    Runs multiple extractors and combines their outputs.
    """
    
    def __init__(self, extractors: List[BaseExtractor]):
        self.extractors = extractors
    
    def extract_all(self, image: np.ndarray) -> Dict[str, FeatureVector]:
        """
        Run all extractors on an image.
        
        Returns:
            Dictionary mapping extractor name to FeatureVector
        """
        results = {}
        for extractor in self.extractors:
            try:
                features = extractor.extract(image)
                results[extractor.name] = features
            except Exception as e:
                print(f"Error in {extractor.name}: {e}")
                # Return empty feature vector on error
                results[extractor.name] = FeatureVector(
                    name=extractor.name,
                    values=np.array([]),
                    metadata={"error": str(e)}
                )
        return results
    
    def get_combined_vector(self, feature_dict: Dict[str, FeatureVector]) -> np.ndarray:
        """
        Concatenate all feature vectors into a single array.
        """
        vectors = []
        for name in sorted(feature_dict.keys()):
            fv = feature_dict[name]
            if len(fv.values) > 0:
                vectors.append(fv.values)
        
        if vectors:
            return np.concatenate(vectors)
        return np.array([])









