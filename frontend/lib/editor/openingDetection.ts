/**
 * Opening Detection Utilities
 * 
 * Detects and parses existing door/window openings from SVG floor plans.
 * Allows users to click on existing openings to modify them.
 */

import type { Point, WallSegment, OpeningPlacement } from './openingTypes';
import type { CoordinateMapper } from './coordinateMapping';
import type { AssetCategory, CategoryGroup } from './assetManifest';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Detected opening from SVG
 */
export interface DetectedOpening {
  id: string;
  type: 'door' | 'window' | 'garage';
  center: Point; // SVG coordinates
  width: number; // SVG pixels
  height: number; // SVG pixels
  angle: number; // Rotation in degrees
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  // If we can determine the wall it's on
  wallId?: string;
  positionOnWall?: number;
  // Original SVG element ID
  elementId?: string;
}

/**
 * Click hit test result
 */
export interface OpeningHitResult {
  opening: DetectedOpening;
  distance: number;
}

// =============================================================================
// SVG PARSING
// =============================================================================

/**
 * Detect openings from SVG content
 * 
 * Looks for:
 * - Groups with data-opening-id attribute
 * - Door symbols (arc patterns, rectangles with specific patterns)
 * - Window symbols (rectangles with glass patterns)
 */
export function detectOpeningsFromSvg(svg: string): DetectedOpening[] {
  const openings: DetectedOpening[] = [];
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    
    // Method 1: Look for explicitly marked openings
    const markedOpenings = doc.querySelectorAll('[data-opening-id], [data-opening-type]');
    markedOpenings.forEach((el, index) => {
      const opening = parseMarkedOpening(el, index);
      if (opening) {
        openings.push(opening);
      }
    });
    
    // Method 2: Look for door symbols (groups containing arcs and rectangles)
    const doorGroups = findDoorSymbols(doc);
    doorGroups.forEach((group, index) => {
      const opening = parseDoorSymbol(group, openings.length + index);
      if (opening) {
        openings.push(opening);
      }
    });
    
    // Method 3: Look for window symbols (rectangles with specific patterns)
    const windowGroups = findWindowSymbols(doc);
    windowGroups.forEach((group, index) => {
      const opening = parseWindowSymbol(group, openings.length + index);
      if (opening) {
        openings.push(opening);
      }
    });
    
  } catch (e) {
    console.error('[openingDetection] Failed to parse SVG:', e);
  }
  
  return openings;
}

/**
 * Parse an explicitly marked opening element
 */
function parseMarkedOpening(el: Element, index: number): DetectedOpening | null {
  const id = el.getAttribute('data-opening-id') || `opening-${index}`;
  const typeAttr = el.getAttribute('data-opening-type') || 'door';
  
  // Get bounding box
  const bbox = getBoundingBox(el);
  if (!bbox) return null;
  
  // Determine type
  let type: 'door' | 'window' | 'garage' = 'door';
  if (typeAttr.includes('window')) type = 'window';
  else if (typeAttr.includes('garage')) type = 'garage';
  
  // Get transform/rotation
  const angle = getElementRotation(el);
  
  return {
    id,
    type,
    center: {
      x: (bbox.minX + bbox.maxX) / 2,
      y: (bbox.minY + bbox.maxY) / 2,
    },
    width: bbox.maxX - bbox.minX,
    height: bbox.maxY - bbox.minY,
    angle,
    boundingBox: bbox,
    elementId: el.id || undefined,
  };
}

/**
 * Find door symbols in SVG (groups with arc paths)
 */
function findDoorSymbols(doc: Document): Element[] {
  const doorGroups: Element[] = [];
  
  // Look for groups containing arc paths (door swing indicators)
  const groups = doc.querySelectorAll('g');
  groups.forEach(group => {
    // Skip if already marked as opening
    if (group.hasAttribute('data-opening-id')) return;
    
    // Check for arc path (door swing)
    const paths = group.querySelectorAll('path');
    let hasArc = false;
    paths.forEach(path => {
      const d = path.getAttribute('d') || '';
      // Arc commands in SVG path
      if (d.includes('A') || d.includes('a')) {
        hasArc = true;
      }
    });
    
    // Check for door rectangle
    const rects = group.querySelectorAll('rect');
    const hasRect = rects.length > 0;
    
    // If has both arc and rect, likely a door
    if (hasArc && hasRect) {
      doorGroups.push(group);
    }
  });
  
  return doorGroups;
}

/**
 * Parse a door symbol group
 */
function parseDoorSymbol(group: Element, index: number): DetectedOpening | null {
  const bbox = getBoundingBox(group);
  if (!bbox) return null;
  
  const angle = getElementRotation(group);
  
  return {
    id: `door-${index}`,
    type: 'door',
    center: {
      x: (bbox.minX + bbox.maxX) / 2,
      y: (bbox.minY + bbox.maxY) / 2,
    },
    width: bbox.maxX - bbox.minX,
    height: bbox.maxY - bbox.minY,
    angle,
    boundingBox: bbox,
    elementId: group.id || undefined,
  };
}

/**
 * Find window symbols in SVG
 */
function findWindowSymbols(doc: Document): Element[] {
  const windowGroups: Element[] = [];
  
  // Look for groups with window-like patterns
  const groups = doc.querySelectorAll('g');
  groups.forEach(group => {
    // Skip if already marked
    if (group.hasAttribute('data-opening-id')) return;
    
    // Check for multiple parallel lines (window mullions)
    const lines = group.querySelectorAll('line');
    const rects = group.querySelectorAll('rect');
    
    // Window typically has multiple lines or a rect with lines
    if (lines.length >= 2 || (rects.length > 0 && lines.length >= 1)) {
      // Check if it looks like a window (narrow rectangle with lines)
      const bbox = getBoundingBox(group);
      if (bbox) {
        const aspectRatio = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) / 
                           Math.min(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
        // Windows are typically elongated
        if (aspectRatio > 2) {
          windowGroups.push(group);
        }
      }
    }
  });
  
  return windowGroups;
}

/**
 * Parse a window symbol group
 */
function parseWindowSymbol(group: Element, index: number): DetectedOpening | null {
  const bbox = getBoundingBox(group);
  if (!bbox) return null;
  
  const angle = getElementRotation(group);
  
  return {
    id: `window-${index}`,
    type: 'window',
    center: {
      x: (bbox.minX + bbox.maxX) / 2,
      y: (bbox.minY + bbox.maxY) / 2,
    },
    width: bbox.maxX - bbox.minX,
    height: bbox.maxY - bbox.minY,
    angle,
    boundingBox: bbox,
    elementId: group.id || undefined,
  };
}

// =============================================================================
// GEOMETRY UTILITIES
// =============================================================================

/**
 * Get bounding box of an SVG element
 */
function getBoundingBox(el: Element): DetectedOpening['boundingBox'] | null {
  // Try to get from SVG element method
  if ('getBBox' in el && typeof (el as SVGGraphicsElement).getBBox === 'function') {
    try {
      const bbox = (el as SVGGraphicsElement).getBBox();
      return {
        minX: bbox.x,
        minY: bbox.y,
        maxX: bbox.x + bbox.width,
        maxY: bbox.y + bbox.height,
      };
    } catch {
      // getBBox can throw if element is not rendered
    }
  }
  
  // Fallback: parse from attributes
  if (el.tagName === 'rect') {
    const x = parseFloat(el.getAttribute('x') || '0');
    const y = parseFloat(el.getAttribute('y') || '0');
    const width = parseFloat(el.getAttribute('width') || '0');
    const height = parseFloat(el.getAttribute('height') || '0');
    
    if (width > 0 && height > 0) {
      return {
        minX: x,
        minY: y,
        maxX: x + width,
        maxY: y + height,
      };
    }
  }
  
  // For groups, calculate from children
  if (el.tagName === 'g') {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasChildren = false;
    
    el.querySelectorAll('rect, line, path, circle, ellipse').forEach(child => {
      const childBbox = getBoundingBox(child);
      if (childBbox) {
        hasChildren = true;
        minX = Math.min(minX, childBbox.minX);
        minY = Math.min(minY, childBbox.minY);
        maxX = Math.max(maxX, childBbox.maxX);
        maxY = Math.max(maxY, childBbox.maxY);
      }
    });
    
    if (hasChildren) {
      return { minX, minY, maxX, maxY };
    }
  }
  
  // For lines
  if (el.tagName === 'line') {
    const x1 = parseFloat(el.getAttribute('x1') || '0');
    const y1 = parseFloat(el.getAttribute('y1') || '0');
    const x2 = parseFloat(el.getAttribute('x2') || '0');
    const y2 = parseFloat(el.getAttribute('y2') || '0');
    
    return {
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2),
    };
  }
  
  return null;
}

/**
 * Get rotation angle from element transform
 */
function getElementRotation(el: Element): number {
  const transform = el.getAttribute('transform');
  if (!transform) return 0;
  
  // Parse rotate(angle) or rotate(angle, cx, cy)
  const rotateMatch = transform.match(/rotate\(([^)]+)\)/);
  if (rotateMatch) {
    const parts = rotateMatch[1].split(/[\s,]+/);
    return parseFloat(parts[0]) || 0;
  }
  
  return 0;
}

// =============================================================================
// HIT TESTING
// =============================================================================

/**
 * Test if a point hits any detected opening
 */
export function hitTestOpenings(
  point: Point,
  openings: DetectedOpening[],
  hitRadius: number = 20
): OpeningHitResult | null {
  let closest: OpeningHitResult | null = null;
  
  for (const opening of openings) {
    // Check if point is within bounding box (with padding)
    const { boundingBox } = opening;
    const padding = hitRadius;
    
    if (
      point.x >= boundingBox.minX - padding &&
      point.x <= boundingBox.maxX + padding &&
      point.y >= boundingBox.minY - padding &&
      point.y <= boundingBox.maxY + padding
    ) {
      // Calculate distance to center
      const dx = point.x - opening.center.x;
      const dy = point.y - opening.center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (!closest || distance < closest.distance) {
        closest = { opening, distance };
      }
    }
  }
  
  return closest;
}

/**
 * Convert detected opening to PNG coordinates for display
 */
export function openingToDisplayCoords(
  opening: DetectedOpening,
  mapper: CoordinateMapper
): {
  center: Point;
  width: number;
  height: number;
  angle: number;
} {
  const centerPng = mapper.svgToPng(opening.center);
  
  // Scale dimensions
  const scaleX = mapper.pngDimensions.width / mapper.svgViewBox.width;
  const scaleY = mapper.pngDimensions.height / mapper.svgViewBox.height;
  
  return {
    center: centerPng,
    width: opening.width * scaleX,
    height: opening.height * scaleY,
    angle: opening.angle,
  };
}

/**
 * Find which wall an opening is on
 */
export function findOpeningWall(
  opening: DetectedOpening,
  walls: WallSegment[],
  maxDistance: number = 30
): { wall: WallSegment; positionOnWall: number } | null {
  let closest: { wall: WallSegment; positionOnWall: number; distance: number } | null = null;
  
  for (const wall of walls) {
    // Calculate distance from opening center to wall line
    const wallDx = wall.end.x - wall.start.x;
    const wallDy = wall.end.y - wall.start.y;
    const wallLength = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
    
    // Project opening center onto wall line
    const t = Math.max(0, Math.min(1,
      ((opening.center.x - wall.start.x) * wallDx + (opening.center.y - wall.start.y) * wallDy) / (wallLength * wallLength)
    ));
    
    // Point on wall closest to opening center
    const closestX = wall.start.x + t * wallDx;
    const closestY = wall.start.y + t * wallDy;
    
    // Distance from opening center to closest point on wall
    const dx = opening.center.x - closestX;
    const dy = opening.center.y - closestY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance <= maxDistance && (!closest || distance < closest.distance)) {
      closest = { wall, positionOnWall: t, distance };
    }
  }
  
  return closest ? { wall: closest.wall, positionOnWall: closest.positionOnWall } : null;
}

export default {
  detectOpeningsFromSvg,
  hitTestOpenings,
  openingToDisplayCoords,
  findOpeningWall,
};

