/**
 * Type definitions for door and window openings in floor plans
 */

// Opening types
export type OpeningType = 
  | 'interior_door' 
  | 'exterior_door' 
  | 'sliding_door' 
  | 'french_door' 
  | 'window' 
  | 'picture_window'
  | 'bay_window';

// Opening category for UI grouping
export type OpeningCategory = 'door' | 'window';

// Point type for coordinates
export interface Point {
  x: number;
  y: number;
}

// Wall segment extracted from SVG
export interface WallSegment {
  id: string;
  start: Point;
  end: Point;
  isExterior: boolean;
  adjacentRoomIds: [string, string | null]; // [room1, room2 or null for exterior]
  length: number; // in SVG units (1px = 2 inches)
}

// Opening placement specification
export interface OpeningPlacement {
  id: string;
  type: OpeningType;
  wallId: string;
  positionOnWall: number; // 0-1 along wall segment
  widthInches: number;
  swingDirection?: 'left' | 'right';
}

// Job status for background rendering
export type OpeningJobStatus = 'pending' | 'rendering' | 'blending' | 'complete' | 'failed';

// Opening job for tracking render progress
export interface OpeningJob {
  jobId: string;
  planId: string;
  status: OpeningJobStatus;
  opening: OpeningPlacement;
  previewOverlaySvg: string;
  renderedImageBase64?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

// Request to add an opening
export interface AddOpeningRequest {
  planId: string;
  svg: string;
  croppedSvg: string;
  renderedImageBase64: string;
  opening: Omit<OpeningPlacement, 'id'>; // ID will be generated server-side
  canonicalRoomKeys: string[];
}

// Response from adding an opening
export interface AddOpeningResponse {
  success: boolean;
  jobId: string;
  status: OpeningJobStatus;
  previewOverlaySvg: string;
  modifiedSvg: string;
  error?: string;
}

// Status poll response
export interface OpeningStatusResponse {
  jobId: string;
  status: OpeningJobStatus;
  renderedImageBase64?: string;
  rawPngBase64?: string;     // PNG sent to Gemini (for debug)
  geminiPrompt?: string;     // Prompt sent to Gemini (for debug)
  error?: string;
}

// Opening type definitions for UI
export interface OpeningTypeDefinition {
  type: OpeningType;
  category: OpeningCategory;
  displayName: string;
  description: string;
  defaultWidthInches: number;
  availableWidths: number[];
  requiresExteriorWall: boolean;
  hasSwingDirection: boolean;
  icon: string; // Lucide icon name
}

// Standard opening type definitions
export const OPENING_TYPES: OpeningTypeDefinition[] = [
  {
    type: 'interior_door',
    category: 'door',
    displayName: 'Interior Door',
    description: 'Standard swing door for interior walls',
    defaultWidthInches: 36,
    availableWidths: [30, 32, 36],
    requiresExteriorWall: false,
    hasSwingDirection: true,
    icon: 'DoorOpen',
  },
  {
    type: 'exterior_door',
    category: 'door',
    displayName: 'Exterior Door',
    description: 'Entry door for exterior walls',
    defaultWidthInches: 36,
    availableWidths: [32, 36, 42],
    requiresExteriorWall: true,
    hasSwingDirection: true,
    icon: 'DoorClosed',
  },
  {
    type: 'sliding_door',
    category: 'door',
    displayName: 'Sliding Door',
    description: 'Glass sliding door, typically to outdoor areas',
    defaultWidthInches: 72,
    availableWidths: [60, 72, 96],
    requiresExteriorWall: true,
    hasSwingDirection: false,
    icon: 'PanelLeftOpen',
  },
  {
    type: 'french_door',
    category: 'door',
    displayName: 'French Door',
    description: 'Double door with glass panels',
    defaultWidthInches: 60,
    availableWidths: [48, 60, 72],
    requiresExteriorWall: false,
    hasSwingDirection: true,
    icon: 'Columns2',
  },
  {
    type: 'window',
    category: 'window',
    displayName: 'Standard Window',
    description: 'Standard single or double-hung window',
    defaultWidthInches: 36,
    availableWidths: [24, 30, 36, 48],
    requiresExteriorWall: true,
    hasSwingDirection: false,
    icon: 'Square',
  },
  {
    type: 'picture_window',
    category: 'window',
    displayName: 'Picture Window',
    description: 'Large fixed window for views',
    defaultWidthInches: 60,
    availableWidths: [48, 60, 72, 96],
    requiresExteriorWall: true,
    hasSwingDirection: false,
    icon: 'Maximize2',
  },
  {
    type: 'bay_window',
    category: 'window',
    displayName: 'Bay Window',
    description: 'Projecting window with angled sides',
    defaultWidthInches: 72,
    availableWidths: [60, 72, 96],
    requiresExteriorWall: true,
    hasSwingDirection: false,
    icon: 'Hexagon',
  },
];

// Helper to get opening definition by type
export function getOpeningDefinition(type: OpeningType): OpeningTypeDefinition | undefined {
  return OPENING_TYPES.find(def => def.type === type);
}

// Helper to check if opening type affects lighting
export function affectsLighting(type: OpeningType): boolean {
  return type.includes('window') || type === 'sliding_door' || type === 'french_door';
}

// Helper to get category for opening type
export function getOpeningCategory(type: OpeningType): OpeningCategory {
  return type.includes('window') ? 'window' : 'door';
}

// SVG scale constant (1px = 2 inches in your system)
export const SVG_INCHES_PER_PIXEL = 2;

// Convert inches to SVG pixels
export function inchesToSvgPixels(inches: number): number {
  return inches / SVG_INCHES_PER_PIXEL;
}

// Convert SVG pixels to inches
export function svgPixelsToInches(pixels: number): number {
  return pixels * SVG_INCHES_PER_PIXEL;
}


