// model-ops.js - Cross-cutting model operations (validation, level copy,
// node merge, member split and copy transforms) extracted from state.js.
// Functions take the AppState instance as their first argument; AppState
// keeps thin delegating methods.

import {
  DEFAULT_ROOF_GROUP_ID,
  MEMBER_SPLIT_TOLERANCE_MM,
  NODE_MERGE_TOLERANCE_MM,
} from './constants.js';
import { positiveNumber } from './geometry-utils.js';
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

// --- Node merge -------------------------------------------------------------

// Merges nodes that lie within `tolerance` (mm) of each other. The node with
// the smallest id in a cluster survives; members are re-pointed to it.
export function mergeNearbyNodes(state, options = {}) {
  const tolerance = positiveNumber(options.tolerance, NODE_MERGE_TOLERANCE_MM);
  const nodes = [...state.nodes].sort((a, b) => a.id - b.id);
  const remap = new Map();

  for (let i = 0; i < nodes.length; i++) {
    const target = nodes[i];
    if (remap.has(target.id)) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const other = nodes[j];
      if (remap.has(other.id)) continue;
      if (Math.hypot(other.x - target.x, other.y - target.y) <= tolerance) {
        remap.set(other.id, target.id);
      }
    }
  }

  if (!remap.size) return { mergedNodes: 0 };

  for (const member of state.members) {
    if (remap.has(member.startNodeId)) member.startNodeId = remap.get(member.startNodeId);
    if (remap.has(member.endNodeId)) member.endNodeId = remap.get(member.endNodeId);
  }
  state.nodes = state.nodes.filter(n => !remap.has(n.id));
  state._touch();
  return { mergedNodes: remap.size };
}

// --- Member split at intersections ------------------------------------------

// Returns the intersection point of segments a1-a2 / b1-b2 when they properly
// cross (interior-interior); null for parallel or non-crossing segments.
function segmentCrossPoint(a1, a2, b1, b2) {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const cross = dax * dby - day * dbx;
  if (Math.abs(cross) < 1e-9) return null;
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / cross;
  const u = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / cross;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { x: a1.x + t * dax, y: a1.y + t * day };
}

// Projects point p onto segment a-b; returns the projected point when it lies
// strictly inside the segment and within `tolerance` of p, otherwise null.
function interiorProjection(p, a, b, tolerance) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) return null;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const len = Math.sqrt(len2);
  const minT = tolerance / len;
  if (t <= minT || t >= 1 - minT) return null;
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  if (Math.hypot(proj.x - p.x, proj.y - p.y) > tolerance) return null;
  return proj;
}

// Splits in-plane beams / horizontal braces at their mutual intersection and
// T-junction points so crossing members share analysis nodes. Roof members
// (explicit 3D) and vertical elements are left untouched.
export function splitIntersectingMembers(state, options = {}) {
  const tolerance = positiveNumber(options.tolerance, MEMBER_SPLIT_TOLERANCE_MM);
  const targets = state.members.filter(m =>
    (m.type === 'beam' || m.type === 'hbrace') &&
    m.geometryMode !== 'explicit3d' &&
    !m.roofRole
  );

  const geometry = new Map();
  for (const member of targets) {
    const n1 = state.getNode(member.startNodeId);
    const n2 = state.getNode(member.endNodeId);
    if (!n1 || !n2) continue;
    if (Math.hypot(n2.x - n1.x, n2.y - n1.y) < 1) continue;
    geometry.set(member.id, { member, n1, n2 });
  }

  const splitPoints = new Map();
  const addSplit = (entry, point) => {
    const { member, n1, n2 } = entry;
    const proj = interiorProjection(point, n1, n2, Math.max(tolerance, 1));
    if (!proj) return;
    const list = splitPoints.get(member.id) || [];
    if (list.some(p => Math.hypot(p.x - proj.x, p.y - proj.y) <= tolerance)) return;
    list.push(proj);
    splitPoints.set(member.id, list);
  };

  const entries = [...geometry.values()];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (a.member.levelId !== b.member.levelId) continue;
      const cross = segmentCrossPoint(a.n1, a.n2, b.n1, b.n2);
      if (cross) {
        addSplit(a, cross);
        addSplit(b, cross);
      }
      // T-junctions: an endpoint of one member lying on the other.
      addSplit(a, b.n1);
      addSplit(a, b.n2);
      addSplit(b, a.n1);
      addSplit(b, a.n2);
    }
  }

  if (!splitPoints.size) return { splitMembers: 0, createdMembers: 0 };

  let createdMembers = 0;
  for (const [memberId, points] of splitPoints) {
    const entry = geometry.get(memberId);
    const { member, n1, n2 } = entry;
    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const len2 = dx * dx + dy * dy;
    points.sort((p, q) => {
      const tp = ((p.x - n1.x) * dx + (p.y - n1.y) * dy) / len2;
      const tq = ((q.x - n1.x) * dx + (q.y - n1.y) * dy) / len2;
      return tp - tq;
    });

    const chain = [state.getNode(member.startNodeId)];
    for (const p of points) {
      let node = state.findNodeAt(p.x, p.y, Math.max(tolerance, 1));
      if (!node) node = state.addNode(p.x, p.y);
      chain.push(node);
    }
    chain.push(state.getNode(member.endNodeId));

    for (let k = 0; k < chain.length - 1; k++) {
      const isFirst = k === 0;
      const isLast = k === chain.length - 2;
      state.addMember(chain[k].id, chain[k + 1].id, {
        type: member.type,
        sectionName: member.sectionName,
        levelId: member.levelId,
        topLevelId: member.topLevelId,
        bracePattern: member.bracePattern,
        // Interior cut ends stay rigid so the split beam reads as continuous.
        endI: isFirst ? member.endI : { condition: 'rigid', springSymbol: null },
        endJ: isLast ? member.endJ : { condition: 'rigid', springSymbol: null },
      });
      createdMembers++;
    }
    state.removeMember(member.id);
  }

  state._touch();
  return { splitMembers: splitPoints.size, createdMembers };
}

// --- Copy transforms (mirror / rotate / array) --------------------------------

function copyMemberWithPoints(state, member, p1, p2, nodeTolerance = 1) {
  let startNode = state.findNodeAt(p1.x, p1.y, nodeTolerance);
  if (!startNode) startNode = state.addNode(p1.x, p1.y);
  let endNode = member.type === 'column'
    ? startNode
    : state.findNodeAt(p2.x, p2.y, nodeTolerance);
  if (!endNode) endNode = state.addNode(p2.x, p2.y);
  return state.addMember(startNode.id, endNode.id, {
    type: member.type,
    sectionName: member.sectionName,
    levelId: member.levelId,
    topLevelId: member.topLevelId,
    geometryMode: member.geometryMode,
    startZ: member.startZ,
    endZ: member.endZ,
    roofRole: member.roofRole,
    bracePattern: member.bracePattern,
    endI: member.endI,
    endJ: member.endJ,
  });
}

function resolveMemberEndpoints(state, ids) {
  const resolved = [];
  for (const id of ids) {
    const member = state.getMember(id);
    if (!member) continue;
    const n1 = state.getNode(member.startNodeId);
    const n2 = state.getNode(member.endNodeId);
    if (!n1 || !n2) continue;
    resolved.push({ member, n1, n2 });
  }
  return resolved;
}

// Mirrors the given members across x=coord (axis 'x') or y=coord (axis 'y'),
// creating mirrored copies. Returns the created members.
export function mirrorMembers(state, ids, options = {}) {
  const axis = options.axis === 'y' ? 'y' : 'x';
  const coord = Number(options.coord) || 0;
  const mirror = p => axis === 'x'
    ? { x: 2 * coord - p.x, y: p.y }
    : { x: p.x, y: 2 * coord - p.y };
  const created = [];
  for (const { member, n1, n2 } of resolveMemberEndpoints(state, ids)) {
    created.push(copyMemberWithPoints(state, member, mirror(n1), mirror(n2)));
  }
  return created;
}

// Rotates the given members in place by 90/180/270 degrees (CCW) around the
// selection's bounding-box center (or an explicit cx/cy). Nodes shared with
// unselected members are detached first so the rest of the model stays put.
export function rotateMembers(state, ids, options = {}) {
  const angle = [90, 180, 270].includes(Number(options.angle)) ? Number(options.angle) : 90;
  const resolved = resolveMemberEndpoints(state, ids);
  if (!resolved.length) return { rotated: 0 };

  let cx = Number(options.cx);
  let cy = Number(options.cy);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { n1, n2 } of resolved) {
      minX = Math.min(minX, n1.x, n2.x);
      maxX = Math.max(maxX, n1.x, n2.x);
      minY = Math.min(minY, n1.y, n2.y);
      maxY = Math.max(maxY, n1.y, n2.y);
    }
    cx = (minX + maxX) / 2;
    cy = (minY + maxY) / 2;
  }

  const idSet = new Set(ids);
  const selectionNodes = new Set();
  for (const { member } of resolved) {
    selectionNodes.add(member.startNodeId);
    selectionNodes.add(member.endNodeId);
  }

  // Detach nodes shared with unselected members.
  const remap = new Map();
  for (const nodeId of selectionNodes) {
    const sharedOutside = state.members.some(m =>
      !idSet.has(m.id) && (m.startNodeId === nodeId || m.endNodeId === nodeId)
    );
    if (!sharedOutside) continue;
    const source = state.getNode(nodeId);
    if (!source) continue;
    const clone = state.addNode(source.x, source.y, source.z || 0);
    remap.set(nodeId, clone.id);
  }
  if (remap.size) {
    for (const { member } of resolved) {
      if (remap.has(member.startNodeId)) member.startNodeId = remap.get(member.startNodeId);
      if (remap.has(member.endNodeId)) member.endNodeId = remap.get(member.endNodeId);
    }
  }

  const rotate = (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    if (angle === 90) return { x: cx - dy, y: cy + dx };
    if (angle === 180) return { x: cx - dx, y: cy - dy };
    return { x: cx + dy, y: cy - dx };
  };

  const doneNodes = new Set();
  for (const { member } of resolved) {
    for (const nodeId of [member.startNodeId, member.endNodeId]) {
      if (doneNodes.has(nodeId)) continue;
      doneNodes.add(nodeId);
      const node = state.getNode(nodeId);
      if (!node) continue;
      const p = rotate(node.x, node.y);
      node.x = p.x;
      node.y = p.y;
    }
  }
  state._touch();
  return { rotated: resolved.length };
}

// Creates `count` copies of the given members, each offset by (dx, dy) from
// the previous copy. Returns the created members.
export function arrayCopyMembers(state, ids, options = {}) {
  const dx = Number(options.dx) || 0;
  const dy = Number(options.dy) || 0;
  const count = Math.max(1, Math.min(100, Math.round(Number(options.count) || 1)));
  if (dx === 0 && dy === 0) return [];
  const resolved = resolveMemberEndpoints(state, ids);
  const created = [];
  for (let k = 1; k <= count; k++) {
    for (const { member, n1, n2 } of resolved) {
      created.push(copyMemberWithPoints(
        state,
        member,
        { x: n1.x + dx * k, y: n1.y + dy * k },
        { x: n2.x + dx * k, y: n2.y + dy * k }
      ));
    }
  }
  return created;
}
