// state.js - Data model and state management

export class AppState {
  constructor() {
    this.schemaVersion = 1;
    this.meta = {
      name: 'untitled',
      unit: 'mm',
      createdAt: new Date().toISOString(),
    };
    this.settings = {
      gridSize: 1000,
      snap: true,
    };
    this.levels = [
      { id: 'L0', name: 'GL', z: 0 },
      { id: 'L1', name: '2F', z: 3500 },
    ];
    this.nodes = [];
    this.members = [];

    // Runtime state (not serialized)
    this.selectedMemberId = null;
    this.currentTool = 'select';

    // Counters for ID generation
    this._nodeCounter = 0;
    this._memberCounter = 0;
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
      levelId: options.levelId || 'L0',
      material: options.material || 'steel',
      color: options.color || '#666666',
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
    };
  }

  loadJSON(data) {
    if (!data || data.schemaVersion !== 1) {
      throw new Error('Unsupported schema version');
    }
    this.schemaVersion = data.schemaVersion;
    this.meta = { ...data.meta };
    this.settings = { ...data.settings };
    this.levels = data.levels.map(l => ({ ...l }));
    this.nodes = data.nodes.map(n => ({ ...n }));
    this.members = data.members.map(m => ({
      ...m,
      section: { ...m.section },
    }));
    this.selectedMemberId = null;

    // Restore counters
    this._nodeCounter = maxIdNum(this.nodes);
    this._memberCounter = maxIdNum(this.members);
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
