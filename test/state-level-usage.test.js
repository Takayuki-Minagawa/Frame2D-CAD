import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';

function twoLevelState() {
  const state = new AppState();
  // AppState starts with one level; add a second so removal is allowed.
  const base = state.levels[0];
  const extra = state.addLevel('2F', base.z + 3000);
  return { state, base, extra };
}

test('getLevelUsage reports supports and loads, not just members and surfaces', () => {
  const { state, base } = twoLevelState();
  state.addSupport(0, 0, { levelId: base.id });
  state.addLoad('pointLoad', { levelId: base.id, x1: 0, y1: 0 });

  const usage = state.getLevelUsage(base.id);
  assert.equal(usage.supports.length, 1);
  assert.equal(usage.loads.length, 1);
});

test('removeLevel refuses a level that still has only a support', () => {
  const { state, base } = twoLevelState();
  state.addSupport(0, 0, { levelId: base.id });

  assert.equal(state.removeLevel(base.id), false);
  assert.ok(state.levels.some(l => l.id === base.id));
});

test('removeLevel refuses a level that still has only a load', () => {
  const { state, base } = twoLevelState();
  state.addLoad('pointLoad', { levelId: base.id, x1: 0, y1: 0 });

  assert.equal(state.removeLevel(base.id), false);
  assert.ok(state.levels.some(l => l.id === base.id));
});

// Mirrors a generated grid frame with a foundation: the FDN level sits below GL
// but is appended to the end of the levels array.
function foundationState() {
  const state = new AppState();
  const [ground, second] = state.levels;
  const roof = state.addLevel('RF', second.z + 3000);
  const foundation = state.addLevel('FDN', ground.z - 1500);
  state.activeLevelId = ground.id;
  state.surfaceDraftTopLevelId = second.id;
  return { state, ground, second, roof, foundation };
}

test('removeLevel replaces the surface draft top level by elevation, not array order', () => {
  const { state, second, roof, foundation } = foundationState();

  assert.equal(state.removeLevel(second.id), true);
  assert.equal(state.surfaceDraftTopLevelId, roof.id);
  assert.notEqual(state.surfaceDraftTopLevelId, foundation.id);
});

test('removeLevel falls back to the highest level when the active level is on top', () => {
  const { state, ground, second, roof } = foundationState();
  state.activeLevelId = roof.id;
  state.surfaceDraftTopLevelId = second.id;

  assert.equal(state.removeLevel(second.id), true);
  assert.equal(state.surfaceDraftTopLevelId, roof.id);
  assert.equal(state.getLevelZ(state.surfaceDraftTopLevelId) > state.getLevelZ(ground.id), true);
});

test('removeLevel succeeds once supports and loads are cleared', () => {
  const { state, extra } = twoLevelState();
  const support = state.addSupport(0, 0, { levelId: extra.id });
  const load = state.addLoad('pointLoad', { levelId: extra.id, x1: 0, y1: 0 });

  assert.equal(state.removeLevel(extra.id), false);
  state.removeSupport(support.id);
  state.removeLoad(load.id);
  assert.equal(state.removeLevel(extra.id), true);
  assert.ok(!state.levels.some(l => l.id === extra.id));
});
