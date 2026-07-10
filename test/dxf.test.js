import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';
import { buildDXF, parseDXF } from '../js/dxf.js';

const SAMPLE_DXF = [
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LINE', '8', 'WALL', '10', '0', '20', '0', '11', '1000', '21', '0',
  '0', 'LWPOLYLINE', '8', 'PLAN', '90', '3', '70', '1',
  '10', '0', '20', '0', '10', '1000', '20', '0', '10', '1000', '20', '800',
  '0', 'CIRCLE', '8', 'COL', '10', '500', '20', '400', '40', '60',
  '0', 'ARC', '8', 'COL', '10', '0', '20', '0', '40', '100', '50', '0', '51', '90',
  '0', 'ENDSEC',
  '0', 'EOF',
].join('\r\n');

test('parseDXF extracts LINE / LWPOLYLINE / CIRCLE / ARC entities', () => {
  const { entities, bounds } = parseDXF(SAMPLE_DXF);
  assert.equal(entities.length, 4);

  const line = entities.find(e => e.type === 'line');
  assert.deepEqual(line, { type: 'line', x1: 0, y1: 0, x2: 1000, y2: 0 });

  const poly = entities.find(e => e.type === 'polyline');
  assert.equal(poly.points.length, 3);
  assert.equal(poly.closed, true);

  const circle = entities.find(e => e.type === 'circle');
  assert.deepEqual(circle, { type: 'circle', cx: 500, cy: 400, r: 60 });

  const arc = entities.find(e => e.type === 'arc');
  assert.equal(arc.startAngle, 0);
  assert.equal(arc.endAngle, 90);

  assert.ok(bounds.maxX >= 1000);
});

test('parseDXF returns no entities for empty input', () => {
  const { entities, bounds } = parseDXF('0\r\nEOF\r\n');
  assert.equal(entities.length, 0);
  assert.equal(bounds, null);
});

test('buildDXF output round-trips through parseDXF', () => {
  const state = new AppState();
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(3000, 0);
  state.addMember(n1.id, n2.id, { type: 'beam' });
  const c = state.addNode(1500, 2000);
  state.addMember(c.id, c.id, { type: 'column', levelId: 'L0', topLevelId: 'L1' });
  state.addSurfaceRect(0, 0, 3000, 2000, { type: 'floor' });
  state.addAxis('x', 'X1', 0);

  const dxf = buildDXF(state);
  const { entities } = parseDXF(dxf);

  const lines = entities.filter(e => e.type === 'line');
  const circles = entities.filter(e => e.type === 'circle');
  // beam(1) + floor rect(4) + axis(1) lines, column as circle
  assert.equal(lines.length, 6);
  assert.equal(circles.length, 1);
  assert.ok(dxf.includes('MEMBER_BEAM_L0'));
  assert.ok(dxf.includes('MEMBER_COLUMN_L0'));
  assert.ok(dxf.includes('SURFACE_FLOOR_L0'));
  assert.ok(dxf.includes('AXIS'));
  assert.ok(dxf.endsWith('EOF\r\n'));
});

test('buildDXF layer names distinguish levels of overlapping members', () => {
  const state = new AppState();
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(3000, 0);
  state.addMember(n1.id, n2.id, { type: 'beam', levelId: 'L0' });
  const n3 = state.addNode(0, 0);
  const n4 = state.addNode(3000, 0);
  state.addMember(n3.id, n4.id, { type: 'beam', levelId: 'L1' });

  const dxf = buildDXF(state);
  assert.ok(dxf.includes('MEMBER_BEAM_L0'));
  assert.ok(dxf.includes('MEMBER_BEAM_L1'));
});

test('parseDXF expands LWPOLYLINE bulge segments into arc points', () => {
  // Two-vertex open polyline with bulge 1: a semicircle from (0,0) to (2000,0).
  const dxf = [
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LWPOLYLINE', '8', 'PLAN', '90', '2', '70', '0',
    '10', '0', '20', '0', '42', '1', '10', '2000', '20', '0',
    '0', 'ENDSEC',
    '0', 'EOF',
  ].join('\r\n');

  const { entities } = parseDXF(dxf);
  const poly = entities.find(e => e.type === 'polyline');
  assert.ok(poly.points.length > 2, 'bulge segment should be tessellated');
  // The arc apex (counterclockwise semicircle) sits at (1000, -1000).
  const apex = poly.points.find(p => Math.abs(p.x - 1000) < 1 && Math.abs(p.y + 1000) < 1);
  assert.ok(apex, 'expected the semicircle apex among the expanded points');
  assert.deepEqual(poly.points[0], { x: 0, y: 0 });
  assert.deepEqual(poly.points.at(-1), { x: 2000, y: 0 });
});

test('buildDXF can limit output to one level', () => {
  const state = new AppState();
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(3000, 0);
  state.addMember(n1.id, n2.id, { type: 'beam', levelId: 'L0' });
  const n3 = state.addNode(0, 1000);
  const n4 = state.addNode(3000, 1000);
  state.addMember(n3.id, n4.id, { type: 'beam', levelId: 'L1' });

  const { entities } = parseDXF(buildDXF(state, { levelId: 'L1' }));
  assert.equal(entities.filter(e => e.type === 'line').length, 1);
});
