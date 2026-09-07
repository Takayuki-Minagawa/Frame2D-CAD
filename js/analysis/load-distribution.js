// Pure preview math in analysis-v2 units (mm, N); never mutates CAD/AppState.
const EPS = 1e-7;
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
function number(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name}: finite number required`);
  return v;
}
function vector(v, name) {
  if (!Array.isArray(v) || v.length !== 3) throw new Error(`${name}: three components required`);
  return v.map(x => number(x, name));
}
function position(n) { return ['x', 'y', 'z'].map(k => number(n[k], `node.${k}`)); }
function member(model, id) {
  if (model.format !== 'element-modeler-analysis' || model.version !== 2 || model.units?.length !== 'mm' ||
      model.units?.force !== 'N' || model.units?.lineLoad !== 'N/mm' || model.units?.areaLoad !== 'N/mm2') {
    throw new Error('Expected analysis v2 in mm/N units');
  }
  const found = model.elements.filter(e => e.id === id);
  if (found.length !== 1) throw new Error(`Expected one target member ${id}`);
  const e = found[0];
  const nodes = [e.nodeI, e.nodeJ].map(n => {
    const foundNodes = model.nodes.filter(row => row.id === n);
    if (foundNodes.length !== 1) throw new Error(`Missing/ambiguous endpoint ${n}`);
    return foundNodes[0];
  });
  const [a, b] = nodes.map(position);
  const length = Math.hypot(...sub(b, a));
  if (length <= EPS) throw new Error('Zero-length target member');
  return { e, nodes, a, b, length };
}

export function forceMoment(position, force, moment = [0, 0, 0]) {
  return { force: vector(force, 'force'), moment: add(cross(vector(position, 'position'), force), vector(moment, 'moment')) };
}
export function sumForceMoments(rows) {
  return rows.reduce((out, row) => ({ force: add(out.force, row.force), moment: add(out.moment, row.moment) }),
    { force: [0, 0, 0], moment: [0, 0, 0] });
}
function conservation(original, assigned) {
  const forceResidual = sub(assigned.force, original.force);
  const momentResidual = sub(assigned.moment, original.moment);
  const passed = [...forceResidual, ...momentResidual].every((v, i) =>
    Math.abs(v) <= 1e-7 + 1e-10 * Math.max(1, Math.abs([...original.force, ...original.moment][i])));
  if (!passed) throw new Error('Force/moment conservation failed');
  return { original, assigned, forceResidual, momentResidual, passed };
}

/** Uniform global vector line load on any collinear subsegment of ONE member.
 * Endpoint forces preserve resultant and first moment; they are NOT consistent
 * beam FE loads and do not reproduce member bending from distributed loading.
 */
export function previewLineLoad(model, { elementId, start, end, intensity, sourceId = null, loadCase = 'DL' }) {
  const m = member(model, elementId);
  start = vector(start, 'start'); end = vector(end, 'end'); intensity = vector(intensity, 'intensity N/mm');
  const axis = mul(sub(m.b, m.a), 1/m.length);
  const parameter = p => {
    const distance = dot(sub(p, m.a), axis);
    if (Math.hypot(...sub(p, add(m.a, mul(axis, distance)))) > EPS || distance < -EPS || distance > m.length + EPS) {
      throw new Error('Load must lie on the selected member; no snapping or multi-member distribution');
    }
    return Math.max(0, Math.min(1, distance/m.length));
  };
  const t0 = parameter(start), t1 = parameter(end);
  const loadedLength = Math.hypot(...sub(end, start));
  if (loadedLength <= EPS) throw new Error('Zero-length line load');
  const total = mul(intensity, loadedLength);
  const t = (t0+t1)/2;
  const targets = [1-t, t].map((weight, i) => ({ elementId, sourceId: m.e.sourceId,
    sourceBranch: m.e.sourceBranch, nodeId: m.nodes[i].id, position: position(m.nodes[i]),
    force: mul(total, weight), moment: [0, 0, 0] }));
  const original = forceMoment(mul(add(start, end), 0.5), total);
  const assigned = sumForceMoments(targets.map(row => forceMoment(row.position, row.force, row.moment)));
  return { kind: 'line', method: 'static-endpoint-lumping', sourceId, loadCase, elementId,
    start, end, intensity, loadedLength, targets, conservation: conservation(original, assigned),
    limitation: 'Endpoint lumping conserves force and moment, but omits distributed-load member bending/fixed-end forces.' };
}

/** Horizontal axis-aligned rectangle, uniform global-Z pressure (signed N/mm²).
 * spanAxis x -> supporting full edges x=min/max; y -> y=min/max.
 */
export function previewRectangularSlab(model, { rectangle, spanAxis, edgeElementIds, pressure, sourceId = null, loadCase = 'DL' }) {
  if (!['x', 'y'].includes(spanAxis)) throw new Error('Explicit one-way spanAxis x or y required');
  if (!Array.isArray(edgeElementIds) || edgeElementIds.length !== 2 || edgeElementIds[0] === edgeElementIds[1]) {
    throw new Error('Two distinct full-edge supporting members required');
  }
  pressure = number(pressure, 'pressure N/mm2 (positive +Z, negative -Z)');
  const { x1, x2, y1, y2, z } = rectangle;
  [x1, x2, y1, y2, z].forEach(v => number(v, 'rectangle'));
  if (x2-x1 <= EPS || y2-y1 <= EPS || rectangle.holes?.length) throw new Error('Expected increasing, nonzero rectangle without holes');
  const edges = spanAxis === 'x' ? [[[x1, y1, z], [x1, y2, z]], [[x2, y1, z], [x2, y2, z]]] :
    [[[x1, y1, z], [x2, y1, z]], [[x1, y2, z], [x2, y2, z]]];
  const tributaryWidth = (spanAxis === 'x' ? x2-x1 : y2-y1)/2;
  const lines = edges.map(([start, end], i) => {
    const m = member(model, edgeElementIds[i]);
    const close = (a, b) => Math.hypot(...sub(a, b)) <= EPS;
    if (!((close(m.a, start) && close(m.b, end)) || (close(m.a, end) && close(m.b, start)))) {
      throw new Error(`Member ${m.e.id} must coincide with the complete rectangle edge ${i}`);
    }
    return { ...previewLineLoad(model, { elementId: m.e.id, start, end,
      intensity: [0, 0, pressure*tributaryWidth], sourceId, loadCase }), tributaryWidth };
  });
  const targets = lines.flatMap(line => line.targets);
  const area = (x2-x1)*(y2-y1);
  const original = forceMoment([(x1+x2)/2, (y1+y2)/2, z], [0, 0, pressure*area]);
  const assigned = sumForceMoments(targets.map(row => forceMoment(row.position, row.force)));
  return { kind: 'one-way-rectangle', sourceId, loadCase, spanAxis, rectangle: { ...rectangle }, pressure,
    area, tributaryWidth, lines, targets, conservation: conservation(original, assigned),
    limitation: 'Uniform one-way tributary distribution only; no slab stiffness/two-way action. Nodal export uses static lumping.' };
}

/** Explicit downstream handoff. Parent must replace the original load, not add both. */
export function previewToPointLoads(preview, { firstId = 1, acknowledgeLumping = false } = {}) {
  if (!acknowledgeLumping) throw new Error('Explicit acknowledgeLumping required: member bending is not preserved');
  if (!Number.isSafeInteger(firstId) || firstId < 1) throw new Error('Positive firstId required');
  if (!preview.conservation?.passed || !preview.targets?.length) throw new Error('A validated preview is required');
  return preview.targets.map((row, i) => ({ id: firstId+i, sourceId: `${preview.sourceId ?? 'preview'}:node:${i}`,
    type: 'pointLoad', loadCase: preview.loadCase, nodeId: row.nodeId,
    x1: row.position[0], y1: row.position[1], z: row.position[2],
    fx: row.force[0], fy: row.force[1], fz: row.force[2], mx: row.moment[0], my: row.moment[1], mz: row.moment[2],
    distribution: { method: 'static-endpoint-lumping', originalSourceId: preview.sourceId,
      elementId: row.elementId, sourceId: row.sourceId, sourceBranch: row.sourceBranch } }));
}
