/**
 * Web Worker for computing intersections in background
 * This prevents UI blocking during expensive intersection calculations
 *
 * Note: This worker is self-contained and doesn't import from other modules
 * because Web Workers run in a separate context.
 */

const EPSILON = 1e-9;

// Inline IntersectionType constants
const IntersectionType = {
  POINT: 'point',
  OVERLAP: 'overlap'
} as const;

/**
 * Simple point interface for worker
 */
interface WorkerPoint {
  x: number;
  y: number;
}

/**
 * Simple segment interface for worker
 */
interface WorkerSegment {
  p1: WorkerPoint;
  p2: WorkerPoint;
}

/**
 * Get min/max bounds of a segment
 */
function segmentMinX(seg: WorkerSegment): number {
  return Math.min(seg.p1.x, seg.p2.x);
}

function segmentMaxX(seg: WorkerSegment): number {
  return Math.max(seg.p1.x, seg.p2.x);
}

function segmentMinY(seg: WorkerSegment): number {
  return Math.min(seg.p1.y, seg.p2.y);
}

function segmentMaxY(seg: WorkerSegment): number {
  return Math.max(seg.p1.y, seg.p2.y);
}

/**
 * Check if bounding boxes of two segments intersect
 */
function boundingBoxesIntersect(seg1: WorkerSegment, seg2: WorkerSegment): boolean {
  return !(segmentMaxX(seg1) < segmentMinX(seg2) || segmentMaxX(seg2) < segmentMinX(seg1) ||
           segmentMaxY(seg1) < segmentMinY(seg2) || segmentMaxY(seg2) < segmentMinY(seg1));
}

/**
 * Find intersection between two segments
 * Returns either a point or null
 */
function findIntersection(seg1: WorkerSegment, seg2: WorkerSegment): WorkerPoint | null {
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

    return { x, y };
  }

  return null;
}

/**
 * Serializable shape data for worker communication
 */
export interface SerializedShape {
  id: string;
  points: Array<{ x: number; y: number }>;
  visible: boolean;
  type: string;
  color: string;
}

/**
 * Serializable intersection result for worker communication
 */
export interface SerializedIntersectionResult {
  type: string;
  point?: { x: number; y: number };
  segment?: { p1: { x: number; y: number }; p2: { x: number; y: number } };
  shape1Id: string;
  shape2Id: string;
  segment1Index: number;
  segment2Index: number;
}

/**
 * Message types for worker communication
 */
export interface IntersectionWorkerMessage {
  type: 'start';
  shapes: SerializedShape[];
}

export interface IntersectionWorkerResponse {
  type: 'progress' | 'complete';
  progress?: number;
  results?: SerializedIntersectionResult[];
}

/**
 * Find all intersections with progress reporting
 */
function findAllIntersectionsWithProgress(shapes: SerializedShape[]): void {
  const results: SerializedIntersectionResult[] = [];
  const segments: Array<{ segment: WorkerSegment; index: number; shapeId: string }> = [];

  // Extract all segments from shapes
  shapes.forEach(shape => {
    if (!shape.visible || shape.points.length < 2) return;

    for (let i = 0; i < shape.points.length - 1; i++) {
      const p1: WorkerPoint = { x: shape.points[i].x, y: shape.points[i].y };
      const p2: WorkerPoint = { x: shape.points[i + 1].x, y: shape.points[i + 1].y };
      const segment: WorkerSegment = { p1, p2 };
      segments.push({ segment, index: i, shapeId: shape.id });
    }
  });

  const totalPairs = (segments.length * (segments.length - 1)) / 2;
  let processedPairs = 0;
  let lastReportedProgress = 0;

  // Report initial progress
  self.postMessage({
    type: 'progress',
    progress: 0
  } as IntersectionWorkerResponse);

  // Check all pairs
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const { segment: seg1, index: idx1, shapeId: shapeId1 } = segments[i];
      const { segment: seg2, index: idx2, shapeId: shapeId2 } = segments[j];

      processedPairs++;

      // Report progress every 2%, cap at 99% until complete
      const rawProgress = (processedPairs / totalPairs) * 100;
      const currentProgress = Math.min(99, Math.floor(rawProgress));
      if (currentProgress >= lastReportedProgress + 2) {
        lastReportedProgress = currentProgress;
        self.postMessage({
          type: 'progress',
          progress: currentProgress
        } as IntersectionWorkerResponse);
      }

      // Skip if segments belong to the same shape
      if (shapeId1 === shapeId2) continue;

      // Bounding box pre-filter
      if (!boundingBoxesIntersect(seg1, seg2)) continue;

      const intersection = findIntersection(seg1, seg2);

      if (intersection) {
        results.push({
          type: IntersectionType.POINT,
          point: { x: intersection.x, y: intersection.y },
          shape1Id: shapeId1,
          shape2Id: shapeId2,
          segment1Index: idx1,
          segment2Index: idx2
        });
      }
    }
  }

  // Deduplicate and return results
  const uniqueResults = deduplicateSerializedResults(results);

  self.postMessage({
    type: 'complete',
    results: uniqueResults
  } as IntersectionWorkerResponse);
}

/**
 * Deduplicate serialized intersection results
 */
function deduplicateSerializedResults(results: SerializedIntersectionResult[]): SerializedIntersectionResult[] {
  const uniqueResults: SerializedIntersectionResult[] = [];

  for (const result of results) {
    let isDuplicate = false;

    for (const existing of uniqueResults) {
      if (result.type === existing.type) {
        if (result.type === IntersectionType.POINT && result.point && existing.point) {
          const dx = result.point.x - existing.point.x;
          const dy = result.point.y - existing.point.y;
          if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
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

// Listen for messages from main thread
self.onmessage = (event: MessageEvent<IntersectionWorkerMessage>) => {
  const { type, shapes } = event.data;

  if (type === 'start') {
    findAllIntersectionsWithProgress(shapes);
  }
};
