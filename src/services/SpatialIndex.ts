/**
 * Spatial index for efficient shape lookup and viewport culling
 * Uses a simple grid-based approach for fast spatial queries
 */

import type { Shape } from '../models';
import { Point } from '../models';

/**
 * Bounding box representation
 */
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Calculate the bounding box for a shape
 */
export function calculateBoundingBox(points: Point[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Check if two bounding boxes intersect
 */
export function boxesIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/**
 * Calculate the area of a bounding box
 */
export function boxArea(box: BoundingBox): number {
  return (box.maxX - box.minX) * (box.maxY - box.minY);
}

/**
 * Get the diagonal length of a bounding box
 */
export function boxDiagonal(box: BoundingBox): number {
  const dx = box.maxX - box.minX;
  const dy = box.maxY - box.minY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Indexed shape with cached bounding box
 */
export interface IndexedShape {
  shape: Shape;
  bbox: BoundingBox;
  diagonal: number; // Cached diagonal for LOD calculations
}

/**
 * Grid cell in the spatial index
 */
interface GridCell {
  shapes: IndexedShape[];
}

/**
 * Spatial index using a grid-based approach
 * Efficient for uniformly distributed shapes
 */
export class SpatialIndex {
  private grid: Map<string, GridCell> = new Map();
  private cellSize: number;
  private indexedShapes: Map<string, IndexedShape> = new Map();
  private worldBounds: BoundingBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  constructor(cellSize: number = 1000) {
    this.cellSize = cellSize;
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.grid.clear();
    this.indexedShapes.clear();
    this.worldBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  /**
   * Build index from shapes array
   */
  buildIndex(shapes: Shape[]): void {
    this.clear();

    if (shapes.length === 0) return;

    // First pass: calculate bounding boxes and world bounds
    let worldMinX = Infinity;
    let worldMinY = Infinity;
    let worldMaxX = -Infinity;
    let worldMaxY = -Infinity;

    const indexedShapes: IndexedShape[] = [];

    for (const shape of shapes) {
      const bbox = calculateBoundingBox(shape.points);
      const diagonal = boxDiagonal(bbox);
      const indexed: IndexedShape = { shape, bbox, diagonal };

      indexedShapes.push(indexed);
      this.indexedShapes.set(shape.id, indexed);

      if (bbox.minX < worldMinX) worldMinX = bbox.minX;
      if (bbox.minY < worldMinY) worldMinY = bbox.minY;
      if (bbox.maxX > worldMaxX) worldMaxX = bbox.maxX;
      if (bbox.maxY > worldMaxY) worldMaxY = bbox.maxY;
    }

    this.worldBounds = { minX: worldMinX, minY: worldMinY, maxX: worldMaxX, maxY: worldMaxY };

    // Calculate optimal cell size based on world bounds and shape count
    const worldWidth = worldMaxX - worldMinX;
    const worldHeight = worldMaxY - worldMinY;
    const worldDiagonal = Math.sqrt(worldWidth * worldWidth + worldHeight * worldHeight);

    // Aim for roughly sqrt(n) cells per dimension for good balance
    const targetCellsPerDim = Math.max(10, Math.ceil(Math.sqrt(shapes.length) / 2));
    this.cellSize = Math.max(worldDiagonal / targetCellsPerDim, 1);

    // Second pass: insert shapes into grid cells
    for (const indexed of indexedShapes) {
      this.insertIntoGrid(indexed);
    }
  }

  /**
   * Insert an indexed shape into the grid
   */
  private insertIntoGrid(indexed: IndexedShape): void {
    const { bbox } = indexed;

    const minCellX = Math.floor(bbox.minX / this.cellSize);
    const maxCellX = Math.floor(bbox.maxX / this.cellSize);
    const minCellY = Math.floor(bbox.minY / this.cellSize);
    const maxCellY = Math.floor(bbox.maxY / this.cellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = `${cx},${cy}`;
        let cell = this.grid.get(key);
        if (!cell) {
          cell = { shapes: [] };
          this.grid.set(key, cell);
        }
        cell.shapes.push(indexed);
      }
    }
  }

  /**
   * Query shapes that intersect with the given viewport
   * @param viewport The viewport bounding box in world coordinates
   * @param minDiagonalPixels Minimum diagonal size in pixels for a shape to be rendered (LOD)
   * @param scale Current scale factor (pixels per world unit)
   */
  queryViewport(
    viewport: BoundingBox,
    minDiagonalPixels: number = 2,
    scale: number = 1
  ): Shape[] {
    const result: Shape[] = [];

    // Minimum world diagonal for shape to be visible
    const minWorldDiagonal = minDiagonalPixels / scale;

    const minCellX = Math.floor(viewport.minX / this.cellSize);
    const maxCellX = Math.floor(viewport.maxX / this.cellSize);
    const minCellY = Math.floor(viewport.minY / this.cellSize);
    const maxCellY = Math.floor(viewport.maxY / this.cellSize);

    // Calculate how many cells we would need to iterate
    const cellCountX = maxCellX - minCellX + 1;
    const cellCountY = maxCellY - minCellY + 1;
    const totalCells = cellCountX * cellCountY;

    // If viewport covers too many cells, fall back to iterating all shapes with LOD filter
    // This is more efficient than iterating millions of empty cells
    const MAX_CELLS_TO_ITERATE = 10000;

    if (totalCells > MAX_CELLS_TO_ITERATE || !isFinite(totalCells)) {
      // Fall back to direct iteration with LOD filtering only
      for (const indexed of this.indexedShapes.values()) {
        // LOD check: skip shapes that are too small to see
        if (indexed.diagonal < minWorldDiagonal) continue;

        // Viewport intersection check
        if (boxesIntersect(viewport, indexed.bbox)) {
          result.push(indexed.shape);
        }
      }
      return result;
    }

    // Normal grid-based query for reasonable viewport sizes
    const visited = new Set<string>();

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = `${cx},${cy}`;
        const cell = this.grid.get(key);
        if (!cell) continue;

        for (const indexed of cell.shapes) {
          // Skip if already visited
          if (visited.has(indexed.shape.id)) continue;
          visited.add(indexed.shape.id);

          // LOD check: skip shapes that are too small to see
          if (indexed.diagonal < minWorldDiagonal) continue;

          // Viewport intersection check
          if (boxesIntersect(viewport, indexed.bbox)) {
            result.push(indexed.shape);
          }
        }
      }
    }

    return result;
  }

  /**
   * Get all indexed shapes (for debugging or when no culling is needed)
   */
  getAllShapes(): Shape[] {
    return Array.from(this.indexedShapes.values()).map(indexed => indexed.shape);
  }

  /**
   * Get the bounding box for a shape
   */
  getShapeBoundingBox(shapeId: string): BoundingBox | undefined {
    return this.indexedShapes.get(shapeId)?.bbox;
  }

  /**
   * Get the world bounds
   */
  getWorldBounds(): BoundingBox {
    return this.worldBounds;
  }

  /**
   * Get statistics about the index
   */
  getStats(): { totalShapes: number; gridCells: number; avgShapesPerCell: number } {
    const totalShapes = this.indexedShapes.size;
    const gridCells = this.grid.size;

    let totalInCells = 0;
    for (const cell of this.grid.values()) {
      totalInCells += cell.shapes.length;
    }

    return {
      totalShapes,
      gridCells,
      avgShapesPerCell: gridCells > 0 ? totalInCells / gridCells : 0
    };
  }
}
