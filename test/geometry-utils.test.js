import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  edgeInwardNormal,
  pointInPolygonInterior,
  pointOnPolygonBoundary,
  pointToSegmentDistance,
  polygonVertexCentroid,
  signedArea2,
  uniquePositiveNumbers,
} from '../js/geometry-utils.js';

test('shared plan geometry helpers cover polygon interior and edge orientation', () => {
  const polygon = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 0, y: 3000 },
  ];

  assert.equal(signedArea2(polygon), 24000000);
  assert.deepEqual(polygonVertexCentroid(polygon), { x: 2000, y: 1500 });
  assert.equal(pointToSegmentDistance({ x: 2000, y: 500 }, polygon[0], polygon[1]), 500);
  assert.equal(pointOnPolygonBoundary({ x: 2000, y: 0 }, polygon), true);
  assert.equal(pointInPolygonInterior({ x: 2000, y: 1500 }, polygon), true);
  assert.equal(pointInPolygonInterior({ x: 2000, y: 0 }, polygon), false);
  assert.deepEqual(edgeInwardNormal(polygon[0], polygon[1], polygon), { x: -0, y: 1 });
  assert.deepEqual(uniquePositiveNumbers([250, 100, 100.0001, 10, 0, -1]), [250, 100, 10]);
});

test('roof and state modules import shared plan geometry helpers', async () => {
  const roofGeometrySource = await readFile(new URL('../js/roof-geometry.js', import.meta.url), 'utf8');
  const stateSource = await readFile(new URL('../js/state.js', import.meta.url), 'utf8');

  assert.match(roofGeometrySource, /from '\.\/geometry-utils\.js';/);
  assert.match(stateSource, /from '\.\/geometry-utils\.js';/);
  assert.doesNotMatch(roofGeometrySource, /function pointInPolygonInterior/);
  assert.doesNotMatch(stateSource, /function pointInPolygonInterior/);
  assert.doesNotMatch(stateSource, /function roofEdgeInwardNormal/);
});
