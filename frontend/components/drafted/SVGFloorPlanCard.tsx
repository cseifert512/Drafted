'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Wand2, 
  Download, 
  Copy, 
  Check, 
  Pencil, 
  X,
  Maximize2,
  Hash
} from 'lucide-react';
import type { DraftedPlan } from '@/lib/drafted-types';

interface SVGFloorPlanCardProps {
  plan: DraftedPlan;
  index: number;
  onEdit?: (plan: DraftedPlan) => void;
  onSelect?: (plan: DraftedPlan) => void;
  onRename?: (planId: string, newName: string) => Promise<boolean>;
}

export function SVGFloorPlanCard({
  plan,
  index,
  onEdit,
  onSelect,
  onRename,
}: SVGFloorPlanCardProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(plan.display_name || '');
  const [copiedSeed, setCopiedSeed] = useState(false);

  const displayName = plan.display_name || `Floor Plan ${String(index + 1).padStart(2, '0')}`;

  const handleSaveName = async () => {
    if (onRename && nameValue.trim()) {
      await onRename(plan.id, nameValue.trim());
    }
    setIsEditingName(false);
  };

  const handleCopySeed = () => {
    navigator.clipboard.writeText(String(plan.seed));
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const handleDownloadSVG = () => {
    if (!plan.svg) return;
    
    const blob = new Blob([plan.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${displayName.replace(/\s+/g, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-white border border-drafted-border rounded-drafted-xl overflow-hidden group hover:shadow-drafted-lg transition-shadow"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-drafted-border flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-6 h-6 bg-coral-100 rounded flex items-center justify-center flex-shrink-0">
            <Sparkle />
          </div>
          
          {isEditingName ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') setIsEditingName(false);
                }}
                className="flex-1 px-2 py-1 text-sm font-semibold bg-drafted-bg rounded border border-drafted-border focus:outline-none focus:border-coral-500"
                autoFocus
              />
              <button
                onClick={handleSaveName}
                className="w-6 h-6 flex items-center justify-center text-green-600 hover:bg-green-50 rounded"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsEditingName(false)}
                className="w-6 h-6 flex items-center justify-center text-drafted-gray hover:bg-drafted-bg rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <h3 className="font-semibold text-drafted-black truncate">
                {displayName}
              </h3>
              {onRename && (
                <button
                  onClick={() => {
                    setNameValue(displayName);
                    setIsEditingName(true);
                  }}
                  className="w-5 h-5 flex items-center justify-center text-drafted-muted hover:text-drafted-gray opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Seed Badge */}
        <button
          onClick={handleCopySeed}
          className="flex items-center gap-1 px-2 py-1 bg-drafted-bg hover:bg-drafted-border rounded text-xs text-drafted-gray transition-colors"
          title="Click to copy seed"
        >
          {copiedSeed ? (
            <>
              <Check className="w-3 h-3 text-green-600" />
              <span className="text-green-600">Copied</span>
            </>
          ) : (
            <>
              <Hash className="w-3 h-3" />
              <span>{plan.seed}</span>
            </>
          )}
        </button>
      </div>

      {/* SVG Display */}
      <div 
        className={`aspect-square bg-white relative overflow-hidden ${onSelect ? 'cursor-pointer' : ''}`}
        onClick={() => onSelect?.(plan)}
      >
        {plan.svg ? (
          <div 
            className="w-full h-full p-4 flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: plan.svg }}
            style={{
              // Scale SVG to fit
            }}
          />
        ) : plan.image_base64 ? (
          <img
            src={`data:image/jpeg;base64,${plan.image_base64}`}
            alt={displayName}
            className="w-full h-full object-contain p-4"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-drafted-muted">
            No preview available
          </div>
        )}

        {/* Expand button */}
        {onSelect && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(plan);
            }}
            className="absolute top-3 right-3 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
          >
            <Maximize2 className="w-4 h-4 text-drafted-gray" />
          </button>
        )}
      </div>

      {/* Room Summary */}
      <div className="px-4 py-3 border-t border-drafted-border bg-drafted-bg/50">
        <div className="flex items-center justify-between text-xs text-drafted-gray mb-2">
          <span>{plan.rooms.length} rooms</span>
          <span>{plan.total_area_sqft.toLocaleString()} sqft</span>
        </div>
        
        {/* Room pills */}
        <div className="flex flex-wrap gap-1">
          {plan.rooms.slice(0, 6).map((room, i) => (
            <span
              key={`${room.room_type}-${i}`}
              className="px-2 py-0.5 bg-white border border-drafted-border rounded text-xs text-drafted-gray"
            >
              {room.display_name || room.room_type.replace(/_/g, ' ')}
            </span>
          ))}
          {plan.rooms.length > 6 && (
            <span className="px-2 py-0.5 text-xs text-drafted-light">
              +{plan.rooms.length - 6} more
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 flex gap-2">
        {onEdit && (
          <button
            onClick={() => onEdit(plan)}
            className="flex-1 btn-drafted-coral text-sm py-2.5 flex items-center justify-center gap-2"
          >
            <Wand2 className="w-4 h-4" />
            Edit
          </button>
        )}
        <button
          onClick={handleDownloadSVG}
          disabled={!plan.svg}
          className="flex-1 btn-drafted-outline text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          SVG
        </button>
      </div>
    </motion.div>
  );
}

// Sparkle icon
function Sparkle() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-coral-500">
      <path 
        d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" 
        fill="currentColor"
      />
    </svg>
  );
}

