'use client';

import { X, Copy, Check, Image, FileText, Download, FileCode } from 'lucide-react';
import { useState, useCallback } from 'react';

interface GeminiDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawPngBase64?: string;
  geminiPrompt?: string;
  modifiedSvg?: string;
  planId?: string;
}

export function GeminiDebugModal({
  isOpen,
  onClose,
  rawPngBase64,
  geminiPrompt,
  modifiedSvg,
  planId,
}: GeminiDebugModalProps) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState<'svg' | 'png' | 'prompt'>('svg');

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

  const handleDownloadSvg = useCallback(() => {
    if (!modifiedSvg) return;
    const blob = new Blob([modifiedSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `modified-floorplan-${planId || 'plan'}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [modifiedSvg, planId]);

  if (!isOpen) return null;

  // Process SVG for inline display (ensure it scales properly)
  const processedSvg = modifiedSvg?.replace(
    /<svg([^>]*)>/,
    '<svg$1 style="max-width: 100%; max-height: 100%; width: auto; height: auto;">'
  );

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="relative bg-white rounded-xl shadow-2xl w-[90vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Debug View</h2>
            <p className="text-sm text-gray-500">View modified SVG, annotated PNG, and prompt</p>
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
            onClick={() => setActiveTab('svg')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'svg'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileCode className="w-4 h-4" />
            Modified SVG
          </button>
          <button
            onClick={() => setActiveTab('png')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'png'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Image className="w-4 h-4" />
            Annotated PNG
          </button>
          <button
            onClick={() => setActiveTab('prompt')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'prompt'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            Prompt
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Modified SVG Tab */}
          {activeTab === 'svg' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  The SVG with door/window symbol added (schematic view, before rendering)
                </p>
                {modifiedSvg && (
                  <button
                    onClick={handleDownloadSvg}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download SVG
                  </button>
                )}
              </div>
              {modifiedSvg ? (
                <div className="bg-white rounded-lg border-2 border-gray-200 p-4 flex items-center justify-center min-h-[400px]">
                  <div 
                    className="max-w-full max-h-[60vh]"
                    dangerouslySetInnerHTML={{ __html: processedSvg || '' }}
                  />
                </div>
              ) : (
                <div className="bg-gray-100 rounded-lg p-8 text-center text-gray-500">
                  <FileCode className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No modified SVG available</p>
                  <p className="text-xs mt-1">Add a door or window to see the modified SVG</p>
                </div>
              )}
              {modifiedSvg && (
                <p className="text-xs text-gray-500">
                  <strong>Tip:</strong> Check that the door/window symbol appears at the correct location in this SVG. 
                  If placement is wrong here, the issue is in the coordinate calculation.
                </p>
              )}
            </div>
          )}

          {/* Annotated PNG Tab */}
          {activeTab === 'png' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  The rendered PNG with red box annotation (sent to Gemini)
                </p>
                {rawPngBase64 && (
                  <button
                    onClick={handleDownloadPng}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
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
                    alt="Annotated PNG sent to Gemini"
                    className="max-w-full max-h-[60vh] object-contain border border-gray-300 rounded shadow-lg"
                  />
                </div>
              ) : (
                <div className="bg-gray-100 rounded-lg p-8 text-center text-gray-500">
                  <Image className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No PNG data available</p>
                  <p className="text-xs mt-1">Add a door or window to see the annotated PNG</p>
                </div>
              )}
              {rawPngBase64 && (
                <p className="text-xs text-gray-500">
                  <strong>Tip:</strong> The red box shows where Gemini is instructed to add the door. 
                  If this is in the wrong place, the coordinate transformation needs fixing.
                </p>
              )}
            </div>
          )}

          {/* Prompt Tab */}
          {activeTab === 'prompt' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Full prompt (system + user) sent to Gemini
                </p>
                {geminiPrompt && (
                  <button
                    onClick={handleCopyPrompt}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors"
                  >
                    {copiedPrompt ? (
                      <>
                        <Check className="w-4 h-4" />
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
                  <p className="text-xs mt-1">Add a door or window to see the prompt</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
          <p>
            <strong>Debug Flow:</strong> 1) SVG is modified with door symbol → 2) Rendered PNG is annotated with red box → 3) Sent to Gemini with prompt
          </p>
        </div>
      </div>
    </div>
  );
}
