import React, { useRef, useEffect, useState, useCallback, useMemo, useImperativeHandle } from 'react';
import type { Shape } from '../models';
import { Point, ShapeType } from '../models';
import { IntersectionDetector, IntersectionType, SpatialIndex } from '../services';
import type { IntersectionResult, BoundingBox } from '../services';
import { WebGLRenderer } from '../rendering';
import { tokens } from '../styles';
import type { GridSettings } from '../App';

// Dark theme canvas colors
const canvasColors = {
  background: '#0a0e13',
  grid: 'rgba(255, 255, 255, 0.04)',
  gridMajor: 'rgba(255, 255, 255, 0.08)',
  axis: 'rgba(255, 255, 255, 0.25)',
  axisLabel: '#6e767d',
  origin: '#1d9bf0',
  chain: '#1d9bf0',
  chainFill: 'rgba(29, 155, 240, 0.08)',
  contour: '#00ba7c',
  contourFill: 'rgba(0, 186, 124, 0.15)',
  selected: '#ffad1f',
  selectedFill: 'rgba(255, 173, 31, 0.15)',
  drawing: '#f4212e',
  drawingFill: 'rgba(244, 33, 46, 0.15)',
  cursor: '#f4212e',
  cursorLabel: '#f7f9f9',
  point: '#f7f9f9',
  intersection: '#ff0000',
  intersectionFill: 'rgba(255, 0, 0, 0.3)',
  intersectionGlow: 'rgba(255, 0, 0, 0.25)',
};

/** Imperative surface exposed to the app (view commands, not state) */
export interface CanvasHandle {
  /** Fit the view to the given shapes; defaults to the current shapes prop */
  fitView: (shapesToFit?: Shape[]) => void;
}

interface CanvasProps {
  shapes: Shape[];
  selectedShapeIds?: string[];
  onAddPoint?: (point: Point) => void;
  drawingMode: 'chain' | 'contour' | null;
  tempPoints: Point[];
  showIntersections?: boolean;
  showStats?: boolean;
  onIntersectionComputingChange?: (isComputing: boolean) => void;
  onIntersectionsFound?: (count: number) => void;
  gridSettings?: GridSettings;
  ref?: React.Ref<CanvasHandle>;
}

interface ViewTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

const layerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
};

// Size of the pre-rendered intersection point marker sprite (CSS px)
const INTERSECTION_SPRITE_SIZE = 32;

// Maximum zoom-in factor (px per world unit); zoom-out is not limited
const MAX_SCALE = 1e8;

// Stable default so the selection Set is not rebuilt on every render
const NO_SELECTION: string[] = [];

/**
 * True when the two lists describe the same geometry: identical shape ids,
 * point arrays (by reference) and visibility. Color / layer / selection
 * changes keep the point arrays intact, so this cheaply distinguishes
 * "geometry changed" from "only styling changed".
 */
function sameGeometry(a: Shape[], b: Shape[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].points !== b[i].points || a[i].visible !== b[i].visible) {
      return false;
    }
  }
  return true;
}

export const Canvas: React.FC<CanvasProps> = ({
  shapes,
  selectedShapeIds = NO_SELECTION,
  onAddPoint,
  drawingMode,
  tempPoints,
  showIntersections = false,
  showStats = false,
  onIntersectionComputingChange,
  onIntersectionsFound,
  gridSettings,
  ref,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const coordsRef = useRef<HTMLSpanElement>(null);
  const zoomRef = useRef<HTMLSpanElement>(null);

  const [transform, setTransform] = useState<ViewTransform>({
    offsetX: 0,
    offsetY: 0,
    scale: 1.0
  });
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0, dpr: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [glError, setGlError] = useState<string | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const [mouseWorldPos, setMouseWorldPos] = useState<Point | null>(null);
  const [intersections, setIntersections] = useState<IntersectionResult[]>([]);

  const selectedSet = useMemo(() => new Set(selectedShapeIds), [selectedShapeIds]);

  // Spatial index for viewport queries (vertex markers, hit-testing)
  const spatialIndexRef = useRef<SpatialIndex>(new SpatialIndex());

  // Track container size and device pixel ratio
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      setSize({
        width: container.clientWidth,
        height: container.clientHeight,
        dpr: window.devicePixelRatio || 1,
      });
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Initialize the WebGL renderer as soon as the canvas element attaches.
  // A callback ref (rather than an effect) ties the renderer's lifetime
  // directly to the DOM node.
  const setupGlCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) {
      rendererRef.current?.dispose();
      rendererRef.current = null;
      glCanvasRef.current = null;
      return;
    }

    glCanvasRef.current = canvas;
    try {
      rendererRef.current = new WebGLRenderer(canvas);
    } catch (error) {
      console.error('Failed to initialize WebGL renderer:', error);
      setGlError('WebGL2 is not available in this browser — shape geometry cannot be rendered.');
    }
  }, []);

  // Rebuild geometry when shapes change (selection is not part of `shapes`,
  // so selecting never re-uploads GPU buffers or reindexes)
  useEffect(() => {
    spatialIndexRef.current.buildIndex(shapes);
    rendererRef.current?.setShapes(shapes);
  }, [shapes]);

  // Calculate viewport bounds in world coordinates
  const getViewportBounds = useCallback((): BoundingBox => {
    const halfW = size.width / 2 / transform.scale;
    const halfH = size.height / 2 / transform.scale;
    const centerX = -transform.offsetX / transform.scale;
    const centerY = transform.offsetY / transform.scale;

    return {
      minX: centerX - halfW,
      minY: centerY - halfH,
      maxX: centerX + halfW,
      maxY: centerY + halfH
    };
  }, [transform, size]);

  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback((screenX: number, screenY: number): Point => {
    const container = containerRef.current;
    if (!container) return new Point(0, 0);

    const rect = container.getBoundingClientRect();
    const x = (screenX - rect.left - size.width / 2 - transform.offsetX) / transform.scale;
    const y = -(screenY - rect.top - size.height / 2 - transform.offsetY) / transform.scale;

    return new Point(x, y);
  }, [transform, size]);

  // Convert world coordinates to screen (CSS pixel) coordinates
  const worldToScreen = useCallback((worldX: number, worldY: number): { x: number; y: number } => {
    const x = worldX * transform.scale + size.width / 2 + transform.offsetX;
    const y = -worldY * transform.scale + size.height / 2 + transform.offsetY;

    return { x, y };
  }, [transform, size]);

  // Resize a canvas backing store to match the container and return a
  // 2D context scaled so drawing code works in CSS pixels
  const setup2dContext = useCallback((canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
    const deviceWidth = Math.max(1, Math.round(size.width * size.dpr));
    const deviceHeight = Math.max(1, Math.round(size.height * size.dpr));
    if (canvas.width !== deviceWidth) canvas.width = deviceWidth;
    if (canvas.height !== deviceHeight) canvas.height = deviceHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    return ctx;
  }, [size]);

  // Draw user-defined window grid
  const drawUserGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!gridSettings?.enabled || gridSettings.windowX <= 0 || gridSettings.windowY <= 0) return;

    // Only draw if there are visible shapes
    const visibleShapes = shapes.filter(s => s.visible && s.points.length > 0);
    if (visibleShapes.length === 0) return;

    // Compute bounding box of all shape points
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const shape of visibleShapes) {
      for (const p of shape.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }

    const winX = gridSettings.windowX;
    const winY = gridSettings.windowY;
    // period = step (distance from start of one window to start of the next).
    // If step=0 (or unset) windows are adjacent, so period equals the window size.
    const periodX = gridSettings.stepX > 0 ? gridSettings.stepX : winX;
    const periodY = gridSettings.stepY > 0 ? gridSettings.stepY : winY;

    // Grid origin is exactly (minX, minY) — first window starts at the bottom-left corner
    const originX = minX;
    const originY = minY;

    // Number of columns/rows needed so the last window still starts within the bounding box
    const cols = Math.floor((maxX - originX) / periodX);
    const rows = Math.floor((maxY - originY) / periodY);

    // Guard against too many cells
    if ((cols + 1) * (rows + 1) > 50000) return;

    const screenWinX = winX * transform.scale;
    const screenWinY = winY * transform.scale;
    if (screenWinX < 1 || screenWinY < 1) return;

    const colorA = { stroke: 'rgba(255, 80,  80,  0.85)', fill: 'rgba(255, 80,  80,  0.12)' };
    const colorB = { stroke: 'rgba(50,  220, 120, 0.85)', fill: 'rgba(50,  220, 120, 0.12)' };
    ctx.lineWidth = 1;

    for (let j = 0; j <= rows; j++) {
      for (let k = 0; k <= cols; k++) {
        const color = (k + j) % 2 === 0 ? colorA : colorB;
        const wx = originX + k * periodX;
        const wy = originY + j * periodY;
        // top-left screen corner (world Y up → screen Y down)
        const topLeft = worldToScreen(wx, wy + winY);
        ctx.strokeStyle = color.stroke;
        ctx.fillStyle = color.fill;
        ctx.beginPath();
        ctx.rect(topLeft.x, topLeft.y, screenWinX, screenWinY);
        ctx.fill();
        ctx.stroke();
      }
    }
  }, [gridSettings, shapes, worldToScreen, transform.scale]);

  // Draw coordinate axes and grid
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Calculate grid spacing based on scale - use fixed world units
    // Choose nice round numbers: 1, 2, 5, 10, 20, 50, 100, etc.
    const targetPixelSpacing = 100; // target pixel spacing between grid lines
    const rawWorldSpacing = targetPixelSpacing / transform.scale;

    // Round to nice numbers (1, 2, 5, 10, 20, 50, etc.)
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawWorldSpacing)));
    const normalized = rawWorldSpacing / magnitude;
    let niceNumber: number;
    if (normalized < 1.5) niceNumber = 1;
    else if (normalized < 3.5) niceNumber = 2;
    else if (normalized < 7.5) niceNumber = 5;
    else niceNumber = 10;

    const worldSpacing = niceNumber * magnitude;

    // Calculate world origin in screen coordinates
    const originScreen = worldToScreen(0, 0);

    // Draw minor grid lines - aligned to world coordinates
    ctx.strokeStyle = canvasColors.grid;
    ctx.lineWidth = 1;

    // Calculate grid line positions based on world coordinates
    const worldLeft = -transform.offsetX / transform.scale - width / 2 / transform.scale;
    const worldRight = worldLeft + width / transform.scale;
    const worldTop = transform.offsetY / transform.scale + height / 2 / transform.scale;
    const worldBottom = worldTop - height / transform.scale;

    // Vertical lines (X grid)
    const startWorldX = Math.floor(worldLeft / worldSpacing) * worldSpacing;
    for (let wx = startWorldX; wx <= worldRight; wx += worldSpacing) {
      const screenX = originScreen.x + wx * transform.scale;
      ctx.beginPath();
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, height);
      ctx.stroke();
    }

    // Horizontal lines (Y grid)
    const startWorldY = Math.floor(worldBottom / worldSpacing) * worldSpacing;
    for (let wy = startWorldY; wy <= worldTop; wy += worldSpacing) {
      const screenY = originScreen.y - wy * transform.scale;
      ctx.beginPath();
      ctx.moveTo(0, screenY);
      ctx.lineTo(width, screenY);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = canvasColors.axis;
    ctx.lineWidth = 1.5;

    // X-axis (only if visible)
    if (originScreen.y >= 0 && originScreen.y <= height) {
      ctx.beginPath();
      ctx.moveTo(0, originScreen.y);
      ctx.lineTo(width, originScreen.y);
      ctx.stroke();
    }

    // Y-axis (only if visible)
    if (originScreen.x >= 0 && originScreen.x <= width) {
      ctx.beginPath();
      ctx.moveTo(originScreen.x, 0);
      ctx.lineTo(originScreen.x, height);
      ctx.stroke();
    }

    // Draw axis labels - at grid intersections
    ctx.font = `500 12px ${tokens.typography.fontFamily.mono}`;
    ctx.fillStyle = canvasColors.axisLabel;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Determine decimal places based on world spacing
    const decimals = worldSpacing < 1 ? Math.ceil(-Math.log10(worldSpacing)) : 0;

    // X-axis labels
    for (let wx = startWorldX; wx <= worldRight; wx += worldSpacing) {
      if (Math.abs(wx) < worldSpacing * 0.01) continue; // Skip origin
      const screenX = originScreen.x + wx * transform.scale;
      if (screenX < 10 || screenX > width - 40) continue; // Avoid edge clipping

      const label = wx.toFixed(decimals);
      const labelY = Math.min(Math.max(originScreen.y + 6, 6), height - 16);
      ctx.fillText(label, screenX + 4, labelY);
    }

    // Y-axis labels
    ctx.textAlign = 'left';
    for (let wy = startWorldY; wy <= worldTop; wy += worldSpacing) {
      if (Math.abs(wy) < worldSpacing * 0.01) continue; // Skip origin
      const screenY = originScreen.y - wy * transform.scale;
      if (screenY < 16 || screenY > height - 10) continue; // Avoid edge clipping

      const label = wy.toFixed(decimals);
      const labelX = Math.min(Math.max(originScreen.x + 6, 6), width - 50);
      ctx.fillText(label, labelX, screenY - 6);
    }

    // Draw origin point (if visible)
    if (originScreen.x >= -10 && originScreen.x <= width + 10 &&
        originScreen.y >= -10 && originScreen.y <= height + 10) {
      ctx.fillStyle = canvasColors.origin;
      ctx.beginPath();
      ctx.arc(originScreen.x, originScreen.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Origin label
      ctx.fillText('0', originScreen.x + 6, originScreen.y + 6);
    }
  }, [transform, worldToScreen]);

  // Draw a selected shape with highlight styling (geometry itself is also
  // rendered by WebGL underneath; this draws the orange emphasis on top)
  const drawSelectedShape = useCallback((ctx: CanvasRenderingContext2D, shape: Shape) => {
    if (shape.points.length < 2) return;

    const isContour = shape.type === ShapeType.CONTOUR;

    ctx.strokeStyle = canvasColors.selected;
    ctx.fillStyle = canvasColors.selectedFill;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    const firstPoint = worldToScreen(shape.points[0].x, shape.points[0].y);
    ctx.moveTo(firstPoint.x, firstPoint.y);
    for (let i = 1; i < shape.points.length; i++) {
      const point = worldToScreen(shape.points[i].x, shape.points[i].y);
      ctx.lineTo(point.x, point.y);
    }

    if (isContour) {
      ctx.closePath();
      ctx.fill();
    }
    ctx.stroke();

    // Vertex markers with glow
    for (const point of shape.points) {
      const screenPoint = worldToScreen(point.x, point.y);

      ctx.fillStyle = canvasColors.selectedFill;
      ctx.beginPath();
      ctx.arc(screenPoint.x, screenPoint.y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = canvasColors.selected;
      ctx.beginPath();
      ctx.arc(screenPoint.x, screenPoint.y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = canvasColors.point;
      ctx.beginPath();
      ctx.arc(screenPoint.x, screenPoint.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [worldToScreen]);

  // Draw vertex markers for non-selected shapes when zoomed in
  const drawPointMarkers = useCallback((
    ctx: CanvasRenderingContext2D,
    shapesInView: Shape[],
    selected: Set<string>
  ) => {
    if (transform.scale <= 1.0) return;

    // Skip some markers at moderate zoom so they don't turn into noise
    const pointSkip = transform.scale < 2.0 ? Math.ceil(4 / Math.max(transform.scale, 0.01)) : 1;
    const drawInnerHighlight = transform.scale > 2.0;

    for (const shape of shapesInView) {
      if (!shape.visible || selected.has(shape.id)) continue;

      ctx.fillStyle = shape.color;
      shape.points.forEach((point, index) => {
        if (pointSkip > 1 && index % pointSkip !== 0 &&
            index !== 0 && index !== shape.points.length - 1) {
          return;
        }

        const screenPoint = worldToScreen(point.x, point.y);
        ctx.beginPath();
        ctx.arc(screenPoint.x, screenPoint.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (drawInnerHighlight) {
      ctx.fillStyle = canvasColors.point;
      for (const shape of shapesInView) {
        if (!shape.visible || selected.has(shape.id)) continue;

        shape.points.forEach((point, index) => {
          if (pointSkip > 1 && index % pointSkip !== 0 &&
              index !== 0 && index !== shape.points.length - 1) {
            return;
          }

          const screenPoint = worldToScreen(point.x, point.y);
          ctx.beginPath();
          ctx.arc(screenPoint.x, screenPoint.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  }, [transform.scale, worldToScreen]);

  const drawTempShape = useCallback((ctx: CanvasRenderingContext2D, points: Point[], isContour: boolean) => {
    if (points.length === 0) return;

    ctx.strokeStyle = canvasColors.drawing;
    ctx.fillStyle = canvasColors.drawingFill;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([6, 4]);

    ctx.beginPath();
    const firstPoint = worldToScreen(points[0].x, points[0].y);
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (let i = 1; i < points.length; i++) {
      const point = worldToScreen(points[i].x, points[i].y);
      ctx.lineTo(point.x, point.y);
    }

    // If mouse is over canvas and we have temp points, draw line to cursor
    if (mouseWorldPos && points.length > 0) {
      const cursorScreen = worldToScreen(mouseWorldPos.x, mouseWorldPos.y);
      ctx.lineTo(cursorScreen.x, cursorScreen.y);

      // If drawing contour, show closing line
      if (isContour && points.length >= 2) {
        ctx.lineTo(firstPoint.x, firstPoint.y);
      }
    }

    ctx.stroke();
    ctx.setLineDash([]);

    // Draw points with glow
    points.forEach(point => {
      const screenPoint = worldToScreen(point.x, point.y);

      // Outer glow
      ctx.fillStyle = canvasColors.drawingFill;
      ctx.beginPath();
      ctx.arc(screenPoint.x, screenPoint.y, 10, 0, Math.PI * 2);
      ctx.fill();

      // Main point
      ctx.fillStyle = canvasColors.drawing;
      ctx.beginPath();
      ctx.arc(screenPoint.x, screenPoint.y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Inner highlight
      ctx.fillStyle = canvasColors.point;
      ctx.beginPath();
      ctx.arc(screenPoint.x, screenPoint.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [worldToScreen, mouseWorldPos]);

  // Pre-rendered intersection point marker (glow + dot + highlight).
  // Stamping it with drawImage is far cheaper than per-point arc fills with
  // shadowBlur, which matters with thousands of intersections on screen.
  const intersectionSprite = React.useMemo(() => {
    const sprite = document.createElement('canvas');
    sprite.width = INTERSECTION_SPRITE_SIZE * size.dpr;
    sprite.height = INTERSECTION_SPRITE_SIZE * size.dpr;
    const ctx = sprite.getContext('2d');
    if (!ctx) return null;
    ctx.scale(size.dpr, size.dpr);
    const c = INTERSECTION_SPRITE_SIZE / 2;

    // Outer glow
    ctx.fillStyle = canvasColors.intersectionFill;
    ctx.beginPath();
    ctx.arc(c, c, 12, 0, Math.PI * 2);
    ctx.fill();

    // Main point - bright red
    ctx.fillStyle = canvasColors.intersection;
    ctx.shadowColor = canvasColors.intersection;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(c, c, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Inner highlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c, c, 2, 0, Math.PI * 2);
    ctx.fill();

    return sprite;
  }, [size.dpr]);

  const drawIntersections = useCallback((ctx: CanvasRenderingContext2D) => {
    const margin = 20;
    const maxX = size.width + margin;
    const maxY = size.height + margin;
    const half = INTERSECTION_SPRITE_SIZE / 2;

    // Overlap segments: batched into two strokes (glow + main)
    let hasOverlaps = false;
    ctx.beginPath();
    for (const intersection of intersections) {
      if (intersection.type !== IntersectionType.OVERLAP || !intersection.segment) continue;

      const p1 = worldToScreen(intersection.segment.p1.x, intersection.segment.p1.y);
      const p2 = worldToScreen(intersection.segment.p2.x, intersection.segment.p2.y);

      // Skip segments entirely outside the viewport
      if ((p1.x < -margin && p2.x < -margin) || (p1.x > maxX && p2.x > maxX) ||
          (p1.y < -margin && p2.y < -margin) || (p1.y > maxY && p2.y > maxY)) {
        continue;
      }

      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      hasOverlaps = true;
    }
    if (hasOverlaps) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = canvasColors.intersectionGlow;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = canvasColors.intersection;
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Point markers: sprite stamps, culled to the viewport
    if (!intersectionSprite) return;
    for (const intersection of intersections) {
      if (intersection.type !== IntersectionType.POINT || !intersection.point) continue;

      const screenPos = worldToScreen(intersection.point.x, intersection.point.y);
      if (screenPos.x < -margin || screenPos.x > maxX ||
          screenPos.y < -margin || screenPos.y > maxY) {
        continue;
      }

      ctx.drawImage(
        intersectionSprite,
        screenPos.x - half,
        screenPos.y - half,
        INTERSECTION_SPRITE_SIZE,
        INTERSECTION_SPRITE_SIZE
      );
    }
  }, [worldToScreen, intersections, intersectionSprite, size]);

  const drawCursor = useCallback((ctx: CanvasRenderingContext2D, worldPos: Point) => {
    const screenPos = worldToScreen(worldPos.x, worldPos.y);

    // Draw crosshair with subtle glow
    ctx.strokeStyle = canvasColors.cursor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.shadowColor = canvasColors.cursor;
    ctx.shadowBlur = 4;

    ctx.beginPath();
    ctx.moveTo(screenPos.x - 12, screenPos.y);
    ctx.lineTo(screenPos.x + 12, screenPos.y);
    ctx.moveTo(screenPos.x, screenPos.y - 12);
    ctx.lineTo(screenPos.x, screenPos.y + 12);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Draw coordinates with background for readability
    const coordText = `(${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)})`;
    ctx.font = '11px "SF Mono", "Fira Code", Consolas, monospace';
    const textWidth = ctx.measureText(coordText).width;

    // Background pill
    const padding = 6;
    const bgX = screenPos.x + 14;
    const bgY = screenPos.y - 22;

    ctx.fillStyle = 'rgba(10, 14, 19, 0.85)';
    ctx.beginPath();
    ctx.roundRect(bgX - padding, bgY - 10, textWidth + padding * 2, 18, 4);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Text
    ctx.fillStyle = canvasColors.cursorLabel;
    ctx.fillText(coordText, bgX, bgY + 4);
  }, [worldToScreen]);

  // Draw performance statistics overlay
  const drawStats = useCallback((ctx: CanvasRenderingContext2D, totalCount: number, scale: number) => {
    if (totalCount === 0) return; // Don't show stats when no shapes

    const stats = rendererRef.current?.getStats();
    const geometry = stats
      ? ` | GPU: ${stats.triangles} tris, ${stats.segments} segs`
      : '';
    const statsText = `Shapes: ${totalCount}${geometry} | Zoom: ${scale.toFixed(3)}x`;
    ctx.font = '11px "SF Mono", "Fira Code", Consolas, monospace';

    // Position in bottom-left corner
    const x = 10;
    const y = size.height - 15;

    ctx.fillStyle = '#3ff832ff';
    ctx.fillText(statsText, x, y);
  }, [size.height]);

  // Handle mouse wheel for zooming. Functional update so rapid wheel events
  // between renders each apply to the latest transform (no lost zoom steps).
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;

    setTransform(prev => {
      // Clamp scale - generous limits to allow zooming into small coordinates
      const clampedScale = Math.min(MAX_SCALE, prev.scale * zoomFactor);

      // Zoom relative to screen center: keep the world point at the screen
      // center fixed while changing scale
      const worldCenterX = -prev.offsetX / prev.scale;
      const worldCenterY = prev.offsetY / prev.scale;

      return {
        offsetX: -worldCenterX * clampedScale,
        offsetY: worldCenterY * clampedScale,
        scale: clampedScale
      };
    });
  }, []);

  // Handle mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    const world = screenToWorld(mouseX, mouseY);

    // Status bar readout is written imperatively — no React state, so idle
    // mouse movement does not re-render anything
    if (coordsRef.current) {
      coordsRef.current.textContent = `${world.x.toFixed(2)}, ${world.y.toFixed(2)}`;
    }

    // World position state is only needed by drawing-mode overlays (crosshair
    // and rubber-band line); tracking it outside drawing mode would redraw the
    // overlay on every mouse move
    if (drawingMode) {
      setMouseWorldPos(world);
    }

    // Handle panning
    const last = lastMousePosRef.current;
    if (isPanning && last) {
      const dx = mouseX - last.x;
      const dy = mouseY - last.y;

      setTransform(prev => ({
        ...prev,
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy
      }));
    }

    lastMousePosRef.current = { x: mouseX, y: mouseY };
  }, [isPanning, drawingMode, screenToWorld]);

  // Handle mouse down
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle mouse button or Alt+Left click for panning
      setIsPanning(true);
      e.preventDefault();
    } else if (e.button === 0 && drawingMode && onAddPoint) {
      // Left click for adding points
      const worldPos = screenToWorld(e.clientX, e.clientY);
      onAddPoint(worldPos);
    } else if (e.button === 0 && !drawingMode) {
      // Plain left drag pans when no drawing tool is active
      setIsPanning(true);
      e.preventDefault();
    }
  }, [drawingMode, onAddPoint, screenToWorld]);

  // Handle mouse up
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (e.button === 1 || e.button === 0) {
      setIsPanning(false);
    }
  }, []);

  // Setup event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseLeave = () => {
      setIsPanning(false);
      // The cursor is gone: drop the crosshair position so re-entering
      // drawing mode later does not flash it at a stale location
      setMouseWorldPos(null);
      if (coordsRef.current) coordsRef.current.textContent = '—';
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleWheel, handleMouseDown, handleMouseMove, handleMouseUp]);

  // Fit the view to the shape extents (import, toolbar button, Home key).
  // Exposed imperatively: fitting is a one-off view command, not derived state.
  const fitView = useCallback((shapesToFit?: Shape[]) => {
    if (size.width === 0 || size.height === 0) return;

    const list = shapesToFit ?? shapes;
    const withPoints = list.filter(s => s.points.length > 0);
    const target = withPoints.some(s => s.visible)
      ? withPoints.filter(s => s.visible)
      : withPoints;
    if (target.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const shape of target) {
      for (const p of shape.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }

    const w = maxX - minX;
    const h = maxY - minY;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const margin = 0.9; // leave 10% breathing room around the extents

    setTransform(prev => {
      let scale: number;
      if (w <= 0 && h <= 0) {
        scale = prev.scale; // single point: keep zoom, just center it
      } else {
        scale = margin * Math.min(
          w > 0 ? size.width / w : Infinity,
          h > 0 ? size.height / h : Infinity
        );
      }
      if (!Number.isFinite(scale) || scale <= 0) scale = prev.scale;
      scale = Math.min(MAX_SCALE, scale);

      return { offsetX: -cx * scale, offsetY: cy * scale, scale };
    });
  }, [shapes, size]);

  useImperativeHandle(ref, () => ({ fitView }), [fitView]);

  // Compute intersections while they are shown and the geometry has changed.
  // Styling-only updates (color, layer assignment) are filtered out with
  // sameGeometry so they neither restart the worker nor cancel an in-flight
  // computation. Results stay warm while hidden: re-showing an unchanged
  // scene displays them instantly without recomputing.
  const intersectionRunRef = useRef(0);
  const lastComputedShapesRef = useRef<Shape[] | null>(null);
  useEffect(() => {
    if (!showIntersections) return;

    const last = lastComputedShapesRef.current;
    if (last && sameGeometry(last, shapes)) return;
    lastComputedShapesRef.current = shapes;

    const runId = ++intersectionRunRef.current;
    const isCurrent = () => intersectionRunRef.current === runId;

    onIntersectionComputingChange?.(true);
    IntersectionDetector.findAllIntersections(shapes)
      .then(results => {
        if (!isCurrent()) return;
        setIntersections(results);
        onIntersectionsFound?.(results.length);
        onIntersectionComputingChange?.(false);
      })
      .catch(error => {
        if (!isCurrent()) return; // superseded request — not an error
        console.error('Error computing intersections:', error);
        lastComputedShapesRef.current = null; // allow a retry on the next change
        setIntersections([]);
        onIntersectionComputingChange?.(false);
      });
  }, [shapes, showIntersections, onIntersectionComputingChange, onIntersectionsFound]);

  // Invalidate any in-flight intersection run on unmount
  useEffect(() => {
    const runRef = intersectionRunRef;
    return () => {
      runRef.current++;
    };
  }, []);

  // Render the WebGL geometry layer (only on data / view / size changes)
  useEffect(() => {
    const renderer = rendererRef.current;
    const canvas = glCanvasRef.current;
    if (!renderer || !canvas || size.width === 0) return;

    const deviceWidth = Math.max(1, Math.round(size.width * size.dpr));
    const deviceHeight = Math.max(1, Math.round(size.height * size.dpr));
    if (canvas.width !== deviceWidth) canvas.width = deviceWidth;
    if (canvas.height !== deviceHeight) canvas.height = deviceHeight;

    renderer.render(transform, size.width, size.height, size.dpr);
  }, [shapes, transform, size]);

  // Render the background layer: fill + coordinate grid + user window grid
  useEffect(() => {
    const canvas = gridCanvasRef.current;
    if (!canvas || size.width === 0) return;

    const ctx = setup2dContext(canvas);
    if (!ctx) return;

    ctx.fillStyle = canvasColors.background;
    ctx.fillRect(0, 0, size.width, size.height);

    drawGrid(ctx, size.width, size.height);
    drawUserGrid(ctx);
  }, [size, setup2dContext, drawGrid, drawUserGrid]);

  // Keep the status bar zoom readout in sync (imperative, out of React state)
  useEffect(() => {
    if (zoomRef.current) {
      zoomRef.current.textContent = `${Number(transform.scale.toPrecision(3))}×`;
    }
  }, [transform.scale]);

  // Render the interactive overlay: selection, vertex markers, intersections,
  // temp shape, cursor, stats. Redraws on mouse move without touching the
  // geometry layer.
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || size.width === 0) return;

    const ctx = setup2dContext(canvas);
    if (!ctx) return;

    ctx.clearRect(0, 0, size.width, size.height);

    // Shapes currently in the viewport (spatial index query, no LOD filtering)
    const shapesInView = spatialIndexRef.current.queryViewport(getViewportBounds(), 0, transform.scale);

    // Selected shape highlights
    if (selectedSet.size > 0) {
      for (const shape of shapesInView) {
        if (shape.visible && selectedSet.has(shape.id)) {
          drawSelectedShape(ctx, shape);
        }
      }
    }

    // Vertex markers when zoomed in
    drawPointMarkers(ctx, shapesInView, selectedSet);

    // Intersections if enabled
    if (showIntersections && intersections.length > 0) {
      drawIntersections(ctx);
    }

    // Temporary points during drawing
    if (tempPoints.length > 0) {
      drawTempShape(ctx, tempPoints, drawingMode === 'contour');
    }

    // Mouse cursor position
    if (mouseWorldPos && drawingMode) {
      drawCursor(ctx, mouseWorldPos);
    }

    // Performance stats
    if (showStats) {
      const totalShapes = shapes.filter(s => s.visible).length;
      drawStats(ctx, totalShapes, transform.scale);
    }
  }, [shapes, selectedSet, transform, size, setup2dContext, getViewportBounds, drawSelectedShape,
      drawPointMarkers, drawIntersections, drawTempShape, drawCursor, drawStats,
      tempPoints, drawingMode, mouseWorldPos, showIntersections, intersections, showStats]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : (drawingMode ? 'crosshair' : 'grab')
      }}
    >
      <canvas ref={gridCanvasRef} style={layerStyle} />
      <canvas ref={setupGlCanvas} style={layerStyle} />
      <canvas ref={overlayCanvasRef} style={layerStyle} />
      {glError && (
        <div className="canvas-error-banner">{glError}</div>
      )}
      <div className="canvas-statusbar">
        <span ref={coordsRef}>—</span>
        <span className="canvas-statusbar-sep" />
        <span ref={zoomRef}>1×</span>
      </div>
    </div>
  );
};
