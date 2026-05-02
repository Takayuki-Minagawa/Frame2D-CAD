// member-style.js - Shared member display helpers

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
  return roofRoleColor(member?.roofRole) || member?.color || '#666666';
}
