/**
 * Tests for Coordinate Mapping between PNG and SVG
 */

import { describe, it, expect } from 'vitest';
import {
  parseViewBox,
  parseSvgDimensions,
  createCoordinateMapper,
  createMapperFromSvg,
  screenToPng,
  wallToPngCoords,
  openingToPngCoords,
  isClickInBounds,
  getWallCenterPng,
} from '../coordinateMapping';
import type { WallSegment } from '../openingTypes';

describe('parseViewBox', () => {
  it('should parse valid viewBox', () => {
    const svg = '<svg viewBox="0 0 100 200" width="100" height="200"></svg>';
    const result = parseViewBox(svg);
    
    expect(result).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 200,
    });
  });

  it('should parse viewBox with negative values', () => {
    const svg = '<svg viewBox="-50 -25 100 200"></svg>';
    const result = parseViewBox(svg);
    
    expect(result).toEqual({
      x: -50,
      y: -25,
      width: 100,
      height: 200,
    });
  });

  it('should return null for missing viewBox', () => {
    const svg = '<svg width="100" height="200"></svg>';
    const result = parseViewBox(svg);
    
    expect(result).toBeNull();
  });
});

describe('parseSvgDimensions', () => {
  it('should parse width and height', () => {
    const svg = '<svg width="100" height="200"></svg>';
    const result = parseSvgDimensions(svg);
    
    expect(result).toEqual({
      width: 100,
      height: 200,
    });
  });

  it('should return null for missing dimensions', () => {
    const svg = '<svg viewBox="0 0 100 200"></svg>';
    const result = parseSvgDimensions(svg);
    
    expect(result).toBeNull();
  });
});

describe('createCoordinateMapper', () => {
  it('should create mapper with 1:1 scale', () => {
    const mapper = createCoordinateMapper(
      { width: 100, height: 100 },
      { x: 0, y: 0, width: 100, height: 100 }
    );
    
    // PNG point should map to same SVG point
    const svgPoint = mapper.pngToSvg({ x: 50, y: 50 });
    expect(svgPoint.x).toBe(50);
    expect(svgPoint.y).toBe(50);
    
    // And vice versa
    const pngPoint = mapper.svgToPng({ x: 50, y: 50 });
    expect(pngPoint.x).toBe(50);
    expect(pngPoint.y).toBe(50);
  });

  it('should handle 2:1 scale (PNG is twice as large)', () => {
    const mapper = createCoordinateMapper(
      { width: 200, height: 200 },
      { x: 0, y: 0, width: 100, height: 100 }
    );
    
    // PNG point at (100, 100) should map to SVG (50, 50)
    const svgPoint = mapper.pngToSvg({ x: 100, y: 100 });
    expect(svgPoint.x).toBe(50);
    expect(svgPoint.y).toBe(50);
    
    // SVG point at (50, 50) should map to PNG (100, 100)
    const pngPoint = mapper.svgToPng({ x: 50, y: 50 });
    expect(pngPoint.x).toBe(100);
    expect(pngPoint.y).toBe(100);
  });

  it('should handle viewBox offset', () => {
    const mapper = createCoordinateMapper(
      { width: 100, height: 100 },
      { x: 50, y: 50, width: 100, height: 100 }
    );
    
    // PNG origin should map to SVG viewBox origin
    const svgPoint = mapper.pngToSvg({ x: 0, y: 0 });
    expect(svgPoint.x).toBe(50);
    expect(svgPoint.y).toBe(50);
  });
});

describe('createMapperFromSvg', () => {
  it('should create mapper from SVG string', () => {
    const svg = '<svg viewBox="0 0 100 100" width="100" height="100"></svg>';
    const mapper = createMapperFromSvg(svg, 200, 200);
    
    expect(mapper).not.toBeNull();
    expect(mapper!.pngDimensions).toEqual({ width: 200, height: 200 });
    expect(mapper!.svgViewBox).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it('should return null for SVG without viewBox', () => {
    const svg = '<svg width="100" height="100"></svg>';
    const mapper = createMapperFromSvg(svg, 200, 200);
    
    expect(mapper).toBeNull();
  });
});

describe('screenToPng', () => {
  it('should convert screen coordinates to PNG coordinates', () => {
    const screenPoint = { x: 150, y: 150 };
    const elementRect = {
      left: 100,
      top: 100,
      right: 300,
      bottom: 300,
      width: 200,
      height: 200,
    } as DOMRect;
    const imageNaturalSize = { width: 400, height: 400 };
    
    const result = screenToPng(screenPoint, elementRect, imageNaturalSize);
    
    // Screen (150, 150) is at element position (50, 50)
    // With 2x scale, PNG position is (100, 100)
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
  });
});

describe('wallToPngCoords', () => {
  it('should convert wall segment to PNG coordinates', () => {
    const wall: WallSegment = {
      id: 'test',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      isExterior: true,
      adjacentRoomIds: ['room-1', null],
      length: 100,
    };
    
    const mapper = createCoordinateMapper(
      { width: 200, height: 200 },
      { x: 0, y: 0, width: 100, height: 100 }
    );
    
    const result = wallToPngCoords(wall, mapper);
    
    expect(result.start.x).toBe(0);
    expect(result.start.y).toBe(0);
    expect(result.end.x).toBe(200);
    expect(result.end.y).toBe(0);
  });
});

describe('openingToPngCoords', () => {
  it('should calculate opening position in PNG coordinates', () => {
    const wall: WallSegment = {
      id: 'test',
      start: { x: 0, y: 50 },
      end: { x: 100, y: 50 },
      isExterior: true,
      adjacentRoomIds: ['room-1', null],
      length: 100,
    };
    
    const mapper = createCoordinateMapper(
      { width: 200, height: 200 },
      { x: 0, y: 0, width: 100, height: 100 }
    );
    
    // 36" door at center of wall
    const result = openingToPngCoords(wall, 0.5, 36, mapper);
    
    // Center should be at SVG (50, 50) -> PNG (100, 100)
    expect(result.center.x).toBe(100);
    expect(result.center.y).toBe(100);
    
    // Angle should be 0 (horizontal wall)
    expect(result.angle).toBeCloseTo(0);
  });
});

describe('isClickInBounds', () => {
  it('should return true for click inside bounds', () => {
    const point = { x: 150, y: 150 };
    const rect = {
      left: 100,
      top: 100,
      right: 200,
      bottom: 200,
    } as DOMRect;
    
    expect(isClickInBounds(point, rect)).toBe(true);
  });

  it('should return false for click outside bounds', () => {
    const point = { x: 50, y: 150 };
    const rect = {
      left: 100,
      top: 100,
      right: 200,
      bottom: 200,
    } as DOMRect;
    
    expect(isClickInBounds(point, rect)).toBe(false);
  });
});

describe('getWallCenterPng', () => {
  it('should return center of wall in PNG coordinates', () => {
    const wall: WallSegment = {
      id: 'test',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      isExterior: true,
      adjacentRoomIds: ['room-1', null],
      length: 100,
    };
    
    const mapper = createCoordinateMapper(
      { width: 200, height: 200 },
      { x: 0, y: 0, width: 100, height: 100 }
    );
    
    const center = getWallCenterPng(wall, mapper);
    
    // SVG center (50, 0) -> PNG (100, 0)
    expect(center.x).toBe(100);
    expect(center.y).toBe(0);
  });
});


