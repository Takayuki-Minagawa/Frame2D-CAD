// ui.js - UI controls (toolbar, property panel, status bar)

import { t } from './i18n.js';

export class UI {
  constructor(state, callbacks) {
    this.state = state;
    this.callbacks = callbacks;

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

    // Grid size
    document.getElementById('sel-grid').addEventListener('change', e => {
      this.state.settings.gridSize = parseFloat(e.target.value);
      this.callbacks.onGridChange?.(this.state.settings.gridSize);
    });

    // Active layer
    document.getElementById('sel-active-layer').addEventListener('change', e => {
      this.state.activeLayerId = e.target.value;
      this.callbacks.onLayerChange?.(this.state.activeLayerId);
    });

    // Member default type
    document.getElementById('sel-member-type').addEventListener('change', e => {
      this.state.memberDraftType = e.target.value;
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
    this._updateSurfaceSubOptions();
  }

  _updateSurfaceSubOptions() {
    const type = this.state.surfaceDraftType;
    const isFloor = type === 'floor';
    const modeLabel = document.getElementById('label-surface-mode');
    const loadDirLabel = document.getElementById('label-load-direction');
    const topLayerLabel = document.getElementById('label-top-layer');
    if (modeLabel) modeLabel.style.display = isFloor ? '' : 'none';
    if (loadDirLabel) loadDirLabel.style.display = isFloor ? '' : 'none';
    if (topLayerLabel) topLayerLabel.style.display = 'none';
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
  }

  updatePropertyPanel() {
    const container = document.getElementById('prop-content');

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
      const len = n1 && n2 ? Math.round(Math.hypot(n2.x - n1.x, n2.y - n1.y)) : '?';
      lengthDisplay = `${len} mm`;
    }

    const sectionOptions = sectionDefs.length > 0
      ? sectionDefs.map(s =>
        `<option value="${escapeHtml(s.name)}" ${s.name === member.sectionName ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
      ).join('')
      : `<option value="${escapeHtml(member.sectionName || '')}" selected>${escapeHtml(member.sectionName || '-')}</option>`;

    const iEnd = member.endI || { condition: 'rigid', springSymbol: null };
    const jEnd = member.endJ || { condition: 'rigid', springSymbol: null };
    const iCoords = n1 ? `X=${Math.round(n1.x)}, Y=${Math.round(n1.y)}` : '-';
    const jCoords = n2 ? `X=${Math.round(n2.x)}, Y=${Math.round(n2.y)}` : '-';
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
        <label>${t('propEndI')} (${t('propStartPoint')}: ${escapeHtml(iCoords)})</label>
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
        <label>${t('propEndJ')} (${t('propEndPoint')}: ${escapeHtml(jCoords)})</label>
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
        <input type="color" value="${member.color}" disabled>
      </div>
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
  }

  _renderSurfaceProperties(container) {
    const surface = this.state.getSurface(this.state.selectedSurfaceId);
    if (!surface) {
      container.innerHTML = `<p class="prop-placeholder">${t('noSelection')}</p>`;
      return;
    }

    const isExteriorWall = surface.type === 'exteriorWall';
    const area = Math.round(Math.abs((surface.x2 - surface.x1) * (surface.y2 - surface.y1)) / 1000000);
    const vertices = Array.isArray(surface.points) ? surface.points.length : 4;
    const typeLabel = t(surface.type);
    const level = this.state.levels.find(l => l.id === surface.levelId);
    const levelLabel = level ? `${level.name} (z=${level.z})` : surface.levelId;
    const sectionDefs = this.state.listSections('surface', surface.type);
    const sectionOptions = sectionDefs.length > 0
      ? sectionDefs.map(s =>
        `<option value="${escapeHtml(s.name)}" ${s.name === surface.sectionName ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
      ).join('')
      : `<option value="${escapeHtml(surface.sectionName || '')}" selected>${escapeHtml(surface.sectionName || '-')}</option>`;

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
      <div class="prop-group">
        <label>${t('propColor')}</label>
        <input type="color" value="${surface.color}" disabled>
      </div>
      ${!isExteriorWall ? `
      <div class="prop-group">
        <label>${t('propArea')}</label>
        <input type="text" value="${area} m²" disabled>
      </div>
      <div class="prop-group">
        <label>${t('propVertices')}</label>
        <input type="text" value="${vertices}" disabled>
      </div>
      ` : ''}
    `;

    const bind = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        this.state.updateSurface(surface.id, { [key]: el.value });
        this.callbacks.onPropertyChange?.(surface.id);
      });
    };

    bind('prop-surface-section', 'sectionName');
    bind('prop-surface-top-level', 'topLevelId');
    bind('prop-load-direction', 'loadDirection');
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
