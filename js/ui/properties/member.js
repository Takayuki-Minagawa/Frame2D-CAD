import { t } from '../../i18n.js';
import { escapeHtml } from '../../dom-utils.js';
import { resolveMemberColor, roofRoleLabelKey } from '../../element-style.js';

// UI delegates to these cohesive behaviors; this is the existing host.
export const memberProperties = {
  _renderMultiMemberProperties(container) {
    const members = this.state.selectedMemberIds
      .map(id => this.state.getMember(id))
      .filter(Boolean);
    if (!members.length) {
      container.innerHTML = `<p class="prop-placeholder">${t('noSelection')}</p>`;
      return;
    }

    const typeCounts = new Map();
    for (const m of members) {
      typeCounts.set(m.type, (typeCounts.get(m.type) || 0) + 1);
    }
    const summary = [...typeCounts.entries()]
      .map(([type, count]) => `${t(type)}: ${count}`)
      .join(' / ');
    const types = [...typeCounts.keys()];
    const firstType = types[0];
    const typeOptions = types
      .map(type => `<option value="${escapeHtml(type)}">${escapeHtml(t(type))}</option>`)
      .join('');

    container.innerHTML = `
      <div class="prop-group">
        <label>${t('multiSelectCount')}</label>
        <input type="text" value="${members.length} (${escapeHtml(summary)})" disabled>
      </div>
      <div class="prop-group">
        <button type="button" class="support-preset-btn" id="btn-join-members">${t('joinMembers')}</button>
      </div>
      <div class="prop-group">
        <label>${t('multiSectionApply')}</label>
        <div class="prop-row">
          <div class="prop-group">
            <select id="batch-member-type">${typeOptions}</select>
          </div>
          <div class="prop-group">
            <select id="batch-section-name"></select>
          </div>
        </div>
        <button type="button" class="support-preset-btn" id="btn-batch-apply-section">${t('multiApply')}</button>
      </div>
      <div class="prop-group">
        <label>${t('multiMirror')}</label>
        <div class="prop-row">
          <div class="prop-group">
            <select id="batch-mirror-axis">
              <option value="x">${t('mirrorAxisX')}</option>
              <option value="y">${t('mirrorAxisY')}</option>
            </select>
          </div>
          <div class="prop-group">
            <input type="number" id="batch-mirror-coord" value="0" step="100" title="${escapeHtml(t('mirrorCoordHint'))}">
          </div>
        </div>
        <button type="button" class="support-preset-btn" id="btn-batch-mirror">${t('multiMirrorRun')}</button>
      </div>
      <div class="prop-group">
        <label>${t('multiRotate')}</label>
        <select id="batch-rotate-angle">
          <option value="90">90°</option>
          <option value="180">180°</option>
          <option value="270">270°</option>
        </select>
        <button type="button" class="support-preset-btn" id="btn-batch-rotate">${t('multiRotateRun')}</button>
      </div>
      <div class="prop-group">
        <label>${t('multiArray')}</label>
        <div class="prop-row">
          <div class="prop-group"><label>dX (mm)</label><input type="number" id="batch-array-dx" value="${this.state.settings.gridSize || 1000}" step="100"></div>
          <div class="prop-group"><label>dY (mm)</label><input type="number" id="batch-array-dy" value="0" step="100"></div>
        </div>
        <div class="prop-group">
          <label>${t('multiArrayCount')}</label>
          <input type="number" id="batch-array-count" value="1" min="1" max="100" step="1">
        </div>
        <button type="button" class="support-preset-btn" id="btn-batch-array">${t('multiArrayRun')}</button>
      </div>
      <div class="prop-group">
        <button type="button" class="support-preset-btn" id="btn-batch-delete">${t('multiDelete')}</button>
      </div>
    `;

    const typeSel = document.getElementById('batch-member-type');
    const sectionSel = document.getElementById('batch-section-name');
    const fillSections = () => {
      const sections = this.state.listSections('member', typeSel.value || firstType);
      sectionSel.innerHTML = sections
        .map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`)
        .join('');
    };
    fillSections();
    typeSel.addEventListener('change', fillSections);

    const selectedIds = () => this.state.selectedMemberIds.slice();
    const runBatch = fn => {
      fn();
      this._notifyPropertyChange();
    };

    document.getElementById('btn-join-members')?.addEventListener('click', () => {
      // The parent owns validation/dialogs and the eventual history transaction.
      return this.callbacks.onJoinMembers?.(selectedIds());
    });

    document.getElementById('btn-batch-apply-section')?.addEventListener('click', () => {
      return this._runModelChange(() => {
      const type = typeSel.value;
      const sectionName = sectionSel.value;
      if (!sectionName) return;
      runBatch(() => {
        for (const id of selectedIds()) {
          const member = this.state.getMember(id);
          if (member && member.type === type) {
            this.state.updateMember(id, { sectionName });
          }
        }
      });

      });
    });

    document.getElementById('btn-batch-mirror')?.addEventListener('click', () => {
      return this._runModelChange(() => {
      const axis = document.getElementById('batch-mirror-axis')?.value === 'y' ? 'y' : 'x';
      const coord = parseFloat(document.getElementById('batch-mirror-coord')?.value) || 0;
      runBatch(() => {
        const created = this.state.mirrorMembers(selectedIds(), { axis, coord });
        this.state.selectMembers(created.map(m => m.id));
      });

      });
    });

    document.getElementById('btn-batch-rotate')?.addEventListener('click', () => {
      return this._runModelChange(() => {
      const angle = parseInt(document.getElementById('batch-rotate-angle')?.value, 10) || 90;
      runBatch(() => {
        this.state.rotateMembers(selectedIds(), { angle });
      });

      });
    });

    document.getElementById('btn-batch-array')?.addEventListener('click', () => {
      return this._runModelChange(() => {
      const dx = parseFloat(document.getElementById('batch-array-dx')?.value) || 0;
      const dy = parseFloat(document.getElementById('batch-array-dy')?.value) || 0;
      const count = parseInt(document.getElementById('batch-array-count')?.value, 10) || 1;
      if (dx === 0 && dy === 0) return;
      runBatch(() => {
        this.state.arrayCopyMembers(selectedIds(), { dx, dy, count });
      });

      });
    });

    document.getElementById('btn-batch-delete')?.addEventListener('click', () => {
      return this._runModelChange(() => {
      runBatch(() => {
        for (const id of selectedIds()) {
          this.state.removeMember(id);
        }
        this.state.clearSelection();
      });

      });
    });
  },

  _renderMemberProperties(container, member) {
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
        <button type="button" id="prop-apply-draft-section" class="prop-inline-btn" title="${escapeHtml(t('applyAsDraftHint'))}">${escapeHtml(t('applyAsDraft'))}</button>
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
      ${(member.type === 'beam' || member.type === 'column') ? `
      <div class="prop-group">
        <button type="button" class="support-preset-btn" id="btn-split-member">${t('splitAtPoint')}</button>
      </div>
      ` : ''}
    `;

    document.getElementById('btn-split-member')?.addEventListener('click', () => {
      return this.callbacks.onSplitMember?.(member.id);
    });

    const bind = (id, key, transform) => this._bindPropInput(id, val => {
      this.state.updateMember(member.id, { [key]: val });
      this._notifyPropertyChange(member.id);
    }, { transform });

    const bindEnd = (conditionId, springId, key) => {
      const conditionEl = document.getElementById(conditionId);
      const springEl = document.getElementById(springId);
      if (conditionEl) {
        conditionEl.addEventListener('change', () => {
      return this._runModelChange(() => {
          this.state.updateMember(member.id, {
            [key]: {
              condition: conditionEl.value,
              springSymbol: springEl ? springEl.value : null,
            },
          });
          this._notifyPropertyChange(member.id);

      });
    });
      }
      if (springEl) {
        springEl.addEventListener('change', () => {
      return this._runModelChange(() => {
          this.state.updateMember(member.id, {
            [key]: {
              condition: conditionEl?.value || 'spring',
              springSymbol: springEl.value,
            },
          });
          this._notifyPropertyChange(member.id);

      });
    });
      }
    };

    bind('prop-section-name', 'sectionName');
    const applyDraftBtn = document.getElementById('prop-apply-draft-section');
    if (applyDraftBtn) {
      applyDraftBtn.addEventListener('click', () => {
      return this._runModelChange(() => {
        const current = this.state.getMember(member.id);
        if (!current) return;
        this.state.setDraftSectionName('member', current.type, current.sectionName);
        this.state.memberDraftType = current.type;
        const typeSel = document.getElementById('sel-member-type');
        if (typeSel) typeSel.value = current.type;
        this._updateMemberLayerHint();
        this.refreshDraftSectionSelectors();
        this.callbacks.onDraftSectionChange?.();

      });
    });
    }
    bindEnd('prop-endi-condition', 'prop-endi-spring', 'endI');
    bindEnd('prop-endj-condition', 'prop-endj-spring', 'endJ');

    // Node coordinate editing
    const bindNodeCoord = (inputId, nodeId, key) => {
      const el = document.getElementById(inputId);
      if (!el || !nodeId) return;
      el.addEventListener('change', () => {
      return this._runModelChange(() => {
        const val = parseFloat(el.value);
        if (!Number.isFinite(val)) return;
        this.state.updateNode(nodeId, { [key]: val });
        this._notifyPropertyChange(member.id);

      });
    });
    };
    bindNodeCoord('prop-start-x', member.startNodeId, 'x');
    bindNodeCoord('prop-start-y', member.startNodeId, 'y');
    bindNodeCoord('prop-end-x', member.endNodeId, 'x');
    bindNodeCoord('prop-end-y', member.endNodeId, 'y');
  }
};
