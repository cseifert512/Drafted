'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, 
  AlertCircle, 
  ArrowLeft,
  Upload,
  Plus,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { FloorPlanEditor } from '@/components/editor';
import { 
  getDraftedRoomOptions, 
  generateDraftedPlan,
  checkDraftedAvailable,
} from '@/lib/drafted-api';
import type { DraftedPlan, RoomTypeDefinition, DraftedGenerationResult } from '@/lib/drafted-types';
import type { EditorRoom } from '@/lib/editor/editorTypes';

// Loading fallback for Suspense
function EditorLoading() {
  return (
    <div className="min-h-screen bg-drafted-cream flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-coral-500 animate-spin mx-auto mb-4" />
        <p className="text-drafted-gray">Loading Floor Plan Editor...</p>
      </div>
    </div>
  );
}

// Inner component that uses useSearchParams
function EditorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomTypeDefinition[]>([]);
  const [initialPlan, setInitialPlan] = useState<DraftedPlan | null>(null);
  const [isApiAvailable, setIsApiAvailable] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Load room types on mount
  useEffect(() => {
    async function loadData() {
      try {
        // Check API availability
        const status = await checkDraftedAvailable();
        setIsApiAvailable(status.available && status.endpoint_configured);
        
        // Load room types
        const options = await getDraftedRoomOptions();
        setRoomTypes(options.room_types);
        
        // Check for plan data in search params
        const planData = searchParams.get('plan');
        if (planData) {
          try {
            const plan = JSON.parse(decodeURIComponent(planData));
            setInitialPlan(plan);
          } catch (e) {
            console.error('Failed to parse plan data:', e);
          }
        }
        
        // Check localStorage for saved plan
        const savedPlan = localStorage.getItem('editor_plan');
        if (!initialPlan && savedPlan) {
          try {
            const parsed = JSON.parse(savedPlan);
            console.log('[Editor] Loaded plan from localStorage:', {
              id: parsed.id,
              hasSvg: !!parsed.svg,
              hasCroppedSvg: !!parsed.cropped_svg,
              hasRenderedImage: !!parsed.rendered_image_base64,
            });
            setInitialPlan(parsed);
          } catch (e) {
            console.error('Failed to parse saved plan:', e);
          }
        }
        
      } catch (err) {
        console.error('Failed to load editor data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load editor');
      } finally {
        setIsLoading(false);
      }
    }
    
    loadData();
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Handle save
  const handleSave = useCallback((svg: string, rooms: EditorRoom[]) => {
    const plan: DraftedPlan = {
      id: initialPlan?.id || `edited_${Date.now()}`,
      seed: initialPlan?.seed || 0,
      prompt: initialPlan?.prompt || '',
      svg,
      rooms: rooms.map(r => ({
        room_type: r.roomType,
        canonical_key: r.roomType,
        area_sqft: r.areaSqft,
        width_inches: r.widthInches,
        height_inches: r.heightInches,
        display_name: r.displayName,
      })),
      total_area_sqft: rooms.reduce((sum, r) => sum + r.areaSqft, 0),
      created_at: Date.now(),
    };
    
    // Save to localStorage
    localStorage.setItem('editor_plan', JSON.stringify(plan));
    
    // Could also save to backend here
    console.log('Plan saved:', plan);
  }, [initialPlan]);
  
  // Handle regeneration (for hybrid mode)
  const handleRegenerate = useCallback(async (prompt: string, seed: number): Promise<DraftedPlan> => {
    // Call the API with the modified prompt and original seed
    const result = await generateDraftedPlan({
      rooms: [], // Will be parsed from prompt
      seed,
      // The backend should accept a raw prompt for regeneration
    });
    
    // Convert result to DraftedPlan format
    const plan: DraftedPlan = {
      id: `regen_${Date.now()}`,
      seed: result.seed_used,
      prompt: result.prompt_used,
      svg: result.svg,
      rooms: result.rooms,
      total_area_sqft: result.total_area_sqft,
      created_at: Date.now(),
    };
    
    return plan;
  }, []);
  
  // Handle SVG import
  const handleImportSvg = useCallback((svgContent: string) => {
    const plan: DraftedPlan = {
      id: `imported_${Date.now()}`,
      seed: 0,
      prompt: '',
      svg: svgContent,
      rooms: [],
      total_area_sqft: 0,
      created_at: Date.now(),
    };
    
    setInitialPlan(plan);
    setShowImportModal(false);
  }, []);
  
  // Handle file upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleImportSvg(content);
    };
    reader.readAsText(file);
  }, [handleImportSvg]);
  
  // Loading state
  if (isLoading) {
    return <EditorLoading />;
  }
  
  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-drafted-cream">
        <Header />
        <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
          <div className="text-center max-w-md px-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-serif font-bold text-drafted-black mb-2">
              Failed to Load Editor
            </h2>
            <p className="text-drafted-gray mb-4">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="btn-drafted-coral"
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-drafted-cream flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-drafted-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="p-2 hover:bg-drafted-bg rounded-lg transition-colors"
            title="Back to Home"
          >
            <ArrowLeft className="w-5 h-5 text-drafted-gray" />
          </button>
          <div>
            <h1 className="font-serif font-bold text-drafted-black">Floor Plan Editor</h1>
            <p className="text-xs text-drafted-gray">
              {initialPlan ? 'Editing plan' : 'Create a new floor plan'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {!initialPlan && (
            <>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-drafted-bg rounded-lg transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>Import SVG</span>
              </button>
              <button
                onClick={() => {
                  // Create a blank plan to start fresh
                  const blankPlan: DraftedPlan = {
                    id: `new_${Date.now()}`,
                    seed: 0,
                    prompt: '',
                    svg: `<svg width="768" height="768" viewBox="0 0 768 768" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="768" height="768" fill="#fafafa"/></svg>`,
                    rooms: [],
                    total_area_sqft: 0,
                    created_at: Date.now(),
                  };
                  setInitialPlan(blankPlan);
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-coral-500 text-white rounded-lg hover:bg-coral-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>New Plan</span>
              </button>
            </>
          )}
          
          {!isApiAvailable && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Regeneration unavailable (API not connected)</span>
            </div>
          )}
        </div>
      </header>
      
      {/* Main Editor */}
      <div className="flex-1">
        {initialPlan ? (
          <FloorPlanEditor
            initialPlan={initialPlan}
            roomTypes={roomTypes}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md px-6">
              <div className="w-20 h-20 bg-drafted-bg rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="w-10 h-10 text-drafted-muted" />
              </div>
              <h2 className="text-xl font-serif font-bold text-drafted-black mb-2">
                Start Editing
              </h2>
              <p className="text-drafted-gray mb-6">
                Create a new floor plan from scratch, import an existing SVG, 
                or go back to generate plans with AI first.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    const blankPlan: DraftedPlan = {
                      id: `new_${Date.now()}`,
                      seed: 0,
                      prompt: '',
                      svg: `<svg width="768" height="768" viewBox="0 0 768 768" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="768" height="768" fill="#fafafa"/></svg>`,
                      rooms: [],
                      total_area_sqft: 0,
                      created_at: Date.now(),
                    };
                    setInitialPlan(blankPlan);
                  }}
                  className="btn-drafted-coral"
                >
                  Create New Plan
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="btn-drafted-outline"
                >
                  Import SVG File
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="text-sm text-drafted-gray hover:text-drafted-black transition-colors"
                >
                  Generate with AI instead →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Import Modal */}
      <AnimatePresence>
        {showImportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
            onClick={() => setShowImportModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-drafted-black mb-2">
                Import SVG Floor Plan
              </h2>
              <p className="text-sm text-drafted-gray mb-6">
                Upload an SVG file containing room polygons. Each room should be 
                a colored polygon element.
              </p>
              
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-drafted-border rounded-lg cursor-pointer hover:border-coral-400 hover:bg-coral-50/30 transition-colors">
                <Upload className="w-8 h-8 text-drafted-muted mb-2" />
                <span className="text-sm text-drafted-gray">
                  Click to select SVG file
                </span>
                <input
                  type="file"
                  accept=".svg,image/svg+xml"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              
              <div className="mt-4 flex justify-end gap-3">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-sm text-drafted-gray hover:text-drafted-black transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Main page component with Suspense boundary
export default function EditorPage() {
  return (
    <Suspense fallback={<EditorLoading />}>
      <EditorContent />
    </Suspense>
  );
}
