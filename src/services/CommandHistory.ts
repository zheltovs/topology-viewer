import type { Shape } from '../models';

/**
 * Interface for undoable commands
 */
export interface Command {
  execute(): Shape[];
  undo(): Shape[];
  getDescription(): string;
}

/**
 * Command to add a shape
 */
export class AddShapeCommand implements Command {
  private shapes: Shape[];
  private shape: Shape;

  constructor(shapes: Shape[], shape: Shape) {
    this.shapes = shapes;
    this.shape = shape;
  }

  execute(): Shape[] {
    this.shapes = [...this.shapes, this.shape];
    return this.shapes;
  }

  undo(): Shape[] {
    this.shapes = this.shapes.filter(s => s.id !== this.shape.id);
    return this.shapes;
  }

  getDescription(): string {
    return `Add ${this.shape.type}`;
  }
}

/**
 * Command to remove a shape
 */
export class RemoveShapeCommand implements Command {
  private shapes: Shape[];
  private shapeId: string;
  private removedShape?: Shape;
  private removedIndex: number = -1;

  constructor(shapes: Shape[], shapeId: string) {
    this.shapes = shapes;
    this.shapeId = shapeId;
  }

  execute(): Shape[] {
    this.removedIndex = this.shapes.findIndex(s => s.id === this.shapeId);
    if (this.removedIndex !== -1) {
      this.removedShape = this.shapes[this.removedIndex];
      this.shapes = this.shapes.filter(s => s.id !== this.shapeId);
    }
    return this.shapes;
  }

  undo(): Shape[] {
    if (this.removedIndex !== -1 && this.removedShape) {
      this.shapes = [
        ...this.shapes.slice(0, this.removedIndex),
        this.removedShape,
        ...this.shapes.slice(this.removedIndex)
      ];
    }
    return this.shapes;
  }

  getDescription(): string {
    return `Remove shape`;
  }
}

/**
 * Manages undo/redo history
 */
export class CommandHistory {
  private history: Command[] = [];
  private currentIndex: number = -1;
  private maxHistorySize: number = 100;
  private onStateChange?: (shapes: Shape[]) => void;

  setOnStateChange(callback: (shapes: Shape[]) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Execute a command and add it to history
   */
  executeCommand(command: Command): void {
    // Remove any commands after current index (redo history)
    this.history = this.history.slice(0, this.currentIndex + 1);

    // Execute the command
    const newShapes = command.execute();
    if (this.onStateChange) {
      this.onStateChange(newShapes);
    }

    // Add to history
    this.history.push(command);
    this.currentIndex++;

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.currentIndex--;
    }
  }

  /**
   * Undo the last command
   */
  undo(): boolean {
    if (!this.canUndo()) {
      return false;
    }

    const newShapes = this.history[this.currentIndex].undo();
    if (this.onStateChange) {
      this.onStateChange(newShapes);
    }
    this.currentIndex--;
    return true;
  }

  /**
   * Redo the next command
   */
  redo(): boolean {
    if (!this.canRedo()) {
      return false;
    }

    this.currentIndex++;
    const newShapes = this.history[this.currentIndex].execute();
    if (this.onStateChange) {
      this.onStateChange(newShapes);
    }
    return true;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * Get current history size
   */
  getHistorySize(): number {
    return this.history.length;
  }

  /**
   * Get description of command at current position
   */
  getCurrentCommandDescription(): string | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
      return this.history[this.currentIndex].getDescription();
    }
    return null;
  }
}
