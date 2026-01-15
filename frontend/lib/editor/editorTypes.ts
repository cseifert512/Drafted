/**
 * TypeScript types for the Floor Plan Editor
 * Supports both Direct SVG manipulation (Mode A) and Hybrid regeneration (Mode B)
 */

import type { RoomSize, RoomTypeDefinition, GeneratedRoom, DraftedPlan } from '../drafted-types';

// ============================================================================
// Core Types
// ============================================================================

/** Editor mode - direct manipulation or hybrid with regeneration */
export type EditorMode = 'direct' | 'hybrid';

/** 2D Point coordinate */
export interface Point {
  x: number;
  y: number;
}

/** Bounding box for a room */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Room polygon with all editable properties */
export interface EditorRoom {
  id: string;
  roomType: string;
  displayName: string;
  
  // Geometry
  points: Point[];          // Polygon vertices
  bounds: BoundingBox;      // Bounding rectangle
  
  // Visual
  fillColor: string;        // Display color (ui_hex)
  trainingColor: string;    // Original training color for export
  
  // Dimensions (calculated from geometry)
  areaSqft: number;
  widthInches: number;
  heightInches: number;
  
  // Size estimation for prompt building
  estimatedSize: RoomSize;
  
  // State
  isSelected: boolean;
  isHovered: boolean;
  isLocked: boolean;        // Prevent editing
  
  // Metadata
  originalRoomData?: GeneratedRoom;
}

/** Resize handle position */
export type HandlePosition = 
  | 'top-left' 
  | 'top' 
  | 'top-right' 
  | 'right' 
  | 'bottom-right' 
  | 'bottom' 
  | 'bottom-left' 
  | 'left';

/** Resize handle data */
export interface ResizeHandle {
  position: HandlePosition;
  x: number;
  y: number;
  cursor: string;
}

// ============================================================================
// Grid Configuration
// ============================================================================

export interface GridConfig {
  size: number;             // Grid cell size in pixels
  snapEnabled: boolean;     // Whether snapping is active
  visible: boolean;         // Whether grid is displayed
  color: string;            // Grid line color
  opacity: number;          // Grid line opacity
}

export const DEFAULT_GRID_CONFIG: GridConfig = {
  size: 12,                 // 12px = 6" at typical scale
  snapEnabled: true,
  visible: true,
  color: '#e5e7eb',
  opacity: 0.5,
};

// ============================================================================
// Canvas/Viewport
// ============================================================================

export interface ViewportState {
  zoom: number;             // Zoom level (1 = 100%)
  panX: number;             // Pan offset X
  panY: number;             // Pan offset Y
  width: number;            // Canvas width
  height: number;           // Canvas height
}

export const DEFAULT_VIEWPORT: ViewportState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  width: 768,
  height: 768,
};

// ============================================================================
// Editor State
// ============================================================================

export interface EditorState {
  // Mode
  mode: EditorMode;
  
  // Rooms
  rooms: EditorRoom[];
  selectedRoomId: string | null;
  hoveredRoomId: string | null;
  
  // Original plan data (for hybrid mode regeneration)
  originalPlan: DraftedPlan | null;
  originalSeed: number;
  originalPrompt: string;
  originalSvg: string;
  
  // Viewport
  viewport: ViewportState;
  
  // Grid
  grid: GridConfig;
  
  // Drag state
  isDragging: boolean;
  isResizing: boolean;
  dragStartPoint: Point | null;
  activeHandle: HandlePosition | null;
  
  // History for undo/redo
  history: EditorHistoryEntry[];
  historyIndex: number;
  
  // Hybrid mode specific
  pendingRegeneration: boolean;
  regeneratedPlan: DraftedPlan | null;
  showComparison: boolean;
  
  // UI state
  isPaletteOpen: boolean;
  isPropertiesOpen: boolean;
  
  // Status
  isLoading: boolean;
  error: string | null;
}

export interface EditorHistoryEntry {
  timestamp: number;
  action: string;
  rooms: EditorRoom[];
}

export const DEFAULT_EDITOR_STATE: EditorState = {
  mode: 'direct',
  rooms: [],
  selectedRoomId: null,
  hoveredRoomId: null,
  originalPlan: null,
  originalSeed: 0,
  originalPrompt: '',
  originalSvg: '',
  viewport: DEFAULT_VIEWPORT,
  grid: DEFAULT_GRID_CONFIG,
  isDragging: false,
  isResizing: false,
  dragStartPoint: null,
  activeHandle: null,
  history: [],
  historyIndex: -1,
  pendingRegeneration: false,
  regeneratedPlan: null,
  showComparison: false,
  isPaletteOpen: true,
  isPropertiesOpen: true,
  isLoading: false,
  error: null,
};

// ============================================================================
// Actions
// ============================================================================

export type EditorAction =
  | { type: 'SET_MODE'; mode: EditorMode }
  | { type: 'LOAD_PLAN'; plan: DraftedPlan }
  | { type: 'SET_ROOMS'; rooms: EditorRoom[] }
  | { type: 'SELECT_ROOM'; roomId: string | null }
  | { type: 'HOVER_ROOM'; roomId: string | null }
  | { type: 'UPDATE_ROOM'; roomId: string; updates: Partial<EditorRoom> }
  | { type: 'ADD_ROOM'; room: EditorRoom }
  | { type: 'DELETE_ROOM'; roomId: string }
  | { type: 'MOVE_ROOM'; roomId: string; delta: Point }
  | { type: 'RESIZE_ROOM'; roomId: string; handle: HandlePosition; delta: Point }
  | { type: 'SET_VIEWPORT'; viewport: Partial<ViewportState> }
  | { type: 'SET_GRID'; grid: Partial<GridConfig> }
  | { type: 'START_DRAG'; point: Point }
  | { type: 'END_DRAG' }
  | { type: 'START_RESIZE'; handle: HandlePosition; point: Point }
  | { type: 'END_RESIZE' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SAVE_HISTORY'; action: string }
  | { type: 'SET_PENDING_REGENERATION'; pending: boolean }
  | { type: 'SET_REGENERATED_PLAN'; plan: DraftedPlan | null }
  | { type: 'TOGGLE_COMPARISON'; show: boolean }
  | { type: 'ACCEPT_REGENERATION' }
  | { type: 'REJECT_REGENERATION' }
  | { type: 'TOGGLE_PALETTE'; open?: boolean }
  | { type: 'TOGGLE_PROPERTIES'; open?: boolean }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null };

// ============================================================================
// Room Palette Types
// ============================================================================

export interface PaletteRoom {
  roomType: string;
  displayName: string;
  icon?: string;
  defaultSize: RoomSize;
  fillColor: string;
  category: string;
}

export interface PaletteCategory {
  key: string;
  label: string;
  rooms: PaletteRoom[];
}

// ============================================================================
// Drag and Drop Types
// ============================================================================

export interface DragItem {
  type: 'palette-room' | 'canvas-room';
  roomType?: string;
  roomId?: string;
  defaultSize?: RoomSize;
  fillColor?: string;
}

export interface DropResult {
  x: number;
  y: number;
}

// ============================================================================
// Export/Import Types
// ============================================================================

export interface EditorExport {
  version: string;
  timestamp: number;
  mode: EditorMode;
  rooms: EditorRoom[];
  svg: string;
  metadata: {
    originalSeed?: number;
    originalPrompt?: string;
    totalAreaSqft: number;
    roomCount: number;
  };
}

// ============================================================================
// Utility Types
// ============================================================================

/** Room with calculated prompt info for hybrid mode */
export interface RoomPromptInfo {
  roomType: string;
  estimatedSize: RoomSize;
  promptKey: string;
  promptSizeName: string;
  areaSqft: number;
}

/** Comparison data for before/after view */
export interface ComparisonData {
  before: {
    svg: string;
    rooms: EditorRoom[];
    totalArea: number;
  };
  after: {
    svg: string;
    rooms: GeneratedRoom[];
    totalArea: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum room dimensions in pixels */
export const MIN_ROOM_SIZE = 24;

/** Handle size in pixels */
export const HANDLE_SIZE = 8;

/** Zoom limits */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** SVG canvas size */
export const CANVAS_SIZE = 768;

/** Pixels per inch (for dimension calculations) */
export const PIXELS_PER_INCH = 1; // Adjust based on actual SVG scale


