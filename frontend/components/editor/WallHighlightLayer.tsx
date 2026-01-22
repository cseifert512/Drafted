'use client';

import { useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { WallSegment } from '@/lib/editor/openingTypes';
import type { Point } from '@/lib/editor/editorTypes';
import type { CoordinateMapper } from '@/lib/editor/coordinateMapping';
import { wallToPngCoords, getWallCenterPng } from '@/lib/editor/coordinateMapping';

interface WallHighlightLayerProps {
  walls: WallSegment[];
  mapper: CoordinateMapper | null;
  hoveredWallId: string | null;
  selectedWallId: string | null;
  onWallHover: (wallId: string | null) => void;
  onWallClick: (wall: WallSegment, positionOnWall: number, screenPoint?: Point) => void;
  filterExteriorOnly?: boolean;
  disabled?: boolean;
}

/**
 * SVG overlay layer that highlights walls for door/window placement.
 * 
 * Features:
 * - Highlights walls on hover with orange glow
 * - Shows clickable zones along walls
 * - Filters exterior-only walls for windows
 * - Animates highlight state changes
 */
export function WallHighlightLayer({
  walls,
  mapper,
  hoveredWallId,
  selectedWallId,
  onWallHover,
  onWallClick,
  filterExteriorOnly = false,
  disabled = false,
}: WallHighlightLayerProps) {
  // Filter walls if needed
  const visibleWalls = useMemo(() => {
    if (filterExteriorOnly) {
      return walls.filter(w => w.isExterior);
    }
    return walls;
  }, [walls, filterExteriorOnly]);

  // Handle wall click with position calculation
  const handleWallClick = useCallback((
    e: React.MouseEvent<SVGLineElement>,
    wall: WallSegment
  ) => {
    if (disabled || !mapper) return;

    // Get click position relative to the SVG
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert to SVG viewBox coordinates
    const viewBox = mapper.svgViewBox;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    
    const svgX = viewBox.x + clickX * scaleX;
    const svgY = viewBox.y + clickY * scaleY;

    // Calculate position along wall (0-1)
    const wallDx = wall.end.x - wall.start.x;
    const wallDy = wall.end.y - wall.start.y;
    const wallLength = Math.sqrt(wallDx * wallDx + wallDy * wallDy);

    // Project click point onto wall line
    const t = Math.max(0, Math.min(1,
      ((svgX - wall.start.x) * wallDx + (svgY - wall.start.y) * wallDy) / (wallLength * wallLength)
    ));

    // Pass screen coordinates for drag initialization
    onWallClick(wall, t, { x: e.clientX, y: e.clientY });
  }, [disabled, mapper, onWallClick]);

  if (!mapper || visibleWalls.length === 0) {
    return null;
  }

  const { svgViewBox } = mapper;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.width} ${svgViewBox.height}`}
      preserveAspectRatio="none"
    >
      {/* Definitions for glow effects */}
      <defs>
        <filter id="wall-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="wall-glow-strong" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Wall highlight lines */}
      {visibleWalls.map((wall) => {
        const isHovered = hoveredWallId === wall.id;
        const isSelected = selectedWallId === wall.id;

        return (
          <WallHighline
            key={wall.id}
            wall={wall}
            isHovered={isHovered}
            isSelected={isSelected}
            disabled={disabled}
            onMouseEnter={() => !disabled && onWallHover(wall.id)}
            onMouseLeave={() => !disabled && onWallHover(null)}
            onClick={(e) => handleWallClick(e, wall)}
          />
        );
      })}
    </svg>
  );
}

interface WallHighlineProps {
  wall: WallSegment;
  isHovered: boolean;
  isSelected: boolean;
  disabled: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent<SVGLineElement>) => void;
}

function WallHighline({
  wall,
  isHovered,
  isSelected,
  disabled,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: WallHighlineProps) {
  // Determine colors based on state and wall type
  const getStrokeColor = () => {
    if (isSelected) return '#f97316'; // Orange-500
    if (isHovered) return wall.isExterior ? '#0ea5e9' : '#f97316'; // Sky-500 for exterior, Orange for interior
    return 'transparent';
  };

  const getStrokeWidth = () => {
    if (isSelected) return 8;
    if (isHovered) return 6;
    return 12; // Wide hit area even when not visible
  };

  return (
    <motion.line
      x1={wall.start.x}
      y1={wall.start.y}
      x2={wall.end.x}
      y2={wall.end.y}
      stroke={getStrokeColor()}
      strokeWidth={getStrokeWidth()}
      strokeLinecap="round"
      fill="none"
      filter={isHovered || isSelected ? 'url(#wall-glow)' : undefined}
      style={{
        pointerEvents: disabled ? 'none' : 'stroke',
        cursor: disabled ? 'default' : 'pointer',
      }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: isHovered || isSelected ? 1 : 0,
        strokeWidth: getStrokeWidth(),
      }}
      transition={{ duration: 0.15 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    />
  );
}

/**
 * Tooltip component that appears near hovered walls
 */
interface WallTooltipProps {
  wall: WallSegment;
  mapper: CoordinateMapper;
  containerRef: React.RefObject<HTMLDivElement>;
}

export function WallTooltip({ wall, mapper, containerRef }: WallTooltipProps) {
  const center = getWallCenterPng(wall, mapper);
  
  // Get container bounds for positioning
  const containerRect = containerRef.current?.getBoundingClientRect();
  if (!containerRect) return null;

  // Calculate tooltip position (above the wall center)
  const tooltipX = (center.x / mapper.pngDimensions.width) * containerRect.width;
  const tooltipY = (center.y / mapper.pngDimensions.height) * containerRect.height - 40;

  return (
    <motion.div
      className="absolute z-50 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg"
      style={{
        left: tooltipX,
        top: tooltipY,
        transform: 'translateX(-50%)',
      }}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 5 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${wall.isExterior ? 'bg-sky-400' : 'bg-orange-400'}`} />
        <span>{wall.isExterior ? 'Exterior Wall' : 'Interior Wall'}</span>
      </div>
      <div className="text-xs text-gray-400 mt-0.5">
        Click to add door/window
      </div>
    </motion.div>
  );
}

export default WallHighlightLayer;

