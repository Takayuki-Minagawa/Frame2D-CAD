import test from 'node:test';
import assert from 'node:assert/strict';

import { snapToGrid, snapToNode, applySnap } from '../js/grid.js';
import { AppState } from '../js/state.js';

test('snapToGrid rounds to the nearest grid multiple', () => {
  assert.deepEqual(snapToGrid(1234, 1876, 500), { x: 1000, y: 2000 });
  assert.deepEqual(snapToGrid(1499, 1500, 1000), { x: 1000, y: 2000 });
  assert.deepEqual(snapToGrid(0, 0, 1000), { x: 0, y: 0 });
});

test('snapToGrid keeps exact multiples unchanged', () => {
  assert.deepEqual(snapToGrid(3000, -2000, 1000), { x: 3000, y: -2000 });
  assert.deepEqual(snapToGrid(910, 1820, 910), { x: 910, y: 1820 });
});

test('snapToGrid handles negative coordinates', () => {
  assert.deepEqual(snapToGrid(-1234, -1876, 500), { x: -1000, y: -2000 });
  // Current behavior: Math.round(-0.499) is -0, so the snapped x is -0 (== 0
  // numerically, but distinguishable via Object.is). Pin it as-is.
  const snapped = snapToGrid(-499, -501, 1000);
  assert.ok(Object.is(snapped.x, -0));
  assert.equal(snapped.y, -1000);
});

test('snapToNode returns node coordinates and id within tolerance', () => {
  const state = new AppState();
  const node = state.addNode(1000, 2000);

  const hit = snapToNode(1040, 2030, state, 100);
  assert.deepEqual(hit, { x: 1000, y: 2000, nodeId: node.id });
});

test('snapToNode returns null outside tolerance (strictly less-than match)', () => {
  const state = new AppState();
  state.addNode(0, 0);

  assert.equal(snapToNode(500, 0, state, 100), null);
  // findNodeAt uses "distance < tolerance", so an exact-tolerance hit misses.
  assert.equal(snapToNode(100, 0, state, 100), null);
  assert.notEqual(snapToNode(99, 0, state, 100), null);
});

test('applySnap passes coordinates through when snap is disabled', () => {
  const state = new AppState();
  state.settings.snap = false;
  state.addNode(1000, 1000);

  const camera = { offsetX: 0, offsetY: 0, scale: 1 };
  assert.deepEqual(applySnap(1003, 997, state, camera), { x: 1003, y: 997 });
});

test('applySnap prefers an existing node over the grid', () => {
  const state = new AppState();
  state.settings.snap = true;
  state.settings.gridSize = 1000;
  const node = state.addNode(1050, 1050);

  const camera = { offsetX: 0, offsetY: 0, scale: 1 }; // tolerance = 10 world mm
  assert.deepEqual(applySnap(1055, 1052, state, camera), { x: 1050, y: 1050, nodeId: node.id });
});

test('applySnap falls back to the grid when no node is nearby', () => {
  const state = new AppState();
  state.settings.snap = true;
  state.settings.gridSize = 1000;
  state.addNode(1050, 1050);

  const camera = { offsetX: 0, offsetY: 0, scale: 1 };
  assert.deepEqual(applySnap(2490, 2510, state, camera), { x: 2000, y: 3000 });
});

test('applySnap node tolerance scales with camera zoom (10 screen px)', () => {
  const state = new AppState();
  state.settings.snap = true;
  state.settings.gridSize = 1000;
  const node = state.addNode(1050, 1050);

  // scale 0.1 -> tolerance = 100 world mm, so a 70mm-away point snaps to the node
  const zoomedOut = { offsetX: 0, offsetY: 0, scale: 0.1 };
  assert.deepEqual(applySnap(1100, 1100, state, zoomedOut), { x: 1050, y: 1050, nodeId: node.id });

  // scale 1 -> tolerance = 10 world mm, so the same point snaps to the grid instead
  const zoomedIn = { offsetX: 0, offsetY: 0, scale: 1 };
  assert.deepEqual(applySnap(1100, 1100, state, zoomedIn), { x: 1000, y: 1000 });
});
