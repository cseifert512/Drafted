'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  DoorOpen, 
  DoorClosed, 
  PanelLeftOpen, 
  Columns2,
  Square,
  Maximize2,
  Hexagon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { 
  OpeningType, 
  OpeningCategory, 
  OpeningTypeDefinition,
  WallSegment,
} from '@/lib/editor/openingTypes';
import { 
  OPENING_TYPES, 
  getOpeningDefinition,
  inchesToSvgPixels,
} from '@/lib/editor/openingTypes';

interface OpeningPlacementModalProps {
  isOpen: boolean;
  wall: WallSegment | null;
  positionOnWall: number;
  onClose: () => void;
  onConfirm: (opening: {
    type: OpeningType;
    widthInches: number;
    swingDirection?: 'left' | 'right';
  }) => void;
}

// Icon mapping for opening types
const OPENING_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'DoorOpen': DoorOpen,
  'DoorClosed': DoorClosed,
  'PanelLeftOpen': PanelLeftOpen,
  'Columns2': Columns2,
  'Square': Square,
  'Maximize2': Maximize2,
  'Hexagon': Hexagon,
};

/**
 * Modal for selecting door/window type and configuration.
 * 
 * Features:
 * - Category tabs (Doors / Windows)
 * - Opening type selection with icons
 * - Width selector with preset sizes
 * - Swing direction toggle for doors
 * - Validation based on wall type
 */
export function OpeningPlacementModal({
  isOpen,
  wall,
  positionOnWall,
  onClose,
  onConfirm,
}: OpeningPlacementModalProps) {
  const [category, setCategory] = useState<OpeningCategory>('door');
  const [selectedType, setSelectedType] = useState<OpeningType>('interior_door');
  const [selectedWidth, setSelectedWidth] = useState<number>(36);
  const [swingDirection, setSwingDirection] = useState<'left' | 'right'>('right');

  // Filter opening types by category and wall compatibility
  const availableTypes = useMemo(() => {
    return OPENING_TYPES.filter(def => {
      // Filter by category
      if (def.category !== category) return false;
      
      // Filter by wall type requirement
      if (def.requiresExteriorWall && wall && !wall.isExterior) return false;
      
      return true;
    });
  }, [category, wall]);

  // Get current opening definition
  const currentDef = useMemo(() => {
    return getOpeningDefinition(selectedType);
  }, [selectedType]);

  // Update width when type changes
  const handleTypeChange = (type: OpeningType) => {
    setSelectedType(type);
    const def = getOpeningDefinition(type);
    if (def) {
      setSelectedWidth(def.defaultWidthInches);
    }
  };

  // Check if opening fits on wall
  const fitsOnWall = useMemo(() => {
    if (!wall) return true;
    const widthSvg = inchesToSvgPixels(selectedWidth);
    const margin = widthSvg / 2;
    const positionPx = positionOnWall * wall.length;
    return positionPx - margin >= 0 && positionPx + margin <= wall.length;
  }, [wall, selectedWidth, positionOnWall]);

  const handleConfirm = () => {
    if (!fitsOnWall) return;
    
    onConfirm({
      type: selectedType,
      widthInches: selectedWidth,
      swingDirection: currentDef?.hasSwingDirection ? swingDirection : undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/50"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />

        {/* Modal */}
        <motion.div
          className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Add {category === 'door' ? 'Door' : 'Window'}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Category Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setCategory('door')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                category === 'door'
                  ? 'text-orange-600 border-b-2 border-orange-500 bg-orange-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <DoorOpen className="w-4 h-4 inline-block mr-2" />
              Doors
            </button>
            <button
              onClick={() => setCategory('window')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                category === 'window'
                  ? 'text-sky-600 border-b-2 border-sky-500 bg-sky-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Square className="w-4 h-4 inline-block mr-2" />
              Windows
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Wall Info */}
            {wall && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className={`w-2 h-2 rounded-full ${wall.isExterior ? 'bg-sky-400' : 'bg-orange-400'}`} />
                <span>{wall.isExterior ? 'Exterior' : 'Interior'} wall selected</span>
              </div>
            )}

            {/* Opening Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                {availableTypes.map((def) => {
                  const Icon = OPENING_ICONS[def.icon] || Square;
                  const isSelected = selectedType === def.type;
                  
                  return (
                    <button
                      key={def.type}
                      onClick={() => handleTypeChange(def.type)}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                        isSelected
                          ? category === 'door'
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-sky-500 bg-sky-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${
                        isSelected
                          ? category === 'door' ? 'text-orange-600' : 'text-sky-600'
                          : 'text-gray-400'
                      }`} />
                      <div className="text-left">
                        <div className={`text-sm font-medium ${
                          isSelected ? 'text-gray-900' : 'text-gray-700'
                        }`}>
                          {def.displayName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {def.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {availableTypes.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">
                    {category === 'window' && !wall?.isExterior
                      ? 'Windows require an exterior wall'
                      : 'No options available for this wall type'}
                  </p>
                </div>
              )}
            </div>

            {/* Width Selection */}
            {currentDef && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Width
                </label>
                <div className="flex gap-2">
                  {currentDef.availableWidths.map((width) => (
                    <button
                      key={width}
                      onClick={() => setSelectedWidth(width)}
                      className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        selectedWidth === width
                          ? category === 'door'
                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-sky-500 bg-sky-50 text-sky-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {width}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Swing Direction (for doors) */}
            {currentDef?.hasSwingDirection && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Swing Direction
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSwingDirection('left')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      swingDirection === 'left'
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Left
                  </button>
                  <button
                    onClick={() => setSwingDirection('right')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      swingDirection === 'right'
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Right
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Validation Warning */}
            {!fitsOnWall && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                <span>⚠️</span>
                <span>This opening is too wide for the selected position</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!fitsOnWall || availableTypes.length === 0}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                fitsOnWall && availableTypes.length > 0
                  ? category === 'door'
                    ? 'bg-orange-500 hover:bg-orange-600'
                    : 'bg-sky-500 hover:bg-sky-600'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              Add {category === 'door' ? 'Door' : 'Window'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default OpeningPlacementModal;


