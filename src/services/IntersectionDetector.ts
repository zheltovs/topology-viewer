import { Point, Segment } from '../models';
import type { Shape } from '../models';
import { intersectSegments } from './segmentIntersections';
import type { RawIntersectionResult } from './segmentIntersections';

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
 * Worker response interface
 */
interface WorkerResult {
  requestId: number;
  success: boolean;
  results?: RawIntersectionResult[];
  error?: string;
}

/**
 * Intersection detector for finding intersections between shapes.
 * The search itself (sweep-and-prune, see services/segmentIntersections.ts)
 * runs in a web worker to avoid blocking the main thread.
 */
export class IntersectionDetector {
  private static worker: Worker | null = null;
  private static requestCounter = 0;
  private static pendingRequest: {
    requestId: number;
    resolve: (results: RawIntersectionResult[]) => void;
    reject: (error: Error) => void;
  } | null = null;

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
        const pending = this.pendingRequest;
        // Ignore responses of superseded requests: the worker processes
        // messages sequentially, so an answer to a cancelled computation can
        // arrive while a newer request is already pending
        if (!pending || e.data.requestId !== pending.requestId) return;
        this.pendingRequest = null;

        if (e.data.success && e.data.results) {
          pending.resolve(e.data.results);
        } else {
          pending.reject(new Error(e.data.error || 'Unknown error in worker'));
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
   * Find all intersections and overlaps between the given shapes.
   * Runs in a web worker to avoid blocking the main thread.
   */
  static async findAllIntersections(shapes: Shape[]): Promise<IntersectionResult[]> {
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

      const requestId = ++this.requestCounter;

      this.pendingRequest = {
        requestId,
        resolve: (results: RawIntersectionResult[]) => {
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
        },
        reject
      };

      const worker = this.getWorker();
      worker.postMessage({ requestId, shapes: workerShapes });
    });
  }

  /**
   * Find intersection between two segments (kept for backward compatibility)
   * Returns either a point (IntersectionType.POINT) or a segment (IntersectionType.OVERLAP)
   */
  static findIntersection(seg1: Segment, seg2: Segment): Point | Segment | null {
    const hit = intersectSegments(
      seg1.p1.x, seg1.p1.y, seg1.p2.x, seg1.p2.y,
      seg2.p1.x, seg2.p1.y, seg2.p2.x, seg2.p2.y
    );

    if (!hit) return null;
    if (hit.type === 'point') {
      return new Point(hit.x, hit.y);
    }
    return new Segment(new Point(hit.x1, hit.y1), new Point(hit.x2, hit.y2));
  }
}
