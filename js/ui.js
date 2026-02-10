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
    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        this.state.currentTool = tool;
        this._updateToolButtons();
        this.callbacks.onToolChange?.(tool);
      });
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

    // Keyboard shortcuts for tools
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'v' || e.key === 'V') {
        this.state.currentTool = 'select';
      } else if (e.key === 'm' || e.key === 'M') {
        this.state.currentTool = 'member';
      } else if (e.key === 'f' || e.key === 'F') {
        this.state.currentTool = 'surface';
      } else {
        return;
      }
      this._updateToolButtons();
      this.callbacks.onToolChange?.(this.state.currentTool);
    });
  }

  _updateToolButtons() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === this.state.currentTool);
    });
    const toolStatus = document.getElementById('status-tool');
    if (toolStatus) {
      if (this.state.currentTool === 'surface') {
        toolStatus.textContent = t('toolSurface');
      } else if (this.state.currentTool === 'member') {
        toolStatus.textContent = t('toolMember');
      } else {
        toolStatus.textContent = t('toolSelect');
      }
    }
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

    const n1 = this.state.getNode(member.startNodeId);
    const n2 = this.state.getNode(member.endNodeId);
    const length = n1 && n2 ? Math.round(Math.hypot(n2.x - n1.x, n2.y - n1.y)) : '?';

    const levelOptions = [...this.state.levels].sort((a, b) => a.z - b.z).map(l =>
      `<option value="${l.id}" ${l.id === member.levelId ? 'selected' : ''}>${l.name} (z=${l.z})</option>`
    ).join('');

    container.innerHTML = `
      <div class="prop-group">
        <label>${t('propId')}</label>
        <input type="text" value="${member.id}" disabled>
      </div>
      <div class="prop-group">
        <label>${t('propType')}</label>
        <select id="prop-type">
          <option value="beam" ${member.type === 'beam' ? 'selected' : ''}>${t('beam')}</option>
          <option value="column" ${member.type === 'column' ? 'selected' : ''}>${t('column')}</option>
          <option value="hbrace" ${member.type === 'hbrace' ? 'selected' : ''}>${t('hbrace')}</option>
          <option value="vbrace" ${member.type === 'vbrace' ? 'selected' : ''}>${t('vbrace')}</option>
          <option value="brace" ${member.type === 'brace' ? 'selected' : ''}>${t('brace')}</option>
        </select>
      </div>
      <div class="prop-group">
        <label>${t('propLayer')}</label>
        <select id="prop-level">${levelOptions}</select>
      </div>
      <div class="prop-row">
        <div class="prop-group">
          <label>${t('propWidthB')}</label>
          <input type="number" id="prop-b" value="${member.section.b}" step="1" min="1">
        </div>
        <div class="prop-group">
          <label>${t('propHeightH')}</label>
          <input type="number" id="prop-h" value="${member.section.h}" step="1" min="1">
        </div>
      </div>
      <div class="prop-group">
        <label>${t('propMaterial')}</label>
        <select id="prop-material">
          <option value="steel" ${member.material === 'steel' ? 'selected' : ''}>${t('steel')}</option>
          <option value="rc" ${member.material === 'rc' ? 'selected' : ''}>${t('rc')}</option>
          <option value="wood" ${member.material === 'wood' ? 'selected' : ''}>${t('wood')}</option>
        </select>
      </div>
      <div class="prop-group">
        <label>${t('propColor')}</label>
        <input type="color" id="prop-color" value="${member.color}">
      </div>
      <div class="prop-group">
        <label>${t('propLength')}</label>
        <input type="text" value="${length} mm" disabled>
      </div>
    `;

    const bind = (id, key, transform = v => v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        const val = transform(el.value);
        if (key === 'b' || key === 'h') {
          this.state.updateMember(member.id, { section: { [key]: val } });
        } else {
          this.state.updateMember(member.id, { [key]: val });
        }
        this.callbacks.onPropertyChange?.(member.id);
      });
    };

    bind('prop-type', 'type');
    bind('prop-level', 'levelId');
    bind('prop-b', 'b', parseFloat);
    bind('prop-h', 'h', parseFloat);
    bind('prop-material', 'material');
    bind('prop-color', 'color');
  }

  _renderSurfaceProperties(container) {
    const surface = this.state.getSurface(this.state.selectedSurfaceId);
    if (!surface) {
      container.innerHTML = `<p class="prop-placeholder">${t('noSelection')}</p>`;
      return;
    }

    const levelOptions = [...this.state.levels].sort((a, b) => a.z - b.z).map(l =>
      `<option value="${l.id}" ${l.id === surface.levelId ? 'selected' : ''}>${l.name} (z=${l.z})</option>`
    ).join('');
    const topLevelOptions = [...this.state.levels].sort((a, b) => a.z - b.z).map(l =>
      `<option value="${l.id}" ${l.id === surface.topLevelId ? 'selected' : ''}>${l.name} (z=${l.z})</option>`
    ).join('');

    const area = Math.round(Math.abs((surface.x2 - surface.x1) * (surface.y2 - surface.y1)) / 1000000);
    const vertices = Array.isArray(surface.points) ? surface.points.length : 4;

    container.innerHTML = `
      <div class="prop-group">
        <label>${t('propId')}</label>
        <input type="text" value="${surface.id}" disabled>
      </div>
      <div class="prop-group">
        <label>${t('propType')}</label>
        <select id="prop-surface-type">
          <option value="floor" ${surface.type === 'floor' ? 'selected' : ''}>${t('floor')}</option>
          <option value="wall" ${surface.type === 'wall' ? 'selected' : ''}>${t('wall')}</option>
        </select>
      </div>
      <div class="prop-group">
        <label>${t('propLayer')}</label>
        <select id="prop-surface-level">${levelOptions}</select>
      </div>
      <div class="prop-group">
        <label>${t('topLayer')}</label>
        <select id="prop-surface-top-level">${topLevelOptions}</select>
      </div>
      <div class="prop-group">
        <label>${t('loadDirection')}</label>
        <select id="prop-load-direction">
          <option value="x" ${surface.loadDirection === 'x' ? 'selected' : ''}>X</option>
          <option value="y" ${surface.loadDirection === 'y' ? 'selected' : ''}>Y</option>
          <option value="twoWay" ${surface.loadDirection === 'twoWay' ? 'selected' : ''}>${t('twoWay')}</option>
        </select>
      </div>
      <div class="prop-group">
        <label>${t('propColor')}</label>
        <input type="color" id="prop-surface-color" value="${surface.color}">
      </div>
      <div class="prop-group">
        <label>${t('propArea')}</label>
        <input type="text" value="${area} m²" disabled>
      </div>
      <div class="prop-group">
        <label>${t('propVertices')}</label>
        <input type="text" value="${vertices}" disabled>
      </div>
    `;

    const bind = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        this.state.updateSurface(surface.id, { [key]: el.value });
        this.callbacks.onPropertyChange?.(surface.id);
      });
    };

    bind('prop-surface-type', 'type');
    bind('prop-surface-level', 'levelId');
    bind('prop-surface-top-level', 'topLevelId');
    bind('prop-load-direction', 'loadDirection');
    bind('prop-surface-color', 'color');
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
    this._updateToolButtons();
    this.updateStatusBar();
    this.updatePropertyPanel();
  }
}
