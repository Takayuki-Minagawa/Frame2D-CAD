import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeRoofDirection,
  roofPlanPoints,
  roofPlanBounds,
  roofHeightAtPoint,
  roofPoint3D,
  roofVertices3D,
  roofSlopeMemberSegments,
  roofPlanAreaM2,
  roofActualAreaM2,
  roofProjectionAreasM2,
  roofSlopeArrow,
} from '../js/roof-geometry.js';

function fakeState(levels) {
  return {
    levels,
    getLevelZ(levelId) {
      const level = levels.find(l => l.id === levelId);
      return Number.isFinite(Number(level?.z)) ? Number(level.z) : 0;
    },
  };
}

function rectSurface(overrides = {}) {
  return {
    shape: 'rect',
    x1: 0,
    y1: 0,
    x2: 4000,
    y2: 3000,
    roofDirection: 'xPlus',
    roofSlope: 0.5,
    ...overrides,
  };
}

test('normalizeRoofDirection accepts the four directions and falls back to xPlus', () => {
  for (const dir of ['xPlus', 'xMinus', 'yPlus', 'yMinus']) {
    assert.equal(normalizeRoofDirection(dir), dir);
  }
  assert.equal(normalizeRoofDirection('zPlus'), 'xPlus');
  assert.equal(normalizeRoofDirection(undefined), 'xPlus');
  assert.equal(normalizeRoofDirection(null), 'xPlus');
});

test('roofPlanPoints expands a rect into four corners', () => {
  assert.deepEqual(roofPlanPoints(rectSurface()), [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 0, y: 3000 },
  ]);
});

test('roofPlanPoints falls back for missing rect extents and non-finite values', () => {
  // x2/y2 fall back to x1/y1
  assert.deepEqual(roofPlanPoints({ shape: 'rect', x1: 100, y1: 200 }), [
    { x: 100, y: 200 },
    { x: 100, y: 200 },
    { x: 100, y: 200 },
    { x: 100, y: 200 },
  ]);
  // polygon points coerce non-finite coordinates to 0
  assert.deepEqual(
    roofPlanPoints({ shape: 'polygon', points: [{ x: 'abc', y: 1 }, { x: 2, y: NaN }, { x: 3, y: 4 }] }),
    [{ x: 0, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 4 }]
  );
});

test('roofPlanPoints returns [] for degenerate polygons and unknown shapes', () => {
  assert.deepEqual(roofPlanPoints({ shape: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }), []);
  assert.deepEqual(roofPlanPoints({ shape: 'polygon', points: null }), []);
  assert.deepEqual(roofPlanPoints({ shape: 'circle' }), []);
  assert.deepEqual(roofPlanPoints({}), []);
});

test('roofPlanBounds computes the bounding box (Infinities when empty)', () => {
  assert.deepEqual(
    roofPlanBounds([{ x: -100, y: 50 }, { x: 300, y: -20 }, { x: 200, y: 400 }]),
    { minX: -100, maxX: 300, minY: -20, maxY: 400 }
  );
  assert.deepEqual(roofPlanBounds([]), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
});

test('roofHeightAtPoint rises from the low edge for each direction', () => {
  const base = rectSurface(); // 4000 x 3000, slope 0.5

  assert.equal(roofHeightAtPoint(base, { x: 0, y: 0 }), 0);
  assert.equal(roofHeightAtPoint(base, { x: 4000, y: 0 }), 2000);

  assert.equal(roofHeightAtPoint(rectSurface({ roofDirection: 'xMinus' }), { x: 0, y: 0 }), 2000);
  assert.equal(roofHeightAtPoint(rectSurface({ roofDirection: 'xMinus' }), { x: 4000, y: 0 }), 0);

  assert.equal(roofHeightAtPoint(rectSurface({ roofDirection: 'yPlus' }), { x: 0, y: 3000 }), 1500);
  assert.equal(roofHeightAtPoint(rectSurface({ roofDirection: 'yMinus' }), { x: 0, y: 0 }), 1500);
});

test('roofHeightAtPoint clamps negative slope and out-of-bounds points to 0', () => {
  assert.equal(roofHeightAtPoint(rectSurface({ roofSlope: -2 }), { x: 4000, y: 0 }), 0);
  // Point below the low edge never yields a negative height
  assert.equal(roofHeightAtPoint(rectSurface(), { x: -500, y: 0 }), 0);
  // Non-finite slope falls back to 0
  assert.equal(roofHeightAtPoint(rectSurface({ roofSlope: 'steep' }), { x: 4000, y: 0 }), 0);
});

test('roofPoint3D and roofVertices3D add level z and roofBaseOffset', () => {
  const state = fakeState([{ id: 'L1', z: 3000 }]);
  const surface = rectSurface({ levelId: 'L1', roofBaseOffset: 100 });

  assert.deepEqual(roofVertices3D(state, surface), [
    { x: 0, y: 0, z: 3100 },
    { x: 4000, y: 0, z: 5100 },
    { x: 4000, y: 3000, z: 5100 },
    { x: 0, y: 3000, z: 3100 },
  ]);
  assert.deepEqual(roofPoint3D(state, surface, { x: 2000, y: 0 }), { x: 2000, y: 0, z: 4100 });

  // Unknown level falls back to z = 0
  const orphan = rectSurface({ levelId: 'missing', roofBaseOffset: 0 });
  assert.deepEqual(roofPoint3D(fakeState([]), orphan, { x: 0, y: 0 }), { x: 0, y: 0, z: 0 });
});

test('roofVertices3D returns [] when the surface has no usable plan', () => {
  assert.deepEqual(roofVertices3D(fakeState([]), { shape: 'polygon', points: [] }), []);
});

test('roofSlopeMemberSegments places members perpendicular to the slope at spacing pitch', () => {
  const segments = roofSlopeMemberSegments(rectSurface(), { spacing: 1000 });
  assert.deepEqual(segments, [
    { start: { x: 0, y: 1000 }, end: { x: 4000, y: 1000 }, station: 1000 },
    { start: { x: 0, y: 2000 }, end: { x: 4000, y: 2000 }, station: 2000 },
  ]);
});

test('roofSlopeMemberSegments boundary lines are dropped when midpoints leave the interior', () => {
  // includeBoundary adds stations at 0 and 3000, but those midpoints lie on the
  // polygon boundary, so pointInPolygonInterior filters them out.
  const segments = roofSlopeMemberSegments(rectSurface(), { spacing: 1000, includeBoundary: true });
  assert.deepEqual(segments.map(s => s.station), [1000, 2000]);
});

test('roofSlopeMemberSegments falls back to a single midline for oversized spacing', () => {
  const segments = roofSlopeMemberSegments(rectSurface(), { spacing: 10000 });
  assert.deepEqual(segments, [
    { start: { x: 0, y: 1500 }, end: { x: 4000, y: 1500 }, station: 1500 },
  ]);
});

test('roofSlopeMemberSegments returns [] for degenerate inputs', () => {
  assert.deepEqual(roofSlopeMemberSegments({ shape: 'polygon', points: [] }), []);
  // All points share the same offset along the member axis (zero extent)
  const flat = {
    shape: 'polygon',
    roofDirection: 'xPlus',
    points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }],
  };
  assert.deepEqual(roofSlopeMemberSegments(flat, { spacing: 500 }), []);
});

test('roofPlanAreaM2 and roofActualAreaM2 convert mm2 to m2 and apply slope factor', () => {
  const surface = rectSurface(); // 4m x 3m
  assert.equal(roofPlanAreaM2(surface), 12);
  assert.ok(Math.abs(roofActualAreaM2(surface) - 12 * Math.sqrt(1.25)) < 1e-9);
  assert.equal(roofPlanAreaM2({ shape: 'polygon', points: [] }), 0);
  assert.equal(roofActualAreaM2({ shape: 'polygon', points: [] }), 0);
});

test('roofProjectionAreasM2 projects the 3D outline onto the wind planes', () => {
  const state = fakeState([{ id: 'L1', z: 3000 }]);
  const surface = rectSurface({ levelId: 'L1', roofBaseOffset: 100 });

  // xPlus shed roof: y-z projection is 3000mm x 2000mm; x-z outline is degenerate.
  assert.deepEqual(roofProjectionAreasM2(state, surface), { xAreaM2: 6, yAreaM2: 0 });
  assert.deepEqual(
    roofProjectionAreasM2(state, { shape: 'polygon', points: [] }),
    { xAreaM2: 0, yAreaM2: 0 }
  );
});

test('roofSlopeArrow points along the climb direction from the plan center', () => {
  assert.deepEqual(roofSlopeArrow(rectSurface()), { x1: 1475, y1: 1500, x2: 2525, y2: 1500 });
  assert.deepEqual(roofSlopeArrow(rectSurface({ roofDirection: 'xMinus' })), { x1: 2525, y1: 1500, x2: 1475, y2: 1500 });
  assert.deepEqual(roofSlopeArrow(rectSurface({ roofDirection: 'yPlus' })), { x1: 2000, y1: 975, x2: 2000, y2: 2025 });
  assert.deepEqual(roofSlopeArrow(rectSurface({ roofDirection: 'yMinus' })), { x1: 2000, y1: 2025, x2: 2000, y2: 975 });
  assert.equal(roofSlopeArrow({ shape: 'polygon', points: [] }), null);
});
