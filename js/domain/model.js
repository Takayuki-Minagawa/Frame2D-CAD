// Pure model defaults, normalization and type rules. No AppState or UI dependencies.
import { DEFAULT_LOAD_CASE, DEFAULT_ROOF_GROUP_ID, DEFAULT_STORY_HEIGHT_MM, LOAD_CASES } from '../constants.js';
const MEMBER_GEOMETRY_MODES = new Set(['level', 'explicit3d']);
const SURFACE_HEIGHT_MODES = new Set(['full', 'waist', 'hanging', 'custom']);

export function createDefaultLevels() {
  return [
    { id: 'L0', name: 'GL', z: 0 },
    { id: 'L1', name: '2F', z: DEFAULT_STORY_HEIGHT_MM },
  ];
}

export function normalizeLoadCase(value) {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return LOAD_CASES.includes(text) ? text : DEFAULT_LOAD_CASE;
}

export function normalizeLoadFactors(factors) {
  const result = {};
  for (const loadCase of LOAD_CASES) {
    const n = Number(factors?.[loadCase]);
    if (Number.isFinite(n) && n !== 0) result[loadCase] = n;
  }
  return result;
}

export function createDefaultLoadCombinations() {
  return [
    { id: 'LC1', name: 'G+P', factors: { DL: 1, LL: 1 } },
    { id: 'LC2', name: 'G+P+EQX', factors: { DL: 1, LL: 1, EQX: 1 } },
    { id: 'LC3', name: 'G+P+EQY', factors: { DL: 1, LL: 1, EQY: 1 } },
    { id: 'LC4', name: 'G+P+WX', factors: { DL: 1, LL: 1, WX: 1 } },
    { id: 'LC5', name: 'G+P+WY', factors: { DL: 1, LL: 1, WY: 1 } },
  ];
}

export function normalizeAxisEntry(raw, fallbackId) {
  if (!raw) return null;
  const coord = Number(raw.coord);
  if (!Number.isFinite(coord)) return null;
  const dir = raw.dir === 'y' ? 'y' : 'x';
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : fallbackId;
  return { id: raw.id || fallbackId, dir, name, coord };
}

export function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function sanitizePatchFields(patch, sanitizers, current) {
  for (const [key, sanitize] of Object.entries(sanitizers)) {
    if (hasOwn(patch, key)) {
      patch[key] = sanitize(patch[key], current);
    }
  }
}

export function stripSurfaceFieldsForType(target, type) {
  if (!isSlopedSurfaceType(type)) {
    delete target.roofSlope;
    delete target.roofDirection;
    delete target.roofBaseOffset;
  }
  if (!isRoofSurfaceType(type)) {
    delete target.roofGroupId;
  }
  if (!isGableWallSurfaceType(type)) {
    delete target.gableStartTopOffset;
    delete target.gableEndTopOffset;
  }
}

export function sanitizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function sanitizeOptionalPositiveNumber(value) {
  const number = sanitizeOptionalNumber(value);
  return number !== null && number > 0 ? number : null;
}

export function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function sanitizeRoofGroupId(value, fallback = DEFAULT_ROOF_GROUP_ID) {
  return sanitizeText(value) || sanitizeText(fallback) || DEFAULT_ROOF_GROUP_ID;
}

export function defaultSurfaceDrawColor(type) {
  return type === 'wall' || type === 'exteriorWall' ? '#b57a6b' : '#67a9cf';
}

export function normalizeSurfaceHeightMode(value) {
  const text = sanitizeText(value);
  return SURFACE_HEIGHT_MODES.has(text) ? text : 'full';
}

export function normalizeMemberGeometryMode(value) {
  const text = sanitizeText(value);
  return MEMBER_GEOMETRY_MODES.has(text) ? text : 'level';
}

export function isWallSurfaceType(type) {
  return type === 'wall' || type === 'exteriorWall' || type === 'gableWall';
}

export function isRoofSurfaceType(type) {
  return type === 'roof';
}

export function isGableWallSurfaceType(type) {
  return type === 'gableWall';
}

export function isEaveSurfaceType(type) {
  return type === 'eave';
}

export function isSlopedSurfaceType(type) {
  return type === 'roof' || type === 'eave';
}
