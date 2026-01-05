'use client';

import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { motion } from 'framer-motion';
import type { ScatterPoint, ClusterInfo, PlotBounds } from '@/lib/types';
import { getClusterColor } from '@/lib/colors';

interface ScatterPlotProps {
  points: ScatterPoint[];
  clusters: ClusterInfo[];
  bounds: PlotBounds;
  onPointHover?: (point: ScatterPoint | null) => void;
  onPointClick?: (point: ScatterPoint) => void;
  selectedPointId?: string;
  width?: number;
  height?: number;
}

export function ScatterPlot({
  points,
  clusters,
  bounds,
  onPointHover,
  onPointClick,
  selectedPointId,
  width = 600,
  height = 400,
}: ScatterPlotProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<ScatterPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!svgRef.current || points.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 40, left: 40 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create scales
    const xScale = d3.scaleLinear()
      .domain([bounds.x_min, bounds.x_max])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([bounds.y_min, bounds.y_max])
      .range([innerHeight, 0]);

    // Create main group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add subtle grid
    const xGrid = d3.axisBottom(xScale)
      .tickSize(-innerHeight)
      .tickFormat(() => '');

    const yGrid = d3.axisLeft(yScale)
      .tickSize(-innerWidth)
      .tickFormat(() => '');

    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xGrid)
      .selectAll('line')
      .attr('stroke', '#f0f0f0');

    g.append('g')
      .attr('class', 'grid')
      .call(yGrid)
      .selectAll('line')
      .attr('stroke', '#f0f0f0');

    // Remove domain lines from grid
    g.selectAll('.grid .domain').remove();

    // Draw cluster hulls
    clusters.forEach(cluster => {
      const clusterPoints = points.filter(p => p.cluster === cluster.id);
      
      if (clusterPoints.length >= 3) {
        const hullPoints = d3.polygonHull(
          clusterPoints.map(p => [xScale(p.x), yScale(p.y)] as [number, number])
        );

        if (hullPoints) {
          g.append('path')
            .datum(hullPoints)
            .attr('d', d3.line().curve(d3.curveCardinalClosed.tension(0.5)))
            .attr('fill', cluster.color)
            .attr('fill-opacity', 0.08)
            .attr('stroke', cluster.color)
            .attr('stroke-opacity', 0.2)
            .attr('stroke-width', 1);
        }
      }
    });

    // Draw points
    const pointsGroup = g.selectAll('.point')
      .data(points)
      .enter()
      .append('g')
      .attr('class', 'point')
      .attr('transform', d => `translate(${xScale(d.x)},${yScale(d.y)})`)
      .style('cursor', 'pointer');

    // Point circles
    pointsGroup.append('circle')
      .attr('r', d => d.id === selectedPointId ? 10 : 7)
      .attr('fill', d => getClusterColor(d.cluster))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('filter', 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.1))')
      .on('mouseenter', function(event, d) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('r', 10);
        
        setHoveredPoint(d);
        setTooltipPos({ 
          x: xScale(d.x) + margin.left, 
          y: yScale(d.y) + margin.top - 10 
        });
        onPointHover?.(d);
      })
      .on('mouseleave', function(event, d) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('r', d.id === selectedPointId ? 10 : 7);
        
        setHoveredPoint(null);
        onPointHover?.(null);
      })
      .on('click', (event, d) => {
        onPointClick?.(d);
      });

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickSize(0)
      .tickPadding(10);

    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickSize(0)
      .tickPadding(10);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll('text')
      .attr('fill', '#a3a3a3')
      .attr('font-size', '11px');

    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .attr('fill', '#a3a3a3')
      .attr('font-size', '11px');

    // Remove axis domain lines
    g.selectAll('.domain').attr('stroke', '#e5e5e5');

    // Axis labels
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 35)
      .attr('text-anchor', 'middle')
      .attr('fill', '#737373')
      .attr('font-size', '12px')
      .text('Component 1');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -30)
      .attr('text-anchor', 'middle')
      .attr('fill', '#737373')
      .attr('font-size', '12px')
      .text('Component 2');

  }, [points, clusters, bounds, width, height, selectedPointId, onPointHover, onPointClick]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="relative"
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="bg-white rounded-xl"
      />

      {/* Tooltip */}
      {hoveredPoint && (
        <div
          className="absolute pointer-events-none bg-neutral-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg transform -translate-x-1/2 -translate-y-full"
          style={{ left: tooltipPos.x, top: tooltipPos.y - 8 }}
        >
          <div className="font-medium">{hoveredPoint.label}</div>
          <div className="text-neutral-400 mt-0.5">
            Cluster {hoveredPoint.cluster + 1}
          </div>
          <div 
            className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-neutral-900 transform rotate-45"
          />
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-sm">
        <div className="text-xs font-medium text-neutral-500 mb-2">Clusters</div>
        <div className="space-y-1.5">
          {clusters.map(cluster => (
            <div key={cluster.id} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: cluster.color }}
              />
              <span className="text-xs text-neutral-600">
                Cluster {cluster.id + 1} ({cluster.size})
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

