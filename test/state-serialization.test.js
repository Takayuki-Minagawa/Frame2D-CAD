import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

test('loadJSON accepts supported schema versions and rejects future versions', () => {
  const source = new AppState();
  const currentData = source.toJSON();
  const currentVersion = currentData.schemaVersion;

  for (let version = 1; version <= currentVersion; version++) {
    const restored = new AppState();
    restored.loadJSON({ ...currentData, schemaVersion: version });
    assert.equal(restored.schemaVersion, currentVersion);
  }

  assert.throws(
    () => new AppState().loadJSON({ ...currentData, schemaVersion: currentVersion + 1 }),
    /Unsupported schema version/
  );
});

test('toJSON writes numeric node IDs and omits runtime IDs for members, surfaces, and loads', () => {
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
  assert.deepEqual(data.nodes.map(n => n.id), [1, 2, 3]);
  assert.equal(data.members[0].startNodeId, 1);
  assert.equal(data.members[0].endNodeId, 2);
  assert.equal(hasOwn(data.members[0], 'id'), false);
  assert.equal(hasOwn(data.surfaces[0], 'id'), false);
  assert.equal(hasOwn(data.loads[0], 'id'), false);
});

test('loadJSON accepts numeric node IDs and keeps future saved IDs numeric', () => {
  const state = new AppState();
  state.loadJSON({
    schemaVersion: 10,
    meta: { name: 'numeric-node-ids', unit: 'mm', createdAt: '2026-06-03T00:00:00Z' },
    settings: {},
    levels: [{ id: 'L0', name: 'GL', z: 0 }, { id: 'L1', name: '2F', z: 2800 }],
    nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 5000, y: 0, z: 0 }],
    members: [{ type: 'beam', startNodeId: 1, endNodeId: 2, sectionName: '_G', levelId: 'L0' }],
    surfaces: [],
    loads: [],
    supports: [],
  });

  assert.equal(state.getNode(1).x, 0);
  assert.equal(state.members[0].startNodeId, 1);
  assert.equal(state.members[0].endNodeId, 2);

  const n3 = state.addNode(10000, 0);
  state.addMember(2, n3.id, { type: 'beam' });

  const data = state.toJSON();
  assert.deepEqual(data.nodes.map(n => n.id), [1, 2, 3]);
  assert.equal(data.members[1].startNodeId, 2);
  assert.equal(data.members[1].endNodeId, 3);
});

test('display mode settings default, serialize, and normalize on load', () => {
  const state = new AppState();

  assert.equal(state.settings.planLayerDisplayMode, 'all');
  assert.equal(state.settings.member3dRenderMode, 'solid');
  assert.deepEqual(state.getPlanLayerStyle('L0'), { visible: true, alpha: 1, halftone: false, selectable: true });
  assert.deepEqual(state.getPlanLayerStyle('L1'), { visible: true, alpha: 1, halftone: false, selectable: true });

  state.activeLayerId = 'L1';
  state.settings.planLayerDisplayMode = 'halftone';
  state.settings.planLayerSelectionLock = true;
  state.settings.view3dLayerDisplayMode = 'current';
  state.settings.member3dRenderMode = 'line';
  assert.deepEqual(state.getPlanLayerStyle('L0'), { visible: true, alpha: 0.28, halftone: true, selectable: false });
  assert.deepEqual(state.getPlanLayerStyle('L1'), { visible: true, alpha: 1, halftone: false, selectable: true });
  assert.deepEqual(state.getPlanLayerStyle('L0', { view: '3d' }), { visible: false, alpha: 0, halftone: false, selectable: false });

  const data = state.toJSON();
  assert.equal(data.settings.planLayerDisplayMode, 'halftone');
  assert.equal(data.settings.planLayerSelectionLock, true);
  assert.equal(data.settings.view3dLayerDisplayMode, 'current');
  assert.equal(data.settings.member3dRenderMode, 'line');

  const restored = new AppState();
  restored.loadJSON({
    ...data,
    settings: {
      ...data.settings,
      planLayerDisplayMode: 'bad-mode',
      view3dLayerDisplayMode: 'bad-mode',
      member3dRenderMode: 'bad-mode',
      memberTypeFilter: 'brace',
    },
  });
  assert.equal(restored.settings.planLayerDisplayMode, 'all');
  assert.equal(restored.settings.view3dLayerDisplayMode, 'all');
  assert.equal(restored.settings.member3dRenderMode, 'solid');
  assert.equal(restored.settings.memberTypeFilter, 'all');
});

test('hit tests accept predicates so locked or hidden elements do not block visible candidates', () => {
  const state = new AppState();
  const lowerA = state.addNode(0, 0);
  const lowerB = state.addNode(4000, 0);
  const upperA = state.addNode(0, 0);
  const upperB = state.addNode(4000, 0);
  const lower = state.addMember(lowerA.id, lowerB.id, { type: 'beam', levelId: 'L0' });
  const upper = state.addMember(upperA.id, upperB.id, { type: 'beam', levelId: 'L1' });

  state.activeLayerId = 'L1';
  state.settings.planLayerDisplayMode = 'current';

  assert.equal(state.findMemberAt(2000, 0, 300).id, lower.id);
  assert.equal(
    state.findMemberAt(2000, 0, 300, member => state.isMemberSelectable(member)).id,
    upper.id
  );
});

test('display presets and filters drive member visibility and selection', () => {
  const state = new AppState();
  state.activeLayerId = 'L1';
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(4000, 0);
  const beam = state.addMember(n1.id, n2.id, { type: 'beam', levelId: 'L0' });

  state.applyDisplayPreset('review');
  assert.equal(state.settings.planLayerDisplayMode, 'halftone');
  assert.equal(state.settings.planLayerSelectionLock, true);
  assert.equal(state.settings.showMemberEndSymbols, true);
  assert.equal(state.isMemberVisible(beam, '2d'), true);
  assert.equal(state.isMemberSelectable(beam), false);

  state.settings.memberTypeFilter = 'column';
  assert.equal(state.isMemberVisible(beam, '2d'), false);
});

test('copyLevelElements duplicates nodes and maps story members to the target level', () => {
  const state = new AppState();
  const third = state.addLevel('3F', 5600);
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(5000, 0);
  const beam = state.addMember(n1.id, n2.id, { type: 'beam', levelId: 'L0' });
  const column = state.addMember(n1.id, n1.id, { type: 'column', levelId: 'L0', topLevelId: 'L1' });
  state.addSurfaceRect(0, 0, 5000, 4000, { type: 'floor', levelId: 'L0', topLevelId: 'L0' });
  state.addLoad('pointLoad', { x1: 2500, y1: 2000, levelId: 'L0', fz: -1000 });
  state.addSupport(0, 0, { levelId: 'L0' });

  const counts = state.copyLevelElements('L0', 'L1');
  assert.deepEqual(counts, { members: 2, surfaces: 1, loads: 1, supports: 1 });
  assert.equal(state.members.length, 4);

  const copiedBeam = state.members.find(m => m.id !== beam.id && m.type === 'beam' && m.levelId === 'L1');
  const copiedColumn = state.members.find(m => m.id !== column.id && m.type === 'column' && m.levelId === 'L1');
  assert.ok(copiedBeam);
  assert.ok(copiedColumn);
  assert.equal(copiedColumn.topLevelId, third.id);
  assert.notEqual(copiedBeam.startNodeId, beam.startNodeId);
  assert.notEqual(copiedBeam.endNodeId, beam.endNodeId);
});

test('copyLevelElements separates copied roof groups and skips generated roof members', () => {
  const state = new AppState();
  state.addLevel('3F', 5600);
  const roof = state.addSurfacePolygon(
    [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 4000 }, { x: 0, y: 4000 }],
    { type: 'roof', levelId: 'L0', topLevelId: 'L0', roofGroupId: 'RG1' }
  );
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(5000, 0);
  state.addMember(n1.id, n2.id, {
    type: 'beam',
    levelId: 'L0',
    geometryMode: 'explicit3d',
    startZ: 0,
    endZ: 500,
    roofRole: 'roofEdge',
  });

  const counts = state.copyLevelElements('L0', 'L1');
  assert.equal(counts.members, 0);
  assert.equal(counts.surfaces, 1);
  const copiedRoof = state.surfaces.find(s => s.id !== roof.id && s.type === 'roof');
  assert.ok(copiedRoof);
  assert.equal(copiedRoof.roofGroupId, 'RG1_L1');
});

test('validateModel reports missing references, duplicates, and orphan nodes', () => {
  const state = new AppState();
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(0, 0);
  state.addNode(9000, 9000);
  state.addMember(n1.id, n2.id, { type: 'beam', levelId: 'L0' });
  state.addMember(n1.id, n2.id, { type: 'beam', levelId: 'L0' });
  state.members.push({
    id: 'BROKEN',
    type: 'beam',
    startNodeId: 'NOPE',
    endNodeId: n2.id,
    levelId: 'L9',
    topLevelId: null,
    sectionName: '_G',
    section: { b: 200, h: 400 },
    endI: { condition: 'pin', springSymbol: null },
    endJ: { condition: 'pin', springSymbol: null },
  });

  const codes = state.validateModel().map(issue => issue.code);
  assert.ok(codes.includes('missing-node'));
  assert.ok(codes.includes('duplicate-member'));
  assert.ok(codes.includes('zero-length-member'));
  assert.ok(codes.includes('orphan-node'));
});

test('validateModel uses explicit 3D Z values for length and duplicate checks', () => {
  const state = new AppState();
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(0, 0);
  state.addMember(n1.id, n2.id, {
    type: 'beam',
    levelId: 'L0',
    geometryMode: 'explicit3d',
    startZ: 0,
    endZ: 1000,
  });
  state.addMember(n1.id, n2.id, {
    type: 'beam',
    levelId: 'L0',
    geometryMode: 'explicit3d',
    startZ: 0,
    endZ: 2000,
  });

  const codes = state.validateModel().map(issue => issue.code);
  assert.ok(!codes.includes('zero-length-member'));
  assert.ok(!codes.includes('duplicate-member'));
});

test('toJSON includes used custom definitions but excludes unused ones', () => {
  const state = new AppState();
  state.addSpring({ symbol: 'SP1', memo: 'used spring' });
  state.addSpring({ symbol: 'SP_UNUSED', memo: 'not used' });
  // Add two custom sections: one will be used, one will not
  state.addSection({
    target: 'member', type: 'beam', name: 'B300x500',
    b: 300, h: 500, color: '#123456', memo: 'used beam',
    defaultEndI: { condition: 'rigid' },
    defaultEndJ: { condition: 'spring', springSymbol: 'SP1' },
  });
  state.addSection({
    target: 'member', type: 'beam', name: 'B_UNUSED',
    b: 100, h: 200, color: '#aabbcc',
  });

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
  assert.deepEqual(exported.defaultEndI, { condition: 'rigid', springSymbol: null });
  assert.deepEqual(exported.defaultEndJ, { condition: 'spring', springSymbol: 'SP1' });
  const exportedSpring = data.springCatalog.find(s => s.symbol === 'SP1');
  assert.equal(exportedSpring.memo, 'used spring');
});

test('loadJSON restores used custom definitions from CAD and preserves existing ones', () => {
  // Build source CAD data with used custom defs
  const source = new AppState();
  source.addSection({
    target: 'member', type: 'beam', name: 'B300x500',
    b: 300, h: 500, color: '#123456',
    defaultEndI: { condition: 'rigid' },
    defaultEndJ: { condition: 'spring', springSymbol: '_SP' },
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
  assert.deepEqual(
    restored.getSection('member', 'beam', 'B300x500').defaultEndI,
    { condition: 'rigid', springSymbol: null }
  );
  assert.deepEqual(
    restored.getSection('member', 'beam', 'B300x500').defaultEndJ,
    { condition: 'spring', springSymbol: '_SP' }
  );

  assert.equal(restored.surfaces[0].sectionName, 'S_BLUE');
  assert.equal(restored.surfaces[0].color, '#3366aa');

  // Custom definitions from CAD file are loaded
  assert.ok(restored.sectionCatalog.some(s => s.name === 'B300x500'));
  assert.ok(restored.sectionCatalog.some(s => s.name === 'S_BLUE'));
  // Pre-existing custom def is preserved across CAD load
  assert.ok(restored.sectionCatalog.some(s => s.name === 'EXTRA_DEF'));
});

test('loadJSON restores embedded custom defs from CAD files', () => {
  const fileData = {
    schemaVersion: 10,
    meta: { name: 'cad-file', unit: 'mm', createdAt: '2026-06-03T00:00:00Z' },
    settings: { gridSize: 1000, snap: true, wallDisplayOffset: 120 },
    levels: [{ id: 'L0', name: 'GL', z: 0 }, { id: 'L1', name: '2F', z: 2800 }],
    nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 5000, y: 0 }],
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
      { type: 'beam', startNodeId: 1, endNodeId: 2, sectionName: 'OLD_BEAM', levelId: 'L0', color: '#aabbcc', topLevelId: null, bracePattern: 'single', endI: { condition: 'rigid', springSymbol: null }, endJ: { condition: 'rigid', springSymbol: null } },
    ],
    surfaces: [],
    loads: [],
    supports: [],
  };

  const state = new AppState();
  state.loadJSON(fileData);

  // Embedded custom definitions are loaded with the CAD data.
  assert.ok(state.sectionCatalog.some(s => s.name === 'OLD_BEAM'));
  assert.equal(state.members[0].sectionName, 'OLD_BEAM');
  assert.equal(state.members[0].section.b, 250);
  assert.equal(state.members[0].section.h, 600);
  assert.deepEqual(
    state.getSection('member', 'beam', 'OLD_BEAM').defaultEndI,
    { condition: 'pin', springSymbol: null }
  );
  assert.deepEqual(
    state.getSection('member', 'beam', 'OLD_BEAM').defaultEndJ,
    { condition: 'pin', springSymbol: null }
  );
});

test('loadJSON normalizes missing section preset springs to the default spring', () => {
  const fileData = {
    schemaVersion: 10,
    meta: { name: 'invalid-spring-preset', unit: 'mm', createdAt: '2026-06-03T00:00:00Z' },
    settings: { gridSize: 1000, snap: true, wallDisplayOffset: 120 },
    levels: [{ id: 'L0', name: 'GL', z: 0 }, { id: 'L1', name: '2F', z: 2800 }],
    nodes: [],
    sectionCatalog: [
      { target: 'member', type: 'beam', name: 'B_BAD_SPRING', material: 'steel', b: 300, h: 500, color: '#123456', isDefault: false, defaultEndI: { condition: 'spring', springSymbol: 'MISSING_SP' }, defaultEndJ: { condition: 'spring' } },
    ],
    springCatalog: [
      { symbol: '_SP', memo: '回転バネ', isDefault: true },
    ],
    members: [],
    surfaces: [],
    loads: [],
    supports: [],
  };

  const state = new AppState();
  state.loadJSON(fileData);

  assert.deepEqual(
    state.getSection('member', 'beam', 'B_BAD_SPRING').defaultEndI,
    { condition: 'spring', springSymbol: '_SP' }
  );
  assert.deepEqual(
    state.getSection('member', 'beam', 'B_BAD_SPRING').defaultEndJ,
    { condition: 'spring', springSymbol: '_SP' }
  );
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
