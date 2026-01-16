'use client';

import React from 'react';
import type { GenerationProgress } from '@/hooks/useGeneration';

interface CircularProgressProps {
  progress: GenerationProgress;
  size?: number;
  strokeWidth?: number;
}

export function CircularProgress({ 
  progress, 
  size = 120, 
  strokeWidth = 8 
}: CircularProgressProps) {
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress.percentage / 100) * circumference;
  
  const phaseLabels: Record<string, string> = {
    generating: 'Generating',
    stylizing: 'Drafting',
    analyzing: 'Analyzing',
    complete: 'Complete',
  };
  
  const phaseColors: Record<string, string> = {
    generating: '#FF6B4A', // coral
    stylizing: '#4A9EFF', // blue
    analyzing: '#9B59B6', // purple
    complete: '#2ECC71', // green
  };
  
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background circle */}
        <svg className="absolute inset-0" width={size} height={size}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255, 107, 74, 0.15)"
            strokeWidth={strokeWidth}
          />
        </svg>
        
        {/* Progress circle */}
        <svg 
          className="absolute inset-0 -rotate-90 transition-all duration-500 ease-out" 
          width={size} 
          height={size}
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={phaseColors[progress.phase]}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-500 ease-out"
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-drafted-900">
            {progress.percentage}%
          </span>
        </div>
      </div>
      
      {/* Phase label */}
      <div className="text-center">
        <p className="font-serif text-lg font-semibold text-drafted-800">
          {phaseLabels[progress.phase]}
        </p>
        <p className="text-sm text-drafted-500">
          {progress.completed}/{progress.total} {progress.phase === 'generating' ? 'plans' : 'renders'}
        </p>
      </div>
    </div>
  );
}

// Compact inline version for sidebar
export function InlineProgress({ 
  progress,
}: { 
  progress: GenerationProgress;
}) {
  const phaseLabels: Record<string, string> = {
    generating: 'Generating plans',
    stylizing: 'Drafting views',
    analyzing: 'Running analysis',
    complete: 'Complete',
  };
  
  return (
    <div className="flex items-center gap-3 p-3 bg-coral-50 rounded-lg border border-coral-200">
      {/* Mini spinner */}
      <div className="relative w-8 h-8">
        <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
          <circle
            cx="16"
            cy="16"
            r="12"
            fill="none"
            stroke="rgba(255, 107, 74, 0.2)"
            strokeWidth="3"
          />
          <circle
            cx="16"
            cy="16"
            r="12"
            fill="none"
            stroke="#FF6B4A"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={75.4}
            strokeDashoffset={75.4 - (progress.percentage / 100) * 75.4}
            className="transition-all duration-300"
          />
        </svg>
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-drafted-800 truncate">
          {phaseLabels[progress.phase]}
        </p>
        <p className="text-xs text-drafted-500">
          {progress.completed}/{progress.total} • {progress.percentage}%
        </p>
      </div>
    </div>
  );
}







