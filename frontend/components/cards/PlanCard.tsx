'use client';

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { UploadedPlan } from '@/lib/types';
import { getClusterColor } from '@/lib/colors';

interface PlanCardProps {
  plan: UploadedPlan;
  thumbnail?: string;
  cluster?: number;
  roomCount?: number;
  onClick?: () => void;
  isSelected?: boolean;
  delay?: number;
}

export function PlanCard({
  plan,
  thumbnail,
  cluster,
  roomCount,
  onClick,
  isSelected = false,
  delay = 0,
}: PlanCardProps) {
  const clusterColor = cluster !== undefined ? getClusterColor(cluster) : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay }}
      className={`card overflow-hidden cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-primary-500 ring-offset-2' : ''
      }`}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-neutral-50 relative overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={plan.filename}
            className="w-full h-full object-cover transition-transform hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
          </div>
        )}

        {/* Cluster badge */}
        {clusterColor && (
          <div 
            className="absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-medium text-white flex items-center gap-1.5"
            style={{ backgroundColor: clusterColor }}
          >
            <span className="w-1.5 h-1.5 bg-white/50 rounded-full" />
            Cluster {cluster! + 1}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-semibold text-neutral-900 truncate">
          {plan.filename.replace(/\.[^/.]+$/, '')}
        </h3>
        <p className="text-sm text-neutral-500 mt-1">
          {roomCount !== undefined ? (
            <span>{roomCount} Rooms</span>
          ) : (
            <span className="text-neutral-400">Analyzing...</span>
          )}
        </p>
      </div>
    </motion.div>
  );
}

