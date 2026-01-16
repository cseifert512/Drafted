/**
 * useFloorPlanEditor - Main hook for floor plan editor state management
 * Supports both Direct SVG manipulation (Mode A) and Hybrid regeneration (Mode B)
 */

import { useReducer, useCallback, useMemo } from 'react';
import type { 
  EditorState, 
  EditorAction, 
  EditorRoom, 
  EditorMode,
  Point,
  HandlePosition,
  GridConfig,
  ViewportState,
  EditorHistoryEntry,
} from '@/lib/editor/editorTypes';
import {
  DEFAULT_EDITOR_STATE,
  DEFAULT_GRID_CONFIG,
  MIN_ZOOM,
  MAX_ZOOM,
  CANVAS_SIZE,
} from '@/lib/editor/editorTypes';
import {
  snapPointToGrid,
  snapBoundsToGrid,
  moveBounds,
  resizeBounds,
  boundsToPoints,
  calculatePolygonArea,
  pixelsToSqft,
  pixelsToInches,
  parseSvgRooms,
  wouldCollide,
  findNonOverlappingPosition,
  applyMagneticPush,
} from '@/lib/editor/editorUtils';
import {
  buildPromptFromLayout,
  analyzeRoomSize,
  calculateTotalArea,
  getLayoutSummary,
} from '@/lib/editor/layoutAnalyzer';
import type { DraftedPlan, RoomTypeDefinition } from '@/lib/drafted-types';

// ============================================================================
// Reducer
// ============================================================================

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode };
    
    case 'SET_RENDERED_OVERLAY':
      return { ...state, showRenderedOverlay: action.show };
    
    case 'LOAD_PLAN':
      return {
        ...state,
        originalPlan: action.plan,
        originalSeed: action.plan.seed,
        originalPrompt: action.plan.prompt,
        originalSvg: action.plan.svg || '',
        history: [],
        historyIndex: -1,
        regeneratedPlan: null,
        showComparison: false,
      };
    
    case 'SET_ROOMS':
      return { ...state, rooms: action.rooms };
    
    case 'SELECT_ROOM':
      return {
        ...state,
        selectedRoomId: action.roomId,
        rooms: state.rooms.map(room => ({
          ...room,
          isSelected: room.id === action.roomId,
        })),
      };
    
    case 'HOVER_ROOM':
      return {
        ...state,
        hoveredRoomId: action.roomId,
        rooms: state.rooms.map(room => ({
          ...room,
          isHovered: room.id === action.roomId,
        })),
      };
    
    case 'UPDATE_ROOM':
      return {
        ...state,
        rooms: state.rooms.map(room =>
          room.id === action.roomId ? { ...room, ...action.updates } : room
        ),
      };
    
    case 'ADD_ROOM': {
      // Check for collision with existing rooms before adding
      if (wouldCollide(action.room.id, action.room.bounds, state.rooms)) {
        // Try to find a non-overlapping position
        const validBounds = findNonOverlappingPosition(
          action.room,
          action.room.bounds,
          state.rooms,
          state.grid
        );
        
        // If we couldn't find a valid position, still add but at original spot
        // (This handles edge cases where the canvas is very full)
        const adjustedRoom = {
          ...action.room,
          bounds: validBounds,
          points: boundsToPoints(validBounds),
        };
        
        return {
          ...state,
          rooms: [...state.rooms, adjustedRoom],
        };
      }
      
      return {
        ...state,
        rooms: [...state.rooms, action.room],
      };
    }
    
    case 'DELETE_ROOM':
      return {
        ...state,
        rooms: state.rooms.filter(room => room.id !== action.roomId),
        selectedRoomId: state.selectedRoomId === action.roomId ? null : state.selectedRoomId,
      };
    
    case 'MOVE_ROOM': {
      const roomToMove = state.rooms.find(r => r.id === action.roomId);
      if (!roomToMove) return state;
      
      const newBounds = moveBounds(roomToMove.bounds, action.delta);
      const snappedBounds = snapBoundsToGrid(newBounds, state.grid);
      
      // Use magnetic push system - other rooms reorganize around the moved room
      const updatedRooms = applyMagneticPush(
        action.roomId,
        snappedBounds,
        state.rooms,
        state.grid
      );
      
      return {
        ...state,
        rooms: updatedRooms,
      };
    }
    
    case 'RESIZE_ROOM': {
      const roomToResize = state.rooms.find(r => r.id === action.roomId);
      if (!roomToResize) return state;
      
      const newBounds = resizeBounds(roomToResize.bounds, action.handle, action.delta, state.grid);
      
      // Use magnetic push system - other rooms reorganize when this room expands
      const updatedRooms = applyMagneticPush(
        action.roomId,
        newBounds,
        state.rooms,
        state.grid
      );
      
      // Update the resized room's size estimate
      const finalRooms = updatedRooms.map(room => {
        if (room.id !== action.roomId) return room;
        return {
          ...room,
          estimatedSize: analyzeRoomSize(room),
        };
      });
      
      return {
        ...state,
        rooms: finalRooms,
      };
    }
    
    case 'SET_VIEWPORT':
      return {
        ...state,
        viewport: { ...state.viewport, ...action.viewport },
      };
    
    case 'SET_GRID':
      return {
        ...state,
        grid: { ...state.grid, ...action.grid },
      };
    
    case 'START_DRAG':
      return {
        ...state,
        isDragging: true,
        dragStartPoint: action.point,
      };
    
    case 'END_DRAG':
      return {
        ...state,
        isDragging: false,
        dragStartPoint: null,
      };
    
    case 'START_RESIZE':
      return {
        ...state,
        isResizing: true,
        activeHandle: action.handle,
        dragStartPoint: action.point,
      };
    
    case 'END_RESIZE':
      return {
        ...state,
        isResizing: false,
        activeHandle: null,
        dragStartPoint: null,
      };
    
    case 'UNDO': {
      if (state.historyIndex <= 0) return state;
      const newIndex = state.historyIndex - 1;
      return {
        ...state,
        rooms: state.history[newIndex].rooms,
        historyIndex: newIndex,
      };
    }
    
    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state;
      const newIndex = state.historyIndex + 1;
      return {
        ...state,
        rooms: state.history[newIndex].rooms,
        historyIndex: newIndex,
      };
    }
    
    case 'SAVE_HISTORY': {
      const entry: EditorHistoryEntry = {
        timestamp: Date.now(),
        action: action.action,
        rooms: JSON.parse(JSON.stringify(state.rooms)), // Deep clone
      };
      
      // Remove any future history if we're not at the end
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(entry);
      
      // Limit history length
      const maxHistory = 50;
      if (newHistory.length > maxHistory) {
        newHistory.shift();
      }
      
      return {
        ...state,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    }
    
    case 'SET_PENDING_REGENERATION':
      return { ...state, pendingRegeneration: action.pending };
    
    case 'SET_REGENERATED_PLAN':
      return { ...state, regeneratedPlan: action.plan };
    
    case 'TOGGLE_COMPARISON':
      return { ...state, showComparison: action.show };
    
    case 'ACCEPT_REGENERATION': {
      if (!state.regeneratedPlan) return state;
      return {
        ...state,
        originalPlan: state.regeneratedPlan,
        originalSvg: state.regeneratedPlan.svg || '',
        regeneratedPlan: null,
        showComparison: false,
        // Rooms will be re-parsed from the new SVG
      };
    }
    
    case 'REJECT_REGENERATION':
      return {
        ...state,
        regeneratedPlan: null,
        showComparison: false,
      };
    
    case 'TOGGLE_PALETTE':
      return {
        ...state,
        isPaletteOpen: action.open ?? !state.isPaletteOpen,
      };
    
    case 'TOGGLE_PROPERTIES':
      return {
        ...state,
        isPropertiesOpen: action.open ?? !state.isPropertiesOpen,
      };
    
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    
    case 'SET_ERROR':
      return { ...state, error: action.error };
    
    default:
      return state;
  }
}

// ============================================================================
// Hook
// ============================================================================

export interface UseFloorPlanEditorOptions {
  initialPlan?: DraftedPlan;
  roomTypes?: Map<string, RoomTypeDefinition>;
}

export function useFloorPlanEditor(options: UseFloorPlanEditorOptions = {}) {
  const { initialPlan, roomTypes = new Map() } = options;
  
  const [state, dispatch] = useReducer(editorReducer, {
    ...DEFAULT_EDITOR_STATE,
    originalPlan: initialPlan || null,
    originalSeed: initialPlan?.seed || 0,
    originalPrompt: initialPlan?.prompt || '',
    originalSvg: initialPlan?.svg || '',
  });
  
  // ============================================================================
  // Mode Actions
  // ============================================================================
  
  const setMode = useCallback((mode: EditorMode) => {
    dispatch({ type: 'SET_MODE', mode });
  }, []);
  
  const toggleMode = useCallback(() => {
    dispatch({ type: 'SET_MODE', mode: state.mode === 'direct' ? 'hybrid' : 'direct' });
  }, [state.mode]);
  
  const setShowRenderedOverlay = useCallback((show: boolean) => {
    dispatch({ type: 'SET_RENDERED_OVERLAY', show });
  }, []);
  
  const toggleRenderedOverlay = useCallback(() => {
    dispatch({ type: 'SET_RENDERED_OVERLAY', show: !state.showRenderedOverlay });
  }, [state.showRenderedOverlay]);
  
  // ============================================================================
  // Plan Actions
  // ============================================================================
  
  const loadPlan = useCallback((plan: DraftedPlan) => {
    console.log('[useFloorPlanEditor] loadPlan called, roomTypes size:', roomTypes.size);
    
    dispatch({ type: 'LOAD_PLAN', plan });
    
    // Parse SVG into editable rooms
    // Room names come from COLOR mapping, not from plan.rooms
    if (plan.svg) {
      const rooms = parseSvgRooms(plan.svg, plan.rooms || [], roomTypes);
      console.log('[useFloorPlanEditor] Parsed', rooms.length, 'rooms from SVG');
      dispatch({ type: 'SET_ROOMS', rooms });
      dispatch({ type: 'SAVE_HISTORY', action: 'load' });
    }
  }, [roomTypes]);
  
  // ============================================================================
  // Room Selection
  // ============================================================================
  
  const selectRoom = useCallback((roomId: string | null) => {
    dispatch({ type: 'SELECT_ROOM', roomId });
  }, []);
  
  const hoverRoom = useCallback((roomId: string | null) => {
    dispatch({ type: 'HOVER_ROOM', roomId });
  }, []);
  
  const clearSelection = useCallback(() => {
    dispatch({ type: 'SELECT_ROOM', roomId: null });
  }, []);
  
  // ============================================================================
  // Room Manipulation
  // ============================================================================
  
  const addRoom = useCallback((room: EditorRoom) => {
    dispatch({ type: 'ADD_ROOM', room });
    dispatch({ type: 'SAVE_HISTORY', action: 'add room' });
  }, []);
  
  const deleteRoom = useCallback((roomId: string) => {
    dispatch({ type: 'DELETE_ROOM', roomId });
    dispatch({ type: 'SAVE_HISTORY', action: 'delete room' });
  }, []);
  
  const deleteSelectedRoom = useCallback(() => {
    if (state.selectedRoomId) {
      deleteRoom(state.selectedRoomId);
    }
  }, [state.selectedRoomId, deleteRoom]);
  
  const updateRoom = useCallback((roomId: string, updates: Partial<EditorRoom>) => {
    dispatch({ type: 'UPDATE_ROOM', roomId, updates });
  }, []);
  
  const moveRoom = useCallback((roomId: string, delta: Point) => {
    dispatch({ type: 'MOVE_ROOM', roomId, delta });
  }, []);
  
  const resizeRoom = useCallback((roomId: string, handle: HandlePosition, delta: Point) => {
    dispatch({ type: 'RESIZE_ROOM', roomId, handle, delta });
  }, []);
  
  // ============================================================================
  // Drag & Resize State
  // ============================================================================
  
  const startDrag = useCallback((point: Point) => {
    dispatch({ type: 'START_DRAG', point });
  }, []);
  
  const endDrag = useCallback(() => {
    dispatch({ type: 'END_DRAG' });
    dispatch({ type: 'SAVE_HISTORY', action: 'move room' });
  }, []);
  
  const startResize = useCallback((handle: HandlePosition, point: Point) => {
    dispatch({ type: 'START_RESIZE', handle, point });
  }, []);
  
  const endResize = useCallback(() => {
    dispatch({ type: 'END_RESIZE' });
    dispatch({ type: 'SAVE_HISTORY', action: 'resize room' });
  }, []);
  
  // ============================================================================
  // Viewport Controls
  // ============================================================================
  
  const setZoom = useCallback((zoom: number) => {
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    dispatch({ type: 'SET_VIEWPORT', viewport: { zoom: clampedZoom } });
  }, []);
  
  const zoomIn = useCallback(() => {
    setZoom(state.viewport.zoom * 1.25);
  }, [state.viewport.zoom, setZoom]);
  
  const zoomOut = useCallback(() => {
    setZoom(state.viewport.zoom / 1.25);
  }, [state.viewport.zoom, setZoom]);
  
  const resetZoom = useCallback(() => {
    dispatch({ type: 'SET_VIEWPORT', viewport: { zoom: 1, panX: 0, panY: 0 } });
  }, []);
  
  /**
   * Fit all rooms into the viewport with padding
   * Calculates the bounding box of all rooms and adjusts zoom/pan accordingly
   */
  const fitToView = useCallback((containerWidth: number = 800, containerHeight: number = 600) => {
    if (state.rooms.length === 0) {
      // No rooms, just reset
      dispatch({ type: 'SET_VIEWPORT', viewport: { zoom: 1, panX: 0, panY: 0 } });
      return;
    }
    
    // Calculate bounding box of all rooms
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const room of state.rooms) {
      minX = Math.min(minX, room.bounds.x);
      minY = Math.min(minY, room.bounds.y);
      maxX = Math.max(maxX, room.bounds.x + room.bounds.width);
      maxY = Math.max(maxY, room.bounds.y + room.bounds.height);
    }
    
    // Add padding (10% on each side)
    const padding = 0.1;
    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    const paddedWidth = boundsWidth * (1 + padding * 2);
    const paddedHeight = boundsHeight * (1 + padding * 2);
    
    // Calculate center of content in canvas coordinates
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    
    // The canvas center (transform origin is at center of the SVG)
    const canvasCenterX = CANVAS_SIZE / 2;
    const canvasCenterY = CANVAS_SIZE / 2;
    
    // Calculate zoom to fit content in the canvas view
    // We use CANVAS_SIZE since that's our viewBox size and the transform is applied on top
    const zoomX = CANVAS_SIZE / paddedWidth;
    const zoomY = CANVAS_SIZE / paddedHeight;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(zoomX, zoomY)));
    
    // Calculate translation needed to center content
    // We want contentCenter to appear at canvasCenter
    const translateX = canvasCenterX - contentCenterX;
    const translateY = canvasCenterY - contentCenterY;
    
    // The transform is: scale(zoom) translate(panX/zoom, panY/zoom)
    // Since translate happens after scale (but we divide by zoom), the effective
    // translation in canvas space is panX/zoom. To get translateX, we need:
    // panX/zoom = translateX => panX = translateX * zoom
    const panX = translateX * newZoom;
    const panY = translateY * newZoom;
    
    dispatch({ type: 'SET_VIEWPORT', viewport: { zoom: newZoom, panX, panY } });
  }, [state.rooms]);
  
  const pan = useCallback((deltaX: number, deltaY: number) => {
    dispatch({
      type: 'SET_VIEWPORT',
      viewport: {
        panX: state.viewport.panX + deltaX,
        panY: state.viewport.panY + deltaY,
      },
    });
  }, [state.viewport.panX, state.viewport.panY]);
  
  // ============================================================================
  // Grid Controls
  // ============================================================================
  
  const setGridSize = useCallback((size: number) => {
    dispatch({ type: 'SET_GRID', grid: { size } });
  }, []);
  
  const toggleGridSnap = useCallback(() => {
    dispatch({ type: 'SET_GRID', grid: { snapEnabled: !state.grid.snapEnabled } });
  }, [state.grid.snapEnabled]);
  
  const toggleGridVisibility = useCallback(() => {
    dispatch({ type: 'SET_GRID', grid: { visible: !state.grid.visible } });
  }, [state.grid.visible]);
  
  // ============================================================================
  // History
  // ============================================================================
  
  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);
  
  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);
  
  const canUndo = state.historyIndex > 0;
  const canRedo = state.historyIndex < state.history.length - 1;
  
  // ============================================================================
  // Hybrid Mode / Regeneration
  // ============================================================================
  
  const getRegenerationPrompt = useCallback(() => {
    return buildPromptFromLayout(state.rooms);
  }, [state.rooms]);
  
  const setRegeneratedPlan = useCallback((plan: DraftedPlan | null) => {
    dispatch({ type: 'SET_REGENERATED_PLAN', plan });
    if (plan) {
      dispatch({ type: 'TOGGLE_COMPARISON', show: true });
    }
  }, []);
  
  const acceptRegeneration = useCallback(() => {
    if (state.regeneratedPlan?.svg) {
      const rooms = parseSvgRooms(state.regeneratedPlan.svg, state.regeneratedPlan.rooms, roomTypes);
      dispatch({ type: 'ACCEPT_REGENERATION' });
      dispatch({ type: 'SET_ROOMS', rooms });
      dispatch({ type: 'SAVE_HISTORY', action: 'regenerate' });
    }
  }, [state.regeneratedPlan, roomTypes]);
  
  const rejectRegeneration = useCallback(() => {
    dispatch({ type: 'REJECT_REGENERATION' });
  }, []);
  
  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', loading });
  }, []);
  
  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', error });
  }, []);
  
  // ============================================================================
  // UI Panel Controls
  // ============================================================================
  
  const togglePalette = useCallback((open?: boolean) => {
    dispatch({ type: 'TOGGLE_PALETTE', open });
  }, []);
  
  const toggleProperties = useCallback((open?: boolean) => {
    dispatch({ type: 'TOGGLE_PROPERTIES', open });
  }, []);
  
  // ============================================================================
  // Computed Values
  // ============================================================================
  
  const selectedRoom = useMemo(() => {
    return state.rooms.find(r => r.id === state.selectedRoomId) || null;
  }, [state.rooms, state.selectedRoomId]);
  
  const layoutSummary = useMemo(() => {
    return getLayoutSummary(state.rooms);
  }, [state.rooms]);
  
  const currentPrompt = useMemo(() => {
    return buildPromptFromLayout(state.rooms);
  }, [state.rooms]);
  
  const hasChanges = useMemo(() => {
    return state.history.length > 1;
  }, [state.history.length]);
  
  // ============================================================================
  // Return
  // ============================================================================
  
  return {
    // State
    state,
    mode: state.mode,
    showRenderedOverlay: state.showRenderedOverlay,
    rooms: state.rooms,
    selectedRoom,
    selectedRoomId: state.selectedRoomId,
    hoveredRoomId: state.hoveredRoomId,
    viewport: state.viewport,
    grid: state.grid,
    isDragging: state.isDragging,
    isResizing: state.isResizing,
    activeHandle: state.activeHandle,
    isLoading: state.isLoading,
    error: state.error,
    
    // Original plan data
    originalPlan: state.originalPlan,
    originalSeed: state.originalSeed,
    originalPrompt: state.originalPrompt,
    originalSvg: state.originalSvg,
    
    // Regeneration state
    regeneratedPlan: state.regeneratedPlan,
    showComparison: state.showComparison,
    
    // UI state
    isPaletteOpen: state.isPaletteOpen,
    isPropertiesOpen: state.isPropertiesOpen,
    
    // Computed
    layoutSummary,
    currentPrompt,
    hasChanges,
    canUndo,
    canRedo,
    
    // Mode actions
    setMode,
    toggleMode,
    setShowRenderedOverlay,
    toggleRenderedOverlay,
    
    // Plan actions
    loadPlan,
    
    // Room selection
    selectRoom,
    hoverRoom,
    clearSelection,
    
    // Room manipulation
    addRoom,
    deleteRoom,
    deleteSelectedRoom,
    updateRoom,
    moveRoom,
    resizeRoom,
    
    // Drag/resize
    startDrag,
    endDrag,
    startResize,
    endResize,
    
    // Viewport
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToView,
    pan,
    
    // Grid
    setGridSize,
    toggleGridSnap,
    toggleGridVisibility,
    
    // History
    undo,
    redo,
    
    // Hybrid mode
    getRegenerationPrompt,
    setRegeneratedPlan,
    acceptRegeneration,
    rejectRegeneration,
    setLoading,
    setError,
    
    // UI
    togglePalette,
    toggleProperties,
  };
}

export type FloorPlanEditor = ReturnType<typeof useFloorPlanEditor>;

