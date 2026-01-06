/**
 * TypeScript types for the Floor Plan Diversity Analyzer
 */

export interface RoomInfo {
  type: string;
  area: number;
  centroid: { x: number; y: number };
  aspect_ratio: number;
}

export interface PlanFeatures {
  plan_id: string;
  room_count: number;
  rooms: RoomInfo[];
  feature_vector: number[];
  metadata: Record<string, any>;
}

export interface MetricBreakdown {
  name: string;
  display_name: string;
  score: number;
  weight: number;
  contribution: number;
}

export interface ScatterPoint {
  id: string;
  x: number;
  y: number;
  cluster: number;
  label: string;
  metadata: Record<string, any>;
}

export interface ClusterInfo {
  id: number;
  centroid_x: number;
  centroid_y: number;
  size: number;
  color: string;
}

export interface PlotBounds {
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
}

export interface VisualizationResult {
  points: ScatterPoint[];
  clusters: ClusterInfo[];
  bounds: PlotBounds;
}

export interface DiversityResult {
  score: number;
  metrics: MetricBreakdown[];
  interpretation: string;
}

export interface AnalysisResponse {
  success: boolean;
  plan_count: number;
  plans: PlanFeatures[];
  diversity: DiversityResult;
  visualization: VisualizationResult;
  processing_time_ms: number;
}

export interface UploadedPlan {
  id: string;
  filename: string;
  thumbnail?: string;  // Colored version (for analysis)
  stylized_thumbnail?: string;  // Stylized version (for display)
  display_name?: string;  // AI-generated or user-set name
}

export interface UploadResponse {
  success: boolean;
  uploaded_count: number;
  plan_ids: string[];
  message: string;
}

// UI State types
export type AnalysisState = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';
export type GenerationState = 'idle' | 'generating' | 'analyzing' | 'complete' | 'error';

export interface AppState {
  plans: UploadedPlan[];
  analysisState: AnalysisState;
  analysisResult: AnalysisResponse | null;
  error: string | null;
}

// Generation types
export interface GenerationRequest {
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  style: string;
  count: number;
  additional_rooms?: string[];
  skip_analysis?: boolean;
}

export interface GeneratedPlanInfo {
  plan_id: string;
  variation_type: string;
  display_name?: string;  // AI-generated descriptive name
  generation_time_ms: number;
  success: boolean;
  error?: string;
  thumbnail?: string;  // Base64-encoded colored thumbnail (for analysis)
  stylized_thumbnail?: string;  // Base64-encoded stylized thumbnail (for display)
}

export interface GenerationResponse {
  success: boolean;
  generated_count: number;
  failed_count: number;
  plan_ids: string[];
  plans_info: GeneratedPlanInfo[];
  analysis?: AnalysisResponse;
  total_generation_time_ms: number;
  message: string;
}

export interface StyleOption {
  id: string;
  name: string;
  description: string;
}

export interface GenerationOptions {
  styles: StyleOption[];
  additional_room_options: string[];
  variation_types: string[];
  limits: {
    bedrooms: { min: number; max: number };
    bathrooms: { min: number; max: number };
    sqft: { min: number; max: number };
    count: { min: number; max: number };
  };
}

// Edit and Rename types
export interface EditPlanRequest {
  instruction: string;
}

export interface EditPlanResponse {
  success: boolean;
  original_plan_id: string;
  new_plan_id: string;
  display_name?: string;
  thumbnail?: string;
  stylized_thumbnail?: string;
  message: string;
}

export interface RenamePlanResponse {
  success: boolean;
  plan_id: string;
  new_name: string;
}

