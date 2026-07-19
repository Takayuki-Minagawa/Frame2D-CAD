// frame-generator.js - DOM-independent grid-frame model generation.

import { AppState } from './state.js';
import { hydrateSectionCatalog, hydrateSpringCatalog } from './section-catalog.js';

export const MIN_GRID_DIMENSION_MM = 1;
export const MAX_GRID_DIMENSION_MM = 100_000;
export const MAX_STORY_COUNT = 50;
export const MAX_SPAN_COUNT = 100;
// Kept under its historical public name for API compatibility. The guard now
// covers every generated model element (members plus optional floor surfaces).
export const MAX_GRID_FRAME_MEMBERS = 20_000;

/**
 * Parses a list of millimetre dimensions separated by commas, Japanese
 * commas, or whitespace. A token such as `3@6000` repeats 6000 three times.
 *
 * @returns {{ ok: true, values: number[] } | { ok: false, reason: string }}
 */
export function parseMmList(text, { maxCount = MAX_SPAN_COUNT } = {}) {
  if (typeof text !== 'string') return { ok: false, reason: 'invalid' };

  const tokens = text.trim().split(/[,、\s]+/u).filter(Boolean);
  if (tokens.length === 0) return { ok: false, reason: 'empty' };
  if (tokens.length > maxCount) return { ok: false, reason: 'count' };

  const values = [];
  for (const token of tokens) {
    const repeat = token.match(/^(\d+)@(.+)$/u);
    let repeatCount = 1;
    let rawValue = token;
    if (repeat) {
      repeatCount = Number(repeat[1]);
      rawValue = repeat[2];
      if (!Number.isSafeInteger(repeatCount) || repeatCount < 1) {
        return { ok: false, reason: 'invalid' };
      }
    } else if (token.includes('@')) {
      return { ok: false, reason: 'invalid' };
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
    if (value < MIN_GRID_DIMENSION_MM || value > MAX_GRID_DIMENSION_MM) {
      return { ok: false, reason: 'range' };
    }
    if (repeatCount > maxCount - values.length) {
      return { ok: false, reason: 'count' };
    }
    for (let index = 0; index < repeatCount; index++) values.push(value);
  }

  return { ok: true, values };
}

/**
 * Builds a fresh grid-frame model and returns its serialized JSON data.
 * Input dimensions are millimetres.
 */
export function buildGridFrame({
  storyHeights,
  spansX,
  spansY,
  columnSection,
  beamSection,
  sectionCatalog,
  springCatalog,
  generateFloors = false,
} = {}) {
  const heights = validateMmValues(storyHeights, 'storyHeights', MAX_STORY_COUNT);
  const xSpans = validateMmValues(spansX, 'spansX', MAX_SPAN_COUNT);
  const ySpans = validateMmValues(spansY, 'spansY', MAX_SPAN_COUNT);

  const storyCount = heights.length;
  const xGridCount = xSpans.length + 1;
  const yGridCount = ySpans.length + 1;
  const columnCount = xGridCount * yGridCount * storyCount;
  const beamCount = (
    xSpans.length * yGridCount +
    ySpans.length * xGridCount
  ) * storyCount;
  const memberCount = columnCount + beamCount;
  const floorCount = generateFloors
    ? xSpans.length * ySpans.length * storyCount
    : 0;
  const elementCount = memberCount + floorCount;

  if (elementCount > MAX_GRID_FRAME_MEMBERS) {
    throw validationError(
      RangeError,
      `Grid frame element count ${elementCount} exceeds the limit of ${MAX_GRID_FRAME_MEMBERS}.`,
      {
        reason: 'count',
        // Retain the existing code so current UI/error handling remains
        // compatible even though optional surfaces now join the count.
        code: 'member-count',
        count: elementCount,
        max: MAX_GRID_FRAME_MEMBERS,
        counts: {
          columns: columnCount,
          beams: beamCount,
          floors: floorCount,
          members: memberCount,
          elements: elementCount,
        },
      }
    );
  }

  const xCoords = cumulativeCoordinates(xSpans);
  const yCoords = cumulativeCoordinates(ySpans);
  const state = new AppState();
  if (sectionCatalog !== undefined) {
    state.sectionCatalog = hydrateSectionCatalog(sectionCatalog);
  }
  if (springCatalog !== undefined) {
    state.springCatalog = hydrateSpringCatalog(springCatalog);
  }
  state.meta.name = 'grid_frame';
  state.meta.unit = 'mm';

  const levels = configureLevels(state, heights);
  const groundLevel = levels[0];
  const planNodes = new Map();

  xCoords.forEach((coord, index) => state.addAxis('x', `X${index + 1}`, coord));
  yCoords.forEach((coord, index) => state.addAxis('y', `Y${index + 1}`, coord));

  // A node stores plan coordinates; member level metadata supplies elevation.
  // Keep one column node per grid point and story, matching the existing sample
  // model convention. Beams below reuse one of those nodes via findNodeAt().
  for (let storyIndex = 0; storyIndex < storyCount; storyIndex++) {
    const bottomLevel = levels[storyIndex];
    const topLevel = levels[storyIndex + 1];
    for (const x of xCoords) {
      for (const y of yCoords) {
        const node = state.addNode(x, y);
        if (storyIndex === 0) planNodes.set(planNodeKey(x, y), node);
        state.addMember(node.id, node.id, {
          type: 'column',
          levelId: bottomLevel.id,
          topLevelId: topLevel.id,
          sectionName: columnSection,
        });
        if (storyIndex === 0) {
          state.addSupport(x, y, {
            levelId: groundLevel.id,
            dx: true,
            dy: true,
            dz: true,
          });
        }
      }
    }
  }

  const addBeam = (levelId, x1, y1, x2, y2) => {
    let startNode = planNodes.get(planNodeKey(x1, y1)) || state.findNodeAt(x1, y1, 1);
    if (!startNode) startNode = state.addNode(x1, y1);
    let endNode = planNodes.get(planNodeKey(x2, y2)) || state.findNodeAt(x2, y2, 1);
    if (!endNode) endNode = state.addNode(x2, y2);
    state.addMember(startNode.id, endNode.id, {
      type: 'beam',
      levelId,
      sectionName: beamSection,
    });
  };

  // Generate beams at every floor above GL, in both grid directions.
  for (let levelIndex = 1; levelIndex < levels.length; levelIndex++) {
    const levelId = levels[levelIndex].id;
    for (const y of yCoords) {
      for (let xIndex = 0; xIndex < xCoords.length - 1; xIndex++) {
        addBeam(levelId, xCoords[xIndex], y, xCoords[xIndex + 1], y);
      }
    }
    for (const x of xCoords) {
      for (let yIndex = 0; yIndex < yCoords.length - 1; yIndex++) {
        addBeam(levelId, x, yCoords[yIndex], x, yCoords[yIndex + 1]);
      }
    }
    if (generateFloors) {
      for (let xIndex = 0; xIndex < xCoords.length - 1; xIndex++) {
        for (let yIndex = 0; yIndex < yCoords.length - 1; yIndex++) {
          state.addSurfaceRect(
            xCoords[xIndex],
            yCoords[yIndex],
            xCoords[xIndex + 1],
            yCoords[yIndex + 1],
            { type: 'floor', levelId, topLevelId: levelId }
          );
        }
      }
    }
  }

  return state.toJSON();
}

function validateMmValues(values, field, maxCount) {
  if (!Array.isArray(values) || values.length === 0) {
    throw validationError(TypeError, `${field} must be a non-empty array.`, {
      reason: 'invalid',
      code: 'invalid-input',
      field,
    });
  }
  if (values.length > maxCount) {
    throw validationError(RangeError, `${field} must contain at most ${maxCount} values.`, {
      reason: 'count',
      code: 'value-count',
      field,
    });
  }

  return values.map((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw validationError(TypeError, `${field} must contain only finite numbers.`, {
        reason: 'invalid',
        code: 'invalid-input',
        field,
      });
    }
    if (value < MIN_GRID_DIMENSION_MM || value > MAX_GRID_DIMENSION_MM) {
      throw validationError(
        RangeError,
        `${field} values must be between ${MIN_GRID_DIMENSION_MM} and ${MAX_GRID_DIMENSION_MM} mm.`,
        { reason: 'range', code: 'value-range', field }
      );
    }
    return value;
  });
}

function cumulativeCoordinates(spans) {
  const coordinates = [0];
  for (const span of spans) {
    coordinates.push(coordinates[coordinates.length - 1] + span);
  }
  return coordinates;
}

function planNodeKey(x, y) {
  return `${x}:${y}`;
}

function configureLevels(state, storyHeights) {
  const [groundLevel, defaultUpperLevel] = [...state.levels].sort((a, b) => a.z - b.z);
  const levels = [groundLevel, defaultUpperLevel];

  state.updateLevel(groundLevel.id, { name: 'GL', z: 0 });
  state.updateLevel(defaultUpperLevel.id, {
    name: storyHeights.length === 1 ? 'RF' : '2F',
    z: storyHeights[0],
  });

  let elevation = storyHeights[0];
  for (let storyIndex = 1; storyIndex < storyHeights.length; storyIndex++) {
    elevation += storyHeights[storyIndex];
    const isRoof = storyIndex === storyHeights.length - 1;
    levels.push(state.addLevel(isRoof ? 'RF' : `${storyIndex + 2}F`, elevation));
  }

  return levels;
}

function validationError(ErrorType, message, details) {
  return Object.assign(new ErrorType(message), details);
}
