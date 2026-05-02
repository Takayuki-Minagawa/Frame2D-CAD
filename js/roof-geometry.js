// roof-geometry.js - shared roof plane geometry helpers

const MM2_TO_M2 = 1 / 1000000;
const ROOF_DIRECTIONS = new Set(['xPlus', 'xMinus', 'yPlus', 'yMinus']);

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
  const baseZ = getLevelZ(state, surface.levelId) + finiteNumber(surface.roofBaseOffset, 0);
  return points.map(point => ({
    x: point.x,
    y: point.y,
    z: baseZ + roofHeightAtPoint(surface, point, bounds),
  }));
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
