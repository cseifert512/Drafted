'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Sparkles, 
  Loader2,
  AlertCircle,
  Check,
  RefreshCw,
  Settings,
  Wand2
} from 'lucide-react';
import { RoomSelector } from './RoomSelector';
import type { 
  RoomSpec, 
  RoomTypeDefinition, 
  RoomSize,
  DraftedValidation,
  DraftedGenerationResult 
} from '@/lib/drafted-types';
import { validateDraftedConfig, generateDraftedPlan } from '@/lib/drafted-api';

interface DraftedGenerationFormProps {
  roomTypes: RoomTypeDefinition[];
  onGenerate: (results: DraftedGenerationResult[]) => void;
  onProgress?: (completed: number, total: number) => void;
  isGenerating?: boolean;
}

// Default room configuration (3BR/2BA)
const DEFAULT_ROOMS: RoomSpec[] = [
  { id: '1', room_type: 'primary_bedroom', size: 'M' },
  { id: '2', room_type: 'primary_bathroom', size: 'M' },
  { id: '3', room_type: 'primary_closet', size: 'M' },
  { id: '4', room_type: 'bedroom', size: 'M' },
  { id: '5', room_type: 'bedroom', size: 'M' },
  { id: '6', room_type: 'bathroom', size: 'S' },
  { id: '7', room_type: 'living', size: 'M' },
  { id: '8', room_type: 'kitchen', size: 'M' },
  { id: '9', room_type: 'dining', size: 'M' },
  { id: '10', room_type: 'garage', size: 'M' },
];

export function DraftedGenerationForm({
  roomTypes,
  onGenerate,
  onProgress,
  isGenerating: externalIsGenerating,
}: DraftedGenerationFormProps) {
  const [rooms, setRooms] = useState<RoomSpec[]>(DEFAULT_ROOMS);
  const [validation, setValidation] = useState<DraftedValidation | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [count, setCount] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [numSteps, setNumSteps] = useState(30);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [generationProgress, setGenerationProgress] = useState({ completed: 0, total: 0 });

  // Generate unique ID for new rooms
  const generateId = () => Math.random().toString(36).substring(2, 9);

  // Add room
  const handleAddRoom = useCallback((roomType: string, size: RoomSize) => {
    setRooms((prev) => [...prev, { id: generateId(), room_type: roomType, size }]);
  }, []);

  // Remove room
  const handleRemoveRoom = useCallback((id: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // Update room size
  const handleUpdateSize = useCallback((id: string, size: RoomSize) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, size } : r))
    );
  }, []);

  // Validate configuration when rooms change
  useEffect(() => {
    const validate = async () => {
      if (rooms.length === 0) {
        setValidation(null);
        return;
      }

      setIsValidating(true);
      try {
        const result = await validateDraftedConfig(
          rooms.map((r) => ({ room_type: r.room_type, size: r.size }))
        );
        setValidation(result);
        setError(null);
      } catch (e) {
        console.error('Validation failed:', e);
        // Don't show error for validation failures, just clear validation
        setValidation(null);
      } finally {
        setIsValidating(false);
      }
    };

    // Debounce validation
    const timer = setTimeout(validate, 300);
    return () => clearTimeout(timer);
  }, [rooms]);

  // Handle generation
  const handleGenerate = async () => {
    if (rooms.length === 0) {
      setError('Please add at least one room');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGenerationProgress({ completed: 0, total: count });

    const results: DraftedGenerationResult[] = [];

    try {
      for (let i = 0; i < count; i++) {
        const result = await generateDraftedPlan({
          rooms: rooms.map((r) => ({ room_type: r.room_type, size: r.size })),
          num_steps: numSteps,
          guidance_scale: guidanceScale,
          // No seed = random for each variation
        });

        results.push(result);
        setGenerationProgress({ completed: i + 1, total: count });
        onProgress?.(i + 1, count);
      }

      onGenerate(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  // Reset to defaults
  const handleReset = () => {
    setRooms(DEFAULT_ROOMS);
    setError(null);
  };

  const generating = isGenerating || externalIsGenerating;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-drafted p-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-coral-100 rounded-drafted flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-coral-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-drafted-black">Design Floor Plan</h2>
            <p className="text-sm text-drafted-gray">
              Configure rooms to generate diverse layouts
            </p>
          </div>
        </div>
        
        <button
          onClick={handleReset}
          className="text-sm text-drafted-gray hover:text-drafted-black flex items-center gap-1 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Reset
        </button>
      </div>

      {/* Room Selector */}
      <RoomSelector
        rooms={rooms}
        roomTypes={roomTypes}
        onAddRoom={handleAddRoom}
        onRemoveRoom={handleRemoveRoom}
        onUpdateSize={handleUpdateSize}
        tokenCount={validation?.token_count || 0}
        tokenLimit={validation?.token_limit || 77}
        estimatedSqft={validation?.estimated_sqft || 0}
      />

      {/* Validation Warnings */}
      {validation?.warnings && validation.warnings.length > 0 && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-drafted">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-700">
              {validation.warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-drafted">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Generation Options */}
      <div className="mt-6 space-y-4">
        {/* Number of Plans */}
        <div>
          <label className="text-sm font-medium text-drafted-gray mb-2 block">
            Number of Variations (max 4)
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setCount(num)}
                disabled={generating}
                className={`
                  flex-1 py-2.5 rounded-drafted text-sm font-medium transition-all
                  ${count === num
                    ? 'bg-drafted-black text-white'
                    : 'bg-drafted-bg text-drafted-gray hover:bg-drafted-border'
                  }
                  disabled:opacity-50
                `}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Options Toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-drafted-gray hover:text-drafted-black transition-colors"
        >
          <Settings className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
          {showAdvanced ? 'Hide' : 'Show'} advanced options
        </button>

        {/* Advanced Options */}
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-4 pt-2"
          >
            <div>
              <label className="text-sm font-medium text-drafted-gray mb-2 flex items-center justify-between">
                <span>Diffusion Steps</span>
                <span className="text-coral-500">{numSteps}</span>
              </label>
              <input
                type="range"
                min={10}
                max={50}
                value={numSteps}
                onChange={(e) => setNumSteps(Number(e.target.value))}
                disabled={generating}
                className="slider-drafted"
              />
              <div className="flex justify-between text-xs text-drafted-light mt-1">
                <span>Fast (10)</span>
                <span>Quality (50)</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-drafted-gray mb-2 flex items-center justify-between">
                <span>Guidance Scale</span>
                <span className="text-coral-500">{guidanceScale.toFixed(1)}</span>
              </label>
              <input
                type="range"
                min={1}
                max={15}
                step={0.5}
                value={guidanceScale}
                onChange={(e) => setGuidanceScale(Number(e.target.value))}
                disabled={generating}
                className="slider-drafted"
              />
              <div className="flex justify-between text-xs text-drafted-light mt-1">
                <span>Creative (1)</span>
                <span>Precise (15)</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={!!generating || rooms.length === 0 || !!(validation && !validation.valid)}
        className="w-full mt-6 btn-drafted-coral py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generating ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Generating {generationProgress.completed}/{generationProgress.total}...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5" />
            Generate {count} Floor Plans
          </span>
        )}
      </button>

      {/* Validation Status */}
      <div className="mt-4 flex items-center justify-center gap-4 text-xs text-drafted-light">
        {isValidating ? (
          <span className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Validating...
          </span>
        ) : validation?.valid ? (
          <span className="flex items-center gap-1 text-green-600">
            <Check className="w-3 h-3" />
            Configuration valid
          </span>
        ) : null}
        
        <span>•</span>
        <span>Powered by Drafted.ai</span>
      </div>
    </motion.div>
  );
}

