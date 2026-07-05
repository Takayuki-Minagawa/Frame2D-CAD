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
