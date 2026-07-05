/**
 * Segment intersection / overlap search shared by the intersection worker
 * and the main-thread IntersectionDetector facade.
 *
 * Instead of testing every pair of segments (full O(n²) enumeration), the
 * search uses sweep-and-prune:
 *
 *  1. Segments are flattened into struct-of-arrays storage and sorted by the
 *     left edge (minX) of their bounding box.
 *  2. A sweep runs left to right. The "active" set — segments whose X range
 *     still overlaps the sweep position — is kept in horizontal buckets that
 *     slice the world along Y. Expired segments (maxX < sweep position) are
 *     evicted lazily while buckets are scanned.
 *  3. A new segment is tested only against active segments in the buckets its
 *     own Y range covers. A pair sharing several buckets is examined once, in
 *     the first shared bucket.
 *
 * A candidate pair therefore has overlapping bounding boxes on both axes —
 * exactly the pairs the old brute force accepted after its bbox pre-filter —
 * and is then run through the same exact intersection test, so results are
 * identical. Expected cost is O(n·log n + k) for layout-like data instead of
 * O(n²), where k is the number of bbox-overlapping pairs.
 */

export interface IntersectionInputShape {
  id: string;
  points: Array<{ x: number; y: number }>;
  visible: boolean;
}

export interface RawIntersectionResult {
  type: 'point' | 'overlap';
  point?: { x: number; y: number };
  segment?: { p1: { x: number; y: number }; p2: { x: number; y: number } };
  shape1: string;
  shape2: string;
  segment1Index: number;
  segment2Index: number;
}

export type SegmentHit =
  | { type: 'point'; x: number; y: number }
  | { type: 'overlap'; x1: number; y1: number; x2: number; y2: number };

const EPSILON = 1e-9;

/** Same tolerance Segment.isVertical() uses in the models */
const VERTICAL_EPSILON = Number.EPSILON * 100;

/** Cap on the number of Y buckets used by the sweep */
const MAX_BUCKETS = 4096;

/**
 * Overlap of two collinear segments a and b, or null when the segments are
 * not collinear or their projections do not overlap.
 */
function collinearOverlap(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number
): { x1: number; y1: number; x2: number; y2: number } | null {
  // Check if segments are collinear
  const cross = (ax2 - ax1) * (by2 - by1) - (ay2 - ay1) * (bx2 - bx1);
  if (Math.abs(cross) > EPSILON) {
    return null;
  }

  // Check collinearity with a point from segment b
  const cross2 = (bx1 - ax1) * (ay2 - ay1) - (by1 - ay1) * (ax2 - ax1);
  if (Math.abs(cross2) > EPSILON) {
    return null;
  }

  // Find overlap interval on the X axis
  const start1 = Math.min(ax1, ax2);
  const end1 = Math.max(ax1, ax2);
  const start2 = Math.min(bx1, bx2);
  const end2 = Math.max(bx1, bx2);

  const overlapStart = Math.max(start1, start2);
  const overlapEnd = Math.min(end1, end2);

  if (overlapStart > overlapEnd + EPSILON) {
    return null;
  }

  // Special case: vertical segments (use y-coordinates)
  if (Math.abs(ax1 - ax2) < VERTICAL_EPSILON) {
    const startY1 = Math.min(ay1, ay2);
    const endY1 = Math.max(ay1, ay2);
    const startY2 = Math.min(by1, by2);
    const endY2 = Math.max(by1, by2);

    const overlapYStart = Math.max(startY1, startY2);
    const overlapYEnd = Math.min(endY1, endY2);

    if (overlapYStart > overlapYEnd + EPSILON) {
      return null;
    }

    return { x1: ax1, y1: overlapYStart, x2: ax1, y2: overlapYEnd };
  }

  // Calculate y-coordinates for overlapping x-coordinates
  const slope = (ay2 - ay1) / (ax2 - ax1);
  const yOffset = ay1 - slope * ax1;

  return {
    x1: overlapStart,
    y1: slope * overlapStart + yOffset,
    x2: overlapEnd,
    y2: slope * overlapEnd + yOffset
  };
}

/**
 * Exact intersection test for two segments a and b.
 * Returns a collinear overlap segment, a crossing point, or null.
 */
export function intersectSegments(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number
): SegmentHit | null {
  // First check for overlapping segments
  const overlap = collinearOverlap(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2);
  if (overlap) {
    const odx = overlap.x1 - overlap.x2;
    const ody = overlap.y1 - overlap.y2;
    if (Math.sqrt(odx * odx + ody * ody) > EPSILON) {
      return { type: 'overlap', x1: overlap.x1, y1: overlap.y1, x2: overlap.x2, y2: overlap.y2 };
    }
  }

  // Use parametric form: P1 + t(P2-P1) = P3 + u(P4-P3)
  const dx1 = ax2 - ax1;
  const dy1 = ay2 - ay1;
  const dx2 = bx2 - bx1;
  const dy2 = by2 - by1;

  const denominator = dx1 * dy2 - dy1 * dx2;

  // Check if segments are parallel
  if (Math.abs(denominator) < EPSILON) {
    return null;
  }

  const dx3 = bx1 - ax1;
  const dy3 = by1 - ay1;

  const t = (dx3 * dy2 - dy3 * dx2) / denominator;
  const u = (dx3 * dy1 - dy3 * dx1) / denominator;

  // Check if intersection point lies within both segments
  if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
    // Clamp to segment bounds
    const clampedT = Math.max(0, Math.min(1, t));
    return { type: 'point', x: ax1 + clampedT * dx1, y: ay1 + clampedT * dy1 };
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
function createSegmentHashKey(x1: number, y1: number, x2: number, y2: number): string {
  const precision = 9;
  const roundX1 = Math.round(x1 * Math.pow(10, precision)) / Math.pow(10, precision);
  const roundY1 = Math.round(y1 * Math.pow(10, precision)) / Math.pow(10, precision);
  const roundX2 = Math.round(x2 * Math.pow(10, precision)) / Math.pow(10, precision);
  const roundY2 = Math.round(y2 * Math.pow(10, precision)) / Math.pow(10, precision);

  // Sort coordinates to ensure (p1,p2) and (p2,p1) produce the same key
  const firstIsMin = roundX1 < roundX2 || (roundX1 === roundX2 && roundY1 < roundY2);
  const minPoint = firstIsMin
    ? `${roundX1.toFixed(precision)}_${roundY1.toFixed(precision)}`
    : `${roundX2.toFixed(precision)}_${roundY2.toFixed(precision)}`;
  const maxPoint = firstIsMin
    ? `${roundX2.toFixed(precision)}_${roundY2.toFixed(precision)}`
    : `${roundX1.toFixed(precision)}_${roundY1.toFixed(precision)}`;

  return `segment_${minPoint}_${maxPoint}`;
}

/**
 * Deduplicate intersection results that share the same geometry
 * (several segment pairs can produce the same point or overlap)
 */
function deduplicateResults(results: RawIntersectionResult[]): RawIntersectionResult[] {
  const uniqueResults: RawIntersectionResult[] = [];
  const seenHashes = new Set<string>();

  for (const result of results) {
    let hashKey: string;

    if (result.type === 'point' && result.point) {
      hashKey = createPointHashKey(result.point.x, result.point.y);
    } else if (result.type === 'overlap' && result.segment) {
      hashKey = createSegmentHashKey(
        result.segment.p1.x, result.segment.p1.y,
        result.segment.p2.x, result.segment.p2.y
      );
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
 * Find all point intersections and collinear overlaps between segments of
 * different shapes, using an X sweep over Y-bucketed active segments.
 */
export function findAllIntersections(shapes: IntersectionInputShape[]): RawIntersectionResult[] {
  // --- 1. Flatten shape polylines into segments (struct-of-arrays) ---
  let segmentCount = 0;
  for (const shape of shapes) {
    if (!shape.visible || shape.points.length < 2) continue;
    segmentCount += shape.points.length - 1;
  }
  if (segmentCount === 0) return [];

  const segX1 = new Float64Array(segmentCount);
  const segY1 = new Float64Array(segmentCount);
  const segX2 = new Float64Array(segmentCount);
  const segY2 = new Float64Array(segmentCount);
  const segMinX = new Float64Array(segmentCount);
  const segMaxX = new Float64Array(segmentCount);
  const segMinY = new Float64Array(segmentCount);
  const segMaxY = new Float64Array(segmentCount);
  const segShape = new Int32Array(segmentCount); // index into shapes, for result attribution
  const segGroup = new Int32Array(segmentCount); // shape identity group, for same-shape skips
  const segPoint = new Int32Array(segmentCount); // segment index within its shape

  // Shapes sharing an id must be treated as one shape, like the id-based
  // comparison in the old implementation did
  const groupOfId = new Map<string, number>();

  let worldMinY = Infinity;
  let worldMaxY = -Infinity;
  let n = 0;

  for (let shapeIdx = 0; shapeIdx < shapes.length; shapeIdx++) {
    const shape = shapes[shapeIdx];
    if (!shape.visible || shape.points.length < 2) continue;

    let group = groupOfId.get(shape.id);
    if (group === undefined) {
      group = shapeIdx;
      groupOfId.set(shape.id, group);
    }

    const pts = shape.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const x1 = pts[i].x;
      const y1 = pts[i].y;
      const x2 = pts[i + 1].x;
      const y2 = pts[i + 1].y;

      segX1[n] = x1;
      segY1[n] = y1;
      segX2[n] = x2;
      segY2[n] = y2;
      segMinX[n] = Math.min(x1, x2);
      segMaxX[n] = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      segMinY[n] = minY;
      segMaxY[n] = maxY;
      segShape[n] = shapeIdx;
      segGroup[n] = group;
      segPoint[n] = i;

      if (minY < worldMinY) worldMinY = minY;
      if (maxY > worldMaxY) worldMaxY = maxY;
      n++;
    }
  }

  // --- 2. Slice the world along Y into buckets for the active set ---
  const worldHeight = worldMaxY - worldMinY;
  const bucketCount = worldHeight > 0
    ? Math.min(MAX_BUCKETS, Math.max(1, Math.ceil(Math.sqrt(n))))
    : 1;
  const bucketHeight = worldHeight > 0 ? worldHeight / bucketCount : 1;

  const segMinBucket = new Int32Array(n);
  const segMaxBucket = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let minBucket = Math.floor((segMinY[i] - worldMinY) / bucketHeight);
    let maxBucket = Math.floor((segMaxY[i] - worldMinY) / bucketHeight);
    if (minBucket < 0) minBucket = 0;
    else if (minBucket > bucketCount - 1) minBucket = bucketCount - 1;
    if (maxBucket < 0) maxBucket = 0;
    else if (maxBucket > bucketCount - 1) maxBucket = bucketCount - 1;
    segMinBucket[i] = minBucket;
    segMaxBucket[i] = maxBucket;
  }

  // --- 3. Sweep left to right over segments ordered by minX ---
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => segMinX[a] - segMinX[b]);

  const buckets: number[][] = new Array(bucketCount);
  for (let i = 0; i < bucketCount; i++) buckets[i] = [];

  const results: RawIntersectionResult[] = [];

  for (let oi = 0; oi < n; oi++) {
    const s = order[oi];
    const sweepX = segMinX[s];
    const sGroup = segGroup[s];
    const sMinBucket = segMinBucket[s];
    const sMaxBucket = segMaxBucket[s];
    const sMinY = segMinY[s];
    const sMaxY = segMaxY[s];

    for (let b = sMinBucket; b <= sMaxBucket; b++) {
      const bucket = buckets[b];
      const size = bucket.length;
      let write = 0;

      for (let read = 0; read < size; read++) {
        const c = bucket[read];

        // Lazy eviction: c ended left of the sweep position, so its bbox
        // cannot overlap the bbox of any current or future segment
        if (segMaxX[c] < sweepX) continue;
        bucket[write++] = c;

        // Skip segments of the same shape (old behavior)
        if (segGroup[c] === sGroup) continue;

        // A pair may share several buckets; examine it only in the first
        // shared one so every pair is tested exactly once
        const cMinBucket = segMinBucket[c];
        if (b !== (cMinBucket > sMinBucket ? cMinBucket : sMinBucket)) continue;

        // Exact bbox overlap check on Y (X overlap is already implied by
        // the sweep order plus eviction)
        if (segMinY[c] > sMaxY || sMinY > segMaxY[c]) continue;

        // Keep the original pair orientation (extraction order), so the
        // computed geometry is bit-identical to the brute-force version
        const first = s < c ? s : c;
        const second = s < c ? c : s;

        const hit = intersectSegments(
          segX1[first], segY1[first], segX2[first], segY2[first],
          segX1[second], segY1[second], segX2[second], segY2[second]
        );
        if (!hit) continue;

        if (hit.type === 'point') {
          results.push({
            type: 'point',
            point: { x: hit.x, y: hit.y },
            shape1: shapes[segShape[first]].id,
            shape2: shapes[segShape[second]].id,
            segment1Index: segPoint[first],
            segment2Index: segPoint[second]
          });
        } else {
          results.push({
            type: 'overlap',
            segment: {
              p1: { x: hit.x1, y: hit.y1 },
              p2: { x: hit.x2, y: hit.y2 }
            },
            shape1: shapes[segShape[first]].id,
            shape2: shapes[segShape[second]].id,
            segment1Index: segPoint[first],
            segment2Index: segPoint[second]
          });
        }
      }

      bucket.length = write;
      bucket.push(s);
    }
  }

  return deduplicateResults(results);
}
