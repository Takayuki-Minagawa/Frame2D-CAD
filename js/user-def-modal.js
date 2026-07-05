// user-def-modal.js - user-defined section / spring modals.
// Covers the definition form (add + validation), the list modal (inline edit,
// update/delete via event delegation) and user-definition export/import.
// Dependencies (state, model-change callback, selector refresh) are injected
// through initUserDefModal().

import { t } from './i18n.js';
import { escapeHtml, markInputInvalid, clearInputInvalid } from './dom-utils.js';
import { showNotice } from './notice.js';
import { exportUserDefs, importUserDefs } from './io.js';

const END_CONDITIONS = ['pin', 'rigid', 'spring'];

export function initUserDefModal({ state, onModelChange, refreshDraftSectionSelectors }) {
  const userDefModal = document.getElementById('user-def-modal');
  const userDefKindSelect = document.getElementById('user-def-kind');
  const userDefTargetSelect = document.getElementById('user-def-target');
  const userDefTypeSelect = document.getElementById('user-def-type');
  const userDefSectionGroup = document.getElementById('user-def-section-group');
  const userDefSpringGroup = document.getElementById('user-def-spring-group');
  const userDefSizeGroup = document.getElementById('user-def-size-group');
  const userDefNameInput = document.getElementById('user-def-name');
  const userDefColorInput = document.getElementById('user-def-color');
  const userDefBInput = document.getElementById('user-def-b');
  const userDefHInput = document.getElementById('user-def-h');
  const userDefEndPresetGroup = document.getElementById('user-def-end-preset-group');
  const userDefEndIConditionSelect = document.getElementById('user-def-endi-condition');
  const userDefEndJConditionSelect = document.getElementById('user-def-endj-condition');
  const userDefEndISpringSelect = document.getElementById('user-def-endi-spring');
  const userDefEndJSpringSelect = document.getElementById('user-def-endj-spring');
  const userDefSectionMemoInput = document.getElementById('user-def-section-memo');
  const userDefSymbolInput = document.getElementById('user-def-symbol');
  const userDefMemoInput = document.getElementById('user-def-memo');
  const userDefListModal = document.getElementById('user-def-list-modal');
  const userDefListBody = document.getElementById('user-def-list-body');
  const userDefFormErrorEl = document.getElementById('user-def-form-error');

  function applyI18nTo(root) {
    if (!root) return;
    root.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
  }

  // --- Form error display ---

  function clearUserDefFormError() {
    if (!userDefFormErrorEl) return;
    userDefFormErrorEl.hidden = true;
    userDefFormErrorEl.textContent = '';
    clearInputInvalid(userDefNameInput);
    clearInputInvalid(userDefBInput);
    clearInputInvalid(userDefHInput);
    clearInputInvalid(userDefSymbolInput);
  }

  function showUserDefFormError(message, input) {
    if (!userDefFormErrorEl) {
      showNotice(message, 'error');
      return;
    }
    clearUserDefFormError();
    userDefFormErrorEl.textContent = message;
    userDefFormErrorEl.hidden = false;
    markInputInvalid(input);
  }

  // --- Form rendering ---

  function refreshUserDefTypeOptions() {
    if (!userDefTargetSelect || !userDefTypeSelect) return;
    const isMember = userDefTargetSelect.value === 'member';
    const options = isMember
      ? [
          { value: 'beam', label: t('beam') },
          { value: 'column', label: t('column') },
          { value: 'hbrace', label: t('hbrace') },
          { value: 'vbrace', label: t('vbrace') },
        ]
      : [
          { value: 'floor', label: t('floor') },
          { value: 'exteriorWall', label: t('exteriorWall') },
          { value: 'wall', label: t('wall') },
          { value: 'roof', label: t('roof') },
          { value: 'eave', label: t('eave') },
          { value: 'gableWall', label: t('gableWall') },
        ];
    userDefTypeSelect.innerHTML = options
      .map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`)
      .join('');
    applyUserDefDefaultSectionValues();
  }

  function refreshUserDefFormVisibility() {
    const isSection = userDefKindSelect?.value !== 'spring';
    if (userDefSectionGroup) userDefSectionGroup.style.display = isSection ? '' : 'none';
    if (userDefSpringGroup) userDefSpringGroup.hidden = isSection;
    const isMemberSection = isSection && userDefTargetSelect?.value === 'member';
    if (userDefSizeGroup) userDefSizeGroup.style.display = isMemberSection ? 'flex' : 'none';
    if (userDefEndPresetGroup) userDefEndPresetGroup.style.display = isMemberSection ? 'flex' : 'none';
    refreshUserDefEndSpringVisibility();
  }

  function getUserDefGroupDefaultSection(target, type) {
    return state.getDefaultSection(target, type) || state.listSections(target, type)[0] || null;
  }

  function applyUserDefDefaultSectionValues() {
    if (!userDefColorInput || !userDefTargetSelect || !userDefTypeSelect) return;
    const target = userDefTargetSelect.value || 'member';
    const type = userDefTypeSelect.value || '';
    const section = getUserDefGroupDefaultSection(target, type);
    if (section?.color) {
      userDefColorInput.value = section.color;
    } else if (target === 'surface') {
      userDefColorInput.value = type === 'floor' ? '#67a9cf' : (
        type === 'roof' ? '#8b6f47' : (type === 'eave' ? '#4f9a8a' : (type === 'gableWall' ? '#bf6f5e' : '#b57a6b'))
      );
    } else {
      userDefColorInput.value = '#666666';
    }
    if (target === 'member') {
      if (userDefBInput) userDefBInput.value = String(section?.b || 200);
      if (userDefHInput) userDefHInput.value = String(section?.h || 400);
      setUserDefEndPresetInputs(section?.defaultEndI, section?.defaultEndJ);
    }
  }

  function setUserDefEndPresetInputs(defaultEndI = null, defaultEndJ = null) {
    setEndPresetInput(userDefEndIConditionSelect, userDefEndISpringSelect, defaultEndI);
    setEndPresetInput(userDefEndJConditionSelect, userDefEndJSpringSelect, defaultEndJ);
    refreshUserDefEndSpringVisibility();
  }

  function setEndPresetInput(conditionEl, springEl, endInfo = null) {
    if (!conditionEl) return;
    const condition = END_CONDITIONS.includes(endInfo?.condition) ? endInfo.condition : 'pin';
    conditionEl.value = condition;
    refreshSpringSelectOptions(springEl, endInfo?.springSymbol || '');
  }

  function refreshSpringSelectOptions(selectEl, selectedSymbol = '') {
    if (!selectEl) return;
    const springs = state.listSprings();
    const fallbackSymbol = springs[0]?.symbol || '';
    const selected = selectedSymbol || selectEl.value || fallbackSymbol;
    selectEl.innerHTML = springs.map(s =>
      `<option value="${escapeHtml(s.symbol)}" ${s.symbol === selected ? 'selected' : ''}>${escapeHtml(s.symbol)}</option>`
    ).join('');
    if (selected && springs.some(s => s.symbol === selected)) selectEl.value = selected;
  }

  function refreshUserDefEndSpringVisibility() {
    refreshSpringSelectOptions(userDefEndISpringSelect);
    refreshSpringSelectOptions(userDefEndJSpringSelect);
    syncEndSpringVisibility(userDefEndIConditionSelect, userDefEndISpringSelect);
    syncEndSpringVisibility(userDefEndJConditionSelect, userDefEndJSpringSelect);
  }

  function syncEndSpringVisibility(conditionEl, springEl) {
    if (!conditionEl || !springEl) return;
    springEl.hidden = conditionEl.value !== 'spring';
  }

  function readEndPreset(conditionEl, springEl) {
    const condition = conditionEl?.value || 'pin';
    return {
      condition,
      springSymbol: condition === 'spring' ? (springEl?.value || null) : null,
    };
  }

  function endConditionLabel(condition) {
    if (condition === 'rigid') return t('endRigid');
    if (condition === 'spring') return t('endSpring');
    return t('endPin');
  }

  function formatEndPreset(endInfo) {
    const condition = END_CONDITIONS.includes(endInfo?.condition) ? endInfo.condition : 'pin';
    if (condition === 'spring') {
      return `${t('endSpring')} ${endInfo?.springSymbol || '-'}`;
    }
    return endConditionLabel(condition);
  }

  function renderEndConditionOptions(selectedCondition = 'pin') {
    return END_CONDITIONS.map(condition =>
      `<option value="${condition}" ${condition === selectedCondition ? 'selected' : ''}>${escapeHtml(endConditionLabel(condition))}</option>`
    ).join('');
  }

  function renderSpringOptions(springs, selectedSymbol = '') {
    const selected = selectedSymbol || springs[0]?.symbol || '';
    return springs.map(s =>
      `<option value="${escapeHtml(s.symbol)}" ${s.symbol === selected ? 'selected' : ''}>${escapeHtml(s.symbol)}</option>`
    ).join('');
  }

  function renderEndPresetCell(endInfo, fieldPrefix, editable, springs) {
    const condition = END_CONDITIONS.includes(endInfo?.condition) ? endInfo.condition : 'pin';
    const springSymbol = endInfo?.springSymbol || springs[0]?.symbol || '';
    if (!editable) {
      return escapeHtml(formatEndPreset({ condition, springSymbol }));
    }
    return `
      <select class="user-def-table-input" data-field="${fieldPrefix}Condition">
        ${renderEndConditionOptions(condition)}
      </select>
      <select class="user-def-table-input" data-field="${fieldPrefix}Spring" style="${condition === 'spring' ? '' : 'display:none;'}">
        ${renderSpringOptions(springs, springSymbol)}
      </select>
    `;
  }

  function readRowEndPreset(row, fieldPrefix) {
    return readEndPreset(
      row.querySelector(`[data-field="${fieldPrefix}Condition"]`),
      row.querySelector(`[data-field="${fieldPrefix}Spring"]`)
    );
  }

  // --- Form actions ---

  function resetUserDefForm() {
    clearUserDefFormError();
    if (userDefKindSelect) userDefKindSelect.value = 'section';
    if (userDefTargetSelect) userDefTargetSelect.value = 'member';
    if (userDefNameInput) userDefNameInput.value = '';
    if (userDefColorInput) userDefColorInput.value = '#666666';
    if (userDefBInput) userDefBInput.value = '200';
    if (userDefHInput) userDefHInput.value = '400';
    if (userDefSectionMemoInput) userDefSectionMemoInput.value = '';
    if (userDefSymbolInput) userDefSymbolInput.value = '';
    if (userDefMemoInput) userDefMemoInput.value = '';
    refreshUserDefTypeOptions();
    refreshUserDefFormVisibility();
  }

  function showUserDefModal() {
    clearUserDefFormError();
    applyI18nTo(userDefModal);
    refreshUserDefTypeOptions();
    refreshUserDefFormVisibility();
    userDefModal.classList.add('visible');
  }

  function hideUserDefModal() {
    clearUserDefFormError();
    userDefModal.classList.remove('visible');
  }

  function addUserDefinition() {
    clearUserDefFormError();
    const kind = userDefKindSelect?.value || 'section';
    let added = null;

    if (kind === 'section') {
      const target = userDefTargetSelect?.value || 'member';
      const type = userDefTypeSelect?.value || '';
      const name = userDefNameInput?.value?.trim() || '';
      if (name.startsWith('_')) {
        showUserDefFormError(t('userDefNoLeadingUnderscore'), userDefNameInput);
        return;
      }
      const color = userDefColorInput?.value || '';
      const sectionMemo = userDefSectionMemoInput?.value?.trim() || '';
      if (target === 'member') {
        const b = parseFloat(userDefBInput?.value || '');
        const h = parseFloat(userDefHInput?.value || '');
        if (!(Number.isFinite(b) && b > 0 && Number.isFinite(h) && h > 0)) {
          showUserDefFormError(t('userDefInvalidSize'), userDefBInput);
          markInputInvalid(userDefHInput);
          return;
        }
        added = state.addSection({
          target,
          type,
          name,
          b,
          h,
          color,
          memo: sectionMemo,
          defaultEndI: readEndPreset(userDefEndIConditionSelect, userDefEndISpringSelect),
          defaultEndJ: readEndPreset(userDefEndJConditionSelect, userDefEndJSpringSelect),
        });
      } else {
        added = state.addSection({ target, type, name, color, memo: sectionMemo });
      }
    } else {
      const symbol = userDefSymbolInput?.value?.trim() || '';
      if (symbol.startsWith('_')) {
        showUserDefFormError(t('userDefNoLeadingUnderscore'), userDefSymbolInput);
        return;
      }
      const memo = userDefMemoInput?.value?.trim() || '';
      added = state.addSpring({ symbol, memo });
    }

    if (!added) {
      const keyInput = kind === 'section' ? userDefNameInput : userDefSymbolInput;
      showUserDefFormError(t('userDefAddFailed'), keyInput);
      return;
    }
    clearUserDefFormError();
    showNotice(t('userDefAdded'), 'success');
    onModelChange();
    refreshDraftSectionSelectors();
    resetUserDefForm();
    if (userDefListModal?.classList.contains('visible')) {
      renderUserDefGroupList();
    }
  }

  // --- List modal rendering ---
  // Tables are generated from column definitions shared between the spring
  // list and the section list; actions are handled by event delegation on
  // the list body (data-action / data-symbol / data-name).

  function currentUserDefGroupLabel() {
    const kind = userDefKindSelect?.value || 'section';
    if (kind === 'spring') return t('userDefSpring');
    const target = userDefTargetSelect?.value || 'member';
    const type = userDefTypeSelect?.value || '';
    return `${target === 'member' ? t('userDefTargetMember') : t('userDefTargetSurface')} / ${t(type)}`;
  }

  function renderMemoCell(item) {
    return item.isDefault
      ? escapeHtml(item.memo || '')
      : `<input type="text" class="user-def-table-input" data-field="memo" value="${escapeHtml(item.memo || '')}">`;
  }

  function renderDefaultFlagCell(item) {
    return item.isDefault ? t('userDefDefaultFlag') : t('userDefCustomFlag');
  }

  function renderActionsCell(item, { saveAction, removeAction, keyAttr, key }) {
    if (item.isDefault) return '-';
    return `<div class="user-def-table-actions">
      <button type="button" class="user-def-table-btn" data-action="${saveAction}" ${keyAttr}="${escapeHtml(key)}">${t('userDefUpdate')}</button>
      <button type="button" class="user-def-table-btn" data-action="${removeAction}" ${keyAttr}="${escapeHtml(key)}">${t('userDefDelete')}</button>
    </div>`;
  }

  function renderSizeCell(item, field) {
    const value = item[field];
    return item.isDefault
      ? `${value ?? '-'}`
      : `<input type="number" class="user-def-table-input" data-field="${field}" min="1" step="1" value="${Number.isFinite(value) ? value : 1}">`;
  }

  function renderColorCell(item) {
    return item.isDefault
      ? `<span style="display:inline-block;width:14px;height:14px;border:1px solid #999;vertical-align:middle;margin-right:6px;background:${escapeHtml(item.color || '#666666')};"></span>${escapeHtml(item.color || '')}`
      : `<input type="color" class="user-def-table-input" data-field="color" value="${escapeHtml(item.color || '#666666')}">`;
  }

  function buildSpringColumns() {
    return [
      { header: t('userDefListColName'), cell: s => escapeHtml(s.symbol) },
      { header: t('userDefListColMemo'), cell: renderMemoCell },
      { header: t('userDefListColDefault'), cell: renderDefaultFlagCell },
      {
        header: t('userDefListColAction'),
        cell: s => renderActionsCell(s, {
          saveAction: 'save-spring',
          removeAction: 'remove-spring',
          keyAttr: 'data-symbol',
          key: s.symbol,
        }),
      },
    ];
  }

  function buildSectionColumns(hasSize, springDefs) {
    const columns = [
      { header: t('userDefListColName'), cell: s => escapeHtml(s.name) },
    ];
    if (hasSize) {
      columns.push(
        { header: t('userDefListColB'), cell: s => renderSizeCell(s, 'b') },
        { header: t('userDefListColH'), cell: s => renderSizeCell(s, 'h') },
        { header: t('userDefListColEndI'), cell: s => renderEndPresetCell(s.defaultEndI, 'defaultEndI', !s.isDefault, springDefs) },
        { header: t('userDefListColEndJ'), cell: s => renderEndPresetCell(s.defaultEndJ, 'defaultEndJ', !s.isDefault, springDefs) },
      );
    }
    columns.push(
      { header: t('userDefListColColor'), cell: renderColorCell },
      { header: t('userDefListColMemo'), cell: renderMemoCell },
      { header: t('userDefListColDefault'), cell: renderDefaultFlagCell },
      {
        header: t('userDefListColAction'),
        cell: s => renderActionsCell(s, {
          saveAction: 'save-section',
          removeAction: 'remove-section',
          keyAttr: 'data-name',
          key: s.name,
        }),
      },
    );
    return columns;
  }

  function renderUserDefListTable(items, columns) {
    return `
      <p><b>${t('userDefListGroup')}:</b> ${escapeHtml(currentUserDefGroupLabel())}</p>
      <table>
        <thead>
          <tr>
            ${columns.map(c => `<th>${c.header}</th>`).join('\n            ')}
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              ${columns.map(c => `<td>${c.cell(item)}</td>`).join('\n              ')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderUserDefGroupList() {
    if (!userDefListBody) return;
    const kind = userDefKindSelect?.value || 'section';

    if (kind === 'spring') {
      const springs = state.listSprings();
      if (springs.length === 0) {
        userDefListBody.innerHTML = `<p>${t('userDefListNoItems')}</p>`;
        return;
      }
      userDefListBody.innerHTML = renderUserDefListTable(springs, buildSpringColumns());
      return;
    }

    const target = userDefTargetSelect?.value || 'member';
    const type = userDefTypeSelect?.value || '';
    const sections = state.listSections(target, type);
    if (sections.length === 0) {
      userDefListBody.innerHTML = `<p>${t('userDefListNoItems')}</p>`;
      return;
    }

    const hasSize = target === 'member';
    const springDefs = state.listSprings();
    userDefListBody.innerHTML = renderUserDefListTable(sections, buildSectionColumns(hasSize, springDefs));
  }

  // --- List modal actions (event delegation) ---

  function saveSectionRow(btn) {
    const target = userDefTargetSelect?.value || 'member';
    const type = userDefTypeSelect?.value || '';
    const name = btn.dataset.name || '';
    const row = btn.closest('tr');
    if (!row) return;

    const patch = {};
    const colorEl = row.querySelector('[data-field="color"]');
    if (colorEl) patch.color = colorEl.value;
    const memoEl = row.querySelector('[data-field="memo"]');
    if (memoEl) patch.memo = memoEl.value;

    if (target === 'member') {
      const bInput = row.querySelector('[data-field="b"]');
      const hInput = row.querySelector('[data-field="h"]');
      clearInputInvalid(bInput);
      clearInputInvalid(hInput);
      const b = parseFloat(bInput?.value || '');
      const h = parseFloat(hInput?.value || '');
      if (!(Number.isFinite(b) && b > 0 && Number.isFinite(h) && h > 0)) {
        markInputInvalid(bInput);
        markInputInvalid(hInput);
        showNotice(t('userDefInvalidSize'), 'error');
        return;
      }
      patch.b = b;
      patch.h = h;
      patch.defaultEndI = readRowEndPreset(row, 'defaultEndI');
      patch.defaultEndJ = readRowEndPreset(row, 'defaultEndJ');
    }

    const updated = state.updateSection(target, type, name, patch);
    if (!updated) {
      showNotice(t('userDefUpdateFailed'), 'error');
      return;
    }
    showNotice(t('userDefUpdated') || t('userDefUpdate'), 'success');
    onModelChange();
    renderUserDefGroupList();
  }

  function saveSpringRow(btn) {
    const symbol = btn.dataset.symbol || '';
    const row = btn.closest('tr');
    if (!row) return;
    const memo = row.querySelector('[data-field="memo"]')?.value || '';
    const updated = state.updateSpring(symbol, { memo });
    if (!updated) {
      showNotice(t('userDefUpdateFailed'), 'error');
      return;
    }
    showNotice(t('userDefUpdated') || t('userDefUpdate'), 'success');
    onModelChange();
    renderUserDefGroupList();
  }

  function removeSectionRow(btn) {
    const target = userDefTargetSelect?.value || 'member';
    const type = userDefTypeSelect?.value || '';
    const name = btn.dataset.name || '';
    if (!name) return;
    const confirmed = window.confirm(
      t('userDefDeleteConfirm', { name })
    );
    if (!confirmed) return;
    const removed = state.removeSection(target, type, name);
    if (!removed) {
      showNotice(t('userDefDeleteFailed'), 'error');
      return;
    }
    showNotice(t('userDefDeleted') || t('userDefDelete'), 'success');
    onModelChange();
    refreshDraftSectionSelectors();
    renderUserDefGroupList();
  }

  function removeSpringRow(btn) {
    const symbol = btn.dataset.symbol || '';
    if (!symbol) return;
    const confirmed = window.confirm(
      t('userDefDeleteConfirm', { name: symbol })
    );
    if (!confirmed) return;
    const removed = state.removeSpring(symbol);
    if (!removed) {
      showNotice(t('userDefDeleteFailed'), 'error');
      return;
    }
    showNotice(t('userDefDeleted') || t('userDefDelete'), 'success');
    onModelChange();
    refreshDraftSectionSelectors();
    renderUserDefGroupList();
  }

  function showUserDefListModal() {
    applyI18nTo(userDefListModal);
    renderUserDefGroupList();
    userDefListModal.classList.add('visible');
  }

  function hideUserDefListModal() {
    userDefListModal.classList.remove('visible');
  }

  // --- Wiring ---

  document.getElementById('btn-user-def-close').addEventListener('click', hideUserDefModal);
  document.getElementById('btn-user-def-add').addEventListener('click', addUserDefinition);
  document.getElementById('btn-user-def-list').addEventListener('click', showUserDefListModal);
  document.getElementById('btn-user-def-list-close').addEventListener('click', hideUserDefListModal);

  // User definition export/import
  document.getElementById('btn-user-def-export').addEventListener('click', () => {
    const exported = exportUserDefs(state);
    if (exported) {
      showNotice(t('userDefExported'), 'success');
    } else {
      showNotice(t('userDefExportEmpty'), 'error');
    }
  });

  document.getElementById('btn-user-def-import-trigger').addEventListener('click', () => {
    document.getElementById('file-user-def-import').click();
  });

  document.getElementById('file-user-def-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { added, skipped } = await importUserDefs(file, state);
      if (added > 0) {
        const msg = skipped > 0
          ? t('userDefImportedWithSkip', { n: added, s: skipped })
          : t('userDefImported', { n: added });
        showNotice(msg, 'success');
        refreshUserDefEndSpringVisibility();
        onModelChange();
        refreshDraftSectionSelectors();
        if (userDefListModal?.classList.contains('visible')) {
          renderUserDefGroupList();
        }
      } else if (skipped > 0) {
        showNotice(t('userDefImportAllSkipped', { s: skipped }), 'error');
      } else {
        showNotice(t('userDefImportNone'), 'error');
      }
    } catch (err) {
      showNotice(t('userDefImportFailed') + err.message, 'error', 6500);
    }
    e.target.value = '';
  });

  if (userDefKindSelect) userDefKindSelect.addEventListener('change', () => {
    clearUserDefFormError();
    refreshUserDefFormVisibility();
    if (userDefListModal?.classList.contains('visible')) renderUserDefGroupList();
  });
  if (userDefTargetSelect) userDefTargetSelect.addEventListener('change', () => {
    clearUserDefFormError();
    refreshUserDefTypeOptions();
    refreshUserDefFormVisibility();
    if (userDefListModal?.classList.contains('visible')) renderUserDefGroupList();
  });
  if (userDefTypeSelect) userDefTypeSelect.addEventListener('change', () => {
    clearUserDefFormError();
    applyUserDefDefaultSectionValues();
    if (userDefListModal?.classList.contains('visible')) renderUserDefGroupList();
  });
  if (userDefEndIConditionSelect) userDefEndIConditionSelect.addEventListener('change', refreshUserDefEndSpringVisibility);
  if (userDefEndJConditionSelect) userDefEndJConditionSelect.addEventListener('change', refreshUserDefEndSpringVisibility);

  // Event delegation for the list modal: one change listener keeps end-spring
  // selects in sync, one click listener dispatches on data-action.
  userDefListBody?.addEventListener('change', (event) => {
    const conditionEl = event.target.closest('[data-field$="Condition"]');
    if (!conditionEl) return;
    const springField = conditionEl.dataset.field.replace('Condition', 'Spring');
    const springEl = conditionEl.closest('td')?.querySelector(`[data-field="${springField}"]`);
    syncEndSpringVisibility(conditionEl, springEl);
  });

  userDefListBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'save-section': saveSectionRow(btn); break;
      case 'save-spring': saveSpringRow(btn); break;
      case 'remove-section': removeSectionRow(btn); break;
      case 'remove-spring': removeSpringRow(btn); break;
    }
  });

  // User definition modals intentionally do NOT close on overlay (backdrop)
  // click or Escape. These forms hold in-progress input (section/spring
  // definitions, inline table edits), so closing must require an explicit
  // button to avoid losing input.

  resetUserDefForm();

  return {
    show: showUserDefModal,
    isOpen() {
      return userDefModal.classList.contains('visible')
        || userDefListModal.classList.contains('visible');
    },
    applyLanguage() {
      applyI18nTo(userDefModal);
      applyI18nTo(userDefListModal);
      refreshUserDefTypeOptions();
      refreshUserDefFormVisibility();
      clearUserDefFormError();
      if (userDefListModal?.classList.contains('visible')) {
        renderUserDefGroupList();
      }
    },
  };
}
