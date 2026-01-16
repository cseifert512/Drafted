'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import type { UploadedPlan, ScatterPoint } from '@/lib/types';
import { getPlanThumbnail } from '@/lib/api';
import { getClusterColor } from '@/lib/colors';

interface PlanGalleryProps {
  plans: UploadedPlan[];
  onRemove?: (planId: string) => void;
  scatterPoints?: ScatterPoint[];
  isLoading?: boolean;
}

export function PlanGallery({ 
  plans, 
  onRemove, 
  scatterPoints,
  isLoading = false 
}: PlanGalleryProps) {
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  // Load thumbnails
  useEffect(() => {
    plans.forEach(async (plan) => {
      if (!thumbnails[plan.id] && !plan.thumbnail) {
        try {
          const thumb = await getPlanThumbnail(plan.id);
          setThumbnails(prev => ({ ...prev, [plan.id]: thumb }));
        } catch (e) {
          // Thumbnail load failed, will show placeholder
        }
      }
    });
  }, [plans]);

  const getClusterForPlan = (planId: string): number | undefined => {
    if (!scatterPoints) return undefined;
    const point = scatterPoints.find(p => p.id === planId);
    return point?.cluster;
  };

  if (plans.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="plan-grid">
      <AnimatePresence mode="popLayout">
        {plans.map((plan, index) => {
          const cluster = getClusterForPlan(plan.id);
          const clusterColor = cluster !== undefined ? getClusterColor(cluster) : undefined;
          const thumbnail = plan.thumbnail || thumbnails[plan.id];

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className="card overflow-hidden group"
            >
              {/* Thumbnail */}
              <div className="aspect-[4/3] bg-neutral-50 relative overflow-hidden">
                {thumbnail ? (
                  <img
                    src={thumbnail}
                    alt={plan.filename}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
                  </div>
                )}

                {/* Cluster indicator */}
                {clusterColor && (
                  <div 
                    className="absolute top-2 left-2 w-3 h-3 rounded-full ring-2 ring-white"
                    style={{ backgroundColor: clusterColor }}
                  />
                )}

                {/* Remove button */}
                {onRemove && (
                  <button
                    onClick={() => onRemove(plan.id)}
                    className="absolute top-2 right-2 w-7 h-7 bg-white/90 hover:bg-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-4 h-4 text-neutral-600" />
                  </button>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-semibold text-neutral-900 truncate">
                  {plan.filename.replace(/\.[^/.]+$/, '')}
                </h3>
                <p className="text-sm text-neutral-500 mt-1">
                  {cluster !== undefined && (
                    <span 
                      className="inline-flex items-center gap-1"
                    >
                      <span 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: clusterColor }}
                      />
                      Cluster {cluster + 1}
                    </span>
                  )}
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {isLoading && (
        <div className="col-span-full flex justify-center py-8">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      )}
    </div>
  );
}








