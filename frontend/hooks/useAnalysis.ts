'use client';

import { useState, useCallback } from 'react';
import type { 
  UploadedPlan, 
  AnalysisResponse, 
  AnalysisState 
} from '@/lib/types';
import { 
  uploadPlans, 
  analyzePlans, 
  deletePlan, 
  deleteAllPlans,
  getPlanThumbnail 
} from '@/lib/api';

interface UseAnalysisReturn {
  // State
  plans: UploadedPlan[];
  thumbnails: Record<string, string>;
  analysisState: AnalysisState;
  analysisResult: AnalysisResponse | null;
  error: string | null;
  
  // Actions
  handleFilesSelected: (files: File[]) => Promise<void>;
  handleRemovePlan: (planId: string) => Promise<void>;
  handleClearAll: () => Promise<void>;
  handleAnalyze: () => Promise<void>;
  resetAnalysis: () => void;
}

export function useAnalysis(): UseAnalysisReturn {
  const [plans, setPlans] = useState<UploadedPlan[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load thumbnail for a plan
  const loadThumbnail = useCallback(async (planId: string) => {
    try {
      const thumb = await getPlanThumbnail(planId);
      setThumbnails(prev => ({ ...prev, [planId]: thumb }));
    } catch (e) {
      console.error('Failed to load thumbnail:', e);
    }
  }, []);

  // Handle file selection and upload
  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    
    setAnalysisState('uploading');
    setError(null);

    try {
      const response = await uploadPlans(files);
      
      // Create plan objects
      const newPlans: UploadedPlan[] = response.plan_ids.map((id, index) => ({
        id,
        filename: files[index]?.name || `Plan ${index + 1}`,
      }));

      setPlans(prev => [...prev, ...newPlans]);
      
      // Load thumbnails in background
      newPlans.forEach(plan => loadThumbnail(plan.id));
      
      setAnalysisState('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setAnalysisState('error');
    }
  }, [loadThumbnail]);

  // Remove a single plan
  const handleRemovePlan = useCallback(async (planId: string) => {
    try {
      await deletePlan(planId);
      setPlans(prev => prev.filter(p => p.id !== planId));
      setThumbnails(prev => {
        const { [planId]: _, ...rest } = prev;
        return rest;
      });
      
      // Clear analysis if plans change
      setAnalysisResult(null);
    } catch (e) {
      console.error('Failed to remove plan:', e);
    }
  }, []);

  // Clear all plans
  const handleClearAll = useCallback(async () => {
    try {
      await deleteAllPlans();
      setPlans([]);
      setThumbnails({});
      setAnalysisResult(null);
      setAnalysisState('idle');
    } catch (e) {
      console.error('Failed to clear plans:', e);
    }
  }, []);

  // Run analysis
  const handleAnalyze = useCallback(async () => {
    if (plans.length < 2) {
      setError('At least 2 floor plans are required for analysis');
      return;
    }

    setAnalysisState('analyzing');
    setError(null);

    try {
      const result = await analyzePlans();
      setAnalysisResult(result);
      setAnalysisState('complete');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
      setAnalysisState('error');
    }
  }, [plans]);

  // Reset analysis state
  const resetAnalysis = useCallback(() => {
    setAnalysisResult(null);
    setAnalysisState('idle');
    setError(null);
  }, []);

  return {
    plans,
    thumbnails,
    analysisState,
    analysisResult,
    error,
    handleFilesSelected,
    handleRemovePlan,
    handleClearAll,
    handleAnalyze,
    resetAnalysis,
  };
}





