'use client';

import { motion } from 'framer-motion';
import type { MetricBreakdown as MetricBreakdownType } from '@/lib/types';

interface MetricBreakdownProps {
  metrics: MetricBreakdownType[];
}

export function MetricBreakdown({ metrics }: MetricBreakdownProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="card p-6"
    >
      <h3 className="text-lg font-semibold text-neutral-900 mb-6">
        Metric Breakdown
      </h3>

      <div className="space-y-5">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-sm font-medium text-neutral-900">
                  {metric.display_name}
                </span>
                <span className="text-xs text-neutral-400 ml-2">
                  ({Math.round(metric.weight * 100)}% weight)
                </span>
              </div>
              <span className="text-sm font-semibold text-neutral-900 tabular-nums">
                {Math.round(metric.score * 100)}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  backgroundColor: getMetricColor(metric.score),
                }}
                initial={{ width: 0 }}
                animate={{ width: `${metric.score * 100}%` }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Metric explanations */}
      <div className="mt-8 pt-6 border-t border-neutral-100">
        <h4 className="text-sm font-medium text-neutral-900 mb-3">
          What these metrics mean
        </h4>
        <dl className="space-y-2 text-xs text-neutral-500">
          <div>
            <dt className="font-medium text-neutral-600">Coverage</dt>
            <dd>How much of the design space is explored</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-600">Dispersion</dt>
            <dd>Average distance between designs in feature space</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-600">Cluster Entropy</dt>
            <dd>How evenly designs are distributed across clusters</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-600">Graph Diversity</dt>
            <dd>Variation in room adjacency patterns</dd>
          </div>
        </dl>
      </div>
    </motion.div>
  );
}

function getMetricColor(score: number): string {
  if (score >= 0.7) return '#22c55e';
  if (score >= 0.4) return '#eab308';
  return '#ef4444';
}








