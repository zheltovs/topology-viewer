import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Shape } from '../models';
import { Point, ShapeType } from '../models';
import { tokens } from '../styles';

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
};

interface CanvasProps {
  shapes: Shape[];
  onAddPoint?: (point: Point) => void;
  drawingMode: 'chain' | 'contour' | null;
  tempPoints: Point[];
}

interface ViewTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export const Canvas: React.FC<CanvasProps> = ({
  shapes,
  onAddPoint,
  drawingMode,
  tempPoints
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [transform, setTransform] = useState<ViewTransform>({
    offsetX: 0,
    offsetY: 0,
    scale: 1.0
  });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState<{ x: number; y: number } | null>(null);
  const [mouseWorldPos, setMouseWorldPos] = useState<Point | null>(null);

  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback((screenX: number, screenY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return new Point(0, 0);

    const rect = canvas.getBoundingClientRect();
    const x = (screenX - rect.left - canvas.width / 2 - transform.offsetX) / transform.scale;
    const y = -(screenY - rect.top - canvas.height / 2 - transform.offsetY) / transform.scale;

    return new Point(x, y);
  }, [transform]);

  // Convert world coordinates to screen coordinates
  const worldToScreen = useCallback((worldX: number, worldY: number): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const x = worldX * transform.scale + canvas.width / 2 + transform.offsetX;
    const y = -worldY * transform.scale + canvas.height / 2 + transform.offsetY;

    return { x, y };
  }, [transform]);

  // Handle mouse wheel for zooming
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Zoom factor
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = transform.scale * zoomFactor;

    // Clamp scale
    const clampedScale = Math.max(0.1, Math.min(10, newScale));

    // Adjust offset to zoom towards mouse position
    setTransform(prev => {
      const scale = clampedScale;
      const dx = (mouseX - canvas.width / 2) * (1 - zoomFactor);
      const dy = (mouseY - canvas.height / 2) * (1 - zoomFactor);

      return {
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy,
        scale
      };
    });
  }, [transform, screenToWorld]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Update world position
    const worldPos = screenToWorld(mouseX, mouseY);
    setMouseWorldPos(worldPos);

    // Handle panning
    if (isPanning && lastMousePos) {
      const dx = mouseX - lastMousePos.x;
      const dy = mouseY - lastMousePos.y;

      setTransform(prev => ({
        ...prev,
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy
      }));
    }

    setLastMousePos({ x: mouseX, y: mouseY });
  }, [isPanning, lastMousePos, screenToWorld]);

  // Handle mouse down
  const handleMouseDown = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle mouse button or Alt+Left click for panning
      setIsPanning(true);
      e.preventDefault();
    } else if (e.button === 0 && drawingMode && onAddPoint) {
      // Left click for adding points
      const worldPos = screenToWorld(e.clientX, e.clientY);
      onAddPoint(worldPos);
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
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', () => setIsPanning(false));

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleWheel, handleMouseDown, handleMouseMove, handleMouseUp]);

  // Drawing function
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Clear canvas
    ctx.fillStyle = canvasColors.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Save context
    ctx.save();

    // Draw coordinate axes and grid
    drawGrid(ctx, canvas.width, canvas.height);

    // Draw all shapes
    shapes.forEach(shape => {
      if (shape.visible) {
        drawShape(ctx, shape);
      }
    });

    // Draw temporary points during drawing
    if (tempPoints.length > 0) {
      drawTempShape(ctx, tempPoints, drawingMode === 'contour');
    }

    // Draw mouse cursor position
    if (mouseWorldPos && drawingMode) {
      drawCursor(ctx, mouseWorldPos);
    }

    // Restore context
    ctx.restore();
  }, [shapes, transform, tempPoints, drawingMode, mouseWorldPos, worldToScreen]);

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
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
  };

  // Helper to create fill color from stroke color
  const colorToFill = (color: string, alpha: number = 0.15): string => {
    // Handle hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  };

  const drawShape = (ctx: CanvasRenderingContext2D, shape: Shape) => {
    if (shape.points.length < 2) return;

    const isContour = shape.type === ShapeType.CONTOUR;
    const isSelected = shape.selected;
    const shapeColor = shape.color;

    // Set colors based on shape color and selection state
    if (isSelected) {
      ctx.strokeStyle = canvasColors.selected;
      ctx.fillStyle = canvasColors.selectedFill;
    } else {
      ctx.strokeStyle = shapeColor;
      ctx.fillStyle = isContour ? colorToFill(shapeColor, 0.12) : 'transparent';
    }

    ctx.lineWidth = isSelected ? 2.5 : 2;
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

    // Draw points with glow effect for selected
    shape.points.forEach((point) => {
      const screenPoint = worldToScreen(point.x, point.y);

      if (isSelected) {
        // Outer glow
        ctx.fillStyle = canvasColors.selectedFill;
        ctx.beginPath();
        ctx.arc(screenPoint.x, screenPoint.y, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Main point
      ctx.fillStyle = isSelected ? canvasColors.selected : shapeColor;
      ctx.beginPath();
      ctx.arc(screenPoint.x, screenPoint.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Inner highlight
      ctx.fillStyle = canvasColors.point;
      ctx.beginPath();
      ctx.arc(screenPoint.x, screenPoint.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const drawTempShape = (ctx: CanvasRenderingContext2D, points: Point[], isContour: boolean) => {
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
  };

  const drawCursor = (ctx: CanvasRenderingContext2D, worldPos: Point) => {
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
  };

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        cursor: isPanning ? 'grabbing' : (drawingMode ? 'crosshair' : 'default')
      }}
    />
  );
};
