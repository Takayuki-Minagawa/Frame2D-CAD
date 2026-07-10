// samples.js - Built-in example models, loadable from the settings modal.
// Each builder scripts a fresh AppState through the public API and returns
// serialized model JSON for state.loadJSON().

import { AppState } from './state.js';

export const SAMPLE_IDS = ['gableHouse', 'twoStoryFrame'];

export function buildSampleModel(sampleId) {
  if (sampleId === 'twoStoryFrame') return buildTwoStoryFrame();
  return buildGableHouse();
}

// 平屋 + 切妻屋根: exterior wall, floor, auto-generated gable roof with roof
// members, supports and a floor area load.
function buildGableHouse() {
  const state = new AppState();
  state.meta.name = 'sample_gable_house';
  const [gl, upper] = [...state.levels].sort((a, b) => a.z - b.z);

  const W = 7280;
  const D = 4550;

  // Axes on a 910 grid main line
  state.addAxis('x', 'X1', 0);
  state.addAxis('x', 'X2', W / 2);
  state.addAxis('x', 'X3', W);
  state.addAxis('y', 'Y1', 0);
  state.addAxis('y', 'Y2', D);

  // Columns at corners and mid-span of the long sides
  state.activeLevelId = gl.id;
  const columnPoints = [
    [0, 0], [W / 2, 0], [W, 0],
    [0, D], [W / 2, D], [W, D],
  ];
  for (const [x, y] of columnPoints) {
    const node = state.addNode(x, y);
    state.addMember(node.id, node.id, {
      type: 'column',
      levelId: gl.id,
      topLevelId: upper.id,
    });
    state.addSupport(x, y, { levelId: gl.id, dx: true, dy: true, dz: true });
  }

  // Perimeter + center beams at the upper level
  const beamSegments = [
    [[0, 0], [W / 2, 0]], [[W / 2, 0], [W, 0]],
    [[0, D], [W / 2, D]], [[W / 2, D], [W, D]],
    [[0, 0], [0, D]], [[W, 0], [W, D]],
    [[W / 2, 0], [W / 2, D]],
  ];
  for (const [[x1, y1], [x2, y2]] of beamSegments) {
    let n1 = state.findNodeAt(x1, y1, 1);
    if (!n1) n1 = state.addNode(x1, y1);
    let n2 = state.findNodeAt(x2, y2, 1);
    if (!n2) n2 = state.addNode(x2, y2);
    state.addMember(n1.id, n2.id, { type: 'beam', levelId: upper.id });
  }

  // Exterior wall at GL and ceiling floor at the upper level
  state.addSurfacePolygon(
    [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }],
    { type: 'exteriorWall', levelId: gl.id, topLevelId: upper.id, includeWind: true }
  );
  const floor = state.addSurfaceRect(0, 0, W, D, {
    type: 'floor',
    levelId: upper.id,
    topLevelId: upper.id,
    loadDirection: 'twoWay',
    includeSeismicWeight: true,
    unitWeight: 600,
  });

  // Gable roof (X ridge) generated from the floor outline + roof members
  state.addRoofPlanesFromSurface(floor.id, {
    pattern: 'gableY',
    roofGroupId: 'RG1',
    roofSlope: 0.4,
    roofBaseOffset: 0,
  });
  for (const roof of state.surfaces.filter(s => s.type === 'roof')) {
    state.addRoofEdgeMembers(roof.id);
  }
  state.addRoofJointMembers('RG1');
  state.addGableWallsFromRoofGroup('RG1');

  // Floor load (dead load case)
  state.addLoad('areaLoad', {
    x1: 0, y1: 0, x2: W, y2: D,
    value: 1300,
    levelId: upper.id,
    loadCase: 'DL',
  });

  return state.toJSON();
}

// 2階建フレーム: 2 stories, grid axes, columns/beams both stories, vertical
// brace, floors, supports and per-case loads.
function buildTwoStoryFrame() {
  const state = new AppState();
  state.meta.name = 'sample_two_story_frame';
  const [gl, second] = [...state.levels].sort((a, b) => a.z - b.z);
  const roofLevel = state.addLevel('RF', second.z + 2800);

  const spansX = [0, 3640, 7280];
  const spansY = [0, 3640];

  spansX.forEach((x, i) => state.addAxis('x', `X${i + 1}`, x));
  spansY.forEach((y, i) => state.addAxis('y', `Y${i + 1}`, y));

  // Columns for both stories + pin supports
  for (const x of spansX) {
    for (const y of spansY) {
      const node = state.addNode(x, y);
      state.addMember(node.id, node.id, { type: 'column', levelId: gl.id, topLevelId: second.id });
      const node2 = state.addNode(x, y);
      state.addMember(node2.id, node2.id, { type: 'column', levelId: second.id, topLevelId: roofLevel.id });
      state.addSupport(x, y, { levelId: gl.id, dx: true, dy: true, dz: true });
    }
  }

  // Beams at 2F and RF
  const beam = (levelId, x1, y1, x2, y2) => {
    let n1 = state.findNodeAt(x1, y1, 1);
    if (!n1) n1 = state.addNode(x1, y1);
    let n2 = state.findNodeAt(x2, y2, 1);
    if (!n2) n2 = state.addNode(x2, y2);
    state.addMember(n1.id, n2.id, { type: 'beam', levelId });
  };
  for (const levelId of [second.id, roofLevel.id]) {
    for (const y of spansY) {
      beam(levelId, spansX[0], y, spansX[1], y);
      beam(levelId, spansX[1], y, spansX[2], y);
    }
    for (const x of spansX) {
      beam(levelId, x, spansY[0], x, spansY[1]);
    }
  }

  // Vertical brace on the X1-X2 frame (Y1 side), first story
  const braceStart = state.addNode(spansX[0], spansY[0]);
  const braceEnd = state.addNode(spansX[1], spansY[0]);
  state.addMember(braceStart.id, braceEnd.id, {
    type: 'vbrace',
    levelId: gl.id,
    topLevelId: second.id,
    bracePattern: 'cross',
  });

  // Floors + loads per case
  for (const levelId of [second.id, roofLevel.id]) {
    state.addSurfaceRect(spansX[0], spansY[0], spansX[2], spansY[1], {
      type: 'floor',
      levelId,
      topLevelId: levelId,
      loadDirection: 'twoWay',
      includeSeismicWeight: true,
      unitWeight: 800,
    });
    state.addLoad('areaLoad', {
      x1: spansX[0], y1: spansY[0], x2: spansX[2], y2: spansY[1],
      value: 1800, levelId, loadCase: 'DL',
    });
    state.addLoad('areaLoad', {
      x1: spansX[0], y1: spansY[0], x2: spansX[2], y2: spansY[1],
      value: 1300, levelId, loadCase: 'LL',
    });
  }

  return state.toJSON();
}
