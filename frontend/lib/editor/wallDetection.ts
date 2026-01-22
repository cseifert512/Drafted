/**
 * Wall Detection from SVG Floor Plans
 * 
 * Extracts wall segments by finding:
 * 1. Shared edges between adjacent room polygons (interior walls)
 * 2. Edges on the exterior boundary (exterior walls)
 */

import type { WallSegment } from './openingTypes';
import type { Point } from './editorTypes';

// Tolerance for considering points equal (in SVG units)
const POINT_TOLERANCE = 2;

// Tolerance for considering edges as shared (in SVG units)
const EDGE_TOLERANCE = 4;

// Minimum wall length to consider (in SVG units, ~2 feet)
const MIN_WALL_LENGTH = 12;

/**
 * Polygon extracted from SVG with room metadata
 */
interface RoomPolygon {
  id: string;
  roomType: string;
  points: Point[];
}

/**
 * Edge between two points
 */
interface Edge {
  start: Point;
  end: Point;
  roomId: string;
}

/**
 * Check if two points are approximately equal
 */
function pointsEqual(p1: Point, p2: Point, tolerance = POINT_TOLERANCE): boolean {
  return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;
}

/**
 * Calculate distance between two points
 */
function distance(p1: Point, p2: Point): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

/**
 * Calculate the length of an edge
 */
function edgeLength(edge: { start: Point; end: Point }): number {
  return distance(edge.start, edge.end);
}

/**
 * Normalize an edge so start is always "before" end (for comparison)
 */
function normalizeEdge(edge: Edge): Edge {
  if (edge.start.x < edge.end.x || 
      (edge.start.x === edge.end.x && edge.start.y < edge.end.y)) {
    return edge;
  }
  return { start: edge.end, end: edge.start, roomId: edge.roomId };
}

/**
 * Check if two edges are the same (or very close)
 */
function edgesMatch(e1: Edge, e2: Edge, tolerance = EDGE_TOLERANCE): boolean {
  const n1 = normalizeEdge(e1);
  const n2 = normalizeEdge(e2);
  
  return pointsEqual(n1.start, n2.start, tolerance) && 
         pointsEqual(n1.end, n2.end, tolerance);
}

/**
 * Check if two edges overlap significantly (for partial wall sharing)
 */
function edgesOverlap(e1: Edge, e2: Edge, tolerance = EDGE_TOLERANCE): {
  overlaps: boolean;
  overlapStart?: Point;
  overlapEnd?: Point;
} {
  // Check if edges are collinear first
  const v1 = { x: e1.end.x - e1.start.x, y: e1.end.y - e1.start.y };
  const v2 = { x: e2.end.x - e2.start.x, y: e2.end.y - e2.start.y };
  
  // Cross product should be near zero for collinear edges
  const cross = Math.abs(v1.x * v2.y - v1.y * v2.x);
  const len1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  const len2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
  
  if (len1 < 1 || len2 < 1) return { overlaps: false };
  
  // Normalized cross product
  const normalizedCross = cross / (len1 * len2);
  if (normalizedCross > 0.1) return { overlaps: false }; // Not collinear
  
  // Check if the edges are on the same line (not just parallel)
  const dist = pointToLineDistance(e2.start, e1.start, e1.end);
  if (dist > tolerance) return { overlaps: false };
  
  // Project points onto the line and find overlap
  const dir = len1 > 0 ? { x: v1.x / len1, y: v1.y / len1 } : { x: 1, y: 0 };
  
  const project = (p: Point) => {
    const dx = p.x - e1.start.x;
    const dy = p.y - e1.start.y;
    return dx * dir.x + dy * dir.y;
  };
  
  const t1_start = 0;
  const t1_end = len1;
  const t2_start = project(e2.start);
  const t2_end = project(e2.end);
  
  const t2_min = Math.min(t2_start, t2_end);
  const t2_max = Math.max(t2_start, t2_end);
  
  const overlapMin = Math.max(t1_start, t2_min);
  const overlapMax = Math.min(t1_end, t2_max);
  
  if (overlapMax - overlapMin < MIN_WALL_LENGTH) return { overlaps: false };
  
  return {
    overlaps: true,
    overlapStart: {
      x: e1.start.x + dir.x * overlapMin,
      y: e1.start.y + dir.y * overlapMin,
    },
    overlapEnd: {
      x: e1.start.x + dir.x * overlapMax,
      y: e1.start.y + dir.y * overlapMax,
    },
  };
}

/**
 * Calculate perpendicular distance from a point to a line
 */
function pointToLineDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  
  if (len < 0.001) return distance(point, lineStart);
  
  const t = Math.max(0, Math.min(1, 
    ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (len * len)
  ));
  
  const projection = {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy,
  };
  
  return distance(point, projection);
}

/**
 * Get edges from a polygon
 */
function getPolygonEdges(polygon: RoomPolygon): Edge[] {
  const edges: Edge[] = [];
  const points = polygon.points;
  
  for (let i = 0; i < points.length; i++) {
    const start = points[i];
    const end = points[(i + 1) % points.length];
    
    if (edgeLength({ start, end }) >= MIN_WALL_LENGTH) {
      edges.push({ start, end, roomId: polygon.id });
    }
  }
  
  return edges;
}

/**
 * Parse polygon points from SVG points attribute
 */
function parsePolygonPoints(pointsStr: string): Point[] {
  const points: Point[] = [];
  const coordRegex = /([+-]?[\d.]+)[,\s]+([+-]?[\d.]+)/g;
  
  let match: RegExpExecArray | null;
  while ((match = coordRegex.exec(pointsStr)) !== null) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    if (!isNaN(x) && !isNaN(y)) {
      points.push({ x, y });
    }
  }
  
  return points;
}

/**
 * Parse rect element to polygon points
 */
function parseRectToPoints(x: number, y: number, width: number, height: number): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/**
 * Extract room polygons from SVG string
 */
export function extractRoomPolygons(svg: string): RoomPolygon[] {
  const polygons: RoomPolygon[] = [];
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  
  // Find all polygon and rect elements with fill colors (rooms)
  const elements = doc.querySelectorAll('polygon, rect');
  
  let roomIndex = 0;
  elements.forEach((el) => {
    const fill = el.getAttribute('fill') || '';
    
    // Skip elements without fill or with white/black/transparent fill
    if (!fill || fill === 'none' || fill === '#ffffff' || fill === '#000000' || fill === 'white' || fill === 'black') {
      return;
    }
    
    let points: Point[] = [];
    const roomId = el.getAttribute('data-room-id') || `room-${roomIndex}`;
    
    if (el.tagName === 'polygon') {
      const pointsAttr = el.getAttribute('points') || '';
      points = parsePolygonPoints(pointsAttr);
    } else if (el.tagName === 'rect') {
      const x = parseFloat(el.getAttribute('x') || '0');
      const y = parseFloat(el.getAttribute('y') || '0');
      const width = parseFloat(el.getAttribute('width') || '0');
      const height = parseFloat(el.getAttribute('height') || '0');
      
      if (width > 10 && height > 10) {
        points = parseRectToPoints(x, y, width, height);
      }
    }
    
    if (points.length >= 3) {
      polygons.push({
        id: roomId,
        roomType: el.getAttribute('data-room-type') || 'room',
        points,
      });
      roomIndex++;
    }
  });
  
  return polygons;
}

/**
 * Find shared edges between room polygons (interior walls)
 */
function findSharedEdges(polygons: RoomPolygon[]): {
  edge: { start: Point; end: Point };
  room1: string;
  room2: string;
}[] {
  const shared: {
    edge: { start: Point; end: Point };
    room1: string;
    room2: string;
  }[] = [];
  
  // Get all edges from all polygons
  const allEdges: Edge[] = [];
  polygons.forEach(polygon => {
    allEdges.push(...getPolygonEdges(polygon));
  });
  
  // Find matching/overlapping edges from different rooms
  for (let i = 0; i < allEdges.length; i++) {
    for (let j = i + 1; j < allEdges.length; j++) {
      const e1 = allEdges[i];
      const e2 = allEdges[j];
      
      // Skip edges from the same room
      if (e1.roomId === e2.roomId) continue;
      
      // Check if edges match exactly
      if (edgesMatch(e1, e2)) {
        shared.push({
          edge: { start: e1.start, end: e1.end },
          room1: e1.roomId,
          room2: e2.roomId,
        });
        continue;
      }
      
      // Check if edges overlap partially
      const overlap = edgesOverlap(e1, e2);
      if (overlap.overlaps && overlap.overlapStart && overlap.overlapEnd) {
        shared.push({
          edge: { start: overlap.overlapStart, end: overlap.overlapEnd },
          room1: e1.roomId,
          room2: e2.roomId,
        });
      }
    }
  }
  
  return shared;
}

/**
 * Find exterior edges (edges not shared with any other room)
 */
function findExteriorEdges(polygons: RoomPolygon[], sharedEdges: Set<string>): Edge[] {
  const exterior: Edge[] = [];
  
  polygons.forEach(polygon => {
    const edges = getPolygonEdges(polygon);
    
    edges.forEach(edge => {
      // Create a key for this edge
      const n = normalizeEdge(edge);
      const key = `${Math.round(n.start.x)},${Math.round(n.start.y)}-${Math.round(n.end.x)},${Math.round(n.end.y)}`;
      
      // If this edge is not in the shared set, it's exterior
      if (!sharedEdges.has(key)) {
        // Double-check it's not close to any shared edge
        let isShared = false;
        for (const sharedKey of Array.from(sharedEdges)) {
          const [startStr, endStr] = sharedKey.split('-');
          const [sx, sy] = startStr.split(',').map(Number);
          const [ex, ey] = endStr.split(',').map(Number);
          
          const sharedEdge = { start: { x: sx, y: sy }, end: { x: ex, y: ey }, roomId: '' };
          if (edgesMatch(edge, sharedEdge, EDGE_TOLERANCE * 2)) {
            isShared = true;
            break;
          }
        }
        
        if (!isShared) {
          exterior.push(edge);
        }
      }
    });
  });
  
  return exterior;
}

/**
 * Extract all wall segments from an SVG floor plan
 */
export function extractWallSegments(svg: string): WallSegment[] {
  const polygons = extractRoomPolygons(svg);
  
  if (polygons.length === 0) {
    console.warn('[wallDetection] No room polygons found in SVG');
    return [];
  }
  
  const walls: WallSegment[] = [];
  let wallIndex = 0;
  
  // Find shared edges (interior walls)
  const sharedEdges = findSharedEdges(polygons);
  const sharedEdgeKeys = new Set<string>();
  
  sharedEdges.forEach(({ edge, room1, room2 }) => {
    const n = normalizeEdge({ ...edge, roomId: '' });
    const key = `${Math.round(n.start.x)},${Math.round(n.start.y)}-${Math.round(n.end.x)},${Math.round(n.end.y)}`;
    sharedEdgeKeys.add(key);
    
    walls.push({
      id: `wall-int-${wallIndex++}`,
      start: edge.start,
      end: edge.end,
      isExterior: false,
      adjacentRoomIds: [room1, room2],
      length: edgeLength(edge),
    });
  });
  
  // Find exterior edges
  const exteriorEdges = findExteriorEdges(polygons, sharedEdgeKeys);
  
  exteriorEdges.forEach(edge => {
    walls.push({
      id: `wall-ext-${wallIndex++}`,
      start: edge.start,
      end: edge.end,
      isExterior: true,
      adjacentRoomIds: [edge.roomId, null],
      length: edgeLength(edge),
    });
  });
  
  console.log(`[wallDetection] Found ${walls.length} walls (${sharedEdges.length} interior, ${exteriorEdges.length} exterior)`);
  
  return walls;
}

/**
 * Find the wall segment nearest to a point
 */
export function findNearestWall(
  point: Point,
  walls: WallSegment[],
  maxDistance: number = 30
): { wall: WallSegment; positionOnWall: number; distance: number } | null {
  let nearest: { wall: WallSegment; positionOnWall: number; distance: number } | null = null;
  
  for (const wall of walls) {
    const { distance: dist, t } = pointToLineSegment(point, wall.start, wall.end);
    
    if (dist < maxDistance && (!nearest || dist < nearest.distance)) {
      nearest = {
        wall,
        positionOnWall: t,
        distance: dist,
      };
    }
  }
  
  return nearest;
}

/**
 * Calculate distance from point to line segment and the position along the segment
 */
function pointToLineSegment(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): { distance: number; t: number } {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;
  
  if (lenSq < 0.001) {
    return { distance: distance(point, lineStart), t: 0 };
  }
  
  // Calculate projection parameter t (0-1 along the segment)
  let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  
  // Calculate closest point on segment
  const closest = {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy,
  };
  
  return {
    distance: distance(point, closest),
    t,
  };
}

/**
 * Get the position on a wall in SVG coordinates
 */
export function getPositionOnWall(wall: WallSegment, t: number): Point {
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  };
}

/**
 * Get the angle of a wall segment (in degrees)
 */
export function getWallAngle(wall: WallSegment): number {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * Check if a wall is horizontal (within tolerance)
 */
export function isWallHorizontal(wall: WallSegment, tolerance: number = 5): boolean {
  const angle = Math.abs(getWallAngle(wall));
  return angle < tolerance || Math.abs(angle - 180) < tolerance;
}

/**
 * Check if a wall is vertical (within tolerance)
 */
export function isWallVertical(wall: WallSegment, tolerance: number = 5): boolean {
  const angle = Math.abs(getWallAngle(wall));
  return Math.abs(angle - 90) < tolerance || Math.abs(angle + 90) < tolerance;
}

/**
 * Filter walls suitable for a specific opening type
 */
export function filterWallsForOpeningType(
  walls: WallSegment[],
  openingType: string,
  minWidth: number
): WallSegment[] {
  const requiresExterior = openingType.includes('window') || 
                           openingType === 'exterior_door' || 
                           openingType === 'sliding_door';
  
  return walls.filter(wall => {
    // Check if wall is long enough
    if (wall.length < minWidth) return false;
    
    // Check exterior requirement
    if (requiresExterior && !wall.isExterior) return false;
    
    return true;
  });
}




