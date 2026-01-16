/**
 * Tests for Wall Detection from SVG Floor Plans
 */

import { describe, it, expect } from 'vitest';
import {
  extractWallSegments,
  extractRoomPolygons,
  findNearestWall,
  getPositionOnWall,
  getWallAngle,
  isWallHorizontal,
  isWallVertical,
  filterWallsForOpeningType,
} from '../wallDetection';

// Sample SVG with two adjacent rooms
const SAMPLE_SVG_TWO_ROOMS = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">
  <polygon 
    data-room-id="room-1" 
    data-room-type="living_room" 
    fill="#E8F5E9" 
    points="0,0 100,0 100,100 0,100"
  />
  <polygon 
    data-room-id="room-2" 
    data-room-type="bedroom" 
    fill="#E3F2FD" 
    points="100,0 200,0 200,100 100,100"
  />
</svg>
`;

// Sample SVG with L-shaped room
const SAMPLE_SVG_L_SHAPED = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150" width="150" height="150">
  <polygon 
    data-room-id="room-1" 
    fill="#FFF3E0" 
    points="0,0 100,0 100,50 50,50 50,150 0,150"
  />
</svg>
`;

// Sample SVG with rect elements
const SAMPLE_SVG_RECTS = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">
  <rect 
    data-room-id="room-1" 
    fill="#E8F5E9" 
    x="0" y="0" width="100" height="100"
  />
  <rect 
    data-room-id="room-2" 
    fill="#E3F2FD" 
    x="100" y="0" width="100" height="100"
  />
</svg>
`;

describe('extractRoomPolygons', () => {
  it('should extract polygons from SVG', () => {
    const polygons = extractRoomPolygons(SAMPLE_SVG_TWO_ROOMS);
    
    expect(polygons).toHaveLength(2);
    expect(polygons[0].id).toBe('room-1');
    expect(polygons[0].roomType).toBe('living_room');
    expect(polygons[0].points).toHaveLength(4);
  });

  it('should extract rooms from rect elements', () => {
    const polygons = extractRoomPolygons(SAMPLE_SVG_RECTS);
    
    expect(polygons).toHaveLength(2);
    expect(polygons[0].points).toHaveLength(4);
  });

  it('should handle L-shaped rooms', () => {
    const polygons = extractRoomPolygons(SAMPLE_SVG_L_SHAPED);
    
    expect(polygons).toHaveLength(1);
    expect(polygons[0].points).toHaveLength(6);
  });
});

describe('extractWallSegments', () => {
  it('should find shared wall between adjacent rooms', () => {
    const walls = extractWallSegments(SAMPLE_SVG_TWO_ROOMS);
    
    // Should have interior walls (shared) and exterior walls
    const interiorWalls = walls.filter(w => !w.isExterior);
    const exteriorWalls = walls.filter(w => w.isExterior);
    
    expect(interiorWalls.length).toBeGreaterThan(0);
    expect(exteriorWalls.length).toBeGreaterThan(0);
    
    // The shared wall should be at x=100
    const sharedWall = interiorWalls.find(w => 
      Math.abs(w.start.x - 100) < 5 && Math.abs(w.end.x - 100) < 5
    );
    expect(sharedWall).toBeDefined();
  });

  it('should identify exterior walls', () => {
    const walls = extractWallSegments(SAMPLE_SVG_TWO_ROOMS);
    const exteriorWalls = walls.filter(w => w.isExterior);
    
    // Should have walls at x=0, x=200, y=0, y=100
    expect(exteriorWalls.length).toBeGreaterThanOrEqual(4);
  });

  it('should calculate wall lengths', () => {
    const walls = extractWallSegments(SAMPLE_SVG_TWO_ROOMS);
    
    walls.forEach(wall => {
      expect(wall.length).toBeGreaterThan(0);
    });
  });
});

describe('findNearestWall', () => {
  it('should find the nearest wall to a point', () => {
    const walls = extractWallSegments(SAMPLE_SVG_TWO_ROOMS);
    
    // Point near the shared wall at x=100
    const result = findNearestWall({ x: 98, y: 50 }, walls, 30);
    
    expect(result).not.toBeNull();
    expect(result!.distance).toBeLessThan(30);
  });

  it('should return null if no wall is within range', () => {
    const walls = extractWallSegments(SAMPLE_SVG_TWO_ROOMS);
    
    // Point far from any wall
    const result = findNearestWall({ x: 50, y: 50 }, walls, 5);
    
    expect(result).toBeNull();
  });

  it('should return position along wall', () => {
    const walls = extractWallSegments(SAMPLE_SVG_TWO_ROOMS);
    
    // Find a horizontal wall
    const horizontalWall = walls.find(w => isWallHorizontal(w));
    if (horizontalWall) {
      const midX = (horizontalWall.start.x + horizontalWall.end.x) / 2;
      const result = findNearestWall(
        { x: midX, y: horizontalWall.start.y },
        [horizontalWall],
        30
      );
      
      expect(result).not.toBeNull();
      expect(result!.positionOnWall).toBeCloseTo(0.5, 1);
    }
  });
});

describe('getPositionOnWall', () => {
  it('should return correct position at start of wall', () => {
    const wall = {
      id: 'test',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      isExterior: true,
      adjacentRoomIds: ['room-1', null] as [string, string | null],
      length: 100,
    };
    
    const pos = getPositionOnWall(wall, 0);
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
  });

  it('should return correct position at end of wall', () => {
    const wall = {
      id: 'test',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      isExterior: true,
      adjacentRoomIds: ['room-1', null] as [string, string | null],
      length: 100,
    };
    
    const pos = getPositionOnWall(wall, 1);
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(0);
  });

  it('should return correct position at middle of wall', () => {
    const wall = {
      id: 'test',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      isExterior: true,
      adjacentRoomIds: ['room-1', null] as [string, string | null],
      length: 100,
    };
    
    const pos = getPositionOnWall(wall, 0.5);
    expect(pos.x).toBe(50);
    expect(pos.y).toBe(0);
  });
});

describe('getWallAngle', () => {
  it('should return 0 for horizontal wall pointing right', () => {
    const wall = {
      id: 'test',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      isExterior: true,
      adjacentRoomIds: ['room-1', null] as [string, string | null],
      length: 100,
    };
    
    expect(getWallAngle(wall)).toBeCloseTo(0);
  });

  it('should return 90 for vertical wall pointing down', () => {
    const wall = {
      id: 'test',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 100 },
      isExterior: true,
      adjacentRoomIds: ['room-1', null] as [string, string | null],
      length: 100,
    };
    
    expect(getWallAngle(wall)).toBeCloseTo(90);
  });
});

describe('isWallHorizontal / isWallVertical', () => {
  it('should identify horizontal walls', () => {
    const wall = {
      id: 'test',
      start: { x: 0, y: 50 },
      end: { x: 100, y: 50 },
      isExterior: true,
      adjacentRoomIds: ['room-1', null] as [string, string | null],
      length: 100,
    };
    
    expect(isWallHorizontal(wall)).toBe(true);
    expect(isWallVertical(wall)).toBe(false);
  });

  it('should identify vertical walls', () => {
    const wall = {
      id: 'test',
      start: { x: 50, y: 0 },
      end: { x: 50, y: 100 },
      isExterior: true,
      adjacentRoomIds: ['room-1', null] as [string, string | null],
      length: 100,
    };
    
    expect(isWallHorizontal(wall)).toBe(false);
    expect(isWallVertical(wall)).toBe(true);
  });
});

describe('filterWallsForOpeningType', () => {
  it('should filter to exterior walls only for windows', () => {
    const walls = extractWallSegments(SAMPLE_SVG_TWO_ROOMS);
    const filtered = filterWallsForOpeningType(walls, 'window', 20);
    
    filtered.forEach(wall => {
      expect(wall.isExterior).toBe(true);
    });
  });

  it('should allow interior walls for interior doors', () => {
    const walls = extractWallSegments(SAMPLE_SVG_TWO_ROOMS);
    const filtered = filterWallsForOpeningType(walls, 'interior_door', 20);
    
    // Should include both interior and exterior walls
    const hasInterior = filtered.some(w => !w.isExterior);
    const hasExterior = filtered.some(w => w.isExterior);
    
    // Interior doors can go on any wall
    expect(hasExterior).toBe(true);
  });

  it('should filter out walls that are too short', () => {
    const walls = extractWallSegments(SAMPLE_SVG_TWO_ROOMS);
    const filtered = filterWallsForOpeningType(walls, 'interior_door', 1000);
    
    // All walls should be filtered out (none are 1000px long)
    expect(filtered).toHaveLength(0);
  });
});

