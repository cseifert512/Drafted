'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getDiversityColor } from '@/lib/colors';

interface DiversityScoreProps {
  score: number;
  interpretation: string;
}

export function DiversityScore({ score, interpretation }: DiversityScoreProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const percentage = Math.round(score * 100);
  const color = getDiversityColor(score);

  useEffect(() => {
    // Animate score counting up
    const duration = 1000;
    const steps = 60;
    const increment = score / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= score) {
        setAnimatedScore(score);
        clearInterval(timer);
      } else {
        setAnimatedScore(current);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [score]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="card p-8 text-center"
    >
      {/* Score Display */}
      <div className="relative inline-flex items-center justify-center">
        {/* Background ring */}
        <svg className="w-48 h-48 transform -rotate-90">
          <circle
            cx="96"
            cy="96"
            r="88"
            fill="none"
            stroke="#f5f5f5"
            strokeWidth="12"
          />
          <motion.circle
            cx="96"
            cy="96"
            r="88"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 88}
            initial={{ strokeDashoffset: 2 * Math.PI * 88 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 88 * (1 - score) }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>

        {/* Score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-bold text-neutral-900 tabular-nums">
            {Math.round(animatedScore * 100)}
          </span>
          <span className="text-sm font-medium text-neutral-500 uppercase tracking-wider mt-1">
            Diversity Score
          </span>
        </div>
      </div>

      {/* Interpretation */}
      <p className="mt-6 text-neutral-600 max-w-sm mx-auto">
        {interpretation}
      </p>

      {/* Score scale */}
      <div className="mt-6 flex items-center justify-center gap-2">
        <span className="text-xs text-neutral-400">Low</span>
        <div className="w-32 h-2 rounded-full bg-gradient-to-r from-red-400 via-yellow-400 to-green-400" />
        <span className="text-xs text-neutral-400">High</span>
      </div>
    </motion.div>
  );
}









