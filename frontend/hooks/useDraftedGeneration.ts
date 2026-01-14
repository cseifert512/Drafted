'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
  DraftedPlan,
  DraftedGenerationResult,
  RoomTypeDefinition,
  DraftedGenerationState,
} from '@/lib/drafted-types';
import { getDraftedRoomOptions, checkDraftedAvailable } from '@/lib/drafted-api';

const STORAGE_KEY = 'drafted_plans';

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

        // Restore plans from session storage
        try {
          const saved = sessionStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              setPlans(parsed);
            }
          }
        } catch (e) {
          console.error('Failed to restore plans:', e);
        }
      } catch (e) {
        console.error('Failed to initialize Drafted:', e);
        setError(e instanceof Error ? e.message : 'Failed to initialize');
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, []);

  // Save plans to session storage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
    } catch (e) {
      console.error('Failed to save plans:', e);
    }
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
      sessionStorage.removeItem(STORAGE_KEY);
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
    selectPlan,
    removePlan,
    clearPlans,
    setGenerationState,
    setProgress,
    setError,
  };
}

