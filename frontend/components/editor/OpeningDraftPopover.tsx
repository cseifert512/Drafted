'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Check, 
  X, 
  ChevronDown,
  DoorOpen,
  Square,
  Warehouse,
  Loader2,
} from 'lucide-react';
import type { 
  DoorWindowAsset, 
  AssetCategory, 
  CategoryGroup 
} from '@/lib/editor/assetManifest';
import {
  loadAssetManifest,
  getAssetsByCategoryGroup,
  getAvailableSizes,
  findBestAsset,
  formatInches,
  CATEGORY_METADATA,
  getAssetUrl,
} from '@/lib/editor/assetManifest';

// =============================================================================
// TYPES
// =============================================================================

interface OpeningDraftPopoverProps {
  isVisible: boolean;
  position: { x: number; y: number };
  matchedAsset: DoorWindowAsset | null;
  currentWidthInches: number;
  snappedWidthInches: number | null;
  categoryGroup: CategoryGroup;
  isExteriorWall: boolean;
  swingDirection: 'left' | 'right';
  onCategoryGroupChange: (group: CategoryGroup) => void;
  onSwingDirectionChange: (direction: 'left' | 'right') => void;
  onAssetSelect: (asset: DoorWindowAsset) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

// =============================================================================
// CATEGORY GROUP ICONS
// =============================================================================

const CATEGORY_GROUP_ICONS: Record<CategoryGroup, React.ComponentType<{ className?: string }>> = {
  door: DoorOpen,
  window: Square,
  garage: Warehouse,
};

// =============================================================================
// COMPONENT
// =============================================================================

export function OpeningDraftPopover({
  isVisible,
  position,
  matchedAsset,
  currentWidthInches,
  snappedWidthInches,
  categoryGroup,
  isExteriorWall,
  swingDirection,
  onCategoryGroupChange,
  onSwingDirectionChange,
  onAssetSelect,
  onConfirm,
  onCancel,
}: OpeningDraftPopoverProps) {
  // Asset manifest
  const [assets, setAssets] = useState<DoorWindowAsset[]>([]);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  
  // Load assets
  useEffect(() => {
    loadAssetManifest()
      .then(loadedAssets => {
        setAssets(loadedAssets);
        setAssetsLoaded(true);
      })
      .catch(err => {
        console.error('[OpeningDraftPopover] Failed to load assets:', err);
      });
  }, []);
  
  // Get available categories for current group
  const availableCategories = useMemo(() => {
    const groupAssets = getAssetsByCategoryGroup(assets, categoryGroup);
    
    // Filter by wall type
    const validAssets = isExteriorWall 
      ? groupAssets 
      : groupAssets.filter(a => !CATEGORY_METADATA[a.category].isExterior);
    
    // Get unique categories
    const categories = Array.from(new Set(validAssets.map(a => a.category)));
    return categories;
  }, [assets, categoryGroup, isExteriorWall]);
  
  // Get available assets for dropdown
  const availableAssets = useMemo(() => {
    if (!matchedAsset) return [];
    
    // Get all assets in the matched category
    const categoryAssets = assets.filter(a => a.category === matchedAsset.category);
    return categoryAssets.sort((a, b) => a.inches - b.inches);
  }, [assets, matchedAsset]);
  
  // Accent color based on category
  const accentColor = useMemo(() => {
    switch (categoryGroup) {
      case 'door': return { bg: 'bg-orange-500', text: 'text-orange-600', border: 'border-orange-500', light: 'bg-orange-50' };
      case 'window': return { bg: 'bg-sky-500', text: 'text-sky-600', border: 'border-sky-500', light: 'bg-sky-50' };
      case 'garage': return { bg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-500', light: 'bg-emerald-50' };
    }
  }, [categoryGroup]);
  
  // Handle category group change
  const handleCategoryGroupClick = useCallback((group: CategoryGroup) => {
    // Check if this group is valid for the wall type
    if (!isExteriorWall && (group === 'window' || group === 'garage')) {
      return; // Windows and garage doors require exterior walls
    }
    onCategoryGroupChange(group);
  }, [isExteriorWall, onCategoryGroupChange]);
  
  // Handle asset selection from dropdown
  const handleAssetSelect = useCallback((asset: DoorWindowAsset) => {
    onAssetSelect(asset);
    setShowTypeDropdown(false);
  }, [onAssetSelect]);
  
  if (!isVisible) return null;
  
  const displayWidth = snappedWidthInches ?? Math.round(currentWidthInches);
  const Icon = CATEGORY_GROUP_ICONS[categoryGroup];
  
  return (
    <AnimatePresence>
      <motion.div
        className="absolute z-50 pointer-events-auto"
        style={{
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -100%)',
        }}
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        transition={{ duration: 0.15 }}
      >
        {/* Main popover container */}
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden min-w-[240px]">
          {/* Header with category tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => handleCategoryGroupClick('door')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                categoryGroup === 'door'
                  ? 'text-orange-600 bg-orange-50 border-b-2 border-orange-500'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <DoorOpen className="w-3.5 h-3.5" />
              Door
            </button>
            <button
              onClick={() => handleCategoryGroupClick('window')}
              disabled={!isExteriorWall}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                categoryGroup === 'window'
                  ? 'text-sky-600 bg-sky-50 border-b-2 border-sky-500'
                  : !isExteriorWall
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              Window
            </button>
            <button
              onClick={() => handleCategoryGroupClick('garage')}
              disabled={!isExteriorWall}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                categoryGroup === 'garage'
                  ? 'text-emerald-600 bg-emerald-50 border-b-2 border-emerald-500'
                  : !isExteriorWall
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Warehouse className="w-3.5 h-3.5" />
              Garage
            </button>
          </div>
          
          {/* Content */}
          <div className="p-3">
            {/* Asset info and type selector */}
            <div className="relative">
              <button
                onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg border-2 ${accentColor.border} ${accentColor.light} transition-colors`}
              >
                {/* Asset preview */}
                {matchedAsset && (
                  <div className="w-10 h-8 bg-white rounded border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={getAssetUrl(matchedAsset.filename)}
                      alt={matchedAsset.displayName}
                      className="max-w-full max-h-full object-contain"
                      style={{ transform: swingDirection === 'left' ? 'scaleX(-1)' : 'none' }}
                    />
                  </div>
                )}
                
                {/* Asset name and size */}
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-gray-900">
                    {matchedAsset?.displayName || 'Select type...'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatInches(displayWidth)}
                    {snappedWidthInches && snappedWidthInches !== Math.round(currentWidthInches) && (
                      <span className="ml-1 text-gray-400">(snapped)</span>
                    )}
                  </div>
                </div>
                
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showTypeDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {/* Type dropdown */}
              <AnimatePresence>
                {showTypeDropdown && (
                  <motion.div
                    className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-10 max-h-48 overflow-y-auto"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.1 }}
                  >
                    {availableAssets.map((asset) => (
                      <button
                        key={asset.filename}
                        onClick={() => handleAssetSelect(asset)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors ${
                          matchedAsset?.filename === asset.filename ? accentColor.light : ''
                        }`}
                      >
                        <div className="w-8 h-6 bg-white rounded border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                          <img
                            src={getAssetUrl(asset.filename)}
                            alt={asset.displayName}
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-gray-900">{formatInches(asset.inches)}</div>
                          <div className="text-xs text-gray-500">{asset.description}</div>
                        </div>
                        {matchedAsset?.filename === asset.filename && (
                          <Check className={`w-4 h-4 ${accentColor.text}`} />
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* Swing direction (for doors with swing) */}
            {matchedAsset?.hasSwing && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => onSwingDirectionChange('left')}
                  className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border-2 transition-colors ${
                    swingDirection === 'left'
                      ? `${accentColor.border} ${accentColor.light} ${accentColor.text}`
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  ← Left Swing
                </button>
                <button
                  onClick={() => onSwingDirectionChange('right')}
                  className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border-2 transition-colors ${
                    swingDirection === 'right'
                      ? `${accentColor.border} ${accentColor.light} ${accentColor.text}`
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Right Swing →
                </button>
              </div>
            )}
          </div>
          
          {/* Footer with actions */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
            
            <button
              onClick={onConfirm}
              disabled={!matchedAsset}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white rounded-lg transition-colors ${
                matchedAsset
                  ? `${accentColor.bg} hover:opacity-90`
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              Draft
            </button>
          </div>
        </div>
        
        {/* Arrow pointing down */}
        <div 
          className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0"
          style={{
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid white',
          }}
        />
      </motion.div>
    </AnimatePresence>
  );
}

export default OpeningDraftPopover;

