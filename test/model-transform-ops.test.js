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

test('joinMembers joins reversed beams in arbitrary selection order and preserves outer ends', () => {
  const state = new AppState();
  const left = state.addNode(0, 0);
  const middle = state.addNode(2000, 0);
  const right = state.addNode(5000, 0);
  const first = state.addMember(left.id, middle.id, {
    type: 'beam',
    endI: { condition: 'spring', springSymbol: '_SP' },
    endJ: { condition: 'rigid', springSymbol: null },
  });
  // Stored right-to-left: its physical outer end is endI, not endJ.
  const second = state.addMember(right.id, middle.id, {
    type: 'beam',
    endI: { condition: 'pin', springSymbol: null },
    endJ: { condition: 'rigid', springSymbol: null },
  });

  const result = state.joinMembers([second.id, first.id]);

  assert.deepEqual(result, { joined: 2, memberId: state.members[0].id });
  assert.equal(state.members.length, 1);
  assert.equal(state.getNode(middle.id), undefined);
  const joined = state.getMember(result.memberId);
  const start = state.getNode(joined.startNodeId);
  const end = state.getNode(joined.endNodeId);
  const leftCondition = start.x === 0 ? joined.endI : joined.endJ;
  const rightCondition = start.x === 5000 ? joined.endI : joined.endJ;
  assert.deepEqual(leftCondition, { condition: 'spring', springSymbol: '_SP' });
  assert.deepEqual(rightCondition, { condition: 'pin', springSymbol: null });
  assert.deepEqual(new Set([start.x, end.x]), new Set([0, 5000]));
});

test('canJoinMembers orders a three-beam chain and reports its distinct sections', () => {
  const state = new AppState();
  state.addSection({
    target: 'member', type: 'beam', name: 'G2', material: 'steel', b: 250, h: 450,
  });
  const nodes = [0, 1000, 3000, 6000].map(x => state.addNode(x, 0));
  const first = state.addMember(nodes[0].id, nodes[1].id, { type: 'beam', sectionName: '_G' });
  const second = state.addMember(nodes[1].id, nodes[2].id, { type: 'beam', sectionName: 'G2' });
  const third = state.addMember(nodes[3].id, nodes[2].id, { type: 'beam', sectionName: '_G' });

  const check = state.canJoinMembers([third.id, first.id, second.id]);
  assert.equal(check.ok, true);
  assert.deepEqual(check.sections, ['_G', 'G2']);
  assert.deepEqual(check.chain, [first.id, second.id, third.id]);

  assert.equal(state.joinMembers([third.id, first.id, second.id]), null);
  assert.equal(state.members.length, 3);
  const result = state.joinMembers([third.id, first.id, second.id], { sectionName: 'G2' });
  assert.equal(result.joined, 3);
  assert.equal(state.getMember(result.memberId).sectionName, 'G2');
});

test('canJoinMembers rejects incompatible, non-collinear, and disconnected selections', () => {
  {
    const state = new AppState();
    const a = state.addNode(0, 0);
    const b = state.addNode(1000, 0);
    const c = state.addNode(2000, 100);
    const first = state.addMember(a.id, b.id, { type: 'beam' });
    const second = state.addMember(b.id, c.id, { type: 'beam' });
    assert.equal(state.canJoinMembers([first.id, second.id]).reason, 'non-collinear');
  }
  {
    const state = new AppState();
    const a = state.addNode(0, 0);
    const b = state.addNode(1000, 0);
    const beam = state.addMember(a.id, b.id, { type: 'beam' });
    const column = state.addMember(b.id, b.id, { type: 'column', topLevelId: 'L1' });
    assert.equal(state.canJoinMembers([beam.id, column.id]).reason, 'type-mismatch');
  }
  {
    const state = new AppState();
    const a = state.addNode(0, 0);
    const b = state.addNode(1000, 0);
    const c = state.addNode(2000, 0);
    const first = state.addMember(a.id, b.id, { type: 'beam', levelId: 'L0' });
    const second = state.addMember(b.id, c.id, { type: 'beam', levelId: 'L1' });
    assert.equal(state.canJoinMembers([first.id, second.id]).reason, 'level-mismatch');
  }
  {
    const state = new AppState();
    const first = addBeam(state, 0, 0, 1000, 0);
    const second = addBeam(state, 1000, 0, 2000, 0);
    assert.equal(state.canJoinMembers([first.id, second.id]).reason, 'disconnected');
  }
});

test('joinMembers keeps an internal node used by an unjoined member', () => {
  const state = new AppState();
  const left = state.addNode(0, 0);
  const middle = state.addNode(2000, 0);
  const right = state.addNode(4000, 0);
  const branchEnd = state.addNode(2000, 2000);
  const first = state.addMember(left.id, middle.id, { type: 'beam' });
  const second = state.addMember(middle.id, right.id, { type: 'beam' });
  const branch = state.addMember(middle.id, branchEnd.id, { type: 'beam' });

  state.joinMembers([first.id, second.id]);

  assert.ok(state.getNode(middle.id));
  assert.equal(state.getMember(branch.id).startNodeId, middle.id);
  assert.equal(state.members.length, 2);
});

test('joinMembers keeps internal nodes carrying supports and point loads', () => {
  const state = new AppState();
  const nodes = [0, 1000, 2000, 3000].map(x => state.addNode(x, 0));
  const members = [
    state.addMember(nodes[0].id, nodes[1].id, { type: 'beam' }),
    state.addMember(nodes[1].id, nodes[2].id, { type: 'beam' }),
    state.addMember(nodes[2].id, nodes[3].id, { type: 'beam' }),
  ];
  state.addSupport(1000, 0, { levelId: 'L0' });
  state.addLoad('pointLoad', { x1: 2000, y1: 0, levelId: 'L0', fz: -1000 });

  state.joinMembers(members.map(member => member.id));

  assert.ok(state.getNode(nodes[1].id));
  assert.ok(state.getNode(nodes[2].id));
  assert.equal(state.members.length, 1);
});

test('joinMembers joins a vertical column chain by level', () => {
  const state = new AppState();
  const top = state.addLevel('3F', 5600);
  const node = state.addNode(1000, 2000);
  const lower = state.addMember(node.id, node.id, {
    type: 'column', levelId: 'L0', topLevelId: 'L1',
    endI: { condition: 'spring', springSymbol: '_SP' },
    endJ: { condition: 'rigid', springSymbol: null },
  });
  const upper = state.addMember(node.id, node.id, {
    type: 'column', levelId: 'L1', topLevelId: top.id,
    endI: { condition: 'rigid', springSymbol: null },
    endJ: { condition: 'pin', springSymbol: null },
  });

  const check = state.canJoinMembers([upper.id, lower.id]);
  assert.deepEqual(check.chain, [lower.id, upper.id]);
  const result = state.joinMembers([upper.id, lower.id]);
  const joined = state.getMember(result.memberId);
  assert.equal(joined.levelId, 'L0');
  assert.equal(joined.topLevelId, top.id);
  assert.equal(joined.startNodeId, joined.endNodeId);
  assert.deepEqual(joined.endI, { condition: 'spring', springSymbol: '_SP' });
  assert.deepEqual(joined.endJ, { condition: 'pin', springSymbol: null });
});

test('joinMembers normalizes coincident column nodes to one plan node', () => {
  const state = new AppState();
  const top = state.addLevel('3F', 5600);
  const lowerNode = state.addNode(1000, 2000);
  const upperNode = state.addNode(1000, 2000);
  const lower = state.addMember(lowerNode.id, lowerNode.id, {
    type: 'column', levelId: 'L0', topLevelId: 'L1',
  });
  const upper = state.addMember(upperNode.id, upperNode.id, {
    type: 'column', levelId: 'L1', topLevelId: top.id,
  });

  const result = state.joinMembers([upper.id, lower.id]);
  const joined = state.getMember(result.memberId);
  assert.equal(joined.startNodeId, joined.endNodeId);
  assert.equal(joined.startNodeId, lowerNode.id);
  assert.equal(state.getNode(upperNode.id), undefined);
});

test('canJoinMembers rejects columns at different plan positions', () => {
  const state = new AppState();
  const top = state.addLevel('3F', 5600);
  const lowerNode = state.addNode(0, 0);
  const upperNode = state.addNode(100, 0);
  const lower = state.addMember(lowerNode.id, lowerNode.id, {
    type: 'column', levelId: 'L0', topLevelId: 'L1',
  });
  const upper = state.addMember(upperNode.id, upperNode.id, {
    type: 'column', levelId: 'L1', topLevelId: top.id,
  });

  assert.equal(state.canJoinMembers([lower.id, upper.id]).reason, 'column-position-mismatch');
});

test('splitMemberAtPoint projects onto a beam and preserves section and outer ends', () => {
  const state = new AppState();
  const start = state.addNode(0, 0);
  const end = state.addNode(4000, 0);
  const existingCut = state.addNode(1500, 0);
  const original = state.addMember(start.id, end.id, {
    type: 'beam', sectionName: '_G',
    endI: { condition: 'spring', springSymbol: '_SP' },
    endJ: { condition: 'pin', springSymbol: null },
  });

  const result = state.splitMemberAtPoint(original.id, { x: 1500, y: 600 });

  assert.deepEqual(result.createdMemberIds, state.members.map(member => member.id));
  assert.equal(state.getMember(original.id), undefined);
  assert.equal(state.members.length, 2);
  assert.ok(state.members.every(member => member.sectionName === '_G'));
  assert.ok(state.members.every(member =>
    member.startNodeId === existingCut.id || member.endNodeId === existingCut.id
  ));
  const first = state.members.find(member => member.startNodeId === start.id);
  const second = state.members.find(member => member.endNodeId === end.id);
  assert.deepEqual(first.endI, { condition: 'spring', springSymbol: '_SP' });
  assert.equal(first.endJ.condition, 'rigid');
  assert.equal(second.endI.condition, 'rigid');
  assert.deepEqual(second.endJ, { condition: 'pin', springSymbol: null });
});

test('splitMemberAtPoint rejects points projected within the endpoint tolerance', () => {
  const state = new AppState();
  const beam = addBeam(state, 0, 0, 4000, 0);

  assert.equal(state.splitMemberAtPoint(beam.id, { x: 1, y: 100 }), null);
  assert.equal(state.splitMemberAtPoint(beam.id, { x: 3999.5, y: -100 }), null);
  assert.equal(state.members.length, 1);
});

test('splitColumnAtLevel creates lower and upper columns with a rigid internal joint', () => {
  const state = new AppState();
  const top = state.addLevel('3F', 6000);
  const node = state.addNode(0, 0);
  const original = state.addMember(node.id, node.id, {
    type: 'column', sectionName: '_C', levelId: 'L0', topLevelId: top.id,
    endI: { condition: 'spring', springSymbol: '_SP' },
    endJ: { condition: 'pin', springSymbol: null },
  });

  const result = state.splitColumnAtLevel(original.id, { levelId: 'L1' });
  const [lower, upper] = result.createdMemberIds.map(id => state.getMember(id));
  assert.deepEqual([lower.levelId, lower.topLevelId], ['L0', 'L1']);
  assert.deepEqual([upper.levelId, upper.topLevelId], ['L1', top.id]);
  assert.equal(lower.sectionName, '_C');
  assert.equal(upper.sectionName, '_C');
  assert.deepEqual(lower.endI, { condition: 'spring', springSymbol: '_SP' });
  assert.equal(lower.endJ.condition, 'rigid');
  assert.equal(upper.endI.condition, 'rigid');
  assert.deepEqual(upper.endJ, { condition: 'pin', springSymbol: null });
});

test('splitting and rejoining a beam restores its geometry and end conditions', () => {
  const state = new AppState();
  // Create J before I so node-id order cannot accidentally define direction.
  const endNode = state.addNode(5000, 500);
  const startNode = state.addNode(-1000, 500);
  const original = state.addMember(startNode.id, endNode.id, {
    type: 'beam',
    endI: { condition: 'spring', springSymbol: '_SP' },
    endJ: { condition: 'pin', springSymbol: null },
  });

  const split = state.splitMemberAtPoint(original.id, { x: 1250, y: 1500 });
  const joinedResult = state.joinMembers([...split.createdMemberIds].reverse());
  const joined = state.getMember(joinedResult.memberId);
  const start = state.getNode(joined.startNodeId);
  const end = state.getNode(joined.endNodeId);

  assert.deepEqual([start.x, start.y, end.x, end.y], [-1000, 500, 5000, 500]);
  assert.deepEqual(joined.endI, { condition: 'spring', springSymbol: '_SP' });
  assert.deepEqual(joined.endJ, { condition: 'pin', springSymbol: null });
  assert.equal(state.nodes.length, 2);
  assert.equal(state.members.length, 1);
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
