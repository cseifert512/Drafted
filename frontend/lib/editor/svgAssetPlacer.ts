/**
 * SVG Asset Placer
 * 
 * Places door and window SVG assets onto floor plan walls with proper
 * transforms, scaling, and wall breaks for clean vector export.
 */

import type { WallSegment, Point } from './openingTypes';
import { inchesToSvgPixels, SVG_INCHES_PER_PIXEL } from './openingTypes';
import type { DoorWindowAsset, AssetCategory } from './assetManifest';
import { getAssetUrl, fetchAssetSvg, CATEGORY_METADATA } from './assetManifest';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Parsed SVG asset with dimensions and content
 */
export interface ParsedSvgAsset {
  width: number;
  height: number;
  viewBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  content: string;  // Inner SVG content (without outer <svg> tag)
  openingRect?: {   // The doorOpening/windowOpening rect if found
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Placement configuration for an asset
 */
export interface AssetPlacement {
  asset: DoorWindowAsset;
  wall: WallSegment;
  positionOnWall: number;  // 0-1 along wall
  flipHorizontal?: boolean;  // For swing direction (horizontal mirror)
  swingOutward?: boolean;  // For swing direction (outward=exterior, inward=interior)
}

/**
 * Result of placing an asset
 */
export interface PlacedAssetResult {
  svgGroup: string;  // Complete SVG group element
  wallBreakRect: string;  // White rectangle to break the wall
  openingId: string;
  centerX: number;
  centerY: number;
  angle: number;
}

// =============================================================================
// SVG PARSING
// =============================================================================

/**
 * Parse an SVG string to extract dimensions and content
 */
export function parseSvgAsset(svgString: string): ParsedSvgAsset {
  // Extract width and height
  const widthMatch = svgString.match(/width="(\d+(?:\.\d+)?)"/);
  const heightMatch = svgString.match(/height="(\d+(?:\.\d+)?)"/);
  
  const width = widthMatch ? parseFloat(widthMatch[1]) : 100;
  const height = heightMatch ? parseFloat(heightMatch[1]) : 100;
  
  // Extract viewBox
  const viewBoxMatch = svgString.match(/viewBox="([^"]+)"/);
  let viewBox = { x: 0, y: 0, width, height };
  
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/).map(parseFloat);
    if (parts.length === 4) {
      viewBox = {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3],
      };
    }
  }
  
  // Extract inner content (everything between <svg> and </svg>)
  const contentMatch = svgString.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  const content = contentMatch ? contentMatch[1].trim() : '';
  
  // Try to find the doorOpening or similar rect for wall break calculation
  const openingRect = extractOpeningRect(svgString);
  
  return {
    width,
    height,
    viewBox,
    content,
    openingRect,
  };
}

/**
 * Extract the opening rectangle from SVG (used for wall break)
 */
function extractOpeningRect(svgString: string): ParsedSvgAsset['openingRect'] | undefined {
  // Look for rect with id containing "Opening" (doorOpening, windowOpening, etc.)
  const rectMatch = svgString.match(
    /<rect[^>]*id="[^"]*[Oo]pening[^"]*"[^>]*>/i
  );
  
  if (!rectMatch) {
    return undefined;
  }
  
  const rectStr = rectMatch[0];
  
  const xMatch = rectStr.match(/x="([^"]+)"/);
  const yMatch = rectStr.match(/y="([^"]+)"/);
  const widthMatch = rectStr.match(/width="([^"]+)"/);
  const heightMatch = rectStr.match(/height="([^"]+)"/);
  
  if (!xMatch || !yMatch || !widthMatch || !heightMatch) {
    return undefined;
  }
  
  return {
    x: parseFloat(xMatch[1]),
    y: parseFloat(yMatch[1]),
    width: parseFloat(widthMatch[1]),
    height: parseFloat(heightMatch[1]),
  };
}

// =============================================================================
// COORDINATE CALCULATIONS
// =============================================================================

/**
 * Calculate transform parameters for placing an asset on a wall
 * 
 * The door SVG assets have the door opening at the bottom of the viewBox,
 * with the swing arc extending upward. When placed on a wall:
 * - The bottom of the opening should align with the wall line
 * - The swing arc extends perpendicular to the wall
 * 
 * @param swingOutward - if true, arc extends in negative Y (outward); if false, positive Y (inward)
 */
export function calculateAssetTransform(
  wall: WallSegment,
  positionOnWall: number,
  assetWidthInches: number,
  parsed: ParsedSvgAsset,
  swingOutward: boolean = true
): {
  centerX: number;
  centerY: number;
  angle: number;
  scale: number;
  translateX: number;
  translateY: number;
} {
  // Wall vector
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);
  
  // Normalized direction
  const dirX = dx / wallLength;
  const dirY = dy / wallLength;
  
  // Center point on wall
  const centerX = wall.start.x + dx * positionOnWall;
  const centerY = wall.start.y + dy * positionOnWall;
  
  // Wall angle in degrees
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  // Calculate scale factor
  // The asset's viewBox width represents its physical width in SVG units
  // We need to scale it to match the target width in inches
  const targetWidthSvg = inchesToSvgPixels(assetWidthInches);
  
  // Use the opening rect width if available, otherwise use viewBox width
  const assetOpeningWidth = parsed.openingRect?.width || parsed.viewBox.width;
  const scale = targetWidthSvg / assetOpeningWidth;
  
  // Calculate translation to position the asset
  // X: center the opening horizontally on the wall position
  // Y: align the bottom of the opening with the wall line, arc extends perpendicular
  let translateX = -parsed.viewBox.width / 2;
  let translateY: number;
  
  if (parsed.openingRect) {
    // Center X on the opening
    const openingCenterX = parsed.openingRect.x + parsed.openingRect.width / 2;
    translateX = -openingCenterX;
    
    // Position Y so the bottom of the opening sits on the wall line (y=0 after transform)
    // The swing arc in the asset extends "upward" (toward y=0 in asset coords)
    // After rotation, we want the arc to extend perpendicular to the wall
    const openingBottom = parsed.openingRect.y + parsed.openingRect.height;
    
    if (swingOutward) {
      // Arc extends in negative Y (outward from wall) - align bottom of opening with wall
      translateY = -openingBottom;
    } else {
      // Arc extends in positive Y (inward) - flip the asset orientation
      // Align top of opening with wall, arc goes the other direction
      translateY = -parsed.openingRect.y;
    }
  } else {
    // Fallback: center on viewBox
    translateY = -parsed.viewBox.height / 2;
  }
  
  return {
    centerX,
    centerY,
    angle,
    scale,
    translateX,
    translateY,
  };
}

/**
 * Calculate wall break rectangle dimensions
 */
export function calculateWallBreak(
  wall: WallSegment,
  positionOnWall: number,
  widthInches: number,
  wallThickness: number = 8  // Default wall thickness in SVG pixels
): {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  centerX: number;
  centerY: number;
} {
  const widthSvg = inchesToSvgPixels(widthInches);
  
  // Wall vector
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);
  
  // Center point on wall
  const centerX = wall.start.x + dx * positionOnWall;
  const centerY = wall.start.y + dy * positionOnWall;
  
  // Wall angle in degrees
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  // The break rect should be slightly larger than the opening
  // to ensure complete wall coverage
  const breakWidth = widthSvg + 4;  // Add small buffer
  const breakHeight = wallThickness + 4;
  
  return {
    x: -breakWidth / 2,
    y: -breakHeight / 2,
    width: breakWidth,
    height: breakHeight,
    angle,
    centerX,
    centerY,
  };
}

// =============================================================================
// SVG GENERATION
// =============================================================================

/**
 * Generate a unique opening ID
 */
export function generateOpeningId(): string {
  return `opening-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate the wall break SVG rectangle
 */
export function generateWallBreakSvg(
  breakParams: ReturnType<typeof calculateWallBreak>,
  openingId: string
): string {
  return `
    <rect 
      id="${openingId}-wall-break"
      class="wall-break"
      x="${breakParams.x}" 
      y="${breakParams.y}" 
      width="${breakParams.width}" 
      height="${breakParams.height}" 
      fill="white"
      transform="translate(${breakParams.centerX}, ${breakParams.centerY}) rotate(${breakParams.angle})"
    />
  `;
}

/**
 * Generate the placed asset SVG group
 */
export function generatePlacedAssetSvg(
  openingId: string,
  parsed: ParsedSvgAsset,
  transform: ReturnType<typeof calculateAssetTransform>,
  asset: DoorWindowAsset,
  flipHorizontal: boolean = false
): string {
  // Build transform string
  // Order: translate to position, rotate to wall angle, scale, flip if needed, translate to center
  let transformStr = `translate(${transform.centerX}, ${transform.centerY})`;
  transformStr += ` rotate(${transform.angle})`;
  transformStr += ` scale(${transform.scale})`;
  
  if (flipHorizontal) {
    transformStr += ` scale(-1, 1)`;
  }
  
  transformStr += ` translate(${transform.translateX}, ${transform.translateY})`;
  
  // Get category info for data attributes
  const categoryMeta = CATEGORY_METADATA[asset.category];
  
  return `
    <g 
      id="${openingId}" 
      class="opening ${categoryMeta.categoryGroup} ${asset.category.toLowerCase()}"
      data-opening-id="${openingId}"
      data-asset-filename="${asset.filename}"
      data-asset-category="${asset.category}"
      data-width-inches="${asset.inches}"
      transform="${transformStr}"
    >
      ${parsed.content}
    </g>
  `;
}

/**
 * Place an asset on a wall and return the complete SVG elements
 */
export async function placeAssetOnWall(
  placement: AssetPlacement
): Promise<PlacedAssetResult> {
  const { asset, wall, positionOnWall, flipHorizontal, swingOutward = true } = placement;
  
  // Fetch and parse the SVG asset
  const svgString = await fetchAssetSvg(asset.filename);
  const parsed = parseSvgAsset(svgString);
  
  // Generate unique ID
  const openingId = generateOpeningId();
  
  // Calculate transform - pass swing direction for proper Y alignment
  const transform = calculateAssetTransform(
    wall,
    positionOnWall,
    asset.inches,
    parsed,
    swingOutward
  );
  
  // Calculate wall break
  const breakParams = calculateWallBreak(
    wall,
    positionOnWall,
    asset.inches
  );
  
  // Generate SVG elements
  const wallBreakRect = generateWallBreakSvg(breakParams, openingId);
  const assetGroup = generatePlacedAssetSvg(
    openingId,
    parsed,
    transform,
    asset,
    flipHorizontal
  );
  
  // Combine into complete group (wall break first, then asset on top)
  const svgGroup = `
    <g id="${openingId}-container" class="opening-container">
      ${wallBreakRect}
      ${assetGroup}
    </g>
  `;
  
  return {
    svgGroup,
    wallBreakRect,
    openingId,
    centerX: transform.centerX,
    centerY: transform.centerY,
    angle: transform.angle,
  };
}

/**
 * Add a placed asset to an existing SVG floor plan
 */
export function addPlacedAssetToSvg(
  svg: string,
  placedAsset: PlacedAssetResult
): string {
  // Check if there's already an openings group
  if (svg.includes('id="openings"')) {
    // Add to existing group
    return svg.replace(
      '</g><!-- end openings -->',
      `${placedAsset.svgGroup}</g><!-- end openings -->`
    );
  }
  
  // Create new openings group and add before closing </svg>
  const openingsGroup = `
  <g id="openings" class="openings-layer">
    ${placedAsset.svgGroup}
  </g><!-- end openings -->`;
  
  return svg.replace('</svg>', `${openingsGroup}\n</svg>`);
}

/**
 * Remove an opening from an SVG by ID
 */
export function removeOpeningFromSvg(svg: string, openingId: string): string {
  // Remove the opening container group by ID
  const containerRegex = new RegExp(
    `<g[^>]*id="${openingId}-container"[^>]*>[\\s\\S]*?<\\/g>`,
    'g'
  );
  return svg.replace(containerRegex, '');
}

// =============================================================================
// ASSET PLACEMENT VALIDATION
// =============================================================================

/**
 * Check if an asset can be placed at a position on a wall
 */
export function validateAssetPlacement(
  asset: DoorWindowAsset,
  wall: WallSegment,
  positionOnWall: number,
  existingOpenings: Array<{ positionOnWall: number; widthInches: number }> = []
): { valid: boolean; error?: string } {
  const widthSvg = inchesToSvgPixels(asset.inches);
  const halfWidth = widthSvg / 2;
  
  // Check if asset fits on wall
  const positionPx = positionOnWall * wall.length;
  if (positionPx - halfWidth < 0) {
    return { valid: false, error: 'Opening extends past wall start' };
  }
  if (positionPx + halfWidth > wall.length) {
    return { valid: false, error: 'Opening extends past wall end' };
  }
  
  // Check wall type requirements
  const categoryMeta = CATEGORY_METADATA[asset.category];
  if (categoryMeta.isExterior && !wall.isExterior) {
    return { valid: false, error: 'This opening type requires an exterior wall' };
  }
  
  // Check for overlap with existing openings
  for (const existing of existingOpenings) {
    const existingWidthSvg = inchesToSvgPixels(existing.widthInches);
    const existingPos = existing.positionOnWall * wall.length;
    const existingHalf = existingWidthSvg / 2;
    
    const minDistance = halfWidth + existingHalf + 4; // 4px buffer
    const actualDistance = Math.abs(positionPx - existingPos);
    
    if (actualDistance < minDistance) {
      return { valid: false, error: 'Opening overlaps with existing opening' };
    }
  }
  
  return { valid: true };
}

// =============================================================================
// PREVIEW GENERATION
// =============================================================================

/**
 * Generate a preview SVG for an asset (for display in the picker)
 */
export function generateAssetPreviewSvg(
  svgString: string,
  maxWidth: number = 100,
  maxHeight: number = 60
): string {
  const parsed = parseSvgAsset(svgString);
  
  // Calculate scale to fit within bounds
  const scaleX = maxWidth / parsed.viewBox.width;
  const scaleY = maxHeight / parsed.viewBox.height;
  const scale = Math.min(scaleX, scaleY, 1); // Don't scale up
  
  const scaledWidth = parsed.viewBox.width * scale;
  const scaledHeight = parsed.viewBox.height * scale;
  
  return `
    <svg 
      width="${scaledWidth}" 
      height="${scaledHeight}" 
      viewBox="${parsed.viewBox.x} ${parsed.viewBox.y} ${parsed.viewBox.width} ${parsed.viewBox.height}"
      xmlns="http://www.w3.org/2000/svg"
    >
      ${parsed.content}
    </svg>
  `;
}

