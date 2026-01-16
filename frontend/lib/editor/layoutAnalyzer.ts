/**
 * Layout Analyzer for Hybrid Mode
 * Analyzes current room layout and generates a prompt for regeneration
 */

import type { EditorRoom, RoomPromptInfo } from './editorTypes';
import type { RoomSize, RoomTypeDefinition } from '../drafted-types';
import { calculatePolygonArea, pixelsToSqft } from './editorUtils';

// ============================================================================
// Room Priority Order (from editing.md)
// ============================================================================

const ROOM_PRIORITY: Record<string, number> = {
  primary_bedroom: 0,
  primary_bathroom: 1,
  primary_closet: 2,
  bedroom: 3,
  bathroom: 4,
  bar: 5,
  closet: 6,
  den: 7,
  dining: 8,
  family_room: 9,
  foyer: 10,
  front_porch: 11,
  garage: 12,
  gym: 13,
  kitchen: 14,
  laundry: 15,
  living: 16,
  mudroom: 17,
  nook: 18,
  office: 19,
  outdoor_living: 20,
  pantry: 21,
  pool: 22,
  rec_room: 23,
  storage: 24,
  sunroom: 25,
  theater: 26,
};

// ============================================================================
// Prompt Name Mappings (from rooms.json)
// These map size -> prompt_name for each room type
// ============================================================================

const PROMPT_NAMES: Record<string, Record<RoomSize, string>> = {
  primary_bedroom: { S: 'intimate', M: 'retreat', L: 'suite', XL: 'presidential' },
  primary_bathroom: { S: 'ensuite', M: 'spa', L: 'oasis', XL: 'sanctuary' },
  primary_closet: { S: 'petite', M: 'gallery', L: 'showroom', XL: 'atelier' },
  bedroom: { S: 'cozy', M: 'standard', L: 'spacious', XL: 'grand' },
  bathroom: { S: 'powder', M: 'full', L: 'comfort', XL: 'luxe' },
  closet: { S: 'reach-in', M: 'dressing', L: 'wardrobe', XL: 'boutique' },
  kitchen: { S: 'compact', M: 'galley', L: 'island', XL: "chef's" },
  dining: { S: 'breakfast', M: 'everyday', L: 'formal', XL: 'banquet' },
  living: { S: 'snug', M: 'lounge', L: 'great', XL: 'pavilion' },
  family_room: { S: 'hearth', M: 'gathering', L: 'commons', XL: 'lodge' },
  den: { S: 'hideaway', M: 'hollow', L: 'parlor', XL: 'retreat' },
  office: { S: 'study', M: 'workroom', L: 'atelier', XL: 'library' },
  garage: { S: 'bay', M: 'tandem', L: 'workshop', XL: 'motor' },
  laundry: { S: 'pocket', M: 'hatch', L: 'utility', XL: 'washhouse' },
  mudroom: { S: 'drop', M: 'bench', L: 'lockers', XL: 'gear' },
  pantry: { S: 'shelf', M: 'larder', L: 'scullery', XL: 'provisions' },
  foyer: { S: 'threshold', M: 'vestibule', L: 'passage', XL: 'rotunda' },
  nook: { S: 'café', M: 'booth', L: 'hearth', XL: 'alcove' },
  bar: { S: 'niche', M: 'wet', L: 'cellar', XL: 'speakeasy' },
  sunroom: { S: 'garden', M: 'solarium', L: 'atrium', XL: 'orangery' },
  rec_room: { S: 'play', M: 'game', L: 'club', XL: 'arena' },
  gym: { S: 'corner', M: 'studio', L: 'fitness', XL: 'athletic' },
  theater: { S: 'media', M: 'screening', L: 'cinema', XL: 'premiere' },
  storage: { S: 'cubby', M: 'locker', L: 'storeroom', XL: 'vault' },
  outdoor_living: { S: 'patio', M: 'terrace', L: 'courtyard', XL: 'pergola' },
  front_porch: { S: 'stoop', M: 'verandah', L: 'wraparound', XL: 'portico' },
  pool: { S: 'plunge', M: 'lap', L: 'resort', XL: 'lagoon' },
};

// ============================================================================
// Size Ranges by Room Type (from rooms.json)
// ============================================================================

interface SizeRange {
  size: RoomSize;
  min: number;
  max: number;
}

const SIZE_RANGES: Record<string, SizeRange[]> = {
  primary_bedroom: [
    { size: 'S', min: 106, max: 185 },
    { size: 'M', min: 185, max: 264 },
    { size: 'L', min: 264, max: 343 },
    { size: 'XL', min: 343, max: 422 },
  ],
  primary_bathroom: [
    { size: 'S', min: 13, max: 63 },
    { size: 'M', min: 63, max: 112 },
    { size: 'L', min: 112, max: 162 },
    { size: 'XL', min: 162, max: 211 },
  ],
  primary_closet: [
    { size: 'S', min: 9, max: 44 },
    { size: 'M', min: 44, max: 79 },
    { size: 'L', min: 79, max: 113 },
    { size: 'XL', min: 113, max: 148 },
  ],
  bedroom: [
    { size: 'S', min: 80, max: 128 },
    { size: 'M', min: 128, max: 175.5 },
    { size: 'L', min: 175.5, max: 223 },
    { size: 'XL', min: 223, max: 270 },
  ],
  bathroom: [
    { size: 'S', min: 40, max: 45 },
    { size: 'M', min: 45, max: 76.5 },
    { size: 'L', min: 76.5, max: 108 },
    { size: 'XL', min: 108, max: 140 },
  ],
  kitchen: [
    { size: 'S', min: 64, max: 147 },
    { size: 'M', min: 147, max: 230 },
    { size: 'L', min: 230, max: 313 },
    { size: 'XL', min: 313, max: 396 },
  ],
  living: [
    { size: 'S', min: 109, max: 242 },
    { size: 'M', min: 242, max: 375 },
    { size: 'L', min: 375, max: 508 },
    { size: 'XL', min: 508, max: 641 },
  ],
  dining: [
    { size: 'S', min: 60, max: 130 },
    { size: 'M', min: 130, max: 204 },
    { size: 'L', min: 204, max: 278 },
    { size: 'XL', min: 278, max: 352 },
  ],
  garage: [
    { size: 'S', min: 240, max: 248 },
    { size: 'M', min: 248, max: 495 },
    { size: 'L', min: 495, max: 742 },
    { size: 'XL', min: 742, max: 989 },
  ],
  // Add more as needed...
};

// Default size ranges for unknown room types
const DEFAULT_SIZE_RANGES: SizeRange[] = [
  { size: 'S', min: 0, max: 100 },
  { size: 'M', min: 100, max: 200 },
  { size: 'L', min: 200, max: 350 },
  { size: 'XL', min: 350, max: 1000 },
];

// ============================================================================
// Prompt Key Mappings
// ============================================================================

const PROMPT_KEYS: Record<string, string> = {
  primary_bedroom: 'primary bed',
  primary_bathroom: 'primary bath',
  primary_closet: 'primary closet',
  bedroom: 'bed + closet', // Note: bedroom includes closet in prompt
  bathroom: 'bath',
  kitchen: 'kitchen',
  dining: 'dining',
  living: 'living',
  family_room: 'family room',
  den: 'den',
  office: 'office',
  garage: 'garage',
  laundry: 'laundry',
  mudroom: 'mudroom',
  pantry: 'pantry',
  foyer: 'foyer',
  nook: 'nook',
  bar: 'bar',
  sunroom: 'sunroom',
  rec_room: 'rec room',
  gym: 'gym',
  theater: 'theater',
  storage: 'storage',
  outdoor_living: 'outdoor living',
  front_porch: 'front porch',
  pool: 'pool',
  closet: 'closet',
};

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Analyze rooms and estimate their size category
 */
export function analyzeRoomSize(room: EditorRoom): RoomSize {
  const areaSqft = room.areaSqft;
  const ranges = SIZE_RANGES[room.roomType] || DEFAULT_SIZE_RANGES;
  
  for (const range of ranges) {
    if (areaSqft >= range.min && areaSqft < range.max) {
      return range.size;
    }
  }
  
  // If below minimum, return S; if above maximum, return XL
  if (areaSqft < ranges[0].min) return 'S';
  return 'XL';
}

/**
 * Get prompt key for a room type
 */
export function getPromptKey(roomType: string): string {
  return PROMPT_KEYS[roomType] || roomType.replace(/_/g, ' ');
}

/**
 * Get prompt size name for a room type and size
 */
export function getPromptSizeName(roomType: string, size: RoomSize): string {
  const names = PROMPT_NAMES[roomType];
  if (names && names[size]) {
    return names[size];
  }
  // Default names if not in mapping
  const defaults: Record<RoomSize, string> = {
    S: 'compact',
    M: 'standard',
    L: 'spacious',
    XL: 'grand',
  };
  return defaults[size];
}

/**
 * Analyze all rooms and get prompt information
 */
export function analyzeLayout(rooms: EditorRoom[]): RoomPromptInfo[] {
  return rooms.map(room => {
    const estimatedSize = analyzeRoomSize(room);
    return {
      roomType: room.roomType,
      estimatedSize,
      promptKey: getPromptKey(room.roomType),
      promptSizeName: getPromptSizeName(room.roomType, estimatedSize),
      areaSqft: room.areaSqft,
    };
  });
}

/**
 * Sort rooms by priority for prompt generation
 */
export function sortRoomsByPriority(rooms: RoomPromptInfo[]): RoomPromptInfo[] {
  return [...rooms].sort((a, b) => {
    const priorityA = ROOM_PRIORITY[a.roomType] ?? 99;
    const priorityB = ROOM_PRIORITY[b.roomType] ?? 99;
    return priorityA - priorityB;
  });
}

/**
 * Calculate total area from rooms (with 15% markup for walls/hallways)
 */
export function calculateTotalArea(rooms: EditorRoom[], markup: number = 1.15): number {
  const rawTotal = rooms.reduce((sum, room) => sum + room.areaSqft, 0);
  return Math.round(rawTotal * markup);
}

/**
 * Build a complete prompt from the current room layout
 */
export function buildPromptFromLayout(rooms: EditorRoom[]): string {
  if (rooms.length === 0) {
    return 'area = 0 sqft';
  }
  
  // Analyze and sort rooms
  const analyzed = analyzeLayout(rooms);
  const sorted = sortRoomsByPriority(analyzed);
  
  // Calculate total area
  const totalArea = calculateTotalArea(rooms);
  
  // Build prompt lines
  const lines: string[] = [
    `area = ${totalArea} sqft`,
    '', // Blank line after area
  ];
  
  // Add room lines
  for (const room of sorted) {
    // Skip certain auxiliary room types
    if (['circulation', 'deadspace', 'fireplace', 'windows', 'doors'].includes(room.roomType)) {
      continue;
    }
    
    lines.push(`${room.promptKey} = ${room.promptSizeName.toLowerCase()}`);
  }
  
  return lines.join('\n');
}

/**
 * Compare two prompts and highlight differences
 */
export function comparePrompts(original: string, modified: string): {
  added: string[];
  removed: string[];
  changed: Array<{ room: string; from: string; to: string }>;
} {
  const parsePrompt = (prompt: string): Map<string, string> => {
    const map = new Map<string, string>();
    const lines = prompt.split('\n');
    
    for (const line of lines) {
      if (line.includes('=') && !line.startsWith('area')) {
        const [key, value] = line.split('=').map(s => s.trim());
        if (key && value) {
          map.set(key, value);
        }
      }
    }
    
    return map;
  };
  
  const originalMap = parsePrompt(original);
  const modifiedMap = parsePrompt(modified);
  
  const added: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ room: string; from: string; to: string }> = [];
  
  // Find added and changed
  modifiedMap.forEach((value, key) => {
    if (!originalMap.has(key)) {
      added.push(`${key} = ${value}`);
    } else if (originalMap.get(key) !== value) {
      changed.push({ room: key, from: originalMap.get(key)!, to: value });
    }
  });
  
  // Find removed
  originalMap.forEach((value, key) => {
    if (!modifiedMap.has(key)) {
      removed.push(`${key} = ${value}`);
    }
  });
  
  return { added, removed, changed };
}

/**
 * Estimate token count for a prompt (rough CLIP estimation)
 */
export function estimateTokenCount(prompt: string): number {
  // CLIP BPE typically: ~1 token per 4 chars, plus special tokens
  const words = prompt.replace(/[=\n]/g, ' ').split(/\s+/).filter(w => w.length > 0);
  return words.length + 2; // +2 for start/end tokens
}

/**
 * Check if prompt is within token limit
 */
export function validatePrompt(prompt: string): {
  valid: boolean;
  tokenCount: number;
  limit: number;
  warning?: string;
} {
  const tokenCount = estimateTokenCount(prompt);
  const limit = 77;
  const valid = tokenCount <= limit;
  
  return {
    valid,
    tokenCount,
    limit,
    warning: valid ? undefined : `Prompt has ${tokenCount} tokens, exceeds ${limit} token limit`,
  };
}

// ============================================================================
// Room Count Helpers
// ============================================================================

/**
 * Count rooms by type
 */
export function countRoomsByType(rooms: EditorRoom[]): Map<string, number> {
  const counts = new Map<string, number>();
  
  for (const room of rooms) {
    counts.set(room.roomType, (counts.get(room.roomType) || 0) + 1);
  }
  
  return counts;
}

/**
 * Get a summary of the layout for display
 */
export function getLayoutSummary(rooms: EditorRoom[]): {
  totalArea: number;
  roomCount: number;
  bedrooms: number;
  bathrooms: number;
  breakdown: Array<{ type: string; count: number; totalSqft: number }>;
} {
  const counts = countRoomsByType(rooms);
  const breakdown: Array<{ type: string; count: number; totalSqft: number }> = [];
  
  counts.forEach((count, type) => {
    const roomsOfType = rooms.filter(r => r.roomType === type);
    const totalSqft = roomsOfType.reduce((sum, r) => sum + r.areaSqft, 0);
    breakdown.push({ type, count, totalSqft: Math.round(totalSqft) });
  });
  
  // Sort by priority
  breakdown.sort((a, b) => {
    const priorityA = ROOM_PRIORITY[a.type] ?? 99;
    const priorityB = ROOM_PRIORITY[b.type] ?? 99;
    return priorityA - priorityB;
  });
  
  const bedrooms = (counts.get('primary_bedroom') || 0) + (counts.get('bedroom') || 0);
  const bathrooms = (counts.get('primary_bathroom') || 0) + (counts.get('bathroom') || 0);
  
  return {
    totalArea: calculateTotalArea(rooms),
    roomCount: rooms.length,
    bedrooms,
    bathrooms,
    breakdown,
  };
}






