// ui.js - UI controls (toolbar, property panel, status bar)

export class UI {
  constructor(state, callbacks) {
    this.state = state;
    this.callbacks = callbacks; // { onToolChange, onSnapToggle, onGridChange, onPropertyChange }

    this._setupToolbar();
    this._setupPropertyPanel();
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
      toolStatus.textContent = `Tool: ${this.state.currentTool === 'select' ? 'Select' : 'Member'}`;
    }
  }

  _setupPropertyPanel() {
    // Property panel updates are triggered externally via updatePropertyPanel()
  }

  updatePropertyPanel() {
    const container = document.getElementById('prop-content');
    const member = this.state.selectedMemberId
      ? this.state.getMember(this.state.selectedMemberId)
      : null;

    if (!member) {
      container.innerHTML = '<p class="prop-placeholder">No selection</p>';
      return;
    }

    const n1 = this.state.getNode(member.startNodeId);
    const n2 = this.state.getNode(member.endNodeId);
    const length = n1 && n2 ? Math.hypot(n2.x - n1.x, n2.y - n1.y).toFixed(3) : '?';

    const levelOptions = this.state.levels.map(l =>
      `<option value="${l.id}" ${l.id === member.levelId ? 'selected' : ''}>${l.name} (z=${l.z})</option>`
    ).join('');

    container.innerHTML = `
      <div class="prop-group">
        <label>ID</label>
        <input type="text" value="${member.id}" disabled>
      </div>
      <div class="prop-group">
        <label>Type</label>
        <select id="prop-type">
          <option value="beam" ${member.type === 'beam' ? 'selected' : ''}>Beam</option>
          <option value="column" ${member.type === 'column' ? 'selected' : ''}>Column</option>
          <option value="brace" ${member.type === 'brace' ? 'selected' : ''}>Brace</option>
        </select>
      </div>
      <div class="prop-group">
        <label>Level</label>
        <select id="prop-level">${levelOptions}</select>
      </div>
      <div class="prop-row">
        <div class="prop-group">
          <label>Width b (m)</label>
          <input type="number" id="prop-b" value="${member.section.b}" step="0.01" min="0.01">
        </div>
        <div class="prop-group">
          <label>Height h (m)</label>
          <input type="number" id="prop-h" value="${member.section.h}" step="0.01" min="0.01">
        </div>
      </div>
      <div class="prop-group">
        <label>Material</label>
        <select id="prop-material">
          <option value="steel" ${member.material === 'steel' ? 'selected' : ''}>Steel</option>
          <option value="rc" ${member.material === 'rc' ? 'selected' : ''}>RC</option>
          <option value="wood" ${member.material === 'wood' ? 'selected' : ''}>Wood</option>
        </select>
      </div>
      <div class="prop-group">
        <label>Color</label>
        <input type="color" id="prop-color" value="${member.color}">
      </div>
      <div class="prop-group">
        <label>Length</label>
        <input type="text" value="${length} m" disabled>
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
    if (snap) snap.textContent = `Snap: ${this.state.settings.snap ? 'ON' : 'OFF'}`;
  }

  updateZoom(scale) {
    const el = document.getElementById('status-zoom');
    if (el) el.textContent = `Zoom: ${Math.round(scale * 2)}%`;
  }
}
