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

test('toJSON excludes custom user definitions from CAD data', () => {
  const state = new AppState();
  state.addSection({
    target: 'member', type: 'beam', name: 'B300x500',
    b: 300, h: 500, color: '#123456',
  });
  state.addSpring({ symbol: 'SP1', memo: 'test' });

  const data = state.toJSON();

  // Custom definitions must NOT appear in the exported CAD JSON
  assert.ok(!data.sectionCatalog.some(s => s.name === 'B300x500'));
  assert.ok(!data.springCatalog.some(s => s.symbol === 'SP1'));

  // Default definitions must still be present
  assert.ok(data.sectionCatalog.some(s => s.name === '_G'));
  assert.ok(data.springCatalog.some(s => s.symbol === '_SP'));
});

test('loadJSON preserves existing custom definitions and reassigns IDs', () => {
  // Build source CAD data
  const source = new AppState();
  source.addSection({
    target: 'member', type: 'beam', name: 'B300x500',
    b: 300, h: 500, color: '#123456',
  });
  source.addSection({
    target: 'surface', type: 'floor', name: 'S_BLUE',
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

  // Simulate: user loads custom definitions first, then loads CAD data
  const restored = new AppState();
  restored.addSection({
    target: 'member', type: 'beam', name: 'B300x500',
    b: 300, h: 500, color: '#123456',
  });
  restored.addSection({
    target: 'surface', type: 'floor', name: 'S_BLUE',
    color: '#3366aa',
  });
  restored.loadJSON(exported);

  assert.equal(restored.members.length, 1);
  assert.equal(restored.surfaces.length, 1);
  assert.equal(restored.loads.length, 1);

  assert.equal(restored.members[0].id, 'M1');
  assert.equal(restored.surfaces[0].id, 'S1');
  assert.equal(restored.loads[0].id, 'LD1');

  // Section-driven values resolved from pre-loaded user definitions
  assert.equal(restored.members[0].sectionName, 'B300x500');
  assert.equal(restored.members[0].section.b, 300);
  assert.equal(restored.members[0].section.h, 500);
  assert.equal(restored.members[0].color, '#123456');

  assert.equal(restored.surfaces[0].sectionName, 'S_BLUE');
  assert.equal(restored.surfaces[0].color, '#3366aa');

  // Custom definitions survive the CAD load
  assert.ok(restored.sectionCatalog.some(s => s.name === 'B300x500'));
  assert.ok(restored.sectionCatalog.some(s => s.name === 'S_BLUE'));
});

test('loadJSON backward-compat: old files with embedded custom defs still load', () => {
  // Simulate an old-format file that includes custom sections
  const oldFileData = {
    schemaVersion: 3,
    meta: { name: 'old-file', unit: 'mm', createdAt: '2025-01-01T00:00:00Z' },
    settings: { gridSize: 1000, snap: true, wallDisplayOffset: 120 },
    levels: [{ id: 'L0', name: 'GL', z: 0 }, { id: 'L1', name: '2F', z: 2800 }],
    nodes: [{ id: 'N1', x: 0, y: 0 }, { id: 'N2', x: 5000, y: 0 }],
    sectionCatalog: [
      { target: 'member', type: 'beam', name: '_G', material: 'steel', b: 200, h: 400, color: '#666666', isDefault: true },
      { target: 'member', type: 'column', name: '_C', material: 'steel', b: 105, h: 105, color: '#666666', isDefault: true },
      { target: 'member', type: 'hbrace', name: '_H', material: 'steel', b: 20, h: 20, color: '#666666', isDefault: true },
      { target: 'member', type: 'vbrace', name: '_V', material: 'steel', b: 20, h: 20, color: '#666666', isDefault: true },
      { target: 'surface', type: 'floor', name: '_S', material: '', b: null, h: null, color: '#67a9cf', isDefault: true },
      { target: 'surface', type: 'exteriorWall', name: '_OW', material: '', b: null, h: null, color: '#b57a6b', isDefault: true },
      { target: 'surface', type: 'wall', name: '_IW', material: '', b: null, h: null, color: '#b57a6b', isDefault: true },
      // Custom def embedded in old file
      { target: 'member', type: 'beam', name: 'OLD_BEAM', material: 'steel', b: 250, h: 600, color: '#aabbcc', isDefault: false },
    ],
    springCatalog: [
      { symbol: '_SP', memo: '回転バネ', isDefault: true },
    ],
    members: [
      { type: 'beam', startNodeId: 'N1', endNodeId: 'N2', sectionName: 'OLD_BEAM', levelId: 'L0', color: '#aabbcc', topLevelId: null, bracePattern: 'single', endI: { condition: 'rigid', springSymbol: null }, endJ: { condition: 'rigid', springSymbol: null } },
    ],
    surfaces: [],
    loads: [],
    supports: [],
  };

  const state = new AppState();
  state.loadJSON(oldFileData);

  // Old file's embedded custom def is loaded for backward compat
  assert.ok(state.sectionCatalog.some(s => s.name === 'OLD_BEAM'));
  assert.equal(state.members[0].sectionName, 'OLD_BEAM');
  assert.equal(state.members[0].section.b, 250);
  assert.equal(state.members[0].section.h, 600);
});
