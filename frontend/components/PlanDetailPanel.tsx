'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Edit3, 
  Download, 
  PenTool,
  Check,
  ChevronLeft
} from 'lucide-react';
import type { UploadedPlan } from '@/lib/types';

interface PlanDetailPanelProps {
  plan: UploadedPlan | null;
  thumbnail: string | undefined;
  stylizedThumbnail: string | undefined;
  onClose: () => void;
  onEdit: () => void;
  onRename: (newName: string) => Promise<boolean>;
  isOpen: boolean;
}

export function PlanDetailPanel({
  plan,
  thumbnail,
  stylizedThumbnail,
  onClose,
  onEdit,
  onRename,
  isOpen,
}: PlanDetailPanelProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [showColoredVersion, setShowColoredVersion] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Reset state when panel opens with new plan
  useEffect(() => {
    if (plan) {
      setNewName(plan.display_name || plan.filename || 'Untitled');
      setIsRenaming(false);
      setShowColoredVersion(false);
    }
  }, [plan]);
  
  // Focus input when renaming starts
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);
  
  const handleRename = async () => {
    if (!plan || !newName.trim()) return;
    
    const success = await onRename(newName.trim());
    if (success) {
      setIsRenaming(false);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
      setNewName(plan?.display_name || plan?.filename || 'Untitled');
    }
  };
  
  const handleDownload = () => {
    const imageToDownload = stylizedThumbnail || thumbnail;
    if (!imageToDownload) return;
    
    // Create download link
    const link = document.createElement('a');
    link.href = imageToDownload;
    link.download = `${plan?.display_name || plan?.filename || 'floor-plan'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Display image: prefer stylized, fall back to colored
  const displayImage = showColoredVersion ? thumbnail : (stylizedThumbnail || thumbnail);

  return (
    <AnimatePresence>
      {isOpen && plan && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />
          
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-drafted-border">
              <button
                onClick={onClose}
                className="flex items-center gap-2 text-drafted-gray hover:text-drafted-black transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Back</span>
              </button>
              
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-drafted-bg transition-colors"
              >
                <X className="w-5 h-5 text-drafted-gray" />
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Image */}
              <div className="relative bg-drafted-bg">
                {displayImage ? (
                  <img
                    src={displayImage}
                    alt={plan.display_name || plan.filename || 'Floor Plan'}
                    className="w-full h-auto object-contain"
                    style={{ maxHeight: '50vh' }}
                  />
                ) : (
                  <div className="w-full h-64 flex items-center justify-center">
                    <span className="text-drafted-light">Loading...</span>
                  </div>
                )}
                
                {/* Toggle view button (if both versions available) */}
                {stylizedThumbnail && thumbnail && (
                  <button
                    onClick={() => setShowColoredVersion(!showColoredVersion)}
                    className="absolute bottom-4 right-4 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full text-xs font-medium text-drafted-gray hover:text-drafted-black shadow-sm transition-colors"
                  >
                    {showColoredVersion ? 'View Rendered' : 'View Analysis'}
                  </button>
                )}
              </div>
              
              {/* Plan Info */}
              <div className="p-6">
                {/* Name */}
                <div className="mb-6">
                  {isRenaming ? (
                    <div className="flex items-center gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 text-xl font-serif font-bold text-drafted-black bg-drafted-bg px-3 py-2 rounded-drafted border border-drafted-border focus:outline-none focus:border-coral-400"
                      />
                      <button
                        onClick={handleRename}
                        className="w-10 h-10 flex items-center justify-center rounded-drafted bg-coral-500 text-white hover:bg-coral-600 transition-colors"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 group">
                      <h2 className="text-xl font-serif font-bold text-drafted-black">
                        {plan.display_name || plan.filename || 'Untitled'}
                      </h2>
                      <button
                        onClick={() => setIsRenaming(true)}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-drafted-bg opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <PenTool className="w-4 h-4 text-drafted-gray" />
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Meta info */}
                <div className="mb-6 pb-6 border-b border-drafted-border">
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-drafted-light mb-1">Plan ID</dt>
                      <dd className="text-drafted-black font-mono text-xs">{plan.id}</dd>
                    </div>
                    <div>
                      <dt className="text-drafted-light mb-1">Type</dt>
                      <dd className="text-drafted-black capitalize">
                        {plan.id.startsWith('edit_') ? 'Edited' : 'Generated'}
                      </dd>
                    </div>
                  </dl>
                </div>
                
                {/* Actions */}
                <div className="space-y-3">
                  <button
                    onClick={onEdit}
                    className="w-full btn-drafted-coral py-3 flex items-center justify-center gap-2"
                  >
                    <Edit3 className="w-5 h-5" />
                    Edit with AI
                  </button>
                  
                  <button
                    onClick={handleDownload}
                    disabled={!displayImage}
                    className="w-full btn-drafted-outline py-3 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Download className="w-5 h-5" />
                    Download
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}







