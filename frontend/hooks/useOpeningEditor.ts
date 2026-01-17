/**
 * useOpeningEditor - Hook for managing door/window opening editing
 * 
 * Handles:
 * - Wall detection and highlighting
 * - CAD-style drag-to-define-width placement
 * - API calls for adding/removing openings
 * - Render job polling
 * - Asset-based opening placement
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { 
  WallSegment, 
  OpeningPlacement, 
  OpeningJobStatus,
  Point,
  RejectedGeneration,
} from '@/lib/editor/openingTypes';
import { assetToOpeningPlacement } from '@/lib/editor/openingTypes';
import { extractWallSegments } from '@/lib/editor/wallDetection';
import { createMapperFromSvg, type CoordinateMapper } from '@/lib/editor/coordinateMapping';
import { validateOpeningPlacement, generateOpeningId } from '@/lib/editor/svgOpenings';
import { addOpening, pollOpeningStatus } from '@/lib/drafted-api';
import type { OpeningStatusResponse } from '@/lib/editor/openingTypes';
import type { DoorWindowAsset } from '@/lib/editor/assetManifest';
import { useOpeningDrag, type DragState, type DragHandlers } from './useOpeningDrag';
import { 
  detectOpeningsFromSvg, 
  findOpeningWall,
  type DetectedOpening 
} from '@/lib/editor/openingDetection';

interface OpeningJob {
  jobId: string;
  opening: OpeningPlacement;
  wall: WallSegment;
  status: OpeningJobStatus;
  error?: string;
  asset?: DoorWindowAsset;  // Track the asset used
}

interface UseOpeningEditorOptions {
  svg: string | null;
  croppedSvg: string | null;
  renderedImageBase64: string | null;
  planId: string | null;
  canonicalRoomKeys: string[];
  pngDimensions: { width: number; height: number } | null;
  containerRef: React.RefObject<HTMLElement>;
  onRenderComplete?: (newImageBase64: string, modifiedSvg: string, rawPngBase64?: string, geminiPrompt?: string, rejectedGenerations?: RejectedGeneration[]) => void;
  // Optional external control of openings state (for undo/redo sync)
  openings?: OpeningPlacement[];
  onOpeningsChange?: (openings: OpeningPlacement[]) => void;
}

export function useOpeningEditor(options: UseOpeningEditorOptions) {
  const {
    svg,
    croppedSvg,
    renderedImageBase64,
    planId,
    canonicalRoomKeys,
    pngDimensions,
    containerRef,
    onRenderComplete,
    openings: externalOpenings,
    onOpeningsChange,
  } = options;

  // State
  const [isEnabled, setIsEnabled] = useState(false);
  const [hoveredWallId, setHoveredWallId] = useState<string | null>(null);
  // Use external openings if provided, otherwise manage internally
  const [internalOpenings, setInternalOpenings] = useState<OpeningPlacement[]>([]);
  const openings = externalOpenings ?? internalOpenings;
  const setOpenings = useCallback((update: OpeningPlacement[] | ((prev: OpeningPlacement[]) => OpeningPlacement[])) => {
    const newOpenings = typeof update === 'function' ? update(openings) : update;
    if (onOpeningsChange) {
      onOpeningsChange(newOpenings);
    } else {
      setInternalOpenings(newOpenings);
    }
  }, [openings, onOpeningsChange]);
  const [activeJobs, setActiveJobs] = useState<OpeningJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedExistingOpening, setSelectedExistingOpening] = useState<DetectedOpening | null>(null);
  
  // Ref for drag handlers to avoid circular dependency
  const dragHandlersRef = useRef<DragHandlers | null>(null);

  // Extract walls from SVG
  const walls = useMemo(() => {
    if (!svg) return [];
    try {
      return extractWallSegments(svg);
    } catch (e) {
      console.error('[useOpeningEditor] Failed to extract walls:', e);
      return [];
    }
  }, [svg]);

  // Create coordinate mapper
  const mapper = useMemo((): CoordinateMapper | null => {
    if (!croppedSvg || !pngDimensions) return null;
    try {
      return createMapperFromSvg(croppedSvg, pngDimensions.width, pngDimensions.height);
    } catch (e) {
      console.error('[useOpeningEditor] Failed to create mapper:', e);
      return null;
    }
  }, [croppedSvg, pngDimensions]);

  // Detect existing openings from SVG
  const existingOpenings = useMemo((): DetectedOpening[] => {
    if (!svg) return [];
    try {
      const detected = detectOpeningsFromSvg(svg);
      console.log('[useOpeningEditor] Detected existing openings:', detected.length);
      return detected;
    } catch (e) {
      console.error('[useOpeningEditor] Failed to detect openings:', e);
      return [];
    }
  }, [svg]);

  // ==========================================================================
  // CAD-STYLE DRAG PLACEMENT
  // ==========================================================================

  // Handle drag confirmation - this is called when user clicks the checkmark
  const handleDragConfirm = useCallback(async (config: {
    wall: WallSegment;
    positionOnWall: number;
    asset: DoorWindowAsset;
    swingDirection: 'left' | 'right';
  }) => {
    if (!svg || !croppedSvg || !renderedImageBase64 || !planId) {
      setError('Missing required data for opening placement');
      return;
    }

    const { wall, positionOnWall, asset, swingDirection } = config;

    // Convert asset to legacy opening placement for API compatibility
    const openingSpec = assetToOpeningPlacement(
      asset,
      wall.id,
      positionOnWall,
      swingDirection
    );

    // Create opening placement with ID
    const opening: OpeningPlacement = {
      id: generateOpeningId(),
      ...openingSpec,
    };

    // Convert detected existing openings to validation-compatible format
    // These are openings already in the SVG (from previous edits or original plan)
    const existingOpeningsForValidation: OpeningPlacement[] = existingOpenings
      .filter(e => e.wallId && e.positionOnWall !== undefined) // Only include ones with wall info
      .map(e => ({
        id: e.id,
        type: e.type === 'door' ? 'interior_door' : e.type === 'garage' ? 'exterior_door' : 'window',
        wallId: e.wallId!,
        positionOnWall: e.positionOnWall!,
        // Convert width from SVG pixels to inches (SVG scale: 1px = 2 inches)
        widthInches: e.width * 2,
      }));
    
    // Combine session openings with existing SVG openings for validation
    const allOpeningsForValidation = [...openings, ...existingOpeningsForValidation];
    
    // Validate placement against ALL openings (both session-added and pre-existing)
    const validation = validateOpeningPlacement(
      openingSpec,
      wall,
      allOpeningsForValidation
    );

    if (!validation.valid) {
      setError(validation.error || 'Invalid placement');
      return;
    }

    // Add to local state immediately
    setOpenings(prev => [...prev, opening]);

    // Create job entry with asset info
    const job: OpeningJob = {
      jobId: '', // Will be set after API call
      opening,
      wall,
      status: 'pending',
      asset,
    };
    setActiveJobs(prev => [...prev, job]);

    try {
      // Call API with wall coordinates and asset info
      const result = await addOpening({
        planId,
        svg,
        croppedSvg,
        renderedImageBase64,
        opening: {
          type: opening.type,
          wallId: opening.wallId,
          positionOnWall: opening.positionOnWall,
          widthInches: opening.widthInches,
          swingDirection: opening.swingDirection,
        },
        canonicalRoomKeys,
        wallCoords: {
          startX: wall.start.x,
          startY: wall.start.y,
          endX: wall.end.x,
          endY: wall.end.y,
        },
        // Pass asset info for enhanced Gemini prompts
        assetInfo: {
          filename: asset.filename,
          category: asset.category,
          displayName: asset.displayName,
          description: asset.description,
        },
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to add opening');
      }

      // Update job with ID
      setActiveJobs(prev => prev.map(j => 
        j.opening.id === opening.id 
          ? { ...j, jobId: result.jobId, status: 'rendering' as OpeningJobStatus }
          : j
      ));

      // Start polling
      pollOpeningStatus(
        result.jobId,
        (status: OpeningStatusResponse) => {
          // Update job status
          setActiveJobs(prev => prev.map(j =>
            j.jobId === result.jobId
              ? { ...j, status: status.status, error: status.error }
              : j
          ));

          // Handle completion
          if (status.status === 'complete' && status.renderedImageBase64) {
            onRenderComplete?.(
              status.renderedImageBase64, 
              result.modifiedSvg,
              status.rawPngBase64,
              status.geminiPrompt,
              status.rejectedGenerations
            );
            
            // Reset drag state to idle
            dragHandlersRef.current?.onRenderComplete();
            
            // Remove completed job after delay
            setTimeout(() => {
              setActiveJobs(prev => prev.filter(j => j.jobId !== result.jobId));
            }, 2000);
          }

          // Handle failure
          if (status.status === 'failed') {
            setError(status.error || 'Render failed');
            // Remove failed opening
            setOpenings(prev => prev.filter(o => o.id !== opening.id));
            // Reset drag state to idle
            dragHandlersRef.current?.onRenderComplete();
          }
        }
      ).catch(err => {
        console.error('[useOpeningEditor] Polling error:', err);
        setError(err.message);
      });

    } catch (err) {
      console.error('[useOpeningEditor] Failed to add opening:', err);
      setError(err instanceof Error ? err.message : 'Failed to add opening');
      
      // Remove failed opening
      setOpenings(prev => prev.filter(o => o.id !== opening.id));
      setActiveJobs(prev => prev.filter(j => j.opening.id !== opening.id));
    }
  }, [
    svg, 
    croppedSvg, 
    renderedImageBase64, 
    planId, 
    canonicalRoomKeys, 
    openings,
    onRenderComplete,
  ]);

  // Initialize drag hook
  const [dragState, dragHandlers] = useOpeningDrag({
    mapper,
    containerRef,
    onConfirm: handleDragConfirm,
  });
  
  // Keep ref updated for use in callbacks
  dragHandlersRef.current = dragHandlers;

  // ==========================================================================
  // WALL INTERACTION HANDLERS
  // ==========================================================================

  // Handle wall click - starts drag interaction
  const handleWallClick = useCallback((
    wall: WallSegment, 
    positionOnWall: number,
    screenPoint?: Point
  ) => {
    if (!isEnabled) return;
    
    // Start drag interaction
    dragHandlers.onDragStart(
      wall, 
      positionOnWall, 
      screenPoint || { x: 0, y: 0 }
    );
  }, [isEnabled, dragHandlers]);

  // Handle mouse move during drag
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragState.phase === 'dragging') {
      dragHandlers.onDragMove({ x: e.clientX, y: e.clientY });
    }
  }, [dragState.phase, dragHandlers]);

  // Handle mouse up to end drag
  const handleMouseUp = useCallback(() => {
    if (dragState.phase === 'dragging') {
      dragHandlers.onDragEnd();
    }
  }, [dragState.phase, dragHandlers]);

  // Add/remove global mouse listeners for drag
  useEffect(() => {
    if (dragState.phase === 'dragging') {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState.phase, handleMouseMove, handleMouseUp]);

  // ==========================================================================
  // OTHER HANDLERS
  // ==========================================================================

  // Toggle editing mode
  const toggleEnabled = useCallback(() => {
    setIsEnabled(prev => !prev);
    if (isEnabled) {
      // Disable - clear selection and cancel any draft
      setHoveredWallId(null);
      dragHandlers.onCancel();
    }
  }, [isEnabled, dragHandlers]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Get current active job for preview
  const activeJob = useMemo(() => {
    return activeJobs.find(j => j.status !== 'complete' && j.status !== 'failed') || null;
  }, [activeJobs]);

  // Check if we're in drag/draft mode (should disable wall hover)
  const isDragging = dragState.phase === 'dragging' || dragState.phase === 'draft';

  // Handle selecting an existing opening for editing
  const handleSelectExistingOpening = useCallback((opening: DetectedOpening) => {
    if (!isEnabled) return;
    
    setSelectedExistingOpening(opening);
    
    // Find the wall this opening is on
    const wallMatch = findOpeningWall(opening, walls);
    if (wallMatch) {
      // Start drag interaction at the opening's position
      dragHandlers.onDragStart(
        wallMatch.wall,
        wallMatch.positionOnWall,
        { x: 0, y: 0 } // Screen point not needed for existing openings
      );
    }
  }, [isEnabled, walls, dragHandlers]);

  // Clear existing opening selection
  const clearExistingOpeningSelection = useCallback(() => {
    setSelectedExistingOpening(null);
  }, []);

  return {
    // State
    isEnabled,
    walls,
    mapper,
    hoveredWallId,
    openings,
    activeJobs,
    activeJob,
    error,
    existingOpenings,
    selectedExistingOpening,
    
    // Drag state
    dragState,
    dragHandlers,
    isDragging,

    // Actions
    toggleEnabled,
    setHoveredWallId,
    handleWallClick,
    handleSelectExistingOpening,
    clearExistingOpeningSelection,
    clearError,
  };
}

export type OpeningEditor = ReturnType<typeof useOpeningEditor>;
