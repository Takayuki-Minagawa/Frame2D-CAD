import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

test('toJSON omits runtime IDs for members, surfaces, and loads', () => {
  const state = new AppState();

  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(5000, 0);
  const n3 = state.addNode(5000, 4000);

  state.addMember(n1.id, n2.id, { type: 'beam' });
  state.addSurfacePolygon(
    [{ x: n1.x, y: n1.y }, { x: n2.x, y: n2.y }, { x: n3.x, y: n3.y }],
    { type: 'floor' }
  );
  state.addLoad('pointLoad', { x1: 2500, y1: 2000, fz: -10000 });

  const data = state.toJSON();
  assert.equal(hasOwn(data.members[0], 'id'), false);
  assert.equal(hasOwn(data.surfaces[0], 'id'), false);
  assert.equal(hasOwn(data.loads[0], 'id'), false);
});

test('loadJSON reassigns IDs and preserves section-driven values', () => {
  const source = new AppState();
  source.addSection({
    target: 'member',
    type: 'beam',
    name: 'B300x500',
    b: 300,
    h: 500,
    color: '#123456',
  });
  source.addSection({
    target: 'surface',
    type: 'floor',
    name: 'S_BLUE',
    color: '#3366aa',
  });

  const n1 = source.addNode(0, 0);
  const n2 = source.addNode(5000, 0);
  const beam = source.addMember(n1.id, n2.id, { type: 'beam', sectionName: 'B300x500' });
  const floor = source.addSurfaceRect(0, 0, 5000, 4000, { type: 'floor', sectionName: 'S_BLUE' });
  const load = source.addLoad('lineLoad', { x1: 0, y1: 0, x2: 5000, y2: 0, value: 1500 });

  assert.equal(beam.id, 'M1');
  assert.equal(floor.id, 'S1');
  assert.equal(load.id, 'LD1');

  const exported = source.toJSON();
  const restored = new AppState();
  restored.loadJSON(exported);

  assert.equal(restored.members.length, 1);
  assert.equal(restored.surfaces.length, 1);
  assert.equal(restored.loads.length, 1);

  assert.equal(restored.members[0].id, 'M1');
  assert.equal(restored.surfaces[0].id, 'S1');
  assert.equal(restored.loads[0].id, 'LD1');

  assert.equal(restored.members[0].sectionName, 'B300x500');
  assert.equal(restored.members[0].section.b, 300);
  assert.equal(restored.members[0].section.h, 500);
  assert.equal(restored.members[0].color, '#123456');

  assert.equal(restored.surfaces[0].sectionName, 'S_BLUE');
  assert.equal(restored.surfaces[0].color, '#3366aa');
});
