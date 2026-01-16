'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { computePromptDiff, getPromptDiffSummary, estimateTokenCount, PromptDiffLine } from '@/lib/dev/promptDiff';

interface PromptCompareViewProps {
  originalPrompt: string;
  editedPrompt: string;
  className?: string;
}

export function PromptCompareView({ originalPrompt, editedPrompt, className = '' }: PromptCompareViewProps) {
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedEdited, setCopiedEdited] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [showUnchanged, setShowUnchanged] = useState(false);
  
  const diffLines = useMemo(
    () => computePromptDiff(originalPrompt, editedPrompt),
    [originalPrompt, editedPrompt]
  );
  
  const summary = useMemo(
    () => getPromptDiffSummary(diffLines),
    [diffLines]
  );
  
  const originalTokens = estimateTokenCount(originalPrompt);
  const editedTokens = estimateTokenCount(editedPrompt);
  
  const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };
  
  const filteredLines = showUnchanged
    ? diffLines
    : diffLines.filter(line => line.type !== 'unchanged');
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Summary Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold text-drafted-black">Prompt Comparison</h4>
          <div className="flex items-center gap-2 text-xs">
            {summary.added > 0 && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                +{summary.added} added
              </span>
            )}
            {summary.removed > 0 && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                -{summary.removed} removed
              </span>
            )}
            {summary.modified > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                ~{summary.modified} modified
              </span>
            )}
          </div>
        </div>
        
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-drafted-gray hover:text-drafted-black transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Expand
            </>
          )}
        </button>
      </div>
      
      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-4"
        >
          {/* Side by Side Prompts */}
          <div className="grid grid-cols-2 gap-4">
            {/* Original Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-drafted-gray">Original Prompt</span>
                  <span className="text-xs px-1.5 py-0.5 bg-drafted-bg rounded font-mono text-drafted-muted">
                    ~{originalTokens} tokens
                  </span>
                </div>
                <button
                  onClick={() => copyToClipboard(originalPrompt, setCopiedOriginal)}
                  className="p-1 hover:bg-drafted-bg rounded transition-colors"
                  title="Copy prompt"
                >
                  {copiedOriginal ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-drafted-gray" />
                  )}
                </button>
              </div>
              <pre className="p-3 bg-drafted-bg rounded-lg text-xs font-mono text-drafted-gray overflow-x-auto max-h-60 overflow-y-auto">
                {originalPrompt || '(empty)'}
              </pre>
            </div>
            
            {/* Edited Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-drafted-gray">Edited Prompt</span>
                  <span className="text-xs px-1.5 py-0.5 bg-drafted-bg rounded font-mono text-drafted-muted">
                    ~{editedTokens} tokens
                  </span>
                </div>
                <button
                  onClick={() => copyToClipboard(editedPrompt, setCopiedEdited)}
                  className="p-1 hover:bg-drafted-bg rounded transition-colors"
                  title="Copy prompt"
                >
                  {copiedEdited ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-drafted-gray" />
                  )}
                </button>
              </div>
              <pre className="p-3 bg-drafted-bg rounded-lg text-xs font-mono text-drafted-gray overflow-x-auto max-h-60 overflow-y-auto">
                {editedPrompt || '(empty)'}
              </pre>
            </div>
          </div>
          
          {/* Diff View */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-drafted-gray">Line-by-Line Diff</span>
              <label className="flex items-center gap-2 text-xs text-drafted-gray cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUnchanged}
                  onChange={(e) => setShowUnchanged(e.target.checked)}
                  className="rounded border-drafted-border"
                />
                Show unchanged
              </label>
            </div>
            
            <div className="border border-drafted-border rounded-lg overflow-hidden">
              <div className="max-h-60 overflow-y-auto">
                {filteredLines.length === 0 ? (
                  <div className="p-4 text-center text-sm text-drafted-gray">
                    No differences found
                  </div>
                ) : (
                  filteredLines.map((line, index) => (
                    <DiffLineRow key={index} line={line} />
                  ))
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

interface DiffLineRowProps {
  line: PromptDiffLine;
}

function DiffLineRow({ line }: DiffLineRowProps) {
  const bgColor = {
    added: 'bg-green-50',
    removed: 'bg-red-50',
    modified: 'bg-amber-50',
    unchanged: 'bg-white',
  }[line.type];
  
  const textColor = {
    added: 'text-green-700',
    removed: 'text-red-700',
    modified: 'text-amber-700',
    unchanged: 'text-drafted-gray',
  }[line.type];
  
  const prefix = {
    added: '+',
    removed: '-',
    modified: '~',
    unchanged: ' ',
  }[line.type];
  
  const prefixColor = {
    added: 'text-green-500',
    removed: 'text-red-500',
    modified: 'text-amber-500',
    unchanged: 'text-drafted-muted',
  }[line.type];
  
  return (
    <div className={`flex items-start gap-2 px-3 py-1.5 font-mono text-xs border-b border-drafted-border last:border-b-0 ${bgColor}`}>
      <span className={`font-bold select-none ${prefixColor}`}>{prefix}</span>
      <div className="flex-1 min-w-0">
        {line.type === 'modified' ? (
          <div className="space-y-1">
            <div className="text-red-600 line-through opacity-60">{line.original}</div>
            <div className="text-green-600">{line.edited}</div>
          </div>
        ) : (
          <span className={textColor}>
            {line.original || line.edited}
          </span>
        )}
      </div>
      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
        line.lineType === 'area' 
          ? 'bg-blue-100 text-blue-600' 
          : line.lineType === 'room'
            ? 'bg-purple-100 text-purple-600'
            : 'bg-drafted-bg text-drafted-muted'
      }`}>
        {line.lineType}
      </span>
    </div>
  );
}





