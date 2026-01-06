'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Upload,
  ChevronDown,
  Layers,
  BarChart3,
  Target,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X
} from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { GenerationSidebar } from '@/components/sidebar/GenerationSidebar';
import { DraftGrid } from '@/components/drafts/DraftGrid';
import { AnalysisPanel } from '@/components/analysis/AnalysisPanel';
import { DropZone } from '@/components/upload/DropZone';
import { EditPlanModal } from '@/components/EditPlanModal';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useGeneration } from '@/hooks/useGeneration';

type AppMode = 'generate' | 'upload';

export default function Home() {
  const [mode, setMode] = useState<AppMode>('generate');
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

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
    stylizedThumbnails: genStylizedThumbnails,
    error: genError,
    isGenerating,
    isAnalyzing,
    isEditing,
    hasResults,
    analysisResult: genAnalysisResult,
    handleGenerate,
    handleEditPlan,
    handleRenamePlan,
    resetGeneration,
  } = useGeneration();

  // Determine which data to show
  const currentPlans = mode === 'generate' ? generatedPlans : uploadedPlans;
  const currentThumbnails = mode === 'generate' ? genThumbnails : uploadThumbnails;
  const currentStylizedThumbnails = mode === 'generate' ? genStylizedThumbnails : {};
  const currentAnalysis = mode === 'generate' ? genAnalysisResult : uploadAnalysisResult;
  const currentError = mode === 'generate' ? genError : uploadError;
  const hasPlans = currentPlans.length > 0;
  
  // Find the plan being edited
  const editingPlan = editingPlanId ? currentPlans.find(p => p.id === editingPlanId) : null;

  const handleReset = () => {
    resetAnalysis();
    resetGeneration();
    setEditingPlanId(null);
  };
  
  const handleOpenEdit = (planId: string) => {
    setEditingPlanId(planId);
  };
  
  const handleCloseEdit = () => {
    setEditingPlanId(null);
  };
  
  const handleSubmitEdit = async (instruction: string) => {
    if (!editingPlanId) return;
    const result = await handleEditPlan(editingPlanId, instruction);
    if (result?.success) {
      setEditingPlanId(null);
    }
  };

  return (
    <div className="min-h-screen bg-drafted-cream">
      <Header />
      
      <div className="flex">
        {/* Left Sidebar */}
        <aside className="w-80 min-h-[calc(100vh-56px)] bg-drafted-cream border-r border-drafted-border flex flex-col">
          {/* Mode Toggle */}
          <div className="p-4 border-b border-drafted-border">
            <div className="flex bg-white rounded-full p-1 border border-drafted-border">
              <button
                onClick={() => setMode('generate')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-full text-sm font-medium transition-all ${
                  mode === 'generate' 
                    ? 'bg-drafted-black text-white' 
                    : 'text-drafted-gray hover:text-drafted-black'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Generate
              </button>
              <button
                onClick={() => setMode('upload')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-full text-sm font-medium transition-all ${
                  mode === 'upload' 
                    ? 'bg-drafted-black text-white' 
                    : 'text-drafted-gray hover:text-drafted-black'
                }`}
              >
                <Upload className="w-4 h-4" />
                Upload
              </button>
            </div>
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto">
            {mode === 'generate' ? (
              <GenerationSidebar 
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
              />
            ) : (
              <div className="p-4">
                <DropZone
                  onFilesSelected={handleFilesSelected}
                  isUploading={analysisState === 'uploading'}
                  maxFiles={30}
                  compact
                />
                
                {uploadedPlans.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-drafted-gray">
                        {uploadedPlans.length} plans uploaded
                      </span>
                      <button
                        onClick={handleClearAll}
                        className="text-drafted-gray hover:text-coral-500 transition-colors"
                      >
                        Clear all
                      </button>
                    </div>
                    
                    <button
                      onClick={handleAnalyze}
                      disabled={uploadedPlans.length < 2 || analysisState === 'analyzing'}
                      className="w-full btn-drafted-coral disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {analysisState === 'analyzing' ? 'Analyzing...' : 'Analyze Diversity'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar Footer - Diversity Score Preview or Analyzing State */}
          {isAnalyzing && (
            <div className="p-4 border-t border-drafted-border bg-gradient-to-r from-coral-50 to-white">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-5 h-5 border-2 border-coral-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium text-coral-600">
                  Generating Report...
                </span>
              </div>
              <div className="progress-bar-drafted overflow-hidden">
                <div className="h-full bg-gradient-to-r from-coral-400 to-coral-500 animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}
          {currentAnalysis && !isAnalyzing && (
            <div className="p-4 border-t border-drafted-border bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-drafted-light uppercase tracking-wider">
                  Diversity Score
                </span>
                <span className={`text-2xl font-bold ${
                  currentAnalysis.diversity.score >= 0.7 ? 'text-green-600' :
                  currentAnalysis.diversity.score >= 0.4 ? 'text-amber-500' :
                  'text-coral-500'
                }`}>
                  {(currentAnalysis.diversity.score * 100).toFixed(0)}%
                </span>
              </div>
              <div className="progress-bar-drafted">
                <div 
                  className="progress-fill-drafted"
                  style={{ width: `${currentAnalysis.diversity.score * 100}%` }}
                />
              </div>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-h-[calc(100vh-56px)] bg-white">
          {/* Top Bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-drafted-border">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-serif font-bold text-drafted-black">
                {mode === 'generate' ? 'Generated Drafts' : 'Uploaded Plans'}
              </h1>
              {hasPlans && (
                <span className="text-sm text-drafted-gray">
                  {currentPlans.length} {currentPlans.length === 1 ? 'plan' : 'plans'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {hasPlans && (
                <button
                  onClick={handleReset}
                  className="btn-drafted-outline flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset
                </button>
              )}
              
              {currentAnalysis && (
                <button
                  onClick={() => setShowAnalysis(!showAnalysis)}
                  className={`btn-drafted-secondary flex items-center gap-2 ${
                    showAnalysis ? 'bg-drafted-bg' : ''
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  Analysis
                  <ChevronDown className={`w-4 h-4 transition-transform ${showAnalysis ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {/* Error State */}
          <AnimatePresence>
            {currentError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mx-6 mt-4 p-4 bg-coral-50 border border-coral-200 rounded-drafted flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-coral-500" />
                  <p className="text-sm text-coral-700">{currentError}</p>
                </div>
                <button
                  onClick={handleReset}
                  className="text-sm font-medium text-coral-600 hover:text-coral-700"
                >
                  Try again
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Generation Progress - Only show when generating AND no plans yet */}
          {isGenerating && !hasPlans && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24"
            >
              <div className="relative">
                <div className="w-16 h-16 border-4 border-drafted-border rounded-full" />
                <div className="absolute inset-0 w-16 h-16 border-4 border-coral-500 rounded-full border-t-transparent animate-spin" />
              </div>
              <p className="mt-4 text-drafted-gray font-serif font-semibold">Generating floor plans...</p>
              <p className="text-sm text-drafted-light mt-1">This may take a moment</p>
            </motion.div>
          )}

          {/* Empty State */}
          {!hasPlans && !isGenerating && !isAnalyzing && !currentError && (
            <div className="flex flex-col items-center justify-center py-24 px-6">
              <div className="w-20 h-20 bg-drafted-bg rounded-full flex items-center justify-center mb-4">
                <Layers className="w-10 h-10 text-drafted-muted" />
              </div>
              <h2 className="text-xl font-serif font-bold text-drafted-black mb-2">
                {mode === 'generate' ? 'Generate Your First Drafts' : 'Upload Floor Plans'}
              </h2>
              <p className="text-drafted-gray text-center max-w-md">
                {mode === 'generate' 
                  ? 'Configure your requirements in the sidebar and click Generate to create diverse floor plans.'
                  : 'Drag and drop floor plan images to analyze their diversity.'
                }
              </p>
            </div>
          )}

          {/* Draft Grid - Show while analyzing too */}
          {hasPlans && (
            <div className="p-6">
              {/* Analysis Loading Indicator - Prominent Card */}
              {isAnalyzing && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mb-6 p-6 bg-gradient-to-r from-coral-50 to-amber-50 border-2 border-coral-200 rounded-2xl"
                >
                  <div className="flex items-start gap-4">
                    {/* Animated Icon */}
                    <div className="relative flex-shrink-0">
                      <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center">
                        <BarChart3 className="w-6 h-6 text-coral-500" />
                      </div>
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-coral-500 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      </div>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1">
                      <h3 className="text-lg font-serif font-bold text-drafted-black mb-1">
                        Generating Diversity Report
                      </h3>
                      <p className="text-sm text-drafted-gray mb-3">
                        Analyzing spatial patterns, room distributions, and layout variations across your generated plans...
                      </p>
                      
                      {/* Progress Steps */}
                      <div className="flex items-center gap-6 text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-drafted-gray">Plans Generated</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-coral-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-coral-600 font-medium">Computing Metrics</span>
                        </div>
                        <div className="flex items-center gap-2 opacity-40">
                          <div className="w-4 h-4 border-2 border-drafted-border rounded-full" />
                          <span className="text-drafted-light">Results Ready</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Analysis Panel - Collapsible */}
              <AnimatePresence>
                {currentAnalysis && showAnalysis && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-6"
                  >
                    <AnalysisPanel result={currentAnalysis} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Plans Grid */}
              <DraftGrid
                plans={currentPlans.map(p => ({
                  ...p,
                  thumbnail: currentThumbnails[p.id] || p.thumbnail,
                  stylized_thumbnail: currentStylizedThumbnails[p.id] || p.stylized_thumbnail
                }))}
                scatterPoints={currentAnalysis?.visualization.points}
                onRemove={mode === 'upload' ? handleRemovePlan : undefined}
                onEdit={mode === 'generate' ? handleOpenEdit : undefined}
                onRename={mode === 'generate' ? handleRenamePlan : undefined}
                showStylized={true}
              />
            </div>
          )}
        </main>
      </div>
      
      {/* Edit Plan Modal */}
      <EditPlanModal
        isOpen={editingPlanId !== null}
        onClose={handleCloseEdit}
        onSubmit={handleSubmitEdit}
        planName={editingPlan?.display_name}
        isLoading={isEditing}
      />
    </div>
  );
}
