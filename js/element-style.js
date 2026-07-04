// element-style.js - Shared display style resolution for members and surfaces

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_MEMBER_COLOR = '#666666';

const ROOF_ROLE_COLORS = {
  roofEdge: '#4d8cc8',
  roofSlopeBeam: '#8b6fc6',
  roofRidge: '#d65f5f',
  roofValley: '#3f9b72',
  roofHip: '#d08a3d',
  roofJoint: '#6f7f8f',
};

const ROOF_ROLE_LABEL_KEYS = {
  roofEdge: 'roofRoleEdge',
  roofSlopeBeam: 'roofRoleSlopeBeam',
  roofRidge: 'roofRoleRidge',
  roofValley: 'roofRoleValley',
  roofHip: 'roofRoleHip',
  roofJoint: 'roofRoleJoint',
};

export const ROOF_MEMBER_ROLE_ORDER = [
  'roofEdge',
  'roofSlopeBeam',
  'roofRidge',
  'roofValley',
  'roofHip',
  'roofJoint',
];

export function roofRoleColor(role) {
  return ROOF_ROLE_COLORS[role] || null;
}

export function roofRoleLabelKey(role) {
  return ROOF_ROLE_LABEL_KEYS[role] || 'roofRoleOther';
}

export function resolveMemberColor(member) {
  return roofRoleColor(member?.roofRole) || member?.color || DEFAULT_MEMBER_COLOR;
}

export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

export function defaultSurfaceColorForType(type) {
  if (type === 'floor') return '#67a9cf';
  if (type === 'roof') return '#8b6f47';
  if (type === 'eave') return '#4f9a8a';
  if (type === 'gableWall') return '#bf6f5e';
  return '#b57a6b';
}

export function resolveSurfaceColor(surface) {
  if (isHexColor(surface?.color)) return surface.color;
  return defaultSurfaceColorForType(surface?.type);
}
