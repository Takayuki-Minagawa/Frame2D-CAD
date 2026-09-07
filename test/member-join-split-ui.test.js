import { uiHarness } from './helpers/ui-harness.js';
import assert from 'node:assert/strict';
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

test('join and split buttons deliver selected IDs to parent callbacks', context => {
  const joined = [], split = [];
  const { ui, state, get, history } = uiHarness(context, undefined, {
    onJoinMembers: ids => joined.push(ids), onSplitMember: id => split.push(id),
  });
  const a = state.addNode(0, 0), b = state.addNode(1000, 0), c = state.addNode(2000, 0);
  const first = state.addMember(a.id, b.id), second = state.addMember(b.id, c.id);
  state.selectMembers([first.id, second.id]); ui.updatePropertyPanel();
  get('btn-join-members').click();
  assert.deepEqual(joined, [[first.id, second.id]]);
  state.select('member', first.id); ui.updatePropertyPanel();
  get('btn-split-member').click();
  assert.deepEqual(split, [first.id]);
  assert.equal(history.undoStack.length, 0);
});

test('joining matching sections records only the parent transaction and undoes/redoes in one step', context => {
  const { ui, state, get, history } = uiHarness(context);
  const a = state.addNode(0, 0), b = state.addNode(1000, 0), c = state.addNode(2000, 0);
  const first = state.addMember(a.id, b.id), second = state.addMember(b.id, c.id);
  // Like the app callback: async, but with no await when sections match.
  ui.callbacks.onJoinMembers = async ids => {
    let result;
    history.transact(() => {
      result = state.joinMembers(ids);
      return Boolean(result);
    });
    state.select('member', result.memberId);
    ui.updatePropertyPanel();
  };
  state.selectMembers([first.id, second.id]); ui.updatePropertyPanel();
  get('btn-join-members').click();
  assert.equal(state.members.length, 1);
  const joinedId = state.members[0].id;
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.undo(), true);
  assert.deepEqual(state.members.map(member => member.id), [first.id, second.id]);
  assert.equal(history.undo(), false);
  assert.equal(history.redo(), true);
  assert.equal(state.members[0].id, joinedId);
  assert.equal(history.redo(), false);
});

test('column splitting with one intermediate level records only the parent transaction', context => {
  const { ui, state, get, history } = uiHarness(context);
  const top = state.addLevel('3F', 6000);
  const node = state.addNode(0, 0);
  const column = state.addMember(node.id, node.id, { type: 'column', levelId: 'L0', topLevelId: top.id });
  ui.callbacks.onSplitMember = async id => {
    let result;
    history.transact(() => {
      result = state.splitColumnAtLevel(id, { levelId: 'L1' });
      return Boolean(result);
    });
    state.selectMembers(result.createdMemberIds);
    ui.updatePropertyPanel();
  };
  state.select('member', column.id); ui.updatePropertyPanel();
  get('btn-split-member').click();
  assert.equal(state.members.length, 2);
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.undo(), true);
  assert.equal(state.members.length, 1);
  assert.equal(state.members[0].id, column.id);
  assert.equal(history.undo(), false);
  assert.equal(history.redo(), true);
  assert.equal(state.members.length, 2);
  assert.equal(history.redo(), false);
});
