/**
 * API client for the Floor Plan Diversity Analyzer backend
 */

import type { 
  AnalysisResponse, 
  UploadResponse, 
  UploadedPlan,
  GenerationRequest,
  GenerationResponse,
  GenerationOptions,
  EditPlanRequest,
  EditPlanResponse,
  RenamePlanResponse,
} from './types';

// API URL configuration
// In production: use NEXT_PUBLIC_API_URL (e.g., https://drafted-diversity-api.onrender.com)
// In development: use localhost directly to avoid Next.js proxy timeout issues
function getApiUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!envUrl) return '';
  // Add https:// if not present (Render's fromService gives just the hostname)
  if (envUrl.startsWith('http://') || envUrl.startsWith('https://')) {
    return envUrl;
  }
  return `https://${envUrl}`;
}

const API_BASE = getApiUrl();
const BACKEND_DIRECT = getApiUrl() || 'http://localhost:8000';

/**
 * Upload floor plan images to the backend
 */
export async function uploadPlans(files: File[]): Promise<UploadResponse> {
  const formData = new FormData();
  
  files.forEach((file) => {
    formData.append('files', file);
  });

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || 'Failed to upload plans');
  }

  return response.json();
}

/**
 * Get list of uploaded plans
 */
export async function getPlans(): Promise<{ plans: UploadedPlan[]; count: number }> {
  const response = await fetch(`${API_BASE}/api/plans`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch plans');
  }

  return response.json();
}

/**
 * Delete a specific plan
 */
export async function deletePlan(planId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/plans/${planId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete plan');
  }
}

/**
 * Delete all plans
 */
export async function deleteAllPlans(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/plans`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete plans');
  }
}

/**
 * Run diversity analysis on uploaded plans
 * Uses direct backend URL to avoid Next.js proxy issues
 */
export async function analyzePlans(planIds?: string[]): Promise<AnalysisResponse> {
  console.log('Analyzing plans:', planIds);
  const response = await fetch(`${BACKEND_DIRECT}/api/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ plan_ids: planIds || [] }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Analysis failed' }));
    throw new Error(error.detail || 'Failed to analyze plans');
  }

  return response.json();
}

/**
 * Get thumbnail for a specific plan
 */
export async function getPlanThumbnail(planId: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/plan/${planId}/thumbnail`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch thumbnail');
  }

  const data = await response.json();
  return data.thumbnail;
}

/**
 * Check API health
 */
export async function checkHealth(): Promise<{ status: string; plans_in_memory: number }> {
  const response = await fetch(`${API_BASE}/api/health`);
  
  if (!response.ok) {
    throw new Error('API is not healthy');
  }

  return response.json();
}

// =============================================================================
// GENERATION API
// =============================================================================

/**
 * Get available generation options
 */
export async function getGenerationOptions(): Promise<GenerationOptions> {
  const response = await fetch(`${API_BASE}/api/generate/options`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch generation options');
  }

  return response.json();
}

/**
 * Generate floor plans using Gemini AI
 * Uses direct backend URL to avoid Next.js proxy timeout for long-running requests
 */
export async function generateFloorPlans(request: GenerationRequest): Promise<GenerationResponse> {
  console.log('Generating floor plans with request:', request);
  console.log('Using direct backend URL:', BACKEND_DIRECT);
  
  try {
    const response = await fetch(`${BACKEND_DIRECT}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Generation error response:', errorText);
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { detail: errorText || 'Generation failed' };
      }
      throw new Error(error.detail || 'Failed to generate floor plans');
    }

    const data = await response.json();
    console.log('Generation successful:', data);
    return data;
  } catch (err) {
    console.error('Fetch error:', err);
    throw err;
  }
}

/**
 * Generate a single floor plan
 */
export async function generateSinglePlan(
  bedrooms: number,
  bathrooms: number,
  sqft: number,
  style: string,
  variationIndex: number
): Promise<{ success: boolean; plan_id: string; thumbnail: string }> {
  const params = new URLSearchParams({
    bedrooms: bedrooms.toString(),
    bathrooms: bathrooms.toString(),
    sqft: sqft.toString(),
    style,
    variation_index: variationIndex.toString(),
  });

  const response = await fetch(`${API_BASE}/api/generate/single?${params}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Generation failed' }));
    throw new Error(error.detail || 'Failed to generate floor plan');
  }

  return response.json();
}

// =============================================================================
// EDIT AND RENAME API
// =============================================================================

/**
 * Edit a floor plan using AI image-to-image
 * Creates a new plan with the requested modifications
 */
export async function editPlan(planId: string, instruction: string): Promise<EditPlanResponse> {
  console.log('Editing plan:', planId, 'with instruction:', instruction);
  
  const response = await fetch(`${BACKEND_DIRECT}/api/plan/${planId}/edit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ instruction }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Edit failed' }));
    throw new Error(error.detail || 'Failed to edit plan');
  }

  return response.json();
}

/**
 * Rename a floor plan
 */
export async function renamePlan(planId: string, newName: string): Promise<RenamePlanResponse> {
  const response = await fetch(`${BACKEND_DIRECT}/api/plan/${planId}/rename`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newName }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Rename failed' }));
    throw new Error(error.detail || 'Failed to rename plan');
  }

  return response.json();
}

/**
 * Get the stylized (display) version of a plan
 */
export async function getStylizedThumbnail(planId: string): Promise<{
  plan_id: string;
  display_name?: string;
  stylized: string;
  has_stylized: boolean;
}> {
  const response = await fetch(`${BACKEND_DIRECT}/api/plan/${planId}/stylized`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch stylized thumbnail');
  }

  return response.json();
}

