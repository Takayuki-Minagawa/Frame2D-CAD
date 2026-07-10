// history.js - Undo/Redo with snapshot approach

const MAX_HISTORY = 50;

export class History {
  constructor(state) {
    this.state = state;
    this.undoStack = [];
    this.redoStack = [];
  }

  save() {
    this.undoStack.push(this.state.snapshot());
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  // Runs fn and records an undo entry only when fn returns truthy (= the
  // model actually changed). A no-op leaves undo AND redo untouched, unlike
  // save() + undo(), which would reset selection/tool state and clear redo.
  transact(fn) {
    const snap = this.state.snapshot();
    const changed = fn();
    if (changed) {
      this.undoStack.push(snap);
      if (this.undoStack.length > MAX_HISTORY) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }
    return changed;
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(this.state.snapshot());
    const snap = this.undoStack.pop();
    this.state.restoreSnapshot(snap);
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(this.state.snapshot());
    const snap = this.redoStack.pop();
    this.state.restoreSnapshot(snap);
    return true;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
