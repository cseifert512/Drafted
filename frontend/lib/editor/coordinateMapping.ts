/**
 * Coordinate Mapping Utilities
 * 
 * Maps coordinates between:
 * - Rendered PNG (what users see and click on)
 * - Source SVG (where wall data lives)
 * - Screen coordinates (mouse events)
 */

import type { WallSegment } from './openingTypes';
import type { Point } from './editorTypes';
import { findNearestWall } from './wallDetection';

/**
 * SVG viewBox parsed from SVG string
 */
export interface SVGViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Coordinate mapper for bidirectional PNG <-> SVG conversion
 */
export interface CoordinateMapper {
  pngToSvg: (pngPoint: Point) => Point;
  svgToPng: (svgPoint: Point) => Point;
  pngDimensions: { width: number; height: number };
  svgViewBox: SVGViewBox;
}

/**
 * Parse viewBox attribute from SVG string
 */
export function parseViewBox(svg: string): SVGViewBox | null {
  const match = svg.match(/viewBox="([^"]+)"/);
  if (!match) return null;
  
  const parts = match[1].split(/\s+/).map(parseFloat);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  
  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

/**
 * Parse width and height attributes from SVG string
 */
export function parseSvgDimensions(svg: string): { width: number; height: number } | null {
  const widthMatch = svg.match(/width="([^"]+)"/);
  const heightMatch = svg.match(/height="([^"]+)"/);
  
  if (!widthMatch || !heightMatch) return null;
  
  const width = parseFloat(widthMatch[1]);
  const height = parseFloat(heightMatch[1]);
  
  if (isNaN(width) || isNaN(height)) return null;
  
  return { width, height };
}

/**
 * Create a coordinate mapper between PNG and SVG coordinate systems
 * 
 * The rendered PNG may have different dimensions than the SVG viewBox.
 * This mapper handles the transformation.
 * 
 * @param pngDimensions - Actual dimensions of the rendered PNG image
 * @param svgViewBox - ViewBox of the source SVG
 */
export function createCoordinateMapper(
  pngDimensions: { width: number; height: number },
  svgViewBox: SVGViewBox
): CoordinateMapper {
  // Scale factors
  const scaleX = svgViewBox.width / pngDimensions.width;
  const scaleY = svgViewBox.height / pngDimensions.height;
  
  return {
    pngToSvg: (pngPoint: Point) => ({
      x: svgViewBox.x + pngPoint.x * scaleX,
      y: svgViewBox.y + pngPoint.y * scaleY,
    }),
    svgToPng: (svgPoint: Point) => ({
      x: (svgPoint.x - svgViewBox.x) / scaleX,
      y: (svgPoint.y - svgViewBox.y) / scaleY,
    }),
    pngDimensions,
    svgViewBox,
  };
}

/**
 * Create coordinate mapper from SVG string and PNG dimensions
 */
export function createMapperFromSvg(
  svg: string,
  pngWidth: number,
  pngHeight: number
): CoordinateMapper | null {
  const viewBox = parseViewBox(svg);
  if (!viewBox) {
    console.warn('[coordinateMapping] No viewBox found in SVG');
    return null;
  }
  
  return createCoordinateMapper(
    { width: pngWidth, height: pngHeight },
    viewBox
  );
}

/**
 * Convert screen coordinates to PNG coordinates
 * 
 * @param screenPoint - Mouse event coordinates (clientX, clientY)
 * @param elementRect - Bounding rect of the image element
 * @param imageNaturalSize - Natural size of the image (before CSS scaling)
 */
export function screenToPng(
  screenPoint: Point,
  elementRect: DOMRect,
  imageNaturalSize: { width: number; height: number }
): Point {
  // Position relative to element
  const relX = screenPoint.x - elementRect.left;
  const relY = screenPoint.y - elementRect.top;
  
  // Scale from displayed size to natural image size
  const scaleX = imageNaturalSize.width / elementRect.width;
  const scaleY = imageNaturalSize.height / elementRect.height;
  
  return {
    x: relX * scaleX,
    y: relY * scaleY,
  };
}

/**
 * Full pipeline: screen click -> nearest wall
 * 
 * @param screenPoint - Mouse click coordinates
 * @param elementRect - Bounding rect of the rendered image element
 * @param imageNaturalSize - Natural PNG dimensions
 * @param mapper - Coordinate mapper (PNG <-> SVG)
 * @param walls - Wall segments from SVG
 * @param maxDistance - Maximum distance to consider (in SVG units)
 */
export function screenClickToWall(
  screenPoint: Point,
  elementRect: DOMRect,
  imageNaturalSize: { width: number; height: number },
  mapper: CoordinateMapper,
  walls: WallSegment[],
  maxDistance: number = 30
): { wall: WallSegment; positionOnWall: number; svgPoint: Point; pngPoint: Point } | null {
  // Step 1: Screen -> PNG coordinates
  const pngPoint = screenToPng(screenPoint, elementRect, imageNaturalSize);
  
  // Step 2: PNG -> SVG coordinates
  const svgPoint = mapper.pngToSvg(pngPoint);
  
  // Step 3: Find nearest wall
  const result = findNearestWall(svgPoint, walls, maxDistance);
  
  if (!result) return null;
  
  return {
    wall: result.wall,
    positionOnWall: result.positionOnWall,
    svgPoint,
    pngPoint,
  };
}

/**
 * Convert a wall segment from SVG to PNG coordinates
 */
export function wallToPngCoords(
  wall: WallSegment,
  mapper: CoordinateMapper
): { start: Point; end: Point } {
  return {
    start: mapper.svgToPng(wall.start),
    end: mapper.svgToPng(wall.end),
  };
}

/**
 * Convert an opening position to PNG coordinates
 */
export function openingToPngCoords(
  wall: WallSegment,
  positionOnWall: number,
  widthInches: number,
  mapper: CoordinateMapper
): { center: Point; start: Point; end: Point; angle: number } {
  // SVG scale: 1px = 2 inches
  const widthSvg = widthInches / 2;
  
  // Calculate center point on wall
  const centerSvg = {
    x: wall.start.x + (wall.end.x - wall.start.x) * positionOnWall,
    y: wall.start.y + (wall.end.y - wall.start.y) * positionOnWall,
  };
  
  // Wall direction vector (normalized)
  const wallLength = Math.sqrt(
    (wall.end.x - wall.start.x) ** 2 + (wall.end.y - wall.start.y) ** 2
  );
  const dirX = (wall.end.x - wall.start.x) / wallLength;
  const dirY = (wall.end.y - wall.start.y) / wallLength;
  
  // Calculate opening start and end in SVG coords
  const halfWidth = widthSvg / 2;
  const startSvg = {
    x: centerSvg.x - dirX * halfWidth,
    y: centerSvg.y - dirY * halfWidth,
  };
  const endSvg = {
    x: centerSvg.x + dirX * halfWidth,
    y: centerSvg.y + dirY * halfWidth,
  };
  
  // Convert to PNG coords
  const centerPng = mapper.svgToPng(centerSvg);
  const startPng = mapper.svgToPng(startSvg);
  const endPng = mapper.svgToPng(endSvg);
  
  // Calculate angle in PNG space
  const angle = Math.atan2(
    endPng.y - startPng.y,
    endPng.x - startPng.x
  ) * (180 / Math.PI);
  
  return {
    center: centerPng,
    start: startPng,
    end: endPng,
    angle,
  };
}

/**
 * Check if a click is within bounds of an image element
 */
export function isClickInBounds(
  screenPoint: Point,
  elementRect: DOMRect
): boolean {
  return (
    screenPoint.x >= elementRect.left &&
    screenPoint.x <= elementRect.right &&
    screenPoint.y >= elementRect.top &&
    screenPoint.y <= elementRect.bottom
  );
}

/**
 * Get the center point of a wall segment in PNG coordinates
 */
export function getWallCenterPng(
  wall: WallSegment,
  mapper: CoordinateMapper
): Point {
  const centerSvg = {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  };
  return mapper.svgToPng(centerSvg);
}

/**
 * Calculate the length of a wall in PNG pixels
 */
export function getWallLengthPng(
  wall: WallSegment,
  mapper: CoordinateMapper
): number {
  const { start, end } = wallToPngCoords(wall, mapper);
  return Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
}




