import test from 'node:test';
import assert from 'node:assert/strict';
import { toolHarness } from './helpers/ui-harness.js';

test('drawing a roof carries the sticky group and slope settings into the surface', () => {
  const { manager, state, history } = toolHarness();
  state.surfaceDraftType = 'roof';
  state.surfaceDraftRoofGroupId = 'CUSTOM';
  state.surfaceDraftRoofSlope = 0.5;
  manager._surfaceDown({ x: 0, y: 0 });
  assert.equal(history.undoStack.length, 0);
  manager._surfaceDown({ x: 4000, y: 3000 });
  assert.equal(state.surfaces[0].roofGroupId, 'CUSTOM');
  assert.equal(state.surfaces[0].roofSlope, 0.5);
  assert.equal(history.undoStack.length, 1);
});
