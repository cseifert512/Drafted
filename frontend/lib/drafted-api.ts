/**
 * API client for Drafted.ai floor plan generation
 */

import type {
  DraftedRoomOptions,
  DraftedValidation,
  DraftedGenerationRequest,
  DraftedGenerationResult,
  DraftedEditRequest,
  RoomSize,
} from './drafted-types';

// API URL configuration
function getApiUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!envUrl) return 'http://localhost:8000';
  if (envUrl.startsWith('http://') || envUrl.startsWith('https://')) {
    return envUrl;
  }
  return `https://${envUrl}`;
}

const BACKEND_URL = getApiUrl();

/**
 * Check if Drafted API is available
 */
export async function checkDraftedAvailable(): Promise<{ available: boolean; endpoint_configured: boolean }> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/drafted/status`);
    if (response.ok) {
      return await response.json();
    }
    return { available: false, endpoint_configured: false };
  } catch {
    return { available: false, endpoint_configured: false };
  }
}

/**
 * Get available room types and sizes
 */
export async function getDraftedRoomOptions(): Promise<DraftedRoomOptions> {
  const response = await fetch(`${BACKEND_URL}/api/drafted/options`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch room options');
  }
  
  return response.json();
}

/**
 * Validate a generation configuration
 */
export async function validateDraftedConfig(
  rooms: { room_type: string; size: RoomSize }[],
  targetSqft?: number
): Promise<DraftedValidation> {
  const response = await fetch(`${BACKEND_URL}/api/drafted/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rooms, target_sqft: targetSqft }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to validate configuration');
  }
  
  return response.json();
}

/**
 * Generate a floor plan
 */
export async function generateDraftedPlan(
  request: DraftedGenerationRequest
): Promise<DraftedGenerationResult> {
  console.log('Generating Drafted plan:', request);
  
  const response = await fetch(`${BACKEND_URL}/api/drafted/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Generation failed' }));
    throw new Error(error.detail || error.error || 'Failed to generate floor plan');
  }
  
  return response.json();
}

/**
 * Generate multiple floor plans with different seeds
 */
export async function generateDraftedBatch(
  request: DraftedGenerationRequest,
  count: number = 6,
  onProgress?: (completed: number, total: number, result?: DraftedGenerationResult) => void
): Promise<DraftedGenerationResult[]> {
  const results: DraftedGenerationResult[] = [];
  
  for (let i = 0; i < count; i++) {
    try {
      // Generate without seed for variety
      const result = await generateDraftedPlan({
        ...request,
        seed: undefined, // Random seed for each
      });
      
      results.push(result);
      onProgress?.(i + 1, count, result);
    } catch (error) {
      console.error(`Generation ${i + 1} failed:`, error);
      onProgress?.(i + 1, count, undefined);
    }
  }
  
  return results;
}

/**
 * Edit a floor plan using seed-based editing
 */
export async function editDraftedPlan(
  request: DraftedEditRequest
): Promise<DraftedGenerationResult> {
  console.log('Editing Drafted plan:', request);
  
  const response = await fetch(`${BACKEND_URL}/api/drafted/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      original: {
        plan_id: request.original_plan_id,
        seed_used: request.original_seed,
        prompt_used: request.original_prompt,
      },
      add_rooms: request.add_rooms,
      remove_rooms: request.remove_rooms,
      resize_rooms: request.resize_rooms,
      adjust_sqft: request.adjust_sqft,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Edit failed' }));
    throw new Error(error.detail || error.error || 'Failed to edit floor plan');
  }
  
  return response.json();
}

/**
 * Streaming generation with SSE progress updates
 */
export function generateDraftedStreaming(
  request: DraftedGenerationRequest,
  onProgress: (data: {
    phase: 'generating' | 'complete' | 'error';
    completed: number;
    total: number;
    result?: DraftedGenerationResult;
    error?: string;
  }) => void
): { cancel: () => void; promise: Promise<DraftedGenerationResult[]> } {
  const params = new URLSearchParams();
  
  // Encode rooms as JSON in query param
  params.set('rooms', JSON.stringify(request.rooms));
  if (request.target_sqft) params.set('target_sqft', request.target_sqft.toString());
  if (request.count) params.set('count', request.count.toString());
  
  const url = `${BACKEND_URL}/api/drafted/generate/stream?${params}`;
  const eventSource = new EventSource(url);
  const results: DraftedGenerationResult[] = [];
  let resolved = false;
  
  const promise = new Promise<DraftedGenerationResult[]>((resolve, reject) => {
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.result) {
          results.push(data.result);
        }
        
        onProgress({
          phase: data.phase,
          completed: data.completed,
          total: data.total,
          result: data.result,
          error: data.error,
        });
        
        if (data.phase === 'complete') {
          resolved = true;
          eventSource.close();
          resolve(results);
        }
        
        if (data.phase === 'error') {
          resolved = true;
          eventSource.close();
          reject(new Error(data.error || 'Generation failed'));
        }
      } catch (e) {
        console.error('Failed to parse SSE data:', e);
      }
    };
    
    eventSource.onerror = () => {
      if (!resolved) {
        resolved = true;
        eventSource.close();
        reject(new Error('Connection lost'));
      }
    };
  });
  
  return {
    cancel: () => {
      if (!resolved) {
        resolved = true;
        eventSource.close();
      }
    },
    promise,
  };
}

