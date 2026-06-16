import { Point } from '../models';

/**
 * Maximum miter length, expressed as a multiple of the half-width. When a
 * corner's miter would exceed this (e.g. an extremely sharp or U-turning path),
 * the join falls back to a bevel so the polygon never produces an unbounded spike.
 */
const MITER_LIMIT = 4;

/**
 * Number of straight segments used to approximate each round (PATHTYPE 1)
 * end cap, which is a half-disc of radius width/2.
 */
const ROUND_CAP_SEGMENTS = 8;

// --- minimal 2D vector helpers (Point carries plain x/y) ---

const add = (a: Point, b: Point): Point => new Point(a.x + b.x, a.y + b.y);
const scale = (p: Point, s: number): Point => new Point(p.x * s, p.y * s);
/** Left normal: 90° counter-clockwise rotation of a unit direction. */
const perp = (p: Point): Point => new Point(-p.y, p.x);
const sub = (a: Point, b: Point): Point => new Point(a.x - b.x, a.y - b.y);

/**
 * Strokes a GDSII PATH centerline into the closed polygon that represents the
 * wire's filled footprint, honoring the PATHTYPE end-cap semantics:
 *   0 = flush/square caps (no extension),
 *   1 = round half-disc caps (extension = half-width),
 *   2 = square caps extended by BGNEXTN / ENDEXTN.
 *
 * Corners are joined with a miter (with a bevel fallback past MITER_LIMIT), so
 * axis-aligned (Manhattan) routes — the common case in IC layouts — render with
 * sharp corners identical to mainstream GDSII viewers.
 *
 * @returns the polygon ring WITHOUT a duplicated closing vertex (the `Contour`
 *          constructor closes it), or `null` when the path cannot be stroked
 *          (zero/negative width or a degenerate centerline).
 */
export function strokePathToPoints(
  centerline: Point[],
  width: number,
  pathType: number,
  bgnExtn: number,
  endExtn: number
): Point[] | null {
  if (width <= 0) return null;

  // Collapse consecutive duplicate vertices — zero-length segments would divide
  // by zero when computing segment directions.
  const raw: Point[] = [];
  for (const p of centerline) {
    const last = raw[raw.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) raw.push(p);
  }
  if (raw.length < 2) return null;

  const n = raw.length;
  const w = width / 2;

  // Unit direction of each segment k = raw[k] -> raw[k+1].
  const segDir: Point[] = [];
  for (let k = 0; k < n - 1; k++) {
    const d = sub(raw[k + 1], raw[k]);
    const len = Math.hypot(d.x, d.y) || 1;
    segDir.push(scale(d, 1 / len));
  }

  // For PATHTYPE 2 the centerline is extended (collinearly) at both ends; the
  // cap then becomes a straight edge at the extended position. PATHTYPE 0 and 1
  // do not extend the centerline.
  const extBegin = pathType === 2 ? bgnExtn : 0;
  const extEnd = pathType === 2 ? endExtn : 0;
  const start = extBegin !== 0 ? add(raw[0], scale(segDir[0], -extBegin)) : raw[0];
  const end = extEnd !== 0 ? add(raw[n - 1], scale(segDir[n - 2], extEnd)) : raw[n - 1];

  // Build the LEFT and RIGHT offset polylines. Both always start with the
  // offset of `start` (only one segment touches it, so the miter is simply w)
  // and end with the offset of `end`.
  const left: Point[] = [];
  const right: Point[] = [];

  {
    const ln = perp(segDir[0]);
    left.push(add(start, scale(ln, w)));
    right.push(add(start, scale(ln, -w)));
  }

  for (let i = 1; i < n - 1; i++) {
    const a = segDir[i - 1]; // incoming segment direction
    const b = segDir[i]; // outgoing segment direction
    const vtx = raw[i];

    const mTangentX = a.x + b.x;
    const mTangentY = a.y + b.y;
    const mLen = Math.hypot(mTangentX, mTangentY);

    if (mLen < 1e-9) {
      // Near-U-turn (b ≈ -a): miter is undefined → bevel with both normals.
      pushBevel(left, right, vtx, a, b, w);
      continue;
    }

    const mn = perp(new Point(mTangentX / mLen, mTangentY / mLen)); // miter normal (left)
    const cosHalf = mn.x * (-a.y) + mn.y * a.x; // dot(mn, perp(a))
    const miterLen = w / (Math.abs(cosHalf) < 1e-9 ? (cosHalf < 0 ? -1e-9 : 1e-9) : cosHalf);

    if (Math.abs(miterLen) > MITER_LIMIT * w) {
      pushBevel(left, right, vtx, a, b, w);
    } else {
      left.push(add(vtx, scale(mn, miterLen)));
      right.push(add(vtx, scale(mn, -miterLen)));
    }
  }

  {
    const ln = perp(segDir[n - 2]);
    left.push(add(end, scale(ln, w)));
    right.push(add(end, scale(ln, -w)));
  }

  // Assemble the ring: left side forward, far cap, right side reversed, near cap.
  const ring: Point[] = [];
  for (const p of left) ring.push(p);

  if (pathType === 1) {
    appendRoundCap(ring, end, segDir[n - 2], w, +1);
  }

  for (let i = right.length - 1; i >= 0; i--) ring.push(right[i]);

  if (pathType === 1) {
    appendRoundCap(ring, start, segDir[0], w, -1);
  }

  // A stroked path needs at least a triangle to be a meaningful polygon.
  return ring.length >= 3 ? ring : null;
}

/** Inserts the two bevel offset points (one per segment normal) on each side. */
function pushBevel(left: Point[], right: Point[], vtx: Point, a: Point, b: Point, w: number): void {
  const la = perp(a);
  const lb = perp(b);
  left.push(add(vtx, scale(la, w)), add(vtx, scale(lb, w)));
  right.push(add(vtx, scale(la, -w)), add(vtx, scale(lb, -w)));
}

/**
 * Appends the intermediate points of a round end cap (a half-disc of radius w),
 * excluding the two endpoints which already sit in the ring. `bulge` is +1 for a
 * cap that bulges in the +direction sense (far end) and -1 for the near end.
 */
function appendRoundCap(ring: Point[], center: Point, direction: Point, w: number, bulge: number): void {
  const base = Math.atan2(direction.y * bulge, direction.x * bulge);
  const start = bulge > 0 ? base + Math.PI / 2 : base - Math.PI / 2;
  for (let k = 1; k < ROUND_CAP_SEGMENTS; k++) {
    const ang = start - (k * Math.PI) / ROUND_CAP_SEGMENTS;
    ring.push(new Point(center.x + w * Math.cos(ang), center.y + w * Math.sin(ang)));
  }
}
