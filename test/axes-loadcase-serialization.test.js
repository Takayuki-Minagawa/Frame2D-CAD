import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';
import { snapToAxisCoord } from '../js/grid.js';

test('axes support add/update/remove with generated names', () => {
  const state = new AppState();
  const a1 = state.addAxis('x', null, 0);
  const a2 = state.addAxis('x', null, 3640);
  const b1 = state.addAxis('y', 'Y1', 0);

  assert.equal(a1.name, 'X1');
  assert.equal(a2.name, 'X2');
  assert.equal(b1.dir, 'y');

  state.updateAxis(a2.id, { coord: 4000, name: 'X2A' });
  assert.equal(state.getAxis(a2.id).coord, 4000);
  assert.equal(state.getAxis(a2.id).name, 'X2A');

  assert.equal(state.removeAxis(b1.id), true);
  assert.equal(state.axes.length, 2);
});

test('axes, load cases, combinations and underlay survive a save/load round-trip', () => {
  const state = new AppState();
  state.addAxis('x', 'X1', 0);
  state.addAxis('y', 'Y1', 910);
  state.addLoad('areaLoad', { x1: 0, y1: 0, x2: 1000, y2: 1000, value: 500, loadCase: 'EQX' });
  state.addLoadCombination('CUSTOM', { DL: 1.2, EQX: 1.5, BOGUS: 3 });
  state.setUnderlay({ name: 'plan.dxf', entities: [{ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }] });

  const restored = new AppState();
  restored.loadJSON(state.toJSON());

  assert.equal(restored.axes.length, 2);
  assert.equal(restored.axes[0].name, 'X1');
  assert.equal(restored.loads[0].loadCase, 'EQX');
  const custom = restored.loadCombinations.find(c => c.name === 'CUSTOM');
  assert.deepEqual(custom.factors, { DL: 1.2, EQX: 1.5 }); // unknown case dropped
  assert.equal(restored.underlay.entities.length, 1);

  // New axes issued after load do not collide with restored ids.
  const next = restored.addAxis('x', null, 5000);
  assert.ok(!state.axes.some(a => a.id === next.id) || state.axes.every(a => a.id !== next.id));
  assert.equal(restored.axes.filter(a => a.id === next.id).length, 1);
});

test('older files without the new fields load with defaults', () => {
  const state = new AppState();
  state.addLoad('pointLoad', { x1: 0, y1: 0, fz: -1 });
  const data = state.toJSON();
  data.schemaVersion = 10;
  delete data.axes;
  delete data.loadCombinations;
  delete data.underlay;
  delete data.loads[0].loadCase;

  const restored = new AppState();
  restored.loadJSON(data);
  assert.deepEqual(restored.axes, []);
  assert.equal(restored.loads[0].loadCase, 'DL');
  assert.equal(restored.loadCombinations.length, 5);
  assert.equal(restored.underlay, null);
});

test('an explicitly emptied combination list stays empty after reload', () => {
  const state = new AppState();
  for (const combo of [...state.loadCombinations]) {
    state.removeLoadCombination(combo.id);
  }
  assert.equal(state.loadCombinations.length, 0);

  const restored = new AppState();
  restored.loadJSON(state.toJSON());
  assert.equal(restored.loadCombinations.length, 0);
});

test('invalid load cases normalize to DL on add/update', () => {
  const state = new AppState();
  const load = state.addLoad('pointLoad', { x1: 0, y1: 0, fz: -1, loadCase: 'NOPE' });
  assert.equal(load.loadCase, 'DL');
  state.updateLoad(load.id, { loadCase: 'wx' });
  assert.equal(state.getLoad(load.id).loadCase, 'WX');
});

test('snapToAxisCoord returns the nearest axis coordinate within tolerance', () => {
  const state = new AppState();
  state.addAxis('x', 'X1', 1000);
  state.addAxis('x', 'X2', 2000);
  state.addAxis('y', 'Y1', 500);

  assert.equal(snapToAxisCoord(1040, 'x', state, 100), 1000);
  assert.equal(snapToAxisCoord(1960, 'x', state, 100), 2000);
  assert.equal(snapToAxisCoord(1500, 'x', state, 100), null);
  assert.equal(snapToAxisCoord(520, 'y', state, 100), 500);

  state.settings.showAxes = false;
  assert.equal(snapToAxisCoord(1040, 'x', state, 100), null);
});

test('member multi-selection toggles and clears consistently', () => {
  const state = new AppState();
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(1000, 0);
  const n3 = state.addNode(2000, 0);
  const m1 = state.addMember(n1.id, n2.id, { type: 'beam' });
  const m2 = state.addMember(n2.id, n3.id, { type: 'beam' });

  state.select('member', m1.id);
  assert.deepEqual(state.selectedMemberIds, [m1.id]);
  assert.ok(state.isMemberSelected(m1.id));

  state.toggleMemberSelection(m2.id);
  assert.deepEqual(state.selectedMemberIds.sort(), [m1.id, m2.id].sort());
  assert.equal(state.selectedMemberId, null); // multi -> no single id

  state.toggleMemberSelection(m1.id);
  assert.deepEqual(state.selectedMemberIds, [m2.id]);
  assert.equal(state.selectedMemberId, m2.id);

  state.removeMember(m2.id);
  assert.deepEqual(state.selectedMemberIds, []);
});

test('selectDrawn keeps single- and multi-select ids in sync', () => {
  const state = new AppState();
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(1000, 0);
  const n3 = state.addNode(2000, 0);
  const m1 = state.addMember(n1.id, n2.id, { type: 'beam' });
  const m2 = state.addMember(n2.id, n3.id, { type: 'beam' });
  const m3 = state.addMember(n1.id, n3.id, { type: 'beam' });

  // Drawing a new member replaces a previous multi-selection entirely.
  state.selectMembers([m1.id, m2.id]);
  state.selectDrawn('member', m3.id);
  assert.equal(state.selectedMemberId, m3.id);
  assert.deepEqual(state.selectedMemberIds, [m3.id]);

  // Drawing a surface or load clears the member selection (both fields).
  state.selectDrawn('surface', 'S1');
  assert.equal(state.selectedSurfaceId, 'S1');
  assert.equal(state.selectedMemberId, null);
  assert.deepEqual(state.selectedMemberIds, []);

  state.selectDrawn('load', 'LD1');
  assert.equal(state.selectedLoadId, 'LD1');
  assert.equal(state.selectedSurfaceId, null);
});

test('removing one member from a multi-selection normalizes to single select', () => {
  const state = new AppState();
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(1000, 0);
  const n3 = state.addNode(2000, 0);
  const m1 = state.addMember(n1.id, n2.id, { type: 'beam' });
  const m2 = state.addMember(n2.id, n3.id, { type: 'beam' });

  state.selectMembers([m1.id, m2.id]);
  state.removeMember(m1.id);
  assert.deepEqual(state.selectedMemberIds, [m2.id]);
  assert.equal(state.selectedMemberId, m2.id);
});
