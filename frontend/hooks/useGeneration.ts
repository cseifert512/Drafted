'use client';

import { useState, useCallback, useEffect } from 'react';
import type { 
  GenerationRequest, 
  GenerationResponse,
  UploadedPlan,
  AnalysisResponse,
  GenerationState,
  EditPlanResponse
} from '@/lib/types';
import { generateFloorPlans, analyzePlans, getPlanThumbnail, editPlan, renamePlan } from '@/lib/api';

const STORAGE_KEY = 'drafted_generation_state';

interface PersistedState {
  generationState: GenerationState;
  generationResult: GenerationResponse | null;
  plans: UploadedPlan[];
  thumbnails: Record<string, string>;
  stylizedThumbnails: Record<string, string>;
  analysisResult: AnalysisResponse | null;
}

interface UseGenerationReturn {
  // State
  generationState: GenerationState;
  generationResult: GenerationResponse | null;
  plans: UploadedPlan[];
  thumbnails: Record<string, string>;  // Colored thumbnails (for analysis)
  stylizedThumbnails: Record<string, string>;  // Stylized thumbnails (for display)
  error: string | null;
  
  // Derived state
  isGenerating: boolean;
  isAnalyzing: boolean;
  isEditing: boolean;
  hasResults: boolean;
  analysisResult: AnalysisResponse | null;
  
  // Actions
  handleGenerate: (request: GenerationRequest) => Promise<void>;
  handleEditPlan: (planId: string, instruction: string) => Promise<EditPlanResponse | null>;
  handleRenamePlan: (planId: string, newName: string) => Promise<boolean>;
  resetGeneration: () => void;
  loadThumbnail: (planId: string) => Promise<void>;
}

export function useGeneration(): UseGenerationReturn {
  const [generationState, setGenerationState] = useState<GenerationState>('idle');
  const [generationResult, setGenerationResult] = useState<GenerationResponse | null>(null);
  const [plans, setPlans] = useState<UploadedPlan[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [stylizedThumbnails, setStylizedThumbnails] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Restore state from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: PersistedState = JSON.parse(saved);
        // Only restore if we had completed generation
        if (parsed.generationState === 'complete' && parsed.plans.length > 0) {
          setGenerationState(parsed.generationState);
          setGenerationResult(parsed.generationResult);
          setPlans(parsed.plans);
          setThumbnails(parsed.thumbnails);
          setStylizedThumbnails(parsed.stylizedThumbnails);
          setAnalysisResult(parsed.analysisResult);
        }
      }
    } catch (e) {
      console.error('Failed to restore generation state:', e);
    }
    setIsHydrated(true);
  }, []);

  // Save state to sessionStorage when it changes
  useEffect(() => {
    if (!isHydrated) return; // Don't save during hydration
    
    try {
      const state: PersistedState = {
        generationState,
        generationResult,
        plans,
        thumbnails,
        stylizedThumbnails,
        analysisResult,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save generation state:', e);
    }
  }, [isHydrated, generationState, generationResult, plans, thumbnails, stylizedThumbnails, analysisResult]);

  const loadThumbnail = useCallback(async (planId: string) => {
    if (thumbnails[planId]) return;
    
    try {
      const thumb = await getPlanThumbnail(planId);
      setThumbnails(prev => ({ ...prev, [planId]: thumb }));
    } catch (e) {
      console.error('Failed to load thumbnail:', e);
    }
  }, [thumbnails]);

  const handleGenerate = useCallback(async (request: GenerationRequest) => {
    setGenerationState('generating');
    setError(null);
    setGenerationResult(null);
    setPlans([]);
    setThumbnails({});
    setStylizedThumbnails({});
    setAnalysisResult(null);

    try {
      // PHASE 1: Generate plans (skip analysis for faster response)
      const result = await generateFloorPlans({
        ...request,
        skip_analysis: true  // Skip analysis during generation
      });
      
      setGenerationResult(result);
      
      // Create plan objects from successful generations
      const newPlans: UploadedPlan[] = result.plans_info
        .filter(p => p.success)
        .map(p => ({
          id: p.plan_id,
          filename: `${p.variation_type}_${p.plan_id}.png`,
          thumbnail: p.thumbnail,
          stylized_thumbnail: p.stylized_thumbnail,
          display_name: p.display_name,
        }));
      
      setPlans(newPlans);
      
      // Use thumbnails from response (already embedded)
      const newThumbnails: Record<string, string> = {};
      const newStylizedThumbnails: Record<string, string> = {};
      result.plans_info.forEach(p => {
        if (p.success) {
          if (p.thumbnail) {
            newThumbnails[p.plan_id] = p.thumbnail;
          }
          if (p.stylized_thumbnail) {
            newStylizedThumbnails[p.plan_id] = p.stylized_thumbnail;
          }
        }
      });
      setThumbnails(newThumbnails);
      setStylizedThumbnails(newStylizedThumbnails);
      
      // PHASE 2: Run analysis in background if we have enough plans
      if (result.plan_ids.length >= 2) {
        setGenerationState('analyzing');
        
        try {
          console.log('Starting analysis on plans:', result.plan_ids);
          const analysis = await analyzePlans(result.plan_ids);
          setAnalysisResult(analysis);
          console.log('Analysis complete:', analysis);
        } catch (analysisError) {
          console.error('Analysis failed:', analysisError);
          // Don't set error state - generation was still successful
        }
      }
      
      setGenerationState('complete');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
      setGenerationState('error');
    }
  }, []);

  const handleEditPlan = useCallback(async (planId: string, instruction: string): Promise<EditPlanResponse | null> => {
    setIsEditing(true);
    
    try {
      const result = await editPlan(planId, instruction);
      
      if (result.success) {
        // Add the new edited plan to the list
        const newPlan: UploadedPlan = {
          id: result.new_plan_id,
          filename: `edited_${result.new_plan_id}.png`,
          thumbnail: result.thumbnail,
          stylized_thumbnail: result.stylized_thumbnail,
          display_name: result.display_name,
        };
        
        setPlans(prev => [...prev, newPlan]);
        
        // Add thumbnails
        if (result.thumbnail) {
          setThumbnails(prev => ({ ...prev, [result.new_plan_id]: result.thumbnail! }));
        }
        if (result.stylized_thumbnail) {
          setStylizedThumbnails(prev => ({ ...prev, [result.new_plan_id]: result.stylized_thumbnail! }));
        }
      }
      
      setIsEditing(false);
      return result;
    } catch (e) {
      console.error('Edit failed:', e);
      setIsEditing(false);
      return null;
    }
  }, []);

  const handleRenamePlan = useCallback(async (planId: string, newName: string): Promise<boolean> => {
    try {
      const result = await renamePlan(planId, newName);
      
      if (result.success) {
        // Update the plan's display_name in state
        setPlans(prev => prev.map(p => 
          p.id === planId ? { ...p, display_name: newName } : p
        ));
        return true;
      }
      return false;
    } catch (e) {
      console.error('Rename failed:', e);
      return false;
    }
  }, []);

  const resetGeneration = useCallback(() => {
    setGenerationState('idle');
    setGenerationResult(null);
    setPlans([]);
    setThumbnails({});
    setStylizedThumbnails({});
    setError(null);
    setAnalysisResult(null);
    // Clear persisted state
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear generation state:', e);
    }
  }, []);

  return {
    generationState,
    generationResult,
    plans,
    thumbnails,
    stylizedThumbnails,
    error,
    isGenerating: generationState === 'generating',
    isAnalyzing: generationState === 'analyzing',
    isEditing,
    hasResults: (generationState === 'complete' || generationState === 'analyzing') && plans.length > 0,
    analysisResult,
    handleGenerate,
    handleEditPlan,
    handleRenamePlan,
    resetGeneration,
    loadThumbnail,
  };
}
