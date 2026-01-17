import { Point } from './Point';

export const ShapeType = {
  CHAIN: 'chain',
  CONTOUR: 'contour'
} as const;

export type ShapeType = typeof ShapeType[keyof typeof ShapeType];

/**
 * Base interface for geometric shapes
 */
export interface Shape {
  id: string;
  type: ShapeType;
  points: Point[];
  name: string;
  visible: boolean;
  selected: boolean;
  color: string;
  layerId?: string;
}

/**
 * Represents a chain (open polyline)
 */
export class Chain implements Shape {
  id: string;
  type: ShapeType = ShapeType.CHAIN as ShapeType;
  name: string;
  visible: boolean = true;
  selected: boolean = false;
  color: string = '#1d9bf0';
  points: Point[];
  layerId?: string;

  constructor(points: Point[], name?: string, color?: string, layerId?: string) {
    this.points = points;
    this.id = `chain_${Date.now()}_${Math.random()}`;
    this.name = name || `Chain ${this.id.slice(-4)}`;
    if (color) this.color = color;
    if (layerId) this.layerId = layerId;
  }

  /**
   * Get the total length of the chain
   */
  getLength(): number {
    let length = 0;
    for (let i = 1; i < this.points.length; i++) {
      length += this.points[i].distanceTo(this.points[i - 1]);
    }
    return length;
  }

  clone(): Chain {
    const clonedPoints = this.points.map(p => p.clone());
    const chain = new Chain(clonedPoints, this.name, this.color, this.layerId);
    chain.visible = this.visible;
    chain.selected = this.selected;
    return chain;
  }
}

/**
 * Represents a contour (closed polygon)
 */
export class Contour implements Shape {
  id: string;
  type: ShapeType = ShapeType.CONTOUR as ShapeType;
  name: string;
  visible: boolean = true;
  selected: boolean = false;
  color: string = '#00ba7c';
  points: Point[];
  layerId?: string;

  constructor(points: Point[], name?: string, color?: string, layerId?: string) {
    this.points = points;
    this.id = `contour_${Date.now()}_${Math.random()}`;
    this.name = name || `Contour ${this.id.slice(-4)}`;
    if (color) this.color = color;
    if (layerId) this.layerId = layerId;

    // Ensure the contour is closed by checking if first and last points match
    if (this.points.length > 0) {
      const first = this.points[0];
      const last = this.points[this.points.length - 1];
      if (!first.equals(last)) {
        this.points.push(first.clone());
      }
    }
  }

  /**
   * Get the perimeter of the contour
   */
  getPerimeter(): number {
    let perimeter = 0;
    for (let i = 1; i < this.points.length; i++) {
      perimeter += this.points[i].distanceTo(this.points[i - 1]);
    }
    return perimeter;
  }

  /**
   * Calculate the area of the contour using the Shoelace formula
   */
  getArea(): number {
    let area = 0;
    const n = this.points.length - 1; // Exclude the duplicate closing point

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += this.points[i].x * this.points[j].y;
      area -= this.points[j].x * this.points[i].y;
    }

    return Math.abs(area) / 2;
  }

  clone(): Contour {
    const clonedPoints = this.points.map(p => p.clone());
    const contour = new Contour(clonedPoints, this.name, this.color, this.layerId);
    contour.visible = this.visible;
    contour.selected = this.selected;
    return contour;
  }
}
