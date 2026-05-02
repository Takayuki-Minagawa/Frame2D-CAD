import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  resolveMemberColor,
  roofRoleColor,
  roofRoleLabelKey,
} from '../js/member-style.js';

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

test('2D/3D/member panel renderers use member color resolver', async () => {
  const canvas2dSource = await readFile(new URL('../js/canvas2d.js', import.meta.url), 'utf8');
  const viewer3dSource = await readFile(new URL('../js/viewer3d.js', import.meta.url), 'utf8');
  const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');

  assert.match(canvas2dSource, /import\s+\{\s*resolveMemberColor\s*\}\s+from\s+'\.\/member-style\.js';/);
  assert.match(viewer3dSource, /import\s+\{\s*resolveMemberColor\s*\}\s+from\s+'\.\/member-style\.js';/);
  assert.match(uiSource, /import\s+\{\s*resolveMemberColor,\s*roofRoleLabelKey\s*\}\s+from\s+'\.\/member-style\.js';/);
  assert.match(canvas2dSource, /resolveMemberColor\(m\)/);
  assert.match(viewer3dSource, /resolveMemberColor\(m\)/);
  assert.match(uiSource, /resolveMemberColor\(member\)/);
});
