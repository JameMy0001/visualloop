import { Annotation } from "@visualloop/protocol";

export class AnnotationHistoryManager {
  private undoStack: Annotation[][] = [];
  private redoStack: Annotation[][] = [];
  private maxStack: number;

  constructor(maxStack: number = 50) {
    this.maxStack = maxStack;
  }

  public push(currentState: Annotation[]): void {
    // Clone state deeply
    const cloned = JSON.parse(JSON.stringify(currentState));
    this.undoStack.push(cloned);
    if (this.undoStack.length > this.maxStack) {
      this.undoStack.shift();
    }
    // New action invalidates redo stack
    this.redoStack = [];
  }

  public undo(currentState: Annotation[]): Annotation[] | null {
    if (this.undoStack.length === 0) return null;

    // Save current state to redo stack
    this.redoStack.push(JSON.parse(JSON.stringify(currentState)));

    // Pop previous state
    const previous = this.undoStack.pop();
    return previous ? JSON.parse(JSON.stringify(previous)) : null;
  }

  public redo(currentState: Annotation[]): Annotation[] | null {
    if (this.redoStack.length === 0) return null;

    // Save current state to undo stack
    this.undoStack.push(JSON.parse(JSON.stringify(currentState)));

    // Pop next state
    const next = this.redoStack.pop();
    return next ? JSON.parse(JSON.stringify(next)) : null;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
