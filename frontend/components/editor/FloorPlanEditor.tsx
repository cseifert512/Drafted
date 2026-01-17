'use client';

import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { 
  Download,
  Image,
  FileCode,
  DoorOpen,
  Square,
  Warehouse,
  Bug,
  Undo2,
  Redo2,
  Eye,
} from 'lucide-react';
import { useOpeningEditor } from '@/hooks/useOpeningEditor';
import { EditorCanvas } from './EditorCanvas';
import { WallHighlightLayer } from './WallHighlightLayer';
import { OpeningPreviewOverlay, RenderProgress } from './OpeningPreviewOverlay';
import { OpeningDragOverlay } from './OpeningDragOverlay';
import { GeminiDebugModal } from './GeminiDebugModal';
import type { DraftedPlan, RoomTypeDefinition, EditorEditState, OpeningPlacement } from '@/lib/drafted-types';

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
  
  // ==========================================================================
  // UNIFIED EDIT STATE WITH UNDO/REDO
  // ==========================================================================
  
  // Track current edit state (rendered image + SVG + openings)
  const [currentRenderedImage, setCurrentRenderedImage] = useState<string | undefined>(
    initialPlan?.rendered_image_base64
  );
  const [currentSvg, setCurrentSvg] = useState<string | undefined>(
    initialPlan?.svg
  );
  const [currentOpenings, setCurrentOpenings] = useState<OpeningPlacement[]>([]);
  
  // Unified undo/redo history that tracks complete edit state
  const [editHistory, setEditHistory] = useState<EditorEditState[]>([]);
  const [editFuture, setEditFuture] = useState<EditorEditState[]>([]);
  
  // Push current state to history before making a new edit
  const pushToHistory = useCallback(() => {
    if (currentRenderedImage && currentSvg) {
      const currentState: EditorEditState = {
        renderedImage: currentRenderedImage,
        svg: currentSvg,
        openings: [...currentOpenings],
      };
      setEditHistory(prev => [...prev, currentState]);
      setEditFuture([]); // Clear redo stack on new change
    }
  }, [currentRenderedImage, currentSvg, currentOpenings]);
  
  // Undo - restore previous complete state
  const handleUndo = useCallback(() => {
    if (editHistory.length === 0) return;
    
    const prevState = editHistory[editHistory.length - 1];
    const newHistory = editHistory.slice(0, -1);
    
    // Push current to future (for redo)
    if (currentRenderedImage && currentSvg) {
      const currentState: EditorEditState = {
        renderedImage: currentRenderedImage,
        svg: currentSvg,
        openings: [...currentOpenings],
      };
      setEditFuture(prev => [...prev, currentState]);
    }
    
    // Restore previous state
    setEditHistory(newHistory);
    setCurrentRenderedImage(prevState.renderedImage);
    setCurrentSvg(prevState.svg);
    setCurrentOpenings(prevState.openings);
  }, [editHistory, currentRenderedImage, currentSvg, currentOpenings]);
  
  // Redo - restore next state
  const handleRedo = useCallback(() => {
    if (editFuture.length === 0) return;
    
    const nextState = editFuture[editFuture.length - 1];
    const newFuture = editFuture.slice(0, -1);
    
    // Push current to history (for undo)
    if (currentRenderedImage && currentSvg) {
      const currentState: EditorEditState = {
        renderedImage: currentRenderedImage,
        svg: currentSvg,
        openings: [...currentOpenings],
      };
      setEditHistory(prev => [...prev, currentState]);
    }
    
    // Restore next state
    setEditFuture(newFuture);
    setCurrentRenderedImage(nextState.renderedImage);
    setCurrentSvg(nextState.svg);
    setCurrentOpenings(nextState.openings);
  }, [editFuture, currentRenderedImage, currentSvg, currentOpenings]);
  
  // Check if undo/redo are available
  const canUndo = editHistory.length > 0;
  const canRedo = editFuture.length > 0;
  
  // Toggle between SVG and rendered view
  const [showRenderedOverlay, setShowRenderedOverlay] = useState(true);
  
  // Debug mode: overlay SVG on render
  const [debugOverlay, setDebugOverlay] = useState(false);
  const [debugOpacity, setDebugOpacity] = useState(0.5);
  
  // Gemini debug modal
  const [showGeminiDebug, setShowGeminiDebug] = useState(false);
  
  // Track current Gemini input data (updates with each operation)
  const [currentRawPngBase64, setCurrentRawPngBase64] = useState<string | undefined>(
    initialPlan?.raw_png_base64
  );
  const [currentGeminiPrompt, setCurrentGeminiPrompt] = useState<string | undefined>(
    initialPlan?.gemini_prompt
  );
  const [currentRejectedGenerations, setCurrentRejectedGenerations] = useState<any[] | undefined>();
  
  // Opening editor hook with CAD-style drag support
  // IMPORTANT: Pass currentSvg (cumulative) instead of initialPlan.svg
  const openingEditor = useOpeningEditor({
    svg: currentSvg || null,
    croppedSvg: initialPlan?.cropped_svg || null,
    renderedImageBase64: currentRenderedImage || null,
    planId: initialPlan?.id || null,
    canonicalRoomKeys: initialPlan?.rooms?.map(r => r.canonical_key) || [],
    pngDimensions,
    containerRef: canvasContainerRef as React.RefObject<HTMLElement>,
    // External control of openings for undo/redo sync
    openings: currentOpenings,
    onOpeningsChange: setCurrentOpenings,
    onRenderComplete: (newImageBase64, modifiedSvg, rawPngBase64, geminiPrompt, rejectedGenerations) => {
      console.log('[FloorPlanEditor] Opening render complete');
      // Save current complete state to history before updating (for undo)
      pushToHistory();
      
      // Update current state with new values
      setCurrentRenderedImage(newImageBase64);
      if (modifiedSvg) {
        setCurrentSvg(modifiedSvg);
        console.log('[FloorPlanEditor] Updated SVG (cumulative edit)');
      }
      
      // Update Gemini debug data to reflect current state
      if (rawPngBase64) {
        setCurrentRawPngBase64(rawPngBase64);
        console.log('[FloorPlanEditor] Updated Gemini input PNG');
      }
      if (geminiPrompt) {
        setCurrentGeminiPrompt(geminiPrompt);
        console.log('[FloorPlanEditor] Updated Gemini prompt');
      }
      // Update rejected generations for debug view
      setCurrentRejectedGenerations(rejectedGenerations);
      if (rejectedGenerations && rejectedGenerations.length > 0) {
        console.log(`[FloorPlanEditor] ${rejectedGenerations.length} generations were rejected by validation`);
      }
    },
  });
  
  // Update current state when initialPlan changes (reset to new plan)
  useEffect(() => {
    if (initialPlan?.rendered_image_base64) {
      setCurrentRenderedImage(initialPlan.rendered_image_base64);
    }
    if (initialPlan?.svg) {
      setCurrentSvg(initialPlan.svg);
    }
    if (initialPlan?.raw_png_base64) {
      setCurrentRawPngBase64(initialPlan.raw_png_base64);
    }
    if (initialPlan?.gemini_prompt) {
      setCurrentGeminiPrompt(initialPlan.gemini_prompt);
    }
    // Reset openings and history when plan changes
    setCurrentOpenings([]);
    setEditHistory([]);
    setEditFuture([]);
  }, [initialPlan?.id]); // Reset when plan ID changes
  
  // Get PNG dimensions when image loads
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setPngDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    console.log('[FloorPlanEditor] Image loaded:', img.naturalWidth, 'x', img.naturalHeight);
  }, []);
  
  // Handle export SVG - exports the current modified SVG (with all edits)
  const handleExportSvg = useCallback(() => {
    if (!currentSvg) return;
    const blob = new Blob([currentSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'floor-plan.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, [currentSvg]);
  
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
  
  // Check if we should disable wall highlights (during drag/draft)
  const shouldDisableWallHighlights = openingEditor.isDragging;
  
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
              {openingEditor.isDragging 
                ? 'Drag to set opening width, then confirm' 
                : openingEditor.isEnabled 
                ? 'Click a wall to add door/window' 
                : 'View and edit floor plan'}
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
          
          {/* Door/Window/Garage Editing Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                // Auto-switch to rendered overlay when enabling
                if (!openingEditor.isEnabled && !showRenderedOverlay && hasRenderedImage) {
                  setShowRenderedOverlay(true);
                }
                openingEditor.dragHandlers.setDefaultCategoryGroup('door');
                if (!openingEditor.isEnabled) {
                  openingEditor.toggleEnabled();
                }
              }}
              disabled={!hasRenderedImage}
              className={`px-2.5 py-1.5 rounded-lg transition-colors text-xs font-medium flex items-center gap-1 ${
                openingEditor.isEnabled && openingEditor.dragState.defaultCategoryGroup === 'door'
                  ? 'bg-orange-100 text-orange-600 hover:bg-orange-200 ring-2 ring-orange-400' 
                  : openingEditor.isEnabled 
                  ? 'bg-orange-50 text-orange-500 hover:bg-orange-100'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${!hasRenderedImage ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Add doors"
            >
              <DoorOpen className="w-3.5 h-3.5" />
              <span>Door</span>
            </button>
            
            <button
              onClick={() => {
                if (!openingEditor.isEnabled && !showRenderedOverlay && hasRenderedImage) {
                  setShowRenderedOverlay(true);
                }
                openingEditor.dragHandlers.setDefaultCategoryGroup('window');
                if (!openingEditor.isEnabled) {
                  openingEditor.toggleEnabled();
                }
              }}
              disabled={!hasRenderedImage}
              className={`px-2.5 py-1.5 rounded-lg transition-colors text-xs font-medium flex items-center gap-1 ${
                openingEditor.isEnabled && openingEditor.dragState.defaultCategoryGroup === 'window'
                  ? 'bg-sky-100 text-sky-600 hover:bg-sky-200 ring-2 ring-sky-400' 
                  : openingEditor.isEnabled 
                  ? 'bg-sky-50 text-sky-500 hover:bg-sky-100'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${!hasRenderedImage ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Add windows"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Window</span>
            </button>
            
            <button
              onClick={() => {
                if (!openingEditor.isEnabled && !showRenderedOverlay && hasRenderedImage) {
                  setShowRenderedOverlay(true);
                }
                openingEditor.dragHandlers.setDefaultCategoryGroup('garage');
                if (!openingEditor.isEnabled) {
                  openingEditor.toggleEnabled();
                }
              }}
              disabled={!hasRenderedImage}
              className={`px-2.5 py-1.5 rounded-lg transition-colors text-xs font-medium flex items-center gap-1 ${
                openingEditor.isEnabled && openingEditor.dragState.defaultCategoryGroup === 'garage'
                  ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 ring-2 ring-emerald-400' 
                  : openingEditor.isEnabled 
                  ? 'bg-emerald-50 text-emerald-500 hover:bg-emerald-100'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${!hasRenderedImage ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Add garage doors"
            >
              <Warehouse className="w-3.5 h-3.5" />
              <span>Garage</span>
            </button>
            
            {openingEditor.isEnabled && (
              <button
                onClick={() => openingEditor.toggleEnabled()}
                className="px-2 py-1.5 rounded-lg transition-colors text-xs font-medium bg-red-100 text-red-600 hover:bg-red-200"
                title="Exit editing mode"
              >
                ✕
              </button>
            )}
          </div>
          
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
            
            {/* View Gemini Input Button */}
            <button
              onClick={() => setShowGeminiDebug(true)}
              disabled={!hasRenderedImage}
              className={`px-3 py-1.5 rounded-lg transition-colors text-xs font-medium flex items-center gap-1.5 ${
                'bg-purple-100 text-purple-600 hover:bg-purple-200'
              } ${!hasRenderedImage ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="View exact PNG and prompt sent to Gemini API"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Gemini Input</span>
            </button>
          </div>
        </div>
        
        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Undo/Redo buttons */}
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className={`p-2 rounded-lg transition-colors ${
                canUndo 
                  ? 'hover:bg-drafted-bg text-drafted-black' 
                  : 'text-gray-300 cursor-not-allowed'
              }`}
              title={canUndo ? `Undo (${editHistory.length} steps)` : 'Nothing to undo'}
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className={`p-2 rounded-lg transition-colors ${
                canRedo 
                  ? 'hover:bg-drafted-bg text-drafted-black' 
                  : 'text-gray-300 cursor-not-allowed'
              }`}
              title={canRedo ? `Redo (${editFuture.length} steps)` : 'Nothing to redo'}
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
          
          <div className="w-px h-6 bg-drafted-border" />
          
          <button
            onClick={handleExportSvg}
            disabled={!currentSvg}
            className="flex items-center gap-2 px-3 py-2 hover:bg-drafted-bg rounded-lg transition-colors text-sm disabled:opacity-50"
            title="Export SVG (includes all edits)"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>
          
      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        <div ref={canvasContainerRef} className="h-full p-4 relative">
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
              openingEditor.isEnabled && showRenderedOverlay && !shouldDisableWallHighlights ? (
                <WallHighlightLayer
                  walls={openingEditor.walls}
                  mapper={openingEditor.mapper}
                  hoveredWallId={openingEditor.hoveredWallId}
                  selectedWallId={openingEditor.dragState.wall?.id || null}
                  onWallHover={openingEditor.setHoveredWallId}
                  onWallClick={openingEditor.handleWallClick}
                  disabled={false}
                />
              ) : null
            }
            openingPreview={
              // Show drag overlay during CAD-style placement
              openingEditor.dragState.phase !== 'idle' ? (
                <OpeningDragOverlay
                  dragState={openingEditor.dragState}
                  dragHandlers={openingEditor.dragHandlers}
                  mapper={openingEditor.mapper}
                  containerRef={canvasContainerRef as React.RefObject<HTMLElement>}
                />
              ) : openingEditor.activeJob ? (
                // Show render progress overlay for active jobs
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
          {openingEditor.isDragging && (
            <span className="text-orange-600">• Placing opening</span>
          )}
          {openingEditor.isEnabled && !openingEditor.isDragging && (
            <span className="text-orange-600">• Editing mode</span>
          )}
        </div>
      </div>
      
      {/* Gemini Debug Modal */}
      <GeminiDebugModal
        isOpen={showGeminiDebug}
        onClose={() => setShowGeminiDebug(false)}
        rawPngBase64={currentRawPngBase64}
        geminiPrompt={currentGeminiPrompt}
        modifiedSvg={currentSvg}
        planId={initialPlan?.id}
        rejectedGenerations={currentRejectedGenerations}
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
