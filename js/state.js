// state.js - Data model and state management

const DEFAULT_SECTION_DEFINITIONS = [
  { target: 'member', type: 'beam', name: '_G', material: 'steel', b: 200, h: 400, color: '#666666', isDefault: true },
  { target: 'member', type: 'column', name: '_C', material: 'steel', b: 105, h: 105, color: '#666666', isDefault: true },
  { target: 'member', type: 'hbrace', name: '_H', material: 'steel', b: 20, h: 20, color: '#666666', isDefault: true },
  { target: 'member', type: 'vbrace', name: '_V', material: 'steel', b: 20, h: 20, color: '#666666', isDefault: true },
  { target: 'surface', type: 'floor', name: '_S', material: '', b: null, h: null, color: '#67a9cf', isDefault: true },
  { target: 'surface', type: 'exteriorWall', name: '_OW', material: '', b: null, h: null, color: '#b57a6b', isDefault: true },
  { target: 'surface', type: 'wall', name: '_IW', material: '', b: null, h: null, color: '#b57a6b', isDefault: true },
];

const DEFAULT_SPRING_DEFINITIONS = [
  { symbol: '_SP', memo: '回転バネ', isDefault: true },
];

const DEFAULT_SECTION_NAME_SET = new Set(DEFAULT_SECTION_DEFINITIONS.map(s => s.name));
const DEFAULT_SPRING_SYMBOL_SET = new Set(DEFAULT_SPRING_DEFINITIONS.map(s => s.symbol));
const END_FIXITIES = new Set(['pin', 'rigid', 'spring']);
const MEMBER_SECTION_TYPE_ALIAS = {
  brace: 'hbrace',
};

export class AppState {
  constructor() {
    this.schemaVersion = 3;
    this.meta = {
      name: 'untitled',
      unit: 'mm',
      createdAt: new Date().toISOString(),
    };
    this.settings = {
      gridSize: 1000,
      snap: true,
      wallDisplayOffset: 120,
      showSupports: true,
      widePick: false,
    };
    this.levels = [
      { id: 'L0', name: 'GL', z: 0 },
      { id: 'L1', name: '2F', z: 2800 },
    ];
    this.nodes = [];
    this.members = [];
    this.surfaces = [];
    this.loads = [];
    this.supports = [];
    this.sectionCatalog = createDefaultSectionCatalog();
    this.springCatalog = createDefaultSpringCatalog();

    // Runtime state (not serialized)
    this.selectedMemberId = null;
    this.selectedSurfaceId = null;
    this.selectedLoadId = null;
    this.selectedSupportId = null;
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
    this._supportCounter = 0;
  }

  // --- Section & Spring catalogs ---

  _normalizeSectionType(target, type) {
    if (!type) return '';
    if (target === 'member') {
      return MEMBER_SECTION_TYPE_ALIAS[type] || type;
    }
    return type;
  }

  _getSectionRef(target, type, name) {
    const normalizedType = this._normalizeSectionType(target, type);
    return this.sectionCatalog.find(s => s.target === target && s.type === normalizedType && s.name === name) || null;
  }

  getSection(target, type, name) {
    const section = this._getSectionRef(target, type, name);
    return section ? { ...section } : null;
  }

  listSections(target, type) {
    const normalizedType = this._normalizeSectionType(target, type);
    return this.sectionCatalog
      .filter(s => s.target === target && s.type === normalizedType)
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map(s => ({ ...s }));
  }

  getDefaultSectionName(target, type) {
    const normalizedType = this._normalizeSectionType(target, type);
    const section = this.sectionCatalog.find(
      s => s.target === target && s.type === normalizedType && s.isDefault
    );
    return section?.name || null;
  }

  getDefaultSection(target, type) {
    const name = this.getDefaultSectionName(target, type);
    return name ? this.getSection(target, type, name) : null;
  }

  addSection(entry) {
    const normalized = normalizeCatalogSectionEntry(entry);
    if (!normalized) return null;
    if (normalized.name.startsWith('_')) return null;
    if (DEFAULT_SECTION_NAME_SET.has(normalized.name)) return null;
    if (this._getSectionRef(normalized.target, normalized.type, normalized.name)) return null;
    const section = { ...normalized, isDefault: false };
    this.sectionCatalog.push(section);
    return { ...section };
  }

  updateSection(target, type, name, props = {}) {
    const normalizedType = this._normalizeSectionType(target, type);
    const section = this.sectionCatalog.find(
      s => s.target === target && s.type === normalizedType && s.name === name
    );
    if (!section || section.isDefault) return null;

    if (target === 'member') {
      if (hasOwn(props, 'b')) {
        section.b = sanitizePositiveNumber(props.b, sanitizePositiveNumber(section.b, 200));
      }
      if (hasOwn(props, 'h')) {
        section.h = sanitizePositiveNumber(props.h, sanitizePositiveNumber(section.h, 400));
      }
    }
    if (hasOwn(props, 'color')) {
      section.color = sanitizeColor(props.color, defaultColorForSection(target, normalizedType));
    }

    if (target === 'member') {
      for (const member of this.members) {
        if (this._normalizeSectionType('member', member.type) === normalizedType && member.sectionName === name) {
          this._applyMemberSection(member, name);
        }
      }
    } else {
      for (const surface of this.surfaces) {
        if (this._normalizeSectionType('surface', surface.type) === normalizedType && surface.sectionName === name) {
          this._ensureSurfaceSection(surface, name);
        }
      }
    }

    return { ...section };
  }

  removeSection(target, type, name) {
    const normalizedType = this._normalizeSectionType(target, type);
    const idx = this.sectionCatalog.findIndex(
      s => s.target === target && s.type === normalizedType && s.name === name
    );
    if (idx < 0) return false;
    if (this.sectionCatalog[idx].isDefault) return false;

    if (target === 'member') {
      const inUse = this.members.some(
        m => this._normalizeSectionType('member', m.type) === normalizedType && m.sectionName === name
      );
      if (inUse) return false;
    } else {
      const inUse = this.surfaces.some(
        s => this._normalizeSectionType('surface', s.type) === normalizedType && s.sectionName === name
      );
      if (inUse) return false;
    }

    this.sectionCatalog.splice(idx, 1);
    return true;
  }

  _getSpringRef(symbol) {
    return this.springCatalog.find(s => s.symbol === symbol) || null;
  }

  getSpring(symbol) {
    const spring = this._getSpringRef(symbol);
    return spring ? { ...spring } : null;
  }

  listSprings() {
    return this.springCatalog
      .slice()
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return a.symbol.localeCompare(b.symbol);
      })
      .map(s => ({ ...s }));
  }

  addSpring(entry) {
    const normalized = normalizeSpringEntry(entry);
    if (!normalized) return null;
    if (normalized.symbol.startsWith('_')) return null;
    if (DEFAULT_SPRING_SYMBOL_SET.has(normalized.symbol)) return null;
    if (this._getSpringRef(normalized.symbol)) return null;
    const spring = { ...normalized, isDefault: false };
    this.springCatalog.push(spring);
    return { ...spring };
  }

  updateSpring(symbol, props = {}) {
    const spring = this._getSpringRef(symbol);
    if (!spring || spring.isDefault) return null;
    if (hasOwn(props, 'memo')) {
      spring.memo = sanitizeText(props.memo) || '';
    }
    return { ...spring };
  }

  removeSpring(symbol) {
    const idx = this.springCatalog.findIndex(s => s.symbol === symbol);
    if (idx < 0) return false;
    if (this.springCatalog[idx].isDefault) return false;
    const inUse = this.members.some(m =>
      (m.endI?.condition === 'spring' && m.endI.springSymbol === symbol) ||
      (m.endJ?.condition === 'spring' && m.endJ.springSymbol === symbol)
    );
    if (inUse) return false;
    this.springCatalog.splice(idx, 1);
    return true;
  }

  _nextCustomSectionName(target, type) {
    const normalizedType = this._normalizeSectionType(target, type);
    let idx = 1;
    while (idx < 100000) {
      const candidate = `U${idx}`;
      const exists = this.sectionCatalog.some(
        s => s.target === target && s.type === normalizedType && s.name === candidate
      );
      if (!exists && !DEFAULT_SECTION_NAME_SET.has(candidate)) return candidate;
      idx++;
    }
    return `U${Date.now()}`;
  }

  _findMemberSectionBySpec(memberType, material, b, h, color = null) {
    const normalizedType = this._normalizeSectionType('member', memberType);
    const targetMaterial = sanitizeText(material) || 'steel';
    const targetB = sanitizePositiveNumber(b, 200);
    const targetH = sanitizePositiveNumber(h, 400);
    const targetColor = sanitizeColor(color, defaultColorForSection('member', normalizedType));
    return this.sectionCatalog.find(s =>
      s.target === 'member' &&
      s.type === normalizedType &&
      (s.material || 'steel') === targetMaterial &&
      sanitizePositiveNumber(s.b, 200) === targetB &&
      sanitizePositiveNumber(s.h, 400) === targetH &&
      sanitizeColor(s.color, defaultColorForSection('member', normalizedType)) === targetColor
    ) || null;
  }

  _createImportedMemberSection(memberType, material, b, h, color = null) {
    const normalizedType = this._normalizeSectionType('member', memberType);
    const section = {
      target: 'member',
      type: normalizedType,
      name: this._nextCustomSectionName('member', normalizedType),
      material: sanitizeText(material) || 'steel',
      b: sanitizePositiveNumber(b, 200),
      h: sanitizePositiveNumber(h, 400),
      color: sanitizeColor(color, defaultColorForSection('member', normalizedType)),
      isDefault: false,
    };
    this.sectionCatalog.push(section);
    return section;
  }

  _applyMemberSection(member, sectionName) {
    const section = this._getSectionRef('member', member.type, sectionName);
    if (!section) return false;
    member.sectionName = section.name;
    member.material = section.material || 'steel';
    member.section = {
      b: sanitizePositiveNumber(section.b, 200),
      h: sanitizePositiveNumber(section.h, 400),
    };
    member.color = sanitizeColor(section.color, defaultColorForSection('member', member.type));
    return true;
  }

  _ensureMemberSection(member, requestedSectionName = null) {
    const normalizedType = this._normalizeSectionType('member', member.type);
    const sectionName = sanitizeText(requestedSectionName || member.sectionName);
    let section = sectionName
      ? this._getSectionRef('member', normalizedType, sectionName)
      : null;

    if (!section) {
      const defaultName = this.getDefaultSectionName('member', normalizedType);
      section = defaultName ? this._getSectionRef('member', normalizedType, defaultName) : null;
    }
    if (!section) {
      section = this.sectionCatalog.find(s => s.target === 'member' && s.type === normalizedType) || null;
    }

    if (section) {
      member.sectionName = section.name;
      member.material = section.material || 'steel';
      member.section = {
        b: sanitizePositiveNumber(section.b, 200),
        h: sanitizePositiveNumber(section.h, 400),
      };
      member.color = sanitizeColor(section.color, defaultColorForSection('member', member.type));
      return;
    }

    member.sectionName = sectionName || '';
    member.material = sanitizeText(member.material) || 'steel';
    member.section = {
      b: sanitizePositiveNumber(member.section?.b, 200),
      h: sanitizePositiveNumber(member.section?.h, 400),
    };
    member.color = sanitizeColor(member.color, defaultColorForSection('member', member.type));
  }

  _ensureSurfaceSection(surface, requestedSectionName = null) {
    const normalizedType = this._normalizeSectionType('surface', surface.type);
    const sectionName = sanitizeText(requestedSectionName || surface.sectionName);
    let section = sectionName
      ? this._getSectionRef('surface', normalizedType, sectionName)
      : null;

    if (!section) {
      const defaultName = this.getDefaultSectionName('surface', normalizedType);
      section = defaultName ? this._getSectionRef('surface', normalizedType, defaultName) : null;
    }
    if (!section) {
      section = this.sectionCatalog.find(s => s.target === 'surface' && s.type === normalizedType) || null;
    }

    surface.sectionName = section?.name || sectionName || '';
    surface.color = sanitizeColor(
      section?.color || surface.color,
      defaultColorForSection('surface', surface.type)
    );
  }

  _normalizeMemberEnd(endInfo) {
    const raw = endInfo || {};
    const rawCondition = sanitizeText(raw.condition || raw.fixity || raw.type) || 'rigid';
    const condition = END_FIXITIES.has(rawCondition) ? rawCondition : 'rigid';
    const defaultSpring = this.springCatalog[0]?.symbol || null;

    let springSymbol = null;
    if (condition === 'spring') {
      const requested = sanitizeText(raw.springSymbol || raw.symbol);
      const spring = requested ? this._getSpringRef(requested) : null;
      springSymbol = spring?.symbol || defaultSpring;
    }
    return { condition, springSymbol };
  }

  _hydrateSectionCatalog(rawCatalog) {
    const catalog = createDefaultSectionCatalog();
    if (!Array.isArray(rawCatalog)) return catalog;

    const defaultsByName = new Map(
      createDefaultSectionCatalog().map(s => [s.name, s])
    );

    for (const raw of rawCatalog) {
      const normalized = normalizeCatalogSectionEntry(raw);
      if (!normalized) continue;

      const defaultDef = defaultsByName.get(normalized.name);
      if (defaultDef) {
        if (!isSameSectionDefinition(defaultDef, normalized)) {
          throw new Error(`Reserved default section name: ${normalized.name}`);
        }
        continue;
      }

      if (catalog.some(s =>
        s.target === normalized.target &&
        s.type === normalized.type &&
        s.name === normalized.name
      )) {
        throw new Error(`Duplicate section name: ${normalized.name}`);
      }
      catalog.push({ ...normalized, isDefault: false });
    }
    return catalog;
  }

  _hydrateSpringCatalog(rawCatalog) {
    const catalog = createDefaultSpringCatalog();
    if (!Array.isArray(rawCatalog)) return catalog;

    const defaultsBySymbol = new Map(
      createDefaultSpringCatalog().map(s => [s.symbol, s])
    );

    for (const raw of rawCatalog) {
      const normalized = normalizeSpringEntry(raw);
      if (!normalized) continue;

      const defaultDef = defaultsBySymbol.get(normalized.symbol);
      if (defaultDef) {
        if ((defaultDef.memo || '') !== (normalized.memo || '')) {
          throw new Error(`Reserved default spring symbol: ${normalized.symbol}`);
        }
        continue;
      }

      if (catalog.some(s => s.symbol === normalized.symbol)) {
        throw new Error(`Duplicate spring symbol: ${normalized.symbol}`);
      }
      catalog.push({ ...normalized, isDefault: false });
    }
    return catalog;
  }

  _normalizeLoadedMember(raw) {
    const member = {
      ...raw,
      type: raw.type || 'beam',
      sectionName: sanitizeText(raw.sectionName) || '',
      section: {
        b: sanitizePositiveNumber(raw.section?.b, 200),
        h: sanitizePositiveNumber(raw.section?.h, 400),
      },
      levelId: raw.levelId || this.activeLayerId || 'L0',
      material: sanitizeText(raw.material) || 'steel',
      color: raw.color || '#666666',
      topLevelId: raw.topLevelId || null,
      bracePattern: raw.bracePattern || 'single',
      endI: this._normalizeMemberEnd(raw.endI || raw.iEnd),
      endJ: this._normalizeMemberEnd(raw.endJ || raw.jEnd),
    };

    const byName = member.sectionName ? this._getSectionRef('member', member.type, member.sectionName) : null;
    if (byName) {
      this._applyMemberSection(member, byName.name);
      return member;
    }

    const hasLegacySectionData = !!raw.section || !!raw.material;
    if (hasLegacySectionData) {
      const b = sanitizePositiveNumber(raw.section?.b, 200);
      const h = sanitizePositiveNumber(raw.section?.h, 400);
      const material = sanitizeText(raw.material) || 'steel';
      const section = this._findMemberSectionBySpec(member.type, material, b, h, member.color) ||
        this._createImportedMemberSection(member.type, material, b, h, member.color);
      this._applyMemberSection(member, section.name);
      return member;
    }

    this._ensureMemberSection(member, member.sectionName);
    return member;
  }

  _normalizeLoadedSurface(raw) {
    const surface = {
      ...raw,
      type: raw.type || 'floor',
      sectionName: sanitizeText(raw.sectionName) || '',
      levelId: raw.levelId || this.activeLayerId || 'L0',
      topLevelId: raw.topLevelId || this.surfaceDraftTopLayerId || 'L1',
      loadDirection: raw.loadDirection || 'twoWay',
      color: raw.color || (raw.type === 'wall' || raw.type === 'exteriorWall' ? '#b57a6b' : '#67a9cf'),
      shape: raw.shape || 'rect',
      points: Array.isArray(raw.points) ? raw.points.map(p => ({ ...p })) : null,
    };
    this._ensureSurfaceSection(surface, surface.sectionName);
    return surface;
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
    const type = options.type || 'beam';
    let sectionName = sanitizeText(options.sectionName) || '';

    if (!sectionName && (
      (options.b !== undefined && options.b !== null) ||
      (options.h !== undefined && options.h !== null) ||
      options.material
    )) {
      const material = sanitizeText(options.material) || 'steel';
      const b = sanitizePositiveNumber(options.b, 200);
      const h = sanitizePositiveNumber(options.h, 400);
      const section = this._findMemberSectionBySpec(type, material, b, h, options.color) ||
        this._createImportedMemberSection(type, material, b, h, options.color);
      sectionName = section.name;
    }

    const member = {
      id,
      type,
      startNodeId,
      endNodeId,
      sectionName,
      section: { b: 200, h: 400 },
      levelId: options.levelId || this.activeLayerId || 'L0',
      material: 'steel',
      color: options.color || '#666666',
      topLevelId: options.topLevelId || null,
      bracePattern: options.bracePattern || 'single',
      endI: this._normalizeMemberEnd(options.endI),
      endJ: this._normalizeMemberEnd(options.endJ),
    };
    this._ensureMemberSection(member, sectionName);
    this.members.push(member);
    return member;
  }

  getMember(id) {
    return this.members.find(m => m.id === id);
  }

  updateMember(id, props) {
    const member = this.getMember(id);
    if (!member) return null;

    const patch = { ...props };
    const hasType = hasOwn(patch, 'type');
    const hasSectionName = hasOwn(patch, 'sectionName');
    const hasSection = hasOwn(patch, 'section');
    const hasMaterial = hasOwn(patch, 'material');
    const hasColor = hasOwn(patch, 'color');
    const hasEndI = hasOwn(patch, 'endI');
    const hasEndJ = hasOwn(patch, 'endJ');

    if (hasSection) {
      Object.assign(member.section, patch.section || {});
      delete patch.section;
    }
    if (hasEndI) {
      member.endI = this._normalizeMemberEnd(patch.endI);
      delete patch.endI;
    }
    if (hasEndJ) {
      member.endJ = this._normalizeMemberEnd(patch.endJ);
      delete patch.endJ;
    }

    if (hasColor) {
      // Color is section-driven, so direct color patching is ignored.
      delete patch.color;
    }

    Object.assign(member, patch);

    if (!hasEndI) member.endI = this._normalizeMemberEnd(member.endI);
    if (!hasEndJ) member.endJ = this._normalizeMemberEnd(member.endJ);

    if (!hasSectionName && (hasSection || hasMaterial)) {
      const material = sanitizeText(member.material) || 'steel';
      const b = sanitizePositiveNumber(member.section?.b, 200);
      const h = sanitizePositiveNumber(member.section?.h, 400);
      const section = this._findMemberSectionBySpec(member.type, material, b, h, member.color) ||
        this._createImportedMemberSection(member.type, material, b, h, member.color);
      member.sectionName = section.name;
    }

    if (hasType || hasSectionName || hasSection || hasMaterial || hasColor) {
      this._ensureMemberSection(member, member.sectionName);
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
      sectionName: sanitizeText(options.sectionName) || '',
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
    this._ensureSurfaceSection(surface, surface.sectionName);
    this.surfaces.push(surface);
    return surface;
  }

  addSurfaceLine(x1, y1, x2, y2, options = {}) {
    const id = this.nextSurfaceId();
    const surface = {
      id,
      type: options.type || 'wall',
      sectionName: sanitizeText(options.sectionName) || '',
      levelId: options.levelId || this.activeLayerId || 'L0',
      topLevelId: options.topLevelId || 'L1',
      loadDirection: 'twoWay',
      color: options.color || '#b57a6b',
      x1, y1, x2, y2,
      points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
      shape: 'line',
    };
    this._ensureSurfaceSection(surface, surface.sectionName);
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
      sectionName: sanitizeText(options.sectionName) || '',
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
    this._ensureSurfaceSection(surface, surface.sectionName);
    this.surfaces.push(surface);
    return surface;
  }

  getSurface(id) {
    return this.surfaces.find(s => s.id === id);
  }

  updateSurface(id, props) {
    const surface = this.getSurface(id);
    if (!surface) return null;
    const patch = { ...props };
    const hasType = hasOwn(patch, 'type');
    const hasSectionName = hasOwn(patch, 'sectionName');
    const hasColor = hasOwn(patch, 'color');
    if (hasColor) {
      // Color is section-driven, so direct color patching is ignored.
      delete patch.color;
    }
    Object.assign(surface, patch);
    if (hasType || hasSectionName || hasColor) {
      this._ensureSurfaceSection(surface, surface.sectionName);
    }
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

  // --- Supports ---

  nextSupportId() {
    this._supportCounter++;
    return `SUP${this._supportCounter}`;
  }

  addSupport(x, y, options = {}) {
    const id = this.nextSupportId();
    const support = {
      id,
      x,
      y,
      levelId: options.levelId || this.activeLayerId || 'L0',
      dx: options.dx !== undefined ? !!options.dx : true,
      dy: options.dy !== undefined ? !!options.dy : true,
      dz: options.dz !== undefined ? !!options.dz : true,
      rx: options.rx !== undefined ? !!options.rx : false,
      ry: options.ry !== undefined ? !!options.ry : false,
      rz: options.rz !== undefined ? !!options.rz : false,
    };
    this.supports.push(support);
    return support;
  }

  getSupport(id) {
    return this.supports.find(s => s.id === id);
  }

  updateSupport(id, props) {
    const support = this.getSupport(id);
    if (support) Object.assign(support, props);
    return support;
  }

  removeSupport(id) {
    this.supports = this.supports.filter(s => s.id !== id);
    if (this.selectedSupportId === id) {
      this.selectedSupportId = null;
    }
  }

  findSupportAt(x, y, tolerance = 300) {
    let closest = null;
    let minDist = tolerance;
    for (const s of this.supports) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < minDist) {
        minDist = d;
        closest = s;
      }
    }
    return closest;
  }

  clearSelection() {
    this.selectedMemberId = null;
    this.selectedSurfaceId = null;
    this.selectedLoadId = null;
    this.selectedSupportId = null;
  }

  // --- Serialization ---

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      meta: { ...this.meta },
      settings: { ...this.settings },
      levels: this.levels.map(l => ({ ...l })),
      nodes: this.nodes.map(n => ({ ...n })),
      sectionCatalog: this.sectionCatalog.filter(s => s.isDefault).map(s => ({ ...s })),
      springCatalog: this.springCatalog.filter(s => s.isDefault).map(s => ({ ...s })),
      members: this.members.map(m => ({
        type: m.type,
        startNodeId: m.startNodeId,
        endNodeId: m.endNodeId,
        sectionName: m.sectionName,
        levelId: m.levelId,
        color: m.color,
        topLevelId: m.topLevelId,
        bracePattern: m.bracePattern,
        endI: { ...m.endI },
        endJ: { ...m.endJ },
      })),
      surfaces: this.surfaces.map(s => ({
        type: s.type,
        sectionName: s.sectionName,
        levelId: s.levelId,
        topLevelId: s.topLevelId,
        loadDirection: s.loadDirection,
        color: s.color,
        x1: s.x1,
        y1: s.y1,
        x2: s.x2,
        y2: s.y2,
        shape: s.shape,
        points: Array.isArray(s.points) ? s.points.map(p => ({ ...p })) : null,
      })),
      loads: this.loads.map(l => {
        const rest = { ...l };
        delete rest.id;
        return { ...rest };
      }),
      supports: this.supports.map(s => ({
        x: s.x,
        y: s.y,
        levelId: s.levelId,
        dx: s.dx,
        dy: s.dy,
        dz: s.dz,
        rx: s.rx,
        ry: s.ry,
        rz: s.rz,
      })),
    };
  }

  loadJSON(data) {
    const version = data?.schemaVersion || 1;
    if (!data || (version !== 1 && version !== 2 && version !== 3)) {
      throw new Error('Unsupported schema version');
    }
    this.schemaVersion = 3;
    this.meta = { ...data.meta };
    this.settings = {
      gridSize: 1000,
      snap: true,
      wallDisplayOffset: 120,
      showSupports: true,
      widePick: false,
      ...data.settings,
    };
    this.levels = Array.isArray(data.levels) && data.levels.length > 0
      ? data.levels.map(l => ({ ...l }))
      : [
          { id: 'L0', name: 'GL', z: 0 },
          { id: 'L1', name: '2F', z: 2800 },
        ];
    this.activeLayerId = this.levels[0]?.id || 'L0';
    this.surfaceDraftTopLayerId = this.levels[1]?.id || this.activeLayerId;
    this.nodes = (data.nodes || []).map(n => ({ ...n }));
    // Preserve current custom user definitions across CAD load
    const prevCustomSections = this.sectionCatalog.filter(s => !s.isDefault);
    const prevCustomSprings = this.springCatalog.filter(s => !s.isDefault);
    this.sectionCatalog = this._hydrateSectionCatalog(data.sectionCatalog);
    this.springCatalog = this._hydrateSpringCatalog(data.springCatalog);
    for (const cs of prevCustomSections) {
      if (!this.sectionCatalog.some(s => s.target === cs.target && s.type === cs.type && s.name === cs.name)) {
        this.sectionCatalog.push({ ...cs });
      }
    }
    for (const cs of prevCustomSprings) {
      if (!this.springCatalog.some(s => s.symbol === cs.symbol)) {
        this.springCatalog.push({ ...cs });
      }
    }
    this.members = (data.members || []).map((m, idx) =>
      this._normalizeLoadedMember({ id: m.id || `M${idx + 1}`, ...m })
    );
    this.surfaces = (data.surfaces || []).map((s, idx) =>
      this._normalizeLoadedSurface({ id: s.id || `S${idx + 1}`, ...s })
    );
    this.loads = (data.loads || []).map((l, idx) => ({ id: l.id || `LD${idx + 1}`, ...l }));
    this.supports = (data.supports || []).map((s, idx) => ({
      id: s.id || `SUP${idx + 1}`,
      x: s.x || 0,
      y: s.y || 0,
      levelId: s.levelId || this.activeLayerId || 'L0',
      dx: !!s.dx,
      dy: !!s.dy,
      dz: !!s.dz,
      rx: !!s.rx,
      ry: !!s.ry,
      rz: !!s.rz,
    }));
    this.selectedMemberId = null;
    this.selectedSurfaceId = null;
    this.selectedLoadId = null;
    this.selectedSupportId = null;
    this.currentTool = 'member';
    this.memberDraftType = 'beam';
    this.surfaceDraftType = 'floor';
    this.surfaceDraftMode = 'rect';
    this.surfaceDraftLoadDir = 'twoWay';
    this.loadDraftType = 'areaLoad';

    // Restore counters
    this._nodeCounter = maxIdNum(this.nodes);
    this._memberCounter = maxIdNum(this.members);
    this._surfaceCounter = maxIdNum(this.surfaces);
    this._levelCounter = maxIdNum(this.levels);
    this._loadCounter = maxIdNumPrefix(this.loads, 'LD');
    this._supportCounter = maxIdNumPrefix(this.supports, 'SUP');
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

function createDefaultSectionCatalog() {
  return DEFAULT_SECTION_DEFINITIONS.map(s => ({
    ...s,
    type: MEMBER_SECTION_TYPE_ALIAS[s.type] || s.type,
  }));
}

function createDefaultSpringCatalog() {
  return DEFAULT_SPRING_DEFINITIONS.map(s => ({ ...s }));
}

function normalizeCatalogSectionEntry(entry) {
  if (!entry || (entry.target !== 'member' && entry.target !== 'surface')) return null;
  const type = entry.target === 'member'
    ? (MEMBER_SECTION_TYPE_ALIAS[entry.type] || entry.type)
    : entry.type;
  const name = sanitizeText(entry.name);
  if (!type || !name) return null;
  const material = sanitizeText(entry.material) || (entry.target === 'member' ? 'steel' : '');

  const normalized = {
    target: entry.target,
    type,
    name,
    material,
    b: entry.target === 'member' ? sanitizePositiveNumber(entry.b, 200) : null,
    h: entry.target === 'member' ? sanitizePositiveNumber(entry.h, 400) : null,
    color: sanitizeColor(entry.color, defaultColorForSection(entry.target, type)),
  };
  return normalized;
}

function normalizeSpringEntry(entry) {
  if (!entry) return null;
  const symbol = sanitizeText(entry.symbol || entry.name);
  if (!symbol) return null;
  return {
    symbol,
    memo: sanitizeText(entry.memo) || '',
  };
}

function isSameSectionDefinition(a, b) {
  return a.target === b.target &&
    (MEMBER_SECTION_TYPE_ALIAS[a.type] || a.type) === (MEMBER_SECTION_TYPE_ALIAS[b.type] || b.type) &&
    a.name === b.name &&
    (a.material || '') === (b.material || '') &&
    sanitizeColor(a.color, defaultColorForSection(a.target, a.type)) ===
      sanitizeColor(b.color, defaultColorForSection(b.target, b.type)) &&
    (a.target !== 'member' || (
      sanitizePositiveNumber(a.b, 200) === sanitizePositiveNumber(b.b, 200) &&
      sanitizePositiveNumber(a.h, 400) === sanitizePositiveNumber(b.h, 400)
    ));
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function sanitizePositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeColor(value, fallback) {
  const text = sanitizeText(value);
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
  const safeFallback = sanitizeText(fallback);
  return /^#[0-9a-fA-F]{6}$/.test(safeFallback) ? safeFallback.toLowerCase() : '#666666';
}

function defaultColorForSection(target, type) {
  const normalizedType = target === 'member'
    ? (MEMBER_SECTION_TYPE_ALIAS[type] || type)
    : type;
  const def = DEFAULT_SECTION_DEFINITIONS.find(
    s => s.target === target && (MEMBER_SECTION_TYPE_ALIAS[s.type] || s.type) === normalizedType
  );
  if (def && /^#[0-9a-fA-F]{6}$/.test(def.color || '')) {
    return def.color.toLowerCase();
  }
  if (target === 'surface') {
    return normalizedType === 'floor' ? '#67a9cf' : '#b57a6b';
  }
  return '#666666';
}

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

  // Signed area in world coordinates (Y-up): positive = CCW, negative = CW
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
    // CCW (signedArea2 > 0): outward = (dy, -dx)
    // CW  (signedArea2 < 0): outward = (-dy, dx)
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
