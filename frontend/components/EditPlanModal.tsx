'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Wand2, Sparkles } from 'lucide-react';

interface EditPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (instruction: string) => Promise<void>;
  planName?: string;
  isLoading?: boolean;
}

const QUICK_EDITS = [
  { label: 'Add a pool', instruction: 'Add a rectangular swimming pool to the backyard area' },
  { label: 'Open concept kitchen', instruction: 'Make the kitchen open concept by removing walls between kitchen and living room' },
  { label: 'Add an office', instruction: 'Add a home office room near the entrance' },
  { label: 'Expand master bedroom', instruction: 'Make the master bedroom larger' },
  { label: 'Add walk-in closet', instruction: 'Add a walk-in closet to the master bedroom' },
  { label: 'Add mudroom', instruction: 'Add a mudroom near the garage entrance' },
  { label: 'Add bathroom', instruction: 'Add an additional bathroom' },
  { label: 'Add pantry', instruction: 'Add a pantry room next to the kitchen' },
];

export function EditPlanModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  planName,
  isLoading = false 
}: EditPlanModalProps) {
  const [instruction, setInstruction] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim() || isLoading) return;
    await onSubmit(instruction.trim());
    setInstruction('');
  };

  const handleQuickEdit = async (quickInstruction: string) => {
    if (isLoading) return;
    await onSubmit(quickInstruction);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white rounded-drafted-xl shadow-drafted-lg max-w-lg w-full overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-drafted-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-coral-100 rounded-drafted flex items-center justify-center">
                <Wand2 className="w-5 h-5 text-coral-500" />
              </div>
              <div>
                <h2 className="font-serif font-bold text-drafted-black">Edit Floor Plan</h2>
                {planName && (
                  <p className="text-sm text-drafted-gray">{planName}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-drafted-bg transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5 text-drafted-gray" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Quick Edits */}
            <div className="mb-6">
              <label className="text-xs font-medium text-drafted-light uppercase tracking-wider mb-3 block">
                Quick Edits
              </label>
              <div className="flex flex-wrap gap-2">
                {QUICK_EDITS.map((edit) => (
                  <button
                    key={edit.label}
                    onClick={() => handleQuickEdit(edit.instruction)}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm bg-drafted-bg hover:bg-drafted-border text-drafted-gray rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {edit.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Edit */}
            <form onSubmit={handleSubmit}>
              <label className="text-xs font-medium text-drafted-light uppercase tracking-wider mb-2 block">
                Custom Edit Instruction
              </label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Describe your edit... (e.g., 'Add a sunroom off the living area')"
                disabled={isLoading}
                rows={3}
                className="w-full px-4 py-3 bg-drafted-bg border border-drafted-border rounded-drafted text-drafted-black placeholder:text-drafted-muted focus:outline-none focus:ring-2 focus:ring-coral-500/20 focus:border-coral-500 resize-none disabled:opacity-50"
              />

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!instruction.trim() || isLoading}
                className="w-full mt-4 btn-drafted-coral py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Editing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Apply Edit
                  </>
                )}
              </button>
            </form>

            {/* Info */}
            <p className="mt-4 text-xs text-drafted-light text-center">
              Edits create a new floor plan based on your instructions. The original is preserved.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

