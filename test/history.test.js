import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';
import { History } from '../js/history.js';

const MAX_HISTORY = 50; // history.js internal cap (not exported)

test('undo restores the snapshot taken by save and redo reapplies the change', () => {
  const state = new AppState();
  const history = new History(state);

  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(5000, 0);
  const before = state.snapshot();

  history.save();
  state.addMember(n1.id, n2.id, { type: 'beam' });
  const after = state.snapshot();
  assert.equal(state.members.length, 1);

  assert.equal(history.undo(), true);
  assert.equal(state.members.length, 0);
  assert.equal(state.nodes.length, 2);
  assert.deepEqual(state.snapshot(), before);

  assert.equal(history.redo(), true);
  assert.equal(state.members.length, 1);
  assert.deepEqual(state.snapshot(), after);
});

test('undo and redo return false when their stacks are empty', () => {
  const state = new AppState();
  const history = new History(state);

  assert.equal(history.undo(), false);
  assert.equal(history.redo(), false);

  history.save();
  state.addNode(1000, 1000);
  assert.equal(history.undo(), true);
  assert.equal(history.undo(), false);
  assert.equal(history.redo(), true);
  assert.equal(history.redo(), false);
});

test('restore callback runs after successful undo and redo only', () => {
  const state = new AppState();
  const history = new History(state);
  const restoredMemberCounts = [];
  history.setOnRestore(() => restoredMemberCounts.push(state.members.length));

  assert.equal(history.undo(), false);
  assert.deepEqual(restoredMemberCounts, []);

  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(5000, 0);
  history.save();
  state.addMember(n1.id, n2.id, { type: 'beam' });

  assert.equal(history.undo(), true);
  assert.equal(history.redo(), true);
  assert.deepEqual(restoredMemberCounts, [0, 1]);

  history.setOnRestore(null);
  assert.equal(history.undo(), true);
  assert.deepEqual(restoredMemberCounts, [0, 1]);
});

test('save clears the redo stack', () => {
  const state = new AppState();
  const history = new History(state);

  history.save();
  state.addNode(0, 0);
  assert.equal(history.undo(), true);
  assert.equal(history.redoStack.length, 1);

  history.save();
  state.addNode(2000, 2000);
  assert.equal(history.redoStack.length, 0);
  assert.equal(history.redo(), false);
});

test('undo history is capped at MAX_HISTORY snapshots (oldest dropped)', () => {
  const state = new AppState();
  const history = new History(state);

  const total = MAX_HISTORY + 10;
  for (let i = 0; i < total; i++) {
    history.save();
    state.addNode(i * 100, 0);
  }
  assert.equal(state.nodes.length, total);
  assert.equal(history.undoStack.length, MAX_HISTORY);

  let undoCount = 0;
  while (history.undo()) undoCount++;
  assert.equal(undoCount, MAX_HISTORY);

  // The 10 oldest states fell off the stack, so 10 nodes remain.
  assert.equal(state.nodes.length, total - MAX_HISTORY);
});

test('undo/redo restores full serialized state including members and surfaces', () => {
  const state = new AppState();
  const history = new History(state);

  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(4000, 0);
  state.addMember(n1.id, n2.id, { type: 'beam' });
  const baseline = state.toJSON();

  history.save();
  state.addSurfacePolygon(
    [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }],
    { type: 'floor' }
  );
  assert.equal(state.surfaces.length, 1);

  assert.equal(history.undo(), true);
  assert.deepEqual(state.toJSON(), baseline);

  assert.equal(history.redo(), true);
  assert.equal(state.surfaces.length, 1);
});

test('clear empties both stacks', () => {
  const state = new AppState();
  const history = new History(state);

  history.save();
  state.addNode(0, 0);
  assert.equal(history.undo(), true);
  assert.equal(history.undoStack.length, 0);
  assert.equal(history.redoStack.length, 1);

  history.save();
  history.clear();
  assert.equal(history.undoStack.length, 0);
  assert.equal(history.redoStack.length, 0);
  assert.equal(history.undo(), false);
  assert.equal(history.redo(), false);
});

test('transact records an undo entry only when the callback reports a change', () => {
  const state = new AppState();
  const history = new History(state);

  // Establish a redo entry to verify no-ops leave it intact.
  history.save();
  state.addNode(0, 0);
  history.undo();
  assert.equal(history.redoStack.length, 1);

  // No-op: nothing recorded, redo preserved.
  assert.equal(history.transact(() => false), false);
  assert.equal(history.undoStack.length, 0);
  assert.equal(history.redoStack.length, 1);

  // Real change: undo entry recorded, redo cleared, undo restores.
  const changed = history.transact(() => {
    state.addNode(1000, 0);
    return true;
  });
  assert.equal(changed, true);
  assert.equal(state.nodes.length, 1);
  assert.equal(history.redoStack.length, 0);
  assert.equal(history.undo(), true);
  assert.equal(state.nodes.length, 0);
});
