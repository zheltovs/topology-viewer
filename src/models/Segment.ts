import { Point } from './Point';

/**
 * Represents a line segment between two points
 */
export class Segment {
  p1: Point;
  p2: Point;

  constructor(p1: Point, p2: Point) {
    this.p1 = p1;
    this.p2 = p2;
  }

  /**
   * Check if the segment is vertical (x1 === x2)
   */
  isVertical(): boolean {
    return Math.abs(this.p1.x - this.p2.x) < Number.EPSILON * 100;
  }

  /**
   * Check if the segment is horizontal (y1 === y2)
   */
  isHorizontal(): boolean {
    return Math.abs(this.p1.y - this.p2.y) < Number.EPSILON * 100;
  }

  /**
   * Get the length of the segment
   */
  length(): number {
    return this.p1.distanceTo(this.p2);
  }

  /**
   * Check if two segments are equal (same endpoints)
   */
  equals(other: Segment): boolean {
    return (this.p1.equals(other.p1) && this.p2.equals(other.p2)) ||
           (this.p1.equals(other.p2) && this.p2.equals(other.p1));
  }

  /**
   * Create a copy of this segment
   */
  clone(): Segment {
    return new Segment(this.p1.clone(), this.p2.clone());
  }

  /**
   * Get the direction vector of the segment
   */
  getDirection(): { dx: number; dy: number } {
    return {
      dx: this.p2.x - this.p1.x,
      dy: this.p2.y - this.p1.y
    };
  }

  /**
   * Get the minimum x-coordinate of the segment
   */
  minX(): number {
    return Math.min(this.p1.x, this.p2.x);
  }

  /**
   * Get the maximum x-coordinate of the segment
   */
  maxX(): number {
    return Math.max(this.p1.x, this.p2.x);
  }

  /**
   * Get the minimum y-coordinate of the segment
   */
  minY(): number {
    return Math.min(this.p1.y, this.p2.y);
  }

  /**
   * Get the maximum y-coordinate of the segment
   */
  maxY(): number {
    return Math.max(this.p1.y, this.p2.y);
  }

  /**
   * Check if a point lies on this segment (including endpoints)
   */
  containsPoint(point: Point, epsilon: number = 1e-9): boolean {
    // First check if point is collinear with the segment
    const cross = (point.x - this.p1.x) * (this.p2.y - this.p1.y) -
                  (point.y - this.p1.y) * (this.p2.x - this.p1.x);

    if (Math.abs(cross) > epsilon) {
      return false;
    }

    // Check if point is within the segment bounds
    const dot = (point.x - this.p1.x) * (this.p2.x - this.p1.x) +
                (point.y - this.p1.y) * (this.p2.y - this.p1.y);

    const squaredLength = (this.p2.x - this.p1.x) * (this.p2.x - this.p1.x) +
                          (this.p2.y - this.p1.y) * (this.p2.y - this.p1.y);

    if (squaredLength === 0) {
      // Segment is a point
      return point.equals(this.p1);
    }

    return dot >= -epsilon && dot <= squaredLength + epsilon;
  }

  /**
   * Check if this segment overlaps with another segment
   * Returns the overlapping segment if they overlap, null otherwise
   */
  getOverlap(other: Segment, epsilon: number = 1e-9): Segment | null {
    // Check if segments are collinear
    const cross = (this.p2.x - this.p1.x) * (other.p2.y - other.p1.y) -
                  (this.p2.y - this.p1.y) * (other.p2.x - other.p1.x);

    if (Math.abs(cross) > epsilon) {
      return null;
    }

    // Check collinearity with a point from other segment
    const cross2 = (other.p1.x - this.p1.x) * (this.p2.y - this.p1.y) -
                   (other.p1.y - this.p1.y) * (this.p2.x - this.p1.x);

    if (Math.abs(cross2) > epsilon) {
      return null;
    }

    // Find overlap interval
    const start1 = Math.min(this.p1.x, this.p2.x);
    const end1 = Math.max(this.p1.x, this.p2.x);
    const start2 = Math.min(other.p1.x, other.p2.x);
    const end2 = Math.max(other.p1.x, other.p2.x);

    const overlapStart = Math.max(start1, start2);
    const overlapEnd = Math.min(end1, end2);

    if (overlapStart > overlapEnd + epsilon) {
      return null;
    }

    // Special case: vertical segments (use y-coordinates)
    if (this.isVertical()) {
      const startY1 = Math.min(this.p1.y, this.p2.y);
      const endY1 = Math.max(this.p1.y, this.p2.y);
      const startY2 = Math.min(other.p1.y, other.p2.y);
      const endY2 = Math.max(other.p1.y, other.p2.y);

      const overlapYStart = Math.max(startY1, startY2);
      const overlapYEnd = Math.min(endY1, endY2);

      if (overlapYStart > overlapYEnd + epsilon) {
        return null;
      }

      return new Segment(
        new Point(this.p1.x, overlapYStart),
        new Point(this.p1.x, overlapYEnd)
      );
    }

    // Calculate y-coordinates for overlapping x-coordinates
    const slope = (this.p2.y - this.p1.y) / (this.p2.x - this.p1.x);
    const yOffset = this.p1.y - slope * this.p1.x;

    const y1 = slope * overlapStart + yOffset;
    const y2 = slope * overlapEnd + yOffset;

    return new Segment(
      new Point(overlapStart, y1),
      new Point(overlapEnd, y2)
    );
  }
}
