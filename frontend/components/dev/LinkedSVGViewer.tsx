'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GeneratedRoom } from '@/lib/drafted-types';

interface RoomInfo {
  roomType: string;
  displayName: string;
  areaSqft: number;
  element?: SVGElement;
}

interface LinkedSVGViewerProps {
  /** Array of SVG strings to display */
  svgs: string[];
  /** Array of room data corresponding to each SVG */
  roomData: GeneratedRoom[][];
  /** Labels for each SVG */
  labels?: string[];
  /** Layout mode */
  layout?: 'horizontal' | 'vertical' | 'grid';
  /** Whether to show the JPEG alongside SVG */
  jpegBase64s?: (string | undefined)[];
  /** Show format toggle */
  showFormatToggle?: boolean;
  /** Initial format */
  initialFormat?: 'svg' | 'jpeg';
  /** Class name */
  className?: string;
  /** Height of each viewer */
  height?: number;
}

/**
 * Extracts room type from SVG element (from fill color or data attribute)
 */
function getRoomTypeFromElement(element: SVGElement, roomData: GeneratedRoom[]): string | null {
  // First check for data attribute
  const dataRoomType = element.getAttribute('data-room-type');
  if (dataRoomType) return dataRoomType;
  
  // Check fill color and match to room data
  const fill = element.getAttribute('fill')?.toLowerCase();
  if (!fill) return null;
  
  // Room colors from the training palette (simplified matching)
  const colorToRoomMap: Record<string, string[]> = {
    '#f4a460': ['primary_bedroom'],
    '#ffd700': ['primary_bathroom'],
    '#daa520': ['primary_closet'],
    '#ff8c00': ['bedroom'],
    '#ff69b4': ['bathroom'],
    '#87ceeb': ['living', 'family_room'],
    '#98fb98': ['kitchen'],
    '#dda0dd': ['dining', 'nook'],
    '#f0e68c': ['garage'],
    '#b0c4de': ['laundry'],
    '#d3d3d3': ['storage', 'mudroom'],
    '#add8e6': ['office', 'den'],
    '#ffa07a': ['outdoor_living'],
    '#90ee90': ['pool'],
  };
  
  // Find matching room type
  for (const [color, types] of Object.entries(colorToRoomMap)) {
    if (fill.includes(color.slice(1).toLowerCase())) {
      // Find matching room in data
      for (const room of roomData) {
        if (types.includes(room.room_type)) {
          return room.room_type;
        }
      }
    }
  }
  
  return null;
}

/**
 * Processes SVG string to add interactive attributes to room polygons
 */
function processsvgForInteraction(
  svgString: string,
  roomData: GeneratedRoom[],
  viewerId: string
): string {
  // Create a temporary DOM parser
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  
  // Find all polygon, rect, and path elements (potential rooms)
  const elements = doc.querySelectorAll('polygon, rect, path');
  
  elements.forEach((el, index) => {
    const fill = el.getAttribute('fill');
    if (!fill || fill === 'none' || fill === '#ffffff' || fill === 'white') {
      return; // Skip non-room elements
    }
    
    // Add interactive class
    el.classList.add('svg-room-interactive');
    
    // Try to match room type
    const roomType = getRoomTypeFromElement(el as SVGElement, roomData);
    if (roomType) {
      el.setAttribute('data-room-type', roomType);
      el.setAttribute('data-viewer-id', viewerId);
      el.setAttribute('data-room-index', String(index));
    }
  });
  
  // Serialize back to string
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

export function LinkedSVGViewer({
  svgs,
  roomData,
  labels,
  layout = 'horizontal',
  jpegBase64s,
  showFormatToggle = true,
  initialFormat = 'svg',
  className = '',
  height = 350,
}: LinkedSVGViewerProps) {
  const [hoveredRoomType, setHoveredRoomType] = useState<string | null>(null);
  const [tooltipInfo, setTooltipInfo] = useState<RoomInfo | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [format, setFormat] = useState<'svg' | 'jpeg'>(initialFormat);
  
  const containerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const viewerIds = useMemo(
    () => svgs.map((_, i) => `viewer-${i}-${Date.now()}`),
    [svgs.length]
  );
  
  // Process SVGs for interaction
  const processedSvgs = useMemo(
    () => svgs.map((svg, i) => processsvgForInteraction(svg, roomData[i] || [], viewerIds[i])),
    [svgs, roomData, viewerIds]
  );
  
  // Handle mouse enter on room
  const handleRoomEnter = useCallback((
    event: React.MouseEvent,
    roomType: string,
    viewerIndex: number
  ) => {
    setHoveredRoomType(roomType);
    
    // Find room info
    const rooms = roomData[viewerIndex] || [];
    const room = rooms.find(r => r.room_type === roomType);
    
    if (room) {
      setTooltipInfo({
        roomType: room.room_type,
        displayName: room.display_name || room.room_type.replace(/_/g, ' '),
        areaSqft: room.area_sqft,
      });
      
      setTooltipPosition({
        x: event.clientX,
        y: event.clientY - 50,
      });
    }
  }, [roomData]);
  
  // Handle mouse leave
  const handleRoomLeave = useCallback(() => {
    setHoveredRoomType(null);
    setTooltipInfo(null);
  }, []);
  
  // Add event listeners to SVG elements
  useEffect(() => {
    const handlers: Array<{ el: Element; type: string; handler: EventListener }> = [];
    
    containerRefs.current.forEach((container, viewerIndex) => {
      if (!container) return;
      
      const rooms = container.querySelectorAll('[data-room-type]');
      rooms.forEach((el) => {
        const roomType = el.getAttribute('data-room-type');
        if (!roomType) return;
        
        const enterHandler = (e: Event) => {
          handleRoomEnter(e as unknown as React.MouseEvent, roomType, viewerIndex);
        };
        const leaveHandler = () => handleRoomLeave();
        
        el.addEventListener('mouseenter', enterHandler);
        el.addEventListener('mouseleave', leaveHandler);
        
        handlers.push({ el, type: 'mouseenter', handler: enterHandler });
        handlers.push({ el, type: 'mouseleave', handler: leaveHandler });
      });
    });
    
    return () => {
      handlers.forEach(({ el, type, handler }) => {
        el.removeEventListener(type, handler);
      });
    };
  }, [processedSvgs, handleRoomEnter, handleRoomLeave]);
  
  // Apply highlight class to matching rooms
  useEffect(() => {
    containerRefs.current.forEach((container) => {
      if (!container) return;
      
      // Remove all highlights first
      const highlighted = container.querySelectorAll('.svg-room-highlighted');
      highlighted.forEach((el) => el.classList.remove('svg-room-highlighted'));
      
      // Add highlights for hovered room type
      if (hoveredRoomType) {
        const matching = container.querySelectorAll(`[data-room-type="${hoveredRoomType}"]`);
        matching.forEach((el) => el.classList.add('svg-room-highlighted'));
      }
    });
  }, [hoveredRoomType]);
  
  const gridClass = {
    horizontal: 'flex flex-row',
    vertical: 'flex flex-col',
    grid: 'grid grid-cols-2',
  }[layout];
  
  const hasJpeg = jpegBase64s?.some(Boolean);
  
  return (
    <div className={`relative ${className}`}>
      {/* Format Toggle */}
      {showFormatToggle && hasJpeg && (
        <div className="flex items-center justify-center gap-2 mb-3">
          <button
            onClick={() => setFormat('svg')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              format === 'svg'
                ? 'bg-coral-500 text-white'
                : 'bg-drafted-bg text-drafted-gray hover:text-drafted-black'
            }`}
          >
            SVG
          </button>
          <button
            onClick={() => setFormat('jpeg')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              format === 'jpeg'
                ? 'bg-coral-500 text-white'
                : 'bg-drafted-bg text-drafted-gray hover:text-drafted-black'
            }`}
          >
            JPEG
          </button>
        </div>
      )}
      
      {/* SVG Viewers */}
      <div className={`${gridClass} gap-4`}>
        {svgs.map((_, index) => (
          <div key={viewerIds[index]} className="flex-1 min-w-0">
            {/* Label */}
            {labels?.[index] && (
              <div className="text-xs font-medium text-drafted-gray mb-2 text-center">
                {labels[index]}
              </div>
            )}
            
            {/* Viewer */}
            <div
              ref={(el) => { containerRefs.current[index] = el; }}
              className="bg-white rounded-lg border border-drafted-border overflow-hidden"
              style={{ height }}
            >
              {format === 'svg' ? (
                <div
                  className="w-full h-full p-4 flex items-center justify-center"
                  dangerouslySetInnerHTML={{
                    __html: processedSvgs[index].replace(
                      /<svg([^>]*)>/,
                      '<svg$1 style="max-width: 100%; max-height: 100%; width: auto; height: auto;">'
                    ),
                  }}
                />
              ) : jpegBase64s?.[index] ? (
                <div className="w-full h-full p-4 flex items-center justify-center">
                  <img
                    src={`data:image/jpeg;base64,${jpegBase64s[index]}`}
                    alt={`Floor plan ${index + 1}`}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-drafted-muted text-sm">
                  No JPEG available
                </div>
              )}
            </div>
            
            {/* Room count */}
            <div className="text-xs text-drafted-muted mt-1 text-center">
              {roomData[index]?.length || 0} rooms
            </div>
          </div>
        ))}
      </div>
      
      {/* Tooltip */}
      <AnimatePresence>
        {tooltipInfo && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="room-tooltip"
            style={{
              position: 'fixed',
              left: tooltipPosition.x,
              top: tooltipPosition.y,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="font-medium capitalize">{tooltipInfo.displayName}</div>
            <div className="text-drafted-muted">
              {Math.round(tooltipInfo.areaSqft)} sqft
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Hover hint */}
      <div className="text-xs text-center text-drafted-muted mt-3">
        Hover over rooms to highlight matching rooms across views
      </div>
    </div>
  );
}


