'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { DraftedPlan, GeneratedRoom, RoomSize } from '@/lib/drafted-types';

// ============================================================================
// Types
// ============================================================================

export interface PlanSnapshot {
  plan: DraftedPlan;
  prompt: string;
  seed: number;
  imageBase64?: string;
  svg?: string;
  rooms: GeneratedRoom[];
  timestamp: number;
}

export interface EditOperation {
  type: 'add_room' | 'remove_room' | 'resize_room' | 'adjust_sqft' | 'regenerate' | 'custom';
  description: string;
  addedRooms?: { room_type: string; size: RoomSize }[];
  removedRooms?: string[];
  resizedRooms?: Record<string, RoomSize>;
  sqftDelta?: number;
}

export interface ComparisonData {
  id: string;
  timestamp: number;
  original: PlanSnapshot;
  edited: PlanSnapshot;
  editOperation: EditOperation;
  elapsedSeconds?: number;
  numSteps?: number;
  guidanceScale?: number;
}

export interface RoomDelta {
  type: 'added' | 'removed' | 'modified';
  roomType: string;
  displayName: string;
  originalSize?: RoomSize;
  editedSize?: RoomSize;
  originalArea?: number;
  editedArea?: number;
  areaDelta?: number;
}

export interface DevModeState {
  isEnabled: boolean;
  currentComparison: ComparisonData | null;
  history: ComparisonData[];
  showPanel: boolean;
}

export interface BatchConfig {
  rooms: { room_type: string; size: RoomSize }[];
  target_sqft?: number;
}

export interface RenderSettings {
  autoRender: boolean;  // Automatically render new generations
  showSchematic: boolean;  // Show schematic by default (in dev mode)
}

export interface DevModeContextValue extends DevModeState {
  toggleDevMode: () => void;
  setDevMode: (enabled: boolean) => void;
  trackEdit: (
    original: DraftedPlan,
    edited: DraftedPlan,
    operation: EditOperation,
    metadata?: { elapsedSeconds?: number; numSteps?: number; guidanceScale?: number }
  ) => void;
  setCurrentComparison: (comparison: ComparisonData | null) => void;
  showDevPanel: () => void;
  hideDevPanel: () => void;
  clearHistory: () => void;
  batchConfig: BatchConfig | null;
  setBatchConfig: (config: BatchConfig | null) => void;
  renderSettings: RenderSettings;
  setRenderSettings: (settings: Partial<RenderSettings>) => void;
}

// ============================================================================
// Context
// ============================================================================

const DevModeContext = createContext<DevModeContextValue | null>(null);

const DEV_MODE_STORAGE_KEY = 'drafted_dev_mode';
const DEV_HISTORY_STORAGE_KEY = 'drafted_dev_history';
const RENDER_SETTINGS_STORAGE_KEY = 'drafted_render_settings';

const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  autoRender: false,
  showSchematic: false,
};

// ============================================================================
// Provider
// ============================================================================

interface DevModeProviderProps {
  children: ReactNode;
}

export function DevModeProvider({ children }: DevModeProviderProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [currentComparison, setCurrentComparison] = useState<ComparisonData | null>(null);
  const [history, setHistory] = useState<ComparisonData[]>([]);
  const [batchConfig, setBatchConfig] = useState<BatchConfig | null>(null);
  const [renderSettings, setRenderSettingsState] = useState<RenderSettings>(DEFAULT_RENDER_SETTINGS);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const savedEnabled = localStorage.getItem(DEV_MODE_STORAGE_KEY);
      if (savedEnabled === 'true') {
        setIsEnabled(true);
      }

      const savedHistory = localStorage.getItem(DEV_HISTORY_STORAGE_KEY);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) {
          // Only keep last 20 comparisons to avoid storage bloat
          setHistory(parsed.slice(-20));
        }
      }

      const savedRenderSettings = localStorage.getItem(RENDER_SETTINGS_STORAGE_KEY);
      if (savedRenderSettings) {
        const parsed = JSON.parse(savedRenderSettings);
        setRenderSettingsState({ ...DEFAULT_RENDER_SETTINGS, ...parsed });
      }
    } catch (e) {
      console.error('[DevMode] Failed to load from localStorage:', e);
    }
  }, []);

  // Persist enabled state
  useEffect(() => {
    try {
      localStorage.setItem(DEV_MODE_STORAGE_KEY, String(isEnabled));
    } catch (e) {
      console.error('[DevMode] Failed to save enabled state:', e);
    }
  }, [isEnabled]);

  // Persist history (without large base64 data to save space)
  useEffect(() => {
    try {
      const lightHistory = history.map(comp => ({
        ...comp,
        original: {
          ...comp.original,
          imageBase64: undefined, // Strip large images
        },
        edited: {
          ...comp.edited,
          imageBase64: undefined,
        },
      }));
      localStorage.setItem(DEV_HISTORY_STORAGE_KEY, JSON.stringify(lightHistory.slice(-20)));
    } catch (e) {
      console.error('[DevMode] Failed to save history:', e);
    }
  }, [history]);

  const toggleDevMode = useCallback(() => {
    setIsEnabled(prev => !prev);
  }, []);

  const setDevMode = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
  }, []);

  const trackEdit = useCallback((
    original: DraftedPlan,
    edited: DraftedPlan,
    operation: EditOperation,
    metadata?: { elapsedSeconds?: number; numSteps?: number; guidanceScale?: number }
  ) => {
    const comparison: ComparisonData = {
      id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      original: {
        plan: original,
        prompt: original.prompt,
        seed: original.seed,
        imageBase64: original.image_base64,
        svg: original.svg,
        rooms: original.rooms,
        timestamp: original.created_at || Date.now(),
      },
      edited: {
        plan: edited,
        prompt: edited.prompt,
        seed: edited.seed,
        imageBase64: edited.image_base64,
        svg: edited.svg,
        rooms: edited.rooms,
        timestamp: edited.created_at || Date.now(),
      },
      editOperation: operation,
      ...metadata,
    };

    setCurrentComparison(comparison);
    setHistory(prev => [...prev, comparison]);

    // Auto-show panel when tracking an edit in dev mode
    if (isEnabled) {
      setShowPanel(true);
    }

    console.log('[DevMode] Tracked edit:', {
      operation: operation.type,
      description: operation.description,
      originalRooms: original.rooms.length,
      editedRooms: edited.rooms.length,
    });
  }, [isEnabled]);

  const showDevPanel = useCallback(() => {
    setShowPanel(true);
  }, []);

  const hideDevPanel = useCallback(() => {
    setShowPanel(false);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentComparison(null);
    try {
      localStorage.removeItem(DEV_HISTORY_STORAGE_KEY);
    } catch (e) {
      console.error('[DevMode] Failed to clear history:', e);
    }
  }, []);

  const setRenderSettings = useCallback((settings: Partial<RenderSettings>) => {
    setRenderSettingsState(prev => {
      const newSettings = { ...prev, ...settings };
      try {
        localStorage.setItem(RENDER_SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
      } catch (e) {
        console.error('[DevMode] Failed to save render settings:', e);
      }
      return newSettings;
    });
  }, []);

  const value: DevModeContextValue = {
    isEnabled,
    currentComparison,
    history,
    showPanel,
    toggleDevMode,
    setDevMode,
    trackEdit,
    setCurrentComparison,
    showDevPanel,
    hideDevPanel,
    clearHistory,
    batchConfig,
    setBatchConfig,
    renderSettings,
    setRenderSettings,
  };

  return (
    <DevModeContext.Provider value={value}>
      {children}
    </DevModeContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useDevMode(): DevModeContextValue {
  const context = useContext(DevModeContext);
  if (!context) {
    throw new Error('useDevMode must be used within a DevModeProvider');
  }
  return context;
}

// Optional hook that doesn't throw (for components that might be outside provider)
export function useDevModeOptional(): DevModeContextValue | null {
  return useContext(DevModeContext);
}

