'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface ScoreCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  delay?: number;
}

export function ScoreCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon,
  trend,
  delay = 0 
}: ScoreCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="card p-6"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900 tabular-nums">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
          )}
        </div>
        
        {Icon && (
          <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary-500" />
          </div>
        )}
      </div>

      {trend && (
        <div className={`mt-4 flex items-center text-sm ${
          trend === 'up' ? 'text-green-600' :
          trend === 'down' ? 'text-red-600' :
          'text-neutral-500'
        }`}>
          {trend === 'up' && '↑'}
          {trend === 'down' && '↓'}
          {trend === 'neutral' && '→'}
          <span className="ml-1">
            {trend === 'up' ? 'Above average' :
             trend === 'down' ? 'Below average' :
             'Average'}
          </span>
        </div>
      )}
    </motion.div>
  );
}











