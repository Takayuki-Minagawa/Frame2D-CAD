// geometry-utils.js - small shared 2D geometry helpers

export const GEOMETRY_EPS = 1e-6;

export function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= GEOMETRY_EPS) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

export function signedArea2(points) {
  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area2 += a.x * b.y - b.x * a.y;
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
