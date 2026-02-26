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

test('toJSON includes used custom definitions but excludes unused ones', () => {
  const state = new AppState();
  // Add two custom sections: one will be used, one will not
  state.addSection({
    target: 'member', type: 'beam', name: 'B300x500',
    b: 300, h: 500, color: '#123456', memo: 'used beam',
  });
  state.addSection({
    target: 'member', type: 'beam', name: 'B_UNUSED',
    b: 100, h: 200, color: '#aabbcc',
  });
  state.addSpring({ symbol: 'SP1', memo: 'used spring' });
  state.addSpring({ symbol: 'SP_UNUSED', memo: 'not used' });

  // Create a member using B300x500 and a spring using SP1
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(5000, 0);
  state.addMember(n1.id, n2.id, {
    type: 'beam', sectionName: 'B300x500',
    endI: { condition: 'spring', springSymbol: 'SP1' },
  });

  const data = state.toJSON();

  // Used custom definitions MUST appear in the exported CAD JSON
  assert.ok(data.sectionCatalog.some(s => s.name === 'B300x500'));
  assert.ok(data.springCatalog.some(s => s.symbol === 'SP1'));

  // Unused custom definitions must NOT appear
  assert.ok(!data.sectionCatalog.some(s => s.name === 'B_UNUSED'));
  assert.ok(!data.springCatalog.some(s => s.symbol === 'SP_UNUSED'));

  // Default definitions must still be present
  assert.ok(data.sectionCatalog.some(s => s.name === '_G'));
  assert.ok(data.springCatalog.some(s => s.symbol === '_SP'));

  // Memo is included in the output
  const exported = data.sectionCatalog.find(s => s.name === 'B300x500');
  assert.equal(exported.memo, 'used beam');
  const exportedSpring = data.springCatalog.find(s => s.symbol === 'SP1');
  assert.equal(exportedSpring.memo, 'used spring');
});

test('loadJSON restores used custom definitions from CAD and preserves existing ones', () => {
  // Build source CAD data with used custom defs
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

  // Used custom defs are now included in the CAD file
  assert.ok(exported.sectionCatalog.some(s => s.name === 'B300x500'));
  assert.ok(exported.sectionCatalog.some(s => s.name === 'S_BLUE'));

  // Simulate: fresh state loads CAD data (no pre-loaded definitions needed)
  const restored = new AppState();
  // Add an extra custom def that is NOT in the CAD file
  restored.addSection({
    target: 'member', type: 'beam', name: 'EXTRA_DEF',
    b: 100, h: 200, color: '#ffffff',
  });
  restored.loadJSON(exported);

  assert.equal(restored.members.length, 1);
  assert.equal(restored.surfaces.length, 1);
  assert.equal(restored.loads.length, 1);

  assert.equal(restored.members[0].id, 'M1');
  assert.equal(restored.surfaces[0].id, 'S1');
  assert.equal(restored.loads[0].id, 'LD1');

  // Section-driven values resolved from CAD-embedded custom definitions
  assert.equal(restored.members[0].sectionName, 'B300x500');
  assert.equal(restored.members[0].section.b, 300);
  assert.equal(restored.members[0].section.h, 500);
  assert.equal(restored.members[0].color, '#123456');

  assert.equal(restored.surfaces[0].sectionName, 'S_BLUE');
  assert.equal(restored.surfaces[0].color, '#3366aa');

  // Custom definitions from CAD file are loaded
  assert.ok(restored.sectionCatalog.some(s => s.name === 'B300x500'));
  assert.ok(restored.sectionCatalog.some(s => s.name === 'S_BLUE'));
  // Pre-existing custom def is preserved across CAD load
  assert.ok(restored.sectionCatalog.some(s => s.name === 'EXTRA_DEF'));
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

test('addSection skips duplicates already loaded from CAD file', () => {
  // Simulate: CAD file includes used custom definitions
  const state = new AppState();
  state.addSection({
    target: 'member', type: 'beam', name: 'B300x500',
    b: 300, h: 500, color: '#123456', memo: 'test memo',
  });

  // Try to import the same definition again (as importUserDefs would do)
  const duplicate = state.addSection({
    target: 'member', type: 'beam', name: 'B300x500',
    b: 300, h: 500, color: '#123456', memo: 'test memo',
  });
  assert.equal(duplicate, null); // Skipped

  // Add a new one that does not overlap
  const newDef = state.addSection({
    target: 'member', type: 'beam', name: 'B400x600',
    b: 400, h: 600, color: '#654321', memo: 'another beam',
  });
  assert.notEqual(newDef, null);
  assert.equal(newDef.memo, 'another beam');
});

test('section memo field is preserved through normalization and catalog', () => {
  const state = new AppState();
  const added = state.addSection({
    target: 'member', type: 'beam', name: 'TEST',
    b: 200, h: 400, color: '#666666', memo: 'my description',
  });
  assert.equal(added.memo, 'my description');

  // Update memo
  const updated = state.updateSection('member', 'beam', 'TEST', { memo: 'updated memo' });
  assert.equal(updated.memo, 'updated memo');

  // Verify in catalog
  const fromCatalog = state.getSection('member', 'beam', 'TEST');
  assert.equal(fromCatalog.memo, 'updated memo');
});
