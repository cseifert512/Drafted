'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Trash2, 
  Lock, 
  Unlock, 
  Copy,
  ChevronDown,
  Ruler,
  Square,
} from 'lucide-react';
import type { EditorRoom } from '@/lib/editor/editorTypes';
import type { RoomSize, RoomTypeDefinition } from '@/lib/drafted-types';
import { analyzeRoomSize } from '@/lib/editor/layoutAnalyzer';

interface RoomPropertiesPanelProps {
  room: EditorRoom | null;
  roomTypes: RoomTypeDefinition[];
  onUpdateRoom: (roomId: string, updates: Partial<EditorRoom>) => void;
  onDeleteRoom: (roomId: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function RoomPropertiesPanel({
  room,
  roomTypes,
  onUpdateRoom,
  onDeleteRoom,
  onClose,
  isOpen,
}: RoomPropertiesPanelProps) {
  const [localRoom, setLocalRoom] = useState<EditorRoom | null>(room);
  
  // Sync local state with prop
  useEffect(() => {
    setLocalRoom(room);
  }, [room]);
  
  if (!isOpen || !localRoom) {
    return null;
  }
  
  const currentRoomDef = roomTypes.find(rt => rt.key === localRoom.roomType);
  const estimatedSize = analyzeRoomSize(localRoom);
  
  const handleTypeChange = (newType: string) => {
    const newRoomDef = roomTypes.find(rt => rt.key === newType);
    if (newRoomDef) {
      onUpdateRoom(localRoom.id, {
        roomType: newType,
        displayName: newRoomDef.display,
        fillColor: newRoomDef.colors.ui_hex || localRoom.fillColor,
        trainingColor: newRoomDef.colors.training_hex || localRoom.trainingColor,
      });
    }
  };
  
  const handleLockToggle = () => {
    onUpdateRoom(localRoom.id, { isLocked: !localRoom.isLocked });
  };
  
  const handleDelete = () => {
    if (confirm(`Delete ${localRoom.displayName}?`)) {
      onDeleteRoom(localRoom.id);
      onClose();
    }
  };
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: 300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 300, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-72 bg-white border-l border-drafted-border flex flex-col h-full shadow-lg"
      >
        {/* Header */}
        <div className="p-3 border-b border-drafted-border flex items-center justify-between">
          <h3 className="font-semibold text-drafted-black text-sm">Room Properties</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-drafted-bg rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Room Preview */}
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-lg border-2 border-drafted-border"
              style={{ backgroundColor: localRoom.fillColor }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-drafted-black truncate">
                {localRoom.displayName}
              </div>
              <div className="text-sm text-drafted-gray">
                {Math.round(localRoom.areaSqft)} sqft • Size {estimatedSize}
              </div>
            </div>
          </div>
          
          {/* Room Type */}
          <div>
            <label className="text-xs font-medium text-drafted-gray mb-1.5 block">
              Room Type
            </label>
            <div className="relative">
              <select
                value={localRoom.roomType}
                onChange={(e) => handleTypeChange(e.target.value)}
                disabled={localRoom.isLocked}
                className="w-full px-3 py-2 pr-8 bg-drafted-bg border border-drafted-border rounded-lg text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-coral-500/20 focus:border-coral-500 disabled:opacity-50"
              >
                {roomTypes.map((rt) => (
                  <option key={rt.key} value={rt.key}>
                    {rt.display}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-drafted-gray pointer-events-none" />
            </div>
          </div>
          
          {/* Display Name */}
          <div>
            <label className="text-xs font-medium text-drafted-gray mb-1.5 block">
              Display Name
            </label>
            <input
              type="text"
              value={localRoom.displayName}
              onChange={(e) => onUpdateRoom(localRoom.id, { displayName: e.target.value })}
              disabled={localRoom.isLocked}
              className="w-full px-3 py-2 bg-drafted-bg border border-drafted-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-coral-500/20 focus:border-coral-500 disabled:opacity-50"
            />
          </div>
          
          {/* Dimensions */}
          <div>
            <label className="text-xs font-medium text-drafted-gray mb-1.5 flex items-center gap-1.5">
              <Ruler className="w-3.5 h-3.5" />
              Dimensions
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-drafted-muted mb-1 block">Width</label>
                <div className="px-3 py-2 bg-drafted-bg border border-drafted-border rounded-lg text-sm text-drafted-gray">
                  {Math.round(localRoom.widthInches / 12)}' {Math.round(localRoom.widthInches % 12)}"
                </div>
              </div>
              <div>
                <label className="text-[10px] text-drafted-muted mb-1 block">Height</label>
                <div className="px-3 py-2 bg-drafted-bg border border-drafted-border rounded-lg text-sm text-drafted-gray">
                  {Math.round(localRoom.heightInches / 12)}' {Math.round(localRoom.heightInches % 12)}"
                </div>
              </div>
            </div>
          </div>
          
          {/* Area */}
          <div>
            <label className="text-xs font-medium text-drafted-gray mb-1.5 flex items-center gap-1.5">
              <Square className="w-3.5 h-3.5" />
              Area
            </label>
            <div className="px-3 py-2 bg-drafted-bg border border-drafted-border rounded-lg text-sm">
              <span className="font-medium text-drafted-black">{Math.round(localRoom.areaSqft)}</span>
              <span className="text-drafted-gray"> sqft</span>
            </div>
          </div>
          
          {/* Estimated Size */}
          <div>
            <label className="text-xs font-medium text-drafted-gray mb-1.5 block">
              Estimated Size Category
            </label>
            <div className="flex gap-1">
              {(['S', 'M', 'L', 'XL'] as RoomSize[]).map((size) => (
                <div
                  key={size}
                  className={`flex-1 py-2 text-center text-xs font-medium rounded transition-colors ${
                    estimatedSize === size
                      ? 'bg-coral-500 text-white'
                      : 'bg-drafted-bg text-drafted-gray'
                  }`}
                >
                  {size}
                </div>
              ))}
            </div>
            {currentRoomDef?.sizes && (
              <p className="text-[10px] text-drafted-muted mt-1.5">
                {currentRoomDef.sizes.find(s => s.key === estimatedSize)?.user_name || ''}
              </p>
            )}
          </div>
          
          {/* Color */}
          <div>
            <label className="text-xs font-medium text-drafted-gray mb-1.5 block">
              Color
            </label>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded border border-drafted-border"
                style={{ backgroundColor: localRoom.fillColor }}
              />
              <input
                type="text"
                value={localRoom.fillColor}
                onChange={(e) => onUpdateRoom(localRoom.id, { fillColor: e.target.value })}
                disabled={localRoom.isLocked}
                className="flex-1 px-3 py-2 bg-drafted-bg border border-drafted-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-coral-500/20 focus:border-coral-500 disabled:opacity-50"
              />
            </div>
          </div>
          
          {/* Position */}
          <div>
            <label className="text-xs font-medium text-drafted-gray mb-1.5 block">
              Position (Canvas)
            </label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="px-3 py-2 bg-drafted-bg border border-drafted-border rounded-lg text-drafted-gray">
                X: {Math.round(localRoom.bounds.x)}
              </div>
              <div className="px-3 py-2 bg-drafted-bg border border-drafted-border rounded-lg text-drafted-gray">
                Y: {Math.round(localRoom.bounds.y)}
              </div>
            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div className="p-3 border-t border-drafted-border space-y-2">
          <button
            onClick={handleLockToggle}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              localRoom.isLocked
                ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                : 'bg-drafted-bg text-drafted-gray border border-drafted-border hover:bg-drafted-border'
            }`}
          >
            {localRoom.isLocked ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Unlock Room</span>
              </>
            ) : (
              <>
                <Unlock className="w-4 h-4" />
                <span>Lock Room</span>
              </>
            )}
          </button>
          
          <button
            onClick={handleDelete}
            disabled={localRoom.isLocked}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Room</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}








