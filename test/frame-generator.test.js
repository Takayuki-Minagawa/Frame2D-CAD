import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGridFrame,
  MAX_GRID_FRAME_MEMBERS,
  parseMmList,
} from '../js/frame-generator.js';
import { buildAnalysisModel } from '../js/analysis-export.js';
import { AppState } from '../js/state.js';

function loadGridFrame(input) {
  const data = buildGridFrame(input);
  const state = new AppState();
  state.loadJSON(data);
  return { data, state };
}

test('parseMmList accepts comma, Japanese comma, whitespace, and decimal values', () => {
  assert.deepEqual(parseMmList('3500, 3000、2750.5\n2500'), {
    ok: true,
    values: [3500, 3000, 2750.5, 2500],
  });
  assert.deepEqual(parseMmList('  6000  \t 5000  '), {
    ok: true,
    values: [6000, 5000],
  });
  assert.deepEqual(parseMmList('6000,,、 5000'), {
    ok: true,
    values: [6000, 5000],
  });
});

test('parseMmList expands N@L repeat notation before enforcing the count limit', () => {
  assert.deepEqual(parseMmList('3@6000, 5000'), {
    ok: true,
    values: [6000, 6000, 6000, 5000],
  });
  assert.deepEqual(parseMmList('2@2750.5 1@3000'), {
    ok: true,
    values: [2750.5, 2750.5, 3000],
  });
  assert.deepEqual(parseMmList('2@1000,1000', { maxCount: 2 }), {
    ok: false,
    reason: 'count',
  });
  assert.deepEqual(parseMmList('3@1000', { maxCount: 2 }), {
    ok: false,
    reason: 'count',
  });
});

test('parseMmList rejects invalid repeat counts and malformed repeat tokens', () => {
  for (const value of [
    '0@6000',
    '-1@6000',
    '1.5@6000',
    '2@@6000',
    '2@6000@',
    '@6000',
    '2@',
    '9007199254740992@6000',
  ]) {
    assert.deepEqual(parseMmList(value), { ok: false, reason: 'invalid' }, value);
  }
  assert.deepEqual(parseMmList('2@0'), { ok: false, reason: 'range' });
  assert.deepEqual(parseMmList('101@6000'), { ok: false, reason: 'count' });
});

test('parseMmList classifies empty, invalid, range, and count errors', () => {
  assert.deepEqual(parseMmList('  , 、 \n '), { ok: false, reason: 'empty' });
  assert.deepEqual(parseMmList('3000, nope'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parseMmList('Infinity'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parseMmList(null), { ok: false, reason: 'invalid' });

  for (const value of ['-1', '0', '0.5', '100000.1']) {
    assert.deepEqual(parseMmList(value), { ok: false, reason: 'range' }, value);
  }
  assert.deepEqual(parseMmList('1'), { ok: true, values: [1] });
  assert.deepEqual(parseMmList('100000'), { ok: true, values: [100000] });

  assert.deepEqual(parseMmList('1000,1000,1000', { maxCount: 2 }), {
    ok: false,
    reason: 'count',
  });
  assert.equal(
    parseMmList(Array.from({ length: 101 }, () => '1000').join(',')).reason,
    'count'
  );
});

test('buildGridFrame creates the expected 3-story, 3-by-2-span model', () => {
  const { state } = loadGridFrame({
    storyHeights: [3500, 3000, 3000],
    spansX: [6000, 6000, 5000],
    spansY: [6000, 6000],
  });

  assert.equal(state.meta.name, 'grid_frame');
  assert.equal(state.meta.unit, 'mm');
  assert.deepEqual(
    [...state.levels].sort((a, b) => a.z - b.z).map(({ name, z }) => ({ name, z })),
    [
      { name: 'GL', z: 0 },
      { name: '2F', z: 3500 },
      { name: '3F', z: 6500 },
      { name: 'RF', z: 9500 },
    ]
  );
  assert.deepEqual(
    state.axes.filter(axis => axis.dir === 'x').map(({ name, coord }) => ({ name, coord })),
    [
      { name: 'X1', coord: 0 },
      { name: 'X2', coord: 6000 },
      { name: 'X3', coord: 12000 },
      { name: 'X4', coord: 17000 },
    ]
  );
  assert.deepEqual(
    state.axes.filter(axis => axis.dir === 'y').map(({ name, coord }) => ({ name, coord })),
    [
      { name: 'Y1', coord: 0 },
      { name: 'Y2', coord: 6000 },
      { name: 'Y3', coord: 12000 },
    ]
  );

  const columns = state.members.filter(member => member.type === 'column');
  const beams = state.members.filter(member => member.type === 'beam');
  assert.equal(state.levels.length, 4);
  assert.equal(state.axes.length, 7);
  assert.equal(columns.length, (3 + 1) * (2 + 1) * 3);
  assert.equal(beams.length, (3 * (2 + 1) + 2 * (3 + 1)) * 3);
  const beamsPerFloor = 3 * (2 + 1) + 2 * (3 + 1);
  const sortedLevels = [...state.levels].sort((a, b) => a.z - b.z);
  assert.equal(beams.filter(beam => beam.levelId === sortedLevels[0].id).length, 0);
  for (const level of sortedLevels.slice(1)) {
    assert.equal(
      beams.filter(beam => beam.levelId === level.id).length,
      beamsPerFloor,
      `${level.name}: expected beam count`
    );
  }
  assert.equal(state.supports.length, (3 + 1) * (2 + 1));
  assert.equal(state.nodes.length, columns.length, 'beam generation adds no duplicate nodes');
  assert.deepEqual(state.surfaces, []);
  assert.deepEqual(state.loads, []);
});

test('buildGridFrame creates and validates the minimum 1-story, 1-by-1-span model', () => {
  const { state } = loadGridFrame({
    storyHeights: [2800],
    spansX: [4000],
    spansY: [5000],
  });

  assert.deepEqual(state.levels.map(level => level.name), ['GL', 'RF']);
  assert.deepEqual(state.levels.map(level => level.z), [0, 2800]);
  assert.equal(state.members.filter(member => member.type === 'column').length, 4);
  assert.equal(state.members.filter(member => member.type === 'beam').length, 4);
  assert.equal(state.nodes.length, 4);
  assert.equal(state.supports.length, 4);
  assert.deepEqual(
    state.validateModel().filter(issue => issue.severity === 'error'),
    []
  );
});

test('generated member connectivity reuses column nodes and follows adjacent grid lines', () => {
  const { state } = loadGridFrame({
    storyHeights: [3500, 3000],
    spansX: [6000, 5000],
    spansY: [4500],
  });
  const nodeIds = new Set(state.nodes.map(node => node.id));
  const columns = state.members.filter(member => member.type === 'column');
  const beams = state.members.filter(member => member.type === 'beam');
  const columnNodeIds = new Set(columns.map(member => member.startNodeId));
  const levelById = new Map(state.levels.map(level => [level.id, level]));

  for (const member of state.members) {
    assert.ok(nodeIds.has(member.startNodeId), `${member.id}: start node exists`);
    assert.ok(nodeIds.has(member.endNodeId), `${member.id}: end node exists`);
  }
  for (const column of columns) {
    assert.equal(column.startNodeId, column.endNodeId);
    assert.ok(levelById.get(column.topLevelId).z > levelById.get(column.levelId).z);
  }
  for (const beam of beams) {
    assert.notEqual(beam.startNodeId, beam.endNodeId);
    assert.ok(columnNodeIds.has(beam.startNodeId), `${beam.id}: reuses start column node`);
    assert.ok(columnNodeIds.has(beam.endNodeId), `${beam.id}: reuses end column node`);
    const start = state.getNode(beam.startNodeId);
    const end = state.getNode(beam.endNodeId);
    const changesX = start.x !== end.x && start.y === end.y;
    const changesY = start.x === end.x && start.y !== end.y;
    assert.ok(changesX !== changesY, `${beam.id}: follows exactly one grid direction`);
  }

  const errors = state.validateModel().filter(issue => issue.severity === 'error');
  assert.deepEqual(errors, []);

  const analysis = buildAnalysisModel(state);
  const analysisNodeById = new Map(analysis.nodes.map(node => [node.id, node]));
  for (const element of analysis.elements.filter(item => item.type === 'beam')) {
    const expectedZ = levelById.get(element.levelId).z;
    assert.equal(analysisNodeById.get(element.nodeI).z, expectedZ, `${element.id}: node I z`);
    assert.equal(analysisNodeById.get(element.nodeJ).z, expectedZ, `${element.id}: node J z`);
  }
});

test('generated supports fix translation at every GL grid intersection', () => {
  const { state } = loadGridFrame({
    storyHeights: [3000, 3000],
    spansX: [4000, 5000],
    spansY: [6000],
  });
  const groundLevel = state.levels.find(level => level.name === 'GL');
  const expectedPoints = new Set([
    '0,0', '0,6000',
    '4000,0', '4000,6000',
    '9000,0', '9000,6000',
  ]);

  assert.equal(state.supports.length, expectedPoints.size);
  for (const support of state.supports) {
    assert.ok(expectedPoints.delete(`${support.x},${support.y}`));
    assert.equal(support.levelId, groundLevel.id);
    assert.equal(support.dx, true);
    assert.equal(support.dy, true);
    assert.equal(support.dz, true);
    assert.equal(support.rx, false);
    assert.equal(support.ry, false);
    assert.equal(support.rz, false);
  }
  assert.equal(expectedPoints.size, 0);
});

test('generated JSON survives an AppState load and serialize round trip', () => {
  const input = {
    storyHeights: [3200, 2800],
    spansX: [4500, 5500],
    spansY: [4000, 4000],
  };
  const data = buildGridFrame(input);
  const restored = new AppState();

  assert.doesNotThrow(() => restored.loadJSON(data));
  assert.deepEqual(restored.toJSON(), data);
  assert.deepEqual(
    restored.validateModel().filter(issue => issue.severity === 'error'),
    []
  );
});

test('buildGridFrame carries selected custom column and beam sections through serialization', () => {
  const source = new AppState();
  source.addSpring({ symbol: 'K-CUSTOM', memo: 'custom column-end spring' });
  source.addSection({
    target: 'member', type: 'column', name: 'C400',
    material: 'concrete', b: 400, h: 400, color: '#334455',
    defaultEndI: { condition: 'spring', springSymbol: 'K-CUSTOM' },
  });
  source.addSection({
    target: 'member', type: 'beam', name: 'B300x600',
    material: 'concrete', b: 300, h: 600, color: '#556677',
  });

  const data = buildGridFrame({
    storyHeights: [3200, 3000],
    spansX: [5000],
    spansY: [4000],
    columnSection: 'C400',
    beamSection: 'B300x600',
    sectionCatalog: source.sectionCatalog,
    springCatalog: source.springCatalog,
  });
  const restored = new AppState();
  restored.loadJSON(data);

  const columns = restored.members.filter(member => member.type === 'column');
  const beams = restored.members.filter(member => member.type === 'beam');
  assert.ok(columns.every(member => member.sectionName === 'C400'));
  assert.ok(columns.every(member => member.section.b === 400 && member.section.h === 400));
  assert.ok(columns.every(member => member.endI.condition === 'spring'));
  assert.ok(columns.every(member => member.endI.springSymbol === 'K-CUSTOM'));
  assert.ok(beams.every(member => member.sectionName === 'B300x600'));
  assert.ok(beams.every(member => member.section.b === 300 && member.section.h === 600));
  assert.equal(restored.getSection('member', 'column', 'C400')?.material, 'concrete');
  assert.equal(restored.getSection('member', 'beam', 'B300x600')?.color, '#556677');
  assert.equal(restored.getSpring('K-CUSTOM')?.memo, 'custom column-end spring');
  assert.deepEqual(restored.toJSON(), data);
});

test('buildGridFrame falls back to default sections for unknown requested names', () => {
  const source = new AppState();
  const { state } = loadGridFrame({
    storyHeights: [2800],
    spansX: [4000],
    spansY: [5000],
    columnSection: 'UNKNOWN_COLUMN',
    beamSection: 'UNKNOWN_BEAM',
    sectionCatalog: source.sectionCatalog,
  });

  assert.ok(
    state.members
      .filter(member => member.type === 'column')
      .every(member => member.sectionName === source.getDefaultSectionName('member', 'column'))
  );
  assert.ok(
    state.members
      .filter(member => member.type === 'beam')
      .every(member => member.sectionName === source.getDefaultSectionName('member', 'beam'))
  );
});

test('buildGridFrame optionally creates one floor surface per story and span bay', () => {
  const { state } = loadGridFrame({
    storyHeights: [3200, 2800],
    spansX: [4000, 5000],
    spansY: [3000, 3500],
    generateFloors: true,
  });
  const sortedLevels = [...state.levels].sort((a, b) => a.z - b.z);
  const expectedRects = new Set([
    '0,0,4000,3000',
    '0,3000,4000,6500',
    '4000,0,9000,3000',
    '4000,3000,9000,6500',
  ]);

  assert.equal(state.surfaces.length, 2 * 2 * 2);
  assert.equal(state.surfaces.some(surface => surface.levelId === sortedLevels[0].id), false);
  for (const level of sortedLevels.slice(1)) {
    const floors = state.surfaces.filter(surface => surface.levelId === level.id);
    assert.equal(floors.length, expectedRects.size);
    assert.deepEqual(
      new Set(floors.map(surface => `${surface.x1},${surface.y1},${surface.x2},${surface.y2}`)),
      expectedRects
    );
    assert.ok(floors.every(surface => surface.type === 'floor'));
    assert.ok(floors.every(surface => surface.shape === 'rect'));
    assert.ok(floors.every(surface => surface.topLevelId === level.id));
  }
  assert.deepEqual(
    state.validateModel().filter(issue => issue.severity === 'error'),
    []
  );
});

test('buildGridFrame revalidates input counts, values, and total member cap', () => {
  const valid = {
    storyHeights: [3000],
    spansX: [6000],
    spansY: [6000],
  };

  assert.throws(
    () => buildGridFrame({ ...valid, storyHeights: [] }),
    error => error instanceof TypeError && error.code === 'invalid-input'
  );
  assert.throws(
    () => buildGridFrame({ ...valid, storyHeights: ['3000'] }),
    error => error instanceof TypeError && error.code === 'invalid-input'
  );
  assert.throws(
    () => buildGridFrame({ ...valid, spansX: [0] }),
    error => error instanceof RangeError && error.code === 'value-range'
  );
  assert.throws(
    () => buildGridFrame({ ...valid, storyHeights: Array(51).fill(3000) }),
    error => error instanceof RangeError && error.code === 'value-count' && error.field === 'storyHeights'
  );
  assert.throws(
    () => buildGridFrame({ ...valid, spansY: Array(101).fill(6000) }),
    error => error instanceof RangeError && error.code === 'value-count' && error.field === 'spansY'
  );

  const oversized = {
    storyHeights: Array(50).fill(3000),
    spansX: Array(12).fill(6000),
    spansY: Array(12).fill(6000),
  };
  const projectedMembers = 50 * ((13 * 13) + (12 * 13) + (12 * 13));
  assert.ok(projectedMembers > MAX_GRID_FRAME_MEMBERS);
  assert.throws(
    () => buildGridFrame(oversized),
    error => error instanceof RangeError &&
      error.reason === 'count' &&
      error.code === 'member-count' &&
      error.count === projectedMembers &&
      error.max === MAX_GRID_FRAME_MEMBERS
  );
});

test('buildGridFrame applies the element cap to members and generated floors together', () => {
  const input = {
    storyHeights: Array(40).fill(3000),
    spansX: Array(12).fill(6000),
    spansY: Array(12).fill(6000),
  };
  const columnCount = 40 * 13 * 13;
  const beamCount = 40 * ((12 * 13) + (12 * 13));
  const memberCount = columnCount + beamCount;
  const floorCount = 40 * 12 * 12;
  const elementCount = memberCount + floorCount;

  assert.ok(memberCount <= MAX_GRID_FRAME_MEMBERS);
  assert.ok(elementCount > MAX_GRID_FRAME_MEMBERS);
  assert.doesNotThrow(() => buildGridFrame(input));
  assert.throws(
    () => buildGridFrame({ ...input, generateFloors: true }),
    error => error instanceof RangeError &&
      error.reason === 'count' &&
      error.code === 'member-count' &&
      error.count === elementCount &&
      error.max === MAX_GRID_FRAME_MEMBERS &&
      assert.deepEqual(error.counts, {
        columns: columnCount,
        beams: beamCount,
        floors: floorCount,
        walls: 0,
        members: memberCount,
        elements: elementCount,
      }) === undefined
  );
});

test('buildGridFrame accepts a generated model exactly at the element cap', () => {
  const storyCount = 32;
  const xSpanCount = 12;
  const ySpanCount = 12;
  const input = {
    storyHeights: Array(storyCount).fill(3000),
    spansX: Array(xSpanCount).fill(6000),
    spansY: Array(ySpanCount).fill(6000),
    generateFloors: true,
  };
  const memberCount = storyCount * (
    (xSpanCount + 1) * (ySpanCount + 1) +
    xSpanCount * (ySpanCount + 1) +
    ySpanCount * (xSpanCount + 1)
  );
  const floorCount = storyCount * xSpanCount * ySpanCount;

  assert.equal(memberCount + floorCount, MAX_GRID_FRAME_MEMBERS);
  const data = buildGridFrame(input);
  assert.equal(data.members.length, memberCount);
  assert.equal(data.surfaces.length, floorCount);
});

test('buildGridFrame applies per-story sections to columns, beams, and floors', () => {
  const source = new AppState();
  source.addSection({ target: 'member', type: 'column', name: 'C1', b: 400, h: 400 });
  source.addSection({ target: 'member', type: 'column', name: 'C2', b: 500, h: 500 });
  source.addSection({ target: 'member', type: 'beam', name: 'G1', b: 300, h: 600 });
  source.addSection({ target: 'member', type: 'beam', name: 'G2', b: 350, h: 700 });
  source.addSection({ target: 'surface', type: 'floor', name: 'S1' });
  source.addSection({ target: 'surface', type: 'floor', name: 'S2' });

  const { state } = loadGridFrame({
    stories: [
      { height: 3500, columnSection: 'C1', beamSection: 'G1', floorSection: 'S1' },
      { height: 3000, columnSection: 'C2', beamSection: 'G2', floorSection: 'S2' },
    ],
    spansX: [6000],
    spansY: [5000],
    generate: { columns: true, beams: true, floors: true },
    sectionCatalog: source.sectionCatalog,
  });

  const sortedLevels = [...state.levels].sort((a, b) => a.z - b.z);
  const columnSectionByLevel = new Map(
    state.members
      .filter(member => member.type === 'column')
      .map(member => [member.levelId, member.sectionName])
  );
  assert.equal(columnSectionByLevel.get(sortedLevels[0].id), 'C1');
  assert.equal(columnSectionByLevel.get(sortedLevels[1].id), 'C2');
  const beamSectionByLevel = new Map(
    state.members
      .filter(member => member.type === 'beam')
      .map(member => [member.levelId, member.sectionName])
  );
  assert.equal(beamSectionByLevel.get(sortedLevels[1].id), 'G1');
  assert.equal(beamSectionByLevel.get(sortedLevels[2].id), 'G2');
  const floorSectionByLevel = new Map(
    state.surfaces
      .filter(surface => surface.type === 'floor')
      .map(surface => [surface.levelId, surface.sectionName])
  );
  assert.equal(floorSectionByLevel.get(sortedLevels[1].id), 'S1');
  assert.equal(floorSectionByLevel.get(sortedLevels[2].id), 'S2');
  assert.deepEqual(
    state.validateModel().filter(issue => issue.severity === 'error'),
    []
  );
});

test('buildGridFrame skips columns or beams when their generate flag is off', () => {
  const input = {
    stories: [{ height: 3000 }, { height: 3000 }],
    spansX: [4000, 5000],
    spansY: [6000],
  };

  const withoutColumns = loadGridFrame({
    ...input,
    generate: { columns: false, beams: true },
  }).state;
  assert.equal(withoutColumns.members.filter(member => member.type === 'column').length, 0);
  assert.equal(
    withoutColumns.members.filter(member => member.type === 'beam').length,
    (2 * 2 + 1 * 3) * 2
  );
  assert.equal(withoutColumns.supports.length, 0);

  const withoutBeams = loadGridFrame({
    ...input,
    generate: { columns: true, beams: false },
  }).state;
  assert.equal(withoutBeams.members.filter(member => member.type === 'beam').length, 0);
  assert.equal(
    withoutBeams.members.filter(member => member.type === 'column').length,
    3 * 2 * 2
  );
  assert.equal(withoutBeams.supports.length, 3 * 2);

  assert.throws(
    () => buildGridFrame({ ...input, generate: { columns: false, beams: false } }),
    error => error instanceof TypeError && error.code === 'no-members'
  );
});

test('buildGridFrame optionally creates one perimeter exterior wall per story', () => {
  const source = new AppState();
  source.addSection({ target: 'surface', type: 'exteriorWall', name: 'OW1' });

  const { state } = loadGridFrame({
    stories: [
      { height: 3500, wallSection: 'OW1' },
      { height: 3000, wallSection: 'OW1' },
    ],
    spansX: [6000, 5000],
    spansY: [4000],
    generate: { columns: true, beams: true, exteriorWalls: true },
    sectionCatalog: source.sectionCatalog,
  });

  const sortedLevels = [...state.levels].sort((a, b) => a.z - b.z);
  const walls = state.surfaces.filter(surface => surface.type === 'exteriorWall');
  assert.equal(walls.length, 2);
  for (const [storyIndex, wall] of walls.entries()) {
    assert.equal(wall.shape, 'polygon');
    assert.equal(wall.levelId, sortedLevels[storyIndex].id);
    assert.equal(wall.topLevelId, sortedLevels[storyIndex + 1].id);
    assert.equal(wall.sectionName, 'OW1');
    assert.equal(wall.includeWind, true);
    assert.deepEqual(wall.points, [
      { x: 0, y: 0 },
      { x: 11000, y: 0 },
      { x: 11000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
  }
  assert.deepEqual(
    state.validateModel().filter(issue => issue.severity === 'error'),
    []
  );
});

test('buildGridFrame counts exterior walls against the element cap', () => {
  const storyCount = 32;
  const spans = Array(12).fill(6000);
  const input = {
    storyHeights: Array(storyCount).fill(3000),
    spansX: spans,
    spansY: spans,
    generate: { columns: true, beams: true, floors: true, exteriorWalls: true },
  };
  const memberCount = storyCount * (13 * 13 + 12 * 13 + 12 * 13);
  const floorCount = storyCount * 12 * 12;

  assert.equal(memberCount + floorCount, MAX_GRID_FRAME_MEMBERS);
  assert.throws(
    () => buildGridFrame(input),
    error => error instanceof RangeError &&
      error.code === 'member-count' &&
      error.count === MAX_GRID_FRAME_MEMBERS + storyCount &&
      error.counts.walls === storyCount
  );
});

test('buildGridFrame validates the stories array like the legacy height list', () => {
  const valid = { spansX: [6000], spansY: [6000] };

  assert.throws(
    () => buildGridFrame({ ...valid, stories: [] }),
    error => error instanceof TypeError && error.code === 'invalid-input' && error.field === 'stories'
  );
  assert.throws(
    () => buildGridFrame({ ...valid, stories: [{ height: '3000' }] }),
    error => error instanceof TypeError && error.code === 'invalid-input' && error.field === 'stories'
  );
  assert.throws(
    () => buildGridFrame({ ...valid, stories: [{ height: 0 }] }),
    error => error instanceof RangeError && error.code === 'value-range' && error.field === 'stories'
  );
  assert.throws(
    () => buildGridFrame({ ...valid, stories: Array.from({ length: 51 }, () => ({ height: 3000 })) }),
    error => error instanceof RangeError && error.code === 'value-count' && error.field === 'stories'
  );

  const data = buildGridFrame({
    ...valid,
    stories: [{ height: 2800, columnSection: 123, beamSection: '' }],
  });
  const restored = new AppState();
  restored.loadJSON(data);
  const defaults = new AppState();
  assert.ok(
    restored.members
      .filter(member => member.type === 'column')
      .every(member => member.sectionName === defaults.getDefaultSectionName('member', 'column'))
  );
});
