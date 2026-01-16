'use client';

import { X, Copy, Check, Image, FileText, Download } from 'lucide-react';
import { useState, useCallback } from 'react';

interface GeminiDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawPngBase64?: string;
  geminiPrompt?: string;
  planId?: string;
}

export function GeminiDebugModal({
  isOpen,
  onClose,
  rawPngBase64,
  geminiPrompt,
  planId,
}: GeminiDebugModalProps) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState<'png' | 'prompt'>('png');

  const handleCopyPrompt = useCallback(async () => {
    if (!geminiPrompt) return;
    try {
      await navigator.clipboard.writeText(geminiPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch (e) {
      console.error('Failed to copy prompt:', e);
    }
  }, [geminiPrompt]);

  const handleDownloadPng = useCallback(() => {
    if (!rawPngBase64) return;
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${rawPngBase64}`;
    link.download = `gemini-input-${planId || 'plan'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [rawPngBase64, planId]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="relative bg-white rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-red-50 to-orange-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Gemini API Debug</h2>
            <p className="text-sm text-gray-500">View exact PNG and prompt sent to Gemini</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-gray-200 px-6 bg-gray-50">
          <button
            onClick={() => setActiveTab('png')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'png'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Image className="w-4 h-4" />
            Input PNG
          </button>
          <button
            onClick={() => setActiveTab('prompt')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'prompt'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            Full Prompt
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'png' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  This is the exact PNG image sent to Gemini&apos;s image-to-image API
                </p>
                {rawPngBase64 && (
                  <button
                    onClick={handleDownloadPng}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download PNG
                  </button>
                )}
              </div>
              {rawPngBase64 ? (
                <div className="bg-gray-100 rounded-lg p-4 flex items-center justify-center">
                  <img
                    src={`data:image/png;base64,${rawPngBase64}`}
                    alt="Raw PNG sent to Gemini"
                    className="max-w-full max-h-[60vh] object-contain border border-gray-300 rounded shadow-lg"
                  />
                </div>
              ) : (
                <div className="bg-gray-100 rounded-lg p-8 text-center text-gray-500">
                  <Image className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No PNG data available</p>
                  <p className="text-xs mt-1">This plan may have been rendered before debug data was captured</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'prompt' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Full prompt (system instruction + user prompt) sent to Gemini
                </p>
                {geminiPrompt && (
                  <button
                    onClick={handleCopyPrompt}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    {copiedPrompt ? (
                      <>
                        <Check className="w-4 h-4 text-green-600" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy Prompt
                      </>
                    )}
                  </button>
                )}
              </div>
              {geminiPrompt ? (
                <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-[60vh]">
                  <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
                    {geminiPrompt}
                  </pre>
                </div>
              ) : (
                <div className="bg-gray-100 rounded-lg p-8 text-center text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No prompt data available</p>
                  <p className="text-xs mt-1">This plan may have been rendered before debug data was captured</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
          <p>
            <strong>Note:</strong> This data is for debugging purposes. The PNG shows the preprocessed 
            SVG-to-image conversion, and the prompt shows both system instructions and room-specific prompts.
          </p>
        </div>
      </div>
    </div>
  );
}


