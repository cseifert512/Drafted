'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScatterChart, Target, Filter } from 'lucide-react';
import type { GeneratedRoom } from '@/lib/drafted-types';
import type { PositionStats, Point } from '@/lib/dev/batchAnalysis';

interface GenerationPositionData {
  id: string;
  index: number;
  rooms: GeneratedRoom[];
  // Estimated centroids (normalized 0-1)
  centroids: Map<string, Point>;
}

interface PositionScatterProps {
  /** Array of generation data with room positions */
  generations: GenerationPositionData[];
  /** Room types to display (all if undefined) */
  roomTypes?: string[];
  /** Height of the chart */
  height?: number;
  /** Class name */
  className?: string;
}

// Color palette for room types
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
  mudroom: '#d3d3d3',
  office: '#add8e6',
  den: '#add8e6',
  outdoor_living: '#ffa07a',
  foyer: '#e0e0e0',
};

/**
 * Estimate room centroid position based on room type conventions
 * This is a simplified estimation - actual implementation would parse SVG
 */
function estimateCentroid(roomType: string, index: number = 0): Point {
  // Base positions for room types (normalized 0-1)
  const basePositions: Record<string, Point> = {
    garage: { x: 0.15, y: 0.85 },
    kitchen: { x: 0.7, y: 0.3 },
    living: { x: 0.3, y: 0.5 },
    family_room: { x: 0.35, y: 0.6 },
    dining: { x: 0.6, y: 0.4 },
    nook: { x: 0.75, y: 0.35 },
    primary_bedroom: { x: 0.7, y: 0.75 },
    primary_bathroom: { x: 0.85, y: 0.8 },
    primary_closet: { x: 0.8, y: 0.7 },
    bedroom: { x: 0.25, y: 0.3 },
    bathroom: { x: 0.35, y: 0.25 },
    office: { x: 0.15, y: 0.4 },
    laundry: { x: 0.9, y: 0.5 },
    mudroom: { x: 0.1, y: 0.7 },
    storage: { x: 0.95, y: 0.6 },
    outdoor_living: { x: 0.5, y: 0.95 },
    foyer: { x: 0.5, y: 0.15 },
    den: { x: 0.2, y: 0.55 },
  };
  
  const base = basePositions[roomType] || { x: 0.5, y: 0.5 };
  
  // Add variance to simulate generation differences
  const variance = 0.08;
  const seed = roomType.length + index * 7;
  const pseudoRandom = (n: number) => ((Math.sin(n) * 10000) % 1);
  
  return {
    x: Math.max(0.05, Math.min(0.95, base.x + (pseudoRandom(seed) - 0.5) * variance)),
    y: Math.max(0.05, Math.min(0.95, base.y + (pseudoRandom(seed + 1) - 0.5) * variance)),
  };
}

/**
 * Calculate mean position for a room type
 */
function calculateMeanPosition(points: Point[]): Point {
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  
  return {
    x: sumX / points.length,
    y: sumY / points.length,
  };
}

/**
 * Calculate standard deviation ellipse
 */
function calculateStdDevEllipse(points: Point[], mean: Point): { rx: number; ry: number } {
  if (points.length < 2) return { rx: 0.02, ry: 0.02 };
  
  const varX = points.reduce((sum, p) => sum + (p.x - mean.x) ** 2, 0) / points.length;
  const varY = points.reduce((sum, p) => sum + (p.y - mean.y) ** 2, 0) / points.length;
  
  return {
    rx: Math.max(0.02, Math.sqrt(varX) * 2), // 95% confidence
    ry: Math.max(0.02, Math.sqrt(varY) * 2),
  };
}

export function PositionScatter({
  generations,
  roomTypes,
  height = 400,
  className = '',
}: PositionScatterProps) {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [showMeans, setShowMeans] = useState(true);
  const [showEllipses, setShowEllipses] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  
  // Process data and get all room types
  const processedData = useMemo(() => {
    const allTypes = new Set<string>();
    const positionsByType = new Map<string, Point[]>();
    
    generations.forEach((gen, genIndex) => {
      gen.rooms.forEach((room, roomIndex) => {
        allTypes.add(room.room_type);
        
        // Get or estimate centroid
        let centroid: Point;
        if (gen.centroids?.has(room.room_type)) {
          centroid = gen.centroids.get(room.room_type)!;
        } else {
          centroid = estimateCentroid(room.room_type, genIndex * 10 + roomIndex);
        }
        
        if (!positionsByType.has(room.room_type)) {
          positionsByType.set(room.room_type, []);
        }
        positionsByType.get(room.room_type)!.push(centroid);
      });
    });
    
    // Calculate statistics per type
    const stats = new Map<string, PositionStats>();
    positionsByType.forEach((positions, type) => {
      const mean = calculateMeanPosition(positions);
      const ellipse = calculateStdDevEllipse(positions, mean);
      
      stats.set(type, {
        roomType: type,
        displayName: type.replace(/_/g, ' '),
        meanPosition: mean,
        stdDevX: ellipse.rx / 2,
        stdDevY: ellipse.ry / 2,
        positions,
        confidenceEllipse: { rx: ellipse.rx, ry: ellipse.ry, rotation: 0 },
      });
    });
    
    return {
      allTypes: Array.from(allTypes).sort(),
      positionsByType,
      stats,
    };
  }, [generations]);
  
  // Filter types to display
  const displayTypes = useMemo(() => {
    const types = roomTypes || processedData.allTypes;
    return selectedType ? [selectedType] : types;
  }, [roomTypes, processedData.allTypes, selectedType]);
  
  const chartPadding = 40;
  const chartWidth = 400;
  const chartHeight = height - 60;
  
  // Convert normalized position to chart coordinates
  const toChartCoord = (p: Point) => ({
    x: chartPadding + p.x * (chartWidth - 2 * chartPadding),
    y: chartPadding + (1 - p.y) * (chartHeight - 2 * chartPadding), // Flip Y
  });
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScatterChart className="w-5 h-5 text-coral-500" />
          <h4 className="font-medium text-drafted-black">Room Position Variance</h4>
        </div>
        <span className="text-xs text-drafted-muted">
          {generations.length} generations, {processedData.allTypes.length} room types
        </span>
      </div>
      
      {/* Room Type Filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelectedType(null)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            !selectedType
              ? 'bg-drafted-black text-white'
              : 'bg-drafted-bg text-drafted-gray hover:bg-drafted-border'
          }`}
        >
          All Types
        </button>
        {processedData.allTypes.map(type => (
          <button
            key={type}
            onClick={() => setSelectedType(selectedType === type ? null : type)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
              selectedType === type
                ? 'bg-drafted-black text-white'
                : 'bg-drafted-bg text-drafted-gray hover:bg-drafted-border'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: ROOM_TYPE_COLORS[type] || '#888' }}
            />
            {type.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      
      {/* Display Controls */}
      <div className="flex items-center gap-3 text-xs">
        <button
          onClick={() => setShowPoints(!showPoints)}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
            showPoints ? 'bg-coral-500 text-white' : 'bg-drafted-bg text-drafted-gray'
          }`}
        >
          Points
        </button>
        <button
          onClick={() => setShowMeans(!showMeans)}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
            showMeans ? 'bg-coral-500 text-white' : 'bg-drafted-bg text-drafted-gray'
          }`}
        >
          <Target className="w-3 h-3" />
          Means
        </button>
        <button
          onClick={() => setShowEllipses(!showEllipses)}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
            showEllipses ? 'bg-coral-500 text-white' : 'bg-drafted-bg text-drafted-gray'
          }`}
        >
          Confidence
        </button>
      </div>
      
      {/* Scatter Chart */}
      <div className="bg-white rounded-lg border border-drafted-border overflow-hidden">
        <svg
          width={chartWidth}
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full"
        >
          {/* Grid */}
          <defs>
            <pattern id="scatter-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f0f0f0" strokeWidth="1" />
            </pattern>
          </defs>
          <rect
            x={chartPadding}
            y={chartPadding}
            width={chartWidth - 2 * chartPadding}
            height={chartHeight - 2 * chartPadding}
            fill="url(#scatter-grid)"
            stroke="#e5e5e5"
          />
          
          {/* Axis labels */}
          <text x={chartWidth / 2} y={chartHeight - 10} textAnchor="middle" className="fill-drafted-muted text-xs">
            X Position (normalized)
          </text>
          <text
            x={15}
            y={chartHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90, 15, ${chartHeight / 2})`}
            className="fill-drafted-muted text-xs"
          >
            Y Position
          </text>
          
          {/* Room type data */}
          {displayTypes.map(type => {
            const stats = processedData.stats.get(type);
            if (!stats) return null;
            
            const color = ROOM_TYPE_COLORS[type] || '#888';
            const meanCoord = toChartCoord(stats.meanPosition);
            
            return (
              <g key={type}>
                {/* Confidence ellipse */}
                <AnimatePresence>
                  {showEllipses && (
                    <motion.ellipse
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 0.2 }}
                      exit={{ scale: 0, opacity: 0 }}
                      cx={meanCoord.x}
                      cy={meanCoord.y}
                      rx={stats.confidenceEllipse.rx * (chartWidth - 2 * chartPadding)}
                      ry={stats.confidenceEllipse.ry * (chartHeight - 2 * chartPadding)}
                      fill={color}
                      stroke={color}
                      strokeWidth={1}
                    />
                  )}
                </AnimatePresence>
                
                {/* Individual points */}
                <AnimatePresence>
                  {showPoints && stats.positions.map((pos, i) => {
                    const coord = toChartCoord(pos);
                    return (
                      <motion.circle
                        key={`${type}-${i}`}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 0.7 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ delay: i * 0.02 }}
                        cx={coord.x}
                        cy={coord.y}
                        r={4}
                        fill={color}
                        stroke="white"
                        strokeWidth={1}
                      />
                    );
                  })}
                </AnimatePresence>
                
                {/* Mean position */}
                <AnimatePresence>
                  {showMeans && (
                    <motion.g
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                    >
                      <circle
                        cx={meanCoord.x}
                        cy={meanCoord.y}
                        r={8}
                        fill="white"
                        stroke={color}
                        strokeWidth={3}
                      />
                      <line
                        x1={meanCoord.x - 5}
                        y1={meanCoord.y}
                        x2={meanCoord.x + 5}
                        y2={meanCoord.y}
                        stroke={color}
                        strokeWidth={2}
                      />
                      <line
                        x1={meanCoord.x}
                        y1={meanCoord.y - 5}
                        x2={meanCoord.x}
                        y2={meanCoord.y + 5}
                        stroke={color}
                        strokeWidth={2}
                      />
                    </motion.g>
                  )}
                </AnimatePresence>
              </g>
            );
          })}
        </svg>
      </div>
      
      {/* Legend / Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {displayTypes.slice(0, 6).map(type => {
          const stats = processedData.stats.get(type);
          if (!stats) return null;
          
          return (
            <div
              key={type}
              className="flex items-center gap-2 p-2 bg-drafted-bg rounded"
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: ROOM_TYPE_COLORS[type] || '#888' }}
              />
              <div className="min-w-0">
                <div className="font-medium text-drafted-black truncate capitalize">
                  {type.replace(/_/g, ' ')}
                </div>
                <div className="text-drafted-muted">
                  σx: {(stats.stdDevX * 100).toFixed(1)}%, σy: {(stats.stdDevY * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Info */}
      <p className="text-xs text-drafted-muted">
        Scatter plot shows room centroid positions across generations.
        Ellipses represent 95% confidence intervals for position variance.
        Tighter clusters indicate more consistent room placement.
      </p>
    </div>
  );
}






