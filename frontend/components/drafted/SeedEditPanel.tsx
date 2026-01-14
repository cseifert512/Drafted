'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wand2, 
  Plus, 
  Minus, 
  ArrowUpDown,
  Loader2,
  History,
  Sparkles,
  ChevronDown
} from 'lucide-react';
import type { 
  DraftedPlan, 
  RoomSize, 
  RoomTypeDefinition,
  DraftedGenerationResult 
} from '@/lib/drafted-types';
import { SIZE_LABELS } from '@/lib/drafted-types';
import { editDraftedPlan } from '@/lib/drafted-api';

interface SeedEditPanelProps {
  plan: DraftedPlan;
  roomTypes: RoomTypeDefinition[];
  onEditComplete: (newPlan: DraftedGenerationResult) => void;
  onClose: () => void;
}

type EditMode = 'add' | 'remove' | 'resize' | 'sqft';

export function SeedEditPanel({
  plan,
  roomTypes,
  onEditComplete,
  onClose,
}: SeedEditPanelProps) {
  const [editMode, setEditMode] = useState<EditMode>('add');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add room state
  const [addRoomType, setAddRoomType] = useState('office');
  const [addRoomSize, setAddRoomSize] = useState<RoomSize>('M');

  // Remove room state
  const [removeRoomType, setRemoveRoomType] = useState('');

  // Resize room state
  const [resizeRoomType, setResizeRoomType] = useState('');
  const [resizeNewSize, setResizeNewSize] = useState<RoomSize>('M');

  // Sqft adjustment
  const [sqftDelta, setSqftDelta] = useState(500);

  // Get available room types not already in plan
  const existingTypes = new Set(plan.rooms.map((r) => r.room_type));
  const availableToAdd = roomTypes.filter((rt) => !rt.key.startsWith('circulation'));

  const handleEdit = async () => {
    setIsEditing(true);
    setError(null);

    try {
      const request: any = {
        original_plan_id: plan.id,
        original_seed: plan.seed,
        original_prompt: plan.prompt,
      };

      switch (editMode) {
        case 'add':
          request.add_rooms = [{ room_type: addRoomType, size: addRoomSize }];
          break;
        case 'remove':
          request.remove_rooms = [removeRoomType];
          break;
        case 'resize':
          request.resize_rooms = { [resizeRoomType]: resizeNewSize };
          break;
        case 'sqft':
          request.adjust_sqft = sqftDelta;
          break;
      }

      const result = await editDraftedPlan(request);
      onEditComplete(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Edit failed');
    } finally {
      setIsEditing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="relative bg-white rounded-drafted-xl shadow-drafted-lg max-w-lg w-full overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-drafted-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-coral-100 rounded-drafted flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-coral-500" />
            </div>
            <div>
              <h2 className="font-bold text-drafted-black">Edit Floor Plan</h2>
              <p className="text-sm text-drafted-gray">
                Seed: {plan.seed} • {plan.total_area_sqft.toLocaleString()} sqft
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Edit Mode Tabs */}
          <div className="flex gap-2 mb-6">
            {[
              { mode: 'add' as EditMode, icon: Plus, label: 'Add Room' },
              { mode: 'remove' as EditMode, icon: Minus, label: 'Remove' },
              { mode: 'resize' as EditMode, icon: ArrowUpDown, label: 'Resize' },
              { mode: 'sqft' as EditMode, icon: Sparkles, label: 'Adjust Size' },
            ].map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setEditMode(mode)}
                className={`
                  flex-1 py-2 px-3 rounded-drafted text-sm font-medium transition-all
                  flex items-center justify-center gap-1.5
                  ${editMode === mode
                    ? 'bg-drafted-black text-white'
                    : 'bg-drafted-bg text-drafted-gray hover:bg-drafted-border'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Edit Options */}
          <div className="space-y-4">
            {editMode === 'add' && (
              <>
                <div>
                  <label className="text-sm font-medium text-drafted-gray mb-2 block">
                    Room Type
                  </label>
                  <select
                    value={addRoomType}
                    onChange={(e) => setAddRoomType(e.target.value)}
                    className="w-full px-4 py-2 bg-drafted-bg border border-drafted-border rounded-drafted text-drafted-black"
                  >
                    {availableToAdd.map((rt) => (
                      <option key={rt.key} value={rt.key}>
                        {rt.display}
                        {existingTypes.has(rt.key) ? ' (add another)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-drafted-gray mb-2 block">
                    Size
                  </label>
                  <div className="flex gap-2">
                    {(['S', 'M', 'L', 'XL'] as RoomSize[]).map((size) => (
                      <button
                        key={size}
                        onClick={() => setAddRoomSize(size)}
                        className={`
                          flex-1 py-2 rounded-drafted font-medium transition-all
                          ${addRoomSize === size
                            ? 'bg-drafted-black text-white'
                            : 'bg-drafted-bg text-drafted-gray hover:bg-drafted-border'
                          }
                        `}
                      >
                        {size}
                        <span className="block text-xs opacity-70">
                          {SIZE_LABELS[size]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {editMode === 'remove' && (
              <div>
                <label className="text-sm font-medium text-drafted-gray mb-2 block">
                  Remove Room
                </label>
                <select
                  value={removeRoomType}
                  onChange={(e) => setRemoveRoomType(e.target.value)}
                  className="w-full px-4 py-2 bg-drafted-bg border border-drafted-border rounded-drafted text-drafted-black"
                >
                  <option value="">Select a room to remove...</option>
                  {plan.rooms.map((room, i) => (
                    <option key={`${room.room_type}-${i}`} value={room.room_type}>
                      {room.display_name || room.room_type} ({room.area_sqft.toFixed(0)} sqft)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {editMode === 'resize' && (
              <>
                <div>
                  <label className="text-sm font-medium text-drafted-gray mb-2 block">
                    Room to Resize
                  </label>
                  <select
                    value={resizeRoomType}
                    onChange={(e) => setResizeRoomType(e.target.value)}
                    className="w-full px-4 py-2 bg-drafted-bg border border-drafted-border rounded-drafted text-drafted-black"
                  >
                    <option value="">Select a room...</option>
                    {plan.rooms.map((room, i) => (
                      <option key={`${room.room_type}-${i}`} value={room.room_type}>
                        {room.display_name || room.room_type}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-drafted-gray mb-2 block">
                    New Size
                  </label>
                  <div className="flex gap-2">
                    {(['S', 'M', 'L', 'XL'] as RoomSize[]).map((size) => (
                      <button
                        key={size}
                        onClick={() => setResizeNewSize(size)}
                        className={`
                          flex-1 py-2 rounded-drafted font-medium transition-all
                          ${resizeNewSize === size
                            ? 'bg-drafted-black text-white'
                            : 'bg-drafted-bg text-drafted-gray hover:bg-drafted-border'
                          }
                        `}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {editMode === 'sqft' && (
              <div>
                <label className="text-sm font-medium text-drafted-gray mb-2 flex items-center justify-between">
                  <span>Adjust Total Area</span>
                  <span className="text-coral-500">
                    {sqftDelta > 0 ? '+' : ''}{sqftDelta} sqft
                  </span>
                </label>
                <input
                  type="range"
                  min={-1000}
                  max={1000}
                  step={100}
                  value={sqftDelta}
                  onChange={(e) => setSqftDelta(Number(e.target.value))}
                  className="slider-drafted"
                />
                <div className="flex justify-between text-xs text-drafted-light mt-1">
                  <span>-1000</span>
                  <span>0</span>
                  <span>+1000</span>
                </div>
                <p className="text-xs text-drafted-light mt-2">
                  Current: {plan.total_area_sqft.toLocaleString()} sqft → 
                  New: {(plan.total_area_sqft + sqftDelta).toLocaleString()} sqft
                </p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-drafted text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Info Box */}
          <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-drafted">
            <div className="flex items-start gap-2">
              <History className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700">
                <strong>Seed-based editing:</strong> Using the same seed with modified 
                room configuration produces a similar but adapted layout. The original 
                plan is preserved.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              disabled={isEditing}
              className="flex-1 py-3 border border-drafted-border rounded-drafted text-drafted-gray hover:bg-drafted-bg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleEdit}
              disabled={isEditing || (editMode === 'remove' && !removeRoomType) || (editMode === 'resize' && !resizeRoomType)}
              className="flex-1 py-3 btn-drafted-coral disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEditing ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Editing...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Wand2 className="w-4 h-4" />
                  Apply Edit
                </span>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

