'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, GitCompare, Eye, EyeOff } from 'lucide-react';
import type { GeneratedRoom } from '@/lib/drafted-types';

interface GenerationGraphData {
  id: string;
  label: string;
  rooms: GeneratedRoom[];
  svg?: string;
}

interface AdjacencyGraphProps {
  /** Array of generations to analyze */
  generations: GenerationGraphData[];
  /** Height of the visualization */
  height?: number;
  /** Class name */
  className?: string;
}

interface GraphNode {
  id: string;
  roomType: string;
  displayName: string;
  x: number;
  y: number;
  color: string;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  frequency: number; // How often this edge appears across generations
}

// Room type colors
const ROOM_TYPE_COLORS: Record<string, string> = {
  primary_bedroom: '#f4a460',
  primary_bathroom: '#ffd700',
  primary_closet: '#daa520',
  bedroom: '#ff8c00',
  bathroom: '#ff69b4',
  living: '#87ceeb',
  family_room: '#87ceeb',
  kitchen: '#98fb98',
  dining: '#dda0dd',
  nook: '#dda0dd',
  garage: '#f0e68c',
  laundry: '#b0c4de',
  storage: '#d3d3d3',
  office: '#add8e6',
  outdoor_living: '#ffa07a',
  foyer: '#e0e0e0',
};

// Typical room adjacencies (based on floor plan conventions)
const TYPICAL_ADJACENCIES: Record<string, string[]> = {
  kitchen: ['dining', 'nook', 'living', 'family_room', 'pantry'],
  dining: ['kitchen', 'living', 'foyer'],
  living: ['dining', 'kitchen', 'foyer', 'family_room'],
  family_room: ['kitchen', 'living', 'outdoor_living'],
  primary_bedroom: ['primary_bathroom', 'primary_closet'],
  primary_bathroom: ['primary_bedroom', 'primary_closet'],
  primary_closet: ['primary_bedroom', 'primary_bathroom'],
  bedroom: ['bathroom', 'bedroom'],
  bathroom: ['bedroom', 'laundry'],
  garage: ['mudroom', 'laundry', 'storage'],
  laundry: ['garage', 'mudroom', 'bathroom'],
  mudroom: ['garage', 'laundry'],
  office: ['living', 'bedroom'],
  foyer: ['living', 'dining'],
};

/**
 * Infer adjacency graph from room list
 * Uses heuristics based on typical floor plan layouts
 */
function inferAdjacencyGraph(rooms: GeneratedRoom[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  
  // Initialize all room types
  rooms.forEach(room => {
    if (!adjacency.has(room.room_type)) {
      adjacency.set(room.room_type, new Set());
    }
  });
  
  // Add edges based on typical adjacencies
  rooms.forEach(room => {
    const typical = TYPICAL_ADJACENCIES[room.room_type] || [];
    typical.forEach(adjacent => {
      if (adjacency.has(adjacent)) {
        adjacency.get(room.room_type)?.add(adjacent);
        adjacency.get(adjacent)?.add(room.room_type);
      }
    });
  });
  
  return adjacency;
}

/**
 * Calculate position for graph node using force-directed layout approximation
 */
function calculateNodePositions(
  roomTypes: string[],
  edges: GraphEdge[],
  width: number,
  height: number
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  
  // Preset positions based on typical floor plan layout
  const layoutPositions: Record<string, { x: number; y: number }> = {
    garage: { x: 0.15, y: 0.85 },
    mudroom: { x: 0.25, y: 0.75 },
    laundry: { x: 0.35, y: 0.8 },
    kitchen: { x: 0.5, y: 0.4 },
    dining: { x: 0.65, y: 0.35 },
    nook: { x: 0.75, y: 0.45 },
    living: { x: 0.35, y: 0.35 },
    family_room: { x: 0.45, y: 0.55 },
    foyer: { x: 0.5, y: 0.2 },
    primary_bedroom: { x: 0.75, y: 0.7 },
    primary_bathroom: { x: 0.85, y: 0.75 },
    primary_closet: { x: 0.8, y: 0.6 },
    bedroom: { x: 0.25, y: 0.3 },
    bathroom: { x: 0.15, y: 0.4 },
    office: { x: 0.15, y: 0.55 },
    outdoor_living: { x: 0.5, y: 0.95 },
    storage: { x: 0.9, y: 0.9 },
  };
  
  const padding = 60;
  const innerWidth = width - 2 * padding;
  const innerHeight = height - 2 * padding;
  
  roomTypes.forEach((type, i) => {
    const preset = layoutPositions[type];
    if (preset) {
      positions.set(type, {
        x: padding + preset.x * innerWidth,
        y: padding + preset.y * innerHeight,
      });
    } else {
      // Fallback: circular layout
      const angle = (i / roomTypes.length) * 2 * Math.PI - Math.PI / 2;
      positions.set(type, {
        x: width / 2 + Math.cos(angle) * (innerWidth / 3),
        y: height / 2 + Math.sin(angle) * (innerHeight / 3),
      });
    }
  });
  
  return positions;
}

export function AdjacencyGraph({
  generations,
  height = 400,
  className = '',
}: AdjacencyGraphProps) {
  const [selectedGeneration, setSelectedGeneration] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showDiff, setShowDiff] = useState(false);
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  
  const svgRef = useRef<SVGSVGElement>(null);
  const width = 450;
  
  // Build combined graph data
  const graphData = useMemo(() => {
    // Get all unique room types across generations
    const allTypes = new Set<string>();
    generations.forEach(gen => {
      gen.rooms.forEach(r => allTypes.add(r.room_type));
    });
    
    // Build adjacency for each generation
    const adjacencyByGen = new Map<string, Map<string, Set<string>>>();
    generations.forEach(gen => {
      adjacencyByGen.set(gen.id, inferAdjacencyGraph(gen.rooms));
    });
    
    // Build combined edge frequency
    const edgeFrequency = new Map<string, number>();
    adjacencyByGen.forEach((adj) => {
      adj.forEach((neighbors, type) => {
        neighbors.forEach(neighbor => {
          const key = [type, neighbor].sort().join('-');
          edgeFrequency.set(key, (edgeFrequency.get(key) || 0) + 1);
        });
      });
    });
    
    // Create edge list
    const edges: GraphEdge[] = [];
    const seenEdges = new Set<string>();
    
    edgeFrequency.forEach((freq, key) => {
      if (seenEdges.has(key)) return;
      seenEdges.add(key);
      
      const [source, target] = key.split('-');
      edges.push({
        source,
        target,
        weight: 1,
        frequency: freq / generations.length, // Normalize to 0-1
      });
    });
    
    // Create nodes with positions
    const roomTypes = Array.from(allTypes);
    const positions = calculateNodePositions(roomTypes, edges, width, height);
    
    const nodes: GraphNode[] = roomTypes.map(type => ({
      id: type,
      roomType: type,
      displayName: type.replace(/_/g, ' '),
      x: positions.get(type)?.x || width / 2,
      y: positions.get(type)?.y || height / 2,
      color: ROOM_TYPE_COLORS[type] || '#888',
    }));
    
    return {
      nodes,
      edges,
      adjacencyByGen,
      roomTypes,
    };
  }, [generations, height]);
  
  // Get edges for specific generation
  const getGenerationEdges = useCallback((genId: string): Set<string> => {
    const adj = graphData.adjacencyByGen.get(genId);
    if (!adj) return new Set();
    
    const edges = new Set<string>();
    adj.forEach((neighbors, type) => {
      neighbors.forEach(neighbor => {
        edges.add([type, neighbor].sort().join('-'));
      });
    });
    return edges;
  }, [graphData]);
  
  // Calculate diff between two generations
  const edgeDiff = useMemo(() => {
    if (!showDiff || !selectedGeneration || !compareWith) return null;
    
    const edges1 = getGenerationEdges(selectedGeneration);
    const edges2 = getGenerationEdges(compareWith);
    
    const added = new Set<string>();
    const removed = new Set<string>();
    const common = new Set<string>();
    
    edges1.forEach(e => {
      if (edges2.has(e)) {
        common.add(e);
      } else {
        removed.add(e);
      }
    });
    
    edges2.forEach(e => {
      if (!edges1.has(e)) {
        added.add(e);
      }
    });
    
    return { added, removed, common };
  }, [showDiff, selectedGeneration, compareWith, getGenerationEdges]);
  
  // Get edge color based on mode
  const getEdgeColor = useCallback((edge: GraphEdge): string => {
    const edgeKey = [edge.source, edge.target].sort().join('-');
    
    if (edgeDiff) {
      if (edgeDiff.added.has(edgeKey)) return '#10b981'; // Green for added
      if (edgeDiff.removed.has(edgeKey)) return '#ef4444'; // Red for removed
      if (edgeDiff.common.has(edgeKey)) return '#6b7280'; // Gray for common
      return 'transparent';
    }
    
    if (selectedGeneration) {
      const genEdges = getGenerationEdges(selectedGeneration);
      if (!genEdges.has(edgeKey)) return 'transparent';
    }
    
    // Frequency-based opacity
    const alpha = 0.2 + edge.frequency * 0.6;
    return `rgba(107, 114, 128, ${alpha})`;
  }, [selectedGeneration, edgeDiff, getGenerationEdges]);
  
  const getEdgeWidth = useCallback((edge: GraphEdge): number => {
    const edgeKey = [edge.source, edge.target].sort().join('-');
    
    if (edgeDiff) {
      if (edgeDiff.added.has(edgeKey) || edgeDiff.removed.has(edgeKey)) return 3;
      if (edgeDiff.common.has(edgeKey)) return 1.5;
      return 0;
    }
    
    return 1 + edge.frequency * 2;
  }, [edgeDiff]);
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-coral-500" />
          <h4 className="font-medium text-drafted-black">Room Adjacency Graph</h4>
        </div>
        <span className="text-xs text-drafted-muted">
          {graphData.nodes.length} nodes, {graphData.edges.length} edges
        </span>
      </div>
      
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Generation selector */}
        <select
          value={selectedGeneration || ''}
          onChange={(e) => setSelectedGeneration(e.target.value || null)}
          className="px-2 py-1 text-xs bg-drafted-bg border border-drafted-border rounded"
        >
          <option value="">All Generations (Combined)</option>
          {generations.map(gen => (
            <option key={gen.id} value={gen.id}>{gen.label}</option>
          ))}
        </select>
        
        {/* Diff mode */}
        {selectedGeneration && (
          <>
            <button
              onClick={() => setShowDiff(!showDiff)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                showDiff
                  ? 'bg-coral-500 text-white'
                  : 'bg-drafted-bg text-drafted-gray hover:bg-drafted-border'
              }`}
            >
              <GitCompare className="w-3 h-3" />
              Compare
            </button>
            
            {showDiff && (
              <select
                value={compareWith || ''}
                onChange={(e) => setCompareWith(e.target.value || null)}
                className="px-2 py-1 text-xs bg-drafted-bg border border-drafted-border rounded"
              >
                <option value="">Select to compare...</option>
                {generations.filter(g => g.id !== selectedGeneration).map(gen => (
                  <option key={gen.id} value={gen.id}>{gen.label}</option>
                ))}
              </select>
            )}
          </>
        )}
        
        {/* Labels toggle */}
        <button
          onClick={() => setShowLabels(!showLabels)}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            showLabels
              ? 'bg-drafted-black text-white'
              : 'bg-drafted-bg text-drafted-gray'
          }`}
        >
          {showLabels ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          Labels
        </button>
      </div>
      
      {/* Legend (for diff mode) */}
      {edgeDiff && (
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-green-500" />
            <span className="text-drafted-gray">Added in {generations.find(g => g.id === compareWith)?.label}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-red-500" />
            <span className="text-drafted-gray">Removed from {generations.find(g => g.id === selectedGeneration)?.label}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-gray-400" />
            <span className="text-drafted-gray">Common</span>
          </div>
        </div>
      )}
      
      {/* Graph */}
      <div className="bg-white rounded-lg border border-drafted-border overflow-hidden">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
        >
          {/* Edges */}
          <g>
            {graphData.edges.map((edge) => {
              const sourceNode = graphData.nodes.find(n => n.id === edge.source);
              const targetNode = graphData.nodes.find(n => n.id === edge.target);
              if (!sourceNode || !targetNode) return null;
              
              const color = getEdgeColor(edge);
              const width = getEdgeWidth(edge);
              
              if (color === 'transparent' || width === 0) return null;
              
              // Highlight connected edges on hover
              const isHighlighted = hoveredNode && 
                (edge.source === hoveredNode || edge.target === hoveredNode);
              
              return (
                <motion.line
                  key={`${edge.source}-${edge.target}`}
                  x1={sourceNode.x}
                  y1={sourceNode.y}
                  x2={targetNode.x}
                  y2={targetNode.y}
                  stroke={isHighlighted ? '#f97316' : color}
                  strokeWidth={isHighlighted ? width + 1 : width}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                />
              );
            })}
          </g>
          
          {/* Nodes */}
          <g>
            {graphData.nodes.map((node) => {
              const isHovered = hoveredNode === node.id;
              const isConnected = hoveredNode && graphData.edges.some(
                e => (e.source === hoveredNode && e.target === node.id) ||
                     (e.target === hoveredNode && e.source === node.id)
              );
              
              return (
                <g
                  key={node.id}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={isHovered ? 18 : 14}
                    fill={node.color}
                    stroke={isHovered || isConnected ? '#f97316' : 'white'}
                    strokeWidth={isHovered || isConnected ? 3 : 2}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.1 }}
                  />
                  
                  {showLabels && (
                    <text
                      x={node.x}
                      y={node.y + 28}
                      textAnchor="middle"
                      className="fill-drafted-gray text-[10px] font-medium capitalize pointer-events-none"
                    >
                      {node.displayName.length > 12 
                        ? node.displayName.substring(0, 10) + '...' 
                        : node.displayName}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      
      {/* Stats */}
      {edgeDiff && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="p-2 bg-green-50 border border-green-100 rounded text-center">
            <div className="font-semibold text-green-700">{edgeDiff.added.size}</div>
            <div className="text-green-600">Added</div>
          </div>
          <div className="p-2 bg-red-50 border border-red-100 rounded text-center">
            <div className="font-semibold text-red-700">{edgeDiff.removed.size}</div>
            <div className="text-red-600">Removed</div>
          </div>
          <div className="p-2 bg-drafted-bg rounded text-center">
            <div className="font-semibold text-drafted-black">{edgeDiff.common.size}</div>
            <div className="text-drafted-gray">Common</div>
          </div>
        </div>
      )}
      
      {/* Info */}
      <p className="text-xs text-drafted-muted">
        Graph shows inferred room adjacencies. Edge thickness indicates how often 
        the connection appears across generations. Hover over nodes to highlight connections.
      </p>
    </div>
  );
}


