import test from 'node:test';
import assert from 'node:assert/strict';
import { toolHarness } from './helpers/ui-harness.js';
import { hasProvisionalEdit } from '../js/domain/provisional-edit.js';

function dragHarness() {
  const harness = toolHarness();
  const { state, manager } = harness;
  state.settings.snap = false;
  const node = state.addNode(0, 0);
  manager._dragTarget = { type: 'node', id: node.id };
  manager._dragStartPos = { x: 0, y: 0 };
  return { ...harness, node };
}

test('drag cancellation and return to origin preserve coordinates, revision and redo', () => {
  for (const finish of ['cancel', 'return']) {
    const { manager, state, history, node } = dragHarness();
    history.save(); state.addNode(1000, 0); history.undo();
    const revision = state.revision;
    manager._selectMove({ x: 100, y: 0 });
    assert.equal(state.getNode(node.id).x, 100);
    assert.equal(history.undoStack.length, 0);
    if (finish === 'cancel') manager._onKeyDown({ key: 'Escape' });
    else { manager._selectMove({ x: 0, y: 0 }); manager._selectUp({ x: 0, y: 0 }); }
    assert.equal(state.getNode(node.id).x, 0);
    assert.equal(state.revision, revision);
    assert.equal(history.undoStack.length, 0);
    assert.equal(history.redoStack.length, 1);
  }
});

test('drag commit records the original geometry and creates exactly one undo entry', () => {
  const { manager, state, history, node } = dragHarness();
  manager._selectMove({ x: 100, y: 0 }); manager._selectMove({ x: 200, y: 50 });
  manager._selectUp({ x: 200, y: 50 });
  assert.equal(history.undoStack.length, 1);
  assert.equal(state.getNode(node.id).x, 200);
  history.undo(); assert.equal(state.getNode(node.id).x, 0);
  history.redo(); assert.equal(state.getNode(node.id).y, 50);
});

test('keyboard undo cancels provisional drag before capturing redo', () => {
  const { manager, state, history, node } = dragHarness();
  history.save();
  state.addNode(1000, 0);
  manager._selectMove({ x: 100, y: 0 });
  assert.equal(hasProvisionalEdit(state), true);
  manager._onKeyDown({ key: 'z', ctrlKey: true, preventDefault() {} });
  assert.equal(hasProvisionalEdit(state), false);
  assert.equal(state.getNode(node.id).x, 0);
  history.redo();
  assert.equal(state.getNode(node.id).x, 0);
  assert.equal(state.nodes.length, 2);
});

test('cancelled exterior wall replacement preserves the old wall and commit replaces it atomically', context => {
  const { manager, state, history } = toolHarness();
  const original = state.addSurfacePolygon([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }], { type: 'exteriorWall' });
  state.currentTool = 'surface'; state.surfaceDraftType = 'exteriorWall'; state.surfaceDraftMode = 'polyline';
  manager._surfacePolylineDown({ x: 0, y: 0 });
  manager._onKeyDown({ key: 'Escape' });
  assert.equal(state.surfaces[0].id, original.id);
  assert.equal(history.undoStack.length, 0);
  const oldConfirm = globalThis.confirm; globalThis.confirm = () => true;
  context.after(() => { globalThis.confirm = oldConfirm; });
  for (const point of [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 3000 }]) manager._surfacePolylineDown(point);
  manager._finishSurfacePolyline();
  assert.equal(state.surfaces.length, 1);
  assert.notEqual(state.surfaces[0].id, original.id);
  assert.equal(history.undoStack.length, 1);
  history.undo(); assert.equal(state.surfaces[0].id, original.id);
});
