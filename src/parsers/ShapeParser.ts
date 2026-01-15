import { Point, Chain, Contour } from '../models';

/**
 * Interface for parsing different input formats
 * This allows easy extension to support new formats
 */
export interface ShapeParser {
  /**
   * Parse a string into points array
   */
  parsePoints(input: string): Point[];

  /**
   * Create a chain from input string
   */
  parseChain(input: string, name?: string): Chain;

  /**
   * Create a contour from input string
   */
  parseContour(input: string, name?: string): Contour;
}

/**
 * Default parser for format: "x1, y1, x2, y2, x3, y3, ..."
 */
export class DefaultShapeParser implements ShapeParser {
  /**
   * Parse comma-separated coordinates into Point array
   * Format: "x1, y1, x2, y2, x3, y3, ..."
   */
  parsePoints(input: string): Point[] {
    const coordinates = input
      .split(',')
      .map(coord => coord.trim())
      .filter(coord => coord.length > 0)
      .map(coord => parseFloat(coord));

    if (coordinates.length % 2 !== 0) {
      throw new Error('Invalid input: odd number of coordinates');
    }

    const points: Point[] = [];
    for (let i = 0; i < coordinates.length; i += 2) {
      const x = coordinates[i];
      const y = coordinates[i + 1];

      if (isNaN(x) || isNaN(y)) {
        throw new Error(`Invalid coordinate at position ${i / 2}: (${x}, ${y})`);
      }

      points.push(new Point(x, y));
    }

    return points;
  }

  parseChain(input: string, name?: string): Chain {
    const points = this.parsePoints(input);
    if (points.length < 2) {
      throw new Error('Chain must have at least 2 points');
    }
    return new Chain(points, name);
  }

  parseContour(input: string, name?: string): Contour {
    const points = this.parsePoints(input);
    if (points.length < 3) {
      throw new Error('Contour must have at least 3 points');
    }
    return new Contour(points, name);
  }
}

/**
 * Parser registry for managing multiple parsers
 */
export class ParserRegistry {
  private parsers: Map<string, ShapeParser> = new Map();
  private defaultParser: string = 'default';

  constructor() {
    // Register default parser
    this.registerParser('default', new DefaultShapeParser());
  }

  registerParser(name: string, parser: ShapeParser): void {
    this.parsers.set(name, parser);
  }

  getParser(name?: string): ShapeParser {
    const parserName = name || this.defaultParser;
    const parser = this.parsers.get(parserName);

    if (!parser) {
      throw new Error(`Parser '${parserName}' not found`);
    }

    return parser;
  }

  setDefaultParser(name: string): void {
    if (!this.parsers.has(name)) {
      throw new Error(`Parser '${name}' not registered`);
    }
    this.defaultParser = name;
  }

  listParsers(): string[] {
    return Array.from(this.parsers.keys());
  }
}
