'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  RefreshCw, 
  AlertTriangle, 
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Code,
} from 'lucide-react';
import { validatePrompt, comparePrompts } from '@/lib/editor/layoutAnalyzer';

interface RegeneratePanelProps {
  currentPrompt: string;
  originalPrompt: string;
  originalSeed: number;
  isLoading: boolean;
  onRegenerate: (prompt: string, seed: number) => void;
  disabled?: boolean;
}

export function RegeneratePanel({
  currentPrompt,
  originalPrompt,
  originalSeed,
  isLoading,
  onRegenerate,
  disabled,
}: RegeneratePanelProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const validation = validatePrompt(currentPrompt);
  const comparison = comparePrompts(originalPrompt, currentPrompt);
  const hasChanges = comparison.added.length > 0 || 
                     comparison.removed.length > 0 || 
                     comparison.changed.length > 0;
  
  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(currentPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleRegenerate = () => {
    if (!disabled && validation.valid) {
      onRegenerate(currentPrompt, originalSeed);
    }
  };
  
  return (
    <div className="bg-coral-50 border border-coral-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-coral-500" />
          <span className="font-medium text-coral-700 text-sm">Hybrid Mode</span>
        </div>
        
        <button
          onClick={handleRegenerate}
          disabled={disabled || isLoading || !validation.valid}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            disabled || !validation.valid
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-coral-500 text-white hover:bg-coral-600'
          }`}
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Regenerating...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Regenerate</span>
            </>
          )}
        </button>
      </div>
      
      {/* Info Section */}
      <div className="px-3 pb-3">
        <p className="text-xs text-coral-600 mb-3">
          Your edits will be used to build a new prompt. Regenerating uses the original seed ({originalSeed}) to maintain design similarity.
        </p>
        
        {/* Changes Summary */}
        {hasChanges && (
          <div className="mb-3 p-2 bg-white/60 rounded border border-coral-100">
            <div className="text-xs font-medium text-coral-700 mb-1">Changes detected:</div>
            <div className="space-y-0.5 text-xs">
              {comparison.added.length > 0 && (
                <div className="text-green-600">
                  + {comparison.added.length} room{comparison.added.length > 1 ? 's' : ''} added
                </div>
              )}
              {comparison.removed.length > 0 && (
                <div className="text-red-600">
                  - {comparison.removed.length} room{comparison.removed.length > 1 ? 's' : ''} removed
                </div>
              )}
              {comparison.changed.length > 0 && (
                <div className="text-amber-600">
                  ~ {comparison.changed.length} room{comparison.changed.length > 1 ? 's' : ''} resized
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Token Warning */}
        {!validation.valid && (
          <div className="mb-3 flex items-start gap-2 p-2 bg-amber-50 rounded border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700">
              <div className="font-medium">Token limit exceeded</div>
              <div>{validation.tokenCount} / {validation.limit} tokens. Remove some rooms to regenerate.</div>
            </div>
          </div>
        )}
        
        {/* Token Count */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-coral-600">
            Tokens: {validation.tokenCount} / {validation.limit}
          </span>
          
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="flex items-center gap-1 text-coral-600 hover:text-coral-700 transition-colors"
          >
            <Code className="w-3 h-3" />
            <span>{showPrompt ? 'Hide' : 'Show'} Prompt</span>
            {showPrompt ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>
      
      {/* Prompt Preview */}
      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-coral-200 p-3 bg-white/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-coral-700">Generated Prompt</span>
                <button
                  onClick={handleCopyPrompt}
                  className="flex items-center gap-1 text-xs text-coral-600 hover:text-coral-700 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="text-xs bg-white p-2 rounded border border-coral-100 overflow-x-auto whitespace-pre-wrap font-mono text-drafted-gray">
                {currentPrompt}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Compact version for toolbar
export function RegenerateButton({
  isLoading,
  onClick,
  disabled,
  hasChanges,
}: {
  isLoading: boolean;
  onClick: () => void;
  disabled?: boolean;
  hasChanges?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`relative flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
        disabled
          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
          : 'bg-coral-500 text-white hover:bg-coral-600'
      }`}
    >
      {isLoading ? (
        <>
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Regenerating...</span>
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4" />
          <span>Regenerate</span>
        </>
      )}
      
      {/* Change indicator */}
      {hasChanges && !isLoading && (
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
      )}
    </button>
  );
}






