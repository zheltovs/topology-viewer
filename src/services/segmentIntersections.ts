import { Point, ShapeType } from '../models';
import type { Shape } from '../models';

const EPS = 1e-9;
const KEY_PRECISION = 6;

interface Segment {
  id: string;
  shapeId: string;
  index: number;
  segmentCount: number;
  isContour: boolean;
  p1: Point;
  p2: Point;
  left: Point;
  right: Point;
  minY: number;
  maxY: number;
  dx: number;
  dy: number;
  isVertical: boolean;
}

interface IntersectionEvent {
  x: number;
  y: number;
  type: 'left' | 'right' | 'intersection' | 'vertical';
  segment?: Segment;
  segments?: [Segment, Segment];
  point?: Point;
}

interface OverlapSegment {
  start: Point;
  end: Point;
}

export interface IntersectionResult {
  points: Point[];
  overlaps: OverlapSegment[];
}

class MinHeap<T> {
  private data: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  push(item: T): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const min = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last) {
      this.data[0] = last;
      this.bubbleDown(0);
    }
    return min;
  }

  get size(): number {
    return this.data.length;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.data[index], this.data[parent]) >= 0) break;
      [this.data[index], this.data[parent]] = [this.data[parent], this.data[index]];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.data.length;
    while (true) {
      let smallest = index;
      const left = index * 2 + 1;
      const right = index * 2 + 2;

      if (left < length && this.compare(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.data[index], this.data[smallest]] = [this.data[smallest], this.data[index]];
      index = smallest;
    }
  }
}

class TreapNode {
  segment: Segment;
  priority: number;
  left: TreapNode | null = null;
  right: TreapNode | null = null;

  constructor(segment: Segment) {
    this.segment = segment;
    this.priority = nextRandom();
  }
}

class SegmentTreap {
  private root: TreapNode | null = null;
  private compare: (a: Segment, b: Segment) => number;

  constructor(compare: (a: Segment, b: Segment) => number) {
    this.compare = compare;
  }

  insert(segment: Segment): void {
    this.root = this.insertNode(this.root, segment);
  }

  remove(segment: Segment): void {
    this.root = this.removeNode(this.root, segment);
  }

  prev(segment: Segment): Segment | null {
    let node = this.root;
    let result: Segment | null = null;
    while (node) {
      if (this.compare(segment, node.segment) <= 0) {
        node = node.left;
      } else {
        result = node.segment;
        node = node.right;
      }
    }
    return result;
  }

  next(segment: Segment): Segment | null {
    let node = this.root;
    let result: Segment | null = null;
    while (node) {
      if (this.compare(segment, node.segment) < 0) {
        result = node.segment;
        node = node.left;
      } else {
        node = node.right;
      }
    }
    return result;
  }

  rangeSearch(minY: number, maxY: number, getY: (segment: Segment) => number): Segment[] {
    const results: Segment[] = [];
    const search = (node: TreapNode | null) => {
      if (!node) return;
      const y = getY(node.segment);
      if (y > maxY + EPS) {
        search(node.left);
      } else if (y < minY - EPS) {
        search(node.right);
      } else {
        results.push(node.segment);
        search(node.left);
        search(node.right);
      }
    };
    search(this.root);
    return results;
  }

  private insertNode(node: TreapNode | null, segment: Segment): TreapNode {
    if (!node) return new TreapNode(segment);
    if (this.compare(segment, node.segment) < 0) {
      node.left = this.insertNode(node.left, segment);
      if (node.left && node.left.priority < node.priority) {
        return this.rotateRight(node);
      }
    } else {
      node.right = this.insertNode(node.right, segment);
      if (node.right && node.right.priority < node.priority) {
        return this.rotateLeft(node);
      }
    }
    return node;
  }

  private removeNode(node: TreapNode | null, segment: Segment): TreapNode | null {
    if (!node) return null;
    const comparison = this.compare(segment, node.segment);
    if (comparison === 0) {
      return this.merge(node.left, node.right);
    }
    if (comparison < 0) {
      node.left = this.removeNode(node.left, segment);
    } else {
      node.right = this.removeNode(node.right, segment);
    }
    return node;
  }

  private merge(left: TreapNode | null, right: TreapNode | null): TreapNode | null {
    if (!left) return right;
    if (!right) return left;
    if (left.priority < right.priority) {
      left.right = this.merge(left.right, right);
      return left;
    }
    right.left = this.merge(left, right.left);
    return right;
  }

  private rotateRight(node: TreapNode): TreapNode {
    if (!node.left) return node;
    const left = node.left;
    node.left = left.right;
    left.right = node;
    return left;
  }

  private rotateLeft(node: TreapNode): TreapNode {
    if (!node.right) return node;
    const right = node.right;
    node.right = right.left;
    right.left = node;
    return right;
  }
}

const almostEqual = (a: number, b: number, eps: number = EPS): boolean =>
  Math.abs(a - b) <= eps;

let prngSeed = 987654321;
const nextRandom = (): number => {
  prngSeed = (1103515245 * prngSeed + 12345) % 2147483648;
  return prngSeed / 2147483648;
};

const pointKey = (point: Point): string =>
  `${point.x.toFixed(KEY_PRECISION)},${point.y.toFixed(KEY_PRECISION)}`;

const segmentYAtX = (segment: Segment, x: number): number => {
  if (segment.isVertical) return segment.p1.y;
  const t = (x - segment.p1.x) / segment.dx;
  return segment.p1.y + t * segment.dy;
};

const inRange = (value: number, min: number, max: number): boolean =>
  value >= min - EPS && value <= max + EPS;

const isEndpoint = (segment: Segment, point: Point): boolean =>
  (almostEqual(point.x, segment.p1.x) && almostEqual(point.y, segment.p1.y)) ||
  (almostEqual(point.x, segment.p2.x) && almostEqual(point.y, segment.p2.y));

const areAdjacentSegments = (segA: Segment, segB: Segment): boolean => {
  if (segA.shapeId !== segB.shapeId) return false;
  const diff = Math.abs(segA.index - segB.index);
  if (diff === 1) return true;
  if (segA.isContour && diff === segA.segmentCount - 1) return true;
  return false;
};

const shouldSkipEndpointIntersection = (segA: Segment, segB: Segment, point: Point): boolean =>
  areAdjacentSegments(segA, segB) && isEndpoint(segA, point) && isEndpoint(segB, point);

const intersectionPoint = (segA: Segment, segB: Segment): Point | null => {
  const x1 = segA.p1.x;
  const y1 = segA.p1.y;
  const x2 = segA.p2.x;
  const y2 = segA.p2.y;
  const x3 = segB.p1.x;
  const y3 = segB.p1.y;
  const x4 = segB.p2.x;
  const y4 = segB.p2.y;

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) < EPS) return null;

  const det1 = x1 * y2 - y1 * x2;
  const det2 = x3 * y4 - y3 * x4;
  const px = (det1 * (x3 - x4) - (x1 - x2) * det2) / denominator;
  const py = (det1 * (y3 - y4) - (y1 - y2) * det2) / denominator;

  if (!inRange(px, Math.min(x1, x2), Math.max(x1, x2)) ||
      !inRange(px, Math.min(x3, x4), Math.max(x3, x4)) ||
      !inRange(py, Math.min(y1, y2), Math.max(y1, y2)) ||
      !inRange(py, Math.min(y3, y4), Math.max(y3, y4))) {
    return null;
  }

  return new Point(px, py);
};

const buildSegments = (shapes: Shape[]): Segment[] => {
  const segments: Segment[] = [];
  shapes.filter(shape => shape.visible).forEach(shape => {
    const segmentCount = Math.max(shape.points.length - 1, 0);
    for (let i = 1; i < shape.points.length; i++) {
      const p1 = shape.points[i - 1];
      const p2 = shape.points[i];
      if (Math.abs(p1.x - p2.x) < EPS && Math.abs(p1.y - p2.y) < EPS) continue;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const isVertical = Math.abs(dx) < EPS;
      let left = p1;
      let right = p2;
      if (isVertical) {
        if (p1.y > p2.y) {
          left = p2;
          right = p1;
        }
      } else if (p1.x > p2.x || (almostEqual(p1.x, p2.x) && p1.y > p2.y)) {
        left = p2;
        right = p1;
      }
      segments.push({
        id: `${shape.id}_${i - 1}`,
        shapeId: shape.id,
        index: i - 1,
        segmentCount,
        isContour: shape.type === ShapeType.CONTOUR,
        p1,
        p2,
        left,
        right,
        minY: Math.min(p1.y, p2.y),
        maxY: Math.max(p1.y, p2.y),
        dx,
        dy,
        isVertical
      });
    }
  });
  return segments;
};

const compareSegmentsFactory = (getSweepX: () => number) => (a: Segment, b: Segment): number => {
  const sweepX = getSweepX();
  const yA = segmentYAtX(a, sweepX);
  const yB = segmentYAtX(b, sweepX);
  if (!almostEqual(yA, yB)) return yA < yB ? -1 : 1;
  const yAAfter = segmentYAtX(a, sweepX + EPS);
  const yBAfter = segmentYAtX(b, sweepX + EPS);
  if (!almostEqual(yAAfter, yBAfter)) return yAAfter < yBAfter ? -1 : 1;
  return a.id < b.id ? -1 : 1;
};

const eventPriority = (type: IntersectionEvent['type']): number => {
  switch (type) {
    case 'left':
      return 0;
    case 'intersection':
      return 1;
    case 'vertical':
      return 2;
    case 'right':
      return 3;
    default:
      return 4;
  }
};

const findSweepIntersections = (segments: Segment[], pointMap: Map<string, Point>): void => {
  let sweepX = -Infinity;
  const getSweepX = () => sweepX;
  const compareSegments = compareSegmentsFactory(getSweepX);
  const active = new SegmentTreap(compareSegments);

  const eventQueue = new MinHeap<IntersectionEvent>((a, b) => {
    if (!almostEqual(a.x, b.x)) return a.x - b.x;
    const priorityDiff = eventPriority(a.type) - eventPriority(b.type);
    if (priorityDiff !== 0) return priorityDiff;
    if (!almostEqual(a.y, b.y)) return a.y - b.y;
    return 0;
  });

  const scheduledPairs = new Set<string>();

  const scheduleIntersection = (segA: Segment | null, segB: Segment | null, currentY: number) => {
    if (!segA || !segB) return;
    const point = intersectionPoint(segA, segB);
    if (!point) return;
    if (shouldSkipEndpointIntersection(segA, segB, point)) return;
    if (point.x < sweepX - EPS) return;
    if (almostEqual(point.x, sweepX) && point.y < currentY - EPS) return;
    const key = segA.id < segB.id ? `${segA.id}|${segB.id}` : `${segB.id}|${segA.id}`;
    if (scheduledPairs.has(key)) return;
    scheduledPairs.add(key);
    eventQueue.push({
      x: point.x,
      y: point.y,
      type: 'intersection',
      segments: [segA, segB],
      point
    });
  };

  segments.forEach(segment => {
    if (segment.isVertical) {
      eventQueue.push({
        x: segment.p1.x,
        y: segment.minY,
        type: 'vertical',
        segment
      });
      return;
    }
    eventQueue.push({
      x: segment.left.x,
      y: segment.left.y,
      type: 'left',
      segment
    });
    eventQueue.push({
      x: segment.right.x,
      y: segment.right.y,
      type: 'right',
      segment
    });
  });

  while (eventQueue.size > 0) {
    const event = eventQueue.pop();
    if (!event) break;
    sweepX = event.x;

    if (event.type === 'left' && event.segment) {
      active.insert(event.segment);
      const prev = active.prev(event.segment);
      const next = active.next(event.segment);
      scheduleIntersection(prev, event.segment, event.y);
      scheduleIntersection(event.segment, next, event.y);
    } else if (event.type === 'right' && event.segment) {
      const prev = active.prev(event.segment);
      const next = active.next(event.segment);
      active.remove(event.segment);
      scheduleIntersection(prev, next, event.y);
    } else if (event.type === 'intersection' && event.segments && event.point) {
      const point = event.point;
      pointMap.set(pointKey(point), point);

      const [segA, segB] = event.segments;
      // Reinsert to reflect swapped ordering at the intersection.
      active.remove(segA);
      active.remove(segB);
      active.insert(segB);
      active.insert(segA);

      const prev = active.prev(segB);
      const next = active.next(segA);
      scheduleIntersection(prev, segB, event.y);
      scheduleIntersection(segA, next, event.y);
    } else if (event.type === 'vertical' && event.segment) {
      const vertical = event.segment;
      const candidates = active.rangeSearch(vertical.minY, vertical.maxY, seg => segmentYAtX(seg, vertical.p1.x));
      candidates.forEach(seg => {
        const point = intersectionPoint(vertical, seg);
        if (point && !shouldSkipEndpointIntersection(vertical, seg, point)) {
          pointMap.set(pointKey(point), point);
        }
      });
    }
  }
};

const findCollinearOverlaps = (segments: Segment[], pointMap: Map<string, Point>): OverlapSegment[] => {
  const lineGroups = new Map<string, { segments: Segment[]; A: number; B: number }>();

  segments.forEach(segment => {
    const length = Math.hypot(segment.dx, segment.dy);
    if (length < EPS) return;
    let A = segment.dy / length;
    let B = -segment.dx / length;
    let C = A * segment.p1.x + B * segment.p1.y;

    if (A < -EPS || (almostEqual(A, 0) && B < -EPS)) {
      A = -A;
      B = -B;
      C = -C;
    }

    const key = `${A.toFixed(KEY_PRECISION)},${B.toFixed(KEY_PRECISION)},${C.toFixed(KEY_PRECISION)}`;
    const group = lineGroups.get(key);
    if (group) {
      group.segments.push(segment);
    } else {
      lineGroups.set(key, { segments: [segment], A, B });
    }
  });

  const overlaps: OverlapSegment[] = [];

  lineGroups.forEach(group => {
    if (group.segments.length < 2) return;
    const dirX = -group.B;
    const dirY = group.A;
    const anchor = group.segments[0].p1;
    const anchorT = anchor.x * dirX + anchor.y * dirY;

    type Event = { t: number; type: 'start' | 'end' };
    const events: Event[] = [];

    group.segments.forEach(segment => {
      const t1 = segment.p1.x * dirX + segment.p1.y * dirY;
      const t2 = segment.p2.x * dirX + segment.p2.y * dirY;
      const start = Math.min(t1, t2);
      const end = Math.max(t1, t2);
      events.push({ t: start, type: 'start' });
      events.push({ t: end, type: 'end' });
    });

    events.sort((a, b) => a.t - b.t);

    let count = 0;
    let prevT: number | null = null;
    let i = 0;

    while (i < events.length) {
      const t = events[i].t;
      let starts = 0;
      let ends = 0;

      while (i < events.length && almostEqual(events[i].t, t)) {
        if (events[i].type === 'start') {
          starts++;
        } else {
          ends++;
        }
        i++;
      }

      if (prevT !== null && count >= 2 && t - prevT > EPS) {
        overlaps.push({
          start: new Point(anchor.x + dirX * (prevT - anchorT), anchor.y + dirY * (prevT - anchorT)),
          end: new Point(anchor.x + dirX * (t - anchorT), anchor.y + dirY * (t - anchorT))
        });
      }

      const coverageAtT = count + starts;
      if (coverageAtT >= 2) {
        const point = new Point(anchor.x + dirX * (t - anchorT), anchor.y + dirY * (t - anchorT));
        pointMap.set(pointKey(point), point);
      }

      count += starts - ends;
      prevT = t;
    }
  });

  return overlaps;
};

export const calculateIntersections = (shapes: Shape[]): IntersectionResult => {
  const segments = buildSegments(shapes);
  if (segments.length < 2) return { points: [], overlaps: [] };
  const pointMap = new Map<string, Point>();
  findSweepIntersections(segments, pointMap);
  const overlaps = findCollinearOverlaps(segments, pointMap);
  return { points: Array.from(pointMap.values()), overlaps };
};
