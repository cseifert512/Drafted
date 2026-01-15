'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  History, 
  ChevronLeft, 
  ChevronRight,
  Trash2,
  Clock,
  Cpu,
  Hash,
  Ruler,
  Layers,
  FileText,
  GitCompare,
  Zap,
  BarChart3,
  Network,
  Grid3X3,
  FlameKindling,
  Target,
  HelpCircle,
  Settings,
  Image,
} from 'lucide-react';
import { useDevMode, ComparisonData, RenderSettings } from '@/contexts/DevModeContext';
import { useTutorialOptional } from '@/contexts/TutorialContext';
import { DevCompareView } from './DevCompareView';
import { RoomDeltaView } from './RoomDeltaView';
import { PromptCompareView } from './PromptCompareView';
import { BatchRunner, BatchAnalysisData } from './BatchRunner';
import { DifferenceHeatmap } from './DifferenceHeatmap';
import { RoomOverlayView } from './RoomOverlayView';
import { PositionScatter } from './PositionScatter';
import { SizeDistribution } from './SizeDistribution';
import { ConsistencyMetrics } from './ConsistencyMetrics';
import { AdjacencyGraph } from './AdjacencyGraph';
import { SensitivityMatrix } from './SensitivityMatrix';
import { comparePlanSnapshots } from '@/lib/dev/deltaUtils';
import type { GeneratedRoom, DraftedGenerationRequest } from '@/lib/drafted-types';

type TabId = 'visual' | 'rooms' | 'prompts' | 'metadata' | 'batch' | 'stats';

interface DevModePanelProps {
  className?: string;
}

export function DevModePanel({ className = '' }: DevModePanelProps) {
  const { 
    isEnabled, 
    showPanel, 
    hideDevPanel, 
    currentComparison, 
    history, 
    setCurrentComparison,
    clearHistory,
    batchConfig,
    renderSettings,
    setRenderSettings,
  } = useDevMode();
  
  const tutorial = useTutorialOptional();
  
  const [activeTab, setActiveTab] = useState<TabId>('visual');
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [batchResults, setBatchResults] = useState<BatchAnalysisData | null>(null);
  const [statsSubTab, setStatsSubTab] = useState<'consistency' | 'distribution' | 'position' | 'adjacency' | 'sensitivity'>('consistency');
  const [showTutorialPicker, setShowTutorialPicker] = useState(false);
  
  // Use current comparison or selected from history
  const activeComparison = useMemo(() => {
    if (historyIndex >= 0 && historyIndex < history.length) {
      return history[historyIndex];
    }
    return currentComparison;
  }, [historyIndex, history, currentComparison]);
  
  // Compute analysis data
  const analysis = useMemo(() => {
    if (!activeComparison) return null;
    return comparePlanSnapshots(activeComparison.original, activeComparison.edited);
  }, [activeComparison]);
  
  // Prepare data for batch analytics
  const batchGenerationsData = useMemo(() => {
    if (!batchResults) return [];
    return batchResults.results.map((r, i) => ({
      id: r.id,
      index: i,
      label: `Gen ${i + 1}`,
      success: r.success,
      totalAreaSqft: r.totalAreaSqft || 0,
      rooms: r.rooms,
      svg: r.svg,
      elapsedSeconds: r.elapsedSeconds || 0,
      centroids: new Map<string, { x: number; y: number }>(),
    }));
  }, [batchResults]);
  
  // Navigation handlers
  const goToPrevious = () => {
    const currentIdx = historyIndex >= 0 ? historyIndex : history.length - 1;
    if (currentIdx > 0) {
      setHistoryIndex(currentIdx - 1);
    }
  };
  
  const goToNext = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
    } else if (historyIndex === history.length - 1) {
      setHistoryIndex(-1); // Go to current
    }
  };
  
  const goToCurrent = () => {
    setHistoryIndex(-1);
  };
  
  const handleBatchComplete = useCallback((data: BatchAnalysisData) => {
    setBatchResults(data);
    // Switch to stats tab to show results
    setActiveTab('stats');
  }, []);
  
  if (!isEnabled || !showPanel) {
    return null;
  }
  
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'visual', label: 'Visual', icon: <GitCompare className="w-4 h-4" /> },
    { id: 'rooms', label: 'Rooms', icon: <Layers className="w-4 h-4" /> },
    { id: 'prompts', label: 'Prompts', icon: <FileText className="w-4 h-4" /> },
    { id: 'batch', label: 'Batch', icon: <Zap className="w-4 h-4" /> },
    { id: 'stats', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'metadata', label: 'Meta', icon: <Cpu className="w-4 h-4" /> },
  ];
  
  const statsSubTabs = [
    { id: 'consistency' as const, label: 'Consistency', icon: <Target className="w-3.5 h-3.5" /> },
    { id: 'distribution' as const, label: 'Distribution', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'position' as const, label: 'Position', icon: <Grid3X3 className="w-3.5 h-3.5" /> },
    { id: 'adjacency' as const, label: 'Topology', icon: <Network className="w-3.5 h-3.5" /> },
    { id: 'sensitivity' as const, label: 'Sensitivity', icon: <FlameKindling className="w-3.5 h-3.5" /> },
  ];
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 ${className}`}
        onClick={hideDevPanel}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-drafted-border bg-drafted-bg/50">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-coral-500 to-orange-500 rounded-lg flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-drafted-black">Dev Mode Inspector</h2>
                  <p className="text-xs text-drafted-gray">
                    {activeComparison 
                      ? `Viewing: ${activeComparison.editOperation.description}`
                      : batchResults
                        ? `Batch: ${batchResults.results.length} generations`
                        : 'Ready for analysis'
                    }
                  </p>
                </div>
              </div>
              
              {/* History Navigation */}
              {history.length > 0 && (
                <div className="flex items-center gap-2 ml-4 pl-4 border-l border-drafted-border">
                  <History className="w-4 h-4 text-drafted-gray" />
                  <button
                    onClick={goToPrevious}
                    disabled={historyIndex === 0 || (historyIndex === -1 && history.length <= 1)}
                    className="p-1 hover:bg-drafted-bg rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-drafted-gray min-w-[60px] text-center">
                    {historyIndex >= 0 ? historyIndex + 1 : history.length} / {history.length}
                  </span>
                  <button
                    onClick={goToNext}
                    disabled={historyIndex === -1}
                    className="p-1 hover:bg-drafted-bg rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {historyIndex >= 0 && (
                    <button
                      onClick={goToCurrent}
                      className="text-xs text-coral-500 hover:text-coral-600 ml-1"
                    >
                      Latest
                    </button>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {/* Render Settings */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-drafted-bg rounded-lg border border-drafted-border">
                <Image className="w-4 h-4 text-drafted-gray" />
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-drafted-gray">Auto-render</span>
                  <div 
                    className={`relative w-8 h-4 rounded-full transition-colors ${
                      renderSettings.autoRender ? 'bg-coral-500' : 'bg-drafted-border'
                    }`}
                    onClick={() => setRenderSettings({ autoRender: !renderSettings.autoRender })}
                  >
                    <div 
                      className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                        renderSettings.autoRender ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </label>
              </div>
              
              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              )}
              <button
                onClick={hideDevPanel}
                className="p-2 hover:bg-drafted-bg rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-drafted-gray" />
              </button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex items-center gap-1 px-6 py-2 border-b border-drafted-border bg-white">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${activeTab === tab.id
                    ? 'bg-coral-50 text-coral-600'
                    : 'text-drafted-gray hover:text-drafted-black hover:bg-drafted-bg'
                  }
                `}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          
          {/* Stats Sub-tabs */}
          {activeTab === 'stats' && (
            <div className="flex items-center gap-1 px-6 py-2 border-b border-drafted-border bg-drafted-bg/30">
              {statsSubTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatsSubTab(tab.id)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
                    ${statsSubTab === tab.id
                      ? 'bg-white text-drafted-black shadow-sm'
                      : 'text-drafted-gray hover:text-drafted-black'
                    }
                  `}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Visual Comparison Tab */}
            {activeTab === 'visual' && (
              activeComparison ? (
                <div className="space-y-6">
                  <DevCompareView
                    original={activeComparison.original}
                    edited={activeComparison.edited}
                  />
                  
                  {/* Difference Heatmap */}
                  <DifferenceHeatmap
                    svg1={activeComparison.original.svg}
                    svg2={activeComparison.edited.svg}
                    image1Base64={activeComparison.original.imageBase64}
                    image2Base64={activeComparison.edited.imageBase64}
                    labels={['Original', 'Edited']}
                  />
                </div>
              ) : (
                <EmptyState message="Edit a floor plan to see visual comparison" />
              )
            )}
            
            {/* Room Deltas Tab */}
            {activeTab === 'rooms' && (
              activeComparison ? (
                <RoomDeltaView
                  originalRooms={activeComparison.original.rooms}
                  editedRooms={activeComparison.edited.rooms}
                />
              ) : (
                <EmptyState message="Edit a floor plan to see room changes" />
              )
            )}
            
            {/* Prompts Tab */}
            {activeTab === 'prompts' && (
              activeComparison ? (
                <PromptCompareView
                  originalPrompt={activeComparison.original.prompt}
                  editedPrompt={activeComparison.edited.prompt}
                />
              ) : (
                <EmptyState message="Edit a floor plan to see prompt comparison" />
              )
            )}
            
            {/* Batch Generation Tab */}
            {activeTab === 'batch' && (
              <div className="space-y-6">
                <BatchRunner
                  baseRequest={batchConfig ? { rooms: batchConfig.rooms, target_sqft: batchConfig.target_sqft } : undefined}
                  onBatchComplete={handleBatchComplete}
                />
                
                {/* Room Overlay View (if we have batch results with SVGs) */}
                {batchResults && batchGenerationsData.filter(g => g.svg).length > 1 && (
                  <RoomOverlayView
                    generations={batchGenerationsData.filter(g => g.svg).map(g => ({
                      id: g.id,
                      label: g.label,
                      svg: g.svg,
                      rooms: g.rooms,
                      color: '',
                    }))}
                  />
                )}
              </div>
            )}
            
            {/* Statistics/Analytics Tab */}
            {activeTab === 'stats' && (
              <div>
                {batchGenerationsData.length === 0 ? (
                  <div className="text-center py-12">
                    <BarChart3 className="w-12 h-12 text-drafted-muted mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-drafted-black mb-2">
                      No Batch Data Available
                    </h3>
                    <p className="text-drafted-gray mb-4">
                      Run a batch generation to see statistical analysis
                    </p>
                    <button
                      onClick={() => setActiveTab('batch')}
                      className="px-4 py-2 bg-coral-500 text-white rounded-lg font-medium hover:bg-coral-600 transition-colors"
                    >
                      Go to Batch Runner
                    </button>
                  </div>
                ) : (
                  <>
                    {statsSubTab === 'consistency' && (
                      <ConsistencyMetrics
                        generations={batchGenerationsData}
                        expected={batchConfig?.target_sqft ? { targetSqft: batchConfig.target_sqft } : undefined}
                      />
                    )}
                    
                    {statsSubTab === 'distribution' && (
                      <SizeDistribution
                        generations={batchGenerationsData}
                      />
                    )}
                    
                    {statsSubTab === 'position' && (
                      <PositionScatter
                        generations={batchGenerationsData}
                      />
                    )}
                    
                    {statsSubTab === 'adjacency' && (
                      <AdjacencyGraph
                        generations={batchGenerationsData.filter(g => g.success).map(g => ({
                          id: g.id,
                          label: g.label,
                          rooms: g.rooms,
                          svg: g.svg,
                        }))}
                      />
                    )}
                    
                    {statsSubTab === 'sensitivity' && (
                      <SensitivityMatrix
                        editResults={history.map(h => ({
                          id: h.id,
                          editType: h.editOperation.type.includes('add') ? 'add' as const : 
                                    h.editOperation.type.includes('remove') ? 'remove' as const : 
                                    'resize' as const,
                          targetRoom: h.editOperation.addedRooms?.[0]?.room_type || 
                                      h.editOperation.removedRooms?.[0] || 
                                      'unknown',
                          originalRooms: h.original.rooms,
                          resultRooms: h.edited.rooms,
                          originalTotalArea: h.original.rooms.reduce((s, r) => s + r.area_sqft, 0),
                          resultTotalArea: h.edited.rooms.reduce((s, r) => s + r.area_sqft, 0),
                        }))}
                      />
                    )}
                  </>
                )}
              </div>
            )}
            
            {/* Metadata Tab */}
            {activeTab === 'metadata' && (
              activeComparison ? (
                <MetadataView comparison={activeComparison} analysis={analysis} />
              ) : (
                <EmptyState message="Edit a floor plan to see metadata" />
              )
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12">
      <div className="w-16 h-16 bg-drafted-bg rounded-full flex items-center justify-center mb-4">
        <GitCompare className="w-8 h-8 text-drafted-muted" />
      </div>
      <h3 className="text-lg font-semibold text-drafted-black mb-2">
        No Data Available
      </h3>
      <p className="text-drafted-gray max-w-md">
        {message}. The inspector will automatically capture states for debugging.
      </p>
    </div>
  );
}

interface MetadataViewProps {
  comparison: ComparisonData;
  analysis: ReturnType<typeof comparePlanSnapshots> | null;
}

function MetadataView({ comparison, analysis }: MetadataViewProps) {
  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString();
  };
  
  return (
    <div className="space-y-6">
      {/* Edit Operation Info */}
      <div className="p-4 bg-coral-50 border border-coral-100 rounded-lg">
        <h4 className="font-semibold text-coral-700 mb-2 flex items-center gap-2">
          <GitCompare className="w-4 h-4" />
          Edit Operation
        </h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-coral-600">Type:</span>
            <span className="ml-2 font-mono text-coral-800">{comparison.editOperation.type}</span>
          </div>
          <div>
            <span className="text-coral-600">Description:</span>
            <span className="ml-2 text-coral-800">{comparison.editOperation.description}</span>
          </div>
        </div>
        
        {comparison.editOperation.addedRooms && comparison.editOperation.addedRooms.length > 0 && (
          <div className="mt-2 text-sm">
            <span className="text-coral-600">Added Rooms:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {comparison.editOperation.addedRooms.map((r, i) => (
                <span key={i} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                  {r.room_type} ({r.size})
                </span>
              ))}
            </div>
          </div>
        )}
        
        {comparison.editOperation.removedRooms && comparison.editOperation.removedRooms.length > 0 && (
          <div className="mt-2 text-sm">
            <span className="text-coral-600">Removed Rooms:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {comparison.editOperation.removedRooms.map((r, i) => (
                <span key={i} className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Timing & Generation */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-drafted-bg rounded-lg">
          <div className="flex items-center gap-2 text-drafted-gray mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium">Timing</span>
          </div>
          <div className="space-y-1 text-sm">
            <div>
              <span className="text-drafted-gray">Created:</span>
              <span className="ml-2 text-drafted-black">{formatTimestamp(comparison.timestamp)}</span>
            </div>
            {comparison.elapsedSeconds && (
              <div>
                <span className="text-drafted-gray">Generation Time:</span>
                <span className="ml-2 font-mono text-drafted-black">{comparison.elapsedSeconds.toFixed(2)}s</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="p-4 bg-drafted-bg rounded-lg">
          <div className="flex items-center gap-2 text-drafted-gray mb-2">
            <Hash className="w-4 h-4" />
            <span className="text-xs font-medium">Seeds</span>
          </div>
          <div className="space-y-1 text-sm">
            <div>
              <span className="text-drafted-gray">Original:</span>
              <span className="ml-2 font-mono text-drafted-black">{comparison.original.seed}</span>
            </div>
            <div>
              <span className="text-drafted-gray">Edited:</span>
              <span className="ml-2 font-mono text-drafted-black">{comparison.edited.seed}</span>
            </div>
            {analysis?.seedChanged && (
              <span className="text-xs text-amber-600">Seed changed</span>
            )}
          </div>
        </div>
        
        <div className="p-4 bg-drafted-bg rounded-lg">
          <div className="flex items-center gap-2 text-drafted-gray mb-2">
            <Cpu className="w-4 h-4" />
            <span className="text-xs font-medium">Model Params</span>
          </div>
          <div className="space-y-1 text-sm">
            {comparison.numSteps && (
              <div>
                <span className="text-drafted-gray">Steps:</span>
                <span className="ml-2 font-mono text-drafted-black">{comparison.numSteps}</span>
              </div>
            )}
            {comparison.guidanceScale && (
              <div>
                <span className="text-drafted-gray">Guidance:</span>
                <span className="ml-2 font-mono text-drafted-black">{comparison.guidanceScale}</span>
              </div>
            )}
            {!comparison.numSteps && !comparison.guidanceScale && (
              <span className="text-drafted-muted">Not recorded</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Area Analysis */}
      {analysis && (
        <div className="p-4 bg-drafted-bg rounded-lg">
          <div className="flex items-center gap-2 text-drafted-gray mb-3">
            <Ruler className="w-4 h-4" />
            <span className="text-xs font-medium">Area Analysis</span>
          </div>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-drafted-black">
                {Math.round(analysis.originalTotalArea).toLocaleString()}
              </div>
              <div className="text-xs text-drafted-gray">Original sqft</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-drafted-black">
                {Math.round(analysis.editedTotalArea).toLocaleString()}
              </div>
              <div className="text-xs text-drafted-gray">Edited sqft</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${
                analysis.summary.totalAreaDelta > 0 
                  ? 'text-green-600' 
                  : analysis.summary.totalAreaDelta < 0 
                    ? 'text-red-600' 
                    : 'text-drafted-gray'
              }`}>
                {analysis.summary.totalAreaDelta > 0 ? '+' : ''}
                {Math.round(analysis.summary.totalAreaDelta).toLocaleString()}
              </div>
              <div className="text-xs text-drafted-gray">Delta</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-drafted-black">
                {analysis.roomDeltas.length}
              </div>
              <div className="text-xs text-drafted-gray">Room Changes</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Plan IDs */}
      <div className="p-4 bg-drafted-bg rounded-lg">
        <h4 className="text-xs font-medium text-drafted-gray mb-2">Plan Identifiers</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-drafted-gray">Original ID:</span>
            <span className="ml-2 font-mono text-drafted-black text-xs">{comparison.original.plan.id}</span>
          </div>
          <div>
            <span className="text-drafted-gray">Edited ID:</span>
            <span className="ml-2 font-mono text-drafted-black text-xs">{comparison.edited.plan.id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
