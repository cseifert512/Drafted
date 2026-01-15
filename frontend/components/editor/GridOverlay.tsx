'use client';

import { useMemo } from 'react';
import type { GridConfig, ViewportState } from '@/lib/editor/editorTypes';
import { CANVAS_SIZE } from '@/lib/editor/editorTypes';

interface GridOverlayProps {
  grid: GridConfig;
  viewport: ViewportState;
  canvasSize?: number;
}

export function GridOverlay({ 
  grid, 
  viewport, 
  canvasSize = CANVAS_SIZE 
}: GridOverlayProps) {
  const { size, visible, color, opacity } = grid;
  
  const gridLines = useMemo(() => {
    if (!visible) return null;
    
    const lines: JSX.Element[] = [];
    const numLines = Math.ceil(canvasSize / size);
    
    // Vertical lines
    for (let i = 0; i <= numLines; i++) {
      const x = i * size;
      lines.push(
        <line
          key={`v-${i}`}
          x1={x}
          y1={0}
          x2={x}
          y2={canvasSize}
          stroke={color}
          strokeWidth={0.5}
          opacity={opacity}
        />
      );
    }
    
    // Horizontal lines
    for (let i = 0; i <= numLines; i++) {
      const y = i * size;
      lines.push(
        <line
          key={`h-${i}`}
          x1={0}
          y1={y}
          x2={canvasSize}
          y2={y}
          stroke={color}
          strokeWidth={0.5}
          opacity={opacity}
        />
      );
    }
    
    return lines;
  }, [visible, size, color, opacity, canvasSize]);
  
  if (!visible) return null;
  
  return (
    <g className="grid-overlay pointer-events-none">
      {gridLines}
    </g>
  );
}

// Dot grid variant
export function DotGridOverlay({ 
  grid, 
  viewport, 
  canvasSize = CANVAS_SIZE 
}: GridOverlayProps) {
  const { size, visible, color, opacity } = grid;
  
  const dots = useMemo(() => {
    if (!visible) return null;
    
    const dotElements: JSX.Element[] = [];
    const numDots = Math.ceil(canvasSize / size);
    
    for (let i = 0; i <= numDots; i++) {
      for (let j = 0; j <= numDots; j++) {
        dotElements.push(
          <circle
            key={`dot-${i}-${j}`}
            cx={i * size}
            cy={j * size}
            r={1}
            fill={color}
            opacity={opacity}
          />
        );
      }
    }
    
    return dotElements;
  }, [visible, size, color, opacity, canvasSize]);
  
  if (!visible) return null;
  
  return (
    <g className="dot-grid-overlay pointer-events-none">
      {dots}
    </g>
  );
}


