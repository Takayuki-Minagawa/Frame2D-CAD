import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewLineLoad, previewRectangularSlab, previewToPointLoads } from '../js/analysis/load-distribution.js';

const demo = () => JSON.parse(readFileSync(new URL('./fixtures/analysis/rigid-cantilever.json', import.meta.url)));
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-7*Math.max(1, Math.abs(b)), `${a} != ${b}`);
function slab() {
  const m = demo();
  m.nodes = [{ id: 1, x: 10, y: 20, z: 3000 }, { id: 2, x: 10, y: 4020, z: 3000 },
    { id: 3, x: 6010, y: 20, z: 3000 }, { id: 4, x: 6010, y: 4020, z: 3000 }];
  m.elements = [[1, 2], [3, 4], [1, 3], [2, 4]].map(([nodeI, nodeJ], i) =>
    ({ ...m.elements[0], id: i+1, sourceId: `B${i+1}`, nodeI, nodeJ }));
  return m;
}

test('partial uniform line load: endpoint weights and origin moment are analytical', () => {
  const preview = previewLineLoad(demo(), { elementId: 1, start: [300, 0, 0], end: [1500, 0, 0], intensity: [0, 0, -2] });
  assert.deepEqual(preview.targets.map(t => t.force[2]), [-1680, -720]);
  assert.deepEqual(preview.conservation.original.force, [0, 0, -2400]);
  assert.deepEqual(preview.conservation.original.moment, [0, 2160000, 0]);
  assert.ok(preview.conservation.passed);
});

test('reversed line endpoints, inclined member, arbitrary force direction preserve all six resultants', () => {
  const model = demo();
  model.nodes[0] = { id: 1, x: 100, y: -200, z: 300 };
  model.nodes[1] = { id: 2, x: 3100, y: 3800, z: 5300 };
  const p = t => [100+3000*t, -200+4000*t, 300+5000*t];
  for (let i = 1; i <= 50; i++) {
    const start = p(0.8), end = p(i/100);
    const q = [0.3*i, -0.7, 1.3];
    const preview = previewLineLoad(model, { elementId: 1, start, end, intensity: q });
    const totalLength = Math.hypot(...start.map((v, j) => v-end[j]));
    preview.conservation.assigned.force.forEach((v, j) => near(v, q[j]*totalLength));
    preview.conservation.momentResidual.forEach(v => near(v, 0));
  }
});

test('one-way rectangular slab x and y distribute half span tributary width and conserve resultants', () => {
  const model = slab(), before = JSON.stringify(model);
  const rectangle = { x1: 10, x2: 6010, y1: 20, y2: 4020, z: 3000 };
  for (const [spanAxis, edgeElementIds, width] of [['x', [1, 2], 3000], ['y', [3, 4], 2000]]) {
    const preview = previewRectangularSlab(model, { rectangle, spanAxis, edgeElementIds, pressure: -0.005 });
    assert.equal(preview.tributaryWidth, width);
    assert.equal(preview.area, 24000000);
    near(preview.conservation.assigned.force[2], -120000);
    preview.targets.forEach(t => near(t.force[2], -30000));
    near(preview.conservation.assigned.moment[0], -120000*2020);
    near(preview.conservation.assigned.moment[1], 120000*3010);
  }
  assert.equal(JSON.stringify(model), before);
});

test('distribution refuses off-member, wrong floor, zero area, partial slab edge, holes and ambiguous IDs', () => {
  const model = demo(), opts = { elementId: 1, start: [0, 0, 0], end: [3000, 0, 0], intensity: [0, 0, -1] };
  for (const override of [{ start: [0, 1, 0] }, { end: [4000, 0, 0] }, { end: [3000, 0, 3000] },
    { end: [0, 0, 0] }, { intensity: [0, 0, NaN] }]) {
    assert.throws(() => previewLineLoad(model, { ...opts, ...override }));
  }
  const rectangle = { x1: 10, x2: 6010, y1: 20, y2: 4020, z: 3000 };
  for (const override of [{ x2: 10 }, { y2: 4019 }, { z: 0 }, { holes: [[1, 2]] }]) {
    assert.throws(() => previewRectangularSlab(slab(), { rectangle: { ...rectangle, ...override },
      spanAxis: 'x', edgeElementIds: [1, 2], pressure: -1 }));
  }
  model.elements.push({ ...model.elements[0] });
  assert.throws(() => previewLineLoad(model, opts), /one target/);
});

test('explicit nodal export carries mm/N values, member provenance, and requires lumping acknowledgment', () => {
  const preview = previewLineLoad(demo(), { elementId: 1, start: [0, 0, 0], end: [3000, 0, 0],
    intensity: [0, 0, -1], loadCase: 'LL', sourceId: 'LD42' });
  assert.throws(() => previewToPointLoads(preview), /acknowledgeLumping/);
  const loads = previewToPointLoads(preview, { firstId: 8, acknowledgeLumping: true });
  assert.deepEqual(loads.map(l => l.id), [8, 9]);
  assert.deepEqual(loads.map(l => [l.x1, l.fz]), [[0, -1500], [3000, -1500]]);
  assert.equal(loads[1].distribution.originalSourceId, 'LD42');
  assert.equal(loads[1].distribution.sourceBranch, 'primary');
  assert.equal(loads[1].loadCase, 'LL');
  assert.equal(loads[1].type, 'pointLoad');
});
