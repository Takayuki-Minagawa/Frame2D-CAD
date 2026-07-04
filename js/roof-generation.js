// roof-generation.js - Roof auto-generation logic (edge/slope/joint members,
// eaves, gable walls, roof plane layout). Extracted from state.js; every
// public function takes the AppState instance as its first argument, and
// AppState keeps thin delegating methods with the same public API.

import {
  DEFAULT_EAVE_DEPTH_MM,
  DEFAULT_RAFTER_SPACING_MM,
  DEFAULT_ROOF_GROUP_ID,
  DEFAULT_ROOF_SLOPE_RATIO,
} from './constants.js';
import {
  axisAlignedRectangleFromPoints,
  edgeInwardNormal,
  finiteNumber,
  nonNegativeNumber,
  pointInPolygonInterior as isInteriorPlanPoint,
  pointToSegmentDist,
  polygonHasSelfIntersections,
  polygonVertexCentroid,
  positiveNumber,
  sameSegment,
  segmentParameter,
  uniquePositiveNumbers,
} from './geometry-utils.js';
import { normalizeRoofDirection, roofPlanPoints, roofPoint3D, roofSlopeMemberSegments, roofVertices3D } from './roof-geometry.js';
import {
  isEaveSurfaceType,
  isGableWallSurfaceType,
  isRoofSurfaceType,
  sanitizeRoofGroupId,
} from './state.js';

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// --- Public API (mirrored by AppState delegate methods) ---

export function addRoofEdgeMembers(state, surfaceId, options = {}) {
  const surface = state.getSurface(surfaceId);
  if (!surface || !isRoofSurfaceType(surface.type)) return [];
  const vertices = roofVertices3D(state, surface);
  if (vertices.length < 3) return [];

  const nodeTolerance = nonNegativeNumber(options.nodeTolerance, 1);
  const nodes = vertices.map(v => state.findNodeAt(v.x, v.y, nodeTolerance) || state.addNode(v.x, v.y));
  let members = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (hasSharedRoofGroupEdge(state, surface, a, b, nodeTolerance)) continue;
    const startNode = nodes[i];
    const endNode = nodes[(i + 1) % vertices.length];
    if (startNode.id === endNode.id) continue;
    const member = state.addMember(startNode.id, endNode.id, {
      type: 'beam',
      levelId: surface.levelId,
      geometryMode: 'explicit3d',
      startZ: a.z,
      endZ: b.z,
      roofRole: options.roofRole || 'roofEdge',
      sectionName: options.sectionName || state.getDefaultSectionName('member', 'beam'),
    });
    members.push(member);
  }
  for (const node of roofSlopeBoundaryNodes(state, surface, nodeTolerance)) {
    const split = splitRoofEdgeMemberAtNode(state, node, nodeTolerance);
    if (!split) continue;
    members = members.filter(member => member.id !== split.removedId);
    members.push(...split.members);
  }
  return members;
}

export function addRoofSlopeMembers(state, surfaceId, options = {}) {
  const surface = state.getSurface(surfaceId);
  if (!surface || !isRoofSurfaceType(surface.type)) return [];
  const segments = roofSlopeMemberSegments(surface, {
    spacing: options.spacing,
    minLength: options.minLength,
  });
  if (!segments.length) return [];

  const nodeTolerance = nonNegativeNumber(options.nodeTolerance, 1);
  const members = [];
  for (const segment of segments) {
    const startPoint = roofPoint3D(state, surface, segment.start);
    const endPoint = roofPoint3D(state, surface, segment.end);
    const startNode = state.findNodeAt(startPoint.x, startPoint.y, nodeTolerance) || state.addNode(startPoint.x, startPoint.y);
    const endNode = state.findNodeAt(endPoint.x, endPoint.y, nodeTolerance) || state.addNode(endPoint.x, endPoint.y);
    if (startNode.id === endNode.id) continue;
    const member = state.addMember(startNode.id, endNode.id, {
      type: 'beam',
      levelId: surface.levelId,
      geometryMode: 'explicit3d',
      startZ: startPoint.z,
      endZ: endPoint.z,
      roofRole: options.roofRole || 'roofSlopeBeam',
      sectionName: options.sectionName || state.getDefaultSectionName('member', 'beam'),
    });
    splitRoofEdgeMemberAtNode(state, startNode, nodeTolerance);
    splitRoofEdgeMemberAtNode(state, endNode, nodeTolerance);
    members.push(member);
  }
  return members;
}

export function addRoofJointMembers(state, roofGroupId, options = {}) {
  const surfaces = getRoofGroupSurfaces(state, roofGroupId);
  if (surfaces.length < 2) return [];

  const nodeTolerance = nonNegativeNumber(options.nodeTolerance, 1);
  const zTolerance = nonNegativeNumber(options.zTolerance, 1);
  const members = [];
  for (let i = 0; i < surfaces.length; i++) {
    for (let j = i + 1; j < surfaces.length; j++) {
      for (const edge of sharedRoofEdges(state, surfaces[i], surfaces[j], nodeTolerance, zTolerance)) {
        const startNode = state.findNodeAt(edge.start.x, edge.start.y, nodeTolerance) || state.addNode(edge.start.x, edge.start.y);
        const endNode = state.findNodeAt(edge.end.x, edge.end.y, nodeTolerance) || state.addNode(edge.end.x, edge.end.y);
        if (startNode.id === endNode.id) continue;
        removeRoofEdgeMembersOnSegment(state, edge.start, edge.end, nodeTolerance);
        members.push(state.addMember(startNode.id, endNode.id, {
          type: 'beam',
          levelId: edge.surfaceA.levelId,
          geometryMode: 'explicit3d',
          startZ: edge.start.z,
          endZ: edge.end.z,
          roofRole: edge.roofRole,
          sectionName: options.sectionName || state.getDefaultSectionName('member', 'beam'),
        }));
      }
    }
  }
  return members;
}

export function addGableWallsFromRoofGroup(state, roofGroupId, options = {}) {
  const surfaces = getRoofGroupSurfaces(state, roofGroupId);
  if (!surfaces.length) return [];

  const nodeTolerance = nonNegativeNumber(options.nodeTolerance, 1);
  const zTolerance = nonNegativeNumber(options.zTolerance, 1);
  const bottomOffset = nonNegativeNumber(options.bottomOffset, 0);
  const walls = [];
  for (const surface of surfaces) {
    const vertices = roofVertices3D(state, surface);
    if (vertices.length < 3) continue;
    const baseZ = state.getLevelZ(surface.levelId);
    for (let i = 0; i < vertices.length; i++) {
      const start = vertices[i];
      const end = vertices[(i + 1) % vertices.length];
      if (hasSharedRoofGroupEdge(state, surface, start, end, nodeTolerance)) continue;
      const startTopOffset = start.z - baseZ;
      const endTopOffset = end.z - baseZ;
      if (Math.abs(startTopOffset - endTopOffset) <= zTolerance) continue;
      if (Math.max(startTopOffset, endTopOffset) <= bottomOffset + zTolerance) continue;
      if (hasGableWallOnSegment(state, surface.levelId, start, end, nodeTolerance)) continue;
      const wall = state.addSurfaceLine(start.x, start.y, end.x, end.y, {
        type: 'gableWall',
        levelId: surface.levelId,
        topLevelId: surface.topLevelId || surface.levelId,
        heightMode: 'custom',
        bottomOffset,
        topOffset: Math.max(startTopOffset, endTopOffset),
        gableStartTopOffset: startTopOffset,
        gableEndTopOffset: endTopOffset,
        includeWind: hasOwn(options, 'includeWind') ? !!options.includeWind : true,
        includeSeismicWeight: hasOwn(options, 'includeSeismicWeight') ? !!options.includeSeismicWeight : false,
        unitWeight: nonNegativeNumber(options.unitWeight, 0),
        sectionName: options.sectionName || state.getDefaultSectionName('surface', 'gableWall'),
      });
      walls.push(wall);
    }
  }
  return walls;
}

export function addEavesFromRoofGroup(state, roofGroupId, options = {}) {
  const surfaces = getRoofGroupSurfaces(state, roofGroupId);
  if (!surfaces.length) return [];

  const nodeTolerance = nonNegativeNumber(options.nodeTolerance, 1);
  const depth = positiveNumber(options.depth, DEFAULT_EAVE_DEPTH_MM);
  const eaves = [];
  for (const surface of surfaces) {
    const points = roofPlanPoints(surface);
    if (points.length < 3) continue;
    for (const edge of roofPlanEdges(surface)) {
      if (hasSharedRoofGroupEdge(state, surface, edge.start, edge.end, nodeTolerance)) continue;
      if (hasEaveOnInnerSegment(state, surface.levelId, edge.start, edge.end, nodeTolerance)) continue;
      const inward = edgeInwardNormal(edge.start, edge.end, points);
      const outward = { x: -inward.x, y: -inward.y };
      const outerStart = {
        x: edge.start.x + outward.x * depth,
        y: edge.start.y + outward.y * depth,
      };
      const outerEnd = {
        x: edge.end.x + outward.x * depth,
        y: edge.end.y + outward.y * depth,
      };
      const eave = state.addSurfacePolygon([
        edge.start,
        edge.end,
        outerEnd,
        outerStart,
      ], {
        type: 'eave',
        levelId: surface.levelId,
        topLevelId: surface.topLevelId || surface.levelId,
        loadDirection: surface.loadDirection,
        roofSlope: surface.roofSlope,
        roofDirection: surface.roofDirection,
        roofBaseOffset: surface.roofBaseOffset,
        includeWind: hasOwn(options, 'includeWind') ? !!options.includeWind : true,
        includeSeismicWeight: hasOwn(options, 'includeSeismicWeight') ? !!options.includeSeismicWeight : false,
        unitWeight: nonNegativeNumber(options.unitWeight, 0),
        sectionName: options.sectionName || state.getDefaultSectionName('surface', 'eave'),
      });
      eaves.push(eave);
    }
  }
  return eaves;
}

export function addRoofPlanesFromSurface(state, sourceSurfaceId, options = {}) {
  const source = state.getSurface(sourceSurfaceId);
  const points = surfaceOutlinePoints(source);
  if (points.length < 3) return [];

  const pattern = normalizeRoofGenerationPattern(options.pattern);
  const direction = normalizeRoofDirection(options.roofDirection || state.surfaceDraftRoofDirection);
  const planes = roofGenerationPlanes(points, pattern, direction);
  if (!planes.length) return [];

  const levelId = options.levelId || source.topLevelId || source.levelId || state.activeLayerId || 'L0';
  const roofGroupId = sanitizeRoofGroupId(options.roofGroupId, state.surfaceDraftRoofGroupId || DEFAULT_ROOF_GROUP_ID);
  const common = {
    type: 'roof',
    levelId,
    topLevelId: options.topLevelId || levelId,
    roofSlope: nonNegativeNumber(options.roofSlope, state.surfaceDraftRoofSlope || DEFAULT_ROOF_SLOPE_RATIO),
    roofBaseOffset: finiteNumber(options.roofBaseOffset, state.surfaceDraftRoofBaseOffset || 0),
    roofGroupId,
    includeWind: hasOwn(options, 'includeWind') ? !!options.includeWind : true,
    includeSeismicWeight: hasOwn(options, 'includeSeismicWeight') ? !!options.includeSeismicWeight : false,
    unitWeight: nonNegativeNumber(options.unitWeight, 0),
    sectionName: options.sectionName || state.getDefaultSectionName('surface', 'roof'),
  };

  return planes.map(plane =>
    state.addSurfacePolygon(plane.points, {
      ...common,
      roofDirection: plane.roofDirection,
    })
  );
}

export function validateRoofGroup(state, roofGroupId, options = {}) {
  const surfaces = getRoofGroupSurfaces(state, roofGroupId);
  const tolerance = nonNegativeNumber(options.tolerance, 1);
  const zTolerance = nonNegativeNumber(options.zTolerance, 1);
  const issues = [];
  if (!surfaces.length) {
    issues.push({ code: 'roofGroupEmpty', roofGroupId: sanitizeRoofGroupId(roofGroupId, DEFAULT_ROOF_GROUP_ID) });
    return { roofGroupId: sanitizeRoofGroupId(roofGroupId, DEFAULT_ROOF_GROUP_ID), surfaceCount: 0, issues };
  }

  for (const surface of surfaces) {
    const points = roofPlanPoints(surface);
    if (points.length < 3) {
      issues.push({ code: 'roofInvalidOutline', surfaceId: surface.id });
      continue;
    }
    if (polygonHasSelfIntersections(points, tolerance)) {
      issues.push({ code: 'roofSelfIntersection', surfaceId: surface.id });
    }
  }

  for (let i = 0; i < surfaces.length; i++) {
    for (let j = i + 1; j < surfaces.length; j++) {
      const edgePairs = matchingRoofPlanEdges(roofPlanEdges(surfaces[i]), roofPlanEdges(surfaces[j]), tolerance);
      for (const { edgeA } of edgePairs) {
        const startA = roofPoint3D(state, surfaces[i], edgeA.start);
        const endA = roofPoint3D(state, surfaces[i], edgeA.end);
        const startB = roofPoint3D(state, surfaces[j], edgeA.start);
        const endB = roofPoint3D(state, surfaces[j], edgeA.end);
        if (Math.abs(startA.z - startB.z) > zTolerance || Math.abs(endA.z - endB.z) > zTolerance) {
          issues.push({
            code: 'roofSharedEdgeHeightMismatch',
            surfaceAId: surfaces[i].id,
            surfaceBId: surfaces[j].id,
          });
        }
      }
    }
  }

  return {
    roofGroupId: sanitizeRoofGroupId(roofGroupId, DEFAULT_ROOF_GROUP_ID),
    surfaceCount: surfaces.length,
    issues,
  };
}

export function removeRoofGeneratedElements(state, roofGroupId, options = {}) {
  const surfaces = getRoofGroupSurfaces(state, roofGroupId);
  if (!surfaces.length) return { members: 0, eaves: 0, gableWalls: 0, total: 0 };
  const tolerance = nonNegativeNumber(options.tolerance, 1);
  const removeMembers = hasOwn(options, 'members') ? !!options.members : true;
  const removeEaves = hasOwn(options, 'eaves') ? !!options.eaves : true;
  const removeGableWalls = hasOwn(options, 'gableWalls') ? !!options.gableWalls : true;
  const outerEdges = roofGroupOuterEdges(surfaces, tolerance);

  let members = 0;
  if (removeMembers) {
    const memberIds = state.members
      .filter(member => member.roofRole && isRoofMemberInGroup(state, member, surfaces, tolerance))
      .map(member => member.id);
    for (const id of memberIds) {
      state.removeMember(id);
      members += 1;
    }
  }

  let eaves = 0;
  let gableWalls = 0;
  const surfaceIds = [];
  for (const surface of state.surfaces) {
    if (removeEaves && isEaveSurfaceType(surface.type) && isEaveOnRoofOuterEdges(surface, outerEdges, tolerance)) {
      surfaceIds.push(surface.id);
      eaves += 1;
    } else if (removeGableWalls && isGableWallSurfaceType(surface.type) && isGableOnRoofOuterEdges(surface, outerEdges, tolerance)) {
      surfaceIds.push(surface.id);
      gableWalls += 1;
    }
  }
  for (const id of surfaceIds) {
    state.removeSurface(id);
  }

  return {
    members,
    eaves,
    gableWalls,
    total: members + eaves + gableWalls,
  };
}

export function regenerateRoofGeneratedElements(state, roofGroupId, options = {}) {
  const removed = removeRoofGeneratedElements(state, roofGroupId, options);
  const surfaces = getRoofGroupSurfaces(state, roofGroupId);
  const spacing = positiveNumber(options.spacing, DEFAULT_RAFTER_SPACING_MM);
  const depth = positiveNumber(options.depth, DEFAULT_EAVE_DEPTH_MM);
  const generated = {
    roofEdges: 0,
    roofSlopeBeams: 0,
    roofJoints: 0,
    eaves: 0,
    gableWalls: 0,
  };
  for (const surface of surfaces) {
    generated.roofEdges += addRoofEdgeMembers(state, surface.id).length;
    generated.roofSlopeBeams += addRoofSlopeMembers(state, surface.id, { spacing }).length;
  }
  generated.roofJoints = addRoofJointMembers(state, roofGroupId).length;
  generated.eaves = addEavesFromRoofGroup(state, roofGroupId, { depth }).length;
  generated.gableWalls = addGableWallsFromRoofGroup(state, roofGroupId).length;
  const generatedTotal = Object.values(generated).reduce((sum, count) => sum + count, 0);
  return {
    removed,
    generated,
    generatedTotal,
    total: removed.total + generatedTotal,
  };
}

export function listRoofGroups(state) {
  const groups = new Map();
  for (const surface of state.surfaces) {
    if (!isRoofSurfaceType(surface.type)) continue;
    const groupId = sanitizeRoofGroupId(surface.roofGroupId, DEFAULT_ROOF_GROUP_ID);
    const group = groups.get(groupId) || { id: groupId, surfaces: [] };
    group.surfaces.push(surface);
    groups.set(groupId, group);
  }
  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getRoofGroupSurfaces(state, groupId) {
  const normalizedGroupId = sanitizeRoofGroupId(groupId, DEFAULT_ROOF_GROUP_ID);
  return state.surfaces.filter(surface =>
    isRoofSurfaceType(surface.type) &&
    sanitizeRoofGroupId(surface.roofGroupId, DEFAULT_ROOF_GROUP_ID) === normalizedGroupId
  );
}

// --- Module-private helpers ---

function sharedRoofEdges(state, surfaceA, surfaceB, tolerance = 1, zTolerance = 1) {
  const edges = [];
  const edgesA = roofPlanEdges(surfaceA);
  const edgesB = roofPlanEdges(surfaceB);
  for (const edgeA of edgesA) {
    for (const edgeB of edgesB) {
      if (!sameSegment(edgeA.start, edgeA.end, edgeB.start, edgeB.end, tolerance)) continue;
      const startA = roofPoint3D(state, surfaceA, edgeA.start);
      const endA = roofPoint3D(state, surfaceA, edgeA.end);
      const startB = roofPoint3D(state, surfaceB, edgeA.start);
      const endB = roofPoint3D(state, surfaceB, edgeA.end);
      if (Math.abs(startA.z - startB.z) > zTolerance || Math.abs(endA.z - endB.z) > zTolerance) continue;
      const start = { x: edgeA.start.x, y: edgeA.start.y, z: (startA.z + startB.z) / 2 };
      const end = { x: edgeA.end.x, y: edgeA.end.y, z: (endA.z + endB.z) / 2 };
      edges.push({
        surfaceA,
        surfaceB,
        start,
        end,
        roofRole: classifyRoofJoint(state, surfaceA, surfaceB, start, end, zTolerance),
      });
    }
  }
  return edges;
}

function roofPlanEdges(surface) {
  const points = roofPlanPoints(surface);
  return points.map((start, index) => ({
    start,
    end: points[(index + 1) % points.length],
  }));
}

function hasSharedRoofGroupEdge(state, surface, start, end, tolerance = 1) {
  if (!isRoofSurfaceType(surface.type)) return false;
  const groupSurfaces = getRoofGroupSurfaces(state, surface.roofGroupId);
  return groupSurfaces.some(other => {
    if (other.id === surface.id) return false;
    return roofPlanEdges(other).some(edge =>
      sameSegment(start, end, edge.start, edge.end, tolerance)
    );
  });
}

function hasGableWallOnSegment(state, levelId, start, end, tolerance = 1) {
  return state.surfaces.some(surface => (
    isGableWallSurfaceType(surface.type) &&
    surface.levelId === levelId &&
    sameSegment(
      { x: surface.x1, y: surface.y1 },
      { x: surface.x2, y: surface.y2 },
      start,
      end,
      tolerance
    )
  ));
}

function hasEaveOnInnerSegment(state, levelId, start, end, tolerance = 1) {
  return state.surfaces.some(surface => {
    if (!isEaveSurfaceType(surface.type) || surface.levelId !== levelId) return false;
    const points = roofPlanPoints(surface);
    if (points.length < 2) return false;
    return sameSegment(start, end, points[0], points[1], tolerance);
  });
}

function roofGroupOuterEdges(surfaces, tolerance = 1) {
  const edges = [];
  for (const surface of surfaces) {
    for (const edge of roofPlanEdges(surface)) {
      const isShared = surfaces.some(other =>
        other.id !== surface.id &&
        roofPlanEdges(other).some(otherEdge =>
          sameSegment(edge.start, edge.end, otherEdge.start, otherEdge.end, tolerance)
        )
      );
      if (!isShared) edges.push({ ...edge, surface });
    }
  }
  return edges;
}

function isRoofMemberInGroup(state, member, surfaces, tolerance = 1) {
  const start = state.getNode(member.startNodeId);
  const end = state.getNode(member.endNodeId);
  if (!start || !end) return false;
  return surfaces.some(surface =>
    isPlanPointInOrOnRoofSurface(start, surface, tolerance) &&
    isPlanPointInOrOnRoofSurface(end, surface, tolerance)
  );
}

function isEaveOnRoofOuterEdges(surface, outerEdges, tolerance = 1) {
  const points = roofPlanPoints(surface);
  if (points.length < 2) return false;
  return outerEdges.some(edge => (
    surface.levelId === edge.surface.levelId &&
    sameSegment(points[0], points[1], edge.start, edge.end, tolerance)
  ));
}

function isGableOnRoofOuterEdges(surface, outerEdges, tolerance = 1) {
  return outerEdges.some(edge => (
    surface.levelId === edge.surface.levelId &&
    sameSegment(
      { x: surface.x1, y: surface.y1 },
      { x: surface.x2, y: surface.y2 },
      edge.start,
      edge.end,
      tolerance
    )
  ));
}

function removeRoofEdgeMembersOnSegment(state, start, end, tolerance = 1) {
  const removedIds = new Set();
  state.members = state.members.filter(member => {
    if (member.roofRole !== 'roofEdge' || member.geometryMode !== 'explicit3d') return true;
    const startNode = state.getNode(member.startNodeId);
    const endNode = state.getNode(member.endNodeId);
    if (!startNode || !endNode) return true;
    const matches = sameSegment(start, end, startNode, endNode, tolerance);
    if (matches) removedIds.add(member.id);
    return !matches;
  });
  if (removedIds.size) state._touch();
  if (removedIds.has(state.selectedMemberId)) state.selectedMemberId = null;
}

function classifyRoofJoint(state, surfaceA, surfaceB, start, end, zTolerance = 1) {
  const edgeZ = (start.z + end.z) / 2;
  const deltaA = roofInteriorZDelta(state, surfaceA, start, end, edgeZ);
  const deltaB = roofInteriorZDelta(state, surfaceB, start, end, edgeZ);
  if (deltaA > zTolerance && deltaB > zTolerance) {
    return Math.abs(start.z - end.z) <= zTolerance ? 'roofRidge' : 'roofHip';
  }
  if (deltaA < -zTolerance && deltaB < -zTolerance) return 'roofValley';
  return 'roofJoint';
}

function roofInteriorZDelta(state, surface, start, end, edgeZ) {
  const sample = roofInteriorSamplePoint(surface, start, end);
  if (!sample) return 0;
  return edgeZ - roofPoint3D(state, surface, sample).z;
}

function roofInteriorSamplePoint(surface, start, end) {
  const points = roofPlanPoints(surface);
  if (points.length < 3) return null;
  const mid = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
  const edge = roofPlanEdges(surface).find(candidate =>
    sameSegment(candidate.start, candidate.end, start, end, 1)
  );
  if (edge) {
    const inward = edgeInwardNormal(edge.start, edge.end, points);
    const length = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
    const distances = uniquePositiveNumbers([
      Math.min(250, length * 0.25),
      Math.min(100, length * 0.1),
      10,
      1,
    ]);
    for (const distance of distances) {
      const sample = {
        x: mid.x + inward.x * distance,
        y: mid.y + inward.y * distance,
      };
      if (isInteriorPlanPoint(sample, points, 0.001)) return sample;
    }
  }

  const centroid = polygonVertexCentroid(points);
  if (isInteriorPlanPoint(centroid, points, 0.001)) return centroid;
  return null;
}

function splitRoofEdgeMemberAtNode(state, node, tolerance = 1) {
  const edge = state.members.find(member => {
    if (member.roofRole !== 'roofEdge' || member.geometryMode !== 'explicit3d') return false;
    if (member.startNodeId === node.id || member.endNodeId === node.id) return false;
    const startNode = state.getNode(member.startNodeId);
    const endNode = state.getNode(member.endNodeId);
    if (!startNode || !endNode) return false;
    const t = segmentParameter(node.x, node.y, startNode.x, startNode.y, endNode.x, endNode.y);
    return t > 0.000001 && t < 0.999999 &&
      pointToSegmentDist(node.x, node.y, startNode.x, startNode.y, endNode.x, endNode.y) <= tolerance;
  });
  if (!edge) return null;

  const startNode = state.getNode(edge.startNodeId);
  const endNode = state.getNode(edge.endNodeId);
  const t = segmentParameter(node.x, node.y, startNode.x, startNode.y, endNode.x, endNode.y);
  const startZ = state._memberEndpointZ(edge, 'startZ');
  const endZ = state._memberEndpointZ(edge, 'endZ');
  const splitZ = startZ + (endZ - startZ) * t;
  state.members = state.members.filter(member => member.id !== edge.id);
  state._touch();
  if (state.selectedMemberId === edge.id) state.selectedMemberId = null;
  const first = addRoofEdgeSegment(state, edge, edge.startNodeId, node.id, startZ, splitZ);
  const second = addRoofEdgeSegment(state, edge, node.id, edge.endNodeId, splitZ, endZ);
  return {
    removedId: edge.id,
    members: [first, second],
  };
}

function addRoofEdgeSegment(state, source, startNodeId, endNodeId, startZ, endZ) {
  return state.addMember(startNodeId, endNodeId, {
    type: source.type,
    levelId: source.levelId,
    topLevelId: source.topLevelId,
    geometryMode: 'explicit3d',
    startZ,
    endZ,
    roofRole: source.roofRole,
    sectionName: source.sectionName,
    bracePattern: source.bracePattern,
    endI: source.endI,
    endJ: source.endJ,
  });
}

function roofSlopeBoundaryNodes(state, surface, tolerance = 1) {
  const nodeIds = new Set();
  for (const member of state.members) {
    if (member.roofRole !== 'roofSlopeBeam' || member.geometryMode !== 'explicit3d') continue;
    for (const nodeId of [member.startNodeId, member.endNodeId]) {
      const node = state.getNode(nodeId);
      if (node && isNodeOnRoofBoundary(surface, node, tolerance)) {
        nodeIds.add(nodeId);
      }
    }
  }
  return [...nodeIds].map(id => state.getNode(id)).filter(Boolean);
}

function isNodeOnRoofBoundary(surface, node, tolerance = 1) {
  const points = roofPlanPoints(surface);
  if (points.length < 3) return false;
  return points.some((point, index) => {
    const next = points[(index + 1) % points.length];
    return pointToSegmentDist(node.x, node.y, point.x, point.y, next.x, next.y) <= tolerance;
  });
}

function matchingRoofPlanEdges(edgesA, edgesB, tolerance = 1) {
  const matches = [];
  for (const edgeA of edgesA) {
    for (const edgeB of edgesB) {
      if (sameSegment(edgeA.start, edgeA.end, edgeB.start, edgeB.end, tolerance)) {
        matches.push({ edgeA, edgeB });
      }
    }
  }
  return matches;
}

function isPlanPointInOrOnRoofSurface(point, surface, tolerance = 1) {
  const points = roofPlanPoints(surface);
  if (points.length < 3) return false;
  if (isInteriorPlanPoint(point, points, tolerance)) return true;
  return points.some((start, index) => {
    const end = points[(index + 1) % points.length];
    return pointToSegmentDist(point.x, point.y, start.x, start.y, end.x, end.y) <= tolerance;
  });
}

function surfaceOutlinePoints(surface) {
  if (!surface) return [];
  if (surface.shape === 'polygon' && Array.isArray(surface.points) && surface.points.length >= 3) {
    return surface.points.map(point => ({
      x: finiteNumber(point.x, 0),
      y: finiteNumber(point.y, 0),
    }));
  }
  if (surface.shape === 'rect') {
    const x1 = finiteNumber(surface.x1, 0);
    const y1 = finiteNumber(surface.y1, 0);
    const x2 = finiteNumber(surface.x2, x1);
    const y2 = finiteNumber(surface.y2, y1);
    if (Math.abs(x2 - x1) <= 0.001 || Math.abs(y2 - y1) <= 0.001) return [];
    return [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ];
  }
  return [];
}

function normalizeRoofGenerationPattern(value) {
  const text = sanitizeText(value);
  if (text === 'gableX' || text === 'gableY' || text === 'hip') return text;
  return 'single';
}

// --- Roof plane layout (gable / hip patterns) ---

function roofGenerationPlanes(points, pattern, singleDirection) {
  if (pattern === 'single') {
    return [{ points: points.map(point => ({ ...point })), roofDirection: singleDirection }];
  }

  const rect = axisAlignedRectangleFromPoints(points);
  if (!rect) return [];
  if (pattern === 'gableX') return gableXRoofPlanes(rect);
  if (pattern === 'gableY') return gableYRoofPlanes(rect);
  if (pattern === 'hip') return hipRoofPlanes(rect);
  return [];
}

function gableXRoofPlanes(rect) {
  const midX = (rect.minX + rect.maxX) / 2;
  return [
    {
      roofDirection: 'xPlus',
      points: [
        { x: rect.minX, y: rect.minY },
        { x: midX, y: rect.minY },
        { x: midX, y: rect.maxY },
        { x: rect.minX, y: rect.maxY },
      ],
    },
    {
      roofDirection: 'xMinus',
      points: [
        { x: midX, y: rect.minY },
        { x: rect.maxX, y: rect.minY },
        { x: rect.maxX, y: rect.maxY },
        { x: midX, y: rect.maxY },
      ],
    },
  ];
}

function gableYRoofPlanes(rect) {
  const midY = (rect.minY + rect.maxY) / 2;
  return [
    {
      roofDirection: 'yPlus',
      points: [
        { x: rect.minX, y: rect.minY },
        { x: rect.maxX, y: rect.minY },
        { x: rect.maxX, y: midY },
        { x: rect.minX, y: midY },
      ],
    },
    {
      roofDirection: 'yMinus',
      points: [
        { x: rect.minX, y: midY },
        { x: rect.maxX, y: midY },
        { x: rect.maxX, y: rect.maxY },
        { x: rect.minX, y: rect.maxY },
      ],
    },
  ];
}

function hipRoofPlanes(rect) {
  const width = rect.maxX - rect.minX;
  const height = rect.maxY - rect.minY;
  const midX = (rect.minX + rect.maxX) / 2;
  const midY = (rect.minY + rect.maxY) / 2;

  if (width >= height) {
    const inset = height / 2;
    const ridgeStart = { x: Math.min(midX, rect.minX + inset), y: midY };
    const ridgeEnd = { x: Math.max(midX, rect.maxX - inset), y: midY };
    return [
      {
        roofDirection: 'yPlus',
        points: [
          { x: rect.minX, y: rect.minY },
          { x: rect.maxX, y: rect.minY },
          ridgeEnd,
          ridgeStart,
        ],
      },
      {
        roofDirection: 'xMinus',
        points: [
          { x: rect.maxX, y: rect.minY },
          { x: rect.maxX, y: rect.maxY },
          ridgeEnd,
        ],
      },
      {
        roofDirection: 'yMinus',
        points: [
          { x: rect.maxX, y: rect.maxY },
          { x: rect.minX, y: rect.maxY },
          ridgeStart,
          ridgeEnd,
        ],
      },
      {
        roofDirection: 'xPlus',
        points: [
          { x: rect.minX, y: rect.maxY },
          { x: rect.minX, y: rect.minY },
          ridgeStart,
        ],
      },
    ];
  }

  const inset = width / 2;
  const ridgeStart = { x: midX, y: Math.min(midY, rect.minY + inset) };
  const ridgeEnd = { x: midX, y: Math.max(midY, rect.maxY - inset) };
  return [
    {
      roofDirection: 'xPlus',
      points: [
        { x: rect.minX, y: rect.minY },
        ridgeStart,
        ridgeEnd,
        { x: rect.minX, y: rect.maxY },
      ],
    },
    {
      roofDirection: 'yPlus',
      points: [
        { x: rect.minX, y: rect.minY },
        { x: rect.maxX, y: rect.minY },
        ridgeStart,
      ],
    },
    {
      roofDirection: 'xMinus',
      points: [
        { x: rect.maxX, y: rect.minY },
        { x: rect.maxX, y: rect.maxY },
        ridgeEnd,
        ridgeStart,
      ],
    },
    {
      roofDirection: 'yMinus',
      points: [
        { x: rect.maxX, y: rect.maxY },
        { x: rect.minX, y: rect.maxY },
        ridgeEnd,
      ],
    },
  ];
}
