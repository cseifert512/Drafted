'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  DraftedPlan,
  DraftedGenerationResult,
  RoomTypeDefinition,
  DraftedGenerationState,
} from '@/lib/drafted-types';
import { getDraftedRoomOptions, checkDraftedAvailable } from '@/lib/drafted-api';

const STORAGE_KEY = 'drafted_plans';

// Helper to safely store plans, excluding large base64 data if needed
function savePlansToStorage(plans: DraftedPlan[]): void {
  try {
    // Try to save full plans first
    const fullData = JSON.stringify(plans);
    localStorage.setItem(STORAGE_KEY, fullData);
  } catch (e) {
    // If quota exceeded, try saving without base64 images
    console.warn('Storage quota exceeded, saving without images:', e);
    try {
      const lightPlans = plans.map(p => ({
        ...p,
        image_base64: undefined, // Remove large images to save space
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lightPlans));
    } catch (e2) {
      console.error('Failed to save plans even without images:', e2);
    }
  }
}

// Helper to load plans from storage
function loadPlansFromStorage(): DraftedPlan[] {
  try {
    // Try localStorage first (persistent)
    let saved = localStorage.getItem(STORAGE_KEY);
    
    // Fallback to sessionStorage for backwards compatibility
    if (!saved) {
      saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        // Migrate from sessionStorage to localStorage
        localStorage.setItem(STORAGE_KEY, saved);
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to restore plans:', e);
  }
  return [];
}

interface UseDraftedGenerationReturn {
  // State
  isAvailable: boolean;
  isLoading: boolean;
  generationState: DraftedGenerationState;
  roomTypes: RoomTypeDefinition[];
  plans: DraftedPlan[];
  selectedPlan: DraftedPlan | null;
  error: string | null;
  progress: { completed: number; total: number };

  // Actions
  loadRoomTypes: () => Promise<void>;
  addPlans: (results: DraftedGenerationResult[]) => void;
  updatePlan: (plan: DraftedPlan) => void;
  selectPlan: (planId: string | null) => void;
  removePlan: (planId: string) => void;
  clearPlans: () => void;
  setGenerationState: (state: DraftedGenerationState) => void;
  setProgress: (completed: number, total: number) => void;
  setError: (error: string | null) => void;
}

export function useDraftedGeneration(): UseDraftedGenerationReturn {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [generationState, setGenerationState] = useState<DraftedGenerationState>('idle');
  const [roomTypes, setRoomTypes] = useState<RoomTypeDefinition[]>([]);
  const [plans, setPlans] = useState<DraftedPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgressState] = useState({ completed: 0, total: 0 });

  // Track if initial load is complete to avoid double-saving
  const initialLoadComplete = useRef(false);

  // Check availability and load room types on mount
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        // Check if Drafted API is available
        const status = await checkDraftedAvailable();
        setIsAvailable(status.available || status.endpoint_configured);

        // Always try to load room types (they can be served even without runpod endpoint)
        try {
          const options = await getDraftedRoomOptions();
          setRoomTypes(options.room_types);
        } catch (e) {
          console.warn('Could not load room types from API:', e);
        }

        // Restore plans from storage
        const restoredPlans = loadPlansFromStorage();
        if (restoredPlans.length > 0) {
          console.log('[DEBUG] Restored', restoredPlans.length, 'plans from storage');
          setPlans(restoredPlans);
        }
      } catch (e) {
        console.error('Failed to initialize Drafted:', e);
        setError(e instanceof Error ? e.message : 'Failed to initialize');
      } finally {
        setIsLoading(false);
        initialLoadComplete.current = true;
      }
    }

    init();
  }, []);

  // Save plans to storage when they change
  useEffect(() => {
    // Don't save during initial load (we just loaded from storage)
    if (!initialLoadComplete.current) return;
    
    savePlansToStorage(plans);
  }, [plans]);

  // Load room types manually
  const loadRoomTypes = useCallback(async () => {
    try {
      const options = await getDraftedRoomOptions();
      setRoomTypes(options.room_types);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load room types');
    }
  }, []);

  // Add new plans from generation results
  const addPlans = useCallback((results: DraftedGenerationResult[]) => {
    console.log('[DEBUG] Received generation results:', results);
    
    const newPlans: DraftedPlan[] = results
      // Be more lenient - accept if we have any content (success flag, image, svg, or rooms)
      .filter((r) => {
        const hasContent = r.success || r.image_base64 || r.svg || (r.rooms && r.rooms.length > 0);
        if (!hasContent) {
          console.warn('[WARN] Skipping empty result:', r);
        }
        return hasContent;
      })
      .map((r) => ({
        id: r.plan_id || `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        seed: r.seed_used || 0,
        prompt: r.prompt_used || '',
        image_base64: r.image_base64,
        svg: r.svg,
        rooms: r.rooms || [],
        total_area_sqft: r.total_area_sqft || 0,
        display_name: undefined,
        created_at: Date.now(),
      }));

    console.log('[DEBUG] Adding plans:', newPlans.length);
    setPlans((prev) => [...prev, ...newPlans]);
    setGenerationState('complete');
  }, []);

  // Update a plan (e.g., after rendering)
  const updatePlan = useCallback((updatedPlan: DraftedPlan) => {
    setPlans((prev) => 
      prev.map((p) => p.id === updatedPlan.id ? updatedPlan : p)
    );
  }, []);

  // Select a plan
  const selectPlan = useCallback((planId: string | null) => {
    setSelectedPlanId(planId);
  }, []);

  // Remove a plan
  const removePlan = useCallback((planId: string) => {
    setPlans((prev) => prev.filter((p) => p.id !== planId));
    if (selectedPlanId === planId) {
      setSelectedPlanId(null);
    }
  }, [selectedPlanId]);

  // Clear all plans
  const clearPlans = useCallback(() => {
    setPlans([]);
    setSelectedPlanId(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY); // Clean up old sessionStorage too
    } catch (e) {
      console.error('Failed to clear storage:', e);
    }
  }, []);

  // Set progress
  const setProgress = useCallback((completed: number, total: number) => {
    setProgressState({ completed, total });
  }, []);

  // Get selected plan object
  const selectedPlan = selectedPlanId
    ? plans.find((p) => p.id === selectedPlanId) || null
    : null;

  return {
    isAvailable,
    isLoading,
    generationState,
    roomTypes,
    plans,
    selectedPlan,
    error,
    progress,
    loadRoomTypes,
    addPlans,
    updatePlan,
    selectPlan,
    removePlan,
    clearPlans,
    setGenerationState,
    setProgress,
    setError,
  };
}

