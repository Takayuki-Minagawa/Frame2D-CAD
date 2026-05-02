import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';
import {
  computeQuantitySummary,
  computeSurfaceWeightAreaM2,
  computeSurfaceWindProjectionM2,
  resolveSurfaceVerticalRange,
} from '../js/quantities.js';

test('wall height modes resolve to partial vertical ranges', () => {
  const state = new AppState();

  const waist = state.addSurfaceLine(0, 0, 5000, 0, {
    type: 'wall',
    levelId: 'L0',
    topLevelId: 'L1',
    heightMode: 'waist',
  });
  const hanging = state.addSurfaceLine(0, 1000, 5000, 1000, {
    type: 'wall',
    levelId: 'L0',
    topLevelId: 'L1',
    heightMode: 'hanging',
  });

  assert.deepEqual(resolveSurfaceVerticalRange(state, waist), {
    bottom: 0,
    top: 1200,
    height: 1200,
    bottomOffset: 0,
    topOffset: 1200,
  });
  assert.equal(resolveSurfaceVerticalRange(state, hanging).bottom, 2200);
  assert.equal(resolveSurfaceVerticalRange(state, hanging).top, 2800);
});

test('wall height and weight fields survive CAD serialization', () => {
  const source = new AppState();
  source.addSurfaceLine(0, 0, 5000, 0, {
    type: 'wall',
    levelId: 'L0',
    topLevelId: 'L1',
    heightMode: 'custom',
    bottomOffset: 300,
    topOffset: 1800,
    includeWind: false,
    includeSeismicWeight: true,
    unitWeight: 450,
  });

  const data = source.toJSON();
  assert.equal(data.schemaVersion, 5);
  assert.equal(data.surfaces[0].heightMode, 'custom');
  assert.equal(data.surfaces[0].bottomOffset, 300);
  assert.equal(data.surfaces[0].topOffset, 1800);
  assert.equal(data.surfaces[0].includeWind, false);
  assert.equal(data.surfaces[0].includeSeismicWeight, true);
  assert.equal(data.surfaces[0].unitWeight, 450);

  const restored = new AppState();
  restored.loadJSON(data);
  assert.equal(restored.surfaces[0].heightMode, 'custom');
  assert.equal(restored.surfaces[0].bottomOffset, 300);
  assert.equal(restored.surfaces[0].topOffset, 1800);
  assert.equal(restored.surfaces[0].includeWind, false);
  assert.equal(restored.surfaces[0].includeSeismicWeight, true);
  assert.equal(restored.surfaces[0].unitWeight, 450);
});

test('roof plane fields survive CAD serialization', () => {
  const source = new AppState();
  source.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.25,
    roofDirection: 'yMinus',
    roofBaseOffset: 900,
    includeWind: true,
    includeSeismicWeight: true,
    unitWeight: 700,
  });

  const data = source.toJSON();
  assert.equal(data.schemaVersion, 5);
  assert.equal(data.surfaces[0].type, 'roof');
  assert.equal(data.surfaces[0].roofSlope, 0.25);
  assert.equal(data.surfaces[0].roofDirection, 'yMinus');
  assert.equal(data.surfaces[0].roofBaseOffset, 900);

  const restored = new AppState();
  restored.loadJSON(data);
  assert.equal(restored.surfaces[0].sectionName, '_R');
  assert.equal(restored.surfaces[0].color, '#8b6f47');
  assert.equal(restored.surfaces[0].roofSlope, 0.25);
  assert.equal(restored.surfaces[0].roofDirection, 'yMinus');
  assert.equal(restored.surfaces[0].roofBaseOffset, 900);
  assert.equal(restored.surfaces[0].includeWind, true);
  assert.equal(restored.surfaces[0].includeSeismicWeight, true);
});

test('non-roof surfaces omit roof-only fields', () => {
  const source = new AppState();
  source.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'floor',
    levelId: 'L1',
    includeSeismicWeight: true,
    unitWeight: 300,
  });

  const data = source.toJSON();
  assert.equal(Object.hasOwn(data.surfaces[0], 'roofSlope'), false);
  assert.equal(Object.hasOwn(data.surfaces[0], 'roofDirection'), false);
  assert.equal(Object.hasOwn(data.surfaces[0], 'roofBaseOffset'), false);

  const restored = new AppState();
  restored.loadJSON({
    ...data,
    surfaces: [{
      ...data.surfaces[0],
      roofSlope: null,
      roofDirection: null,
      roofBaseOffset: null,
    }],
  });

  assert.equal(Object.hasOwn(restored.surfaces[0], 'roofSlope'), false);
  assert.equal(Object.hasOwn(restored.toJSON().surfaces[0], 'roofSlope'), false);
});

test('invalid custom wall offsets are rejected instead of being clamped to 1mm height', () => {
  const state = new AppState();
  const wall = state.addSurfaceLine(0, 0, 5000, 0, {
    type: 'wall',
    levelId: 'L0',
    topLevelId: 'L1',
    heightMode: 'custom',
    bottomOffset: 0,
    topOffset: 1200,
  });

  state.updateSurface(wall.id, { bottomOffset: 1500 });
  assert.equal(wall.bottomOffset, 0);
  assert.equal(wall.topOffset, 1200);
  assert.equal(wall.heightMode, 'custom');

  state.updateSurface(wall.id, { topOffset: -100 });
  assert.equal(wall.bottomOffset, 0);
  assert.equal(wall.topOffset, 1200);
});

test('floor surfaces keep wall-only height and wind fields inert', () => {
  const state = new AppState();
  const floor = state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'floor',
    levelId: 'L0',
    heightMode: 'waist',
    bottomOffset: 300,
    topOffset: 1200,
  });

  assert.equal(floor.heightMode, 'custom');
  assert.equal(floor.bottomOffset, 0);
  assert.equal(floor.topOffset, 0);
  assert.equal(floor.includeWind, false);
});

test('wind projection uses direction-specific projected areas', () => {
  const state = new AppState();
  const wall = state.addSurfaceLine(0, 0, 5000, 0, {
    type: 'wall',
    levelId: 'L0',
    topLevelId: 'L1',
    heightMode: 'waist',
  });
  const exterior = state.addSurfacePolygon([
    { x: 0, y: 0 },
    { x: 5000, y: 0 },
    { x: 5000, y: 4000 },
    { x: 0, y: 4000 },
  ], {
    type: 'exteriorWall',
    levelId: 'L0',
    topLevelId: 'L1',
  });

  assert.deepEqual(computeSurfaceWindProjectionM2(state, wall), {
    xAreaM2: 0,
    yAreaM2: 6,
  });
  assert.deepEqual(computeSurfaceWindProjectionM2(state, exterior), {
    xAreaM2: 11.2,
    yAreaM2: 14,
  });
});

test('seismic weight summary uses surface area times unit weight', () => {
  const state = new AppState();
  const floor = state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'floor',
    levelId: 'L0',
    includeSeismicWeight: true,
    unitWeight: 600,
  });
  const wall = state.addSurfaceLine(0, 0, 5000, 0, {
    type: 'wall',
    levelId: 'L0',
    topLevelId: 'L1',
    heightMode: 'waist',
    includeSeismicWeight: true,
    unitWeight: 500,
  });

  assert.equal(computeSurfaceWeightAreaM2(state, floor), 20);
  assert.equal(computeSurfaceWeightAreaM2(state, wall), 6);

  const summary = computeQuantitySummary(state);
  assert.equal(summary.totals.seismicWeightN, 15000);
  assert.equal(summary.totals.windYAreaM2, 6);
});

test('roof planes use sloped actual area and vertical projected wind areas', () => {
  const state = new AppState();
  const roof = state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xPlus',
    includeWind: true,
    includeSeismicWeight: true,
    unitWeight: 500,
  });

  assert.equal(Number(computeSurfaceWeightAreaM2(state, roof).toFixed(3)), 20.881);
  assert.deepEqual(computeSurfaceWindProjectionM2(state, roof), {
    xAreaM2: 6,
    yAreaM2: 0,
  });

  const summary = computeQuantitySummary(state);
  assert.equal(Number(summary.totals.seismicWeightN.toFixed(3)), 10440.307);
  assert.equal(summary.totals.windXAreaM2, 6);
});
