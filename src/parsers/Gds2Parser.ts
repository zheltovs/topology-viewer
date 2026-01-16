import { Point, Chain, Contour } from '../models';
import type { Shape } from '../models';
import type { BinaryShapeParser } from './ShapeParser';

const RecordType = {
  Boundary: 0x08,
  Path: 0x09,
  Xy: 0x10,
  Endel: 0x11
} as const;

const DataType = {
  Int4: 0x03
} as const;

const RECORD_HEADER_SIZE = 4;
const COORDINATE_PAIR_SIZE = 8;

export class Gds2Parser implements BinaryShapeParser {
  parseShapes(input: ArrayBuffer): Shape[] {
    const view = new DataView(input);
    const shapes: Shape[] = [];
    let offset = 0;
    let currentType: 'boundary' | 'path' | null = null;
    let currentPoints: Point[] = [];

    const finalizeElement = () => {
      if (!currentType) return;

      const minPoints = currentType === 'boundary' ? 3 : 2;
      if (currentPoints.length >= minPoints) {
        const shape = currentType === 'boundary'
          ? new Contour(currentPoints)
          : new Chain(currentPoints);
        shapes.push(shape);
      }

      currentType = null;
      currentPoints = [];
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
          break;
        case RecordType.Path:
          finalizeElement();
          currentType = 'path';
          currentPoints = [];
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

    return shapes;
  }
}
