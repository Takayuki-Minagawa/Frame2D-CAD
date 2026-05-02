// roof-geometry.js - shared roof plane geometry helpers

const MM2_TO_M2 = 1 / 1000000;
const ROOF_DIRECTIONS = new Set(['xPlus', 'xMinus', 'yPlus', 'yMinus']);
const EPS = 1e-6;

export function normalizeRoofDirection(value) {
  return ROOF_DIRECTIONS.has(value) ? value : 'xPlus';
}

export function roofPlanPoints(surface) {
  if (surface.shape === 'polygon' && Array.isArray(surface.points) && surface.points.length >= 3) {
    return surface.points.map(p => ({ x: finiteNumber(p.x, 0), y: finiteNumber(p.y, 0) }));
  }
  if (surface.shape === 'rect') {
    const x1 = finiteNumber(surface.x1, 0);
    const y1 = finiteNumber(surface.y1, 0);
    const x2 = finiteNumber(surface.x2, x1);
    const y2 = finiteNumber(surface.y2, y1);
    return [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ];
  }
  return [];
}

export function roofPlanBounds(points) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxY: Math.max(bounds.maxY, point.y),
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  });
}

export function roofHeightAtPoint(surface, point, bounds = null) {
  const dir = normalizeRoofDirection(surface.roofDirection);
  const slope = Math.max(0, finiteNumber(surface.roofSlope, 0));
  const b = bounds || roofPlanBounds(roofPlanPoints(surface));

  if (dir === 'xMinus') return Math.max(0, b.maxX - point.x) * slope;
  if (dir === 'yPlus') return Math.max(0, point.y - b.minY) * slope;
  if (dir === 'yMinus') return Math.max(0, b.maxY - point.y) * slope;
  return Math.max(0, point.x - b.minX) * slope;
}

export function roofVertices3D(state, surface) {
  const points = roofPlanPoints(surface);
  if (points.length < 3) return [];
  const bounds = roofPlanBounds(points);
  return points.map(point => roofPoint3D(state, surface, point, bounds));
}

export function roofPoint3D(state, surface, point, bounds = null) {
  const b = bounds || roofPlanBounds(roofPlanPoints(surface));
  const baseZ = getLevelZ(state, surface.levelId) + finiteNumber(surface.roofBaseOffset, 0);
  return {
    x: finiteNumber(point.x, 0),
    y: finiteNumber(point.y, 0),
    z: baseZ + roofHeightAtPoint(surface, point, b),
  };
}

export function roofSlopeMemberSegments(surface, options = {}) {
  const points = roofPlanPoints(surface);
  if (points.length < 3) return [];

  const spacing = positiveNumber(options.spacing, 910);
  const minLength = Math.max(0, finiteNumber(options.minLength, 1));
  const includeBoundary = !!options.includeBoundary;
  const slope = roofSlopeVector(surface.roofDirection);
  const normal = { x: -slope.y, y: slope.x };
  const offsets = points.map(point => dot2(point, normal));
  const minOffset = Math.min(...offsets);
  const maxOffset = Math.max(...offsets);
  if (!Number.isFinite(minOffset) || !Number.isFinite(maxOffset) || maxOffset - minOffset <= EPS) return [];

  const stations = roofSlopeMemberStations(minOffset, maxOffset, spacing, includeBoundary);
  const segments = [];
  for (const station of stations) {
    const hits = linePolygonIntersections(points, normal, slope, station);
    for (let i = 0; i + 1 < hits.length; i++) {
      const start = hits[i].point;
      const end = hits[i + 1].point;
      if (Math.hypot(end.x - start.x, end.y - start.y) < minLength) continue;
      const midpoint = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
      };
      if (!pointInPolygonInterior(midpoint, points)) continue;
      segments.push({ start, end, station });
    }
  }
  return segments;
}

export function roofPlanAreaM2(surface) {
  const points = roofPlanPoints(surface);
  if (points.length < 3) return 0;
  return Math.abs(signedArea2(points, 'x', 'y')) * 0.5 * MM2_TO_M2;
}

export function roofActualAreaM2(surface) {
  const slope = Math.max(0, finiteNumber(surface.roofSlope, 0));
  return roofPlanAreaM2(surface) * Math.sqrt(1 + slope * slope);
}

export function roofProjectionAreasM2(state, surface) {
  const vertices = roofVertices3D(state, surface);
  if (vertices.length < 3) return { xAreaM2: 0, yAreaM2: 0 };
  return {
    xAreaM2: Math.abs(signedArea2(vertices, 'y', 'z')) * 0.5 * MM2_TO_M2,
    yAreaM2: Math.abs(signedArea2(vertices, 'x', 'z')) * 0.5 * MM2_TO_M2,
  };
}

export function roofSlopeArrow(surface) {
  const points = roofPlanPoints(surface);
  if (points.length < 3) return null;
  const b = roofPlanBounds(points);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const span = Math.max(1, Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.35);
  const dir = normalizeRoofDirection(surface.roofDirection);
  if (dir === 'xMinus') return { x1: cx + span / 2, y1: cy, x2: cx - span / 2, y2: cy };
  if (dir === 'yPlus') return { x1: cx, y1: cy - span / 2, x2: cx, y2: cy + span / 2 };
  if (dir === 'yMinus') return { x1: cx, y1: cy + span / 2, x2: cx, y2: cy - span / 2 };
  return { x1: cx - span / 2, y1: cy, x2: cx + span / 2, y2: cy };
}

function roofSlopeVector(direction) {
  const dir = normalizeRoofDirection(direction);
  if (dir === 'xMinus') return { x: -1, y: 0 };
  if (dir === 'yPlus') return { x: 0, y: 1 };
  if (dir === 'yMinus') return { x: 0, y: -1 };
  return { x: 1, y: 0 };
}

function roofSlopeMemberStations(minOffset, maxOffset, spacing, includeBoundary) {
  const stations = [];
  const start = includeBoundary ? minOffset : minOffset + spacing;
  for (let station = start; station < maxOffset - EPS; station += spacing) {
    if (station > minOffset + EPS || includeBoundary) stations.push(station);
  }
  if (includeBoundary && (stations.length === 0 || Math.abs(stations[stations.length - 1] - maxOffset) > EPS)) {
    stations.push(maxOffset);
  }
  if (!includeBoundary && stations.length === 0) {
    stations.push((minOffset + maxOffset) / 2);
  }
  return stations;
}

function linePolygonIntersections(points, normal, slope, station) {
  const hits = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const offsetA = dot2(a, normal);
    const offsetB = dot2(b, normal);
    const span = offsetB - offsetA;
    if (Math.abs(span) <= EPS) continue;
    const ratio = (station - offsetA) / span;
    if (ratio < -EPS || ratio > 1 + EPS) continue;
    const point = {
      x: a.x + (b.x - a.x) * ratio,
      y: a.y + (b.y - a.y) * ratio,
    };
    addUniqueHit(hits, {
      point,
      t: dot2(point, slope),
    });
  }
  return hits.sort((a, b) => a.t - b.t);
}

function addUniqueHit(hits, hit) {
  if (hits.some(existing => Math.abs(existing.t - hit.t) <= EPS)) return;
  hits.push(hit);
}

function pointInPolygonInterior(point, polygon) {
  if (pointOnPolygonBoundary(point, polygon)) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = (a.y > point.y) !== (b.y > point.y);
    if (!crosses) continue;
    const xAtY = (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
    if (point.x < xAtY) inside = !inside;
  }
  return inside;
}

function pointOnPolygonBoundary(point, polygon) {
  return polygon.some((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    return pointToSegmentDist(point, start, end) <= EPS;
  });
}

function pointToSegmentDist(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= EPS) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function dot2(point, vector) {
  return finiteNumber(point.x, 0) * vector.x + finiteNumber(point.y, 0) * vector.y;
}

function getLevelZ(state, levelId) {
  const level = (state.levels || []).find(l => l.id === levelId);
  return finiteNumber(level?.z, 0);
}

function signedArea2(points, aKey, bKey) {
  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    area2 += finiteNumber(p1[aKey], 0) * finiteNumber(p2[bKey], 0) -
      finiteNumber(p2[aKey], 0) * finiteNumber(p1[bKey], 0);
  }
  return area2;
}

function finiteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
