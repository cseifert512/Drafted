'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Share2, Download, Heart, Pencil, Check, Edit3 } from 'lucide-react';
import type { UploadedPlan, ScatterPoint } from '@/lib/types';
import { getClusterColor } from '@/lib/colors';

interface DraftGridProps {
  plans: UploadedPlan[];
  scatterPoints?: ScatterPoint[];
  onRemove?: (planId: string) => void;
  onEdit?: (planId: string) => void;
  onRename?: (planId: string, newName: string) => Promise<boolean>;
  showStylized?: boolean;  // Default to true - show stylized version for display
}

export function DraftGrid({ 
  plans, 
  scatterPoints, 
  onRemove, 
  onEdit,
  onRename,
  showStylized = true 
}: DraftGridProps) {
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  const getClusterForPlan = (planId: string): number | undefined => {
    if (!scatterPoints) return undefined;
    const point = scatterPoints.find(p => p.id === planId);
    return point?.cluster;
  };

  const handleStartRename = (plan: UploadedPlan) => {
    setEditingNameId(plan.id);
    setEditingNameValue(plan.display_name || `Draft ${plan.id.slice(-4)}`);
  };

  const handleSaveRename = async (planId: string) => {
    if (onRename && editingNameValue.trim()) {
      await onRename(planId, editingNameValue.trim());
    }
    setEditingNameId(null);
    setEditingNameValue('');
  };

  const handleCancelRename = () => {
    setEditingNameId(null);
    setEditingNameValue('');
  };

  if (plans.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <AnimatePresence mode="popLayout">
        {plans.map((plan, index) => {
          const cluster = getClusterForPlan(plan.id);
          const clusterColor = cluster !== undefined ? getClusterColor(cluster) : undefined;
          const isEditingName = editingNameId === plan.id;
          
          // Use stylized thumbnail for display if available, fall back to colored
          const displayImage = showStylized 
            ? (plan.stylized_thumbnail || plan.thumbnail)
            : plan.thumbnail;
          
          // Display name with fallback
          const displayName = plan.display_name || `Draft ${String(index + 1).padStart(2, '0')}`;

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="draft-card group"
            >
              {/* Draft Header */}
              <div className="px-4 py-3 border-b border-drafted-border flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Sparkle />
                  
                  {/* Editable Name */}
                  {isEditingName ? (
                    <div className="flex items-center gap-1 flex-1">
                      <input
                        type="text"
                        value={editingNameValue}
                        onChange={(e) => setEditingNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(plan.id);
                          if (e.key === 'Escape') handleCancelRename();
                        }}
                        className="flex-1 px-2 py-1 text-sm font-semibold text-drafted-black bg-drafted-bg rounded border border-drafted-border focus:outline-none focus:border-coral-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveRename(plan.id)}
                        className="w-6 h-6 flex items-center justify-center text-green-600 hover:bg-green-50 rounded"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleCancelRename}
                        className="w-6 h-6 flex items-center justify-center text-drafted-gray hover:bg-drafted-bg rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <h3 className="font-semibold text-drafted-black truncate" title={displayName}>
                        {displayName}
                      </h3>
                      {onRename && (
                        <button
                          onClick={() => handleStartRename(plan)}
                          className="w-5 h-5 flex items-center justify-center text-drafted-muted hover:text-drafted-gray opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Rename"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                
                {clusterColor && !isEditingName && (
                  <div 
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
                    style={{ 
                      backgroundColor: `${clusterColor}20`,
                      color: clusterColor 
                    }}
                  >
                    <span 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: clusterColor }}
                    />
                    Cluster {cluster! + 1}
                  </div>
                )}
              </div>

              {/* Floor Plan Image */}
              <div className="aspect-square bg-drafted-bg relative overflow-hidden">
                {displayImage ? (
                  <img
                    src={displayImage}
                    alt={displayName}
                    className="w-full h-full object-contain p-4"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-drafted-muted animate-spin" />
                  </div>
                )}

                {/* Stylized indicator */}
                {showStylized && plan.stylized_thumbnail && (
                  <div className="absolute top-3 left-3 px-2 py-1 bg-white/90 rounded-full text-xs font-medium text-drafted-gray">
                    Rendered
                  </div>
                )}

                {/* Hover Actions */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-end justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex gap-2 p-4">
                    <button className="w-9 h-9 bg-white rounded-full shadow-drafted flex items-center justify-center hover:shadow-drafted-hover transition-shadow">
                      <Heart className="w-4 h-4 text-drafted-gray" />
                    </button>
                    <button className="w-9 h-9 bg-white rounded-full shadow-drafted flex items-center justify-center hover:shadow-drafted-hover transition-shadow">
                      <Share2 className="w-4 h-4 text-drafted-gray" />
                    </button>
                    <button className="w-9 h-9 bg-white rounded-full shadow-drafted flex items-center justify-center hover:shadow-drafted-hover transition-shadow">
                      <Download className="w-4 h-4 text-drafted-gray" />
                    </button>
                  </div>
                </div>

                {/* Remove button (for uploads) */}
                {onRemove && (
                  <button
                    onClick={() => onRemove(plan.id)}
                    className="absolute top-3 right-3 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-4 h-4 text-drafted-gray hover:text-coral-500" />
                  </button>
                )}
              </div>

              {/* Plan Info */}
              <div className="p-4 space-y-3">
                {/* Action Buttons */}
                <div className="flex gap-2">
                  {onEdit && (
                    <button 
                      onClick={() => onEdit(plan.id)}
                      className="flex-1 btn-drafted-coral text-xs py-2 flex items-center justify-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      Edit
                    </button>
                  )}
                  <button className="flex-1 btn-drafted-outline text-xs py-2">
                    Export
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// Sparkle icon matching drafted.ai
function Sparkle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-coral-500 flex-shrink-0">
      <path 
        d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" 
        fill="currentColor"
      />
    </svg>
  );
}
