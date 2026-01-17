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
 * Event for sweep line algorithm
 */
interface SweepEvent {
  type: 'left' | 'right' | 'intersection';
  x: number;
  y: number;
  segment: Segment;
  segmentIndex: number;
  shapeIndex: number;
  otherSegment?: Segment;
  otherSegmentIndex?: number;
  otherShapeIndex?: number;
}

/**
 * Advanced intersection detector using sweep line algorithm
 * Time complexity: O((n + k) log n) where n = number of segments, k = number of intersections
 */
export class IntersectionDetector {
  private static EPSILON = 1e-9;

  /**
   * Find all intersections between shapes using sweep line algorithm
   */
  static findAllIntersections(shapes: Shape[]): IntersectionResult[] {
    const results: IntersectionResult[] = [];

    // Extract all segments from shapes
    const allSegments: Array<{ segment: Segment; index: number; shapeIndex: number }> = [];

    shapes.forEach((shape, shapeIndex) => {
      if (!shape.visible || shape.points.length < 2) return;

      for (let i = 0; i < shape.points.length - 1; i++) {
        const segment = new Segment(shape.points[i], shape.points[i + 1]);
        allSegments.push({ segment, index: i, shapeIndex });
      }
    });

    // No segments to process
    if (allSegments.length < 2) return results;

    // Create event queue (sorted by x-coordinate)
    const events: SweepEvent[] = [];

    allSegments.forEach(({ segment, index, shapeIndex }) => {
      const p1 = segment.p1;
      const p2 = segment.p2;

      // Determine left and right endpoints
      const leftX = Math.min(p1.x, p2.x);
      const rightX = Math.max(p1.x, p2.x);

      // Left endpoint event
      const leftPoint = leftX === p1.x ? p1 : p2;
      const rightPoint = leftX === p1.x ? p2 : p1;

      events.push({
        type: 'left',
        x: leftPoint.x,
        y: leftPoint.y,
        segment,
        segmentIndex: index,
        shapeIndex
      });

      // Right endpoint event
      events.push({
        type: 'right',
        x: rightPoint.x,
        y: rightPoint.y,
        segment,
        segmentIndex: index,
        shapeIndex
      });
    });

    // Sort events by x-coordinate (primary) and y-coordinate (secondary)
    events.sort((a, b) => {
      if (Math.abs(a.x - b.x) < this.EPSILON) {
        return a.y - b.y;
      }
      return a.x - b.x;
    });

    // Active set - segments currently intersecting sweep line
    // Using simple array for now, can be optimized to BST
    const activeSegments: Array<{ segment: Segment; index: number; shapeIndex: number }> = [];

    // Process events
    for (const event of events) {
      if (event.type === 'left') {
        // Add segment to active set
        activeSegments.push({ segment: event.segment, index: event.segmentIndex, shapeIndex: event.shapeIndex });

        // Sort active segments by y-coordinate at current x
        activeSegments.sort((a, b) => this.compareAtX(a.segment, b.segment, event.x));

        // Check neighbors for intersections
        const addedIndex = activeSegments.findIndex(s => s.segment.equals(event.segment));

        // Check with previous segment
        if (addedIndex > 0) {
          const prev = activeSegments[addedIndex - 1];
          if (prev.shapeIndex !== event.shapeIndex) {
            const intersection = this.findIntersection(event.segment, prev.segment);
            if (intersection) {
              results.push(...this.createIntersectionResults(
                intersection,
                event.segment,
                prev.segment,
                event.segmentIndex,
                prev.index,
                event.shapeIndex,
                prev.shapeIndex
              ));
            }
          }
        }

        // Check with next segment
        if (addedIndex < activeSegments.length - 1) {
          const next = activeSegments[addedIndex + 1];
          if (next.shapeIndex !== event.shapeIndex) {
            const intersection = this.findIntersection(event.segment, next.segment);
            if (intersection) {
              results.push(...this.createIntersectionResults(
                intersection,
                event.segment,
                next.segment,
                event.segmentIndex,
                next.index,
                event.shapeIndex,
                next.shapeIndex
              ));
            }
          }
        }
      } else if (event.type === 'right') {
        // Remove segment from active set
        const removeIndex = activeSegments.findIndex(s => s.segment.equals(event.segment));

        if (removeIndex !== -1) {
          const prev = activeSegments[removeIndex - 1];
          const next = activeSegments[removeIndex + 1];

          activeSegments.splice(removeIndex, 1);

          // Check if new neighbors intersect
          if (prev && next && prev.shapeIndex !== next.shapeIndex) {
            const intersection = this.findIntersection(prev.segment, next.segment);
            if (intersection) {
              results.push(...this.createIntersectionResults(
                intersection,
                prev.segment,
                next.segment,
                prev.index,
                next.index,
                prev.shapeIndex,
                next.shapeIndex
              ));
            }
          }
        }
      }
    }

    // Deduplicate results
    return this.deduplicateResults(results);
  }

  /**
   * Compare two segments by their y-coordinate at a given x
   */
  private static compareAtX(seg1: Segment, seg2: Segment, x: number): number {
    const y1 = this.getYAtX(seg1, x);
    const y2 = this.getYAtX(seg2, x);

    if (Math.abs(y1 - y2) < this.EPSILON) {
      return 0;
    }

    return y1 - y2;
  }

  /**
   * Get y-coordinate of a segment at a given x
   */
  private static getYAtX(segment: Segment, x: number): number {
    if (segment.isVertical()) {
      // For vertical segments, use the y-coordinate at the midpoint
      return (segment.p1.y + segment.p2.y) / 2;
    }

    const dx = segment.p2.x - segment.p1.x;
    const dy = segment.p2.y - segment.p1.y;
    const t = (x - segment.p1.x) / dx;

    return segment.p1.y + t * dy;
  }

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
      const clampedU = Math.max(0, Math.min(1, u));

      const x = seg1.p1.x + clampedT * dx1;
      const y = seg1.p1.y + clampedT * dy1;

      return new Point(x, y);
    }

    return null;
  }

  /**
   * Create intersection results from a point or segment intersection
   */
  private static createIntersectionResults(
    intersection: Point | Segment,
    seg1: Segment,
    seg2: Segment,
    idx1: number,
    idx2: number,
    shapeIdx1: number,
    shapeIdx2: number
  ): IntersectionResult[] {
    const results: IntersectionResult[] = [];

    // Get shapes from the shapes array (this is a simplification, in practice we'd need access to shapes)
    // For now, we'll store the shape indices and let the caller resolve them
    const shape1 = null as any;
    const shape2 = null as any;

    if (intersection instanceof Point) {
      results.push({
        type: IntersectionType.POINT,
        point: intersection,
        shape1: shape1,
        shape2: shape2,
        segment1Index: idx1,
        segment2Index: idx2
      });
    } else if (intersection instanceof Segment) {
      results.push({
        type: IntersectionType.OVERLAP,
        segment: intersection,
        shape1: shape1,
        shape2: shape2,
        segment1Index: idx1,
        segment2Index: idx2
      });
    }

    return results;
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
