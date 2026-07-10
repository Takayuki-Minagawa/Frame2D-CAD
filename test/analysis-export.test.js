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
  assert.equal(model.units.lineLoad, 'N/mm');
  assert.equal(model.units.areaLoad, 'N/mm2');
  assert.equal(model.units.moment, 'N*mm');
  assert.ok(model.sections.some(s => s.name === '_G'));
  assert.equal(model.loads[0].loadCase, 'LL');
  assert.ok(model.loadCases.includes('EQX'));
  assert.ok(model.loadCombinations.length >= 5);
  assert.deepEqual(model.loadCombinations[0].factors, { DL: 1, LL: 1 });
});

test('load values are converted to the mm-N base system', () => {
  const state = new AppState();
  state.addLoad('lineLoad', { x1: 0, y1: 0, x2: 1000, y2: 0, value: 1000 });      // 1000 N/m
  state.addLoad('areaLoad', { x1: 0, y1: 0, x2: 1000, y2: 1000, value: 2e6 });    // 2e6 N/m²
  state.addLoad('pointLoad', { x1: 0, y1: 0, fz: -5000, mx: 5 });                 // 5 N·m

  const model = buildAnalysisModel(state);
  const line = model.loads.find(l => l.type === 'lineLoad');
  const area = model.loads.find(l => l.type === 'areaLoad');
  const point = model.loads.find(l => l.type === 'pointLoad');
  assert.equal(line.value, 1);        // N/mm
  assert.equal(area.value, 2);        // N/mm²
  assert.equal(point.fz, -5000);      // forces stay in N
  assert.equal(point.mx, 5000);       // N·mm
});

test('cross vertical braces expand into two diagonal elements', () => {
  const state = new AppState();
  const [gl, upper] = [...state.levels].sort((a, b) => a.z - b.z);
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(2000, 0);
  const brace = state.addMember(n1.id, n2.id, {
    type: 'vbrace', levelId: gl.id, topLevelId: upper.id, bracePattern: 'cross',
  });

  const model = buildAnalysisModel(state);
  assert.equal(model.elements.length, 2);
  assert.equal(model.nodes.length, 4);
  const [d1, d2] = model.elements;
  assert.equal(d1.id, brace.id);
  assert.equal(d2.id, `${brace.id}X`);
  assert.equal(d1.bracePattern, 'cross');
  // The second diagonal mirrors the first: same node set, opposite pairing.
  assert.equal(d2.nodeI, model.nodes.find(n => n.x === 2000 && n.z === gl.z).id);
  assert.equal(d2.nodeJ, model.nodes.find(n => n.x === 0 && n.z === upper.z).id);
});

test('nodes merge by real distance even across rounding-cell boundaries', () => {
  const state = new AppState();
  const a = state.addNode(0.049, 0);
  const b = state.addNode(1000, 0);
  state.addMember(a.id, b.id, { type: 'beam' });
  const c = state.addNode(0.051, 0);
  const d = state.addNode(1000, 1000);
  state.addMember(c.id, d.id, { type: 'beam' });

  const model = buildAnalysisModel(state);
  // 0.049 and 0.051 are 0.002mm apart -> one shared node (3 total).
  assert.equal(model.nodes.length, 3);
});

test('zero-length elements are dropped after 3D resolution', () => {
  const state = new AppState();
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(0, 0);
  state.addMember(n1.id, n2.id, { type: 'beam' });

  const model = buildAnalysisModel(state);
  assert.equal(model.elements.length, 0);
});

test('buildAnalysisCSV renders node/element/section/support/load/combo sections', () => {
  const { state } = buildFrame();
  const csv = buildAnalysisCSV(state);

  assert.match(csv, /^section,id/);
  assert.match(csv, /\r\nnode,1,/);
  assert.match(csv, /\r\nelement_header,id,type,node_i,node_j,section,material,b_mm,h_mm,end_i,end_j,roof_role/);
  assert.match(csv, /\r\nelement,M3,beam,/);
  assert.match(csv, /\r\nsect_header,name,type,material,b_mm,h_mm/);
  assert.match(csv, /\r\nsect,_G,/);
  assert.match(csv, /\r\nspring_header,symbol,memo/);
  assert.match(csv, /\r\nsupport,SUP1,/);
  assert.match(csv, /\r\nload_header,id,type,case,unit,/);
  assert.match(csv, /\r\nload,LD1,pointLoad,LL,N;N\*mm,/);
  assert.match(csv, /\r\ncombo,LC1,G\+P,DL=1;LL=1/);
});

test('buildAnalysisCSV element rows carry section dimensions', () => {
  const { state } = buildFrame();
  const model = buildAnalysisModel(state);
  const beam = model.elements.find(e => e.type === 'beam');
  const csv = buildAnalysisCSV(state);
  const row = csv.split('\r\n').find(line => line.startsWith(`element,${beam.id},`));
  const cells = row.split(',');
  assert.equal(Number(cells[7]), beam.b);
  assert.equal(Number(cells[8]), beam.h);
});
