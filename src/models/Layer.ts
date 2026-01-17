/**
 * Represents a layer that groups shapes together
 */
export interface Layer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  gdsLayerNumber?: number; // Original GDS2 layer number if imported
}

// Preset colors for layers
export const LAYER_COLORS = [
  '#1d9bf0', // Blue
  '#00ba7c', // Green
  '#f4212e', // Red
  '#ffad1f', // Orange
  '#794bc4', // Purple
  '#f91880', // Pink
  '#00d4aa', // Teal
  '#ffd400', // Yellow
  '#7856ff', // Violet
  '#17bf63', // Emerald
  '#e0245e', // Magenta
  '#ff7a00', // Amber
];

/**
 * Creates a new layer with default settings
 */
export function createLayer(name?: string, color?: string, gdsLayerNumber?: number): Layer {
  const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: name || `Layer ${id.slice(-4)}`,
    color: color || LAYER_COLORS[0],
    visible: true,
    gdsLayerNumber
  };
}

/**
 * Default layer for shapes without a specific layer
 */
export const DEFAULT_LAYER_ID = '__default__';

export function createDefaultLayer(): Layer {
  return {
    id: DEFAULT_LAYER_ID,
    name: 'Default',
    color: LAYER_COLORS[0],
    visible: true
  };
}
