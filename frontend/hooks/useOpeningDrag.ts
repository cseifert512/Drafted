/**
 * useOpeningDrag - Hook for CAD-style drag-to-define-width opening placement
 * 
 * Handles:
 * - Mouse drag tracking from center point
 * - Width calculation based on drag distance
 * - Snap-to-valid-sizes behavior
 * - Wall orientation detection for drag direction
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { WallSegment, Point } from '@/lib/editor/openingTypes';
import { svgPixelsToInches, inchesToSvgPixels } from '@/lib/editor/openingTypes';
import type { CoordinateMapper } from '@/lib/editor/coordinateMapping';
import type { 
  DoorWindowAsset, 
  AssetCategory, 
  CategoryGroup 
} from '@/lib/editor/assetManifest';
import {
  loadAssetManifest,
  getAssetsByCategoryGroup,
  findBestAsset,
  CATEGORY_METADATA,
} from '@/lib/editor/assetManifest';

// =============================================================================
// TYPES
// =============================================================================

export type DragPhase = 'idle' | 'dragging' | 'draft' | 'rendering';

export interface DragState {
  phase: DragPhase;
  wall: WallSegment | null;
  centerPosition: number; // 0-1 along wall
  currentWidthInches: number;
  snappedWidthInches: number | null;
  matchedAsset: DoorWindowAsset | null;
  categoryGroup: CategoryGroup;
  swingDirection: 'left' | 'right';
}

export interface DragHandlers {
  onDragStart: (wall: WallSegment, positionOnWall: number, screenPoint: Point) => void;
  onDragMove: (screenPoint: Point) => void;
  onDragEnd: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRenderComplete: () => void; // Reset to idle after render completes
  setCategoryGroup: (group: CategoryGroup) => void;
  setSwingDirection: (direction: 'left' | 'right') => void;
  setSelectedAsset: (asset: DoorWindowAsset) => void;
}

export interface UseOpeningDragOptions {
  mapper: CoordinateMapper | null;
  containerRef: React.RefObject<HTMLElement>;
  onConfirm?: (config: {
    wall: WallSegment;
    positionOnWall: number;
    asset: DoorWindowAsset;
    swingDirection: 'left' | 'right';
  }) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Snap threshold in inches - if within this range, snap to valid size
const SNAP_THRESHOLD_INCHES = 4;

// Minimum width to show (in inches)
const MIN_WIDTH_INCHES = 16;

// Default starting width when drag begins
const DEFAULT_START_WIDTH_INCHES = 36;

// Default category for new openings
const DEFAULT_CATEGORY_GROUP: CategoryGroup = 'door';


// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Get wall orientation: 'horizontal' or 'vertical'
 * A wall is considered horizontal if its angle from horizontal is < 45 degrees
 */
export function getWallOrientation(wall: WallSegment): 'horizontal' | 'vertical' {
  const dx = Math.abs(wall.end.x - wall.start.x);
  const dy = Math.abs(wall.end.y - wall.start.y);
  return dx >= dy ? 'horizontal' : 'vertical';
}

/**
 * Get wall angle in degrees (0 = horizontal, 90 = vertical)
 */
export function getWallAngle(wall: WallSegment): number {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * Get available sizes for a category group, considering wall type
 */
export function getAvailableSizesForGroup(
  assets: DoorWindowAsset[],
  categoryGroup: CategoryGroup,
  isExteriorWall: boolean
): number[] {
  const groupAssets = getAssetsByCategoryGroup(assets, categoryGroup);
  
  // Filter by wall type
  const filteredAssets = isExteriorWall 
    ? groupAssets 
    : groupAssets.filter(a => !CATEGORY_METADATA[a.category].isExterior);
  
  // Get unique sizes
  const sizes = Array.from(new Set(filteredAssets.map(a => a.inches)));
  return sizes.sort((a, b) => a - b);
}

/**
 * Find the closest valid size to a target width
 */
export function findClosestSize(
  targetInches: number,
  availableSizes: number[],
  snapThreshold: number = SNAP_THRESHOLD_INCHES
): { size: number; shouldSnap: boolean } | null {
  if (availableSizes.length === 0) return null;
  
  // Find closest size
  let closest = availableSizes[0];
  let closestDiff = Math.abs(closest - targetInches);
  
  for (const size of availableSizes) {
    const diff = Math.abs(size - targetInches);
    if (diff < closestDiff) {
      closest = size;
      closestDiff = diff;
    }
  }
  
  return {
    size: closest,
    shouldSnap: closestDiff <= snapThreshold,
  };
}

/**
 * Get default category for a category group based on wall type
 */
export function getDefaultCategory(
  categoryGroup: CategoryGroup,
  isExteriorWall: boolean
): AssetCategory {
  switch (categoryGroup) {
    case 'door':
      return isExteriorWall ? 'DoorExteriorSingle' : 'DoorInteriorSingle';
    case 'window':
      return 'Window';
    case 'garage':
      return 'GarageDouble';
    default:
      return 'DoorInteriorSingle';
  }
}

/**
 * Find best asset for a drawn width
 */
export function findBestAssetForWidth(
  assets: DoorWindowAsset[],
  drawnWidthInches: number,
  categoryGroup: CategoryGroup,
  isExteriorWall: boolean
): DoorWindowAsset | null {
  const defaultCategory = getDefaultCategory(categoryGroup, isExteriorWall);
  
  // Get all assets in this category group that work for this wall type
  const groupAssets = getAssetsByCategoryGroup(assets, categoryGroup);
  const validAssets = isExteriorWall 
    ? groupAssets 
    : groupAssets.filter(a => !CATEGORY_METADATA[a.category].isExterior);
  
  if (validAssets.length === 0) return null;
  
  // Try to find in default category first
  const defaultCategoryAssets = validAssets.filter(a => a.category === defaultCategory);
  if (defaultCategoryAssets.length > 0) {
    const match = findBestAsset(assets, defaultCategory, drawnWidthInches);
    if (match) return match;
  }
  
  // Fall back to any valid asset in the group
  let closest = validAssets[0];
  let closestDiff = Math.abs(closest.inches - drawnWidthInches);
  
  for (const asset of validAssets) {
    const diff = Math.abs(asset.inches - drawnWidthInches);
    if (diff < closestDiff) {
      closest = asset;
      closestDiff = diff;
    }
  }
  
  return closest;
}

// =============================================================================
// HOOK
// =============================================================================

export function useOpeningDrag(options: UseOpeningDragOptions): [DragState, DragHandlers] {
  const { mapper, containerRef, onConfirm } = options;
  
  // Asset manifest
  const [assets, setAssets] = useState<DoorWindowAsset[]>([]);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  
  // Load assets on mount
  useEffect(() => {
    loadAssetManifest()
      .then(loadedAssets => {
        setAssets(loadedAssets);
        setAssetsLoaded(true);
      })
      .catch(err => {
        console.error('[useOpeningDrag] Failed to load assets:', err);
      });
  }, []);
  
  // Core state
  const [phase, setPhase] = useState<DragPhase>('idle');
  const [wall, setWall] = useState<WallSegment | null>(null);
  const [centerPosition, setCenterPosition] = useState<number>(0.5);
  const [currentWidthInches, setCurrentWidthInches] = useState<number>(DEFAULT_START_WIDTH_INCHES);
  const [categoryGroup, setCategoryGroup] = useState<CategoryGroup>(DEFAULT_CATEGORY_GROUP);
  const [swingDirection, setSwingDirection] = useState<'left' | 'right'>('right');
  const [selectedAsset, setSelectedAssetState] = useState<DoorWindowAsset | null>(null);
  
  // Drag tracking refs
  const dragStartScreenRef = useRef<Point | null>(null);
  const dragStartWidthRef = useRef<number>(DEFAULT_START_WIDTH_INCHES);
  
  // Calculate snapped width and matched asset
  const { snappedWidthInches, matchedAsset } = useMemo(() => {
    if (!wall || !assetsLoaded) {
      return { snappedWidthInches: null, matchedAsset: null };
    }
    
    // If user manually selected an asset, use that
    if (selectedAsset) {
      return { 
        snappedWidthInches: selectedAsset.inches, 
        matchedAsset: selectedAsset 
      };
    }
    
    const availableSizes = getAvailableSizesForGroup(assets, categoryGroup, wall.isExterior);
    const closest = findClosestSize(currentWidthInches, availableSizes);
    
    if (!closest) {
      return { snappedWidthInches: null, matchedAsset: null };
    }
    
    const asset = findBestAssetForWidth(
      assets, 
      closest.shouldSnap ? closest.size : currentWidthInches,
      categoryGroup, 
      wall.isExterior
    );
    
    return {
      snappedWidthInches: closest.shouldSnap ? closest.size : null,
      matchedAsset: asset,
    };
  }, [wall, currentWidthInches, categoryGroup, assets, assetsLoaded, selectedAsset]);
  
  // State object
  const state: DragState = {
    phase,
    wall,
    centerPosition,
    currentWidthInches,
    snappedWidthInches,
    matchedAsset,
    categoryGroup,
    swingDirection,
  };
  
  // ==========================================================================
  // ESC KEY HANDLER - Cancel placement when Escape is pressed during dragging
  // ==========================================================================
  
  useEffect(() => {
    if (phase !== 'dragging') return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        console.log('[useOpeningDrag] ESC pressed, cancelling drag');
        setPhase('idle');
        setWall(null);
        setCenterPosition(0.5);
        setCurrentWidthInches(DEFAULT_START_WIDTH_INCHES);
        setSelectedAssetState(null);
        dragStartScreenRef.current = null;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase]);
  
  // ==========================================================================
  // HANDLERS
  // ==========================================================================
  
  const onDragStart = useCallback((
    targetWall: WallSegment,
    positionOnWall: number,
    screenPoint: Point
  ) => {
    console.log('[useOpeningDrag] Drag start', { wall: targetWall.id, position: positionOnWall });
    
    setWall(targetWall);
    setCenterPosition(positionOnWall);
    setPhase('dragging');
    setCurrentWidthInches(DEFAULT_START_WIDTH_INCHES);
    setSelectedAssetState(null);
    
    dragStartScreenRef.current = screenPoint;
    dragStartWidthRef.current = DEFAULT_START_WIDTH_INCHES;
    
    // Set default category based on wall type
    if (targetWall.isExterior) {
      setCategoryGroup('window'); // Default to window for exterior walls
    } else {
      setCategoryGroup('door'); // Default to door for interior walls
    }
  }, []);
  
  const onDragMove = useCallback((screenPoint: Point) => {
    if (phase !== 'dragging' || !wall || !mapper || !containerRef.current) return;
    
    const dragStart = dragStartScreenRef.current;
    if (!dragStart) return;
    
    // Get container rect for coordinate conversion
    const rect = containerRef.current.getBoundingClientRect();
    
    // Calculate drag distance in screen pixels
    const orientation = getWallOrientation(wall);
    let dragDistancePx: number;
    
    if (orientation === 'horizontal') {
      // Horizontal wall: drag left/right
      dragDistancePx = Math.abs(screenPoint.x - dragStart.x);
    } else {
      // Vertical wall: drag up/down
      dragDistancePx = Math.abs(screenPoint.y - dragStart.y);
    }
    
    // Convert screen pixels to SVG pixels (accounting for zoom/scale)
    const scaleX = mapper.svgViewBox.width / rect.width;
    const dragDistanceSvg = dragDistancePx * scaleX;
    
    // Convert SVG pixels to inches (each direction from center = half width)
    const dragInches = svgPixelsToInches(dragDistanceSvg) * 2;
    
    // Calculate new width (minimum of MIN_WIDTH_INCHES)
    const newWidth = Math.max(MIN_WIDTH_INCHES, dragStartWidthRef.current + dragInches);
    
    setCurrentWidthInches(newWidth);
  }, [phase, wall, mapper, containerRef]);
  
  const onDragEnd = useCallback(() => {
    if (phase !== 'dragging') return;
    
    console.log('[useOpeningDrag] Drag end, transitioning to draft');
    setPhase('draft');
    dragStartScreenRef.current = null;
  }, [phase]);
  
  const handleConfirm = useCallback(() => {
    if (phase !== 'draft' || !wall || !matchedAsset) {
      console.warn('[useOpeningDrag] Cannot confirm: invalid state');
      return;
    }
    
    console.log('[useOpeningDrag] Confirming opening', { 
      wall: wall.id, 
      asset: matchedAsset.filename,
      position: centerPosition 
    });
    
    setPhase('rendering');
    
    onConfirm?.({
      wall,
      positionOnWall: centerPosition,
      asset: matchedAsset,
      swingDirection,
    });
  }, [phase, wall, matchedAsset, centerPosition, swingDirection, onConfirm]);
  
  const handleCancel = useCallback(() => {
    console.log('[useOpeningDrag] Cancelling');
    setPhase('idle');
    setWall(null);
    setCenterPosition(0.5);
    setCurrentWidthInches(DEFAULT_START_WIDTH_INCHES);
    setSelectedAssetState(null);
    dragStartScreenRef.current = null;
  }, []);
  
  // Reset to idle after render completes (success or failure)
  const handleRenderComplete = useCallback(() => {
    console.log('[useOpeningDrag] Render complete, resetting to idle');
    setPhase('idle');
    setWall(null);
    setCenterPosition(0.5);
    setCurrentWidthInches(DEFAULT_START_WIDTH_INCHES);
    setSelectedAssetState(null);
    dragStartScreenRef.current = null;
  }, []);
  
  const handleSetCategoryGroup = useCallback((group: CategoryGroup) => {
    setCategoryGroup(group);
    setSelectedAssetState(null); // Clear manual selection when changing groups
  }, []);
  
  const handleSetSwingDirection = useCallback((direction: 'left' | 'right') => {
    setSwingDirection(direction);
  }, []);
  
  const handleSetSelectedAsset = useCallback((asset: DoorWindowAsset) => {
    setSelectedAssetState(asset);
    setCurrentWidthInches(asset.inches);
  }, []);
  
  // Handlers object
  const handlers: DragHandlers = {
    onDragStart,
    onDragMove,
    onDragEnd,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
    onRenderComplete: handleRenderComplete,
    setCategoryGroup: handleSetCategoryGroup,
    setSwingDirection: handleSetSwingDirection,
    setSelectedAsset: handleSetSelectedAsset,
  };
  
  return [state, handlers];
}

export default useOpeningDrag;

