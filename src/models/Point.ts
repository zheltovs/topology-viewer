/**
 * Represents a 2D point with double precision coordinates
 */
export class Point {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /**
   * Calculate distance to another point
   */
  distanceTo(other: Point): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Check if this point is close enough to another (for UI interactions)
   */
  isNear(other: Point, threshold: number = 5): boolean {
    return this.distanceTo(other) <= threshold;
  }

  /**
   * Create a copy of this point
   */
  clone(): Point {
    return new Point(this.x, this.y);
  }

  /**
   * Check equality with another point
   */
  equals(other: Point): boolean {
    return this.x === other.x && this.y === other.y;
  }
}
