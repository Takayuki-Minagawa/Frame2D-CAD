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
