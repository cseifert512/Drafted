'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, TrendingUp, ChevronDown } from 'lucide-react';
import type { GeneratedRoom } from '@/lib/drafted-types';
import { mean, median, stdDev, quartiles } from '@/lib/dev/batchAnalysis';

interface GenerationSizeData {
  id: string;
  index: number;
  totalAreaSqft: number;
  rooms: GeneratedRoom[];
}

interface SizeDistributionProps {
  /** Array of generation data */
  generations: GenerationSizeData[];
  /** Height of the chart */
  height?: number;
  /** Class name */
  className?: string;
}

// Colors for room types
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
};

interface BoxPlotData {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  values: number[];
  outliers: number[];
}

/**
 * Calculate box plot statistics with outlier detection
 */
function calculateBoxPlotData(values: number[]): BoxPlotData {
  if (values.length === 0) {
    return { min: 0, q1: 0, median: 0, q3: 0, max: 0, mean: 0, values: [], outliers: [] };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const [q1, med, q3] = quartiles(sorted);
  const iqr = q3 - q1;
  
  // Outliers are values beyond 1.5 * IQR
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  
  const outliers = sorted.filter(v => v < lowerFence || v > upperFence);
  const nonOutliers = sorted.filter(v => v >= lowerFence && v <= upperFence);
  
  return {
    min: nonOutliers.length > 0 ? Math.min(...nonOutliers) : sorted[0],
    q1,
    median: med,
    q3,
    max: nonOutliers.length > 0 ? Math.max(...nonOutliers) : sorted[sorted.length - 1],
    mean: mean(values),
    values,
    outliers,
  };
}

export function SizeDistribution({
  generations,
  height = 400,
  className = '',
}: SizeDistributionProps) {
  const [viewMode, setViewMode] = useState<'total' | 'rooms'>('total');
  const [selectedRoomType, setSelectedRoomType] = useState<string | null>(null);
  const [showHistogram, setShowHistogram] = useState(false);
  
  // Calculate statistics
  const stats = useMemo(() => {
    // Total area stats
    const totalAreas = generations.map(g => g.totalAreaSqft);
    const totalAreaStats = calculateBoxPlotData(totalAreas);
    
    // Room count stats
    const roomCounts = generations.map(g => g.rooms.length);
    const roomCountStats = calculateBoxPlotData(roomCounts);
    
    // Per-room-type area stats
    const roomTypeStats = new Map<string, BoxPlotData>();
    const allRoomTypes = new Set<string>();
    
    generations.forEach(gen => {
      gen.rooms.forEach(room => allRoomTypes.add(room.room_type));
    });
    
    allRoomTypes.forEach(type => {
      const areas: number[] = [];
      generations.forEach(gen => {
        gen.rooms
          .filter(r => r.room_type === type)
          .forEach(r => areas.push(r.area_sqft));
      });
      if (areas.length > 0) {
        roomTypeStats.set(type, calculateBoxPlotData(areas));
      }
    });
    
    return {
      totalArea: totalAreaStats,
      roomCount: roomCountStats,
      roomTypes: roomTypeStats,
      allTypes: Array.from(allRoomTypes).sort(),
    };
  }, [generations]);
  
  // Histogram data
  const histogramData = useMemo(() => {
    let values: number[];
    let label: string;
    
    if (viewMode === 'total') {
      values = stats.totalArea.values;
      label = 'Total Area (sqft)';
    } else if (selectedRoomType) {
      values = stats.roomTypes.get(selectedRoomType)?.values || [];
      label = `${selectedRoomType.replace(/_/g, ' ')} Area (sqft)`;
    } else {
      return { bins: [], label: '', maxCount: 0 };
    }
    
    if (values.length === 0) return { bins: [], label, maxCount: 0 };
    
    // Create histogram bins
    const min = Math.min(...values);
    const max = Math.max(...values);
    const numBins = Math.min(10, Math.ceil(values.length / 2));
    const binWidth = (max - min) / numBins || 1;
    
    const bins = Array.from({ length: numBins }, (_, i) => ({
      start: min + i * binWidth,
      end: min + (i + 1) * binWidth,
      count: 0,
    }));
    
    values.forEach(v => {
      const binIndex = Math.min(Math.floor((v - min) / binWidth), numBins - 1);
      if (binIndex >= 0 && binIndex < bins.length) {
        bins[binIndex].count++;
      }
    });
    
    const maxCount = Math.max(...bins.map(b => b.count));
    
    return { bins, label, maxCount };
  }, [viewMode, selectedRoomType, stats]);
  
  // Chart dimensions
  const chartPadding = 50;
  const chartWidth = 350;
  const chartHeight = height - 120;
  
  // Box plot rendering helper
  const renderBoxPlot = (
    data: BoxPlotData,
    x: number,
    width: number,
    minVal: number,
    maxVal: number,
    color: string
  ) => {
    const scaleY = (v: number) => 
      chartHeight - chartPadding - ((v - minVal) / (maxVal - minVal)) * (chartHeight - 2 * chartPadding);
    
    return (
      <g>
        {/* Whiskers */}
        <line
          x1={x + width / 2}
          y1={scaleY(data.min)}
          x2={x + width / 2}
          y2={scaleY(data.q1)}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="3,3"
        />
        <line
          x1={x + width / 2}
          y1={scaleY(data.q3)}
          x2={x + width / 2}
          y2={scaleY(data.max)}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="3,3"
        />
        
        {/* Whisker caps */}
        <line
          x1={x + width * 0.25}
          y1={scaleY(data.min)}
          x2={x + width * 0.75}
          y2={scaleY(data.min)}
          stroke={color}
          strokeWidth={1}
        />
        <line
          x1={x + width * 0.25}
          y1={scaleY(data.max)}
          x2={x + width * 0.75}
          y2={scaleY(data.max)}
          stroke={color}
          strokeWidth={1}
        />
        
        {/* Box */}
        <rect
          x={x}
          y={scaleY(data.q3)}
          width={width}
          height={scaleY(data.q1) - scaleY(data.q3)}
          fill={color}
          fillOpacity={0.3}
          stroke={color}
          strokeWidth={2}
          rx={2}
        />
        
        {/* Median line */}
        <line
          x1={x}
          y1={scaleY(data.median)}
          x2={x + width}
          y2={scaleY(data.median)}
          stroke={color}
          strokeWidth={3}
        />
        
        {/* Mean diamond */}
        <polygon
          points={`
            ${x + width / 2},${scaleY(data.mean) - 4}
            ${x + width / 2 + 4},${scaleY(data.mean)}
            ${x + width / 2},${scaleY(data.mean) + 4}
            ${x + width / 2 - 4},${scaleY(data.mean)}
          `}
          fill="white"
          stroke={color}
          strokeWidth={1.5}
        />
        
        {/* Outliers */}
        {data.outliers.map((v, i) => (
          <circle
            key={i}
            cx={x + width / 2}
            cy={scaleY(v)}
            r={3}
            fill="none"
            stroke={color}
            strokeWidth={1}
          />
        ))}
      </g>
    );
  };
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-coral-500" />
          <h4 className="font-medium text-drafted-black">Size Distribution</h4>
        </div>
        <span className="text-xs text-drafted-muted">
          {generations.length} samples
        </span>
      </div>
      
      {/* View Mode Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setViewMode('total'); setSelectedRoomType(null); }}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            viewMode === 'total'
              ? 'bg-coral-500 text-white'
              : 'bg-drafted-bg text-drafted-gray hover:bg-drafted-border'
          }`}
        >
          Total Area
        </button>
        <button
          onClick={() => setViewMode('rooms')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            viewMode === 'rooms'
              ? 'bg-coral-500 text-white'
              : 'bg-drafted-bg text-drafted-gray hover:bg-drafted-border'
          }`}
        >
          By Room Type
        </button>
        <button
          onClick={() => setShowHistogram(!showHistogram)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            showHistogram
              ? 'bg-drafted-black text-white'
              : 'bg-drafted-bg text-drafted-gray hover:bg-drafted-border'
          }`}
        >
          Histogram
        </button>
      </div>
      
      {/* Room Type Selector (for rooms view) */}
      {viewMode === 'rooms' && (
        <div className="flex flex-wrap gap-1.5">
          {stats.allTypes.map(type => (
            <button
              key={type}
              onClick={() => setSelectedRoomType(selectedRoomType === type ? null : type)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                selectedRoomType === type
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
      )}
      
      {/* Chart */}
      <div className="bg-white rounded-lg border border-drafted-border overflow-hidden">
        <svg
          width={chartWidth}
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full"
        >
          {/* Y-axis */}
          <line
            x1={chartPadding}
            y1={chartPadding}
            x2={chartPadding}
            y2={chartHeight - chartPadding}
            stroke="#e5e5e5"
            strokeWidth={1}
          />
          
          {showHistogram && histogramData.bins.length > 0 ? (
            // Histogram view
            <>
              {histogramData.bins.map((bin, i) => {
                const barWidth = (chartWidth - 2 * chartPadding) / histogramData.bins.length - 4;
                const barHeight = (bin.count / histogramData.maxCount) * (chartHeight - 2 * chartPadding);
                const x = chartPadding + i * ((chartWidth - 2 * chartPadding) / histogramData.bins.length) + 2;
                const y = chartHeight - chartPadding - barHeight;
                
                return (
                  <motion.rect
                    key={i}
                    initial={{ height: 0, y: chartHeight - chartPadding }}
                    animate={{ height: barHeight, y }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    x={x}
                    width={barWidth}
                    fill="#f97316"
                    fillOpacity={0.7}
                    rx={2}
                  />
                );
              })}
              
              {/* X-axis labels */}
              {histogramData.bins.map((bin, i) => {
                if (i % 2 !== 0) return null;
                const x = chartPadding + i * ((chartWidth - 2 * chartPadding) / histogramData.bins.length);
                return (
                  <text
                    key={i}
                    x={x + ((chartWidth - 2 * chartPadding) / histogramData.bins.length) / 2}
                    y={chartHeight - chartPadding + 15}
                    textAnchor="middle"
                    className="fill-drafted-muted text-[10px]"
                  >
                    {Math.round(bin.start)}
                  </text>
                );
              })}
            </>
          ) : viewMode === 'total' ? (
            // Total area box plot
            <>
              {renderBoxPlot(
                stats.totalArea,
                chartPadding + 50,
                60,
                stats.totalArea.min * 0.9,
                stats.totalArea.max * 1.1,
                '#f97316'
              )}
              
              {/* Y-axis labels */}
              {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                const val = stats.totalArea.min * 0.9 + pct * (stats.totalArea.max * 1.1 - stats.totalArea.min * 0.9);
                const y = chartHeight - chartPadding - pct * (chartHeight - 2 * chartPadding);
                return (
                  <g key={pct}>
                    <line
                      x1={chartPadding - 5}
                      y1={y}
                      x2={chartPadding}
                      y2={y}
                      stroke="#e5e5e5"
                    />
                    <text
                      x={chartPadding - 10}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-drafted-muted text-[10px]"
                    >
                      {Math.round(val)}
                    </text>
                  </g>
                );
              })}
              
              {/* Label */}
              <text
                x={chartPadding + 80}
                y={chartHeight - 10}
                textAnchor="middle"
                className="fill-drafted-gray text-xs font-medium"
              >
                Total Area
              </text>
            </>
          ) : selectedRoomType && stats.roomTypes.has(selectedRoomType) ? (
            // Room type box plot
            <>
              {(() => {
                const data = stats.roomTypes.get(selectedRoomType)!;
                return renderBoxPlot(
                  data,
                  chartPadding + 50,
                  60,
                  data.min * 0.9,
                  data.max * 1.1,
                  ROOM_TYPE_COLORS[selectedRoomType] || '#888'
                );
              })()}
              
              <text
                x={chartPadding + 80}
                y={chartHeight - 10}
                textAnchor="middle"
                className="fill-drafted-gray text-xs font-medium capitalize"
              >
                {selectedRoomType.replace(/_/g, ' ')}
              </text>
            </>
          ) : (
            // Multi room type box plots
            <>
              {stats.allTypes.slice(0, 5).map((type, i) => {
                const data = stats.roomTypes.get(type);
                if (!data) return null;
                
                const allValues = Array.from(stats.roomTypes.values()).flatMap(d => d.values);
                const globalMin = Math.min(...allValues) * 0.9;
                const globalMax = Math.max(...allValues) * 1.1;
                
                const boxWidth = (chartWidth - 2 * chartPadding - 40) / 5;
                const x = chartPadding + 20 + i * boxWidth;
                
                return (
                  <g key={type}>
                    {renderBoxPlot(
                      data,
                      x,
                      boxWidth - 10,
                      globalMin,
                      globalMax,
                      ROOM_TYPE_COLORS[type] || '#888'
                    )}
                    <text
                      x={x + (boxWidth - 10) / 2}
                      y={chartHeight - 10}
                      textAnchor="middle"
                      className="fill-drafted-muted text-[9px] capitalize"
                    >
                      {type.split('_')[0]}
                    </text>
                  </g>
                );
              })}
            </>
          )}
        </svg>
      </div>
      
      {/* Statistics Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-2 bg-drafted-bg rounded-lg">
          <div className="text-drafted-muted">Mean</div>
          <div className="font-semibold text-drafted-black">
            {viewMode === 'total' 
              ? Math.round(stats.totalArea.mean).toLocaleString()
              : selectedRoomType 
                ? Math.round(stats.roomTypes.get(selectedRoomType)?.mean || 0).toLocaleString()
                : '-'
            } sqft
          </div>
        </div>
        <div className="p-2 bg-drafted-bg rounded-lg">
          <div className="text-drafted-muted">Median</div>
          <div className="font-semibold text-drafted-black">
            {viewMode === 'total'
              ? Math.round(stats.totalArea.median).toLocaleString()
              : selectedRoomType
                ? Math.round(stats.roomTypes.get(selectedRoomType)?.median || 0).toLocaleString()
                : '-'
            } sqft
          </div>
        </div>
        <div className="p-2 bg-drafted-bg rounded-lg">
          <div className="text-drafted-muted">Std Dev</div>
          <div className="font-semibold text-drafted-black">
            {viewMode === 'total'
              ? Math.round(stdDev(stats.totalArea.values, stats.totalArea.mean)).toLocaleString()
              : selectedRoomType
                ? Math.round(stdDev(stats.roomTypes.get(selectedRoomType)?.values || [], stats.roomTypes.get(selectedRoomType)?.mean || 0)).toLocaleString()
                : '-'
            }
          </div>
        </div>
        <div className="p-2 bg-drafted-bg rounded-lg">
          <div className="text-drafted-muted">Range</div>
          <div className="font-semibold text-drafted-black">
            {viewMode === 'total'
              ? `${Math.round(stats.totalArea.min).toLocaleString()} - ${Math.round(stats.totalArea.max).toLocaleString()}`
              : selectedRoomType
                ? `${Math.round(stats.roomTypes.get(selectedRoomType)?.min || 0).toLocaleString()} - ${Math.round(stats.roomTypes.get(selectedRoomType)?.max || 0).toLocaleString()}`
                : '-'
            }
          </div>
        </div>
      </div>
    </div>
  );
}






