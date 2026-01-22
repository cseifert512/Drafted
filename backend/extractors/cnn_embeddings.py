"""
CNN Embedding Extractor
Uses pre-trained ResNet50 to extract high-level visual features.
"""

import numpy as np
from typing import List, Optional
import cv2

from .base import BaseExtractor, FeatureVector
from utils.image_processing import resize_image, bgr_to_rgb

# Lazy loading for PyTorch to reduce startup time
_model = None
_transform = None


def get_model_and_transform():
    """Lazily load the ResNet50 model and transforms."""
    global _model, _transform
    
    if _model is None:
        import torch
        import torchvision.models as models
        import torchvision.transforms as transforms
        
        # Load pre-trained ResNet50
        _model = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V2)
        
        # Remove the final classification layer to get features
        _model = torch.nn.Sequential(*list(_model.children())[:-1])
        _model.eval()
        
        # Standard ImageNet preprocessing
        _transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])
    
    return _model, _transform


class CNNEmbeddingExtractor(BaseExtractor):
    """
    Extracts deep learning embeddings using ResNet50.
    
    Features extracted:
    - 2048-dimensional feature vector from ResNet50
    - Reduced to configurable dimension via PCA if desired
    """
    
    def __init__(self, output_dim: Optional[int] = 128):
        super().__init__(name="cnn_embedding")
        self.output_dim = output_dim
        self._pca = None
    
    def extract(self, image: np.ndarray) -> FeatureVector:
        """
        Extract CNN embeddings from floor plan image.
        """
        import torch
        
        model, transform = get_model_and_transform()
        
        # Preprocess image
        image = resize_image(image, max_size=512)
        rgb_image = bgr_to_rgb(image)
        
        # Apply transforms
        input_tensor = transform(rgb_image)
        input_batch = input_tensor.unsqueeze(0)
        
        # Extract features
        with torch.no_grad():
            features = model(input_batch)
        
        # Flatten to 1D
        embedding = features.squeeze().numpy()
        
        # Reduce dimensionality if specified
        if self.output_dim and self.output_dim < len(embedding):
            # Simple dimensionality reduction via chunked averaging
            # This is faster than PCA for single samples
            chunk_size = len(embedding) // self.output_dim
            reduced = []
            for i in range(self.output_dim):
                start = i * chunk_size
                end = start + chunk_size
                reduced.append(np.mean(embedding[start:end]))
            embedding = np.array(reduced)
        
        # L2 normalize
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        
        return FeatureVector(
            name=self.name,
            values=embedding.astype(np.float32),
            metadata={
                "original_dim": 2048,
                "output_dim": len(embedding),
                "model": "resnet50"
            }
        )
    
    def get_feature_names(self) -> List[str]:
        """Return feature names."""
        dim = self.output_dim if self.output_dim else 2048
        return [f"cnn_feat_{i}" for i in range(dim)]


class LightweightCNNExtractor(BaseExtractor):
    """
    Lightweight alternative using traditional CV features.
    Useful when PyTorch is not available or for faster processing.
    """
    
    def __init__(self):
        super().__init__(name="lightweight_cnn")
    
    def extract(self, image: np.ndarray) -> FeatureVector:
        """
        Extract features using traditional CV methods.
        """
        image = resize_image(image, max_size=256)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        features = []
        
        # Histogram features
        hist = cv2.calcHist([gray], [0], None, [32], [0, 256])
        hist = hist.flatten() / hist.sum()
        features.extend(hist)
        
        # Edge histogram
        edges = cv2.Canny(gray, 50, 150)
        edge_hist = cv2.calcHist([edges], [0], None, [16], [0, 256])
        edge_hist = edge_hist.flatten() / (edge_hist.sum() + 1e-6)
        features.extend(edge_hist)
        
        # Local Binary Pattern-like features (simplified)
        lbp_features = self._compute_simple_lbp(gray)
        features.extend(lbp_features)
        
        # Gabor filter responses
        gabor_features = self._compute_gabor_features(gray)
        features.extend(gabor_features)
        
        embedding = np.array(features, dtype=np.float32)
        
        # Normalize
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        
        return FeatureVector(
            name=self.name,
            values=embedding,
            metadata={"method": "traditional_cv"}
        )
    
    def _compute_simple_lbp(self, gray: np.ndarray, num_bins: int = 16) -> List[float]:
        """Compute simplified LBP-like features."""
        # Downsample for efficiency
        small = cv2.resize(gray, (64, 64))
        
        # Compute differences with neighbors
        padded = np.pad(small, 1, mode='edge')
        
        # Sum of neighbor comparisons
        center = padded[1:-1, 1:-1]
        pattern = np.zeros_like(center, dtype=np.uint8)
        
        for dy, dx in [(-1,-1), (-1,0), (-1,1), (0,-1), (0,1), (1,-1), (1,0), (1,1)]:
            neighbor = padded[1+dy:padded.shape[0]-1+dy, 1+dx:padded.shape[1]-1+dx]
            pattern += (neighbor > center).astype(np.uint8)
        
        # Histogram
        hist, _ = np.histogram(pattern, bins=num_bins, range=(0, 8))
        return (hist / (hist.sum() + 1e-6)).tolist()
    
    def _compute_gabor_features(self, gray: np.ndarray, num_orientations: int = 4) -> List[float]:
        """Compute Gabor filter response statistics."""
        features = []
        
        for theta in range(num_orientations):
            theta_rad = theta * np.pi / num_orientations
            kernel = cv2.getGaborKernel(
                (21, 21), 4.0, theta_rad, 10.0, 0.5, 0, ktype=cv2.CV_32F
            )
            filtered = cv2.filter2D(gray, cv2.CV_32F, kernel)
            
            features.append(np.mean(filtered))
            features.append(np.std(filtered))
        
        return features
    
    def get_feature_names(self) -> List[str]:
        """Return feature names."""
        names = []
        names.extend([f"hist_{i}" for i in range(32)])
        names.extend([f"edge_hist_{i}" for i in range(16)])
        names.extend([f"lbp_{i}" for i in range(16)])
        names.extend([f"gabor_{i}" for i in range(8)])
        return names











