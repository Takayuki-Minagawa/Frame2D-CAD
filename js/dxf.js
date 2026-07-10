// dxf.js - Minimal DXF reader/writer.
// Reader: extracts LINE / LWPOLYLINE / POLYLINE / CIRCLE / ARC entities from
// the ENTITIES section into plain underlay entities (mm coordinates assumed).
// Writer: emits an R12-style ENTITIES-only document of the plan geometry.

// --- Parsing -----------------------------------------------------------------

// Splits DXF text into (code, value) pairs.
function tokenize(text) {
  const lines = String(text).split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: lines[i + 1].trim() });
  }
  return pairs;
}

// Parses a DXF file into underlay entities:
//   { type: 'line', x1, y1, x2, y2 }
//   { type: 'polyline', points: [{x, y}], closed }
//   { type: 'circle', cx, cy, r }
//   { type: 'arc', cx, cy, r, startAngle, endAngle }  (degrees, CCW)
export function parseDXF(text) {
  const pairs = tokenize(text);
  const entities = [];

  // Locate the ENTITIES section (fall back to the whole file when missing,
  // which tolerates fragment files).
  let start = 0;
  let end = pairs.length;
  for (let i = 0; i + 1 < pairs.length; i++) {
    if (pairs[i].code === 2 && pairs[i].value === 'ENTITIES' && pairs[i - 1]?.value === 'SECTION') {
      start = i + 1;
      for (let j = start; j < pairs.length; j++) {
        if (pairs[j].code === 0 && pairs[j].value === 'ENDSEC') {
          end = j;
          break;
        }
      }
      break;
    }
  }

  let i = start;
  let openPolyline = null; // POLYLINE/VERTEX/SEQEND accumulation

  while (i < end) {
    const pair = pairs[i];
    if (pair.code !== 0) { i++; continue; }
    const type = pair.value.toUpperCase();
    // Collect this entity's pairs (until the next code-0)
    const props = [];
    let j = i + 1;
    while (j < end && pairs[j].code !== 0) {
      props.push(pairs[j]);
      j++;
    }
    const num = code => {
      const found = props.find(p => p.code === code);
      const n = found ? Number(found.value) : NaN;
      return Number.isFinite(n) ? n : null;
    };

    if (type === 'LINE') {
      const x1 = num(10), y1 = num(20), x2 = num(11), y2 = num(21);
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
        entities.push({ type: 'line', x1, y1, x2, y2 });
      }
    } else if (type === 'LWPOLYLINE') {
      // Each code 10 starts a new vertex; its y (20) and optional bulge (42,
      // the arc to the next vertex) may follow in any order — the DXF spec
      // does not fix group-code order within a vertex.
      const raw = [];
      let current = null;
      for (const p of props) {
        if (p.code === 10) {
          current = { x: Number(p.value), y: null, bulge: 0 };
          raw.push(current);
        } else if (p.code === 20 && current) {
          current.y = Number(p.value);
        } else if (p.code === 42 && current) {
          const b = Number(p.value);
          if (Number.isFinite(b)) current.bulge = b;
        }
      }
      const points = raw.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
      const flags = num(70) || 0;
      if (points.length >= 2) {
        const closed = (flags & 1) === 1;
        entities.push({ type: 'polyline', points: expandBulges(points, closed), closed });
      }
    } else if (type === 'POLYLINE') {
      openPolyline = { type: 'polyline', points: [], closed: ((num(70) || 0) & 1) === 1 };
    } else if (type === 'VERTEX' && openPolyline) {
      const x = num(10), y = num(20);
      if (x !== null && y !== null) {
        openPolyline.points.push({ x, y, bulge: num(42) || 0 });
      }
    } else if (type === 'SEQEND' && openPolyline) {
      finishPolyline(entities, openPolyline);
      openPolyline = null;
    } else if (type === 'CIRCLE') {
      const cx = num(10), cy = num(20), r = num(40);
      if (cx !== null && cy !== null && r !== null && r > 0) {
        entities.push({ type: 'circle', cx, cy, r });
      }
    } else if (type === 'ARC') {
      const cx = num(10), cy = num(20), r = num(40);
      const startAngle = num(50), endAngle = num(51);
      if (cx !== null && cy !== null && r !== null && r > 0 &&
          startAngle !== null && endAngle !== null) {
        entities.push({ type: 'arc', cx, cy, r, startAngle, endAngle });
      }
    }
    i = j;
  }
  if (openPolyline) finishPolyline(entities, openPolyline);

  return { entities, bounds: computeBounds(entities) };
}

function finishPolyline(entities, polyline) {
  if (polyline.points.length < 2) return;
  entities.push({
    type: 'polyline',
    points: expandBulges(polyline.points, polyline.closed),
    closed: polyline.closed,
  });
}

// Replaces bulge (arc) segments with short line segments (15° steps) so the
// underlay stays a plain point list. bulge = tan(theta/4) with theta the
// signed included angle (positive = counterclockwise).
function expandBulges(points, closed) {
  if (!points.some(p => p.bulge)) {
    return points.map(p => ({ x: p.x, y: p.y }));
  }
  const out = [];
  const segCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    out.push({ x: p1.x, y: p1.y });
    if (i >= segCount || !p1.bulge) continue;
    const p2 = points[(i + 1) % points.length];
    for (const p of bulgeArcPoints(p1, p2, p1.bulge)) out.push(p);
  }
  return out;
}

// Intermediate points of the arc from p1 to p2 (both excluded).
function bulgeArcPoints(p1, p2, bulge) {
  const theta = 4 * Math.atan(bulge);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const chord = Math.hypot(dx, dy);
  if (!chord || !theta) return [];
  // Center: offset from the chord midpoint along the right normal by the
  // (signed) apothem. For a semicircle tan(theta/2) is infinite -> offset 0.
  const apothem = Math.abs(theta) === Math.PI ? 0 : (chord / 2) / Math.tan(theta / 2);
  const cx = (p1.x + p2.x) / 2 - (dy / chord) * apothem;
  const cy = (p1.y + p2.y) / 2 + (dx / chord) * apothem;
  const r = Math.hypot(p1.x - cx, p1.y - cy);
  const a1 = Math.atan2(p1.y - cy, p1.x - cx);
  const steps = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 12)));
  const arc = [];
  for (let k = 1; k < steps; k++) {
    const a = a1 + theta * (k / steps);
    arc.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return arc;
}

function computeBounds(entities) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const e of entities) {
    if (e.type === 'line') { grow(e.x1, e.y1); grow(e.x2, e.y2); }
    else if (e.type === 'polyline') for (const p of e.points) grow(p.x, p.y);
    else if (e.type === 'circle' || e.type === 'arc') {
      grow(e.cx - e.r, e.cy - e.r);
      grow(e.cx + e.r, e.cy + e.r);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

// --- Writing -----------------------------------------------------------------

function fmt(n) {
  return String(Number(Number(n).toFixed(3)));
}

function lineEntity(out, layer, x1, y1, x2, y2) {
  out.push('0', 'LINE', '8', layer, '10', fmt(x1), '20', fmt(y1), '30', '0',
    '11', fmt(x2), '21', fmt(y2), '31', '0');
}

function circleEntity(out, layer, cx, cy, r) {
  out.push('0', 'CIRCLE', '8', layer, '10', fmt(cx), '20', fmt(cy), '30', '0', '40', fmt(r));
}

function textEntity(out, layer, x, y, height, text) {
  // DXF is a line-based format: a newline inside the value would end the
  // group and let the rest of the string inject arbitrary entities. Strip
  // all control characters from user-supplied text.
  const safe = String(text).replace(/[\u0000-\u001F\u007F]/g, ' ');
  out.push('0', 'TEXT', '8', layer, '10', fmt(x), '20', fmt(y), '30', '0',
    '40', fmt(height), '1', safe);
}

const MEMBER_LAYERS = {
  beam: 'MEMBER_BEAM',
  column: 'MEMBER_COLUMN',
  hbrace: 'MEMBER_HBRACE',
  vbrace: 'MEMBER_VBRACE',
};

// DXF layer names allow a restricted character set, and AutoCAD compares
// them case-insensitively. Only uppercase letters, digits and '-' pass
// through; every other character (lowercase letters included, and '_'
// itself, which delimits the escapes) is encoded as '_<hex>_'. The output
// carries no lowercase characters, so distinct inputs can never collapse to
// the same layer name even under case-insensitive comparison
// ('L1' -> 'L1', 'l1' -> '_6C_1').
function layerToken(value) {
  return String(value).replace(/[^A-Z0-9-]/g,
    c => `_${c.codePointAt(0).toString(16).toUpperCase()}_`);
}

// Builds a DXF document of the plan drawing. options.levelId limits the
// output to one level ('all' or missing = every level). Layer names carry the
// level id (e.g. MEMBER_BEAM_L1) so overlapping levels stay distinguishable.
export function buildDXF(state, options = {}) {
  const levelId = options.levelId || 'all';
  const includeLevel = id => levelId === 'all' || id === levelId;
  const out = ['0', 'SECTION', '2', 'ENTITIES'];

  for (const member of state.members) {
    if (!includeLevel(member.levelId)) continue;
    const n1 = state.getNode(member.startNodeId);
    const n2 = state.getNode(member.endNodeId);
    if (!n1 || !n2) continue;
    const layer = `${MEMBER_LAYERS[member.type] || 'MEMBER'}_${layerToken(member.levelId)}`;
    if (member.type === 'column') {
      circleEntity(out, layer, n1.x, n1.y, Math.max(20, (member.section?.b || 100) / 2));
    } else {
      lineEntity(out, layer, n1.x, n1.y, n2.x, n2.y);
    }
  }

  for (const surface of state.surfaces) {
    if (!includeLevel(surface.levelId)) continue;
    const layer = `SURFACE_${layerToken(String(surface.type || 'other').toUpperCase())}_${layerToken(surface.levelId)}`;
    if (Array.isArray(surface.points) && surface.points.length >= 2) {
      const pts = surface.points;
      const isClosedShape = surface.shape === 'polygon';
      const last = isClosedShape ? pts.length : pts.length - 1;
      for (let k = 0; k < last; k++) {
        const a = pts[k];
        const b = pts[(k + 1) % pts.length];
        lineEntity(out, layer, a.x, a.y, b.x, b.y);
      }
    } else if (surface.shape === 'line') {
      lineEntity(out, layer, surface.x1, surface.y1, surface.x2, surface.y2);
    } else {
      lineEntity(out, layer, surface.x1, surface.y1, surface.x2, surface.y1);
      lineEntity(out, layer, surface.x2, surface.y1, surface.x2, surface.y2);
      lineEntity(out, layer, surface.x2, surface.y2, surface.x1, surface.y2);
      lineEntity(out, layer, surface.x1, surface.y2, surface.x1, surface.y1);
    }
  }

  if (state.axes.length) {
    // Draw each axis across the model extents plus a margin.
    const extent = modelExtent(state);
    for (const axis of state.axes) {
      if (axis.dir === 'x') {
        lineEntity(out, 'AXIS', axis.coord, extent.minY, axis.coord, extent.maxY);
        textEntity(out, 'AXIS', axis.coord + 50, extent.maxY + 200, 300, axis.name);
      } else {
        lineEntity(out, 'AXIS', extent.minX, axis.coord, extent.maxX, axis.coord);
        textEntity(out, 'AXIS', extent.minX - 500, axis.coord + 50, 300, axis.name);
      }
    }
  }

  out.push('0', 'ENDSEC', '0', 'EOF');
  return `${out.join('\r\n')}\r\n`;
}

function modelExtent(state) {
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  let has = false;
  const grow = (x, y) => {
    if (!has) {
      minX = maxX = x;
      minY = maxY = y;
      has = true;
      return;
    }
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const n of state.nodes) grow(n.x, n.y);
  for (const s of state.surfaces) {
    grow(s.x1, s.y1);
    grow(s.x2, s.y2);
  }
  for (const a of state.axes) {
    if (a.dir === 'x') grow(a.coord, 0);
    else grow(0, a.coord);
  }
  const margin = 1000;
  return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}
