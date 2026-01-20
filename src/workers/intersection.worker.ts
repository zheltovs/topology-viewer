/**
 * Web Worker for intersection detection
 * This offloads the heavy computation from the main thread
 */

// Re-implement Point and Segment classes for the worker
class Point {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  isNear(other: Point, threshold: number = 5): boolean {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy) <= threshold;
  }

  equals(other: Point): boolean {
    return this.x === other.x && this.y === other.y;
  }
}

class Segment {
  p1: Point;
  p2: Point;

  constructor(p1: Point, p2: Point) {
    this.p1 = p1;
    this.p2 = p2;
  }

  length(): number {
    const dx = this.p1.x - this.p2.x;
    const dy = this.p1.y - this.p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  equals(other: Segment): boolean {
    return (this.p1.equals(other.p1) && this.p2.equals(other.p2)) ||
           (this.p1.equals(other.p2) && this.p2.equals(other.p1));
  }

  minX(): number {
    return Math.min(this.p1.x, this.p2.x);
  }

  maxX(): number {
    return Math.max(this.p1.x, this.p2.x);
  }

  minY(): number {
    return Math.min(this.p1.y, this.p2.y);
  }

  maxY(): number {
    return Math.max(this.p1.y, this.p2.y);
  }

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
    if (Math.abs(this.p1.x - this.p2.x) < Number.EPSILON * 100) {
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

// Types for worker messages
interface WorkerInput {
  shapes: Array<{
    id: string;
    points: Array<{ x: number; y: number }>;
    visible: boolean;
  }>;
}

interface IntersectionResult {
  type: 'point' | 'overlap';
  point?: { x: number; y: number };
  segment?: { p1: { x: number; y: number }; p2: { x: number; y: number } };
  shape1: string;
  shape2: string;
  segment1Index: number;
  segment2Index: number;
}

const EPSILON = 1e-9;

/**
 * Find intersection between two segments
 */
function findIntersection(seg1: Segment, seg2: Segment): Point | Segment | null {
  // First check for overlapping segments
  const overlap = seg1.getOverlap(seg2);
  if (overlap && overlap.length() > EPSILON) {
    return overlap;
  }

  // Use parametric form: P1 + t(P2-P1) = P3 + u(P4-P3)
  const dx1 = seg1.p2.x - seg1.p1.x;
  const dy1 = seg1.p2.y - seg1.p1.y;
  const dx2 = seg2.p2.x - seg2.p1.x;
  const dy2 = seg2.p2.y - seg2.p1.y;

  const denominator = dx1 * dy2 - dy1 * dx2;

  // Check if segments are parallel
  if (Math.abs(denominator) < EPSILON) {
    return null;
  }

  const dx3 = seg2.p1.x - seg1.p1.x;
  const dy3 = seg2.p1.y - seg1.p1.y;

  const t = (dx3 * dy2 - dy3 * dx2) / denominator;
  const u = (dx3 * dy1 - dy3 * dx1) / denominator;

  // Check if intersection point lies within both segments
  if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
    // Clamp to segment bounds
    const clampedT = Math.max(0, Math.min(1, t));

    const x = seg1.p1.x + clampedT * dx1;
    const y = seg1.p1.y + clampedT * dy1;

    return new Point(x, y);
  }

  return null;
}

/**
 * Create a hash key for a point intersection result
 * Uses rounded coordinates to handle floating point precision
 */
function createPointHashKey(x: number, y: number): string {
  const precision = 9;
  const roundX = Math.round(x * Math.pow(10, precision)) / Math.pow(10, precision);
  const roundY = Math.round(y * Math.pow(10, precision)) / Math.pow(10, precision);
  return `point_${roundX.toFixed(precision)}_${roundY.toFixed(precision)}`;
}

/**
 * Create a hash key for a segment overlap result
 * Considers both orders of points (p1,p2) and (p2,p1) as the same
 */
function createSegmentHashKey(p1: Point, p2: Point): string {
  const precision = 9;
  const roundX1 = Math.round(p1.x * Math.pow(10, precision)) / Math.pow(10, precision);
  const roundY1 = Math.round(p1.y * Math.pow(10, precision)) / Math.pow(10, precision);
  const roundX2 = Math.round(p2.x * Math.pow(10, precision)) / Math.pow(10, precision);
  const roundY2 = Math.round(p2.y * Math.pow(10, precision)) / Math.pow(10, precision);

  // Sort coordinates to ensure (p1,p2) and (p2,p1) produce the same key
  const minPoint = roundX1 < roundX2 || (roundX1 === roundX2 && roundY1 < roundY2)
    ? `${roundX1.toFixed(precision)}_${roundY1.toFixed(precision)}`
    : `${roundX2.toFixed(precision)}_${roundY2.toFixed(precision)}`;
  const maxPoint = roundX1 < roundX2 || (roundX1 === roundX2 && roundY1 < roundY2)
    ? `${roundX2.toFixed(precision)}_${roundY2.toFixed(precision)}`
    : `${roundX1.toFixed(precision)}_${roundY1.toFixed(precision)}`;

  return `segment_${minPoint}_${maxPoint}`;
}

/**
 * Deduplicate intersection results using hash-based approach
 * Much more efficient than O(n²) nested loop comparison
 */
function deduplicateResults(results: IntersectionResult[]): IntersectionResult[] {
  const uniqueResults: IntersectionResult[] = [];
  const seenHashes = new Set<string>();

  for (const result of results) {
    let hashKey: string;

    if (result.type === 'point' && result.point) {
      hashKey = createPointHashKey(result.point.x, result.point.y);
    } else if (result.type === 'overlap' && result.segment) {
      const p1 = new Point(result.segment.p1.x, result.segment.p1.y);
      const p2 = new Point(result.segment.p2.x, result.segment.p2.y);
      hashKey = createSegmentHashKey(p1, p2);
    } else {
      continue; // Skip invalid results
    }

    if (!seenHashes.has(hashKey)) {
      seenHashes.add(hashKey);
      uniqueResults.push(result);
    }
  }

  return uniqueResults;
}

/**
 * Check if bounding boxes of two segments intersect
 */
function boundingBoxesIntersect(seg1: Segment, seg2: Segment): boolean {
  return !(seg1.maxX() < seg2.minX() || seg2.maxX() < seg1.minX() ||
           seg1.maxY() < seg2.minY() || seg2.maxY() < seg1.minY());
}

/**
 * Find all intersections between shapes
 */
function findAllIntersectionsSimple(shapes: WorkerInput['shapes']): IntersectionResult[] {
  const results: IntersectionResult[] = [];
  const segments: Array<{ segment: Segment; index: number; shapeId: string }> = [];

  // Extract all segments from shapes
  shapes.forEach(shape => {
    if (!shape.visible || shape.points.length < 2) return;

    for (let i = 0; i < shape.points.length - 1; i++) {
      const point1 = new Point(shape.points[i].x, shape.points[i].y);
      const point2 = new Point(shape.points[i + 1].x, shape.points[i + 1].y);
      const segment = new Segment(point1, point2);
      segments.push({ segment, index: i, shapeId: shape.id });
    }
  });

  // Check all pairs
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const { segment: seg1, index: idx1, shapeId: id1 } = segments[i];
      const { segment: seg2, index: idx2, shapeId: id2 } = segments[j];

      // Skip if segments belong to the same shape
      if (id1 === id2) continue;

      // Bounding box pre-filter
      if (!boundingBoxesIntersect(seg1, seg2)) continue;

      const intersection = findIntersection(seg1, seg2);

      if (intersection instanceof Point) {
        results.push({
          type: 'point',
          point: { x: intersection.x, y: intersection.y },
          shape1: id1,
          shape2: id2,
          segment1Index: idx1,
          segment2Index: idx2
        });
      } else if (intersection instanceof Segment) {
        results.push({
          type: 'overlap',
          segment: {
            p1: { x: intersection.p1.x, y: intersection.p1.y },
            p2: { x: intersection.p2.x, y: intersection.p2.y }
          },
          shape1: id1,
          shape2: id2,
          segment1Index: idx1,
          segment2Index: idx2
        });
      }
    }
  }

  return deduplicateResults(results);
}

// Worker message handler
self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { shapes } = e.data;

  try {
    const results = findAllIntersectionsSimple(shapes);
    self.postMessage({ success: true, results });
  } catch (error) {
    self.postMessage({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
