'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Trash2, 
  Loader2, 
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Upload,
  Sparkles,
  ArrowRight
} from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { Hero } from '@/components/layout/Hero';
import { Section } from '@/components/layout/Section';
import { DropZone } from '@/components/upload/DropZone';
import { PlanGallery } from '@/components/upload/PlanGallery';
import { AnalysisPanel } from '@/components/analysis/AnalysisPanel';
import { GenerationForm } from '@/components/generation/GenerationForm';
import { GenerationProgress } from '@/components/generation/GenerationProgress';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useGeneration } from '@/hooks/useGeneration';

type AppMode = 'choose' | 'generate' | 'upload';

export default function Home() {
  const [mode, setMode] = useState<AppMode>('choose');
  const [showPlans, setShowPlans] = useState(true);

  // Upload flow
  const {
    plans: uploadedPlans,
    thumbnails: uploadThumbnails,
    analysisState,
    analysisResult: uploadAnalysisResult,
    error: uploadError,
    handleFilesSelected,
    handleRemovePlan,
    handleClearAll,
    handleAnalyze,
    resetAnalysis,
  } = useAnalysis();

  // Generation flow
  const {
    generationState,
    generationResult,
    plans: generatedPlans,
    thumbnails: genThumbnails,
    error: genError,
    isGenerating,
    hasResults,
    analysisResult: genAnalysisResult,
    handleGenerate,
    resetGeneration,
  } = useGeneration();

  // Determine which plans/analysis to show based on mode
  const currentPlans = mode === 'generate' ? generatedPlans : uploadedPlans;
  const currentThumbnails = mode === 'generate' ? genThumbnails : uploadThumbnails;
  const currentAnalysis = mode === 'generate' ? genAnalysisResult : uploadAnalysisResult;
  const currentError = mode === 'generate' ? genError : uploadError;

  const isLoading = analysisState === 'uploading' || analysisState === 'analyzing' || isGenerating;
  const hasPlans = currentPlans.length > 0;
  const canAnalyze = uploadedPlans.length >= 2 && analysisState !== 'analyzing';

  const handleReset = () => {
    setMode('choose');
    resetAnalysis();
    resetGeneration();
  };

  return (
    <main className="min-h-screen bg-white">
      <Header />
      
      <Hero
        title="Analyze Design Diversity"
        subtitle="Generate or upload floor plans to evaluate design variation, spatial topology, and program distribution. Ensure your AI-generated designs explore the full possibility space."
      />

      {/* Mode Selection */}
      {mode === 'choose' && (
        <Section className="bg-neutral-50 border-y border-neutral-100">
          <div className="max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid md:grid-cols-2 gap-6"
            >
              {/* Generate Option */}
              <button
                onClick={() => setMode('generate')}
                className="card p-8 text-left hover:shadow-elevated transition-shadow group"
              >
                <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary-200 transition-colors">
                  <Sparkles className="w-6 h-6 text-primary-500" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 mb-2">
                  Generate with AI
                </h3>
                <p className="text-neutral-500 mb-4">
                  Use Gemini to create diverse floor plans automatically. 
                  Configure bedrooms, style, and let AI explore variations.
                </p>
                <span className="inline-flex items-center text-primary-500 font-medium text-sm">
                  Start generating
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>

              {/* Upload Option */}
              <button
                onClick={() => setMode('upload')}
                className="card p-8 text-left hover:shadow-elevated transition-shadow group"
              >
                <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-neutral-200 transition-colors">
                  <Upload className="w-6 h-6 text-neutral-500" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 mb-2">
                  Upload Existing Plans
                </h3>
                <p className="text-neutral-500 mb-4">
                  Already have floor plan images? Upload them to analyze 
                  their diversity and clustering patterns.
                </p>
                <span className="inline-flex items-center text-neutral-600 font-medium text-sm">
                  Upload plans
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
            </motion.div>
          </div>
        </Section>
      )}

      {/* Generation Mode */}
      {mode === 'generate' && !hasResults && (
        <Section className="bg-neutral-50 border-y border-neutral-100">
          <div className="max-w-2xl mx-auto">
            {isGenerating ? (
              <GenerationProgress
                total={generationResult?.generated_count || 6}
                completed={generationResult?.generated_count || 0}
                failed={generationResult?.failed_count || 0}
                isComplete={false}
              />
            ) : (
              <>
                <button
                  onClick={() => setMode('choose')}
                  className="mb-6 text-sm text-neutral-500 hover:text-neutral-700 transition-colors flex items-center gap-1"
                >
                  ← Back to options
                </button>
                <GenerationForm 
                  onGenerate={handleGenerate} 
                  isGenerating={isGenerating}
                />
              </>
            )}
          </div>
        </Section>
      )}

      {/* Upload Mode */}
      {mode === 'upload' && (
        <Section className="bg-neutral-50 border-y border-neutral-100">
          <button
            onClick={() => setMode('choose')}
            className="mb-6 text-sm text-neutral-500 hover:text-neutral-700 transition-colors flex items-center gap-1"
          >
            ← Back to options
          </button>

          <DropZone
            onFilesSelected={handleFilesSelected}
            isUploading={analysisState === 'uploading'}
            maxFiles={30}
          />

          {/* Error Display */}
          <AnimatePresence>
            {uploadError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-600">{uploadError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Bar */}
          {uploadedPlans.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm text-neutral-500">
                  {uploadedPlans.length} plan{uploadedPlans.length !== 1 ? 's' : ''} uploaded
                </span>
                <button
                  onClick={handleClearAll}
                  className="text-sm text-neutral-500 hover:text-red-500 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear all
                </button>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analysisState === 'analyzing' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Analyze Diversity
                  </>
                )}
              </button>
            </motion.div>
          )}
        </Section>
      )}

      {/* Error Display for Generation */}
      <AnimatePresence>
        {currentError && mode === 'generate' && (
          <Section>
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-600">{currentError}</p>
              <button
                onClick={handleReset}
                className="ml-auto text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Try again
              </button>
            </motion.div>
          </Section>
        )}
      </AnimatePresence>

      {/* Plans Gallery */}
      {hasPlans && (mode === 'upload' || hasResults) && (
        <Section>
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setShowPlans(!showPlans)}
              className="flex items-center gap-2 text-neutral-900 font-semibold"
            >
              {mode === 'generate' ? 'Generated' : 'Uploaded'} Plans ({currentPlans.length})
              <ChevronDown className={`w-5 h-5 transition-transform ${
                showPlans ? 'rotate-180' : ''
              }`} />
            </button>

            {hasResults && (
              <button
                onClick={handleReset}
                className="btn-secondary flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Start Over
              </button>
            )}
          </div>

          <AnimatePresence>
            {showPlans && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <PlanGallery
                  plans={currentPlans.map(p => ({
                    ...p,
                    thumbnail: currentThumbnails[p.id]
                  }))}
                  onRemove={mode === 'upload' ? handleRemovePlan : undefined}
                  scatterPoints={currentAnalysis?.visualization.points}
                  isLoading={isLoading}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Section>
      )}

      {/* Analysis Results */}
      <AnimatePresence>
        {currentAnalysis && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Section 
              id="results"
              title="Analysis Results"
              subtitle="Diversity assessment of your floor plan collection"
              className="bg-neutral-50 border-t border-neutral-100"
            >
              <AnalysisPanel result={currentAnalysis} />
            </Section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State / Instructions */}
      {mode === 'choose' && (
        <Section className="text-center py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="max-w-lg mx-auto"
          >
            <h3 className="text-xl font-semibold text-neutral-900 mb-4">
              Why Diversity Matters
            </h3>
            <p className="text-neutral-500 mb-6">
              AI-generated designs can converge on similar patterns. 
              This tool helps ensure your floor plans explore the full 
              possibility space, leading to better design outcomes.
            </p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary-500">10+</div>
                <div className="text-xs text-neutral-400">Layout Variations</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary-500">4</div>
                <div className="text-xs text-neutral-400">Diversity Metrics</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary-500">0-1</div>
                <div className="text-xs text-neutral-400">Clear Scoring</div>
              </div>
            </div>
          </motion.div>
        </Section>
      )}

      {/* Footer */}
      <footer className="py-8 border-t border-neutral-100">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-neutral-400">
            Floor Plan Diversity Analyzer • A prototype tool by{' '}
            <a 
              href="https://drafted.ai" 
              className="text-primary-500 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Drafted
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}
