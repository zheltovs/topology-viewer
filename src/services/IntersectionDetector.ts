import { Point, Segment } from '../models';
import type { Shape } from '../models';

/**
 * Types of intersections that can be detected
 */
export const IntersectionType = {
  POINT: 'point',
  OVERLAP: 'overlap'
} as const;

export type IntersectionType = typeof IntersectionType[keyof typeof IntersectionType];

/**
 * Result of an intersection detection
 */
export interface IntersectionResult {
  type: IntersectionType;
  point?: Point;
  segment?: Segment;
  shape1: Shape;
  shape2: Shape;
  segment1Index: number;
  segment2Index: number;
}

/**
 * Intersection detector for finding intersections between shapes
 */
export class IntersectionDetector {
  private static EPSILON = 1e-9;

  /**
   * Find intersection between two segments
   * Returns either a point (IntersectionType.POINT) or a segment (IntersectionType.OVERLAP)
   */
  static findIntersection(seg1: Segment, seg2: Segment): Point | Segment | null {
    // First check for overlapping segments
    const overlap = seg1.getOverlap(seg2);
    if (overlap && overlap.length() > this.EPSILON) {
      return overlap;
    }

    // Use parametric form: P1 + t(P2-P1) = P3 + u(P4-P3)
    const dx1 = seg1.p2.x - seg1.p1.x;
    const dy1 = seg1.p2.y - seg1.p1.y;
    const dx2 = seg2.p2.x - seg2.p1.x;
    const dy2 = seg2.p2.y - seg2.p1.y;

    const denominator = dx1 * dy2 - dy1 * dx2;

    // Check if segments are parallel
    if (Math.abs(denominator) < this.EPSILON) {
      return null;
    }

    const dx3 = seg2.p1.x - seg1.p1.x;
    const dy3 = seg2.p1.y - seg1.p1.y;

    const t = (dx3 * dy2 - dy3 * dx2) / denominator;
    const u = (dx3 * dy1 - dy3 * dx1) / denominator;

    // Check if intersection point lies within both segments
    if (t >= -this.EPSILON && t <= 1 + this.EPSILON && u >= -this.EPSILON && u <= 1 + this.EPSILON) {
      // Clamp to segment bounds
      const clampedT = Math.max(0, Math.min(1, t));

      const x = seg1.p1.x + clampedT * dx1;
      const y = seg1.p1.y + clampedT * dy1;

      return new Point(x, y);
    }

    return null;
  }

  /**
   * Deduplicate intersection results
   */
  private static deduplicateResults(results: IntersectionResult[]): IntersectionResult[] {
    const uniqueResults: IntersectionResult[] = [];

    for (const result of results) {
      let isDuplicate = false;

      for (const existing of uniqueResults) {
        // Check if results are essentially the same
        if (result.type === existing.type) {
          if (result.type === IntersectionType.POINT && result.point && existing.point) {
            if (result.point.isNear(existing.point, this.EPSILON)) {
              isDuplicate = true;
              break;
            }
          } else if (result.type === IntersectionType.OVERLAP && result.segment && existing.segment) {
            if (result.segment.equals(existing.segment)) {
              isDuplicate = true;
              break;
            }
          }
        }
      }

      if (!isDuplicate) {
        uniqueResults.push(result);
      }
    }

    return uniqueResults;
  }

  /**
   * Alternative method: Find intersections with bounding box pre-filtering
   * This is a simpler O(n²) approach with early rejection
   */
  static findAllIntersectionsSimple(shapes: Shape[]): IntersectionResult[] {
    const results: IntersectionResult[] = [];
    const segments: Array<{ segment: Segment; index: number; shape: Shape }> = [];

    // Extract all segments from shapes
    shapes.forEach(shape => {
      if (!shape.visible || shape.points.length < 2) return;

      for (let i = 0; i < shape.points.length - 1; i++) {
        const segment = new Segment(shape.points[i], shape.points[i + 1]);
        segments.push({ segment, index: i, shape });
      }
    });

    // Check all pairs
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const { segment: seg1, index: idx1, shape: shape1 } = segments[i];
        const { segment: seg2, index: idx2, shape: shape2 } = segments[j];

        // Skip if segments belong to the same shape
        if (shape1.id === shape2.id) continue;

        // Bounding box pre-filter
        if (!this.boundingBoxesIntersect(seg1, seg2)) continue;

        const intersection = this.findIntersection(seg1, seg2);

        if (intersection instanceof Point) {
          results.push({
            type: IntersectionType.POINT,
            point: intersection,
            shape1,
            shape2,
            segment1Index: idx1,
            segment2Index: idx2
          });
        } else if (intersection instanceof Segment) {
          results.push({
            type: IntersectionType.OVERLAP,
            segment: intersection,
            shape1,
            shape2,
            segment1Index: idx1,
            segment2Index: idx2
          });
        }
      }
    }

    return this.deduplicateResults(results);
  }

  /**
   * Check if bounding boxes of two segments intersect
   */
  private static boundingBoxesIntersect(seg1: Segment, seg2: Segment): boolean {
    return !(seg1.maxX() < seg2.minX() || seg2.maxX() < seg1.minX() ||
             seg1.maxY() < seg2.minY() || seg2.maxY() < seg1.minY());
  }
}
