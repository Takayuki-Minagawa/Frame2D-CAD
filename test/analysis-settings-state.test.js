import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';

test('material catalog provides editable trial defaults and custom material CRUD', () => {
  const state = new AppState();
  assert.deepEqual(state.getMaterial('steel'), {
    name: 'steel', E: 205000, G: 79000, density: 7850, isDefault: true,
  });

  const edited = state.updateMaterial('steel', { E: 210000 });
  assert.equal(edited.E, 210000);
  assert.equal(edited.isDefault, false);
  assert.equal(state.removeMaterial('steel'), false);

  assert.deepEqual(state.addMaterial({ name: 'aluminum', E: 70000, G: 26000, density: 2700 }), {
    name: 'aluminum', E: 70000, G: 26000, density: 2700, isDefault: false,
  });
  assert.equal(state.removeMaterial('aluminum'), true);
});

test('materials, section overrides, spring stiffness, and analysis settings survive CAD roundtrip', () => {
  const source = new AppState();
  source.addMaterial({ name: 'project-steel', E: 200000, G: 77000, density: 7800 });
  source.addSpring({ symbol: 'K_PROJECT', kr: 500000, kt: 1000, memo: 'project value' });
  source.addSection({
    target: 'member',
    type: 'beam',
    name: 'B_PROJECT',
    material: 'project-steel',
    b: 250,
    h: 500,
    A: 130000,
    Iy: 2.8e9,
    Iz: 7e8,
    J: 9e8,
    defaultEndI: { condition: 'spring', springSymbol: 'K_PROJECT' },
  });
  const n1 = source.addNode(0, 0);
  const n2 = source.addNode(5000, 0);
  source.addMember(n1.id, n2.id, { type: 'beam', sectionName: 'B_PROJECT' });
  source.updateAnalysisSettings({
    massSources: { DL: 0.9, LL: 0.2, WX: null },
    selfWeightMode: 'includedInDL',
  });

  const restored = new AppState();
  restored.loadJSON(source.toJSON());

  assert.deepEqual(restored.getMaterial('project-steel'), source.getMaterial('project-steel'));
  assert.deepEqual(restored.getSpring('K_PROJECT'), source.getSpring('K_PROJECT'));
  assert.deepEqual(
    restored.getSection('member', 'beam', 'B_PROJECT'),
    source.getSection('member', 'beam', 'B_PROJECT')
  );
  assert.deepEqual(restored.analysisSettings, source.analysisSettings);
});

test('older CAD files receive analysis and material defaults', () => {
  const data = new AppState().toJSON();
  delete data.analysisSettings;
  delete data.materialCatalog;
  data.schemaVersion = 11;

  const restored = new AppState();
  restored.loadJSON(data);

  assert.deepEqual(restored.analysisSettings.massSources, {
    DL: 1, LL: 0.3, EQX: 0, EQY: 0, WX: 0, WY: 0,
  });
  assert.equal(restored.analysisSettings.selfWeightMode, 'fromDensity');
  assert.equal(restored.getMaterial('steel').E, 205000);
  assert.equal(restored.getMaterial('rc').density, 2400);
  assert.equal(restored.getMaterial('wood').G, 650);
});

test('materials cannot be removed while referenced by a member section', () => {
  const state = new AppState();
  state.addMaterial({ name: 'in-use', E: 1000, G: 400, density: 100 });
  state.addSection({
    target: 'member', type: 'beam', name: 'USES_MATERIAL', material: 'in-use', b: 100, h: 200,
  });
  assert.equal(state.removeMaterial('in-use'), false);
});
