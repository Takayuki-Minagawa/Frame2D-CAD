import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { AppState } from '../js/state.js';
import {
  computeMemberLengthM,
  computeQuantitySummary,
  computeRoofMemberSummary,
  computeSurfaceWeightAreaM2,
  computeSurfaceWindProjectionM2,
  resolveSurfaceVerticalRange,
} from '../js/quantities.js';

test('wall height modes resolve to partial vertical ranges', () => {
  const state = new AppState();

  const waist = state.addSurfaceLine(0, 0, 5000, 0, {
    type: 'wall',
    levelId: 'L0',
    topLevelId: 'L1',
    heightMode: 'waist',
  });
  const hanging = state.addSurfaceLine(0, 1000, 5000, 1000, {
    type: 'wall',
    levelId: 'L0',
    topLevelId: 'L1',
    heightMode: 'hanging',
  });

  assert.deepEqual(resolveSurfaceVerticalRange(state, waist), {
    bottom: 0,
    top: 1200,
    height: 1200,
    bottomOffset: 0,
    topOffset: 1200,
  });
  assert.equal(resolveSurfaceVerticalRange(state, hanging).bottom, 2200);
  assert.equal(resolveSurfaceVerticalRange(state, hanging).top, 2800);
});

test('wall height and weight fields survive CAD serialization', () => {
  const source = new AppState();
  source.addSurfaceLine(0, 0, 5000, 0, {
    type: 'wall',
    levelId: 'L0',
    topLevelId: 'L1',
    heightMode: 'custom',
    bottomOffset: 300,
    topOffset: 1800,
    includeWind: false,
    includeSeismicWeight: true,
    unitWeight: 450,
  });

  const data = source.toJSON();
  assert.equal(data.schemaVersion, 9);
  assert.equal(data.surfaces[0].heightMode, 'custom');
  assert.equal(data.surfaces[0].bottomOffset, 300);
  assert.equal(data.surfaces[0].topOffset, 1800);
  assert.equal(data.surfaces[0].includeWind, false);
  assert.equal(data.surfaces[0].includeSeismicWeight, true);
  assert.equal(data.surfaces[0].unitWeight, 450);

  const restored = new AppState();
  restored.loadJSON(data);
  assert.equal(restored.surfaces[0].heightMode, 'custom');
  assert.equal(restored.surfaces[0].bottomOffset, 300);
  assert.equal(restored.surfaces[0].topOffset, 1800);
  assert.equal(restored.surfaces[0].includeWind, false);
  assert.equal(restored.surfaces[0].includeSeismicWeight, true);
  assert.equal(restored.surfaces[0].unitWeight, 450);
});

test('roof plane fields survive CAD serialization', () => {
  const source = new AppState();
  source.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.25,
    roofDirection: 'yMinus',
    roofBaseOffset: 900,
    roofGroupId: 'MainRoof',
    includeWind: true,
    includeSeismicWeight: true,
    unitWeight: 700,
  });

  const data = source.toJSON();
  assert.equal(data.schemaVersion, 9);
  assert.equal(data.surfaces[0].type, 'roof');
  assert.equal(data.surfaces[0].roofSlope, 0.25);
  assert.equal(data.surfaces[0].roofDirection, 'yMinus');
  assert.equal(data.surfaces[0].roofBaseOffset, 900);
  assert.equal(data.surfaces[0].roofGroupId, 'MainRoof');

  const restored = new AppState();
  restored.loadJSON(data);
  assert.equal(restored.surfaces[0].sectionName, '_R');
  assert.equal(restored.surfaces[0].color, '#8b6f47');
  assert.equal(restored.surfaces[0].roofSlope, 0.25);
  assert.equal(restored.surfaces[0].roofDirection, 'yMinus');
  assert.equal(restored.surfaces[0].roofBaseOffset, 900);
  assert.equal(restored.surfaces[0].roofGroupId, 'MainRoof');
  assert.equal(restored.surfaces[0].includeWind, true);
  assert.equal(restored.surfaces[0].includeSeismicWeight, true);
});

test('roof group ids default, serialize, and list by group', () => {
  const source = new AppState();
  const a = source.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofGroupId: 'A',
  });
  source.addSurfaceRect(5000, 0, 10000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofGroupId: 'A',
  });
  source.addSurfaceRect(0, 5000, 5000, 9000, {
    type: 'roof',
    levelId: 'L1',
    roofGroupId: 'B',
  });
  source.addSurfaceRect(0, 10000, 5000, 14000, {
    type: 'roof',
    levelId: 'L1',
    roofGroupId: '',
  });

  assert.equal(a.roofGroupId, 'A');
  assert.deepEqual(source.listRoofGroups().map(group => [group.id, group.surfaces.length]), [
    ['A', 2],
    ['B', 1],
    ['RG1', 1],
  ]);

  const data = source.toJSON();
  assert.equal(data.surfaces[0].roofGroupId, 'A');
  assert.equal(data.surfaces[3].roofGroupId, 'RG1');

  const restored = new AppState();
  restored.loadJSON({
    ...data,
    schemaVersion: 6,
    surfaces: data.surfaces.map(({ roofGroupId, ...surface }) => surface),
  });
  assert.equal(restored.surfaces[0].roofGroupId, 'RG1');
  assert.equal(restored.getRoofGroupSurfaces('RG1').length, 4);
});

test('eave surfaces use sloped geometry without roof grouping', () => {
  const source = new AppState();
  const eave = source.addSurfaceRect(0, 0, 3000, 1000, {
    type: 'eave',
    levelId: 'L1',
    roofSlope: 0.2,
    roofDirection: 'yPlus',
    roofBaseOffset: -300,
    roofGroupId: 'Ignored',
    includeWind: true,
    includeSeismicWeight: true,
    unitWeight: 250,
  });

  assert.equal(eave.sectionName, '_E');
  assert.equal(eave.roofGroupId, undefined);
  assert.equal(Number(computeSurfaceWeightAreaM2(source, eave).toFixed(3)), 3.059);
  assert.deepEqual(computeSurfaceWindProjectionM2(source, eave), {
    xAreaM2: 0,
    yAreaM2: 0.6,
  });

  const data = source.toJSON();
  assert.equal(data.schemaVersion, 9);
  assert.equal(data.surfaces[0].type, 'eave');
  assert.equal(data.surfaces[0].roofSlope, 0.2);
  assert.equal(data.surfaces[0].roofDirection, 'yPlus');
  assert.equal(data.surfaces[0].roofBaseOffset, -300);
  assert.equal(Object.hasOwn(data.surfaces[0], 'roofGroupId'), false);

  const restored = new AppState();
  restored.loadJSON(data);
  assert.equal(restored.surfaces[0].type, 'eave');
  assert.equal(restored.surfaces[0].sectionName, '_E');
  assert.equal(restored.surfaces[0].roofSlope, 0.2);
  assert.equal(restored.surfaces[0].roofDirection, 'yPlus');
  assert.equal(restored.surfaces[0].includeWind, true);
  assert.equal(restored.surfaces[0].includeSeismicWeight, true);
});

test('non-roof surfaces omit roof-only fields', () => {
  const source = new AppState();
  source.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'floor',
    levelId: 'L1',
    includeSeismicWeight: true,
    unitWeight: 300,
  });

  const data = source.toJSON();
  assert.equal(Object.hasOwn(data.surfaces[0], 'roofSlope'), false);
  assert.equal(Object.hasOwn(data.surfaces[0], 'roofDirection'), false);
  assert.equal(Object.hasOwn(data.surfaces[0], 'roofBaseOffset'), false);
  assert.equal(Object.hasOwn(data.surfaces[0], 'roofGroupId'), false);

  const restored = new AppState();
  restored.loadJSON({
    ...data,
    surfaces: [{
      ...data.surfaces[0],
      roofSlope: null,
      roofDirection: null,
      roofBaseOffset: null,
      roofGroupId: null,
    }],
  });

  assert.equal(Object.hasOwn(restored.surfaces[0], 'roofSlope'), false);
  assert.equal(Object.hasOwn(restored.toJSON().surfaces[0], 'roofSlope'), false);
  assert.equal(Object.hasOwn(restored.toJSON().surfaces[0], 'roofGroupId'), false);
});

test('gable wall surfaces use trapezoid area and variable top offsets', () => {
  const source = new AppState();
  const gable = source.addSurfaceLine(0, 0, 5000, 0, {
    type: 'gableWall',
    levelId: 'L0',
    topLevelId: 'L1',
    bottomOffset: 0,
    topOffset: 2800,
    gableStartTopOffset: 1200,
    gableEndTopOffset: 2800,
    includeWind: true,
    includeSeismicWeight: true,
    unitWeight: 400,
  });

  assert.equal(gable.sectionName, '_GW');
  assert.equal(gable.heightMode, 'custom');
  assert.equal(gable.topOffset, 2800);
  assert.equal(computeSurfaceWeightAreaM2(source, gable), 10);
  assert.deepEqual(computeSurfaceWindProjectionM2(source, gable), {
    xAreaM2: 0,
    yAreaM2: 10,
  });

  const data = source.toJSON();
  assert.equal(data.schemaVersion, 9);
  assert.equal(data.surfaces[0].type, 'gableWall');
  assert.equal(data.surfaces[0].gableStartTopOffset, 1200);
  assert.equal(data.surfaces[0].gableEndTopOffset, 2800);

  const restored = new AppState();
  restored.loadJSON(data);
  assert.equal(restored.surfaces[0].type, 'gableWall');
  assert.equal(restored.surfaces[0].sectionName, '_GW');
  assert.equal(restored.surfaces[0].gableStartTopOffset, 1200);
  assert.equal(restored.surfaces[0].gableEndTopOffset, 2800);
  assert.equal(computeQuantitySummary(restored).totals.seismicWeightN, 4000);
});

test('invalid custom wall offsets are rejected instead of being clamped to 1mm height', () => {
  const state = new AppState();
  const wall = state.addSurfaceLine(0, 0, 5000, 0, {
    type: 'wall',
    levelId: 'L0',
    topLevelId: 'L1',
    heightMode: 'custom',
    bottomOffset: 0,
    topOffset: 1200,
  });

  state.updateSurface(wall.id, { bottomOffset: 1500 });
  assert.equal(wall.bottomOffset, 0);
  assert.equal(wall.topOffset, 1200);
  assert.equal(wall.heightMode, 'custom');

  state.updateSurface(wall.id, { topOffset: -100 });
  assert.equal(wall.bottomOffset, 0);
  assert.equal(wall.topOffset, 1200);
});

test('floor surfaces keep wall-only height and wind fields inert', () => {
  const state = new AppState();
  const floor = state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'floor',
    levelId: 'L0',
    heightMode: 'waist',
    bottomOffset: 300,
    topOffset: 1200,
  });

  assert.equal(floor.heightMode, 'custom');
  assert.equal(floor.bottomOffset, 0);
  assert.equal(floor.topOffset, 0);
  assert.equal(floor.includeWind, false);
});

test('wind projection uses direction-specific projected areas', () => {
  const state = new AppState();
  const wall = state.addSurfaceLine(0, 0, 5000, 0, {
    type: 'wall',
    levelId: 'L0',
    topLevelId: 'L1',
    heightMode: 'waist',
  });
  const exterior = state.addSurfacePolygon([
    { x: 0, y: 0 },
    { x: 5000, y: 0 },
    { x: 5000, y: 4000 },
    { x: 0, y: 4000 },
  ], {
    type: 'exteriorWall',
    levelId: 'L0',
    topLevelId: 'L1',
  });

  assert.deepEqual(computeSurfaceWindProjectionM2(state, wall), {
    xAreaM2: 0,
    yAreaM2: 6,
  });
  assert.deepEqual(computeSurfaceWindProjectionM2(state, exterior), {
    xAreaM2: 11.2,
    yAreaM2: 14,
  });

  const rectExterior = state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'exteriorWall',
    levelId: 'L0',
    topLevelId: 'L1',
  });
  assert.deepEqual(computeSurfaceWindProjectionM2(state, rectExterior), {
    xAreaM2: 11.2,
    yAreaM2: 14,
  });
});

test('exterior wall polygon wind projection uses the segment silhouette once per axis', async () => {
  const state = new AppState();
  const reentrant = state.addSurfacePolygon([
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 2000 },
    { x: 3000, y: 2000 },
    { x: 3000, y: 5000 },
    { x: 0, y: 5000 },
  ], {
    type: 'exteriorWall',
    levelId: 'L0',
    topLevelId: 'L1',
  });

  assert.deepEqual(computeSurfaceWindProjectionM2(state, reentrant), {
    xAreaM2: 14,
    yAreaM2: 16.8,
  });

  const quantitiesSource = await readFile(new URL('../js/quantities.js', import.meta.url), 'utf8');
  assert.match(quantitiesSource, /computeExteriorWallWindProjectionM2/);
  assert.match(quantitiesSource, /projectedSegmentUnionLengthMm\(segments,\s*'y'\)/);
  assert.match(quantitiesSource, /projectedSegmentUnionLengthMm\(segments,\s*'x'\)/);
  assert.doesNotMatch(quantitiesSource, /pointBounds/);
});

test('seismic weight summary uses surface area times unit weight', () => {
  const state = new AppState();
  const floor = state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'floor',
    levelId: 'L0',
    includeSeismicWeight: true,
    unitWeight: 600,
  });
  const wall = state.addSurfaceLine(0, 0, 5000, 0, {
    type: 'wall',
    levelId: 'L0',
    topLevelId: 'L1',
    heightMode: 'waist',
    includeSeismicWeight: true,
    unitWeight: 500,
  });

  assert.equal(computeSurfaceWeightAreaM2(state, floor), 20);
  assert.equal(computeSurfaceWeightAreaM2(state, wall), 6);

  const summary = computeQuantitySummary(state);
  assert.equal(summary.totals.seismicWeightN, 15000);
  assert.equal(summary.totals.windYAreaM2, 6);
});

test('roof planes use sloped actual area and vertical projected wind areas', () => {
  const state = new AppState();
  const roof = state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xPlus',
    includeWind: true,
    includeSeismicWeight: true,
    unitWeight: 500,
  });

  assert.equal(Number(computeSurfaceWeightAreaM2(state, roof).toFixed(3)), 20.881);
  assert.deepEqual(computeSurfaceWindProjectionM2(state, roof), {
    xAreaM2: 6,
    yAreaM2: 0,
  });

  const summary = computeQuantitySummary(state);
  assert.equal(Number(summary.totals.seismicWeightN.toFixed(3)), 10440.307);
  assert.equal(summary.totals.windXAreaM2, 6);
});

test('roof edge members are generated with explicit 3D endpoints', () => {
  const state = new AppState();
  const existingCorner = state.addNode(0, 0);
  const roof = state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xPlus',
    roofBaseOffset: 200,
  });

  const members = state.addRoofEdgeMembers(roof.id);
  assert.equal(members.length, 4);
  assert.equal(state.nodes.length, 4);
  assert.equal(members[0].startNodeId, existingCorner.id);
  const connectedNodeIds = new Set(members.flatMap(member => [member.startNodeId, member.endNodeId]));
  assert.equal(connectedNodeIds.size, 4);
  for (const nodeId of connectedNodeIds) {
    const useCount = members.filter(member => member.startNodeId === nodeId || member.endNodeId === nodeId).length;
    assert.equal(useCount, 2);
  }
  assert.ok(members.every(member => member.geometryMode === 'explicit3d'));
  assert.ok(members.every(member => member.roofRole === 'roofEdge'));
  assert.equal(members[0].startZ, 3000);
  assert.equal(members[0].endZ, 4500);

  const data = state.toJSON();
  assert.equal(data.schemaVersion, 9);
  assert.equal(data.members[0].geometryMode, 'explicit3d');
  assert.equal(data.members[0].startZ, 3000);
  assert.equal(data.members[0].endZ, 4500);
  assert.equal(data.members[0].roofRole, 'roofEdge');

  const restored = new AppState();
  restored.loadJSON(data);
  assert.equal(restored.members[0].geometryMode, 'explicit3d');
  assert.equal(restored.members[0].startZ, 3000);
  assert.equal(restored.members[0].endZ, 4500);
});

test('roof joint members are generated from shared roof group edges', () => {
  const state = new AppState();
  state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xPlus',
    roofGroupId: 'Main',
  });
  state.addSurfaceRect(5000, 0, 10000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xMinus',
    roofGroupId: 'Main',
  });

  const members = state.addRoofJointMembers('Main');
  assert.equal(members.length, 1);
  assert.equal(members[0].roofRole, 'roofRidge');
  assert.equal(members[0].geometryMode, 'explicit3d');
  assert.equal(members[0].startZ, 4300);
  assert.equal(members[0].endZ, 4300);
  const start = state.getNode(members[0].startNodeId);
  const end = state.getNode(members[0].endNodeId);
  assert.equal(start.x, 5000);
  assert.equal(end.x, 5000);
});

test('roof joint generation classifies valleys and respects roof groups', () => {
  const state = new AppState();
  state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xMinus',
    roofGroupId: 'Main',
  });
  state.addSurfaceRect(5000, 0, 10000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xPlus',
    roofGroupId: 'Main',
  });
  state.addSurfaceRect(10000, 0, 15000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xMinus',
    roofGroupId: 'Other',
  });

  const members = state.addRoofJointMembers('Main');
  assert.equal(members.length, 1);
  assert.equal(members[0].roofRole, 'roofValley');
  assert.equal(members[0].startZ, 2800);
  assert.equal(members[0].endZ, 2800);
});

test('roof joint generation classifies concave notch shared edges from owning interiors', () => {
  const state = new AppState();
  state.addSurfacePolygon([
    { x: 0, y: 0 },
    { x: 5000, y: 0 },
    { x: 5000, y: 4000 },
    { x: 3500, y: 4000 },
    { x: 3500, y: 1000 },
    { x: 1500, y: 1000 },
    { x: 1500, y: 4000 },
    { x: 0, y: 4000 },
  ], {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'yPlus',
    roofGroupId: 'Main',
  });
  state.addSurfaceRect(1500, 1000, 3500, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.1,
    roofDirection: 'yMinus',
    roofGroupId: 'Main',
  });

  const members = state.addRoofJointMembers('Main');
  assert.equal(members.length, 1);
  assert.equal(members[0].roofRole, 'roofRidge');
  assert.equal(members[0].geometryMode, 'explicit3d');
  assert.equal(members[0].startZ, 3100);
  assert.equal(members[0].endZ, 3100);
});

test('roof joint classification samples inward from the shared roof edge', async () => {
  const stateSource = await readFile(new URL('../js/state.js', import.meta.url), 'utf8');

  assert.match(stateSource, /_roofInteriorSamplePoint\(surface,\s*start,\s*end\)/);
  assert.match(stateSource, /edgeInwardNormal\(edge\.start,\s*edge\.end,\s*points\)/);
  assert.match(stateSource, /isInteriorPlanPoint\(sample,\s*points,\s*0\.001\)/);
  assert.match(stateSource, /uniquePositiveNumbers\(\[/);
  assert.doesNotMatch(stateSource, /_roofInteriorZDelta\(surface,\s*edgePoint,\s*edgeZ\)/);
});

test('roof edge generation skips shared roof group edges', () => {
  const state = new AppState();
  const left = state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xPlus',
    roofGroupId: 'Main',
  });
  const right = state.addSurfaceRect(5000, 0, 10000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xMinus',
    roofGroupId: 'Main',
  });

  const leftEdges = state.addRoofEdgeMembers(left.id);
  const rightEdges = state.addRoofEdgeMembers(right.id);
  const edgeMembers = state.members.filter(member => member.roofRole === 'roofEdge');

  assert.equal(leftEdges.length, 3);
  assert.equal(rightEdges.length, 3);
  assert.equal(edgeMembers.length, 6);
  assert.equal(edgeMembers.some(member => {
    const start = state.getNode(member.startNodeId);
    const end = state.getNode(member.endNodeId);
    return start.x === 5000 && end.x === 5000;
  }), false);
});

test('roof joint generation replaces duplicate roof edge members on shared edges', () => {
  const state = new AppState();
  state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xPlus',
    roofGroupId: 'Main',
  });
  state.addSurfaceRect(5000, 0, 10000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xMinus',
    roofGroupId: 'Main',
  });
  const start = state.addNode(5000, 0);
  const end = state.addNode(5000, 4000);
  state.addMember(start.id, end.id, {
    type: 'beam',
    levelId: 'L1',
    geometryMode: 'explicit3d',
    startZ: 4300,
    endZ: 4300,
    roofRole: 'roofEdge',
  });
  state.addMember(start.id, end.id, {
    type: 'beam',
    levelId: 'L1',
    geometryMode: 'explicit3d',
    startZ: 4300,
    endZ: 4300,
    roofRole: 'roofEdge',
  });

  const joints = state.addRoofJointMembers('Main');

  assert.equal(joints.length, 1);
  assert.equal(joints[0].roofRole, 'roofRidge');
  assert.equal(state.members.filter(member => member.roofRole === 'roofEdge').length, 0);
  assert.equal(state.members.filter(member => member.roofRole === 'roofRidge').length, 1);
});

test('roof member summary groups counts and explicit 3D lengths by role', () => {
  const state = new AppState();
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(3000, 4000);
  const n3 = state.addNode(3000, 0);
  const n4 = state.addNode(6000, 0);

  const edge = state.addMember(n1.id, n2.id, {
    type: 'beam',
    levelId: 'L1',
    geometryMode: 'explicit3d',
    startZ: 2800,
    endZ: 2800,
    roofRole: 'roofEdge',
  });
  state.addMember(n2.id, n3.id, {
    type: 'beam',
    levelId: 'L1',
    geometryMode: 'explicit3d',
    startZ: 2800,
    endZ: 5800,
    roofRole: 'roofEdge',
  });
  state.addMember(n3.id, n4.id, {
    type: 'beam',
    levelId: 'L1',
    geometryMode: 'explicit3d',
    startZ: 2800,
    endZ: 6800,
    roofRole: 'roofRidge',
  });
  state.addMember(n1.id, n4.id, { type: 'beam', levelId: 'L1' });

  assert.equal(computeMemberLengthM(state, edge), 5);
  const summary = computeRoofMemberSummary(state);
  assert.deepEqual(summary.rows.map(row => [row.roofRole, row.count, Number(row.lengthM.toFixed(3))]), [
    ['roofEdge', 2, 10],
    ['roofRidge', 1, 5],
  ]);
  assert.equal(summary.totals.count, 3);
  assert.equal(summary.totals.lengthM, 15);
  assert.equal(computeQuantitySummary(state).roofMembers.totals.count, 3);
});

test('gable walls are generated from sloped outer roof group edges', () => {
  const state = new AppState();
  state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xPlus',
    roofGroupId: 'Main',
  });
  state.addSurfaceRect(5000, 0, 10000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xMinus',
    roofGroupId: 'Main',
  });

  const walls = state.addGableWallsFromRoofGroup('Main');

  assert.equal(walls.length, 4);
  assert.ok(walls.every(surface => surface.type === 'gableWall'));
  assert.ok(walls.every(surface => surface.sectionName === '_GW'));
  assert.equal(state.surfaces.filter(surface => surface.type === 'gableWall').length, 4);
  assert.deepEqual(walls.map(surface => [surface.x1, surface.y1, surface.x2, surface.y2, surface.gableStartTopOffset, surface.gableEndTopOffset]), [
    [0, 0, 5000, 0, 0, 1500],
    [5000, 4000, 0, 4000, 1500, 0],
    [5000, 0, 10000, 0, 1500, 0],
    [10000, 4000, 5000, 4000, 0, 1500],
  ]);

  const secondPass = state.addGableWallsFromRoofGroup('Main');
  assert.equal(secondPass.length, 0);
});

test('gable wall generation skips shared and horizontal roof edges', () => {
  const state = new AppState();
  state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xPlus',
    roofGroupId: 'Main',
  });
  state.addSurfaceRect(5000, 0, 10000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xMinus',
    roofGroupId: 'Main',
  });

  state.addGableWallsFromRoofGroup('Main');
  const gableWalls = state.surfaces.filter(surface => surface.type === 'gableWall');

  assert.equal(gableWalls.some(surface => surface.x1 === 5000 && surface.x2 === 5000), false);
  assert.equal(gableWalls.some(surface => surface.x1 === 0 && surface.x2 === 0), false);
  assert.equal(gableWalls.some(surface => surface.x1 === 10000 && surface.x2 === 10000), false);
});

test('roof slope members are generated along the roof rise direction', () => {
  const state = new AppState();
  const roof = state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xPlus',
    roofBaseOffset: 200,
  });

  const members = state.addRoofSlopeMembers(roof.id, { spacing: 1000 });
  assert.equal(members.length, 3);
  assert.equal(state.nodes.length, 6);
  assert.ok(members.every(member => member.geometryMode === 'explicit3d'));
  assert.ok(members.every(member => member.roofRole === 'roofSlopeBeam'));

  for (const member of members) {
    const start = state.getNode(member.startNodeId);
    const end = state.getNode(member.endNodeId);
    assert.equal(start.x, 0);
    assert.equal(end.x, 5000);
    assert.equal(start.y, end.y);
    assert.ok([1000, 2000, 3000].includes(start.y));
    assert.equal(member.startZ, 3000);
    assert.equal(member.endZ, 4500);
  }
});

test('roof slope member endpoints split existing roof edge members for node sharing', () => {
  const state = new AppState();
  const roof = state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xPlus',
    roofBaseOffset: 200,
  });

  state.addRoofEdgeMembers(roof.id);
  const slopeMembers = state.addRoofSlopeMembers(roof.id, { spacing: 1000 });
  const edgeMembers = state.members.filter(member => member.roofRole === 'roofEdge');

  assert.equal(slopeMembers.length, 3);
  assert.equal(edgeMembers.length, 10);
  for (const member of slopeMembers) {
    for (const nodeId of [member.startNodeId, member.endNodeId]) {
      const edgeUseCount = edgeMembers.filter(edge => edge.startNodeId === nodeId || edge.endNodeId === nodeId).length;
      assert.equal(edgeUseCount, 2);
    }
  }
});

test('roof edge members split around existing roof slope endpoints', () => {
  const state = new AppState();
  const roof = state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xPlus',
    roofBaseOffset: 200,
  });

  const slopeMembers = state.addRoofSlopeMembers(roof.id, { spacing: 1000 });
  const generatedEdges = state.addRoofEdgeMembers(roof.id);
  const edgeMembers = state.members.filter(member => member.roofRole === 'roofEdge');

  assert.equal(slopeMembers.length, 3);
  assert.equal(generatedEdges.length, 10);
  assert.equal(edgeMembers.length, 10);
  for (const member of slopeMembers) {
    for (const nodeId of [member.startNodeId, member.endNodeId]) {
      const edgeUseCount = edgeMembers.filter(edge => edge.startNodeId === nodeId || edge.endNodeId === nodeId).length;
      assert.equal(edgeUseCount, 2);
    }
  }
});

test('roof edge generation does not split around unrelated boundary nodes', () => {
  const state = new AppState();
  const roof = state.addSurfaceRect(0, 0, 5000, 4000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.3,
    roofDirection: 'xPlus',
    roofBaseOffset: 200,
  });
  state.addNode(0, 1000);

  const generatedEdges = state.addRoofEdgeMembers(roof.id);
  const edgeMembers = state.members.filter(member => member.roofRole === 'roofEdge');

  assert.equal(generatedEdges.length, 4);
  assert.equal(edgeMembers.length, 4);
});

test('roof slope member generation falls back to a center line for narrow roofs', () => {
  const state = new AppState();
  const roof = state.addSurfaceRect(0, 0, 500, 5000, {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.2,
    roofDirection: 'yMinus',
  });

  const members = state.addRoofSlopeMembers(roof.id, { spacing: 1000 });
  assert.equal(members.length, 1);
  const start = state.getNode(members[0].startNodeId);
  const end = state.getNode(members[0].endNodeId);
  assert.equal(start.x, 250);
  assert.equal(end.x, 250);
  assert.equal(start.y, 5000);
  assert.equal(end.y, 0);
  assert.equal(members[0].startZ, 2800);
  assert.equal(members[0].endZ, 3800);
});

test('roof slope member generation splits lines through re-entrant roof plans', () => {
  const state = new AppState();
  const roof = state.addSurfacePolygon([
    { x: 0, y: 0 },
    { x: 5000, y: 0 },
    { x: 5000, y: 4000 },
    { x: 3500, y: 4000 },
    { x: 3500, y: 1000 },
    { x: 1500, y: 1000 },
    { x: 1500, y: 4000 },
    { x: 0, y: 4000 },
  ], {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.1,
    roofDirection: 'xPlus',
  });

  const members = state.addRoofSlopeMembers(roof.id, { spacing: 2000 });
  assert.equal(members.length, 2);

  const spans = members.map(member => {
    const start = state.getNode(member.startNodeId);
    const end = state.getNode(member.endNodeId);
    return [start.x, end.x, start.y, end.y, member.startZ, member.endZ];
  });
  assert.deepEqual(spans, [
    [0, 1500, 2000, 2000, 2800, 2950],
    [3500, 5000, 2000, 2000, 3150, 3300],
  ]);
});

test('roof slope member generation skips spans outside a re-entrant notch boundary', () => {
  const state = new AppState();
  const roof = state.addSurfacePolygon([
    { x: 0, y: 0 },
    { x: 5000, y: 0 },
    { x: 5000, y: 4000 },
    { x: 3500, y: 4000 },
    { x: 3500, y: 1000 },
    { x: 1500, y: 1000 },
    { x: 1500, y: 4000 },
    { x: 0, y: 4000 },
  ], {
    type: 'roof',
    levelId: 'L1',
    roofSlope: 0.1,
    roofDirection: 'xPlus',
  });

  const members = state.addRoofSlopeMembers(roof.id, { spacing: 1000 });
  const spans = members.map(member => {
    const start = state.getNode(member.startNodeId);
    const end = state.getNode(member.endNodeId);
    return [start.x, end.x, start.y, end.y];
  });

  assert.deepEqual(spans, [
    [0, 1500, 1000, 1000],
    [3500, 5000, 1000, 1000],
    [0, 1500, 2000, 2000],
    [3500, 5000, 2000, 2000],
    [0, 1500, 3000, 3000],
    [3500, 5000, 3000, 3000],
  ]);
});
