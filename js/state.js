// state.js - Data model and state management

export class AppState {
  constructor() {
    this.schemaVersion = 2;
    this.meta = {
      name: 'untitled',
      unit: 'mm',
      createdAt: new Date().toISOString(),
    };
    this.settings = {
      gridSize: 1000,
      snap: true,
      wallDisplayOffset: 120,
    };
    this.levels = [
      { id: 'L0', name: 'GL', z: 0 },
      { id: 'L1', name: '2F', z: 2800 },
    ];
    this.nodes = [];
    this.members = [];
    this.surfaces = [];
    this.loads = [];

    // Runtime state (not serialized)
    this.selectedMemberId = null;
    this.selectedSurfaceId = null;
    this.selectedLoadId = null;
    this.currentTool = 'member';
    this.activeLayerId = 'L0';
    this.memberDraftType = 'beam';
    this.surfaceDraftType = 'floor';
    this.surfaceDraftMode = 'rect';
    this.surfaceDraftLoadDir = 'twoWay';
    this.surfaceDraftTopLayerId = 'L1';
    this.loadDraftType = 'areaLoad';

    // Counters for ID generation
    this._nodeCounter = 0;
    this._memberCounter = 0;
    this._surfaceCounter = 0;
    this._levelCounter = 1;
    this._loadCounter = 0;
  }

  // --- Nodes ---

  nextNodeId() {
    this._nodeCounter++;
    return `N${this._nodeCounter}`;
  }

  addNode(x, y, z = 0) {
    const id = this.nextNodeId();
    const node = { id, x, y, z };
    this.nodes.push(node);
    return node;
  }

  getNode(id) {
    return this.nodes.find(n => n.id === id);
  }

  updateNode(id, props) {
    const node = this.getNode(id);
    if (node) Object.assign(node, props);
    return node;
  }

  removeNode(id) {
    this.nodes = this.nodes.filter(n => n.id !== id);
  }

  findNodeAt(x, y, tolerance = 300) {
    let closest = null;
    let minDist = tolerance;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < minDist) {
        minDist = d;
        closest = n;
      }
    }
    return closest;
  }

  // --- Members ---

  nextMemberId() {
    this._memberCounter++;
    return `M${this._memberCounter}`;
  }

  addMember(startNodeId, endNodeId, options = {}) {
    const id = this.nextMemberId();
    const member = {
      id,
      type: options.type || 'beam',
      startNodeId,
      endNodeId,
      section: { b: options.b || 200, h: options.h || 400 },
      levelId: options.levelId || this.activeLayerId || 'L0',
      material: options.material || 'steel',
      color: options.color || '#666666',
      topLevelId: options.topLevelId || null,
      bracePattern: options.bracePattern || 'single',
    };
    this.members.push(member);
    return member;
  }

  getMember(id) {
    return this.members.find(m => m.id === id);
  }

  updateMember(id, props) {
    const member = this.getMember(id);
    if (member) {
      if (props.section) {
        Object.assign(member.section, props.section);
        delete props.section;
      }
      Object.assign(member, props);
    }
    return member;
  }

  removeMember(id) {
    const member = this.getMember(id);
    if (!member) return;

    // Remove orphaned nodes
    const startId = member.startNodeId;
    const endId = member.endNodeId;
    this.members = this.members.filter(m => m.id !== id);

    for (const nid of [startId, endId]) {
      const used = this.members.some(m => m.startNodeId === nid || m.endNodeId === nid);
      if (!used) this.removeNode(nid);
    }

    if (this.selectedMemberId === id) {
      this.selectedMemberId = null;
    }
  }

  findMemberAt(x, y, tolerance = 300) {
    let closest = null;
    let minDist = tolerance;
    for (const m of this.members) {
      const n1 = this.getNode(m.startNodeId);
      const n2 = this.getNode(m.endNodeId);
      if (!n1 || !n2) continue;
      const d = pointToSegmentDist(x, y, n1.x, n1.y, n2.x, n2.y);
      if (d < minDist) {
        minDist = d;
        closest = m;
      }
    }
    return closest;
  }

  // --- Surfaces ---

  nextSurfaceId() {
    this._surfaceCounter++;
    return `S${this._surfaceCounter}`;
  }

  addSurfaceRect(x1, y1, x2, y2, options = {}) {
    const id = this.nextSurfaceId();
    const surface = {
      id,
      type: options.type || 'floor', // floor | wall | exteriorWall
      levelId: options.levelId || this.activeLayerId || 'L0',
      topLevelId: options.topLevelId || this.surfaceDraftTopLayerId || 'L1',
      loadDirection: options.loadDirection || 'twoWay', // x | y | twoWay
      color: options.color || (options.type === 'wall' || options.type === 'exteriorWall' ? '#b57a6b' : '#67a9cf'),
      x1: Math.min(x1, x2),
      y1: Math.min(y1, y2),
      x2: Math.max(x1, x2),
      y2: Math.max(y1, y2),
      points: null,
      shape: 'rect',
    };
    this.surfaces.push(surface);
    return surface;
  }

  addSurfaceLine(x1, y1, x2, y2, options = {}) {
    const id = this.nextSurfaceId();
    const surface = {
      id,
      type: options.type || 'wall',
      levelId: options.levelId || this.activeLayerId || 'L0',
      topLevelId: options.topLevelId || 'L1',
      loadDirection: 'twoWay',
      color: options.color || '#b57a6b',
      x1, y1, x2, y2,
      points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
      shape: 'line',
    };
    this.surfaces.push(surface);
    return surface;
  }

  addSurfacePolygon(points, options = {}) {
    if (!Array.isArray(points) || points.length < 3) return null;
    const id = this.nextSurfaceId();
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const surface = {
      id,
      type: options.type || 'wall',
      levelId: options.levelId || this.activeLayerId || 'L0',
      topLevelId: options.topLevelId || this.surfaceDraftTopLayerId || 'L1',
      loadDirection: options.loadDirection || 'twoWay',
      color: options.color || (options.type === 'wall' || options.type === 'exteriorWall' ? '#b57a6b' : '#67a9cf'),
      x1: Math.min(...xs),
      y1: Math.min(...ys),
      x2: Math.max(...xs),
      y2: Math.max(...ys),
      points: points.map(p => ({ x: p.x, y: p.y })),
      shape: 'polygon',
    };
    this.surfaces.push(surface);
    return surface;
  }

  getSurface(id) {
    return this.surfaces.find(s => s.id === id);
  }

  updateSurface(id, props) {
    const surface = this.getSurface(id);
    if (surface) Object.assign(surface, props);
    return surface;
  }

  removeSurface(id) {
    this.surfaces = this.surfaces.filter(s => s.id !== id);
    if (this.selectedSurfaceId === id) {
      this.selectedSurfaceId = null;
    }
  }

  findSurfaceAt(x, y) {
    const wallOffset = this.settings.wallDisplayOffset || 120;
    for (let i = this.surfaces.length - 1; i >= 0; i--) {
      const s = this.surfaces[i];
      const isWallType = s.type === 'wall' || s.type === 'exteriorWall';
      if (s.shape === 'line') {
        const lx1 = s.x1 + wallOffset;
        const ly1 = s.y1 + wallOffset;
        const lx2 = s.x2 + wallOffset;
        const ly2 = s.y2 + wallOffset;
        if (pointToSegmentDist(x, y, lx1, ly1, lx2, ly2) < 300) {
          return s;
        }
        continue;
      }
      if (s.shape === 'polygon' && Array.isArray(s.points)) {
        if (s.type === 'exteriorWall') {
          // Hit test against outward-offset edges
          if (hitExteriorWallEdges(x, y, s.points, wallOffset, 300)) return s;
          continue;
        }
        const pts = s.points.map(p => ({
          x: p.x + (isWallType ? wallOffset : 0),
          y: p.y + (isWallType ? wallOffset : 0),
        }));
        if (pointInPolygon(x, y, pts)) {
          return s;
        }
        continue;
      }
      const x1 = isWallType ? s.x1 + wallOffset : s.x1;
      const y1 = isWallType ? s.y1 + wallOffset : s.y1;
      const x2 = isWallType ? s.x2 + wallOffset : s.x2;
      const y2 = isWallType ? s.y2 + wallOffset : s.y2;
      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
        return s;
      }
    }
    return null;
  }

  // --- Levels ---

  nextLevelId() {
    this._levelCounter++;
    return `L${this._levelCounter}`;
  }

  addLevel(name, z) {
    const id = this.nextLevelId();
    const level = { id, name, z };
    this.levels.push(level);
    return level;
  }

  updateLevel(id, props) {
    const level = this.levels.find(l => l.id === id);
    if (level) Object.assign(level, props);
    return level;
  }

  getLevelUsage(id) {
    const members = this.members.filter(m => m.levelId === id || m.topLevelId === id);
    const surfaces = this.surfaces.filter(s => s.levelId === id || s.topLevelId === id);
    const loads = this.loads.filter(l => l.levelId === id);
    return { members, surfaces, loads };
  }

  removeLevel(id) {
    if (this.levels.length <= 1) return false;
    const { members, surfaces, loads } = this.getLevelUsage(id);
    if (members.length > 0 || surfaces.length > 0 || loads.length > 0) return false;
    this.levels = this.levels.filter(l => l.id !== id);
    if (this.activeLayerId === id) {
      this.activeLayerId = this.levels[0].id;
    }
    if (this.surfaceDraftTopLayerId === id) {
      this.surfaceDraftTopLayerId = this.levels[this.levels.length - 1].id;
    }
    return true;
  }

  // --- Loads ---

  nextLoadId() {
    this._loadCounter++;
    return `LD${this._loadCounter}`;
  }

  addLoad(type, props = {}) {
    const id = this.nextLoadId();
    const base = {
      id,
      type,
      levelId: props.levelId || this.activeLayerId || 'L0',
    };
    if (type === 'areaLoad') {
      Object.assign(base, {
        x1: Math.min(props.x1, props.x2), y1: Math.min(props.y1, props.y2),
        x2: Math.max(props.x1, props.x2), y2: Math.max(props.y1, props.y2),
        value: props.value || 0,
        color: props.color || '#e57373',
      });
    } else if (type === 'lineLoad') {
      Object.assign(base, {
        x1: props.x1, y1: props.y1, x2: props.x2, y2: props.y2,
        value: props.value || 0,
        color: props.color || '#ffb74d',
      });
    } else if (type === 'pointLoad') {
      Object.assign(base, {
        x1: props.x1, y1: props.y1,
        fx: props.fx || 0, fy: props.fy || 0, fz: props.fz || 0,
        mx: props.mx || 0, my: props.my || 0, mz: props.mz || 0,
        color: props.color || '#ba68c8',
      });
    }
    this.loads.push(base);
    return base;
  }

  getLoad(id) {
    return this.loads.find(l => l.id === id);
  }

  updateLoad(id, props) {
    const load = this.getLoad(id);
    if (load) Object.assign(load, props);
    return load;
  }

  removeLoad(id) {
    this.loads = this.loads.filter(l => l.id !== id);
    if (this.selectedLoadId === id) {
      this.selectedLoadId = null;
    }
  }

  findLoadAt(x, y) {
    for (let i = this.loads.length - 1; i >= 0; i--) {
      const ld = this.loads[i];
      if (ld.type === 'areaLoad') {
        if (x >= ld.x1 && x <= ld.x2 && y >= ld.y1 && y <= ld.y2) return ld;
      } else if (ld.type === 'lineLoad') {
        if (pointToSegmentDist(x, y, ld.x1, ld.y1, ld.x2, ld.y2) < 300) return ld;
      } else if (ld.type === 'pointLoad') {
        if (Math.hypot(x - ld.x1, y - ld.y1) < 300) return ld;
      }
    }
    return null;
  }

  clearSelection() {
    this.selectedMemberId = null;
    this.selectedSurfaceId = null;
    this.selectedLoadId = null;
  }

  // --- Serialization ---

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      meta: { ...this.meta },
      settings: { ...this.settings },
      levels: this.levels.map(l => ({ ...l })),
      nodes: this.nodes.map(n => ({ ...n })),
      members: this.members.map(m => ({
        ...m,
        section: { ...m.section },
      })),
      surfaces: this.surfaces.map(s => ({
        ...s,
        points: Array.isArray(s.points) ? s.points.map(p => ({ ...p })) : null,
      })),
      loads: this.loads.map(l => ({ ...l })),
    };
  }

  loadJSON(data) {
    if (!data || (data.schemaVersion !== 1 && data.schemaVersion !== 2)) {
      throw new Error('Unsupported schema version');
    }
    this.schemaVersion = 2;
    this.meta = { ...data.meta };
    this.settings = {
      gridSize: 1000,
      snap: true,
      wallDisplayOffset: 120,
      ...data.settings,
    };
    this.levels = data.levels.map(l => ({ ...l }));
    this.nodes = data.nodes.map(n => ({ ...n }));
    this.members = data.members.map(m => ({
      ...m,
      section: { ...m.section },
      topLevelId: m.topLevelId || null,
      bracePattern: m.bracePattern || 'single',
    }));
    this.surfaces = (data.surfaces || []).map(s => ({
      ...s,
      shape: s.shape || 'rect',
      points: Array.isArray(s.points) ? s.points.map(p => ({ ...p })) : null,
    }));
    this.loads = (data.loads || []).map(l => ({ ...l }));
    this.selectedMemberId = null;
    this.selectedSurfaceId = null;
    this.selectedLoadId = null;
    this.currentTool = 'member';
    this.activeLayerId = this.levels[0]?.id || 'L0';
    this.memberDraftType = 'beam';
    this.surfaceDraftType = 'floor';
    this.surfaceDraftMode = 'rect';
    this.surfaceDraftLoadDir = 'twoWay';
    this.surfaceDraftTopLayerId = this.levels[1]?.id || this.activeLayerId;
    this.loadDraftType = 'areaLoad';

    // Restore counters
    this._nodeCounter = maxIdNum(this.nodes);
    this._memberCounter = maxIdNum(this.members);
    this._surfaceCounter = maxIdNum(this.surfaces);
    this._levelCounter = maxIdNum(this.levels);
    this._loadCounter = maxIdNumPrefix(this.loads, 'LD');
  }

  // Deep clone for undo/redo snapshots
  snapshot() {
    return JSON.parse(JSON.stringify(this.toJSON()));
  }

  restoreSnapshot(snap) {
    this.loadJSON(snap);
  }
}

// --- Utility ---

function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function maxIdNum(items) {
  let max = 0;
  for (const item of items) {
    const n = parseInt(item.id.slice(1), 10);
    if (n > max) max = n;
  }
  return max;
}

function maxIdNumPrefix(items, prefix) {
  let max = 0;
  for (const item of items) {
    if (item.id.startsWith(prefix)) {
      const n = parseInt(item.id.slice(prefix.length), 10);
      if (n > max) max = n;
    }
  }
  return max;
}

// Compute outward-offset polygon with properly connected corners.
// Uses winding order (signed area) to determine consistent outward normals,
// which works correctly for both convex and concave polygons.
export function offsetPolygonOutward(points, offset) {
  const n = points.length;
  if (n < 2) return points.map(p => ({ x: p.x, y: p.y }));

  // Signed area (Y-down): positive = CW on screen, negative = CCW on screen
  let signedArea2 = 0;
  for (let i = 0; i < n; i++) {
    const p1 = points[i], p2 = points[(i + 1) % n];
    signedArea2 += p1.x * p2.y - p2.x * p1.y;
  }

  // Outward normal per edge based on winding
  const normals = [];
  for (let i = 0; i < n; i++) {
    const p1 = points[i], p2 = points[(i + 1) % n];
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) { normals.push({ x: 0, y: 0 }); continue; }
    // CW on screen (signedArea2 > 0): outward = (dy, -dx)
    // CCW on screen (signedArea2 < 0): outward = (-dy, dx)
    const nx = signedArea2 >= 0 ? dy / len : -dy / len;
    const ny = signedArea2 >= 0 ? -dx / len : dx / len;
    normals.push({ x: nx, y: ny });
  }

  // Intersect adjacent offset edges to get clean corners
  const result = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const pA = { x: points[prev].x + normals[prev].x * offset, y: points[prev].y + normals[prev].y * offset };
    const dA = { x: points[i].x - points[prev].x, y: points[i].y - points[prev].y };
    const pB = { x: points[i].x + normals[i].x * offset, y: points[i].y + normals[i].y * offset };
    const dB = { x: points[(i + 1) % n].x - points[i].x, y: points[(i + 1) % n].y - points[i].y };

    const cross = dA.x * dB.y - dA.y * dB.x;
    if (Math.abs(cross) < 1e-9) {
      result.push(pB);
    } else {
      const t = ((pB.x - pA.x) * dB.y - (pB.y - pA.y) * dB.x) / cross;
      result.push({ x: pA.x + t * dA.x, y: pA.y + t * dA.y });
    }
  }
  return result;
}

function hitExteriorWallEdges(px, py, points, offset, tolerance) {
  const oPts = offsetPolygonOutward(points, offset);
  for (let i = 0; i < oPts.length; i++) {
    const a = oPts[i], b = oPts[(i + 1) % oPts.length];
    if (pointToSegmentDist(px, py, a.x, a.y, b.x, b.y) < tolerance) return true;
  }
  return false;
}

function pointInPolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
