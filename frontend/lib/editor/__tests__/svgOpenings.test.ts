/**
 * Tests for SVG Opening Modification
 */

import { describe, it, expect } from 'vitest';
import {
  generateOpeningId,
  generateOpeningSvg,
  addOpeningToSvg,
  removeOpeningFromSvg,
  validateOpeningPlacement,
} from '../svgOpenings';
import type { OpeningPlacement, WallSegment } from '../openingTypes';

// Sample wall for testing
const SAMPLE_WALL: WallSegment = {
  id: 'wall-1',
  start: { x: 0, y: 50 },
  end: { x: 100, y: 50 },
  isExterior: true,
  adjacentRoomIds: ['room-1', null],
  length: 100,
};

const INTERIOR_WALL: WallSegment = {
  id: 'wall-2',
  start: { x: 50, y: 0 },
  end: { x: 50, y: 100 },
  isExterior: false,
  adjacentRoomIds: ['room-1', 'room-2'],
  length: 100,
};

// Sample SVG
const SAMPLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">
  <polygon data-room-id="room-1" fill="#E8F5E9" points="0,0 100,0 100,100 0,100"/>
</svg>
`;

describe('generateOpeningId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateOpeningId();
    const id2 = generateOpeningId();
    
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^opening-/);
  });
});

describe('generateOpeningSvg', () => {
  it('should generate interior door SVG', () => {
    const opening: OpeningPlacement = {
      id: 'test-door',
      type: 'interior_door',
      wallId: INTERIOR_WALL.id,
      positionOnWall: 0.5,
      widthInches: 36,
      swingDirection: 'right',
    };
    
    const svg = generateOpeningSvg(opening, INTERIOR_WALL);
    
    expect(svg).toContain('id="test-door"');
    expect(svg).toContain('class="opening door interior-door"');
    expect(svg).toContain('data-opening-type="interior_door"');
  });

  it('should generate window SVG', () => {
    const opening: OpeningPlacement = {
      id: 'test-window',
      type: 'window',
      wallId: SAMPLE_WALL.id,
      positionOnWall: 0.5,
      widthInches: 36,
    };
    
    const svg = generateOpeningSvg(opening, SAMPLE_WALL);
    
    expect(svg).toContain('id="test-window"');
    expect(svg).toContain('class="opening window');
    expect(svg).toContain('data-opening-type="window"');
  });

  it('should generate sliding door SVG', () => {
    const opening: OpeningPlacement = {
      id: 'test-sliding',
      type: 'sliding_door',
      wallId: SAMPLE_WALL.id,
      positionOnWall: 0.5,
      widthInches: 72,
    };
    
    const svg = generateOpeningSvg(opening, SAMPLE_WALL);
    
    expect(svg).toContain('sliding-door');
  });

  it('should generate french door SVG', () => {
    const opening: OpeningPlacement = {
      id: 'test-french',
      type: 'french_door',
      wallId: SAMPLE_WALL.id,
      positionOnWall: 0.5,
      widthInches: 60,
    };
    
    const svg = generateOpeningSvg(opening, SAMPLE_WALL);
    
    expect(svg).toContain('french-door');
  });

  it('should generate bay window SVG', () => {
    const opening: OpeningPlacement = {
      id: 'test-bay',
      type: 'bay_window',
      wallId: SAMPLE_WALL.id,
      positionOnWall: 0.5,
      widthInches: 72,
    };
    
    const svg = generateOpeningSvg(opening, SAMPLE_WALL);
    
    expect(svg).toContain('bay-window');
  });
});

describe('addOpeningToSvg', () => {
  it('should add opening to SVG', () => {
    const opening: OpeningPlacement = {
      id: 'new-door',
      type: 'interior_door',
      wallId: SAMPLE_WALL.id,
      positionOnWall: 0.5,
      widthInches: 36,
      swingDirection: 'right',
    };
    
    const result = addOpeningToSvg(SAMPLE_SVG, opening, [SAMPLE_WALL]);
    
    expect(result).toContain('id="openings"');
    expect(result).toContain('id="new-door"');
    expect(result).toContain('</svg>');
  });

  it('should add to existing openings group', () => {
    const svgWithOpenings = SAMPLE_SVG.replace(
      '</svg>',
      '<g id="openings" class="openings-layer"></g><!-- end openings -->\n</svg>'
    );
    
    const opening: OpeningPlacement = {
      id: 'another-door',
      type: 'interior_door',
      wallId: SAMPLE_WALL.id,
      positionOnWall: 0.5,
      widthInches: 36,
    };
    
    const result = addOpeningToSvg(svgWithOpenings, opening, [SAMPLE_WALL]);
    
    // Should still have only one openings group
    const matches = result.match(/id="openings"/g);
    expect(matches).toHaveLength(1);
    expect(result).toContain('id="another-door"');
  });
});

describe('removeOpeningFromSvg', () => {
  it('should remove opening by ID', () => {
    const svgWithOpening = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <g id="openings">
    <g id="door-to-remove" class="opening door">
      <rect fill="white"/>
      <line stroke="#333"/>
    </g>
  </g>
</svg>
`;
    
    const result = removeOpeningFromSvg(svgWithOpening, 'door-to-remove');
    
    expect(result).not.toContain('id="door-to-remove"');
    expect(result).toContain('id="openings"');
  });
});

describe('validateOpeningPlacement', () => {
  it('should validate valid placement', () => {
    const opening = {
      type: 'interior_door' as const,
      wallId: SAMPLE_WALL.id,
      positionOnWall: 0.5,
      widthInches: 36,
    };
    
    const result = validateOpeningPlacement(opening, SAMPLE_WALL, []);
    
    expect(result.valid).toBe(true);
  });

  it('should reject placement on wall that is too short', () => {
    const shortWall: WallSegment = {
      ...SAMPLE_WALL,
      length: 10, // Too short for 36" door
    };
    
    const opening = {
      type: 'interior_door' as const,
      wallId: shortWall.id,
      positionOnWall: 0.5,
      widthInches: 36,
    };
    
    const result = validateOpeningPlacement(opening, shortWall, []);
    
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too short');
  });

  it('should reject placement that extends beyond wall', () => {
    const opening = {
      type: 'interior_door' as const,
      wallId: SAMPLE_WALL.id,
      positionOnWall: 0.95, // Too close to end
      widthInches: 36,
    };
    
    const result = validateOpeningPlacement(opening, SAMPLE_WALL, []);
    
    expect(result.valid).toBe(false);
    expect(result.error).toContain('extends beyond');
  });

  it('should reject window on interior wall', () => {
    const opening = {
      type: 'window' as const,
      wallId: INTERIOR_WALL.id,
      positionOnWall: 0.5,
      widthInches: 36,
    };
    
    const result = validateOpeningPlacement(opening, INTERIOR_WALL, []);
    
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exterior wall');
  });

  it('should reject overlapping openings', () => {
    const existingOpening: OpeningPlacement = {
      id: 'existing',
      type: 'interior_door',
      wallId: SAMPLE_WALL.id,
      positionOnWall: 0.5,
      widthInches: 36,
    };
    
    const newOpening = {
      type: 'interior_door' as const,
      wallId: SAMPLE_WALL.id,
      positionOnWall: 0.52, // Too close to existing
      widthInches: 36,
    };
    
    const result = validateOpeningPlacement(newOpening, SAMPLE_WALL, [existingOpening]);
    
    expect(result.valid).toBe(false);
    expect(result.error).toContain('overlaps');
  });

  it('should allow non-overlapping openings', () => {
    const existingOpening: OpeningPlacement = {
      id: 'existing',
      type: 'interior_door',
      wallId: SAMPLE_WALL.id,
      positionOnWall: 0.2,
      widthInches: 36,
    };
    
    const newOpening = {
      type: 'interior_door' as const,
      wallId: SAMPLE_WALL.id,
      positionOnWall: 0.8, // Far enough from existing
      widthInches: 36,
    };
    
    const result = validateOpeningPlacement(newOpening, SAMPLE_WALL, [existingOpening]);
    
    expect(result.valid).toBe(true);
  });
});

