import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';
import { buildSampleModel, SAMPLE_IDS } from '../js/samples.js';

test('every sample model builds and loads cleanly', () => {
  for (const sampleId of SAMPLE_IDS) {
    const data = buildSampleModel(sampleId);
    const state = new AppState();
    state.loadJSON(data);

    assert.ok(state.members.length > 0, `${sampleId}: has members`);
    assert.ok(state.supports.length > 0, `${sampleId}: has supports`);
    assert.ok(state.axes.length > 0, `${sampleId}: has axes`);
    assert.ok(state.loads.length > 0, `${sampleId}: has loads`);

    const errors = state.validateModel().filter(issue => issue.severity === 'error');
    assert.deepEqual(errors, [], `${sampleId}: no model errors`);
  }
});

test('gable house sample includes a generated roof group', () => {
  const state = new AppState();
  state.loadJSON(buildSampleModel('gableHouse'));
  const roofs = state.surfaces.filter(s => s.type === 'roof');
  assert.ok(roofs.length >= 2);
  assert.ok(state.members.some(m => m.roofRole === 'roofEdge'));
  assert.ok(state.members.some(m => m.roofRole === 'roofRidge'));
});

test('two-story frame sample has columns on both stories and case-tagged loads', () => {
  const state = new AppState();
  state.loadJSON(buildSampleModel('twoStoryFrame'));
  const columnLevels = new Set(state.members.filter(m => m.type === 'column').map(m => m.levelId));
  assert.equal(columnLevels.size, 2);
  const cases = new Set(state.loads.map(l => l.loadCase));
  assert.ok(cases.has('DL'));
  assert.ok(cases.has('LL'));
});
