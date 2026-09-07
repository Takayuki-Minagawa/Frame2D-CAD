import { uiHarness } from './helpers/ui-harness.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveMemberColor,
  roofRoleColor,
  roofRoleLabelKey,
} from '../js/element-style.js';

test('roof member roles resolve to role colors and labels', () => {
  assert.equal(roofRoleColor('roofEdge'), '#4d8cc8');
  assert.equal(roofRoleColor('roofSlopeBeam'), '#8b6fc6');
  assert.equal(roofRoleColor('roofRidge'), '#d65f5f');
  assert.equal(roofRoleColor('roofValley'), '#3f9b72');
  assert.equal(roofRoleColor('roofHip'), '#d08a3d');
  assert.equal(roofRoleColor('roofJoint'), '#6f7f8f');
  assert.equal(roofRoleColor('unknown'), null);

  assert.equal(roofRoleLabelKey('roofRidge'), 'roofRoleRidge');
  assert.equal(roofRoleLabelKey('unknown'), 'roofRoleOther');
});

test('member color resolution gives roof roles display priority', () => {
  assert.equal(resolveMemberColor({ roofRole: 'roofValley', color: '#111111' }), '#3f9b72');
  assert.equal(resolveMemberColor({ color: '#111111' }), '#111111');
  assert.equal(resolveMemberColor({}), '#666666');
});

test('member property panel displays roof role color over section color', context => {
  const { ui, state, container } = uiHarness(context);
  const a = state.addNode(0, 0), b = state.addNode(1000, 0);
  const member = state.addMember(a.id, b.id, { roofRole: 'roofValley' });
  state.select('member', member.id); ui.updatePropertyPanel();
  assert.match(container.innerHTML, /#3f9b72/);
  assert.ok(container.innerHTML.includes('谷'));
});
