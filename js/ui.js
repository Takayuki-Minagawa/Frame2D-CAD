// ui.js - UI controls (toolbar, property panel, status bar)

import { t } from './i18n.js';
import { resolveMemberColor, roofRoleLabelKey } from './member-style.js';
import { isGableWallSurfaceType, isSlopedSurfaceType, isWallSurfaceType } from './state.js';
import {
  computeMemberLengthM,
  computeQuantitySummary,
  computeSurfaceSeismicWeightN,
  computeSurfaceWeightAreaM2,
  computeSurfaceWindProjectionM2,
  resolveSurfaceVerticalRange,
} from './quantities.js';

export class UI {
  constructor(state, callbacks) {
    this.state = state;
    this.callbacks = callbacks;
    this._quantitySummaryLastKey = null;

    this._setupToolbar();
    this.refreshLayerSelectors();
  }

  _setupToolbar() {
    // Tool selector combobox
    document.getElementById('sel-tool').addEventListener('change', e => {
      this.state.currentTool = e.target.value;
      this._updateToolUI();
      this.callbacks.onToolChange?.(this.state.currentTool);
    });

    // Snap toggle
    document.getElementById('chk-snap').addEventListener('change', e => {
      this.state.settings.snap = e.target.checked;
      this.updateStatusBar();
      this.callbacks.onSnapToggle?.(e.target.checked);
    });

    // Show supports toggle
    document.getElementById('chk-show-supports').addEventListener('change', e => {
      this.state.settings.showSupports = e.target.checked;
      this.callbacks.onPropertyChange?.();
    });

    // Wide pick toggle
    document.getElementById('chk-wide-pick').addEventListener('change', e => {
      this.state.settings.widePick = e.target.checked;
    });

    document.getElementById('sel-plan-layer-display-mode').addEventListener('change', e => {
      this.state.settings.planLayerDisplayMode = e.target.value;
      this.callbacks.onPropertyChange?.();
    });

    document.getElementById('sel-member-3d-render-mode').addEventListener('change', e => {
      this.state.settings.member3dRenderMode = e.target.value;
      this.callbacks.onPropertyChange?.();
    });

    // Grid size
    document.getElementById('sel-grid').addEventListener('change', e => {
      this.state.settings.gridSize = parseFloat(e.target.value);
      this.callbacks.onGridChange?.(this.state.settings.gridSize);
    });

    // Active layer
    document.getElementById('sel-active-layer').addEventListener('change', e => {
      this.state.activeLayerId = e.target.value;
      this._syncWallHeightInputs(false);
      this._updateMemberLayerHint();
      this.callbacks.onLayerChange?.(this.state.activeLayerId);
    });

    // Member default type
    document.getElementById('sel-member-type').addEventListener('change', e => {
      this.state.memberDraftType = e.target.value;
      this._updateMemberLayerHint();
    });

    // Surface defaults
    document.getElementById('sel-surface-type').addEventListener('change', e => {
      this.state.surfaceDraftType = e.target.value;
      this._updateSurfaceSubOptions();
    });
    document.getElementById('sel-surface-mode').addEventListener('change', e => {
      this.state.surfaceDraftMode = e.target.value;
    });
    document.getElementById('sel-load-direction').addEventListener('change', e => {
      this.state.surfaceDraftLoadDir = e.target.value;
    });
    document.getElementById('sel-top-layer').addEventListener('change', e => {
      this.state.surfaceDraftTopLayerId = e.target.value;
    });
    document.getElementById('sel-wall-height-mode').addEventListener('change', e => {
      this.state.surfaceDraftHeightMode = e.target.value;
      this._syncWallHeightInputs(true);
    });
    const onWallOffsetChange = () => {
      const bottomEl = document.getElementById('input-wall-bottom-offset');
      const topEl = document.getElementById('input-wall-top-offset');
      const bottomOffset = readNumberInput(bottomEl, this.state.surfaceDraftBottomOffset || 0);
      const topOffset = readNumberInput(topEl, this.state.surfaceDraftTopOffset || 1200);
      if (topOffset <= bottomOffset) {
        markInputInvalid(topEl, t('wallInvalidHeight'));
        return;
      }
      clearInputInvalid(bottomEl);
      clearInputInvalid(topEl);
      this.state.surfaceDraftHeightMode = 'custom';
      this.state.surfaceDraftBottomOffset = bottomOffset;
      this.state.surfaceDraftTopOffset = topOffset;
      this._syncWallHeightInputs(false);
    };
    document.getElementById('input-wall-bottom-offset').addEventListener('change', onWallOffsetChange);
    document.getElementById('input-wall-top-offset').addEventListener('change', onWallOffsetChange);
    document.getElementById('input-roof-slope').addEventListener('change', e => {
      this.state.surfaceDraftRoofSlope = Math.max(0, readNumberInput(e.target, this.state.surfaceDraftRoofSlope || 0));
      e.target.value = String(this.state.surfaceDraftRoofSlope);
    });
    document.getElementById('sel-roof-direction').addEventListener('change', e => {
      this.state.surfaceDraftRoofDirection = e.target.value;
    });
    document.getElementById('input-roof-base-offset').addEventListener('change', e => {
      this.state.surfaceDraftRoofBaseOffset = readNumberInput(e.target, this.state.surfaceDraftRoofBaseOffset || 0);
      e.target.value = String(this.state.surfaceDraftRoofBaseOffset);
    });
    document.getElementById('input-roof-group-id').addEventListener('change', e => {
      this.state.surfaceDraftRoofGroupId = String(e.target.value || '').trim() || 'RG1';
      e.target.value = this.state.surfaceDraftRoofGroupId;
    });

    // Load type
    document.getElementById('sel-load-type').addEventListener('change', e => {
      this.state.loadDraftType = e.target.value;
    });

    // Keyboard shortcuts for tools
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'v' || e.key === 'V') {
        this.state.currentTool = 'select';
      } else if (e.key === 'm' || e.key === 'M') {
        this.state.currentTool = 'member';
      } else if (e.key === 'f' || e.key === 'F') {
        this.state.currentTool = 'surface';
      } else if (e.key === 'l' || e.key === 'L') {
        this.state.currentTool = 'load';
      } else if (e.key === 's' || e.key === 'S') {
        this.state.currentTool = 'support';
      } else {
        return;
      }
      this._updateToolUI();
      this.callbacks.onToolChange?.(this.state.currentTool);
    });

    // Initial tool options visibility
    this._updateToolOptions();
  }

  _updateToolUI() {
    const selTool = document.getElementById('sel-tool');
    if (selTool) selTool.value = this.state.currentTool;

    const toolStatus = document.getElementById('status-tool');
    if (toolStatus) {
      const statusKeys = {
        select: 'toolSelect',
        member: 'toolMember',
        surface: 'toolSurface',
        load: 'toolLoad',
        support: 'toolSupport',
      };
      toolStatus.textContent = t(statusKeys[this.state.currentTool] || 'toolSelect');
    }

    this._updateToolOptions();
  }

  _updateToolOptions() {
    const tool = this.state.currentTool;
    const memberOpts = document.getElementById('tool-opts-member');
    const surfaceOpts = document.getElementById('tool-opts-surface');
    const loadOpts = document.getElementById('tool-opts-load');
    if (memberOpts) memberOpts.classList.toggle('visible', tool === 'member');
    if (surfaceOpts) surfaceOpts.classList.toggle('visible', tool === 'surface');
    if (loadOpts) loadOpts.classList.toggle('visible', tool === 'load');
    // Support tool has no sub-options
    this._updateSurfaceSubOptions();
  }

  _updateSurfaceSubOptions() {
    const type = this.state.surfaceDraftType;
    const isFloor = type === 'floor';
    const isWall = isWallSurfaceType(type);
    const isRoof = type === 'roof';
    const isSloped = isSlopedSurfaceType(type);
    const modeLabel = document.getElementById('label-surface-mode');
    const loadDirLabel = document.getElementById('label-load-direction');
    const topLayerLabel = document.getElementById('label-top-layer');
    const wallHeightLabel = document.getElementById('label-wall-height-mode');
    const wallBottomLabel = document.getElementById('label-wall-bottom-offset');
    const wallTopLabel = document.getElementById('label-wall-top-offset');
    const roofSlopeLabel = document.getElementById('label-roof-slope');
    const roofDirectionLabel = document.getElementById('label-roof-direction');
    const roofBaseOffsetLabel = document.getElementById('label-roof-base-offset');
    const roofGroupLabel = document.getElementById('label-roof-group-id');
    if (modeLabel) modeLabel.style.display = (isFloor || isSloped) ? '' : 'none';
    if (loadDirLabel) loadDirLabel.style.display = isFloor ? '' : 'none';
    if (topLayerLabel) topLayerLabel.style.display = 'none';
    if (wallHeightLabel) wallHeightLabel.style.display = isWall ? '' : 'none';
    if (wallBottomLabel) wallBottomLabel.style.display = isWall ? '' : 'none';
    if (wallTopLabel) wallTopLabel.style.display = isWall ? '' : 'none';
    if (roofSlopeLabel) roofSlopeLabel.style.display = isSloped ? '' : 'none';
    if (roofDirectionLabel) roofDirectionLabel.style.display = isSloped ? '' : 'none';
    if (roofBaseOffsetLabel) roofBaseOffsetLabel.style.display = isSloped ? '' : 'none';
    if (roofGroupLabel) roofGroupLabel.style.display = isRoof ? '' : 'none';
    this._syncWallHeightInputs(false);
    this._syncRoofInputs();
  }

  _syncWallHeightInputs(applyPreset) {
    const modeEl = document.getElementById('sel-wall-height-mode');
    const bottomEl = document.getElementById('input-wall-bottom-offset');
    const topEl = document.getElementById('input-wall-top-offset');
    if (!modeEl || !bottomEl || !topEl) return;

    const mode = this.state.surfaceDraftHeightMode || 'full';
    modeEl.value = mode;

    if (applyPreset || mode !== 'custom') {
      const topLevelId = this.state.getNextLevelId(this.state.activeLayerId);
      const offsets = this.state.getSurfaceHeightOffsets({
        heightMode: mode,
        levelId: this.state.activeLayerId,
        topLevelId,
        bottomOffset: this.state.surfaceDraftBottomOffset,
        topOffset: this.state.surfaceDraftTopOffset,
      });
      this.state.surfaceDraftBottomOffset = offsets.bottomOffset;
      this.state.surfaceDraftTopOffset = offsets.topOffset;
    }

    bottomEl.value = String(Math.round(this.state.surfaceDraftBottomOffset || 0));
    topEl.value = String(Math.round(this.state.surfaceDraftTopOffset || 0));
    const isCustom = mode === 'custom';
    bottomEl.disabled = !isCustom;
    topEl.disabled = !isCustom;
  }

  _syncRoofInputs() {
    const slopeEl = document.getElementById('input-roof-slope');
    const directionEl = document.getElementById('sel-roof-direction');
    const baseOffsetEl = document.getElementById('input-roof-base-offset');
    const groupEl = document.getElementById('input-roof-group-id');
    if (slopeEl) slopeEl.value = String(this.state.surfaceDraftRoofSlope || 0);
    if (directionEl) directionEl.value = this.state.surfaceDraftRoofDirection || 'xPlus';
    if (baseOffsetEl) baseOffsetEl.value = String(this.state.surfaceDraftRoofBaseOffset || 0);
    if (groupEl) groupEl.value = this.state.surfaceDraftRoofGroupId || 'RG1';
  }

  refreshLayerSelectors() {
    const sortedLevels = [...this.state.levels].sort((a, b) => a.z - b.z);
    const layerHtml = sortedLevels
      .map(l => `<option value="${l.id}">${l.name} (z=${l.z})</option>`)
      .join('');

    const selActive = document.getElementById('sel-active-layer');
    const selTop = document.getElementById('sel-top-layer');
    if (selActive) {
      selActive.innerHTML = layerHtml;
      selActive.value = this.state.activeLayerId;
    }
    if (selTop) {
      selTop.innerHTML = layerHtml;
      selTop.value = this.state.surfaceDraftTopLayerId;
    }
    const selMemberType = document.getElementById('sel-member-type');
    if (selMemberType) selMemberType.value = this.state.memberDraftType;
    const selSurfaceType = document.getElementById('sel-surface-type');
    if (selSurfaceType) selSurfaceType.value = this.state.surfaceDraftType;
    const selSurfaceMode = document.getElementById('sel-surface-mode');
    if (selSurfaceMode) selSurfaceMode.value = this.state.surfaceDraftMode;
    const selLoadDir = document.getElementById('sel-load-direction');
    if (selLoadDir) selLoadDir.value = this.state.surfaceDraftLoadDir;
    const selPlanLayerMode = document.getElementById('sel-plan-layer-display-mode');
    if (selPlanLayerMode) selPlanLayerMode.value = this.state.settings.planLayerDisplayMode || 'all';
    const selMember3DMode = document.getElementById('sel-member-3d-render-mode');
    if (selMember3DMode) selMember3DMode.value = this.state.settings.member3dRenderMode || 'solid';
    this._updateMemberLayerHint();
    this._syncWallHeightInputs(false);
    this._syncRoofInputs();
  }

  _updateMemberLayerHint() {
    const hint = document.getElementById('member-layer-hint');
    if (!hint) return;
    const activeLevel = this.state.levels.find(l => l.id === this.state.activeLayerId);
    const topLevelId = this.state.getNextLevelId(this.state.activeLayerId);
    const topLevel = this.state.levels.find(l => l.id === topLevelId);
    const activeLabel = activeLevel ? `${activeLevel.name} (z=${activeLevel.z})` : (this.state.activeLayerId || '-');
    const topLabel = topLevel ? `${topLevel.name} (z=${topLevel.z})` : '-';

    if (this.state.memberDraftType === 'column') {
      hint.textContent = t('memberLayerHintColumn')
        .replace('{base}', activeLabel)
        .replace('{top}', topLabel);
    } else if (this.state.memberDraftType === 'vbrace') {
      hint.textContent = t('memberLayerHintVBrace')
        .replace('{base}', activeLabel)
        .replace('{top}', topLabel);
    } else {
      hint.textContent = t('memberLayerHintPlan').replace('{layer}', activeLabel);
    }
  }

  updatePropertyPanel() {
    this.refreshQuantitySummary();
    const container = document.getElementById('prop-content');

    if (this.state.selectedSupportId) {
      this._renderSupportProperties(container);
      return;
    }

    if (this.state.selectedLoadId) {
      this._renderLoadProperties(container);
      return;
    }

    if (this.state.selectedSurfaceId) {
      this._renderSurfaceProperties(container);
      return;
    }

    const member = this.state.selectedMemberId
      ? this.state.getMember(this.state.selectedMemberId)
      : null;

    if (!member) {
      container.innerHTML = `<p class="prop-placeholder">${t('noSelection')}</p>`;
      return;
    }

    const isColumn = member.type === 'column';
    const isVBrace = member.type === 'vbrace';
    const hasTopLevel = isColumn || isVBrace;
    const n1 = this.state.getNode(member.startNodeId);
    const n2 = this.state.getNode(member.endNodeId);
    const sectionDefs = this.state.listSections('member', member.type);
    const springDefs = this.state.listSprings();

    let lengthDisplay;
    if (isColumn) {
      const bottomLevel = this.state.levels.find(l => l.id === member.levelId);
      const topLevel = this.state.levels.find(l => l.id === member.topLevelId);
      lengthDisplay = (bottomLevel && topLevel) ? `${Math.abs(topLevel.z - bottomLevel.z)} mm` : '?';
    } else {
      const dz = member.geometryMode === 'explicit3d'
        ? (Number(member.endZ || 0) - Number(member.startZ || 0))
        : 0;
      const len = n1 && n2 ? Math.round(Math.hypot(n2.x - n1.x, n2.y - n1.y, dz)) : '?';
      lengthDisplay = `${len} mm`;
    }

    const sectionOptions = sectionDefs.length > 0
      ? sectionDefs.map(s =>
        `<option value="${escapeHtml(s.name)}" ${s.name === member.sectionName ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
      ).join('')
      : `<option value="${escapeHtml(member.sectionName || '')}" selected>${escapeHtml(member.sectionName || '-')}</option>`;

    const iEnd = member.endI || { condition: 'rigid', springSymbol: null };
    const jEnd = member.endJ || { condition: 'rigid', springSymbol: null };
    const typeLabel = t(member.type);
    const level = this.state.levels.find(l => l.id === member.levelId);
    const levelLabel = level ? `${level.name} (z=${level.z})` : member.levelId;
    const topLevel = this.state.levels.find(l => l.id === member.topLevelId);
    const topLevelLabel = topLevel ? `${topLevel.name} (z=${topLevel.z})` : (member.topLevelId || '-');
    const bracePatternLabel = member.bracePattern === 'cross' ? t('braceCross') : t('braceSingle');
    const springOptionsI = springDefs.map(s =>
      `<option value="${escapeHtml(s.symbol)}" ${s.symbol === iEnd.springSymbol ? 'selected' : ''}>${escapeHtml(s.symbol)}</option>`
    ).join('');
    const springOptionsJ = springDefs.map(s =>
      `<option value="${escapeHtml(s.symbol)}" ${s.symbol === jEnd.springSymbol ? 'selected' : ''}>${escapeHtml(s.symbol)}</option>`
    ).join('');

    container.innerHTML = `
      <div class="prop-group">
        <label>${t('propType')}</label>
        <input type="text" value="${escapeHtml(typeLabel)}" disabled>
      </div>
      <div class="prop-group">
        <label>${t('propSection')}</label>
        <select id="prop-section-name">${sectionOptions}</select>
      </div>
      <div class="prop-group">
        <label>${t('propLayer')}</label>
        <input type="text" value="${escapeHtml(levelLabel)}" disabled>
      </div>
      ${hasTopLevel ? `
      <div class="prop-group">
        <label>${t('topLayer')}</label>
        <input type="text" value="${escapeHtml(topLevelLabel)}" disabled>
      </div>
      ` : ''}
      ${isVBrace ? `
      <div class="prop-group">
        <label>${t('bracePattern')}</label>
        <input type="text" value="${escapeHtml(bracePatternLabel)}" disabled>
      </div>
      ` : ''}
      <div class="prop-row">
        <div class="prop-group">
          <label>${t('propWidthB')}</label>
          <input type="text" value="${member.section.b}" disabled>
        </div>
        <div class="prop-group">
          <label>${t('propHeightH')}</label>
          <input type="text" value="${member.section.h}" disabled>
        </div>
      </div>
      <div class="prop-group">
        <label>${t('propEndI')} (${t('propStartPoint')})</label>
        <div class="prop-row">
          <div class="prop-group"><label>X (mm)</label><input type="number" id="prop-start-x" value="${n1 ? Math.round(n1.x) : 0}" step="100"></div>
          <div class="prop-group"><label>Y (mm)</label><input type="number" id="prop-start-y" value="${n1 ? Math.round(n1.y) : 0}" step="100"></div>
        </div>
        <select id="prop-endi-condition">
          <option value="pin" ${iEnd.condition === 'pin' ? 'selected' : ''}>${t('endPin')}</option>
          <option value="rigid" ${iEnd.condition === 'rigid' ? 'selected' : ''}>${t('endRigid')}</option>
          <option value="spring" ${iEnd.condition === 'spring' ? 'selected' : ''}>${t('endSpring')}</option>
        </select>
      </div>
      ${iEnd.condition === 'spring' ? `
      <div class="prop-group">
        <label>${t('propSpringSymbol')}</label>
        <select id="prop-endi-spring">${springOptionsI}</select>
      </div>
      ` : ''}
      <div class="prop-group">
        <label>${t('propEndJ')} (${t('propEndPoint')})</label>
        <div class="prop-row">
          <div class="prop-group"><label>X (mm)</label><input type="number" id="prop-end-x" value="${n2 ? Math.round(n2.x) : 0}" step="100"></div>
          <div class="prop-group"><label>Y (mm)</label><input type="number" id="prop-end-y" value="${n2 ? Math.round(n2.y) : 0}" step="100"></div>
        </div>
        <select id="prop-endj-condition">
          <option value="pin" ${jEnd.condition === 'pin' ? 'selected' : ''}>${t('endPin')}</option>
          <option value="rigid" ${jEnd.condition === 'rigid' ? 'selected' : ''}>${t('endRigid')}</option>
          <option value="spring" ${jEnd.condition === 'spring' ? 'selected' : ''}>${t('endSpring')}</option>
        </select>
      </div>
      ${jEnd.condition === 'spring' ? `
      <div class="prop-group">
        <label>${t('propSpringSymbol')}</label>
        <select id="prop-endj-spring">${springOptionsJ}</select>
      </div>
      ` : ''}
      <div class="prop-group">
        <label>${t('propColor')}</label>
        <input type="color" value="${resolveMemberColor(member)}" disabled>
      </div>
      ${member.roofRole ? `
      <div class="prop-group">
        <label>${t('roofRole')}</label>
        <input type="text" value="${escapeHtml(t(roofRoleLabelKey(member.roofRole)))}" disabled>
      </div>
      ` : ''}
      <div class="prop-group">
        <label>${t('propLength')}</label>
        <input type="text" value="${lengthDisplay}" disabled>
      </div>
    `;

    const bind = (id, key, transform = v => v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        const val = transform(el.value);
        this.state.updateMember(member.id, { [key]: val });
        this.callbacks.onPropertyChange?.(member.id);
      });
    };

    const bindEnd = (conditionId, springId, key) => {
      const conditionEl = document.getElementById(conditionId);
      const springEl = document.getElementById(springId);
      if (conditionEl) {
        conditionEl.addEventListener('change', () => {
          this.state.updateMember(member.id, {
            [key]: {
              condition: conditionEl.value,
              springSymbol: springEl ? springEl.value : null,
            },
          });
          this.callbacks.onPropertyChange?.(member.id);
        });
      }
      if (springEl) {
        springEl.addEventListener('change', () => {
          this.state.updateMember(member.id, {
            [key]: {
              condition: conditionEl?.value || 'spring',
              springSymbol: springEl.value,
            },
          });
          this.callbacks.onPropertyChange?.(member.id);
        });
      }
    };

    bind('prop-section-name', 'sectionName');
    bindEnd('prop-endi-condition', 'prop-endi-spring', 'endI');
    bindEnd('prop-endj-condition', 'prop-endj-spring', 'endJ');

    // Node coordinate editing
    const bindNodeCoord = (inputId, nodeId, key) => {
      const el = document.getElementById(inputId);
      if (!el || !nodeId) return;
      el.addEventListener('change', () => {
        const val = parseFloat(el.value);
        if (!Number.isFinite(val)) return;
        this.state.updateNode(nodeId, { [key]: val });
        this.callbacks.onPropertyChange?.(member.id);
      });
    };
    bindNodeCoord('prop-start-x', member.startNodeId, 'x');
    bindNodeCoord('prop-start-y', member.startNodeId, 'y');
    bindNodeCoord('prop-end-x', member.endNodeId, 'x');
    bindNodeCoord('prop-end-y', member.endNodeId, 'y');
  }

  _renderSurfaceProperties(container) {
    const surface = this.state.getSurface(this.state.selectedSurfaceId);
    if (!surface) {
      container.innerHTML = `<p class="prop-placeholder">${t('noSelection')}</p>`;
      return;
    }

    const isWall = isWallSurfaceType(surface.type);
    const isRoof = surface.type === 'roof';
    const isGableWall = isGableWallSurfaceType(surface.type);
    const isRectangularWall = isWall && !isGableWall;
    const isSloped = isSlopedSurfaceType(surface.type);
    const isWindSurface = isWall || isSloped;
    const canGenerateRoof = (surface.type === 'floor' || surface.type === 'exteriorWall') && surface.shape !== 'line';
    const area = computeSurfaceWeightAreaM2(this.state, surface);
    const vertices = Array.isArray(surface.points) ? surface.points.length : 4;
    const typeLabel = t(surface.type);
    const level = this.state.levels.find(l => l.id === surface.levelId);
    const levelLabel = level ? `${level.name} (z=${level.z})` : surface.levelId;
    const range = resolveSurfaceVerticalRange(this.state, surface);
    const wind = computeSurfaceWindProjectionM2(this.state, surface);
    const sectionDefs = this.state.listSections('surface', surface.type);
    const sectionOptions = sectionDefs.length > 0
      ? sectionDefs.map(s =>
        `<option value="${escapeHtml(s.name)}" ${s.name === surface.sectionName ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
      ).join('')
      : `<option value="${escapeHtml(surface.sectionName || '')}" selected>${escapeHtml(surface.sectionName || '-')}</option>`;
    const heightModeOptions = ['full', 'waist', 'hanging', 'custom']
      .map(mode => `<option value="${mode}" ${surface.heightMode === mode ? 'selected' : ''}>${t(`wallHeight${capitalize(mode)}`)}</option>`)
      .join('');
    const windProjectionFields = isWindSurface ? `
      <div class="prop-group">
        <label>${t('calculatedWindArea')}</label>
        <div class="prop-row">
          <div class="prop-group">
            <label>${t('windAreaX')} (m²)</label>
            <input type="text" value="${formatNumber(wind.xAreaM2)}" disabled>
          </div>
          <div class="prop-group">
            <label>${t('windAreaY')} (m²)</label>
            <input type="text" value="${formatNumber(wind.yAreaM2)}" disabled>
          </div>
        </div>
      </div>
    ` : '';
    const roofAutoGenerationFields = canGenerateRoof ? `
      <div class="prop-group">
        <label>${t('roofAutoGenerate')}</label>
        <select id="prop-auto-roof-pattern">
          <option value="single">${t('roofPatternSingle')}</option>
          <option value="gableX">${t('roofPatternGableX')}</option>
          <option value="gableY">${t('roofPatternGableY')}</option>
          <option value="hip">${t('roofPatternHip')}</option>
        </select>
      </div>
      <div class="prop-row">
        <div class="prop-group">
          <label>${t('roofGroupId')}</label>
          <input type="text" id="prop-auto-roof-group-id" value="${escapeHtml(this.state.surfaceDraftRoofGroupId || 'RG1')}">
        </div>
        <div class="prop-group">
          <label>${t('roofSlope')}</label>
          <input type="number" id="prop-auto-roof-slope" value="${this.state.surfaceDraftRoofSlope || 0.3}" min="0" step="0.01">
        </div>
      </div>
      <div class="prop-row">
        <div class="prop-group">
          <label>${t('roofBaseOffset')} (mm)</label>
          <input type="number" id="prop-auto-roof-base-offset" value="${Math.round(this.state.surfaceDraftRoofBaseOffset || 0)}" step="100">
        </div>
        <div class="prop-group">
          <label>${t('roofDirection')}</label>
          <select id="prop-auto-roof-direction">
            <option value="xPlus" ${this.state.surfaceDraftRoofDirection === 'xPlus' ? 'selected' : ''}>${t('roofDirXPlus')}</option>
            <option value="xMinus" ${this.state.surfaceDraftRoofDirection === 'xMinus' ? 'selected' : ''}>${t('roofDirXMinus')}</option>
            <option value="yPlus" ${this.state.surfaceDraftRoofDirection === 'yPlus' ? 'selected' : ''}>${t('roofDirYPlus')}</option>
            <option value="yMinus" ${this.state.surfaceDraftRoofDirection === 'yMinus' ? 'selected' : ''}>${t('roofDirYMinus')}</option>
          </select>
        </div>
      </div>
      <div class="prop-group">
        <button type="button" class="support-preset-btn" id="btn-auto-roof-planes">${t('roofGeneratePlanes')}</button>
      </div>
    ` : '';

    container.innerHTML = `
      <div class="prop-group">
        <label>${t('propType')}</label>
        <input type="text" value="${escapeHtml(typeLabel)}" disabled>
      </div>
      <div class="prop-group">
        <label>${t('propLayer')}</label>
        <input type="text" value="${escapeHtml(levelLabel)}" disabled>
      </div>
      <div class="prop-group">
        <label>${t('propSection')}</label>
        <select id="prop-surface-section">${sectionOptions}</select>
      </div>
      ${surface.type === 'floor' ? `
      <div class="prop-group">
        <label>${t('loadDirection')}</label>
        <select id="prop-load-direction">
          <option value="x" ${surface.loadDirection === 'x' ? 'selected' : ''}>X</option>
          <option value="y" ${surface.loadDirection === 'y' ? 'selected' : ''}>Y</option>
          <option value="twoWay" ${surface.loadDirection === 'twoWay' ? 'selected' : ''}>${t('twoWay')}</option>
        </select>
      </div>
      ` : ''}
      ${roofAutoGenerationFields}
      ${isRectangularWall ? `
      <div class="prop-group">
        <label>${t('wallHeightMode')}</label>
        <select id="prop-wall-height-mode">${heightModeOptions}</select>
      </div>
      <div class="prop-row">
        <div class="prop-group">
          <label>${t('wallBottomOffset')} (mm)</label>
          <input type="number" id="prop-wall-bottom-offset" value="${Math.round(surface.bottomOffset || 0)}" step="100">
        </div>
        <div class="prop-group">
          <label>${t('wallTopOffset')} (mm)</label>
          <input type="number" id="prop-wall-top-offset" value="${Math.round(surface.topOffset || 0)}" step="100">
        </div>
      </div>
      <div class="prop-group">
        <label>${t('wallVerticalRange')}</label>
        <input type="text" value="${Math.round(range.bottom)} - ${Math.round(range.top)} mm" disabled>
      </div>
      ` : ''}
      ${isGableWall ? `
      <div class="prop-group">
        <label>${t('wallBottomOffset')} (mm)</label>
        <input type="number" id="prop-gable-bottom-offset" value="${Math.round(surface.bottomOffset || 0)}" step="100">
      </div>
      <div class="prop-row">
        <div class="prop-group">
          <label>${t('gableStartTopOffset')} (mm)</label>
          <input type="number" id="prop-gable-start-top-offset" value="${Math.round(gableTopOffset(surface, 'gableStartTopOffset'))}" step="100">
        </div>
        <div class="prop-group">
          <label>${t('gableEndTopOffset')} (mm)</label>
          <input type="number" id="prop-gable-end-top-offset" value="${Math.round(gableTopOffset(surface, 'gableEndTopOffset'))}" step="100">
        </div>
      </div>
      <div class="prop-group">
        <label>${t('wallVerticalRange')}</label>
        <input type="text" value="${Math.round(range.bottom)} - ${Math.round(range.top)} mm" disabled>
      </div>
      ` : ''}
      ${isSloped ? `
      <div class="prop-row">
        <div class="prop-group">
          <label>${t('roofSlope')}</label>
          <input type="number" id="prop-roof-slope" value="${surface.roofSlope || 0}" min="0" step="0.01">
        </div>
        <div class="prop-group">
          <label>${t('roofBaseOffset')} (mm)</label>
          <input type="number" id="prop-roof-base-offset" value="${Math.round(surface.roofBaseOffset || 0)}" step="100">
        </div>
      </div>
      <div class="prop-group">
        <label>${t('roofDirection')}</label>
        <select id="prop-roof-direction">
          <option value="xPlus" ${surface.roofDirection === 'xPlus' ? 'selected' : ''}>${t('roofDirXPlus')}</option>
          <option value="xMinus" ${surface.roofDirection === 'xMinus' ? 'selected' : ''}>${t('roofDirXMinus')}</option>
          <option value="yPlus" ${surface.roofDirection === 'yPlus' ? 'selected' : ''}>${t('roofDirYPlus')}</option>
          <option value="yMinus" ${surface.roofDirection === 'yMinus' ? 'selected' : ''}>${t('roofDirYMinus')}</option>
        </select>
      </div>
      ${isRoof ? `
      <div class="prop-group">
        <label>${t('roofGroupId')}</label>
        <input type="text" id="prop-roof-group-id" value="${escapeHtml(surface.roofGroupId || 'RG1')}">
      </div>
      ` : ''}
      ${isRoof ? `
      <div class="prop-group">
        <button type="button" class="support-preset-btn" id="btn-roof-edge-members">${t('roofGenerateEdgeMembers')}</button>
      </div>
      <div class="prop-group">
        <label>${t('roofFramingSpacing')} (mm)</label>
        <input type="number" id="prop-roof-framing-spacing" value="910" min="1" step="10">
      </div>
      <div class="prop-group">
        <button type="button" class="support-preset-btn" id="btn-roof-slope-members">${t('roofGenerateSlopeMembers')}</button>
      </div>
      <div class="prop-group">
        <button type="button" class="support-preset-btn" id="btn-roof-joint-members">${t('roofGenerateJointMembers')}</button>
      </div>
      <div class="prop-group">
        <label>${t('roofEaveDepth')} (mm)</label>
        <input type="number" id="prop-roof-eave-depth" value="600" min="1" step="50">
      </div>
      <div class="prop-group">
        <button type="button" class="support-preset-btn" id="btn-roof-eaves">${t('roofGenerateEaves')}</button>
      </div>
      <div class="prop-group">
        <button type="button" class="support-preset-btn" id="btn-roof-gable-walls">${t('roofGenerateGableWalls')}</button>
      </div>
      <div class="prop-group">
        <button type="button" class="support-preset-btn" id="btn-roof-validate-group">${t('roofValidateGroup')}</button>
      </div>
      <div class="prop-row">
        <div class="prop-group">
          <button type="button" class="support-preset-btn" id="btn-roof-remove-generated">${t('roofRemoveGenerated')}</button>
        </div>
        <div class="prop-group">
          <button type="button" class="support-preset-btn" id="btn-roof-regenerate">${t('roofRegenerateGenerated')}</button>
        </div>
      </div>
      ` : ''}
      ` : ''}
      ${windProjectionFields}
      <div class="prop-group">
        <label>${t('propColor')}</label>
        <input type="color" value="${surface.color}" disabled>
      </div>
      <div class="prop-group">
        <label>${t('propArea')}</label>
        <input type="text" value="${formatNumber(area)} m²" disabled>
      </div>
      <div class="prop-group">
        <label>${t('propVertices')}</label>
        <input type="text" value="${vertices}" disabled>
      </div>
      <div class="prop-group">
        <label>${t('unitWeight')} (${t('weightUnit_surface')})</label>
        <input type="number" id="prop-surface-unit-weight" value="${surface.unitWeight || 0}" step="100">
      </div>
      ${isWindSurface ? `
      <div class="prop-group">
        <label class="prop-check-label">
          <input type="checkbox" id="prop-surface-include-wind" ${surface.includeWind !== false ? 'checked' : ''}>
          <span>${t('includeWind')}</span>
        </label>
      </div>
      ` : ''}
      <div class="prop-group">
        <label class="prop-check-label">
          <input type="checkbox" id="prop-surface-include-seismic" ${surface.includeSeismicWeight ? 'checked' : ''}>
          <span>${t('includeSeismicWeight')}</span>
        </label>
      </div>
    `;

    const bind = (id, key, transform = v => v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        this.state.updateSurface(surface.id, { [key]: transform(el.value, el) });
        this.callbacks.onPropertyChange?.(surface.id);
      });
    };
    const bindChecked = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        this.state.updateSurface(surface.id, { [key]: el.checked });
        this.callbacks.onPropertyChange?.(surface.id);
      });
    };

    bind('prop-surface-section', 'sectionName');
    bind('prop-surface-top-level', 'topLevelId');
    bind('prop-load-direction', 'loadDirection');
    bind('prop-wall-height-mode', 'heightMode');
    bind('prop-roof-slope', 'roofSlope', (_value, el) => Math.max(0, readNumberInput(el, surface.roofSlope || 0)));
    bind('prop-roof-direction', 'roofDirection');
    bind('prop-roof-base-offset', 'roofBaseOffset', (_value, el) => readNumberInput(el, surface.roofBaseOffset || 0));
    bind('prop-roof-group-id', 'roofGroupId', value => String(value || '').trim() || 'RG1');
    bind('prop-surface-unit-weight', 'unitWeight', (_value, el) => Math.max(0, readNumberInput(el, surface.unitWeight || 0)));
    bindChecked('prop-surface-include-wind', 'includeWind');
    bindChecked('prop-surface-include-seismic', 'includeSeismicWeight');
    document.getElementById('btn-roof-edge-members')?.addEventListener('click', () => {
      const members = this.state.addRoofEdgeMembers(surface.id);
      this.callbacks.onPropertyChange?.(surface.id);
      this._showGenerationNotice(container, members.length, 'roofGeneratedMembers');
    });
    document.getElementById('btn-roof-slope-members')?.addEventListener('click', () => {
      const spacingEl = document.getElementById('prop-roof-framing-spacing');
      const spacing = Math.max(1, readNumberInput(spacingEl, 910));
      if (spacingEl) spacingEl.value = String(spacing);
      const members = this.state.addRoofSlopeMembers(surface.id, { spacing });
      this.callbacks.onPropertyChange?.(surface.id);
      this._showGenerationNotice(container, members.length, 'roofGeneratedSlopeMembers');
    });
    document.getElementById('btn-roof-joint-members')?.addEventListener('click', () => {
      const members = this.state.addRoofJointMembers(surface.roofGroupId || 'RG1');
      this.callbacks.onPropertyChange?.(surface.id);
      this._showGenerationNotice(container, members.length, 'roofGeneratedJointMembers');
    });
    document.getElementById('btn-roof-eaves')?.addEventListener('click', () => {
      const depthEl = document.getElementById('prop-roof-eave-depth');
      const depth = Math.max(1, readNumberInput(depthEl, 600));
      if (depthEl) depthEl.value = String(depth);
      const eaves = this.state.addEavesFromRoofGroup(surface.roofGroupId || 'RG1', { depth });
      this.callbacks.onPropertyChange?.(surface.id);
      this._showGenerationNotice(container, eaves.length, 'roofGeneratedEaves');
    });
    document.getElementById('btn-roof-gable-walls')?.addEventListener('click', () => {
      const walls = this.state.addGableWallsFromRoofGroup(surface.roofGroupId || 'RG1');
      this.callbacks.onPropertyChange?.(surface.id);
      this._showGenerationNotice(container, walls.length, 'roofGeneratedGableWalls');
    });
    document.getElementById('btn-roof-validate-group')?.addEventListener('click', () => {
      const result = this.state.validateRoofGroup(surface.roofGroupId || 'RG1');
      const message = result.issues.length
        ? t('roofValidationIssues').replace('{n}', String(result.issues.length))
        : t('roofValidationOk');
      this._showInlineNotice(container, message);
    });
    document.getElementById('btn-roof-remove-generated')?.addEventListener('click', () => {
      const removed = this.state.removeRoofGeneratedElements(surface.roofGroupId || 'RG1');
      this.callbacks.onPropertyChange?.(surface.id);
      this._showGenerationNotice(container, removed.total, 'roofRemovedGenerated');
    });
    document.getElementById('btn-roof-regenerate')?.addEventListener('click', () => {
      const spacingEl = document.getElementById('prop-roof-framing-spacing');
      const depthEl = document.getElementById('prop-roof-eave-depth');
      const spacing = Math.max(1, readNumberInput(spacingEl, 910));
      const depth = Math.max(1, readNumberInput(depthEl, 600));
      if (spacingEl) spacingEl.value = String(spacing);
      if (depthEl) depthEl.value = String(depth);
      const result = this.state.regenerateRoofGeneratedElements(surface.roofGroupId || 'RG1', { spacing, depth });
      this.callbacks.onPropertyChange?.(surface.id);
      this._showGenerationNotice(container, result.generatedTotal, 'roofRegeneratedElements');
    });
    document.getElementById('btn-auto-roof-planes')?.addEventListener('click', () => {
      const groupEl = document.getElementById('prop-auto-roof-group-id');
      const slopeEl = document.getElementById('prop-auto-roof-slope');
      const baseOffsetEl = document.getElementById('prop-auto-roof-base-offset');
      const directionEl = document.getElementById('prop-auto-roof-direction');
      const pattern = document.getElementById('prop-auto-roof-pattern')?.value || 'single';
      const roofGroupId = String(groupEl?.value || '').trim() || 'RG1';
      const roofSlope = Math.max(0, readNumberInput(slopeEl, this.state.surfaceDraftRoofSlope || 0.3));
      const roofBaseOffset = readNumberInput(baseOffsetEl, this.state.surfaceDraftRoofBaseOffset || 0);
      const roofDirection = directionEl?.value || this.state.surfaceDraftRoofDirection || 'xPlus';
      if (groupEl) groupEl.value = roofGroupId;
      if (slopeEl) slopeEl.value = String(roofSlope);
      if (baseOffsetEl) baseOffsetEl.value = String(roofBaseOffset);
      this.state.surfaceDraftRoofGroupId = roofGroupId;
      this.state.surfaceDraftRoofSlope = roofSlope;
      this.state.surfaceDraftRoofBaseOffset = roofBaseOffset;
      this.state.surfaceDraftRoofDirection = roofDirection;
      const roofs = this.state.addRoofPlanesFromSurface(surface.id, {
        pattern,
        roofGroupId,
        roofSlope,
        roofBaseOffset,
        roofDirection,
      });
      this.callbacks.onPropertyChange?.(surface.id);
      this._showGenerationNotice(container, roofs.length, 'roofGeneratedPlanes');
    });

    const bindWallHeightOffsets = () => {
      const bottomEl = document.getElementById('prop-wall-bottom-offset');
      const topEl = document.getElementById('prop-wall-top-offset');
      if (!bottomEl || !topEl) return;
      const apply = () => {
        const bottomOffset = readNumberInput(bottomEl, surface.bottomOffset || 0);
        const topOffset = readNumberInput(topEl, surface.topOffset || 0);
        if (topOffset <= bottomOffset) {
          markInputInvalid(topEl, t('wallInvalidHeight'));
          return;
        }
        clearInputInvalid(bottomEl);
        clearInputInvalid(topEl);
        this.state.updateSurface(surface.id, {
          heightMode: 'custom',
          bottomOffset,
          topOffset,
        });
        this.callbacks.onPropertyChange?.(surface.id);
      };
      bottomEl.addEventListener('change', apply);
      topEl.addEventListener('change', apply);
    };
    bindWallHeightOffsets();

    const bindGableWallOffsets = () => {
      const bottomEl = document.getElementById('prop-gable-bottom-offset');
      const startEl = document.getElementById('prop-gable-start-top-offset');
      const endEl = document.getElementById('prop-gable-end-top-offset');
      if (!bottomEl || !startEl || !endEl) return;
      const apply = () => {
        const bottomOffset = readNumberInput(bottomEl, surface.bottomOffset || 0);
        const gableStartTopOffset = readNumberInput(startEl, gableTopOffset(surface, 'gableStartTopOffset'));
        const gableEndTopOffset = readNumberInput(endEl, gableTopOffset(surface, 'gableEndTopOffset'));
        let isValid = true;
        if (gableStartTopOffset < bottomOffset) {
          markInputInvalid(startEl, t('gableInvalidTop'));
          isValid = false;
        } else {
          clearInputInvalid(startEl);
        }
        if (gableEndTopOffset < bottomOffset) {
          markInputInvalid(endEl, t('gableInvalidTop'));
          isValid = false;
        } else {
          clearInputInvalid(endEl);
        }
        if (!isValid) return;
        clearInputInvalid(bottomEl);
        this.state.updateSurface(surface.id, {
          heightMode: 'custom',
          bottomOffset,
          gableStartTopOffset,
          gableEndTopOffset,
        });
        this.callbacks.onPropertyChange?.(surface.id);
      };
      bottomEl.addEventListener('change', apply);
      startEl.addEventListener('change', apply);
      endEl.addEventListener('change', apply);
    };
    bindGableWallOffsets();
  }

  _showInlineNotice(container, message) {
    const notice = document.createElement('p');
    notice.className = 'quantity-note';
    notice.textContent = message;
    container.appendChild(notice);
  }

  _showGenerationNotice(container, count, messageKey) {
    const message = count > 0
      ? t(messageKey).replace('{n}', String(count))
      : t('roofGeneratedNone');
    this._showInlineNotice(container, message);
  }

  _renderLoadProperties(container) {
    const load = this.state.getLoad(this.state.selectedLoadId);
    if (!load) {
      container.innerHTML = `<p class="prop-placeholder">${t('noSelection')}</p>`;
      return;
    }

    const isArea = load.type === 'areaLoad';
    const isLine = load.type === 'lineLoad';
    const isPoint = load.type === 'pointLoad';
    const typeLabel = t(load.type);
    const level = this.state.levels.find(l => l.id === load.levelId);
    const levelLabel = level ? `${level.name} (z=${level.z})` : load.levelId;

    let coordFields = '';
    if (isArea || isLine) {
      coordFields = `
        <div class="prop-row">
          <div class="prop-group"><label>X1 (mm)</label><input type="number" id="prop-ld-x1" value="${Math.round(load.x1)}" step="100"></div>
          <div class="prop-group"><label>Y1 (mm)</label><input type="number" id="prop-ld-y1" value="${Math.round(load.y1)}" step="100"></div>
        </div>
        <div class="prop-row">
          <div class="prop-group"><label>X2 (mm)</label><input type="number" id="prop-ld-x2" value="${Math.round(load.x2)}" step="100"></div>
          <div class="prop-group"><label>Y2 (mm)</label><input type="number" id="prop-ld-y2" value="${Math.round(load.y2)}" step="100"></div>
        </div>`;
    } else {
      coordFields = `
        <div class="prop-row">
          <div class="prop-group"><label>X (mm)</label><input type="number" id="prop-ld-x1" value="${Math.round(load.x1)}" step="100"></div>
          <div class="prop-group"><label>Y (mm)</label><input type="number" id="prop-ld-y1" value="${Math.round(load.y1)}" step="100"></div>
        </div>`;
    }

    let valueFields = '';
    if (isArea) {
      valueFields = `
        <div class="prop-group">
          <label>${t('loadValue')} (${t('loadUnit_area')})</label>
          <input type="number" id="prop-ld-value" value="${load.value}" step="100">
        </div>`;
    } else if (isLine) {
      valueFields = `
        <div class="prop-group">
          <label>${t('loadValue')} (${t('loadUnit_line')})</label>
          <input type="number" id="prop-ld-value" value="${load.value}" step="100">
        </div>`;
    } else if (isPoint) {
      valueFields = `
        <div class="prop-row">
          <div class="prop-group"><label>FX (N)</label><input type="number" id="prop-ld-fx" value="${load.fx}" step="100"></div>
          <div class="prop-group"><label>FY (N)</label><input type="number" id="prop-ld-fy" value="${load.fy}" step="100"></div>
        </div>
        <div class="prop-row">
          <div class="prop-group"><label>FZ (N)</label><input type="number" id="prop-ld-fz" value="${load.fz}" step="100"></div>
          <div class="prop-group"><label>MX (N·m)</label><input type="number" id="prop-ld-mx" value="${load.mx}" step="10"></div>
        </div>
        <div class="prop-row">
          <div class="prop-group"><label>MY (N·m)</label><input type="number" id="prop-ld-my" value="${load.my}" step="10"></div>
          <div class="prop-group"><label>MZ (N·m)</label><input type="number" id="prop-ld-mz" value="${load.mz}" step="10"></div>
        </div>`;
    }

    container.innerHTML = `
      <div class="prop-group">
        <label>${t('propType')}</label>
        <input type="text" value="${escapeHtml(typeLabel)}" disabled>
      </div>
      <div class="prop-group">
        <label>${t('propLayer')}</label>
        <input type="text" value="${escapeHtml(levelLabel)}" disabled>
      </div>
      ${coordFields}
      ${valueFields}
      <div class="prop-group">
        <label>${t('propColor')}</label>
        <input type="color" id="prop-ld-color" value="${load.color}">
      </div>
    `;

    const bind = (id, key, transform = v => v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        this.state.updateLoad(load.id, { [key]: transform(el.value) });
        this.callbacks.onPropertyChange?.(load.id);
      });
    };

    bind('prop-ld-x1', 'x1', parseFloat);
    bind('prop-ld-y1', 'y1', parseFloat);
    bind('prop-ld-x2', 'x2', parseFloat);
    bind('prop-ld-y2', 'y2', parseFloat);
    bind('prop-ld-value', 'value', parseFloat);
    bind('prop-ld-fx', 'fx', parseFloat);
    bind('prop-ld-fy', 'fy', parseFloat);
    bind('prop-ld-fz', 'fz', parseFloat);
    bind('prop-ld-mx', 'mx', parseFloat);
    bind('prop-ld-my', 'my', parseFloat);
    bind('prop-ld-mz', 'mz', parseFloat);
    bind('prop-ld-color', 'color');
  }

  _renderSupportProperties(container) {
    const support = this.state.getSupport(this.state.selectedSupportId);
    if (!support) {
      container.innerHTML = `<p class="prop-placeholder">${t('noSelection')}</p>`;
      return;
    }

    const level = this.state.levels.find(l => l.id === support.levelId);
    const levelLabel = level ? `${level.name} (z=${level.z})` : support.levelId;

    const chk = (id, label, checked) =>
      `<label class="support-chk-label">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
        <span>${escapeHtml(label)}</span>
      </label>`;

    container.innerHTML = `
      <div class="prop-group">
        <label>${t('propType')}</label>
        <input type="text" value="${escapeHtml(t('supportType'))}" disabled>
      </div>
      <div class="prop-group">
        <label>${t('propLayer')}</label>
        <input type="text" value="${escapeHtml(levelLabel)}" disabled>
      </div>
      <div class="prop-row">
        <div class="prop-group">
          <label>X (mm)</label>
          <input type="number" id="prop-sup-x" value="${Math.round(support.x)}" step="100">
        </div>
        <div class="prop-group">
          <label>Y (mm)</label>
          <input type="number" id="prop-sup-y" value="${Math.round(support.y)}" step="100">
        </div>
      </div>
      <div class="prop-group">
        <label>${t('supportTranslation')}</label>
        <div class="support-chk-row">
          ${chk('prop-sup-dx', 'DX', support.dx)}
          ${chk('prop-sup-dy', 'DY', support.dy)}
          ${chk('prop-sup-dz', 'DZ', support.dz)}
        </div>
      </div>
      <div class="prop-group">
        <label>${t('supportRotation')}</label>
        <div class="support-chk-row">
          ${chk('prop-sup-rx', 'RX', support.rx)}
          ${chk('prop-sup-ry', 'RY', support.ry)}
          ${chk('prop-sup-rz', 'RZ', support.rz)}
        </div>
      </div>
      <div class="support-preset-row">
        <button type="button" class="support-preset-btn" id="btn-sup-pin">${t('supportPin')}</button>
        <button type="button" class="support-preset-btn" id="btn-sup-rigid">${t('supportRigid')}</button>
        <button type="button" class="support-preset-btn" id="btn-sup-free">${t('supportFree')}</button>
      </div>
    `;

    const bind = (id, key, transform = v => v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        this.state.updateSupport(support.id, { [key]: transform(el.type === 'checkbox' ? el.checked : el.value) });
        this.callbacks.onPropertyChange?.(support.id);
      });
    };

    bind('prop-sup-x', 'x', parseFloat);
    bind('prop-sup-y', 'y', parseFloat);
    bind('prop-sup-dx', 'dx');
    bind('prop-sup-dy', 'dy');
    bind('prop-sup-dz', 'dz');
    bind('prop-sup-rx', 'rx');
    bind('prop-sup-ry', 'ry');
    bind('prop-sup-rz', 'rz');

    const applyPreset = (preset) => {
      this.state.updateSupport(support.id, preset);
      this.callbacks.onPropertyChange?.(support.id);
      this._renderSupportProperties(container);
    };

    document.getElementById('btn-sup-pin')?.addEventListener('click', () => {
      applyPreset({ dx: true, dy: true, dz: true, rx: false, ry: false, rz: false });
    });
    document.getElementById('btn-sup-rigid')?.addEventListener('click', () => {
      applyPreset({ dx: true, dy: true, dz: true, rx: true, ry: true, rz: true });
    });
    document.getElementById('btn-sup-free')?.addEventListener('click', () => {
      applyPreset({ dx: false, dy: false, dz: false, rx: false, ry: false, rz: false });
    });
  }

  refreshQuantitySummary({ force = false } = {}) {
    const key = this._quantitySummaryStateKey();
    if (!force && key === this._quantitySummaryLastKey) return;
    this._quantitySummaryLastKey = key;
    this._renderQuantitySummary();
  }

  _quantitySummaryStateKey() {
    return JSON.stringify({
      levels: this.state.levels,
      nodes: this.state.nodes,
      members: this.state.members,
      surfaces: this.state.surfaces,
    });
  }

  _renderQuantitySummary() {
    const container = document.getElementById('quantity-content');
    if (!container) return;
    const summary = computeQuantitySummary(this.state);
    const hasSkippedWeightSurfaces = (this.state.surfaces || []).some(surface =>
      surface.includeSeismicWeight && !(Number(surface.unitWeight) > 0)
    );
    const rows = summary.levels
      .filter(row => row.windXAreaM2 || row.windYAreaM2 || row.seismicWeightN)
      .map(row => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td>${formatNumber(row.windXAreaM2)}</td>
          <td>${formatNumber(row.windYAreaM2)}</td>
          <td>${formatNumber(row.seismicWeightN)}</td>
        </tr>
      `).join('');
    const roofMemberRows = summary.roofMembers.rows
      .map(row => `
        <tr>
          <td>${escapeHtml(t(roofRoleLabelKey(row.roofRole)))}</td>
          <td>${row.count}</td>
          <td>${formatNumber(row.lengthM)}</td>
        </tr>
      `).join('');
    const surfaceDetailRows = (this.state.surfaces || [])
      .map(surface => {
        const wind = surface.includeWind !== false
          ? computeSurfaceWindProjectionM2(this.state, surface)
          : { xAreaM2: 0, yAreaM2: 0 };
        const seismicWeight = surface.includeSeismicWeight
          ? computeSurfaceSeismicWeightN(this.state, surface)
          : 0;
        return `
          <tr>
            <td>${escapeHtml(surface.id || '-')}</td>
            <td>${escapeHtml(t(surface.type))}</td>
            <td>${escapeHtml(surface.levelId || '-')}</td>
            <td>${formatNumber(wind.xAreaM2)}</td>
            <td>${formatNumber(wind.yAreaM2)}</td>
            <td>${formatNumber(seismicWeight)}</td>
          </tr>
        `;
      }).join('');
    const roofMemberDetailRows = (this.state.members || [])
      .filter(member => member.roofRole)
      .map(member => `
        <tr>
          <td>${escapeHtml(member.id || '-')}</td>
          <td>${escapeHtml(t(roofRoleLabelKey(member.roofRole)))}</td>
          <td>${escapeHtml(member.levelId || '-')}</td>
          <td>${formatNumber(computeMemberLengthM(this.state, member))}</td>
        </tr>
      `).join('');

    container.innerHTML = `
      <table class="quantity-table">
        <thead>
          <tr>
            <th>${t('quantityLevel')}</th>
            <th>${t('windAreaX')}</th>
            <th>${t('windAreaY')}</th>
            <th>${t('quantitySeismicWeight')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `
          <tr>
            <td>-</td>
            <td>0</td>
            <td>0</td>
            <td>0</td>
          </tr>`}
          <tr>
            <th>${t('quantityTotal')}</th>
            <th>${formatNumber(summary.totals.windXAreaM2)}</th>
            <th>${formatNumber(summary.totals.windYAreaM2)}</th>
            <th>${formatNumber(summary.totals.seismicWeightN)}</th>
          </tr>
        </tbody>
      </table>
      ${roofMemberRows ? `
      <h3 class="quantity-subtitle">${t('quantityRoofMembers')}</h3>
      <table class="quantity-table">
        <thead>
          <tr>
            <th>${t('quantityRoofRole')}</th>
            <th>${t('quantityMemberCount')}</th>
            <th>${t('quantityMemberLength')}</th>
          </tr>
        </thead>
        <tbody>
          ${roofMemberRows}
          <tr>
            <th>${t('quantityTotal')}</th>
            <th>${summary.roofMembers.totals.count}</th>
            <th>${formatNumber(summary.roofMembers.totals.lengthM)}</th>
          </tr>
        </tbody>
      </table>
      ` : ''}
      <details class="quantity-detail">
        <summary>${t('quantitySurfaceDetails')}</summary>
        <div class="quantity-detail-scroll">
          <table class="quantity-table quantity-detail-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>${t('propType')}</th>
                <th>${t('quantityLevel')}</th>
                <th>${t('windAreaX')}</th>
                <th>${t('windAreaY')}</th>
                <th>${t('quantitySeismicWeight')}</th>
              </tr>
            </thead>
            <tbody>
              ${surfaceDetailRows || `
              <tr>
                <td>-</td><td>-</td><td>-</td><td>0</td><td>0</td><td>0</td>
              </tr>`}
            </tbody>
          </table>
        </div>
      </details>
      <details class="quantity-detail">
        <summary>${t('quantityRoofMemberDetails')}</summary>
        <div class="quantity-detail-scroll">
          <table class="quantity-table quantity-detail-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>${t('quantityRoofRole')}</th>
                <th>${t('quantityLevel')}</th>
                <th>${t('quantityMemberLength')}</th>
              </tr>
            </thead>
            <tbody>
              ${roofMemberDetailRows || `
              <tr>
                <td>-</td><td>-</td><td>-</td><td>0</td>
              </tr>`}
            </tbody>
          </table>
        </div>
      </details>
      ${hasSkippedWeightSurfaces ? `<p class="quantity-note">${t('quantityNoWeight')}</p>` : ''}
    `;
  }

  updateStatusBar() {
    const snap = document.getElementById('status-snap');
    if (snap) snap.textContent = this.state.settings.snap ? t('snapOn') : t('snapOff');
  }

  updateZoom(scale) {
    const el = document.getElementById('status-zoom');
    if (el) el.textContent = `Zoom: ${Math.round(scale * 2000)}%`;
  }

  applyLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      el.textContent = t(key);
    });
    this.refreshLayerSelectors();
    this._updateToolUI();
    this.updateStatusBar();
    this.refreshQuantitySummary({ force: true });
    this.updatePropertyPanel();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  if (n === 0) return '0';
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

function capitalize(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function readNumberInput(input, fallback) {
  const n = Number(input?.value);
  return Number.isFinite(n) ? n : fallback;
}

function gableTopOffset(surface, key) {
  return finiteValue(surface?.[key], surface?.topOffset);
}

function finiteValue(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    const fallbackNumber = Number(fallback);
    return Number.isFinite(fallbackNumber) ? fallbackNumber : 0;
  }
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const fallbackNumber = Number(fallback);
  return Number.isFinite(fallbackNumber) ? fallbackNumber : 0;
}

function markInputInvalid(input, message) {
  if (!input) return;
  input.classList.add('input-error');
  input.setCustomValidity(message);
  input.reportValidity();
}

function clearInputInvalid(input) {
  if (!input) return;
  input.classList.remove('input-error');
  input.setCustomValidity('');
}
