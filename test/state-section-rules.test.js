import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';

function addBeam(state) {
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(3000, 0);
  return state.addMember(n1.id, n2.id, { type: 'beam' });
}

test('section and spring naming rules block reserved or leading underscore names', () => {
  const state = new AppState();

  assert.equal(
    state.addSection({ target: 'member', type: 'beam', name: '_G', b: 300, h: 500, color: '#123456' }),
    null
  );
  assert.equal(
    state.addSection({ target: 'surface', type: 'exteriorWall', name: '_OW', color: '#224466' }),
    null
  );
  assert.equal(
    state.addSection({ target: 'surface', type: 'wall', name: '_W1', color: '#224466' }),
    null
  );
  assert.equal(state.addSpring({ symbol: '_SP', memo: 'dup' }), null);
  assert.equal(state.addSpring({ symbol: '_S1', memo: 'custom' }), null);

  const customSection = state.addSection({
    target: 'member',
    type: 'beam',
    name: 'B300x500',
    b: 300,
    h: 500,
    color: '#123456',
  });
  assert.ok(customSection);

  const customSpring = state.addSpring({ symbol: 'SP1', memo: 'custom spring' });
  assert.ok(customSpring);
});

test('member section changes update dimensions and color, and direct color edit is ignored', () => {
  const state = new AppState();
  state.addSection({
    target: 'member',
    type: 'beam',
    name: 'B300x500',
    b: 300,
    h: 500,
    color: '#123456',
  });

  const beam = addBeam(state);
  assert.equal(beam.sectionName, '_G');
  assert.equal(beam.section.b, 200);
  assert.equal(beam.section.h, 400);
  assert.equal(beam.color, '#666666');

  state.updateMember(beam.id, { sectionName: 'B300x500' });
  assert.equal(beam.sectionName, 'B300x500');
  assert.equal(beam.section.b, 300);
  assert.equal(beam.section.h, 500);
  assert.equal(beam.color, '#123456');

  state.updateSection('member', 'beam', 'B300x500', { b: 320, h: 520, color: '#654321' });
  assert.equal(beam.section.b, 320);
  assert.equal(beam.section.h, 520);
  assert.equal(beam.color, '#654321');

  state.updateMember(beam.id, { color: '#ffffff' });
  assert.equal(beam.color, '#654321');
});

test('surface section changes update color and follow section catalog updates', () => {
  const state = new AppState();
  state.addSection({
    target: 'surface',
    type: 'exteriorWall',
    name: 'OW_RED',
    color: '#aa3344',
  });

  const wall = state.addSurfacePolygon(
    [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }],
    { type: 'exteriorWall' }
  );
  assert.equal(wall.sectionName, '_OW');
  assert.equal(wall.color, '#b57a6b');

  state.updateSurface(wall.id, { sectionName: 'OW_RED' });
  assert.equal(wall.sectionName, 'OW_RED');
  assert.equal(wall.color, '#aa3344');

  state.updateSection('surface', 'exteriorWall', 'OW_RED', { color: '#335577' });
  assert.equal(wall.color, '#335577');

  state.updateSurface(wall.id, { color: '#ffffff' });
  assert.equal(wall.color, '#335577');
});

test('removeSection and removeSpring only allow deleting unused custom definitions', () => {
  const state = new AppState();
  state.addSection({
    target: 'member',
    type: 'beam',
    name: 'B_REMOVE',
    b: 300,
    h: 500,
    color: '#123456',
  });
  state.addSpring({ symbol: 'SP_REMOVE', memo: 'test spring' });

  const beam = addBeam(state);
  state.updateMember(beam.id, { sectionName: 'B_REMOVE' });
  state.updateMember(beam.id, {
    endI: {
      condition: 'spring',
      springSymbol: 'SP_REMOVE',
    },
  });

  assert.equal(state.removeSection('member', 'beam', '_G'), false);
  assert.equal(state.removeSpring('_SP'), false);
  assert.equal(state.removeSection('member', 'beam', 'B_REMOVE'), false);
  assert.equal(state.removeSpring('SP_REMOVE'), false);

  state.updateMember(beam.id, { sectionName: '_G' });
  state.updateMember(beam.id, {
    endI: {
      condition: 'rigid',
      springSymbol: null,
    },
  });

  assert.equal(state.removeSection('member', 'beam', 'B_REMOVE'), true);
  assert.equal(state.removeSpring('SP_REMOVE'), true);
});
