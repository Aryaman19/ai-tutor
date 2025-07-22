/**
 * Excalidraw element types for Phase 3 Timeline Layout Engine
 */

export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: any;
  seed: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: any;
  updated: number;
  link: string | null;
  locked: boolean;
  index: string; // Fractional index for ordering - CRITICAL for Excalidraw
  version?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  // For arrows and other line-based elements
  points?: number[][];
  lastCommittedPoint?: number[];
  startArrowhead?: string | null;
  endArrowhead?: string | null;
}

export interface ElementPosition {
  x: number;
  y: number;
}

export interface ElementDimensions {
  width: number;
  height: number;
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SemanticElementType = 
  | 'definition'
  | 'process'
  | 'comparison'
  | 'example'
  | 'list'
  | 'concept_map'
  | 'formula'
  | 'story'
  | 'narration';