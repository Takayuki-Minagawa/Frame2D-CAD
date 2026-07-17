import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ToolManager, projectSplitPoint } from '../js/tools.js';

function makeBeamState() {
  const nodes = new Map([
    [1, { id: 1, x: 0, y: 0 }],
    [2, { id: 2, x: 3000, y: 4000 }],
  ]);
  const member = {
    id: 'M1',
    type: 'beam',
    startNodeId: 1,
    endNodeId: 2,
    geometryMode: 'plan',
    roofRole: null,
  };
  return {
    member,
    getNode: id => nodes.get(id) || null,
  };
}

function makeToolHarness(previousTool = 'select') {
  const { member, getNode } = makeBeamState();
  let selectedIds = [member.id];
  const splitCalls = [];
  const selectedResults = [];
  const temporaryTools = [];
  const completed = [];
  let failed = 0;
  let transactions = 0;
  let updates = 0;

  const state = {
    currentTool: previousTool,
    getMember: id => id === member.id ? member : null,
    getNode,
    isMemberSelected: id => selectedIds.includes(id),
    select(kind, id) {
      assert.equal(kind, 'member');
      selectedIds = [id];
    },
    selectMembers(ids) {
      selectedIds = [...ids];
      selectedResults.push([...ids]);
    },
    splitMemberAtPoint(id, point) {
      splitCalls.push({ id, point });
      return { createdMemberIds: ['M2', 'M3'] };
    },
  };
  const canvas2d = { preview: null, measure: null };
  const history = {
    transact(fn) {
      transactions++;
      return fn();
    },
  };
  const manager = Object.create(ToolManager.prototype);
  Object.assign(manager, {
    canvas2d,
    state,
    history,
    onUpdate: () => { updates++; },
    callbacks: {
      onTemporaryToolChange: tool => temporaryTools.push(tool),
      onSplitPointComplete: result => completed.push(result),
      onSplitPointFailed: () => { failed++; },
    },
    _memberStart: null,
    _surfaceStart: null,
    _surfacePolyline: [],
    _loadStart: null,
    _measureStart: null,
    _splitPointMemberId: null,
    _splitPointPreviousTool: null,
    _getSnappedPos: () => ({ x: 2000, y: 2000 }),
  });

  return {
    manager,
    state,
    canvas2d,
    splitCalls,
    selectedResults,
    temporaryTools,
    completed,
    get failed() { return failed; },
    get transactions() { return transactions; },
    get updates() { return updates; },
    clearSelection() { selectedIds = []; },
  };
}

test('projectSplitPoint projects arbitrary orientations and rejects endpoint cuts', () => {
  const { member, getNode } = makeBeamState();
  const state = { getNode };

  const projected = projectSplitPoint(state, member, { x: 2000, y: 2000 });
  assert.ok(projected);
  assert.ok(Math.abs(projected.x - 1680) < 1e-9);
  assert.ok(Math.abs(projected.y - 2240) < 1e-9);

  assert.equal(projectSplitPoint(state, member, { x: 0.6, y: 0.8 }), null);
  assert.deepEqual(projectSplitPoint(state, member, { x: 1.2, y: 1.6 }), { x: 1.2, y: 1.6 });
  assert.equal(projectSplitPoint(state, { ...member, geometryMode: 'explicit3d' }, { x: 1500, y: 2000 }), null);
});

test('beam split-point mode previews and commits through one history transaction', () => {
  const harness = makeToolHarness();
  const { manager } = harness;

  assert.equal(manager.startSplitPoint('M1'), true);
  assert.equal(harness.state.currentTool, 'splitPoint');
  assert.equal(harness.temporaryTools[0], 'splitPoint');

  manager._splitPointMove({});
  assert.equal(harness.canvas2d.preview.mode, 'point');
  assert.ok(Math.abs(harness.canvas2d.preview.x - 1680) < 1e-9);
  assert.ok(Math.abs(harness.canvas2d.preview.y - 2240) < 1e-9);
  assert.ok(harness.canvas2d.preview.label.length > 0);

  manager._splitPointDown({});
  assert.equal(harness.transactions, 1);
  assert.equal(harness.splitCalls[0].id, 'M1');
  assert.ok(Math.abs(harness.splitCalls[0].point.x - 1680) < 1e-9);
  assert.ok(Math.abs(harness.splitCalls[0].point.y - 2240) < 1e-9);
  assert.deepEqual(harness.selectedResults, [['M2', 'M3']]);
  assert.equal(harness.completed.length, 1);
  assert.equal(harness.failed, 0);
  assert.equal(harness.state.currentTool, 'select');
  assert.equal(harness.canvas2d.preview, null);
});

test('Escape and selection replacement cancel split-point mode without history', () => {
  const escapeHarness = makeToolHarness('member');
  escapeHarness.manager.startSplitPoint('M1');
  escapeHarness.canvas2d.preview = { mode: 'point', x: 1, y: 1 };
  let prevented = false;
  escapeHarness.manager._onKeyDown({
    key: 'Escape',
    code: 'Escape',
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(escapeHarness.state.currentTool, 'member');
  assert.equal(escapeHarness.canvas2d.preview, null);
  assert.equal(escapeHarness.transactions, 0);

  const selectionHarness = makeToolHarness();
  selectionHarness.manager.startSplitPoint('M1');
  selectionHarness.clearSelection();
  assert.equal(selectionHarness.manager.syncSplitPointSelection(), false);
  assert.equal(selectionHarness.state.currentTool, 'select');
  assert.equal(selectionHarness.transactions, 0);
});

test('join and split controls are wired to modal, history, and point preview paths', async () => {
  const [uiSource, appSource, canvasSource] = await Promise.all([
    readFile(new URL('../js/ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/canvas2d.js', import.meta.url), 'utf8'),
  ]);

  assert.match(uiSource, /id="btn-join-members"/);
  assert.match(uiSource, /onJoinMembers\?\.\(selectedIds\(\)\)/);
  assert.match(uiSource, /id="btn-split-member"/);
  assert.match(uiSource, /onSplitMember\?\.\(member\.id\)/);
  assert.match(appSource, /state\.canJoinMembers\(memberIds\)/);
  assert.match(appSource, /joinSplitModal\.choose\(/);
  assert.match(appSource, /history\.transact\(\(\) =>/);
  assert.match(appSource, /state\.splitColumnAtLevel\(memberId, \{ levelId \}\)/);
  assert.match(canvasSource, /this\.preview\.mode === 'point'/);
});
