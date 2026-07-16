import type { Shape } from '../models';

/**
 * Interface for undoable commands.
 *
 * Commands are pure transforms over the CURRENT shapes array instead of
 * snapshots captured at construction time. This lets history entries compose
 * with changes made outside the history (imports in append mode, visibility /
 * color toggles, coordinate rescaling): undoing an "add shape" only removes
 * that shape and leaves everything else intact.
 */
export interface Command {
  execute(shapes: Shape[]): Shape[];
  undo(shapes: Shape[]): Shape[];
  getDescription(): string;
}

/**
 * Command to add a shape
 */
export class AddShapeCommand implements Command {
  private shape: Shape;

  constructor(shape: Shape) {
    this.shape = shape;
  }

  execute(shapes: Shape[]): Shape[] {
    if (shapes.some(s => s.id === this.shape.id)) return shapes;
    return [...shapes, this.shape];
  }

  undo(shapes: Shape[]): Shape[] {
    return shapes.filter(s => s.id !== this.shape.id);
  }

  getDescription(): string {
    return `Add ${this.shape.type}`;
  }
}

/**
 * Command to remove one or more shapes
 */
export class RemoveShapesCommand implements Command {
  private shapeIds: Set<string>;
  private removed: { shape: Shape; index: number }[] = [];

  constructor(shapeIds: string[]) {
    this.shapeIds = new Set(shapeIds);
  }

  execute(shapes: Shape[]): Shape[] {
    this.removed = [];
    const rest: Shape[] = [];
    shapes.forEach((shape, index) => {
      if (this.shapeIds.has(shape.id)) {
        this.removed.push({ shape, index });
      } else {
        rest.push(shape);
      }
    });
    return this.removed.length > 0 ? rest : shapes;
  }

  undo(shapes: Shape[]): Shape[] {
    if (this.removed.length === 0) return shapes;
    const result = [...shapes];
    // Re-insert at the recorded positions (ascending, so indices stay valid)
    for (const { shape, index } of this.removed) {
      result.splice(Math.min(index, result.length), 0, shape);
    }
    return result;
  }

  getDescription(): string {
    return this.shapeIds.size === 1 ? 'Remove shape' : `Remove ${this.shapeIds.size} shapes`;
  }
}

/**
 * Manages undo/redo history.
 *
 * State updates are delivered through `onStateChange` as functional updaters,
 * so they always apply to the latest shapes array even when several commands
 * fire between React re-renders (e.g. holding Ctrl+Z).
 */
export class CommandHistory {
  private history: Command[] = [];
  private currentIndex: number = -1;
  private maxHistorySize: number = 100;
  private onStateChange?: (updater: (shapes: Shape[]) => Shape[]) => void;

  setOnStateChange(callback: (updater: (shapes: Shape[]) => Shape[]) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Execute a command and add it to history
   */
  executeCommand(command: Command): void {
    // Remove any commands after current index (redo history)
    this.history = this.history.slice(0, this.currentIndex + 1);

    this.onStateChange?.(shapes => command.execute(shapes));

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

    const command = this.history[this.currentIndex];
    this.onStateChange?.(shapes => command.undo(shapes));
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
    const command = this.history[this.currentIndex];
    this.onStateChange?.(shapes => command.execute(shapes));
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
