// quantities.js - projected wind areas and seismic weight summaries

import { isWallSurfaceType } from './state.js';

const MM2_TO_M2 = 1 / 1000000;

export function resolveSurfaceVerticalRange(state, surface) {
  const baseZ = getLevelZ(state, surface.levelId);
  const storyHeight = getStoryHeight(state, surface.levelId, surface.topLevelId);
  const bottomOffset = finiteNumber(surface.bottomOffset, 0);
  const topOffset = finiteNumber(surface.topOffset, storyHeight);
  const bottom = baseZ + bottomOffset;
  const top = baseZ + topOffset;
  const height = Math.max(0, top - bottom);
  return { bottom, top, height, bottomOffset, topOffset };
}

export function computeQuantitySummary(state) {
  const levels = [...(state.levels || [])].sort((a, b) => a.z - b.z);
  const byLevel = new Map(levels.map(level => [
    level.id,
    {
      levelId: level.id,
      label: `${level.name} (z=${level.z})`,
      windXAreaM2: 0,
      windYAreaM2: 0,
      seismicWeightN: 0,
    },
  ]));

  const ensureLevel = levelId => {
    if (!byLevel.has(levelId)) {
      byLevel.set(levelId, {
        levelId,
        label: levelId || '-',
        windXAreaM2: 0,
        windYAreaM2: 0,
        seismicWeightN: 0,
      });
    }
    return byLevel.get(levelId);
  };

  const totals = {
    windXAreaM2: 0,
    windYAreaM2: 0,
    seismicWeightN: 0,
  };

  for (const surface of state.surfaces || []) {
    const levelSummary = ensureLevel(surface.levelId);

    if (isWallSurfaceType(surface.type) && surface.includeWind !== false) {
      const wind = computeSurfaceWindProjectionM2(state, surface);
      levelSummary.windXAreaM2 += wind.xAreaM2;
      levelSummary.windYAreaM2 += wind.yAreaM2;
      totals.windXAreaM2 += wind.xAreaM2;
      totals.windYAreaM2 += wind.yAreaM2;
    }

    if (surface.includeSeismicWeight) {
      const weight = computeSurfaceSeismicWeightN(state, surface);
      levelSummary.seismicWeightN += weight;
      totals.seismicWeightN += weight;
    }
  }

  return {
    levels: Array.from(byLevel.values()),
    totals,
  };
}

export function computeSurfaceWindProjectionM2(state, surface) {
  if (!isWallSurfaceType(surface.type)) return { xAreaM2: 0, yAreaM2: 0 };
  const { height } = resolveSurfaceVerticalRange(state, surface);
  if (height <= 0) return { xAreaM2: 0, yAreaM2: 0 };

  if (surface.type === 'exteriorWall' && surface.shape === 'polygon' && Array.isArray(surface.points) && surface.points.length >= 3) {
    const bounds = pointBounds(surface.points);
    return {
      xAreaM2: Math.max(0, bounds.maxY - bounds.minY) * height * MM2_TO_M2,
      yAreaM2: Math.max(0, bounds.maxX - bounds.minX) * height * MM2_TO_M2,
    };
  }

  let xAreaMm2 = 0;
  let yAreaMm2 = 0;
  for (const seg of surfacePlanSegments(surface)) {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    xAreaMm2 += Math.abs(dy) * height;
    yAreaMm2 += Math.abs(dx) * height;
  }
  return {
    xAreaM2: xAreaMm2 * MM2_TO_M2,
    yAreaM2: yAreaMm2 * MM2_TO_M2,
  };
}

export function computeSurfaceSeismicWeightN(state, surface) {
  const unitWeight = Math.max(0, finiteNumber(surface.unitWeight, 0));
  if (unitWeight <= 0) return 0;
  const areaM2 = computeSurfaceWeightAreaM2(state, surface);
  return areaM2 * unitWeight;
}

export function computeSurfaceWeightAreaM2(state, surface) {
  if (isWallSurfaceType(surface.type)) {
    const { height } = resolveSurfaceVerticalRange(state, surface);
    if (height <= 0) return 0;
    return surfacePlanLengthMm(surface) * height * MM2_TO_M2;
  }
  return horizontalSurfaceAreaM2(surface);
}

export function horizontalSurfaceAreaM2(surface) {
  if (surface.shape === 'polygon' && Array.isArray(surface.points) && surface.points.length >= 3) {
    return Math.abs(signedPolygonArea2(surface.points)) * 0.5 * MM2_TO_M2;
  }
  if (surface.shape === 'rect') {
    return Math.abs((surface.x2 - surface.x1) * (surface.y2 - surface.y1)) * MM2_TO_M2;
  }
  return 0;
}

function surfacePlanLengthMm(surface) {
  return surfacePlanSegments(surface).reduce((sum, seg) => (
    sum + Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)
  ), 0);
}

function surfacePlanSegments(surface) {
  if (surface.shape === 'line') {
    return [{
      a: { x: finiteNumber(surface.x1, 0), y: finiteNumber(surface.y1, 0) },
      b: { x: finiteNumber(surface.x2, 0), y: finiteNumber(surface.y2, 0) },
    }];
  }

  if (surface.shape === 'polygon' && Array.isArray(surface.points) && surface.points.length >= 2) {
    return surface.points.map((point, idx) => ({
      a: point,
      b: surface.points[(idx + 1) % surface.points.length],
    }));
  }

  if (surface.shape === 'rect') {
    const x1 = finiteNumber(surface.x1, 0);
    const y1 = finiteNumber(surface.y1, 0);
    const x2 = finiteNumber(surface.x2, x1);
    const y2 = finiteNumber(surface.y2, y1);
    const points = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ];
    return points.map((point, idx) => ({
      a: point,
      b: points[(idx + 1) % points.length],
    }));
  }

  return [];
}

function getLevelZ(state, levelId) {
  const level = (state.levels || []).find(l => l.id === levelId);
  return finiteNumber(level?.z, 0);
}

function getStoryHeight(state, levelId, topLevelId) {
  const base = getLevelZ(state, levelId);
  const top = getLevelZ(state, topLevelId);
  return Math.max(0, top - base);
}

function pointBounds(points) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, finiteNumber(point.x, 0)),
    maxX: Math.max(bounds.maxX, finiteNumber(point.x, 0)),
    minY: Math.min(bounds.minY, finiteNumber(point.y, 0)),
    maxY: Math.max(bounds.maxY, finiteNumber(point.y, 0)),
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  });
}

function signedPolygonArea2(points) {
  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    area2 += finiteNumber(p1.x, 0) * finiteNumber(p2.y, 0) -
      finiteNumber(p2.x, 0) * finiteNumber(p1.y, 0);
  }
  return area2;
}

function finiteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
