"""
Graph Topology Extractor
Analyzes spatial adjacency relationships between rooms.
"""

import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional
import networkx as nx
from scipy.spatial import distance

from .base import BaseExtractor, FeatureVector
from utils.color_palette import ROOM_COLORS
from utils.image_processing import (
    bgr_to_hsv,
    create_mask_by_color_range,
    find_contours,
    get_contour_properties,
    resize_image
)


class GraphTopologyExtractor(BaseExtractor):
    """
    Extracts graph-based features from room adjacency relationships.
    
    Features extracted:
    - Node count and edge count
    - Graph density and connectivity
    - Average degree and degree distribution
    - Clustering coefficient
    - Path lengths and diameter
    - Centrality measures
    """
    
    def __init__(self, adjacency_threshold: int = 30, min_room_area: int = 500):
        super().__init__(name="graph_topology")
        self.adjacency_threshold = adjacency_threshold
        self.min_room_area = min_room_area
    
    def detect_rooms_with_contours(self, image: np.ndarray) -> List[Dict]:
        """
        Detect rooms and return their properties with contours.
        """
        hsv = bgr_to_hsv(image)
        rooms = []
        room_id = 0
        
        for room_type, room_color in ROOM_COLORS.items():
            mask = create_mask_by_color_range(
                hsv,
                room_color.hsv_lower,
                room_color.hsv_upper
            )
            
            # Clean up
            kernel = np.ones((5, 5), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            
            contours = find_contours(mask)
            
            for contour in contours:
                props = get_contour_properties(contour)
                
                if props["area"] < self.min_room_area:
                    continue
                
                rooms.append({
                    "id": room_id,
                    "type": room_type,
                    "contour": contour,
                    "centroid": (props["centroid"]["x"], props["centroid"]["y"]),
                    "area": props["area"],
                    "bounding_box": props["bounding_box"]
                })
                room_id += 1
        
        return rooms
    
    def are_adjacent(self, room1: Dict, room2: Dict, image_shape: Tuple) -> bool:
        """
        Determine if two rooms are adjacent (share a wall or doorway).
        Uses contour proximity and dilation overlap.
        """
        h, w = image_shape[:2]
        
        # Create masks for each room
        mask1 = np.zeros((h, w), dtype=np.uint8)
        mask2 = np.zeros((h, w), dtype=np.uint8)
        
        cv2.drawContours(mask1, [room1["contour"]], -1, 255, -1)
        cv2.drawContours(mask2, [room2["contour"]], -1, 255, -1)
        
        # Dilate both masks
        kernel = np.ones((self.adjacency_threshold, self.adjacency_threshold), np.uint8)
        dilated1 = cv2.dilate(mask1, kernel, iterations=1)
        dilated2 = cv2.dilate(mask2, kernel, iterations=1)
        
        # Check for overlap
        overlap = cv2.bitwise_and(dilated1, dilated2)
        
        return np.sum(overlap) > 0
    
    def build_adjacency_graph(self, rooms: List[Dict], image_shape: Tuple) -> nx.Graph:
        """
        Build a graph where nodes are rooms and edges are adjacencies.
        """
        G = nx.Graph()
        
        # Add nodes with attributes
        for room in rooms:
            G.add_node(
                room["id"],
                room_type=room["type"],
                area=room["area"],
                centroid=room["centroid"]
            )
        
        # Add edges for adjacent rooms
        for i, room1 in enumerate(rooms):
            for room2 in rooms[i+1:]:
                if self.are_adjacent(room1, room2, image_shape):
                    # Calculate edge weight based on shared boundary length
                    dist = distance.euclidean(room1["centroid"], room2["centroid"])
                    G.add_edge(room1["id"], room2["id"], distance=dist)
        
        return G
    
    def extract_graph_features(self, G: nx.Graph) -> Dict[str, float]:
        """
        Extract features from the adjacency graph.
        """
        features = {}
        
        n_nodes = G.number_of_nodes()
        n_edges = G.number_of_edges()
        
        if n_nodes == 0:
            return {name: 0.0 for name in self.get_feature_names()}
        
        # Basic counts (normalized)
        features["node_count"] = n_nodes / 20  # Normalize by expected max
        features["edge_count"] = n_edges / 50
        
        # Density
        features["graph_density"] = nx.density(G) if n_nodes > 1 else 0
        
        # Connectivity
        features["is_connected"] = 1.0 if nx.is_connected(G) else 0.0
        features["num_components"] = nx.number_connected_components(G) / max(n_nodes, 1)
        
        # Degree statistics
        degrees = [d for n, d in G.degree()]
        if degrees:
            features["avg_degree"] = np.mean(degrees) / max(n_nodes - 1, 1)
            features["max_degree"] = max(degrees) / max(n_nodes - 1, 1)
            features["min_degree"] = min(degrees) / max(n_nodes - 1, 1)
            features["degree_variance"] = np.var(degrees) / max(n_nodes, 1)
        else:
            features["avg_degree"] = 0
            features["max_degree"] = 0
            features["min_degree"] = 0
            features["degree_variance"] = 0
        
        # Clustering
        features["avg_clustering"] = nx.average_clustering(G) if n_nodes > 2 else 0
        
        # Path-based features (only for connected graphs)
        if nx.is_connected(G) and n_nodes > 1:
            features["diameter"] = nx.diameter(G) / n_nodes
            features["avg_path_length"] = nx.average_shortest_path_length(G) / n_nodes
            features["radius"] = nx.radius(G) / n_nodes
        else:
            features["diameter"] = 1.0
            features["avg_path_length"] = 1.0
            features["radius"] = 1.0
        
        # Centrality measures
        if n_nodes > 0:
            degree_centrality = list(nx.degree_centrality(G).values())
            features["avg_degree_centrality"] = np.mean(degree_centrality) if degree_centrality else 0
            features["max_degree_centrality"] = max(degree_centrality) if degree_centrality else 0
            
            if n_nodes > 2:
                betweenness = list(nx.betweenness_centrality(G).values())
                features["avg_betweenness"] = np.mean(betweenness) if betweenness else 0
                features["max_betweenness"] = max(betweenness) if betweenness else 0
            else:
                features["avg_betweenness"] = 0
                features["max_betweenness"] = 0
        else:
            features["avg_degree_centrality"] = 0
            features["max_degree_centrality"] = 0
            features["avg_betweenness"] = 0
            features["max_betweenness"] = 0
        
        # Room type diversity in graph
        room_types = [G.nodes[n].get("room_type", "unknown") for n in G.nodes()]
        unique_types = len(set(room_types))
        features["room_type_diversity"] = unique_types / len(ROOM_COLORS)
        
        return features
    
    def extract(self, image: np.ndarray) -> FeatureVector:
        """
        Extract graph topology features from floor plan.
        """
        image = resize_image(image, max_size=1024)
        
        # Detect rooms
        rooms = self.detect_rooms_with_contours(image)
        
        # Build graph
        G = self.build_adjacency_graph(rooms, image.shape)
        
        # Extract features
        features = self.extract_graph_features(G)
        
        # Create adjacency list for metadata
        adjacency_list = {
            str(n): [str(neighbor) for neighbor in G.neighbors(n)]
            for n in G.nodes()
        }
        
        feature_names = self.get_feature_names()
        values = [features.get(name, 0) for name in feature_names]
        
        return FeatureVector(
            name=self.name,
            values=np.array(values, dtype=np.float32),
            metadata={
                "num_rooms": len(rooms),
                "num_connections": G.number_of_edges(),
                "adjacency_list": adjacency_list,
                "room_nodes": [
                    {"id": r["id"], "type": r["type"], "centroid": r["centroid"]}
                    for r in rooms
                ]
            }
        )
    
    def get_feature_names(self) -> List[str]:
        """Return feature names."""
        return [
            "node_count",
            "edge_count",
            "graph_density",
            "is_connected",
            "num_components",
            "avg_degree",
            "max_degree",
            "min_degree",
            "degree_variance",
            "avg_clustering",
            "diameter",
            "avg_path_length",
            "radius",
            "avg_degree_centrality",
            "max_degree_centrality",
            "avg_betweenness",
            "max_betweenness",
            "room_type_diversity",
        ]











