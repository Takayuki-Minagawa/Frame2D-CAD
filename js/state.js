// state.js - Data model and state management

import {
  DEFAULT_ROOF_GROUP_ID,
  DEFAULT_ROOF_SLOPE_RATIO,
  DEFAULT_SECTION_B_MM,
  DEFAULT_SECTION_H_MM,
  DEFAULT_STORY_HEIGHT_MM,
  HANGING_WALL_DEPTH_MM,
  HIT_TOLERANCE_MM,
  WAIST_WALL_TOP_OFFSET_MM,
  WALL_DISPLAY_OFFSET_MM,
} from './constants.js';
import {
  finiteNumber as sanitizeNumber,
  nonNegativeNumber as sanitizeNonNegativeNumber,
  offsetPolygonOutward,
  pointInPolygon,
  pointToSegmentDist,
  positiveNumber as sanitizePositiveNumber,
} from './geometry-utils.js';
import {
  createDefaultSettings,
  displayPresetSettings,
  normalizeDisplayPreset,
  normalizePlanLayerDisplayMode,
} from './display-settings.js';
import * as modelOps from './model-ops.js';
import { normalizeRoofDirection } from './roof-geometry.js';
import * as roofGen from './roof-generation.js';
import {
  cloneSection,
  createDefaultSectionCatalog,
  createDefaultSpringCatalog,
  DEFAULT_SECTION_NAME_SET,
  DEFAULT_SPRING_SYMBOL_SET,
  defaultColorForSection,
  normalizeCatalogSectionEntry,
  normalizeMemberEndInfo,
  normalizeSectionType,
  normalizeSpringEntry,
  sanitizeColor,
} from './section-catalog.js';
import { CURRENT_SCHEMA_VERSION, loadModelJSON, serializeModel } from './serialization.js';

const MEMBER_GEOMETRY_MODES = new Set(['level', 'explicit3d']);
const SURFACE_HEIGHT_MODES = new Set(['full', 'waist', 'hanging', 'custom']);
const SELECTION_FIELDS = {
  node: 'selectedNodeId',
  member: 'selectedMemberId',
  surface: 'selectedSurfaceId',
  load: 'selectedLoadId',
  support: 'selectedSupportId',
};
// Re-exported for API compatibility (implementations in display-settings.js)
export {
  createDefaultSettings,
  GRID_SIZE_DEFAULT,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  normalizeBeam3DSectionMode,
  normalizeGridSize,
  normalizeSettings,
} from './display-settings.js';

// Per-field sanitizers applied to updateSurface() patches. Each receives the
// raw patch value and the current surface (for fallbacks).
const SURFACE_PATCH_SANITIZERS = {
  heightMode: value => normalizeSurfaceHeightMode(value),
  bottomOffset: (value, surface) => sanitizeNumber(value, surface.bottomOffset || 0),
  topOffset: (value, surface) => sanitizeNumber(value, surface.topOffset || 0),
  unitWeight: (value, surface) => sanitizeNonNegativeNumber(value, surface.unitWeight || 0),
  includeWind: value => !!value,
  includeSeismicWeight: value => !!value,
  roofSlope: (value, surface) => sanitizeNonNegativeNumber(value, surface.roofSlope || 0),
  roofDirection: value => normalizeRoofDirection(value),
  roofBaseOffset: (value, surface) => sanitizeNumber(value, surface.roofBaseOffset || 0),
  roofGroupId: (value, surface) => sanitizeRoofGroupId(value, surface.roofGroupId || DEFAULT_ROOF_GROUP_ID),
  gableStartTopOffset: (value, surface) => sanitizeNumber(
    value,
    hasOwn(surface, 'gableStartTopOffset') ? surface.gableStartTopOffset : surface.topOffset
  ),
  gableEndTopOffset: (value, surface) => sanitizeNumber(
    value,
    hasOwn(surface, 'gableEndTopOffset') ? surface.gableEndTopOffset : surface.topOffset
  ),
};

// Per-field sanitizers applied to updateMember() patches.
const MEMBER_PATCH_SANITIZERS = {
  geometryMode: value => normalizeMemberGeometryMode(value),
  startZ: value => sanitizeOptionalNumber(value),
  endZ: value => sanitizeOptionalNumber(value),
  roofRole: value => sanitizeText(value) || null,
};

export class AppState {
  constructor() {
    this.schemaVersion = CURRENT_SCHEMA_VERSION;
    this.meta = {
      name: 'untitled',
      unit: 'mm',
      createdAt: new Date().toISOString(),
    };
    this.settings = createDefaultSettings();
    this.levels = createDefaultLevels();
    this.nodes = [];
    this.members = [];
    this.surfaces = [];
    this.loads = [];
    this.supports = [];
    this.sectionCatalog = createDefaultSectionCatalog();
    this.springCatalog = createDefaultSpringCatalog();

    // Monotonic model revision counter; bumped by _touch() whenever a public
    // method mutates the model. Not serialized.
    this.revision = 0;

    // Runtime state (not serialized)
    this.activeLevelId = 'L0';
    this.surfaceDraftTopLevelId = 'L1';
    this.resetRuntimeState();

    // Counters for ID generation
    this._nodeCounter = 0;
    this._memberCounter = 0;
    this._surfaceCounter = 0;
    this._levelCounter = 1;
    this._loadCounter = 0;
    this._supportCounter = 0;
  }

  // Bumps the model revision. Called by every mutating public method.
  _touch() {
    this.revision += 1;
  }

  // Resets selection, tool, and draft state to the initial defaults.
  // activeLevelId / surfaceDraftTopLevelId are intentionally excluded: they
  // are derived from the level list by the constructor and loadJSON.
  resetRuntimeState() {
    this.selectedNodeId = null;
    this.selectedMemberId = null;
    this.selectedSurfaceId = null;
    this.selectedLoadId = null;
    this.selectedSupportId = null;
    this.currentTool = 'member';
    this.memberDraftType = 'beam';
    // Sticky ("paste") section per type: once a section is chosen for a type,
    // newly drawn members/surfaces of that type reuse it instead of reverting
    // to the built-in default. Keyed by normalized section type.
    this.memberDraftSections = {};
    this.surfaceDraftSections = {};
    this.surfaceDraftType = 'floor';
    this.surfaceDraftMode = 'rect';
    this.surfaceDraftLoadDir = 'twoWay';
    this.surfaceDraftHeightMode = 'full';
    this.surfaceDraftBottomOffset = 0;
    this.surfaceDraftTopOffset = WAIST_WALL_TOP_OFFSET_MM;
    this.surfaceDraftRoofSlope = DEFAULT_ROOF_SLOPE_RATIO;
    this.surfaceDraftRoofDirection = 'xPlus';
    this.surfaceDraftRoofBaseOffset = 0;
    this.surfaceDraftRoofGroupId = DEFAULT_ROOF_GROUP_ID;
    this.loadDraftType = 'areaLoad';
  }

  // --- Selection ---

  // Selects a single element, clearing every other selection first.
  // kind: 'node' | 'member' | 'surface' | 'load' | 'support'.
  // Passing a null/undefined id (or kind) clears all selections.
  select(kind, id = null) {
    this.clearSelection();
    if (id === null || id === undefined) return null;
    const field = SELECTION_FIELDS[kind];
    if (!field) return null;
    this[field] = id;
    return id;
  }

  clearSelection() {
    this.selectedNodeId = null;
    this.selectedMemberId = null;
    this.selectedSurfaceId = null;
    this.selectedLoadId = null;
    this.selectedSupportId = null;
  }

  // --- Section & Spring catalogs ---

  _normalizeSectionType(target, type) {
    return normalizeSectionType(target, type);
  }

  _getSectionRef(target, type, name) {
    const normalizedType = this._normalizeSectionType(target, type);
    return this.sectionCatalog.find(s => s.target === target && s.type === normalizedType && s.name === name) || null;
  }

  getSection(target, type, name) {
    const section = this._getSectionRef(target, type, name);
    return section ? cloneSection(section) : null;
  }

  listSections(target, type) {
    const normalizedType = this._normalizeSectionType(target, type);
    return this.sectionCatalog
      .filter(s => s.target === target && s.type === normalizedType)
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map(s => cloneSection(s));
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

  _draftSectionStore(target) {
    return target === 'surface' ? this.surfaceDraftSections : this.memberDraftSections;
  }

  // Returns the sticky ("paste") section for a type if one is set and still
  // exists, otherwise falls back to the built-in default section.
  getDraftSectionName(target, type) {
    const normalizedType = this._normalizeSectionType(target, type);
    const store = this._draftSectionStore(target);
    const sticky = store ? store[normalizedType] : null;
    if (sticky && this._getSectionRef(target, normalizedType, sticky)) {
      return sticky;
    }
    return this.getDefaultSectionName(target, normalizedType);
  }

  // Sets (or clears) the sticky section for a type. Passing a falsy/unknown
  // name clears it so subsequent draws revert to the built-in default.
  setDraftSectionName(target, type, name) {
    const normalizedType = this._normalizeSectionType(target, type);
    const store = this._draftSectionStore(target);
    if (!store) return null;
    const sanitized = sanitizeText(name);
    if (sanitized && this._getSectionRef(target, normalizedType, sanitized)) {
      store[normalizedType] = sanitized;
    } else {
      delete store[normalizedType];
    }
    return this.getDraftSectionName(target, normalizedType);
  }

  getLevelZ(levelId) {
    const level = this.levels.find(l => l.id === levelId);
    return Number.isFinite(Number(level?.z)) ? Number(level.z) : 0;
  }

  getNextLevelId(levelId = this.activeLevelId) {
    const sortedLevels = [...this.levels].sort((a, b) => a.z - b.z);
    const activeIdx = sortedLevels.findIndex(l => l.id === levelId);
    if (activeIdx < 0 || activeIdx >= sortedLevels.length - 1) return null;
    return sortedLevels[activeIdx + 1].id;
  }

  getStoryHeight(levelId = this.activeLevelId, topLevelId = null) {
    const resolvedTopLevelId = topLevelId || this.getNextLevelId(levelId);
    if (!resolvedTopLevelId) return 0;
    return Math.max(0, this.getLevelZ(resolvedTopLevelId) - this.getLevelZ(levelId));
  }

  getPlanLayerStyle(levelId, options = {}) {
    const mode = normalizePlanLayerDisplayMode(
      options.view === '3d'
        ? (this.settings?.view3dLayerDisplayMode || this.settings?.planLayerDisplayMode)
        : this.settings?.planLayerDisplayMode
    );
    const targetLevelId = levelId || this.activeLevelId || 'L0';
    const isActive = targetLevelId === this.activeLevelId;
    const lockOtherLayers = options.view !== '3d' && !!this.settings?.planLayerSelectionLock;
    if (mode === 'current' && !isActive) {
      return { visible: false, alpha: 0, halftone: false, selectable: false };
    }
    if (mode === 'halftone' && !isActive) {
      return { visible: true, alpha: 0.28, halftone: true, selectable: !lockOtherLayers };
    }
    return { visible: true, alpha: 1, halftone: false, selectable: true };
  }

  isMemberVisible(member, view = '2d') {
    if (this.settings?.showMembers === false) return false;
    if (!member) return false;
    const layerStyle = this.getPlanLayerStyle(member.levelId, { view });
    if (!layerStyle.visible) return false;
    const typeFilter = sanitizeText(this.settings?.memberTypeFilter) || 'all';
    if (typeFilter !== 'all' && member.type !== typeFilter) return false;
    const sectionFilter = sanitizeText(this.settings?.sectionFilter) || 'all';
    if (sectionFilter !== 'all' && member.sectionName !== sectionFilter) return false;
    return true;
  }

  isSurfaceVisible(surface, view = '2d') {
    if (this.settings?.showSurfaces === false) return false;
    if (!surface) return false;
    return this.getPlanLayerStyle(surface.levelId, { view }).visible;
  }

  isLoadVisible(load, view = '2d') {
    if (this.settings?.showLoads === false) return false;
    if (!load) return false;
    return this.getPlanLayerStyle(load.levelId, { view }).visible;
  }

  isSupportVisible(support, view = '2d') {
    if (this.settings?.showSupports === false) return false;
    if (!support) return false;
    return this.getPlanLayerStyle(support.levelId, { view }).visible;
  }

  isMemberSelectable(member) {
    return this.isMemberVisible(member, '2d') && this.getPlanLayerStyle(member.levelId).selectable;
  }

  isSurfaceSelectable(surface) {
    return this.isSurfaceVisible(surface, '2d') && this.getPlanLayerStyle(surface.levelId).selectable;
  }

  isLoadSelectable(load) {
    return this.isLoadVisible(load, '2d') && this.getPlanLayerStyle(load.levelId).selectable;
  }

  isSupportSelectable(support) {
    return this.isSupportVisible(support, '2d') && this.getPlanLayerStyle(support.levelId).selectable;
  }

  applyDisplayPreset(name) {
    const preset = normalizeDisplayPreset(name);
    this.settings.displayPreset = preset;
    Object.assign(this.settings, displayPresetSettings(preset));
    this._touch();
    return preset;
  }

  getSurfaceHeightOffsets(options = {}) {
    const heightMode = normalizeSurfaceHeightMode(options.heightMode);
    const levelId = options.levelId || this.activeLevelId || 'L0';
    const topLevelId = options.topLevelId || this.getNextLevelId(levelId) || this.surfaceDraftTopLevelId || levelId;
    const storyHeight = this.getStoryHeight(levelId, topLevelId);

    if (heightMode === 'waist') {
      return {
        heightMode,
        bottomOffset: 0,
        topOffset: Math.min(WAIST_WALL_TOP_OFFSET_MM, storyHeight || WAIST_WALL_TOP_OFFSET_MM),
      };
    }

    if (heightMode === 'hanging') {
      const topOffset = storyHeight || 0;
      return {
        heightMode,
        bottomOffset: Math.max(0, topOffset - HANGING_WALL_DEPTH_MM),
        topOffset,
      };
    }

    if (heightMode === 'custom') {
      const bottomOffset = sanitizeNumber(options.bottomOffset, this.surfaceDraftBottomOffset || 0);
      const fallbackTopOffset = Math.max(bottomOffset + 1, this.surfaceDraftTopOffset || storyHeight || WAIST_WALL_TOP_OFFSET_MM);
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
    this._normalizeSectionEndDefaults(section);
    this.sectionCatalog.push(section);
    this._touch();
    return cloneSection(section);
  }

  updateSection(target, type, name, props = {}) {
    const normalizedType = this._normalizeSectionType(target, type);
    const section = this.sectionCatalog.find(
      s => s.target === target && s.type === normalizedType && s.name === name
    );
    if (!section || section.isDefault) return null;

    if (target === 'member') {
      if (hasOwn(props, 'b')) {
        section.b = sanitizePositiveNumber(props.b, sanitizePositiveNumber(section.b, DEFAULT_SECTION_B_MM));
      }
      if (hasOwn(props, 'h')) {
        section.h = sanitizePositiveNumber(props.h, sanitizePositiveNumber(section.h, DEFAULT_SECTION_H_MM));
      }
      if (hasOwn(props, 'defaultEndI')) {
        section.defaultEndI = this._normalizeMemberEnd(props.defaultEndI);
      }
      if (hasOwn(props, 'defaultEndJ')) {
        section.defaultEndJ = this._normalizeMemberEnd(props.defaultEndJ);
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

    this._touch();
    return cloneSection(section);
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
    this._touch();
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
    this._touch();
    return { ...spring };
  }

  updateSpring(symbol, props = {}) {
    const spring = this._getSpringRef(symbol);
    if (!spring || spring.isDefault) return null;
    if (hasOwn(props, 'memo')) {
      spring.memo = sanitizeText(props.memo) || '';
    }
    this._touch();
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
    const inSectionPreset = this.sectionCatalog.some(s =>
      s.target === 'member' && (
        (s.defaultEndI?.condition === 'spring' && s.defaultEndI.springSymbol === symbol) ||
        (s.defaultEndJ?.condition === 'spring' && s.defaultEndJ.springSymbol === symbol)
      )
    );
    if (inSectionPreset) return false;
    this.springCatalog.splice(idx, 1);
    this._touch();
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
    const targetB = sanitizePositiveNumber(b, DEFAULT_SECTION_B_MM);
    const targetH = sanitizePositiveNumber(h, DEFAULT_SECTION_H_MM);
    const targetColor = sanitizeColor(color, defaultColorForSection('member', normalizedType));
    return this.sectionCatalog.find(s =>
      s.target === 'member' &&
      s.type === normalizedType &&
      (s.material || 'steel') === targetMaterial &&
      sanitizePositiveNumber(s.b, DEFAULT_SECTION_B_MM) === targetB &&
      sanitizePositiveNumber(s.h, DEFAULT_SECTION_H_MM) === targetH &&
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
      b: sanitizePositiveNumber(b, DEFAULT_SECTION_B_MM),
      h: sanitizePositiveNumber(h, DEFAULT_SECTION_H_MM),
      color: sanitizeColor(color, defaultColorForSection('member', normalizedType)),
      defaultEndI: { condition: 'pin', springSymbol: null },
      defaultEndJ: { condition: 'pin', springSymbol: null },
      isDefault: false,
    };
    this.sectionCatalog.push(section);
    return section;
  }

  // Applies a catalog section to a member (name, material, b/h, color).
  // The single write path for section-driven member fields.
  _applyMemberSection(member, sectionName) {
    const section = this._getSectionRef('member', member.type, sectionName);
    if (!section) return false;
    member.sectionName = section.name;
    member.material = section.material || 'steel';
    member.section = {
      b: sanitizePositiveNumber(section.b, DEFAULT_SECTION_B_MM),
      h: sanitizePositiveNumber(section.h, DEFAULT_SECTION_H_MM),
    };
    member.color = sanitizeColor(section.color, defaultColorForSection('member', member.type));
    return true;
  }

  // Resolves the best catalog section for a member (requested name, then the
  // type default, then any section of the type) and applies it via
  // _applyMemberSection. Falls back to sanitizing inline values when the
  // catalog has no section for the type at all.
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

    if (section && this._applyMemberSection(member, section.name)) return;

    member.sectionName = sectionName || '';
    member.material = sanitizeText(member.material) || 'steel';
    member.section = {
      b: sanitizePositiveNumber(member.section?.b, DEFAULT_SECTION_B_MM),
      h: sanitizePositiveNumber(member.section?.h, DEFAULT_SECTION_H_MM),
    };
    member.color = sanitizeColor(member.color, defaultColorForSection('member', member.type));
  }

  _getMemberSectionEndDefaults(member) {
    const section = this._getSectionRef('member', member.type, member.sectionName);
    return {
      endI: this._normalizeMemberEnd(section?.defaultEndI),
      endJ: this._normalizeMemberEnd(section?.defaultEndJ),
    };
  }

  _normalizeSectionEndDefaults(section) {
    if (section?.target !== 'member') return;
    section.defaultEndI = this._normalizeMemberEnd(section.defaultEndI);
    section.defaultEndJ = this._normalizeMemberEnd(section.defaultEndJ);
  }

  _normalizeSectionCatalogEndDefaults() {
    for (const section of this.sectionCatalog) {
      this._normalizeSectionEndDefaults(section);
    }
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

  // Member-end normalization validated against this state's spring catalog.
  // (section-catalog.js normalizeSectionDefaultEnd is the catalog-free variant.)
  _normalizeMemberEnd(endInfo) {
    return normalizeMemberEndInfo(endInfo, this.springCatalog);
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
      roofSlope: sanitizeNonNegativeNumber(options.roofSlope, this.surfaceDraftRoofSlope || DEFAULT_ROOF_SLOPE_RATIO),
      roofDirection: normalizeRoofDirection(options.roofDirection || this.surfaceDraftRoofDirection),
      roofBaseOffset: sanitizeNumber(options.roofBaseOffset, this.surfaceDraftRoofBaseOffset || 0),
    };
    if (isRoofSurfaceType(type)) {
      roofFields.roofGroupId = sanitizeRoofGroupId(options.roofGroupId, this.surfaceDraftRoofGroupId || DEFAULT_ROOF_GROUP_ID);
    }
    return roofFields;
  }

  _normalizeSurfaceGable(type, levelId, topLevelId, options = {}) {
    if (!isGableWallSurfaceType(type)) return {};
    const bottomOffset = sanitizeNumber(options.bottomOffset, 0);
    const storyHeight = this.getStoryHeight(levelId, topLevelId);
    const fallbackTop = Math.max(bottomOffset + 1, sanitizeNumber(options.topOffset, storyHeight || DEFAULT_STORY_HEIGHT_MM));
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
    return this._nodeCounter;
  }

  addNode(x, y, z = 0) {
    const id = this.nextNodeId();
    const node = { id, x, y, z };
    this.nodes.push(node);
    this._touch();
    return node;
  }

  getNode(id) {
    return this.nodes.find(n => n.id === id);
  }

  updateNode(id, props) {
    const node = this.getNode(id);
    if (node) {
      Object.assign(node, props);
      this._touch();
    }
    return node;
  }

  removeNode(id) {
    const before = this.nodes.length;
    this.nodes = this.nodes.filter(n => n.id !== id);
    if (this.nodes.length !== before) this._touch();
  }

  findNodeAt(x, y, tolerance = HIT_TOLERANCE_MM) {
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
    const hasEndI = hasOwn(options, 'endI');
    const hasEndJ = hasOwn(options, 'endJ');

    if (!sectionName && (
      (options.b !== undefined && options.b !== null) ||
      (options.h !== undefined && options.h !== null) ||
      options.material
    )) {
      const material = sanitizeText(options.material) || 'steel';
      const b = sanitizePositiveNumber(options.b, DEFAULT_SECTION_B_MM);
      const h = sanitizePositiveNumber(options.h, DEFAULT_SECTION_H_MM);
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
      section: { b: DEFAULT_SECTION_B_MM, h: DEFAULT_SECTION_H_MM },
      levelId: options.levelId || this.activeLevelId || 'L0',
      material: 'steel',
      color: options.color || '#666666',
      topLevelId: options.topLevelId || null,
      geometryMode: normalizeMemberGeometryMode(options.geometryMode),
      startZ: sanitizeOptionalNumber(options.startZ),
      endZ: sanitizeOptionalNumber(options.endZ),
      roofRole: sanitizeText(options.roofRole) || null,
      bracePattern: options.bracePattern || 'single',
      endI: { condition: 'pin', springSymbol: null },
      endJ: { condition: 'pin', springSymbol: null },
    };
    this._ensureMemberSection(member, sectionName);
    const endDefaults = this._getMemberSectionEndDefaults(member);
    member.endI = this._normalizeMemberEnd(hasEndI ? options.endI : endDefaults.endI);
    member.endJ = this._normalizeMemberEnd(hasEndJ ? options.endJ : endDefaults.endJ);
    this.members.push(member);
    this._touch();
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
    sanitizePatchFields(patch, MEMBER_PATCH_SANITIZERS, member);

    Object.assign(member, patch);

    if (!hasEndI) member.endI = this._normalizeMemberEnd(member.endI);
    if (!hasEndJ) member.endJ = this._normalizeMemberEnd(member.endJ);

    if (!hasSectionName && (hasSection || hasMaterial)) {
      const material = sanitizeText(member.material) || 'steel';
      const b = sanitizePositiveNumber(member.section?.b, DEFAULT_SECTION_B_MM);
      const h = sanitizePositiveNumber(member.section?.h, DEFAULT_SECTION_H_MM);
      const section = this._findMemberSectionBySpec(member.type, material, b, h, member.color) ||
        this._createImportedMemberSection(member.type, material, b, h, member.color);
      member.sectionName = section.name;
    }

    if (hasType || hasSectionName || hasSection || hasMaterial || hasColor) {
      this._ensureMemberSection(member, member.sectionName);
    }
    this._touch();
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
    this._touch();
  }

  findMemberAt(x, y, tolerance = HIT_TOLERANCE_MM, predicate = null) {
    let closest = null;
    let minDist = tolerance;
    for (const m of this.members) {
      if (predicate && !predicate(m)) continue;
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

  _memberEndpointZ(member, key) {
    const value = Number(member[key]);
    if (Number.isFinite(value)) return value;
    const level = this.levels.find(l => l.id === member.levelId);
    return sanitizeNumber(level?.z, 0);
  }

  // --- Roof auto-generation (implementation lives in roof-generation.js) ---

  addRoofEdgeMembers(surfaceId, options = {}) {
    return roofGen.addRoofEdgeMembers(this, surfaceId, options);
  }

  addRoofSlopeMembers(surfaceId, options = {}) {
    return roofGen.addRoofSlopeMembers(this, surfaceId, options);
  }

  addRoofJointMembers(roofGroupId, options = {}) {
    return roofGen.addRoofJointMembers(this, roofGroupId, options);
  }

  addGableWallsFromRoofGroup(roofGroupId, options = {}) {
    return roofGen.addGableWallsFromRoofGroup(this, roofGroupId, options);
  }

  addEavesFromRoofGroup(roofGroupId, options = {}) {
    return roofGen.addEavesFromRoofGroup(this, roofGroupId, options);
  }

  addRoofPlanesFromSurface(sourceSurfaceId, options = {}) {
    return roofGen.addRoofPlanesFromSurface(this, sourceSurfaceId, options);
  }

  validateRoofGroup(roofGroupId, options = {}) {
    return roofGen.validateRoofGroup(this, roofGroupId, options);
  }

  removeRoofGeneratedElements(roofGroupId, options = {}) {
    return roofGen.removeRoofGeneratedElements(this, roofGroupId, options);
  }

  regenerateRoofGeneratedElements(roofGroupId, options = {}) {
    return roofGen.regenerateRoofGeneratedElements(this, roofGroupId, options);
  }

  listRoofGroups() {
    return roofGen.listRoofGroups(this);
  }

  getRoofGroupSurfaces(groupId) {
    return roofGen.getRoofGroupSurfaces(this, groupId);
  }

  // --- Surfaces ---

  nextSurfaceId() {
    this._surfaceCounter++;
    return `S${this._surfaceCounter}`;
  }

  // Shared surface factory: assigns the id and applies section / height /
  // roof / gable normalization before registering the surface.
  _createSurface(base, options) {
    const { type, levelId, topLevelId } = base;
    const surface = {
      id: this.nextSurfaceId(),
      sectionName: sanitizeText(options.sectionName) || '',
      ...base,
      ...this._normalizeSurfaceHeightAndWeight(type, levelId, topLevelId, options),
      ...this._normalizeSurfaceRoof(type, options),
    };
    Object.assign(surface, this._normalizeSurfaceGable(type, levelId, topLevelId, { ...surface, ...options }));
    this._ensureSurfaceSection(surface, surface.sectionName);
    this.surfaces.push(surface);
    this._touch();
    return surface;
  }

  addSurfaceRect(x1, y1, x2, y2, options = {}) {
    const type = options.type || 'floor';
    const levelId = options.levelId || this.activeLevelId || 'L0';
    // NOTE: rect/polygon surfaces prefer the draft top layer over the next
    // level, while line surfaces prefer the next level first (see
    // addSurfaceLine). The asymmetry is historical and intentionally kept.
    const topLevelId = options.topLevelId || this.surfaceDraftTopLevelId || this.getNextLevelId(levelId) || levelId;
    return this._createSurface({
      type,
      levelId,
      topLevelId,
      loadDirection: options.loadDirection || 'twoWay', // x | y | twoWay
      color: options.color || defaultSurfaceDrawColor(options.type),
      x1: Math.min(x1, x2),
      y1: Math.min(y1, y2),
      x2: Math.max(x1, x2),
      y2: Math.max(y1, y2),
      points: null,
      shape: 'rect',
    }, options);
  }

  addSurfaceLine(x1, y1, x2, y2, options = {}) {
    const type = options.type || 'wall';
    const levelId = options.levelId || this.activeLevelId || 'L0';
    // NOTE: topLevelId fallback order differs from addSurfaceRect/Polygon:
    // line surfaces prefer the next level before the draft top layer.
    const topLevelId = options.topLevelId || this.getNextLevelId(levelId) || this.surfaceDraftTopLevelId || levelId;
    return this._createSurface({
      type,
      levelId,
      topLevelId,
      loadDirection: 'twoWay',
      color: options.color || '#b57a6b',
      x1, y1, x2, y2,
      points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
      shape: 'line',
    }, options);
  }

  addSurfacePolygon(points, options = {}) {
    if (!Array.isArray(points) || points.length < 3) return null;
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const type = options.type || 'wall';
    const levelId = options.levelId || this.activeLevelId || 'L0';
    // NOTE: same fallback order as addSurfaceRect (differs from addSurfaceLine).
    const topLevelId = options.topLevelId || this.surfaceDraftTopLevelId || this.getNextLevelId(levelId) || levelId;
    return this._createSurface({
      type,
      levelId,
      topLevelId,
      loadDirection: options.loadDirection || 'twoWay',
      color: options.color || defaultSurfaceDrawColor(options.type),
      x1: Math.min(...xs),
      y1: Math.min(...ys),
      x2: Math.max(...xs),
      y2: Math.max(...ys),
      points: points.map(p => ({ x: p.x, y: p.y })),
      shape: 'polygon',
    }, options);
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
    const hasGableStartTopOffset = hasOwn(patch, 'gableStartTopOffset');
    const hasGableEndTopOffset = hasOwn(patch, 'gableEndTopOffset');
    if (hasColor) {
      // Color is section-driven, so direct color patching is ignored.
      delete patch.color;
    }
    sanitizePatchFields(patch, SURFACE_PATCH_SANITIZERS, surface);

    const prospectiveType = patch.type || surface.type;
    stripSurfaceFieldsForType(patch, prospectiveType);
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
      }
      stripSurfaceFieldsForType(surface, surface.type);
    }
    if (hasType || hasSectionName || hasColor) {
      this._ensureSurfaceSection(surface, surface.sectionName);
    }
    this._touch();
    return surface;
  }

  removeSurface(id) {
    const before = this.surfaces.length;
    this.surfaces = this.surfaces.filter(s => s.id !== id);
    if (this.selectedSurfaceId === id) {
      this.selectedSurfaceId = null;
    }
    if (this.surfaces.length !== before) this._touch();
  }

  findSurfaceAt(x, y, predicate = null) {
    const wallOffset = this.settings.wallDisplayOffset || WALL_DISPLAY_OFFSET_MM;
    for (let i = this.surfaces.length - 1; i >= 0; i--) {
      const s = this.surfaces[i];
      if (predicate && !predicate(s)) continue;
      const isWallType = isWallSurfaceType(s.type);
      if (s.shape === 'line') {
        const lx1 = s.x1 + wallOffset;
        const ly1 = s.y1 + wallOffset;
        const lx2 = s.x2 + wallOffset;
        const ly2 = s.y2 + wallOffset;
        if (pointToSegmentDist(x, y, lx1, ly1, lx2, ly2) < HIT_TOLERANCE_MM) {
          return s;
        }
        continue;
      }
      if (s.shape === 'polygon' && Array.isArray(s.points)) {
        if (s.type === 'exteriorWall') {
          // Hit test against outward-offset edges
          if (hitExteriorWallEdges(x, y, s.points, wallOffset, HIT_TOLERANCE_MM)) return s;
          continue;
        }
        const pts = s.points.map(p => ({
          x: p.x + (isWallType ? wallOffset : 0),
          y: p.y + (isWallType ? wallOffset : 0),
        }));
        if (pointInPolygon({ x, y }, pts)) {
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
    this._touch();
    return level;
  }

  updateLevel(id, props) {
    const level = this.levels.find(l => l.id === id);
    if (level) {
      Object.assign(level, props);
      this._touch();
    }
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
    if (this.activeLevelId === id) {
      this.activeLevelId = this.levels[0].id;
    }
    if (this.surfaceDraftTopLevelId === id) {
      this.surfaceDraftTopLevelId = this.levels[this.levels.length - 1].id;
    }
    this._touch();
    return true;
  }

  copyLevelElements(sourceLevelId, targetLevelId, options = {}) {
    return modelOps.copyLevelElements(this, sourceLevelId, targetLevelId, options);
  }

  validateModel() {
    return modelOps.validateModel(this);
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
      levelId: props.levelId || this.activeLevelId || 'L0',
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
    this._touch();
    return base;
  }

  getLoad(id) {
    return this.loads.find(l => l.id === id);
  }

  updateLoad(id, props) {
    const load = this.getLoad(id);
    if (load) {
      Object.assign(load, props);
      this._touch();
    }
    return load;
  }

  removeLoad(id) {
    const before = this.loads.length;
    this.loads = this.loads.filter(l => l.id !== id);
    if (this.selectedLoadId === id) {
      this.selectedLoadId = null;
    }
    if (this.loads.length !== before) this._touch();
  }

  findLoadAt(x, y, predicate = null) {
    for (let i = this.loads.length - 1; i >= 0; i--) {
      const ld = this.loads[i];
      if (predicate && !predicate(ld)) continue;
      if (ld.type === 'areaLoad') {
        if (x >= ld.x1 && x <= ld.x2 && y >= ld.y1 && y <= ld.y2) return ld;
      } else if (ld.type === 'lineLoad') {
        if (pointToSegmentDist(x, y, ld.x1, ld.y1, ld.x2, ld.y2) < HIT_TOLERANCE_MM) return ld;
      } else if (ld.type === 'pointLoad') {
        if (Math.hypot(x - ld.x1, y - ld.y1) < HIT_TOLERANCE_MM) return ld;
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
      levelId: options.levelId || this.activeLevelId || 'L0',
      dx: options.dx !== undefined ? !!options.dx : true,
      dy: options.dy !== undefined ? !!options.dy : true,
      dz: options.dz !== undefined ? !!options.dz : true,
      rx: options.rx !== undefined ? !!options.rx : false,
      ry: options.ry !== undefined ? !!options.ry : false,
      rz: options.rz !== undefined ? !!options.rz : false,
    };
    this.supports.push(support);
    this._touch();
    return support;
  }

  getSupport(id) {
    return this.supports.find(s => s.id === id);
  }

  updateSupport(id, props) {
    const support = this.getSupport(id);
    if (support) {
      Object.assign(support, props);
      this._touch();
    }
    return support;
  }

  removeSupport(id) {
    const before = this.supports.length;
    this.supports = this.supports.filter(s => s.id !== id);
    if (this.selectedSupportId === id) {
      this.selectedSupportId = null;
    }
    if (this.supports.length !== before) this._touch();
  }

  findSupportAt(x, y, tolerance = HIT_TOLERANCE_MM, predicate = null) {
    let closest = null;
    let minDist = tolerance;
    for (const s of this.supports) {
      if (predicate && !predicate(s)) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < minDist) {
        minDist = d;
        closest = s;
      }
    }
    return closest;
  }

  // --- Serialization (implementation lives in serialization.js) ---

  toJSON() {
    return serializeModel(this);
  }

  loadJSON(data) {
    loadModelJSON(this, data);
  }

  // Deep clone for undo/redo snapshots
  snapshot() {
    return structuredClone(this.toJSON());
  }

  restoreSnapshot(snap) {
    this.loadJSON(snap);
  }
}

// --- Utility ---

export function createDefaultLevels() {
  return [
    { id: 'L0', name: 'GL', z: 0 },
    { id: 'L1', name: '2F', z: DEFAULT_STORY_HEIGHT_MM },
  ];
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// Applies the per-field sanitizer table to a patch object in place.
function sanitizePatchFields(patch, sanitizers, current) {
  for (const [key, sanitize] of Object.entries(sanitizers)) {
    if (hasOwn(patch, key)) {
      patch[key] = sanitize(patch[key], current);
    }
  }
}

// Removes surface fields that do not apply to the given type. Shared by
// updateSurface (patch + record) and _normalizeLoadedSurface.
export function stripSurfaceFieldsForType(target, type) {
  if (!isSlopedSurfaceType(type)) {
    delete target.roofSlope;
    delete target.roofDirection;
    delete target.roofBaseOffset;
  }
  if (!isRoofSurfaceType(type)) {
    delete target.roofGroupId;
  }
  if (!isGableWallSurfaceType(type)) {
    delete target.gableStartTopOffset;
    delete target.gableEndTopOffset;
  }
}

export function sanitizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function sanitizeRoofGroupId(value, fallback = DEFAULT_ROOF_GROUP_ID) {
  return sanitizeText(value) || sanitizeText(fallback) || DEFAULT_ROOF_GROUP_ID;
}

// Initial draw color for a surface before the section color is applied.
export function defaultSurfaceDrawColor(type) {
  return type === 'wall' || type === 'exteriorWall' ? '#b57a6b' : '#67a9cf';
}

function normalizeSurfaceHeightMode(value) {
  const text = sanitizeText(value);
  return SURFACE_HEIGHT_MODES.has(text) ? text : 'full';
}

export function normalizeMemberGeometryMode(value) {
  const text = sanitizeText(value);
  return MEMBER_GEOMETRY_MODES.has(text) ? text : 'level';
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

function hitExteriorWallEdges(px, py, points, offset, tolerance) {
  const oPts = offsetPolygonOutward(points, offset);
  for (let i = 0; i < oPts.length; i++) {
    const a = oPts[i], b = oPts[(i + 1) % oPts.length];
    if (pointToSegmentDist(px, py, a.x, a.y, b.x, b.y) < tolerance) return true;
  }
  return false;
}
