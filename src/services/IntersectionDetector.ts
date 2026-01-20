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
 * Uses a web worker to avoid blocking the main thread
 */
export class IntersectionDetector {
  private static EPSILON = 1e-9;
  private static worker: Worker | null = null;
  private static pendingRequest: { resolve: (results: WorkerIntersectionResult[]) => void; reject: (error: Error) => void } | null = null;

  /**
   * Initialize the web worker
   */
  private static getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../workers/intersection.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent<WorkerResult>) => {
        if (this.pendingRequest) {
          const { resolve, reject } = this.pendingRequest;
          this.pendingRequest = null;

          if (e.data.success && e.data.results) {
            // Convert worker results to IntersectionResult format
            const results: WorkerIntersectionResult[] = e.data.results.map(r => ({
              type: r.type,
              point: r.point,
              segment: r.segment,
              shape1: r.shape1,
              shape2: r.shape2,
              segment1Index: r.segment1Index,
              segment2Index: r.segment2Index
            }));

            resolve(results);
          } else {
            reject(new Error(e.data.error || 'Unknown error in worker'));
          }
        }
      };

      this.worker.onerror = (error) => {
        if (this.pendingRequest) {
          const { reject } = this.pendingRequest;
          this.pendingRequest = null;
          reject(new Error(`Worker error: ${error.message}`));
        }
      };
    }

    return this.worker;
  }

  /**
   * Terminate the worker when no longer needed
   */
  static terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.pendingRequest = null;
    }
  }

  /**
   * Alternative method: Find intersections with bounding box pre-filtering
   * This is a simpler O(n²) approach with early rejection
   * Now runs in a web worker to avoid blocking the main thread
   */
  static async findAllIntersectionsSimple(shapes: Shape[]): Promise<IntersectionResult[]> {
    // Convert shapes to worker format
    const workerShapes = shapes.map(shape => ({
      id: shape.id,
      points: shape.points.map(p => ({ x: p.x, y: p.y })),
      visible: shape.visible
    }));

    return new Promise((resolve, reject) => {
      // If there's a pending request, reject it
      if (this.pendingRequest) {
        this.pendingRequest.reject(new Error('Previous intersection detection request was cancelled'));
      }

      this.pendingRequest = { resolve: (results: WorkerIntersectionResult[]) => {
        // Fill in shape references and convert to proper types
        const shapeMap = new Map(shapes.map(s => [s.id, s]));
        const finalResults: IntersectionResult[] = results.map((r) => ({
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
      }, reject };

      const worker = this.getWorker();
      worker.postMessage({ shapes: workerShapes });
    });
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
