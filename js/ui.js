// ui.js - UI controls (toolbar, property panel, status bar)

import { t } from './i18n.js';

export class UI {
  constructor(state, callbacks) {
    this.state = state;
    this.callbacks = callbacks;

    this._setupToolbar();
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

    // Keyboard shortcuts for tools
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'v' || e.key === 'V') {
        this.state.currentTool = 'select';
        this._updateToolButtons();
        this.callbacks.onToolChange?.('select');
      } else if (e.key === 'm' || e.key === 'M') {
        this.state.currentTool = 'member';
        this._updateToolButtons();
        this.callbacks.onToolChange?.('member');
      }
    });
  }

  _updateToolButtons() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === this.state.currentTool);
    });
    const toolStatus = document.getElementById('status-tool');
    if (toolStatus) {
      toolStatus.textContent = this.state.currentTool === 'select' ? t('toolSelect') : t('toolMember');
    }
  }

  updatePropertyPanel() {
    const container = document.getElementById('prop-content');
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

    const levelOptions = this.state.levels.map(l =>
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
          <option value="brace" ${member.type === 'brace' ? 'selected' : ''}>${t('brace')}</option>
        </select>
      </div>
      <div class="prop-group">
        <label>${t('propLevel')}</label>
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

    // Bind change events
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

  updateStatusBar() {
    const snap = document.getElementById('status-snap');
    if (snap) snap.textContent = this.state.settings.snap ? t('snapOn') : t('snapOff');
  }

  updateZoom(scale) {
    const el = document.getElementById('status-zoom');
    if (el) el.textContent = `Zoom: ${Math.round(scale * 2000)}%`;
  }

  // Refresh all data-i18n elements and dynamic text
  applyLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      el.textContent = t(key);
    });
    this._updateToolButtons();
    this.updateStatusBar();
    this.updatePropertyPanel();
  }
}
