'use client';

import { motion } from 'framer-motion';
import { Pencil, Sparkles, Info } from 'lucide-react';
import type { EditorMode } from '@/lib/editor/editorTypes';

interface ModeToggleProps {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  disabled?: boolean;
}

export function ModeToggle({ mode, onModeChange, disabled }: ModeToggleProps) {
  const isDirect = mode === 'direct';
  
  return (
    <div className="flex items-center gap-3">
      {/* Mode Label */}
      <span className="text-sm font-medium text-drafted-gray">Edit Mode:</span>
      
      {/* Toggle Container */}
      <div className="relative flex bg-drafted-bg rounded-full p-1 border border-drafted-border">
        {/* Sliding Background */}
        <motion.div
          className="absolute top-1 bottom-1 rounded-full bg-white shadow-sm"
          initial={false}
          animate={{
            left: isDirect ? '4px' : '50%',
            width: 'calc(50% - 4px)',
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
        
        {/* Direct Mode Button */}
        <button
          onClick={() => onModeChange('direct')}
          disabled={disabled}
          className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            isDirect 
              ? 'text-drafted-black' 
              : 'text-drafted-gray hover:text-drafted-black'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Pencil className="w-3.5 h-3.5" />
          <span>Direct</span>
        </button>
        
        {/* Hybrid Mode Button */}
        <button
          onClick={() => onModeChange('hybrid')}
          disabled={disabled}
          className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !isDirect 
              ? 'text-coral-600' 
              : 'text-drafted-gray hover:text-drafted-black'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Hybrid</span>
        </button>
      </div>
      
      {/* Info Tooltip */}
      <div className="relative group">
        <button className="p-1 text-drafted-muted hover:text-drafted-gray transition-colors">
          <Info className="w-4 h-4" />
        </button>
        
        {/* Tooltip */}
        <div className="absolute left-0 top-full mt-2 w-72 p-3 bg-white rounded-lg shadow-lg border border-drafted-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium text-drafted-black flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" />
                Direct Mode
              </span>
              <p className="text-drafted-gray mt-0.5">
                Pure local editing. Move and resize rooms directly with grid snapping.
                Changes are immediate—no AI regeneration.
              </p>
            </div>
            <div className="border-t border-drafted-border pt-2">
              <span className="font-medium text-coral-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Hybrid Mode
              </span>
              <p className="text-drafted-gray mt-0.5">
                Edit directly, then click "Regenerate" to have AI refine the layout.
                Uses your changes as guidance while maintaining design coherence.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact version for toolbar
export function ModeToggleCompact({ mode, onModeChange, disabled }: ModeToggleProps) {
  const isDirect = mode === 'direct';
  
  return (
    <button
      onClick={() => onModeChange(isDirect ? 'hybrid' : 'direct')}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        isDirect
          ? 'bg-drafted-bg border-drafted-border text-drafted-gray hover:bg-white'
          : 'bg-coral-50 border-coral-200 text-coral-600 hover:bg-coral-100'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={isDirect ? 'Switch to Hybrid mode' : 'Switch to Direct mode'}
    >
      {isDirect ? (
        <>
          <Pencil className="w-3 h-3" />
          <span>Direct</span>
        </>
      ) : (
        <>
          <Sparkles className="w-3 h-3" />
          <span>Hybrid</span>
        </>
      )}
    </button>
  );
}


