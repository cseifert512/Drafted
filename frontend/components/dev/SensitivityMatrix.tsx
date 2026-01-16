'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Grid3X3, HelpCircle, ArrowRight } from 'lucide-react';
import type { GeneratedRoom, RoomSize } from '@/lib/drafted-types';

interface EditResult {
  id: string;
  editType: 'add' | 'remove' | 'resize';
  targetRoom: string;
  originalRooms: GeneratedRoom[];
  resultRooms: GeneratedRoom[];
  originalTotalArea: number;
  resultTotalArea: number;
}

interface SensitivityMatrixProps {
  /** Array of edit results to analyze */
  editResults: EditResult[];
  /** Height of the visualization */
  height?: number;
  /** Class name */
  className?: string;
}

interface ImpactCell {
  targetRoom: string;
  affectedRoom: string;
  impact: number; // -1 to 1 (negative = decrease, positive = increase)
  changeType: 'size' | 'added' | 'removed' | 'unchanged';
  avgAreaChange: number;
  occurrences: number;
}

// Room colors
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

/**
 * Calculate impact of editing one room on other rooms
 */
function calculateImpactMatrix(
  editResults: EditResult[]
): Map<string, Map<string, ImpactCell>> {
  const matrix = new Map<string, Map<string, ImpactCell>>();
  const impactData = new Map<string, ImpactCell[]>();
  
  editResults.forEach(result => {
    const originalByType = new Map<string, number>();
    const resultByType = new Map<string, number>();
    
    // Aggregate areas by room type
    result.originalRooms.forEach(r => {
      originalByType.set(r.room_type, (originalByType.get(r.room_type) || 0) + r.area_sqft);
    });
    
    result.resultRooms.forEach(r => {
      resultByType.set(r.room_type, (resultByType.get(r.room_type) || 0) + r.area_sqft);
    });
    
    // Get all room types
    const allTypes = new Set<string>();
    originalByType.forEach((_, type) => allTypes.add(type));
    resultByType.forEach((_, type) => allTypes.add(type));
    
    // Calculate impact on each room type
    allTypes.forEach(affectedType => {
      if (affectedType === result.targetRoom) return; // Skip self
      
      const originalArea = originalByType.get(affectedType) || 0;
      const resultArea = resultByType.get(affectedType) || 0;
      const areaChange = resultArea - originalArea;
      
      // Determine change type
      let changeType: ImpactCell['changeType'] = 'unchanged';
      if (originalArea === 0 && resultArea > 0) changeType = 'added';
      else if (originalArea > 0 && resultArea === 0) changeType = 'removed';
      else if (Math.abs(areaChange) > 5) changeType = 'size';
      
      // Calculate normalized impact (-1 to 1)
      let impact = 0;
      if (originalArea > 0) {
        impact = areaChange / originalArea;
        impact = Math.max(-1, Math.min(1, impact)); // Clamp
      } else if (resultArea > 0) {
        impact = 1; // Room was added
      }
      
      const key = `${result.targetRoom}->${affectedType}`;
      if (!impactData.has(key)) {
        impactData.set(key, []);
      }
      
      impactData.get(key)!.push({
        targetRoom: result.targetRoom,
        affectedRoom: affectedType,
        impact,
        changeType,
        avgAreaChange: areaChange,
        occurrences: 1,
      });
    });
  });
  
  // Aggregate impact data
  impactData.forEach((impacts, key) => {
    const [target, affected] = key.split('->');
    
    if (!matrix.has(target)) {
      matrix.set(target, new Map());
    }
    
    const avgImpact = impacts.reduce((sum, i) => sum + i.impact, 0) / impacts.length;
    const avgAreaChange = impacts.reduce((sum, i) => sum + i.avgAreaChange, 0) / impacts.length;
    
    // Determine dominant change type
    const typeCounts = impacts.reduce((acc, i) => {
      acc[i.changeType] = (acc[i.changeType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const dominantType = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])[0][0] as ImpactCell['changeType'];
    
    matrix.get(target)!.set(affected, {
      targetRoom: target,
      affectedRoom: affected,
      impact: avgImpact,
      changeType: dominantType,
      avgAreaChange,
      occurrences: impacts.length,
    });
  });
  
  return matrix;
}

/**
 * Get color for impact value
 */
function getImpactColor(impact: number): string {
  if (Math.abs(impact) < 0.05) return '#f0f0f0';
  
  if (impact > 0) {
    // Positive = green
    const intensity = Math.min(impact, 1);
    return `rgba(34, 197, 94, ${0.2 + intensity * 0.6})`;
  } else {
    // Negative = red
    const intensity = Math.min(-impact, 1);
    return `rgba(239, 68, 68, ${0.2 + intensity * 0.6})`;
  }
}

export function SensitivityMatrix({
  editResults,
  height = 400,
  className = '',
}: SensitivityMatrixProps) {
  const [selectedCell, setSelectedCell] = useState<ImpactCell | null>(null);
  const [showValues, setShowValues] = useState(true);
  
  // Calculate impact matrix
  const { matrix, targetRooms, affectedRooms } = useMemo(() => {
    if (editResults.length === 0) {
      return { matrix: new Map(), targetRooms: [], affectedRooms: [] };
    }
    
    const m = calculateImpactMatrix(editResults);
    const targets = Array.from(m.keys()).sort();
    
    const affected = new Set<string>();
    m.forEach(impacts => {
      impacts.forEach((_, type) => affected.add(type));
    });
    
    return {
      matrix: m,
      targetRooms: targets,
      affectedRooms: Array.from(affected).sort(),
    };
  }, [editResults]);
  
  // Generate mock data for demonstration if no real data
  const mockData = useMemo(() => {
    if (editResults.length > 0) return null;
    
    const types = ['kitchen', 'living', 'bedroom', 'bathroom', 'dining', 'garage'];
    const cells: ImpactCell[] = [];
    
    types.forEach(target => {
      types.forEach(affected => {
        if (target === affected) return;
        
        // Generate plausible mock impact
        let impact = 0;
        if (target === 'kitchen' && affected === 'dining') impact = -0.15;
        if (target === 'living' && affected === 'dining') impact = 0.1;
        if (target === 'bedroom' && affected === 'bathroom') impact = -0.08;
        if (target === 'garage' && affected === 'living') impact = -0.05;
        
        // Add some noise
        impact += (Math.random() - 0.5) * 0.1;
        
        cells.push({
          targetRoom: target,
          affectedRoom: affected,
          impact,
          changeType: Math.abs(impact) > 0.05 ? 'size' : 'unchanged',
          avgAreaChange: impact * 150,
          occurrences: 3,
        });
      });
    });
    
    return { types, cells };
  }, [editResults]);
  
  const displayTargets = editResults.length > 0 ? targetRooms : (mockData?.types || []);
  const displayAffected = editResults.length > 0 ? affectedRooms : (mockData?.types || []);
  
  // Get cell data
  const getCell = (target: string, affected: string): ImpactCell | undefined => {
    if (editResults.length > 0) {
      return matrix.get(target)?.get(affected);
    }
    return mockData?.cells.find(c => c.targetRoom === target && c.affectedRoom === affected);
  };
  
  const cellSize = Math.min(50, (350 - 100) / Math.max(displayTargets.length, displayAffected.length));
  
  if (displayTargets.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 bg-drafted-bg rounded-lg ${className}`}>
        <div className="text-center text-drafted-muted">
          <Grid3X3 className="w-8 h-8 mx-auto mb-2" />
          <p>No edit data available for sensitivity analysis</p>
          <p className="text-xs mt-1">Perform some edits to see impact relationships</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Grid3X3 className="w-5 h-5 text-coral-500" />
          <h4 className="font-medium text-drafted-black">Room Impact Matrix</h4>
        </div>
        <button
          onClick={() => setShowValues(!showValues)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            showValues
              ? 'bg-drafted-black text-white'
              : 'bg-drafted-bg text-drafted-gray'
          }`}
        >
          {showValues ? 'Hide Values' : 'Show Values'}
        </button>
      </div>
      
      {/* Description */}
      <p className="text-xs text-drafted-gray">
        Shows how editing one room type (rows) affects other room types (columns).
        Green = increase, Red = decrease. Intensity shows magnitude.
      </p>
      
      {/* Matrix */}
      <div className="overflow-auto" style={{ maxHeight: height }}>
        <div className="inline-block">
          {/* Column headers */}
          <div className="flex">
            <div 
              className="shrink-0 flex items-end justify-center text-[10px] text-drafted-gray font-medium"
              style={{ width: 80, height: 80 }}
            >
              <span className="rotate-0">Affected →</span>
            </div>
            {displayAffected.map(type => (
              <div
                key={type}
                className="shrink-0 flex items-end justify-center pb-1"
                style={{ width: cellSize, height: 80 }}
              >
                <span 
                  className="text-[9px] text-drafted-gray font-medium capitalize transform -rotate-45 origin-bottom-left whitespace-nowrap"
                >
                  {type.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
          
          {/* Rows */}
          {displayTargets.map(targetType => (
            <div key={targetType} className="flex">
              {/* Row header */}
              <div 
                className="shrink-0 flex items-center justify-end pr-2 text-[10px] text-drafted-gray font-medium capitalize"
                style={{ width: 80, height: cellSize }}
              >
                {targetType.replace(/_/g, ' ')}
              </div>
              
              {/* Cells */}
              {displayAffected.map(affectedType => {
                const cell = getCell(targetType, affectedType);
                const isSelf = targetType === affectedType;
                
                return (
                  <motion.div
                    key={`${targetType}-${affectedType}`}
                    className={`shrink-0 border border-white flex items-center justify-center cursor-pointer transition-all ${
                      selectedCell?.targetRoom === targetType && selectedCell?.affectedRoom === affectedType
                        ? 'ring-2 ring-coral-500'
                        : ''
                    }`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: isSelf ? '#f5f5f5' : (cell ? getImpactColor(cell.impact) : '#f9f9f9'),
                    }}
                    onClick={() => cell && setSelectedCell(cell)}
                    whileHover={{ scale: 1.05 }}
                    title={
                      isSelf ? 'Self' :
                      cell ? `${targetType} → ${affectedType}: ${(cell.impact * 100).toFixed(1)}%` :
                      'No data'
                    }
                  >
                    {isSelf ? (
                      <span className="text-drafted-muted text-[10px]">—</span>
                    ) : cell && showValues ? (
                      <span className={`text-[9px] font-mono ${
                        Math.abs(cell.impact) < 0.05 ? 'text-drafted-muted' :
                        cell.impact > 0 ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {cell.impact > 0 ? '+' : ''}{(cell.impact * 100).toFixed(0)}%
                      </span>
                    ) : null}
                  </motion.div>
                );
              })}
            </div>
          ))}
          
          {/* Row label */}
          <div className="flex mt-2">
            <div 
              className="shrink-0 text-[10px] text-drafted-gray font-medium"
              style={{ width: 80 }}
            >
              ↓ Edited Room
            </div>
          </div>
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.6)' }} />
          <span className="text-drafted-gray">Decrease</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gray-100" />
          <span className="text-drafted-gray">No change</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }} />
          <span className="text-drafted-gray">Increase</span>
        </div>
      </div>
      
      {/* Selected Cell Detail */}
      {selectedCell && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 bg-drafted-bg rounded-lg text-sm"
        >
          <div className="flex items-center gap-2 mb-2">
            <span 
              className="px-2 py-0.5 rounded text-xs font-medium capitalize"
              style={{ backgroundColor: ROOM_TYPE_COLORS[selectedCell.targetRoom] || '#888', color: '#000' }}
            >
              {selectedCell.targetRoom.replace(/_/g, ' ')}
            </span>
            <ArrowRight className="w-4 h-4 text-drafted-gray" />
            <span 
              className="px-2 py-0.5 rounded text-xs font-medium capitalize"
              style={{ backgroundColor: ROOM_TYPE_COLORS[selectedCell.affectedRoom] || '#888', color: '#000' }}
            >
              {selectedCell.affectedRoom.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-drafted-muted">Impact</div>
              <div className={`font-semibold ${selectedCell.impact > 0 ? 'text-green-600' : selectedCell.impact < 0 ? 'text-red-600' : 'text-drafted-gray'}`}>
                {selectedCell.impact > 0 ? '+' : ''}{(selectedCell.impact * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-drafted-muted">Avg Area Δ</div>
              <div className="font-semibold">
                {selectedCell.avgAreaChange > 0 ? '+' : ''}{Math.round(selectedCell.avgAreaChange)} sqft
              </div>
            </div>
            <div>
              <div className="text-drafted-muted">Observations</div>
              <div className="font-semibold">{selectedCell.occurrences}</div>
            </div>
          </div>
        </motion.div>
      )}
      
      {/* Mock data notice */}
      {editResults.length === 0 && (
        <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-100 rounded text-xs text-amber-700">
          <HelpCircle className="w-4 h-4 shrink-0" />
          <span>Showing sample data. Perform actual edits to see real impact relationships.</span>
        </div>
      )}
    </div>
  );
}






