import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAnalysisCSV, buildAnalysisModel } from '../js/analysis-export.js';
import { calculateSectionPropertiesFromShape } from '../js/section-catalog.js';
import { AppState } from '../js/state.js';

function useBeamSection(state, sectionName, startX = 0) {
  const n1 = state.addNode(startX, 0);
  const n2 = state.addNode(startX + 3000, 0);
  state.addMember(n1.id, n2.id, { type: 'beam', sectionName });
}

test('H-section geometry calculates gross properties and effective shear areas', () => {
  const state = new AppState();
  state.addSection({
    target: 'member', type: 'beam', name: 'H300x150', material: 'steel',
    b: 150, h: 300, shape: 'hSection', flangeThickness: 9, webThickness: 6,
    shearAreaRatioY: 0.8, shearAreaRatioZ: 0.6,
  });
  useBeamSection(state, 'H300x150');

  const section = buildAnalysisModel(state).sections.find(item => item.name === 'H300x150');
  const hw = 300 - 2 * 9;
  const expected = {
    A: 2 * 150 * 9 + hw * 6,
    Iy: (150 * 300 ** 3 - (150 - 6) * hw ** 3) / 12,
    Iz: 2 * (9 * 150 ** 3 / 12) + hw * 6 ** 3 / 12,
    J: (2 * 150 * 9 ** 3 + hw * 6 ** 3) / 3,
  };

  assert.equal(section.shape, 'hSection');
  assert.equal(section.flangeThickness, 9);
  assert.equal(section.webThickness, 6);
  assert.deepEqual(
    { A: section.A, Iy: section.Iy, Iz: section.Iz, J: section.J },
    expected
  );
  assert.deepEqual(section.propertySource, {
    A: 'hSection', Iy: 'hSection', Iz: 'hSection', J: 'hSection',
  });
  assert.equal(section.Ay, expected.A * 0.8);
  assert.equal(section.Az, expected.A * 0.6);
  assert.equal(section.shearAreaRatioY, 0.8);
  assert.equal(section.shearAreaRatioZ, 0.6);
});

test('box-section geometry uses hollow inertia and closed-section torsion approximation', () => {
  const state = new AppState();
  state.addSection({
    target: 'member', type: 'beam', name: 'BOX300x200', material: 'steel',
    b: 200, h: 300, shape: 'boxSection', boxThickness: 9,
  });
  useBeamSection(state, 'BOX300x200');

  const section = buildAnalysisModel(state).sections.find(item => item.name === 'BOX300x200');
  const bi = 200 - 2 * 9;
  const hi = 300 - 2 * 9;
  const expected = {
    A: 200 * 300 - bi * hi,
    Iy: (200 * 300 ** 3 - bi * hi ** 3) / 12,
    Iz: (300 * 200 ** 3 - hi * bi ** 3) / 12,
    J: 2 * 9 * (200 - 9) ** 2 * (300 - 9) ** 2 / (200 + 300 - 2 * 9),
  };

  assert.equal(section.shape, 'boxSection');
  assert.equal(section.boxThickness, 9);
  for (const property of ['A', 'Iy', 'Iz', 'J']) {
    assert.ok(Math.abs(section[property] - expected[property]) < 1e-8, property);
  }
  assert.deepEqual(section.propertySource, {
    A: 'boxSection', Iy: 'boxSection', Iz: 'boxSection', J: 'boxSection',
  });
  assert.equal(section.Ay, null);
  assert.equal(section.Az, null);
});

test('shape inputs and shear-area ratios validate on add and update', () => {
  const state = new AppState();
  assert.throws(
    () => state.addSection({
      target: 'member', type: 'beam', name: 'BAD_H', b: 150, h: 300,
      shape: 'hSection', flangeThickness: 150, webThickness: 6,
    }),
    /Invalid H-section proportions: BAD_H/
  );
  assert.throws(
    () => state.addSection({
      target: 'member', type: 'beam', name: 'BAD_RATIO', b: 150, h: 300,
      shearAreaRatioY: 0,
    }),
    /Invalid shear area ratio shearAreaRatioY: BAD_RATIO/
  );

  state.addSection({
    target: 'member', type: 'beam', name: 'VALID_H', b: 150, h: 300,
    shape: 'hSection', flangeThickness: 9, webThickness: 6, shearAreaRatioY: 0.75,
  });
  assert.equal(state.updateSection('member', 'beam', 'VALID_H', { shearAreaRatioY: 1.01 }), null);
  assert.equal(state.updateSection('member', 'beam', 'VALID_H', { webThickness: 151 }), null);

  const saved = state.getSection('member', 'beam', 'VALID_H');
  assert.equal(saved.webThickness, 6);
  assert.equal(saved.shearAreaRatioY, 0.75);
});

test('shape definitions and decimal shear-area ratios survive CAD export/import and analysis CSV export', () => {
  const state = new AppState();
  state.addSection({
    target: 'member', type: 'beam', name: 'H_RT', b: 150, h: 300,
    shape: 'hSection', flangeThickness: 9, webThickness: 6,
    shearAreaRatioY: 0.825, shearAreaRatioZ: 0.625,
  });
  useBeamSection(state, 'H_RT');

  const data = state.toJSON();
  const stored = data.sectionCatalog.find(section => section.name === 'H_RT');
  assert.deepEqual(
    {
      shape: stored.shape,
      flangeThickness: stored.flangeThickness,
      webThickness: stored.webThickness,
      shearAreaRatioY: stored.shearAreaRatioY,
      shearAreaRatioZ: stored.shearAreaRatioZ,
    },
    { shape: 'hSection', flangeThickness: 9, webThickness: 6, shearAreaRatioY: 0.825, shearAreaRatioZ: 0.625 }
  );

  const restored = new AppState();
  restored.loadJSON(data);
  assert.deepEqual(restored.getSection('member', 'beam', 'H_RT'), state.getSection('member', 'beam', 'H_RT'));

  const csv = buildAnalysisCSV(restored);
  assert.match(csv, /shear_area_ratio_y,shear_area_ratio_z,Ay_mm2,Az_mm2/);
  assert.match(csv, /\r\nsect,H_RT,beam,steel,150,300,.*hSection,9,6,,0\.825,0\.625,/);
});

test('shape calculator returns no result for impossible geometry', () => {
  assert.equal(calculateSectionPropertiesFromShape({
    b: 200, h: 200, shape: 'boxSection', boxThickness: 100,
  }), null);
});
