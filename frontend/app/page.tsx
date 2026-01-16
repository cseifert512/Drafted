'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Layers,
  RefreshCw,
  AlertCircle,
  Loader2,
  X,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Move,
  RotateCcw,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { DraftedGenerationForm, SeedEditPanel, SVGFloorPlanCard } from '@/components/drafted';
import { useDraftedGeneration } from '@/hooks/useDraftedGeneration';
import { useDevModeOptional } from '@/contexts/DevModeContext';
import { stageFloorPlan } from '@/lib/drafted-api';
import type { DraftedPlan, DraftedGenerationResult } from '@/lib/drafted-types';

export default function Home() {
  const {
    isAvailable,
    isLoading,
    generationState,
    roomTypes,
    plans,
    selectedPlan,
    error,
    progress,
    addPlans,
    updatePlan,
    selectPlan,
    removePlan,
    clearPlans,
    setGenerationState,
    setProgress,
    setError,
  } = useDraftedGeneration();

  const [editingPlan, setEditingPlan] = useState<DraftedPlan | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<DraftedPlan | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [autoRenderQueue, setAutoRenderQueue] = useState<Set<string>>(new Set());
  
  // Dev mode context for auto-render setting
  const devMode = useDevModeOptional();
  
  // Zoom and pan state for expanded SVG view
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const svgContainerRef = useRef<HTMLDivElement>(null);

  // Reset zoom/pan when modal opens
  useEffect(() => {
    if (expandedPlan) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [expandedPlan]);

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.min(Math.max(0.5, prev + delta), 5));
  }, []);

  // Handle pan start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) { // Left click only
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  // Handle pan move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  }, [isPanning, panStart]);

  // Handle pan end
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Reset zoom and pan
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const isGenerating = generationState === 'generating';
  const hasPlans = plans.length > 0;

  // Handle generation complete
  const handleGenerationComplete = (results: DraftedGenerationResult[]) => {
    addPlans(results);
  };

  // Handle generation progress
  const handleProgress = (completed: number, total: number) => {
    setProgress(completed, total);
  };

  // Handle edit complete
  const handleEditComplete = (result: DraftedGenerationResult) => {
    // Log comparison for debugging
    if (editingPlan) {
      console.log(`[DEBUG] Edit complete:
        Original plan: ${editingPlan.rooms.length} rooms, ${editingPlan.total_area_sqft} sqft
        New plan: ${result.rooms.length} rooms, ${result.total_area_sqft} sqft
        Prompt rooms requested: ${result.prompt_used.split('\n').filter(l => l.includes('=') && !l.toLowerCase().includes('area')).length}
      `);
    }
    addPlans([result]);
    setEditingPlan(null);
  };

  // Handle reset
  const handleReset = () => {
    clearPlans();
    setEditingPlan(null);
    setExpandedPlan(null);
  };

  // Handle rename
  const handleRename = async (planId: string, newName: string): Promise<boolean> => {
    // For now, just update locally (would need backend endpoint for persistence)
    return true;
  };

  // Handle plan update (e.g., after rendering)
  const handleUpdatePlan = useCallback((updatedPlan: DraftedPlan) => {
    updatePlan(updatedPlan);
  }, [updatePlan]);

  // Auto-render effect: when new plans are added and auto-render is enabled
  useEffect(() => {
    if (!devMode?.renderSettings?.autoRender) return;
    
    // Find plans that need auto-rendering (have SVG, no rendered image, not in queue)
    const plansToRender = plans.filter(
      p => p.svg && !p.rendered_image_base64 && !autoRenderQueue.has(p.id)
    );
    
    if (plansToRender.length === 0) return;
    
    // Add to queue to prevent double-rendering
    setAutoRenderQueue(prev => {
      const next = new Set(prev);
      plansToRender.forEach(p => next.add(p.id));
      return next;
    });
    
    // Auto-render each plan
    plansToRender.forEach(async (plan) => {
      try {
        console.log(`[Auto-render] Rendering plan ${plan.id}...`);
        const roomKeys = plan.rooms.map(r => r.canonical_key || r.room_type);
        const result = await stageFloorPlan(plan.svg!, roomKeys);
        
        if (result.success && result.staged_image_base64) {
          updatePlan({
            ...plan,
            rendered_image_base64: result.staged_image_base64,
            cropped_svg: result.cropped_svg || plan.svg, // Include cropped SVG for proper overlay alignment
          });
          console.log(`[Auto-render] Plan ${plan.id} rendered successfully`);
        } else {
          console.warn(`[Auto-render] Failed to render plan ${plan.id}:`, result.error);
        }
      } catch (e) {
        console.error(`[Auto-render] Error rendering plan ${plan.id}:`, e);
      }
    });
  }, [plans, devMode?.renderSettings?.autoRender, autoRenderQueue, updatePlan]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-drafted-cream flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-coral-500 animate-spin mx-auto mb-4" />
          <p className="text-drafted-gray">Loading Drafted...</p>
        </div>
      </div>
    );
  }

  // Not available state - only show if we also don't have room types
  if (!isAvailable && !isLoading && roomTypes.length === 0) {
    return (
      <div className="min-h-screen bg-drafted-cream">
        <Header />
        <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
          <div className="text-center max-w-md px-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-xl font-serif font-bold text-drafted-black mb-2">
              Drafted API Not Available
            </h2>
            <p className="text-drafted-gray mb-4">
              Make sure the backend is running and the <code className="px-1.5 py-0.5 bg-drafted-bg rounded text-sm">DRAFTED_API_ENDPOINT</code> environment variable is set.
            </p>
            <a
              href="/api/drafted/status"
              target="_blank"
              className="text-coral-500 hover:text-coral-600 text-sm"
            >
              Check API Status →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-drafted-cream">
      <Header />
      
      <div className="flex">
        {/* Collapsed Sidebar Tab */}
        <AnimatePresence>
          {sidebarCollapsed && (
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onClick={() => setSidebarCollapsed(false)}
              className="min-h-[calc(100vh-56px)] bg-drafted-cream border-r border-drafted-border hover:bg-coral-50 transition-colors flex flex-col items-center justify-center px-2 group"
              title="Show Design Panel"
            >
              <PanelLeftOpen className="w-4 h-4 text-drafted-gray group-hover:text-coral-500 transition-colors mb-2" />
              <span 
                className="text-xs font-medium text-drafted-gray group-hover:text-coral-500 transition-colors"
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
              >
                Design
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Left Sidebar - Generation Form */}
        <motion.aside 
          className="min-h-[calc(100vh-56px)] bg-drafted-cream border-r border-drafted-border flex flex-col"
          animate={{ width: sidebarCollapsed ? 0 : 384 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          style={{ overflow: 'hidden' }}
        >
          {/* Sidebar Header with Collapse Button */}
          <div className="w-96 flex items-center justify-end px-4 py-2 border-b border-drafted-border/50">
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-coral-50 transition-colors group"
              title="Hide Design Panel"
            >
              <span className="text-xs text-drafted-gray group-hover:text-coral-500 transition-colors">
                Hide
              </span>
              <PanelLeftClose className="w-4 h-4 text-drafted-gray group-hover:text-coral-500 transition-colors" />
            </button>
          </div>

          <div className="w-96 flex-1 overflow-y-auto p-4">
            <DraftedGenerationForm
              roomTypes={roomTypes}
              onGenerate={handleGenerationComplete}
              onProgress={handleProgress}
              isGenerating={isGenerating}
            />
          </div>

          {/* Progress Footer */}
          {isGenerating && progress.total > 0 && (
            <div className="w-96 p-4 border-t border-drafted-border bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-drafted-gray">
                  Generating...
                </span>
                <span className="text-sm text-coral-500 font-semibold">
                  {progress.completed}/{progress.total}
                </span>
              </div>
              <div className="h-2 bg-drafted-bg rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-coral-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${(progress.completed / progress.total) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}
        </motion.aside>

        {/* Main Content */}
        <main className="flex-1 min-h-[calc(100vh-56px)] bg-white">
          {/* Top Bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-drafted-border">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-serif font-bold text-drafted-black">
                Generated Floor Plans
              </h1>
              {hasPlans && (
                <span className="text-sm text-drafted-gray">
                  {plans.length} {plans.length === 1 ? 'plan' : 'plans'}
                </span>
              )}
            </div>

            {hasPlans && (
              <button
                onClick={handleReset}
                className="btn-drafted-outline flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Clear All
              </button>
            )}
          </div>

          {/* Error State */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mx-6 mt-4 p-4 bg-coral-50 border border-coral-200 rounded-drafted flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-coral-500" />
                  <p className="text-sm text-coral-700">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-coral-500 hover:text-coral-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Generation Progress - Center */}
          {isGenerating && !hasPlans && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24"
            >
              <div className="relative">
                <div className="w-20 h-20 border-4 border-drafted-border rounded-full" />
                <div className="absolute inset-0 w-20 h-20 border-4 border-coral-500 rounded-full border-t-transparent animate-spin" />
              </div>
              <p className="mt-6 text-drafted-gray font-serif font-semibold">
                Generating floor plans...
              </p>
              <p className="text-sm text-drafted-light mt-1">
                {progress.completed > 0 
                  ? `${progress.completed} of ${progress.total} complete`
                  : 'This may take a moment'
                }
              </p>
            </motion.div>
          )}

          {/* Empty State */}
          {!hasPlans && !isGenerating && (
            <div className="flex flex-col items-center justify-center py-24 px-6">
              <div className="w-20 h-20 bg-drafted-bg rounded-full flex items-center justify-center mb-4">
                <Layers className="w-10 h-10 text-drafted-muted" />
              </div>
              <h2 className="text-xl font-serif font-bold text-drafted-black mb-2">
                Design Your Floor Plan
              </h2>
              <p className="text-drafted-gray text-center max-w-md">
                Configure rooms in the sidebar and click Generate to create 
                diverse floor plan variations using Drafted's AI model.
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs text-drafted-light">
                {isAvailable ? (
                  <>
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span>Drafted API Connected</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 bg-amber-500 rounded-full" />
                    <span>API endpoint not configured - generation disabled</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Plans Grid */}
          {hasPlans && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                <AnimatePresence mode="popLayout">
                  {plans.map((plan, index) => (
                    <SVGFloorPlanCard
                      key={plan.id}
                      plan={plan}
                      index={index}
                      onEdit={setEditingPlan}
                      onSelect={setExpandedPlan}
                      onRename={handleRename}
                      onUpdatePlan={handleUpdatePlan}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Edit Panel */}
      <AnimatePresence>
        {editingPlan && (
          <SeedEditPanel
            plan={editingPlan}
            roomTypes={roomTypes}
            onEditComplete={handleEditComplete}
            onClose={() => setEditingPlan(null)}
          />
        )}
      </AnimatePresence>

      {/* Expanded SVG Modal */}
      <AnimatePresence>
        {expandedPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/70"
            onClick={() => setExpandedPlan(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-drafted-bg rounded-drafted-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-drafted-border flex items-center justify-between bg-white sticky top-0 z-10">
                <div>
                  <h3 className="font-serif font-bold text-drafted-black">
                    {expandedPlan.display_name || `Floor Plan`}
                  </h3>
                  <p className="text-sm text-drafted-gray">
                    Seed: {expandedPlan.seed} • {expandedPlan.total_area_sqft.toLocaleString()} sqft • {expandedPlan.rooms.length} rooms
                  </p>
                </div>
                <button
                  onClick={() => setExpandedPlan(null)}
                  className="w-10 h-10 flex items-center justify-center hover:bg-drafted-bg rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-drafted-gray" />
                </button>
              </div>

              {/* SVG Display - White Canvas with Zoom/Pan */}
              <div className="relative m-4">
                {/* Zoom Controls */}
                <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 bg-white/95 backdrop-blur-sm rounded-lg shadow-md p-1">
                  <button
                    onClick={() => setZoom(prev => Math.min(prev + 0.25, 5))}
                    className="w-8 h-8 flex items-center justify-center hover:bg-drafted-bg rounded transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4 text-drafted-gray" />
                  </button>
                  <button
                    onClick={() => setZoom(prev => Math.max(prev - 0.25, 0.5))}
                    className="w-8 h-8 flex items-center justify-center hover:bg-drafted-bg rounded transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4 text-drafted-gray" />
                  </button>
                  <div className="w-full h-px bg-drafted-border" />
                  <button
                    onClick={resetView}
                    className="w-8 h-8 flex items-center justify-center hover:bg-drafted-bg rounded transition-colors"
                    title="Reset View"
                  >
                    <RotateCcw className="w-4 h-4 text-drafted-gray" />
                  </button>
                </div>

                {/* Zoom level indicator */}
                <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-md px-3 py-1.5 text-xs font-medium text-drafted-gray">
                  {Math.round(zoom * 100)}%
                </div>

                {/* Pan hint */}
                {zoom > 1 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-black/70 text-white rounded-full px-3 py-1 text-xs flex items-center gap-1.5">
                    <Move className="w-3 h-3" />
                    Drag to pan
                  </div>
                )}

                {/* Canvas */}
                <div 
                  ref={svgContainerRef}
                  className="bg-white rounded-drafted shadow-sm overflow-hidden"
                  style={{ minHeight: '450px', cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {expandedPlan.svg ? (
                    <div 
                      className="w-full h-full flex items-center justify-center p-8 select-none"
                      style={{
                        transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                        transformOrigin: 'center center',
                        transition: isPanning ? 'none' : 'transform 0.1s ease-out',
                        minHeight: '450px',
                      }}
                      dangerouslySetInnerHTML={{ 
                        __html: expandedPlan.svg.replace(
                          /<svg([^>]*)>/,
                          '<svg$1 style="max-width: 100%; max-height: 450px; width: auto; height: auto; display: block; margin: auto; pointer-events: none;">'
                        )
                      }}
                    />
                  ) : expandedPlan.image_base64 ? (
                    <div
                      className="w-full h-full flex items-center justify-center p-8 select-none"
                      style={{
                        transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                        transformOrigin: 'center center',
                        transition: isPanning ? 'none' : 'transform 0.1s ease-out',
                        minHeight: '450px',
                      }}
                    >
                      <img
                        src={`data:image/jpeg;base64,${expandedPlan.image_base64}`}
                        alt="Floor Plan"
                        className="max-w-full max-h-[450px] object-contain pointer-events-none"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ minHeight: '450px' }}>
                      <p className="text-drafted-muted">No preview available</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Room List */}
              <div className="px-6 py-4 border-t border-drafted-border bg-white">
                <h4 className="text-sm font-medium text-drafted-gray mb-3">Rooms</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {expandedPlan.rooms.map((room, i) => (
                    <div
                      key={`${room.room_type}-${i}`}
                      className="px-3 py-2 bg-drafted-bg rounded-drafted"
                    >
                      <div className="text-sm font-medium text-drafted-black">
                        {room.display_name || room.room_type.replace(/_/g, ' ')}
                      </div>
                      <div className="text-xs text-drafted-gray">
                        {room.area_sqft.toFixed(0)} sqft
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 py-4 border-t border-drafted-border flex gap-3 bg-white">
                <button
                  onClick={() => {
                    setEditingPlan(expandedPlan);
                    setExpandedPlan(null);
                  }}
                  className="flex-1 btn-drafted-coral py-3"
                >
                  Edit This Plan
                </button>
                <button
                  onClick={() => {
                    if (!expandedPlan.svg) return;
                    const blob = new Blob([expandedPlan.svg], { type: 'image/svg+xml' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'floor-plan.svg';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex-1 btn-drafted-outline py-3"
                >
                  Download SVG
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
