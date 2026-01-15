import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Shape } from '../models';
import { Point, ShapeType } from '../models';

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
    ctx.fillStyle = '#ffffff';
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
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#666';

    // Calculate grid spacing based on scale
    const baseSpacing = 50; // pixels
    const worldSpacing = Math.pow(10, Math.floor(Math.log10(baseSpacing / transform.scale)));
    const screenSpacing = worldSpacing * transform.scale;

    // Draw vertical grid lines
    const centerX = width / 2 + transform.offsetX;
    const startX = Math.floor((-centerX) / screenSpacing) * screenSpacing + centerX;

    for (let x = startX; x < width; x += screenSpacing) {
      const worldX = (x - centerX) / transform.scale;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Draw label
      if (Math.abs(worldX) > 0.001 || Math.abs(x - centerX) > 5) {
        ctx.fillText(worldX.toFixed(2), x + 2, height / 2 + transform.offsetY + 12);
      }
    }

    // Draw horizontal grid lines
    const centerY = height / 2 + transform.offsetY;
    const startY = Math.floor((-centerY) / screenSpacing) * screenSpacing + centerY;

    for (let y = startY; y < height; y += screenSpacing) {
      const worldY = -(y - centerY) / transform.scale;

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Draw label
      if (Math.abs(worldY) > 0.001 || Math.abs(y - centerY) > 5) {
        ctx.fillText(worldY.toFixed(2), width / 2 + transform.offsetX + 5, y - 2);
      }
    }

    // Draw axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;

    // X-axis
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Y-axis
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();

    // Draw origin
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('(0, 0)', centerX + 5, centerY - 5);
  };

  const drawShape = (ctx: CanvasRenderingContext2D, shape: Shape) => {
    if (shape.points.length < 2) return;

    ctx.strokeStyle = shape.selected ? '#ff0000' : '#0066cc';
    ctx.lineWidth = shape.selected ? 3 : 2;
    ctx.fillStyle = shape.type === ShapeType.CONTOUR ? 'rgba(0, 102, 204, 0.1)' : 'transparent';

    ctx.beginPath();
    const firstPoint = worldToScreen(shape.points[0].x, shape.points[0].y);
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (let i = 1; i < shape.points.length; i++) {
      const point = worldToScreen(shape.points[i].x, shape.points[i].y);
      ctx.lineTo(point.x, point.y);
    }

    if (shape.type === ShapeType.CONTOUR) {
      ctx.closePath();
      ctx.fill();
    }

    ctx.stroke();

    // Draw points
    ctx.fillStyle = shape.selected ? '#ff0000' : '#0066cc';
    shape.points.forEach((point) => {
      const screenPoint = worldToScreen(point.x, point.y);
      ctx.beginPath();
      ctx.arc(screenPoint.x, screenPoint.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const drawTempShape = (ctx: CanvasRenderingContext2D, points: Point[], isContour: boolean) => {
    if (points.length === 0) return;

    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

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

    // Draw points
    ctx.fillStyle = '#ff6600';
    points.forEach(point => {
      const screenPoint = worldToScreen(point.x, point.y);
      ctx.beginPath();
      ctx.arc(screenPoint.x, screenPoint.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const drawCursor = (ctx: CanvasRenderingContext2D, worldPos: Point) => {
    const screenPos = worldToScreen(worldPos.x, worldPos.y);

    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    // Draw crosshair
    ctx.beginPath();
    ctx.moveTo(screenPos.x - 10, screenPos.y);
    ctx.lineTo(screenPos.x + 10, screenPos.y);
    ctx.moveTo(screenPos.x, screenPos.y - 10);
    ctx.lineTo(screenPos.x, screenPos.y + 10);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw coordinates
    ctx.fillStyle = '#333';
    ctx.font = '11px monospace';
    ctx.fillText(
      `(${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)})`,
      screenPos.x + 12,
      screenPos.y - 12
    );
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
