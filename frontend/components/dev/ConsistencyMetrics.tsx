'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Gauge, CheckCircle, AlertTriangle, XCircle, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { GeneratedRoom } from '@/lib/drafted-types';
import { 
  mean, 
  stdDev, 
  coefficientOfVariation, 
  consistencyFromCV,
  compareGenerations,
  calculateSimilarityMatrix,
  type GenerationData,
} from '@/lib/dev/batchAnalysis';

interface GenerationMetricsData {
  id: string;
  index: number;
  success: boolean;
  totalAreaSqft: number;
  rooms: GeneratedRoom[];
  elapsedSeconds: number;
}

interface ConsistencyMetricsProps {
  /** Array of generation data */
  generations: GenerationMetricsData[];
  /** Expected/target values for comparison */
  expected?: {
    targetSqft?: number;
    roomCount?: number;
  };
  /** Class name */
  className?: string;
}

interface MetricScore {
  value: number;
  level: 'excellent' | 'good' | 'fair' | 'poor';
  label: string;
  description: string;
}

function getScoreLevel(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= 0.85) return 'excellent';
  if (score >= 0.65) return 'good';
  if (score >= 0.4) return 'fair';
  return 'poor';
}

function getLevelColor(level: MetricScore['level']): string {
  switch (level) {
    case 'excellent': return '#10b981';
    case 'good': return '#22c55e';
    case 'fair': return '#f59e0b';
    case 'poor': return '#ef4444';
  }
}

function getLevelIcon(level: MetricScore['level']) {
  switch (level) {
    case 'excellent': return CheckCircle;
    case 'good': return CheckCircle;
    case 'fair': return AlertTriangle;
    case 'poor': return XCircle;
  }
}

/**
 * Circular progress indicator for scores
 */
function CircularScore({ 
  score, 
  size = 120, 
  label 
}: { 
  score: number; 
  size?: number; 
  label: string;
}) {
  const level = getScoreLevel(score);
  const color = getLevelColor(level);
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score * circumference);
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#f0f0f0"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <motion.circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            transform="rotate(-90 50 50)"
          />
        </svg>
        {/* Score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-2xl font-bold"
            style={{ color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {Math.round(score * 100)}
          </motion.span>
          <span className="text-xs text-drafted-muted">/ 100</span>
        </div>
      </div>
      <span className="mt-2 text-sm font-medium text-drafted-gray">{label}</span>
    </div>
  );
}

export function ConsistencyMetrics({
  generations,
  expected,
  className = '',
}: ConsistencyMetricsProps) {
  const [showDetails, setShowDetails] = useState(false);
  
  // Calculate all metrics
  const metrics = useMemo(() => {
    const successful = generations.filter(g => g.success);
    if (successful.length < 2) {
      return null;
    }
    
    // Area consistency
    const areas = successful.map(g => g.totalAreaSqft);
    const areaCV = coefficientOfVariation(areas);
    const areaConsistency = consistencyFromCV(areaCV);
    
    // Room count consistency
    const roomCounts = successful.map(g => g.rooms.length);
    const countCV = coefficientOfVariation(roomCounts);
    const countConsistency = consistencyFromCV(countCV);
    
    // Room type consistency (how often same types appear)
    const allTypes = new Set<string>();
    successful.forEach(g => g.rooms.forEach(r => allTypes.add(r.room_type)));
    
    const typePresence = Array.from(allTypes).map(type => {
      const presence = successful.filter(g => 
        g.rooms.some(r => r.room_type === type)
      ).length / successful.length;
      return presence;
    });
    const typeConsistency = mean(typePresence);
    
    // Pairwise similarity
    const genData: GenerationData[] = successful.map(g => ({
      success: true,
      seed: g.index, // Using index as placeholder
      totalAreaSqft: g.totalAreaSqft,
      elapsedSeconds: g.elapsedSeconds,
      rooms: g.rooms,
    }));
    
    const similarityMatrix = calculateSimilarityMatrix(genData);
    let totalSimilarity = 0;
    let pairCount = 0;
    for (let i = 0; i < similarityMatrix.length; i++) {
      for (let j = i + 1; j < similarityMatrix.length; j++) {
        totalSimilarity += similarityMatrix[i][j];
        pairCount++;
      }
    }
    const avgSimilarity = pairCount > 0 ? totalSimilarity / pairCount : 0;
    
    // Overall consistency (weighted average)
    const overallConsistency = (
      areaConsistency * 0.3 +
      countConsistency * 0.2 +
      typeConsistency * 0.25 +
      avgSimilarity * 0.25
    );
    
    // Accuracy metrics (if expected values provided)
    let areaAccuracy: number | null = null;
    let countAccuracy: number | null = null;
    
    if (expected?.targetSqft) {
      const avgArea = mean(areas);
      const areaError = Math.abs(avgArea - expected.targetSqft) / expected.targetSqft;
      areaAccuracy = Math.max(0, 1 - areaError);
    }
    
    if (expected?.roomCount) {
      const avgCount = mean(roomCounts);
      const countError = Math.abs(avgCount - expected.roomCount) / expected.roomCount;
      countAccuracy = Math.max(0, 1 - countError);
    }
    
    // Generation time stats
    const times = successful.map(g => g.elapsedSeconds);
    const avgTime = mean(times);
    const timeVariance = stdDev(times, avgTime);
    
    return {
      sampleSize: successful.length,
      successRate: successful.length / generations.length,
      
      overallConsistency,
      areaConsistency,
      countConsistency,
      typeConsistency,
      pairwiseSimilarity: avgSimilarity,
      
      areaStats: {
        mean: mean(areas),
        stdDev: stdDev(areas),
        cv: areaCV,
      },
      countStats: {
        mean: mean(roomCounts),
        stdDev: stdDev(roomCounts),
        cv: countCV,
      },
      
      areaAccuracy,
      countAccuracy,
      
      timeStats: {
        mean: avgTime,
        stdDev: timeVariance,
      },
      
      uniqueRoomTypes: allTypes.size,
    };
  }, [generations, expected]);
  
  if (!metrics) {
    return (
      <div className={`flex items-center justify-center p-8 bg-drafted-bg rounded-lg ${className}`}>
        <div className="text-center text-drafted-muted">
          <Gauge className="w-8 h-8 mx-auto mb-2" />
          <p>Need at least 2 successful generations for consistency analysis</p>
        </div>
      </div>
    );
  }
  
  const overallLevel = getScoreLevel(metrics.overallConsistency);
  const OverallIcon = getLevelIcon(overallLevel);
  
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-coral-500" />
          <h4 className="font-medium text-drafted-black">Consistency Analysis</h4>
        </div>
        <span className="text-xs text-drafted-muted">
          {metrics.sampleSize} samples analyzed
        </span>
      </div>
      
      {/* Overall Score */}
      <div className="flex items-center justify-center gap-8 py-4">
        <CircularScore 
          score={metrics.overallConsistency} 
          size={140} 
          label="Overall Consistency"
        />
        
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <OverallIcon className="w-5 h-5" style={{ color: getLevelColor(overallLevel) }} />
            <span 
              className="text-lg font-semibold capitalize"
              style={{ color: getLevelColor(overallLevel) }}
            >
              {overallLevel}
            </span>
          </div>
          <p className="text-sm text-drafted-gray max-w-xs">
            {overallLevel === 'excellent' && 'Model produces highly consistent outputs across generations.'}
            {overallLevel === 'good' && 'Model shows good consistency with minor variations.'}
            {overallLevel === 'fair' && 'Model shows moderate consistency with noticeable variations.'}
            {overallLevel === 'poor' && 'Model outputs vary significantly between generations.'}
          </p>
        </div>
      </div>
      
      {/* Metric Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Area', value: metrics.areaConsistency, cv: metrics.areaStats.cv },
          { label: 'Room Count', value: metrics.countConsistency, cv: metrics.countStats.cv },
          { label: 'Room Types', value: metrics.typeConsistency },
          { label: 'Similarity', value: metrics.pairwiseSimilarity },
        ].map(({ label, value, cv }) => {
          const level = getScoreLevel(value);
          const color = getLevelColor(level);
          
          return (
            <div key={label} className="p-3 bg-drafted-bg rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-drafted-gray">{label}</span>
                {cv !== undefined && (
                  <span className="text-[10px] text-drafted-muted">CV: {(cv * 100).toFixed(1)}%</span>
                )}
              </div>
              <div className="flex items-end gap-2">
                <span className="text-xl font-bold" style={{ color }}>
                  {Math.round(value * 100)}%
                </span>
                <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden mb-1.5">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${value * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Accuracy Metrics (if expected provided) */}
      {(metrics.areaAccuracy !== null || metrics.countAccuracy !== null) && (
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
          <h5 className="text-sm font-medium text-blue-900 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Accuracy vs Target
          </h5>
          <div className="grid grid-cols-2 gap-4">
            {metrics.areaAccuracy !== null && (
              <div>
                <div className="text-xs text-blue-700 mb-1">Area Accuracy</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-blue-900">
                    {Math.round(metrics.areaAccuracy * 100)}%
                  </span>
                  <span className="text-xs text-blue-600">
                    Target: {expected?.targetSqft?.toLocaleString()} sqft
                  </span>
                </div>
                <div className="text-xs text-blue-600">
                  Actual avg: {Math.round(metrics.areaStats.mean).toLocaleString()} sqft
                </div>
              </div>
            )}
            {metrics.countAccuracy !== null && (
              <div>
                <div className="text-xs text-blue-700 mb-1">Room Count Accuracy</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-blue-900">
                    {Math.round(metrics.countAccuracy * 100)}%
                  </span>
                  <span className="text-xs text-blue-600">
                    Target: {expected?.roomCount} rooms
                  </span>
                </div>
                <div className="text-xs text-blue-600">
                  Actual avg: {metrics.countStats.mean.toFixed(1)} rooms
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Detailed Stats */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-center justify-center gap-2 py-2 text-sm text-drafted-gray hover:text-drafted-black transition-colors"
      >
        <Info className="w-4 h-4" />
        {showDetails ? 'Hide Details' : 'Show Details'}
      </button>
      
      {showDetails && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-3 text-xs"
        >
          <div className="grid grid-cols-3 gap-3">
            <div className="p-2 bg-drafted-bg rounded">
              <div className="text-drafted-muted">Success Rate</div>
              <div className="font-semibold">{Math.round(metrics.successRate * 100)}%</div>
            </div>
            <div className="p-2 bg-drafted-bg rounded">
              <div className="text-drafted-muted">Avg Gen Time</div>
              <div className="font-semibold">{metrics.timeStats.mean.toFixed(1)}s</div>
            </div>
            <div className="p-2 bg-drafted-bg rounded">
              <div className="text-drafted-muted">Time Variance</div>
              <div className="font-semibold">±{metrics.timeStats.stdDev.toFixed(2)}s</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 bg-drafted-bg rounded">
              <div className="text-drafted-muted">Area Mean ± σ</div>
              <div className="font-semibold">
                {Math.round(metrics.areaStats.mean).toLocaleString()} ± {Math.round(metrics.areaStats.stdDev)}
              </div>
            </div>
            <div className="p-2 bg-drafted-bg rounded">
              <div className="text-drafted-muted">Room Count Mean ± σ</div>
              <div className="font-semibold">
                {metrics.countStats.mean.toFixed(1)} ± {metrics.countStats.stdDev.toFixed(1)}
              </div>
            </div>
          </div>
          
          <div className="p-2 bg-drafted-bg rounded">
            <div className="text-drafted-muted mb-1">Unique Room Types Across Generations</div>
            <div className="font-semibold">{metrics.uniqueRoomTypes} types</div>
          </div>
        </motion.div>
      )}
    </div>
  );
}






