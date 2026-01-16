'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  DoorOpen, 
  DoorClosed, 
  PanelLeftOpen, 
  Columns2,
  Square,
  Warehouse,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { WallSegment } from '@/lib/editor/openingTypes';
import { inchesToSvgPixels } from '@/lib/editor/openingTypes';
import type { 
  DoorWindowAsset, 
  AssetCategory, 
  CategoryGroup,
} from '@/lib/editor/assetManifest';
import {
  loadAssetManifest,
  getAssetsByCategory,
  getAvailableSizes,
  findBestAsset,
  formatInches,
  CATEGORY_METADATA,
  getDoorCategories,
  getWindowCategories,
  getGarageCategories,
  getAssetUrl,
} from '@/lib/editor/assetManifest';

interface OpeningPlacementModalProps {
  isOpen: boolean;
  wall: WallSegment | null;
  positionOnWall: number;
  onClose: () => void;
  onConfirm: (opening: {
    asset: DoorWindowAsset;
    widthInches: number;
    swingDirection?: 'left' | 'right';
  }) => void;
}

// Icon mapping for asset categories
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'DoorOpen': DoorOpen,
  'DoorClosed': DoorClosed,
  'PanelLeftOpen': PanelLeftOpen,
  'Columns2': Columns2,
  'Square': Square,
  'Warehouse': Warehouse,
};

/**
 * Modal for selecting door/window assets from the asset library.
 * 
 * Features:
 * - Category tabs (Doors / Windows / Garage)
 * - Subcategory selection within each tab
 * - Size selector from available asset sizes
 * - Swing direction toggle for applicable doors
 * - Asset preview thumbnail
 * - Validation based on wall type
 */
export function OpeningPlacementModal({
  isOpen,
  wall,
  positionOnWall,
  onClose,
  onConfirm,
}: OpeningPlacementModalProps) {
  // Asset manifest state
  const [assets, setAssets] = useState<DoorWindowAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Selection state
  const [categoryGroup, setCategoryGroup] = useState<CategoryGroup>('door');
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory | null>(null);
  const [selectedSize, setSelectedSize] = useState<number | null>(null);
  const [swingDirection, setSwingDirection] = useState<'left' | 'right'>('right');
  const [preferHalfSwing, setPreferHalfSwing] = useState(false);

  // Load asset manifest on mount
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      
      loadAssetManifest()
        .then((loadedAssets) => {
          setAssets(loadedAssets);
          setLoading(false);
        })
        .catch((err) => {
          console.error('[OpeningPlacementModal] Failed to load assets:', err);
          setError('Failed to load door/window assets');
          setLoading(false);
        });
    }
  }, [isOpen]);

  // Get available categories for current group
  const availableCategories = useMemo(() => {
    let categories: AssetCategory[];
    
    switch (categoryGroup) {
      case 'door':
        categories = getDoorCategories();
        break;
      case 'window':
        categories = getWindowCategories();
        break;
      case 'garage':
        categories = getGarageCategories();
        break;
      default:
        categories = [];
    }
    
    // Filter by wall type if needed
    if (wall && !wall.isExterior) {
      categories = categories.filter(cat => !CATEGORY_METADATA[cat].isExterior);
    }
    
    // Only include categories that have assets
    return categories.filter(cat => 
      getAssetsByCategory(assets, cat).length > 0
    );
  }, [categoryGroup, wall, assets]);

  // Auto-select first category when group changes or categories load
  useEffect(() => {
    if (availableCategories.length > 0 && !availableCategories.includes(selectedCategory as AssetCategory)) {
      setSelectedCategory(availableCategories[0]);
    }
  }, [availableCategories, selectedCategory]);

  // Get available sizes for selected category
  const availableSizes = useMemo(() => {
    if (!selectedCategory) return [];
    return getAvailableSizes(assets, selectedCategory);
  }, [assets, selectedCategory]);

  // Auto-select default size when category changes
  useEffect(() => {
    if (availableSizes.length > 0 && !availableSizes.includes(selectedSize as number)) {
      // Select a reasonable default (36" for doors, 36" for windows, or first available)
      const defaultSize = availableSizes.includes(36) ? 36 : availableSizes[Math.floor(availableSizes.length / 2)];
      setSelectedSize(defaultSize);
    }
  }, [availableSizes, selectedSize]);

  // Get the selected asset
  const selectedAsset = useMemo(() => {
    if (!selectedCategory || !selectedSize) return null;
    return findBestAsset(assets, selectedCategory, selectedSize, preferHalfSwing);
  }, [assets, selectedCategory, selectedSize, preferHalfSwing]);

  // Check if selected category has swing direction
  const hasSwingDirection = useMemo(() => {
    if (!selectedCategory) return false;
    return CATEGORY_METADATA[selectedCategory].hasSwing;
  }, [selectedCategory]);

  // Check if opening fits on wall
  const fitsOnWall = useMemo(() => {
    if (!wall || !selectedSize) return true;
    const widthSvg = inchesToSvgPixels(selectedSize);
    const margin = widthSvg / 2;
    const positionPx = positionOnWall * wall.length;
    return positionPx - margin >= 0 && positionPx + margin <= wall.length;
  }, [wall, selectedSize, positionOnWall]);

  // Handle category group change
  const handleCategoryGroupChange = useCallback((group: CategoryGroup) => {
    setCategoryGroup(group);
    setSelectedCategory(null);
    setSelectedSize(null);
  }, []);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (!selectedAsset || !fitsOnWall) return;
    
    onConfirm({
      asset: selectedAsset,
      widthInches: selectedAsset.inches,
      swingDirection: hasSwingDirection ? swingDirection : undefined,
    });
  }, [selectedAsset, fitsOnWall, hasSwingDirection, swingDirection, onConfirm]);

  if (!isOpen) return null;

  // Get accent color based on category group
  const accentColor = categoryGroup === 'door' ? 'orange' : categoryGroup === 'window' ? 'sky' : 'emerald';

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
          className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Add {categoryGroup === 'door' ? 'Door' : categoryGroup === 'window' ? 'Window' : 'Garage Door'}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Category Group Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => handleCategoryGroupChange('door')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                categoryGroup === 'door'
                  ? 'text-orange-600 border-b-2 border-orange-500 bg-orange-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <DoorOpen className="w-4 h-4 inline-block mr-2" />
              Doors
            </button>
            <button
              onClick={() => handleCategoryGroupChange('window')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                categoryGroup === 'window'
                  ? 'text-sky-600 border-b-2 border-sky-500 bg-sky-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Square className="w-4 h-4 inline-block mr-2" />
              Windows
            </button>
            <button
              onClick={() => handleCategoryGroupChange('garage')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                categoryGroup === 'garage'
                  ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Warehouse className="w-4 h-4 inline-block mr-2" />
              Garage
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {!loading && !error && (
              <>
                {/* Wall Info */}
                {wall && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span className={`w-2 h-2 rounded-full ${wall.isExterior ? 'bg-sky-400' : 'bg-orange-400'}`} />
                    <span>{wall.isExterior ? 'Exterior' : 'Interior'} wall selected</span>
                  </div>
                )}

                {/* Category Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Type
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {availableCategories.map((cat) => {
                      const meta = CATEGORY_METADATA[cat];
                      const Icon = CATEGORY_ICONS[meta.icon] || Square;
                      const isSelected = selectedCategory === cat;
                      
                      return (
                        <button
                          key={cat}
                          onClick={() => {
                            setSelectedCategory(cat);
                            setSelectedSize(null);
                          }}
                          className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                            isSelected
                              ? `border-${accentColor}-500 bg-${accentColor}-50`
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                          style={isSelected ? {
                            borderColor: accentColor === 'orange' ? '#f97316' : accentColor === 'sky' ? '#0ea5e9' : '#10b981',
                            backgroundColor: accentColor === 'orange' ? '#fff7ed' : accentColor === 'sky' ? '#f0f9ff' : '#ecfdf5',
                          } : {}}
                        >
                          <Icon className={`w-5 h-5 ${
                            isSelected
                              ? accentColor === 'orange' ? 'text-orange-600' : accentColor === 'sky' ? 'text-sky-600' : 'text-emerald-600'
                              : 'text-gray-400'
                          }`} />
                          <div className="text-left">
                            <div className={`text-sm font-medium ${
                              isSelected ? 'text-gray-900' : 'text-gray-700'
                            }`}>
                              {meta.displayName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {meta.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {availableCategories.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">
                        {categoryGroup === 'window' && !wall?.isExterior
                          ? 'Windows require an exterior wall'
                          : categoryGroup === 'garage' && !wall?.isExterior
                          ? 'Garage doors require an exterior wall'
                          : 'No options available for this wall type'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Size Selection */}
                {selectedCategory && availableSizes.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Size
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableSizes.map((size) => (
                        <button
                          key={size}
                          onClick={() => setSelectedSize(size)}
                          className={`py-2 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                            selectedSize === size
                              ? accentColor === 'orange' 
                                ? 'border-orange-500 bg-orange-50 text-orange-700'
                                : accentColor === 'sky'
                                ? 'border-sky-500 bg-sky-50 text-sky-700'
                                : 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {formatInches(size)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Swing Direction (for applicable doors) */}
                {hasSwingDirection && (
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
                    
                    {/* Half-swing option for interior doors */}
                    {selectedCategory && (selectedCategory === 'DoorInteriorSingle' || selectedCategory === 'DoorInteriorDouble') && (
                      <label className="flex items-center gap-2 mt-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferHalfSwing}
                          onChange={(e) => setPreferHalfSwing(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                        />
                        <span className="text-sm text-gray-600">Half swing (90° arc)</span>
                      </label>
                    )}
                  </div>
                )}

                {/* Asset Preview */}
                {selectedAsset && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Preview
                    </label>
                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-shrink-0 w-24 h-16 bg-white rounded border border-gray-200 flex items-center justify-center overflow-hidden">
                        <img
                          src={getAssetUrl(selectedAsset.filename)}
                          alt={selectedAsset.displayName}
                          className="max-w-full max-h-full object-contain"
                          style={{ transform: swingDirection === 'left' ? 'scaleX(-1)' : 'none' }}
                        />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {selectedAsset.displayName}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {selectedAsset.description}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {selectedAsset.filename}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Validation Warning */}
                {!fitsOnWall && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>This opening is too wide for the selected position</span>
                  </div>
                )}
              </>
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
              disabled={!selectedAsset || !fitsOnWall || loading}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                selectedAsset && fitsOnWall && !loading
                  ? accentColor === 'orange'
                    ? 'bg-orange-500 hover:bg-orange-600'
                    : accentColor === 'sky'
                    ? 'bg-sky-500 hover:bg-sky-600'
                    : 'bg-emerald-500 hover:bg-emerald-600'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              Add {categoryGroup === 'door' ? 'Door' : categoryGroup === 'window' ? 'Window' : 'Garage Door'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default OpeningPlacementModal;
