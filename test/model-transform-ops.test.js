import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';

function addBeam(state, x1, y1, x2, y2, options = {}) {
  const n1 = state.addNode(x1, y1);
  const n2 = state.addNode(x2, y2);
  return state.addMember(n1.id, n2.id, { type: 'beam', ...options });
}

test('mergeNearbyNodes merges nodes within tolerance and re-points members', () => {
  const state = new AppState();
  const a = state.addNode(0, 0);
  const b = state.addNode(5000, 0);
  const c = state.addNode(5000.4, 0.3); // within default 1mm of b
  const d = state.addNode(9000, 0);
  state.addMember(a.id, b.id, { type: 'beam' });
  state.addMember(c.id, d.id, { type: 'beam' });

  const result = state.mergeNearbyNodes();
  assert.equal(result.mergedNodes, 1);
  assert.equal(state.nodes.length, 3);
  const [m1, m2] = state.members;
  assert.equal(m1.endNodeId, m2.startNodeId);
});

test('splitIntersectingMembers splits crossing beams at the intersection', () => {
  const state = new AppState();
  addBeam(state, 0, 0, 4000, 0);
  addBeam(state, 2000, -2000, 2000, 2000);

  const result = state.splitIntersectingMembers();
  assert.equal(result.splitMembers, 2);
  assert.equal(result.createdMembers, 4);
  assert.equal(state.members.length, 4);

  // The intersection node (2000, 0) is shared by all four segments.
  const shared = state.findNodeAt(2000, 0, 1);
  assert.ok(shared);
  const touching = state.members.filter(
    m => m.startNodeId === shared.id || m.endNodeId === shared.id
  );
  assert.equal(touching.length, 4);
});

test('splitIntersectingMembers splits at T-junctions and keeps end conditions on outer ends', () => {
  const state = new AppState();
  const main = addBeam(state, 0, 0, 4000, 0, {
    endI: { condition: 'spring', springSymbol: '_SP' },
    endJ: { condition: 'pin', springSymbol: null },
  });
  addBeam(state, 2000, 0, 2000, 3000);

  const result = state.splitIntersectingMembers();
  assert.equal(result.splitMembers, 1);
  assert.equal(state.getMember(main.id), undefined);

  const segments = state.members.filter(m => {
    const n1 = state.getNode(m.startNodeId);
    const n2 = state.getNode(m.endNodeId);
    return n1.y === 0 && n2.y === 0;
  });
  assert.equal(segments.length, 2);
  const first = segments.find(m => state.getNode(m.startNodeId).x === 0);
  const last = segments.find(m => state.getNode(m.endNodeId).x === 4000);
  assert.equal(first.endI.condition, 'spring');
  assert.equal(first.endJ.condition, 'rigid'); // interior cut stays continuous
  assert.equal(last.endI.condition, 'rigid');
  assert.equal(last.endJ.condition, 'pin');
});

test('splitIntersectingMembers ignores parallel and roof members', () => {
  const state = new AppState();
  addBeam(state, 0, 0, 4000, 0);
  addBeam(state, 0, 500, 4000, 500);
  addBeam(state, 2000, -2000, 2000, 2000, { roofRole: 'roofEdge' });

  const result = state.splitIntersectingMembers();
  assert.equal(result.splitMembers, 0);
  assert.equal(state.members.length, 3);
});

test('mirrorMembers creates mirrored copies across x=coord', () => {
  const state = new AppState();
  const beam = addBeam(state, 0, 0, 2000, 1000);

  const created = state.mirrorMembers([beam.id], { axis: 'x', coord: 3000 });
  assert.equal(created.length, 1);
  const n1 = state.getNode(created[0].startNodeId);
  const n2 = state.getNode(created[0].endNodeId);
  assert.equal(n1.x, 6000);
  assert.equal(n1.y, 0);
  assert.equal(n2.x, 4000);
  assert.equal(n2.y, 1000);
  assert.equal(state.members.length, 2);
});

test('rotateMembers rotates in place around the selection center', () => {
  const state = new AppState();
  const beam = addBeam(state, 0, 0, 2000, 0);

  const result = state.rotateMembers([beam.id], { angle: 90 });
  assert.equal(result.rotated, 1);
  const n1 = state.getNode(beam.startNodeId);
  const n2 = state.getNode(beam.endNodeId);
  // Center (1000, 0): (0,0) -> (1000,-1000), (2000,0) -> (1000,1000)
  assert.equal(Math.round(n1.x), 1000);
  assert.equal(Math.round(n1.y), -1000);
  assert.equal(Math.round(n2.x), 1000);
  assert.equal(Math.round(n2.y), 1000);
});

test('rotateMembers detaches nodes shared with unselected members', () => {
  const state = new AppState();
  const shared = state.addNode(0, 0);
  const b1 = state.addNode(2000, 0);
  const b2 = state.addNode(0, 2000);
  const selected = state.addMember(shared.id, b1.id, { type: 'beam' });
  const other = state.addMember(shared.id, b2.id, { type: 'beam' });

  state.rotateMembers([selected.id], { angle: 180 });

  // The unselected member's node stays at the origin.
  const otherStart = state.getNode(state.getMember(other.id).startNodeId);
  assert.equal(otherStart.x, 0);
  assert.equal(otherStart.y, 0);
  // The selected member no longer shares that node.
  assert.notEqual(state.getMember(selected.id).startNodeId, other.startNodeId);
});

test('arrayCopyMembers creates offset copies and reuses coincident nodes', () => {
  const state = new AppState();
  const beam = addBeam(state, 0, 0, 1000, 0);

  const created = state.arrayCopyMembers([beam.id], { dx: 1000, dy: 0, count: 2 });
  assert.equal(created.length, 2);
  assert.equal(state.members.length, 3);
  // Copy 1 spans 1000..2000: its start node is the original end node.
  assert.equal(created[0].startNodeId, beam.endNodeId);
});
