/**
 * Color constants matching drafted.ai and the room color palette
 */

export const BRAND_COLORS = {
  primary: '#ed7628',
  primaryDark: '#de5c1e',
  primaryLight: '#f19350',
  background: '#ffffff',
  backgroundAlt: '#fafafa',
  text: '#171717',
  textMuted: '#737373',
  border: '#e5e5e5',
};

export const ROOM_COLORS: Record<string, string> = {
  living: '#A8D5E5',
  bedroom: '#E6E6FA',
  bathroom: '#98FB98',
  kitchen: '#FF7F50',
  circulation: '#F5F5F5',
  storage: '#DEB887',
  outdoor: '#90EE90',
  dining: '#FFE4B5',
  office: '#B0C4DE',
  garage: '#C0C0C0',
  unknown: '#D3D3D3',
};

export const CLUSTER_COLORS = [
  '#4361ee',  // Blue
  '#f72585',  // Pink
  '#4cc9f0',  // Cyan
  '#7209b7',  // Purple
  '#3a0ca3',  // Deep blue
  '#f77f00',  // Orange
  '#06d6a0',  // Teal
  '#ef476f',  // Red-pink
];

export const DIVERSITY_GRADIENT = {
  low: '#ef4444',     // Red
  medium: '#eab308',  // Yellow
  high: '#22c55e',    // Green
};

/**
 * Get color for a diversity score
 */
export function getDiversityColor(score: number): string {
  if (score >= 0.7) return DIVERSITY_GRADIENT.high;
  if (score >= 0.4) return DIVERSITY_GRADIENT.medium;
  return DIVERSITY_GRADIENT.low;
}

/**
 * Get color for a cluster
 */
export function getClusterColor(clusterId: number): string {
  return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
}

/**
 * Get color for a room type
 */
export function getRoomColor(roomType: string): string {
  return ROOM_COLORS[roomType.toLowerCase()] || ROOM_COLORS.unknown;
}

