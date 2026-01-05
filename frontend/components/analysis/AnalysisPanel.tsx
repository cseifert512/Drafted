'use client';

import { motion } from 'framer-motion';
import { Layers, GitBranch, Timer, Hash } from 'lucide-react';
import type { AnalysisResponse } from '@/lib/types';
import { ScatterPlot } from '../visualization/ScatterPlot';
import { DiversityScore } from '../visualization/DiversityScore';
import { MetricBreakdown } from '../visualization/MetricBreakdown';
import { ScoreCard } from '../cards/ScoreCard';

interface AnalysisPanelProps {
  result: AnalysisResponse;
}

export function AnalysisPanel({ result }: AnalysisPanelProps) {
  const { diversity, visualization, plan_count, processing_time_ms, plans } = result;
  
  // Calculate some aggregate stats
  const totalRooms = plans.reduce((sum, p) => sum + p.room_count, 0);
  const avgRooms = totalRooms / plans.length;
  const clusterCount = visualization.clusters.length;

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <ScoreCard
          title="Plans Analyzed"
          value={plan_count}
          icon={Layers}
          delay={0}
        />
        <ScoreCard
          title="Clusters Found"
          value={clusterCount}
          icon={GitBranch}
          delay={0.1}
        />
        <ScoreCard
          title="Avg. Rooms"
          value={avgRooms.toFixed(1)}
          icon={Hash}
          delay={0.2}
        />
        <ScoreCard
          title="Analysis Time"
          value={`${(processing_time_ms / 1000).toFixed(1)}s`}
          icon={Timer}
          delay={0.3}
        />
      </motion.div>

      {/* Main Analysis Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Diversity Score */}
        <div className="lg:col-span-1">
          <DiversityScore
            score={diversity.score}
            interpretation={diversity.interpretation}
          />
        </div>

        {/* Scatter Plot */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="card p-6"
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">
              Design Space Distribution
            </h3>
            <p className="text-sm text-neutral-500 mb-6">
              Each point represents a floor plan. Clusters indicate similar designs.
            </p>
            <ScatterPlot
              points={visualization.points}
              clusters={visualization.clusters}
              bounds={visualization.bounds}
              width={560}
              height={350}
            />
          </motion.div>
        </div>
      </div>

      {/* Metric Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MetricBreakdown metrics={diversity.metrics} />
        
        {/* Additional Insights */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="card p-6"
        >
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">
            Key Insights
          </h3>
          
          <div className="space-y-4">
            <InsightItem
              label="Design Spread"
              value={diversity.score >= 0.6 ? 'Well distributed' : 'Tightly clustered'}
              isPositive={diversity.score >= 0.6}
            />
            <InsightItem
              label="Cluster Balance"
              value={getClusterBalance(visualization.clusters)}
              isPositive={isBalanced(visualization.clusters)}
            />
            <InsightItem
              label="Exploration Coverage"
              value={diversity.metrics.find(m => m.name === 'coverage')?.score 
                ? `${Math.round(diversity.metrics.find(m => m.name === 'coverage')!.score * 100)}%`
                : 'N/A'}
              isPositive={(diversity.metrics.find(m => m.name === 'coverage')?.score || 0) >= 0.5}
            />
          </div>

          <div className="mt-6 pt-6 border-t border-neutral-100">
            <h4 className="text-sm font-medium text-neutral-900 mb-3">
              Recommendations
            </h4>
            <ul className="space-y-2 text-sm text-neutral-600">
              {diversity.score < 0.4 && (
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  Consider exploring different layout configurations
                </li>
              )}
              {clusterCount === 1 && (
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  Plans are too similar - vary room arrangements
                </li>
              )}
              {diversity.score >= 0.6 && (
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  Good variety in design approaches
                </li>
              )}
            </ul>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

interface InsightItemProps {
  label: string;
  value: string;
  isPositive: boolean;
}

function InsightItem({ label, value, isPositive }: InsightItemProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className={`text-sm font-medium ${
        isPositive ? 'text-green-600' : 'text-amber-600'
      }`}>
        {value}
      </span>
    </div>
  );
}

function getClusterBalance(clusters: { size: number }[]): string {
  if (clusters.length === 0) return 'N/A';
  
  const sizes = clusters.map(c => c.size);
  const max = Math.max(...sizes);
  const min = Math.min(...sizes);
  const ratio = min / max;
  
  if (ratio >= 0.7) return 'Balanced';
  if (ratio >= 0.4) return 'Moderate';
  return 'Unbalanced';
}

function isBalanced(clusters: { size: number }[]): boolean {
  if (clusters.length === 0) return false;
  
  const sizes = clusters.map(c => c.size);
  const max = Math.max(...sizes);
  const min = Math.min(...sizes);
  
  return (min / max) >= 0.5;
}

