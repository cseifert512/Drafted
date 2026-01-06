'use client';

import { useState, useCallback } from 'react';
import type { 
  GenerationRequest, 
  GenerationResponse,
  UploadedPlan,
  AnalysisResponse,
  GenerationState
} from '@/lib/types';
import { generateFloorPlans, analyzePlans, getPlanThumbnail } from '@/lib/api';

interface UseGenerationReturn {
  // State
  generationState: GenerationState;
  generationResult: GenerationResponse | null;
  plans: UploadedPlan[];
  thumbnails: Record<string, string>;
  error: string | null;
  
  // Derived state
  isGenerating: boolean;
  isAnalyzing: boolean;
  hasResults: boolean;
  analysisResult: AnalysisResponse | null;
  
  // Actions
  handleGenerate: (request: GenerationRequest) => Promise<void>;
  resetGeneration: () => void;
  loadThumbnail: (planId: string) => Promise<void>;
}

export function useGeneration(): UseGenerationReturn {
  const [generationState, setGenerationState] = useState<GenerationState>('idle');
  const [generationResult, setGenerationResult] = useState<GenerationResponse | null>(null);
  const [plans, setPlans] = useState<UploadedPlan[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);

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
        }));
      
      setPlans(newPlans);
      
      // Use thumbnails from response (already embedded)
      const newThumbnails: Record<string, string> = {};
      result.plans_info.forEach(p => {
        if (p.success && p.thumbnail) {
          newThumbnails[p.plan_id] = p.thumbnail;
        }
      });
      setThumbnails(newThumbnails);
      
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

  const resetGeneration = useCallback(() => {
    setGenerationState('idle');
    setGenerationResult(null);
    setPlans([]);
    setThumbnails({});
    setError(null);
    setAnalysisResult(null);
  }, []);

  return {
    generationState,
    generationResult,
    plans,
    thumbnails,
    error,
    isGenerating: generationState === 'generating',
    isAnalyzing: generationState === 'analyzing',
    hasResults: (generationState === 'complete' || generationState === 'analyzing') && plans.length > 0,
    analysisResult,
    handleGenerate,
    resetGeneration,
    loadThumbnail,
  };
}
