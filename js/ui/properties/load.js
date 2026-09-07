import { t } from '../../i18n.js';
import { escapeHtml } from '../../dom-utils.js';

import { LOAD_CASES } from '../../constants.js';

// UI delegates to these cohesive behaviors; this is the existing host.
export const loadProperties = {
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

    const loadCaseOptions = LOAD_CASES
      .map(c => `<option value="${c}" ${((load.loadCase || 'DL') === c) ? 'selected' : ''}>${c} - ${t('loadCase' + c)}</option>`)
      .join('');

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
        <label>${t('loadCaseLabel')}</label>
        <select id="prop-ld-case">${loadCaseOptions}</select>
      </div>
      ${coordFields}
      ${valueFields}
      <div class="prop-group">
        <label>${t('propColor')}</label>
        <input type="color" id="prop-ld-color" value="${load.color}">
      </div>
    `;

    const bind = (id, key, transform) => this._bindPropInput(id, val => {
      this.state.updateLoad(load.id, { [key]: val });
      this._notifyPropertyChange(load.id);
    }, { transform });

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
    bind('prop-ld-case', 'loadCase');
  }
};
