import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';
import { buildAnalysisCSV, buildAnalysisModel } from '../js/analysis-export.js';

function buildFrame() {
  const state = new AppState();
  const [gl, upper] = [...state.levels].sort((a, b) => a.z - b.z);

  // Two columns and a beam spanning them at the upper level
  const c1 = state.addNode(0, 0);
  state.addMember(c1.id, c1.id, { type: 'column', levelId: gl.id, topLevelId: upper.id });
  const c2 = state.addNode(4000, 0);
  state.addMember(c2.id, c2.id, { type: 'column', levelId: gl.id, topLevelId: upper.id });
  const b1 = state.addNode(0, 0);
  const b2 = state.addNode(4000, 0);
  state.addMember(b1.id, b2.id, { type: 'beam', levelId: upper.id });

  state.addSupport(0, 0, { levelId: gl.id, dx: true, dy: true, dz: true });
  state.addLoad('pointLoad', { x1: 2000, y1: 0, fz: -5000, levelId: upper.id, loadCase: 'LL' });
  return { state, gl, upper };
}

test('buildAnalysisModel merges coincident 3D endpoints into shared nodes', () => {
  const { state, upper } = buildFrame();
  const model = buildAnalysisModel(state);

  // Column tops and beam ends coincide: 2 base + 2 top nodes + support reuses base.
  assert.equal(model.nodes.length, 4);
  assert.equal(model.elements.length, 3);

  const beam = model.elements.find(e => e.type === 'beam');
  const columns = model.elements.filter(e => e.type === 'column');
  const columnTopIds = new Set(columns.map(c => c.nodeJ));
  assert.ok(columnTopIds.has(beam.nodeI));
  assert.ok(columnTopIds.has(beam.nodeJ));

  // Beam nodes carry the upper level elevation.
  const beamNodeI = model.nodes.find(n => n.id === beam.nodeI);
  assert.equal(beamNodeI.z, upper.z);

  // Support attaches to the column base node.
  const columnBaseIds = new Set(columns.map(c => c.nodeI));
  assert.ok(columnBaseIds.has(model.supports[0].nodeId));
});

test('buildAnalysisModel carries sections, load cases and combinations', () => {
  const { state } = buildFrame();
  const model = buildAnalysisModel(state);

  assert.equal(model.units.length, 'mm');
  assert.ok(model.sections.some(s => s.name === '_G'));
  assert.equal(model.loads[0].loadCase, 'LL');
  assert.ok(model.loadCases.includes('EQX'));
  assert.ok(model.loadCombinations.length >= 5);
  assert.deepEqual(model.loadCombinations[0].factors, { DL: 1, LL: 1 });
});

test('zero-length elements are dropped after 3D resolution', () => {
  const state = new AppState();
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(0, 0);
  state.addMember(n1.id, n2.id, { type: 'beam' });

  const model = buildAnalysisModel(state);
  assert.equal(model.elements.length, 0);
});

test('buildAnalysisCSV renders node/element/support/load/combo sections', () => {
  const { state } = buildFrame();
  const csv = buildAnalysisCSV(state);

  assert.match(csv, /^section,id/);
  assert.match(csv, /\r\nnode,1,/);
  assert.match(csv, /\r\nelement,M3,beam,/);
  assert.match(csv, /\r\nsupport,SUP1,/);
  assert.match(csv, /\r\nload,LD1,pointLoad,LL,/);
  assert.match(csv, /\r\ncombo,LC1,G\+P,DL=1;LL=1/);
});
