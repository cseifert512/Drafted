'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Minus, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';
import type { RoomDelta } from '@/contexts/DevModeContext';
import type { GeneratedRoom } from '@/lib/drafted-types';
import { computeRoomDeltas, computeDeltaSummary, formatRoomType } from '@/lib/dev/deltaUtils';

interface RoomDeltaViewProps {
  originalRooms: GeneratedRoom[];
  editedRooms: GeneratedRoom[];
  className?: string;
}

export function RoomDeltaView({ originalRooms, editedRooms, className = '' }: RoomDeltaViewProps) {
  const deltas = useMemo(
    () => computeRoomDeltas(originalRooms, editedRooms),
    [originalRooms, editedRooms]
  );
  
  const summary = useMemo(
    () => computeDeltaSummary(deltas),
    [deltas]
  );
  
  const originalTotal = originalRooms.reduce((sum, r) => sum + r.area_sqft, 0);
  const editedTotal = editedRooms.reduce((sum, r) => sum + r.area_sqft, 0);
  const areaDelta = editedTotal - originalTotal;
  
  if (deltas.length === 0) {
    return (
      <div className={`p-4 bg-drafted-bg rounded-lg text-center ${className}`}>
        <p className="text-sm text-drafted-gray">No room changes detected</p>
      </div>
    );
  }
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{summary.added}</div>
          <div className="text-xs text-green-700">Added</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{summary.removed}</div>
          <div className="text-xs text-red-700">Removed</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-600">{summary.modified}</div>
          <div className="text-xs text-amber-700">Modified</div>
        </div>
        <div className={`border rounded-lg p-3 text-center ${
          areaDelta > 0 
            ? 'bg-blue-50 border-blue-200' 
            : areaDelta < 0 
              ? 'bg-orange-50 border-orange-200' 
              : 'bg-drafted-bg border-drafted-border'
        }`}>
          <div className={`text-2xl font-bold flex items-center justify-center gap-1 ${
            areaDelta > 0 
              ? 'text-blue-600' 
              : areaDelta < 0 
                ? 'text-orange-600' 
                : 'text-drafted-gray'
          }`}>
            {areaDelta > 0 && <TrendingUp className="w-4 h-4" />}
            {areaDelta < 0 && <TrendingDown className="w-4 h-4" />}
            {areaDelta > 0 ? '+' : ''}{Math.round(areaDelta)}
          </div>
          <div className="text-xs text-drafted-gray">sqft delta</div>
        </div>
      </div>
      
      {/* Delta Table */}
      <div className="border border-drafted-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-drafted-bg">
              <th className="px-3 py-2 text-left font-medium text-drafted-gray">Change</th>
              <th className="px-3 py-2 text-left font-medium text-drafted-gray">Room Type</th>
              <th className="px-3 py-2 text-right font-medium text-drafted-gray">Original</th>
              <th className="px-3 py-2 text-center font-medium text-drafted-gray"></th>
              <th className="px-3 py-2 text-left font-medium text-drafted-gray">Edited</th>
              <th className="px-3 py-2 text-right font-medium text-drafted-gray">Delta</th>
            </tr>
          </thead>
          <tbody>
            {deltas.map((delta, index) => (
              <motion.tr
                key={`${delta.roomType}-${delta.type}-${index}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`border-t border-drafted-border ${
                  delta.type === 'added'
                    ? 'bg-green-50/50'
                    : delta.type === 'removed'
                      ? 'bg-red-50/50'
                      : 'bg-amber-50/50'
                }`}
              >
                {/* Change Type Icon */}
                <td className="px-3 py-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    delta.type === 'added'
                      ? 'bg-green-100 text-green-600'
                      : delta.type === 'removed'
                        ? 'bg-red-100 text-red-600'
                        : 'bg-amber-100 text-amber-600'
                  }`}>
                    {delta.type === 'added' && <Plus className="w-3.5 h-3.5" />}
                    {delta.type === 'removed' && <Minus className="w-3.5 h-3.5" />}
                    {delta.type === 'modified' && <ArrowRight className="w-3.5 h-3.5" />}
                  </div>
                </td>
                
                {/* Room Type */}
                <td className="px-3 py-2">
                  <span className="font-medium text-drafted-black">{delta.displayName}</span>
                </td>
                
                {/* Original */}
                <td className="px-3 py-2 text-right">
                  {delta.originalArea ? (
                    <div>
                      <span className="font-mono text-drafted-gray">
                        {delta.originalSize}
                      </span>
                      <span className="text-drafted-muted ml-1">
                        ({Math.round(delta.originalArea)} sqft)
                      </span>
                    </div>
                  ) : (
                    <span className="text-drafted-muted">—</span>
                  )}
                </td>
                
                {/* Arrow */}
                <td className="px-3 py-2 text-center">
                  <ArrowRight className="w-4 h-4 text-drafted-muted inline" />
                </td>
                
                {/* Edited */}
                <td className="px-3 py-2">
                  {delta.editedArea ? (
                    <div>
                      <span className="font-mono text-drafted-gray">
                        {delta.editedSize}
                      </span>
                      <span className="text-drafted-muted ml-1">
                        ({Math.round(delta.editedArea)} sqft)
                      </span>
                    </div>
                  ) : (
                    <span className="text-drafted-muted">—</span>
                  )}
                </td>
                
                {/* Delta */}
                <td className="px-3 py-2 text-right">
                  {delta.areaDelta !== undefined && delta.areaDelta !== 0 ? (
                    <span className={`font-mono font-medium ${
                      delta.areaDelta > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {delta.areaDelta > 0 ? '+' : ''}{Math.round(delta.areaDelta)}
                    </span>
                  ) : delta.type === 'added' && delta.editedArea ? (
                    <span className="font-mono font-medium text-green-600">
                      +{Math.round(delta.editedArea)}
                    </span>
                  ) : delta.type === 'removed' && delta.originalArea ? (
                    <span className="font-mono font-medium text-red-600">
                      -{Math.round(delta.originalArea)}
                    </span>
                  ) : (
                    <span className="text-drafted-muted">—</span>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Total Area Comparison */}
      <div className="flex items-center justify-between px-4 py-3 bg-drafted-bg rounded-lg">
        <div className="text-sm">
          <span className="text-drafted-gray">Original Total:</span>
          <span className="ml-2 font-semibold text-drafted-black">{Math.round(originalTotal).toLocaleString()} sqft</span>
        </div>
        <ArrowRight className="w-4 h-4 text-drafted-muted" />
        <div className="text-sm">
          <span className="text-drafted-gray">Edited Total:</span>
          <span className="ml-2 font-semibold text-drafted-black">{Math.round(editedTotal).toLocaleString()} sqft</span>
        </div>
        <div className={`text-sm font-mono font-bold ${
          areaDelta > 0 ? 'text-green-600' : areaDelta < 0 ? 'text-red-600' : 'text-drafted-gray'
        }`}>
          ({areaDelta > 0 ? '+' : ''}{Math.round(areaDelta)})
        </div>
      </div>
    </div>
  );
}








