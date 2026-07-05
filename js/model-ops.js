// model-ops.js - Cross-cutting model operations (validation, level copy)
// extracted from state.js. Functions take the AppState instance as their
// first argument; AppState keeps thin delegating methods.

import { DEFAULT_ROOF_GROUP_ID } from './constants.js';
import {
  isRoofSurfaceType,
  isWallSurfaceType,
  sanitizeRoofGroupId,
} from './state.js';

export function validateModel(state) {
  const issues = [];
  const addIssue = (severity, code, message, ref = {}) => {
    issues.push({ severity, code, message, ...ref });
  };
  const levelIds = new Set(state.levels.map(l => l.id));
  const nodeIds = new Set(state.nodes.map(n => n.id));
  const levelZ = new Map();
  for (const level of state.levels) {
    const zKey = String(Number(level.z));
    if (levelZ.has(zKey)) {
      addIssue('warning', 'duplicate-level-z', `階 ${level.name} は ${levelZ.get(zKey)} と同じz値です`, { elementType: 'level', elementId: level.id });
    } else {
      levelZ.set(zKey, level.name);
    }
  }

  for (const member of state.members) {
    const n1 = state.getNode(member.startNodeId);
    const n2 = state.getNode(member.endNodeId);
    if (!nodeIds.has(member.startNodeId) || !nodeIds.has(member.endNodeId) || !n1 || !n2) {
      addIssue('error', 'missing-node', `線材 ${member.id} の参照ノードが見つかりません`, { elementType: 'member', elementId: member.id });
      continue;
    }
    if (!levelIds.has(member.levelId)) {
      addIssue('error', 'missing-level', `線材 ${member.id} の管理レイヤーが見つかりません`, { elementType: 'member', elementId: member.id });
    }
    if ((member.type === 'column' || member.type === 'vbrace') && !levelIds.has(member.topLevelId)) {
      addIssue('error', 'missing-top-level', `線材 ${member.id} の上端レイヤーが見つかりません`, { elementType: 'member', elementId: member.id });
    }
    const startZ = member.geometryMode === 'explicit3d' ? state._memberEndpointZ(member, 'startZ') : state.getLevelZ(member.levelId);
    const endZ = member.geometryMode === 'explicit3d' ? state._memberEndpointZ(member, 'endZ') : state.getLevelZ(member.levelId);
    if (member.type !== 'column' && Math.hypot(n2.x - n1.x, n2.y - n1.y, endZ - startZ) < 1) {
      addIssue('warning', 'zero-length-member', `線材 ${member.id} の長さが0です`, { elementType: 'member', elementId: member.id });
    }
    if (member.sectionName && !state._getSectionRef('member', member.type, member.sectionName)) {
      addIssue('warning', 'missing-section', `線材 ${member.id} の断面 ${member.sectionName} が見つかりません`, { elementType: 'member', elementId: member.id });
    }
    if ((member.type === 'column' || member.type === 'vbrace') && member.topLevelId === member.levelId) {
      addIssue('warning', 'same-top-level', `線材 ${member.id} の下端/上端レイヤーが同一です`, { elementType: 'member', elementId: member.id });
    }
  }

  const usedNodes = new Set();
  for (const member of state.members) {
    usedNodes.add(member.startNodeId);
    usedNodes.add(member.endNodeId);
  }
  for (const node of state.nodes) {
    if (!usedNodes.has(node.id)) {
      addIssue('info', 'orphan-node', `孤立ノード ${node.id} があります`, { elementType: 'node', elementId: node.id });
    }
  }

  const memberKeys = new Map();
  for (const member of state.members) {
    const n1 = state.getNode(member.startNodeId);
    const n2 = state.getNode(member.endNodeId);
    if (!n1 || !n2) continue;
    const startZ = member.geometryMode === 'explicit3d' ? state._memberEndpointZ(member, 'startZ') : state.getLevelZ(member.levelId);
    const endZ = member.geometryMode === 'explicit3d' ? state._memberEndpointZ(member, 'endZ') : state.getLevelZ(member.levelId);
    const points = [
      `${Math.round(n1.x)}:${Math.round(n1.y)}:${Math.round(startZ)}`,
      `${Math.round(n2.x)}:${Math.round(n2.y)}:${Math.round(endZ)}`,
    ].sort();
    const key = [member.type, member.levelId, member.topLevelId || '', ...points].join('|');
    if (memberKeys.has(key)) {
      addIssue('warning', 'duplicate-member', `線材 ${member.id} は ${memberKeys.get(key)} と重複しています`, { elementType: 'member', elementId: member.id });
    } else {
      memberKeys.set(key, member.id);
    }
  }

  for (const surface of state.surfaces) {
    if (!levelIds.has(surface.levelId)) {
      addIssue('error', 'missing-level', `面材 ${surface.id} の管理レイヤーが見つかりません`, { elementType: 'surface', elementId: surface.id });
    }
    if (isWallSurfaceType(surface.type) && surface.topLevelId && !levelIds.has(surface.topLevelId)) {
      addIssue('error', 'missing-top-level', `面材 ${surface.id} の上端レイヤーが見つかりません`, { elementType: 'surface', elementId: surface.id });
    }
    if (surface.shape === 'rect' && (Math.abs(surface.x2 - surface.x1) < 1 || Math.abs(surface.y2 - surface.y1) < 1)) {
      addIssue('warning', 'zero-area-surface', `面材 ${surface.id} の面積が0です`, { elementType: 'surface', elementId: surface.id });
    }
    if (surface.sectionName && !state._getSectionRef('surface', surface.type, surface.sectionName)) {
      addIssue('warning', 'missing-section', `面材 ${surface.id} の断面 ${surface.sectionName} が見つかりません`, { elementType: 'surface', elementId: surface.id });
    }
  }

  return issues;
}

export function copyLevelElements(state, sourceLevelId, targetLevelId, options = {}) {
  if (!sourceLevelId || !targetLevelId || sourceLevelId === targetLevelId) {
    return { members: 0, surfaces: 0, loads: 0, supports: 0 };
  }
  if (!state.levels.some(l => l.id === sourceLevelId) || !state.levels.some(l => l.id === targetLevelId)) {
    return { members: 0, surfaces: 0, loads: 0, supports: 0 };
  }

  const include = {
    members: options.members !== false,
    surfaces: options.surfaces !== false,
    loads: options.loads !== false,
    supports: options.supports !== false,
  };
  const counts = { members: 0, surfaces: 0, loads: 0, supports: 0 };
  const zDelta = state.getLevelZ(targetLevelId) - state.getLevelZ(sourceLevelId);
  const nodeMap = new Map();
  const nodeFor = (nodeId) => {
    if (nodeMap.has(nodeId)) return nodeMap.get(nodeId);
    const sourceNode = state.getNode(nodeId);
    if (!sourceNode) return null;
    const node = state.addNode(sourceNode.x, sourceNode.y, sourceNode.z || 0);
    nodeMap.set(nodeId, node);
    return node;
  };
  const mapTopLevel = (topLevelId) => {
    if (!topLevelId) return null;
    if (topLevelId === sourceLevelId || topLevelId === state.getNextLevelId(sourceLevelId)) {
      return state.getNextLevelId(targetLevelId) || targetLevelId;
    }
    return topLevelId;
  };
  const mapRoofGroupId = (roofGroupId) => {
    const base = sanitizeRoofGroupId(roofGroupId, DEFAULT_ROOF_GROUP_ID);
    return sanitizeRoofGroupId(`${base}_${targetLevelId}`, `${base}_${targetLevelId}`);
  };

  if (include.members) {
    const sourceMembers = [...state.members].filter(m => m.levelId === sourceLevelId);
    for (const member of sourceMembers) {
      if (member.roofRole) continue;
      const startNode = nodeFor(member.startNodeId);
      const endNode = nodeFor(member.endNodeId);
      if (!startNode || !endNode) continue;
      const copied = state.addMember(startNode.id, endNode.id, {
        type: member.type,
        sectionName: member.sectionName,
        levelId: targetLevelId,
        topLevelId: (member.type === 'column' || member.type === 'vbrace')
          ? (state.getNextLevelId(targetLevelId) || targetLevelId)
          : mapTopLevel(member.topLevelId),
        geometryMode: member.geometryMode,
        startZ: member.geometryMode === 'explicit3d' && Number.isFinite(Number(member.startZ))
          ? Number(member.startZ) + zDelta
          : member.startZ,
        endZ: member.geometryMode === 'explicit3d' && Number.isFinite(Number(member.endZ))
          ? Number(member.endZ) + zDelta
          : member.endZ,
        roofRole: null,
        bracePattern: member.bracePattern,
        endI: member.endI,
        endJ: member.endJ,
      });
      if (copied) counts.members++;
    }
  }

  if (include.surfaces) {
    const sourceSurfaces = [...state.surfaces].filter(s => s.levelId === sourceLevelId);
    for (const surface of sourceSurfaces) {
      const common = {
        type: surface.type,
        sectionName: surface.sectionName,
        levelId: targetLevelId,
        topLevelId: mapTopLevel(surface.topLevelId) || targetLevelId,
        loadDirection: surface.loadDirection,
        heightMode: surface.heightMode,
        bottomOffset: surface.bottomOffset,
        topOffset: surface.topOffset,
        includeWind: surface.includeWind,
        includeSeismicWeight: surface.includeSeismicWeight,
        unitWeight: surface.unitWeight,
        roofSlope: surface.roofSlope,
        roofDirection: surface.roofDirection,
        roofBaseOffset: surface.roofBaseOffset,
        roofGroupId: isRoofSurfaceType(surface.type) ? mapRoofGroupId(surface.roofGroupId) : surface.roofGroupId,
        gableStartTopOffset: surface.gableStartTopOffset,
        gableEndTopOffset: surface.gableEndTopOffset,
      };
      let copied = null;
      if (surface.shape === 'polygon' && Array.isArray(surface.points)) {
        copied = state.addSurfacePolygon(surface.points.map(p => ({ ...p })), common);
      } else if (surface.shape === 'line') {
        copied = state.addSurfaceLine(surface.x1, surface.y1, surface.x2, surface.y2, common);
      } else {
        copied = state.addSurfaceRect(surface.x1, surface.y1, surface.x2, surface.y2, common);
      }
      if (copied) counts.surfaces++;
    }
  }

  if (include.loads) {
    const sourceLoads = [...state.loads].filter(l => l.levelId === sourceLevelId);
    for (const load of sourceLoads) {
      const props = { ...load, levelId: targetLevelId };
      delete props.id;
      if (state.addLoad(load.type, props)) counts.loads++;
    }
  }

  if (include.supports) {
    const sourceSupports = [...state.supports].filter(s => s.levelId === sourceLevelId);
    for (const support of sourceSupports) {
      const props = { ...support, levelId: targetLevelId };
      delete props.id;
      if (state.addSupport(support.x, support.y, props)) counts.supports++;
    }
  }

  return counts;
}
