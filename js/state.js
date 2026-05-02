// state.js - Data model and state management

import {
  edgeInwardNormal,
  pointInPolygonInterior as isInteriorPlanPoint,
  polygonVertexCentroid,
  uniquePositiveNumbers,
} from './geometry-utils.js';
import { normalizeRoofDirection, roofPlanPoints, roofPoint3D, roofSlopeMemberSegments, roofVertices3D } from './roof-geometry.js';

const DEFAULT_SECTION_DEFINITIONS = [
  { target: 'member', type: 'beam', name: '_G', material: 'steel', b: 200, h: 400, color: '#666666', isDefault: true },
  { target: 'member', type: 'column', name: '_C', material: 'steel', b: 105, h: 105, color: '#666666', isDefault: true },
  { target: 'member', type: 'hbrace', name: '_H', material: 'steel', b: 20, h: 20, color: '#666666', isDefault: true },
  { target: 'member', type: 'vbrace', name: '_V', material: 'steel', b: 20, h: 20, color: '#666666', isDefault: true },
  { target: 'surface', type: 'floor', name: '_S', material: '', b: null, h: null, color: '#67a9cf', isDefault: true },
  { target: 'surface', type: 'exteriorWall', name: '_OW', material: '', b: null, h: null, color: '#b57a6b', isDefault: true },
  { target: 'surface', type: 'wall', name: '_IW', material: '', b: null, h: null, color: '#b57a6b', isDefault: true },
  { target: 'surface', type: 'roof', name: '_R', material: '', b: null, h: null, color: '#8b6f47', isDefault: true },
  { target: 'surface', type: 'eave', name: '_E', material: '', b: null, h: null, color: '#4f9a8a', isDefault: true },
  { target: 'surface', type: 'gableWall', name: '_GW', material: '', b: null, h: null, color: '#bf6f5e', isDefault: true },
];

const DEFAULT_SPRING_DEFINITIONS = [
  { symbol: '_SP', memo: '回転バネ', isDefault: true },
];

const DEFAULT_SECTION_NAME_SET = new Set(DEFAULT_SECTION_DEFINITIONS.map(s => s.name));
const DEFAULT_SPRING_SYMBOL_SET = new Set(DEFAULT_SPRING_DEFINITIONS.map(s => s.symbol));
const END_FIXITIES = new Set(['pin', 'rigid', 'spring']);
const MEMBER_GEOMETRY_MODES = new Set(['level', 'explicit3d']);
const SURFACE_HEIGHT_MODES = new Set(['full', 'waist', 'hanging', 'custom']);
const CURRENT_SCHEMA_VERSION = 9;
const SUPPORTED_SCHEMA_VERSIONS = new Set(
  Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, index) => index + 1)
);
const MEMBER_SECTION_TYPE_ALIAS = {
  brace: 'hbrace',
};

export class AppState {
  constructor() {
    this.schemaVersion = CURRENT_SCHEMA_VERSION;
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
    this.surfaceDraftHeightMode = 'full';
    this.surfaceDraftBottomOffset = 0;
    this.surfaceDraftTopOffset = 1200;
    this.surfaceDraftRoofSlope = 0.3;
    this.surfaceDraftRoofDirection = 'xPlus';
    this.surfaceDraftRoofBaseOffset = 0;
    this.surfaceDraftRoofGroupId = 'RG1';
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

  getLevelZ(levelId) {
    const level = this.levels.find(l => l.id === levelId);
    return Number.isFinite(Number(level?.z)) ? Number(level.z) : 0;
  }

  getNextLevelId(levelId = this.activeLayerId) {
    const sortedLevels = [...this.levels].sort((a, b) => a.z - b.z);
    const activeIdx = sortedLevels.findIndex(l => l.id === levelId);
    if (activeIdx < 0 || activeIdx >= sortedLevels.length - 1) return null;
    return sortedLevels[activeIdx + 1].id;
  }

  getStoryHeight(levelId = this.activeLayerId, topLevelId = null) {
    const resolvedTopLevelId = topLevelId || this.getNextLevelId(levelId);
    if (!resolvedTopLevelId) return 0;
    return Math.max(0, this.getLevelZ(resolvedTopLevelId) - this.getLevelZ(levelId));
  }

  getSurfaceHeightOffsets(options = {}) {
    const heightMode = normalizeSurfaceHeightMode(options.heightMode);
    const levelId = options.levelId || this.activeLayerId || 'L0';
    const topLevelId = options.topLevelId || this.getNextLevelId(levelId) || this.surfaceDraftTopLayerId || levelId;
    const storyHeight = this.getStoryHeight(levelId, topLevelId);

    if (heightMode === 'waist') {
      return {
        heightMode,
        bottomOffset: 0,
        topOffset: Math.min(1200, storyHeight || 1200),
      };
    }

    if (heightMode === 'hanging') {
      const topOffset = storyHeight || 0;
      return {
        heightMode,
        bottomOffset: Math.max(0, topOffset - 600),
        topOffset,
      };
    }

    if (heightMode === 'custom') {
      const bottomOffset = sanitizeNumber(options.bottomOffset, this.surfaceDraftBottomOffset || 0);
      const fallbackTopOffset = Math.max(bottomOffset + 1, this.surfaceDraftTopOffset || storyHeight || 1200);
      const topOffset = sanitizeNumber(options.topOffset, fallbackTopOffset);
      return {
        heightMode,
        bottomOffset,
        topOffset: topOffset > bottomOffset ? topOffset : fallbackTopOffset,
      };
    }

    return {
      heightMode: 'full',
      bottomOffset: 0,
      topOffset: storyHeight || 0,
    };
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
    if (hasOwn(props, 'memo')) {
      section.memo = sanitizeText(props.memo) || '';
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
      geometryMode: normalizeMemberGeometryMode(raw.geometryMode),
      startZ: sanitizeOptionalNumber(raw.startZ),
      endZ: sanitizeOptionalNumber(raw.endZ),
      roofRole: sanitizeText(raw.roofRole) || null,
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
    const type = raw.type || 'floor';
    const levelId = raw.levelId || this.activeLayerId || 'L0';
    const topLevelId = raw.topLevelId || this.surfaceDraftTopLayerId || this.getNextLevelId(levelId) || levelId;
    const surface = {
      ...raw,
      type,
      sectionName: sanitizeText(raw.sectionName) || '',
      levelId,
      topLevelId,
      loadDirection: raw.loadDirection || 'twoWay',
      color: raw.color || (raw.type === 'wall' || raw.type === 'exteriorWall' ? '#b57a6b' : '#67a9cf'),
      shape: raw.shape || 'rect',
      points: Array.isArray(raw.points) ? raw.points.map(p => ({ ...p })) : null,
      ...this._normalizeSurfaceHeightAndWeight(type, levelId, topLevelId, raw),
      ...this._normalizeSurfaceRoof(type, raw),
    };
    Object.assign(surface, this._normalizeSurfaceGable(type, levelId, topLevelId, surface));
    if (!isSlopedSurfaceType(type)) {
      delete surface.roofSlope;
      delete surface.roofDirection;
      delete surface.roofBaseOffset;
    }
    if (!isRoofSurfaceType(type)) {
      delete surface.roofGroupId;
    }
    if (!isGableWallSurfaceType(type)) {
      delete surface.gableStartTopOffset;
      delete surface.gableEndTopOffset;
    }
    this._ensureSurfaceSection(surface, surface.sectionName);
    return surface;
  }

  _normalizeSurfaceHeightAndWeight(type, levelId, topLevelId, options = {}) {
    const isWallType = isWallSurfaceType(type);
    if (!isWallType) {
      return {
        heightMode: 'custom',
        bottomOffset: 0,
        topOffset: 0,
        includeWind: hasOwn(options, 'includeWind') ? !!options.includeWind : isSlopedSurfaceType(type),
        includeSeismicWeight: hasOwn(options, 'includeSeismicWeight') ? !!options.includeSeismicWeight : false,
        unitWeight: sanitizeNonNegativeNumber(options.unitWeight, 0),
      };
    }

    const offsets = this.getSurfaceHeightOffsets({
      heightMode: options.heightMode || 'full',
      levelId,
      topLevelId,
      bottomOffset: options.bottomOffset,
      topOffset: options.topOffset,
    });
    return {
      heightMode: offsets.heightMode,
      bottomOffset: offsets.bottomOffset,
      topOffset: offsets.topOffset,
      includeWind: hasOwn(options, 'includeWind') ? !!options.includeWind : true,
      includeSeismicWeight: hasOwn(options, 'includeSeismicWeight') ? !!options.includeSeismicWeight : false,
      unitWeight: sanitizeNonNegativeNumber(options.unitWeight, 0),
    };
  }

  _normalizeSurfaceRoof(type, options = {}) {
    if (!isSlopedSurfaceType(type)) {
      return {};
    }
    const roofFields = {
      roofSlope: sanitizeNonNegativeNumber(options.roofSlope, this.surfaceDraftRoofSlope || 0.3),
      roofDirection: normalizeRoofDirection(options.roofDirection || this.surfaceDraftRoofDirection),
      roofBaseOffset: sanitizeNumber(options.roofBaseOffset, this.surfaceDraftRoofBaseOffset || 0),
    };
    if (isRoofSurfaceType(type)) {
      roofFields.roofGroupId = sanitizeRoofGroupId(options.roofGroupId, this.surfaceDraftRoofGroupId || 'RG1');
    }
    return roofFields;
  }

  _normalizeSurfaceGable(type, levelId, topLevelId, options = {}) {
    if (!isGableWallSurfaceType(type)) return {};
    const bottomOffset = sanitizeNumber(options.bottomOffset, 0);
    const storyHeight = this.getStoryHeight(levelId, topLevelId);
    const fallbackTop = Math.max(bottomOffset + 1, sanitizeNumber(options.topOffset, storyHeight || 2800));
    const startTop = sanitizeNumber(options.gableStartTopOffset, fallbackTop);
    const endTop = sanitizeNumber(options.gableEndTopOffset, fallbackTop);
    const gableStartTopOffset = startTop >= bottomOffset ? startTop : fallbackTop;
    const gableEndTopOffset = endTop >= bottomOffset ? endTop : fallbackTop;
    return {
      heightMode: 'custom',
      bottomOffset,
      topOffset: Math.max(gableStartTopOffset, gableEndTopOffset),
      gableStartTopOffset,
      gableEndTopOffset,
    };
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
      geometryMode: normalizeMemberGeometryMode(options.geometryMode),
      startZ: sanitizeOptionalNumber(options.startZ),
      endZ: sanitizeOptionalNumber(options.endZ),
      roofRole: sanitizeText(options.roofRole) || null,
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
    const hasGeometryMode = hasOwn(patch, 'geometryMode');
    const hasStartZ = hasOwn(patch, 'startZ');
    const hasEndZ = hasOwn(patch, 'endZ');
    const hasRoofRole = hasOwn(patch, 'roofRole');

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
    if (hasGeometryMode) {
      patch.geometryMode = normalizeMemberGeometryMode(patch.geometryMode);
    }
    if (hasStartZ) {
      patch.startZ = sanitizeOptionalNumber(patch.startZ);
    }
    if (hasEndZ) {
      patch.endZ = sanitizeOptionalNumber(patch.endZ);
    }
    if (hasRoofRole) {
      patch.roofRole = sanitizeText(patch.roofRole) || null;
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

  addRoofEdgeMembers(surfaceId, options = {}) {
    const surface = this.getSurface(surfaceId);
    if (!surface || !isRoofSurfaceType(surface.type)) return [];
    const vertices = roofVertices3D(this, surface);
    if (vertices.length < 3) return [];

    const nodeTolerance = sanitizeNonNegativeNumber(options.nodeTolerance, 1);
    const nodes = vertices.map(v => this.findNodeAt(v.x, v.y, nodeTolerance) || this.addNode(v.x, v.y));
    let members = [];
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      if (this._hasSharedRoofGroupEdge(surface, a, b, nodeTolerance)) continue;
      const startNode = nodes[i];
      const endNode = nodes[(i + 1) % vertices.length];
      if (startNode.id === endNode.id) continue;
      const member = this.addMember(startNode.id, endNode.id, {
        type: 'beam',
        levelId: surface.levelId,
        geometryMode: 'explicit3d',
        startZ: a.z,
        endZ: b.z,
        roofRole: options.roofRole || 'roofEdge',
        sectionName: options.sectionName || this.getDefaultSectionName('member', 'beam'),
      });
      members.push(member);
    }
    for (const node of this._roofSlopeBoundaryNodes(surface, nodeTolerance)) {
      const split = this._splitRoofEdgeMemberAtNode(node, nodeTolerance);
      if (!split) continue;
      members = members.filter(member => member.id !== split.removedId);
      members.push(...split.members);
    }
    return members;
  }

  addRoofSlopeMembers(surfaceId, options = {}) {
    const surface = this.getSurface(surfaceId);
    if (!surface || !isRoofSurfaceType(surface.type)) return [];
    const segments = roofSlopeMemberSegments(surface, {
      spacing: options.spacing,
      minLength: options.minLength,
    });
    if (!segments.length) return [];

    const nodeTolerance = sanitizeNonNegativeNumber(options.nodeTolerance, 1);
    const members = [];
    for (const segment of segments) {
      const startPoint = roofPoint3D(this, surface, segment.start);
      const endPoint = roofPoint3D(this, surface, segment.end);
      const startNode = this.findNodeAt(startPoint.x, startPoint.y, nodeTolerance) || this.addNode(startPoint.x, startPoint.y);
      const endNode = this.findNodeAt(endPoint.x, endPoint.y, nodeTolerance) || this.addNode(endPoint.x, endPoint.y);
      if (startNode.id === endNode.id) continue;
      const member = this.addMember(startNode.id, endNode.id, {
        type: 'beam',
        levelId: surface.levelId,
        geometryMode: 'explicit3d',
        startZ: startPoint.z,
        endZ: endPoint.z,
        roofRole: options.roofRole || 'roofSlopeBeam',
        sectionName: options.sectionName || this.getDefaultSectionName('member', 'beam'),
      });
      this._splitRoofEdgeMemberAtNode(startNode, nodeTolerance);
      this._splitRoofEdgeMemberAtNode(endNode, nodeTolerance);
      members.push(member);
    }
    return members;
  }

  addRoofJointMembers(roofGroupId, options = {}) {
    const surfaces = this.getRoofGroupSurfaces(roofGroupId);
    if (surfaces.length < 2) return [];

    const nodeTolerance = sanitizeNonNegativeNumber(options.nodeTolerance, 1);
    const zTolerance = sanitizeNonNegativeNumber(options.zTolerance, 1);
    const members = [];
    for (let i = 0; i < surfaces.length; i++) {
      for (let j = i + 1; j < surfaces.length; j++) {
        for (const edge of this._sharedRoofEdges(surfaces[i], surfaces[j], nodeTolerance, zTolerance)) {
          const startNode = this.findNodeAt(edge.start.x, edge.start.y, nodeTolerance) || this.addNode(edge.start.x, edge.start.y);
          const endNode = this.findNodeAt(edge.end.x, edge.end.y, nodeTolerance) || this.addNode(edge.end.x, edge.end.y);
          if (startNode.id === endNode.id) continue;
          this._removeRoofEdgeMembersOnSegment(edge.start, edge.end, nodeTolerance);
          members.push(this.addMember(startNode.id, endNode.id, {
            type: 'beam',
            levelId: edge.surfaceA.levelId,
            geometryMode: 'explicit3d',
            startZ: edge.start.z,
            endZ: edge.end.z,
            roofRole: edge.roofRole,
            sectionName: options.sectionName || this.getDefaultSectionName('member', 'beam'),
          }));
        }
      }
    }
    return members;
  }

  addGableWallsFromRoofGroup(roofGroupId, options = {}) {
    const surfaces = this.getRoofGroupSurfaces(roofGroupId);
    if (!surfaces.length) return [];

    const nodeTolerance = sanitizeNonNegativeNumber(options.nodeTolerance, 1);
    const zTolerance = sanitizeNonNegativeNumber(options.zTolerance, 1);
    const bottomOffset = sanitizeNonNegativeNumber(options.bottomOffset, 0);
    const walls = [];
    for (const surface of surfaces) {
      const vertices = roofVertices3D(this, surface);
      if (vertices.length < 3) continue;
      const baseZ = this.getLevelZ(surface.levelId);
      for (let i = 0; i < vertices.length; i++) {
        const start = vertices[i];
        const end = vertices[(i + 1) % vertices.length];
        if (this._hasSharedRoofGroupEdge(surface, start, end, nodeTolerance)) continue;
        const startTopOffset = start.z - baseZ;
        const endTopOffset = end.z - baseZ;
        if (Math.abs(startTopOffset - endTopOffset) <= zTolerance) continue;
        if (Math.max(startTopOffset, endTopOffset) <= bottomOffset + zTolerance) continue;
        if (this._hasGableWallOnSegment(surface.levelId, start, end, nodeTolerance)) continue;
        const wall = this.addSurfaceLine(start.x, start.y, end.x, end.y, {
          type: 'gableWall',
          levelId: surface.levelId,
          topLevelId: surface.topLevelId || surface.levelId,
          heightMode: 'custom',
          bottomOffset,
          topOffset: Math.max(startTopOffset, endTopOffset),
          gableStartTopOffset: startTopOffset,
          gableEndTopOffset: endTopOffset,
          includeWind: hasOwn(options, 'includeWind') ? !!options.includeWind : true,
          includeSeismicWeight: hasOwn(options, 'includeSeismicWeight') ? !!options.includeSeismicWeight : false,
          unitWeight: sanitizeNonNegativeNumber(options.unitWeight, 0),
          sectionName: options.sectionName || this.getDefaultSectionName('surface', 'gableWall'),
        });
        walls.push(wall);
      }
    }
    return walls;
  }

  addEavesFromRoofGroup(roofGroupId, options = {}) {
    const surfaces = this.getRoofGroupSurfaces(roofGroupId);
    if (!surfaces.length) return [];

    const nodeTolerance = sanitizeNonNegativeNumber(options.nodeTolerance, 1);
    const depth = sanitizePositiveNumber(options.depth, 600);
    const eaves = [];
    for (const surface of surfaces) {
      const points = roofPlanPoints(surface);
      if (points.length < 3) continue;
      for (const edge of this._roofPlanEdges(surface)) {
        if (this._hasSharedRoofGroupEdge(surface, edge.start, edge.end, nodeTolerance)) continue;
        if (this._hasEaveOnInnerSegment(surface.levelId, edge.start, edge.end, nodeTolerance)) continue;
        const inward = edgeInwardNormal(edge.start, edge.end, points);
        const outward = { x: -inward.x, y: -inward.y };
        const outerStart = {
          x: edge.start.x + outward.x * depth,
          y: edge.start.y + outward.y * depth,
        };
        const outerEnd = {
          x: edge.end.x + outward.x * depth,
          y: edge.end.y + outward.y * depth,
        };
        const eave = this.addSurfacePolygon([
          edge.start,
          edge.end,
          outerEnd,
          outerStart,
        ], {
          type: 'eave',
          levelId: surface.levelId,
          topLevelId: surface.topLevelId || surface.levelId,
          loadDirection: surface.loadDirection,
          roofSlope: surface.roofSlope,
          roofDirection: surface.roofDirection,
          roofBaseOffset: surface.roofBaseOffset,
          includeWind: hasOwn(options, 'includeWind') ? !!options.includeWind : true,
          includeSeismicWeight: hasOwn(options, 'includeSeismicWeight') ? !!options.includeSeismicWeight : false,
          unitWeight: sanitizeNonNegativeNumber(options.unitWeight, 0),
          sectionName: options.sectionName || this.getDefaultSectionName('surface', 'eave'),
        });
        eaves.push(eave);
      }
    }
    return eaves;
  }

  addRoofPlanesFromSurface(sourceSurfaceId, options = {}) {
    const source = this.getSurface(sourceSurfaceId);
    const points = surfaceOutlinePoints(source);
    if (points.length < 3) return [];

    const pattern = normalizeRoofGenerationPattern(options.pattern);
    const direction = normalizeRoofDirection(options.roofDirection || this.surfaceDraftRoofDirection);
    const planes = roofGenerationPlanes(points, pattern, direction);
    if (!planes.length) return [];

    const levelId = options.levelId || source.topLevelId || source.levelId || this.activeLayerId || 'L0';
    const roofGroupId = sanitizeRoofGroupId(options.roofGroupId, this.surfaceDraftRoofGroupId || 'RG1');
    const common = {
      type: 'roof',
      levelId,
      topLevelId: options.topLevelId || levelId,
      roofSlope: sanitizeNonNegativeNumber(options.roofSlope, this.surfaceDraftRoofSlope || 0.3),
      roofBaseOffset: sanitizeNumber(options.roofBaseOffset, this.surfaceDraftRoofBaseOffset || 0),
      roofGroupId,
      includeWind: hasOwn(options, 'includeWind') ? !!options.includeWind : true,
      includeSeismicWeight: hasOwn(options, 'includeSeismicWeight') ? !!options.includeSeismicWeight : false,
      unitWeight: sanitizeNonNegativeNumber(options.unitWeight, 0),
      sectionName: options.sectionName || this.getDefaultSectionName('surface', 'roof'),
    };

    return planes.map(plane =>
      this.addSurfacePolygon(plane.points, {
        ...common,
        roofDirection: plane.roofDirection,
      })
    );
  }

  validateRoofGroup(roofGroupId, options = {}) {
    const surfaces = this.getRoofGroupSurfaces(roofGroupId);
    const tolerance = sanitizeNonNegativeNumber(options.tolerance, 1);
    const zTolerance = sanitizeNonNegativeNumber(options.zTolerance, 1);
    const issues = [];
    if (!surfaces.length) {
      issues.push({ code: 'roofGroupEmpty', roofGroupId: sanitizeRoofGroupId(roofGroupId, 'RG1') });
      return { roofGroupId: sanitizeRoofGroupId(roofGroupId, 'RG1'), surfaceCount: 0, issues };
    }

    for (const surface of surfaces) {
      const points = roofPlanPoints(surface);
      if (points.length < 3) {
        issues.push({ code: 'roofInvalidOutline', surfaceId: surface.id });
        continue;
      }
      if (polygonHasSelfIntersections(points, tolerance)) {
        issues.push({ code: 'roofSelfIntersection', surfaceId: surface.id });
      }
    }

    for (let i = 0; i < surfaces.length; i++) {
      for (let j = i + 1; j < surfaces.length; j++) {
        const edgePairs = matchingRoofPlanEdges(this._roofPlanEdges(surfaces[i]), this._roofPlanEdges(surfaces[j]), tolerance);
        for (const { edgeA } of edgePairs) {
          const startA = roofPoint3D(this, surfaces[i], edgeA.start);
          const endA = roofPoint3D(this, surfaces[i], edgeA.end);
          const startB = roofPoint3D(this, surfaces[j], edgeA.start);
          const endB = roofPoint3D(this, surfaces[j], edgeA.end);
          if (Math.abs(startA.z - startB.z) > zTolerance || Math.abs(endA.z - endB.z) > zTolerance) {
            issues.push({
              code: 'roofSharedEdgeHeightMismatch',
              surfaceAId: surfaces[i].id,
              surfaceBId: surfaces[j].id,
            });
          }
        }
      }
    }

    return {
      roofGroupId: sanitizeRoofGroupId(roofGroupId, 'RG1'),
      surfaceCount: surfaces.length,
      issues,
    };
  }

  removeRoofGeneratedElements(roofGroupId, options = {}) {
    const surfaces = this.getRoofGroupSurfaces(roofGroupId);
    if (!surfaces.length) return { members: 0, eaves: 0, gableWalls: 0, total: 0 };
    const tolerance = sanitizeNonNegativeNumber(options.tolerance, 1);
    const removeMembers = hasOwn(options, 'members') ? !!options.members : true;
    const removeEaves = hasOwn(options, 'eaves') ? !!options.eaves : true;
    const removeGableWalls = hasOwn(options, 'gableWalls') ? !!options.gableWalls : true;
    const outerEdges = this._roofGroupOuterEdges(surfaces, tolerance);

    let members = 0;
    if (removeMembers) {
      const memberIds = this.members
        .filter(member => member.roofRole && this._isRoofMemberInGroup(member, surfaces, tolerance))
        .map(member => member.id);
      for (const id of memberIds) {
        this.removeMember(id);
        members += 1;
      }
    }

    let eaves = 0;
    let gableWalls = 0;
    const surfaceIds = [];
    for (const surface of this.surfaces) {
      if (removeEaves && isEaveSurfaceType(surface.type) && this._isEaveOnRoofOuterEdges(surface, outerEdges, tolerance)) {
        surfaceIds.push(surface.id);
        eaves += 1;
      } else if (removeGableWalls && isGableWallSurfaceType(surface.type) && this._isGableOnRoofOuterEdges(surface, outerEdges, tolerance)) {
        surfaceIds.push(surface.id);
        gableWalls += 1;
      }
    }
    for (const id of surfaceIds) {
      this.removeSurface(id);
    }

    return {
      members,
      eaves,
      gableWalls,
      total: members + eaves + gableWalls,
    };
  }

  regenerateRoofGeneratedElements(roofGroupId, options = {}) {
    const removed = this.removeRoofGeneratedElements(roofGroupId, options);
    const surfaces = this.getRoofGroupSurfaces(roofGroupId);
    const spacing = sanitizePositiveNumber(options.spacing, 910);
    const depth = sanitizePositiveNumber(options.depth, 600);
    const generated = {
      roofEdges: 0,
      roofSlopeBeams: 0,
      roofJoints: 0,
      eaves: 0,
      gableWalls: 0,
    };
    for (const surface of surfaces) {
      generated.roofEdges += this.addRoofEdgeMembers(surface.id).length;
      generated.roofSlopeBeams += this.addRoofSlopeMembers(surface.id, { spacing }).length;
    }
    generated.roofJoints = this.addRoofJointMembers(roofGroupId).length;
    generated.eaves = this.addEavesFromRoofGroup(roofGroupId, { depth }).length;
    generated.gableWalls = this.addGableWallsFromRoofGroup(roofGroupId).length;
    const generatedTotal = Object.values(generated).reduce((sum, count) => sum + count, 0);
    return {
      removed,
      generated,
      generatedTotal,
      total: removed.total + generatedTotal,
    };
  }

  listRoofGroups() {
    const groups = new Map();
    for (const surface of this.surfaces) {
      if (!isRoofSurfaceType(surface.type)) continue;
      const groupId = sanitizeRoofGroupId(surface.roofGroupId, 'RG1');
      const group = groups.get(groupId) || { id: groupId, surfaces: [] };
      group.surfaces.push(surface);
      groups.set(groupId, group);
    }
    return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  getRoofGroupSurfaces(groupId) {
    const normalizedGroupId = sanitizeRoofGroupId(groupId, 'RG1');
    return this.surfaces.filter(surface =>
      isRoofSurfaceType(surface.type) &&
      sanitizeRoofGroupId(surface.roofGroupId, 'RG1') === normalizedGroupId
    );
  }

  _sharedRoofEdges(surfaceA, surfaceB, tolerance = 1, zTolerance = 1) {
    const edges = [];
    const edgesA = this._roofPlanEdges(surfaceA);
    const edgesB = this._roofPlanEdges(surfaceB);
    for (const edgeA of edgesA) {
      for (const edgeB of edgesB) {
        if (!sameSegment(edgeA.start, edgeA.end, edgeB.start, edgeB.end, tolerance)) continue;
        const startA = roofPoint3D(this, surfaceA, edgeA.start);
        const endA = roofPoint3D(this, surfaceA, edgeA.end);
        const startB = roofPoint3D(this, surfaceB, edgeA.start);
        const endB = roofPoint3D(this, surfaceB, edgeA.end);
        if (Math.abs(startA.z - startB.z) > zTolerance || Math.abs(endA.z - endB.z) > zTolerance) continue;
        const start = { x: edgeA.start.x, y: edgeA.start.y, z: (startA.z + startB.z) / 2 };
        const end = { x: edgeA.end.x, y: edgeA.end.y, z: (endA.z + endB.z) / 2 };
        edges.push({
          surfaceA,
          surfaceB,
          start,
          end,
          roofRole: this._classifyRoofJoint(surfaceA, surfaceB, start, end, zTolerance),
        });
      }
    }
    return edges;
  }

  _roofPlanEdges(surface) {
    const points = roofPlanPoints(surface);
    return points.map((start, index) => ({
      start,
      end: points[(index + 1) % points.length],
    }));
  }

  _hasSharedRoofGroupEdge(surface, start, end, tolerance = 1) {
    if (!isRoofSurfaceType(surface.type)) return false;
    const groupSurfaces = this.getRoofGroupSurfaces(surface.roofGroupId);
    return groupSurfaces.some(other => {
      if (other.id === surface.id) return false;
      return this._roofPlanEdges(other).some(edge =>
        sameSegment(start, end, edge.start, edge.end, tolerance)
      );
    });
  }

  _hasGableWallOnSegment(levelId, start, end, tolerance = 1) {
    return this.surfaces.some(surface => (
      isGableWallSurfaceType(surface.type) &&
      surface.levelId === levelId &&
      sameSegment(
        { x: surface.x1, y: surface.y1 },
        { x: surface.x2, y: surface.y2 },
        start,
        end,
        tolerance
      )
    ));
  }

  _hasEaveOnInnerSegment(levelId, start, end, tolerance = 1) {
    return this.surfaces.some(surface => {
      if (!isEaveSurfaceType(surface.type) || surface.levelId !== levelId) return false;
      const points = roofPlanPoints(surface);
      if (points.length < 2) return false;
      return sameSegment(start, end, points[0], points[1], tolerance);
    });
  }

  _roofGroupOuterEdges(surfaces, tolerance = 1) {
    const edges = [];
    for (const surface of surfaces) {
      for (const edge of this._roofPlanEdges(surface)) {
        const isShared = surfaces.some(other =>
          other.id !== surface.id &&
          this._roofPlanEdges(other).some(otherEdge =>
            sameSegment(edge.start, edge.end, otherEdge.start, otherEdge.end, tolerance)
          )
        );
        if (!isShared) edges.push({ ...edge, surface });
      }
    }
    return edges;
  }

  _isRoofMemberInGroup(member, surfaces, tolerance = 1) {
    const start = this.getNode(member.startNodeId);
    const end = this.getNode(member.endNodeId);
    if (!start || !end) return false;
    return surfaces.some(surface =>
      isPlanPointInOrOnRoofSurface(start, surface, tolerance) &&
      isPlanPointInOrOnRoofSurface(end, surface, tolerance)
    );
  }

  _isEaveOnRoofOuterEdges(surface, outerEdges, tolerance = 1) {
    const points = roofPlanPoints(surface);
    if (points.length < 2) return false;
    return outerEdges.some(edge => (
      surface.levelId === edge.surface.levelId &&
      sameSegment(points[0], points[1], edge.start, edge.end, tolerance)
    ));
  }

  _isGableOnRoofOuterEdges(surface, outerEdges, tolerance = 1) {
    return outerEdges.some(edge => (
      surface.levelId === edge.surface.levelId &&
      sameSegment(
        { x: surface.x1, y: surface.y1 },
        { x: surface.x2, y: surface.y2 },
        edge.start,
        edge.end,
        tolerance
      )
    ));
  }

  _removeRoofEdgeMembersOnSegment(start, end, tolerance = 1) {
    const removedIds = new Set();
    this.members = this.members.filter(member => {
      if (member.roofRole !== 'roofEdge' || member.geometryMode !== 'explicit3d') return true;
      const startNode = this.getNode(member.startNodeId);
      const endNode = this.getNode(member.endNodeId);
      if (!startNode || !endNode) return true;
      const matches = sameSegment(start, end, startNode, endNode, tolerance);
      if (matches) removedIds.add(member.id);
      return !matches;
    });
    if (removedIds.has(this.selectedMemberId)) this.selectedMemberId = null;
  }

  _classifyRoofJoint(surfaceA, surfaceB, start, end, zTolerance = 1) {
    const edgeZ = (start.z + end.z) / 2;
    const deltaA = this._roofInteriorZDelta(surfaceA, start, end, edgeZ);
    const deltaB = this._roofInteriorZDelta(surfaceB, start, end, edgeZ);
    if (deltaA > zTolerance && deltaB > zTolerance) {
      return Math.abs(start.z - end.z) <= zTolerance ? 'roofRidge' : 'roofHip';
    }
    if (deltaA < -zTolerance && deltaB < -zTolerance) return 'roofValley';
    return 'roofJoint';
  }

  _roofInteriorZDelta(surface, start, end, edgeZ) {
    const sample = this._roofInteriorSamplePoint(surface, start, end);
    if (!sample) return 0;
    return edgeZ - roofPoint3D(this, surface, sample).z;
  }

  _roofInteriorSamplePoint(surface, start, end) {
    const points = roofPlanPoints(surface);
    if (points.length < 3) return null;
    const mid = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };
    const edge = this._roofPlanEdges(surface).find(candidate =>
      sameSegment(candidate.start, candidate.end, start, end, 1)
    );
    if (edge) {
      const inward = edgeInwardNormal(edge.start, edge.end, points);
      const length = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
      const distances = uniquePositiveNumbers([
        Math.min(250, length * 0.25),
        Math.min(100, length * 0.1),
        10,
        1,
      ]);
      for (const distance of distances) {
        const sample = {
          x: mid.x + inward.x * distance,
          y: mid.y + inward.y * distance,
        };
        if (isInteriorPlanPoint(sample, points, 0.001)) return sample;
      }
    }

    const centroid = polygonVertexCentroid(points);
    if (isInteriorPlanPoint(centroid, points, 0.001)) return centroid;
    return null;
  }

  _splitRoofEdgeMemberAtNode(node, tolerance = 1) {
    const edge = this.members.find(member => {
      if (member.roofRole !== 'roofEdge' || member.geometryMode !== 'explicit3d') return false;
      if (member.startNodeId === node.id || member.endNodeId === node.id) return false;
      const startNode = this.getNode(member.startNodeId);
      const endNode = this.getNode(member.endNodeId);
      if (!startNode || !endNode) return false;
      const t = segmentParameter(node.x, node.y, startNode.x, startNode.y, endNode.x, endNode.y);
      return t > 0.000001 && t < 0.999999 &&
        pointToSegmentDist(node.x, node.y, startNode.x, startNode.y, endNode.x, endNode.y) <= tolerance;
    });
    if (!edge) return null;

    const startNode = this.getNode(edge.startNodeId);
    const endNode = this.getNode(edge.endNodeId);
    const t = segmentParameter(node.x, node.y, startNode.x, startNode.y, endNode.x, endNode.y);
    const startZ = this._memberEndpointZ(edge, 'startZ');
    const endZ = this._memberEndpointZ(edge, 'endZ');
    const splitZ = startZ + (endZ - startZ) * t;
    this.members = this.members.filter(member => member.id !== edge.id);
    if (this.selectedMemberId === edge.id) this.selectedMemberId = null;
    const first = this._addRoofEdgeSegment(edge, edge.startNodeId, node.id, startZ, splitZ);
    const second = this._addRoofEdgeSegment(edge, node.id, edge.endNodeId, splitZ, endZ);
    return {
      removedId: edge.id,
      members: [first, second],
    };
  }

  _addRoofEdgeSegment(source, startNodeId, endNodeId, startZ, endZ) {
    return this.addMember(startNodeId, endNodeId, {
      type: source.type,
      levelId: source.levelId,
      topLevelId: source.topLevelId,
      geometryMode: 'explicit3d',
      startZ,
      endZ,
      roofRole: source.roofRole,
      sectionName: source.sectionName,
      bracePattern: source.bracePattern,
      endI: source.endI,
      endJ: source.endJ,
    });
  }

  _memberEndpointZ(member, key) {
    const value = Number(member[key]);
    if (Number.isFinite(value)) return value;
    const level = this.levels.find(l => l.id === member.levelId);
    return sanitizeNumber(level?.z, 0);
  }

  _roofSlopeBoundaryNodes(surface, tolerance = 1) {
    const nodeIds = new Set();
    for (const member of this.members) {
      if (member.roofRole !== 'roofSlopeBeam' || member.geometryMode !== 'explicit3d') continue;
      for (const nodeId of [member.startNodeId, member.endNodeId]) {
        const node = this.getNode(nodeId);
        if (node && this._isNodeOnRoofBoundary(surface, node, tolerance)) {
          nodeIds.add(nodeId);
        }
      }
    }
    return [...nodeIds].map(id => this.getNode(id)).filter(Boolean);
  }

  _isNodeOnRoofBoundary(surface, node, tolerance = 1) {
    const points = roofPlanPoints(surface);
    if (points.length < 3) return false;
    return points.some((point, index) => {
      const next = points[(index + 1) % points.length];
      return pointToSegmentDist(node.x, node.y, point.x, point.y, next.x, next.y) <= tolerance;
    });
  }

  // --- Surfaces ---

  nextSurfaceId() {
    this._surfaceCounter++;
    return `S${this._surfaceCounter}`;
  }

  addSurfaceRect(x1, y1, x2, y2, options = {}) {
    const id = this.nextSurfaceId();
    const type = options.type || 'floor';
    const levelId = options.levelId || this.activeLayerId || 'L0';
    const topLevelId = options.topLevelId || this.surfaceDraftTopLayerId || this.getNextLevelId(levelId) || levelId;
    const surface = {
      id,
      type,
      sectionName: sanitizeText(options.sectionName) || '',
      levelId,
      topLevelId,
      loadDirection: options.loadDirection || 'twoWay', // x | y | twoWay
      color: options.color || (options.type === 'wall' || options.type === 'exteriorWall' ? '#b57a6b' : '#67a9cf'),
      x1: Math.min(x1, x2),
      y1: Math.min(y1, y2),
      x2: Math.max(x1, x2),
      y2: Math.max(y1, y2),
      points: null,
      shape: 'rect',
      ...this._normalizeSurfaceHeightAndWeight(type, levelId, topLevelId, options),
      ...this._normalizeSurfaceRoof(type, options),
    };
    Object.assign(surface, this._normalizeSurfaceGable(type, levelId, topLevelId, { ...surface, ...options }));
    this._ensureSurfaceSection(surface, surface.sectionName);
    this.surfaces.push(surface);
    return surface;
  }

  addSurfaceLine(x1, y1, x2, y2, options = {}) {
    const id = this.nextSurfaceId();
    const type = options.type || 'wall';
    const levelId = options.levelId || this.activeLayerId || 'L0';
    const topLevelId = options.topLevelId || this.getNextLevelId(levelId) || this.surfaceDraftTopLayerId || levelId;
    const surface = {
      id,
      type,
      sectionName: sanitizeText(options.sectionName) || '',
      levelId,
      topLevelId,
      loadDirection: 'twoWay',
      color: options.color || '#b57a6b',
      x1, y1, x2, y2,
      points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
      shape: 'line',
      ...this._normalizeSurfaceHeightAndWeight(type, levelId, topLevelId, options),
      ...this._normalizeSurfaceRoof(type, options),
    };
    Object.assign(surface, this._normalizeSurfaceGable(type, levelId, topLevelId, { ...surface, ...options }));
    this._ensureSurfaceSection(surface, surface.sectionName);
    this.surfaces.push(surface);
    return surface;
  }

  addSurfacePolygon(points, options = {}) {
    if (!Array.isArray(points) || points.length < 3) return null;
    const id = this.nextSurfaceId();
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const type = options.type || 'wall';
    const levelId = options.levelId || this.activeLayerId || 'L0';
    const topLevelId = options.topLevelId || this.surfaceDraftTopLayerId || this.getNextLevelId(levelId) || levelId;
    const surface = {
      id,
      type,
      sectionName: sanitizeText(options.sectionName) || '',
      levelId,
      topLevelId,
      loadDirection: options.loadDirection || 'twoWay',
      color: options.color || (options.type === 'wall' || options.type === 'exteriorWall' ? '#b57a6b' : '#67a9cf'),
      x1: Math.min(...xs),
      y1: Math.min(...ys),
      x2: Math.max(...xs),
      y2: Math.max(...ys),
      points: points.map(p => ({ x: p.x, y: p.y })),
      shape: 'polygon',
      ...this._normalizeSurfaceHeightAndWeight(type, levelId, topLevelId, options),
      ...this._normalizeSurfaceRoof(type, options),
    };
    Object.assign(surface, this._normalizeSurfaceGable(type, levelId, topLevelId, { ...surface, ...options }));
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
    const hasHeightMode = hasOwn(patch, 'heightMode');
    const hasBottomOffset = hasOwn(patch, 'bottomOffset');
    const hasTopOffset = hasOwn(patch, 'topOffset');
    const hasUnitWeight = hasOwn(patch, 'unitWeight');
    const hasIncludeWind = hasOwn(patch, 'includeWind');
    const hasIncludeSeismicWeight = hasOwn(patch, 'includeSeismicWeight');
    const hasRoofSlope = hasOwn(patch, 'roofSlope');
    const hasRoofDirection = hasOwn(patch, 'roofDirection');
    const hasRoofBaseOffset = hasOwn(patch, 'roofBaseOffset');
    const hasRoofGroupId = hasOwn(patch, 'roofGroupId');
    const hasGableStartTopOffset = hasOwn(patch, 'gableStartTopOffset');
    const hasGableEndTopOffset = hasOwn(patch, 'gableEndTopOffset');
    if (hasColor) {
      // Color is section-driven, so direct color patching is ignored.
      delete patch.color;
    }
    if (hasHeightMode) {
      patch.heightMode = normalizeSurfaceHeightMode(patch.heightMode);
    }
    if (hasBottomOffset) {
      patch.bottomOffset = sanitizeNumber(patch.bottomOffset, surface.bottomOffset || 0);
    }
    if (hasTopOffset) {
      patch.topOffset = sanitizeNumber(patch.topOffset, surface.topOffset || 0);
    }
    if (hasUnitWeight) {
      patch.unitWeight = sanitizeNonNegativeNumber(patch.unitWeight, surface.unitWeight || 0);
    }
    if (hasIncludeWind) {
      patch.includeWind = !!patch.includeWind;
    }
    if (hasIncludeSeismicWeight) {
      patch.includeSeismicWeight = !!patch.includeSeismicWeight;
    }
    if (hasRoofSlope) {
      patch.roofSlope = sanitizeNonNegativeNumber(patch.roofSlope, surface.roofSlope || 0);
    }
    if (hasRoofDirection) {
      patch.roofDirection = normalizeRoofDirection(patch.roofDirection);
    }
    if (hasRoofBaseOffset) {
      patch.roofBaseOffset = sanitizeNumber(patch.roofBaseOffset, surface.roofBaseOffset || 0);
    }
    if (hasRoofGroupId) {
      patch.roofGroupId = sanitizeRoofGroupId(patch.roofGroupId, surface.roofGroupId || 'RG1');
    }
    const currentGableStartTopOffset = hasOwn(surface, 'gableStartTopOffset')
      ? surface.gableStartTopOffset
      : surface.topOffset;
    const currentGableEndTopOffset = hasOwn(surface, 'gableEndTopOffset')
      ? surface.gableEndTopOffset
      : surface.topOffset;
    if (hasGableStartTopOffset) {
      patch.gableStartTopOffset = sanitizeNumber(patch.gableStartTopOffset, currentGableStartTopOffset);
    }
    if (hasGableEndTopOffset) {
      patch.gableEndTopOffset = sanitizeNumber(patch.gableEndTopOffset, currentGableEndTopOffset);
    }

    const prospectiveType = patch.type || surface.type;
    if (!isSlopedSurfaceType(prospectiveType)) {
      delete patch.roofSlope;
      delete patch.roofDirection;
      delete patch.roofBaseOffset;
    }
    if (!isRoofSurfaceType(prospectiveType)) {
      delete patch.roofGroupId;
    }
    if (!isGableWallSurfaceType(prospectiveType)) {
      delete patch.gableStartTopOffset;
      delete patch.gableEndTopOffset;
    }
    if (isWallSurfaceType(prospectiveType) && (hasBottomOffset || hasTopOffset)) {
      const prospectiveBottom = hasBottomOffset ? patch.bottomOffset : surface.bottomOffset;
      const prospectiveTop = hasTopOffset ? patch.topOffset : surface.topOffset;
      if (prospectiveTop <= prospectiveBottom) {
        if (hasBottomOffset) delete patch.bottomOffset;
        if (hasTopOffset) delete patch.topOffset;
      }
    }
    if (isGableWallSurfaceType(prospectiveType)) {
      const prospectiveBottom = hasBottomOffset ? patch.bottomOffset : surface.bottomOffset;
      if (hasTopOffset && !hasGableStartTopOffset && !hasGableEndTopOffset) {
        patch.gableStartTopOffset = patch.topOffset;
        patch.gableEndTopOffset = patch.topOffset;
      }
      const prospectiveStart = hasOwn(patch, 'gableStartTopOffset') ? patch.gableStartTopOffset : surface.gableStartTopOffset;
      const prospectiveEnd = hasOwn(patch, 'gableEndTopOffset') ? patch.gableEndTopOffset : surface.gableEndTopOffset;
      if (prospectiveStart < prospectiveBottom) delete patch.gableStartTopOffset;
      if (prospectiveEnd < prospectiveBottom) delete patch.gableEndTopOffset;
    }

    Object.assign(surface, patch);
    if (isGableWallSurfaceType(surface.type) && (
      hasType || hasHeightMode || hasBottomOffset || hasTopOffset || hasGableStartTopOffset || hasGableEndTopOffset
    )) {
      Object.assign(surface, this._normalizeSurfaceGable(surface.type, surface.levelId, surface.topLevelId, surface));
    }
    if (hasHeightMode && surface.heightMode !== 'custom' && isWallSurfaceType(surface.type) && !isGableWallSurfaceType(surface.type)) {
      Object.assign(surface, this._normalizeSurfaceHeightAndWeight(surface.type, surface.levelId, surface.topLevelId, surface));
    }
    if (hasType) {
      if (isSlopedSurfaceType(surface.type)) {
        Object.assign(surface, this._normalizeSurfaceRoof(surface.type, surface));
      } else {
        delete surface.roofSlope;
        delete surface.roofDirection;
        delete surface.roofBaseOffset;
      }
      if (!isRoofSurfaceType(surface.type)) {
        delete surface.roofGroupId;
      }
      if (!isGableWallSurfaceType(surface.type)) {
        delete surface.gableStartTopOffset;
        delete surface.gableEndTopOffset;
      }
    }
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
      const isWallType = isWallSurfaceType(s.type);
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

  _usedSectionCatalog() {
    const usedNames = new Set();
    for (const m of this.members) {
      if (m.sectionName) usedNames.add(m.sectionName);
    }
    for (const s of this.surfaces) {
      if (s.sectionName) usedNames.add(s.sectionName);
    }
    return this.sectionCatalog.filter(s => s.isDefault || usedNames.has(s.name));
  }

  _usedSpringCatalog() {
    const usedSymbols = new Set();
    for (const m of this.members) {
      if (m.endI?.condition === 'spring' && m.endI.springSymbol) usedSymbols.add(m.endI.springSymbol);
      if (m.endJ?.condition === 'spring' && m.endJ.springSymbol) usedSymbols.add(m.endJ.springSymbol);
    }
    return this.springCatalog.filter(s => s.isDefault || usedSymbols.has(s.symbol));
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      meta: { ...this.meta },
      settings: { ...this.settings },
      levels: this.levels.map(l => ({ ...l })),
      nodes: this.nodes.map(n => ({ ...n })),
      sectionCatalog: this._usedSectionCatalog().map(s => ({ ...s })),
      springCatalog: this._usedSpringCatalog().map(s => ({ ...s })),
      members: this.members.map(m => ({
        type: m.type,
        startNodeId: m.startNodeId,
        endNodeId: m.endNodeId,
        sectionName: m.sectionName,
        levelId: m.levelId,
        color: m.color,
        topLevelId: m.topLevelId,
        geometryMode: m.geometryMode,
        startZ: m.startZ,
        endZ: m.endZ,
        roofRole: m.roofRole,
        bracePattern: m.bracePattern,
        endI: { ...m.endI },
        endJ: { ...m.endJ },
      })),
      surfaces: this.surfaces.map(s => {
        const surface = {
          type: s.type,
          sectionName: s.sectionName,
          levelId: s.levelId,
          topLevelId: s.topLevelId,
          loadDirection: s.loadDirection,
          heightMode: s.heightMode,
          bottomOffset: s.bottomOffset,
          topOffset: s.topOffset,
          includeWind: s.includeWind,
          includeSeismicWeight: s.includeSeismicWeight,
          unitWeight: s.unitWeight,
          color: s.color,
          x1: s.x1,
          y1: s.y1,
          x2: s.x2,
          y2: s.y2,
          shape: s.shape,
          points: Array.isArray(s.points) ? s.points.map(p => ({ ...p })) : null,
        };
        if (isSlopedSurfaceType(s.type)) {
          surface.roofSlope = s.roofSlope;
          surface.roofDirection = s.roofDirection;
          surface.roofBaseOffset = s.roofBaseOffset;
        }
        if (isRoofSurfaceType(s.type)) {
          surface.roofGroupId = sanitizeRoofGroupId(s.roofGroupId, 'RG1');
        }
        if (isGableWallSurfaceType(s.type)) {
          surface.gableStartTopOffset = s.gableStartTopOffset;
          surface.gableEndTopOffset = s.gableEndTopOffset;
        }
        return surface;
      }),
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
    if (!data || !isSupportedSchemaVersion(version)) {
      throw new Error('Unsupported schema version');
    }
    this.schemaVersion = CURRENT_SCHEMA_VERSION;
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
    this.surfaceDraftHeightMode = 'full';
    this.surfaceDraftBottomOffset = 0;
    this.surfaceDraftTopOffset = 1200;
    this.surfaceDraftRoofSlope = 0.3;
    this.surfaceDraftRoofDirection = 'xPlus';
    this.surfaceDraftRoofBaseOffset = 0;
    this.surfaceDraftRoofGroupId = 'RG1';
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
    memo: sanitizeText(entry.memo) || '',
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

function isSupportedSchemaVersion(version) {
  return Number.isInteger(version) && SUPPORTED_SCHEMA_VERSIONS.has(version);
}

function sanitizePositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sanitizeNonNegativeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function sanitizeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeRoofGroupId(value, fallback = 'RG1') {
  return sanitizeText(value) || sanitizeText(fallback) || 'RG1';
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
    if (normalizedType === 'floor') return '#67a9cf';
    if (normalizedType === 'roof') return '#8b6f47';
    if (normalizedType === 'eave') return '#4f9a8a';
    if (normalizedType === 'gableWall') return '#bf6f5e';
    return '#b57a6b';
  }
  return '#666666';
}

function normalizeSurfaceHeightMode(value) {
  const text = sanitizeText(value);
  return SURFACE_HEIGHT_MODES.has(text) ? text : 'full';
}

function normalizeMemberGeometryMode(value) {
  const text = sanitizeText(value);
  return MEMBER_GEOMETRY_MODES.has(text) ? text : 'level';
}

function normalizeRoofGenerationPattern(value) {
  const text = sanitizeText(value);
  if (text === 'gableX' || text === 'gableY' || text === 'hip') return text;
  return 'single';
}

export function isWallSurfaceType(type) {
  return type === 'wall' || type === 'exteriorWall' || type === 'gableWall';
}

export function isRoofSurfaceType(type) {
  return type === 'roof';
}

export function isGableWallSurfaceType(type) {
  return type === 'gableWall';
}

export function isEaveSurfaceType(type) {
  return type === 'eave';
}

export function isSlopedSurfaceType(type) {
  return type === 'roof' || type === 'eave';
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

function segmentParameter(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  return ((px - ax) * dx + (py - ay) * dy) / lenSq;
}

function sameSegment(a1, a2, b1, b2, tolerance = 1) {
  return (
    pointsClose(a1, b1, tolerance) && pointsClose(a2, b2, tolerance)
  ) || (
    pointsClose(a1, b2, tolerance) && pointsClose(a2, b1, tolerance)
  );
}

function pointsClose(a, b, tolerance = 1) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

function surfaceOutlinePoints(surface) {
  if (!surface) return [];
  if (surface.shape === 'polygon' && Array.isArray(surface.points) && surface.points.length >= 3) {
    return surface.points.map(point => ({
      x: sanitizeNumber(point.x, 0),
      y: sanitizeNumber(point.y, 0),
    }));
  }
  if (surface.shape === 'rect') {
    const x1 = sanitizeNumber(surface.x1, 0);
    const y1 = sanitizeNumber(surface.y1, 0);
    const x2 = sanitizeNumber(surface.x2, x1);
    const y2 = sanitizeNumber(surface.y2, y1);
    if (Math.abs(x2 - x1) <= 0.001 || Math.abs(y2 - y1) <= 0.001) return [];
    return [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ];
  }
  return [];
}

function roofGenerationPlanes(points, pattern, singleDirection) {
  if (pattern === 'single') {
    return [{ points: points.map(point => ({ ...point })), roofDirection: singleDirection }];
  }

  const rect = axisAlignedRectangleFromPoints(points);
  if (!rect) return [];
  if (pattern === 'gableX') return gableXRoofPlanes(rect);
  if (pattern === 'gableY') return gableYRoofPlanes(rect);
  if (pattern === 'hip') return hipRoofPlanes(rect);
  return [];
}

function matchingRoofPlanEdges(edgesA, edgesB, tolerance = 1) {
  const matches = [];
  for (const edgeA of edgesA) {
    for (const edgeB of edgesB) {
      if (sameSegment(edgeA.start, edgeA.end, edgeB.start, edgeB.end, tolerance)) {
        matches.push({ edgeA, edgeB });
      }
    }
  }
  return matches;
}

function polygonHasSelfIntersections(points, tolerance = 1) {
  for (let i = 0; i < points.length; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % points.length];
    for (let j = i + 1; j < points.length; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (i === 0 && j === points.length - 1) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % points.length];
      if (segmentsIntersect(a1, a2, b1, b2, tolerance)) return true;
    }
  }
  return false;
}

function segmentsIntersect(a1, a2, b1, b2, tolerance = 1) {
  const d1 = segmentDirection(a1, a2, b1);
  const d2 = segmentDirection(a1, a2, b2);
  const d3 = segmentDirection(b1, b2, a1);
  const d4 = segmentDirection(b1, b2, a2);
  if (((d1 > tolerance && d2 < -tolerance) || (d1 < -tolerance && d2 > tolerance)) &&
    ((d3 > tolerance && d4 < -tolerance) || (d3 < -tolerance && d4 > tolerance))) {
    return true;
  }
  return pointToSegmentDist(b1.x, b1.y, a1.x, a1.y, a2.x, a2.y) <= tolerance ||
    pointToSegmentDist(b2.x, b2.y, a1.x, a1.y, a2.x, a2.y) <= tolerance ||
    pointToSegmentDist(a1.x, a1.y, b1.x, b1.y, b2.x, b2.y) <= tolerance ||
    pointToSegmentDist(a2.x, a2.y, b1.x, b1.y, b2.x, b2.y) <= tolerance;
}

function segmentDirection(a, b, point) {
  return (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
}

function isPlanPointInOrOnRoofSurface(point, surface, tolerance = 1) {
  const points = roofPlanPoints(surface);
  if (points.length < 3) return false;
  if (isInteriorPlanPoint(point, points, tolerance)) return true;
  return points.some((start, index) => {
    const end = points[(index + 1) % points.length];
    return pointToSegmentDist(point.x, point.y, start.x, start.y, end.x, end.y) <= tolerance;
  });
}

function axisAlignedRectangleFromPoints(points) {
  if (!Array.isArray(points) || points.length !== 4) return null;
  const xs = [...new Set(points.map(point => roundedKey(point.x)))].map(Number).sort((a, b) => a - b);
  const ys = [...new Set(points.map(point => roundedKey(point.y)))].map(Number).sort((a, b) => a - b);
  if (xs.length !== 2 || ys.length !== 2) return null;
  const [minX, maxX] = xs;
  const [minY, maxY] = ys;
  if (maxX - minX <= 0.001 || maxY - minY <= 0.001) return null;
  const corners = new Set([
    `${roundedKey(minX)},${roundedKey(minY)}`,
    `${roundedKey(maxX)},${roundedKey(minY)}`,
    `${roundedKey(maxX)},${roundedKey(maxY)}`,
    `${roundedKey(minX)},${roundedKey(maxY)}`,
  ]);
  const isRectangle = points.every(point => corners.has(`${roundedKey(point.x)},${roundedKey(point.y)}`));
  return isRectangle ? { minX, maxX, minY, maxY } : null;
}

function gableXRoofPlanes(rect) {
  const midX = (rect.minX + rect.maxX) / 2;
  return [
    {
      roofDirection: 'xPlus',
      points: [
        { x: rect.minX, y: rect.minY },
        { x: midX, y: rect.minY },
        { x: midX, y: rect.maxY },
        { x: rect.minX, y: rect.maxY },
      ],
    },
    {
      roofDirection: 'xMinus',
      points: [
        { x: midX, y: rect.minY },
        { x: rect.maxX, y: rect.minY },
        { x: rect.maxX, y: rect.maxY },
        { x: midX, y: rect.maxY },
      ],
    },
  ];
}

function gableYRoofPlanes(rect) {
  const midY = (rect.minY + rect.maxY) / 2;
  return [
    {
      roofDirection: 'yPlus',
      points: [
        { x: rect.minX, y: rect.minY },
        { x: rect.maxX, y: rect.minY },
        { x: rect.maxX, y: midY },
        { x: rect.minX, y: midY },
      ],
    },
    {
      roofDirection: 'yMinus',
      points: [
        { x: rect.minX, y: midY },
        { x: rect.maxX, y: midY },
        { x: rect.maxX, y: rect.maxY },
        { x: rect.minX, y: rect.maxY },
      ],
    },
  ];
}

function hipRoofPlanes(rect) {
  const width = rect.maxX - rect.minX;
  const height = rect.maxY - rect.minY;
  const midX = (rect.minX + rect.maxX) / 2;
  const midY = (rect.minY + rect.maxY) / 2;

  if (width >= height) {
    const inset = height / 2;
    const ridgeStart = { x: Math.min(midX, rect.minX + inset), y: midY };
    const ridgeEnd = { x: Math.max(midX, rect.maxX - inset), y: midY };
    return [
      {
        roofDirection: 'yPlus',
        points: [
          { x: rect.minX, y: rect.minY },
          { x: rect.maxX, y: rect.minY },
          ridgeEnd,
          ridgeStart,
        ],
      },
      {
        roofDirection: 'xMinus',
        points: [
          { x: rect.maxX, y: rect.minY },
          { x: rect.maxX, y: rect.maxY },
          ridgeEnd,
        ],
      },
      {
        roofDirection: 'yMinus',
        points: [
          { x: rect.maxX, y: rect.maxY },
          { x: rect.minX, y: rect.maxY },
          ridgeStart,
          ridgeEnd,
        ],
      },
      {
        roofDirection: 'xPlus',
        points: [
          { x: rect.minX, y: rect.maxY },
          { x: rect.minX, y: rect.minY },
          ridgeStart,
        ],
      },
    ];
  }

  const inset = width / 2;
  const ridgeStart = { x: midX, y: Math.min(midY, rect.minY + inset) };
  const ridgeEnd = { x: midX, y: Math.max(midY, rect.maxY - inset) };
  return [
    {
      roofDirection: 'xPlus',
      points: [
        { x: rect.minX, y: rect.minY },
        ridgeStart,
        ridgeEnd,
        { x: rect.minX, y: rect.maxY },
      ],
    },
    {
      roofDirection: 'yPlus',
      points: [
        { x: rect.minX, y: rect.minY },
        { x: rect.maxX, y: rect.minY },
        ridgeStart,
      ],
    },
    {
      roofDirection: 'xMinus',
      points: [
        { x: rect.maxX, y: rect.minY },
        { x: rect.maxX, y: rect.maxY },
        ridgeEnd,
        ridgeStart,
      ],
    },
    {
      roofDirection: 'yMinus',
      points: [
        { x: rect.maxX, y: rect.maxY },
        { x: rect.minX, y: rect.maxY },
        ridgeEnd,
      ],
    },
  ];
}

function roundedKey(value) {
  return String(Number(sanitizeNumber(value, 0).toFixed(6)));
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
