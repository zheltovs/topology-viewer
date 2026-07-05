/**
 * WebGL2 renderer for shape geometry.
 *
 * All shape geometry (contour fills + chain/contour outlines) is uploaded to
 * static GPU buffers once per data change; pan/zoom only updates a uniform,
 * so frame cost is independent of scene complexity on the CPU side.
 *
 * Fills are triangulated with earcut (cached per points array). Outlines are
 * rendered as instanced screen-space quads so line width stays constant in
 * CSS pixels at any zoom, matching the previous Canvas 2D look.
 *
 * Vertex coordinates are stored relative to the scene center (subtracted in
 * double precision) to avoid float32 jitter at large GDS coordinates.
 */

import earcut from 'earcut';
import type { Shape } from '../models';
import { ShapeType } from '../models';
import type { Point } from '../models';

export interface ViewTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface RendererStats {
  shapes: number;
  triangles: number;
  segments: number;
}

const FILL_ALPHA_BYTE = Math.round(0.12 * 255);
const LINE_WIDTH_CSS = 2;

const FILL_VS = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aColor;
uniform vec4 uTransform; // sx, sy, tx, ty: clip = pos * s + t
out vec4 vColor;
void main() {
  gl_Position = vec4(aPos * uTransform.xy + uTransform.zw, 0.0, 1.0);
  vColor = aColor;
}`;

const FILL_FS = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 outColor;
void main() { outColor = vColor; }`;

// Each segment instance is expanded into a screen-space quad. Endpoints are
// extended by half the line width along the segment direction (square caps),
// which visually closes the joints between consecutive segments.
const LINE_VS = `#version 300 es
layout(location=0) in vec2 aCorner; // x: 0|1 along segment, y: -1|1 across
layout(location=1) in vec4 aSeg;    // p1.xy, p2.xy (center-relative world)
layout(location=2) in vec4 aColor;
uniform vec4 uTransform;
uniform vec2 uViewportPx;
uniform float uHalfWidthPx;
out vec4 vColor;
void main() {
  vec2 c1 = aSeg.xy * uTransform.xy + uTransform.zw;
  vec2 c2 = aSeg.zw * uTransform.xy + uTransform.zw;
  vec2 s1 = (c1 * 0.5 + 0.5) * uViewportPx;
  vec2 s2 = (c2 * 0.5 + 0.5) * uViewportPx;
  vec2 d = s2 - s1;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  vec2 pos = mix(s1, s2, aCorner.x)
           + n * (aCorner.y * uHalfWidthPx)
           + dir * ((aCorner.x * 2.0 - 1.0) * uHalfWidthPx);
  gl_Position = vec4(pos / uViewportPx * 2.0 - 1.0, 0.0, 1.0);
  vColor = aColor;
}`;

interface Triangulation {
  ring: Float64Array; // flat x,y without the duplicate closing vertex
  indices: Uint32Array;
}

function parseHexColor(color: string): [number, number, number] {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
  }
  return [136, 136, 136];
}

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;

  private fillProgram: WebGLProgram;
  private lineProgram: WebGLProgram;

  private fillVao: WebGLVertexArrayObject;
  private lineVao: WebGLVertexArrayObject;

  private fillPosBuf: WebGLBuffer;
  private fillColBuf: WebGLBuffer;
  private fillIdxBuf: WebGLBuffer;
  private cornerBuf: WebGLBuffer;
  private segBuf: WebGLBuffer;
  private segColBuf: WebGLBuffer;

  private uFillTransform: WebGLUniformLocation | null;
  private uLineTransform: WebGLUniformLocation | null;
  private uViewportPx: WebGLUniformLocation | null;
  private uHalfWidthPx: WebGLUniformLocation | null;

  private fillIndexCount = 0;
  private segCount = 0;
  private shapeCount = 0;
  private centerX = 0;
  private centerY = 0;

  // Triangulations survive selection/visibility toggles because those React
  // updates replace shape objects but keep the same points arrays.
  private triCache = new WeakMap<Point[], Triangulation>();

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      depth: false,
      stencil: false,
    });
    if (!gl) {
      throw new Error('WebGL2 is not supported');
    }
    this.gl = gl;

    this.fillProgram = this.createProgram(FILL_VS, FILL_FS);
    this.lineProgram = this.createProgram(LINE_VS, FILL_FS);

    this.uFillTransform = gl.getUniformLocation(this.fillProgram, 'uTransform');
    this.uLineTransform = gl.getUniformLocation(this.lineProgram, 'uTransform');
    this.uViewportPx = gl.getUniformLocation(this.lineProgram, 'uViewportPx');
    this.uHalfWidthPx = gl.getUniformLocation(this.lineProgram, 'uHalfWidthPx');

    this.fillPosBuf = gl.createBuffer()!;
    this.fillColBuf = gl.createBuffer()!;
    this.fillIdxBuf = gl.createBuffer()!;
    this.cornerBuf = gl.createBuffer()!;
    this.segBuf = gl.createBuffer()!;
    this.segColBuf = gl.createBuffer()!;

    // Fill VAO: position (f32 x2) + color (u8 x4 normalized) + index buffer
    this.fillVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.fillVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillPosBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillColBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.fillIdxBuf);

    // Line VAO: static quad corners + per-instance segment endpoints and color
    this.lineVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.segBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.segColBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    gl.bindVertexArray(null);
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compile error: ${info}`);
      }
      return shader;
    };

    const vs = compile(gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program link error: ${info}`);
    }
    return program;
  }

  private getTriangulation(points: Point[]): Triangulation {
    let cached = this.triCache.get(points);
    if (cached) return cached;

    // Drop the duplicate closing vertex — earcut expects an open ring
    let n = points.length;
    if (n > 1 && points[0].x === points[n - 1].x && points[0].y === points[n - 1].y) {
      n--;
    }
    const ring = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      ring[i * 2] = points[i].x;
      ring[i * 2 + 1] = points[i].y;
    }
    const indices = n >= 3 ? new Uint32Array(earcut(ring)) : new Uint32Array(0);
    cached = { ring, indices };
    this.triCache.set(points, cached);
    return cached;
  }

  /**
   * Rebuild GPU buffers from the current shape list.
   * Cost is O(total points); triangulation is cached per points array.
   */
  setShapes(shapes: Shape[]): void {
    interface Item {
      shape: Shape;
      tri: Triangulation | null;
      rgb: [number, number, number];
      closeSeg: boolean;
    }

    let fillVtxCount = 0;
    let fillIdxCount = 0;
    let segCount = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const items: Item[] = [];

    for (const shape of shapes) {
      if (!shape.visible || shape.points.length < 2) continue;

      const isContour = shape.type === ShapeType.CONTOUR;
      const tri = isContour ? this.getTriangulation(shape.points) : null;
      if (tri && tri.indices.length > 0) {
        fillVtxCount += tri.ring.length / 2;
        fillIdxCount += tri.indices.length;
      }

      const pts = shape.points;
      const first = pts[0];
      const last = pts[pts.length - 1];
      // Contour points normally include a duplicate closing vertex; add an
      // explicit closing segment only when they don't.
      const closeSeg = isContour && (first.x !== last.x || first.y !== last.y);
      segCount += pts.length - 1 + (closeSeg ? 1 : 0);

      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }

      items.push({ shape, tri, rgb: parseHexColor(shape.color), closeSeg });
    }

    const cx = items.length > 0 ? (minX + maxX) / 2 : 0;
    const cy = items.length > 0 ? (minY + maxY) / 2 : 0;
    this.centerX = cx;
    this.centerY = cy;

    const fillPos = new Float32Array(fillVtxCount * 2);
    const fillCol = new Uint8Array(fillVtxCount * 4);
    const fillIdx = new Uint32Array(fillIdxCount);
    const segData = new Float32Array(segCount * 4);
    const segCol = new Uint8Array(segCount * 4);

    let vBase = 0;
    let iOff = 0;
    let sOff = 0;

    for (const { shape, tri, rgb, closeSeg } of items) {
      const [r, g, b] = rgb;

      if (tri && tri.indices.length > 0) {
        const n = tri.ring.length / 2;
        for (let i = 0; i < n; i++) {
          fillPos[(vBase + i) * 2] = tri.ring[i * 2] - cx;
          fillPos[(vBase + i) * 2 + 1] = tri.ring[i * 2 + 1] - cy;
          const c = (vBase + i) * 4;
          fillCol[c] = r;
          fillCol[c + 1] = g;
          fillCol[c + 2] = b;
          fillCol[c + 3] = FILL_ALPHA_BYTE;
        }
        for (let i = 0; i < tri.indices.length; i++) {
          fillIdx[iOff + i] = tri.indices[i] + vBase;
        }
        vBase += n;
        iOff += tri.indices.length;
      }

      const pts = shape.points;
      const segEnd = pts.length - 1;
      for (let i = 0; i < segEnd; i++) {
        const o = sOff * 4;
        segData[o] = pts[i].x - cx;
        segData[o + 1] = pts[i].y - cy;
        segData[o + 2] = pts[i + 1].x - cx;
        segData[o + 3] = pts[i + 1].y - cy;
        segCol[o] = r;
        segCol[o + 1] = g;
        segCol[o + 2] = b;
        segCol[o + 3] = 255;
        sOff++;
      }
      if (closeSeg) {
        const o = sOff * 4;
        segData[o] = pts[segEnd].x - cx;
        segData[o + 1] = pts[segEnd].y - cy;
        segData[o + 2] = pts[0].x - cx;
        segData[o + 3] = pts[0].y - cy;
        segCol[o] = r;
        segCol[o + 1] = g;
        segCol[o + 2] = b;
        segCol[o + 3] = 255;
        sOff++;
      }
    }

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, fillPos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillColBuf);
    gl.bufferData(gl.ARRAY_BUFFER, fillCol, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.segBuf);
    gl.bufferData(gl.ARRAY_BUFFER, segData, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.segColBuf);
    gl.bufferData(gl.ARRAY_BUFFER, segCol, gl.STATIC_DRAW);
    // ELEMENT_ARRAY_BUFFER binding is part of VAO state
    gl.bindVertexArray(this.fillVao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.fillIdxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, fillIdx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.fillIndexCount = fillIdxCount;
    this.segCount = segCount;
    this.shapeCount = items.length;
  }

  /**
   * Draw the scene. cssWidth/cssHeight are the canvas CSS-pixel dimensions;
   * the backing store is expected to be cssWidth*dpr x cssHeight*dpr.
   */
  render(view: ViewTransform, cssWidth: number, cssHeight: number, dpr: number): void {
    const gl = this.gl;

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (cssWidth <= 0 || cssHeight <= 0) return;

    // clip = world * s + t, matching worldToScreen in Canvas.tsx.
    // t incorporates the scene center offset, computed in double precision.
    const sx = (2 * view.scale) / cssWidth;
    const sy = (2 * view.scale) / cssHeight;
    const tx = (2 * view.offsetX) / cssWidth + this.centerX * sx;
    const ty = (-2 * view.offsetY) / cssHeight + this.centerY * sy;

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    if (this.fillIndexCount > 0) {
      gl.useProgram(this.fillProgram);
      gl.bindVertexArray(this.fillVao);
      gl.uniform4f(this.uFillTransform, sx, sy, tx, ty);
      gl.drawElements(gl.TRIANGLES, this.fillIndexCount, gl.UNSIGNED_INT, 0);
    }

    if (this.segCount > 0) {
      gl.useProgram(this.lineProgram);
      gl.bindVertexArray(this.lineVao);
      gl.uniform4f(this.uLineTransform, sx, sy, tx, ty);
      gl.uniform2f(this.uViewportPx, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(this.uHalfWidthPx, (LINE_WIDTH_CSS * dpr) / 2);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.segCount);
    }

    gl.bindVertexArray(null);
  }

  getStats(): RendererStats {
    return {
      shapes: this.shapeCount,
      triangles: this.fillIndexCount / 3,
      segments: this.segCount,
    };
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.fillPosBuf);
    gl.deleteBuffer(this.fillColBuf);
    gl.deleteBuffer(this.fillIdxBuf);
    gl.deleteBuffer(this.cornerBuf);
    gl.deleteBuffer(this.segBuf);
    gl.deleteBuffer(this.segColBuf);
    gl.deleteVertexArray(this.fillVao);
    gl.deleteVertexArray(this.lineVao);
    gl.deleteProgram(this.fillProgram);
    gl.deleteProgram(this.lineProgram);
  }
}
