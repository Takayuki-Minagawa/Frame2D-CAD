import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';
import { modelHasContent } from '../js/autosave.js';

test('a fresh default model is not worth autosaving', () => {
  const state = new AppState();
  assert.equal(modelHasContent(state.toJSON()), false);
  assert.equal(modelHasContent(null), false);
});

test('drawn elements make a snapshot worth keeping', () => {
  const state = new AppState();
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(1000, 0);
  state.addMember(n1.id, n2.id, { type: 'beam' });
  assert.equal(modelHasContent(state.toJSON()), true);
});

test('axis-only and underlay-only work is autosaved', () => {
  const withAxis = new AppState();
  withAxis.addAxis('x', 'X1', 0);
  assert.equal(modelHasContent(withAxis.toJSON()), true);

  const withUnderlay = new AppState();
  withUnderlay.setUnderlay({
    name: 'plan.dxf',
    entities: [{ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }],
  });
  assert.equal(modelHasContent(withUnderlay.toJSON()), true);
});

test('settings-only changes are autosaved', () => {
  const state = new AppState();
  const before = state.revision;
  state.updateSetting('snap', false);
  // The revision bump lets the autosave loop notice the change...
  assert.ok(state.revision > before);
  // ...and the snapshot counts as content even without drawn elements.
  assert.equal(modelHasContent(state.toJSON()), true);

  // Re-assigning the same value is not a change.
  const rev = state.revision;
  state.updateSetting('snap', false);
  assert.equal(state.revision, rev);
});

test('edited load combinations are autosaved', () => {
  const edited = new AppState();
  edited.updateLoadCombination(edited.loadCombinations[0].id, { factors: { DL: 1.3 } });
  assert.equal(modelHasContent(edited.toJSON()), true);

  const emptied = new AppState();
  for (const combo of [...emptied.loadCombinations]) {
    emptied.removeLoadCombination(combo.id);
  }
  assert.equal(modelHasContent(emptied.toJSON()), true);
});
