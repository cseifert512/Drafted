'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Check, 
  ArrowLeftRight, 
  Eye,
  Layers,
} from 'lucide-react';
import type { DraftedPlan } from '@/lib/drafted-types';
import type { EditorRoom } from '@/lib/editor/editorTypes';

interface CompareViewProps {
  beforeSvg: string;
  beforeRooms: EditorRoom[];
  afterPlan: DraftedPlan;
  onAccept: () => void;
  onReject: () => void;
}

type CompareMode = 'side-by-side' | 'overlay' | 'slider';

export function CompareView({
  beforeSvg,
  beforeRooms,
  afterPlan,
  onAccept,
  onReject,
}: CompareViewProps) {
  const [mode, setMode] = useState<CompareMode>('side-by-side');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  
  const beforeArea = beforeRooms.reduce((sum, r) => sum + r.areaSqft, 0);
  const afterArea = afterPlan.total_area_sqft;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-drafted-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-drafted-black">Compare Results</h2>
            <p className="text-sm text-drafted-gray">
              Review the regenerated floor plan before accepting
            </p>
          </div>
          
          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 bg-drafted-bg rounded-lg p-1">
            <button
              onClick={() => setMode('side-by-side')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                mode === 'side-by-side'
                  ? 'bg-white shadow-sm text-drafted-black'
                  : 'text-drafted-gray hover:text-drafted-black'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>Side by Side</span>
            </button>
            <button
              onClick={() => setMode('overlay')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                mode === 'overlay'
                  ? 'bg-white shadow-sm text-drafted-black'
                  : 'text-drafted-gray hover:text-drafted-black'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Overlay</span>
            </button>
            <button
              onClick={() => setMode('slider')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                mode === 'slider'
                  ? 'bg-white shadow-sm text-drafted-black'
                  : 'text-drafted-gray hover:text-drafted-black'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>Slider</span>
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-hidden p-4">
          {mode === 'side-by-side' && (
            <div className="grid grid-cols-2 gap-4 h-full">
              {/* Before */}
              <div className="flex flex-col h-full">
                <div className="text-sm font-medium text-drafted-gray mb-2 flex items-center justify-between">
                  <span>Before (Your Edits)</span>
                  <span className="text-drafted-muted">{Math.round(beforeArea)} sqft</span>
                </div>
                <div className="flex-1 bg-drafted-bg rounded-lg border border-drafted-border overflow-hidden">
                  <div 
                    className="w-full h-full p-4"
                    dangerouslySetInnerHTML={{ __html: beforeSvg }}
                  />
                </div>
              </div>
              
              {/* After */}
              <div className="flex flex-col h-full">
                <div className="text-sm font-medium text-drafted-gray mb-2 flex items-center justify-between">
                  <span>After (Regenerated)</span>
                  <span className="text-drafted-muted">{Math.round(afterArea)} sqft</span>
                </div>
                <div className="flex-1 bg-drafted-bg rounded-lg border border-drafted-border overflow-hidden">
                  {afterPlan.svg ? (
                    <div 
                      className="w-full h-full p-4"
                      dangerouslySetInnerHTML={{ __html: afterPlan.svg }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-drafted-muted">
                      No SVG available
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {mode === 'overlay' && (
            <div className="h-full flex flex-col">
              <div className="mb-3 flex items-center gap-4">
                <span className="text-sm text-drafted-gray">Overlay Opacity:</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                  className="flex-1 max-w-xs"
                />
                <span className="text-sm text-drafted-muted w-12">{Math.round(overlayOpacity * 100)}%</span>
              </div>
              <div className="flex-1 bg-drafted-bg rounded-lg border border-drafted-border overflow-hidden relative">
                {/* Before (base layer) */}
                <div 
                  className="absolute inset-0 p-4"
                  dangerouslySetInnerHTML={{ __html: beforeSvg }}
                />
                {/* After (overlay) */}
                {afterPlan.svg && (
                  <div 
                    className="absolute inset-0 p-4"
                    style={{ opacity: overlayOpacity }}
                    dangerouslySetInnerHTML={{ __html: afterPlan.svg }}
                  />
                )}
              </div>
            </div>
          )}
          
          {mode === 'slider' && (
            <div className="h-full flex flex-col">
              <div className="mb-3 flex items-center gap-4">
                <span className="text-sm text-drafted-gray">Slide to compare:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPosition}
                  onChange={(e) => setSliderPosition(parseInt(e.target.value))}
                  className="flex-1"
                />
              </div>
              <div className="flex-1 bg-drafted-bg rounded-lg border border-drafted-border overflow-hidden relative">
                {/* After (full width) */}
                {afterPlan.svg && (
                  <div 
                    className="absolute inset-0 p-4"
                    dangerouslySetInnerHTML={{ __html: afterPlan.svg }}
                  />
                )}
                {/* Before (clipped) */}
                <div 
                  className="absolute inset-0 p-4 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                  dangerouslySetInnerHTML={{ __html: beforeSvg }}
                />
                {/* Slider line */}
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-coral-500 shadow-lg"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-coral-500 rounded-full flex items-center justify-center">
                    <ArrowLeftRight className="w-3 h-3 text-white" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Room Comparison */}
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-drafted-gray">Before:</span>
              <span className="ml-2 text-drafted-black">{beforeRooms.length} rooms</span>
            </div>
            <div>
              <span className="text-drafted-gray">After:</span>
              <span className="ml-2 text-drafted-black">{afterPlan.rooms.length} rooms</span>
            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div className="p-4 border-t border-drafted-border flex items-center justify-between bg-drafted-bg/50">
          <p className="text-sm text-drafted-gray">
            Accepting will replace your current edits with the regenerated plan.
          </p>
          
          <div className="flex items-center gap-3">
            <button
              onClick={onReject}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-drafted-border bg-white text-drafted-gray hover:bg-drafted-bg transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Keep Edits</span>
            </button>
            <button
              onClick={onAccept}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-coral-500 text-white hover:bg-coral-600 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Accept Regeneration</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}





