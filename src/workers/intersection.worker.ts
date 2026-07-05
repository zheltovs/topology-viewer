/**
 * Web Worker for intersection detection
 * This offloads the heavy computation from the main thread.
 * The actual search lives in services/segmentIntersections.ts.
 */

import { findAllIntersections } from '../services/segmentIntersections';
import type { IntersectionInputShape } from '../services/segmentIntersections';

interface WorkerInput {
  requestId: number;
  shapes: IntersectionInputShape[];
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { requestId, shapes } = e.data;

  try {
    const results = findAllIntersections(shapes);
    self.postMessage({ requestId, success: true, results });
  } catch (error) {
    self.postMessage({
      requestId,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
