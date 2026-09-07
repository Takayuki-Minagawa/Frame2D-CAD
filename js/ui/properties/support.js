import { t } from '../../i18n.js';
import { escapeHtml } from '../../dom-utils.js';

// UI delegates to these cohesive behaviors; this is the existing host.
export const supportProperties = {
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

    const bind = (id, key, transform) => this._bindPropInput(id, val => {
      this.state.updateSupport(support.id, { [key]: val });
      this._notifyPropertyChange(support.id);
    }, { transform });

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
      this._notifyPropertyChange(support.id);
      this._afterModelChange(() => this._renderSupportProperties(container));
    };

    document.getElementById('btn-sup-pin')?.addEventListener('click', () => {
      return this._runModelChange(() => {
      applyPreset({ dx: true, dy: true, dz: true, rx: false, ry: false, rz: false });

      });
    });
    document.getElementById('btn-sup-rigid')?.addEventListener('click', () => {
      return this._runModelChange(() => {
      applyPreset({ dx: true, dy: true, dz: true, rx: true, ry: true, rz: true });

      });
    });
    document.getElementById('btn-sup-free')?.addEventListener('click', () => {
      return this._runModelChange(() => {
      applyPreset({ dx: false, dy: false, dz: false, rx: false, ry: false, rz: false });

      });
    });
  }
};
