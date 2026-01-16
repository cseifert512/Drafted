'use client';

import { useRef, useState, useEffect, useMemo, type ReactNode } from 'react';

interface EditorCanvasProps {
  // Original SVG content from nanobana (768x768)
  rawSvgContent?: string;
  
  // Cropped SVG that matches the rendered image dimensions/viewBox
  croppedSvgContent?: string;
  
  // Rendered image from Gemini (base64)
  renderedImageBase64?: string;
  
  // Toggle to show rendered overlay on top of SVG
  showRenderedOverlay?: boolean;
  
  // Called when rendered image loads (for coordinate mapping)
  onImageLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  
  // Is editing mode enabled (for cursor styling)
  isEditingEnabled?: boolean;
  
  // Wall highlight layer (rendered inside canvas)
  wallHighlightLayer?: ReactNode;
  
  // Opening preview overlay (rendered inside canvas)
  openingPreview?: ReactNode;
  
  // Debug mode - overlays SVG on top of render with transparency
  debugOverlay?: boolean;
  
  // Debug overlay opacity (0-1)
  debugOpacity?: number;
}

export function EditorCanvas({
  rawSvgContent,
  croppedSvgContent,
  renderedImageBase64,
  showRenderedOverlay = false,
  onImageLoad,
  isEditingEnabled = false,
  wallHighlightLayer,
  openingPreview,
  debugOverlay = false,
  debugOpacity = 0.5,
}: EditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  
  // Track the rendered image's natural dimensions
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  
  // Determine display mode
  const hasRendered = !!renderedImageBase64;
  const displayMode = (showRenderedOverlay && hasRendered) ? 'rendered' : 'svg';
  
  // Handle image load - capture natural dimensions
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    console.log('[EditorCanvas] Rendered image loaded:', img.naturalWidth, 'x', img.naturalHeight);
    onImageLoad?.(e);
  };
  
  // For SVG-only mode, parse dimensions from SVG
  const svgDimensions = (() => {
    const svg = croppedSvgContent || rawSvgContent;
    if (!svg) return { width: 768, height: 768 };
    
    // Try to get viewBox dimensions
    const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].split(/[\s,]+/).map(parseFloat);
      if (parts.length === 4) {
        return { width: parts[2], height: parts[3] };
      }
    }
    
    // Fallback to width/height attributes
    const widthMatch = svg.match(/width="(\d+(?:\.\d+)?)"/);
    const heightMatch = svg.match(/height="(\d+(?:\.\d+)?)"/);
    if (widthMatch && heightMatch) {
      return { width: parseFloat(widthMatch[1]), height: parseFloat(heightMatch[1]) };
    }
    
    return { width: 768, height: 768 };
  })();
  
  // Use rendered image dimensions when in rendered mode, SVG dimensions otherwise
  const displayDimensions = displayMode === 'rendered' && imageDimensions 
    ? imageDimensions 
    : svgDimensions;
  
  // Debug: Parse SVG info when debug mode is active
  const debugInfo = useMemo(() => {
    if (!debugOverlay) return null;
    
    const svg = croppedSvgContent || rawSvgContent;
    if (!svg) return null;
    
    // Extract viewBox
    const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
    const viewBox = viewBoxMatch ? viewBoxMatch[1] : 'none';
    
    // Parse viewBox dimensions
    let viewBoxWidth = 0, viewBoxHeight = 0;
    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].split(/[\s,]+/).map(parseFloat);
      if (parts.length === 4) {
        viewBoxWidth = parts[2];
        viewBoxHeight = parts[3];
      }
    }
    
    // Extract width/height attributes
    const widthMatch = svg.match(/width="([^"]+)"/);
    const heightMatch = svg.match(/height="([^"]+)"/);
    const svgWidth = widthMatch ? widthMatch[1] : 'auto';
    const svgHeight = heightMatch ? heightMatch[1] : 'auto';
    
    // Parse numeric dimensions
    const svgWidthNum = parseFloat(svgWidth) || 0;
    const svgHeightNum = parseFloat(svgHeight) || 0;
    
    // Count room polygons and extract fill colors
    const roomMatches = svg.match(/data-room-(?:id|type)="[^"]+"/g) || [];
    const roomTypes: string[] = [];
    const roomTypeRegex = /data-room-type="([^"]+)"/g;
    let roomMatch: RegExpExecArray | null;
    while ((roomMatch = roomTypeRegex.exec(svg)) !== null) {
      roomTypes.push(roomMatch[1]);
    }
    
    // Extract unique fill colors from polygons
    const fillColors: string[] = [];
    const fillRegex = /<polygon[^>]*fill="([^"]+)"/g;
    let fillMatch: RegExpExecArray | null;
    while ((fillMatch = fillRegex.exec(svg)) !== null) {
      const color = fillMatch[1].toLowerCase();
      if (color !== 'none' && color !== '#ffffff' && color !== 'white' && 
          color !== '#000000' && color !== 'black' && !fillColors.includes(color)) {
        fillColors.push(color);
      }
    }
    
    // Check for room labels group
    const hasRoomLabels = svg.includes('id="room-labels"');
    
    // Count wall segments
    const wallCount = (svg.match(/<(?:polyline|polygon)[^>]*(?:stroke|fill)="black"/g) || []).length;
    
    // Calculate dimension mismatch
    const renderWidth = imageDimensions?.width || 0;
    const renderHeight = imageDimensions?.height || 0;
    const widthRatio = renderWidth && svgWidthNum ? (renderWidth / svgWidthNum).toFixed(3) : 'N/A';
    const heightRatio = renderHeight && svgHeightNum ? (renderHeight / svgHeightNum).toFixed(3) : 'N/A';
    const dimensionsMismatch = svgWidthNum !== renderWidth || svgHeightNum !== renderHeight;
    
    return {
      viewBox,
      viewBoxWidth,
      viewBoxHeight,
      svgWidth,
      svgHeight,
      svgWidthNum,
      svgHeightNum,
      roomCount: roomMatches.length,
      roomTypes,
      fillColors,
      hasRoomLabels,
      wallCount,
      usingCropped: !!croppedSvgContent,
      widthRatio,
      heightRatio,
      dimensionsMismatch,
    };
  }, [debugOverlay, croppedSvgContent, rawSvgContent, imageDimensions]);
  
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-auto bg-gray-100 rounded-lg border border-drafted-border flex items-center justify-center p-4"
      style={{ cursor: isEditingEnabled ? 'crosshair' : 'default' }}
    >
      {/* Content container - sized to content */}
      <div 
        className="relative bg-white shadow-lg"
        style={{ 
          width: displayDimensions.width,
          height: displayDimensions.height,
        }}
      >
        {/* SVG layer - shown when in SVG mode */}
        {displayMode === 'svg' && (croppedSvgContent || rawSvgContent) && (
          <div
            dangerouslySetInnerHTML={{ __html: croppedSvgContent || rawSvgContent || '' }}
            style={{ 
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
            }}
          />
        )}
        
        {/* Rendered image - shown when in rendered mode, preserves natural AR */}
        {displayMode === 'rendered' && renderedImageBase64 && (
          <img
            ref={imgRef}
            src={`data:image/png;base64,${renderedImageBase64}`}
            alt="Rendered floor plan"
            style={{ 
              display: 'block',
              width: '100%',
              height: '100%',
            }}
            draggable={false}
            onLoad={handleImageLoad}
          />
        )}
        
        {/* DEBUG: SVG overlay on top of rendered image */}
        {debugOverlay && displayMode === 'rendered' && (croppedSvgContent || rawSvgContent) && (
          <div
            className="debug-svg-overlay"
            dangerouslySetInnerHTML={{ 
              __html: (() => {
                // Force SVG to scale to container by replacing width/height with 100%
                let svgStr = croppedSvgContent || rawSvgContent || '';
                // Replace width="..." with width="100%"
                svgStr = svgStr.replace(/(<svg[^>]*)\swidth="[^"]+"/i, '$1 width="100%"');
                // Replace height="..." with height="100%"  
                svgStr = svgStr.replace(/(<svg[^>]*)\sheight="[^"]+"/i, '$1 height="100%"');
                // Ensure preserveAspectRatio allows stretching to match render
                if (!svgStr.includes('preserveAspectRatio')) {
                  svgStr = svgStr.replace(/<svg/, '<svg preserveAspectRatio="none"');
                }
                return svgStr;
              })()
            }}
            style={{ 
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: debugOpacity,
              pointerEvents: 'none',
              mixBlendMode: 'multiply',
            }}
          />
        )}
        
        {/* Wall highlight layer - overlays on rendered image */}
        {wallHighlightLayer}
        
        {/* Opening preview overlay */}
        {openingPreview}
      </div>
      
      {/* Mode indicator */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <div className={`px-2 py-1 text-white text-xs rounded ${
          displayMode === 'rendered' ? 'bg-purple-500/80' : 'bg-blue-500/80'
        }`}>
          {displayMode === 'rendered' ? 'Rendered' : 'SVG Only'}
        </div>
        {imageDimensions && displayMode === 'rendered' && (
          <div className="px-2 py-1 bg-black/60 text-white text-xs rounded">
            {imageDimensions.width} × {imageDimensions.height}
          </div>
        )}
        {!hasRendered && (
          <div className="px-2 py-1 bg-amber-500/80 text-white text-xs rounded">
            No rendered image
          </div>
        )}
        {isEditingEnabled && (
          <div className="px-2 py-1 bg-orange-500/80 text-white text-xs rounded">
            Editing
          </div>
        )}
        {debugOverlay && (
          <div className="px-2 py-1 bg-red-500/80 text-white text-xs rounded animate-pulse">
            DEBUG: SVG Overlay ({Math.round(debugOpacity * 100)}%)
          </div>
        )}
      </div>
      
      {/* Debug Info Panel */}
      {debugOverlay && debugInfo && (
        <div className="absolute top-3 right-3 bg-black/90 text-white text-xs p-3 rounded-lg max-w-sm font-mono overflow-y-auto max-h-[80vh]">
          <div className="font-bold text-red-400 mb-2 border-b border-red-400/30 pb-1">
            🐛 SVG Debug Info
          </div>
          <div className="space-y-1.5">
            <div>
              <span className="text-gray-400">Using:</span>{' '}
              <span className={debugInfo.usingCropped ? 'text-green-400' : 'text-yellow-400'}>
                {debugInfo.usingCropped ? 'cropped SVG' : 'raw SVG'}
              </span>
            </div>
            
            {/* Dimension comparison */}
            <div className="border-t border-gray-700 pt-1.5 mt-1.5">
              <div className="font-bold text-yellow-400 mb-1">📐 Dimensions</div>
              <div>
                <span className="text-gray-400">SVG:</span>{' '}
                <span className="text-cyan-400">{debugInfo.svgWidth} × {debugInfo.svgHeight}</span>
              </div>
              <div>
                <span className="text-gray-400">Render:</span>{' '}
                <span className="text-purple-400">
                  {imageDimensions ? `${imageDimensions.width} × ${imageDimensions.height}` : 'loading...'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Scale:</span>{' '}
                <span className={debugInfo.dimensionsMismatch ? 'text-red-400' : 'text-green-400'}>
                  {debugInfo.widthRatio}x W, {debugInfo.heightRatio}x H
                </span>
              </div>
              {debugInfo.dimensionsMismatch && (
                <div className="text-red-400 text-[10px] mt-1 bg-red-900/30 p-1 rounded">
                  ⚠️ MISMATCH: SVG and render have different dimensions!
                </div>
              )}
            </div>
            
            {/* ViewBox info */}
            <div className="border-t border-gray-700 pt-1.5 mt-1.5">
              <div>
                <span className="text-gray-400">viewBox:</span>{' '}
                <span className="text-cyan-400 text-[10px]">{debugInfo.viewBox}</span>
              </div>
            </div>
            
            {/* Room info */}
            <div className="border-t border-gray-700 pt-1.5 mt-1.5">
              <div className="font-bold text-orange-400 mb-1">🏠 Rooms</div>
              <div>
                <span className="text-gray-400">Count:</span>{' '}
                <span className="text-orange-400">{debugInfo.roomCount}</span>
                {debugInfo.hasRoomLabels && (
                  <span className="text-green-400 ml-2">✓ labels in SVG</span>
                )}
                {!debugInfo.hasRoomLabels && (
                  <span className="text-red-400 ml-2">✗ no labels</span>
                )}
              </div>
              
              {/* Fill colors detected */}
              {debugInfo.fillColors.length > 0 && (
                <div className="mt-1">
                  <span className="text-gray-400">Fill colors ({debugInfo.fillColors.length}):</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {debugInfo.fillColors.slice(0, 12).map((color, i) => (
                      <div 
                        key={i} 
                        className="w-4 h-4 rounded border border-white/30"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                    {debugInfo.fillColors.length > 12 && (
                      <span className="text-gray-500">+{debugInfo.fillColors.length - 12}</span>
                    )}
                  </div>
                </div>
              )}
              
              {/* Room types if available */}
              {debugInfo.roomTypes.length > 0 && (
                <div className="text-gray-400 text-[10px] mt-1 pl-2">
                  {debugInfo.roomTypes.slice(0, 6).map((t, i) => (
                    <div key={i}>• {t}</div>
                  ))}
                  {debugInfo.roomTypes.length > 6 && (
                    <div>... +{debugInfo.roomTypes.length - 6} more</div>
                  )}
                </div>
              )}
            </div>
            
            {/* Wall info */}
            <div className="border-t border-gray-700 pt-1.5 mt-1.5">
              <span className="text-gray-400">Walls detected:</span>{' '}
              <span className="text-blue-400">{debugInfo.wallCount}</span>
            </div>
          </div>
          
          <div className="mt-2 pt-2 border-t border-gray-700 text-[10px] text-gray-500">
            SVG overlay uses preserveAspectRatio="none" to force alignment.
            <br/>If still misaligned, viewBox or crop is wrong.
          </div>
        </div>
      )}
    </div>
  );
}
