import test from 'node:test';
import assert from 'node:assert/strict';
import { AppState } from '../js/state.js';
import { focusIssue } from '../js/ui/focus-issue.js';

test('diagnostic focus reveals a hidden member on another level without changing geometry', () => {
  const state = new AppState();
  const a = state.addNode(10000, 10000);
  const b = state.addNode(15000, 10000);
  const member = state.addMember(a.id, b.id, { levelId: 'L1' });
  const original = structuredClone(state.members);
  state.updateSetting('showMembers', false);
  state.updateSetting('memberTypeFilter', 'column');
  const canvas = { camera: {}, logicalWidth: 800, logicalHeight: 500 };
  assert.equal(focusIssue(state, canvas, { elementType: 'member', elementId: member.id }), true);
  assert.equal(state.selectedMemberId, member.id);
  assert.equal(state.activeLevelId, 'L1');
  assert.equal(state.settings.showMembers, true);
  assert.deepEqual(state.members, original);
  assert.equal(12500 * canvas.camera.scale + canvas.camera.offsetX, 400);
  assert.equal(canvas.camera.offsetY - 10000 * canvas.camera.scale, 250);
});

test('diagnostic focus ignores stale targets and supports grouped references', () => {
  const state = new AppState();
  const canvas = { camera: {}, logicalWidth: 800, logicalHeight: 500 };
  assert.equal(focusIssue(state, canvas, { elementType: 'member', elementId: 'missing' }), false);
  const support = state.addSupport(0, 0, { levelId: 'L0' });
  assert.equal(focusIssue(state, canvas, { targets: [{ elementType: 'support', elementId: support.id }] }), true);
  assert.equal(state.selectedSupportId, support.id);
});
