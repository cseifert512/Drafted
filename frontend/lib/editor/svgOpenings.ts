/**
 * SVG Modification for Door and Window Openings
 * 
 * Adds architectural symbols for doors and windows to floor plan SVGs.
 * Follows standard architectural drawing conventions.
 */

import type { OpeningPlacement, OpeningType, WallSegment } from './openingTypes';
import type { Point } from './editorTypes';
import { inchesToSvgPixels } from './openingTypes';
import { extractWallSegments, getWallAngle } from './wallDetection';

/**
 * Generate a unique ID for an opening
 */
export function generateOpeningId(): string {
  return `opening-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate the position and orientation for an opening on a wall
 */
function calculateOpeningTransform(
  wall: WallSegment,
  positionOnWall: number,
  widthInches: number
): {
  centerX: number;
  centerY: number;
  angle: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  normalX: number;
  normalY: number;
} {
  const widthSvg = inchesToSvgPixels(widthInches);
  
  // Wall vector
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);
  
  // Normalized direction
  const dirX = dx / wallLength;
  const dirY = dy / wallLength;
  
  // Normal vector (perpendicular to wall)
  const normalX = -dirY;
  const normalY = dirX;
  
  // Center point on wall
  const centerX = wall.start.x + dx * positionOnWall;
  const centerY = wall.start.y + dy * positionOnWall;
  
  // Opening start and end points
  const halfWidth = widthSvg / 2;
  const startX = centerX - dirX * halfWidth;
  const startY = centerY - dirY * halfWidth;
  const endX = centerX + dirX * halfWidth;
  const endY = centerY + dirY * halfWidth;
  
  // Angle in degrees
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  return {
    centerX,
    centerY,
    angle,
    startX,
    startY,
    endX,
    endY,
    normalX,
    normalY,
  };
}

/**
 * Generate SVG for an interior door symbol
 * Standard architectural symbol: arc showing swing direction + door panel
 */
function generateInteriorDoorSvg(
  id: string,
  wall: WallSegment,
  positionOnWall: number,
  widthInches: number,
  swingDirection: 'left' | 'right' = 'right'
): string {
  const transform = calculateOpeningTransform(wall, positionOnWall, widthInches);
  const widthSvg = inchesToSvgPixels(widthInches);
  
  // Door swing arc radius equals door width
  const arcRadius = widthSvg;
  
  // Determine swing side (based on normal direction)
  const swingMultiplier = swingDirection === 'left' ? -1 : 1;
  
  // Arc end point (90 degrees from door)
  const arcEndX = transform.startX + transform.normalX * arcRadius * swingMultiplier;
  const arcEndY = transform.startY + transform.normalY * arcRadius * swingMultiplier;
  
  // Large arc flag and sweep flag for SVG arc
  const sweepFlag = swingDirection === 'right' ? 1 : 0;
  
  return `
    <g id="${id}" class="opening door interior-door" data-opening-id="${id}" data-opening-type="interior_door">
      <!-- Wall gap (white rectangle to "cut" the wall) -->
      <rect 
        x="${transform.startX}" 
        y="${transform.centerY - 3}" 
        width="${widthSvg}" 
        height="6" 
        fill="white" 
        transform="rotate(${transform.angle}, ${transform.centerX}, ${transform.centerY})"
      />
      <!-- Door swing arc (dashed) -->
      <path 
        d="M ${transform.startX},${transform.startY} A ${arcRadius},${arcRadius} 0 0 ${sweepFlag} ${arcEndX},${arcEndY}" 
        fill="none" 
        stroke="#666666" 
        stroke-width="1" 
        stroke-dasharray="4,3"
      />
      <!-- Door panel line -->
      <line 
        x1="${transform.startX}" 
        y1="${transform.startY}" 
        x2="${transform.endX}" 
        y2="${transform.endY}" 
        stroke="#333333" 
        stroke-width="2"
      />
    </g>
  `;
}

/**
 * Generate SVG for an exterior door symbol
 */
function generateExteriorDoorSvg(
  id: string,
  wall: WallSegment,
  positionOnWall: number,
  widthInches: number,
  swingDirection: 'left' | 'right' = 'right'
): string {
  const transform = calculateOpeningTransform(wall, positionOnWall, widthInches);
  const widthSvg = inchesToSvgPixels(widthInches);
  const arcRadius = widthSvg;
  
  const swingMultiplier = swingDirection === 'left' ? -1 : 1;
  const arcEndX = transform.startX + transform.normalX * arcRadius * swingMultiplier;
  const arcEndY = transform.startY + transform.normalY * arcRadius * swingMultiplier;
  const sweepFlag = swingDirection === 'right' ? 1 : 0;
  
  return `
    <g id="${id}" class="opening door exterior-door" data-opening-id="${id}" data-opening-type="exterior_door">
      <!-- Wall gap -->
      <rect 
        x="${transform.startX}" 
        y="${transform.centerY - 4}" 
        width="${widthSvg}" 
        height="8" 
        fill="white" 
        transform="rotate(${transform.angle}, ${transform.centerX}, ${transform.centerY})"
      />
      <!-- Threshold line -->
      <line 
        x1="${transform.startX}" 
        y1="${transform.startY}" 
        x2="${transform.endX}" 
        y2="${transform.endY}" 
        stroke="#444444" 
        stroke-width="3"
      />
      <!-- Door swing arc -->
      <path 
        d="M ${transform.startX},${transform.startY} A ${arcRadius},${arcRadius} 0 0 ${sweepFlag} ${arcEndX},${arcEndY}" 
        fill="none" 
        stroke="#666666" 
        stroke-width="1" 
        stroke-dasharray="4,3"
      />
      <!-- Door panel (thicker for exterior) -->
      <line 
        x1="${transform.startX}" 
        y1="${transform.startY}" 
        x2="${transform.endX}" 
        y2="${transform.endY}" 
        stroke="#222222" 
        stroke-width="3"
      />
    </g>
  `;
}

/**
 * Generate SVG for a sliding door symbol
 */
function generateSlidingDoorSvg(
  id: string,
  wall: WallSegment,
  positionOnWall: number,
  widthInches: number
): string {
  const transform = calculateOpeningTransform(wall, positionOnWall, widthInches);
  const widthSvg = inchesToSvgPixels(widthInches);
  const halfWidth = widthSvg / 2;
  
  // Calculate midpoint
  const midX = transform.centerX;
  const midY = transform.centerY;
  
  return `
    <g id="${id}" class="opening door sliding-door" data-opening-id="${id}" data-opening-type="sliding_door">
      <!-- Wall gap -->
      <rect 
        x="${transform.startX}" 
        y="${transform.centerY - 4}" 
        width="${widthSvg}" 
        height="8" 
        fill="white" 
        transform="rotate(${transform.angle}, ${transform.centerX}, ${transform.centerY})"
      />
      <!-- Glass panel 1 (fixed) -->
      <line 
        x1="${transform.startX}" 
        y1="${transform.startY}" 
        x2="${midX}" 
        y2="${midY}" 
        stroke="#666666" 
        stroke-width="2"
      />
      <!-- Glass panel 2 (sliding) -->
      <line 
        x1="${midX}" 
        y1="${midY}" 
        x2="${transform.endX}" 
        y2="${transform.endY}" 
        stroke="#333333" 
        stroke-width="3"
      />
      <!-- Arrow indicating slide direction -->
      <line 
        x1="${midX}" 
        y1="${midY}" 
        x2="${midX + transform.normalX * 8}" 
        y2="${midY + transform.normalY * 8}" 
        stroke="#999999" 
        stroke-width="1"
        marker-end="url(#arrowhead)"
      />
    </g>
  `;
}

/**
 * Generate SVG for a French door symbol
 */
function generateFrenchDoorSvg(
  id: string,
  wall: WallSegment,
  positionOnWall: number,
  widthInches: number,
  swingDirection: 'left' | 'right' = 'right'
): string {
  const transform = calculateOpeningTransform(wall, positionOnWall, widthInches);
  const widthSvg = inchesToSvgPixels(widthInches);
  const halfWidth = widthSvg / 2;
  const arcRadius = halfWidth;
  
  // Midpoint
  const midX = transform.centerX;
  const midY = transform.centerY;
  
  // Arc endpoints (both doors swing outward)
  const leftArcEndX = transform.startX + transform.normalX * arcRadius;
  const leftArcEndY = transform.startY + transform.normalY * arcRadius;
  const rightArcEndX = transform.endX + transform.normalX * arcRadius;
  const rightArcEndY = transform.endY + transform.normalY * arcRadius;
  
  return `
    <g id="${id}" class="opening door french-door" data-opening-id="${id}" data-opening-type="french_door">
      <!-- Wall gap -->
      <rect 
        x="${transform.startX}" 
        y="${transform.centerY - 4}" 
        width="${widthSvg}" 
        height="8" 
        fill="white" 
        transform="rotate(${transform.angle}, ${transform.centerX}, ${transform.centerY})"
      />
      <!-- Left door swing arc -->
      <path 
        d="M ${transform.startX},${transform.startY} A ${arcRadius},${arcRadius} 0 0 0 ${leftArcEndX},${leftArcEndY}" 
        fill="none" 
        stroke="#666666" 
        stroke-width="1" 
        stroke-dasharray="4,3"
      />
      <!-- Right door swing arc -->
      <path 
        d="M ${transform.endX},${transform.endY} A ${arcRadius},${arcRadius} 0 0 1 ${rightArcEndX},${rightArcEndY}" 
        fill="none" 
        stroke="#666666" 
        stroke-width="1" 
        stroke-dasharray="4,3"
      />
      <!-- Left door panel -->
      <line 
        x1="${transform.startX}" 
        y1="${transform.startY}" 
        x2="${midX}" 
        y2="${midY}" 
        stroke="#333333" 
        stroke-width="2"
      />
      <!-- Right door panel -->
      <line 
        x1="${midX}" 
        y1="${midY}" 
        x2="${transform.endX}" 
        y2="${transform.endY}" 
        stroke="#333333" 
        stroke-width="2"
      />
    </g>
  `;
}

/**
 * Generate SVG for a window symbol
 */
function generateWindowSvg(
  id: string,
  wall: WallSegment,
  positionOnWall: number,
  widthInches: number
): string {
  const transform = calculateOpeningTransform(wall, positionOnWall, widthInches);
  const widthSvg = inchesToSvgPixels(widthInches);
  
  // Window frame thickness
  const frameOffset = 2;
  
  return `
    <g id="${id}" class="opening window standard-window" data-opening-id="${id}" data-opening-type="window">
      <!-- Wall gap (slightly narrower than door) -->
      <rect 
        x="${transform.startX}" 
        y="${transform.centerY - 3}" 
        width="${widthSvg}" 
        height="6" 
        fill="white" 
        transform="rotate(${transform.angle}, ${transform.centerX}, ${transform.centerY})"
      />
      <!-- Outer frame -->
      <line 
        x1="${transform.startX}" 
        y1="${transform.startY}" 
        x2="${transform.endX}" 
        y2="${transform.endY}" 
        stroke="#333333" 
        stroke-width="3"
      />
      <!-- Inner frame line 1 -->
      <line 
        x1="${transform.startX + frameOffset}" 
        y1="${transform.startY + frameOffset * transform.normalY}" 
        x2="${transform.endX - frameOffset}" 
        y2="${transform.endY + frameOffset * transform.normalY}" 
        stroke="#666666" 
        stroke-width="1"
      />
      <!-- Inner frame line 2 -->
      <line 
        x1="${transform.startX + frameOffset}" 
        y1="${transform.startY - frameOffset * transform.normalY}" 
        x2="${transform.endX - frameOffset}" 
        y2="${transform.endY - frameOffset * transform.normalY}" 
        stroke="#666666" 
        stroke-width="1"
      />
    </g>
  `;
}

/**
 * Generate SVG for a picture window symbol
 */
function generatePictureWindowSvg(
  id: string,
  wall: WallSegment,
  positionOnWall: number,
  widthInches: number
): string {
  const transform = calculateOpeningTransform(wall, positionOnWall, widthInches);
  const widthSvg = inchesToSvgPixels(widthInches);
  
  return `
    <g id="${id}" class="opening window picture-window" data-opening-id="${id}" data-opening-type="picture_window">
      <!-- Wall gap -->
      <rect 
        x="${transform.startX}" 
        y="${transform.centerY - 4}" 
        width="${widthSvg}" 
        height="8" 
        fill="white" 
        transform="rotate(${transform.angle}, ${transform.centerX}, ${transform.centerY})"
      />
      <!-- Thick frame (picture windows are typically larger/heavier) -->
      <line 
        x1="${transform.startX}" 
        y1="${transform.startY}" 
        x2="${transform.endX}" 
        y2="${transform.endY}" 
        stroke="#222222" 
        stroke-width="4"
      />
      <!-- Glass indication (double line) -->
      <line 
        x1="${transform.startX}" 
        y1="${transform.startY + transform.normalY * 2}" 
        x2="${transform.endX}" 
        y2="${transform.endY + transform.normalY * 2}" 
        stroke="#888888" 
        stroke-width="1"
      />
      <line 
        x1="${transform.startX}" 
        y1="${transform.startY - transform.normalY * 2}" 
        x2="${transform.endX}" 
        y2="${transform.endY - transform.normalY * 2}" 
        stroke="#888888" 
        stroke-width="1"
      />
    </g>
  `;
}

/**
 * Generate SVG for a bay window symbol
 */
function generateBayWindowSvg(
  id: string,
  wall: WallSegment,
  positionOnWall: number,
  widthInches: number
): string {
  const transform = calculateOpeningTransform(wall, positionOnWall, widthInches);
  const widthSvg = inchesToSvgPixels(widthInches);
  const depth = widthSvg * 0.3; // Bay window projects out
  
  // Bay window has 3 segments: two angled sides and a center
  const thirdWidth = widthSvg / 3;
  
  // Points for bay window outline
  const p1 = { x: transform.startX, y: transform.startY };
  const p2 = { 
    x: transform.startX + thirdWidth * (transform.endX - transform.startX) / widthSvg + transform.normalX * depth,
    y: transform.startY + thirdWidth * (transform.endY - transform.startY) / widthSvg + transform.normalY * depth
  };
  const p3 = {
    x: transform.endX - thirdWidth * (transform.endX - transform.startX) / widthSvg + transform.normalX * depth,
    y: transform.endY - thirdWidth * (transform.endY - transform.startY) / widthSvg + transform.normalY * depth
  };
  const p4 = { x: transform.endX, y: transform.endY };
  
  return `
    <g id="${id}" class="opening window bay-window" data-opening-id="${id}" data-opening-type="bay_window">
      <!-- Wall gap -->
      <rect 
        x="${transform.startX}" 
        y="${transform.centerY - 4}" 
        width="${widthSvg}" 
        height="8" 
        fill="white" 
        transform="rotate(${transform.angle}, ${transform.centerX}, ${transform.centerY})"
      />
      <!-- Bay window outline -->
      <path 
        d="M ${p1.x},${p1.y} L ${p2.x},${p2.y} L ${p3.x},${p3.y} L ${p4.x},${p4.y}" 
        fill="none" 
        stroke="#222222" 
        stroke-width="3"
      />
      <!-- Glass lines -->
      <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#666666" stroke-width="1"/>
      <line x1="${p2.x}" y1="${p2.y}" x2="${p3.x}" y2="${p3.y}" stroke="#666666" stroke-width="1"/>
      <line x1="${p3.x}" y1="${p3.y}" x2="${p4.x}" y2="${p4.y}" stroke="#666666" stroke-width="1"/>
    </g>
  `;
}

/**
 * Generate SVG symbol for any opening type
 */
export function generateOpeningSvg(
  opening: OpeningPlacement,
  wall: WallSegment
): string {
  const { id, type, positionOnWall, widthInches, swingDirection } = opening;
  
  switch (type) {
    case 'interior_door':
      return generateInteriorDoorSvg(id, wall, positionOnWall, widthInches, swingDirection);
    case 'exterior_door':
      return generateExteriorDoorSvg(id, wall, positionOnWall, widthInches, swingDirection);
    case 'sliding_door':
      return generateSlidingDoorSvg(id, wall, positionOnWall, widthInches);
    case 'french_door':
      return generateFrenchDoorSvg(id, wall, positionOnWall, widthInches, swingDirection);
    case 'window':
      return generateWindowSvg(id, wall, positionOnWall, widthInches);
    case 'picture_window':
      return generatePictureWindowSvg(id, wall, positionOnWall, widthInches);
    case 'bay_window':
      return generateBayWindowSvg(id, wall, positionOnWall, widthInches);
    default:
      console.warn(`Unknown opening type: ${type}`);
      return generateWindowSvg(id, wall, positionOnWall, widthInches);
  }
}

/**
 * Add an opening to an SVG floor plan
 */
export function addOpeningToSvg(
  svg: string,
  opening: OpeningPlacement,
  walls?: WallSegment[]
): string {
  // Extract walls if not provided
  const wallSegments = walls || extractWallSegments(svg);
  
  // Find the wall for this opening
  const wall = wallSegments.find(w => w.id === opening.wallId);
  if (!wall) {
    console.error(`Wall ${opening.wallId} not found in SVG`);
    return svg;
  }
  
  // Generate opening SVG
  const openingSvg = generateOpeningSvg(opening, wall);
  
  // Check if there's already an openings group
  if (svg.includes('id="openings"')) {
    // Add to existing group
    return svg.replace(
      '</g><!-- end openings -->',
      `${openingSvg}</g><!-- end openings -->`
    );
  }
  
  // Create new openings group and add before closing </svg>
  const openingsGroup = `
  <g id="openings" class="openings-layer">
    ${openingSvg}
  </g><!-- end openings -->`;
  
  return svg.replace('</svg>', `${openingsGroup}\n</svg>`);
}

/**
 * Remove an opening from an SVG floor plan
 */
export function removeOpeningFromSvg(
  svg: string,
  openingId: string
): string {
  // Remove the opening group by ID
  const regex = new RegExp(`<g[^>]*id="${openingId}"[^>]*>[\\s\\S]*?<\\/g>`, 'g');
  return svg.replace(regex, '');
}

/**
 * Generate a preview overlay SVG (just the opening, positioned for overlay)
 */
export function generatePreviewOverlaySvg(
  opening: OpeningPlacement,
  wall: WallSegment,
  viewBox: { x: number; y: number; width: number; height: number }
): string {
  const openingSvg = generateOpeningSvg(opening, wall);
  
  return `<svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;"
  >
    ${openingSvg}
  </svg>`;
}

/**
 * Validate opening placement
 */
export function validateOpeningPlacement(
  opening: Omit<OpeningPlacement, 'id'>,
  wall: WallSegment,
  existingOpenings: OpeningPlacement[] = []
): { valid: boolean; error?: string } {
  const widthSvg = inchesToSvgPixels(opening.widthInches);
  
  // Check if wall is long enough
  if (wall.length < widthSvg) {
    return { valid: false, error: 'Wall is too short for this opening' };
  }
  
  // Check if opening fits on wall (with margin)
  const margin = widthSvg / 2;
  const positionPx = opening.positionOnWall * wall.length;
  
  if (positionPx - margin < 0 || positionPx + margin > wall.length) {
    return { valid: false, error: 'Opening extends beyond wall' };
  }
  
  // Check for overlap with existing openings on same wall
  const sameWallOpenings = existingOpenings.filter(o => o.wallId === opening.wallId);
  
  for (const existing of sameWallOpenings) {
    const existingWidth = inchesToSvgPixels(existing.widthInches);
    const existingPos = existing.positionOnWall * wall.length;
    const newPos = opening.positionOnWall * wall.length;
    
    const minDistance = (existingWidth + widthSvg) / 2 + 12; // 12px (~2ft) minimum gap
    
    if (Math.abs(existingPos - newPos) < minDistance) {
      return { valid: false, error: 'Opening overlaps with existing opening' };
    }
  }
  
  // Check exterior requirement
  const requiresExterior = opening.type.includes('window') || 
                           opening.type === 'exterior_door' || 
                           opening.type === 'sliding_door';
  
  if (requiresExterior && !wall.isExterior) {
    return { valid: false, error: 'This opening type requires an exterior wall' };
  }
  
  return { valid: true };
}




