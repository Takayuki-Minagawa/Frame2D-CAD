import test from 'node:test';
import assert from 'node:assert/strict';
import { uiHarness } from './helpers/ui-harness.js';

test('surface property controls generate roof planes in one undo step', context => {
  const { ui, state, get, history } = uiHarness(context);
  const floor = state.addSurfaceRect(0, 0, 6000, 4000, { type: 'floor' });
  state.select('surface', floor.id); ui.updatePropertyPanel();
  assert.ok(get('prop-auto-roof-pattern'));
  get('prop-auto-roof-pattern').value = 'gableX';
  get('prop-auto-roof-group-id').value = 'Custom';
  get('btn-auto-roof-planes').click();
  const roofs = state.surfaces.filter(s => s.type === 'roof');
  assert.equal(roofs.length, 2);
  assert.ok(roofs.every(s => s.roofGroupId === 'Custom'));
  assert.equal(history.undoStack.length, 1);
  history.undo(); assert.equal(state.surfaces.length, 1);
});

test('roof panel validation is read-only and generated elements can be removed and restored', context => {
  const { ui, state, get, history, container } = uiHarness(context);
  const roof = state.addSurfaceRect(0, 0, 6000, 4000, { type: 'roof' });
  state.select('surface', roof.id); ui.updatePropertyPanel();
  get('btn-roof-validate-group').click();
  assert.equal(history.undoStack.length, 0);
  assert.ok(container.children.at(-1).textContent);
  get('btn-roof-regenerate').click();
  assert.ok(state.members.length > 0);
  const count = state.members.length;
  assert.equal(history.undoStack.length, 1);
  get('btn-roof-remove-generated').click();
  assert.equal(state.members.length, 0);
  assert.equal(history.undoStack.length, 2);
  history.undo(); assert.equal(state.members.length, count);
});
