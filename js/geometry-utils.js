// geometry-utils.js - small shared 2D geometry helpers

export const GEOMETRY_EPS = 1e-6;

export function finiteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function nonNegativeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= GEOMETRY_EPS) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

// Coordinate-argument form of pointToSegmentDistance.
// Merged from a former state.js copy: that copy only special-cased exactly
// zero-length segments, while this delegates to pointToSegmentDistance which
// treats segments shorter than sqrt(GEOMETRY_EPS) (~0.001mm) as points; the
// results are numerically indistinguishable at model scale.
export function pointToSegmentDist(px, py, ax, ay, bx, by) {
  return pointToSegmentDistance({ x: px, y: py }, { x: ax, y: ay }, { x: bx, y: by });
}

// Unclamped projection parameter t of point (px,py) onto segment a->b.
export function segmentParameter(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  return ((px - ax) * dx + (py - ay) * dy) / lenSq;
}

export function pointsClose(a, b, tolerance = 1) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

// True when the two segments share both endpoints (in either direction).
export function sameSegment(a1, a2, b1, b2, tolerance = 1) {
  return (
    pointsClose(a1, b1, tolerance) && pointsClose(a2, b2, tolerance)
  ) || (
    pointsClose(a1, b2, tolerance) && pointsClose(a2, b1, tolerance)
  );
}

function segmentDirection(a, b, point) {
  return (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
}

export function segmentsIntersect(a1, a2, b1, b2, tolerance = 1) {
  const d1 = segmentDirection(a1, a2, b1);
  const d2 = segmentDirection(a1, a2, b2);
  const d3 = segmentDirection(b1, b2, a1);
  const d4 = segmentDirection(b1, b2, a2);
  if (((d1 > tolerance && d2 < -tolerance) || (d1 < -tolerance && d2 > tolerance)) &&
    ((d3 > tolerance && d4 < -tolerance) || (d3 < -tolerance && d4 > tolerance))) {
    return true;
  }
  return pointToSegmentDist(b1.x, b1.y, a1.x, a1.y, a2.x, a2.y) <= tolerance ||
    pointToSegmentDist(b2.x, b2.y, a1.x, a1.y, a2.x, a2.y) <= tolerance ||
    pointToSegmentDist(a1.x, a1.y, b1.x, b1.y, b2.x, b2.y) <= tolerance ||
    pointToSegmentDist(a2.x, a2.y, b1.x, b1.y, b2.x, b2.y) <= tolerance;
}

export function polygonHasSelfIntersections(points, tolerance = 1) {
  for (let i = 0; i < points.length; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % points.length];
    for (let j = i + 1; j < points.length; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (i === 0 && j === points.length - 1) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % points.length];
      if (segmentsIntersect(a1, a2, b1, b2, tolerance)) return true;
    }
  }
  return false;
}

export function signedArea2(points, aKey = 'x', bKey = 'y') {
  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area2 += finiteNumber(a[aKey], 0) * finiteNumber(b[bKey], 0) -
      finiteNumber(b[aKey], 0) * finiteNumber(a[bKey], 0);
  }
  return area2;
}

export function polygonVertexCentroid(points) {
  const sum = points.reduce((acc, point) => ({
    x: acc.x + point.x,
    y: acc.y + point.y,
  }), { x: 0, y: 0 });
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

// Ray-casting point-in-polygon test (boundary points are implementation
// dependent). A former state.js copy taking (px, py, points) was merged into
// this one: both used the same current-vertex-based crossing formula and the
// epsilon fallback on the divisor only differed on horizontal edges, which the
// crossing test already excludes, so the behavior is identical.
export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = (a.y > point.y) !== (b.y > point.y);
    if (!crosses) continue;
    const xAtY = ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || GEOMETRY_EPS) + a.x;
    if (point.x < xAtY) inside = !inside;
  }
  return inside;
}

export function pointOnPolygonBoundary(point, polygon, tolerance = GEOMETRY_EPS) {
  return polygon.some((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    return pointToSegmentDistance(point, start, end) <= tolerance;
  });
}

export function pointInPolygonInterior(point, polygon, tolerance = GEOMETRY_EPS) {
  if (pointOnPolygonBoundary(point, polygon, tolerance)) return false;
  return pointInPolygon(point, polygon);
}

export function edgeInwardNormal(start, end, polygon) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= GEOMETRY_EPS) return { x: 0, y: 0 };
  return signedArea2(polygon) >= 0
    ? { x: -dy / length, y: dx / length }
    : { x: dy / length, y: -dx / length };
}

export function uniquePositiveNumbers(values, tolerance = 0.001) {
  const numbers = [];
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) continue;
    if (numbers.some(existing => Math.abs(existing - value) <= tolerance)) continue;
    numbers.push(value);
  }
  return numbers;
}

// Compute outward-offset polygon with properly connected corners.
// Uses winding order (signed area) to determine consistent outward normals,
// which works correctly for both convex and concave polygons.
export function offsetPolygonOutward(points, offset) {
  const n = points.length;
  if (n < 2) return points.map(p => ({ x: p.x, y: p.y }));

  // Signed area in world coordinates (Y-up): positive = CCW, negative = CW
  const area2 = signedArea2(points);

  // Outward normal per edge based on winding
  const normals = [];
  for (let i = 0; i < n; i++) {
    const p1 = points[i], p2 = points[(i + 1) % n];
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) { normals.push({ x: 0, y: 0 }); continue; }
    // CCW (area2 > 0): outward = (dy, -dx)
    // CW  (area2 < 0): outward = (-dy, dx)
    const nx = area2 >= 0 ? dy / len : -dy / len;
    const ny = area2 >= 0 ? -dx / len : dx / len;
    normals.push({ x: nx, y: ny });
  }

  // Intersect adjacent offset edges to get clean corners
  const result = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const pA = { x: points[prev].x + normals[prev].x * offset, y: points[prev].y + normals[prev].y * offset };
    const dA = { x: points[i].x - points[prev].x, y: points[i].y - points[prev].y };
    const pB = { x: points[i].x + normals[i].x * offset, y: points[i].y + normals[i].y * offset };
    const dB = { x: points[(i + 1) % n].x - points[i].x, y: points[(i + 1) % n].y - points[i].y };

    const cross = dA.x * dB.y - dA.y * dB.x;
    if (Math.abs(cross) < 1e-9) {
      result.push(pB);
    } else {
      const t = ((pB.x - pA.x) * dB.y - (pB.y - pA.y) * dB.x) / cross;
      result.push({ x: pA.x + t * dA.x, y: pA.y + t * dA.y });
    }
  }
  return result;
}

function roundedKey(value) {
  return String(Number(finiteNumber(value, 0).toFixed(6)));
}

// Returns { minX, maxX, minY, maxY } when the 4 points form an axis-aligned
// rectangle (in any vertex order), otherwise null.
export function axisAlignedRectangleFromPoints(points) {
  if (!Array.isArray(points) || points.length !== 4) return null;
  const xs = [...new Set(points.map(point => roundedKey(point.x)))].map(Number).sort((a, b) => a - b);
  const ys = [...new Set(points.map(point => roundedKey(point.y)))].map(Number).sort((a, b) => a - b);
  if (xs.length !== 2 || ys.length !== 2) return null;
  const [minX, maxX] = xs;
  const [minY, maxY] = ys;
  if (maxX - minX <= 0.001 || maxY - minY <= 0.001) return null;
  const corners = new Set([
    `${roundedKey(minX)},${roundedKey(minY)}`,
    `${roundedKey(maxX)},${roundedKey(minY)}`,
    `${roundedKey(maxX)},${roundedKey(maxY)}`,
    `${roundedKey(minX)},${roundedKey(maxY)}`,
  ]);
  const isRectangle = points.every(point => corners.has(`${roundedKey(point.x)},${roundedKey(point.y)}`));
  return isRectangle ? { minX, maxX, minY, maxY } : null;
}
