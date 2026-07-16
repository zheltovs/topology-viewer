import { Point, Chain, Contour, createLayer, LAYER_COLORS } from '../models';
import type { Shape, Layer } from '../models';
import type { BinaryShapeParser } from './ShapeParser';
import { strokePathToPoints } from './strokePath';
import { readGdsReal8, readGdsString } from './gdsReal';

const RecordType = {
  Header: 0x00,
  BgnLib: 0x01,
  LibName: 0x02,
  Units: 0x03,
  EndLib: 0x04,
  BgnStr: 0x05,
  StrName: 0x06,
  EndStr: 0x07,
  Boundary: 0x08,
  Path: 0x09,
  Sref: 0x0a,
  Aref: 0x0b,
  Text: 0x0c,
  Layer: 0x0d,
  DataType: 0x0e,
  Width: 0x0f,
  Xy: 0x10,
  Endel: 0x11,
  SName: 0x12,
  ColRow: 0x13,
  TextNode: 0x14,
  Node: 0x15,
  TextType: 0x16,
  Presentation: 0x17,
  String: 0x19,
  Strans: 0x1a,
  Mag: 0x1b,
  Angle: 0x1c,
  RefLibs: 0x1f,
  Fonts: 0x20,
  PathType: 0x21,
  Generations: 0x22,
  AttrTable: 0x23,
  PropAttr: 0x2b,
  PropValue: 0x2c,
  Box: 0x2d,
  BoxType: 0x2e,
  BgnExtn: 0x30,
  EndExtn: 0x31,
} as const;

const DataType = {
  NoData: 0x00,
  BitArray: 0x01,
  Int2: 0x02,
  Int4: 0x03,
  Real4: 0x04,
  Real8: 0x05,
  String: 0x06
} as const;

const RECORD_HEADER_SIZE = 4;
/** Safety cap so a pathological hierarchy (huge AREF / deep recursion) cannot OOM the tab. */
const MAX_FLATTENED_SHAPES = 2_000_000;

/**
 * Physical-unit metadata parsed from the GDSII UNITS record.
 *   dbToUser    = size of one database unit, expressed in user units (first REAL8).
 *   metersPerDb = size of one database unit, expressed in meters (second REAL8).
 * Both default to 1 when the file has no UNITS record.
 */
export interface GdsUnits {
  dbToUser: number;
  metersPerDb: number;
}

export interface Gds2ParseResult {
  shapes: Shape[];
  layers: Layer[];
  units?: GdsUnits;
}

export interface Gds2LayerInfo {
  layers: Layer[];
  objectCounts: Map<string, number>; // layerId -> object count
  units?: GdsUnits;
}

type ElementKind = 'boundary' | 'path' | 'box';

interface ParsedElement {
  kind: ElementKind;
  layer: number;
  datatype: number;
  points: Point[];
  width: number;
  pathType: number;
  bgnExtn: number;
  endExtn: number;
}

interface Placement {
  aref: boolean;
  cellName: string;
  reflect: boolean;
  mag: number;
  angle: number; // degrees
  cols: number;
  rows: number;
  origin: Point;
  colPitch: Point; // per-column translation (AREF)
  rowPitch: Point; // per-row translation (AREF)
}

class Structure {
  name = '';
  elements: ParsedElement[] = [];
  placements: Placement[] = [];
}

interface LayerKey {
  layer: number;
  datatype: number;
}

interface Library {
  structures: Map<string, Structure>;
  structureOrder: string[];
  /** Size of one database unit in user units (UNITS first REAL8). */
  dbToUser: number;
  /** Size of one database unit in meters (UNITS second REAL8). */
  metersPerDb: number;
  /** Distinct (layer, datatype) pairs in first-seen order. */
  layerKeys: LayerKey[];
}

/** A flattened geometry record in DB units, before scaling/layering. */
interface FlatShape {
  kind: ElementKind;
  layer: number;
  datatype: number;
  points: Point[];
  width: number;
  pathType: number;
  bgnExtn: number;
  endExtn: number;
}

/** 2D affine transform: x' = a*x + b*y + tx, y' = c*x + d*y + ty. */
interface Xform {
  a: number; b: number; c: number; d: number; tx: number; ty: number;
}

const IDENTITY: Xform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

const applyXform = (p: Point, m: Xform): Point =>
  new Point(m.a * p.x + m.b * p.y + m.tx, m.c * p.x + m.d * p.y + m.ty);

/** Returns parent ∘ child (child applied first, then parent). */
function composeXform(parent: Xform, child: Xform): Xform {
  return {
    a: parent.a * child.a + parent.b * child.c,
    b: parent.a * child.b + parent.b * child.d,
    c: parent.c * child.a + parent.d * child.c,
    d: parent.c * child.b + parent.d * child.d,
    tx: parent.a * child.tx + parent.b * child.ty + parent.tx,
    ty: parent.c * child.tx + parent.d * child.ty + parent.ty,
  };
}

/** Builds the affine matrix for an SREF/AREF placement (reflect → magnify → rotate → translate). */
function placementMatrix(p: Placement): Xform {
  const fr = p.reflect ? -1 : 1;
  const m = p.mag;
  const rad = (p.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // L = R · S · F  with F=[[1,0],[0,fr]], S=[[m,0],[0,m]], R=[[cos,-sin],[sin,cos]]
  return {
    a: cos * m,
    b: -sin * m * fr,
    c: sin * m,
    d: cos * m * fr,
    tx: p.origin.x,
    ty: p.origin.y,
  };
}

/**
 * Reads an XY record's coordinate pairs, accepting both legal Int4 and Int2
 * encodings. The pair count is bounded only by the record's own data length
 * (a 16-bit record length allows up to 8191 Int4 pairs): the old Calma spec
 * recommends at most 200 vertices per element, but files produced by modern
 * tools routinely exceed that, and truncating would silently corrupt geometry.
 */
function readXy(view: DataView, offset: number, length: number, dataType: number): Point[] {
  const pts: Point[] = [];
  if (dataType === DataType.Int4) {
    const pairs = Math.floor(length / 8);
    for (let i = 0; i < pairs; i++) {
      const base = offset + i * 8;
      pts.push(new Point(view.getInt32(base, false), view.getInt32(base + 4, false)));
    }
  } else if (dataType === DataType.Int2) {
    const pairs = Math.floor(length / 4);
    for (let i = 0; i < pairs; i++) {
      const base = offset + i * 4;
      pts.push(new Point(view.getInt16(base, false), view.getInt16(base + 2, false)));
    }
  }
  return pts;
}

function minPointsFor(kind: ElementKind): number {
  return kind === 'path' ? 2 : 3; // boundary/box are closed polygons (≥3 vertices)
}

/** Strokes/compiles a parsed element into its raw geometry points in DB units. */
function buildElementPoints(el: ParsedElement): { type: 'contour' | 'chain'; points: Point[] } {
  if (el.kind === 'path') {
    if (el.width > 0) {
      const ring = strokePathToPoints(el.points, el.width, el.pathType, el.bgnExtn, el.endExtn);
      if (ring && ring.length >= 3) return { type: 'contour', points: ring };
    }
    return { type: 'chain', points: el.points };
  }
  // boundary / box → closed filled polygon
  return { type: 'contour', points: el.points };
}

/**
 * First pass: walk the stream once and collect every structure, its elements
 * and placements, the UNITS conversion factor and the distinct layer/datatype keys.
 */
function collectLibrary(view: DataView): Library {
  const structures = new Map<string, Structure>();
  const structureOrder: string[] = [];
  const layerKeyMap = new Map<string, LayerKey>();
  let dbToUser = 1;
  let metersPerDb = 1;

  let current: Structure | null = null;

  // element state
  let elementKind: ElementKind | null = null;
  let elLayer: number | null = null;
  let elDatatype = 0;
  let elWidth = 0;
  let elPathType = 0;
  let elBgnExtn = 0;
  let elEndExtn = 0;
  let elPoints: Point[] = [];

  // placement state
  let inPlacement = false;
  let plAref = false;
  let plCellName = '';
  let plReflect = false;
  let plMag = 1;
  let plAngle = 0;
  let plCols = 1;
  let plRows = 1;
  let plXY: Point[] = [];

  const noteLayerKey = (layer: number, datatype: number) => {
    const key = `${layer}:${datatype}`;
    if (!layerKeyMap.has(key)) layerKeyMap.set(key, { layer, datatype });
  };

  const resetElement = () => {
    elementKind = null;
    elLayer = null;
    elDatatype = 0;
    elWidth = 0;
    elPathType = 0;
    elBgnExtn = 0;
    elEndExtn = 0;
    elPoints = [];
  };

  const resetPlacement = () => {
    inPlacement = false;
    plAref = false;
    plCellName = '';
    plReflect = false;
    plMag = 1;
    plAngle = 0;
    plCols = 1;
    plRows = 1;
    plXY = [];
  };

  const finishElement = () => {
    if (elementKind && current && elPoints.length >= minPointsFor(elementKind)) {
      const layer = elLayer ?? 0;
      current.elements.push({
        kind: elementKind,
        layer,
        datatype: elDatatype,
        points: elPoints,
        width: elWidth,
        pathType: elPathType,
        bgnExtn: elBgnExtn,
        endExtn: elEndExtn,
      });
      noteLayerKey(layer, elDatatype);
    }
    resetElement();
  };

  const finishPlacement = () => {
    if (inPlacement && current && plCellName && plXY.length >= 1) {
      const origin = plXY[0];
      const placement: Placement = {
        aref: plAref,
        cellName: plCellName,
        reflect: plReflect,
        mag: plMag,
        angle: plAngle,
        cols: plCols,
        rows: plRows,
        origin,
        colPitch: plAref && plXY.length >= 2 && plCols > 0
          ? new Point((plXY[1].x - origin.x) / plCols, (plXY[1].y - origin.y) / plCols)
          : new Point(0, 0),
        rowPitch: plAref && plXY.length >= 3 && plRows > 0
          ? new Point((plXY[2].x - origin.x) / plRows, (plXY[2].y - origin.y) / plRows)
          : new Point(0, 0),
      };
      current.placements.push(placement);
    }
    resetPlacement();
  };

  // Validate the stream begins with a HEADER record.
  if (view.byteLength >= RECORD_HEADER_SIZE) {
    const firstType = view.getUint8(2);
    if (firstType !== RecordType.Header) {
      throw new Error('Not a GDSII stream: first record is not HEADER.');
    }
  }

  let offset = 0;
  while (offset + RECORD_HEADER_SIZE <= view.byteLength) {
    const recordLength = view.getUint16(offset, false);
    if (recordLength < RECORD_HEADER_SIZE) {
      throw new Error(
        `Invalid GDS2 record length: ${recordLength}. Expected at least ${RECORD_HEADER_SIZE} bytes.`
      );
    }
    const recordType = view.getUint8(offset + 2);
    const dataType = view.getUint8(offset + 3);
    const dataOffset = offset + RECORD_HEADER_SIZE;
    const dataLength = recordLength - RECORD_HEADER_SIZE;
    if (dataOffset + dataLength > view.byteLength) {
      throw new Error('Unexpected end of GDS2 data.');
    }

    switch (recordType) {
      case RecordType.StrName:
        finishElement();
        finishPlacement();
        current = new Structure();
        current.name = readGdsString(view, dataOffset, dataLength);
        structures.set(current.name, current);
        structureOrder.push(current.name);
        break;
      case RecordType.EndStr:
        finishElement();
        finishPlacement();
        current = null;
        break;
      case RecordType.Boundary:
      case RecordType.Path:
      case RecordType.Box:
        finishPlacement();
        finishElement();
        elementKind = recordType === RecordType.Boundary ? 'boundary'
          : recordType === RecordType.Path ? 'path' : 'box';
        break;
      case RecordType.Sref:
      case RecordType.Aref:
        finishElement();
        finishPlacement();
        inPlacement = true;
        plAref = recordType === RecordType.Aref;
        break;
      case RecordType.Layer:
        if (dataType === DataType.Int2 && dataLength >= 2) elLayer = view.getInt16(dataOffset, false);
        break;
      case RecordType.DataType:
      case RecordType.BoxType:
        if (dataType === DataType.Int2 && dataLength >= 2) elDatatype = view.getInt16(dataOffset, false);
        break;
      case RecordType.Width:
        if (dataType === DataType.Int4 && dataLength >= 4) elWidth = view.getInt32(dataOffset, false);
        break;
      case RecordType.PathType:
        if (dataType === DataType.Int2 && dataLength >= 2) elPathType = view.getInt16(dataOffset, false);
        break;
      case RecordType.BgnExtn:
        if (dataType === DataType.Int4 && dataLength >= 4) elBgnExtn = view.getInt32(dataOffset, false);
        break;
      case RecordType.EndExtn:
        if (dataType === DataType.Int4 && dataLength >= 4) elEndExtn = view.getInt32(dataOffset, false);
        break;
      case RecordType.SName:
        if (dataType === DataType.String) plCellName = readGdsString(view, dataOffset, dataLength);
        break;
      case RecordType.Strans:
        if (dataType === DataType.BitArray && dataLength >= 2) {
          const bits = view.getUint16(dataOffset, false);
          plReflect = (bits & 0x8000) !== 0; // bit 15 = reflect about X
        }
        break;
      case RecordType.Mag:
        if (dataType === DataType.Real8 && dataLength >= 8) plMag = readGdsReal8(view, dataOffset);
        break;
      case RecordType.Angle:
        if (dataType === DataType.Real8 && dataLength >= 8) plAngle = readGdsReal8(view, dataOffset);
        break;
      case RecordType.ColRow:
        if (dataType === DataType.Int2 && dataLength >= 4) {
          plCols = view.getInt16(dataOffset, false);
          plRows = view.getInt16(dataOffset + 2, false);
          if (plCols < 1) plCols = 1;
          if (plRows < 1) plRows = 1;
        }
        break;
      case RecordType.Xy:
        if (elementKind) {
          elPoints = elPoints.concat(readXy(view, dataOffset, dataLength, dataType));
        } else if (inPlacement) {
          plXY = plXY.concat(readXy(view, dataOffset, dataLength, dataType));
        }
        break;
      case RecordType.Units:
        if (dataType === DataType.Real8 && dataLength >= 8) {
          const userUnitsPerDb = readGdsReal8(view, dataOffset); // first real8
          if (userUnitsPerDb > 0 && Number.isFinite(userUnitsPerDb)) dbToUser = userUnitsPerDb;
          if (dataLength >= 16) {
            const mPerDb = readGdsReal8(view, dataOffset + 8); // second real8
            if (mPerDb > 0 && Number.isFinite(mPerDb)) metersPerDb = mPerDb;
          }
        }
        break;
      case RecordType.Endel:
        if (inPlacement) finishPlacement();
        else finishElement();
        break;
      case RecordType.EndLib:
        return {
          structures, structureOrder, dbToUser, metersPerDb,
          layerKeys: Array.from(layerKeyMap.values()),
        };
      default:
        break; // forward-compatible: ignore unknown records
    }

    offset += recordLength;
  }

  return {
    structures, structureOrder, dbToUser, metersPerDb,
    layerKeys: Array.from(layerKeyMap.values()),
  };
}

/**
 * Second pass: flatten the hierarchy. Top cells are structures not referenced by
 * any placement (the standard "top cell" definition); if every cell is referenced
 * (or none) the last-defined structure is used as a fallback. Placements apply
 * reflect → magnify → rotate → translate; AREF replicates cols × rows.
 */
function flattenLibrary(lib: Library): FlatShape[] {
  const out: FlatShape[] = [];
  if (lib.structureOrder.length === 0) return out;

  const referenced = new Set<string>();
  for (const s of lib.structures.values()) {
    for (const p of s.placements) referenced.add(p.cellName);
  }
  const tops = lib.structureOrder.filter(name => !referenced.has(name));
  const roots = tops.length > 0
    ? tops
    : [lib.structureOrder[lib.structureOrder.length - 1]];

  let count = 0;
  const visiting = new Set<string>();

  const recurse = (name: string, xform: Xform) => {
    if (count >= MAX_FLATTENED_SHAPES) return;
    if (visiting.has(name)) return; // cycle guard
    visiting.add(name);
    const s = lib.structures.get(name);
    if (s) {
      for (const el of s.elements) {
        if (count >= MAX_FLATTENED_SHAPES) break;
        const built = buildElementPoints(el);
        const tpts = built.points.map(p => applyXform(p, xform));
        out.push({
          kind: el.kind, layer: el.layer, datatype: el.datatype, points: tpts,
          width: el.width, pathType: el.pathType, bgnExtn: el.bgnExtn, endExtn: el.endExtn,
        });
        count++;
      }
      for (const p of s.placements) {
        if (count >= MAX_FLATTENED_SHAPES) break;
        const linear = placementMatrix(p); // reflect/mag/angle, translation overridden per instance
        if (p.aref) {
          for (let i = 0; i < p.cols; i++) {
            for (let j = 0; j < p.rows; j++) {
              if (count >= MAX_FLATTENED_SHAPES) break;
              const instanceXform = composeXform(xform, {
                a: linear.a, b: linear.b, c: linear.c, d: linear.d,
                tx: p.origin.x + i * p.colPitch.x + j * p.rowPitch.x,
                ty: p.origin.y + i * p.colPitch.y + j * p.rowPitch.y,
              });
              recurse(p.cellName, instanceXform);
            }
          }
        } else {
          recurse(p.cellName, composeXform(xform, linear));
        }
      }
    }
    visiting.delete(name);
  };

  for (const root of roots) recurse(root, IDENTITY);
  return out;
}

/**
 * Builds a viewer Shape from a flattened record.
 *
 * Coordinates are intentionally kept in raw GDS database units — matching the
 * reference viewer and the previous behavior — so the UNITS db→user factor is
 * NOT applied here. (It is still parsed into `Library.dbToUser` as metadata;
 * use the toolbar scale control if physical/user-unit display is desired.)
 */
function buildShape(flat: FlatShape, color: string, layerId: string): Shape {
  // Paths with positive width were stroked into a closed polygon during flatten;
  // zero-width paths keep their open centerline. Boundaries/boxes are closed.
  const isContour = flat.kind !== 'path' || flat.width > 0;
  return isContour
    ? new Contour(flat.points, undefined, color, layerId)
    : new Chain(flat.points, undefined, color, layerId);
}

const layerName = (layer: number, datatype: number) =>
  datatype === 0 ? `Layer ${layer}` : `Layer ${layer} (type ${datatype})`;

export class Gds2Parser implements BinaryShapeParser {
  parseShapes(input: ArrayBuffer): Shape[] {
    return this.parseWithLayers(input).shapes;
  }

  /**
   * Scans the GDS file (collect + flatten) to extract layer information and count
   * objects per (layer, datatype). Used for previewing layers before full import.
   */
  scanLayers(input: ArrayBuffer): Gds2LayerInfo {
    const view = new DataView(input);
    const lib = collectLibrary(view);
    const flat = flattenLibrary(lib);

    const layers: Layer[] = [];
    const objectCounts = new Map<string, number>();
    const byKey = new Map<string, Layer>();
    for (let i = 0; i < lib.layerKeys.length; i++) {
      const { layer, datatype } = lib.layerKeys[i];
      const layerObj = createLayer(
        layerName(layer, datatype),
        LAYER_COLORS[i % LAYER_COLORS.length],
        layer,
        datatype
      );
      layers.push(layerObj);
      byKey.set(`${layer}:${datatype}`, layerObj);
      objectCounts.set(layerObj.id, 0);
    }
    for (const f of flat) {
      const layerObj = byKey.get(`${f.layer}:${f.datatype}`);
      if (layerObj) objectCounts.set(layerObj.id, (objectCounts.get(layerObj.id) || 0) + 1);
    }
    return { layers, objectCounts, units: { dbToUser: lib.dbToUser, metersPerDb: lib.metersPerDb } };
  }

  parseWithLayerFilter(input: ArrayBuffer, allowedLayerIds: Set<string>, layerMap: Map<string, Layer>): Gds2ParseResult {
    const view = new DataView(input);
    const lib = collectLibrary(view);
    const flat = flattenLibrary(lib);

    // Index the caller-provided layers by (layer, datatype) for matching.
    const byKey = new Map<string, Layer>();
    for (const l of layerMap.values()) {
      byKey.set(`${l.gdsLayerNumber ?? 0}:${l.gdsDataType ?? 0}`, l);
    }

    const shapes: Shape[] = [];
    const usedLayers = new Map<string, Layer>();
    for (const f of flat) {
      const layer = byKey.get(`${f.layer}:${f.datatype}`);
      if (!layer || !allowedLayerIds.has(layer.id)) continue;
      usedLayers.set(layer.id, layer);
      shapes.push(buildShape(f, layer.color, layer.id));
    }

    // Return layers in stream-discovery order (consistent with scanLayers).
    const layers: Layer[] = [];
    for (const k of lib.layerKeys) {
      const l = byKey.get(`${k.layer}:${k.datatype}`);
      if (l && usedLayers.has(l.id)) layers.push(l);
    }
    return { shapes, layers, units: { dbToUser: lib.dbToUser, metersPerDb: lib.metersPerDb } };
  }

  parseWithLayers(input: ArrayBuffer): Gds2ParseResult {
    const view = new DataView(input);
    const lib = collectLibrary(view);
    const flat = flattenLibrary(lib);

    const layerCache = new Map<string, Layer>();
    const getOrCreateLayer = (layer: number, datatype: number): Layer => {
      const key = `${layer}:${datatype}`;
      let l = layerCache.get(key);
      if (!l) {
        const idx = lib.layerKeys.findIndex(k => k.layer === layer && k.datatype === datatype);
        const colorIdx = idx < 0 ? layerCache.size : idx;
        l = createLayer(
          layerName(layer, datatype),
          LAYER_COLORS[colorIdx % LAYER_COLORS.length],
          layer,
          datatype
        );
        layerCache.set(key, l);
      }
      return l;
    };

    const shapes: Shape[] = [];
    for (const f of flat) {
      const layer = getOrCreateLayer(f.layer, f.datatype);
      shapes.push(buildShape(f, layer.color, layer.id));
    }

    // Return layers in stream-discovery order (consistent with scanLayers).
    const layers: Layer[] = [];
    for (const k of lib.layerKeys) {
      const l = layerCache.get(`${k.layer}:${k.datatype}`);
      if (l) layers.push(l);
    }
    return { shapes, layers, units: { dbToUser: lib.dbToUser, metersPerDb: lib.metersPerDb } };
  }
}
