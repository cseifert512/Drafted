'use client';

import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { 
  Download,
  Image,
  FileCode,
  DoorOpen,
  Bug,
} from 'lucide-react';
import { useOpeningEditor } from '@/hooks/useOpeningEditor';
import { EditorCanvas } from './EditorCanvas';
import { WallHighlightLayer } from './WallHighlightLayer';
import { OpeningPlacementModal } from './OpeningPlacementModal';
import { OpeningPreviewOverlay, RenderProgress } from './OpeningPreviewOverlay';
import type { DraftedPlan, RoomTypeDefinition } from '@/lib/drafted-types';

interface FloorPlanEditorProps {
  initialPlan?: DraftedPlan;
  roomTypes: RoomTypeDefinition[];
}

export function FloorPlanEditor({
  initialPlan,
  roomTypes,
}: FloorPlanEditorProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  
  // Track PNG dimensions for coordinate mapping
  const [pngDimensions, setPngDimensions] = useState<{ width: number; height: number } | null>(null);
  
  // Track current rendered image (can be updated by opening renders)
  const [currentRenderedImage, setCurrentRenderedImage] = useState<string | undefined>(
    initialPlan?.rendered_image_base64
  );
  
  // Toggle between SVG and rendered view
  const [showRenderedOverlay, setShowRenderedOverlay] = useState(true);
  
  // Debug mode: overlay SVG on render
  const [debugOverlay, setDebugOverlay] = useState(false);
  const [debugOpacity, setDebugOpacity] = useState(0.5);
  
  // Opening editor hook
  const openingEditor = useOpeningEditor({
    svg: initialPlan?.svg || null,
    croppedSvg: initialPlan?.cropped_svg || null,
    renderedImageBase64: currentRenderedImage || null,
    planId: initialPlan?.id || null,
    canonicalRoomKeys: initialPlan?.rooms?.map(r => r.canonical_key) || [],
    pngDimensions,
    onRenderComplete: (newImageBase64, modifiedSvg) => {
      console.log('[FloorPlanEditor] Opening render complete');
      setCurrentRenderedImage(newImageBase64);
    },
  });
  
  // Update current rendered image when initialPlan changes
  useEffect(() => {
    if (initialPlan?.rendered_image_base64) {
      setCurrentRenderedImage(initialPlan.rendered_image_base64);
    }
  }, [initialPlan?.rendered_image_base64]);
  
  // Get PNG dimensions when image loads
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setPngDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    console.log('[FloorPlanEditor] Image loaded:', img.naturalWidth, 'x', img.naturalHeight);
  }, []);
  
  // Handle export SVG
  const handleExportSvg = useCallback(() => {
    if (!initialPlan?.svg) return;
    const blob = new Blob([initialPlan.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'floor-plan.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, [initialPlan?.svg]);
  
  // Check if rendered image is available
  const hasRenderedImage = !!currentRenderedImage;
  
  // Debug: log rendered image status
  useEffect(() => {
    console.log('[FloorPlanEditor] Rendered image status:', {
      hasRenderedImage,
      hasInitialPlanRendered: !!initialPlan?.rendered_image_base64,
      currentRenderedImageLength: currentRenderedImage?.length,
    });
  }, [hasRenderedImage, initialPlan?.rendered_image_base64, currentRenderedImage]);
  
  // Toggle rendered overlay
  const toggleRenderedOverlay = useCallback(() => {
    setShowRenderedOverlay(prev => !prev);
  }, []);
  
  // Error state
  const [error, setError] = useState<string | null>(null);
  
  return (
    <div className="h-full flex flex-col bg-drafted-bg">
      {/* Toolbar */}
      <div className="bg-white border-b border-drafted-border px-4 py-2 flex items-center justify-between">
        {/* Left: Title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-coral-100 rounded-lg flex items-center justify-center">
            <FileCode className="w-4 h-4 text-coral-500" />
          </div>
          <div>
            <h2 className="font-semibold text-drafted-black text-sm">Floor Plan Editor</h2>
            <p className="text-xs text-drafted-gray">
              {openingEditor.isEnabled ? 'Click a wall to add door/window' : 'View and edit floor plan'}
            </p>
          </div>
        </div>
        
        {/* Center: View Controls */}
        <div className="flex items-center gap-2">
          {/* Toggle: SVG Only vs Rendered */}
          <button
            onClick={toggleRenderedOverlay}
            disabled={!hasRenderedImage}
            className={`px-3 py-1.5 rounded-lg transition-colors text-xs font-medium flex items-center gap-1.5 ${
              showRenderedOverlay 
                ? 'bg-purple-100 text-purple-600 hover:bg-purple-200' 
                : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            } ${!hasRenderedImage ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={hasRenderedImage 
              ? (showRenderedOverlay ? "Show SVG Only" : "Show Rendered Image")
              : "No rendered image available"
            }
          >
            {showRenderedOverlay ? (
              <>
                <Image className="w-3.5 h-3.5" />
                <span>Rendered</span>
              </>
            ) : (
              <>
                <FileCode className="w-3.5 h-3.5" />
                <span>SVG</span>
              </>
            )}
          </button>
          
          <div className="w-px h-6 bg-drafted-border mx-1" />
          
          {/* Door/Window Editing Toggle */}
          <button
            onClick={() => {
              // Auto-switch to rendered overlay when enabling door/window mode
              if (!openingEditor.isEnabled && !showRenderedOverlay && hasRenderedImage) {
                setShowRenderedOverlay(true);
              }
              openingEditor.toggleEnabled();
            }}
            disabled={!hasRenderedImage}
            className={`px-3 py-1.5 rounded-lg transition-colors text-xs font-medium flex items-center gap-1.5 ${
              openingEditor.isEnabled 
                ? 'bg-orange-100 text-orange-600 hover:bg-orange-200' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            } ${!hasRenderedImage ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={hasRenderedImage 
              ? (openingEditor.isEnabled ? "Exit door/window mode" : "Add doors & windows")
              : "Requires a rendered floor plan"
            }
          >
            <DoorOpen className="w-3.5 h-3.5" />
            <span>{openingEditor.isEnabled ? 'Exit Edit' : 'Doors/Windows'}</span>
          </button>
          
          <div className="w-px h-6 bg-drafted-border mx-1" />
          
          {/* Debug SVG Overlay Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDebugOverlay(prev => !prev)}
              disabled={!hasRenderedImage || !showRenderedOverlay}
              className={`px-3 py-1.5 rounded-lg transition-colors text-xs font-medium flex items-center gap-1.5 ${
                debugOverlay 
                  ? 'bg-red-100 text-red-600 hover:bg-red-200 ring-2 ring-red-400' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${(!hasRenderedImage || !showRenderedOverlay) ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Debug: Overlay SVG on render to check alignment"
            >
              <Bug className="w-3.5 h-3.5" />
              <span>Debug</span>
            </button>
            
            {/* Opacity slider - only show when debug is active */}
            {debugOverlay && (
              <div className="flex items-center gap-2 px-2 py-1 bg-red-50 rounded-lg">
                <span className="text-xs text-red-600 font-medium">{Math.round(debugOpacity * 100)}%</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={debugOpacity}
                  onChange={(e) => setDebugOpacity(parseFloat(e.target.value))}
                  className="w-20 h-1 bg-red-200 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
              </div>
            )}
          </div>
        </div>
        
        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportSvg}
            disabled={!initialPlan?.svg}
            className="flex items-center gap-2 px-3 py-2 hover:bg-drafted-bg rounded-lg transition-colors text-sm disabled:opacity-50"
            title="Export SVG"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>
          
      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        <div ref={canvasContainerRef} className="h-full p-4">
          <EditorCanvas
            rawSvgContent={initialPlan?.svg}
            croppedSvgContent={initialPlan?.cropped_svg}
            renderedImageBase64={currentRenderedImage}
            showRenderedOverlay={showRenderedOverlay}
            onImageLoad={handleImageLoad}
            isEditingEnabled={openingEditor.isEnabled}
            debugOverlay={debugOverlay}
            debugOpacity={debugOpacity}
            wallHighlightLayer={
              openingEditor.isEnabled && showRenderedOverlay ? (
                <WallHighlightLayer
                  walls={openingEditor.walls}
                  mapper={openingEditor.mapper}
                  hoveredWallId={openingEditor.hoveredWallId}
                  selectedWallId={openingEditor.selectedWall?.id || null}
                  onWallHover={openingEditor.setHoveredWallId}
                  onWallClick={openingEditor.handleWallClick}
                  disabled={openingEditor.isModalOpen}
                />
              ) : null
            }
            openingPreview={
              openingEditor.activeJob ? (
                <OpeningPreviewOverlay
                  opening={openingEditor.activeJob.opening}
                  wall={openingEditor.activeJob.wall}
                  mapper={openingEditor.mapper}
                  status={openingEditor.activeJob.status}
                  error={openingEditor.activeJob.error}
                />
              ) : null
            }
          />
        </div>
      </div>
          
      {/* Status Bar */}
      <div className="px-4 py-2 bg-white border-t border-drafted-border flex items-center justify-between text-xs text-drafted-gray">
        <div className="flex items-center gap-4">
          <span>Seed: {initialPlan?.seed || 'N/A'}</span>
          <span>{initialPlan?.rooms?.length || 0} rooms</span>
          <span>{(initialPlan?.total_area_sqft || 0).toLocaleString()} sqft</span>
        </div>
        <div className="flex items-center gap-4">
          {hasRenderedImage ? (
            <span className="text-green-600">✓ Rendered</span>
          ) : (
            <span className="text-amber-600">No rendered image</span>
          )}
          {openingEditor.isEnabled && (
            <span className="text-orange-600">• Editing mode</span>
          )}
        </div>
      </div>
      
      {/* Opening Placement Modal */}
      <OpeningPlacementModal
        isOpen={openingEditor.isModalOpen}
        wall={openingEditor.selectedWall}
        positionOnWall={openingEditor.selectedPosition}
        onClose={openingEditor.handleCancelModal}
        onConfirm={openingEditor.handleConfirmOpening}
      />
      
      {/* Render Progress (for multiple openings) */}
      <AnimatePresence>
        {openingEditor.activeJobs.length > 0 && (
          <RenderProgress jobs={openingEditor.activeJobs} />
        )}
      </AnimatePresence>
      
      {/* Error Toast */}
      <AnimatePresence>
        {(error || openingEditor.error) && (
          <div className="fixed bottom-4 left-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg max-w-sm">
            <div className="font-medium mb-1">Error</div>
            <div className="text-sm opacity-90">{error || openingEditor.error}</div>
            <button
              onClick={() => {
                setError(null);
                openingEditor.clearError();
              }}
              className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded"
            >
              ×
            </button>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
