/**
 * Door and Window Asset Manifest
 * 
 * Type definitions and utilities for loading and working with
 * professional SVG door/window assets from the doorwindow_assets folder.
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Raw asset entry from manifest.json
 */
export interface ManifestAsset {
  new_name: string;
  category: AssetCategory;
  inches: number;
  src?: string;  // Original source path (not used at runtime)
  dst?: string;  // Original destination path (not used at runtime)
}

/**
 * Asset categories as they appear in the manifest
 */
export type AssetCategory =
  | 'DoorExteriorDouble'
  | 'DoorExteriorSingle'
  | 'DoorExteriorSliding'
  | 'DoorExteriorBifold'
  | 'DoorInteriorBifold'
  | 'DoorInteriorDouble'
  | 'DoorInteriorSingle'
  | 'GarageSingle'
  | 'GarageDouble'
  | 'Window';

/**
 * UI-friendly category grouping
 */
export type CategoryGroup = 'door' | 'window' | 'garage';

/**
 * Processed asset with additional metadata
 */
export interface DoorWindowAsset {
  filename: string;
  category: AssetCategory;
  inches: number;
  displayName: string;
  description: string;
  categoryGroup: CategoryGroup;
  isExterior: boolean;
  hasSwing: boolean;
  isHalfSwing: boolean;
}

/**
 * Category metadata for UI display
 */
export interface CategoryMetadata {
  category: AssetCategory;
  displayName: string;
  description: string;
  categoryGroup: CategoryGroup;
  isExterior: boolean;
  hasSwing: boolean;
  icon: string;  // Lucide icon name
}

// =============================================================================
// CATEGORY METADATA
// =============================================================================

export const CATEGORY_METADATA: Record<AssetCategory, CategoryMetadata> = {
  DoorExteriorSingle: {
    category: 'DoorExteriorSingle',
    displayName: 'Exterior Single',
    description: 'Standard entry door with swing',
    categoryGroup: 'door',
    isExterior: true,
    hasSwing: true,
    icon: 'DoorClosed',
  },
  DoorExteriorDouble: {
    category: 'DoorExteriorDouble',
    displayName: 'Exterior Double',
    description: 'Double entry door with glass',
    categoryGroup: 'door',
    isExterior: true,
    hasSwing: true,
    icon: 'Columns2',
  },
  DoorExteriorSliding: {
    category: 'DoorExteriorSliding',
    displayName: 'Sliding Glass',
    description: 'Glass sliding door for patios',
    categoryGroup: 'door',
    isExterior: true,
    hasSwing: false,
    icon: 'PanelLeftOpen',
  },
  DoorExteriorBifold: {
    category: 'DoorExteriorBifold',
    displayName: 'Exterior Bifold',
    description: 'Large folding glass door',
    categoryGroup: 'door',
    isExterior: true,
    hasSwing: false,
    icon: 'PanelLeftOpen',
  },
  DoorInteriorSingle: {
    category: 'DoorInteriorSingle',
    displayName: 'Interior Single',
    description: 'Standard interior swing door',
    categoryGroup: 'door',
    isExterior: false,
    hasSwing: true,
    icon: 'DoorOpen',
  },
  DoorInteriorDouble: {
    category: 'DoorInteriorDouble',
    displayName: 'Interior Double',
    description: 'French doors or double swing',
    categoryGroup: 'door',
    isExterior: false,
    hasSwing: true,
    icon: 'Columns2',
  },
  DoorInteriorBifold: {
    category: 'DoorInteriorBifold',
    displayName: 'Interior Bifold',
    description: 'Folding closet door',
    categoryGroup: 'door',
    isExterior: false,
    hasSwing: false,
    icon: 'PanelLeftOpen',
  },
  GarageSingle: {
    category: 'GarageSingle',
    displayName: 'Garage Single',
    description: 'Single-car garage door (8ft)',
    categoryGroup: 'garage',
    isExterior: true,
    hasSwing: false,
    icon: 'Warehouse',
  },
  GarageDouble: {
    category: 'GarageDouble',
    displayName: 'Garage Double',
    description: 'Double-car garage door (16ft)',
    categoryGroup: 'garage',
    isExterior: true,
    hasSwing: false,
    icon: 'Warehouse',
  },
  Window: {
    category: 'Window',
    displayName: 'Casement Window',
    description: 'Standard casement window',
    categoryGroup: 'window',
    isExterior: true,
    hasSwing: false,
    icon: 'Square',
  },
};

// =============================================================================
// ASSET PROCESSING
// =============================================================================

/**
 * Parse filename to extract asset info (for assets not in manifest)
 */
function parseFilename(filename: string): Partial<DoorWindowAsset> | null {
  // Remove .svg extension
  const name = filename.replace('.svg', '');
  
  // Detect half-swing variant
  const isHalfSwing = name.includes('_halfswing');
  const cleanName = name.replace('_halfswing', '');
  
  // Try to extract inches from filename
  const inchesMatch = cleanName.match(/_(\d+)(in)?$/);
  const inches = inchesMatch ? parseInt(inchesMatch[1], 10) : null;
  
  // Detect category from filename pattern
  let category: AssetCategory | null = null;
  
  if (cleanName.startsWith('door_exterior_sliding')) {
    category = 'DoorExteriorSliding';
  } else if (cleanName.startsWith('door_exterior_bifold')) {
    category = 'DoorExteriorBifold';
  } else if (cleanName.startsWith('door_exterior_double')) {
    category = 'DoorExteriorDouble';
  } else if (cleanName.startsWith('door_exterior_single')) {
    category = 'DoorExteriorSingle';
  } else if (cleanName.startsWith('door_interior_bifold')) {
    category = 'DoorInteriorBifold';
  } else if (cleanName.startsWith('door_interior_double')) {
    category = 'DoorInteriorDouble';
  } else if (cleanName.startsWith('door_interior_single')) {
    category = 'DoorInteriorSingle';
  } else if (cleanName.startsWith('garagedoor_double')) {
    category = 'GarageDouble';
  } else if (cleanName.startsWith('garagedoor_single')) {
    category = 'GarageSingle';
  } else if (cleanName.startsWith('window')) {
    category = 'Window';
  }
  
  if (!category || inches === null) {
    return null;
  }
  
  return {
    category,
    inches,
    isHalfSwing,
  };
}

/**
 * Convert manifest entry to full asset object
 */
function manifestToAsset(entry: ManifestAsset): DoorWindowAsset {
  const meta = CATEGORY_METADATA[entry.category];
  const isHalfSwing = entry.new_name.includes('_halfswing');
  
  return {
    filename: entry.new_name,
    category: entry.category,
    inches: entry.inches,
    displayName: `${meta.displayName} ${entry.inches}"${isHalfSwing ? ' (Half)' : ''}`,
    description: meta.description,
    categoryGroup: meta.categoryGroup,
    isExterior: meta.isExterior,
    hasSwing: meta.hasSwing,
    isHalfSwing,
  };
}

/**
 * Create asset from filename (when not in manifest)
 */
function filenameToAsset(filename: string): DoorWindowAsset | null {
  const parsed = parseFilename(filename);
  if (!parsed || !parsed.category || parsed.inches === undefined) {
    return null;
  }
  
  const meta = CATEGORY_METADATA[parsed.category];
  const isHalfSwing = parsed.isHalfSwing ?? false;
  
  return {
    filename,
    category: parsed.category,
    inches: parsed.inches,
    displayName: `${meta.displayName} ${parsed.inches}"${isHalfSwing ? ' (Half)' : ''}`,
    description: meta.description,
    categoryGroup: meta.categoryGroup,
    isExterior: meta.isExterior,
    hasSwing: meta.hasSwing,
    isHalfSwing,
  };
}

// =============================================================================
// MANIFEST LOADING
// =============================================================================

let cachedManifest: DoorWindowAsset[] | null = null;
let cachedManifestPromise: Promise<DoorWindowAsset[]> | null = null;

/**
 * Get the base URL for asset files
 */
export function getAssetBaseUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return `${apiUrl}/static/doorwindow_assets`;
}

/**
 * Load the asset manifest from the backend
 */
export async function loadAssetManifest(): Promise<DoorWindowAsset[]> {
  // Return cached version if available
  if (cachedManifest) {
    return cachedManifest;
  }
  
  // Return pending promise if already loading
  if (cachedManifestPromise) {
    return cachedManifestPromise;
  }
  
  // Create new loading promise
  cachedManifestPromise = (async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/drafted/doorwindow-assets`);
      
      if (!response.ok) {
        throw new Error(`Failed to load asset manifest: ${response.status}`);
      }
      
      const data = await response.json();
      const manifest: ManifestAsset[] = data.assets || data;
      
      // Convert manifest entries to full asset objects
      const assets: DoorWindowAsset[] = manifest.map(manifestToAsset);
      
      // Also process any additional files that might not be in manifest
      const additionalFilenames: string[] = data.additional_files || [];
      for (const filename of additionalFilenames) {
        const asset = filenameToAsset(filename);
        if (asset && !assets.find(a => a.filename === asset.filename)) {
          assets.push(asset);
        }
      }
      
      // Sort by category then by inches
      assets.sort((a, b) => {
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        return a.inches - b.inches;
      });
      
      cachedManifest = assets;
      return assets;
    } catch (error) {
      console.error('[assetManifest] Failed to load manifest:', error);
      cachedManifestPromise = null;
      throw error;
    }
  })();
  
  return cachedManifestPromise;
}

/**
 * Clear the cached manifest (useful for testing)
 */
export function clearManifestCache(): void {
  cachedManifest = null;
  cachedManifestPromise = null;
}

// =============================================================================
// ASSET SELECTION UTILITIES
// =============================================================================

/**
 * Get all assets for a specific category
 */
export function getAssetsByCategory(
  assets: DoorWindowAsset[],
  category: AssetCategory
): DoorWindowAsset[] {
  return assets.filter(a => a.category === category);
}

/**
 * Get all assets for a category group (door, window, garage)
 */
export function getAssetsByCategoryGroup(
  assets: DoorWindowAsset[],
  group: CategoryGroup
): DoorWindowAsset[] {
  return assets.filter(a => a.categoryGroup === group);
}

/**
 * Get available sizes for a category
 */
export function getAvailableSizes(
  assets: DoorWindowAsset[],
  category: AssetCategory
): number[] {
  const categoryAssets = getAssetsByCategory(assets, category);
  const sizes = Array.from(new Set(categoryAssets.map(a => a.inches)));
  return sizes.sort((a, b) => a - b);
}

/**
 * Get all unique categories from loaded assets
 */
export function getAvailableCategories(assets: DoorWindowAsset[]): AssetCategory[] {
  const categories = Array.from(new Set(assets.map(a => a.category)));
  return categories;
}

/**
 * Find the best matching asset for a given category and target width
 */
export function findBestAsset(
  assets: DoorWindowAsset[],
  category: AssetCategory,
  targetInches: number,
  preferHalfSwing: boolean = false
): DoorWindowAsset | null {
  const categoryAssets = getAssetsByCategory(assets, category);
  
  if (categoryAssets.length === 0) {
    return null;
  }
  
  // Filter by swing preference if applicable
  let candidates = categoryAssets;
  const meta = CATEGORY_METADATA[category];
  
  if (meta.hasSwing) {
    const swingFiltered = candidates.filter(a => a.isHalfSwing === preferHalfSwing);
    if (swingFiltered.length > 0) {
      candidates = swingFiltered;
    }
  }
  
  // Find exact match first
  const exactMatch = candidates.find(a => a.inches === targetInches);
  if (exactMatch) {
    return exactMatch;
  }
  
  // Find closest match
  let closest = candidates[0];
  let closestDiff = Math.abs(closest.inches - targetInches);
  
  for (const asset of candidates) {
    const diff = Math.abs(asset.inches - targetInches);
    if (diff < closestDiff) {
      closest = asset;
      closestDiff = diff;
    }
  }
  
  return closest;
}

/**
 * Get a specific asset by filename
 */
export function getAssetByFilename(
  assets: DoorWindowAsset[],
  filename: string
): DoorWindowAsset | null {
  return assets.find(a => a.filename === filename) || null;
}

/**
 * Get the URL for an asset SVG file
 */
export function getAssetUrl(filename: string): string {
  return `${getAssetBaseUrl()}/${filename}`;
}

/**
 * Fetch the SVG content for an asset
 */
export async function fetchAssetSvg(filename: string): Promise<string> {
  const url = getAssetUrl(filename);
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch asset SVG: ${filename}`);
  }
  
  return response.text();
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

/**
 * Format inches for display (e.g., "36"" or "8'")
 */
export function formatInches(inches: number): string {
  if (inches >= 96 && inches % 12 === 0) {
    // Show in feet for large dimensions
    return `${inches / 12}'`;
  }
  return `${inches}"`;
}

/**
 * Get category display info
 */
export function getCategoryInfo(category: AssetCategory): CategoryMetadata {
  return CATEGORY_METADATA[category];
}

/**
 * Get door categories (excluding windows and garage)
 */
export function getDoorCategories(): AssetCategory[] {
  return Object.keys(CATEGORY_METADATA).filter(
    k => CATEGORY_METADATA[k as AssetCategory].categoryGroup === 'door'
  ) as AssetCategory[];
}

/**
 * Get window categories
 */
export function getWindowCategories(): AssetCategory[] {
  return Object.keys(CATEGORY_METADATA).filter(
    k => CATEGORY_METADATA[k as AssetCategory].categoryGroup === 'window'
  ) as AssetCategory[];
}

/**
 * Get garage categories
 */
export function getGarageCategories(): AssetCategory[] {
  return Object.keys(CATEGORY_METADATA).filter(
    k => CATEGORY_METADATA[k as AssetCategory].categoryGroup === 'garage'
  ) as AssetCategory[];
}



