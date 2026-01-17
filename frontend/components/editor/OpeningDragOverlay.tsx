'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { WallSegment, Point } from '@/lib/editor/openingTypes';
import type { CoordinateMapper } from '@/lib/editor/coordinateMapping';
import { openingToPngCoords } from '@/lib/editor/coordinateMapping';
import { formatInches } from '@/lib/editor/assetManifest';
import type { DragState, DragHandlers } from '@/hooks/useOpeningDrag';
import { OpeningDraftPopover } from './OpeningDraftPopover';

// =============================================================================
// TYPES
// =============================================================================

interface OpeningDragOverlayProps {
  dragState: DragState;
  dragHandlers: DragHandlers;
  mapper: CoordinateMapper | null;
  containerRef: React.RefObject<HTMLElement>;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Overlay component for CAD-style drag-to-define-width opening placement.
 * 
 * Shows:
 * - Live width indicator while dragging
 * - Snap feedback when near valid sizes
 * - Draft popover for type selection and confirmation
 * - Rendering status when confirmed
 */
export function OpeningDragOverlay({
  dragState,
  dragHandlers,
  mapper,
  containerRef,
}: OpeningDragOverlayProps) {
  const { 
    phase, 
    wall, 
    centerPosition, 
    currentWidthInches, 
    snappedWidthInches,
    matchedAsset,
    categoryGroup,
    swingDirection,
  } = dragState;
  
  // Calculate opening position in PNG coordinates
  const openingCoords = useMemo(() => {
    if (!wall || !mapper) return null;
    
    // Use snapped width if available, otherwise current width
    const displayWidth = snappedWidthInches ?? currentWidthInches;
    return openingToPngCoords(wall, centerPosition, displayWidth, mapper);
  }, [wall, centerPosition, currentWidthInches, snappedWidthInches, mapper]);
  
  // Determine which side of the floorplan the wall is on
  // based on opening center position in PNG coordinates (matches CSS positioning)
  type WallSide = 'north' | 'south' | 'east' | 'west';
  
  const wallSide = useMemo((): WallSide => {
    if (!wall || !mapper || !openingCoords) return 'north';
    
    // Use PNG dimensions as the reference frame (matches CSS positioning)
    const pngCenterX = mapper.pngDimensions.width / 2;
    const pngCenterY = mapper.pngDimensions.height / 2;
    
    // Opening center in PNG coordinates
    const openingX = openingCoords.center.x;
    const openingY = openingCoords.center.y;
    
    // Determine wall orientation
    const dx = Math.abs(wall.end.x - wall.start.x);
    const dy = Math.abs(wall.end.y - wall.start.y);
    const isHorizontal = dx >= dy;
    
    if (isHorizontal) {
      // Horizontal wall: check if in top or bottom half of image
      return openingY < pngCenterY ? 'north' : 'south';
    } else {
      // Vertical wall: check if in left or right half of image
      return openingX < pngCenterX ? 'west' : 'east';
    }
  }, [wall, mapper, openingCoords]);
  
  // Calculate popover position based on wall side
  // Popover appears on the EXTERIOR side of the house (outside the floorplan)
  // Using direct pixel positioning (no CSS transforms) to ensure no overlap
  const popoverConfig = useMemo(() => {
    if (!openingCoords) return { position: { x: 0, y: 0 }, placement: 'top' as const };
    
    const { center } = openingCoords;
    
    // Known popover dimensions (from min-w-[240px] and typical content height)
    const POPOVER_WIDTH = 260;
    const POPOVER_HEIGHT = 200;
    const GAP = 60; // Gap between window and popover
    
    switch (wallSide) {
      case 'north':
        // Popover ABOVE the window (outside the house)
        // Position so bottom edge of popover is above window center
        return {
          position: {
            x: center.x - POPOVER_WIDTH / 2,  // Centered horizontally
            y: center.y - POPOVER_HEIGHT - 20, // Smaller gap for north (was too far)
          },
          placement: 'top' as const,
        };
      case 'south':
        // Popover BELOW the window (outside the house)
        // Position so top edge of popover is GAP pixels below window center
        return {
          position: {
            x: center.x - POPOVER_WIDTH / 2,  // Centered horizontally
            y: center.y + GAP, // Below the window
          },
          placement: 'bottom' as const,
        };
      case 'west':
        // Popover to the LEFT of the window (outside the house)
        // Position so right edge of popover is GAP pixels left of window center
        return {
          position: {
            x: center.x - POPOVER_WIDTH - GAP, // Left of the window
            y: center.y - POPOVER_HEIGHT / 2,  // Centered vertically
          },
          placement: 'left' as const,
        };
      case 'east':
        // Popover to the RIGHT of the window (outside the house)
        // Position so left edge of popover is GAP pixels right of window center
        return {
          position: {
            x: center.x + GAP, // Right of the window
            y: center.y - POPOVER_HEIGHT / 2,  // Centered vertically
          },
          placement: 'right' as const,
        };
    }
  }, [openingCoords, wallSide]);
  
  // Don't render if idle or no data
  if (phase === 'idle' || !wall || !mapper || !openingCoords) {
    return null;
  }
  
  const { center, start, end, angle } = openingCoords;
  const widthPx = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
  
  // Determine accent color based on category
  const accentColor = categoryGroup === 'door' 
    ? '#f97316' 
    : categoryGroup === 'window' 
    ? '#0ea5e9' 
    : '#10b981';
  
  const isDragging = phase === 'dragging';
  const isDraft = phase === 'draft';
  const isRendering = phase === 'rendering';
  const isSnapped = snappedWidthInches !== null;
  const displayWidth = snappedWidthInches ?? Math.round(currentWidthInches);
  
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* SVG Overlay for opening visualization */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Glow filter */}
          <filter id="drag-opening-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={isDragging ? 6 : 4} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          
          {/* Animated dash pattern for dragging state */}
          <pattern id="drag-dash-pattern" patternUnits="userSpaceOnUse" width="12" height="12">
            <motion.line
              x1="0" y1="6" x2="12" y2="6"
              stroke={accentColor}
              strokeWidth="2"
              strokeDasharray="6 6"
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: -24 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
          </pattern>
        </defs>
        
        {/* Opening indicator group */}
        <g
          transform={`translate(${center.x}, ${center.y}) rotate(${angle})`}
          filter="url(#drag-opening-glow)"
        >
          {/* Background glow - larger when dragging */}
          <motion.rect
            x={-widthPx / 2 - 15}
            y={-25}
            width={widthPx + 30}
            height={50}
            fill={accentColor}
            rx={6}
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: isDragging ? 0.3 : 0.2,
              scale: isDragging ? 1.05 : 1,
            }}
            transition={{ duration: 0.2 }}
          />
          
          {/* Snap indicator - shows when snapped to valid size */}
          <AnimatePresence>
            {isSnapped && (
              <motion.rect
                x={-widthPx / 2 - 5}
                y={-15}
                width={widthPx + 10}
                height={30}
                fill="none"
                stroke={accentColor}
                strokeWidth={2}
                strokeDasharray="8 4"
                rx={4}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 0.6, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
              />
            )}
          </AnimatePresence>
          
          {/* Main opening rectangle */}
          <motion.rect
            x={-widthPx / 2}
            y={-10}
            width={widthPx}
            height={20}
            fill="white"
            stroke={accentColor}
            strokeWidth={isDragging ? 4 : 3}
            rx={3}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ 
              scale: 1, 
              opacity: 1,
              strokeWidth: isDragging ? 4 : 3,
            }}
            transition={{ duration: 0.2 }}
          />
          
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
            transition={{ duration: 0.2 }}
          />
          
          {/* Edge handles when dragging */}
          {isDragging && (
            <>
              {/* Left handle */}
              <motion.circle
                cx={-widthPx / 2}
                cy={0}
                r={6}
                fill={accentColor}
                stroke="white"
                strokeWidth={2}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.15 }}
              />
              {/* Right handle */}
              <motion.circle
                cx={widthPx / 2}
                cy={0}
                r={6}
                fill={accentColor}
                stroke="white"
                strokeWidth={2}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.15 }}
              />
            </>
          )}
          
          {/* Door swing arc preview (for doors in draft state) */}
          {isDraft && matchedAsset?.hasSwing && (
            <motion.path
              d={`M ${-widthPx / 2},0 A ${widthPx * 0.8},${widthPx * 0.8} 0 0 ${swingDirection === 'left' ? 0 : 1} ${swingDirection === 'left' ? -widthPx / 2 - widthPx * 0.6 : widthPx / 2 + widthPx * 0.6},${swingDirection === 'left' ? -widthPx * 0.6 : widthPx * 0.6}`}
              fill="none"
              stroke={accentColor}
              strokeWidth={2}
              strokeDasharray="6 4"
              opacity={0.5}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4 }}
            />
          )}
        </g>
      </svg>
      
      {/* Width indicator badge - shows during drag */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            className="absolute pointer-events-none"
            style={{
              left: center.x,
              top: center.y + 35,
              transform: 'translateX(-50%)',
            }}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.1 }}
          >
            <div 
              className={`px-3 py-1.5 rounded-full text-white text-sm font-bold shadow-lg ${
                isSnapped ? 'ring-2 ring-white ring-opacity-50' : ''
              }`}
              style={{ backgroundColor: accentColor }}
            >
              {formatInches(displayWidth)}
              {isSnapped && (
                <span className="ml-1 text-xs opacity-75">✓</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Rendering status badge */}
      <AnimatePresence>
        {isRendering && (
          <motion.div
            className="absolute pointer-events-none"
            style={{
              left: center.x,
              top: center.y + 35,
              transform: 'translateX(-50%)',
            }}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            <div 
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-medium shadow-lg"
              style={{ backgroundColor: accentColor }}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Drafting...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Draft popover - shows after drag ends */}
      {isDraft && (
        <OpeningDraftPopover
          isVisible={true}
          position={popoverConfig.position}
          placement={popoverConfig.placement}
          matchedAsset={matchedAsset}
          currentWidthInches={currentWidthInches}
          snappedWidthInches={snappedWidthInches}
          categoryGroup={categoryGroup}
          isExteriorWall={wall.isExterior}
          swingDirection={swingDirection}
          onCategoryGroupChange={dragHandlers.setCategoryGroup}
          onSwingDirectionChange={dragHandlers.setSwingDirection}
          onAssetSelect={dragHandlers.setSelectedAsset}
          onConfirm={dragHandlers.onConfirm}
          onCancel={dragHandlers.onCancel}
        />
      )}
    </div>
  );
}

export default OpeningDragOverlay;

