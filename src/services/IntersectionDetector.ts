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
 * Worker input for parallel processing
 */
interface ParallelWorkerInput {
  segments: Array<{
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    shapeId: string;
    segmentIndex: number;
  }>;
  startIndex: number;
  endIndex: number;
  totalSegments: number;
}

/**
 * Worker result interface
 */
interface WorkerResult {
  success: boolean;
  results?: Array<{
    type: 'point' | 'overlap';
    point?: { x: number; y: number };
    segment?: { p1: { x: number; y: number }; p2: { x: number; y: number } };
    shape1: string;
    shape2: string;
    segment1Index: number;
    segment2Index: number;
  }>;
  workerIndex?: number;
  error?: string;
}

/**
 * Intermediate result type from worker (before shape reference filling)
 */
interface WorkerIntersectionResult {
  type: 'point' | 'overlap';
  point?: { x: number; y: number };
  segment?: { p1: { x: number; y: number }; p2: { x: number; y: number } };
  shape1: string;
  shape2: string;
  segment1Index: number;
  segment2Index: number;
}

/**
 * Intersection detector for finding intersections between shapes
 * Uses multiple web workers in parallel for efficient multi-core processing
 */
export class IntersectionDetector {
  private static EPSILON = 1e-9;
  private static workers: Map<number, Worker> = new Map();
  private static numWorkers: number = navigator.hardwareConcurrency || 4;
  private static pendingRequest: {
    resolve: (results: WorkerIntersectionResult[]) => void;
    reject: (error: Error) => void;
    completedWorkers: number;
    allResults: WorkerIntersectionResult[];
    numWorkers: number;
  } | null = null;

  /**
   * Initialize or get a worker by index
   */
  private static getWorker(index: number): Worker {
    if (!this.workers.has(index)) {
      const worker = new Worker(
        new URL('../workers/intersection.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (e: MessageEvent<WorkerResult>) => {
        if (this.pendingRequest) {
          const request = this.pendingRequest;

          if (e.data.success && e.data.results) {
            // Add results from this worker
            request.allResults.push(...e.data.results);
          } else {
            request.reject(new Error(e.data.error || `Unknown error in worker ${index}`));
            return;
          }

          request.completedWorkers++;

          // Check if all workers have completed
          if (request.completedWorkers >= request.numWorkers) {
            const { resolve } = this.pendingRequest;
            this.pendingRequest = null;
            resolve(request.allResults);
          }
        }
      };

      worker.onerror = (error) => {
        if (this.pendingRequest) {
          const { reject } = this.pendingRequest;
          this.pendingRequest = null;
          reject(new Error(`Worker ${index} error: ${error.message}`));
        }
      };

      this.workers.set(index, worker);
    }

    return this.workers.get(index)!;
  }

  /**
   * Terminate all workers when no longer needed
   */
  static terminateWorkers(): void {
    this.workers.forEach((worker) => worker.terminate());
    this.workers.clear();
    this.pendingRequest = null;
  }

  /**
   * Find intersections using parallel processing with multiple workers
   * Divides the work into chunks based on segment pairs to efficiently use all CPU cores
   * Minimizes data copying by sending the same segment data to all workers
   * and partitioning the work by index ranges
   */
  static async findAllIntersectionsSimple(shapes: Shape[]): Promise<IntersectionResult[]> {
    // Extract all segments from shapes (this data will be sent to all workers)
    const segments: Array<{
      p1: { x: number; y: number };
      p2: { x: number; y: number };
      shapeId: string;
      segmentIndex: number;
    }> = [];

    shapes.forEach(shape => {
      if (!shape.visible || shape.points.length < 2) return;

      for (let i = 0; i < shape.points.length - 1; i++) {
        segments.push({
          p1: { x: shape.points[i].x, y: shape.points[i].y },
          p2: { x: shape.points[i + 1].x, y: shape.points[i + 1].y },
          shapeId: shape.id,
          segmentIndex: i
        });
      }
    });

    const totalSegments = segments.length;

    // If there are too few segments, use single worker to avoid overhead
    if (totalSegments < 100) {
      return this.processWithSingleWorker(shapes, segments);
    }

    // Calculate chunk size for each worker
    // We partition the segment pairs (i, j) where i < j
    // Each worker gets a range of 'i' values to process
    const numWorkers = this.numWorkers;
    // Calculate how many segment indices each worker should process as the first index (i)
    const avgSegmentsPerWorker = Math.ceil(totalSegments / numWorkers);

    return new Promise((resolve, reject) => {
      // If there's a pending request, reject it
      if (this.pendingRequest) {
        this.pendingRequest.reject(new Error('Previous intersection detection request was cancelled'));
      }

      this.pendingRequest = {
        resolve: (results: WorkerIntersectionResult[]) => {
          // Deduplicate results from multiple workers
          const deduplicatedResults = this.deduplicateResults(results);

          // Fill in shape references and convert to proper types
          const shapeMap = new Map(shapes.map(s => [s.id, s]));
          const finalResults: IntersectionResult[] = deduplicatedResults.map((r) => ({
            type: r.type === 'point' ? IntersectionType.POINT : IntersectionType.OVERLAP,
            point: r.point ? new Point(r.point.x, r.point.y) : undefined,
            segment: r.segment ? new Segment(
              new Point(r.segment.p1.x, r.segment.p1.y),
              new Point(r.segment.p2.x, r.segment.p2.y)
            ) : undefined,
            shape1: shapeMap.get(r.shape1)!,
            shape2: shapeMap.get(r.shape2)!,
            segment1Index: r.segment1Index,
            segment2Index: r.segment2Index
          })).filter((r) => r.shape1 && r.shape2);

          resolve(finalResults);
        },
        reject,
        completedWorkers: 0,
        allResults: [],
        numWorkers
      };

      // Distribute work to workers by partitioning segment indices
      // Each worker processes a contiguous range of segment indices as the 'i' index
      for (let workerIndex = 0; workerIndex < numWorkers; workerIndex++) {
        const startIndex = workerIndex * avgSegmentsPerWorker;
        const endIndex = Math.min((workerIndex + 1) * avgSegmentsPerWorker, totalSegments);

        // Skip if this worker has no segments to process
        if (startIndex >= endIndex) {
          this.pendingRequest.completedWorkers++;
          continue;
        }

        const worker = this.getWorker(workerIndex);
        worker.postMessage({
          segments,
          startIndex,
          endIndex,
          totalSegments
        } as ParallelWorkerInput);
      }

      // Handle edge case where all workers were skipped
      if (this.pendingRequest.completedWorkers >= numWorkers) {
        const { resolve } = this.pendingRequest;
        this.pendingRequest = null;
        resolve([]);
      }
    });
  }

  /**
   * Process with a single worker for small datasets (to avoid worker overhead)
   */
  private static async processWithSingleWorker(
    shapes: Shape[],
    segments: Array<{
      p1: { x: number; y: number };
      p2: { x: number; y: number };
      shapeId: string;
      segmentIndex: number;
    }>
  ): Promise<IntersectionResult[]> {
    return new Promise((resolve, reject) => {
      this.pendingRequest = {
        resolve: (results: WorkerIntersectionResult[]) => {
          // Deduplicate results from single worker
          const deduplicatedResults = this.deduplicateResults(results);

          const shapeMap = new Map(shapes.map(s => [s.id, s]));
          const finalResults: IntersectionResult[] = deduplicatedResults.map((r) => ({
            type: r.type === 'point' ? IntersectionType.POINT : IntersectionType.OVERLAP,
            point: r.point ? new Point(r.point.x, r.point.y) : undefined,
            segment: r.segment ? new Segment(
              new Point(r.segment.p1.x, r.segment.p1.y),
              new Point(r.segment.p2.x, r.segment.p2.y)
            ) : undefined,
            shape1: shapeMap.get(r.shape1)!,
            shape2: shapeMap.get(r.shape2)!,
            segment1Index: r.segment1Index,
            segment2Index: r.segment2Index
          })).filter((r) => r.shape1 && r.shape2);

          resolve(finalResults);
        },
        reject,
        completedWorkers: 0,
        allResults: [],
        numWorkers: 1
      };

      const worker = this.getWorker(0);
      worker.postMessage({
        segments,
        startIndex: 0,
        endIndex: segments.length,
        totalSegments: segments.length
      } as ParallelWorkerInput);
    });
  }

  /**
   * Deduplicate intersection results using hash-based approach
   * Much more efficient than O(n²) nested loop comparison
   */
  private static deduplicateResults(results: WorkerIntersectionResult[]): WorkerIntersectionResult[] {
    const uniqueResults: WorkerIntersectionResult[] = [];
    const seenHashes = new Set<string>();

    for (const result of results) {
      let hashKey: string;

      if (result.type === 'point' && result.point) {
        hashKey = this.createPointHashKey(result.point.x, result.point.y);
      } else if (result.type === 'overlap' && result.segment) {
        hashKey = this.createSegmentHashKey(result.segment);
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
   * Create a hash key for a point intersection result
   * Uses rounded coordinates to handle floating point precision
   */
  private static createPointHashKey(x: number, y: number): string {
    const precision = 9;
    const roundX = Math.round(x * Math.pow(10, precision)) / Math.pow(10, precision);
    const roundY = Math.round(y * Math.pow(10, precision)) / Math.pow(10, precision);
    return `point_${roundX.toFixed(precision)}_${roundY.toFixed(precision)}`;
  }

  /**
   * Create a hash key for a segment overlap result
   * Considers both orders of points (p1,p2) and (p2,p1) as the same
   */
  private static createSegmentHashKey(segment: { p1: { x: number; y: number }; p2: { x: number; y: number } }): string {
    const precision = 9;
    const roundX1 = Math.round(segment.p1.x * Math.pow(10, precision)) / Math.pow(10, precision);
    const roundY1 = Math.round(segment.p1.y * Math.pow(10, precision)) / Math.pow(10, precision);
    const roundX2 = Math.round(segment.p2.x * Math.pow(10, precision)) / Math.pow(10, precision);
    const roundY2 = Math.round(segment.p2.y * Math.pow(10, precision)) / Math.pow(10, precision);

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
   * Find intersection between two segments (kept for backward compatibility)
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
}
