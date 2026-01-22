/**
 * TypeScript types for Drafted.ai floor plan generation
 */

import type { OpeningPlacement } from './editor/openingTypes';
export type { OpeningPlacement };

// Room size options
export type RoomSize = 'S' | 'M' | 'L' | 'XL';

// Room specification for generation
export interface RoomSpec {
  room_type: string;
  size: RoomSize;
  id: string; // Unique ID for React keys
}

// Size definition from rooms.json
export interface SizeDefinition {
  key: RoomSize;
  user_name: string;
  description: string;
  sqft_range: [number, number];
  prompt_name?: string;
}

// Room type definition
export interface RoomTypeDefinition {
  key: string;
  display: string;
  icon?: string;
  sizes: SizeDefinition[];
  colors: {
    training_hex?: string;
    plan_hex?: string;
    ui_hex?: string;
    prompt_color_name?: string;
  };
  is_heated: boolean;
  priority?: number;
}

// Room options response from API
export interface DraftedRoomOptions {
  room_types: RoomTypeDefinition[];
  size_labels: Record<RoomSize, string>;
}

// Validation response
export interface DraftedValidation {
  valid: boolean;
  token_count: number;
  token_limit: number;
  estimated_sqft: number;
  warnings: string[];
  prompt_preview: string;
}

// Generated room data from response
export interface GeneratedRoom {
  room_type: string;
  canonical_key: string;
  area_sqft: number;
  width_inches: number;
  height_inches: number;
  display_name?: string;
}

// Generation result
export interface DraftedGenerationResult {
  success: boolean;
  plan_id: string;
  error?: string;
  seed_used: number;
  prompt_used: string;
  elapsed_seconds: number;
  total_area_sqft: number;
  image_base64?: string;
  image_mime?: string;
  svg?: string;
  svg_parsed?: {
    width: number;
    height: number;
    viewbox: [number, number, number, number];
  };
  rooms: GeneratedRoom[];
}

// Generation request
export interface DraftedGenerationRequest {
  rooms: { room_type: string; size: RoomSize }[];
  target_sqft?: number;
  num_steps?: number;
  guidance_scale?: number;
  seed?: number;
  count?: number;
}

// Edit request (seed-based)
export interface DraftedEditRequest {
  original_plan_id: string;
  original_seed: number;
  original_prompt: string;
  add_rooms?: { room_type: string; size: RoomSize }[];
  remove_rooms?: string[];
  resize_rooms?: Record<string, RoomSize>;
  adjust_sqft?: number;
}

// Plan with edit history
export interface DraftedPlan {
  id: string;
  seed: number;
  prompt: string;
  image_base64?: string;
  svg?: string;
  // Cropped SVG with viewBox matching the rendered image (for overlay alignment)
  cropped_svg?: string;
  rooms: GeneratedRoom[];
  total_area_sqft: number;
  display_name?: string;
  parent_id?: string; // If this was edited from another plan
  edit_instruction?: string;
  created_at: number;
  // Rendered (staged) image from Gemini
  rendered_image_base64?: string;
  is_rendering?: boolean;
  // Debug data: PNG sent to Gemini and full prompt used
  raw_png_base64?: string;
  gemini_prompt?: string;
}

// Edit history entry
export interface EditHistoryEntry {
  plan_id: string;
  action: 'add_room' | 'remove_room' | 'resize_room' | 'adjust_sqft' | 'custom';
  description: string;
  timestamp: number;
}

// Editor edit state for undo/redo history
// Bundles all state that changes together during an opening edit
export interface EditorEditState {
  renderedImage: string;
  svg: string;
  openings: OpeningPlacement[];
}

// Generation state
export type DraftedGenerationState = 
  | 'idle' 
  | 'validating'
  | 'generating' 
  | 'complete' 
  | 'error';

// Room categories for UI grouping
export const ROOM_CATEGORIES = {
  primary: ['primary_bedroom', 'primary_bathroom', 'primary_closet'],
  bedrooms: ['bedroom'],
  bathrooms: ['bathroom'],
  living: ['living', 'family_room', 'den', 'sunroom'],
  dining: ['dining', 'nook'],
  kitchen: ['kitchen', 'pantry', 'bar'],
  utility: ['laundry', 'mudroom', 'storage', 'garage'],
  outdoor: ['outdoor_living', 'front_porch', 'pool'],
  flex: ['office', 'rec_room', 'theater', 'gym', 'foyer'],
} as const;

export type RoomCategory = keyof typeof ROOM_CATEGORIES;

// Helper to get category for a room type
export function getRoomCategory(roomType: string): RoomCategory | null {
  for (const [category, types] of Object.entries(ROOM_CATEGORIES)) {
    if (types.includes(roomType as any)) {
      return category as RoomCategory;
    }
  }
  return null;
}

// Size labels
export const SIZE_LABELS: Record<RoomSize, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Extra Large',
};

// Size colors for UI
export const SIZE_COLORS: Record<RoomSize, string> = {
  S: '#E5E7EB',
  M: '#93C5FD',
  L: '#6EE7B7',
  XL: '#FCD34D',
};

// Re-export opening types for convenience
export type {
  OpeningType,
  OpeningCategory,
  WallSegment,
  OpeningPlacement,
  OpeningJob,
  OpeningJobStatus,
  AddOpeningRequest,
  AddOpeningResponse,
  OpeningStatusResponse,
  OpeningTypeDefinition,
} from './editor/openingTypes';

export {
  OPENING_TYPES,
  getOpeningDefinition,
  affectsLighting,
  getOpeningCategory,
  SVG_INCHES_PER_PIXEL,
  inchesToSvgPixels,
  svgPixelsToInches,
} from './editor/openingTypes';

