// analysis-export.js - Builds a solver-neutral analysis model from the CAD
// state: shared 3D nodes, element connectivity, sections, member end
// conditions, supports, loads (grouped by load case) and load combinations.
// Units follow the CAD model: length mm, force N.

import { LOAD_CASES } from './constants.js';
import { normalizeLoadCase } from './state.js';

export const ANALYSIS_FORMAT = 'element-modeler-analysis';
export const ANALYSIS_FORMAT_VERSION = 1;

// Coordinates are merged on a 0.1mm grid: CAD input is mm-scale, so anything
// closer is the same physical point.
function nodeKey(x, y, z) {
  const r = v => Math.round(v * 10) / 10;
  return `${r(x)}|${r(y)}|${r(z)}`;
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

export function buildAnalysisModel(state) {
  const nodes = [];
  const nodeIds = new Map();
  const nodeIdFor = (x, y, z) => {
    const key = nodeKey(x, y, z);
    let id = nodeIds.get(key);
    if (!id) {
      id = nodes.length + 1;
      nodeIds.set(key, id);
      nodes.push({ id, x, y, z });
    }
    return id;
  };

  const elements = [];
  for (const member of state.members) {
    const n1 = state.getNode(member.startNodeId);
    const n2 = state.getNode(member.endNodeId);
    if (!n1 || !n2) continue;
    const startZ = memberEndZ(state, member, 'start');
    const endZ = memberEndZ(state, member, 'end');
    const nodeI = nodeIdFor(n1.x, n1.y, startZ);
    const nodeJ = nodeIdFor(n2.x, n2.y, endZ);
    if (nodeI === nodeJ) continue; // zero-length after 3D resolution
    elements.push({
      id: member.id,
      type: member.type,
      nodeI,
      nodeJ,
      sectionName: member.sectionName || null,
      material: member.material || 'steel',
      b: member.section?.b ?? null,
      h: member.section?.h ?? null,
      endI: cloneEnd(member.endI),
      endJ: cloneEnd(member.endJ),
      levelId: member.levelId,
      roofRole: member.roofRole || null,
    });
  }

  const supports = state.supports.map(sup => ({
    id: sup.id,
    nodeId: nodeIdFor(sup.x, sup.y, state.getLevelZ(sup.levelId)),
    dx: !!sup.dx,
    dy: !!sup.dy,
    dz: !!sup.dz,
    rx: !!sup.rx,
    ry: !!sup.ry,
    rz: !!sup.rz,
  }));

  const loads = state.loads.map(load => ({
    ...load,
    loadCase: normalizeLoadCase(load.loadCase),
    z: state.getLevelZ(load.levelId),
  }));

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
    units: { length: 'mm', force: 'N' },
    meta: { name: state.meta?.name || 'untitled' },
    levels: state.levels.map(l => ({ id: l.id, name: l.name, z: l.z })),
    nodes,
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

// Flat CSV rendering of the analysis model (one `section` marker column, same
// convention as the quantity CSVs).
export function buildAnalysisCSV(state) {
  const model = buildAnalysisModel(state);
  const rows = [['section', 'id', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']];
  rows.push(['node_header', 'id', 'x_mm', 'y_mm', 'z_mm', '', '', '', '', '']);
  for (const n of model.nodes) {
    rows.push(['node', String(n.id), String(n.x), String(n.y), String(n.z), '', '', '', '', '']);
  }
  rows.push(['element_header', 'id', 'type', 'node_i', 'node_j', 'section', 'material', 'end_i', 'end_j', 'roof_role']);
  for (const e of model.elements) {
    rows.push([
      'element', e.id, e.type, String(e.nodeI), String(e.nodeJ),
      e.sectionName || '', e.material, endText(e.endI), endText(e.endJ), e.roofRole || '',
    ]);
  }
  rows.push(['support_header', 'id', 'node', 'dx', 'dy', 'dz', 'rx', 'ry', 'rz', '']);
  for (const s of model.supports) {
    rows.push([
      'support', s.id, String(s.nodeId),
      s.dx ? '1' : '0', s.dy ? '1' : '0', s.dz ? '1' : '0',
      s.rx ? '1' : '0', s.ry ? '1' : '0', s.rz ? '1' : '0', '',
    ]);
  }
  rows.push(['load_header', 'id', 'type', 'case', 'x1', 'y1', 'x2', 'y2', 'value', 'z_mm']);
  for (const l of model.loads) {
    const value = l.type === 'pointLoad'
      ? `fx=${l.fx || 0};fy=${l.fy || 0};fz=${l.fz || 0};mx=${l.mx || 0};my=${l.my || 0};mz=${l.mz || 0}`
      : String(l.value ?? 0);
    rows.push([
      'load', l.id, l.type, l.loadCase,
      String(l.x1 ?? ''), String(l.y1 ?? ''), String(l.x2 ?? ''), String(l.y2 ?? ''),
      value, String(l.z),
    ]);
  }
  rows.push(['combo_header', 'id', 'name', 'factors', '', '', '', '', '', '']);
  for (const c of model.loadCombinations) {
    const factors = Object.entries(c.factors).map(([k, v]) => `${k}=${v}`).join(';');
    rows.push(['combo', c.id, c.name, factors, '', '', '', '', '', '']);
  }
  return `${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}
