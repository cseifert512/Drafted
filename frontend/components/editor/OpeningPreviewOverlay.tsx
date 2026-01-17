'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import type { 
  OpeningPlacement, 
  OpeningJobStatus,
  WallSegment,
} from '@/lib/editor/openingTypes';
import type { CoordinateMapper } from '@/lib/editor/coordinateMapping';
import { openingToPngCoords } from '@/lib/editor/coordinateMapping';
import { inchesToSvgPixels } from '@/lib/editor/openingTypes';

interface OpeningPreviewOverlayProps {
  opening: OpeningPlacement | null;
  wall: WallSegment | null;
  mapper: CoordinateMapper | null;
  status: OpeningJobStatus | null;
  error?: string | null;
}

/**
 * Overlay component that shows opening preview during render.
 * 
 * Features:
 * - Shows door/window symbol immediately after placement
 * - Displays render status indicator
 * - Crossfades out when render completes
 * - Shows error state if render fails
 */
export function OpeningPreviewOverlay({
  opening,
  wall,
  mapper,
  status,
  error,
}: OpeningPreviewOverlayProps) {
  // Calculate opening position in PNG coordinates
  const openingCoords = useMemo(() => {
    if (!opening || !wall || !mapper) return null;
    return openingToPngCoords(wall, opening.positionOnWall, opening.widthInches, mapper);
  }, [opening, wall, mapper]);

  if (!opening || !wall || !mapper || !openingCoords) {
    return null;
  }

  const { center, start, end, angle } = openingCoords;
  const widthPx = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);

  // Determine if this is a door or window
  const isDoor = opening.type.includes('door');
  const accentColor = isDoor ? '#f97316' : '#0ea5e9'; // Orange for doors, Sky for windows

  return (
    <AnimatePresence>
      {status && status !== 'complete' && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Opening Symbol */}
          <svg
            className="absolute inset-0 w-full h-full"
            style={{ overflow: 'visible' }}
          >
            <defs>
              {/* Glow filter */}
              <filter id="opening-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              
              {/* Animated dash pattern */}
              <pattern id="dash-pattern" patternUnits="userSpaceOnUse" width="8" height="8">
                <motion.line
                  x1="0" y1="4" x2="8" y2="4"
                  stroke={accentColor}
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  initial={{ strokeDashoffset: 0 }}
                  animate={{ strokeDashoffset: -16 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              </pattern>
            </defs>

            {/* Opening indicator */}
            <g
              transform={`translate(${center.x}, ${center.y}) rotate(${angle})`}
              filter="url(#opening-glow)"
            >
              {/* Background glow */}
              <motion.rect
                x={-widthPx / 2 - 10}
                y={-20}
                width={widthPx + 20}
                height={40}
                fill={accentColor}
                opacity={0.2}
                rx={4}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 0.2 }}
                transition={{ duration: 0.3 }}
              />

              {/* Opening outline */}
              <motion.rect
                x={-widthPx / 2}
                y={-8}
                width={widthPx}
                height={16}
                fill="white"
                stroke={accentColor}
                strokeWidth={3}
                rx={2}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              />

              {/* Door swing arc (for doors only) */}
              {/* 
                Door swing conventions:
                - "Right swing" = hinge on left, door swings to the right (opens toward negative Y in local coords)
                - "Left swing" = hinge on right, door swings to the left (opens toward negative Y in local coords)
                The arc traces the path of the door's free edge as it opens.
              */}
              {isDoor && opening.type !== 'sliding_door' && (
                <motion.path
                  d={opening.swingDirection === 'right'
                    // Right swing: hinge at left edge, arc from right edge sweeping perpendicular (into room)
                    ? `M ${widthPx / 2},0 A ${widthPx},${widthPx} 0 0 1 ${-widthPx / 2},${-widthPx}`
                    // Left swing: hinge at right edge, arc from left edge sweeping perpendicular (into room)
                    : `M ${-widthPx / 2},0 A ${widthPx},${widthPx} 0 0 0 ${widthPx / 2},${-widthPx}`
                  }
                  fill="none"
                  stroke={accentColor}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  opacity={0.6}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                />
              )}

              {/* Center line */}
              <motion.line
                x1={-widthPx / 2}
                y1={0}
                x2={widthPx / 2}
                y2={0}
                stroke={accentColor}
                strokeWidth={3}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.3, delay: 0.15 }}
              />
            </g>
          </svg>

          {/* Status Badge */}
          <motion.div
            className="absolute"
            style={{
              left: center.x,
              top: center.y + 30,
              transform: 'translateX(-50%)',
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <StatusBadge status={status} error={error} isDoor={isDoor} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface StatusBadgeProps {
  status: OpeningJobStatus;
  error?: string | null;
  isDoor: boolean;
}

function StatusBadge({ status, error, isDoor }: StatusBadgeProps) {
  const accentColor = isDoor ? 'orange' : 'sky';

  const getStatusContent = () => {
    switch (status) {
      case 'pending':
        return (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Queued...</span>
          </>
        );
      case 'rendering':
        return (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Drafting...</span>
          </>
        );
      case 'blending':
        return (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Blending...</span>
          </>
        );
      case 'complete':
        return (
          <>
            <Check className="w-3.5 h-3.5" />
            <span>Done!</span>
          </>
        );
      case 'failed':
        return (
          <>
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{error || 'Failed'}</span>
          </>
        );
      default:
        return null;
    }
  };

  const bgColor = status === 'failed' 
    ? 'bg-red-500' 
    : status === 'complete'
    ? 'bg-green-500'
    : isDoor 
    ? 'bg-orange-500' 
    : 'bg-sky-500';

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 ${bgColor} text-white text-xs font-medium rounded-full shadow-lg`}>
      {getStatusContent()}
    </div>
  );
}

/**
 * Render progress indicator for multiple openings
 */
interface RenderProgressProps {
  jobs: Array<{
    jobId: string;
    status: OpeningJobStatus;
    opening: OpeningPlacement;
  }>;
}

export function RenderProgress({ jobs }: RenderProgressProps) {
  const pendingCount = jobs.filter(j => j.status === 'pending' || j.status === 'rendering' || j.status === 'blending').length;
  const completedCount = jobs.filter(j => j.status === 'complete').length;
  const failedCount = jobs.filter(j => j.status === 'failed').length;

  if (jobs.length === 0) return null;

  return (
    <motion.div
      className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg border border-gray-200 p-4 min-w-[200px]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      <div className="text-sm font-medium text-gray-900 mb-2">
        Drafting Openings
      </div>
      
      <div className="space-y-2">
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Loader2 className="w-3 h-3 animate-spin text-orange-500" />
            <span>{pendingCount} in progress</span>
          </div>
        )}
        
        {completedCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-green-600">
            <Check className="w-3 h-3" />
            <span>{completedCount} completed</span>
          </div>
        )}
        
        {failedCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertCircle className="w-3 h-3" />
            <span>{failedCount} failed</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-orange-500 to-sky-500"
          initial={{ width: 0 }}
          animate={{ width: `${((completedCount + failedCount) / jobs.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </motion.div>
  );
}

export default OpeningPreviewOverlay;

