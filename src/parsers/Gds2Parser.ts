import { Point, Chain, Contour, createLayer, LAYER_COLORS } from '../models';
import type { Shape, Layer } from '../models';
import type { BinaryShapeParser } from './ShapeParser';

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
const COORDINATE_PAIR_SIZE = 8;

export interface Gds2ParseResult {
  shapes: Shape[];
  layers: Layer[];
}

export interface Gds2LayerInfo {
  layers: Layer[];
  objectCounts: Map<string, number>; // layerId -> object count
}

export class Gds2Parser implements BinaryShapeParser {
  parseShapes(input: ArrayBuffer): Shape[] {
    return this.parseWithLayers(input).shapes;
  }

  /**
   * Scans the GDS file to extract layer information and count objects per layer.
   * This is useful for previewing available layers before full import.
   */
  scanLayers(input: ArrayBuffer): Gds2LayerInfo {
    const view = new DataView(input);
    const layerMap = new Map<number, Layer>();
    const objectCountsByGdsLayer = new Map<number, number>();
    let offset = 0;
    let currentGdsLayer: number | null = null;
    let inElement = false;

    const getOrCreateLayer = (gdsLayerNum: number): Layer => {
      if (!layerMap.has(gdsLayerNum)) {
        const colorIndex = layerMap.size % LAYER_COLORS.length;
        const layer = createLayer(
          `Layer ${gdsLayerNum}`,
          LAYER_COLORS[colorIndex],
          gdsLayerNum
        );
        layerMap.set(gdsLayerNum, layer);
        objectCountsByGdsLayer.set(gdsLayerNum, 0);
      }
      return layerMap.get(gdsLayerNum)!;
    };

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
        case RecordType.Boundary:
        case RecordType.Path:
          inElement = true;
          currentGdsLayer = null;
          break;
        case RecordType.Layer:
          if (dataType === DataType.Int2 && dataLength >= 2) {
            currentGdsLayer = view.getInt16(dataOffset, false);
            getOrCreateLayer(currentGdsLayer);
          }
          break;
        case RecordType.Endel:
          if (inElement && currentGdsLayer !== null) {
            const count = objectCountsByGdsLayer.get(currentGdsLayer) || 0;
            objectCountsByGdsLayer.set(currentGdsLayer, count + 1);
          }
          inElement = false;
          currentGdsLayer = null;
          break;
      }

      offset += recordLength;
    }

    // Convert layer map to array, sorted by GDS layer number
    const layers = Array.from(layerMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, layer]) => layer);

    // Convert object counts to use layer IDs
    const objectCounts = new Map<string, number>();
    for (const layer of layers) {
      if (layer.gdsLayerNumber !== undefined) {
        const count = objectCountsByGdsLayer.get(layer.gdsLayerNumber) || 0;
        objectCounts.set(layer.id, count);
      }
    }

    return { layers, objectCounts };
  }

  /**
   * Parse GDS with filtering - only import shapes from specified layers
   */
  parseWithLayerFilter(input: ArrayBuffer, allowedLayerIds: Set<string>, layerMap: Map<string, Layer>): Gds2ParseResult {
    const view = new DataView(input);
    const shapes: Shape[] = [];
    const usedLayers = new Map<string, Layer>();
    let offset = 0;
    let currentType: 'boundary' | 'path' | null = null;
    let currentPoints: Point[] = [];
    let currentGdsLayer: number | null = null;

    const finalizeElement = () => {
      if (!currentType) return;

      const minPoints = currentType === 'boundary' ? 3 : 2;
      if (currentPoints.length >= minPoints) {
        const gdsLayerNum = currentGdsLayer ?? 0;
        
        // Find layer by GDS number
        let layer: Layer | undefined;
        for (const [id, l] of layerMap) {
          if (l.gdsLayerNumber === gdsLayerNum && allowedLayerIds.has(id)) {
            layer = l;
            break;
          }
        }

        // Only add shape if layer is allowed
        if (layer) {
          usedLayers.set(layer.id, layer);
          const shape = currentType === 'boundary'
            ? new Contour(currentPoints, undefined, layer.color, layer.id)
            : new Chain(currentPoints, undefined, layer.color, layer.id);
          shapes.push(shape);
        }
      }

      currentType = null;
      currentPoints = [];
      currentGdsLayer = null;
    };

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
        case RecordType.Boundary:
          finalizeElement();
          currentType = 'boundary';
          currentPoints = [];
          currentGdsLayer = null;
          break;
        case RecordType.Path:
          finalizeElement();
          currentType = 'path';
          currentPoints = [];
          currentGdsLayer = null;
          break;
        case RecordType.Layer:
          if (dataType === DataType.Int2 && dataLength >= 2) {
            currentGdsLayer = view.getInt16(dataOffset, false);
          }
          break;
        case RecordType.Xy:
          if (currentType && dataLength > 0) {
            if (dataType !== DataType.Int4 || dataLength % COORDINATE_PAIR_SIZE !== 0) {
              throw new Error(
                `Unsupported XY record encoding. Expected Int4 data type and length divisible by ${COORDINATE_PAIR_SIZE}, got data type ${dataType} and length ${dataLength}.`
              );
            }
            for (let i = 0; i < dataLength; i += COORDINATE_PAIR_SIZE) {
              const x = view.getInt32(dataOffset + i, false);
              const y = view.getInt32(dataOffset + i + 4, false);
              currentPoints.push(new Point(x, y));
            }
          }
          break;
        case RecordType.Endel:
          finalizeElement();
          break;
        default:
          break;
      }

      offset += recordLength;
    }

    // Convert used layers to array, sorted by GDS layer number
    const layers = Array.from(usedLayers.values())
      .sort((a, b) => (a.gdsLayerNumber ?? 0) - (b.gdsLayerNumber ?? 0));

    return { shapes, layers };
  }

  parseWithLayers(input: ArrayBuffer): Gds2ParseResult {
    const view = new DataView(input);
    const shapes: Shape[] = [];
    const layerMap = new Map<number, Layer>(); // GDS layer number -> Layer
    let offset = 0;
    let currentType: 'boundary' | 'path' | null = null;
    let currentPoints: Point[] = [];
    let currentGdsLayer: number | null = null;

    const getOrCreateLayer = (gdsLayerNum: number): Layer => {
      if (!layerMap.has(gdsLayerNum)) {
        const colorIndex = layerMap.size % LAYER_COLORS.length;
        const layer = createLayer(
          `Layer ${gdsLayerNum}`,
          LAYER_COLORS[colorIndex],
          gdsLayerNum
        );
        layerMap.set(gdsLayerNum, layer);
      }
      return layerMap.get(gdsLayerNum)!;
    };

    const finalizeElement = () => {
      if (!currentType) return;

      const minPoints = currentType === 'boundary' ? 3 : 2;
      if (currentPoints.length >= minPoints) {
        // Get or create layer for this GDS layer number
        const gdsLayerNum = currentGdsLayer ?? 0;
        const layer = getOrCreateLayer(gdsLayerNum);
        
        const shape = currentType === 'boundary'
          ? new Contour(currentPoints, undefined, layer.color, layer.id)
          : new Chain(currentPoints, undefined, layer.color, layer.id);
        shapes.push(shape);
      }

      currentType = null;
      currentPoints = [];
      currentGdsLayer = null;
    };

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
        case RecordType.Boundary:
          finalizeElement();
          currentType = 'boundary';
          currentPoints = [];
          currentGdsLayer = null;
          break;
        case RecordType.Path:
          finalizeElement();
          currentType = 'path';
          currentPoints = [];
          currentGdsLayer = null;
          break;
        case RecordType.Layer:
          // Read layer number (2-byte integer)
          if (dataType === DataType.Int2 && dataLength >= 2) {
            currentGdsLayer = view.getInt16(dataOffset, false);
          }
          break;
        case RecordType.Xy:
          if (currentType && dataLength > 0) {
            if (dataType !== DataType.Int4 || dataLength % COORDINATE_PAIR_SIZE !== 0) {
              throw new Error(
                `Unsupported XY record encoding. Expected Int4 data type and length divisible by ${COORDINATE_PAIR_SIZE}, got data type ${dataType} and length ${dataLength}.`
              );
            }
            for (let i = 0; i < dataLength; i += COORDINATE_PAIR_SIZE) {
              const x = view.getInt32(dataOffset + i, false);
              const y = view.getInt32(dataOffset + i + 4, false);
              currentPoints.push(new Point(x, y));
            }
          }
          break;
        case RecordType.Endel:
          finalizeElement();
          break;
        default:
          break;
      }

      offset += recordLength;
    }

    if (offset !== view.byteLength) {
      throw new Error(`Unexpected trailing bytes in GDS2 data. Expected ${view.byteLength} bytes but processed ${offset} bytes.`);
    }

    // Convert layer map to array, sorted by GDS layer number
    const layers = Array.from(layerMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, layer]) => layer);

    return { shapes, layers };
  }
}
