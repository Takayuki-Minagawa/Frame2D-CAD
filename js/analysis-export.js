// analysis-export.js - Builds a solver-neutral analysis model from the CAD
// state: shared 3D nodes, element connectivity, sections, member end
// conditions, supports, loads (grouped by load case) and load combinations.
// Everything is exported in a consistent mm-N base system: length mm,
// force N, line load N/mm, area load N/mm2, moment N*mm. UI-entered load
// values (N/m, N/m², N·m) are converted here.

import { LOAD_CASES } from './constants.js';
import { normalizeLoadCase } from './state.js';

export const ANALYSIS_FORMAT = 'element-modeler-analysis';
export const ANALYSIS_FORMAT_VERSION = 1;

// Endpoints closer than this merge into one analysis node. CAD input is
// mm-scale, so anything closer is the same physical point.
export const NODE_MERGE_TOLERANCE = 0.1;

// Node pool that merges points by real Euclidean distance. A spatial hash
// with cell size = tolerance keeps lookups O(1); a point within tolerance of
// an existing node is at most one cell away in each axis, so scanning the
// 3x3x3 neighborhood is sufficient.
function createNodePool(tolerance) {
  const nodes = [];
  const cells = new Map();
  const cellIndex = v => Math.round(v / tolerance);
  // Distances exactly at the tolerance must merge; floating-point subtraction
  // can overshoot by a few ULP (e.g. 0.4 - 0.3 > 0.1), and at km-scale
  // coordinates the ULP itself approaches 1e-10 mm. An epsilon of 1e-6 x
  // tolerance absorbs both while staying far below any real gap.
  const mergeDistance = tolerance * (1 + 1e-6);
  // Rounded cell indices of two points one tolerance apart can differ by 2
  // (e.g. 0.15 -> cell 1 but 0.25 -> cell 3), so the neighborhood scan must
  // cover +-2 cells per axis, not just the adjacent ones.
  const CELL_RANGE = 2;

  return {
    nodes,
    idFor(x, y, z) {
      const cx = cellIndex(x);
      const cy = cellIndex(y);
      const cz = cellIndex(z);
      for (let dx = -CELL_RANGE; dx <= CELL_RANGE; dx++) {
        for (let dy = -CELL_RANGE; dy <= CELL_RANGE; dy++) {
          for (let dz = -CELL_RANGE; dz <= CELL_RANGE; dz++) {
            const bucket = cells.get(`${cx + dx}|${cy + dy}|${cz + dz}`);
            if (!bucket) continue;
            for (const node of bucket) {
              if (Math.hypot(node.x - x, node.y - y, node.z - z) <= mergeDistance) {
                return node.id;
              }
            }
          }
        }
      }
      const node = { id: nodes.length + 1, x, y, z };
      nodes.push(node);
      const key = `${cx}|${cy}|${cz}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(node);
      return node.id;
    },
  };
}

function memberEndZ(state, member, which) {
  if (member.type === 'column' || member.type === 'vbrace') {
    return which === 'start'
      ? state.getLevelZ(member.levelId)
      : state.getLevelZ(member.topLevelId || member.levelId);
  }
  if (member.geometryMode === 'explicit3d') {
    const value = Number(which === 'start' ? member.startZ : member.endZ);
    if (Number.isFinite(value)) return value;
  }
  return state.getLevelZ(member.levelId);
}

function cloneEnd(end) {
  return {
    condition: end?.condition || 'pin',
    springSymbol: end?.condition === 'spring' ? (end.springSymbol || null) : null,
  };
}

// Converts one CAD load to the mm-N base system:
// lineLoad N/m -> N/mm, areaLoad N/m² -> N/mm², moments N·m -> N·mm.
function convertLoad(state, load) {
  const out = {
    ...load,
    loadCase: normalizeLoadCase(load.loadCase),
    z: state.getLevelZ(load.levelId),
  };
  if (load.type === 'lineLoad') {
    out.value = (Number(load.value) || 0) / 1000;
  } else if (load.type === 'areaLoad') {
    out.value = (Number(load.value) || 0) / 1e6;
  } else if (load.type === 'pointLoad') {
    out.mx = (Number(load.mx) || 0) * 1000;
    out.my = (Number(load.my) || 0) * 1000;
    out.mz = (Number(load.mz) || 0) * 1000;
  }
  return out;
}

export function buildAnalysisModel(state) {
  const pool = createNodePool(NODE_MERGE_TOLERANCE);

  const elements = [];
  const pushElement = (member, id, nodeI, nodeJ, { swapEnds = false } = {}) => {
    if (nodeI === nodeJ) return; // zero-length after 3D resolution
    elements.push({
      id,
      type: member.type,
      nodeI,
      nodeJ,
      sectionName: member.sectionName || null,
      material: member.material || 'steel',
      b: member.section?.b ?? null,
      h: member.section?.h ?? null,
      endI: cloneEnd(swapEnds ? member.endJ : member.endI),
      endJ: cloneEnd(swapEnds ? member.endI : member.endJ),
      levelId: member.levelId,
      roofRole: member.roofRole || null,
      bracePattern: member.type === 'vbrace' ? (member.bracePattern || 'single') : null,
    });
  };

  for (const member of state.members) {
    const n1 = state.getNode(member.startNodeId);
    const n2 = state.getNode(member.endNodeId);
    if (!n1 || !n2) continue;
    const startZ = memberEndZ(state, member, 'start');
    const endZ = memberEndZ(state, member, 'end');
    pushElement(member, member.id,
      pool.idFor(n1.x, n1.y, startZ),
      pool.idFor(n2.x, n2.y, endZ));
    // A cross (X) brace is one CAD member but two analysis diagonals: the
    // second one mirrors the plan endpoints between the same two levels, so
    // its end conditions swap with the endpoints (end I sits on plan point 2).
    if (member.type === 'vbrace' && member.bracePattern === 'cross') {
      pushElement(member, `${member.id}X`,
        pool.idFor(n2.x, n2.y, startZ),
        pool.idFor(n1.x, n1.y, endZ),
        { swapEnds: true });
    }
  }

  const supports = state.supports.map(sup => ({
    id: sup.id,
    nodeId: pool.idFor(sup.x, sup.y, state.getLevelZ(sup.levelId)),
    dx: !!sup.dx,
    dy: !!sup.dy,
    dz: !!sup.dz,
    rx: !!sup.rx,
    ry: !!sup.ry,
    rz: !!sup.rz,
  }));

  const loads = state.loads.map(load => convertLoad(state, load));

  const usedSectionNames = new Set(elements.map(e => e.sectionName).filter(Boolean));
  const sections = state.sectionCatalog
    .filter(s => s.target === 'member' && usedSectionNames.has(s.name))
    .map(s => ({
      name: s.name,
      type: s.type,
      material: s.material || 'steel',
      b: s.b,
      h: s.h,
    }));

  const usedSpringSymbols = new Set();
  for (const e of elements) {
    if (e.endI.springSymbol) usedSpringSymbols.add(e.endI.springSymbol);
    if (e.endJ.springSymbol) usedSpringSymbols.add(e.endJ.springSymbol);
  }
  const springs = state.springCatalog
    .filter(s => usedSpringSymbols.has(s.symbol))
    .map(s => ({ symbol: s.symbol, memo: s.memo || '' }));

  return {
    format: ANALYSIS_FORMAT,
    version: ANALYSIS_FORMAT_VERSION,
    units: {
      length: 'mm',
      force: 'N',
      lineLoad: 'N/mm',
      areaLoad: 'N/mm2',
      moment: 'N*mm',
    },
    meta: { name: state.meta?.name || 'untitled' },
    levels: state.levels.map(l => ({ id: l.id, name: l.name, z: l.z })),
    nodes: pool.nodes,
    elements,
    sections,
    springs,
    supports,
    loadCases: LOAD_CASES.slice(),
    loads,
    loadCombinations: state.loadCombinations.map(c => ({
      id: c.id,
      name: c.name,
      factors: { ...c.factors },
    })),
  };
}

function endText(end) {
  if (end.condition === 'spring') return `spring:${end.springSymbol || ''}`;
  return end.condition;
}

function loadUnitText(type) {
  if (type === 'lineLoad') return 'N/mm';
  if (type === 'areaLoad') return 'N/mm2';
  return 'N;N*mm';
}

const CSV_COLUMNS = 12;

// Flat CSV rendering of the analysis model (one `section` marker column, same
// convention as the quantity CSVs). Values use the same mm-N base system as
// the JSON model.
export function buildAnalysisCSV(state) {
  const model = buildAnalysisModel(state);
  const rows = [];
  const push = (...cells) => {
    while (cells.length < CSV_COLUMNS) cells.push('');
    rows.push(cells);
  };

  push('section', 'id', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j');
  push('node_header', 'id', 'x_mm', 'y_mm', 'z_mm');
  for (const n of model.nodes) {
    push('node', String(n.id), String(n.x), String(n.y), String(n.z));
  }
  push('element_header', 'id', 'type', 'node_i', 'node_j', 'section', 'material',
    'b_mm', 'h_mm', 'end_i', 'end_j', 'roof_role');
  for (const e of model.elements) {
    push('element', e.id, e.type, String(e.nodeI), String(e.nodeJ),
      e.sectionName || '', e.material,
      e.b === null ? '' : String(e.b), e.h === null ? '' : String(e.h),
      endText(e.endI), endText(e.endJ), e.roofRole || '');
  }
  push('sect_header', 'name', 'type', 'material', 'b_mm', 'h_mm');
  for (const s of model.sections) {
    push('sect', s.name, s.type, s.material, String(s.b ?? ''), String(s.h ?? ''));
  }
  push('spring_header', 'symbol', 'memo');
  for (const s of model.springs) {
    push('spring', s.symbol, s.memo);
  }
  push('support_header', 'id', 'node', 'dx', 'dy', 'dz', 'rx', 'ry', 'rz');
  for (const s of model.supports) {
    push('support', s.id, String(s.nodeId),
      s.dx ? '1' : '0', s.dy ? '1' : '0', s.dz ? '1' : '0',
      s.rx ? '1' : '0', s.ry ? '1' : '0', s.rz ? '1' : '0');
  }
  push('load_header', 'id', 'type', 'case', 'unit', 'x1', 'y1', 'x2', 'y2', 'value', 'z_mm');
  for (const l of model.loads) {
    const value = l.type === 'pointLoad'
      ? `fx=${l.fx || 0};fy=${l.fy || 0};fz=${l.fz || 0};mx=${l.mx || 0};my=${l.my || 0};mz=${l.mz || 0}`
      : String(l.value ?? 0);
    push('load', l.id, l.type, l.loadCase, loadUnitText(l.type),
      String(l.x1 ?? ''), String(l.y1 ?? ''), String(l.x2 ?? ''), String(l.y2 ?? ''),
      value, String(l.z));
  }
  push('combo_header', 'id', 'name', 'factors');
  for (const c of model.loadCombinations) {
    const factors = Object.entries(c.factors).map(([k, v]) => `${k}=${v}`).join(';');
    push('combo', c.id, c.name, factors);
  }
  return `${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}
