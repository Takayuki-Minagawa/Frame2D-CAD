
import { sanitizeText } from '../domain/model.js';
import {
  DEFAULT_LOAD_CASE,
  DEFAULT_ROOF_GROUP_ID,
  DEFAULT_ROOF_SLOPE_RATIO,
  WAIST_WALL_TOP_OFFSET_MM,
} from '../constants.js';

const SELECTION_FIELDS = { node: 'selectedNodeId', member: 'selectedMemberId', surface: 'selectedSurfaceId', load: 'selectedLoadId', support: 'selectedSupportId' };

// Transient selection and sticky placement drafts; never bumps model revision.
// AppState delegates with its existing receiver and public method names.
export const runtimeState = {
  resetRuntimeState() {
    this.selectedNodeId = null;
    this.selectedMemberId = null;
    this.selectedMemberIds = [];
    this.selectedSurfaceId = null;
    this.selectedLoadId = null;
    this.selectedSupportId = null;
    this.currentTool = 'member';
    this.loadDraftCase = DEFAULT_LOAD_CASE;
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
  },

  select(kind, id = null) {
    this.clearSelection();
    if (id === null || id === undefined) return null;
    const field = SELECTION_FIELDS[kind];
    if (!field) return null;
    this[field] = id;
    if (kind === 'member') this.selectedMemberIds = [id];
    return id;
  },

  clearSelection() {
    this.selectedNodeId = null;
    this.selectedMemberId = null;
    this.selectedMemberIds = [];
    this.selectedSurfaceId = null;
    this.selectedLoadId = null;
    this.selectedSupportId = null;
  },

  selectDrawn(kind, id) {
    this.clearSelection();
    this.selectedMemberId = kind === 'member' ? id : null;
    this.selectedMemberIds = kind === 'member' ? [id] : [];
    this.selectedSurfaceId = kind === 'surface' ? id : null;
    this.selectedLoadId = kind === 'load' ? id : null;
  },

  selectMembers(ids) {
    this.clearSelection();
    const valid = (Array.isArray(ids) ? ids : []).filter(id => this.getMember(id));
    this.selectedMemberIds = [...new Set(valid)];
    this.selectedMemberId = this.selectedMemberIds.length === 1 ? this.selectedMemberIds[0] : null;
    return this.selectedMemberIds;
  },

  toggleMemberSelection(id) {
    if (!this.getMember(id)) return this.selectedMemberIds;
    const ids = new Set(this.selectedMemberIds);
    if (ids.has(id)) {
      ids.delete(id);
    } else {
      ids.add(id);
    }
    return this.selectMembers([...ids]);
  },

  isMemberSelected(id) {
    return this.selectedMemberId === id || this.selectedMemberIds.includes(id);
  },

  _draftSectionStore(target) {
    return target === 'surface' ? this.surfaceDraftSections : this.memberDraftSections;
  },

  getDraftSectionName(target, type) {
    const normalizedType = this._normalizeSectionType(target, type);
    const store = this._draftSectionStore(target);
    const sticky = store ? store[normalizedType] : null;
    if (sticky && this._getSectionRef(target, normalizedType, sticky)) {
      return sticky;
    }
    return this.getDefaultSectionName(target, normalizedType);
  },

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
};
