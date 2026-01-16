/**
 * useOpeningEditor - Hook for managing door/window opening editing
 * 
 * Handles:
 * - Wall detection and highlighting
 * - Opening placement UI state
 * - API calls for adding/removing openings
 * - Render job polling
 * - Asset-based opening placement
 */

import { useState, useCallback, useMemo } from 'react';
import type { 
  WallSegment, 
  OpeningPlacement, 
  OpeningJobStatus,
} from '@/lib/editor/openingTypes';
import { assetToOpeningPlacement } from '@/lib/editor/openingTypes';
import { extractWallSegments } from '@/lib/editor/wallDetection';
import { createMapperFromSvg, type CoordinateMapper } from '@/lib/editor/coordinateMapping';
import { validateOpeningPlacement, generateOpeningId } from '@/lib/editor/svgOpenings';
import { addOpening, pollOpeningStatus, type OpeningStatusResponse } from '@/lib/drafted-api';
import type { DoorWindowAsset } from '@/lib/editor/assetManifest';

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
  onRenderComplete?: (newImageBase64: string, modifiedSvg: string, rawPngBase64?: string, geminiPrompt?: string) => void;
}

export function useOpeningEditor(options: UseOpeningEditorOptions) {
  const {
    svg,
    croppedSvg,
    renderedImageBase64,
    planId,
    canonicalRoomKeys,
    pngDimensions,
    onRenderComplete,
  } = options;

  // State
  const [isEnabled, setIsEnabled] = useState(false);
  const [hoveredWallId, setHoveredWallId] = useState<string | null>(null);
  const [selectedWall, setSelectedWall] = useState<WallSegment | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<number>(0.5);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openings, setOpenings] = useState<OpeningPlacement[]>([]);
  const [activeJobs, setActiveJobs] = useState<OpeningJob[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  // Handle wall click
  const handleWallClick = useCallback((wall: WallSegment, positionOnWall: number) => {
    if (!isEnabled) return;
    
    setSelectedWall(wall);
    setSelectedPosition(positionOnWall);
    setIsModalOpen(true);
  }, [isEnabled]);

  // Handle opening placement confirmation (new asset-based version)
  const handleConfirmOpening = useCallback(async (config: {
    asset: DoorWindowAsset;
    widthInches: number;
    swingDirection?: 'left' | 'right';
  }) => {
    if (!selectedWall || !svg || !croppedSvg || !renderedImageBase64 || !planId) {
      setError('Missing required data for opening placement');
      return;
    }

    // Convert asset to legacy opening placement for API compatibility
    const openingSpec = assetToOpeningPlacement(
      config.asset,
      selectedWall.id,
      selectedPosition,
      config.swingDirection
    );

    // Create opening placement with ID
    const opening: OpeningPlacement = {
      id: generateOpeningId(),
      ...openingSpec,
    };

    // Validate placement
    const validation = validateOpeningPlacement(
      openingSpec,
      selectedWall,
      openings
    );

    if (!validation.valid) {
      setError(validation.error || 'Invalid placement');
      return;
    }

    // Close modal
    setIsModalOpen(false);
    setSelectedWall(null);

    // Add to local state immediately
    setOpenings(prev => [...prev, opening]);

    // Create job entry with asset info
    const job: OpeningJob = {
      jobId: '', // Will be set after API call
      opening,
      wall: selectedWall,
      status: 'pending',
      asset: config.asset,
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
          startX: selectedWall.start.x,
          startY: selectedWall.start.y,
          endX: selectedWall.end.x,
          endY: selectedWall.end.y,
        },
        // Pass asset info for enhanced Gemini prompts
        assetInfo: {
          filename: config.asset.filename,
          category: config.asset.category,
          displayName: config.asset.displayName,
          description: config.asset.description,
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
              status.geminiPrompt
            );
            
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
    selectedWall, 
    selectedPosition, 
    svg, 
    croppedSvg, 
    renderedImageBase64, 
    planId, 
    canonicalRoomKeys, 
    openings,
    onRenderComplete,
  ]);

  // Cancel modal
  const handleCancelModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedWall(null);
  }, []);

  // Toggle editing mode
  const toggleEnabled = useCallback(() => {
    setIsEnabled(prev => !prev);
    if (isEnabled) {
      // Disable - clear selection
      setHoveredWallId(null);
      setSelectedWall(null);
    }
  }, [isEnabled]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Get current active job for preview
  const activeJob = useMemo(() => {
    return activeJobs.find(j => j.status !== 'complete' && j.status !== 'failed') || null;
  }, [activeJobs]);

  return {
    // State
    isEnabled,
    walls,
    mapper,
    hoveredWallId,
    selectedWall,
    selectedPosition,
    isModalOpen,
    openings,
    activeJobs,
    activeJob,
    error,

    // Actions
    toggleEnabled,
    setHoveredWallId,
    handleWallClick,
    handleConfirmOpening,
    handleCancelModal,
    clearError,
  };
}

export type OpeningEditor = ReturnType<typeof useOpeningEditor>;
